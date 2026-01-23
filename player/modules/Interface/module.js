/**
 * @module Player
 */


/**
 * I am the Interface module.
 *
 * I am the central place which inititalizes and coordinates all other interface-related modules.
 *
 * When this module is loaded, it loads also:
 * * {{#crossLink "Titlebar"}}Titlebar{{/crossLink}}
 * * {{#crossLink "Sidebar"}}Sidebar{{/crossLink}}
 * * {{#crossLink "ViewOverview"}}ViewOverview{{/crossLink}}
 * * {{#crossLink "ViewVideo"}}ViewVideo{{/crossLink}} (when there is a hypervideo present)
 * * {{#crossLink "ViewResources"}}ViewResources{{/crossLink}}
 *
 * @class Interface
 * @static
 */


FrameTrail.defineModule('Interface', function(FrameTrail){

	var labels = FrameTrail.module('Localization').labels;

	FrameTrail.initModule('HypervideoSettingsDialog');
	FrameTrail.initModule('AdminSettingsDialog');
	
	FrameTrail.initModule('Titlebar');
  	FrameTrail.initModule('Sidebar');

  	FrameTrail.initModule('ViewOverview');

  	if (FrameTrail.module('RouteNavigation').hypervideoID) {
  		FrameTrail.initModule('ViewVideo');
        FrameTrail.initModule('ViewLayout');
  	}

  	FrameTrail.initModule('ViewResources');

  	var mainContainer = $('<div class="mainContainer"></div>');





	/**
	 * I call the create method of all my sub-modules, and set the window resize event listener.
	 *
	 * @method create
	 * @param {Function} callback
	 */
	function create(callback) {

		FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoadingInterface']);

		// Check if window is in iFrame
		var iFrame;
		try {
	        iFrame = (window.self !== window.top);
	    } catch (e) {
	        iFrame = true;
	    }
	    FrameTrail.changeState('embed', iFrame);

		FrameTrail.module('Titlebar').create();
		FrameTrail.module('Sidebar').create();


		$(FrameTrail.getState('target')).append(mainContainer);


		FrameTrail.module('ViewOverview').create();

		if (FrameTrail.module('RouteNavigation').hypervideoID) {
			FrameTrail.module('ViewVideo').create();
            FrameTrail.module('ViewLayout').create();
		}

		FrameTrail.module('ViewResources').create();

		initWindowResizeHandler();

		callback.call();


	};


	/**
	 * I set the event listener for the resize event of the window.
	 *
	 * This event triggers a change of the global state "viewSize", so all modules can react to this event.
	 *
	 * Also, after the .create() method of all interface modules has been called, I trigger once the resize event, to propagate a valid state "viewSize" throughout the app.
	 *
	 * @method initWindowResizeHandler
	 */
	function initWindowResizeHandler() {

		var _window = $(FrameTrail.getState('target')),
			resizeTimeout = false;

		$(window).resize(function(){

		 	var width   = _window.width(),
		 		height  = _window.height();

		 	//$('.mainContainer').height( height - FrameTrail.module('Titlebar').height );
		 	FrameTrail.changeState('viewSize', [width, height]);

		 	if ( resizeTimeout !== false ) {
		 		clearTimeout(resizeTimeout);
		 	}

		 	resizeTimeout = setTimeout(function() {
	 			FrameTrail.changeState('viewSizeChanged');
	 		}, 300);

		});


		$(window).resize();



	};


	/**
	 * When the global state "sidebarOpen" changes, I react to it.
	 *
	 * Most importantly, I assure that the &lt;div id="MainContainer"&gt; is resized __before__ the {{#crossLink "ViewVideo/toggleSidebarOpen:method"}}ViewVideo.toggleSidebarOpen{{/crossLink}} is called.
	 *
	 * @method toggleSidebarOpen
	 * @param {Boolean} opened
	 */
	function toggleSidebarOpen(opened) {

		if (opened) {
			mainContainer.addClass('sidebarOpen');
		} else {
			mainContainer.removeClass('sidebarOpen');
		}

		var ViewVideo = FrameTrail.module('ViewVideo');

		if (ViewVideo) {
			ViewVideo.toggleSidebarOpen(opened);
		}


    };


    /**
     * I react to a change in the global state "editMode"
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode){

        if (editMode) {

            $(FrameTrail.getState('target')).addClass('editActive');
            mainContainer.addClass('editActive').attr('data-edit-mode', editMode);

        } else {

            $(FrameTrail.getState('target')).removeClass('editActive');
            mainContainer.removeClass('editActive').removeAttr('data-edit-mode');

        }

    };





   	return {

   		create: create,

   		onChange: {
            sidebarOpen:    toggleSidebarOpen,
            editMode:       toggleEditMode
        }

   	};

});
