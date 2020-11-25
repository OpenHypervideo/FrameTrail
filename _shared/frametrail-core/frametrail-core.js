
(function(){


    var defs_modules = {},
        defs_types	 = {},

        instances    = [];

    window.FrameTrail = {
        defineModule: 	_defineModule,
        defineType: 	_defineType,
        init:           _init,

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

    function _defineType(name, definition) {

        if (typeof definition !== 'function') {
            throw new Error('Type definition must be a function object, which returns type definition { parent constructor proto }.');
        }

        defs_types[name] = definition;

    }


    function _init(options, appName) {

    	var FrameTrail = {
    		start: 			_start,
    		initModule: 	_initModule,
            unloadModule: 	_unloadModule,
    		modules: 		_modules,
    		module: 		_module,
    		getState: 		_getState,
    		changeState: 	_changeState,
    		get types()		{ return types },
    		type: 			_type,
    		newObject: 		_newObject,
            triggerEvent:   triggerEvent,
            addEventListener: addEventListener,
            removeEventListener: removeEventListener
    	};

    	var state			= {},
    		modules 		= {},
            types           = {},
    		updateQueue 	= [],
    		inUpdateThread  = false,
            listeners       = {};



        _initTypes();
        _start(options, appName);


    	function _start(runtimeConfig, appName) {

    		// TODO: Check if this belongs here
            $(runtimeConfig.target).addClass('frametrail-body');

            state = {
                target:             options.target || 'body',
                contentTargets:     options.contentTargets || {},
                contents:           options.contents,
                startID:            options.startID,
                resources:          options.resources || [],
                tagdefinitions:     options.tagdefinitions,
                config:             options.config,
                users:              options.users,
                language:           options.language || null,

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

            destroy: function () {

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
