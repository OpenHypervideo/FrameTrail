/**
 * @module Player
 */


/**
 * I am the ViewOverview
 *
 * @class ViewOverview
 * @static
 */


FrameTrail.defineModule('ViewOverview', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var _domWrapper = document.createElement('div');
    _domWrapper.innerHTML = '<div class="viewOverview"><div class="overviewList"></div><div class="emptyStateHint"><span class="emptyStateHintText"></span></div></div>';
    var domElement = _domWrapper.firstElementChild,
        OverviewList = domElement.querySelector('.overviewList'),
        EmptyStateHint = domElement.querySelector('.emptyStateHint'),

        animationElement      = null,
        lastSelectedThumb     = null,

        MapModule             = null;




    /**
     * I tell whether this instance presents the overview as a map instead of
     * the default grid. This is an instance-wide setting with no runtime
     * toggle, so it is fixed for the lifetime of the page.
     *
     * @method isMapMode
     * @return {Boolean}
     */
    function isMapMode() {

        return ((FrameTrail.module('Database').config || {}).overviewMode === 'map');

    }


    /**
     * I lazily initialize the ViewOverviewMap module.
     *
     * Initialization is wrapped, because initModule throws when the script is
     * not loaded — a partial deploy or a stale HTML entry point should degrade
     * to the grid rather than break the overview entirely.
     *
     * @method getMap
     * @return {Object|null}
     */
    function getMap() {

        if (MapModule) return MapModule;
        if (!isMapMode()) return null;

        try {
            MapModule = FrameTrail.initModule('ViewOverviewMap');
        } catch (exception) {
            console.warn('FrameTrail: overviewMode is "map", but ViewOverviewMap is unavailable — falling back to the grid.', exception);
            return null;
        }

        return MapModule;

    }


    /**
     * I return the element that represents a hypervideo in whichever overview
     * rendering is active: a grid thumb or a map pin.
     *
     * Both carry data-hypervideoid, and only one of the two containers is ever
     * populated, so the selector can be class-agnostic.
     *
     * @method getElementForHypervideo
     * @param {String} hypervideoID
     * @return {HTMLElement|null}
     */
    function getElementForHypervideo(hypervideoID) {

        if (!hypervideoID) return null;

        return domElement.querySelector('[data-hypervideoid="' + hypervideoID + '"]');

    }


    /**
     * I return the element currently marked as the active hypervideo.
     *
     * @method getActiveElement
     * @return {HTMLElement|null}
     */
    function getActiveElement() {

        return domElement.querySelector('[data-hypervideoid].activeHypervideo');

    }


    /**
     * I move the active-hypervideo marking to a hypervideo.
     *
     * @method setActiveHypervideo
     * @param {String} hypervideoID
     */
    function setActiveHypervideo(hypervideoID) {

        domElement.querySelectorAll('[data-hypervideoid].activeHypervideo').forEach(function(el) {
            el.classList.remove('activeHypervideo');
        });

        var element = getElementForHypervideo(hypervideoID);
        if (element) element.classList.add('activeHypervideo');

    }


    /**
     * Description
     * @method create
     * @return
     */
    function create() {

        var _t = FrameTrail.getState('target');
        var _targetEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
        _targetEl.querySelector('.mainContainer').append(domElement);

        if (isMapMode()) {
            var map = getMap();
            if (map) {
                domElement.classList.add('mapMode');
                map.create(domElement);
                map.setOpenHandler(openHypervideo);
            }
        }

        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));


    };


    /**
     * Description
     * @method initList
     * @return
     */
    function initList() {

        var hypervideos = FrameTrail.module('Database').hypervideos,
            hypervideo,
            thumb,
            owner,
            admin = FrameTrail.module('UserManagement').userRole === 'admin',
            editMode = FrameTrail.getState('editMode');
            userColor = FrameTrail.getState('userColor');

        // In map mode the grid is never built. This branch has to come before
        // the thumb clear below, which removes .hypervideoThumb elements rather
        // than emptying the container.
        var map = isMapMode() ? getMap() : null;
        if (map) {
            OverviewList.querySelectorAll('.hypervideoThumb').forEach(function(el) { el.remove(); });
            map.renderMarkers();
            map.toggleEditMode(editMode);
            changeViewSize();
            updateEmptyStateHint();
            return;
        }

        OverviewList.querySelectorAll('.hypervideoThumb').forEach(function(el) { el.remove(); });

        for (var id in hypervideos) {

            owner = hypervideos[id].creatorId === FrameTrail.module('UserManagement').userID;


            hypervideo = FrameTrail.newObject('Hypervideo', hypervideos[id]);

            thumb = hypervideo.renderThumb();


                if ( (admin || owner) && editMode && FrameTrail.module('StorageManager').canSave() ) {

                    var hypervideoOptions = document.createElement('div');
                    hypervideoOptions.className = 'hypervideoOptions';

                    var editButton = document.createElement('button');
                    editButton.className = 'hypervideoEditButton';
                    editButton.setAttribute('data-tooltip-bottom-right', labels['SettingsHypervideoSettings']);
                    editButton.innerHTML = '<span class="icon-pencil"></span>';

                    // Capture the hypervideoID in the closure to avoid referencing the last thumb
                    (function(hypervideoID) {
                        editButton.addEventListener('click', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            FrameTrail.module('HypervideoSettingsDialog').open(hypervideoID);
                        });
                    })(id);

                    var deleteButton = document.createElement('button');
                    deleteButton.className = 'hypervideoDeleteButton';
                    deleteButton.setAttribute('data-tooltip-bottom-right', labels['GenericDeleteHypervideo']);
                    deleteButton.innerHTML = '<span class="icon-trash"></span>';

                    (function(hypervideoID) {
                        deleteButton.addEventListener('click', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            FrameTrail.module('HypervideoSettingsDialog').openDeleteDialog(hypervideoID);
                        });
                    })(id);

                    hypervideoOptions.append(editButton);
                    hypervideoOptions.append(deleteButton);
                    thumb.append(hypervideoOptions);

                }

                /*
                if (owner && editMode ) {

                    thumb.classList.add('owner');
                    thumb.style.borderColor = '#' + userColor;

                }
                */

                if ( thumb.dataset.hypervideoid == FrameTrail.module('RouteNavigation').hypervideoID ) {
                    thumb.classList.add('activeHypervideo');
                }

                thumb.style.transitionDuration = '0ms';

                // open hypervideo without reloading the page
                thumb.addEventListener('click', function(evt) {

                    // prevent opening href location
                    evt.preventDefault();
                    evt.stopPropagation();

                    openHypervideo(this.dataset.hypervideoid, this);

                });

                OverviewList.append(thumb);

        }

        if (editMode && FrameTrail.module('StorageManager').canSave()) {
            var newHypervideoThumb = document.createElement('div');
            newHypervideoThumb.className = 'hypervideoThumb newHypervideoThumb';
            newHypervideoThumb.innerHTML = '<span class="icon-hypervideo-add"></span>'
                                         + '<span class="newHypervideoLabel">' + labels['HypervideoNew'] + '</span>';
            newHypervideoThumb.addEventListener('click', function() {
                var _t = FrameTrail.getState('target');
                var _targetEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
                var btn = _targetEl.querySelector('.newHypervideoButton');
                if (btn) btn.click();
            });
            OverviewList.append(newHypervideoThumb);
        }

        changeViewSize();
        OverviewList.querySelectorAll('.hypervideoThumb').forEach(function(el) { el.style.transitionDuration = ''; });

        updateEmptyStateHint();

    }


    /**
     * I open a hypervideo from the overview.
     *
     * I am shared by grid thumbs and map pins: nothing in here depends on the
     * shape of the source element, which is used only as the starting rect for
     * the zoom animation.
     *
     * @method openHypervideo
     * @param {String} newHypervideoID
     * @param {HTMLElement} sourceElement The element the animation starts from
     */
    function openHypervideo(newHypervideoID, sourceElement) {

                    var update = (FrameTrail.module('RouteNavigation').hypervideoID == undefined) ? false : true;

                    // Store reference to source element for animation
                    lastSelectedThumb = sourceElement;

                    if ( FrameTrail.module('RouteNavigation').hypervideoID == newHypervideoID ) {

                        // Already loaded — just switch to the video view, and record
                        // it, so the URL stops saying "overview". The animation
                        // happens in toggleViewMode.
                        FrameTrail.module('RouteNavigation').navigateToView('video');

                    } else {

                        if ( FrameTrail.getState('editMode') && FrameTrail.getState('unsavedChanges') ) {

                            var confirmDialog = document.createElement('div');
                            confirmDialog.className = 'confirmSaveChanges';
                            confirmDialog.innerHTML = '<div class="message active">'+ labels['MessageSaveChanges'] +'</div>'
                                                    + '<p>'+ labels['MessageSaveChangesQuestion'] +'</p>';

                            var confirmDialogCtrl = Dialog({
                              title:     labels['MessageSaveChangesQuestionShort'],
                              content:   confirmDialog,
                              resizable: false,
                              modal:     true,
                              close: function() {
                                confirmDialogCtrl.destroy();
                              },
                              buttons: {
                                'Yes': function() {

                                    // TODO: Show saving indicator in dialog

                                    FrameTrail.module('HypervideoModel').save(function(){

                                        FrameTrail.module('RouteNavigation').setHashVariables({ overview: null, t: null, hypervideo: newHypervideoID });

                                        FrameTrail.changeState('editMode', false);

                                        confirmDialogCtrl.close();

                                        setActiveHypervideo(newHypervideoID);

                                        FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                                    });

                                },
                                'No, discard': function() {

                                    FrameTrail.changeState('unsavedChanges', false);

                                    confirmDialogCtrl.close();

                                    // TODO: Reload new hypervideo
                                    window.location.reload();

                                },
                                Cancel: function() {
                                  confirmDialogCtrl.close();
                                }
                              }
                            });



                        } else {

                            setActiveHypervideo(newHypervideoID);

                            FrameTrail.module('RouteNavigation').setHashVariables({ overview: null, t: null, hypervideo: newHypervideoID });

                            if ( FrameTrail.getState('editMode') ) {

                                FrameTrail.changeState('editMode', false);

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                            } else {

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, false, update);

                            }

                        }



                    }

    }


    /**
     * Shows or hides the empty-state hint depending on whether there are
     * hypervideos and whether the user is in edit mode.
     * @method updateEmptyStateHint
     * @return
     */
    function updateEmptyStateHint() {

        var hypervideos = FrameTrail.module('Database').hypervideos;
        var hasHypervideos = Object.keys(hypervideos).length > 0;
        var editMode = FrameTrail.getState('editMode');

        var map = isMapMode() ? getMap() : null;

        if (!hasHypervideos && !editMode) {
            EmptyStateHint.querySelector('.emptyStateHintText').textContent = labels['OverviewEmptyHint'];
            EmptyStateHint.classList.add('visible');
        } else if (map && hasHypervideos && map.isEmpty()) {
            // Hypervideos exist, but none of them are placed on the map.
            EmptyStateHint.querySelector('.emptyStateHintText').textContent = labels['OverviewMapEmptyHint'];
            EmptyStateHint.classList.add('visible');
        } else {
            EmptyStateHint.classList.remove('visible');
        }

    }


    /**
     * Description
     * @method toggleSidebarOpen
     * @param {} opened
     * @return
     */
    function toggleSidebarOpen(opened) {

        if ( FrameTrail.getState('viewMode') === 'overview' ) {
            changeViewSize();
        }

    };


    /**
     * Description
     * @method changeViewSize
     * @param {} arrayWidthAndHeight
     * @return
     */
    function changeViewSize(arrayWidthAndHeight) {

        if ( FrameTrail.getState('viewMode') != 'overview' ) return;

        var map = isMapMode() ? getMap() : null;
        if (map) map.layout();

    };


    /**
     * Description
     * @method toggleFullscreen
     * @param {} aBoolean
     * @return
     */
    function toggleFullscreen(aBoolean) {


    };


    /**
     * Description
     * @method toogleUnsavedChanges
     * @param {} aBoolean
     * @return
     */
    function toogleUnsavedChanges(aBoolean) {


    };


    /**
     * Animates a hypervideo thumb from its grid position to full mainContainer size
     * @method animateThumbToFullSize
     * @param {HTMLElement} thumbElement The thumb element to animate
     * @param {Function} callback Function to call after animation completes
     * @param {Object} preCapturedRect Optional: thumb rect captured before overview is hidden
     */
    function animateThumbToFullSize(thumbElement, callback, preCapturedRect) {
        var _t = FrameTrail.getState('target');
        var _targetEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
        var mainContainer = _targetEl.querySelector('.mainContainer');
        var mainContainerRect = mainContainer.getBoundingClientRect();

        // Use pre-captured rect if provided, otherwise get it now
        var thumbRect = preCapturedRect || thumbElement.getBoundingClientRect();

        // Map pins are circular. Tween the radius in px, not '50%': computed
        // percentage radii do not interpolate against '0px'.
        var startRadius = thumbElement.classList.contains('overviewMapMarker')
                            ? (thumbRect.width / 2) + 'px'
                            : '0px';

        // Calculate positions relative to mainContainer
        var startWidth = thumbRect.width;
        var startHeight = thumbRect.height;
        var endWidth = mainContainerRect.width;
        var endHeight = mainContainerRect.height;

        // Get video container background color (like closing animation)
        var viewVideo = _targetEl.querySelector('.viewVideo');
        var videoContainer = viewVideo ? viewVideo.querySelector('.videoContainer') : null;
        var bgColor = '#000';
        if (videoContainer) {
            var computedStyle = window.getComputedStyle(videoContainer);
            if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                bgColor = computedStyle.backgroundColor;
            }
        }

        // Create simple, scalable animation element (like closing animation)
        animationElement = document.createElement('div');
        Object.assign(animationElement.style, {
            position: 'fixed',
            left: thumbRect.left + 'px',
            top: thumbRect.top + 'px',
            width: startWidth + 'px',
            height: startHeight + 'px',
            margin: '0',
            padding: '0',
            zIndex: '10000',
            pointerEvents: 'none',
            transformOrigin: 'top left',
            overflow: 'hidden',
            backgroundColor: bgColor,
            border: '2px solid var(--primary-fg-color)',
            borderRadius: startRadius,
            boxSizing: 'border-box',
            opacity: '1'
        });
        document.body.append(animationElement);

        // Hide the original thumb temporarily
        thumbElement.style.opacity = '0';

        // Animate to full size
        if (typeof anime !== 'undefined' && typeof anime.animate === 'function') {
            anime.animate(animationElement, {
                left: mainContainerRect.left + 'px',
                top: mainContainerRect.top + 'px',
                width: endWidth + 'px',
                height: endHeight + 'px',
                borderRadius: '0px',
                opacity: 1,
                duration: 400,
                ease: 'inOutQuad',
                onComplete: function() {
                    if (animationElement) {
                        animationElement.remove();
                        animationElement = null;
                    }
                    thumbElement.style.opacity = '';
                    if (callback) callback();
                }
            });
        } else {
            // Web Animations API fallback
            var anim = animationElement.animate([
                { left: thumbRect.left + 'px', top: thumbRect.top + 'px', width: startWidth + 'px', height: startHeight + 'px', borderRadius: startRadius, opacity: '1' },
                { left: mainContainerRect.left + 'px', top: mainContainerRect.top + 'px', width: endWidth + 'px', height: endHeight + 'px', borderRadius: '0px', opacity: '1' }
            ], { duration: 400, easing: 'ease-in-out', fill: 'forwards' });
            anim.finished.then(function() {
                if (animationElement) {
                    animationElement.remove();
                    animationElement = null;
                }
                thumbElement.style.opacity = '';
                if (callback) callback();
            });
        }
    }

    /**
     * Animates from full mainContainer size back to the thumb position in the grid
     * @method animateFullSizeToThumb
     * @param {String} hypervideoID The ID of the hypervideo to animate to
     * @param {Function} callback Function to call after animation completes
     */
    function animateFullSizeToThumb(hypervideoID, capturedVideoContainer, mainContainerRect, callback) {
        // First, ensure overview is visible so thumbs can be positioned
        // Show overview but keep it visually behind the animation (it's already added to DOM)
        domElement.classList.add('active');
        changeViewSize();

        var findRetries = 0;

        // Function to find thumb and perform animation
        function findThumbAndAnimate() {
            // Find the element representing this hypervideo: a grid thumb or a map pin
            var thumbElement = getElementForHypervideo(hypervideoID),
                thumbRect    = thumbElement ? thumbElement.getBoundingClientRect() : null;

            var notReady = !thumbElement || thumbRect.width === 0 || thumbRect.height === 0;

            if (notReady && findRetries++ < 40) {
                // Not laid out yet, try again after a short delay
                window.setTimeout(findThumbAndAnimate, 50);
                return;
            }

            if (notReady) {
                // No anchor to animate to. In map mode this is a legitimate
                // state: hypervideos that are not placed on the map have no
                // element at all. Skip the animation, but still run the
                // callback so the Titlebar title is restored.
                if (callback) callback();
                return;
            }

            var endRadius = thumbElement.classList.contains('overviewMapMarker')
                                ? (thumbRect.width / 2) + 'px'
                                : '0px';

            // Create animation element - use a simple scalable representation
            var computedStyle = capturedVideoContainer
                ? window.getComputedStyle(capturedVideoContainer)
                : null;

            // Get background color from the video container
            var bgColor = '#000';
            if (computedStyle && computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                bgColor = computedStyle.backgroundColor;
            }

            // Create a simple, scalable div (no nested elements with fixed sizes)
            animationElement = document.createElement('div');
            Object.assign(animationElement.style, {
                position: 'fixed',
                left: mainContainerRect.left + 'px',
                top: mainContainerRect.top + 'px',
                width: mainContainerRect.width + 'px',
                height: mainContainerRect.height + 'px',
                margin: '0',
                padding: '0',
                zIndex: '10000',
                pointerEvents: 'none',
                transformOrigin: 'top left',
                overflow: 'hidden',
                backgroundColor: bgColor,
                border: '2px solid var(--primary-fg-color)',
                borderRadius: '0px',
                transform: 'scale(1)',
                boxSizing: 'border-box',
                opacity: '1'
            });

            document.body.append(animationElement);

            // Animate to thumb position
            if (typeof anime !== 'undefined' && typeof anime.animate === 'function') {
                anime.animate(animationElement, {
                    left: thumbRect.left + 'px',
                    top: thumbRect.top + 'px',
                    width: thumbRect.width + 'px',
                    height: thumbRect.height + 'px',
                    borderRadius: endRadius,
                    opacity: 1,
                    duration: 400,
                    ease: 'inOutQuad',
                    onComplete: function() {
                        if (animationElement) {
                            animationElement.remove();
                            animationElement = null;
                        }
                        if (callback) callback();
                    }
                });
            } else {
                // Web Animations API fallback
                var anim = animationElement.animate([
                    { left: mainContainerRect.left + 'px', top: mainContainerRect.top + 'px', width: mainContainerRect.width + 'px', height: mainContainerRect.height + 'px', borderRadius: '0px', opacity: '1' },
                    { left: thumbRect.left + 'px', top: thumbRect.top + 'px', width: thumbRect.width + 'px', height: thumbRect.height + 'px', borderRadius: endRadius, opacity: '1' }
                ], { duration: 400, easing: 'ease-in-out', fill: 'forwards' });
                anim.finished.then(function() {
                    if (animationElement) {
                        animationElement.remove();
                        animationElement = null;
                    }
                    if (callback) callback();
                });
            }
        }

        // Wait for overview to be visible and layout to complete
        // Use requestAnimationFrame to ensure DOM is updated, then wait for layout
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                // Start looking for the thumb
                findThumbAndAnimate();
            });
        });
    }

    /**
     * Description
     * @method toggleViewMode
     * @param {} viewMode
     * @param {} oldViewMode
     * @return
     */
    function toggleViewMode(viewMode, oldViewMode) {

        if (MapModule) MapModule.closePopup();

        if (viewMode === 'overview') {
            // Animate from video view back to thumb position
            var currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
            if (oldViewMode === 'video' && currentHypervideoID) {
                // Capture video view immediately and synchronously (before other modules hide it)
                var _t = FrameTrail.getState('target');
                var _targetEl = (typeof _t === 'string') ? document.querySelector(_t) : _t;
                var viewVideo = _targetEl.querySelector('.viewVideo');
                var videoContainer = viewVideo ? viewVideo.querySelector('.videoContainer') : null;
                var mainContainer = _targetEl.querySelector('.mainContainer');
                var mainContainerRect = mainContainer ? mainContainer.getBoundingClientRect() : null;

                // Check if we have a video view to animate from
                if (viewVideo && videoContainer && mainContainerRect) {
                    // Store reference to video container for animation
                    var capturedContainer = videoContainer;

                    // Delay showing overview until animation completes
                    animateFullSizeToThumb(currentHypervideoID, capturedContainer, mainContainerRect, function() {
                        FrameTrail.module('Titlebar').title = labels['GenericOverview'];
                    });
                } else {
                    // Video view not available, just show overview
                    changeViewSize();
                    domElement.classList.add('active');
                    FrameTrail.module('Titlebar').title = labels['GenericOverview'];
                }
            } else {
                changeViewSize();
                domElement.classList.add('active');
                FrameTrail.module('Titlebar').title = labels['GenericOverview'];
            }
        } else if (viewMode === 'video' && oldViewMode === 'overview') {
            // Animate from thumb position to full size when switching from overview to video
            // Check if animation is already in progress
            if (animationElement) {
                // Animation already in progress, just hide overview
                domElement.classList.remove('active');
                return;
            }

            // Use requestAnimationFrame to ensure ViewVideo has processed first, then hide it
            var _t2 = FrameTrail.getState('target');
            var _targetEl2 = (typeof _t2 === 'string') ? document.querySelector(_t2) : _t2;
            var viewVideo2 = _targetEl2.querySelector('.viewVideo');
            requestAnimationFrame(function() {
                // Hide video view after ViewVideo has shown it
                if (viewVideo2) viewVideo2.classList.remove('active');

                // Use the last selected thumb if available (from click), otherwise find active thumb
                var thumbToAnimate = lastSelectedThumb;

                // A refreshList() between the click and this frame can leave
                // lastSelectedThumb pointing at a detached node, which would
                // measure 0x0.
                if (thumbToAnimate && !thumbToAnimate.isConnected) thumbToAnimate = null;

                if (!thumbToAnimate) {
                    // Find the element for the active hypervideo (grid thumb or map pin)
                    var currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
                    if (currentHypervideoID) {
                        thumbToAnimate = getActiveElement();
                        if (!thumbToAnimate) {
                            thumbToAnimate = getElementForHypervideo(currentHypervideoID);
                        }
                    }
                }

                if (thumbToAnimate) {
                    // Clear the stored thumb
                    lastSelectedThumb = null;

                    // Capture thumb position while overview is still visible
                    var thumbRect = thumbToAnimate.getBoundingClientRect();

                    // Only animate if the element has a valid position
                    if (thumbRect.width > 0 && thumbRect.height > 0) {

                        // Hide overview during animation
                        domElement.classList.remove('active');

                        // Animate thumb to full size, passing the pre-captured rect
                        animateThumbToFullSize(thumbToAnimate, function() {
                            // Animation complete, now show the video view
                            if (viewVideo2) viewVideo2.classList.add('active');
                            // Ensure ViewVideo is properly initialized
                            if (FrameTrail.module('ViewVideo') && FrameTrail.module('ViewVideo').onChange && FrameTrail.module('ViewVideo').onChange.viewMode) {
                                FrameTrail.module('ViewVideo').onChange.viewMode('video');
                            }
                        }, thumbRect);
                    } else {
                        // Thumb position not valid, show video view immediately
                        if (viewVideo2) viewVideo2.classList.add('active');
                        domElement.classList.remove('active');
                    }
                } else {
                    // Thumb not found, show video view immediately
                    if (viewVideo2) viewVideo2.classList.add('active');
                    domElement.classList.remove('active');
                }
            });
        } else if (viewMode != 'resources') {
            domElement.classList.remove('active');
        }

    };


    /**
     * Description
     * @method toggleEditMode
     * @param {} editMode
     * @return
     */
    function toggleEditMode(editMode) {

        if (editMode) {

        } else {

        }

        initList();

    };


    /**
     * Description
     * @method updateUserLogin
     * @return
     */
    function updateUserLogin(){

        initList();

    };


    /**
     * Description
     * @method refreshList
     * @return
     */
    function refreshList(){

        initList();

    };


    return {

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            viewSize:       changeViewSize,
            fullscreen:     toggleFullscreen,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,

            loggedIn:       updateUserLogin,

            // The map deliberately registers no onChange of its own, so that
            // the order in which we and it react to a state stays explicit.
            collabState:    function() {
                                var map = MapModule;
                                if (map && map.reflectLock) map.reflectLock();
                            }
        },

        create:      create,
        refreshList: refreshList,

        isMapMode:   isMapMode,

        /**
         * The lazily initialized ViewOverviewMap module, or null when this
         * instance uses the grid. Sidebar goes through here rather than
         * initializing the map module itself.
         */
        getMap:      getMap

    };

});
