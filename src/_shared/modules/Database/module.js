/**
 * @module Shared
 */

/**
 * I am the Database.
 * I store all data coming from the server. The data model objects (like {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}})
 * get their data from me. When they are done with manipulating the data, I can store the data back to the server.
 *
 * Note: All data objects inside me must be passed by reference, so that data can be manipulated in place, and insertions and deletions
 * should alter immediatly the database. In this way, data is kept consistent across the app
 * (see {{#crossLink "Annotation/FrameTrail.newObject:method"}}FrameTrail.newObject('Annotation', data){{/crossLink}}).
 *
 * @class Database
 * @static
 */

 FrameTrail.defineModule('Database', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // Reading and writing the stored JSON is the serializer's job; I keep
    // what it reads and hand it back for writing.
    var Serializer = window.FrameTrailSerializer;

    var hypervideoID = '',
        hypervideos  = {},
        hypervideo   = {},
        sequence     = {},

        overlays     = [],
        codeSnippets = {},

        // Content items of a kind this version does not know. Nobody edits
        // them; they are only kept, so a save does not drop them.
        otherContents = [],
        resources    = {},
        config       = {},

        // Where the config came from, decided on the first load. See
        // loadConfigData for why this cannot be re-read from the state.
        configSource = undefined,

        annotations  = [],

        subtitles              = {},
        subtitlesLangMapping   = {
            'en': 'English',
            'de': 'Deutsch',
            'fr': 'Français'
        },

        users  = {},

        // The overview map document, from hypervideos/_index.json. It is
        // content, not configuration — which hypervideos are on the map and
        // where they sit belongs to the library — so it travels with the index
        // rather than with config.json, and is written through its own,
        // narrow save path.
        overviewMap = null,

        // Set when the map was adopted from a pre-2.0 config.json. The first
        // successful map save clears the legacy key, so a data directory
        // migrates itself the first time somebody edits the map.
        overviewMapMigrated = false,

        // Compare-and-swap token for custom.css. Unlike hypervideo.json and
        // config.json, plain CSS has nowhere to carry a version, so we only
        // learn it from the server's reply to our own writes.
        cssBaseVersion = null;


    /**
     * I normalize whatever an index file (or a legacy config) holds into the
     * shape the rest of the app expects.
     *
     * Markers are keyed by hypervideo ID rather than listed, so a placement can
     * be looked up, replaced or dropped without scanning, and the same
     * hypervideo cannot end up on the map twice. Old data stored an array, and
     * PHP re-encodes an empty object as [], so both have to be accepted here.
     *
     * @method normalizeOverviewMap
     * @param {Object} raw
     * @return {Object}
     * @private
     */
    function normalizeOverviewMap(raw) {

        var map = (raw && typeof raw === 'object' && !Array.isArray(raw))
                ? JSON.parse(JSON.stringify(raw))
                : {};

        var markers = {};

        if (Array.isArray(map.markers)) {

            map.markers.forEach(function(marker) {
                if (!marker || marker.hypervideoID == null) return;
                markers[String(marker.hypervideoID)] = {
                    x:    marker.x,
                    y:    marker.y,
                    size: marker.size
                };
            });

        } else if (map.markers && typeof map.markers === 'object') {

            Object.keys(map.markers).forEach(function(hypervideoID) {
                var marker = map.markers[hypervideoID];
                if (!marker || typeof marker !== 'object') return;
                markers[String(hypervideoID)] = {
                    x:    marker.x,
                    y:    marker.y,
                    size: marker.size
                };
            });

        }

        map.markers = markers;

        return map;

    }


    /**
     * I install the overview map that came with the hypervideo index.
     *
     * When the index carries none, I fall back to the legacy location inside
     * config.json and flag the adoption, so an existing _data directory keeps
     * showing its map and migrates on the next save. Read-only sources (the
     * hosted examples) simply keep working from the fallback forever.
     *
     * @method adoptOverviewMap
     * @param {Object} raw the index file's overviewMap, if it had one
     * @private
     */
    function adoptOverviewMap(raw) {

        var fromIndex = !!(raw && typeof raw === 'object' && !Array.isArray(raw)),
            next      = normalizeOverviewMap(fromIndex ? raw : (config && config.overviewMap));

        overviewMapMigrated = fromIndex ? false : !!(config && config.overviewMap);

        // Callers hold on to this object for a whole edit session, exactly as
        // they do with the config, so a reload has to refill it rather than
        // swap it out — see replaceConfigContents.
        if (!overviewMap) {
            overviewMap = next;
            return;
        }

        Object.keys(overviewMap).forEach(function(key) { delete overviewMap[key]; });
        Object.assign(overviewMap, next);

    }


    /**
     * I build a hypervideo index out of what is loaded in memory.
     *
     * The wrapper shape is not decoration: the loaders read data.hypervideos,
     * so an index written as a bare map of entries reads back as an empty
     * library. This is the one place that shape is spelled out for writers that
     * have no file to merge into.
     *
     * @method buildHypervideoIndex
     * @return {Object}
     */
    function buildHypervideoIndex() {

        var entries = {},
            highest = 0;

        Object.keys(hypervideos).forEach(function(hypervideoID) {
            entries[hypervideoID] = './' + hypervideoID;
            var numeric = parseInt(hypervideoID, 10);
            if (numeric > highest) highest = numeric;
        });

        return {
            'hypervideo-increment': highest,
            'hypervideos':          entries
        };

    }


    /**
     * I return the overview map document, materializing it on first use.
     *
     * Data sources that have no hypervideo index at all (a single hypervideo
     * passed in via init options, the plain-HTTP loader) never reach
     * adoptOverviewMap, so the fallback has to be lazy rather than at load.
     *
     * @method getOverviewMap
     * @return {Object}
     */
    function getOverviewMap() {

        if (!overviewMap) adoptOverviewMap(null);

        return overviewMap;

    }


    /**
     * I return the name this instance gives its overview — the optional
     * config.overviewTitle, or the localized "Overview" label when it is unset
     * or blank.
     *
     * The fallback is resolved here rather than at the call sites, so an empty
     * key and a missing one behave alike. Resolving it per call (instead of
     * caching) also keeps it following a language switch, since the labels are
     * a live Proxy.
     *
     * @method getOverviewTitle
     * @return {String}
     */
    function getOverviewTitle() {

        var title = ((config || {}).overviewTitle || '').trim();

        return title || FrameTrail.module('Localization').labels['GenericOverview'];

    }


    /**
     * Private fetch-based AJAX helper. Delegates to the current storage adapter for
     * relative `_data/` GET requests; uses resolveServerURL() for `_server/` POST
     * requests; passes absolute URLs through as-is.
     *
     * @param {Object}   opts          – url, type ('GET'|'POST'), data (plain obj), dataType ('json'|'text')
     * @param {Function} done          – called with parsed response on success
     * @param {Function} [fail]        – called with Error on network/HTTP failure
     */
    function _ajax(opts, done, fail) {
        var cachePolicy = (config.allowCaching) ? 'default' : 'no-cache';
        var method      = (opts.type || 'GET').toUpperCase();
        var url         = opts.url;
        var RouteNav    = FrameTrail.module('RouteNavigation');

        if (method === 'GET') {
            if (/^_data\//.test(url)) {
                // Delegate to the current storage adapter — adapter handles base URL resolution
                var path    = url.replace(/^_data\//, '');
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                if (adapter) {
                    var readMethod = (opts.dataType === 'text') ? 'readText' : 'readJSON';
                    adapter[readMethod](path)
                        .then(done)
                        .catch(function(err) { if (fail) fail(err); });
                    return;
                }
            }
            // Absolute URL (user-provided resource URL, oEmbed, etc.) — direct fetch
            fetch(url, { cache: cachePolicy })
                .then(function(r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return (opts.dataType === 'text') ? r.text() : r.json();
                })
                .then(done)
                .catch(function(err) { if (fail) fail(err); });
            return;
        }

        // POST — resolve server URL
        if (/^_server\//.test(url)) {
            var serverURL = RouteNav.resolveServerURL(url.replace(/^_server\//, ''));
            if (!serverURL) {
                if (fail) fail(new Error('No server configured'));
                return;
            }
            url = serverURL;
        }

        // Include dataPath in all POST requests so the PHP backend resolves the
        // correct _data directory.
        var postData = opts.data || {};
        var adapter  = FrameTrail.module('StorageManager').getAdapter();
        if (adapter && adapter.dataPathAbsolute) {
            postData.dataPath = adapter.dataPathAbsolute;
        }

        fetch(url, { method: 'POST', cache: cachePolicy, body: new URLSearchParams(postData) })
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return (opts.dataType === 'text') ? r.text() : r.json();
            })
            .then(done)
            .catch(function(err) { if (fail) fail(err); });
    }


    /**
     * I load the config data (_data/config.json) from the server
     * and save the data in my attribute {{#crossLink "Database/config:attribute"}}Database/config{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadConfigData
     * @param {Function} success
     * @param {Function} fail
     */


    /**
     * I build the entry of a hypervideo in my hypervideos index from its
     * hypervideo.json and its annotations/_index.json.
     *
     * The entry is what the rest of the app reads and edits (the settings
     * dialog changes name, config, clips and subtitles here). hypervideoData
     * keeps the file as it was read: writing merges the entry and, for the
     * open hypervideo, the live editor state back into it.
     *
     * @method indexEntry
     * @param {Object} hypervideoData
     * @param {Object} [annotationsIndex] omitted where there is none (init options)
     * @return {Object}
     * @private
     */
    function indexEntry(hypervideoData, annotationsIndex) {

        var annotationIndex = annotationsIndex ? Serializer.parseAnnotationIndex(annotationsIndex) : null;

        return {
            "name":            hypervideoData.meta.name,
            "description":     hypervideoData.meta.description,
            "thumb":           hypervideoData.meta.thumb,
            "posterFrame":     hypervideoData.meta.posterFrame || null,
            "creator":         hypervideoData.meta.creator,
            "creatorId":       hypervideoData.meta.creatorId,
            "created":         hypervideoData.meta.created,
            "lastchanged":     hypervideoData.meta.lastchanged,
            "config":          hypervideoData.config,
            "mainAnnotation":  annotationIndex ? annotationIndex.mainAnnotation : null,
            "annotationfiles": annotationIndex ? annotationIndex.annotationfiles : null,
            "subtitles":       hypervideoData.subtitles,
            "chapters":        hypervideoData.chapters || [],
            "clips":           hypervideoData.clips,
            "hypervideoData":  hypervideoData
        };

    }


    /**
     * I return the video of a hypervideo, which every item names as its
     * target source. Same rule as HypervideoModel: the clip's src, else the
     * src of its resource; a hypervideo without a video has none.
     *
     * @method sourcePathOf
     * @param {String} thisHypervideoID
     * @return {String|undefined} undefined when it cannot be told (items then keep theirs)
     * @private
     */
    function sourcePathOf(thisHypervideoID) {

        var entry = hypervideos[thisHypervideoID],
            clip  = (entry && entry.clips && entry.clips[0]) || {};

        if (clip.src && clip.src.length > 3) {
            return clip.src;
        }
        if (!clip.resourceId) {
            return '';
        }
        return resources[clip.resourceId] ? resources[clip.resourceId].src : undefined;

    }


    /**
     * I replace the config's contents without replacing the object itself.
     *
     * Callers hold on to Database.config across a whole dialog session, so
     * swapping the object out from under them silently orphans their
     * reference, and their next write lands somewhere nobody reads.
     * adoptOverviewMap refills the map document for the same reason.
     *
     * This is also why there is no `set config()`: an assignment looks
     * harmless at the call site and would reintroduce exactly that bug.
     *
     * @method replaceConfigContents
     * @param {Object} newConfig
     */
    function replaceConfigContents(newConfig) {

        Object.keys(config).forEach(function(key) { delete config[key]; });
        Object.assign(config, JSON.parse(JSON.stringify(newConfig)));

        FrameTrail.changeState('config', config);

    };


    function loadConfigData(success, fail) {

        // Captured once, on the first load.
        //
        // The 'config' state doubles as an init option — an object means the
        // host supplied the config and we must not fetch, a string names a URL
        // to fetch from — but once loaded we publish the config into that same
        // state for other modules to read. From the second call on it therefore
        // always looks like an inline object, and every re-read short-circuits
        // into a no-op. That is invisible at boot and fatal afterwards: it is
        // what a stale collaborator's Refresh and the overview map's conflict
        // merge both depend on actually going to the server.
        if (configSource === undefined) {
            configSource = FrameTrail.getState('config');
        }

        var configInitOptions = configSource;

        if (typeof configInitOptions === 'object' && configInitOptions !== null) {

            config = configInitOptions;
            // Migrate legacy "theme" key → "defaultTheme"
            if (!config.defaultTheme && config.theme) {
                config.defaultTheme = config.theme;
                delete config.theme;
            }
            FrameTrail.changeState('config', config);

            // Apply global theme only if no per-hypervideo theme is set
            var hvTheme = hypervideo && hypervideo.config && hypervideo.config.theme;
            if (!hvTheme) {
                var _t = FrameTrail.getState('target');
                var _themeEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
                if (_themeEl) _themeEl.setAttribute('data-frametrail-theme', config.defaultTheme || 'classic');
            }

            return success.call(this);

        }

        // No config provided and no persistent data store → use empty defaults.
        // All config properties are accessed with falsy-safe guards, so {} = "all defaults".
        if (configInitOptions == null && FrameTrail.getState('storageMode') === 'download') {
            config = {};
            FrameTrail.changeState('config', config);
            return success.call(this);
        }

        function applyConfig(data) {
            replaceConfigContents(data);
            // Migrate legacy "theme" key → "defaultTheme"
            if (!config.defaultTheme && config.theme) {
                config.defaultTheme = config.theme;
                delete config.theme;
            }
            FrameTrail.changeState('config', config);
            // Apply global theme only if no per-hypervideo theme is set
            var hvTheme = hypervideo && hypervideo.config && hypervideo.config.theme;
            if (!hvTheme) {
                var _t = FrameTrail.getState('target');
                var _themeEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
                if (_themeEl) _themeEl.setAttribute('data-frametrail-theme', config.defaultTheme || 'classic');
            }
            success.call(this);
        }

        if (FrameTrail.getState('storageMode') === 'local') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('config.json')
                .then(applyConfig)
                .catch(function() { fail(labels['ErrorNoConfigFile']); });
            return;
        }

        _ajax({
            url:      configInitOptions || '_data/config.json',
            dataType: 'json'
        }, function (data) {
            applyConfig(data);
        }, function () {
            fail(labels['ErrorNoConfigFile']);
        });

    };


    /**
     * I load the resource index data (_data/resources/_index.json) from the server
     * and save the data in my attribute {{#crossLink "Database/resources:attribute"}}Database/resources{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadResourceData
     * @param {Function} success
     * @param {Function} fail
     */
    function loadResourceData(success, fail) {

        //clear previous resources to allow deletion as we use object assign
        resources = {};

        if (FrameTrail.getState('storageMode') === 'local') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('resources/_index.json')
                .then(function(data) {
                    resources = data.resources || {};
                    // Pre-load blob URLs for local resource files so getResourceURL() works synchronously
                    return adapter.preloadResourceURLs(resources);
                })
                .then(function() {
                    success.call(this);
                })
                .catch(function() {
                    // No resources file — start with empty
                    resources = {};
                    success.call(this);
                });
            return;
        }

        var initOptionsResources = FrameTrail.getState('resources');

        // null means "load default index from dataPath" (same as local/server mode default)
        if (initOptionsResources === null) {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('resources/_index.json')
                .then(function(data) {
                    resources = data.resources || {};
                    success.call(this);
                })
                .catch(function() {
                    resources = {};
                    success.call(this);
                });
            return;
        }

        var countdown = initOptionsResources.length;

        if (countdown === 0) {
            return success.call(this);
        }

        function _isAbsoluteURL(url) {
            return /^https?:|^\/\/|^file:|^blob:|^data:/.test(url);
        }

        for (var i = 0, l = countdown; i < l; i++) {

            (function(source) {

                if (source.type === 'frametrail') {

                    if (typeof source.data === 'string') {

                        var fetchURL = source.data;

                        _ajax({
                            url:      fetchURL,
                            dataType: 'json'
                        }, function (data) {
                            // When fetching from a remote URL, resolve relative src/thumb
                            // paths against the remote base URL so they don't break
                            if (_isAbsoluteURL(fetchURL) && data.resources) {
                                var baseURL = fetchURL.substring(0, fetchURL.lastIndexOf('/') + 1);
                                for (var id in data.resources) {
                                    var res = data.resources[id];
                                    if (res.src && !_isAbsoluteURL(res.src)) {
                                        res.src = baseURL + res.src;
                                    }
                                    if (res.thumb && !_isAbsoluteURL(res.thumb)) {
                                        res.thumb = baseURL + res.thumb;
                                    }
                                }
                            }
                            resources = Object.assign(resources, data.resources);
                            ready();
                        }, function () {
                            fail(labels['ErrorNoResourcesIndexFile']);
                        });

                    } else if (typeof source.data === 'object' && source.data !== null) {

                        resources = Object.assign(resources, source.data);
                        ready();

                    }

                } else if (source.type === 'iiif') {

                    // TODO
                    ready();

                } else {
                    fail(labels['ErrorUnknownResourceDataEndpoint']);
                }

            })(initOptionsResources[i]);

            function ready() {
                if (--countdown === 0) {
                    success.call(this);
                }
            }

        }

    };


    /**
     * I load the user.json from the server
     * and save the  data in my attribute {{#crossLink "Database/users:attribute"}}Database/users{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadUserData
     * @param {Function} success
     * @param {Function} fail
     */
    function loadUserData(success, fail) {

        if (FrameTrail.getState('users')) {

            users = FrameTrail.getState('users');
            success.call(this);

        } else if (FrameTrail.getState('storageMode') === 'local') {

            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('users.json')
                .then(function(data) {
                    users = data.user || {};
                    success.call(this);
                })
                .catch(function() {
                    users = {};
                    success.call(this);
                });

        } else if (FrameTrail.getState('storageMode') === 'download' ||
                   FrameTrail.getState('storageMode') === 'static') {

            // Download / static mode: no users file — start empty
            users = {};
            success.call(this);

        } else if (!FrameTrail.module('RouteNavigation').environment.server) {

            _ajax({
                url:      '_data/users.json',
                dataType: 'json'
            }, function (data) {
                users = data.user;
                //console.log('users', users);
                success.call(this);
            }, function () {
                fail(labels['ErrorNoUserIndexFile']);
                success.call(this);
            });

        } else {

            _ajax({
                type:     'POST',
                url:      '_server/ajaxServer.php',
                dataType: 'json',
                data:     { a: 'userGet' }
            }, function (data) {
                if (!data.response) {
                    console.error(labels['ErrorNoUserIndexFile']);
                    success.call(this);
                    return;
                }
                users = data.response.user;
                //console.log('users', users);
                success.call(this);
            }, function () {
                console.error(labels['ErrorNoUserIndexFile']);
                success.call(this);
            });

        }



    };


    /**
     * I load the hypervideo index data (_data/hypervideos/_index.json) according to the definitions in the init-options
     * and save the data in my attribute {{#crossLink "Database/hypervideos:attribute"}}Database/hypervideos{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadHypervideoData
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadHypervideoData(success, fail) {

        if (FrameTrail.getState('storageMode') === 'local') {
            loadHypervideoData_LocalAdapter(success, fail);
            return;
        }

        var initOptionsHypervideoData = FrameTrail.getState('contents');

        if (!initOptionsHypervideoData) {

            loadHypervideoData_FrametrailServer(
                FrameTrail.module('RouteNavigation').resolveDataURL('hypervideos/'), success, fail
            );

        } else if (typeof initOptionsHypervideoData === 'string') {

            loadHypervideoData_FrametrailServer(initOptionsHypervideoData, success, fail);

        } else if (Array.isArray(initOptionsHypervideoData)) {

            var countdown = initOptionsHypervideoData.length;
            function ready() {
                if (!--countdown) success();
            }

            for (var i = 0, l = initOptionsHypervideoData.length; i < l; i++) {

                if (typeof initOptionsHypervideoData[i].hypervideo === 'string') {

                    loadHypervideoData_DefaultServer(i, initOptionsHypervideoData[i].hypervideo, ready, fail)

                } else if (typeof initOptionsHypervideoData[i].hypervideo === 'object' && initOptionsHypervideoData[i].hypervideo !== null) {

                    if (initOptionsHypervideoData[i].hypervideo.url && initOptionsHypervideoData[i].hypervideo.type) {

                        // TODO Dropbox, Github...
                        // hypervideos[i] = ...

                    } else {
                        hypervideos[i] = indexEntry(initOptionsHypervideoData[i].hypervideo);

                        ready();
                    }

                } else {
                    fail(labels['ErrorUnknownHypervideoDataInitOptions']);
                }

            }


        } else {

            fail(labels['ErrorUnknownHypervideoDataInitOptions']);

        }


    }



    /**
     * I load the hypervideo index data (_data/hypervideos/_index.json) from the server
     * and save the data in my attribute {{#crossLink "Database/hypervideos:attribute"}}Database/hypervideos{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadHypervideoData_FrametrailServer
     * @param {String} urlpath
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadHypervideoData_FrametrailServer(urlpath, success, fail) {

        _ajax({
            url:      urlpath + '_index.json',
            dataType: 'json'
        }, function (data) {

            var countdown = Object.keys(data.hypervideos).length,
                bufferedData = {};

            adoptOverviewMap(data.overviewMap);

            // TODO: fix server object / array php problem
            if ( Array.isArray(data.hypervideos) || countdown == 0 ) {
                hypervideos = {};
                success.call(this);
                return;
            }

            for (var key in data.hypervideos) {
                (function (hypervideoID) {

                    _ajax({
                        url:      urlpath + data.hypervideos[hypervideoID] + '/hypervideo.json',
                        dataType: 'json'
                    }, function (hypervideoData) {

                        _ajax({
                            url:      urlpath + data.hypervideos[hypervideoID] + '/annotations/_index.json',
                            dataType: 'json'
                        }, function (annotationsIndex) {

                            bufferedData[hypervideoID] = indexEntry(hypervideoData, annotationsIndex);

                            if (!--countdown) {
                                next();
                            }

                        }, function () {
                            fail(labels['ErrorNoAnnotationsIndexFile']);
                        });

                    }, function () {
                        fail(labels['ErrorNoHypervideoJSONFile']);
                    });

                })(key);
            }


            function next() {

                hypervideos = bufferedData;
                //console.log('hypervideo', hypervideos[hypervideoID]);
                success.call(this);

            }

        }, function () {
            fail(labels['ErrorNoHypervideoIndexFile']);
        });

    };



    /**
     * I load the Hypervideo data from a standard HTTP server.
     *
     * @method loadHypervideoData_DefaultServer
     * @param {String} id
     * @param {String} url
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadHypervideoData_DefaultServer(id, url, success, fail) {

        _ajax({
            url:      url,
            dataType: 'json'
        }, function (hypervideoData) {

            hypervideos[id] = indexEntry(hypervideoData);

            success();

        }, function () {
            fail(labels['ErrorNoHypervideoJSONFile']);
        });

    }


    /**
     * I load hypervideo data from the local filesystem adapter.
     * Mirrors loadHypervideoData_FrametrailServer but reads via adapter.
     *
     * @method loadHypervideoData_LocalAdapter
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadHypervideoData_LocalAdapter(success, fail) {

        var adapter = FrameTrail.module('StorageManager').getAdapter();

        adapter.readJSON('hypervideos/_index.json').then(function(data) {

            var keys = Object.keys(data.hypervideos || {}),
                countdown = keys.length,
                bufferedData = {};

            adoptOverviewMap(data.overviewMap);

            if (Array.isArray(data.hypervideos) || countdown === 0) {
                hypervideos = {};
                success.call(this);
                return;
            }

            keys.forEach(function(hvID) {
                var hvDir = 'hypervideos/' + data.hypervideos[hvID];

                adapter.readJSON(hvDir + '/hypervideo.json').then(function(hypervideoData) {

                    return adapter.readJSON(hvDir + '/annotations/_index.json')
                        .catch(function() { return {}; })
                        .then(function(annotationsIndex) {

                            bufferedData[hvID] = indexEntry(hypervideoData, annotationsIndex);

                            if (!--countdown) {
                                hypervideos = bufferedData;
                                success.call(this);
                            }
                        });

                }).catch(function(err) {
                    console.error('Failed to load ' + hvDir + '/hypervideo.json:', err);
                    fail(labels['ErrorNoHypervideoJSONFile'] + ' (' + hvDir + ')');
                });
            });

        }).catch(function() {
            fail(labels['ErrorNoHypervideoIndexFile']);
        });

    }


    /**
     * I load the hypervideo sequence data (_data/hypervideos/
     * {{#crossLink "RouteNavigation/hypervideoID:attribute"}}RouteNavigation/hypervideoID{{/crossLink}} /hypervideo.json)
     * from the server and save the data in my attribute {{#crossLink "Database/hypervideo:attribute"}}Database/hypervideos{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadSequenceData
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadSequenceData(success, fail) {

        sequence = {
            clips: hypervideos[hypervideoID].clips
        }
        //console.log('sequence', sequence);

        success();
    };


    /**
     * I load the content data from the hypervideo.json
     * and save the data in my attribute {{#crossLink "Database/overlays:attribute"}}Database/overlays{{/crossLink}} and  {{#crossLink "Database/codeSnippets:attribute"}}Database/codeSnippets{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadContentData
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadContentData(success, fail) {

        try {

            var model = Serializer.parseHypervideo(hypervideos[hypervideoID].hypervideoData);

            overlays      = model.overlays;
            otherContents = model.otherContents;

            codeSnippets.timebasedEvents = model.codeSnippets;
            codeSnippets.globalEvents    = model.globalEvents;
            codeSnippets.customCSS       = model.customCSS;

        } catch (e) {
            console.log(e);
            return fail(labels['ErrorCouldNotLoadContentData']);
        }
        success();

    };



    /**
     * I make created unique per creator across all loaded annotation files.
     * Each file is already de-duplicated on parsing; this catches one user's
     * annotations that ended up in another user's file.
     *
     * @method dedupeAnnotations
     * @private
     */
    function dedupeAnnotations() {
        Serializer.dedupeCreated(annotations, function(annotation) { return annotation.creatorId; });
    }


    /**
     * I load the annotation data.
     *
     * @method loadAnnotationData
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadAnnotationData(success, fail) {

        if (FrameTrail.getState('storageMode') === 'local') {
            loadAnnotationData_LocalAdapter(success, fail);
            return;
        }

        var initOptionsHypervideoData = FrameTrail.getState('contents');

        if (!initOptionsHypervideoData) {

            loadAnnotationData_FrametrailServer('_data/hypervideos/', success, fail);

        } else if (typeof initOptionsHypervideoData === 'string') {

            loadAnnotationData_FrametrailServer(initOptionsHypervideoData, success, fail);

        } else if (Array.isArray(initOptionsHypervideoData)) {

            loadAnnotationData_Default(success, fail);

        } else {
            fail(labels['ErrorUnknownInitOption']);
        }

    };




    /**
     * I load the annotation data (_data/hypervideos/ {{#crossLink "RouteNavigation/hypervideoID:attribute"}}RouteNavigation/hypervideoID{{/crossLink}} /hypervideo.json) from the server
     * and save the data in my attribute {{#crossLink "Database/annotations:attribute"}}Database/annotations{{/crossLink}}.
     *
     *
     * I call my success or fail callback respectively.
     *
     * @method loadAnnotationData_FrametrailServer
     * @param {String} url
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadAnnotationData_FrametrailServer(url, success, fail) {


        var annotationfiles  = hypervideo.annotationfiles || {},
            annotationsCount = Object.keys(annotationfiles).length;

        // clear previous data
        annotations  = [];

        if (annotationsCount === 0) {
            return success.call(this);
        }

        for (var id in annotationfiles) {

            (function(id){

                _ajax({
                    url:      url + hypervideoID + '/annotations/' + id + '.json',
                    dataType: 'json'
                }, function (data) {

                    Array.prototype.push.apply(annotations, Serializer.parseAnnotationFile(data, { frametrail: true, url: url }));

                    annotationsCount--;
                    if(annotationsCount === 0){

                        // all annotation data loaded from server
                        dedupeAnnotations();
                        success.call(this);

                    }


                }, function () {
                    fail(labels['ErrorMissingAnnotationFile']);
                });

            }).call(this, id)

        }


    };





    /**
     * I load the annotation data from init option sources
     *
     * @method loadAnnotationData_Default
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadAnnotationData_Default(success, fail) {

        var initAnnotations = FrameTrail.getState('contents')[hypervideoID].annotations;

        // clear previous data
        annotations = [];

        if (!initAnnotations || initAnnotations.length === 0) {
            return success();
        }

        var countdown = initAnnotations.length;
        function ready() {
            if (!--countdown) {
                dedupeAnnotations();
                success();
            }
        }

        for (var i = 0, l = initAnnotations.length; i < l; i++) {

            if (typeof initAnnotations[i] === 'string') {

                _ajax({
                    url:      initAnnotations[i],
                    dataType: 'json'
                }, function (data) {

                    Array.prototype.push.apply(annotations, Serializer.parseAnnotationFile(data, { frametrail: false, url: initAnnotations[i] }));

                    ready();


                }, function () {
                    fail(labels['ErrorMissingAnnotationFile']);
                });

            } else if (initAnnotations[i].url && initAnnotations[i].type) {

                // TODO git, dropbox ...
                // annotations.push(...)

            } else {

                for (var i in initAnnotations) {

                    annotations.push(Serializer.parseAnnotation(initAnnotations[i], { frametrail: false, url: initAnnotations[i] }));

                    ready();

                }


            }



        }


    };


    /**
     * I load annotation data from the local filesystem adapter.
     * Mirrors loadAnnotationData_FrametrailServer but reads via adapter.
     *
     * @method loadAnnotationData_LocalAdapter
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadAnnotationData_LocalAdapter(success, fail) {

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var annotationfiles = hypervideo.annotationfiles || {};
        var ids = Object.keys(annotationfiles);
        var annotationsCount = ids.length;

        annotations = [];

        if (annotationsCount === 0) {
            success.call(this);
            return;
        }

        ids.forEach(function(id) {
            adapter.readJSON('hypervideos/' + hypervideoID + '/annotations/' + id + '.json')
                .then(function(data) {
                    Array.prototype.push.apply(annotations, Serializer.parseAnnotationFile(data, { frametrail: true, url: 'local' }));

                    annotationsCount--;
                    if (annotationsCount === 0) {
                        dedupeAnnotations();
                        success.call(this);
                    }
                })
                .catch(function() {
                    fail(labels['ErrorMissingAnnotationFile']);
                });
        });
    }







    /**
     * I load the subtitles data (_data/hypervideos/ {{#crossLink "RouteNavigation/hypervideoID:attribute"}}RouteNavigation/hypervideoID{{/crossLink}} /subtitles/...) from the server
     * and save the data in my attribute {{#crossLink "Database/subtitles:attribute"}}Database/subtitles{{/crossLink}}
     *
     * I call my success or fail callback respectively.
     *
     * @method loadSubtitleData
     * @param {Function} success
     * @param {Function} fail
     * @private
     */
    function loadSubtitleData(success, fail) {

        var subtitleCount = 0;

        subtitles = {};

        if (hypervideo.subtitles && hypervideo.subtitles.length > 0) {

            for (var idx in hypervideo.subtitles) {
                subtitleCount ++;
            }

            // Helper to parse VTT data once loaded
            function parseSubtitleData(data, currentSubtitles) {
                var parsedCues = [];
                var parser = new WebVTT.Parser(window, WebVTT.StringDecoder());
                parser.onregion = function(region) {};
                parser.oncue = function(cue) { parsedCues.push(cue); };
                parser.onparsingerror = function(e) { console.log(e); };
                parser.parse(data);
                parser.flush();

                var langLabel = subtitlesLangMapping[currentSubtitles.srclang] || currentSubtitles.srclang;
                subtitles[currentSubtitles.srclang] = {};
                subtitles[currentSubtitles.srclang]['label'] = langLabel;
                subtitles[currentSubtitles.srclang]['cues'] = parsedCues;

                subtitleCount--;
                if (subtitleCount === 0) {
                    success.call(this);
                }
            }

            if (FrameTrail.getState('storageMode') === 'local') {
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                for (var j = 0; j < hypervideo.subtitles.length; j++) {
                    (function(j) {
                        var currentSubtitles = hypervideo.subtitles[j];
                        adapter.readText('hypervideos/' + hypervideoID + '/subtitles/' + currentSubtitles.src)
                            .then(function(data) {
                                parseSubtitleData(data, currentSubtitles);
                            })
                            .catch(function() {
                                console.warn(labels['ErrorMissingSubtitleFile']);
                                subtitleCount--;
                                if (subtitleCount === 0) { success.call(this); }
                            });
                    })(j);
                }
                return;
            }

            for (var i = 0; i < hypervideo.subtitles.length; i++) {

                (function(i){

                    var currentSubtitles = hypervideo.subtitles[i];

                    _ajax({
                        url:      '_data/hypervideos/' + hypervideoID + '/subtitles/' + currentSubtitles.src,
                        dataType: 'text'
                    }, function (data) {
                        parseSubtitleData(data, currentSubtitles);
                    }, function () {
                        //fail(labels['ErrorMissingSubtitleFile']);
                        console.warn(labels['ErrorMissingSubtitleFile']);
                        success.call(this);
                    });

                }).call(this, i)

            }

        } else {

            // no subtitles found, continue
            success.call(this);

        }


    };





    /**
     * I initialise the load process of the database
     *
     * First I look for the {{#crossLink "RouteNavigation/hypervideoID:attribute"}}RouteNavigation/hypervideoID{{/crossLink}}.
     *
     * Then I call the nested load functions to fetch all data from the server.
     * I call my success or fail callback respectively.
     *
     * @method loadData
     * @param {Function} success
     * @param {Function} fail
     */
    function loadData(success, fail) {

        hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

       if(!hypervideoID){

            //FrameTrail.module('InterfaceModal').showStatusMessage('No Hypervideo is selected.');

            hypervideo    = null;
            sequence      = {};
            annotations   = [];
            overlays      = [];
            codeSnippets  = {};
            otherContents = [];

            return  loadConfigData(function(){

                        loadResourceData(function(){

                            loadUserData(function(){

                                loadHypervideoData(function(){

                                    success.call();

                                }, fail);

                            }, fail);

                        }, fail);

                    }, fail);
        }



        loadConfigData(function(){

            loadResourceData(function(){

                loadUserData(function(){

                    loadHypervideoData(function(){


                        hypervideo = hypervideos[hypervideoID];

                        if(!hypervideo){

                            return fail(labels['ErrorHypervideoDoesNotExist']);

                        }

                        loadSequenceData(function(){

                            loadSubtitleData(function(){

                                loadContentData(function(){

                                    loadAnnotationData(function(){

                                        success.call();

                                    }, fail);

                                }, fail);

                            }, fail);

                        }, fail);


                    }, fail);


                }, fail);

            }, fail);

        }, fail);


    };



    /**
     * I update the hypervideo data inside the database
     *
     * @method updateHypervideoData
     * @param {Function} success
     * @param {Function} fail
     */
    function updateHypervideoData(success, fail) {

        hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        loadHypervideoData(function(){

            hypervideo = hypervideos[hypervideoID];

            if(!hypervideo){

                return fail(labels['ErrorHypervideoDoesNotExist']);

            }

            loadSequenceData(function(){

                loadSubtitleData(function(){

                    loadContentData(function(){

                        loadAnnotationData(function(){

                            success.call();

                        }, fail);

                    }, fail);

                }, fail);

            }, fail);


        }, fail);

    };


    /**
     * I generate the JSON for hypervideo.json.
     *
     * Every hypervideo is written from its own data: meta, config, clips,
     * chapters and subtitles from its entry in my hypervideos index (where
     * the settings dialog edits them), everything else from the file it was
     * loaded from. Only the open hypervideo has live editor state — its
     * overlays, code snippets, global events, custom CSS and content views —
     * and only it gets them. The serializer keeps whatever none of these
     * cover.
     *
     * A save keeps Transcript views. An export has to stand alone, so there
     * they become CustomHTML built from the loaded subtitles (which exist
     * only for the open hypervideo).
     *
     * @method convertToDatabaseFormat
     * @param {String} [thisHypervideoID] default: the open hypervideo
     * @param {String} [purpose] 'save' (default) or 'export'
     * @return {Object}
     */
    function convertToDatabaseFormat (thisHypervideoID, purpose) {

        thisHypervideoID = thisHypervideoID || hypervideoID;

        var entry = hypervideos[thisHypervideoID];

        if (!entry) {
            throw new Error('Unknown hypervideo: ' + thisHypervideoID);
        }

        var isOpen = !!hypervideoID && String(thisHypervideoID) === String(hypervideoID),
            model  = Serializer.parseHypervideo(entry.hypervideoData),
            config = Object.assign({}, entry.config);

        delete config.layoutArea;

        Object.assign(model.meta, {
            "name":        entry.name,
            "description": entry.description,
            "thumb":       entry.thumb,
            "posterFrame": entry.posterFrame || null,
            "creator":     entry.creator,
            "creatorId":   entry.creatorId,
            "created":     entry.created,
            "lastchanged": entry.lastchanged
        });

        model.config    = config;
        model.layout    = (entry.config || {}).layoutArea;
        model.clips     = entry.clips;
        model.chapters  = entry.chapters || [];
        model.subtitles = entry.subtitles;

        if (isOpen) {
            model.overlays      = overlays;
            model.codeSnippets  = codeSnippets.timebasedEvents || [];
            model.otherContents = otherContents;
            model.globalEvents  = codeSnippets.globalEvents;
            model.customCSS     = codeSnippets.customCSS;

            var ViewLayout = FrameTrail.module('ViewLayout');
            if (ViewLayout && ViewLayout.getLayoutAreaData) {
                model.layout = ViewLayout.getLayoutAreaData();
            }
        }

        return Serializer.serializeHypervideo(model, {
            sourcePath: sourcePathOf(thisHypervideoID),
            now:        Date.now(),
            purpose:    purpose || 'save',
            subtitles:  isOpen ? subtitles : null
        });

    }


    /**
     * I save the config data back to the server.
     *
     * My success callback gets one argument, which is either
     *
     *     { success: true }
     * or
     *     { failed: 'config', error: ... }
     *
     * @method saveConfig
     * @param {Function} callback
     */
    function saveConfig(callback) {

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode !== 'server') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.writeJSON('config.json', config)
                .then(function() { callback.call(window, { success: true }); })
                .catch(function(error) { callback.call(window, { failed: 'config', error: error.message }); });
            return;
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data:     { a: 'configChange', src: JSON.stringify(config, null, 4), baseVersion: (config.lastchanged == null ? '' : config.lastchanged) }
        }, function (data) {
            if (data.code === 0) {
                if (data.response && data.response.lastchanged) {
                    config.lastchanged = data.response.lastchanged;
                }
                // The post-write mtime, so the caller can tell the collaboration
                // poll that this version is ours and not be told about it.
                callback.call(window, {
                    success: true,
                    version: (data.response && data.response.version) ? data.response.version : null
                });
            } else if (data.code === 7) {
                callback.call(window, { failed: 'config', error: 'Conflict', code: 7, conflict: data.response });
            } else {
                callback.call(window, { failed: 'config', error: data.string, code: data.code });
            }
        }, function (error) {
            callback.call(window, { failed: 'config', error: error });
        });

    };


    /**
     * I write the overview map document back into hypervideos/_index.json.
     *
     * My success callback gets one argument, which is either
     *
     *     { success: true, version: <mtime> }
     * or
     *     { failed: 'overviewMap', error: ..., code: ... }
     *
     * In server mode this is a narrow write: the backend replaces only the
     * "overviewMap" key of the index under that file's lock, so it cannot
     * clobber a hypervideo added or deleted since we loaded. Everywhere else
     * the same guarantee is bought by re-reading the index immediately before
     * writing it.
     *
     * @method saveOverviewMap
     * @param {Function} callback
     */
    function saveOverviewMap(callback) {

        var map = getOverviewMap();

        function done(result) {
            // A data directory that still carries the map in config.json
            // migrates the first time somebody edits it: the index is now the
            // source of truth, so the legacy copy has to go or the next reader
            // has two answers to the same question.
            if (result.success && overviewMapMigrated) {
                overviewMapMigrated = false;
                if (config && config.overviewMap) {
                    delete config.overviewMap;
                    // Best effort: a refused write just means the stale key is
                    // cleaned up the next time round, and it is ignored either
                    // way now that the index has a map. Not attempted at all
                    // when the platform owns config.json: it would only be
                    // refused, and the platform's next write drops the key.
                    var UserManagement = FrameTrail.module('UserManagement');
                    if (!(UserManagement && UserManagement.externalSettings && UserManagement.externalSettings())) {
                        saveConfig(function() {});
                    }
                }
            }
            callback.call(window, result);
        }

        if (FrameTrail.getState('storageMode') !== 'server') {

            var adapter = FrameTrail.module('StorageManager').getAdapter(),
                written = false;

            // Re-read immediately before writing, so a hypervideo added since
            // we loaded survives — the local mirror of the server's merge.
            //
            // The fallback matters: the download adapter has no index in
            // memory at all and throws, and writing a bare { overviewMap }
            // would leave a file that names no hypervideos — an index that
            // erases the library it is supposed to list.
            adapter.readJSON('hypervideos/_index.json')
                .catch(function() { return null; })
                .then(function(index) {

                    if (!index || typeof index !== 'object' || Array.isArray(index)) {
                        index = buildHypervideoIndex();
                    }

                    index.overviewMap = JSON.parse(JSON.stringify(map));
                    index.overviewMap.lastchanged = Date.now();

                    return adapter.writeJSON('hypervideos/_index.json', index).then(function() {
                        map.lastchanged = index.overviewMap.lastchanged;
                        written = true;
                        done({ success: true, version: null });
                    });

                })
                .catch(function(error) {
                    // Only report a failure we have not already reported as a
                    // success — a throw out of the callback must not turn a
                    // completed write into an error message.
                    if (!written) done({ failed: 'overviewMap', error: error.message });
                });

            return;
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data:     {
                a:           'overviewMapChange',
                src:         JSON.stringify(map),
                baseVersion: (map.lastchanged == null ? '' : map.lastchanged)
            }
        }, function (data) {
            if (data.code === 0) {
                if (data.response && data.response.lastchanged) {
                    map.lastchanged = data.response.lastchanged;
                }
                done({
                    success: true,
                    version: (data.response && data.response.version) ? data.response.version : null
                });
            } else if (data.code === 7) {
                callback.call(window, {
                    failed: 'overviewMap',
                    error:  'Conflict',
                    code:   7,
                    conflict: (data.response && data.response.overviewMap) || null
                });
            } else {
                callback.call(window, { failed: 'overviewMap', error: data.string, code: data.code });
            }
        }, function (error) {
            callback.call(window, { failed: 'overviewMap', error: error });
        });

    };


    /**
     * I ask the server for the compare-and-swap tokens of config.json and
     * custom.css, and seed cssBaseVersion from the answer.
     *
     * config.json carries its own lastchanged, so loading it is enough. Plain
     * CSS does not, and without this the first globalCSSChange of a session
     * would go out unguarded — which is exactly how one admin ends up
     * overwriting another's stylesheet without either of them noticing.
     *
     * Only server mode has a compare-and-swap to seed; everywhere else this is
     * a no-op that still calls back, so callers need no storage-mode branch.
     *
     * @method loadConfigVersions
     * @param {Function} [callback]
     */
    function loadConfigVersions(callback) {

        function done() { if (callback) callback.call(window); }

        if (FrameTrail.getState('storageMode') !== 'server') {
            return done();
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data:     { a: 'configVersions' }
        }, function (data) {
            if (data.code === 0 && data.response) {
                cssBaseVersion = data.response.css;
                if (data.response.config != null) {
                    config.lastchanged = data.response.config;
                }
            }
            done();
        }, done);

    };


    /**
     * I save the global custom CSS back to the server (/_data/custom.css).
     *
     * My success callback gets one argument, which is either
     *
     *     { success: true }
     * or
     *     { failed: 'globalcss', error: ... }
     *
     * @method saveGlobalCSS
     * @param {Function} callback
     */
    function saveGlobalCSS(callback) {

        var _cssEl = document.querySelector('head > style.FrameTrailGlobalCustomCSS');
        var styles = _cssEl ? _cssEl.textContent : '';

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode !== 'server') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            if (adapter.writeText) {
                adapter.writeText('custom.css', styles || '')
                    .then(function() { callback.call(window, { success: true }); })
                    .catch(function(error) { callback.call(window, { failed: 'globalcss', error: error.message }); });
            } else {
                // Download adapter doesn't support text files
                callback.call(window, { success: true });
            }
            return;
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            // Plain CSS carries no version field, so we only have a token once the
            // server has told us one. The first save of a session is unguarded;
            // the settings lock covers that window.
            data:     { a: 'globalCSSChange', src: styles, baseVersion: (cssBaseVersion == null ? '' : cssBaseVersion) }
        }, function (data) {
            if (data.code === 0) {
                if (data.response && data.response.lastchanged) {
                    cssBaseVersion = data.response.lastchanged;
                }
                callback.call(window, {
                    success: true,
                    version: (data.response && data.response.version) ? data.response.version : null
                });
            } else if (data.code === 7) {
                callback.call(window, { failed: 'globalcss', error: 'Conflict', code: 7, conflict: data.response });
            } else {
                callback.call(window, { failed: 'globalcss', error: 'ServerError', code: data.code });
            }
        }, function (error) {
            callback.call(window, { failed: 'globalcss', error: error });
        });

    };


    /**
     * I save the complete hypervideo data back to the server.
     *
     * My success callback gets one argument, which is either
     *
     *     { success: true }
     * or
     *     { failed: 'hypervideo', error: ... }
     *
     * @method saveOverlays
     * @param {Function} callback
     */
    function saveHypervideo(callback, thisHypervideoID) {

        thisHypervideoID = thisHypervideoID || hypervideoID;

        var saveData = convertToDatabaseFormat(thisHypervideoID);
        //console.log(saveData);

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode !== 'server') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            var path = 'hypervideos/' + thisHypervideoID + '/hypervideo.json';
            adapter.writeJSON(path, saveData)
                .then(function() {
                    hypervideos[thisHypervideoID].lastchanged = saveData.meta.lastchanged;
                    callback.call(window, { success: true });
                })
                .catch(function(error) { callback.call(window, { failed: 'hypervideo', error: error.message }); });
            return;
        }

        // The value loaded from disk. convertToDatabaseFormat() stamps a fresh
        // Date.now() into its own output and never writes back here, so this
        // stays the version we actually rendered from — the compare-and-swap token.
        var baseVersion = hypervideos[thisHypervideoID].lastchanged;

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data:     { a: 'hypervideoChange', hypervideoID: thisHypervideoID, src: JSON.stringify(saveData, null, 4), baseVersion: (baseVersion == null ? '' : baseVersion) }
        }, function (data) {
            if (data.code === 0) {
                hypervideos[thisHypervideoID].lastchanged = saveData.meta.lastchanged;
                // The post-write version token, so the caller can tell the
                // Collaboration module we are in sync with our own change.
                callback.call(window, {
                    success: true,
                    version: (data.response && data.response.version) ? data.response.version : null
                });
            } else if (data.code === 7) {
                callback.call(window, { failed: 'hypervideo', error: 'Conflict', code: 7, conflict: data.response });
            } else {
                callback.call(window, { failed: 'hypervideo', error: 'ServerError', code: data.code });
            }
        }, function (error) {
            callback.call(window, { failed: 'hypervideo', error: error });
        });

    };


    /**
     * I save the annotation data back to the server.
     *
     * I choose by myself the appropriate server method ($_POST["action"]: "save" or "saveAs")
     * wether the user's annotation file does already exist, or has to be created.
     *
     * My success callback gets one argument, which is either
     *
     *     { success: true }
     *
     * or
     *
     *     { failed: 'annotations', error: ... }
     *
     * @method saveAnnotations
     * @param {Function} callback
     */

    /**
     * Convert a normalized annotation object to W3C Web Annotation format.
     * @private
     */
    function _annotationToW3C(annotationItem) {
        return Serializer.serializeAnnotation(annotationItem, { sourcePath: sourcePathOf(hypervideoID) });
    }

    /**
     * Return all current annotations serialized as W3C Web Annotation objects.
     * Useful for embedding annotations in a standalone HTML export.
     * @method getAnnotationsW3C
     * @return {Array}
     */
    function getAnnotationsW3C() {
        return annotations.map(_annotationToW3C);
    }

    function saveAnnotations(callback) {

        var userID              = FrameTrail.module('UserManagement').userID,
            action              = 'save',
            name                = FrameTrail.getState('username'),
            description         = FrameTrail.getState('username') + '\'s annotations',
            hidden              = false,
            annotationsToSave   = [];


        for (var i in annotations) {
            var annotationItem = annotations[i];

            if (!annotationItem.source.frametrail || annotationItem.creatorId !== userID) {
                continue;
            }

            annotationsToSave.push(annotationItem);

        }

        annotationsToSave = Serializer.serializeAnnotationFile(annotationsToSave, { sourcePath: sourcePathOf(hypervideoID) });

        //console.log(annotationsToSave);

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode !== 'server') {
            // Local / download adapter — write annotation file + update index
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            var annPath = 'hypervideos/' + hypervideoID + '/annotations/' + userID + '.json';
            var indexPath = 'hypervideos/' + hypervideoID + '/annotations/_index.json';

            adapter.createDirectory('hypervideos/' + hypervideoID + '/annotations')
                .then(function() {
                    return adapter.writeJSON(annPath, annotationsToSave);
                })
                .then(function() {
                    return adapter.readJSON(indexPath).catch(function() { return {}; });
                })
                .then(function(index) {
                    // Under annotationfiles, where the loaders look — the
                    // top-level entry this used to write was never read back.
                    var now      = Math.floor(Date.now() / 1000),
                        existing = Serializer.parseAnnotationIndex(index).annotationfiles[userID] || {};
                    return adapter.writeJSON(indexPath, Serializer.setAnnotationIndexEntry(index, userID, {
                        name:        name,
                        description: description,
                        created:     (existing.created != null) ? existing.created : now,
                        lastchanged: now,
                        hidden:      hidden,
                        owner:       name,
                        ownerId:     String(userID)
                    }));
                })
                .then(function() {
                    callback.call(window, { success: true });
                })
                .catch(function(error) {
                    callback.call(window, { failed: 'annotations', error: error.message });
                });
            return;
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data: {
                a:                'annotationfileSave',
                hypervideoID:     hypervideoID,
                action:           action,
                annotationfileID: userID,
                name:             name,
                description:      description,
                hidden:           hidden,
                src:              JSON.stringify(annotationsToSave, null, 4)
            }
        }, function (data) {

            if (data.code === 0) {

                callback.call(window, { success: true });

            } else {

                callback.call(window, {
                    failed: 'annotations',
                    error: 'ServerError',
                    code: data.code
                });

            }

        }, function (error) {

            callback.call(window, {
                failed: 'annotations',
                error: error
            });

        });


    };









    /**
     * I search the resource database for a given data object and return its id.
     *
     * @method getIdOfResource
     * @param {} resourceData
     * @return String or null
     */
    function getIdOfResource(resourceData) {

        if (resourceData.resourceId) {
            return resourceData.resourceId;
        } else {
            for (var id in resources) {
                if (resources[id] === resourceData){
                    return id;
                }
            }
        }

        return null;
    };


    /**
     * I search the hypervideo database for a given data object and return its id.
     *
     * @method getIdOfHypervideo
     * @param {} data
     * @return String or null
     */
    function getIdOfHypervideo(data) {

        for (var id in hypervideos) {
            if (hypervideos[id] === data){
                return id;
            }
        }
        return null;
    };



    return {

        /**
         * I store the hypervideo index data (from the server's _data/hypervideos/_index.json)
         * @attribute hypervideos
         */
        get hypervideos()   { return hypervideos },
        /**
         * I store the hypervideo index data for the current hypervideo
         * @attribute hypervideo
         */
        get hypervideo()     { return hypervideo },

        //TODO Check if setting hypervideo data on update necessary
        set hypervideo(data) { return hypervideo = data },

        /**
         * I store the hypervideo sequence data (from the server's _data/hypervideos/<ID>/hypervideo.json)
         * @attribute sequence
         */
        get sequence()      { return sequence },
        /**
         * I store the overlays data (from the server's _data/hypervideos/<ID>/overlays.json)
         * @attribute overlays
         */
        get overlays()      { return overlays },
        /**
         * I store the code snippets data (from the server's _data/hypervideos/<ID>/codeSnippets.json)
         * @attribute codesnippets
         */
        get codeSnippets()         { return codeSnippets },

        /**
         * I return the currently loaded hypervideo's chapters array (the live data array
         * that convertToDatabaseFormat serializes into hypervideo.json).
         * @attribute chapters
         */
        get chapters()             { return hypervideos[hypervideoID].chapters },

        /**
         * I store the annotation data (from all json files from the server's _data/hypervideos/<ID>/annotationfiles/).
         *
         * I am a map of keys (userIDs) to an array of all annotations from that user.
         *
         *     {
         *         "userID": [ annotationData, annotationData, ... ]
         *     }
         *
         *
         * @attribute annotations
         */
        get annotations()        { return annotations       },

        /**
         * I store the subtitle data (from all .vtt files from the server's _data/hypervideos/<ID>/subtitles/).
         *
         * @attribute subtitles
         */
        get subtitles()        { return subtitles       },

        /**
         * I store a map of subtitle language codes and labels.
         *
         * @attribute subtitlesLangMapping
         */
        get subtitlesLangMapping() { return subtitlesLangMapping },

        /**
         * I store the resource index data (from the server's _data/resources/_index.json)
         * @attribute resources
         */
        get resources()     { return resources },

        /**
         * I store the user data (user.json). The keys are the userIDs, and the values are maps of the user's attributes.
         * @attribute users
         */
        get users()     { return users },

        /**
         * I store the config data (config.json).
         * @attribute users
         */
        get config()     { return config },

        /**
         * I store the overview map document (the "overviewMap" key of
         * _data/hypervideos/_index.json): its background, how that background
         * is fitted, and where each placed hypervideo sits on it.
         *
         * Like config, I keep one object for the lifetime of the page — read
         * through me, never cache the result.
         *
         * @attribute overviewMap
         */
        get overviewMap() { return getOverviewMap() },


        /**
         * I am the name of the overview: config.overviewTitle, or the
         * localized "Overview" label when it is unset or blank.
         *
         * @attribute overviewTitle
         * @type String
         * @readOnly
         */
        get overviewTitle() { return getOverviewTitle() },


        getIdOfResource:       getIdOfResource,
        getIdOfHypervideo:     getIdOfHypervideo,

        loadData:              loadData,
        loadResourceData:      loadResourceData,
        loadConfigData:        loadConfigData,
        loadConfigVersions:    loadConfigVersions,
        loadUserData:          loadUserData,
        replaceConfigContents: replaceConfigContents,

        loadHypervideoData:    loadHypervideoData,
        updateHypervideoData:  updateHypervideoData,
        loadSequenceData:      loadSequenceData,
        loadSubtitleData:      loadSubtitleData,

        saveHypervideo:        saveHypervideo,
        saveAnnotations:       saveAnnotations,
        getAnnotationsW3C:     getAnnotationsW3C,
        saveConfig:            saveConfig,
        saveGlobalCSS:         saveGlobalCSS,
        saveOverviewMap:       saveOverviewMap,
        buildHypervideoIndex:  buildHypervideoIndex,

        //TODO only shortcut for now
        convertToDatabaseFormat: convertToDatabaseFormat

    }



});
