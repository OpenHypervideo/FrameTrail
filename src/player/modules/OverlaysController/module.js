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

        var overlay,
            OverlayAnimator = FrameTrail.module('OverlayAnimator');

        for (var idx in overlays) {

            overlay = overlays[idx];

            // Arm / disarm animated overlays first, so an overlay activated below
            // is already showing the right frame of its animations.
            if (OverlayAnimator) {
                OverlayAnimator.updatePresence(overlay, currentTime);
            }

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

        if (overlayInFocus) {
            // Selected but not shown at the playhead: show it as a ghost
            var inSpan  = overlayInFocus.data.start <= currentTime && overlayInFocus.data.end >= currentTime,
                present = OverlayAnimator ? OverlayAnimator.isPresent(overlayInFocus) : false;
            overlayInFocus.setGhost(!inSpan && !present);
            refreshMotionControls(overlayInFocus);
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
            ViewVideo.OverlayTimeline.addEventListener('click', onTimelineClick);


        } else if (oldEditMode === 'overlays' && editMode !== 'overlays') {

            for (var idx in overlays) {

                overlays[idx].stopEditing();

            }

            setOverlayInFocus(null);
            resetTimelineView();
            makeTimelineDroppable(false);
            ViewVideo.OverlayTimeline.removeEventListener('click', onTimelineClick);


        }

    };



    /**
     * I trigger the {{#crossLink "Overlay/scaleOverlayElement:method"}}scaleOverlayElement{{/crossLink}}
     * method for all overlays.
     * @method rescaleOverlays
     */
    function rescaleOverlays() {

        // Animation presets express travel distances relative to the stage
        var container = ViewVideo.OverlayContainer;
        if (container) {
            container.style.setProperty('--ft-stage-min', Math.min(container.offsetWidth, container.offsetHeight) + 'px');
        }

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
                        tileID          = $dragged.dataset.tile,
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

                        var tile = tileID ? getCustomOverlayTile(tileID) : null;

                        if (tile) {
                            var protoData = {
                                "name":       tile.name || tile.label,
                                "type":       tile.type,
                                "start":      startTime,
                                "end":        endTime,
                                "attributes": JSON.parse(JSON.stringify(tile.attributes)),
                                "position":   { "top": overlayPositionTop, "left": overlayPositionLeft, "width": tile.size[0], "height": tile.size[1] }
                            };
                            if (tile.events) {
                                protoData.events = JSON.parse(JSON.stringify(tile.events));
                            }
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay(protoData);
                        } else {
                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "start": startTime, "end": endTime, "resourceId": resourceID,
                                "position": { "top": overlayPositionTop, "left": overlayPositionLeft, "width": 30, "height": 30 }
                            });
                        }

                    newOverlay.renderInDOM();
                    newOverlay.startEditing();

                    // Kinds that are made to move (e.g. the cursor) start with box motion on
                    if (tile && tile.motion) {
                        newOverlay.setMotionEnabled(true);
                    }

                    updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();

                    registerAddUndo(newOverlay);

                    // Kinds whose shape is drawn (the freeform hotspot) start in draw mode
                    if (tile && tile.draw) {
                        selectOverlay(newOverlay);
                        FrameTrail.module('FreeformShapeEditor').startDrawing(newOverlay);
                    }

                    var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight');
                }
            });

        } else {

            interact(ViewVideo.OverlayContainer).unset();

        }

    };



    /**
     * I return the tiles of the "Custom Overlay" gallery: one per overlay kind or
     * variant, each with the data a dropped overlay starts with. The first four
     * (Text, Custom HTML, Quiz, Hotspot) keep their long-standing defaults; Quiz
     * and Hotspot pass no events, so newOverlay() adds the pausing onStart handler.
     *
     * @method getCustomOverlayTiles
     * @return {Array}
     * @private
     */
    function getCustomOverlayTiles() {

        // attributes.text is stored HTML-escaped (see ResourceText.renderContent).
        // Only markup Quill is configured for survives an edit round-trip: inline
        // colour / size spans (sizes from its whitelist) and paragraph alignment.
        var escapeHtml = function(html) {
            var escapeHelper = document.createElement('div');
            escapeHelper.appendChild(document.createTextNode(html));
            return escapeHelper.innerHTML;
        };

        var hotspotVariant = function(shape, extra) {
            var attributes = {
                "color": "#ffd23f", "linkUrl": "", "borderWidth": 6, "shape": shape, "borderRadius": 10,
                "animation": { "in": { "preset": "draw" }, "out": { "preset": "fadeOut" } }
            };
            for (var key in extra) { attributes[key] = extra[key]; }
            return attributes;
        };

        return [
            {
                id: 'text', type: 'text', icon: 'icon-doc-text', label: labels['ResourceCustomTextHTML'],
                attributes: { "text": "" }, size: [30, 30]
            },
            {
                id: 'html', type: 'html', icon: 'icon-file-code', label: labels['ResourceCustomHTML'],
                attributes: { "text": "" }, size: [30, 30]
            },
            {
                id: 'quiz', type: 'quiz', icon: 'icon-question-circle-o', label: 'Quiz', name: labels['ResourceTypeQuiz'],
                attributes: {
                    "questionType": "multipleChoice",
                    "question": labels['SettingsQuizDefaultQuestion'],
                    "answers": [
                        { 'text': labels['SettingsQuizDefaultAnswer1'], 'correct': false },
                        { 'text': labels['SettingsQuizDefaultAnswer2'], 'correct': true  },
                        { 'text': labels['SettingsQuizDefaultAnswer3'], 'correct': false }
                    ],
                    "onCorrectAnswer": { "jumpForward": false, "resumePlayback": true,  "showText": false },
                    "onWrongAnswer":   { "jumpBackward": 10, "resumePlayback": true, "showText": false }
                },
                size: [30, 30]
            },
            {
                id: 'hotspot', type: 'hotspot', icon: 'icon-link', label: 'Hotspot / Link',
                attributes: { "color": "#0096ff", "linkUrl": "", "borderWidth": 5, "shape": "circle", "borderRadius": 10 },
                size: [20, 30]
            },
            {
                id: 'card', type: 'text', icon: 'icon-vcard', label: labels['CustomOverlayCard'],
                attributes: {
                    "title": labels['CustomOverlayCardTitle'],
                    "text": escapeHtml('<p><span style="font-size: 22px;">' + labels['CustomOverlayCardText'] + '</span></p>'),
                    "box": { "background": "#ffffff", "titleColor": "#14161a", "padding": 28, "radius": 14, "shadow": true },
                    "animation": { "in": { "preset": "slideFromBottom" }, "out": { "preset": "fadeOut" } }
                },
                size: [34, 32], events: {}
            },
            {
                id: 'quote', type: 'text', icon: 'icon-quote-left', label: labels['CustomOverlayQuote'],
                attributes: {
                    "text": escapeHtml(
                          '<p><span style="font-size: 30px;">“' + labels['CustomOverlayQuoteText'] + '”</span></p>'
                        + '<p><span style="color: rgb(96, 102, 112); font-size: 18px;">— ' + labels['CustomOverlayQuoteAuthor'] + '</span></p>'
                    ),
                    "box": { "background": "#f4f2ee", "padding": 32, "radius": 6, "borderWidth": 0 },
                    "animation": { "in": { "preset": "fadeIn", "duration": 600 }, "out": { "preset": "fadeOut" } }
                },
                size: [40, 30], events: {}
            },
            {
                id: 'notification', type: 'text', icon: 'icon-bell', label: labels['CustomOverlayNotification'],
                attributes: {
                    "title": labels['CustomOverlayNotificationTitle'],
                    "text": escapeHtml('<p><span style="color: rgb(214, 218, 224); font-size: 20px;">' + labels['CustomOverlayNotificationText'] + '</span></p>'),
                    "box": { "background": "#1f2329", "titleColor": "#ffffff", "padding": 22, "radius": 16, "shadow": true },
                    "animation": { "in": { "preset": "slideFromTop", "duration": 600, "ease": "springQuick" }, "out": { "preset": "slideToTop" } }
                },
                size: [34, 18], events: {}
            },
            {
                id: 'arrow', type: 'hotspot', icon: 'icon-right-big', label: labels['CustomOverlayArrow'],
                attributes: hotspotVariant('arrow', { "direction": "right", "curve": "straight" }),
                size: [22, 10], events: {}
            },
            {
                id: 'curvedArrow', type: 'hotspot', icon: 'icon-reply', label: labels['CustomOverlayCurvedArrow'],
                attributes: hotspotVariant('arrow', { "direction": "right", "curve": "curved" }),
                size: [22, 18], events: {}
            },
            {
                id: 'underline', type: 'hotspot', icon: 'icon-underline', label: labels['CustomOverlayUnderline'],
                attributes: hotspotVariant('underline', {}),
                size: [24, 6], events: {}
            },
            {
                id: 'freeform', type: 'hotspot', icon: 'icon-brush', label: labels['CustomOverlayFreeform'],
                attributes: hotspotVariant('freeform', {
                    "points": [{ "x": 50, "y": 4 }, { "x": 96, "y": 36 }, { "x": 80, "y": 94 }, { "x": 20, "y": 94 }, { "x": 4, "y": 36 }],
                    "path": "M50,4 L96,36 L80,94 L20,94 L4,36 Z",
                    "borderWidth": 4
                }),
                size: [20, 30], events: {}, draw: true
            },
            {
                id: 'cursor', type: 'cursor', icon: 'icon-mouse-pointer', label: labels['ResourceTypeCursor'],
                attributes: { "style": "arrow", "color": "#ffffff", "outlineColor": "#111111", "clicks": [] },
                size: [4, 8], motion: true, events: {}
            },
            {
                id: 'counter', type: 'counter', icon: 'icon-hashtag', label: labels['ResourceTypeCounter'],
                attributes: {
                    "from": 0, "to": 1250, "decimals": 0, "prefix": "", "suffix": "",
                    "duration": 1500, "ease": "power2Out", "style": "count",
                    "color": "#ffffff", "weight": 700, "align": "center"
                },
                size: [24, 16], events: {}
            },
            {
                id: 'barChart', type: 'chart', icon: 'icon-chart-bar', label: labels['CustomOverlayBarChart'],
                attributes: { "chartType": "bars", "data": "2022: 40\n2023: 65\n2024: 90", "unit": "", "color": "#4cc3ff", "highlight": 0, "showValues": true, "duration": 1500, "textColor": "#ffffff" },
                size: [36, 36], events: {}
            },
            {
                id: 'lineChart', type: 'chart', icon: 'icon-chart-line-data', label: labels['CustomOverlayLineChart'],
                attributes: { "chartType": "line", "data": "Jan: 12\nFeb: 19\nMar: 15\nApr: 28\nMay: 33", "unit": "", "color": "#4cc3ff", "highlight": 0, "showValues": true, "duration": 1800, "textColor": "#ffffff" },
                size: [40, 32], events: {}
            },
            {
                id: 'donutChart', type: 'chart', icon: 'icon-chart-pie', label: labels['CustomOverlayDonutChart'],
                attributes: { "chartType": "donut", "data": "A: 55\nB: 30\nC: 15", "unit": "%", "color": "#4cc3ff", "highlight": 0, "showValues": true, "duration": 1500, "textColor": "#ffffff" },
                size: [26, 40], events: {}
            },
            {
                id: 'progressRing', type: 'chart', icon: 'icon-chart-ring', label: labels['CustomOverlayProgressRing'],
                attributes: { "chartType": "ring", "data": "72", "unit": "%", "color": "#4cc3ff", "highlight": 0, "showValues": true, "duration": 1500, "textColor": "#ffffff" },
                size: [20, 34], events: {}
            }
        ];

    }

    /**
     * I return one tile of the "Custom Overlay" gallery by its id.
     *
     * @method getCustomOverlayTile
     * @param {String} id
     * @return {Object|null}
     * @private
     */
    function getCustomOverlayTile(id) {

        var tiles = getCustomOverlayTiles();
        for (var i = 0; i < tiles.length; i++) {
            if (tiles[i].id === id) { return tiles[i]; }
        }
        return null;

    }


    /**
     * I add an overlay from its data (as FrameTrailSerializer.parseOverlay reads it, with created set) and show it — in the overlays editor ready for editing, in other modes only on the video and its timeline.
     *
     * @method addOverlay
     * @param {Object} data
     * @return {Overlay}
     */
    function addOverlay(data) {

        var overlay = FrameTrail.module('HypervideoModel').newOverlay(data, true);

        overlay.renderInDOM();

        if (FrameTrail.getState('editMode') === 'overlays') {
            overlay.startEditing();
            stackTimelineView();
        }

        updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
        FrameTrail.module('TimelineController').refreshMinimap();

        return overlay;

    };


    /**
     * I replace all data of an overlay (its type stays) and show the change, also in its properties controls when it is selected.
     *
     * @method replaceOverlayData
     * @param {Overlay} overlay
     * @param {Object} data
     */
    function replaceOverlayData(overlay, data) {

        overlay.replaceData(data);

        if (FrameTrail.getState('editMode') === 'overlays') {
            stackTimelineView();
        }

        refreshPropertiesControls(overlay);
        refreshMotionControls(overlay);
        updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);
        FrameTrail.module('TimelineController').refreshMinimap();

        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

    };


    /**
     * I register an undo command for a newly added overlay.
     *
     * @method registerAddUndo
     * @param {Overlay} overlay
     * @private
     */
    function registerAddUndo(overlay) {

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
        })(JSON.parse(JSON.stringify(overlay.data)));

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
            overlayInFocus.setGhost(false);
            overlayInFocus.removedFromFocus();

            removePropertiesControls();
        }

        var OverlayAnimationEditor = FrameTrail.module('OverlayAnimationEditor');
        if (OverlayAnimationEditor) {
            OverlayAnimationEditor.closeKeyframeMenu();
        }

        overlayInFocus = overlay;

        if (overlayInFocus) {
            overlayInFocus.gotInFocus();
        }

        var FreeformShapeEditor = FrameTrail.module('FreeformShapeEditor');
        if (FreeformShapeEditor) {
            FreeformShapeEditor.select(overlayInFocus);
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
     * I re-render the properties controls of an overlay, if it is the one in focus
     * (e.g. after undo/redo changed data the controls show). The active tab is kept.
     *
     * @method refreshPropertiesControls
     * @param {Overlay} overlay
     */
    function refreshPropertiesControls(overlay) {

        if (!overlay || overlayInFocus !== overlay) {
            return;
        }

        renderPropertiesControls(overlay.resourceItem.renderPropertiesControls(overlay));

    }


    /**
     * I select an overlay for editing (it stays selected until something else
     * is selected or the selection is cleared). Selecting never moves the playhead.
     *
     * @method selectOverlay
     * @param {Overlay} overlay
     */
    function selectOverlay(overlay) {

        if (overlayInFocus !== overlay) {
            setOverlayInFocus(overlay);
        }
        if (overlay) {
            overlay.permanentFocusState = true;
        }

    }


    /**
     * I update the box controls of the overlay in focus after its box or the
     * playhead changed: the position and rotation inputs follow the (moving)
     * box, the keyframe toggle on the video and the diamonds mark the keyframe
     * at the playhead, the rotate handle finds room next to the box.
     *
     * @method refreshMotionControls
     * @param {Overlay} overlay
     */
    function refreshMotionControls(overlay) {

        if (!overlay || overlayInFocus !== overlay) {
            return;
        }

        var t    = FrameTrail.module('HypervideoController').currentTime,
            rect = overlay.getRectAt(overlay.editTime());

        ['top', 'left', 'width', 'height', 'rotation'].forEach(function(prop) {
            var input = ViewVideo.EditPropertiesContainer.querySelector('.position' + prop.charAt(0).toUpperCase() + prop.slice(1));
            if (input && document.activeElement !== input) {
                input.value = Math.round(rect[prop] * 1000) / 1000;
            }
        });

        overlay.updateKeyframeToggle(t);
        overlay.updateKeyframeMarkerState(t);
        overlay.updateRotateHandle();

    }


    /**
     * A click on empty space in the overlay timeline clears the selection.
     *
     * @method onTimelineClick
     * @param {Event} evt
     */
    function onTimelineClick(evt) {

        if (FrameTrail.getState('editMode') !== 'overlays' || evt.target.closest('.timelineElement')) {
            return;
        }
        setOverlayInFocus(null);

    }


    /**
     * I register an undo command that restores snapshots taken with
     * Overlay.snapshotState() (the overlay is found again by its creation time).
     *
     * @method registerStateUndo
     * @param {Overlay} overlay
     * @param {String} description
     * @param {Object} before
     * @param {Object} after
     * @param {Object} options  passed to Overlay.applyState (e.g. { rerender: true })
     */
    function registerStateUndo(overlay, description, before, after, options) {

        if (JSON.stringify(before) === JSON.stringify(after)) {
            return;
        }

        var overlayId = overlay.data.created;

        var findOverlay = function() {
            var allOverlays = FrameTrail.module('HypervideoModel').overlays;
            for (var i = 0; i < allOverlays.length; i++) {
                if (allOverlays[i].data.created === overlayId) { return allOverlays[i]; }
            }
            return null;
        };

        var apply = function(state) {
            var o = findOverlay();
            if (!o) { return; }
            o.applyState(state, options);
            stackTimelineView();
            refreshPropertiesControls(o);
            refreshMotionControls(o);
            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
        };

        FrameTrail.module('UndoManager').register({
            category: 'overlays',
            description: description,
            undo: function() { apply(before); },
            redo: function() { apply(after); }
        });

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

        if (overlayInFocus === overlay) {
            setOverlayInFocus(null);
        }
        overlay.removeFromDOM();
        FrameTrail.module('HypervideoModel').removeOverlay(overlay);
        // Outside the overlays editor the timeline is not stacked.
        if (FrameTrail.getState('editMode') === 'overlays') {
            stackTimelineView();
        }
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

        // Visual bounding boxes, so rotated and moving overlays snap where they are seen
        var containerRect = container.getBoundingClientRect();

        for (var idx in overlays) {
            var el = overlays[idx].overlayElement;
            if (!el || el === excludeElement) { continue; }
            if (!el.classList.contains('active')) { continue; }
            var rect = el.getBoundingClientRect();
            vertical.push(rect.left - containerRect.left, rect.right - containerRect.left);
            horizontal.push(rect.top - containerRect.top, rect.bottom - containerRect.top);
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
     * A rotated element snaps with the edges of its rotated bounding box.
     *
     * @method snapCanvasDrag
     * @param {HTMLElement} element
     * @param {Number} x
     * @param {Number} y
     * @param {Number} rotation (optional, degrees)
     * @return {} adjusted x/y
     */
    function snapCanvasDrag(element, x, y, rotation) {

        var ViewVideoModule = FrameTrail.module('ViewVideo'),
            targets   = getCanvasSnapTargets(element),
            tolerance = 5,
            width     = element.offsetWidth,
            height    = element.offsetHeight,
            theta     = (rotation || 0) * Math.PI / 180,
            halfW     = (Math.abs(width * Math.cos(theta)) + Math.abs(height * Math.sin(theta))) / 2,
            halfH     = (Math.abs(width * Math.sin(theta)) + Math.abs(height * Math.cos(theta))) / 2;

        var bestX = null;
        [{ value: x + width / 2 - halfW, offset: width / 2 - halfW }, { value: x + width / 2, offset: width / 2 }, { value: x + width / 2 + halfW, offset: width / 2 + halfW }].forEach(function(candidate) {
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
        [{ value: y + height / 2 - halfH, offset: height / 2 - halfH }, { value: y + height / 2, offset: height / 2 }, { value: y + height / 2 + halfH, offset: height / 2 + halfH }].forEach(function(candidate) {
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
            tolerance = 5,
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

        /* Gallery of custom overlays (one tile per overlay kind / variant) */
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

        var gallery = overlayEditingOptions.querySelector('#CustomOverlay');

        getCustomOverlayTiles().forEach(function(tile) {
            var thumb = document.createElement('div');
            thumb.className = 'resourceThumb';
            thumb.dataset.type = tile.type;
            thumb.dataset.tile = tile.id;
            thumb.innerHTML = '<div class="resourceOverlay">'
                            + '    <div class="resourceIcon"><span class="'+ tile.icon +'"></span></div>'
                            + '</div>'
                            + '<div class="resourceTitle"></div>';
            thumb.querySelector('.resourceTitle').textContent = tile.label;
            interact(thumb).draggable(thumbDraggableOpts);
            gallery.appendChild(thumb);
        });

    };


    return {

        onChange: {

            editMode:        toggleEditMode

        },

        initController:         initController,
        updateStatesOfOverlays: updateStatesOfOverlays,
        registerStateUndo:      registerStateUndo,
        refreshPropertiesControls: refreshPropertiesControls,
        refreshMotionControls:  refreshMotionControls,
        selectOverlay:          selectOverlay,
        stackTimelineView:      stackTimelineView,
        rescaleOverlays:        rescaleOverlays,

        addSyncedMedia:         addSyncedMedia,
        removeSyncedMedia:      removeSyncedMedia,
        syncMedia:              syncMedia,
        checkMediaSynchronization: checkMediaSynchronization,
        muteMedia:              muteMedia,

        addOverlay:             addOverlay,
        replaceOverlayData:     replaceOverlayData,
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
