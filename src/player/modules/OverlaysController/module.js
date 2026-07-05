/**
 * @module Player
 */


/**
 * I am the OverlaysController. I am responsible for managing all the {{#crossLink "Overlay"}}overlays{{/crossLink}}
 * in the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}}, and for displaying them for viewing and editing.
 *
 * @class OverlaysController
 * @static
 */


FrameTrail.defineModule('OverlaysController', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var ViewVideo               = FrameTrail.module('ViewVideo'),
        overlays                = FrameTrail.module('HypervideoModel').overlays,

        overlayInFocus  = null,

        syncedMedia     = [],

        updateControlsStart      = function(){},
        updateControlsEnd        = function(){},
        updateControlsDimensions = function(){},

        // Shared state for clone-drag drop position (set by draggable, read by droppable)
        _ftDragClone = null;




    /**
     * I tell all overlays in the
     * {{#crossLink "HypervideoModel/overlays:attribute"}}HypervideoModel/overlays attribute{{/crossLink}}
     * to render themselves into the DOM.
     *
     * @method initController
     */
    function initController() {

        for (var idx in overlays) {

            overlays[idx].renderInDOM();

        }

    };


    /**
     * I am the central method for coordinating the time-based state of the overlays.
     * I switch them active or inactive based on the current time.
     *
     * @method updateStatesOfOverlays
     * @param {Number} currentTime
     */
    function updateStatesOfOverlays(currentTime) {

        var overlay;

        for (var idx in overlays) {

            overlay = overlays[idx];

            if (    overlay.data.start <= currentTime
                 && overlay.data.end   >= currentTime) {

                if (!overlay.activeState) {

                    overlay.setActive();

                }

                if (overlay.syncedMedia) {
                    // endOffset
                    var endTime = (overlay.data.endOffset != 0) ? overlay.data.endOffset : overlay.mediaElement.duration;
                    if (overlay.mediaElement.currentTime > endTime) {
                        overlay.mediaElement.pause();
                        overlay.mediaElement.currentTime = endTime;
                    }

                }


            } else {

                if (overlay.activeState) {

                    overlay.setInactive();

                }

            }

        }

        if (overlayInFocus && !overlayInFocus.activeState) {
            overlayInFocus.setActive(true);
        } else if (overlayInFocus) {
            overlayInFocus.setActive();
        }

    };


    /**
     * I add an overlay to an array, which is used by
     * {{#crossLink "OverlaysController/syncMedia:method"}}this.syncMedia(){{/crossLink}}
     * to keep time-based overlays in sync with the main video.
     *.
     * @method addSyncedMedia
     * @param {Overlay} overlay
     */
    function addSyncedMedia(overlay) {

        if (syncedMedia.indexOf(overlay) < 0){

            syncedMedia.push(overlay);
            syncMedia();

        }

    };


    /**
     * I remove the overlay given as argument from the array of synced media.
     * See also {{#crossLink "OverlaysController/syncMedia:method"}}this.syncMedia(){{/crossLink}}
     *
     * @method removeSyncedMedia
     * @param {Overlay} overlay
     */
    function removeSyncedMedia(overlay) {

        var idx = syncedMedia.indexOf(overlay);

        if (idx > -1) {
            syncedMedia.splice(idx, 1);
            // Note: Currently, the only synced media type is 'video' and 'audio', so we shortcut it
            overlay.mediaElement.pause();
        }

    };


    /**
     * I synchronize the currentTime and the play/pause state of all
     * overlays in the array of syncedMedia with the main video.
     *
     * @method syncMedia
     */
    function syncMedia() {

        var HypervideoController = FrameTrail.module('HypervideoController'),
            isPlaying    = HypervideoController.isPlaying,
            currentTime  = HypervideoController.currentTime,
            overlay;

        for (var idx in syncedMedia) {

            overlay = syncedMedia[idx];

            if (!overlay.mediaElement) {
                continue;
            }

            overlay.mediaElement.currentTime = currentTime - overlay.data.start + overlay.data.startOffset;

            if (overlay.mediaElement.readyState === 0 && currentTime > overlay.data.start) {
                // init on first interaction
                if (isPlaying) {
                    var playPromise = overlay.mediaElement.play();
                    if (playPromise) {
                        playPromise.then(function() {
                            HypervideoController.pause();
                        }).catch(function(){
                            console.log('PLAY ERROR: ', this);
                        });
                    }
                } else {
                    overlay.mediaElement.load();
                }
            } else {
                var endTime = (overlay.data.endOffset != 0) ? overlay.data.endOffset : overlay.mediaElement.duration;
                if (overlay.mediaElement.currentTime > endTime) {

                    overlay.mediaElement.pause();
                    overlay.mediaElement.currentTime = endTime;

                }

                if (isPlaying) {
                    if (overlay.mediaElement.paused) {
                        var playPromise = overlay.mediaElement.play();
                        if (playPromise) {
                            playPromise.catch(function(){
                                console.log('PLAY ERROR: ', this);
                            });
                        }
                    }
                } else {
                    var pausePromise = overlay.mediaElement.pause();
                    if (pausePromise) {
                        pausePromise.catch(function(){
                            //console.log('PAUSE ERROR: ', this);
                        });
                    }
                }
            }

        }

    };



    /**
     * I check for all registered synchronized media, if the time index exceeds a tolerance limit
     * and - if needed - resynchronize "off-media" efficiently while playing.
     *
     * @method checkMediaSynchronization
     */
    function checkMediaSynchronization() {

        var HypervideoController = FrameTrail.module('HypervideoController'),
            isPlaying    = HypervideoController.isPlaying,
            currentTime  = HypervideoController.currentTime,
            overlay;

        for (var i = 0, l = syncedMedia.length; i < l; i++) {
            overlay = syncedMedia[i];

            if (overlay.mediaElement) {

                // off by 0.01 seconds
                if (overlay.mediaElement.currentTime - (currentTime - overlay.data.start + overlay.data.startOffset) > 0.01) {

                    //console.log('lag detected', overlay.mediaElement.currentTime - (currentTime + overlay.data.start));
                    overlay.mediaElement.currentTime = currentTime - overlay.data.start + overlay.data.startOffset;

                }

            }

        }

    };



    /**
     * I set the muted state of all media overlays (currently only <video>).
     *
     * @method muteMedia
     */
    function muteMedia(muted) {


        var overlay;

        for (var idx in overlays) {

            overlay = overlays[idx];

            if ( overlay.data.type == 'video' || overlay.data.type == 'audio' ) {
                try {
                    overlay.mediaElement.muted = muted;
                } catch(e) {}
            }

        }


    };


    /**
     * I react to a change in the global state "editMode".
     *
     * When we enter the editMode "overlays", I prepare all {{#crossLink "Overlay"}}overlays{{/crossLink}}
     * and the editor interface elements.
     *
     * When leaving the editMode "overlays", I restore them.
     *
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

        if(editMode === 'overlays' && oldEditMode !== 'overlays') {

            for (var idx in overlays) {

                overlays[idx].startEditing();

            }

            stackTimelineView();
            initEditOptions();
            makeTimelineDroppable(true);


        } else if (oldEditMode === 'overlays' && editMode !== 'overlays') {

            for (var idx in overlays) {

                overlays[idx].stopEditing();

            }

            setOverlayInFocus(null);
            resetTimelineView();
            makeTimelineDroppable(false);


        }

    };



    /**
     * I trigger the {{#crossLink "Overlay/scaleOverlayElement:method"}}scaleOverlayElement{{/crossLink}}
     * method for all overlays.
     * @method rescaleOverlays
     */
    function rescaleOverlays() {

        for (var idx in overlays) {
            overlays[idx].scaleOverlayElement();
        }

    };



    /**
     * I change the behavior and appearnace of the timeline of overlays, so
     * that overlays are displayed "stacked" and do not overlap each other.
     * @method stackTimelineView
     */
    function stackTimelineView() {

        var scroller = ViewVideo.OverlayTimeline.querySelector('.timelineScroller');
        if (scroller) {
            // Reset inline heights first so elements resolve to their CSS-defined height
            // (avoids circular dependency: elements height:100% → scroller min-height:100% → inflated)
            scroller.style.height = ''; scroller.style.flexBasis = '';
            ViewVideo.OverlayTimeline.style.height = ''; ViewVideo.OverlayTimeline.style.minHeight = ''; ViewVideo.OverlayTimeline.style.flexBasis = '';
            CollisionDetection(scroller, {spacing:0, includeVerticalMargins: true, exclude: '.timelinePlayhead', containerPadding: 4});
            // Read the inline value CollisionDetection just wrote (not getComputedStyle which is affected by CSS min-height:100%)
            var stackedHeight = scroller.style.height;
            ViewVideo.OverlayTimeline.style.height = stackedHeight;
            ViewVideo.OverlayTimeline.style.flexBasis = stackedHeight;
            ViewVideo.OverlayTimeline.style.flexShrink = '0';
        } else {
            CollisionDetection(ViewVideo.OverlayTimeline, {spacing:0, includeVerticalMargins: true});
        }
        ViewVideo.adjustLayout();
        ViewVideo.adjustHypervideo();

        if (FrameTrail.module('TimelineController').initialized) {
            FrameTrail.module('TimelineController').refreshMinimap();
        }

    };



    /**
     * I reset the timeline to its default CSS configuration.
     * @method resetTimelineView
     */
    function resetTimelineView() {

        ViewVideo.OverlayTimeline.style.height = ''; ViewVideo.OverlayTimeline.style.minHeight = ''; ViewVideo.OverlayTimeline.style.flexBasis = ''; ViewVideo.OverlayTimeline.style.flexShrink = '';
        var target = ViewVideo.OverlayTimeline.querySelector('.timelineScroller');
        if (target) {
            target.style.height = ''; target.style.flexBasis = '';
        }
        var _timelineSource = target || ViewVideo.OverlayTimeline;
        _timelineSource.querySelectorAll('.timelineElement').forEach(function(el) {
            el.style.top = ''; el.style.right = ''; el.style.bottom = ''; el.style.height = '';
        });

    };



    /**
     * I make the overlay container (not the timeline, despite my name)
     * ready to accept dropped elements. These elements are thumbnails rendered from
     * from the respective [ResourceType]/renderThumb() method.
     *
     * Upon drop, I read the meta-data stored in the data attributes of the thumbelement,
     * and create and initialize the new overlay object.
     *
     * When my parameter is not true, I reset the drop functionality of the overlay container.
     *
     * @method makeTimelineDroppable
     * @param {Boolean} droppable
     */
    function makeTimelineDroppable(droppable) {

        if (droppable) {

            interact(ViewVideo.OverlayContainer).dropzone({
                accept:  '.resourceThumb',
                overlap: 'pointer',
                ondropactivate:   function(e) { e.target.classList.add('droppableActive'); },
                ondropdeactivate: function(e) { e.target.classList.remove('droppableActive', 'droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondragenter:      function(e) { e.target.classList.add('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.add('highlight'); },
                ondragleave:      function(e) { e.target.classList.remove('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondrop: function(e) {
                    var $dragged        = e.relatedTarget,
                        resourceID      = $dragged.getAttribute('data-resourceID'),
                        videoDuration   = FrameTrail.module('HypervideoModel').duration,
                        startTime       = FrameTrail.module('HypervideoController').currentTime,
                        endTime         = (startTime + 4 > videoDuration) ? videoDuration : startTime + 4,
                        containerRect   = ViewVideo.OverlayContainer.getBoundingClientRect(),
                        _activeClone    = _ftDragClone || window._ftCurrentDragClone,
                        cloneLeft       = _activeClone ? parseFloat(_activeClone.style.left) : e.dragEvent.clientX,
                        cloneTop        = _activeClone ? parseFloat(_activeClone.style.top)  : e.dragEvent.clientY,
                        tmpOffsetLeft   = cloneLeft - containerRect.left,
                        tmpOffsetTop    = cloneTop  - containerRect.top,
                        overlayPositionLeft = 100 * (tmpOffsetLeft / ViewVideo.OverlayContainer.offsetWidth),
                        overlayPositionTop  = 100 * (tmpOffsetTop  / ViewVideo.OverlayContainer.offsetHeight),
                        newOverlay;

                        if ($dragged.dataset.type == 'text') {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name": labels['ResourceCustomTextHTML'], "type": $dragged.dataset.type,
                                "start": startTime, "end": endTime, "attributes": { "text": "" },
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 30, "height": 30 }
                            });
                        } else if ($dragged.dataset.type == 'html') {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name": labels['ResourceCustomHTML'], "type": $dragged.dataset.type,
                                "start": startTime, "end": endTime, "attributes": { "text": "" },
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 30, "height": 30 }
                            });
                        } else if ($dragged.dataset.type == 'quiz') {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name": labels['ResourceTypeQuiz'], "type": $dragged.dataset.type,
                                "start": startTime, "end": endTime,
                                "attributes": {
                                    "question": labels['SettingsQuizDefaultQuestion'],
                                    "answers": [
                                        { 'text': labels['SettingsQuizDefaultAnswer1'], 'correct': false },
                                        { 'text': labels['SettingsQuizDefaultAnswer2'], 'correct': true  },
                                        { 'text': labels['SettingsQuizDefaultAnswer3'], 'correct': false }
                                    ],
                                    "onCorrectAnswer": { "jumpForward": false, "resumePlayback": true,  "showText": false },
                                    "onWrongAnswer":   { "jumpBackward": false, "resumePlayback": false, "showText": false }
                                },
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 30, "height": 30 }
                            });
                        } else if ($dragged.dataset.type == 'hotspot') {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name": "Hotspot / Link", "type": $dragged.dataset.type,
                                "start": startTime, "end": endTime,
                                "attributes": { "color": "#0096ff", "linkUrl": "", "borderWidth": 5, "shape": "circle", "borderRadius": 10 },
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 20, "height": 30 }
                            });
                        } else if ($dragged.dataset.type == 'button') {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name": labels['ResourceTypeButton'], "type": $dragged.dataset.type,
                                "start": startTime, "end": endTime,
                                "attributes": { "label": labels['ResourceTypeButton'], "action": "", "actionTarget": "", "buttonColor": "#0096ff", "textColor": "#ffffff", "borderRadius": 4 },
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 20, "height": 12 }
                            });
                        } else {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "start": startTime, "end": endTime, "resourceId": resourceID,
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 30, "height": 30 }
                            });
                        }

                    newOverlay.renderInDOM();
                    newOverlay.startEditing();
                    updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();

                    // Register undo command for adding overlay
                    (function(overlayData) {
                        var findOverlay = function() {
                            var overlays = FrameTrail.module('HypervideoModel').overlays;
                            for (var i = 0; i < overlays.length; i++) {
                                if (overlays[i].data.created === overlayData.created) { return overlays[i]; }
                            }
                            return null;
                        };
                        FrameTrail.module('UndoManager').register({
                            category: 'overlays',
                            description: labels['SidebarOverlays'] + ' ' + labels['GenericAdd'],
                            undo: function() {
                                var overlay = findOverlay();
                                if (overlay) { deleteOverlay(overlay, true); }
                            },
                            redo: function() {
                                var restoredOverlay = FrameTrail.module('HypervideoModel').newOverlay(overlayData, true);
                                restoredOverlay.renderInDOM();
                                restoredOverlay.startEditing();
                                updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
                                stackTimelineView();
                                FrameTrail.module('TimelineController').refreshMinimap();
                            }
                        });
                    })(JSON.parse(JSON.stringify(newOverlay.data)));

                    var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight');
                }
            });

        } else {

            interact(ViewVideo.OverlayContainer).unset();

        }

    };



    /**
     * I set the overlay from the parameter (when given) "in focus" and remove any previous overlay from focus.
     *
     * @method setOverlayInFocus
     * @param {Overlay} overlay
     */
    function setOverlayInFocus(overlay) {

        if (overlayInFocus) {

            overlayInFocus.permanentFocusState = false;
            overlayInFocus.removedFromFocus();

            removePropertiesControls();
        }

        overlayInFocus = overlay;

        if (overlayInFocus) {
            overlayInFocus.gotInFocus();
        }

        updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);

        return overlay;

    };


    /**
     * When an overlay got "into focus", its {{#crossLink "Overlay/gotInFocus:method"}}gotInFocus method{{/crossLink}}
     * calls this method, to do two jobs:
     * * first, append the properties controls elements to the respective DOM element.
     * * secondly, save references to the update functions of the control interface, so that the textual data values of the controls (like start and end time or dimensions) can be updated, when they are changed directly by mouse interactions with the timeline or overlay element.
     *
     * @method renderPropertiesControls
     * @param {Object} propertiesControlsInterface
     */
    function renderPropertiesControls(propertiesControlsInterface) {

        ViewVideo.EditPropertiesContainer.innerHTML = '';
        ViewVideo.EditPropertiesContainer.classList.add('active');
        ViewVideo.EditPropertiesContainer.appendChild(propertiesControlsInterface.controlsContainer);

        updateControlsStart        = propertiesControlsInterface.changeStart;
        updateControlsEnd          = propertiesControlsInterface.changeEnd;
        updateControlsDimensions   = propertiesControlsInterface.changeDimensions;

        ViewVideo.switchInfoTab('properties');
        var _otabs = ViewVideo.EditPropertiesContainer.querySelector('.overlayOptionsTabs');
        if (_otabs) { FTTabs(_otabs, 'refresh'); } // Phase 2 bridge

        var cm6Wrapper = ViewVideo.EditPropertiesContainer.querySelector('.cm6-wrapper');
        if ( cm6Wrapper && cm6Wrapper._cm6view ) { cm6Wrapper._cm6view.requestMeasure(); }


    };


    /**
     * I am the counterpart of {{#crossLink "OverlaysController/renderPropertiesControls:method"}}renderPropertiesControls method{{/crossLink}}.
     * I remove the DOM element and the update functions.
     * @method removePropertiesControls
     */
    function removePropertiesControls() {


        updateControlsStart      = function(){};

        updateControlsEnd        = function(){};

        updateControlsDimensions = function(){};

        ViewVideo.EditPropertiesContainer.classList.remove('active'); ViewVideo.EditPropertiesContainer.innerHTML = '';
        ViewVideo.switchInfoTab('add');

    }



    /**
     * I am the central function for deleting an overlay.
     * I call all other methods necessary to delete it.
     *
     * @method deleteOverlay
     * @param {Overlay} overlay
     * @param {Boolean} skipUndo - If true, don't register undo command (used during undo/redo)
     */
    function deleteOverlay(overlay, skipUndo) {

        // Capture data before deletion for undo
        var overlayData = JSON.parse(JSON.stringify(overlay.data));

        setOverlayInFocus(null);
        overlay.removeFromDOM();
        FrameTrail.module('HypervideoModel').removeOverlay(overlay);
        stackTimelineView();
        FrameTrail.module('TimelineController').refreshMinimap();

        // Register undo command
        if (!skipUndo) {
            FrameTrail.module('UndoManager').register({
                category: 'overlays',
                description: labels['SidebarOverlays'] + ' ' + labels['GenericDelete'],
                undo: function() {
                    // Recreate the overlay
                    var newOverlay = FrameTrail.module('HypervideoModel').newOverlay(overlayData, true);
                    newOverlay.renderInDOM();
                    newOverlay.startEditing();
                    updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();
                },
                redo: function() {
                    // Find the overlay by matching data and delete it again
                    var overlaysArray = FrameTrail.module('HypervideoModel').overlays;
                    for (var i = 0; i < overlaysArray.length; i++) {
                        if (overlaysArray[i].data.created === overlayData.created) {
                            deleteOverlay(overlaysArray[i], true);
                            break;
                        }
                    }
                }
            });
        }

    };


    /**
     * I change the stacking order of the given overlay relative to all other overlays
     * by rewriting the zIndex attribute (overlay.data.attributes.zIndex) of all overlays.
     *
     * Possible actions: 'front', 'forward', 'backward', 'back'.
     *
     * @method arrangeOverlay
     * @param {Overlay} overlay
     * @param {String} action
     */
    function arrangeOverlay(overlay, action) {

        var beforeState = overlays.map(function(o) {
            return { id: o.data.created, zIndex: o.data.attributes.zIndex };
        });

        // Normalize: assign contiguous zIndex values (0..n-1) based on the current
        // effective stacking order (explicit zIndex, falling back to creation order)
        var sorted = overlays.slice().sort(function(a, b) {
            var za = (a.data.attributes.zIndex != null) ? a.data.attributes.zIndex : overlays.indexOf(a),
                zb = (b.data.attributes.zIndex != null) ? b.data.attributes.zIndex : overlays.indexOf(b);
            return (za - zb) || (overlays.indexOf(a) - overlays.indexOf(b));
        });
        sorted.forEach(function(o, i) { o.data.attributes.zIndex = i; });

        var idx = sorted.indexOf(overlay);

        switch (action) {
            case 'forward':
                if (idx < sorted.length - 1) {
                    sorted[idx + 1].data.attributes.zIndex = idx;
                    overlay.data.attributes.zIndex = idx + 1;
                }
                break;
            case 'backward':
                if (idx > 0) {
                    sorted[idx - 1].data.attributes.zIndex = idx;
                    overlay.data.attributes.zIndex = idx - 1;
                }
                break;
            case 'front':
                for (var i = idx + 1; i < sorted.length; i++) {
                    sorted[i].data.attributes.zIndex = i - 1;
                }
                overlay.data.attributes.zIndex = sorted.length - 1;
                break;
            case 'back':
                for (var j = 0; j < idx; j++) {
                    sorted[j].data.attributes.zIndex = j + 1;
                }
                overlay.data.attributes.zIndex = 0;
                break;
        }

        for (var k = 0; k < overlays.length; k++) {
            overlays[k].updateOverlayElement();
        }

        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

        var afterState = overlays.map(function(o) {
            return { id: o.data.created, zIndex: o.data.attributes.zIndex };
        });

        var applyState = function(state) {
            var allOverlays = FrameTrail.module('HypervideoModel').overlays;
            state.forEach(function(entry) {
                for (var i = 0; i < allOverlays.length; i++) {
                    if (allOverlays[i].data.created === entry.id) {
                        if (entry.zIndex != null) {
                            allOverlays[i].data.attributes.zIndex = entry.zIndex;
                        } else {
                            delete allOverlays[i].data.attributes.zIndex;
                        }
                        allOverlays[i].updateOverlayElement();
                        break;
                    }
                }
            });
            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
        };

        FrameTrail.module('UndoManager').register({
            category: 'overlays',
            description: labels['SidebarOverlays'] + ' ' + labels['SettingsArrange'],
            undo: function() { applyState(beforeState); },
            redo: function() { applyState(afterState); }
        });

    };


    var _canvasSnapLineVertical   = null,
        _canvasSnapLineHorizontal = null;

    /**
     * I collect the snap target positions for canvas dragging/resizing:
     * the overlay container's edges and center, plus the edges of all other
     * currently visible overlay elements. Positions are px values relative
     * to the overlay container.
     *
     * @method getCanvasSnapTargets
     * @param {HTMLElement} excludeElement
     * @return {} vertical/horizontal target arrays
     */
    function getCanvasSnapTargets(excludeElement) {

        var container  = ViewVideo.OverlayContainer,
            vertical   = [0, container.offsetWidth / 2, container.offsetWidth],
            horizontal = [0, container.offsetHeight / 2, container.offsetHeight];

        for (var idx in overlays) {
            var el = overlays[idx].overlayElement;
            if (!el || el === excludeElement) { continue; }
            if (!el.classList.contains('active')) { continue; }
            vertical.push(el.offsetLeft, el.offsetLeft + el.offsetWidth);
            horizontal.push(el.offsetTop, el.offsetTop + el.offsetHeight);
        }

        return { vertical: vertical, horizontal: horizontal };

    };


    function showCanvasSnapLine(axis, position) {

        var container = ViewVideo.OverlayContainer,
            line;

        if (axis === 'vertical') {
            if (!_canvasSnapLineVertical) {
                _canvasSnapLineVertical = document.createElement('div');
                _canvasSnapLineVertical.className = 'canvasSnapLine vertical';
            }
            line = _canvasSnapLineVertical;
            line.style.left = position + 'px';
        } else {
            if (!_canvasSnapLineHorizontal) {
                _canvasSnapLineHorizontal = document.createElement('div');
                _canvasSnapLineHorizontal.className = 'canvasSnapLine horizontal';
            }
            line = _canvasSnapLineHorizontal;
            line.style.top = position + 'px';
        }

        if (line.parentElement !== container) {
            container.appendChild(line);
        }

    };


    function hideCanvasSnapLine(axis) {

        var line = (axis === 'vertical') ? _canvasSnapLineVertical : _canvasSnapLineHorizontal;
        if (line && line.parentElement) {
            line.remove();
        }

    };


    /**
     * I remove both canvas snap lines from the DOM (if present).
     * @method clearCanvasSnapLines
     */
    function clearCanvasSnapLines() {

        hideCanvasSnapLine('vertical');
        hideCanvasSnapLine('horizontal');

    };


    /**
     * I snap a dragged overlay element to canvas targets (edges, center, other overlays).
     * I show/hide ephemeral snap lines and return the adjusted position.
     *
     * @method snapCanvasDrag
     * @param {HTMLElement} element
     * @param {Number} x
     * @param {Number} y
     * @return {} adjusted x/y
     */
    function snapCanvasDrag(element, x, y) {

        var ViewVideoModule = FrameTrail.module('ViewVideo'),
            targets   = getCanvasSnapTargets(element),
            tolerance = 8,
            width     = element.offsetWidth,
            height    = element.offsetHeight;

        var bestX = null;
        [{ value: x, offset: 0 }, { value: x + width / 2, offset: width / 2 }, { value: x + width, offset: width }].forEach(function(candidate) {
            var snapped = ViewVideoModule.closestSnapTarget(candidate.value, targets.vertical, tolerance);
            if (snapped !== null) {
                var distance = Math.abs(snapped - candidate.value);
                if (!bestX || distance < bestX.distance) {
                    bestX = { snapped: snapped, distance: distance, offset: candidate.offset };
                }
            }
        });
        if (bestX) {
            x = bestX.snapped - bestX.offset;
            showCanvasSnapLine('vertical', bestX.snapped);
        } else {
            hideCanvasSnapLine('vertical');
        }

        var bestY = null;
        [{ value: y, offset: 0 }, { value: y + height / 2, offset: height / 2 }, { value: y + height, offset: height }].forEach(function(candidate) {
            var snapped = ViewVideoModule.closestSnapTarget(candidate.value, targets.horizontal, tolerance);
            if (snapped !== null) {
                var distance = Math.abs(snapped - candidate.value);
                if (!bestY || distance < bestY.distance) {
                    bestY = { snapped: snapped, distance: distance, offset: candidate.offset };
                }
            }
        });
        if (bestY) {
            y = bestY.snapped - bestY.offset;
            showCanvasSnapLine('horizontal', bestY.snapped);
        } else {
            hideCanvasSnapLine('horizontal');
        }

        return { x: x, y: y };

    };


    /**
     * I snap the moving edges of a resized overlay element to canvas targets.
     * I show/hide ephemeral snap lines and return the adjusted rect.
     *
     * @method snapCanvasResize
     * @param {HTMLElement} element
     * @param {} rect (left/top/width/height in px)
     * @param {} edges (interact.js edges object)
     * @return {} adjusted rect
     */
    function snapCanvasResize(element, rect, edges) {

        var ViewVideoModule = FrameTrail.module('ViewVideo'),
            targets   = getCanvasSnapTargets(element),
            tolerance = 8,
            snapped;

        if (edges.left) {
            snapped = ViewVideoModule.closestSnapTarget(rect.left, targets.vertical, tolerance);
            if (snapped !== null) {
                rect.width += rect.left - snapped;
                rect.left = snapped;
                showCanvasSnapLine('vertical', snapped);
            } else {
                hideCanvasSnapLine('vertical');
            }
        } else if (edges.right) {
            snapped = ViewVideoModule.closestSnapTarget(rect.left + rect.width, targets.vertical, tolerance);
            if (snapped !== null) {
                rect.width = snapped - rect.left;
                showCanvasSnapLine('vertical', snapped);
            } else {
                hideCanvasSnapLine('vertical');
            }
        }

        if (edges.top) {
            snapped = ViewVideoModule.closestSnapTarget(rect.top, targets.horizontal, tolerance);
            if (snapped !== null) {
                rect.height += rect.top - snapped;
                rect.top = snapped;
                showCanvasSnapLine('horizontal', snapped);
            } else {
                hideCanvasSnapLine('horizontal');
            }
        } else if (edges.bottom) {
            snapped = ViewVideoModule.closestSnapTarget(rect.top + rect.height, targets.horizontal, tolerance);
            if (snapped !== null) {
                rect.height = snapped - rect.top;
                showCanvasSnapLine('horizontal', snapped);
            } else {
                hideCanvasSnapLine('horizontal');
            }
        }

        return rect;

    };


    /**
     * I prepare the "edit options" area, when the overlay editing mode is started.
     * I fill the space with a list of thumbnails representing all resources, which can then be dragged onto the overlay container.
     *
     * See {{#crossLink "OverlaysController/makeTimelineDroppable:method"}}makeTimelineDroppable(){{/crossLink}}.
     *
     * @method initEditOptions
     */
    function initEditOptions(){

        ViewVideo.EditingOptions.innerHTML = '';

        var _hint = document.createElement('div');
        _hint.className = 'message active';
        _hint.innerHTML = '<span class="icon-object-ungroup"></span> ' + labels['MessageHintDragOverlays'];
        ViewVideo.EditingOptions.appendChild(_hint);

        var _oeWrapper = document.createElement('div');
        _oeWrapper.innerHTML = '<div class="overlayEditingTabs">'
                            +  '    <ul>'
                            +  '        <li>'
                            +  '            <a href="#ResourceList">'+ labels['ResourceChoose'] +'</a>'
                            +  '        </li>'
                            +  '        <li>'
                            +  '            <a href="#CustomOverlay">'+ labels['ResourceAddCustomOverlay'] +'</a>'
                            +  '        </li>'
                            +  '    </ul>'
                            +  '    <div id="ResourceList"></div>'
                            +  '    <div id="CustomOverlay"></div>'
                            +  '</div>';
        var overlayEditingOptions = _oeWrapper.firstElementChild;
        FTTabs(overlayEditingOptions, { heightStyle: 'fill' }); // Phase 2 bridge

        ViewVideo.EditingOptions.appendChild(overlayEditingOptions);

        FrameTrail.module('ResourceManager').renderResourcePicker(
            overlayEditingOptions.querySelector('#ResourceList')
        );

        /* Append custom text resource to 'Custom Overlay' tab */
        // TODO: Move to separate function
        var _tw = document.createElement('div');
        _tw.innerHTML = '<div class="resourceThumb" data-type="text">'
                + '    <div class="resourceOverlay">'
                + '        <div class="resourceIcon"><span class="icon-doc-text"></div>'
                + '    </div>'
                + '    <div class="resourceTitle">'+ labels['ResourceCustomTextHTML'] +'</div>'
                + '</div>';
        var textElement = _tw.firstElementChild;

        var _hlw = document.createElement('div');
        _hlw.innerHTML = '<div class="resourceThumb" data-type="html">'
                + '    <div class="resourceOverlay">'
                + '        <div class="resourceIcon"><span class="icon-file-code"></div>'
                + '    </div>'
                + '    <div class="resourceTitle">'+ labels['ResourceCustomHTML'] +'</div>'
                + '</div>';
        var htmlElement = _hlw.firstElementChild;

        var _qw = document.createElement('div');
        _qw.innerHTML = '<div class="resourceThumb" data-type="quiz">'
                + '    <div class="resourceOverlay">'
                + '        <div class="resourceIcon"><span class="icon-question-circle-o"></div>'
                + '    </div>'
                + '    <div class="resourceTitle">Quiz</div>'
                + '</div>';
        var quizElement = _qw.firstElementChild;

        var _hw = document.createElement('div');
        _hw.innerHTML = '<div class="resourceThumb" data-type="hotspot">'
                + '    <div class="resourceOverlay">'
                + '        <div class="resourceIcon"><span class="icon-link"></div>'
                + '    </div>'
                + '    <div class="resourceTitle">Hotspot / Link</div>'
                + '</div>';
        var hotspotElement = _hw.firstElementChild;

        var _bw = document.createElement('div');
        _bw.innerHTML = '<div class="resourceThumb" data-type="button">'
                + '    <div class="resourceOverlay">'
                + '        <div class="resourceIcon"><span class="icon-mouse-pointer"></div>'
                + '    </div>'
                + '    <div class="resourceTitle">'+ labels['ResourceTypeButton'] +'</div>'
                + '</div>';
        var buttonThumbElement = _bw.firstElementChild;

        var thumbDraggableOpts = {
            listeners: {
                start: function(e) {
                    var rect = e.target.getBoundingClientRect();
                    _ftDragClone = e.target.cloneNode(true);
                    _ftDragClone.style.position = 'fixed';
                    _ftDragClone.style.zIndex = '1000';
                    _ftDragClone.style.pointerEvents = 'auto';
                    _ftDragClone.style.boxSizing = 'border-box';
                    _ftDragClone.style.width = rect.width + 'px';
                    _ftDragClone.style.height = rect.height + 'px';
                    _ftDragClone.style.left = rect.left + 'px';
                    _ftDragClone.style.top = rect.top + 'px';
                    _ftDragClone.classList.add('ft-drag-clone');
                    document.body.appendChild(_ftDragClone);
                    e.target.classList.add('dragPlaceholder');
                    document.body.classList.add('ft-dragging');
                },
                move: function(e) {
                    if (_ftDragClone) {
                        _ftDragClone.style.left = (parseFloat(_ftDragClone.style.left) + e.dx) + 'px';
                        _ftDragClone.style.top  = (parseFloat(_ftDragClone.style.top)  + e.dy) + 'px';
                    }
                },
                end: function(e) {
                    e.target.classList.remove('dragPlaceholder');
                    if (_ftDragClone) { _ftDragClone.remove(); _ftDragClone = null; }
                    document.body.classList.remove('ft-dragging');
                }
            }
        };
        [textElement, htmlElement, quizElement, hotspotElement, buttonThumbElement].forEach(function(el) {
            interact(el).draggable(thumbDraggableOpts);
        });

        overlayEditingOptions.querySelector('#CustomOverlay').append(textElement, htmlElement, quizElement, hotspotElement, buttonThumbElement);

    };


    return {

        onChange: {

            editMode:        toggleEditMode

        },

        initController:         initController,
        updateStatesOfOverlays: updateStatesOfOverlays,
        stackTimelineView:      stackTimelineView,
        rescaleOverlays:        rescaleOverlays,

        addSyncedMedia:         addSyncedMedia,
        removeSyncedMedia:      removeSyncedMedia,
        syncMedia:              syncMedia,
        checkMediaSynchronization: checkMediaSynchronization,
        muteMedia:              muteMedia,

        deleteOverlay:          deleteOverlay,
        arrangeOverlay:         arrangeOverlay,

        snapCanvasDrag:         snapCanvasDrag,
        snapCanvasResize:       snapCanvasResize,
        clearCanvasSnapLines:   clearCanvasSnapLines,

        renderPropertiesControls: renderPropertiesControls,

        /**
         * I hold the overlay "in focus", which is choosen by selecting the timeline element or the overlay element.
         * I use the {{#crossLink "OverlaysController/setOverlayInFocus:method"}}setOverlayInFocus{{/crossLink}} method.
         * @attribute overlayInFocus
         * @type Overlay or null
         */
        set overlayInFocus(overlay) { return setOverlayInFocus(overlay) },
        get overlayInFocus()        { return overlayInFocus             },

        /**
         * I hold the callback function for start time (overlay.data.start) of the properties controls interface
         * (see {{#crossLink "OverlaysController/renderPropertiesControls:method"}}renderPropertiesControls{{/crossLink}}).
         *
         * I am called from the "drag" event handler in {{#crossLink "Overlay/makeTimelineElementDraggable:method"}}Overlay/makeTimelineElementDraggable(){{/crossLink}}
         * and from the "resize" event handler in {{#crossLink "Overlay/makeTimelineElementResizeable:method"}}Overlay/makeTimelineElementResizeable(){{/crossLink}}.
         *
         * @attribute updateControlsStart
         * @type Function
         * @readOnly
         */
        get updateControlsStart()      {  return updateControlsStart     },
        /**
         * I hold the callback function for end time (overlay.data.end) of the properties controls interface
         * (see {{#crossLink "OverlaysController/renderPropertiesControls:method"}}renderPropertiesControls{{/crossLink}}).
         *
         * I am called from the "drag" event handler in {{#crossLink "Overlay/makeTimelineElementDraggable:method"}}Overlay/makeTimelineElementDraggable(){{/crossLink}}
         * and from the "resize" event handler in {{#crossLink "Overlay/makeTimelineElementResizeable:method"}}Overlay/makeTimelineElementResizeable(){{/crossLink}}.
         *
         * @attribute updateControlsEnd
         * @type Function
         * @readOnly
         */
        get updateControlsEnd()        {  return updateControlsEnd       },
        /**
         * I hold the callback function for dimension attributes (overlay.data.position[]) of the properties controls interface
         * (see {{#crossLink "OverlaysController/renderPropertiesControls:method"}}renderPropertiesControls{{/crossLink}}).
         *
         * I am called from the "drag" event handler in {{#crossLink "Overlay/makeOverlayElementDraggable:method"}}Overlay/makeOverlayElementDraggable(){{/crossLink}}
         * and from the "resize" event handler in {{#crossLink "Overlay/makeOverlayElementResizeable:method"}}Overlay/makeOverlayElementResizeable(){{/crossLink}}.
         *
         * @attribute updateControlsDimensions
         * @type Function
         * @readOnly
         */
        get updateControlsDimensions() { return updateControlsDimensions }

    };

});
