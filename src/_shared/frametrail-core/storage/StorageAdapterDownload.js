/**
 * @module Shared
 */

/**
 * Storage adapter for JSON download fallback.
 * Used when File System Access API is not supported (Firefox, Safari).
 * Stores data in memory and allows downloading as JSON files.
 *
 * @class StorageAdapterDownload
 * @extends StorageAdapter
 */

class StorageAdapterDownload extends StorageAdapter {

    constructor() {
        super();
        this._data = {};  // In-memory cache
        this._userInfo = {};  // Set by UserManagement after guest login
    }

    get type() { return 'download'; }
    get displayName() { return 'Download'; }
    get canSave() { return false; }  // In-memory only — no persistent save target; use Save As / download
    get userInfo() { return this._userInfo; }

    /**
     * Update the stored user info (called from UserManagement after guest login).
     * @param {Object} info - User info object {id, name, role, color}
     */
    setUserInfo(info) {
        this._userInfo = info;
    }

    async init() {
        return true;
    }

    async readJSON(path) {
        if (this._data[path]) {
            return this._data[path];
        }
        throw new Error('File not in memory: ' + path);
    }

    async readText(path) {
        if (this._data[path]) {
            return this._data[path];
        }
        throw new Error('File not in memory: ' + path);
    }

    async writeJSON(path, data) {
        this._data[path] = data;
    }

    async exists(path) {
        return path in this._data;
    }

    async createDirectory(path) {
        // No-op for in-memory storage
    }

    /**
     * Generate a standalone HTML file with the hypervideo data embedded inline.
     * Loads FrameTrail CSS/JS from the jsDelivr CDN — no server required to play.
     * @param {String} hypervideoID
     * @param {String} dataPath - Optional base URL for _data/ (resolves uploaded resource files)
     */
    _generateStandaloneHTML(hypervideoID, dataPath) {
        var Database = this._frameTrailInstance.module('Database');
        var hvData   = Database.convertToDatabaseFormat(hypervideoID);
        var fullConfig = Database.config || {};
        var hvName   = (Database.hypervideos[hypervideoID] && Database.hypervideos[hypervideoID].name) || 'hypervideo';
        var filename = hvName.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '.html';

        var version = (window.FrameTrail && window.FrameTrail.version && window.FrameTrail.version !== '__FRAMETRAIL_VERSION__')
            ? '@' + window.FrameTrail.version
            : '';
        var cdnBase = 'https://cdn.jsdelivr.net/npm/@frametrail/frametrail' + version + '/';

        // If the hypervideo has no per-hypervideo theme, write the global defaultTheme
        // into the exported data so the standalone HTML uses the correct theme.
        var hvConfig = Database.hypervideos[hypervideoID] && Database.hypervideos[hypervideoID].config;
        if (hvConfig && !hvConfig.theme && fullConfig.defaultTheme) {
            hvData.config = hvData.config || {};
            hvData.config.theme = fullConfig.defaultTheme;
        }

        // Ensure clips have inline src so the standalone HTML doesn't depend on a resources index
        var HypervideoModel = this._frameTrailInstance.module('HypervideoModel');
        if (hvData.clips && HypervideoModel) {
            for (var c = 0; c < hvData.clips.length; c++) {
                if (!hvData.clips[c].src && hvData.clips[c].resourceId != null) {
                    var res = Database.resources[hvData.clips[c].resourceId];
                    if (res) {
                        hvData.clips[c].src = res.src;
                    } else if (HypervideoModel.sourcePath) {
                        hvData.clips[c].src = HypervideoModel.sourcePath;
                    }
                }
            }
        }

        var annotations = Database.getAnnotationsW3C();
        var contentItem = { hypervideo: hvData };
        if (annotations.length > 0) {
            contentItem.annotations = annotations;
        }

        // Only include config properties relevant for standalone playback
        var config = {};
        if (fullConfig.defaultLanguage) config.defaultLanguage = fullConfig.defaultLanguage;

        var initOptions = {
            target:   'body',
            contents: [contentItem]
        };
        if (Object.keys(config).length > 0) {
            initOptions.config = config;
        }
        if (dataPath) {
            initOptions.dataPath = dataPath;
        }

        var safeTitle = hvName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var html = '<!DOCTYPE html>\n'
            + '<html>\n'
            + '<head>\n'
            + '  <meta charset="UTF-8">\n'
            + '  <title>' + safeTitle + '</title>\n'
            + '  <link rel="stylesheet" href="' + cdnBase + 'frametrail.min.css">\n'
            + '</head>\n'
            + '<body>\n'
            + '  <script src="' + cdnBase + 'frametrail.min.js"><\/script>\n'
            + '  <script>\n'
            + '  FrameTrail.init(' + JSON.stringify(initOptions, null, 4) + ', \'PlayerLauncher\');\n'
            + '  <\/script>\n'
            + '</body>\n'
            + '</html>';

        this._triggerDownload(html, filename, 'text/html');
    }

