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

    var domElement = $(    '<div class="viewOverview">'
                        +  '    <div class="overviewList"></div>'
                        +  '</div>'),

        OverviewList     = domElement.find('.overviewList'),
        animationElement = null,
        lastSelectedThumb = null;




    /**
     * Description
     * @method create
     * @return
     */
    function create() {

        $(FrameTrail.getState('target')).find('.mainContainer').append(domElement);

        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        OverviewList.perfectScrollbar({
            wheelSpeed: 4,
            suppressScrollX: true,
            wheelPropagation: true
        });

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

        OverviewList.find('.hypervideoThumb').remove();

        for (var id in hypervideos) {

            owner = hypervideos[id].creatorId === FrameTrail.module('UserManagement').userID;


            if ( !hypervideos[id].hidden || owner || admin ) {

                hypervideo = FrameTrail.newObject('Hypervideo', hypervideos[id])

                thumb = hypervideo.renderThumb();


                if ( (admin || owner) && editMode ) {

                    var hypervideoOptions = $('<div class="hypervideoOptions"></div>');
                    //TODO: check if options still necessary or empty
                    thumb.append(hypervideoOptions);

                }

                /*
                if (owner && editMode ) {

                    thumb.addClass('owner').css('border-color', '#' + userColor);

                }
                */

                if ( thumb.attr('data-hypervideoid') == FrameTrail.module('RouteNavigation').hypervideoID ) {
                    thumb.addClass('activeHypervideo');
                }

                thumb.css('transition-duration', '0ms');

                // open hypervideo without reloading the page
                thumb.click(function(evt) {

                    // prevent opening href location
                    evt.preventDefault();
                    evt.stopPropagation();

                    var clickedThumb = $(this);
                    var newHypervideoID = clickedThumb.attr('data-hypervideoid'),
                        update = (FrameTrail.module('RouteNavigation').hypervideoID == undefined) ? false : true;

                    // Store reference to clicked thumb for animation
                    lastSelectedThumb = clickedThumb;

                    //TODO: PUT IN SEPARATE FUNCTION

                    if ( FrameTrail.module('RouteNavigation').hypervideoID == newHypervideoID ) {

                        // Store the clicked thumb for animation in toggleViewMode
                        lastSelectedThumb = clickedThumb;
                        
                        // Just switch to video view - animation will happen in toggleViewMode
                        FrameTrail.changeState('viewMode', 'video');

                    } else {

                        if ( FrameTrail.getState('editMode') && FrameTrail.getState('unsavedChanges') ) {

                            var confirmDialog = $('<div class="confirmSaveChanges" title="'+ labels['MessageSaveChangesQuestionShort'] +'">'
                                                + '    <div class="message active">'+ labels['MessageSaveChanges'] +'</div>'
                                                + '    <p>'+ labels['MessageSaveChangesQuestion'] +'</p>'
                                                + '</div>');

                            confirmDialog.dialog({
                              resizable: false,
                              modal: true,
                              close: function() {
                                confirmDialog.remove();
                              },
                              buttons: {
                                'Yes': function() {

                                    // TODO: Show saving indicator in dialog

                                    FrameTrail.module('HypervideoModel').save(function(){

                                        history.pushState({
                                            editMode: FrameTrail.getState('editMode')
                                        }, "", "#hypervideo=" + newHypervideoID);

                                        FrameTrail.changeState('editMode', false);

                                        confirmDialog.dialog('close');

                                        OverviewList.find('.hypervideoThumb.activeHypervideo').removeClass('activeHypervideo');
                                        OverviewList.find('.hypervideoThumb[data-hypervideoid="'+ newHypervideoID +'"]').addClass('activeHypervideo');

                                        FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                                    });

                                },
                                'No, discard': function() {

                                    FrameTrail.changeState('unsavedChanges', false);

                                    confirmDialog.dialog('close');

                                    // TODO: Reload new hypervideo
                                    window.location.reload();

                                },
                                Cancel: function() {
                                  confirmDialog.dialog('close');
                                }
                              }
                            });



                        } else {

                            OverviewList.find('.hypervideoThumb.activeHypervideo').removeClass('activeHypervideo');
                            OverviewList.find('.hypervideoThumb[data-hypervideoid="'+ newHypervideoID +'"]').addClass('activeHypervideo');

                            history.pushState({
                                editMode: FrameTrail.getState('editMode')
                            }, "", "#hypervideo=" + newHypervideoID);

                            if ( FrameTrail.getState('editMode') ) {

                                FrameTrail.changeState('editMode', false);

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                            } else {

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, false, update);

                            }

                        }



                    }


                    //TODO END




                });

                OverviewList.append(thumb);

            }


        }

        changeViewSize();
        OverviewList.find('.hypervideoThumb').css('transition-duration', '');

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

        // Height is now set via CSS (100%), just update perfectScrollbar
        OverviewList.perfectScrollbar('update');

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
     * @param {jQuery} thumbElement The thumb element to animate
     * @param {Function} callback Function to call after animation completes
     * @param {Object} preCapturedRect Optional: thumb rect captured before overview is hidden
     */
    function animateThumbToFullSize(thumbElement, callback, preCapturedRect) {
        var mainContainer = $(FrameTrail.getState('target')).find('.mainContainer');
        var mainContainerRect = mainContainer[0].getBoundingClientRect();
        
        // Use pre-captured rect if provided, otherwise get it now
        var thumbRect = preCapturedRect || thumbElement[0].getBoundingClientRect();

        // Calculate positions relative to mainContainer
        var startWidth = thumbRect.width;
        var startHeight = thumbRect.height;
        var endWidth = mainContainerRect.width;
        var endHeight = mainContainerRect.height;

        // Get video container background color (like closing animation)
        var viewVideo = $(FrameTrail.getState('target')).find('.viewVideo');
        var videoContainer = viewVideo.find('.videoContainer').first();
        var bgColor = '#000';
        if (videoContainer.length > 0) {
            var computedStyle = window.getComputedStyle(videoContainer[0]);
            if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                bgColor = computedStyle.backgroundColor;
            }
        }

        // Create simple, scalable animation element (like closing animation)
        animationElement = $('<div></div>').css({
            position: 'fixed',
            left: thumbRect.left + 'px',
            top: thumbRect.top + 'px',
            width: startWidth + 'px',
            height: startHeight + 'px',
            margin: '0',
            padding: '0',
            zIndex: 10000,
            pointerEvents: 'none',
            transformOrigin: 'top left',
            overflow: 'hidden',
            backgroundColor: bgColor,
            border: '2px solid var(--primary-fg-color)',
            boxSizing: 'border-box',
            opacity: '1'
        });
        $('body').append(animationElement);

        // Hide the original thumb temporarily
        thumbElement.css('opacity', '0');

        // Animate to full size with opacity change
        if (typeof anime !== 'undefined') {
            anime({
                targets: animationElement[0],
                left: mainContainerRect.left + 'px',
                top: mainContainerRect.top + 'px',
                width: endWidth + 'px',
                height: endHeight + 'px',
                opacity: 1,
                duration: 400,
                easing: 'easeInOutQuad',
                complete: function() {
                    if (animationElement) {
                        animationElement.remove();
                        animationElement = null;
                    }
                    thumbElement.css('opacity', '');
                    if (callback) callback();
                }
            });
        } else {
            // Fallback if anime.js is not available
            animationElement.animate({
                left: mainContainerRect.left + 'px',
                top: mainContainerRect.top + 'px',
                width: endWidth + 'px',
                height: endHeight + 'px',
                opacity: 1
            }, 400, function() {
                if (animationElement) {
                    animationElement.remove();
                    animationElement = null;
                }
                thumbElement.css('opacity', '');
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
        domElement.addClass('active');
        changeViewSize();
        
        // Function to find thumb and perform animation
        function findThumbAndAnimate() {
            // Find the thumb element - try both attribute variations
            var thumbElement = OverviewList.find('.hypervideoThumb[data-hypervideoid="' + hypervideoID + '"]');
            if (thumbElement.length === 0) {
                // Try alternative attribute name (capital ID)
                thumbElement = OverviewList.find('.hypervideoThumb[data-hypervideoID="' + hypervideoID + '"]');
            }
            
            if (thumbElement.length === 0) {
                // Thumb not found yet, try again after a short delay
                window.setTimeout(findThumbAndAnimate, 50);
                return;
            }
            
            // Get thumb position relative to viewport
            var thumbRect = thumbElement[0].getBoundingClientRect();
            
            // Check if thumb has valid dimensions and position (not 0x0 and not at 0,0)
            if (thumbRect.width === 0 || thumbRect.height === 0 || 
                (thumbRect.left === 0 && thumbRect.top === 0 && thumbRect.width < 100)) {
                // Thumb not positioned yet, try again
                window.setTimeout(findThumbAndAnimate, 50);
                return;
            }

            // Create animation element - use a simple scalable representation
            // Instead of cloning the video container (which has fixed-size video elements that don't scale),
            // create a simple div that scales smoothly like the thumb does in the opening animation
            var computedStyle = capturedVideoContainer && capturedVideoContainer.length > 0 
                ? window.getComputedStyle(capturedVideoContainer[0]) 
                : null;
            
            // Get background color from the video container
            var bgColor = '#000';
            if (computedStyle && computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                bgColor = computedStyle.backgroundColor;
            }
            
            // Create a simple, scalable div (no nested elements with fixed sizes)
            // Add active border like the active hypervideo thumb has
            animationElement = $('<div></div>').css({
                position: 'fixed',
                left: mainContainerRect.left + 'px',
                top: mainContainerRect.top + 'px',
                width: mainContainerRect.width + 'px',
                height: mainContainerRect.height + 'px',
                margin: '0',
                padding: '0',
                zIndex: 10000,
                pointerEvents: 'none',
                transformOrigin: 'top left',
                overflow: 'hidden',
                backgroundColor: bgColor,
                border: '2px solid var(--primary-fg-color)',
                // Ensure all children scale with the element
                transform: 'scale(1)',
                boxSizing: 'border-box',
                opacity: '1'
            });
            
            $('body').append(animationElement);

            // Animate to thumb position with opacity change
            if (typeof anime !== 'undefined') {
                anime({
                    targets: animationElement[0],
                    left: thumbRect.left + 'px',
                    top: thumbRect.top + 'px',
                    width: thumbRect.width + 'px',
                    height: thumbRect.height + 'px',
                    opacity: 1,
                    duration: 400,
                    easing: 'easeInOutQuad',
                    complete: function() {
                        if (animationElement) {
                            animationElement.remove();
                            animationElement = null;
                        }
                        if (callback) callback();
                    }
                });
            } else {
                // Fallback if anime.js is not available
                animationElement.animate({
                    left: thumbRect.left + 'px',
                    top: thumbRect.top + 'px',
                    width: thumbRect.width + 'px',
                    height: thumbRect.height + 'px',
                    opacity: 1
                }, 400, function() {
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

        if (viewMode === 'overview') {
            // Animate from video view back to thumb position
            var currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
            if (oldViewMode === 'video' && currentHypervideoID) {
                // Capture video view immediately and synchronously (before other modules hide it)
                var viewVideo = $(FrameTrail.getState('target')).find('.viewVideo');
                var videoContainer = viewVideo.find('.videoContainer').first();
                var mainContainer = $(FrameTrail.getState('target')).find('.mainContainer');
                var mainContainerRect = mainContainer.length > 0 ? mainContainer[0].getBoundingClientRect() : null;
                
                // Check if we have a video view to animate from
                if (viewVideo.length > 0 && videoContainer.length > 0 && mainContainerRect) {
                    // Store reference to video container for animation
                    var capturedContainer = videoContainer;
                    
                    // Delay showing overview until animation completes
                    animateFullSizeToThumb(currentHypervideoID, capturedContainer, mainContainerRect, function() {
                        FrameTrail.module('Titlebar').title = labels['GenericOverview'];
                    });
                } else {
                    // Video view not available, just show overview
                    changeViewSize();
                    domElement.addClass('active');
                    FrameTrail.module('Titlebar').title = labels['GenericOverview'];
                }
            } else {
                changeViewSize();
                domElement.addClass('active');
                FrameTrail.module('Titlebar').title = labels['GenericOverview'];
            }
        } else if (viewMode === 'video' && oldViewMode === 'overview') {
            // Animate from thumb position to full size when switching from overview to video
            // Check if animation is already in progress
            if (animationElement && animationElement.length > 0) {
                // Animation already in progress, just hide overview
                domElement.removeClass('active');
                return;
            }
            
            // Use requestAnimationFrame to ensure ViewVideo has processed first, then hide it
            var viewVideo = $(FrameTrail.getState('target')).find('.viewVideo');
            requestAnimationFrame(function() {
                // Hide video view after ViewVideo has shown it
                viewVideo.removeClass('active');
                
                // Use the last selected thumb if available (from click), otherwise find active thumb
                var thumbToAnimate = lastSelectedThumb;
                
                if (!thumbToAnimate || thumbToAnimate.length === 0) {
                    // Find the active hypervideo thumb
                    var currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
                    if (currentHypervideoID) {
                        thumbToAnimate = OverviewList.find('.hypervideoThumb.activeHypervideo');
                        if (thumbToAnimate.length === 0) {
                            // Try alternative attribute name
                            thumbToAnimate = OverviewList.find('.hypervideoThumb[data-hypervideoid="' + currentHypervideoID + '"]');
                            if (thumbToAnimate.length === 0) {
                                thumbToAnimate = OverviewList.find('.hypervideoThumb[data-hypervideoID="' + currentHypervideoID + '"]');
                            }
                        }
                    }
                }
                
                if (thumbToAnimate && thumbToAnimate.length > 0) {
                    // Clear the stored thumb
                    lastSelectedThumb = null;
                    
                    // Capture thumb position while overview is still visible
                    var thumbRect = thumbToAnimate[0].getBoundingClientRect();
                    
                    // Only animate if thumb has valid position (not at 0,0 with tiny size)
                    if (thumbRect.width > 0 && thumbRect.height > 0 && 
                        !(thumbRect.left === 0 && thumbRect.top === 0 && thumbRect.width < 100)) {
                        
                        // Hide overview during animation
                        domElement.removeClass('active');
                        
                        // Animate thumb to full size, passing the pre-captured rect
                        animateThumbToFullSize(thumbToAnimate, function() {
                            // Animation complete, now show the video view
                            viewVideo.addClass('active');
                            // Ensure ViewVideo is properly initialized
                            if (FrameTrail.module('ViewVideo') && FrameTrail.module('ViewVideo').onChange && FrameTrail.module('ViewVideo').onChange.viewMode) {
                                FrameTrail.module('ViewVideo').onChange.viewMode('video');
                            }
                        }, thumbRect);
                    } else {
                        // Thumb position not valid, show video view immediately
                        viewVideo.addClass('active');
                        domElement.removeClass('active');
                    }
                } else {
                    // Thumb not found, show video view immediately
                    viewVideo.addClass('active');
                    domElement.removeClass('active');
                }
            });
        } else if (viewMode != 'resources') {
            domElement.removeClass('active');
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

            loggedIn:       updateUserLogin
        },

        create:      create,
        refreshList: refreshList

    };

});
