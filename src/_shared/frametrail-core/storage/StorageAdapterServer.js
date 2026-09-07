/**
 * @module Shared
 */

/**
 * Storage adapter for the PHP server backend.
 * Wraps existing AJAX patterns for reading/writing data via ajaxServer.php.
 *
 * For reads, uses direct GET to _data/ paths (matching existing loadData patterns).
 * For writes, routes to appropriate PHP action endpoints.
 *
 * Note: Complex saves like saveAnnotations bypass writeJSON entirely and are
 * handled by the Database module's existing save methods with storageMode branching.
 *
 * @class StorageAdapterServer
 * @extends StorageAdapter
 */

class StorageAdapterServer extends StorageAdapter {

    /**
     * @param {String} serverBase  Base URL for the PHP server dir, e.g. '_server/' or 'https://api.example.com/ft/_server/'
     * @param {String} dataBase    Base URL for the data dir, e.g. '_data/' or 'https://cdn.example.com/project/_data/'
     */
    constructor(serverBase, dataBase) {
        super();
        this._serverBase = serverBase || '_server/';
        this._dataBase   = dataBase   || '_data/';
        // Resolve the dataBase to an absolute URL path for the PHP backend.
        // The server uses this to locate the correct _data directory on the filesystem.
        this._dataPathAbsolute = new URL(this._dataBase, document.baseURI).pathname;
    }

    get type() { return 'server'; }
    get displayName() { return 'FrameTrail Server'; }
    /** Absolute URL path to the data directory, sent to PHP with every request. */
    get dataPathAbsolute() { return this._dataPathAbsolute; }
    get canSave() {
        // Note: StorageManager.canSave() special-cases 'server' and does not call this getter.
        // It is kept for completeness but should not be relied on.
        return true;
    }

    async init() {
        if (document.location.protocol === 'file:') {
            throw new Error('No server available (file:// protocol)');
        }

        // Verify PHP backend is reachable
        var resp = await fetch(this._serverBase + 'ajaxServer.php', {
            method: 'POST',
            cache: 'no-cache',
            body: new URLSearchParams({ a: 'userCheckLogin', dataPath: this._dataPathAbsolute })
        });
        if (!resp.ok) throw new Error('PHP server not reachable');
        return true;
    }

    async readJSON(path) {
        var resp = await fetch(this._dataBase + path, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('File not found: ' + path);
        return resp.json();
    }

    async readText(path) {
        var resp = await fetch(this._dataBase + path, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('File not found: ' + path);
        return resp.text();
    }

    async writeJSON(path, data) {
        var action = this._getActionForPath(path, data);
        action.params.dataPath = this._dataPathAbsolute;
        var resp = await fetch(this._serverBase + 'ajaxServer.php', {
            method: 'POST',
            body: new URLSearchParams(action.params)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var result = await resp.json();
        if (result.code !== 0) {
            throw new Error(result.string || 'Server error code ' + result.code);
        }
    }

    async exists(path) {
        try {
            await this.readJSON(path);
            return true;
        } catch (e) {
            return false;
        }
    }

    async createDirectory(path) {
        // Directories are managed by the PHP server automatically
        return;
    }

    /**
     * Map file paths to PHP action parameters.
     * Used for simple writes. Complex saves (annotations) are handled
     * directly by Database module's existing save methods.
     * @private
     */
    _getActionForPath(path, data) {
        var match;

        if ((match = path.match(/^hypervideos\/([^/]+)\/hypervideo\.json$/))) {
            // No baseVersion here on purpose. The compare-and-swap token is the
            // meta.lastchanged that was *loaded*, and this adapter has no access
            // to it — data.meta.lastchanged is the value being written, freshly
            // stamped, so it would never match and every write would be rejected.
            // In practice the guarded path is Database.saveHypervideo(), which
            // holds the loaded token; the only callers that write hypervideo.json
            // through an adapter (add, fork, local save) run in local-folder mode
            // against StorageAdapterLocal, and create files rather than racing
            // for them. If a server-mode caller is ever added here, it must pass
            // the loaded token in explicitly.
            return {
                params: {
                    a: 'hypervideoChange',
                    hypervideoID: match[1],
                    src: JSON.stringify(data, null, 4)
                }
            };
        }
        if (path === 'config.json') {
            return {
                params: {
                    a: 'configChange',
                    src: JSON.stringify(data, null, 4)
                }
            };
        }
        if (path === 'custom.css') {
            return {
                params: {
                    a: 'globalCSSChange',
                    src: (typeof data === 'string') ? data : ''
                }
            };
        }
        throw new Error('Unknown path for server write: ' + path);
    }

}
