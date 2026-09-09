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
    FrameTrail.initModule('OverviewMapSettingsDialog');

    // Before Titlebar: it decides at construction time whether the user menu
    // offers a Manage Users entry, by asking whether the module resolves.
    FrameTrail.initModule('ManageUsersDialog');
    FrameTrail.initModule('ManageTagsDialog');


    FrameTrail.initModule('Titlebar');
    FrameTrail.initModule('Sidebar');

    FrameTrail.initModule('ViewOverview');

    if (FrameTrail.module('RouteNavigation').hypervideoID) {
        FrameTrail.initModule('ViewVideo');
        FrameTrail.initModule('ViewLayout');
    }

    FrameTrail.initModule('ViewResources');

    var mainContainer = document.createElement('div');
    mainContainer.className = 'mainContainer';





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


        document.querySelector(FrameTrail.getState('target')).append(mainContainer);


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

        var targetEl = document.querySelector(FrameTrail.getState('target')),
            resizeTimeout = false;

        function onResize() {
            var width   = targetEl.offsetWidth,
                height  = targetEl.offsetHeight;

            // Expose container dimensions as CSS custom properties so
            // stylesheets can use var(--ft-width) / var(--ft-height)
            // instead of viewport-relative vh / vw units.
            targetEl.style.setProperty('--ft-width', width + 'px');
            targetEl.style.setProperty('--ft-height', height + 'px');

            FrameTrail.changeState('viewSize', [width, height]);

            if ( resizeTimeout !== false ) {
                clearTimeout(resizeTimeout);
            }

            resizeTimeout = setTimeout(function() {
                FrameTrail.changeState('viewSizeChanged');
            }, 300);
        }

        // Primary: observe the target container itself so we detect size
        // changes even when the window does not resize (e.g. host page
        // layout changes, CSS transitions on the container).
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(onResize).observe(targetEl);
        }

        // Fallback: still listen to window resize for older browsers.
        window.addEventListener('resize', onResize);

        // Mobile orientation changes may not report new dimensions
        // immediately — re-fire after a short delay to settle.
        window.addEventListener('orientationchange', function() {
            setTimeout(onResize, 100);
            setTimeout(onResize, 300);
        });

        // When the tab/window becomes visible (e.g. opened via "open in
        // new tab"), layout calculations done while hidden may be stale.
        // Re-measure once the page is actually shown.
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                onResize();
            }
        });

        // Also handle the pageshow event for bfcache restores.
        window.addEventListener('pageshow', function() {
            onResize();
        });

        // Initial measurement.
        onResize();

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
            mainContainer.classList.add('sidebarOpen');
        } else {
            mainContainer.classList.remove('sidebarOpen');
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

            document.querySelector(FrameTrail.getState('target')).classList.add('editActive');
            mainContainer.classList.add('editActive');
            mainContainer.dataset.editMode = editMode;

        } else {

            document.querySelector(FrameTrail.getState('target')).classList.remove('editActive');
            mainContainer.classList.remove('editActive');
            mainContainer.removeAttribute('data-edit-mode');

        }

        // Entering a mode while the lock is already held must apply at once,
        // rather than waiting for the next poll to broadcast collabState.
        reflectCollaborationLock();

    };


    /**
     * I mirror "someone else holds the edit lock" onto the main container, so
     * CSS alone can make the regions that write to the shared hypervideo.json
     * inert. Annotations are exempt — they are per-user files and stay
     * concurrently editable — which the stylesheets express via the
     * data-edit-mode attribute set above.
     *
     * @method reflectCollaborationLock
     */
    function reflectCollaborationLock() {

        var Collaboration = FrameTrail.module('Collaboration');

        mainContainer.classList.toggle('collabLocked',
            !!(Collaboration && Collaboration.isLockedByOther()));

    };





    return {

        create: create,

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            editMode:       toggleEditMode,
            collabState:    reflectCollaborationLock
        }

    };

});