    /**
     * Download current hypervideo as a flat hypervideo.json (matches on-disk server format).
     * @param {String} hypervideoID
     * @param {String} [dataPath] - Optional base URL for resources
     */
    _performDownload(hypervideoID, dataPath) {
        var Database = this._frameTrailInstance.module('Database');
        var hvData   = Database.convertToDatabaseFormat(hypervideoID);
        if (dataPath) {
            hvData.dataPath = dataPath;
        }
        var hvName   = (Database.hypervideos[hypervideoID] && Database.hypervideos[hypervideoID].name) || 'hypervideo';
        var filename = hvName.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '.json';
        this._triggerDownload(JSON.stringify(hvData, null, 2), filename, 'application/json');
    }

    /**
     * Download selected All Data options as a ZIP (multiple files) or single JSON file (one file).
     * Requires fflate to be loaded globally when producing a ZIP.
     * @param {Object} options - { allHv, resources, config }
     */
    _performZipDownload(options) {
        var Database = this._frameTrailInstance.module('Database');
        var files = {};

        if (options.allHv) {
            // Both index files are written in the shape the loaders expect: a
            // wrapper object with an increment beside the map of entries. An
            // export that is not re-openable as a _data folder is not a backup,
            // and the overview map now lives in this file too.
            var allHvs = Database.hypervideos;
            for (var id in allHvs) {
                if (allHvs.hasOwnProperty(id)) {
                    files['hypervideos/' + id + '/hypervideo.json'] = Database.convertToDatabaseFormat(id);
                }
            }
            var hvIndex = Database.buildHypervideoIndex();
            hvIndex.overviewMap = Database.overviewMap;
            files['hypervideos/_index.json'] = hvIndex;
        }

        if (options.resources) {
            var allResources  = Database.resources;
            var highestResID  = 0;
            for (var resourceID in allResources) {
                if (allResources.hasOwnProperty(resourceID) && parseInt(resourceID, 10) > highestResID) {
                    highestResID = parseInt(resourceID, 10);
                }
            }
            files['resources/_index.json'] = {
                'resources-increment': highestResID,
                'resources':           allResources
            };
        }

        if (options.config) {
            files['config.json'] = Database.config;
        }

        var paths = Object.keys(files);
        if (paths.length === 0) { return; }

        if (paths.length === 1) {
            // Single file — download directly as JSON
            var path     = paths[0];
            var filename = path.split('/').pop();
            this._triggerDownload(JSON.stringify(files[path], null, 2), filename, 'application/json');
            return;
        }

        // Multiple files — bundle as ZIP using fflate
        var zipFiles = {};
        for (var p in files) {
            zipFiles[p] = new TextEncoder().encode(JSON.stringify(files[p], null, 2));
        }
        var zipped = fflate.zipSync(zipFiles, { level: 6 });
        var blob   = new Blob([zipped], { type: 'application/zip' });
        var url    = URL.createObjectURL(blob);
        var a      = document.createElement('a');
        a.href     = url;
        a.download = 'frametrail-export.zip';
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Create a blob from content and trigger a browser file download.
     * @private
     */
    _triggerDownload(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

}
