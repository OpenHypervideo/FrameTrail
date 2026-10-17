/**
 * @module Player
 */


/**
 * I am the BundleExport. I export a hypervideo, the project or some of its
 * hypervideos as a bundle (see schemas/hypervideo-bundle.schema.json and
 * project-bundle.schema.json): as a page in the portable HTML format
 * (FrameTrailHTMLFormat, docs/HTML-FORMAT.md), as the bundle's JSON, as a
 * zip of the _data folder, or into a local folder with its media files.
 * Export (ExportDialog) and instance.export() use me.
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
    var PAGE_CONFIG_KEYS = ['theme', 'defaultLanguage', 'videoFit'];


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
            if (given && given.annotations && given.annotations.index) {
                // Every file the index names is there (grouping by creator leaves empty files out), or the folder would not load.
                grouped.index = clone(given.annotations.index);
                var named = Serializer.parseAnnotationIndex(grouped.index).annotationfiles;
                Object.keys(named).forEach(function(fileID) {
                    if (!grouped.files[fileID]) { grouped.files[fileID] = []; }
                });
                // And every file is in the index: a creator the page was not
                // given (the user, annotating in this session) gets an entry,
                // or the file would be one nobody knows of.
                Object.keys(grouped.files).forEach(function(fileID) {
                    if (named[fileID]) { return; }
                    var first = grouped.files[fileID][0] || {},
                        name  = (first.creator && first.creator.nickname) || FrameTrail.getState('username') || String(fileID),
                        now   = Math.floor(Date.now() / 1000);
                    grouped.index = Serializer.setAnnotationIndexEntry(grouped.index, fileID, {
                        name: name, description: name + '\'s annotations', created: now, lastchanged: now,
                        hidden: false, owner: name, ownerId: String(fileID)
                    });
                });
            }
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

                // The current user's file as it would be saved now — also after
                // the session ended (the Export the session-ended dialog offers):
                // the work is then the account's it was made with (workingAs).
                var UserManagement = FrameTrail.module('UserManagement'),
                    signedIn       = !!FrameTrail.getState('loggedIn') && !!UserManagement.userID,
                    userID         = signedIn ? UserManagement.userID : UserManagement.workingAs();
                if (!isOpen(hypervideoID) || !userID) { return result; }

                var own = Database.ownAnnotationFile(userID);
                if (!own.length && !result.files[userID]) { return result; }

                result.files[userID] = own;
                if (!Serializer.parseAnnotationIndex(result.index || {}).annotationfiles[userID]) {
                    var now  = Math.floor(Date.now() / 1000),
                        name = (signedIn ? FrameTrail.getState('username') : UserManagement.workingAsName()) || String(userID);
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


    // A user id of an account, not of a guest (see FrameTrailSerializer.guestUserID).
    function isAccount(id) {
        return id != null && id !== '' && String(id).indexOf('guest_') !== 0;
    }

    /**
     * Whether annotations of these hypervideos were made with accounts, so
     * that nobody could edit them without a server unless they are given to
     * their authors' names (the localAuthors option). Nothing is read: the
     * annotation indexes as loaded, the open hypervideo's annotations, and
     * in memory the annotations the page was given.
     *
     * @method hasAccountAuthors
     * @param {Array} ids  hypervideo ids
     * @return {Boolean}
     */
    function hasAccountAuthors(ids) {

        var Database = FrameTrail.module('Database');

        function creatorsAccount(list) {
            return (list || []).some(function(item) { return isObject(item) && isObject(item.creator) && isAccount(item.creator.id); });
        }

        return ids.some(function(id) {
            var entry = Database.hypervideos[id] || {};
            if (isOpen(id) && creatorsAccount(Database.getAnnotationsW3C())) { return true; }
            if (isObject(entry.annotationfiles)) { return Object.keys(entry.annotationfiles).some(isAccount); }
            var given = startBundle(id);
            if (given && given.annotations && isObject(given.annotations.files)) {
                return Object.keys(given.annotations.files).some(function(fileID) {
                    return isAccount(fileID) || creatorsAccount(given.annotations.files[fileID]);
                });
            }
            return creatorsAccount((Database.contentsEntry(id) || {}).annotations);
        });

    }

    /**
     * I collect a folder map (paths in _data → contents) for one hypervideo
     * (scope "hypervideo") or for the project (scope "project"; also the zip).
     * The open hypervideo is taken as it is in the editor now.
     *
     * options (both scopes): localAuthors gives annotations made with
     * accounts to their authors' names (FrameTrailSerializer.localAuthors;
     * the current user's under the name they have now); library: false
     * leaves the resource library out (FrameTrailSerializer.withoutLibrary).
     * Project only: ids, the hypervideos to take (default all,
     * FrameTrailSerializer.selectFolder).
     *
     * @method collectFolder
     * @param {String} scope  "hypervideo" or "project"
     * @param {String} [hypervideoID]
     * @param {Object} [options] { ids, library, localAuthors }
     * @return {Promise} the folder map
     */
    function collectFolder(scope, hypervideoID, options) {

        options = options || {};

        var Database = FrameTrail.module('Database'),
            ids      = (scope === 'project')
                     ? (options.ids || Object.keys(Database.hypervideos)).map(String).filter(function(id) { return !!Database.hypervideos[id]; })
                     : [String(hypervideoID)],
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

        return Promise.all(tasks).then(function() {

            if (options.localAuthors) {
                var names  = {},
                    userID = FrameTrail.module('UserManagement').userID;
                if (isAccount(userID) && FrameTrail.getState('username')) { names[userID] = FrameTrail.getState('username'); }
                files = Serializer.localAuthors(files, { names: names }).files;
            }

            if (scope === 'project') {
                files = Serializer.selectFolder(files, ids);
            }

            if (options.library === false) {
                files = Serializer.withoutLibrary(files);
            }

            return files;

        });

    }


    /**
     * I make the bundle of one hypervideo or of the project.
     *
     * @method bundle
     * @param {String} scope  "hypervideo" or "project"
     * @param {String} [hypervideoID]  default: the open one
     * @param {Object} [options] see collectFolder
     * @return {Promise} the bundle
     */
    function bundle(scope, hypervideoID, options) {

        hypervideoID = hypervideoID || FrameTrail.module('RouteNavigation').hypervideoID;

        if (scope !== 'project' && (!hypervideoID || !FrameTrail.module('Database').hypervideos[hypervideoID])) {
            return Promise.reject(new Error(labels['ErrorExportNoHypervideo']));
        }

        return collectFolder(scope, hypervideoID, options).then(function(files) {
            if (scope === 'project') {
                return Serializer.readBundle(files, 'folder', { bundle: 'project' });
            }
            var theBundle = Serializer.readBundle(files, 'folder', { bundle: 'hypervideo', id: String(hypervideoID) });
            if (isObject(theBundle.resources) && !Object.keys(theBundle.resources).length) { delete theBundle.resources; }
            return theBundle;
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
    // _data folder when it is on the web. A local folder's files are not; a
    // project file's are where its own datapath says.
    function pageDatapath() {
        if (storageMode() === 'local') { return null; }
        if (storageMode() === 'file') { return FrameTrail.module('StorageManager').getAdapter().datapath || null; }
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

    // The name of what is exported, as a file or folder name.
    function baseName(scope, hypervideoID) {
        var Database = FrameTrail.module('Database'),
            name     = (scope === 'project')
                     ? ((Database.config || {}).overviewTitle || 'frametrail-project')
                     : ((Database.hypervideos[hypervideoID] || {}).name || 'hypervideo');
        return String(name).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
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
     * A zip with media files: the server puts a folder map made here (with
     * what the export chose: unsaved changes, annotations given to their
     * authors' names, without the library) into a zip, with the media files
     * it refers to from its _data/resources/ (action exportZip). Resolves
     * { blob, missing: [media paths it does not have] }. On a private
     * instance (config.alwaysForceLogin) it answers 403 unless a valid
     * session cookie is sent, hence the explicit status check — an
     * <a download> click would silently save the error body as a .zip.
     */
    function serverZip(files) {

        var serverUrl = FrameTrail.getState('server') || '_server/',
            adapter   = FrameTrail.module('StorageManager').getAdapter(),
            body      = new URLSearchParams({ a: 'exportZip', files: JSON.stringify(files), media: JSON.stringify(Serializer.mediaPaths(files)) });

        if (adapter && adapter.dataPathAbsolute) { body.append('dataPath', adapter.dataPathAbsolute); }

        return fetch(serverUrl + 'ajaxServer.php', { method: 'POST', body: body, credentials: 'same-origin' }).then(function(response) {
            if (response.status === 403) {
                throw new Error('Data export denied: this instance is private (config.alwaysForceLogin) and requires a logged-in session');
            }
            if (!response.ok || !/zip/.test(response.headers.get('Content-Type') || '')) {
                return response.text().then(function(text) {
                    var answer = null;
                    try { answer = JSON.parse(text); } catch (e) { /* not JSON */ }
                    throw new Error((answer && answer.string) || ('Data export failed with status ' + response.status));
                });
            }
            var missing = [];
            try { missing = JSON.parse(response.headers.get('X-FrameTrail-Missing') || '[]'); } catch (e) { /* none */ }
            return response.blob().then(function(blob) { return { blob: blob, missing: missing }; });
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
     * What an export takes, from its options: { scope, hypervideoID, ids,
     * library }. A zip or a folder is always a _data folder: of the one
     * hypervideo when the scope is one. The resource library goes only with
     * the project (unless options.library is false), never with a hypervideo.
     * @private
     */
    function selectionOf(options) {

        var Database     = FrameTrail.module('Database'),
            scope        = (options.scope === 'project') ? 'project' : 'hypervideo',
            hypervideoID = String(options.hypervideoID || FrameTrail.module('RouteNavigation').hypervideoID || ''),
            all          = Object.keys(Database.hypervideos || {}),
            ids          = (scope === 'project')
                         ? (Array.isArray(options.hypervideoIDs) ? options.hypervideoIDs.map(String) : all)
                         : [hypervideoID],
            library      = (scope === 'project') && options.library !== false;

        return {
            scope:        scope,
            hypervideoID: hypervideoID,
            ids:          ids,
            library:      library,
            missing:      (scope === 'hypervideo') ? !Database.hypervideos[hypervideoID] : !ids.length
        };

    }

    function abortError() {
        var error = new Error('Aborted');
        error.name = 'AbortError';
        return error;
    }

    /**
     * I export, and download the result unless options.download is false.
     *
     * options:
     *
     * * format: "html" (default), "json" (the bundle) or "zip" (the _data folder);
     * * scope: "hypervideo" (default) or "project";
     * * hypervideoID: default the open hypervideo;
     * * hypervideoIDs: for the project, the hypervideos to take (default all);
     * * library: for the project, false to leave the resource library out
     *   (default true); a hypervideo never takes it;
     * * localAuthors: give annotations made with accounts to their authors'
     *   names, so they can be edited without a server (hasAccountAuthors);
     * * scripts: "cdn" (default) or "inline", where an HTML page gets FrameTrail from;
     * * includeMedia: a zip with the media files it refers to (server mode:
     *   the server adds them);
     * * download: false to resolve with { filename, type, data, missing }
     *   instead; otherwise it resolves with { filename, missing }, missing
     *   being the media files the server did not have.
     *
     * @method exportData
     * @param {Object} [options]
     * @return {Promise}
     */
    function exportData(options) {

        options = options || {};

        var format    = options.format || 'html',
            selection = selectionOf(options),
            scope     = selection.scope,
            folder    = { ids: selection.ids, library: selection.library, localAuthors: !!options.localAuthors },
            result;

        if (selection.missing) {
            return Promise.reject(new Error(labels['ErrorExportNoHypervideo']));
        }

        if (format === 'zip') {

            if (options.includeMedia && storageMode() !== 'server') {
                return Promise.reject(new Error(labels['ErrorExportMediaZip']));
            }
            result = collectFolder('project', null, folder).then(function(files) {
                var filename = baseName(scope, selection.hypervideoID) + '.zip';
                if (!options.includeMedia) {
                    return { filename: filename, type: 'application/zip', data: zipFolder(files), missing: [] };
                }
                return serverZip(files).then(function(zip) {
                    return { filename: filename, type: 'application/zip', data: zip.blob, missing: zip.missing };
                });
            });

        } else if (format === 'json') {

            result = bundle(scope, selection.hypervideoID, folder).then(function(theBundle) {
                return { filename: baseName(scope, selection.hypervideoID) + '.json', type: 'application/json', data: JSON.stringify(theBundle, null, 4) };
            });

        } else if (format === 'html') {

            result = Promise.all([bundle(scope, selection.hypervideoID, folder), library(options.scripts)]).then(function(parts) {
                return {
                    filename: baseName(scope, selection.hypervideoID) + '.html',
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
            return { filename: file.filename, missing: file.missing || [] };
        });

    }


    /* ------------------------------------------------------------------ */
    /*  Folders                                                           */
    /* ------------------------------------------------------------------ */

    // A media file of the export into the folder: from the local folder this
    // tab works in, else from where the page plays it (the server, a CDN, a
    // project file's datapath). Streamed, so large videos are fine.
    function copyMedia(target, path, signal) {

        var dest = 'resources/' + path;

        if (storageMode() === 'local') {
            return FrameTrail.module('StorageManager').getAdapter().readFile(dest).then(function(file) {
                return target.writeFile(dest, file);
            });
        }

        var url = FrameTrail.module('RouteNavigation').getResourceURL(path);
        if (!/^(https?|blob):/i.test(url)) { return Promise.reject(new Error('Not reachable: ' + url)); }

        return fetch(url, { credentials: 'same-origin', signal: signal }).then(function(response) {
            if (!response.ok || !response.body) { throw new Error('HTTP ' + response.status); }
            return target.writeStream(dest, response.body);
        });

    }

    /**
     * I export into a local folder the user chooses, which must be empty: a
     * _data folder (FrameTrail opens it without a server, Select Folder) with
     * the media files the export refers to. Call me from a click: the folder
     * picker needs it. The data is written first, then the media files, so a
     * folder whose copying was stopped still opens.
     *
     * options: scope, hypervideoID, hypervideoIDs, library, localAuthors (as
     * exportData), onProgress({ done, total }), signal (an AbortSignal).
     *
     * @method exportToFolder
     * @param {Object} [options]
     * @return {Promise} { folderName, missing: [media paths not copied], adapter }
     */
    function exportToFolder(options) {

        options = options || {};

        var selection = selectionOf(options),
            missing   = [],
            handle, target;

        if (typeof StorageAdapterLocal === 'undefined' || !StorageAdapterLocal.isSupported()) {
            return Promise.reject(new Error(labels['ExportFolderUnsupported']));
        }
        if (selection.missing) {
            return Promise.reject(new Error(labels['ErrorExportNoHypervideo']));
        }

        function check() {
            if (options.signal && options.signal.aborted) { throw abortError(); }
        }

        function progress(done, total) {
            if (options.onProgress) { options.onProgress({ done: done, total: total }); }
        }

        return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(chosen) {
            handle = chosen;
            return StorageAdapterLocal.isEmptyFolder(handle);
        }).then(function(empty) {
            if (!empty) { throw new Error(labels['ExportFolderNotEmpty'].replace('%s', handle.name)); }
            target = new StorageAdapterLocal();
            return target.init(handle);
        }).then(function() {
            return collectFolder('project', null, { ids: selection.ids, library: selection.library, localAuthors: !!options.localAuthors });
        }).then(function(files) {

            var written = Object.keys(files).reduce(function(chain, path) {
                return chain.then(function() {
                    check();
                    return (typeof files[path] === 'string') ? target.writeText(path, files[path]) : target.writeJSON(path, files[path]);
                });
            }, Promise.resolve());

            return written.then(function() {
                // What an empty folder gets when it is chosen in FrameTrail.
                return target.exists('users.json');
            }).then(function(hasUsers) {
                return hasUsers ? null : target.writeJSON('users.json', { 'user-increment': 1, 'user': {} });
            }).then(function() {
                var media = Serializer.mediaPaths(files);
                progress(0, media.length);
                return media.reduce(function(chain, path, i) {
                    return chain.then(function() {
                        check();
                        return copyMedia(target, path, options.signal).catch(function(error) {
                            if (options.signal && options.signal.aborted) { throw abortError(); }
                            console.log('FrameTrail: could not copy ' + path + ':', error);
                            missing.push(path);
                        }).then(function() {
                            progress(i + 1, media.length);
                        });
                    });
                }, Promise.resolve());
            });

        }).then(function() {
            return { folderName: handle.name, missing: missing, adapter: target };
        });

    }


    return {
        collectFolder:     collectFolder,
        bundle:            bundle,
        library:           library,
        exportData:        exportData,
        exportToFolder:    exportToFolder,
        hasAccountAuthors: hasAccountAuthors,
        // What a page of a bundle needs besides it; PairingHost sends both to a paired phone.
        pageDatapath:  pageDatapath,
        pageConfig:    pageConfig
    };

});
