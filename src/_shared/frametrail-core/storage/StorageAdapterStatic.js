/**
 * @module Shared
 */

/**
 * Storage adapter for static / CDN hosting (read-only data source, in-memory edits).
 *
 * Reads JSON files from a CDN base URL via plain HTTP GET. Extends StorageAdapterDownload
 * so that edits are stored in memory (the in-memory cache takes priority over the CDN
 * on re-reads). Users can export their changes via Save As, exactly as in download mode.
 *
 * Use this adapter when `dataPath` is provided but `server` is not — the data lives on
 * a static host with no PHP backend.
 *
 * @class StorageAdapterStatic
 * @extends StorageAdapterDownload
 */

class StorageAdapterStatic extends StorageAdapterDownload {

    /**
     * @param {String} cdnBase  Base URL for the data directory (e.g. 'https://cdn.example.com/project/_data/')
     */
    constructor(cdnBase) {
        super();
        this._cdnBase = cdnBase;
    }

    get type() { return 'static'; }
    get displayName() { return 'Static (CDN)'; }

    async init() {
        // Verify the CDN is reachable by fetching config.json
        var resp = await fetch(this._cdnBase + 'config.json', { cache: 'no-cache' });
        if (!resp.ok) throw new Error('Static data not reachable: ' + this._cdnBase);
        return true;
    }

    /**
     * Read JSON from the in-memory cache (edits take priority) or fall back to the CDN.
     * @param {String} path  Relative path within the data dir (e.g. 'config.json')
     */
    async readJSON(path) {
        // In-memory edits take priority so that modified data is read back correctly
        if (this._data[path] !== undefined) {
            return this._data[path];
        }
        var resp = await fetch(this._cdnBase + path, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('File not found: ' + path);
        return resp.json();
    }

    async readText(path) {
        var resp = await fetch(this._cdnBase + path, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('File not found: ' + path);
        return resp.text();
    }

    // writeJSON, exists and createDirectory are inherited from
    // StorageAdapterDownload (in-memory storage; Save As exports, see BundleExport).

}
