
(function(){


    var defs_modules = {},
        defs_types   = {},

        instances    = [];

    window.FrameTrail = {
        version:        '__FRAMETRAIL_VERSION__',

        defineModule:   _defineModule,
        defineType:     _defineType,
        init:           _init,
        autoInit:       _autoInit,

        getActiveInstance: null,
        setActiveInstance: null,
        get instances() { return instances; }
    };

    window.FrameTrail_L10n = {};

    function _defineModule(name, definition) {

        if (typeof definition !== 'function') {
            throw new Error('Module definition must be a function object, which returns a public interface.');
        }

        defs_modules[name] = definition;

    }

    /**
     * Scan the document (or a subtree) for <video data-frametrail> elements and
     * initialise a FrameTrail player around each one.
     *
     * Supported data attributes on the <video> element:
     *   data-frametrail-annotations  — URL of a W3C annotations JSON file
     *   data-frametrail-language     — language code; maps to config.defaultLanguage
     *   data-frametrail-config       — inline JSON config object
     *   data-frametrail-datapath     — base URL for _data/ (maps to dataPath option)
     *   data-frametrail-server       — base URL for _server/ (maps to server option)
     *
     * @method autoInit
     * @param {Element|Document} [scope]  Optional root element to search within (default: document)
     */
    function _autoInit(scope) {
        var root   = scope || document;
        var videos = root.querySelectorAll('video[data-frametrail]');

        for (var i = 0; i < videos.length; i++) {
            (function (video) {
                var annotations = video.getAttribute('data-frametrail-annotations') || null;
                var langAttr    = video.getAttribute('data-frametrail-language');
                var configAttr  = video.getAttribute('data-frametrail-config');
                var config      = configAttr ? JSON.parse(configAttr) : {};

                if (langAttr) {
                    if (!config) { config = {}; }
                    config.defaultLanguage = langAttr;
                }

                // No target provided — _start() will auto-create the wrapper div
                _init({
                    videoElement: video,
                    annotations:  annotations,
                    config:       config,
                    dataPath:     video.getAttribute('data-frametrail-datapath') || null,
                    server:       video.getAttribute('data-frametrail-server')   || null
                });
            })(videos[i]);
        }
    }


    function _defineType(name, definition) {

        if (typeof definition !== 'function') {
            throw new Error('Type definition must be a function object, which returns type definition { parent constructor proto }.');
        }

        defs_types[name] = definition;

    }


    function _init(options, appName) {

        var FrameTrail = {
            start:          _start,
            initModule:     _initModule,
            unloadModule:   _unloadModule,
            modules:        _modules,
            module:         _module,
            getState:       _getState,
            changeState:    _changeState,
            get types()     { return types },
            type:           _type,
            newObject:      _newObject,
            triggerEvent:   triggerEvent,
            addEventListener: addEventListener,
            removeEventListener: removeEventListener
        };

        var state           = {},
            modules         = {},
            types           = {},
            updateQueue     = [],
            inUpdateThread  = false,
            listeners       = {};



        _initTypes();
        _start(options, appName);


        function _start(runtimeConfig, appName) {

            // Auto-wrap: if videoElement is provided without an explicit target,
            // create a wrapper div immediately before the video element and use it
            // as the target. This keeps the video in the normal document flow until
            // ViewVideo adopts it into the player structure.
            var resolvedTarget = options.target;
            if (!resolvedTarget && options.videoElement) {
                var _el = (typeof options.videoElement === 'string')
                    ? document.querySelector(options.videoElement)
                    : options.videoElement;
                if (_el && _el.parentNode) {
                    var _wrapper = document.createElement('div');
                    // Give the wrapper a unique ID so it can be referenced as a
                    // CSS selector string (state.target must be a selector string
                    // because modules use document.querySelector(getState('target'))).
                    var _wrapperId = 'frametrail-wrap-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
                    _wrapper.id = _wrapperId;
                    // Mirror the video element's computed dimensions so the wrapper
                    // is a seamless in-flow replacement (same footprint in the document
                    // flow). display is intentionally not copied — .frametrail-body CSS
                    // sets display:flex which is required for the player layout.
                    var _cs = window.getComputedStyle(_el);
                    _wrapper.style.width  = _cs.width;
                    _wrapper.style.height = _cs.height;
                    _el.parentNode.insertBefore(_wrapper, _el);
                    resolvedTarget = '#' + _wrapperId;
                }
            }

            if (!resolvedTarget) resolvedTarget = 'body';

            var _targetEl = (typeof resolvedTarget === 'string') ? document.querySelector(resolvedTarget) : resolvedTarget;
            if (_targetEl) _targetEl.classList.add('frametrail-body');

            state = {
                target:             resolvedTarget,
                fullscreenTarget:   options.fullscreenTarget || null,
                contentTargets:     options.contentTargets || {},
                contents:           options.contents !== undefined ? options.contents : null,
                startID:            options.startID,
                resources:          options.resources !== undefined ? options.resources : null,
                tagdefinitions:     options.tagdefinitions,
                config:             options.config,
                users:              options.users,
                videoSource:        options.videoSource  || null,
                videoElement:       options.videoElement || null,
                annotations:        options.annotations  || null,
                dataPath:           options.dataPath     || null,
                server:             options.server       || null,

                loggedIn:           false,
                username:           '',
                viewMode:           'video',
                editMode:           false,
                slidePosition:      'middle',
                sidebarOpen:        false,
                fullscreen:         false,
                viewSize:           [0,0],
                unsavedChanges:     false
            };

            // dataPath and server are stored in state. RouteNavigation.resolveDataURL()
            // and resolveServerURL() use them when building fetch URLs (see RouteNavigation module).

            // Register event handlers passed via the events init option
            // (e.g. { events: { onPlay: fn, onUserAction: fn } } or { events: { play: fn } })
            if (options.events) {
                for (var eventHandlerName in options.events) {
                    if (typeof options.events[eventHandlerName] !== 'function') { continue; }
                    var eventType = (eventHandlerName.indexOf('on') === 0 && eventHandlerName.length > 2)
                        ? eventHandlerName.charAt(2).toLowerCase() + eventHandlerName.slice(3)
                        : eventHandlerName;
                    addEventListener(eventType, options.events[eventHandlerName]);
                }
            }

            if (appName) {
                _initModule(appName);
            } else {
                _initModule('PlayerLauncher');
            }

        }


        var publicInstanceAPI = {

            startEditing: function(){
                FrameTrail.module('UserManagement').ensureAuthenticated(
                    function(){
                        FrameTrail.changeState('editMode', 'preview');
                    },
                    function(){ /* Start edit mode canceled */ }
                );
            },

            stopEditing: function(){
                FrameTrail.module('HypervideoModel').leaveEditMode();
            },

            saveAs: function(){
                if (FrameTrail.module('HypervideoModel')) {
                    FrameTrail.module('HypervideoModel').saveAs();
                }
            },

            export: function(options){

                options = options || {};

                if (!FrameTrail.module('HypervideoModel')) {
                    return Promise.reject(new Error('No hypervideo loaded'));
                }

                var format          = options.format || 'html',
                    downloadAdapter = FrameTrail.module('StorageManager').getDownloadAdapter(),
                    hypervideoID    = options.hypervideoID || FrameTrail.module('RouteNavigation').hypervideoID;

                downloadAdapter._frameTrailInstance = FrameTrail;

                if (format === 'html') {
                    var resolvedDataURL = FrameTrail.module('RouteNavigation').resolveDataURL(''),
                        dataPath        = new URL(resolvedDataURL, window.location.href).href;
                    downloadAdapter._generateStandaloneHTML(hypervideoID, dataPath);
                    return Promise.resolve();
                }

                if (format === 'json') {
                    downloadAdapter._performDownload(hypervideoID);
                    return Promise.resolve();
                }

                if (format === 'zip') {
                    if (!options.includeMedia) {
                        downloadAdapter._performZipDownload({ allHv: true, resources: true, config: true });
                        return Promise.resolve();
                    }
                    if (!FrameTrail.module('StorageManager').canSaveToServer()) {
                        return Promise.reject(new Error('Media files can only be exported in server mode by a logged-in user'));
                    }
                    return _exportServerZip();
                }

                return Promise.reject(new Error('Unknown export format: ' + format));

            },

            destroy: function () {
                var thisInstanceIndex = instances.indexOf(publicInstanceAPI),
                    thisDOMElement = document.querySelector(state.target);
                
                if (thisDOMElement) {
                    thisDOMElement.parentNode.removeChild(thisDOMElement);
                }
                
                instances.splice(thisInstanceIndex, 1);
            },

            play: function() { (FrameTrail.module('HypervideoController')) ? FrameTrail.module('HypervideoController').play() : null },
            pause: function() { (FrameTrail.module('HypervideoController')) ? FrameTrail.module('HypervideoController').pause() : null },

            get duration()    { return FrameTrail.module('HypervideoModel').duration },
            get currentTime() { return FrameTrail.module('HypervideoController').currentTime },
            set currentTime(aNumber) { return FrameTrail.module('HypervideoController').currentTime = aNumber },

            onReady:            function (handler) { addEventListener('ready', handler) },
            onTimeupdate:       function (handler) { addEventListener('timeupdate', handler) },
            onSeeking:          function (handler) { addEventListener('seeking', handler) },
            onSeeked:           function (handler) { addEventListener('seeked', handler) },
            onPlay:             function (handler) { addEventListener('play', handler) },
            onPlaying:          function (handler) { addEventListener('playing', handler) },
            onPause:            function (handler) { addEventListener('pause', handler) },
            onEnded:            function (handler) { addEventListener('ended', handler) },
            onTimelineEvent:    function (handler) { addEventListener('timelineEvent', handler) },
            onUserAction:       function (handler) { addEventListener('userAction', handler) },
            onOverlayClick:     function (handler) { addEventListener('overlayClick', handler) },
            onQuizAnswered:     function (handler) { addEventListener('quizAnswered', handler) },
            onAnnotationOpened: function (handler) { addEventListener('annotationOpened', handler) },
            on: addEventListener,
            off: removeEventListener,
            addEventListener: addEventListener,
            removeEventListener: removeEventListener,
            dispatchEvent: dispatchEvent,

            metadata: {
                get creator()       { return FrameTrail.module('HypervideoModel').creator },
                get creatorId()     { return FrameTrail.module('HypervideoModel').creatorId },
                get created()       { return FrameTrail.module('HypervideoModel').created },
                get lastchanged()   { return FrameTrail.module('HypervideoModel').lastchanged },
                get hidden()        { return FrameTrail.module('HypervideoModel').hidden },
                get hypervideoName(){ return FrameTrail.module('HypervideoModel').hypervideoName },
                get description()   { return FrameTrail.module('HypervideoModel').description },
            },

            get subtitles()      { return FrameTrail.module('HypervideoModel').subtitles },
            get overlays()       { return FrameTrail.module('HypervideoModel').overlays },
            get codeSnippets()   { return FrameTrail.module('HypervideoModel').codeSnippets },
            // get annotationSets() { return FrameTrail.module('HypervideoModel').annotationSets },
            get annotations()    { return FrameTrail.module('HypervideoModel').annotations },
            // get allAnnotations() { return FrameTrail.module('HypervideoModel').allAnnotations },

            traces: {
                startTrace:     (FrameTrail.module('UserTraces')) ? FrameTrail.module('UserTraces').startTrace : null,
                endTrace:       (FrameTrail.module('UserTraces')) ? FrameTrail.module('UserTraces').endTrace : null,
                addTraceEvent:  (FrameTrail.module('UserTraces')) ? FrameTrail.module('UserTraces').addTraceEvent : null,
                deleteTraces:   (FrameTrail.module('UserTraces')) ? FrameTrail.module('UserTraces').deleteTraces : null,
                get data()      { return FrameTrail.module('UserTraces').traces }
            }


        }

        instances.push(publicInstanceAPI);


        /**
         * Only the PHP endpoint can bundle the uploaded media files, so this path cannot
         * run client-side. On a private instance (config.alwaysForceLogin) it answers 403
         * unless a valid session cookie is sent, hence the explicit status check — an
         * <a download> click would silently save the error body as a .zip.
         */
        function _exportServerZip() {

            var serverUrl = FrameTrail.getState('server') || '_server/',
                adapter   = FrameTrail.module('StorageManager').getAdapter(),
                dpParam   = (adapter && adapter.dataPathAbsolute)
                                ? '&dataPath=' + encodeURIComponent(adapter.dataPathAbsolute)
                                : '';

            return fetch(serverUrl + 'ajaxServer.php?a=dataExport' + dpParam, { credentials: 'same-origin' })
                .then(function(response) {
                    if (response.status === 403) {
                        throw new Error('Data export denied: this instance is private (config.alwaysForceLogin) and requires a logged-in session');
                    }
                    if (!response.ok) {
                        throw new Error('Data export failed with status ' + response.status);
                    }
                    return response.blob();
                })
                .then(function(blob) {
                    var url = URL.createObjectURL(blob),
                        a   = document.createElement('a');
                    a.href     = url;
                    a.download = 'frametrail-data-export.zip';
                    a.click();
                    URL.revokeObjectURL(url);
                });

        }


        function _initModule(name) {

            if (!defs_modules[name]) {
                throw new Error('The module to initialize (named "'+name+'") is not defined.')
            }

            var publicInterface = defs_modules[name].call(this, FrameTrail);


            if(typeof publicInterface === 'object' && publicInterface !== null){

                modules[name] = publicInterface;
                return publicInterface;

            }

        }


        function _initTypes() {

            var typeNames = Object.keys(defs_types),
                idx = 0;

            while (typeNames.length > 0) {

                var typeName = typeNames[idx];

                var definitionFnValue = defs_types[typeName].call(this, FrameTrail);

                var parentName  = definitionFnValue.parent,
                    proto       = definitionFnValue.prototype   || {},
                    obj         = definitionFnValue.constructor || function () {};

                var parent, type, attribute, newProto;


                if (parentName) {
                    parent = types[parentName];
                    if (!parent) {
                        idx++;
                        if (idx >= typeNames.length) { idx = 0; }
                        continue;
                    }
                } else {
                    parent = null;
                }


                if (parent) {

                    type = (function (parent, obj) {
                        return function() {
                            parent.apply(this, arguments);
                            obj.apply(this, arguments);
                            return this;
                        };
                    })(parent, obj);

                    newProto = {};

                    for (attribute in parent.prototype) {
                        newProto[attribute] = parent.prototype[attribute];
                    }

                    for (attribute in proto) {
                        newProto[attribute] = proto[attribute];
                    }

                    type.prototype = newProto

                } else {

                    type = obj;
                    type.prototype = proto;

                }

                types[typeName] = type;

                typeNames.splice(idx, 1);

            }

        }


        function _unloadModule(name) {

            if (!modules[name]) {
                throw new Error('The module to unload (named "'+name+'") is not defined.')
            }

            if (modules[name].onUnload && typeof modules[name].onUnload === 'function') {
                modules[name].onUnload.call(this);
            }

            delete modules[name];

        }


        function _module(name) {

            return modules[name];

        }


        function _modules() {

            return modules;

        }


        function _getState(key) {

            return key ? state[key] : state;

        }


        function _changeState(param1, param2) {


            if (typeof param1 === 'string') {

                updateQueue.push([param1, param2, state[param1]]);

            } else if (typeof param1 === 'object' && param1 !== null) {

                for (var key in param1) {

                    updateQueue.push([key, param1[key], state[key]]);

                }

            } else {

                throw new Error('Illegal arguments.')

            }


            if(!inUpdateThread){

                inUpdateThread = true;

                while (updateQueue[0]) {

                    var updateFrame = updateQueue.splice(0, 1)[0];

                    state[updateFrame[0]] = updateFrame[1];

                    for(var name in modules){

                        if (typeof modules[name].onChange === 'object' && modules[name].onChange !== null){

                            if (typeof modules[name].onChange[updateFrame[0]] === 'function'){

                                modules[name].onChange[updateFrame[0]].call(this, updateFrame[1], updateFrame[2]);

                            }

                        }

                    }


                }

                inUpdateThread = false;

            }

        }


        function _type(name) {

            return types[name];

        }


        function _newObject(name, param1, param2, param3, param4, param5, param6, param7) {

            return new types[name](param1, param2, param3, param4, param5, param6, param7);

        }

        function addEventListener(type, handler) {
            if (!(type in listeners)) {
                listeners[type] = [];
            }
            listeners[type].push(handler);
        }

        function removeEventListener(type, handler) {
            if (!(type in listeners)) {
                return;
            }
            var stack = listeners[type];
            for (var i = 0; i < stack.length; i++) {
                if (stack[i] === handler){
                    stack.splice(i, 1);
                    i--;
                }
            }
        }

        function dispatchEvent(event) {
            if (!(event.type in listeners)) {
                return true;
            }
            var stack = listeners[event.type];
            for (var i = 0, l = stack.length; i < l; i++) {
                stack[i].call(this, event);
            }
            return !event.defaultPrevented;
        }


        function triggerEvent(eventType, eventData) {
            return dispatchEvent(new CustomEvent(eventType, { detail: eventData }));
        }


        return publicInstanceAPI;


    }


}).call(this);
