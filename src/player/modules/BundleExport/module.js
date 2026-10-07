/**
 * @module Player
 */


/**
 * I am the BundleExport. I export a hypervideo or the whole project as a
 * bundle (see schemas/hypervideo-bundle.schema.json and
 * project-bundle.schema.json): as a page in the portable HTML format
 * (FrameTrailHTMLFormat, docs/HTML-FORMAT.md), as the bundle's JSON, or as a
 * zip of the _data folder. Save As and instance.export() use me.
 *
 * A bundle is made from a folder map (the _data layout as paths → contents,
 * the serializer's "folder" format), which I fill from what is stored, read
 * through the storage adapter, and from what is open in the editor: the open
 * hypervideo as it is now, the current user's annotations as they would be
 * saved. Nothing is written anywhere.
 *
 * @class BundleExport
 * @static
 */

FrameTrail.defineModule('BundleExport', function(FrameTrail){

    var labels     = FrameTrail.module('Localization').labels,
        Serializer = window.FrameTrailSerializer,
        HTMLFormat = window.FrameTrailHTMLFormat;

    // The settings of config.json a page with a single hypervideo plays with.
    var PAGE_CONFIG_KEYS = ['defaultTheme', 'defaultLanguage', 'videoFit'];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
    }


    /* ------------------------------------------------------------------ */
    /*  What is stored, and what is open                                   */
    /* ------------------------------------------------------------------ */

    function storageMode() {
        return FrameTrail.getState('storageMode');
    }

    function isOpen(hypervideoID) {
        var Database = FrameTrail.module('Database');
        return !!Database.hypervideo && String(FrameTrail.module('RouteNavigation').hypervideoID) === String(hypervideoID);
    }

    // A file of the _data folder through the storage adapter, or undefined.
    // In memory (download mode) there are no files to read.
    function readStored(path, type) {
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        if (!adapter || storageMode() === 'download') { return Promise.resolve(undefined); }
        return adapter[(type === 'text') ? 'readText' : 'readJSON'](path).catch(function() { return undefined; });
    }

    // The bundle this page was started from (the bundle init option), as a
    // hypervideo bundle for one of its hypervideos.
    function startBundle(hypervideoID) {
        var bundle = FrameTrail.getState('bundle');
        if (!isObject(bundle)) { return null; }
        if (bundle.bundle === 'project') { return (bundle.hypervideos || {})[hypervideoID] || null; }
        return (String(bundle.id != null ? bundle.id : '0') === String(hypervideoID)) ? bundle : null;
    }

    // The annotations of a hypervideo as { index, files }.
    function readAnnotations(hypervideoID, dir) {

        var Database = FrameTrail.module('Database');

        // In memory: the open hypervideo's annotations as they are now, the
        // others as the page was given them; one file per creator.
        if (storageMode() === 'download') {
            var given = startBundle(hypervideoID),
                list  = isOpen(hypervideoID)
                      ? Database.getAnnotationsW3C()
                      : ((given && given.annotations) ? null : ((Database.contentsEntry(hypervideoID) || {}).annotations || []));
            if (!list) { return Promise.resolve(clone(given.annotations)); }
            var grouped = (HTMLFormat.hypervideoBundle({}, list).annotations) || { files: {} };
            if (given && given.annotations && given.annotations.index) { grouped.index = clone(given.annotations.index); }
            return Promise.resolve(grouped);
        }

        return readStored(dir + 'annotations/_index.json', 'json').then(function(index) {

            var result  = { files: {} },
                entries = index ? Serializer.parseAnnotationIndex(index).annotationfiles : {};

            if (index !== undefined) { result.index = index; }

            return Promise.all(Object.keys(entries).map(function(fileID) {
                return readStored(dir + 'annotations/' + fileID + '.json', 'json').then(function(file) {
                    if (file !== undefined) { result.files[fileID] = file; }
                });
            })).then(function() {

                // The current user's file as it would be saved now.
                var userID = FrameTrail.module('UserManagement').userID;
                if (!isOpen(hypervideoID) || !userID || !FrameTrail.getState('loggedIn')) { return result; }

                var own = Database.ownAnnotationFile();
                if (!own.length && !result.files[userID]) { return result; }

                result.files[userID] = own;
                if (!Serializer.parseAnnotationIndex(result.index || {}).annotationfiles[userID]) {
                    var now  = Math.floor(Date.now() / 1000),
                        name = FrameTrail.getState('username');
                    result.index = Serializer.setAnnotationIndexEntry(result.index || {}, userID, {
                        name: name, description: name + '\'s annotations', created: now, lastchanged: now,
                        hidden: false, owner: name, ownerId: String(userID)
                    });
                }
                return result;

            });

        });

    }

    // The WebVTT text of a hypervideo's subtitles in one language, or undefined.
    function readSubtitle(hypervideoID, dir, entry) {

        var Database = FrameTrail.module('Database');

        if (isOpen(hypervideoID) && Database.subtitles[entry.srclang] && typeof Database.subtitles[entry.srclang].vtt === 'string') {
            return Promise.resolve(Database.subtitles[entry.srclang].vtt);
        }

        if (storageMode() === 'download') {
            var given = startBundle(hypervideoID),
                texts = (given && given.subtitles) || (Database.contentsEntry(hypervideoID) || {}).subtitles || {};
            return Promise.resolve((typeof texts[entry.srclang] === 'string') ? texts[entry.srclang] : undefined);
        }

        return readStored(dir + 'subtitles/' + (entry.src || entry.srclang + '.vtt'), 'text');

    }

    // The global CSS (custom.css): as the page has it now, else as stored.
    function readGlobalCSS() {
        var styleEl = document.head.querySelector('style.FrameTrailGlobalCustomCSS');
        if (styleEl) { return Promise.resolve(styleEl.textContent); }
        if (storageMode() === 'download') { return Promise.resolve(FrameTrail.getState('customCSS') || undefined); }
        return readStored('custom.css', 'text');
    }


    /**
     * I collect a folder map (paths in _data → contents) for one hypervideo
     * (scope "hypervideo") or for everything (scope "project"; also the zip).
     * The open hypervideo is taken as it is in the editor now.
     *
     * @method collectFolder
     * @param {String} scope  "hypervideo" or "project"
     * @param {String} [hypervideoID]
     * @return {Promise} the folder map
     */
    function collectFolder(scope, hypervideoID) {

        var Database = FrameTrail.module('Database'),
            ids      = (scope === 'project') ? Object.keys(Database.hypervideos) : [String(hypervideoID)],
            files    = {},
            highest  = 0;

        if (scope === 'project') {
            var index = Database.buildHypervideoIndex();
            index.overviewMap = clone(Database.overviewMap);
            files['hypervideos/_index.json'] = index;
        }

        Object.keys(Database.resources || {}).forEach(function(resourceID) {
            highest = Math.max(highest, parseInt(resourceID, 10) || 0);
        });
        files['resources/_index.json'] = { 'resources-increment': highest, 'resources': clone(Database.resources || {}) };

        var tasks = ids.map(function(id) {

            var dir        = 'hypervideos/' + id + '/',
                hypervideo = Database.convertToDatabaseFormat(id);

            files[dir + 'hypervideo.json'] = hypervideo;

            var subtitleTasks = (Array.isArray(hypervideo.subtitles) ? hypervideo.subtitles : []).map(function(entry) {
                if (!isObject(entry) || !entry.srclang) { return Promise.resolve(); }
                return readSubtitle(id, dir, entry).then(function(text) {
                    if (typeof text === 'string') { files[dir + 'subtitles/' + (entry.src || entry.srclang + '.vtt')] = text; }
                });
            });

            return Promise.all(subtitleTasks.concat([readAnnotations(id, dir).then(function(annotations) {
                if (annotations.index !== undefined) { files[dir + 'annotations/_index.json'] = annotations.index; }
                Object.keys(annotations.files || {}).forEach(function(fileID) {
                    files[dir + 'annotations/' + fileID + '.json'] = annotations.files[fileID];
                });
            })]));

        });

        if (scope === 'project') {
            files['tagdefinitions.json'] = clone(FrameTrail.module('TagModel').getAllTags() || {});
            files['config.json'] = clone(Database.config || {});
            tasks.push(readGlobalCSS().then(function(css) {
                if (typeof css === 'string') { files['custom.css'] = css; }
            }));
        }

        return Promise.all(tasks).then(function() { return files; });

    }


    /**
     * I make the bundle of one hypervideo or of the project.
     *
     * @method bundle
     * @param {String} scope  "hypervideo" or "project"
     * @param {String} [hypervideoID]  default: the open one
     * @return {Promise} the bundle
     */
    function bundle(scope, hypervideoID) {

        hypervideoID = hypervideoID || FrameTrail.module('RouteNavigation').hypervideoID;

        if (scope !== 'project' && (!hypervideoID || !FrameTrail.module('Database').hypervideos[hypervideoID])) {
            return Promise.reject(new Error(labels['ErrorExportNoHypervideo']));
        }

        return collectFolder(scope, hypervideoID).then(function(files) {
            return (scope === 'project')
                ? Serializer.readBundle(files, 'folder', { bundle: 'project' })
                : Serializer.readBundle(files, 'folder', { bundle: 'hypervideo', id: String(hypervideoID) });
        });

    }


    /* ------------------------------------------------------------------ */
    /*  Pages                                                             */
    /* ------------------------------------------------------------------ */

    // The release this is, to pin the library to; none for a development copy
    // (unbuilt, or built without a version: "dev").
    function releaseVersion() {
        var version = window.FrameTrail && window.FrameTrail.version;
        return /^\d+\.\d+\.\d+/.test(version || '') ? version : null;
    }

    function fetchText(url) {
        return fetch(url, { credentials: 'same-origin' }).then(function(response) {
            if (!response.ok) { throw new Error('HTTP ' + response.status); }
            return response.text();
        });
    }

    /**
     * The FrameTrail library for a page: its URLs on jsDelivr ("cdn"), or its
     * text ("inline") — taken from this page if it carries it (a page in this
     * format, a built installation), else from jsDelivr.
     *
     * @method library
     * @param {String} scripts  "cdn" or "inline"
     * @return {Promise} { cssURL, jsURL } or { css, js }
     */
    function library(scripts) {

        var cdn = HTMLFormat.cdnLibrary(releaseVersion());

        if (scripts !== 'inline') { return Promise.resolve(cdn); }

        var inlineJS  = document.querySelector('script[data-frametrail-library]'),
            inlineCSS = document.querySelector('style[data-frametrail-library]');

        if (inlineJS && inlineCSS) {
            return Promise.resolve({ css: inlineCSS.textContent, js: inlineJS.textContent });
        }

        var pageJS  = document.querySelector('script[src$="frametrail.min.js"]'),
            pageCSS = document.querySelector('link[href$="frametrail.min.css"]'),
            local   = (pageJS && pageCSS)
                    ? Promise.all([fetchText(pageCSS.href), fetchText(pageJS.src)])
                    : Promise.reject(new Error('not built'));

        return local.catch(function() {
            return Promise.all([fetchText(cdn.cssURL), fetchText(cdn.jsURL)]);
        }).then(function(texts) {
            return { css: texts[0], js: texts[1] };
        }, function() {
            throw new Error(labels['ErrorExportLibrary']);
        });

    }

    // What relative media paths of the data resolve against, for a page: the
    // _data folder when it is on the web. A local folder's files are not.
    function pageDatapath() {
        if (storageMode() === 'local') { return null; }
        var url = FrameTrail.module('RouteNavigation').resolveDataURL('');
        return /^https?:/.test(url) ? url : null;
    }

    function pageConfig(scope) {
        var config = FrameTrail.module('Database').config || {},
            result = {};
        if (scope === 'project') { return null; }
        PAGE_CONFIG_KEYS.forEach(function(key) {
            if (config[key] !== undefined && config[key] !== '') { result[key] = config[key]; }
        });
        return result;
    }

    function fileName(scope, theBundle, extension) {
        var name = (scope === 'project')
                 ? (FrameTrail.module('Database').config.overviewTitle || 'frametrail-project')
                 : ((theBundle.hypervideo && theBundle.hypervideo.meta && theBundle.hypervideo.meta.name) || 'hypervideo');
        return String(name).replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '.' + extension;
    }


    /* ------------------------------------------------------------------ */
    /*  Zips                                                              */
    /* ------------------------------------------------------------------ */

    function zipFolder(files) {
        var entries = {};
        Object.keys(files).forEach(function(path) {
            var content = files[path];
            entries[path] = new TextEncoder().encode((typeof content === 'string') ? content : JSON.stringify(content, null, 4));
        });
        return new Blob([fflate.zipSync(entries, { level: 6 })], { type: 'application/zip' });
    }

    /**
     * Only the PHP endpoint can bundle the uploaded media files. On a private
     * instance (config.alwaysForceLogin) it answers 403 unless a valid session
     * cookie is sent, hence the explicit status check — an <a download> click
     * would silently save the error body as a .zip.
     */
    function serverZip() {

        var serverUrl = FrameTrail.getState('server') || '_server/',
            adapter   = FrameTrail.module('StorageManager').getAdapter(),
            dpParam   = (adapter && adapter.dataPathAbsolute) ? '&dataPath=' + encodeURIComponent(adapter.dataPathAbsolute) : '';

        return fetch(serverUrl + 'ajaxServer.php?a=dataExport' + dpParam, { credentials: 'same-origin' }).then(function(response) {
            if (response.status === 403) {
                throw new Error('Data export denied: this instance is private (config.alwaysForceLogin) and requires a logged-in session');
            }
            if (!response.ok) {
                throw new Error('Data export failed with status ' + response.status);
            }
            return response.blob();
        });

    }


    /* ------------------------------------------------------------------ */

    function triggerDownload(data, filename, type) {
        var blob = (data instanceof Blob) ? data : new Blob([data], { type: type }),
            url  = URL.createObjectURL(blob),
            a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }


    /**
     * I export, and download the result unless options.download is false.
     *
     * options:
     *
     * * format: "html" (default), "json" (the bundle) or "zip" (the _data folder);
     * * scope: "hypervideo" (default) or "project"; a zip is always everything;
     * * hypervideoID: default the open hypervideo;
     * * scripts: "cdn" (default) or "inline", where an HTML page gets FrameTrail from;
     * * includeMedia: a zip with the uploaded media files (server mode, signed in);
     * * download: false to resolve with { filename, type, data } instead.
     *
     * @method exportData
     * @param {Object} [options]
     * @return {Promise}
     */
    function exportData(options) {

        options = options || {};

        var format = options.format || 'html',
            scope  = (options.scope === 'project') ? 'project' : 'hypervideo',
            result;

        if (format === 'zip') {

            if (options.includeMedia) {
                if (!FrameTrail.module('StorageManager').canSaveToServer()) {
                    return Promise.reject(new Error('Media files can only be exported in server mode by a logged-in user'));
                }
                result = serverZip().then(function(blob) {
                    return { filename: 'frametrail-data-export.zip', type: 'application/zip', data: blob };
                });
            } else {
                result = collectFolder('project').then(function(files) {
                    return { filename: 'frametrail-export.zip', type: 'application/zip', data: zipFolder(files) };
                });
            }

        } else if (format === 'json') {

            result = bundle(scope, options.hypervideoID).then(function(theBundle) {
                return { filename: fileName(scope, theBundle, 'json'), type: 'application/json', data: JSON.stringify(theBundle, null, 4) };
            });

        } else if (format === 'html') {

            result = Promise.all([bundle(scope, options.hypervideoID), library(options.scripts)]).then(function(parts) {
                return {
                    filename: fileName(scope, parts[0], 'html'),
                    type:     'text/html',
                    data:     HTMLFormat.write(parts[0], { library: parts[1], datapath: pageDatapath(), config: pageConfig(scope) })
                };
            });

        } else {
            return Promise.reject(new Error('Unknown export format: ' + format));
        }

        return result.then(function(file) {
            if (options.download === false) { return file; }
            triggerDownload(file.data, file.filename, file.type);
        });

    }


    return {
        collectFolder: collectFolder,
        bundle:        bundle,
        library:       library,
        exportData:    exportData
    };

});
