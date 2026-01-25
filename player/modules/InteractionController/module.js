/**
 * @module Player
 */


/**
 * I am the InteractionController.
 *
 * I listen to key events which happen on window.document & and scroll events on the 'ViewVideo' element.
 * When the keycode is in the local map keyBindings, I call the bound method.
 *
 * @class InteractionController
 * @static
 */


FrameTrail.defineModule('InteractionController', function(FrameTrail){


    var keyBindings = {

        	"38": interfaceUp,
        	"40": interfaceDown,

        	"37": interfaceLeft,
        	"39": interfaceRight,

            "32": spaceKey,
            "88": xKey


        },
        scrollThreshold = 10,
        scrollUpBlocked = false,
        scrollDownBlocked = false,
        scrollLeftBlocked = false,
        scrollRightBlocked = false;

    var activityCheck, inactivityTimeout;


    /**
     * I set the event listener which triggers the appropriate event-handler.
     * @method initController
     * @return CallExpression or undefined
     */
    function initController() {

        scrollUpBlocked = false,
        scrollDownBlocked = false,
        scrollLeftBlocked = false,
        scrollRightBlocked = false;

        var namespace = 'FrameTrail'+ $(FrameTrail.getState('target')).attr('id') + $(FrameTrail.getState('target')).attr('data-movie-id') + $(FrameTrail.getState('target')).attr('data-scene-index');
        
    	$(document).off('keydown.'+ namespace).on('keydown.'+ namespace, function(evt){

    		// Save when ctrl+s or command+s
            if ((evt.metaKey || evt.ctrlKey) && evt.keyCode == 83) {
                FrameTrail.module('HypervideoModel').save();
                evt.preventDefault();
                return false;
            }

            // Undo/Redo when ctrl+z / ctrl+shift+z (or cmd on Mac)
            // Only when in edit mode and not focused on input/textarea/CodeMirror
            if ((evt.metaKey || evt.ctrlKey) && evt.keyCode == 90) {
                // Check if we're in edit mode and not in an editable element
                if (FrameTrail.getState('editMode') &&
                    evt.target.tagName !== 'INPUT' &&
                    evt.target.tagName !== 'TEXTAREA' &&
                    !$(evt.target).closest('.CodeMirror').length) {

                    if (evt.shiftKey) {
                        // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
                        FrameTrail.module('UndoManager').redo();
                    } else {
                        // Undo: Ctrl+Z / Cmd+Z
                        FrameTrail.module('UndoManager').undo();
                    }
                    evt.preventDefault();
                    return false;
                }
            }

            // Redo with Ctrl+Y (Windows convention)
            if ((evt.metaKey || evt.ctrlKey) && evt.keyCode == 89) {
                if (FrameTrail.getState('editMode') &&
                    evt.target.tagName !== 'INPUT' &&
                    evt.target.tagName !== 'TEXTAREA' &&
                    !$(evt.target).closest('.CodeMirror').length) {

                    FrameTrail.module('UndoManager').redo();
                    evt.preventDefault();
                    return false;
                }
            }

            if (	evt.target.tagName === 'INPUT'
    			 || evt.target.tagName === 'TEXTAREA') {

    			return;
    		}

    		return keyBindings[evt.keyCode] && keyBindings[evt.keyCode].call(this, evt);

    	});

        $(document).off('mousemove.'+ namespace).on('mousemove.'+ namespace, function(evt){

            FrameTrail.changeState('userActivity', true);

        });

        initActivityCheck();

        /*
        $('body').off('mousewheel'+ namespace, '.viewVideo').on('mousewheel'+ namespace, '.viewVideo', function(evt) {

            if (evt.deltaY >= scrollThreshold && !scrollUpBlocked) {

                scrollUpBlocked = true;
                interfaceUp();
                window.setTimeout(function() {
                    scrollUpBlocked = false;
                }, 700);

            } else if (evt.deltaY <= - scrollThreshold && !scrollDownBlocked) {

                scrollDownBlocked = true;
                interfaceDown();
                window.setTimeout(function() {
                    scrollDownBlocked = false;
                }, 700);

            } else if (evt.deltaX >= scrollThreshold && !scrollRightBlocked) {

                scrollRightBlocked = true;
                interfaceRight();
                window.setTimeout(function() {
                    scrollRightBlocked = false;
                }, 500);

            } else if (evt.deltaX <= - scrollThreshold && !scrollLeftBlocked) {

                scrollLeftBlocked = true;
                interfaceLeft();
                window.setTimeout(function() {
                    scrollLeftBlocked = false;
                }, 500);

            }

        });
        */


    };


    /**
     * I {{#crossLink "ViewVideo/slidePositionUp:method"}}slide the video view up{{#crossLink}}.
     *
     * In case the annotation position is set to 'top' and no annotation has been opened before, I try to {{#crossLink "Annotation/openAnnotation:method"}}open the first annotation{{/crossLink}}.
     *
     * @method interfaceUp
     */
    function interfaceUp(evt) {

        var ViewVideo = FrameTrail.module('ViewVideo');

        if ( FrameTrail.getState('slidePosition') == 'middle'
            && ViewVideo.AreaTopContainer.attr('data-size') != 'large'
            && ViewVideo.AreaTopDetails.find('.collectionElement').length != 0 ) {

            var activeContentViewContainer = ViewVideo.AreaTopContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length == 0 ) {
                activeContentViewContainer.find('.collectionElement').eq(0).click();
            } else {
                ViewVideo.shownDetails = 'top';
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {
            ViewVideo.shownDetails = null;
        }
        /*
        var currentAnnotation = FrameTrail.module('AnnotationsController').findTopMostActiveAnnotation();

    	if ( 	 FrameTrail.getState('hv_config_annotationsPosition') == 'top'
	    	 &&  FrameTrail.getState('hv_config_annotationsVisible')
             &&  FrameTrail.getState('slidePosition') == 'middle'
	    	 &&  currentAnnotation !== null) {

	    	currentAnnotation.openAnnotation();

	    } else {

	    	FrameTrail.module('ViewVideo').slidePositionUp();

	    }
        */

    };


    /**
     * I {{#crossLink "ViewVideo/slidePositionDown:method"}}slide the video view down{{#crossLink}}.
     *
     * In case the annotation position is set to 'bottom' and no annotation has been opened before, I try to {{#crossLink "Annotation/openAnnotation:method"}}open the first annotation{{/crossLink}}.
     * @method interfaceDown
     */
    function interfaceDown(evt) {

        var ViewVideo = FrameTrail.module('ViewVideo');

        if ( FrameTrail.getState('slidePosition') == 'middle'
            && ViewVideo.AreaBottomContainer.attr('data-size') != 'large'
            && ViewVideo.AreaBottomDetails.find('.collectionElement').length != 0 ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length == 0 ) {
                activeContentViewContainer.find('.collectionElement').eq(0).click();
            } else {
                ViewVideo.shownDetails = 'bottom';
            }

        } else if ( FrameTrail.getState('slidePosition') == 'top' ) {
            ViewVideo.shownDetails = null;
        }
        /*
        var currentAnnotation = FrameTrail.module('AnnotationsController').findTopMostActiveAnnotation();

	    if ( 	 FrameTrail.getState('hv_config_annotationsPosition') == 'bottom'
	    	 &&  FrameTrail.getState('hv_config_annotationsVisible')
             &&  FrameTrail.getState('slidePosition') == 'middle'
	    	 &&  currentAnnotation !== null) {

	    	currentAnnotation.openAnnotation();

	    } else {

	    	FrameTrail.module('ViewVideo').slidePositionDown();

	    }
        */

    };


    /**
     * I try to {{#crossLink "Annotation/openAnnotation:method"}}open the annotation{{/crossLink}} to the left of the currently selected annotation.
     *
     * @method interfaceLeft
     */
    function interfaceLeft(evt) {

        var ViewVideo = FrameTrail.module('ViewVideo');

        if ( FrameTrail.getState('slidePosition') == 'top' ) {

            var activeContentViewContainer = ViewVideo.AreaTopContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length != 0 ) {
                activeContentViewContainer.find('.collectionElement.open').prev('.collectionElement').click();
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length != 0 ) {
                activeContentViewContainer.find('.collectionElement.open').prev('.collectionElement').click();
            }

        }
        /*
        if ( FrameTrail.module('ViewVideo').shownDetails == 'annotations' ) {

            var currentAnnotation   = FrameTrail.module('AnnotationsController').openedAnnotation,
                annotations         = FrameTrail.module('HypervideoModel').annotations,
                idx                 = annotations.indexOf(currentAnnotation);

            if (idx < 1) return;

            FrameTrail.module('HypervideoModel').annotations[idx-1].openAnnotation();

        }
        */


    };


    /**
     * I try to {{#crossLink "Annotation/openAnnotation:method"}}open the annotation{{/crossLink}} to the right of the currently selected annotation.
     *
     * @method interfaceRight
     */
    function interfaceRight(evt) {

    	var ViewVideo = FrameTrail.module('ViewVideo');

        if ( FrameTrail.getState('slidePosition') == 'top' ) {

            var activeContentViewContainer = ViewVideo.AreaTopContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length != 0 ) {
                activeContentViewContainer.find('.collectionElement.open').next('.collectionElement').click();
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.find('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.find('.collectionElement.open').length != 0 ) {
                activeContentViewContainer.find('.collectionElement.open').next('.collectionElement').click();
            }

        }
        /*
        if ( FrameTrail.module('ViewVideo').shownDetails == 'annotations' ) {

            var currentAnnotation   = FrameTrail.module('AnnotationsController').openedAnnotation,
                annotations         = FrameTrail.module('HypervideoModel').annotations,
                idx                 = annotations.indexOf(currentAnnotation);

            if (idx < 0 || idx >= annotations.length-1) return;

            FrameTrail.module('HypervideoModel').annotations[idx+1].openAnnotation();

        }
        */

    };


    /**
     * When the space key is pressed, I toggle play / pause in the player
     *
     * @method spaceKey
     */
    function spaceKey(evt) {

        var HypervideoController = FrameTrail.module('HypervideoController');

        if ( HypervideoController.isPlaying ) {
            HypervideoController.pause();
        } else {
            HypervideoController.play();
        }

    };



    /**
     * When the "x" key is pressed, I change the xKey state so other modules can listen to the change
     *
     * @method xKey
     */
    function xKey(evt) {

        FrameTrail.changeState('xKey', true);

        $(document).one('keyup', function(evt) {

            if ( evt.keyCode == '88' ) {
                FrameTrail.changeState('xKey', false);
            }

        });

        evt.preventDefault();
        evt.stopPropagation();

    };

    function initActivityCheck() {
        
        if (!activityCheck) {
            activityCheck = setInterval(function() {

                // Check to see if the mouse has been moved
                if ( FrameTrail.getState('userActivity') || !FrameTrail.module('HypervideoController').isPlaying ) {

                    // Reset the activity tracker
                    FrameTrail.changeState('userActivity', false);

                    // If the user state was inactive, set the state to active
                    if (FrameTrail.getState('userActive') === false) {
                        FrameTrail.changeState('userActive', true);
                    }

                    // Clear any existing inactivity timeout to start the timer over
                    clearTimeout(inactivityTimeout);

                    // In X seconds, if no more activity has occurred 
                    // the user will be considered inactive
                    inactivityTimeout = setTimeout(function() {
                        // Protect against the case where the inactivity timeout can trigger
                        // before the next user activity is picked up  by the 
                        // activityCheck loop.

                        if (!FrameTrail.getState('userActivity')) {
                            FrameTrail.changeState('userActive', false);
                        }
                    }, 2000);
                }

            }, 250);
        }
        

    }


    return {

        onChange: {
            
        },

        initController: initController

    };

});
