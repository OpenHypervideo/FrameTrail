/**
 * @module Player
 */


/**
 * I am the AnnotationsController who mediates between the data model of
 * all {{#crossLink "Annotation"}}annotations{{/crossLink}} (stored in {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}})
 * and their various User Interface elements (e.g. in {{#crossLink "ViewVideo"}}ViewVideo{{/crossLink}})
 *
 * @class AnnotationsController
 * @static
 */

 FrameTrail.defineModule('AnnotationsController', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;
    
    var HypervideoModel   = FrameTrail.module('HypervideoModel'),
        ViewVideo         = FrameTrail.module('ViewVideo'),
        annotationInFocus = null,
        openedAnnotation  = null,

        annotations,
        updateControlsStart      = function(){},
        updateControlsEnd        = function(){};




    /**
     * I initialize the AnnotationsController.
     * My init process has two tasks: connect the annotation menu in the Sidebar
     * with the data model (select current annotation set) and initialize
     * the annotations (instances of type {{#crossLink "Annotation"}}Annotation{{/crossLink}})
     *
     * @method initController
     */
    function initController() {

        annotations = HypervideoModel.annotations;

        initAnnotations();

    }


    /**
     * I update the AnnotationsController during runtime.
     * My update process has two tasks: refresh the annotation menu in the Sidebar
     * with the data model (select current annotation set) and initialize
     * the annotations (instances of type {{#crossLink "Annotation"}}Annotation{{/crossLink}})
     *
     * @method updateController
     */
    function updateController() {

        // update references
        annotations = FrameTrail.module('HypervideoModel').annotations;
        ViewVideo = FrameTrail.module('ViewVideo');

        initAnnotations();

    }


    /**
     * I first empty all DOM elements, and then ask all
     * annotations of the current data model, to append new DOM elements,
     * which I the arrange and prepare for view.
     *
     * @method initAnnotations
     * @private
     * @param {Array} annotationsSet
     */
    function initAnnotations(annotationSet) {

        // var annotationColor;
        //
        // if (!FrameTrail.module('Database').users[FrameTrail.module('HypervideoModel').annotationSet]) {
        //     annotationColor = '999999';
        // } else {
        //     annotationColor = FrameTrail.module('Database').users[FrameTrail.module('HypervideoModel').annotationSet].color;
        // }

        // update references
        
        annotations = FrameTrail.module('HypervideoModel').annotations;

        if (annotationSet) {
            var selectedAnnotations = annotationSet;    
        } else {
            var selectedAnnotations = annotations;
        }
        
        ViewVideo = FrameTrail.module('ViewVideo');

        // Remove only timeline elements, preserving the scroller and playhead
        var scrollerTarget = ViewVideo.AnnotationTimeline.querySelector('.timelineScroller');
        if (scrollerTarget) {
            scrollerTarget.querySelectorAll('.timelineElement').forEach(function(el) { el.remove(); });
        } else {
            ViewVideo.AnnotationTimeline.querySelectorAll('.timelineElement').forEach(function(el) { el.remove(); });
        }

        for (var i = 0; i < selectedAnnotations.length; i++) {
            selectedAnnotations[i].renderInDOM();
        }

    }


    /**
     * When the global state viewSize changes, I re-arrange
     * the annotationElements and tiles, to fit the new
     * width of the browser.
     *
     * @method changeViewSize
     * @private
     */
    function changeViewSize() {

    }


    /**
     * I react to changes in the global state viewSizeChanged.
     * The state changes after a window resize event
     * and is meant to be used for performance-heavy operations.
     *
     * @method onViewSizeChanged
     * @private
     */
    function onViewSizeChanged() {

    }


    /**
     * When we are in the editMode annotations, the timeline should
     * show all timeline elements stacked, which is what I do.
     * @method stackTimelineView
     */
    function stackTimelineView() {

        var scroller = ViewVideo.AnnotationTimeline.querySelector('.timelineScroller');
        if (scroller) {
            // Reset inline heights first so elements resolve to their CSS-defined height
            // (avoids circular dependency: elements height:100% → scroller min-height:100% → inflated)
            scroller.style.height = '';
            scroller.style.flexBasis = '';
            ViewVideo.AnnotationTimeline.style.height = '';
            ViewVideo.AnnotationTimeline.style.minHeight = '';
            ViewVideo.AnnotationTimeline.style.flexBasis = '';
            CollisionDetection(scroller, {spacing:0, includeVerticalMargins: true, exclude: '.timelinePlayhead', containerPadding: 4});
            // Read the inline value CollisionDetection just wrote (not .css() which is affected by CSS min-height:100%)
            var stackedHeight = scroller.style.height;
            ViewVideo.AnnotationTimeline.style.height = stackedHeight;
            ViewVideo.AnnotationTimeline.style.flexBasis = stackedHeight;
            ViewVideo.AnnotationTimeline.style.flexShrink = '0';
        } else {
            CollisionDetection(ViewVideo.AnnotationTimeline, {spacing:0, includeVerticalMargins: true});
        }
        ViewVideo.adjustLayout();
        ViewVideo.adjustHypervideo();

        if (FrameTrail.module('TimelineController').initialized) {
            FrameTrail.module('TimelineController').refreshMinimap();
        }

    }


    /**
     * When we are in the editMode annotations, the timeline should
     * show all timeline elements stacked. After leaving this mode,
     * I have to reset the timelineElements and the timeline to their normal
     * layout.
     * @method resetTimelineView
     * @private
     */
    function resetTimelineView() {

        ViewVideo.AnnotationTimeline.style.height = '';
        ViewVideo.AnnotationTimeline.style.minHeight = '';
        ViewVideo.AnnotationTimeline.style.flexBasis = '';
        ViewVideo.AnnotationTimeline.style.flexShrink = '';
        var target = ViewVideo.AnnotationTimeline.querySelector('.timelineScroller');
        if (target) {
            target.style.height = '';
            target.style.flexBasis = '';
        }
        var _timelineSource = target || ViewVideo.AnnotationTimeline;
        _timelineSource.querySelectorAll('.timelineElement').forEach(function(el) {
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.style.height = '';
        });

    }


    /**
     * I am a central method of the AnnotationsController.
     * I am called from the update functions inside the HypervideoController
     * and I set the activeState of the annotations according to the current time.
     * @method updateStatesOfAnnotations
     * @param {Number} currentTime
     */
    function updateStatesOfAnnotations(currentTime) {

        var annotation;

        for (var idx in annotations) {

            annotation = annotations[idx];

            if (    annotation.data.start <= currentTime
                 && annotation.data.end   >= currentTime) {

                if (!annotation.activeState) {

                    annotation.setActive();

                }

            } else {

                if (annotation.activeState) {

                    annotation.setInactive();

                }

            }

        }

        if (annotationInFocus && !annotationInFocus.activeState) {
            annotationInFocus.setActive();
        }


    }



    /**
     * I open the annotationElement of an annotation in the annotationContainer.
     * if my parameter is null, I close the annotationContainer.
     * Also, I add CSS classes to the opened annotationElement, and to its left and right
     * neighbour.
     * @method setOpenedAnnotation
     * @param {Annotation or null} annotation
     * @private
     */
    function setOpenedAnnotation(annotation) {

        var itemPosition, leftOffset;


        openedAnnotation = annotation;

        if (annotation) {
            FrameTrail.triggerEvent('annotationOpened', {
                name: annotation.data.name,
                type: annotation.data.type,
                start: annotation.data.start,
                end: annotation.data.end,
                creator: annotation.data.creator
            });
        }


        for (var idx in annotations) {

            if (annotations[idx].annotationElement) { annotations[idx].annotationElement.classList.remove('open', 'previous', 'next'); }
            annotations[idx].timelineElement.classList.remove('open');
            if (annotations[idx].tileElement) { annotations[idx].tileElement.classList.remove('open'); }

        }

        if (annotation) {

            if (annotation.annotationElement) {
                annotation.annotationElement.classList.add('open');
                if (annotation.annotationElement.previousElementSibling) { annotation.annotationElement.previousElementSibling.classList.add('previous'); }
                if (annotation.annotationElement.nextElementSibling) { annotation.annotationElement.nextElementSibling.classList.add('next'); }
            }

            updateAnnotationSlider();

            ViewVideo.shownDetails = 'bottom';

            if ( annotation.data.type == 'location' && annotation.annotationElement ) {
                var _rd = annotation.annotationElement.querySelector('.resourceDetail');
                if (_rd && _rd._leafletMap) { _rd._leafletMap.invalidateSize(); }
            }

        } else {

            ViewVideo.shownDetails = null;

        }

    }



    /**
     * I find the annotation which is active. If there are more than one active annotations,
     * I return the last one which has been activated. If there is no active annotation, I return null.
     * @method findTopMostActiveAnnotation
     */
    function findTopMostActiveAnnotation() {

        var currentTime = FrameTrail.module('HypervideoController').currentTime,
            annotations = FrameTrail.module('HypervideoModel').annotations;

        return (function(){

            var allActiveAnnotations = [];

            for (var idx in annotations) {

                if (   annotations[idx].data.start <= currentTime
                    && annotations[idx].data.end >= currentTime ) {

                    allActiveAnnotations.push(annotations[idx]);

                }

            }


            if (allActiveAnnotations.length === 0) {
                if (annotations.length === 0) {
                    return null
                } else {
                    return annotations[0]
                }
            } else {

                return allActiveAnnotations.sort(function(a,b){
                    if (a.data.start > b.data.start) {
                        return -1
                    } else {
                        return 1
                    }
                })[0];

            }

        }).call();
    }



    /**
     * When an annotation is set into focus, I have to tell
     * the old annotation in the var annotationInFocus, that it
     * is no longer in focus. Then I store the Annotation (or null)
     * from my parameter in the var annotationInFocus, and inform it
     * about it.
     * @method setAnnotationInFocus
     * @param {Annotation or null} annotation
     * @return Annotation or null
     * @private
     */
    function setAnnotationInFocus(annotation) {


        if (annotationInFocus) {

            annotationInFocus.permanentFocusState = false;
            annotationInFocus.removedFromFocus();

            removePropertiesControls();
        }

        annotationInFocus = annotation;

        if (annotationInFocus) {
            annotationInFocus.gotInFocus();
        }

        updateStatesOfAnnotations(FrameTrail.module('HypervideoController').currentTime);

        return annotation;


    }


    /**
     * When an annotation got "into focus", its {{#crossLink "Annotation/gotInFocus:method"}}gotInFocus method{{/crossLink}}
     * calls this method, to do two jobs:
     * * first, append the properties controls elements to the respective DOM element.
     * * secondly, save references to the update functions of the control interface, so that the textual data values of the controls (like start and end time) can be updated, when they are changed directly by mouse interactions with the timeline element.
     *
     * @method renderPropertiesControls
     * @param {Object} propertiesControlsInterface
     */
    function renderPropertiesControls(propertiesControlsInterface) {

        ViewVideo.EditPropertiesContainer.innerHTML = '';
        ViewVideo.EditPropertiesContainer.classList.add('active');
        ViewVideo.EditPropertiesContainer.appendChild( propertiesControlsInterface.controlsContainer );

        updateControlsStart        = propertiesControlsInterface.changeStart;
        updateControlsEnd          = propertiesControlsInterface.changeEnd;

        ViewVideo.switchInfoTab('properties');
        var _atabs = ViewVideo.EditPropertiesContainer.querySelector('.annotationOptionsTabs');
        if (_atabs) { FTTabs(_atabs, 'refresh'); } // Phase 2 bridge

        var cm6Wrapper = ViewVideo.EditPropertiesContainer.querySelector('.cm6-wrapper');
        if ( cm6Wrapper && cm6Wrapper._cm6view ) { cm6Wrapper._cm6view.requestMeasure(); }

    }


    /**
     * I am the counterpart of {{#crossLink "AnnotationsController/renderPropertiesControls:method"}}renderPropertiesControls method{{/crossLink}}.
     * I remove the DOM element and the update functions.
     * @method removePropertiesControls
     */
    function removePropertiesControls() {


        updateControlsStart      = function(){};
        updateControlsEnd        = function(){};

        ViewVideo.EditPropertiesContainer.classList.remove('active'); ViewVideo.EditPropertiesContainer.innerHTML = '';
        ViewVideo.switchInfoTab('add');

    }


    /**
     * Listens to global state 'editMode'.
     * The AnnotationsController has to react on a change of the
     * editMode.
     * First it checks, wether we are entering or leaving the edit mode
     * in general (editMode is false, when not the editor is not active, otherwise
     * it is a String indicating the editMode).
     * If the editor is active, the user's own annotation set has to be selected
     * an the select menu for annotations has to be hidden.
     * Secondly it checks wether the editMode we enter or leave is 'annotations'.
     * If so, we activate or deactivate the editing options for annotations.
     *
     * @method toggleEditMode
     * @param {String or false} editMode
     * @param {String or false} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

        var HypervideoModel     = FrameTrail.module('HypervideoModel');

        if ( editMode === false && oldEditMode !== false ) {
            //console.log('SHOW SEARCH BUTTON');
        }


        if (editMode === 'annotations' && oldEditMode !== 'annotations') {

            //annotations = HypervideoModel.annotations;
            var userAnnotations = FrameTrail.module('TagModel').getContentCollection(
                [],
                false,
                true,
                [FrameTrail.module('UserManagement').userID],
                '',
                []
            );

            initAnnotations(userAnnotations);

            for (var idx in userAnnotations) {

                userAnnotations[idx].startEditing();

            }

            stackTimelineView();
            initEditOptions();
            makeTimelineDroppable(true);

        } else if (oldEditMode === 'annotations' && editMode !== 'annotations') {

            //console.log(editMode, oldEditMode, annotations);
            for (var idx in annotations) {

                annotations[idx].stopEditing();

            }

            setAnnotationInFocus(null);
            resetTimelineView();
            makeTimelineDroppable(false);
            initAnnotations();

        }

        // just to be sure
        window.setTimeout(function() {
            stackTimelineView();
        }, 500);

    }




    /**
     * When the editMode 'annotations' was entered, the #EditingOptions area
     * should show two tabs: a ResourcePicker and a tab with the annotation timelines
     * of all other users, drag new items on the annotation timeline.
     * @method initEditOptions
     * @private
     */
    function initEditOptions() {

        ViewVideo.EditingOptions.innerHTML = '';

        var _hint = document.createElement('div');
        _hint.className = 'message active';
        _hint.innerHTML = '<span class="icon-annotations"></span> ' + labels['MessageHintDragAnnotations'];
        ViewVideo.EditingOptions.appendChild(_hint);

        var _aew = document.createElement('div');
        _aew.innerHTML = '<div class="overlayEditingTabs">'
                       +   '    <ul>'
                       +   '        <li><a href="#ResourceList">'+ labels['ResourceChoose'] +'</a></li>'
                       +   '        <li><a href="#CustomAnnotation">'+ labels['ResourceAddCustomAnnotation'] +'</a></li>'
                       +   '    </ul>'
                       +   '    <div id="ResourceList"></div>'
                       +   '    <div id="CustomAnnotation"></div>'
                       +   '</div>';
        var annotationsEditingOptions = _aew.firstElementChild;
        FTTabs(annotationsEditingOptions, {
            heightStyle: "fill"
        }); // Phase 2 bridge



        ViewVideo.EditingOptions.appendChild(annotationsEditingOptions);

        FrameTrail.module('ResourceManager').renderResourcePicker(
            annotationsEditingOptions.querySelector('#ResourceList')
        );

        /* Append custom text resource to 'Add Custom Annotation' tab */
        // TODO: Move to separate function
        var _tew = document.createElement('div');
        _tew.innerHTML = '<div class="resourceThumb" data-type="text">'
                + '                  <div class="resourceOverlay">'
                + '                      <div class="resourceIcon"></div>'
                + '                  </div>'
                + '                  <div class="resourceTitle">'+ labels['ResourceCustomTextHTML'] +'</div>'
                + '              </div>';
        var textElement = _tew.firstElementChild;

        var _hlew = document.createElement('div');
        _hlew.innerHTML = '<div class="resourceThumb" data-type="html">'
                + '                  <div class="resourceOverlay">'
                + '                      <div class="resourceIcon"><span class="icon-file-code"></span></div>'
                + '                  </div>'
                + '                  <div class="resourceTitle">'+ labels['ResourceCustomHTML'] +'</div>'
                + '              </div>';
        var htmlElement = _hlew.firstElementChild;

        (function() {
            var dragClone = null;
            interact(textElement).draggable({
                listeners: {
                    start: function(e) {
                        var rect = e.target.getBoundingClientRect();
                        dragClone = e.target.cloneNode(true);
                        dragClone.style.position = 'fixed';
                        dragClone.style.zIndex = '1000';
                        dragClone.style.pointerEvents = 'auto';
                        dragClone.style.boxSizing = 'border-box';
                        dragClone.style.width = rect.width + 'px';
                        dragClone.style.height = rect.height + 'px';
                        dragClone.style.left = rect.left + 'px';
                        dragClone.style.top = rect.top + 'px';
                        dragClone.classList.add('ft-drag-clone');
                        document.body.appendChild(dragClone);
                        e.target.classList.add('dragPlaceholder');
                        document.body.classList.add('ft-dragging');
                    },
                    move: function(e) {
                        if (dragClone) {
                            dragClone.style.left = (parseFloat(dragClone.style.left) + e.dx) + 'px';
                            dragClone.style.top  = (parseFloat(dragClone.style.top)  + e.dy) + 'px';
                        }
                    },
                    end: function(e) {
                        e.target.classList.remove('dragPlaceholder');
                        if (dragClone) { dragClone.remove(); dragClone = null; }
                        document.body.classList.remove('ft-dragging');
                    }
                }
            });
        }());

        (function() {
            var dragClone = null;
            interact(htmlElement).draggable({
                listeners: {
                    start: function(e) {
                        var rect = e.target.getBoundingClientRect();
                        dragClone = e.target.cloneNode(true);
                        dragClone.style.position = 'fixed';
                        dragClone.style.zIndex = '1000';
                        dragClone.style.pointerEvents = 'auto';
                        dragClone.style.boxSizing = 'border-box';
                        dragClone.style.width = rect.width + 'px';
                        dragClone.style.height = rect.height + 'px';
                        dragClone.style.left = rect.left + 'px';
                        dragClone.style.top = rect.top + 'px';
                        dragClone.classList.add('ft-drag-clone');
                        document.body.appendChild(dragClone);
                        e.target.classList.add('dragPlaceholder');
                        document.body.classList.add('ft-dragging');
                    },
                    move: function(e) {
                        if (dragClone) {
                            dragClone.style.left = (parseFloat(dragClone.style.left) + e.dx) + 'px';
                            dragClone.style.top  = (parseFloat(dragClone.style.top)  + e.dy) + 'px';
                        }
                    },
                    end: function(e) {
                        e.target.classList.remove('dragPlaceholder');
                        if (dragClone) { dragClone.remove(); dragClone = null; }
                        document.body.classList.remove('ft-dragging');
                    }
                }
            });
        }());

        annotationsEditingOptions.querySelector('#CustomAnnotation').append(textElement, htmlElement);

        /* Render other users' annotation timelines in the main view container */
        var otherUsersContainer = ViewVideo.OtherUsersContainer;
        otherUsersContainer.innerHTML = '';
        var currentUserID = FrameTrail.module('UserManagement').userID;
        var hasOtherUsersAnnotations = Object.values(annotations).some(function(anno) {
            return anno.data.creatorId !== currentUserID;
        });

        if (hasOtherUsersAnnotations) {
            otherUsersContainer.insertAdjacentHTML('beforeend',
                '<div class="message active">'+ labels['MessageDragAnnotationsIntoTimeline'] +'</div>'
            );
            var timelineList = document.createElement('div');
            timelineList.className = 'timelineList';
            timelineList.dataset.zoomLevel = '1';
            otherUsersContainer.appendChild(timelineList);
            renderAnnotationTimelines(annotations, timelineList, 'creatorId', 'label', false);

            // Register the timeline zoom wrapper as a follower to sync zoom/scroll with main timelines
            var timelineZoomWrapper = timelineList.querySelector('.timelineZoomWrapper');
            var timelineZoomScroller = timelineList.querySelector('.timelineZoomScroller');
            if (timelineZoomWrapper && timelineZoomScroller) {
                FrameTrail.module('TimelineController').registerFollowerTimeline(timelineZoomWrapper, timelineZoomScroller);
            }
            otherUsersContainer.classList.add('active');
        } else {
            otherUsersContainer.classList.remove('active');
        }

    }



    /**
     * When the editMode 'annotations' has been entered, the
     * annotation timeline should be droppable for new items
     * (from the ResourcePicker or from other users' timelines).
     * A drop event should trigger the process of creating a new annotation.
     * My parameter is true or false to activate or deactivate this behavior.
     * @method makeTimelineDroppable
     * @param {Boolean} droppable
     */
    function makeTimelineDroppable(droppable) {

        if (droppable) {

            interact(ViewVideo.AnnotationTimeline).dropzone({
                accept:    '.resourceThumb, .compareTimelineElement',
                overlap:   'pointer',
                ondropactivate:   function(e) { e.target.classList.add('droppableActive'); },
                ondropdeactivate: function(e) { e.target.classList.remove('droppableActive', 'droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondragenter:      function(e) { e.target.classList.add('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.add('highlight'); },
                ondragleave:      function(e) { e.target.classList.remove('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondrop: function(e) {
                    var dragged = e.relatedTarget;

                    try {
                        if (TogetherJS && TogetherJS.running) {
                            var elementFinder = TogetherJS.require("elementFinder");
                            var location = elementFinder.elementLocation(e.relatedTarget);
                            TogetherJS.send({
                                type: "simulate-annotation-add",
                                element: location,
                                containerElement: '.annotationTimeline'
                            });
                        }
                    } catch (ex) {}

                    var resourceID      = dragged.getAttribute('data-resourceID'),
                        videoDuration   = FrameTrail.module('HypervideoModel').duration,
                        startTime,
                        endTime,
                        newAnnotation;

                        if (dragged.classList.contains('compareTimelineElement')) {
                            startTime = parseFloat(dragged.getAttribute('data-start'));
                            endTime   = parseFloat(dragged.getAttribute('data-end'));
                        } else {
                            startTime = FrameTrail.module('HypervideoController').currentTime;
                            endTime   = (startTime + 4 > videoDuration) ? videoDuration : startTime + 4;
                        }

                        if (dragged.getAttribute('data-type') == 'text') {
                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "name":       labels['ResourceCustomTextHTML'],
                                "type":       dragged.getAttribute('data-type'),
                                "start":      startTime,
                                "end":        endTime,
                                "attributes": { "text": "" }
                            });
                        } else if (dragged.getAttribute('data-type') == 'html') {
                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "name":       labels['ResourceCustomHTML'],
                                "type":       dragged.getAttribute('data-type'),
                                "start":      startTime,
                                "end":        endTime,
                                "attributes": { "text": "" }
                            });
                        } else if (!resourceID) {
                            var resourceData = dragged._originResourceData;
                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "name":       resourceData.name,
                                "type":       resourceData.type,
                                "src":        resourceData.src,
                                "thumb":      resourceData.thumb,
                                "start":      startTime,
                                "end":        endTime,
                                "attributes": resourceData.attributes,
                                "tags":       resourceData.tags
                            });
                        } else {
                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "start":      startTime,
                                "end":        endTime,
                                "resourceId": resourceID
                            });
                        }

                    newAnnotation.renderInDOM();
                    newAnnotation.startEditing();
                    updateStatesOfAnnotations(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();

                    // Register undo command for adding annotation
                    (function(annotationData) {
                        var findAnnotation = function() {
                            var annotations = FrameTrail.module('HypervideoModel').annotations;
                            for (var i = 0; i < annotations.length; i++) {
                                if (annotations[i].data.created === annotationData.created) {
                                    return annotations[i];
                                }
                            }
                            return null;
                        };
                        FrameTrail.module('UndoManager').register({
                            category: 'annotations',
                            description: labels['SidebarMyAnnotations'] + ' ' + labels['GenericAdd'],
                            undo: function() {
                                var annotation = findAnnotation();
                                if (annotation) { deleteAnnotation(annotation, true); }
                            },
                            redo: function() {
                                var restoredAnnotation = FrameTrail.module('HypervideoModel').newAnnotation(annotationData, true);
                                restoredAnnotation.renderInDOM();
                                restoredAnnotation.startEditing();
                                updateStatesOfAnnotations(FrameTrail.module('HypervideoController').currentTime);
                                stackTimelineView();
                                FrameTrail.module('TimelineController').refreshMinimap();
                            }
                        });
                    })(JSON.parse(JSON.stringify(newAnnotation.data)));

                    var _sh2 = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh2) _sh2.classList.remove('highlight');
                }
            });

        } else {

            interact(ViewVideo.AnnotationTimeline).unset();

        }

    }


    /**
     * I am the starting point for the process of deleting
     * an annotation.
     * @method deleteAnnotation
     * @param {Annotation} annotation
     * @param {Boolean} skipUndo - If true, don't register undo command (used during undo/redo)
     */
    function deleteAnnotation(annotation, skipUndo) {

        // Capture data before deletion for undo
        var annotationData = JSON.parse(JSON.stringify(annotation.data));

        setAnnotationInFocus(null);
        annotation.removeFromDOM();
        //distributeTiles();
        FrameTrail.module('HypervideoModel').removeAnnotation(annotation);

        stackTimelineView();
        FrameTrail.module('TimelineController').refreshMinimap();

        // Register undo command
        if (!skipUndo) {
            FrameTrail.module('UndoManager').register({
                category: 'annotations',
                description: labels['SidebarMyAnnotations'] + ' ' + labels['GenericDelete'],
                undo: function() {
                    // Recreate the annotation
                    var newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation(annotationData, true);
                    newAnnotation.renderInDOM();
                    newAnnotation.startEditing();
                    updateStatesOfAnnotations(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();
                },
                redo: function() {
                    // Find the annotation by matching data and delete it again
                    var annotationsArray = FrameTrail.module('HypervideoModel').annotations;
                    for (var i = 0; i < annotationsArray.length; i++) {
                        if (annotationsArray[i].data.created === annotationData.created) {
                            deleteAnnotation(annotationsArray[i], true);
                            break;
                        }
                    }
                }
            });
        }

    }


    /**
     * I react to a change in the global state "userColor"
     * @method changeUserColor
     * @param {String} color
     */
    function changeUserColor(newColor) {

        // var annotationSets = HypervideoModel.annotationSets;
        //
        // for (var idx in annotationSets) {
        //
        //     if (annotationSets[idx].id == FrameTrail.module('UserManagement').userID && newColor.length > 1) {
        //         annotationSets[idx].color = newColor;
        //     }
        //
        // }
        //
        // if (newColor.length > 1) {
        //
        //     // REFRESH COLOR VALUES SOMEWHERE
        //
        // }

    }

    /**
     * I render a list of annotation timelines.
     * //TODO: Improve documentation
     * @method renderAnnotationTimelines
     * @param {Array} annotationCollection
     * @param {HTMLElement} targetElement
     * @param {String} filterAspect
     * @param {String} sortBy
     * @param {Boolean} zoomControls
     */
    function renderAnnotationTimelines(annotationCollection, targetElement, filterAspect, sortBy, zoomControls) {
        
        var collectedAnnotationsPerAspect = [];

        //console.log(FrameTrail.module('Database').users);
        if (!filterAspect) {
            var filterAspect = 'creatorId';
        }
        if (!sortBy) {
            var sortBy = 'label';
        }

        for (var anno in annotationCollection) {
            
            //console.log(annotationCollection[anno].data);

            //var currentAspectID = annotationCollection[anno].data[filterAspect];
            switch (filterAspect) {
                case 'annotationType':
                    var currentAspectID;
                    if (annotationCollection[anno].data.source.url.body) {
                        if (Array.isArray(annotationCollection[anno].data.source.url.body)) {
                            currentAspectID = annotationCollection[anno].data.source.url.body[0][filterAspect];
                        } else {
                            currentAspectID = annotationCollection[anno].data.source.url.body[filterAspect] ;
                        }
                        
                    } else {
                        currentAspectID = null;
                    } 
                    break;
                default:  
                    var currentAspectID = annotationCollection[anno].data[filterAspect];
                    break;
            }

            //console.log(currentAspectID);

            if (!currentAspectID) {
                return;
            }
            
            if (!collectedAnnotationsPerAspect[currentAspectID]) {
                
                var userInDatabase = FrameTrail.module('Database').users[annotationCollection[anno].data.creatorId];

                //console.log(annotationCollection[anno]);
                switch (filterAspect) {

                    case 'annotationType':
                        
                        collectedAnnotationsPerAspect[currentAspectID] = {
                            'userID': annotationCollection[anno].data.source.url.creator,
                            'label': annotationCollection[anno].data.source.url["advene:type_title"],
                            'color' : (annotationCollection[anno].data.source.url["advene:type_color"]) ? annotationCollection[anno].data.source.url["advene:type_color"] : '444444',
                            'annotations': []
                        };

                        break;

                    case 'creatorId': 
                        
                        collectedAnnotationsPerAspect[currentAspectID] = {
                            'userID': annotationCollection[anno].data.creatorId,
                            'label': annotationCollection[anno].data.creator,
                            'color' : (userInDatabase) ? '#'+ userInDatabase.color : '#444444',
                            'annotations': []
                        };

                        break;

                    default: 
                        
                        collectedAnnotationsPerAspect[currentAspectID] = {
                            'userID': annotationCollection[anno].data.creatorId,
                            'label': currentAspectID,
                            'color' : (userInDatabase) ? '#'+ userInDatabase.color : '#444444',
                            'annotations': []
                        };

                        break;

                }

                if (typeof getAnnotationTypeValues !== 'undefined') {
                    collectedAnnotationsPerAspect[currentAspectID]['annotationTypeValues'] = getAnnotationTypeValues(currentAspectID);
                }
                
            }

            collectedAnnotationsPerAspect[currentAspectID]['annotations'].push(annotationCollection[anno]);
        }

        collectedAnnotationsPerAspectData = [];
        for (var obj in collectedAnnotationsPerAspect) {
            collectedAnnotationsPerAspectData.push(collectedAnnotationsPerAspect[obj]);
        }

        if (sortBy) {
            collectedAnnotationsPerAspectData.sort(function(a, b) {
                if (a[sortBy] < b[sortBy])
                    return -1;
                if (a[sortBy] > b[sortBy])
                    return 1;
                if (a[sortBy] == b[sortBy]) {
                    if (a.label < b.label) 
                        return -1;
                    if (a.label > b.label)
                        return 1;
                    return 0;
                }
            });
        }

        var customTimelineOrder = null;
        if (typeof prioritizedAnnotationTypes !== 'undefined' && prioritizedAnnotationTypes.length != 0) {
            customTimelineOrder = [];
            for (var i = 0; i < prioritizedAnnotationTypes.length; i++) {
                customTimelineOrder.push(prioritizedAnnotationTypes[i].label);
            }
        }
        if (customTimelineOrder) {
            collectedAnnotationsPerAspectData.sort(function(a, b) {
                if (customTimelineOrder.indexOf(b.label) != -1) {
                    return 1;
                } else {
                    return -1;
                }
            });
            collectedAnnotationsPerAspectData.sort(function(a, b) {
                if (customTimelineOrder.indexOf(a.label) != -1 && customTimelineOrder.indexOf(b.label) != -1) {
                    if (customTimelineOrder.indexOf(a.label) < customTimelineOrder.indexOf(b.label)) {
                        return -1;
                    }
                    if (customTimelineOrder.indexOf(a.label) > customTimelineOrder.indexOf(b.label)) {
                        return 1;
                    }
                } else {
                    return 0;
                }
            });
        }

        var timelineZoomWrapper = document.createElement('div');
        timelineZoomWrapper.className = 'timelineZoomWrapper';
        var timelineZoomScroller = document.createElement('div');
        timelineZoomScroller.className = 'timelineZoomScroller';

        timelineZoomWrapper.appendChild(timelineZoomScroller);

        // Keep userLabels visible when scrolling horizontally
        timelineZoomWrapper.addEventListener('scroll', function(evt) {
            var scrollLeftVal = this.scrollLeft;
            this.querySelectorAll('.userLabel').forEach(function(el) { el.style.left = scrollLeftVal + 'px'; });
        });

        if (zoomControls) {

            var ZOOM_PRESETS = [1, 2, 4, 8];

            var zoomControlsWrapper = document.createElement('div');
            zoomControlsWrapper.className = 'zoomControlsWrapper';
            var zoomControlsInner = document.createElement('div');
            zoomControlsInner.className = 'timelineZoomControls';

            ZOOM_PRESETS.forEach(function(preset) {
                var label = preset === 1 ? 'Fit' : preset + 'x';
                var btn = document.createElement('button');
                btn.className = 'button timelineZoomPreset';
                btn.setAttribute('data-zoom', preset);
                btn.textContent = label;
                if (preset === 1) btn.classList.add('active');
                zoomControlsInner.appendChild(btn);
            });

            zoomControlsInner.addEventListener('click', function(e) {
                var btn = e.target.closest('.timelineZoomPreset');
                if (!btn) return;
                var newLevel = parseFloat(btn.getAttribute('data-zoom'));
                zoomTimelines(timelineZoomWrapper, newLevel);
                // Update active state
                zoomControlsInner.querySelectorAll('.timelineZoomPreset').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });

            zoomControlsWrapper.appendChild(zoomControlsInner);
            targetElement.appendChild(zoomControlsWrapper);
        }

        for (var i=0; i<collectedAnnotationsPerAspectData.length; i++) {

            if (filterAspect === 'creatorId' && collectedAnnotationsPerAspectData[i].userID === FrameTrail.module('UserManagement').userID) {
                continue;
            }
                        
            var aspectLabel =  collectedAnnotationsPerAspectData[i].label,
                aspectColor = collectedAnnotationsPerAspectData[i].color,
                aspectValues = collectedAnnotationsPerAspectData[i].annotationTypeValues;

            //console.log(aspectLabel);

            var iconClass = (filterAspect == 'creatorId') ? 'icon-user' : 'icon-tag';
            
            var movieTitle = FrameTrail.module('HypervideoModel').hypervideoName.replace(/<\/?[^>]+(>|$)/g, "");
            var exportFileName = movieTitle +'_' + aspectLabel;
            if (filterAspect == 'creatorId') {
                exportFileName += '_' + collectedAnnotationsPerAspectData[i].userID;
            }
            exportFileName = exportFileName.replace(/[\s:]/g, '-').replace(/[|&;:$%@<>()+,]/g, '').replace(/__/g, '_').replace(/--/g, '-');
            var exportData = getAnnotationDataAsCSV(collectedAnnotationsPerAspectData[i].annotations);
            var exportButtonString = '<a class="exportTimelineDataButton" title="'+ labels['MessageAnnotationExportAsCSV'] +'" download="'+ exportFileName +'.csv" href="'+ exportData +'">'+ labels['GenericExportData'] +' (CSV)</a>';

            var _utw = document.createElement('div');
            _utw.innerHTML = '<div class="userTimelineWrapper">'
                            +   '    <div class="userLabel" style="color: '+ aspectColor +'">'
                            +   '        <span class="'+ iconClass +'"></span>'
                            +   '        <span>'+ aspectLabel + '</span>'+exportButtonString
                            +   '        <div class="timelineValues"></div>'
                            +   '    </div>'
                            +   '    <div class="userTimeline"></div>'
                            +   '</div>';
            var userTimelineWrapper = _utw.firstElementChild,
                legendContainer = userTimelineWrapper.querySelector('.timelineValues'),
                userTimeline = userTimelineWrapper.querySelector('.userTimeline');

            if (aspectValues && aspectValues.values.length != 0) {
                
                var evolvingValuesLegendElement = document.createElement('span');
                evolvingValuesLegendElement.className = 'timelineLegendLabel';
                evolvingValuesLegendElement.setAttribute('data-origin-type', 'ao:EvolvingValuesAnnotationType');
                evolvingValuesLegendElement.title = 'Evolving Values';
                evolvingValuesLegendElement.style.color = '#777';
                evolvingValuesLegendElement.textContent = 'TO';
                var contrastingValuesLegendElement = document.createElement('span');
                contrastingValuesLegendElement.className = 'timelineLegendLabel';
                contrastingValuesLegendElement.setAttribute('data-origin-type', 'ao:ContrastingValuesAnnotationType');
                contrastingValuesLegendElement.title = 'Contrasting Values';
                contrastingValuesLegendElement.style.color = '#777';
                contrastingValuesLegendElement.textContent = 'VS';

                evolvingValuesLegendElement.addEventListener('mouseenter', function(evt) {
                    var thisOriginType = this.getAttribute('data-origin-type');
                    Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = '0.2'; });
                    this.style.opacity = '1';
                    var _tl = this.closest('.userLabel').nextElementSibling;
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type]), [data-timeline-color]').forEach(function(el) { el.classList.remove('opaque'); });
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type])').forEach(function(el) { el.classList.add('transparentBackground'); });
                    _tl.querySelectorAll('.compareTimelineElement[data-origin-type]:not([data-origin-type="'+ thisOriginType +'"]), [data-origin-type]:not([data-origin-type="'+ thisOriginType +'"])').forEach(function(el) { el.classList.add('opaque'); });
                });
                evolvingValuesLegendElement.addEventListener('mouseleave', function(evt) {
                    Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = ''; });
                    var _tl = this.closest('.userLabel').nextElementSibling;
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type]), [data-origin-type]').forEach(function(el) { el.classList.remove('opaque'); });
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type])').forEach(function(el) { el.classList.remove('transparentBackground'); });
                });
                contrastingValuesLegendElement.addEventListener('mouseenter', function(evt) {
                    var thisOriginType = this.getAttribute('data-origin-type');
                    Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = '0.2'; });
                    this.style.opacity = '1';
                    var _tl = this.closest('.userLabel').nextElementSibling;
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type]), [data-timeline-color]').forEach(function(el) { el.classList.remove('opaque'); });
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type])').forEach(function(el) { el.classList.add('transparentBackground'); });
                    _tl.querySelectorAll('.compareTimelineElement[data-origin-type]:not([data-origin-type="'+ thisOriginType +'"]), [data-origin-type]:not([data-origin-type="'+ thisOriginType +'"])').forEach(function(el) { el.classList.add('opaque'); });
                });
                contrastingValuesLegendElement.addEventListener('mouseleave', function(evt) {
                    Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = ''; });
                    var _tl = this.closest('.userLabel').nextElementSibling;
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type]), [data-origin-type]').forEach(function(el) { el.classList.remove('opaque'); });
                    _tl.querySelectorAll('.compareTimelineElement:not([data-origin-type])').forEach(function(el) { el.classList.remove('transparentBackground'); });
                });
                legendContainer.append(evolvingValuesLegendElement, contrastingValuesLegendElement);

                for (var v=0; v<aspectValues.values.length; v++) {
                    var numericRatio = aspectValues.values[v].elementNumericValue / aspectValues.maxNumericValue,
                        relativeHeight = 100 * (numericRatio),
                        timelineColor = (aspectValues.maxNumericValue) ? Math.round(numericRatio * 12) : v*1 + 1;
                    if (aspectLabel.indexOf('Colour Range') != -1 || aspectLabel.indexOf('Colour Accent') != -1) {
                        var _vlw = document.createElement('div'); _vlw.innerHTML = '<span class="timelineLegendLabel" data-numeric-value="'+ aspectValues.values[v].elementNumericValue +'" data-timeline-color="'+ aspectValues.values[v].name +'" style="color: '+ aspectValues.values[v].name +';">'+ aspectValues.values[v].name +'</span>'; var valueLegendElement = _vlw.firstElementChild;
                    } else {
                        var _vlw = document.createElement('div'); _vlw.innerHTML = '<span class="timelineLegendLabel" data-numeric-value="'+ aspectValues.values[v].elementNumericValue +'" data-timeline-color="'+ timelineColor +'">'+ aspectValues.values[v].name +'</span>'; var valueLegendElement = _vlw.firstElementChild;
                    }
                    valueLegendElement.addEventListener('mouseenter', function(evt) {
                        var thisColor = this.getAttribute('data-timeline-color');
                        Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = '0.2'; });
                        this.style.opacity = '1';
                        var _tl = this.closest('.userLabel').nextElementSibling;
                        _tl.querySelectorAll('.compareTimelineElement:not([data-timeline-color]), [data-timeline-color]').forEach(function(el) { el.classList.remove('opaque'); });
                        _tl.querySelectorAll('.compareTimelineElement:not([data-timeline-color])').forEach(function(el) { el.classList.add('transparentBackground'); });
                        _tl.querySelectorAll('.compareTimelineElement[data-timeline-color]:not([data-timeline-color="'+ thisColor +'"]), [data-timeline-color]:not([data-timeline-color="'+ thisColor +'"])').forEach(function(el) { el.classList.add('opaque'); });
                    });
                    valueLegendElement.addEventListener('mouseleave', function(evt) {
                        Array.from(this.parentElement.children).forEach(function(c) { c.style.opacity = ''; });
                        var _tl = this.closest('.userLabel').nextElementSibling;
                        _tl.querySelectorAll('.compareTimelineElement:not([data-timeline-color]), [data-timeline-color]').forEach(function(el) { el.classList.remove('opaque'); });
                        _tl.querySelectorAll('.compareTimelineElement:not([data-timeline-color])').forEach(function(el) { el.classList.remove('transparentBackground'); });
                    });
                    legendContainer.appendChild(valueLegendElement);
                }
            }

            var firstAnnotation = (collectedAnnotationsPerAspectData[i].annotations[0]) ? collectedAnnotationsPerAspectData[i].annotations[0] : null,
                timelineMaxValue = 1;
            if (firstAnnotation && firstAnnotation.data.source.url.body && firstAnnotation.data.source.url.body.maxNumericValue && firstAnnotation.data.source.url['advene:type'] != 'ShotDuration') {
                timelineMaxValue = firstAnnotation.data.source.url.body.maxNumericValue;
                //console.log(gridLevels);
                for (var gl=1; gl<timelineMaxValue; gl++) {
                    var bottomValue = 100 * (gl / timelineMaxValue);
                    userTimeline.insertAdjacentHTML('beforeend', '<div class="horizontalGridLine" style="bottom: '+ bottomValue +'%;"></div>');
                }
            }

            userTimelineWrapper.dataset.timelineMaxValue = timelineMaxValue;
            userTimelineWrapper.dataset.typeLabel = aspectLabel;
            
            var overlapLeft = false,
                overlapRight = false;

            for (var idx in collectedAnnotationsPerAspectData[i].annotations) {
                var compareTimelineItem = collectedAnnotationsPerAspectData[i].annotations[idx].renderCompareTimelineItem();
                if (compareTimelineItem.classList.contains('overlapLeft')) overlapLeft = true;
                if (compareTimelineItem.classList.contains('overlapRight')) overlapRight = true;
                //TODO: Fix conflict between aspectColor and value (in same element)
                compareTimelineItem.style.backgroundColor = aspectColor;
                if (compareTimelineItem.getAttribute('data-origin-type') == 'ao:EvolvingValuesAnnotationType') {
                    var _path = compareTimelineItem.querySelector('path');
                    if (_path) { _path.setAttribute('fill', aspectColor); }
                }

                userTimeline.appendChild(compareTimelineItem);
            }

            if (overlapLeft) {
                userTimeline.insertAdjacentHTML('beforeend', '<div class="overlapIndicatorLeft"><span class="icon-angle-double-left"></span></div>');
            }
            if (overlapRight) {
                userTimeline.insertAdjacentHTML('beforeend', '<div class="overlapIndicatorRight"><span class="icon-angle-double-right"></span></div>');
            }

            timelineZoomScroller.appendChild(userTimelineWrapper);

        }

        // Add playhead indicator
        var playhead = document.createElement('div');
        playhead.className = 'timelinePlayhead';
        timelineZoomScroller.appendChild(playhead);

        // Update playhead position on timeupdate
        FrameTrail.addEventListener('timeupdate', function() {
            var duration = FrameTrail.module('HypervideoModel').duration;
            if (duration === 0) return;
            var currentTime = FrameTrail.module('HypervideoController').currentTime;
            playhead.style.left = ((currentTime / duration) * 100) + '%';
        });

        targetElement.appendChild(timelineZoomWrapper);

        makeTimelinesSortable(timelineZoomScroller);

        // Set up preview popup (detach to body on hover to escape overflow clipping)
        FrameTrail.module('TimelineController').setupPreviewPopup(timelineZoomWrapper, '.compareTimelineElement');

    }

    /**
     * I prepare the annotationData for the CSV File Export.
     * @method getAnnotationDataAsCSV
     * @param {Array} annotationData
     */
    function getAnnotationDataAsCSV(annotationData) {
        var csvString = 'StartTime\tEndTime\tValue\n';

        for (var i = 0; i < annotationData.length; i++) {
            var annotationContent = annotationData[i].data.name;
            if (annotationData[i].data.type == 'text' || annotationData[i].data.type == 'html') {
                if (annotationData[i].data.attributes.text && annotationData[i].data.attributes.text.length != 0) {
                    var _t = document.createElement('div');
                    _t.innerHTML = annotationData[i].data.attributes.text;
                    annotationContent = _t.textContent;
                } else {
                    annotationContent = '';
                }
            }
            if (annotationData[i].data.source.url.target && annotationData[i].data.source.url.target.selector["advene:end"]) {
                var startTime = annotationData[i].data.source.url.target.selector["advene:begin"],
                    endTime = annotationData[i].data.source.url.target.selector["advene:end"];
                csvString += startTime +'\t' + endTime +'\t'+ annotationContent +'\n';
            } else {
                csvString += annotationData[i].data.start +'\t' + annotationData[i].data.end +'\t'+ annotationContent +'\n';
            }
        }

        var csvBlob = new Blob([csvString], { type: "text/csv;charset=utf-8" });

        // return ObjectURL
        return URL.createObjectURL(csvBlob);
    }

    /**
     * I control the zoom level of all timelines which are children of the targetElement.
     * @method zoomTimelines
     * @param {HTMLElement} targetElement
     * @param {Float} zoomLevel
     */
    function zoomTimelines(targetElement, zoomLevel) {

        if (zoomLevel < 1) {
            zoomLevel = 1;
        }

        var zoomPercent = zoomLevel*100,
            currentLeft = parseInt(targetElement.scrollLeft),
            currentWidth = targetElement.querySelector('.timelineZoomScroller').offsetWidth,
            focusPoint = 2,
            positionLeft = (targetElement.offsetWidth * (zoomLevel/focusPoint)) + (targetElement.offsetWidth/focusPoint),
            currentOffset = currentLeft + (currentLeft + currentWidth - targetElement.offsetWidth);

        /*
        console.log('Left: '+ currentLeft);
        console.log('Right: '+ (currentLeft + currentWidth - targetElement.width()));
        console.log('Offset: '+ currentOffset / zoomLevel);
        */

        positionLeft = (positionLeft + (currentOffset / zoomLevel));

        if (positionLeft > 0 || zoomLevel == 1) {
            positionLeft = 0;
        }

        if ( (targetElement.offsetWidth*zoomLevel) - targetElement.offsetWidth + currentOffset < 0  ) {
            positionLeft = (targetElement.offsetWidth*zoomLevel) - targetElement.offsetWidth;
        }

        targetElement.querySelector('.timelineZoomScroller').style.width = zoomPercent + '%';

        //TODO: FIX POSITIONING
        //targetElement.scrollLeft(positionLeft);

        targetElement.parentElement.dataset.zoomLevel = zoomLevel;

    }

    /**
     * I make all timelines inside the containerElement sortable.
     * @method makeTimelinesSortable
     * @param {HTMLElement} containerElement
     * @param {Float} zoomLevel
     */
    function makeTimelinesSortable(containerElement) {
        Sortable.create(containerElement, {
            draggable:        '.userTimelineWrapper',
            ghostClass:       'sortable-placeholder',
            filter:           '.compareTimelineElement',
            animation:        100,
            delay:            150,
            delayOnTouchOnly: true
        });
    }


    return {

        onChange: {
            editMode:        toggleEditMode,
            viewSize:        changeViewSize,
            viewSizeChanged: onViewSizeChanged,
            userColor:       changeUserColor,
        },

        initController:             initController,
        updateController:           updateController,
        updateStatesOfAnnotations:  updateStatesOfAnnotations,
        stackTimelineView:          stackTimelineView,

        deleteAnnotation:           deleteAnnotation,

        findTopMostActiveAnnotation: findTopMostActiveAnnotation,
        renderPropertiesControls:    renderPropertiesControls,
        renderAnnotationTimelines:   renderAnnotationTimelines,

        /**
         * An annotation can be selected to be
         * the annotationInFocus (either by clicking or dragging/resizing).
         * The annotation then displays additional controls in the #EditPropertiesControls
         * element of {{#crossLink "ViewVideo"}}ViewVideo{{/crossLink}}
         * @attribute annotationInFocus
         * @type Annotation or null
         */
        set annotationInFocus(annotation) { return setAnnotationInFocus(annotation) },
        get annotationInFocus()           { return annotationInFocus                },

        /**
         * I hold the callback function for start time (annotation.data.start) of the properties controls interface
         * (see {{#crossLink "AnnotationsController/renderPropertiesControls:method"}}renderPropertiesControls{{/crossLink}}).
         *
         * I am called from the "drag" event handler in {{#crossLink "Annotation/makeTimelineElementDraggable:method"}}Annotation/makeTimelineElementDraggable(){{/crossLink}}
         * and from the "resize" event handler in {{#crossLink "Annotation/makeTimelineElementResizeable:method"}}Annotation/makeTimelineElementResizeable(){{/crossLink}}.
         *
         * @attribute updateControlsStart
         * @type Function
         * @readOnly
         */
        get updateControlsStart()      {  return updateControlsStart     },
        /**
         * I hold the callback function for end time (annotation.data.end) of the properties controls interface
         * (see {{#crossLink "AnnotationsController/renderPropertiesControls:method"}}renderPropertiesControls{{/crossLink}}).
         *
         * I am called from the "drag" event handler in {{#crossLink "Annotation/makeTimelineElementDraggable:method"}}Annotation/makeTimelineElementDraggable(){{/crossLink}}
         * and from the "resize" event handler in {{#crossLink "Annotation/makeTimelineElementResizeable:method"}}Annotation/makeTimelineElementResizeable(){{/crossLink}}.
         *
         * @attribute updateControlsEnd
         * @type Function
         * @readOnly
         */
        get updateControlsEnd()        {  return updateControlsEnd       },


        /**
         * An annotation can be opened.
         * This means it opens the AnnotationsConatiner, where it has
         * already rendered its content (the annotationElement) into.
         * @attribute openedAnnotation
         * @type Annotation or null
         */
        get openedAnnotation()           { return openedAnnotation                },
        set openedAnnotation(annotation) { return setOpenedAnnotation(annotation) }

    };

});
