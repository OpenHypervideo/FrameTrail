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

    var hypervideoID = '',
        hypervideos  = {},
        hypervideo   = {},
        sequence     = {},

        overlays     = [],
        codeSnippets = {},
        resources    = {},
        config       = {},

        annotations  = [],

        subtitles              = {},
        subtitlesLangMapping   = {
            'en': 'English',
            'de': 'Deutsch',
            'fr': 'Français'
        },

        users  = {};


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
     * Parse the start time from a W3C media fragment selector value (e.g. "t=1.5,3.2").
     * @private
     */
    function _parseTimeStart(selectorValue) {
        var m = /t=([\d.]+)/.exec(selectorValue);
        return m ? parseFloat(m[1]) : 0;
    }

    /**
     * Parse the end time from a W3C media fragment selector value (e.g. "t=1.5,3.2").
     * @private
     */
    function _parseTimeEnd(selectorValue) {
        var m = /t=[\d.]+,([\d.]+)/.exec(selectorValue);
        return m ? parseFloat(m[1]) : 0;
    }

    /**
     * Parse xywh=percent spatial selector into {left, top, width, height}.
     * Returns {} on failure.
     * @private
     */
    function _parseSpatialSelector(selectorValue) {
        try {
            var m = /xywh=percent:([\d.]+),([\d.]+),([\d.]+),([\d.]+)/.exec(selectorValue);
            return { left: parseFloat(m[1]), top: parseFloat(m[2]), width: parseFloat(m[3]), height: parseFloat(m[4]) };
        } catch (_) { return {}; }
    }

    /**
     * Normalise a single W3C annotation object into the internal FrameTrail format.
     * @param  {Object} item    Raw W3C annotation object
     * @param  {Object} source  Source descriptor { frametrail, url }
     * @return {Object}         Internal annotation object
     * @private
     */
    function _normalizeAnnotation(item, source) {
        var annotation = {
            "name":       item.body['frametrail:name'],
            "creator":    item.creator.nickname,
            "creatorId":  item.creator.id,
            "created":    (new Date(item.created)).getTime(),
            "type":       item.body['frametrail:type'],
            "uri": (function () {
                        if (item["frametrail:uri"]) { return item["frametrail:uri"]; }
                        else if (item.body["frametrail:type"] == 'entity') { return item.body.source; }
                        else { return null; }
                    })(),
            "src": (function () {
                        if (item.body["frametrail:type"] === 'location') { return null; }
                        if (item.body["frametrail:type"] === 'urlpreview') { return item.body.source || item.body.value; }
                        return (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia'].indexOf(item.body["frametrail:type"]) >= 0)
                                ? item.body.value
                                : item.body.source;
                    })(),
            "thumb":                item.body['frametrail:thumb'],
            "licenseType":          item.body['frametrail:licenseType'] || null,
            "licenseAttribution":   item.body['frametrail:licenseAttribution'] || null,
            "start":                _parseTimeStart(item.target.selector.value),
            "end":                  _parseTimeEnd(item.target.selector.value),
            "resourceId":           item.body["frametrail:resourceId"],
            "attributes":           item.body['frametrail:attributes'] || {},
            "tags":       item['frametrail:tags'],
            "source":     source,
            "graphData":  item['frametrail:graphdata']     || null,
            "graphDataType": item['frametrail:graphdatatype'] || null
        };

        if (annotation.type === 'location') {
            var locAttrs = item.body['frametrail:attributes'] || {};
            annotation.attributes.lat         = parseFloat(locAttrs.lat         !== undefined ? locAttrs.lat         : item.body['frametrail:lat']);
            annotation.attributes.lon         = parseFloat(locAttrs.lon         !== undefined ? locAttrs.lon         : item.body['frametrail:long']);
            annotation.attributes.boundingBox = locAttrs.boundingBox !== undefined ? locAttrs.boundingBox : (item.body['frametrail:boundingBox'] || '');
        }

        if (annotation.type === 'video') {
            annotation.startOffset = (item.body.selector && item.body.selector.value)
                                     ? _parseTimeStart(item.body.selector.value) : 0;
            annotation.endOffset   = (item.body.selector && item.body.selector.value)
                                     ? _parseTimeEnd(item.body.selector.value)   : 0;
        }

        return annotation;
    }

    function loadConfigData(success, fail) {

        var configInitOptions = FrameTrail.getState('config');

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
            config = data;
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
                        // hypervideos[i] = initOptionsHypervideoData[i].hypervideo;
                        var hypervideoData = initOptionsHypervideoData[i].hypervideo;
                        hypervideos[i] = {
                            "name": hypervideoData.meta.name,
                            "description": hypervideoData.meta.description,
                            "thumb": hypervideoData.meta.thumb,
                "posterFrame": hypervideoData.meta.posterFrame || null,
                            "creator": hypervideoData.meta.creator,
                            "creatorId": hypervideoData.meta.creatorId,
                            "created": hypervideoData.meta.created,
                            "lastchanged": hypervideoData.meta.lastchanged,
                            "config": hypervideoData.config,
                            "mainAnnotation": null,
                            "annotationfiles": null,
                            "subtitles": hypervideoData.subtitles,
                            "clips": hypervideoData.clips,
                            "hypervideoData": hypervideoData
                        };

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

                            bufferedData[hypervideoID] = {
                                "name": hypervideoData.meta.name,
                                "description": hypervideoData.meta.description,
                                "thumb": hypervideoData.meta.thumb,
                "posterFrame": hypervideoData.meta.posterFrame || null,
                                "creator": hypervideoData.meta.creator,
                                "creatorId": hypervideoData.meta.creatorId,
                                "created": hypervideoData.meta.created,
                                "lastchanged": hypervideoData.meta.lastchanged,
                                "hidden": hypervideoData.config.hidden,
                                "config": hypervideoData.config,
                                "mainAnnotation": annotationsIndex.mainAnnotation,
                                "annotationfiles": annotationsIndex.annotationfiles,
                                "subtitles": hypervideoData.subtitles,
                                "clips": hypervideoData.clips,
                                "hypervideoData": hypervideoData
                            };

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

            hypervideos[id] = {
                "name": hypervideoData.meta.name,
                "description": hypervideoData.meta.description,
                "thumb": hypervideoData.meta.thumb,
                "posterFrame": hypervideoData.meta.posterFrame || null,
                "creator": hypervideoData.meta.creator,
                "creatorId": hypervideoData.meta.creatorId,
                "created": hypervideoData.meta.created,
                "lastchanged": hypervideoData.meta.lastchanged,
                "hidden": hypervideoData.config.hidden,
                "config": hypervideoData.config,
                "mainAnnotation": null,
                "annotationfiles": null,
                "subtitles": hypervideoData.subtitles,
                "clips": hypervideoData.clips,
                "hypervideoData": hypervideoData
            };

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

            if (Array.isArray(data.hypervideos) || countdown === 0) {
                hypervideos = {};
                success.call(this);
                return;
            }

            keys.forEach(function(hvID) {
                var hvDir = 'hypervideos/' + data.hypervideos[hvID];

                adapter.readJSON(hvDir + '/hypervideo.json').then(function(hypervideoData) {

                    return adapter.readJSON(hvDir + '/annotations/_index.json')
                        .catch(function() { return { mainAnnotation: null, annotationfiles: null }; })
                        .then(function(annotationsIndex) {

                            bufferedData[hvID] = {
                                "name": hypervideoData.meta.name,
                                "description": hypervideoData.meta.description,
                                "thumb": hypervideoData.meta.thumb,
                "posterFrame": hypervideoData.meta.posterFrame || null,
                                "creator": hypervideoData.meta.creator,
                                "creatorId": hypervideoData.meta.creatorId,
                                "created": hypervideoData.meta.created,
                                "lastchanged": hypervideoData.meta.lastchanged,
                                "hidden": hypervideoData.config.hidden,
                                "config": hypervideoData.config,
                                "mainAnnotation": annotationsIndex.mainAnnotation || null,
                                "annotationfiles": annotationsIndex.annotationfiles || null,
                                "subtitles": hypervideoData.subtitles,
                                "clips": hypervideoData.clips,
                                "hypervideoData": hypervideoData
                            };

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

            overlays = [];
            codeSnippets.timebasedEvents = [];

            for (var key in hypervideos[hypervideoID].hypervideoData.contents) {

                var contentItem = hypervideos[hypervideoID].hypervideoData.contents[key];
                //console.log('contentItem', contentItem);
                switch (contentItem['frametrail:type']) {
                    case 'Overlay':
                        overlays.push({
                            "name": contentItem.body['frametrail:name'],
                            "creator": contentItem.creator.nickname,
                            "creatorId": contentItem.creator.id,
                            "created": (new Date(contentItem.created)).getTime(),
                            "type": contentItem.body['frametrail:type'],
                            "src":    contentItem.body.source
                                   || contentItem.body.value,
                            "thumb": contentItem.body['frametrail:thumb'] || null,
                            "start": _parseTimeStart(contentItem.target.selector.value),
                            "end": _parseTimeEnd(contentItem.target.selector.value),
                            "startOffset": (contentItem.body.selector && contentItem.body.selector.value)
                                            ? _parseTimeStart(contentItem.body.selector.value)
                                            : 0,
                            "endOffset": (contentItem.body.selector && contentItem.body.selector.value)
                                            ? _parseTimeEnd(contentItem.body.selector.value)
                                            : 0,
                            "attributes": (contentItem.body["frametrail:attributes"]) ? contentItem.body["frametrail:attributes"] : contentItem["frametrail:attributes"],
                            "licenseType":          contentItem.body['frametrail:licenseType'] || null,
                            "licenseAttribution":   contentItem.body['frametrail:licenseAttribution'] || null,
                            "position": _parseSpatialSelector(contentItem.target.selector.value),
                            "events": contentItem["frametrail:events"],
                            "tags": contentItem["frametrail:tags"]
                        });
                        if (overlays[overlays.length-1].type === 'location') {
                            var locationAttributes = overlays[overlays.length-1].attributes;
                            locationAttributes.lat = parseFloat(contentItem.body['frametrail:attributes'].lat);
                            locationAttributes.lon = parseFloat(contentItem.body['frametrail:attributes'].lon);
                            locationAttributes.boundingBox = contentItem.body['frametrail:attributes'].boundingBox;
                        }
                        break;
                    case 'CodeSnippet':
                        codeSnippets.timebasedEvents.push({
                            "name": contentItem.body['frametrail:name'],
                            "creator": contentItem.creator.nickname,
                            "creatorId": contentItem.creator.id,
                            "created": (new Date(contentItem.created)).getTime(),
                            "snippet": contentItem.body.value,
                            "start": _parseTimeStart(contentItem.target.selector.value),
                            "attributes": (contentItem.body['frametrail:attributes']) ? contentItem.body['frametrail:attributes'] : contentItem['frametrail:attributes'],
                            "tags": contentItem['frametrail:tags']
                        });
                        break;
                }

            }

            codeSnippets.globalEvents = hypervideos[hypervideoID].hypervideoData.globalEvents;
            codeSnippets.customCSS = hypervideos[hypervideoID].hypervideoData.customCSS;

        } catch (e) {
            console.log(e);
            return fail(labels['ErrorCouldNotLoadContentData']);
        }
        //console.log('overlays', overlays);
        //console.log('codeSnippets', codeSnippets);
        success();

    };



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


        var annotationsCount = Object.keys(hypervideo.annotationfiles).length;

        // clear previous data
        annotations  = [];


        for (var id in hypervideo.annotationfiles) {

            (function(id){

                _ajax({
                    url:      url + hypervideoID + '/annotations/' + id + '.json',
                    dataType: 'json'
                }, function (data) {

                    for (var i in data) {
                        annotations.push(_normalizeAnnotation(data[i], { frametrail: true, url: url }));
                    }


                    annotationsCount--;
                    if(annotationsCount === 0){

                        // all annotation data loaded from server
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
            if (!--countdown) success();
        }

        for (var i = 0, l = initAnnotations.length; i < l; i++) {

            if (typeof initAnnotations[i] === 'string') {

                _ajax({
                    url:      initAnnotations[i],
                    dataType: 'json'
                }, function (data) {

                    for (var i in data) {
                        annotations.push(_normalizeAnnotation(data[i], { frametrail: false, url: initAnnotations[i] }));
                    }

                    ready();


                }, function () {
                    fail(labels['ErrorMissingAnnotationFile']);
                });

            } else if (initAnnotations[i].url && initAnnotations[i].type) {

                // TODO git, dropbox ...
                // annotations.push(...)

            } else {

                for (var i in initAnnotations) {

                    var originalAnnoObject = initAnnotations[i];

                    //console.log('ORIGINAL 1: ', originalAnnoObject.body);

                    if (Array.isArray(initAnnotations[i].body)) {
                        initAnnotations[i].body = initAnnotations[i].body[0];
                    }

                    //console.log('ORIGINAL 2: ', originalAnnoObject.body);

                    annotations.push(_normalizeAnnotation(initAnnotations[i], { frametrail: false, url: originalAnnoObject }));

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
                    for (var i in data) {
                        annotations.push(_normalizeAnnotation(data[i], { frametrail: true, url: 'local' }));
                    }

                    annotationsCount--;
                    if (annotationsCount === 0) {
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

            hypervideo   = null;
            sequence     = {};
            annotations  = [];
            overlays     = [];
            codeSnippets = {};

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
     * I generate the JSON for hypervideo.json
     *
     * @method convertToDatabaseFormat
     * @return {Object}
     */
    function convertToDatabaseFormat (thisHypervideoID) {

        thisHypervideoID = thisHypervideoID || hypervideoID;

        return ({
            "meta": {
                "name": hypervideos[thisHypervideoID].name,
                "description": hypervideos[thisHypervideoID].description,
                "thumb": hypervideos[thisHypervideoID].thumb,
                "posterFrame": hypervideos[thisHypervideoID].posterFrame || null,
                "creator": hypervideos[thisHypervideoID].creator,
                "creatorId": hypervideos[thisHypervideoID].creatorId,
                "created": hypervideos[thisHypervideoID].created,
                "lastchanged": Date.now()
            },
            "config": {
                "slidingMode": hypervideos[thisHypervideoID].config.slidingMode,
                "slidingTrigger": hypervideos[thisHypervideoID].config.slidingTrigger,
                "autohideControls": hypervideos[thisHypervideoID].config.autohideControls,
                "captionsVisible": hypervideos[thisHypervideoID].config.captionsVisible,
                "clipTimeVisible": hypervideos[thisHypervideoID].config.clipTimeVisible,
                "hidden": hypervideos[thisHypervideoID].hidden,
                "theme": hypervideos[thisHypervideoID].config.theme || "",
                "layoutArea": (function () {
                    var layoutArea = (FrameTrail.module('ViewLayout') && FrameTrail.module('ViewLayout').getLayoutAreaData)
                        ? FrameTrail.module('ViewLayout').getLayoutAreaData()
                        : hypervideos[thisHypervideoID].config.layoutArea;

                    // Convert Transcript contentViews to CustomHTML so exports are self-contained
                    var areas = ['areaTop', 'areaBottom', 'areaLeft', 'areaRight'];
                    for (var a = 0; a < areas.length; a++) {
                        var areaKey = areas[a];
                        if (!layoutArea[areaKey]) continue;
                        for (var cv = 0; cv < layoutArea[areaKey].length; cv++) {
                            var cvData = layoutArea[areaKey][cv];
                            if (cvData.type === 'Transcript' && cvData.transcriptSource) {
                                var subs = subtitles[cvData.transcriptSource];
                                if (subs && subs.cues) {
                                    var html = '';
                                    for (var c = 0; c < subs.cues.length; c++) {
                                        var cue = subs.cues[c];
                                        html += '<span class="timebased" data-start="' + cue.startTime + '" data-end="' + cue.endTime + '">'
                                            + cue.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                            + ' </span>';
                                    }
                                    layoutArea[areaKey][cv] = {
                                        type: 'CustomHTML',
                                        name: cvData.name,
                                        icon: cvData.icon,
                                        cssClass: cvData.cssClass,
                                        html: html,
                                        collectionFilter: cvData.collectionFilter,
                                        contentSize: cvData.contentSize,
                                        onClickContentItem: cvData.onClickContentItem,
                                        initClosed: cvData.initClosed,
                                        filterAspect: cvData.filterAspect,
                                        zoomControls: cvData.zoomControls
                                    };
                                }
                            }
                        }
                    }

                    return layoutArea;
                })()
            },
            "clips": hypervideos[thisHypervideoID].clips,
            "globalEvents": (codeSnippets.globalEvents) ? codeSnippets.globalEvents : {},
            "customCSS": (codeSnippets.customCSS) ? codeSnippets.customCSS : "",
            "contents": (function () {
                var contents = [];
                for (var i in overlays) {
                    contents.push({
                        "@context": [
                            "http://www.w3.org/ns/anno.jsonld",
                            {
                                "frametrail": "http://frametrail.org/ns/"
                            }
                        ],
                        "creator": {
                            "nickname": overlays[i].creator,
                            "type": "Person",
                            "id": overlays[i].creatorId
                        },
                        "created": (new Date(overlays[i].created)).toString(),
                        "type": "Annotation",
                        "frametrail:type": "Overlay",
                        "frametrail:tags": overlays[i].tags || [],
                        "target": {
                            "type": "Video",
                            "source": FrameTrail.module('HypervideoModel').sourcePath,
                            "selector": {
                                "conformsTo": "http://www.w3.org/TR/media-frags/",
                                "type": "FragmentSelector",
                                "value":
                                    "t=" + overlays[i].start + "," + overlays[i].end
                                    + "&xywh=percent:"
                                    + overlays[i].position.left + ","
                                    + overlays[i].position.top + ","
                                    + overlays[i].position.width + ","
                                    + overlays[i].position.height
                            }
                        },
                        "body": {
                            "type": ({
                                        'image':     'Image',
                                        'video':     'Video',
                                        'location':  'Dataset',
                                        'wikipedia': 'Text',
                                        'text':      'TextualBody',
                                        'entity':    'Text',
                                        'quiz':      'TextualBody',
                                        'hotspot':   'TextualBody',
                                        'vimeo':     'Video',
                                        'webpage':   'Text',
                                        'youtube':   'Video',

                                        'wistia':    'Video',
                                        'soundcloud': 'Sound',
                                        'twitch':    'Video',
                                        'bluesky':   'Text',
                                        'codepen':   'Text',
                                        'figma':     'Image',
                                        'loom':      'Video',
                                        'urlpreview': 'Text',
                                        'xtwitter':  'Text',
                                        'tiktok':    'Video',
                                        'mastodon':  'Text',
                                        'spotify':   'Sound',
                                        'slideshare': 'Text',
                                        'reddit':    'Text',
                                        'flickr':    'Image'
                                    })[overlays[i].type],
                            "frametrail:type": overlays[i].type,
                            "format": ({
                                'image': 'image/' + (function () {
                                    try {
                                        return (overlays[i].src ? (/\.(\w{3,4})$/g.exec(overlays[i].src)[1]) : '*');
                                    } catch (_) {
                                        return '*';
                                    }
                                })(),
                                'video': 'video/mp4',
                                'location': 'application/x-frametrail-location',
                                'wikipedia': 'text/html',
                                'text': 'text/html',
                                'entity': 'text/html',
                                'quiz': 'text/html',
                                'hotspot': 'text/html',
                                'vimeo': 'text/html',
                                'webpage': 'text/html',
                                'youtube': 'text/html',

                                'wistia': 'text/html',
                                'soundcloud': 'text/html',
                                'twitch': 'text/html',
                                'bluesky': 'text/html',
                                'codepen': 'text/html',
                                'figma': 'text/html',
                                'loom': 'text/html',
                                'urlpreview': 'text/html',
                                'xtwitter': 'text/html',
                                'tiktok': 'text/html',
                                'mastodon': 'text/html',
                                'spotify': 'text/html',
                                'slideshare': 'text/html',
                                'reddit': 'text/html',
                                'flickr': 'text/html'
                            })[overlays[i].type],
                            "source": (function () {
                                if (['codesnippet', 'text', 'quiz', 'hotspot', 'entity', 'webpage', 'wikipedia',].indexOf( overlays[i].type ) < 0) {
                                    return overlays[i].src
                                }
                                return undefined;
                            })(),
                            "value": (function () {
                                if (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia',].indexOf( overlays[i].type ) >= 0) {
                                    return overlays[i].src
                                }
                                return undefined;
                            })(),
                            "frametrail:name": overlays[i].name,
                            "frametrail:thumb": overlays[i].thumb,
                            "frametrail:licenseType": overlays[i].licenseType,
                            "frametrail:licenseAttribution": overlays[i].licenseAttribution,
                            "selector": (function () {
                                if (   ['video', 'vimeo', 'youtube'].indexOf(overlays[i].type) >= 0
                                    && overlays[i].startOffset
                                    && overlays[i].endOffset
                                ) {
                                    return {
                                        "type": "FragmentSelector",
                                        "conformsTo": "http://www.w3.org/TR/media-frags/",
                                        "value": "t=" + overlays[i].startOffset + "," + overlays[i].endOffset
                                    }
                                } else {
                                    return undefined;
                                }
                            })(),
                            "frametrail:resourceId": overlays[i].resourceId,
                            "frametrail:attributes": overlays[i].attributes
                        },
                        "frametrail:events": overlays[i].events
                    });
                    //console.log(contents);
                    if (contents[contents.length-1].body['frametrail:type'] === 'location') {
                        var contentItem = contents[contents.length-1];
                        contentItem.body['frametrail:attributes'].lat = parseFloat(overlays[i].attributes.lat);
                        contentItem.body['frametrail:attributes'].lon = parseFloat(overlays[i].attributes.lon);
                        contentItem.body['frametrail:attributes'].boundingBox = (overlays[i].attributes.boundingBox) ?  overlays[i].attributes.boundingBox : [];
                    }
                }
                for (var i in codeSnippets.timebasedEvents) {
                    var codeSnippetItem = codeSnippets.timebasedEvents[i];
                    contents.push({
                        "@context": [
                              "http://www.w3.org/ns/anno.jsonld",
                              {
                                  "frametrail": "http://frametrail.org/ns/"
                              }
                        ],
                        "creator": {
                            "nickname": codeSnippetItem.creator,
                            "type": "Person",
                            "id": codeSnippetItem.creatorId
                         },
                        "created": (new Date(codeSnippetItem.created)).toString(),
                        "type": "Annotation",
                        "frametrail:type": "CodeSnippet",
                        "frametrail:tags": codeSnippetItem.tags,
                        "target": {
                            "type": "Video",
                            "source": FrameTrail.module('HypervideoModel').sourcePath,
                            "selector": {
                                "conformsTo": "http://www.w3.org/TR/media-frags/",
                                "type": "FragmentSelector",
                                "value": "t=" + codeSnippetItem.start
                            }
                          },
                        "body": {
                            "type": "TextualBody",
                            "frametrail:type": "codesnippet",
                            "format" : "text/javascript",
                            "value" : codeSnippetItem.snippet,
                            "frametrail:name": codeSnippetItem.name,
                            "frametrail:thumb": null,
                            "frametrail:resourceId": null,
                            "frametrail:attributes": codeSnippetItem.attributes
                        }
                    });
                }
                return contents;
            })(),
            "subtitles": hypervideos[thisHypervideoID].subtitles
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
            data:     { a: 'configChange', src: JSON.stringify(config, null, 4) }
        }, function (data) {
            if (data.code === 0) {
                callback.call(window, { success: true });
            } else {
                callback.call(window, { failed: 'config', error: data.string, code: data.code });
            }
        }, function (error) {
            callback.call(window, { failed: 'config', error: error });
        });

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
            data:     { a: 'globalCSSChange', src: styles }
        }, function (data) {
            if (data.code === 0) {
                callback.call(window, { success: true });
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
                .then(function() { callback.call(window, { success: true }); })
                .catch(function(error) { callback.call(window, { failed: 'hypervideo', error: error.message }); });
            return;
        }

        _ajax({
            type:     'POST',
            url:      '_server/ajaxServer.php',
            dataType: 'json',
            data:     { a: 'hypervideoChange', hypervideoID: thisHypervideoID, src: JSON.stringify(saveData, null, 4) }
        }, function (data) {
            if (data.code === 0) {
                callback.call(window, { success: true });
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
        return {
            "@context": [
                "http://www.w3.org/ns/anno.jsonld",
                { "frametrail": "http://frametrail.org/ns/" }
            ],
            "creator": {
                "nickname": annotationItem.creator,
                "type": "Person",
                "id": annotationItem.creatorId
            },
            "created": (new Date(annotationItem.created)).toString(),
            "type": "Annotation",
            "frametrail:type": "Annotation",
            "frametrail:tags": annotationItem.tags || [],
            "frametrail:uri": annotationItem.uri || null,
            "target": {
                "type": "Video",
                "source": FrameTrail.module('HypervideoModel').sourcePath,
                "selector": {
                    "conformsTo": "http://www.w3.org/TR/media-frags/",
                    "type": "FragmentSelector",
                    "value": "t=" + annotationItem.start + "," + annotationItem.end
                }
            },
            "body": {
                "type": ({
                    'image': 'Image',
                    'video': 'Video',
                    'location': 'Dataset',
                    'wikipedia': 'Text',
                    'text': 'TextualBody',
                    'entity': 'Text',
                    'quiz': 'TextualBody',
                    'vimeo': 'Video',
                    'webpage': 'Text',
                    'youtube': 'Video'
                })[annotationItem.type],
                "frametrail:type": annotationItem.type,
                "format": ({
                    'image': 'image/' + (function () {
                        try {
                            return (annotationItem.src ? (/\.(\w{3,4})$/g.exec(annotationItem.src)[1]) : '*')
                        } catch (_) {
                            return '*';
                        }
                    })(),
                    'video': 'video/mp4',
                    'location': 'application/x-frametrail-location',
                    'wikipedia': 'text/html',
                    'text': 'text/html',
                    'entity': 'text/html',
                    'quiz': 'text/html',
                    'vimeo': 'text/html',
                    'webpage': 'text/html',
                    'youtube': 'text/html'
                })[annotationItem.type],
                "source": (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia'].indexOf(annotationItem.type) < 0)
                    ? annotationItem.src : undefined,
                "value": (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia'].indexOf(annotationItem.type) >= 0)
                    ? annotationItem.src : undefined,
                "frametrail:name": annotationItem.name,
                "frametrail:thumb": annotationItem.thumb,
                "frametrail:licenseType": annotationItem.licenseType,
                "frametrail:licenseAttribution": annotationItem.licenseAttribution,
                "selector": (
                    ['video', 'vimeo', 'youtube'].indexOf(annotationItem.type) >= 0
                    && annotationItem.startOffset
                    && annotationItem.endOffset
                ) ? {
                    "type": "FragmentSelector",
                    "conformsTo": "http://www.w3.org/TR/media-frags/",
                    "value": "t=" + annotationItem.startOffset + "," + annotationItem.endOffset
                } : undefined,
                "frametrail:resourceId": annotationItem.resourceId,
                "frametrail:attributes": annotationItem.attributes
            }
        };
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
            action              = 'save'; //= annotations.hasOwnProperty(userID)
                                //    ? 'save'
                                //    : 'saveAs',

            name                = FrameTrail.getState('username'),
            description         = FrameTrail.getState('username') + '\'s annotations',
            hidden              = false;

            annotationsToSave   = [];


        for (var i in annotations) {
            var annotationItem = annotations[i];

            if (!annotationItem.source.frametrail || annotationItem.creatorId !== userID) {
                continue;
            }

            annotationsToSave.push(_annotationToW3C(annotationItem));

        }

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
                    index[userID] = {
                        name: name,
                        description: description,
                        hidden: hidden,
                        src: userID + '.json'
                    };
                    return adapter.writeJSON(indexPath, index);
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


        getIdOfResource:       getIdOfResource,
        getIdOfHypervideo:     getIdOfHypervideo,

        loadData:              loadData,
        loadResourceData:      loadResourceData,
        loadConfigData:        loadConfigData,

        loadHypervideoData:    loadHypervideoData,
        updateHypervideoData:  updateHypervideoData,
        loadSequenceData:      loadSequenceData,
        loadSubtitleData:      loadSubtitleData,

        saveHypervideo:        saveHypervideo,
        saveAnnotations:       saveAnnotations,
        getAnnotationsW3C:     getAnnotationsW3C,
        saveConfig:            saveConfig,
        saveGlobalCSS:         saveGlobalCSS,

        //TODO only shortcut for now
        convertToDatabaseFormat: convertToDatabaseFormat

    }



});
