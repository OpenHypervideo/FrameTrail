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

    // Prevent accidental drag-selection of text within FrameTrail's own UI.
    // Uses pointer events to cover both mouse and touch input.
    // Double/triple-click word/line selection is still allowed via e.detail >= 2.
    //
    // Scope notes (important — this used to be a document-wide block):
    //  - The block only applies inside this FrameTrail instance's root element,
    //    so text on the surrounding host page (when FrameTrail is embedded) stays
    //    selectable.
    //  - Selectable content regions are exempted: the interactive transcript,
    //    form fields, contenteditable areas, and anything opting in via the
    //    .ft-selectable class. This lets users select transcript text while
    //    overlay/timeline/slider dragging is still protected.
    document.addEventListener('pointerdown', function(e) {
        if (e.pointerType !== 'mouse') return; // touch/pen don't trigger selectstart
        if (e.detail >= 2) return;

        // Only guard within this instance's own UI; never touch host-page selection.
        var rootSelector = FrameTrail.getState('target');
        if (!rootSelector || !e.target.closest(rootSelector)) return;

        // Leave genuinely selectable regions alone.
        if (e.target.closest('[contenteditable], input, textarea, .transcriptContainer, .customhtmlContainer, .ft-selectable')) return;

        function onSelectStart(evt) {
            evt.preventDefault();
        }
        function onUp() {
            document.removeEventListener('selectstart', onSelectStart);
            document.removeEventListener('pointerup', onUp);
        }
        document.addEventListener('selectstart', onSelectStart);
        document.addEventListener('pointerup', onUp);
    });


    var keyBindings = {

            "38": interfaceUp,
            "40": interfaceDown,

            "37": interfaceLeft,
            "39": interfaceRight,

            "32": spaceKey


        },
        scrollThreshold = 10,
        scrollUpBlocked = false,
        scrollDownBlocked = false,
        scrollLeftBlocked = false,
        scrollRightBlocked = false;

    var activityCheck, inactivityTimeout;
    var _keydownHandler = null, _mousemoveHandler = null;


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

        var targetEl = document.querySelector(FrameTrail.getState('target'));

        if (_keydownHandler) { document.removeEventListener('keydown', _keydownHandler); }
        _keydownHandler = function(evt){

            // Save when ctrl+s or command+s
            if ((evt.metaKey || evt.ctrlKey) && evt.keyCode == 83) {
                if (FrameTrail.module('StorageManager').canSave()) {
                    FrameTrail.module('HypervideoModel').save();
                } else {
                    FrameTrail.module('HypervideoModel').saveAs();
                }
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
                    !evt.target.closest('.cm-editor')) {

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
                    !evt.target.closest('.cm-editor')) {

                    FrameTrail.module('UndoManager').redo();
                    evt.preventDefault();
                    return false;
                }
            }

            if (    evt.target.tagName === 'INPUT'
                 || evt.target.tagName === 'TEXTAREA') {

                return;
            }

            return keyBindings[evt.keyCode] && keyBindings[evt.keyCode].call(this, evt);

        };
        document.addEventListener('keydown', _keydownHandler);

        if (_mousemoveHandler) {
            document.removeEventListener('mousemove', _mousemoveHandler);
            document.removeEventListener('pointermove', _mousemoveHandler);
        }
        _mousemoveHandler = function(evt){
            FrameTrail.changeState('userActivity', true);
        };
        document.addEventListener('mousemove', _mousemoveHandler);
        document.addEventListener('pointermove', _mousemoveHandler);

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
            && ViewVideo.AreaTopContainer.getAttribute('data-size') != 'large'
            && !!ViewVideo.AreaTopDetails.querySelector('.collectionElement') ) {

            var activeContentViewContainer = ViewVideo.AreaTopContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && !activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _first = activeContentViewContainer.querySelector('.collectionElement'); if (_first) _first.click();
            } else {
                ViewVideo.shownDetails = 'top';
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {
            ViewVideo.shownDetails = null;
        }
        /*
        var currentAnnotation = FrameTrail.module('AnnotationsController').findTopMostActiveAnnotation();

        if (     FrameTrail.getState('hv_config_annotationsPosition') == 'top'
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
            && ViewVideo.AreaBottomContainer.getAttribute('data-size') != 'large'
            && !!ViewVideo.AreaBottomDetails.querySelector('.collectionElement') ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && !activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _first = activeContentViewContainer.querySelector('.collectionElement'); if (_first) _first.click();
            } else {
                ViewVideo.shownDetails = 'bottom';
            }

        } else if ( FrameTrail.getState('slidePosition') == 'top' ) {
            ViewVideo.shownDetails = null;
        }
        /*
        var currentAnnotation = FrameTrail.module('AnnotationsController').findTopMostActiveAnnotation();

        if (     FrameTrail.getState('hv_config_annotationsPosition') == 'bottom'
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

            var activeContentViewContainer = ViewVideo.AreaTopContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _open = activeContentViewContainer.querySelector('.collectionElement.open');
                var prev = _open.previousElementSibling;
                while (prev && !prev.classList.contains('collectionElement')) { prev = prev.previousElementSibling; }
                if (prev) prev.click();
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _open = activeContentViewContainer.querySelector('.collectionElement.open');
                var prev = _open.previousElementSibling;
                while (prev && !prev.classList.contains('collectionElement')) { prev = prev.previousElementSibling; }
                if (prev) prev.click();
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

            var activeContentViewContainer = ViewVideo.AreaTopContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _open = activeContentViewContainer.querySelector('.collectionElement.open');
                var nxt = _open.nextElementSibling;
                while (nxt && !nxt.classList.contains('collectionElement')) { nxt = nxt.nextElementSibling; }
                if (nxt) nxt.click();
            }

        } else if ( FrameTrail.getState('slidePosition') == 'bottom' ) {

            var activeContentViewContainer = ViewVideo.AreaBottomContainer.querySelector('.contentViewContainer.active');
            if ( activeContentViewContainer && activeContentViewContainer.querySelector('.collectionElement.open') ) {
                var _open = activeContentViewContainer.querySelector('.collectionElement.open');
                var nxt = _open.nextElementSibling;
                while (nxt && !nxt.classList.contains('collectionElement')) { nxt = nxt.nextElementSibling; }
                if (nxt) nxt.click();
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
