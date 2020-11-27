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
        updateControlsDimensions = function(){};




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
                var playPromise = overlay.mediaElement.play();
                if (playPromise) {
                    playPromise.then(function() {
                        HypervideoController.pause();
                    }).catch(function(){
                        console.log('PLAY ERROR: ', this);
                    });
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

        ViewVideo.OverlayTimeline.CollisionDetection({spacing:0, includeVerticalMargins: true});
        ViewVideo.adjustLayout();
        ViewVideo.adjustHypervideo();

    };



    /**
     * I reset the timeline to its default CSS configuration.
     * @method resetTimelineView
     */
    function resetTimelineView() {

        ViewVideo.OverlayTimeline.css('height', '');
        ViewVideo.OverlayTimeline.children('.timelineElement').css({
            top:    '',
            right:  '',
            bottom: '',
            height: ''
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

            ViewVideo.OverlayContainer.droppable({
                accept:         '.resourceThumb',
                activeClass:    'droppableActive',
                hoverClass:     'droppableHover',

                over: function( event, ui ) {
                    ViewVideo.PlayerProgress.find('.ui-slider-handle').addClass('highlight');
                },

                out: function( event, ui ) {
                    ViewVideo.PlayerProgress.find('.ui-slider-handle').removeClass('highlight');
                },

                drop: function( event, ui ) {

                    var resourceID      = ui.helper.attr('data-resourceID'),
                        videoDuration   = FrameTrail.module('HypervideoModel').duration,
                        startTime       = FrameTrail.module('HypervideoController').currentTime,
                        endTime         = (startTime + 4 > videoDuration)
                                            ? videoDuration
                                            : startTime + 4,


                        tmpOffset               = ui.helper.offset(),
                        overlayContainerOffset  = ViewVideo.OverlayContainer.offset(),
                        tmpOffsetTop            = tmpOffset.top - overlayContainerOffset.top,
                        tmpOffsetLeft           = tmpOffset.left - overlayContainerOffset.left,
                        overlayPositionTop      = 100 * (tmpOffsetTop / ViewVideo.OverlayContainer.height()),
                        overlayPositionLeft     = 100 * (tmpOffsetLeft / ViewVideo.OverlayContainer.width()),
                        newOverlay;

                        if (ui.helper.attr('data-type') == 'text') {

                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name":         labels['ResourceCustomTextHTML'],
                                "type":         ui.helper.attr('data-type'),
                                "start":        startTime,
                                "end":          endTime,
                                "attributes":   {
                                    "text": ""
                                },
                                "position": {
                                    "top":      overlayPositionTop,
                                    "left":     overlayPositionLeft,
                                    "width":    30,
                                    "height":   30
                                }
                            });

                        } else if (ui.helper.attr('data-type') == 'quiz') {

                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "name":         labels['ResourceTypeQuiz'],
                                "type":         ui.helper.attr('data-type'),
                                "start":        startTime,
                                "end":          endTime,
                                "attributes":   {
                                    "question": "A Question?",
                                    "answers": [
                                        {
                                            'text': 'An incorrect answer',
                                            'correct': false
                                        },
                                        {
                                            'text': 'A correct answer',
                                            'correct': true
                                        },
                                        {
                                            'text': 'Another incorrect answer',
                                            'correct': false
                                        }
                                    ],
                                    "onCorrectAnswer": {
                                        "resumePlayback": true
                                    }
                                },
                                "position": {
                                    "top":      overlayPositionTop,
                                    "left":     overlayPositionLeft,
                                    "width":    30,
                                    "height":   30
                                }
                            });

                        } else {

                            newOverlay = FrameTrail.module('HypervideoModel').newOverlay({
                                "start":        startTime,
                                "end":          endTime,
                                "resourceId":   resourceID,
                                "position": {
                                    "top":      overlayPositionTop,
                                    "left":     overlayPositionLeft,
                                    "width":    30,
                                    "height":   30
                                }
                            });

                        }


                    newOverlay.renderInDOM();
                    newOverlay.startEditing();
                    updateStatesOfOverlays(FrameTrail.module('HypervideoController').currentTime);

                    stackTimelineView();


                    ViewVideo.PlayerProgress.find('.ui-slider-handle').removeClass('highlight');

                }


            });

        } else {

            ViewVideo.OverlayContainer.droppable('destroy');

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

        ViewVideo.EditPropertiesContainer.empty().addClass('active').append( propertiesControlsInterface.controlsContainer );

        updateControlsStart        = propertiesControlsInterface.changeStart;
        updateControlsEnd          = propertiesControlsInterface.changeEnd;
        updateControlsDimensions   = propertiesControlsInterface.changeDimensions;

        ViewVideo.EditPropertiesContainer.find('.overlayOptionsTabs').tabs('refresh');

        if ( ViewVideo.EditPropertiesContainer.find('.CodeMirror').length != 0 ) {
            ViewVideo.EditPropertiesContainer.find('.CodeMirror')[0].CodeMirror.refresh();
        }


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

        ViewVideo.EditPropertiesContainer.removeClass('active').empty();

    }



    /**
     * I am the central function for deleting an overlay.
     * I call all other methods necessary to delete it.
     *
     * @method deleteOverlay
     * @param {Overlay} overlay
     */
    function deleteOverlay(overlay) {

        setOverlayInFocus(null);
        overlay.removeFromDOM();
        FrameTrail.module('HypervideoModel').removeOverlay(overlay);
        stackTimelineView();

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

        ViewVideo.EditingOptions.empty();

        var overlayEditingOptions = $('<div class="overlayEditingTabs">'
                                  +   '    <ul>'
                                  +   '        <li>'
                                  +   '            <a href="#ResourceList">'+ labels['ResourceChoose'] +'</a>'
                                  +   '        </li>'
                                  +   '        <li>'
                                  +   '            <a href="#CustomOverlay">'+ labels['ResourceAddCustomOverlay'] +'</a>'
                                  +   '        </li>'
                                  +   '    </ul>'
                                  +   '    <div id="ResourceList"></div>'
                                  +   '    <div id="CustomOverlay"></div>'
                                  +   '</div>')
                                  .tabs({
                                      heightStyle: "fill"
                                  });

        ViewVideo.EditingOptions.append(overlayEditingOptions);

        FrameTrail.module('ResourceManager').renderResourcePicker(
            overlayEditingOptions.find('#ResourceList')
        );

        /* Append custom text resource to 'Custom Overlay' tab */
        // TODO: Move to separate function
        var textElement = $('<div class="resourceThumb" data-type="text">'
                + '                  <div class="resourceOverlay">'
                + '                      <div class="resourceIcon"><span class="icon-doc-text"></div>'
                + '                  </div>'
                + '                  <div class="resourceTitle">'+ labels['ResourceCustomTextHTML'] +'</div>'
                + '              </div>');

        var quizElement = $('<div class="resourceThumb" data-type="quiz">'
                + '                  <div class="resourceOverlay">'
                + '                      <div class="resourceIcon"><span class="icon-question-circle-o"></div>'
                + '                  </div>'
                + '                  <div class="resourceTitle">Quiz</div>'
                + '              </div>');

        textElement.add(quizElement).each(function() {
            $(this).draggable({
                containment:    '.mainContainer',
                helper:         'clone',
                revert:         'invalid',
                revertDuration: 100,
                appendTo:       'body',
                distance:       10,
                zIndex:         1000,

                start: function( event, ui ) {
                    ui.helper.css({
                        top: $(event.currentTarget).offset().top + "px",
                        left: $(event.currentTarget).offset().left + "px",
                        width: $(event.currentTarget).width() + "px",
                        height: $(event.currentTarget).height() + "px"
                    });
                    $(event.currentTarget).addClass('dragPlaceholder');
                },

                stop: function( event, ui ) {
                    $(event.target).removeClass('dragPlaceholder');
                }

            });
        });

        overlayEditingOptions.find('#CustomOverlay').append(textElement, quizElement);

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
