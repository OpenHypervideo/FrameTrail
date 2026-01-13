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
     * I load the config data (_data/config.json) from the server
     * and save the data in my attribute {{#crossLink "Database/config:attribute"}}Database/config{{/crossLink}}.
     * I call my success or fail callback respectively.
     *
     * @method loadConfigData
     * @param {Function} success
     * @param {Function} fail
     */
    function loadConfigData(success, fail) {

        var configInitOptions = FrameTrail.getState('config');

        if (typeof configInitOptions === 'object' && configInitOptions !== null) {

            config = configInitOptions;
            FrameTrail.changeState('config', config);

            // TODO: Check if this makes sense here
            if (config.theme) {
                $(FrameTrail.getState('target')).attr('data-frametrail-theme', config.theme);
            } else {
                $(FrameTrail.getState('target')).attr('data-frametrail-theme', '');
            }

            return success.call(this);

        }

        $.ajax({
            type:   "GET",
            url:    configInitOptions || ('_data/config.json'),
            cache:  (config.allowCaching) ? config.allowCaching : false,
            dataType: "json",
            mimeType: "application/json"
        }).done(function(data){

            config = data;
            FrameTrail.changeState('config', config);

            // TODO: Check if this makes sense here
            if (config.theme) {
                $(FrameTrail.getState('target')).attr('data-frametrail-theme', config.theme);
            } else {
                $(FrameTrail.getState('target')).attr('data-frametrail-theme', '');
            }

            success.call(this);

        }).fail(function(){

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

        var initOptionsResources = FrameTrail.getState('resources'),
            countdown = initOptionsResources.length;

        for (var i = 0, l = countdown; i < l; i++) {

            if (initOptionsResources[i].type === 'frametrail') {

                if (typeof initOptionsResources[i].data === 'string') {

                    $.ajax({
                        type:   "GET",
                        url:    initOptionsResources[i].data,
                        cache:  (config.allowCaching) ? config.allowCaching : false,
                        dataType: "json",
                        mimeType: "application/json"
                    }).done(function(data){
                        resources = Object.assign(resources, data.resources);
                        //console.log('resources', resources);
                        ready();
                    }).fail(function(){
                        fail(labels['ErrorNoResourcesIndexFile']);
                    });

                } else if (typeof initOptionsResources[i].data === 'object' && initOptionsResources[i].data !== null) {

                    resources = Object.assign(resources, initOptionsResources[i].data);
                    ready();

                }
                
                

            } else if (initOptionsResources[i].type === 'iiif') {

                // TODO
                ready();

            } else {
                fail(labels['ErrorUnknownResourceDataEndpoint']);
            }

            function ready() {
                if (--countdown === 0) {
                    success.call(this);
                    //console.log('resources', resources);
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

        } else if (!FrameTrail.module('RouteNavigation').environment.server) {

            $.ajax({
                type:   "GET",
                url:    ('_data/users.json'),
                cache:  (config.allowCaching) ? config.allowCaching : false,
                dataType: "json",
                mimeType: "application/json"
            }).done(function(data){

                users = data.user;
                //console.log('users', users);
                success.call(this);

            }).fail(function(){

                fail(labels['ErrorNoUserIndexFile']);
                success.call(this);

            });
        } else {

            $.ajax({

                type:   "POST",
                url:    ('_server/ajaxServer.php'),
                cache:  (config.allowCaching) ? config.allowCaching : false,
                dataType: "json",
                mimeType: "application/json",
                data:   {
                    a: 'userGet'
                }

            }).done(function(data){

                if (!data.response) {
                    console.error(labels['ErrorNoUserIndexFile']);
                    success.call(this);
                    return;
                }

                users = data.response.user;
                //console.log('users', users);
                success.call(this);

            }).fail(function(){

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

        var initOptionsHypervideoData = FrameTrail.getState('contents');

        if (!initOptionsHypervideoData) {

            loadHypervideoData_FrametrailServer('_data/hypervideos/', success, fail);

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

        $.ajax({
            type:   "GET",
            url:    urlpath + '_index.json',
            cache:  (config.allowCaching) ? config.allowCaching : false,
            dataType: "json",
            mimeType: "application/json"
        }).done(function(data){


            var countdown = Object.keys(data.hypervideos).length,
                bufferedData = {};

            // TODO: fix server object / array php problem
            if ( Array.isArray(data.hypervideos) || countdown == 0 ) {
                success.call(this);
                return;
            }

            for (var key in data.hypervideos) {
                (function (hypervideoID) {

                    $.ajax({
                        type:   "GET",
                        url:    (urlpath + data.hypervideos[hypervideoID] + '/hypervideo.json'),
                        cache:  (config.allowCaching) ? config.allowCaching : false,
                        dataType: "json",
                        mimeType: "application/json"
                    }).done(function (hypervideoData) {

                        $.ajax({
                            type:   "GET",
                            url:    (urlpath + data.hypervideos[hypervideoID] + '/annotations/_index.json'),
                            cache:  (config.allowCaching) ? config.allowCaching : false,
                            dataType: "json",
                            mimeType: "application/json"
                        }).done(function (annotationsIndex) {

                                bufferedData[hypervideoID] = {
                                    "name": hypervideoData.meta.name,
                                    "description": hypervideoData.meta.description,
                                    "thumb": hypervideoData.meta.thumb,
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
                                delete bufferedData[hypervideoID].config.hidden;

                                if (!--countdown) {
                                    next();
                                }

                            }).fail(function () {
                                fail(labels['ErrorNoAnnotationsIndexFile']);
                            });

                    }).fail(function () {
                        fail(labels['ErrorNoHypervideoJSONFile']);
                    });

                })(key);
            }


            function next() {

                hypervideos = bufferedData;
                //console.log('hypervideo', hypervideos[hypervideoID]);
                success.call(this);

            }

        }).fail(function(){

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

        $.ajax({
            type:   "GET",
            url:    url,
            cache:  (config.allowCaching) ? config.allowCaching : false,
            dataType: "json",
            mimeType: "application/json"
        }).done(function (hypervideoData) {

            hypervideos[id] = {
                "name": hypervideoData.meta.name,
                "description": hypervideoData.meta.description,
                "thumb": hypervideoData.meta.thumb,
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

        }).fail(function(){
            fail(labels['ErrorNoHypervideoJSONFile']);
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
                            "start": parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(contentItem.target.selector.value)[1]),
                            "end": parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(contentItem.target.selector.value)[2]),
                            "startOffset": (contentItem.body.selector && contentItem.body.selector.value)
                                            ? parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(contentItem.body.selector.value)[1])
                                            : 0,
                            "endOffset": (contentItem.body.selector && contentItem.body.selector.value)
                                            ? parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(contentItem.body.selector.value)[2])
                                            : 0,
                            "attributes": (contentItem.body["frametrail:attributes"]) ? contentItem.body["frametrail:attributes"] : contentItem["frametrail:attributes"],
                            "position": (function () {
                                if (!contentItem.target.selector) { return {}; }
                                try {
                                    var match = /xywh=percent:(\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*)/g
                                                .exec(contentItem.target.selector.value);
                                    return {
                                        "top": parseFloat(match[2]),
                                        "left": parseFloat(match[1]),
                                        "width": parseFloat(match[3]),
                                        "height": parseFloat(match[4])
                                    };
                                } catch (_) { return {}; }
                            })(),
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
                            "start": parseFloat(/t=(\d+\.?\d*)/g.exec(contentItem.target.selector.value)[1]),
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

                $.ajax({
                    type: "GET",
                    url: (url + hypervideoID + '/annotations/' + id + '.json'),
                    cache: (config.allowCaching) ? config.allowCaching : false,
                    dataType: "json",
                    mimeType: "application/json"
                }).done(function(data){

                    for (var i in data) {

                        annotations.push({
                            "name": data[i].body['frametrail:name'],
                            "creator": data[i].creator.nickname,
                            "creatorId": data[i].creator.id,
                            "created": (new Date(data[i].created)).getTime(),
                            "type": data[i].body['frametrail:type'],
                            "uri": (function () {
                                        if (data[i]["frametrail:uri"]) { 
                                            return data[i]["frametrail:uri"]; 
                                        } else if (data[i].body["frametrail:type"] == 'entity') {
                                            return data[i].body.source
                                        } else {
                                            return null;
                                        }
                                    })(),
                            "src": (function () {
                                        if (data[i].body["frametrail:type"] === 'location') { return null; }
                                        return (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia'].indexOf( data[i].body["frametrail:type"] ) >= 0)
                                                ? data[i].body.value
                                                : data[i].body.source
                                    })(),
                            "thumb": data[i].body['frametrail:thumb'],
                            "start": parseFloat(/t=(\d+\.?\d*)/g.exec(data[i].target.selector.value)[1]),
                            "end": parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(data[i].target.selector.value)[2]),
                            "resourceId": data[i].body["frametrail:resourceId"],
                            "attributes": data[i].body['frametrail:attributes'] || {},
                            "tags": data[i]['frametrail:tags'],
                            "source": {
                                frametrail: true,
                                url: url
                            },
                            "graphData": (data[i]['frametrail:graphdata']) ? data[i]['frametrail:graphdata'] : null,
                            "graphDataType": (data[i]['frametrail:graphdatatype']) ? data[i]['frametrail:graphdatatype'] : null,
                        });

                        if (annotations[annotations.length-1].type === 'location') {
                            var locationAttributes = annotations[annotations.length-1].attributes;
                            locationAttributes.lat = parseFloat(data[i].body['frametrail:attributes'].lat);
                            locationAttributes.lon = parseFloat(data[i].body['frametrail:attributes'].lon);
                            locationAttributes.boundingBox = data[i].body['frametrail:attributes'].boundingBox;
                        }

                        if (annotations[annotations.length-1].type === 'video') {
                            var annotationItem = annotations[annotations.length-1];
                            annotationItem.startOffset = (data[i].body.selector && data[i].body.selector.value)
                                                         ? parseFloat(/t=(\d+)/g.exec(data[i].body.selector.value)[1])
                                                         : 0;
                            annotationItem.endOffset = (data[i].body.selector && data[i].body.selector.value)
                                                        ? parseFloat(/t=(\d+\.?\d*)/g.exec(data[i].body.selector.value)[2])
                                                        : 0;
                        }

                    }


                    annotationsCount--;
                    if(annotationsCount === 0){

                        // all annotation data loaded from server
                        success.call(this);

                    }


                }).fail(function() {

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

        if (!initAnnotations) {
            success();
        }

        var countdown = initAnnotations.length;
        function ready() {
            if (!--countdown) success();
        }

        for (var i = 0, l = initAnnotations.length; i < l; i++) {

            if (typeof initAnnotations[i] === 'string') {

                $.ajax({
                    type: "GET",
                    url: initAnnotations[i],
                    cache: (config.allowCaching) ? config.allowCaching : false,
                    dataType: "json",
                    mimeType: "application/json"
                }).done(function(data){

                    for (var i in data) {

                        annotations.push({
                            "name": data[i].body['frametrail:name'],
                            "creator": data[i].creator.nickname,
                            "creatorId": data[i].creator.id,
                            "created": (new Date(data[i].created)).getTime(),
                            "type": data[i].body['frametrail:type'],
                            "uri": (function () {
                                        if (data[i]["frametrail:uri"]) { 
                                            return data[i]["frametrail:uri"]; 
                                        } else if (data[i].body["frametrail:type"] == 'entity') {
                                            return data[i].body.source
                                        } else {
                                            return null;
                                        }
                                    })(),
                            "src": (function () {
                                        if (data[i].body["frametrail:type"] === 'location') { return null; }
                                        return (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia',].indexOf( data[i].body["frametrail:type"] ) >= 0)
                                                ? data[i].body.value
                                                : data[i].body.source
                                    })(),
                            "thumb": data[i].body['frametrail:thumb'],
                            "start": parseFloat(/t=(\d+\.?\d*)/g.exec(data[i].target.selector.value)[1]),
                            "end": parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(data[i].target.selector.value)[2]),
                            "resourceId": data[i].body["frametrail:resourceId"],
                            "attributes": data[i].body['frametrail:attributes'] || {},
                            "tags": data[i]['frametrail:tags'],
                            "source": {
                                frametrail: false,
                                url: initAnnotations[i]
                            },
                            "graphData": (data[i]['frametrail:graphdata']) ? data[i]['frametrail:graphdata'] : null,
                            "graphDataType": (data[i]['frametrail:graphdatatype']) ? data[i]['frametrail:graphdatatype'] : null
                        });

                        if (annotations[annotations.length-1].type === 'location') {
                            var locationAttributes = annotations[annotations.length-1].attributes;
                            locationAttributes.lat = parseFloat(data[i].body['frametrail:attributes'].lat);
                            locationAttributes.lon = parseFloat(data[i].body['frametrail:attributes'].lon);
                            locationAttributes.boundingBox = data[i].body['frametrail:attributes'].boundingBox;
                        }

                        if (annotations[annotations.length-1].type === 'video') {
                            var annotationItem = annotations[annotations.length-1];
                            annotationItem.startOffset = (data[i].body.selector && data[i].body.selector.value)
                                                         ? parseFloat(/t=(\d+)/g.exec(data[i].body.selector.value)[1])
                                                         : 0;
                            annotationItem.endOffset = (data[i].body.selector && data[i].body.selector.value)
                                                        ? parseFloat(/t=(\d+\.?\d*)/g.exec(data[i].body.selector.value)[2])
                                                        : 0;
                        }

                    }

                    ready();


                }).fail(function() {

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

                    annotations.push({
                        "name": initAnnotations[i].body['frametrail:name'],
                        "creator": initAnnotations[i].creator.nickname,
                        "creatorId": initAnnotations[i].creator.id,
                        "created": (new Date(initAnnotations[i].created)).getTime(),
                        "type": initAnnotations[i].body['frametrail:type'],
                        "uri": (function () {
                                        if (initAnnotations[i]["frametrail:uri"]) { 
                                            return initAnnotations[i]["frametrail:uri"]; 
                                        } else if (initAnnotations[i].body["frametrail:type"] == 'entity') {
                                            return initAnnotations[i].body.source
                                        } else {
                                            return null;
                                        }
                                    })(),
                        "src": (function () {
                                    if (initAnnotations[i].body["frametrail:type"] === 'location') { return null; }
                                    return (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia',].indexOf( initAnnotations[i].body["frametrail:type"] ) >= 0)
                                            ? initAnnotations[i].body.value
                                            : initAnnotations[i].body.source
                                })(),
                        "thumb": initAnnotations[i].body['frametrail:thumb'],
                        "start": parseFloat(/t=(\d+\.?\d*)/g.exec(initAnnotations[i].target.selector.value)[1]),
                        "end": parseFloat(/t=(\d+\.?\d*),(\d+\.?\d*)/g.exec(initAnnotations[i].target.selector.value)[2]),
                        "resourceId": initAnnotations[i].body["frametrail:resourceId"],
                        "attributes": initAnnotations[i].body['frametrail:attributes'] || {},
                        "tags": initAnnotations[i]['frametrail:tags'],
                        "source": {
                            frametrail: false,
                            url: originalAnnoObject
                        },
                        "graphData": (initAnnotations[i]['frametrail:graphdata']) ? initAnnotations[i]['frametrail:graphdata'] : null,
                        "graphDataType": (initAnnotations[i]['frametrail:graphdatatype']) ? initAnnotations[i]['frametrail:graphdatatype'] : null
                    });

                    if (annotations[annotations.length-1].type === 'location') {
                        var locationAttributes = annotations[annotations.length-1].attributes;
                        locationAttributes.lat = parseFloat(initAnnotations[i].body['frametrail:attributes'].lat);
                        locationAttributes.lon = parseFloat(initAnnotations[i].body['frametrail:attributes'].lon);
                        locationAttributes.boundingBox = initAnnotations[i].body['frametrail:attributes'].boundingBox;
                    }

                    if (annotations[annotations.length-1].type === 'video') {
                        var annotationItem = annotations[annotations.length-1];
                        annotationItem.startOffset = (initAnnotations[i].body.selector && initAnnotations[i].body.selector.value)
                                                     ? parseFloat(/t=(\d+)/g.exec(initAnnotations[i].body.selector.value)[1])
                                                     : 0;
                        annotationItem.endOffset = (initAnnotations[i].body.selector && initAnnotations[i].body.selector.value)
                                                    ? parseFloat(/t=(\d+\.?\d*)/g.exec(initAnnotations[i].body.selector.value)[2])
                                                    : 0;
                    }

                    ready();

                }


            }



        }


    };









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

            for (var i = 0; i < hypervideo.subtitles.length; i++) {

                (function(i){

                    var currentSubtitles = hypervideo.subtitles[i];

                    $.ajax({

                        type: "GET",
                        url: ('_data/hypervideos/' + hypervideoID + '/subtitles/' + currentSubtitles.src),
                        cache: (config.allowCaching) ? config.allowCaching : false

                    }).done(function(data){

                        var parsedCues = [];

                        // parse webvtt contents
                        var parser = new WebVTT.Parser(window, WebVTT.StringDecoder());
                        parser.onregion = function(region) {};
                        parser.oncue = function(cue) {
                            parsedCues.push(cue);
                        };
                        parser.onparsingerror = function(e) {
                            console.log(e);
                        };
                        parser.parse(data);
                        parser.flush();

                        var langLabel;
                        if (subtitlesLangMapping[currentSubtitles.srclang]) {
                            langLabel = subtitlesLangMapping[currentSubtitles.srclang];
                        } else {
                            langLabel = currentSubtitles.srclang;
                        }

                        // write parsed contents in subtitles var
                        subtitles[currentSubtitles.srclang] = {};
                        subtitles[currentSubtitles.srclang]['label'] = langLabel;
                        subtitles[currentSubtitles.srclang]['cues'] = parsedCues;

                        subtitleCount--;
                        if(subtitleCount === 0){

                            // all subtitle data loaded from server
                            success.call(this);

                        }


                    }).fail(function() {

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
                "layoutArea": FrameTrail.module('ViewLayout').getLayoutAreaData()
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
                                        'youtube':   'Video'
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
                                'youtube': 'text/html'
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

        $.ajax({
            type:   'POST',
            url:    '_server/ajaxServer.php',
            cache:  (config.allowCaching) ? config.allowCaching : false,

            data: {
                a:              'configChange',
                src:            JSON.stringify(config, null, 4)
            }

        }).done(function(data) {

            if (data.code === 0) {

                callback.call(window, { success: true });

            } else {

                callback.call(window, {
                    failed: 'config',
                    error: data.string,
                    code: data.code
                });

            }

        }).fail(function(error){

            callback.call(window, {
                failed: 'config',
                error: error
            });

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

        var styles = $('head > style.FrameTrailGlobalCustomCSS').html();

        $.ajax({
            type:   'POST',
            url:    '_server/ajaxServer.php',
            cache:  (config.allowCaching) ? config.allowCaching : false,

            data: {
                a:              'globalCSSChange',
                src:            styles
            }

        }).done(function(data) {

            if (data.code === 0) {

                callback.call(window, { success: true });

            } else {

                callback.call(window, {
                    failed: 'globalcss',
                    error: 'ServerError',
                    code: data.code
                });

            }

        }).fail(function(error){

            callback.call(window, {
                failed: 'globalcss',
                error: error
            });

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

        $.ajax({
            type:   'POST',
            url:    '_server/ajaxServer.php',
            cache:  (config.allowCaching) ? config.allowCaching : false,

            data: {
                a:              'hypervideoChange',
                hypervideoID:   thisHypervideoID,
                src:            JSON.stringify(saveData, null, 4)
            }

        }).done(function(data) {

            if (data.code === 0) {

                callback.call(window, { success: true });

            } else {

                callback.call(window, {
                    failed: 'hypervideo',
                    error: 'ServerError',
                    code: data.code
                });

            }

        }).fail(function(error){

            callback.call(window, {
                failed: 'hypervideo',
                error: error
            });

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

            annotationsToSave.push({
        		"@context": [
        			"http://www.w3.org/ns/anno.jsonld",
        			{
        				"frametrail": "http://frametrail.org/ns/"
        			}
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
                    "source": (function () {
                        if (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia',].indexOf( annotationItem.type ) < 0) {
                            return annotationItem.src
                        }
                        return undefined;
                    })(),
                    "value": (function () {
                        if (['codesnippet', 'text', 'quiz', 'entity', 'webpage', 'wikipedia',].indexOf( annotationItem.type ) >= 0) {
                            return annotationItem.src
                        }
                        return undefined;
                    })(),
                    "frametrail:name": annotationItem.name,
                    "frametrail:thumb": annotationItem.thumb,
                    "selector": (function () {
                        if (   ['video', 'vimeo', 'youtube'].indexOf(annotationItem.type) >= 0
                            && annotationItem.startOffset
                            && annotationItem.endOffset
                        ) {
                            return {
                                "type": "FragmentSelector",
                                "conformsTo": "http://www.w3.org/TR/media-frags/",
                                "value": "t=" + annotationItem.startOffset + "," + annotationItem.endOffset
                            }
                        } else {
                            return undefined;
                        }
                    })(),
                    "frametrail:resourceId": annotationItem.resourceId,
                    "frametrail:attributes": annotationItem.attributes
        		}
            });
            if (annotationsToSave[annotationsToSave.length-1].body['frametrail:type'] === 'location') {
                var annotationBody = annotationsToSave[annotationsToSave.length-1].body;
                // do nothing
            }

        }

        //console.log(annotationsToSave);

        $.ajax({
            type:   'POST',
            url:    '_server/ajaxServer.php',
            cache:  (config.allowCaching) ? config.allowCaching : false,

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

        }).done(function(data) {

            if (data.code === 0) {

                callback.call(window, { success: true });

            } else {

                callback.call(window, {
                    failed: 'annotations',
                    error: 'ServerError',
                    code: data.code
                });

            }

        }).fail(function(error){

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
        saveConfig:            saveConfig,
        saveGlobalCSS:         saveGlobalCSS,

        //TODO only shortcut for now
        convertToDatabaseFormat: convertToDatabaseFormat

    }



});
