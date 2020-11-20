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

        ViewVideo.AnnotationTimeline.empty();

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

        ViewVideo.AnnotationTimeline.CollisionDetection({spacing:0, includeVerticalMargins:true});
        ViewVideo.adjustLayout();
        ViewVideo.adjustHypervideo();

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

        ViewVideo.AnnotationTimeline.css('height', '');
        ViewVideo.AnnotationTimeline.children('.timelineElement').css({
            top:    '',
            right:  '',
            bottom: '',
            height: ''
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


        for (var idx in annotations) {

            annotations[idx].annotationElement.removeClass('open previous next');
            annotations[idx].timelineElement.removeClass('open');
            annotations[idx].tileElement.removeClass('open');

        }

        if (annotation) {

            annotation.annotationElement.addClass('open');
            annotation.annotationElement.prev().addClass('previous');
            annotation.annotationElement.next().addClass('next');

            updateAnnotationSlider();

            ViewVideo.shownDetails = 'bottom';

            if ( annotation.data.type == 'location' && annotation.annotationElement.children('.resourceDetail').data('map') ) {
                annotation.annotationElement.children('.resourceDetail').data('map').updateSize();
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

        ViewVideo.EditPropertiesContainer.empty().addClass('active').append( propertiesControlsInterface.controlsContainer );

        updateControlsStart        = propertiesControlsInterface.changeStart;
        updateControlsEnd          = propertiesControlsInterface.changeEnd;

        ViewVideo.EditPropertiesContainer.find('.annotationOptionsTabs').tabs('refresh');

        if ( ViewVideo.EditPropertiesContainer.find('.CodeMirror').length != 0 ) {
            ViewVideo.EditPropertiesContainer.find('.CodeMirror')[0].CodeMirror.refresh();
        }

    }


    /**
     * I am the counterpart of {{#crossLink "AnnotationsController/renderPropertiesControls:method"}}renderPropertiesControls method{{/crossLink}}.
     * I remove the DOM element and the update functions.
     * @method removePropertiesControls
     */
    function removePropertiesControls() {


        updateControlsStart      = function(){};
        updateControlsEnd        = function(){};

        ViewVideo.EditPropertiesContainer.removeClass('active').empty();

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

        ViewVideo.EditingOptions.empty();

        var annotationsEditingOptions = $('<div class="overlayEditingTabs">'
                                  +   '    <ul>'
                                  +   '        <li><a href="#ResourceList">Add Resource</a></li>'
                                  +   '        <li><a href="#CustomAnnotation">Add Custom Annotation</a></li>'
                                  +   '        <li><a href="#OtherUsers">Choose Annotations of other Users</a></li>'
                                  +   '    </ul>'
                                  +   '    <div id="ResourceList"></div>'
                                  +   '    <div id="CustomAnnotation"></div>'
                                  +   '    <div id="OtherUsers">'
                                  +   '        <div class="message active">Drag Annotations from the User Timelines to your Annotation Timeline</div>'
                                  +   '        <div class="timelineList" data-zoom-level="1"></div>'
                                  +   '    </div>'
                                  +   '</div>')
                                  .tabs({
                                      heightStyle: "fill"
                                  }),

            timelineList        = annotationsEditingOptions.find('.timelineList');



        ViewVideo.EditingOptions.append(annotationsEditingOptions);

        FrameTrail.module('ResourceManager').renderResourcePicker(
            annotationsEditingOptions.find('#ResourceList')
        );

        /* Append custom text resource to 'Add Custom Annotation' tab */
        // TODO: Move to separate function
        var textElement = $('<div class="resourceThumb" data-type="text">'
                + '                  <div class="resourceOverlay">'
                + '                      <div class="resourceIcon"></div>'
                + '                  </div>'
                + '                  <div class="resourceTitle">Custom Text/HTML</div>'
                + '              </div>');

        textElement.draggable({
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

        annotationsEditingOptions.find('#CustomAnnotation').append(textElement);

        /* Choose Annotations of other users */

        renderAnnotationTimelines(annotations, timelineList, 'creatorId', 'label', true);

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

            ViewVideo.AnnotationTimeline.droppable({
                accept:         '.resourceThumb, .compareTimelineElement',
                activeClass:    'droppableActive',
                hoverClass:     'droppableHover',
                tolerance:      'touch',

                over: function( event, ui ) {
                    ViewVideo.PlayerProgress.find('.ui-slider-handle').addClass('highlight');
                },

                out: function( event, ui ) {
                    ViewVideo.PlayerProgress.find('.ui-slider-handle').removeClass('highlight');
                },

                drop: function( event, ui ) {

                    //console.log(ui);
                    try {
                        if (TogetherJS && TogetherJS.running && !event.relatedTarget) {
                            var elementFinder = TogetherJS.require("elementFinder");
                            var location = elementFinder.elementLocation(ui.draggable[0]);
                            TogetherJS.send({
                                type: "simulate-annotation-add", 
                                element: location,
                                containerElement: '.annotationTimeline'
                            });
                        }
                    } catch (e) {}
                    
                    var resourceID      = ui.helper.attr('data-resourceID'),
                        videoDuration   = FrameTrail.module('HypervideoModel').duration,
                        startTime,
                        endTime,
                        newAnnotation;

                        if (ui.helper.hasClass('compareTimelineElement')) {

                            startTime   = parseFloat(ui.helper.attr('data-start'));
                            endTime     = parseFloat(ui.helper.attr('data-end'));

                        } else {

                            startTime   = FrameTrail.module('HypervideoController').currentTime;
                            endTime     = (startTime + 4 > videoDuration)
                                            ? videoDuration
                                            : startTime + 4;
                        }

                        if (ui.helper.attr('data-type') == 'text') {

                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "name":         "Custom Text/HTML",
                                "type":         ui.helper.attr('data-type'),
                                "start":        startTime,
                                "end":          endTime,
                                "attributes":   {
                                    "text":         ""
                                }
                            });

                        } else if (!resourceID) {

                            var resourceData = ui.helper.data('originResourceData');

                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "name":         resourceData.name,
                                "type":         resourceData.type,
                                "src":          resourceData.src,
                                "thumb":        resourceData.thumb,
                                "start":        startTime,
                                "end":          endTime,
                                "attributes":   resourceData.attributes,
                                "tags":         resourceData.tags
                            });

                        } else {

                            newAnnotation = FrameTrail.module('HypervideoModel').newAnnotation({
                                "start":        startTime,
                                "end":          endTime,
                                "resourceId":   resourceID
                            });

                        }

                    newAnnotation.renderInDOM();
                    newAnnotation.startEditing();
                    updateStatesOfAnnotations(FrameTrail.module('HypervideoController').currentTime);

                    stackTimelineView();


                    ViewVideo.PlayerProgress.find('.ui-slider-handle').removeClass('highlight');

                }


            });

        } else {

            ViewVideo.AnnotationTimeline.droppable('destroy');

        }

    }


    /**
     * I am the starting point for the process of deleting
     * an annotation.
     * @method deleteAnnotation
     * @param {Annotation} annotation
     */
    function deleteAnnotation(annotation) {

        setAnnotationInFocus(null);
        annotation.removeFromDOM();
        //distributeTiles();
        FrameTrail.module('HypervideoModel').removeAnnotation(annotation);

        stackTimelineView();

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

        var timelineZoomWrapper = $('<div class="timelineZoomWrapper"></div>'),
            timelineZoomScroller = $('<div class="timelineZoomScroller"></div>');

        timelineZoomScroller.appendTo(timelineZoomWrapper);
        
        if (zoomControls) {
            
            timelineZoomWrapper.on('scroll', function(evt) {
                var scrollLeftVal = $(this).scrollLeft();
                $(this).find('.userLabel').css('left', scrollLeftVal + 'px');
            });

            var zoomControlsWrapper = $('<div class="zoomControlsWrapper"></div>'),
                zoomMinus = $('<button class="button zoomMinus"><span class="icon-zoom-out"></span></button>'),
                zoomPlus = $('<button class="button zoomPlus"><span class="icon-zoom-in"></span></button>');
            
            zoomMinus.click(function() {
                var currentZoomLevel = parseFloat($(this).parent().parent().attr('data-zoom-level'));
                zoomTimelines(timelineZoomWrapper, currentZoomLevel-0.5 );
            });
            zoomPlus.click(function() {
                var currentZoomLevel = parseFloat($(this).parent().parent().attr('data-zoom-level'));
                zoomTimelines(timelineZoomWrapper, currentZoomLevel+0.5);
                //console.log(currentZoomLevel);
            });
            zoomControlsWrapper.append(zoomPlus, zoomMinus);

            targetElement.append(zoomControlsWrapper);

            var timelineProgress = $('<div class="timelineProgressWrapper"><div class="timelineProgressRange"></div></div>');
            timelineZoomScroller.append(timelineProgress);

            var leftStart;
        }

        for (var i=0; i<collectedAnnotationsPerAspectData.length; i++) {

            if (collectedAnnotationsPerAspectData[i].userID === FrameTrail.module('UserManagement').userID) {
                //continue;
            }
                        
            var aspectLabel =  collectedAnnotationsPerAspectData[i].label,
                aspectColor = collectedAnnotationsPerAspectData[i].color,
                aspectValues = collectedAnnotationsPerAspectData[i].annotationTypeValues;

            //console.log(aspectLabel);

            var iconClass = (filterAspect == 'creatorId') ? 'icon-user' : 'icon-tag';
            
            var movieTitle = FrameTrail.module('HypervideoModel').hypervideoName.replace(/<\/?[^>]+(>|$)/g, "");
            var exportFileName = movieTitle +'_' + aspectLabel;
            exportFileName = exportFileName.replace(/[\s:]/g, '-').replace(/[|&;:$%@<>()+,]/g, '').replace(/__/g, '_').replace(/--/g, '-');
            var exportData = getAnnotationDataAsCSV(collectedAnnotationsPerAspectData[i].annotations);
            var exportButtonString = '<a class="exportTimelineDataButton" title="Export Annotation Data as CSV File" download="'+ exportFileName +'.csv" href="'+ exportData +'">Export Data</a>';

            var userTimelineWrapper = $(    '<div class="userTimelineWrapper">'
                                        +   '    <div class="userLabel" style="color: '+ aspectColor +'">'
                                        +   '        <span class="'+ iconClass +'"></span>'
                                        +   '        <span>'+ aspectLabel + '</span>'+exportButtonString
                                        +   '        <div class="timelineValues"></div>'
                                        +   '    </div>'
                                        +   '    <div class="userTimeline"></div>'
                                        +   '</div>'),
                legendContainer = userTimelineWrapper.find('.timelineValues'),
                userTimeline = userTimelineWrapper.find('.userTimeline');

            if (aspectValues && aspectValues.values.length != 0) {
                
                var evolvingValuesLegendElement = $('<span class="timelineLegendLabel" data-origin-type="ao:EvolvingValuesAnnotationType" title="Evolving Values" style="color: #777;">TO</span>'),
                    contrastingValuesLegendElement = $('<span class="timelineLegendLabel" data-origin-type="ao:ContrastingValuesAnnotationType" title="Contrasting Values" style="color: #777;">VS</span>');

                evolvingValuesLegendElement.hover(function(evt) {
                    var thisOriginType = $(this).attr('data-origin-type');
                    $(this).siblings().css('opacity', 0.2);
                    $(this).css('opacity', 1);
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type]), [data-timeline-color]').removeClass('opaque');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type])').addClass('transparentBackground');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement[data-origin-type]:not([data-origin-type="'+ thisOriginType +'"]), [data-origin-type]:not([data-origin-type="'+ thisOriginType +'"])').addClass('opaque');
                }, function(evt) {
                    $(this).siblings().css('opacity', '');
                    $(this).css('opacity', '');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type]), [data-origin-type]').removeClass('opaque');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type])').removeClass('transparentBackground');
                });
                contrastingValuesLegendElement.hover(function(evt) {
                    var thisOriginType = $(this).attr('data-origin-type');
                    $(this).siblings().css('opacity', 0.2);
                    $(this).css('opacity', 1);
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type]), [data-timeline-color]').removeClass('opaque');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type])').addClass('transparentBackground');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement[data-origin-type]:not([data-origin-type="'+ thisOriginType +'"]), [data-origin-type]:not([data-origin-type="'+ thisOriginType +'"])').addClass('opaque');
                }, function(evt) {
                    $(this).siblings().css('opacity', '');
                    $(this).css('opacity', '');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type]), [data-origin-type]').removeClass('opaque');
                    $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-origin-type])').removeClass('transparentBackground');
                });
                legendContainer.append(evolvingValuesLegendElement, contrastingValuesLegendElement);

                for (var v=0; v<aspectValues.values.length; v++) {
                    var numericRatio = aspectValues.values[v].elementNumericValue / aspectValues.maxNumericValue,
                        relativeHeight = 100 * (numericRatio),
                        timelineColor = (aspectValues.maxNumericValue) ? Math.round(numericRatio * 12) : v*1 + 1;
                    if (aspectLabel.indexOf('Colour Range') != -1 || aspectLabel.indexOf('Colour Accent') != -1) {
                        var valueLegendElement = $('<span class="timelineLegendLabel" data-numeric-value="'+ aspectValues.values[v].elementNumericValue +'" data-timeline-color="'+ aspectValues.values[v].name +'" style="color: '+ aspectValues.values[v].name +';">'+ aspectValues.values[v].name +'</span>');
                    } else {
                        var valueLegendElement = $('<span class="timelineLegendLabel" data-numeric-value="'+ aspectValues.values[v].elementNumericValue +'" data-timeline-color="'+ timelineColor +'">'+ aspectValues.values[v].name +'</span>');
                    }
                    valueLegendElement.hover(function(evt) {
                        var thisColor = $(this).attr('data-timeline-color');
                        $(this).siblings().css('opacity', 0.2);
                        $(this).css('opacity', 1);
                        $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-timeline-color]), [data-timeline-color]').removeClass('opaque');
                        $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-timeline-color])').addClass('transparentBackground');
                        $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement[data-timeline-color]:not([data-timeline-color="'+ thisColor +'"]), [data-timeline-color]:not([data-timeline-color="'+ thisColor +'"])').addClass('opaque');
                    }, function(evt) {
                        $(this).siblings().css('opacity', '');
                        $(this).css('opacity', '');
                        $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-timeline-color]), [data-timeline-color]').removeClass('opaque');
                        $(this).parents('.userLabel').next('.userTimeline').find('.compareTimelineElement:not([data-timeline-color])').removeClass('transparentBackground');
                    });
                    legendContainer.append(valueLegendElement);
                }
            }

            var firstAnnotation = (collectedAnnotationsPerAspectData[i].annotations[0]) ? collectedAnnotationsPerAspectData[i].annotations[0] : null,
                timelineMaxValue = 1;
            if (firstAnnotation && firstAnnotation.data.source.url.body && firstAnnotation.data.source.url.body.maxNumericValue && firstAnnotation.data.source.url['advene:type'] != 'ShotDuration') {
                timelineMaxValue = firstAnnotation.data.source.url.body.maxNumericValue;
                //console.log(gridLevels);
                for (var gl=1; gl<timelineMaxValue; gl++) {
                    var bottomValue = 100 * (gl / timelineMaxValue);
                    userTimeline.append('<div class="horizontalGridLine" style="bottom: '+ bottomValue +'%;"></div>');
                }
            }

            userTimelineWrapper.attr('data-timeline-max-value', timelineMaxValue);
            userTimelineWrapper.attr('data-type-label', aspectLabel);
            
            var overlapLeft = false,
                overlapRight = false;

            for (var idx in collectedAnnotationsPerAspectData[i].annotations) {
                var compareTimelineItem = collectedAnnotationsPerAspectData[i].annotations[idx].renderCompareTimelineItem();
                if (compareTimelineItem.hasClass('overlapLeft')) overlapLeft = true;
                if (compareTimelineItem.hasClass('overlapRight')) overlapRight = true;
                //TODO: Fix conflict between aspectColor and value (in same element)
                compareTimelineItem.css('background-color', aspectColor);
                if (compareTimelineItem.attr('data-origin-type') == 'ao:EvolvingValuesAnnotationType') {
                    compareTimelineItem.find('path').attr('fill', aspectColor);
                }

                userTimeline.append(compareTimelineItem);
            }

            if (overlapLeft) {
                userTimeline.append('<div class="overlapIndicatorLeft"><span class="icon-angle-double-left"></span></div>');
            }
            if (overlapRight) {
                userTimeline.append('<div class="overlapIndicatorRight"><span class="icon-angle-double-right"></span></div>');
            }

            timelineZoomScroller.append(userTimelineWrapper);

        }

        targetElement.append(timelineZoomWrapper);

        makeTimelinesSortable(timelineZoomScroller);

    }

    /**
     * I prepare the annotationData for the CSV File Export.
     * @method getAnnotationDataAsCSV
     * @param {Array} annotationData
     */
    function getAnnotationDataAsCSV(annotationData) {
        var csvString = 'StartTime\tEndTime\tValue\n';

        for (var i = 0; i < annotationData.length; i++) {
            if (annotationData[i].data.source.url.target.selector["advene:end"]) {
                var startTime = annotationData[i].data.source.url.target.selector["advene:begin"],
                    endTime = annotationData[i].data.source.url.target.selector["advene:end"];
                csvString += startTime +'\t' + endTime +'\t'+ annotationData[i].data.name +'\n';
            } else {
                csvString += annotationData[i].data.start +'\t' + annotationData[i].data.end +'\t'+ annotationData[i].data.name +'\n';
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
            currentLeft = parseInt(targetElement.eq(0).scrollLeft()),
            currentWidth = targetElement.find('.timelineZoomScroller').eq(0).width(),
            focusPoint = 2,
            positionLeft = (targetElement.width() * (zoomLevel/focusPoint)) + (targetElement.width()/focusPoint),
            currentOffset = currentLeft + (currentLeft + currentWidth - targetElement.width());

        /*
        console.log('Left: '+ currentLeft);
        console.log('Right: '+ (currentLeft + currentWidth - targetElement.width()));
        console.log('Offset: '+ currentOffset / zoomLevel);
        */

        positionLeft = (positionLeft + (currentOffset / zoomLevel));

        if (positionLeft > 0 || zoomLevel == 1) {
            positionLeft = 0;
        }

        if ( (targetElement.width()*zoomLevel) - targetElement.width() + currentOffset < 0  ) {
            positionLeft = (targetElement.width()*zoomLevel) - targetElement.width();
        }

        targetElement.find('.timelineZoomScroller').css({
            width: zoomPercent + '%'
        });

        //TODO: FIX POSITIONING
        //targetElement.scrollLeft(positionLeft);

        targetElement.parent().attr('data-zoom-level', zoomLevel);

    }

    /**
     * I make all timelines inside the containerElement sortable.
     * @method makeTimelinesSortable
     * @param {HTMLElement} containerElement
     * @param {Float} zoomLevel
     */
    function makeTimelinesSortable(containerElement) {
        containerElement.sortable({
            placeholder: 'ui-state-highlight',
            items: '> .userTimelineWrapper',
            axis: 'y'
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
