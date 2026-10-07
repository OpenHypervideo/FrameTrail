
(function(){


    var defs_modules    = {},
        defs_types      = {},
        defs_extensions = {},

        instances    = [];

    window.FrameTrail = {
        version:        '__FRAMETRAIL_VERSION__',

        defineModule:   _defineModule,
        defineType:     _defineType,
        registerExtension: _registerExtension,
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
     * Register an extension: code that is not part of FrameTrail and plugs
     * into it from outside (see docs/EXTENDING.md, "Writing an Extension").
     *
     * Like a module definition, the factory is called once per instance that
     * loads the extension — an instance loads the ones named in its
     * `extensions` init option and in config.json → extensions — and receives
     * that instance. It returns the extension's interface:
     * { init, onReady, onHypervideoChange, onChange, onUnload, slots }.
     *
     * @method registerExtension
     * @param {String}   name     lowercase letters, digits and hyphens
     * @param {Function} factory
     */
    function _registerExtension(name, factory) {

        if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
            throw new Error('Extension name "' + name + '" must consist of lowercase letters, digits and hyphens.');
        }

        if (typeof factory !== 'function') {
            throw new Error('Extension definition must be a function object, which returns the extension\'s interface.');
        }

        defs_extensions[name] = factory;

    }

    /**
     * Scan the document (or a subtree) for FrameTrail data blocks and for
     * <video data-frametrail> elements, and initialise a player for each.
     *
     * A data block is a hypervideo or project bundle in a
     * <script type="application/ld+json" data-frametrail> element, the portable
     * HTML format (docs/HTML-FORMAT.md). Its attributes:
     *   data-frametrail-format       — format version (default 1)
     *   data-frametrail-datapath     — what relative media paths resolve against
     *   data-frametrail-config       — inline JSON config (playback settings)
     *   data-frametrail-language     — language code; maps to config.defaultLanguage
     *   data-frametrail-target       — where to mount (CSS selector; default: body).
     *                                  Only the first block per target is played.
     *   data-frametrail-fullpage     — as below
     *
     * Supported data attributes on the <video> element:
     *   data-frametrail-annotations  — URL of a W3C annotations JSON file
     *   data-frametrail-language     — language code; maps to config.defaultLanguage
     *   data-frametrail-config       — inline JSON config object
     *   data-frametrail-datapath     — base URL for _data/ (maps to dataPath option)
     *   data-frametrail-server       — base URL for _server/ (maps to server option)
     *   data-frametrail-fullpage     — "true"/"false"; may this player name the
     *                                  browser tab? (maps to fullPage option)
     *
     * @method autoInit
     * @param {Element|Document} [scope]  Optional root element to search within (default: document)
     */
    function _autoInit(scope) {
        var root   = scope || document;
        var blocks = root.querySelectorAll('script[type="application/ld+json" i][data-frametrail]');
        var videos = root.querySelectorAll('video[data-frametrail]');
        var mounted = {};

        for (var b = 0; b < blocks.length; b++) {
            (function (block) {
                var target  = block.getAttribute('data-frametrail-target') || 'body',
                    format  = parseInt(block.getAttribute('data-frametrail-format') || '1', 10),
                    known   = (window.FrameTrailHTMLFormat && window.FrameTrailHTMLFormat.FORMAT_VERSION) || 1,
                    bundle, config;

                if (mounted[target]) { return; }

                if (!(format >= 1) || format > known) {
                    console.error('FrameTrail: a data block in format ' + block.getAttribute('data-frametrail-format') + ' cannot be read by this version (format ' + known + ').');
                    return;
                }

                try {
                    bundle = JSON.parse(block.textContent);
                    config = JSON.parse(block.getAttribute('data-frametrail-config') || '{}');
                } catch (e) {
                    console.error('FrameTrail: a data block is not valid JSON: ' + e.message);
                    return;
                }

                var langAttr = block.getAttribute('data-frametrail-language');
                if (langAttr) { config.defaultLanguage = langAttr; }

                var fullPageAttr = block.getAttribute('data-frametrail-fullpage');

                mounted[target] = true;

                _init({
                    bundle:   bundle,
                    target:   target,
                    config:   config,
                    dataPath: block.getAttribute('data-frametrail-datapath') || null,
                    fullPage: (fullPageAttr === null) ? undefined : (fullPageAttr !== 'false')
                });
            })(blocks[b]);
        }

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

                // An adopted <video> sits in a page of somebody else's making,
                // so the auto-detection says "not the page" on its own. The
                // attribute is here so that verdict can still be overruled.
                var fullPageAttr = video.getAttribute('data-frametrail-fullpage');
                var fullPage     = (fullPageAttr === null) ? undefined : (fullPageAttr !== 'false');

                // No target provided — _start() will auto-create the wrapper div
                _init({
                    videoElement: video,
                    annotations:  annotations,
                    config:       config,
                    dataPath:     video.getAttribute('data-frametrail-datapath') || null,
                    server:       video.getAttribute('data-frametrail-server')   || null,
                    fullPage:     fullPage
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


    /**
     * I decide whether this instance is the whole page, rather than something
     * embedded in a page somebody else owns. Today that governs one thing: who
     * gets to name the browser tab (see Titlebar.renderTitle).
     *
     * Mounting on <body> is the signal. A host that has content of its own has
     * to pass a container target, and the auto-wrap path builds a wrapper div
     * beside the video it adopted — so both read as "not the page", while
     * index.html, the standalone export and a target-less init all read as
     * "the page". Inspecting what else <body> holds would be both fussier and
     * less reliable: dialogs, drag clones and the overview's zoom animation are
     * appended to <body> while the application runs, so the answer would change
     * underneath us. This one does not.
     *
     * The fullPage option overrides the whole thing, in either direction.
     *
     * @method _resolveFullPage
     * @param {Boolean|undefined} option    the fullPage init option
     * @param {Element|null}      targetEl  the resolved target element
     * @return Boolean
     * @private
     */
    function _resolveFullPage(option, targetEl) {

        if (option === true || option === false) {
            return option;
        }

        // A cross-origin parent throws rather than answering, which is itself
        // the answer: we are in somebody's iframe.
        var inIframe;
        try {
            inIframe = (window.self !== window.top);
        } catch (e) {
            inIframe = true;
        }
        if (inIframe) return false;

        // This instance is not in the registry yet (it is pushed once _start
        // returns), so anything in there is an instance that came first and has
        // the better claim — same reasoning as RouteNavigation's guard on who
        // owns the address bar.
        if (instances.length > 0) return false;

        return targetEl === document.body;

    }


    function _init(options, appName) {

        var FrameTrail = {
            start:          _start,
            initModule:     _initModule,
            unloadModule:   _unloadModule,
            modules:        _modules,
            module:         _module,
            initExtension:  _initExtension,
            unloadExtension: _unloadExtension,
            extensions:     _extensions,
            extension:      _extension,
            get edit()      { return modules['EditAPI'] ? modules['EditAPI'].edit : undefined },
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
            extensions      = {},
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

            var _fullPage = _resolveFullPage(options.fullPage, _targetEl);

            state = {
                target:             resolvedTarget,
                fullscreenTarget:   options.fullscreenTarget || null,
                contentTargets:     options.contentTargets || {},
                contents:           options.contents !== undefined ? options.contents : null,
                bundle:             options.bundle       || null,
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
                extensions:         options.extensions   || null,
                fullPage:           _fullPage,

                loggedIn:           false,
                username:           '',
                userAvatar:         '',
                viewMode:           'video',
                editMode:           false,
                slidePosition:      'middle',
                sidebarOpen:        false,
                fullscreen:         false,
                viewSize:           [0,0],
                unsavedChanges:     false,
                overviewSearchQuery: ''
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

            // A hypervideo or the project as a page in the portable HTML format,
            // as a bundle (JSON) or as a zip of the _data folder (see BundleExport).
            export: function(options){
                if (!FrameTrail.module('BundleExport')) {
                    return Promise.reject(new Error('Export is not available'));
                }
                return FrameTrail.module('BundleExport').exportData(options);
            },

            destroy: function () {
                var thisInstanceIndex = instances.indexOf(publicInstanceAPI),
                    thisDOMElement = document.querySelector(state.target);

                if (modules['Extensions']) {
                    modules['Extensions'].unload();
                }

                if (thisDOMElement) {
                    thisDOMElement.parentNode.removeChild(thisDOMElement);
                }
                
                instances.splice(thisInstanceIndex, 1);
            },

            // Reading and changing the open hypervideo (see docs/EXTENDING.md, "Editing the Hypervideo").
            get edit() { return FrameTrail.module('EditAPI') ? FrameTrail.module('EditAPI').edit : undefined },

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


        /**
         * I create this instance's copy of a registered extension and keep it,
         * so that its onChange handlers hear state changes from now on.
         * Without a registered extension of that name I return undefined;
         * a factory that throws, throws here.
         *
         * @method initExtension
         * @param {String} name
         * @return {Object|undefined}
         */
        function _initExtension(name) {

            if (!defs_extensions[name]) {
                return undefined;
            }

            if (extensions[name]) {
                return extensions[name];
            }

            var extensionInterface = defs_extensions[name].call(this, FrameTrail);

            if (typeof extensionInterface !== 'object' || extensionInterface === null) {
                extensionInterface = {};
            }

            extensions[name] = extensionInterface;
            return extensionInterface;

        }


        /**
         * I drop an extension from this instance, after its onUnload.
         *
         * @method unloadExtension
         * @param {String} name
         */
        function _unloadExtension(name) {

            var extension = extensions[name];

            if (!extension) return;

            delete extensions[name];

            if (typeof extension.onUnload === 'function') {
                try {
                    extension.onUnload.call(extension);
                } catch (e) {
                    console.error('FrameTrail extension "' + name + '": onUnload failed.', e);
                }
            }

        }


        function _extension(name) {

            return extensions[name];

        }


        function _extensions() {

            return extensions;

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

                    // Extensions hear a change after every module has, so the
                    // interface they look at has already caught up with it.
                    // A failing handler is reported and skipped: it must not
                    // leave this loop, which would stop all state propagation.
                    for (var extensionName in extensions) {

                        var extensionOnChange = extensions[extensionName].onChange;

                        if (typeof extensionOnChange === 'object' && extensionOnChange !== null
                                && typeof extensionOnChange[updateFrame[0]] === 'function') {

                            try {
                                extensionOnChange[updateFrame[0]].call(this, updateFrame[1], updateFrame[2]);
                            } catch (e) {
                                console.error('FrameTrail extension "' + extensionName + '": onChange.' + updateFrame[0] + ' failed.', e);
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
