/**
 * @module Player
 */


/**
 * I am the type definition of an Annotation. An annotation is a user-generated content
 * which is associated with start and end time of the main video.
 *
 * An annotation can hold any type of {{#crossLink "Resource"}}Resource{{/crossLink}}.
 *
 * Annotations are grouped in annotation sets, which are assigned to a user. Each user can have 0 or 1 annotation set.
 *
 * Annotations are managed by the {{#crossLink "AnnotationsController"}}AnnotationsController{{/crossLink}}.
 *
 * @class Annotation
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'Annotation',

    function (FrameTrail) {
        return {
            constructor: function(data){

                this.data = data;

                this.resourceItem = FrameTrail.newObject(
                    ('Resource' + data.type.charAt(0).toUpperCase() + data.type.slice(1)),
                    data
                )

                this.timelineElement   = $('<div class="timelineElement" data-type="'+ this.data.type +'" data-uri="'+ this.data.uri +'"><div class="previewWrapper"></div></div>');
                this.contentViewElements = [];
                this.contentViewDetailElements = [];

            },
            prototype: {
                /** I hold the data object of an Annotation, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in one of the hypervideos's annotations files.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I hold the Resource object of the annotation.
                 * @attribute resourceItem
                 * @type Resource
                 */
                resourceItem:           {},

                /**
                 * I hold the timelineElement (a jquery-enabled HTMLElement), which indicates my start and end time.
                 * @attribute timelineElement
                 * @type HTMLElement
                 */
                timelineElement:        null,

                /**
                 * I store my state, wether I am "active" (this is, when my timelineElement is highlighted) or not.
                 * @attribute activeState
                 * @type Boolean
                 */
                activeState:            false,

                /**
                 * I store my state, wether I am "in focus" or not. See also:
                 * * {{#crossLink "Annotation/gotInFocus:method"}}Annotation/gotInFocus(){{/crossLink}}
                 * * {{#crossLink "Annotation/removedFromFocus:method"}}Annotation/removedFromFocus(){{/crossLink}}
                 * * {{#crossLink "AnnotationsController/overlayInFocus:attribute"}}AnnotationsController/overlayInFocus{{/crossLink}}
                 * @attribute permanentFocusState
                 * @type Boolean
                 */
                permanentFocusState:    false,



                /**
                 * I render my DOM elements into the DOM.
                 *
                 * I am called, when the Annotation is initialized. My counterpart ist {{#crossLink "Annotation/removeFromDOM:method"}}Annotation/removeFromDOM{{/crossLink}}.
                 *
                 * @method renderInDOM
                 */
                renderInDOM: function () {

                    var ViewVideo = FrameTrail.module('ViewVideo');

                    ViewVideo.AnnotationTimeline.append(this.timelineElement);

                    this.timelineElement.find('.previewWrapper').empty().append(
                        this.resourceItem.renderThumb()
                    );

                    this.updateTimelineElement();

                    /*
                    this.annotationElement.empty();
                    this.annotationElement.append( this.resourceItem.renderContent() );
                    ViewVideo.AreaBottomDetails.find('#AnnotationSlider').append(this.annotationElement);

                    this.previewElement.empty();
                    this.previewElement.append( this.resourceItem.renderContent() );
                    ViewVideo.AnnotationPreviewContainer.append(this.previewElement);
                    ViewVideo.AreaBottomTileSlider.append(this.tileElement);
                    */

                    this.timelineElement.unbind('hover');
                    //this.tileElement.unbind('hover');
                    //this.tileElement.unbind('click')
                    this.timelineElement.hover(this.brushIn.bind(this), this.brushOut.bind(this));
                    //this.tileElement.hover(this.brushIn.bind(this), this.brushOut.bind(this));

                    // self = this necessary as self can not be kept in anonymous handler function
                    var self = this;

                    /*
                    this.tileElement.click(function() {
                        if ( FrameTrail.module('AnnotationsController').openedAnnotation == self ) {
                            self.closeAnnotation();
                        } else {
                            self.openAnnotation();
                        }
                    });
                    */

                },


                /**
                 * I update the CSS of the {{#crossLink "Annotation/timelineElement:attribute"}}timelineElement{{/crossLink}}
                 * to its correct position within the timeline.
                 *
                 * @method updateTimelineElement
                 */
                updateTimelineElement: function () {

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        videoDuration   = HypervideoModel.duration,
                        positionLeft    = 100 * ((this.data.start - HypervideoModel.offsetIn) / videoDuration),
                        width           = 100 * ((this.data.end - this.data.start) / videoDuration);

                    this.timelineElement.css({
                        top: '',
                        left:  positionLeft + '%',
                        right: '',
                        width: width + '%'
                    });

                    this.timelineElement.removeClass('previewPositionLeft previewPositionRight');

                    if (positionLeft < 10 && width < 10) {
                        this.timelineElement.addClass('previewPositionLeft');
                    } else if (positionLeft > 90) {
                        this.timelineElement.addClass('previewPositionRight');
                    }

                },


                /**
                 * I remove my elements from the DOM.
                 *
                 * I am called when the Annotation is to be deleted.
                 *
                 * @method removeFromDOM
                 * @return
                 */
                removeFromDOM: function () {

                    this.timelineElement.remove();

                },


                /**
                 * I am called when the mouse pointer is hovering over one of my two DOM elements.
                 *
                 * I use the Raphael.js library to draw connecting lines betweem my tileElement and my timelineElement.
                 *
                 * @method brushIn
                 */
                brushIn: function () {

                    this.timelineElement.addClass('brushed');
                    //this.tileElement.addClass('brushed');

                    if ( FrameTrail.getState('editMode') == false || FrameTrail.getState('editMode') == 'preview' ) {
                        clearRaphael();
                        //drawConnections( this.tileElement, this.timelineElement, 10, {stroke: "#6B7884"} );
                    }

                },


                /**
                 * I am called when the mouse pointer is leaving the hovering area over my two DOM elements.
                 * @method brushOut
                 */
                brushOut: function () {

                    this.timelineElement.removeClass('brushed');
                    //this.tileElement.removeClass('brushed');

                    if ( (FrameTrail.getState('editMode') ==  false || FrameTrail.getState('editMode') ==  'preview') ) {
                        clearRaphael();
                    }

                },


                /**
                 * When I am scheduled to be displayed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.activeState = true;
                    this.timelineElement.addClass('active');

                },


                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.activeState = false;
                    this.timelineElement.removeClass('active');

                },


                /**
                 * An annotation can be "opened" and "closed".
                 *
                 * When I am called, I open the annotation, which means:
                 * * I set the current play position to my data.start value
                 * * I tell the {{#crossLink "AnnotationsController/openedAnnotation:attribute"}}AnnotationsController{{/crossLink}} to set me as the "openedAnnotation"
                 *
                 * @method openAnnotation
                 * @return
                 */
                openAnnotation: function () {

                    var ViewVideo = FrameTrail.module('ViewVideo');

                    //FrameTrail.module('HypervideoController').currentTime = this.data.start;

                    FrameTrail.module('AnnotationsController').openedAnnotation = this;

                    this.timelineElement.addClass('open');

                    ViewVideo.ExpandButton.one('click', this.closeAnnotation.bind(this));
                    
                },

                /**
                 * I tell the {{#crossLink "AnnotationsController/openedAnnotation:attribute"}}AnnotationsController{{/crossLink}} to set "openedAnnotation" to null.
                 * @method closeAnnotation
                 */
                closeAnnotation: function () {

                    FrameTrail.module('AnnotationsController').openedAnnotation = null;

                },


                /**
                 * I am called when the app switches to the editMode "annotations".
                 *
                 * I make sure
                 * * that my {{#crossLink "Annotation/timelineElement:attribute"}}timelineElement{{/crossLink}} is resizable and draggable
                 * * that my elements have click handlers for putting myself into focus.
                 *
                 * @method startEditing
                 */
                startEditing: function () {

                    var self = this,
                        AnnotationsController = FrameTrail.module('AnnotationsController');

                    window.setTimeout(function() {
                        self.makeTimelineElementDraggable();
                        self.makeTimelineElementResizeable();
                    }, 50);
                    
                    this.timelineElement.on('click', function(){

                        if (AnnotationsController.annotationInFocus === self){
                            return AnnotationsController.annotationInFocus = null;
                        }

                        self.permanentFocusState = true;
                        AnnotationsController.annotationInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start;

                    });

                },

                /**
                 * When the global editMode leaves the state "annotations", I am called to
                 * stop the editing features of the annotations.
                 *
                 * @method stopEditing
                 */
                stopEditing: function () {

                    if (this.timelineElement.data('ui-draggable')) {
                        this.timelineElement.draggable('destroy');
                    }
                    if (this.timelineElement.data('ui-resizable')) {
                        this.timelineElement.resizable('destroy');
                    }
                    
                    this.timelineElement.unbind('click');

                },


                /**
                 * I make my {{#crossLink "Overlay/timelineElement:attribute"}}timelineElement{{/crossLink}} draggable.
                 *
                 * The event handling changes my this.data.start and this.data.end attributes
                 * accordingly.
                 *
                 * @method makeTimelineElementDraggable
                 */
                makeTimelineElementDraggable: function () {

                    var self = this,
                        oldAnnotationData;

                    this.timelineElement.draggable({
                        axis:        'x',
                        containment: 'parent',
                        snapTolerance: 10,

                        drag: function(event, ui) {

                            var closestGridline = FrameTrail.module('ViewVideo').closestToOffset($(FrameTrail.getState('target')).find('.gridline'), {
                                    left: ui.position.left,
                                    top: ui.position.top
                                }),
                                snapTolerance = $(this).draggable('option', 'snapTolerance');

                            if (closestGridline) {

                                $(FrameTrail.getState('target')).find('.gridline').css('background-color', '#ff9900');

                                if ( ui.position.left - snapTolerance < closestGridline.position().left &&
                                     ui.position.left + snapTolerance > closestGridline.position().left ) {

                                    ui.position.left = closestGridline.position().left;

                                    closestGridline.css('background-color', '#00ff00');

                                }
                            }

                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                widthPercent  = 100 * (ui.helper.width() / ui.helper.parent().width()),
                                newStartValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn,
                                newEndValue   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            FrameTrail.module('HypervideoController').currentTime = newStartValue;
                            FrameTrail.module('AnnotationsController').updateControlsStart(newStartValue);
                            FrameTrail.module('AnnotationsController').updateControlsEnd(newEndValue);

                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('AnnotationsController').annotationInFocus = self;
                            }

                            oldAnnotationData = jQuery.extend({}, self.data);

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('AnnotationsController').annotationInFocus = null;
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                widthPercent  = 100 * (ui.helper.width() / ui.helper.parent().width());

                            self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                            self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            try {
                                if (TogetherJS && TogetherJS.running && !event.relatedTarget) {
                                    var elementFinder = TogetherJS.require("elementFinder");
                                    var location = elementFinder.elementLocation(ui.helper[0]);
                                    TogetherJS.send({
                                        type: "simulate-annotation-change", 
                                        element: location,
                                        containerElement: '.annotationTimeline',
                                        resourceID: self.data.resourceId,
                                        startTime: self.data.start,
                                        endTime: self.data.end
                                    });
                                }
                            } catch (e) {}

                            self.updateTimelineElement();

                            FrameTrail.module('AnnotationsController').stackTimelineView();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');

                            FrameTrail.triggerEvent('userAction', {
                                action: 'AnnotationChange',
                                annotation: self.data,
                                changes: [
                                    {
                                        property: 'start',
                                        oldValue: oldAnnotationData.start,
                                        newValue: self.data.start
                                    },
                                    {
                                        property: 'end',
                                        oldValue: oldAnnotationData.end,
                                        newValue: self.data.end
                                    }
                                ]
                            });

                        }
                    });

                },

                /**
                 * I make my {{#crossLink "Annotation/timelineElement:attribute"}}timelineElement{{/crossLink}} resizable.
                 *
                 * The event handling changes my this.data.start and this.data.end attributes
                 * accordingly.
                 *
                 * @method makeTimelineElementResizeable
                 * @return
                 */
                makeTimelineElementResizeable: function () {

                    var self = this,
                        endHandleGrabbed,
                        oldAnnotationData;

                    this.timelineElement.resizable({

                        containment: 'parent',
                        handles:     'e, w',

                        resize: function(event, ui) {

                            var closestGridline = FrameTrail.module('ViewVideo').closestToOffset($(FrameTrail.getState('target')).find('.gridline'), {
                                    left: (endHandleGrabbed ? (ui.position.left + ui.helper.width()) : ui.position.left),
                                    top: ui.position.top
                                }),
                                snapTolerance = $(this).draggable('option', 'snapTolerance');

                            if (closestGridline) {

                                $(FrameTrail.getState('target')).find('.gridline').css('background-color', '#ff9900');

                                if ( !endHandleGrabbed &&
                                     ui.position.left - snapTolerance < closestGridline.position().left &&
                                     ui.position.left + snapTolerance > closestGridline.position().left ) {

                                    ui.position.left = closestGridline.position().left;
                                    ui.size.width = ( ui.helper.width() + ( ui.helper.position().left - ui.position.left ) );

                                    closestGridline.css('background-color', '#00ff00');

                                } else if ( endHandleGrabbed &&
                                            ui.position.left + ui.helper.width() - snapTolerance < closestGridline.position().left &&
                                            ui.position.left + ui.helper.width() + snapTolerance > closestGridline.position().left ) {

                                    ui.helper.width(closestGridline.position().left - ui.position.left);

                                    closestGridline.css('background-color', '#00ff00');

                                }
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.position.left / ui.helper.parent().width()),
                                widthPercent  = 100 * (ui.helper.width() / ui.helper.parent().width()),
                                newValue;

                            if ( endHandleGrabbed ) {

                                newValue = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                FrameTrail.module('HypervideoController').currentTime = newValue;
                                FrameTrail.module('AnnotationsController').updateControlsEnd(newValue);

                            } else {

                                newValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                FrameTrail.module('HypervideoController').currentTime = newValue;
                                FrameTrail.module('AnnotationsController').updateControlsStart(newValue);

                            }

                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('AnnotationsController').annotationInFocus = self;
                            }

                            endHandleGrabbed = $(event.originalEvent.target).hasClass('ui-resizable-e');

                            oldAnnotationData = jQuery.extend({}, self.data);

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('AnnotationsController').annotationInFocus = null;
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent  = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                widthPercent = 100 * (ui.helper.width() / ui.helper.parent().width());


                            self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                            self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            try {
                                if (TogetherJS && TogetherJS.running && !event.relatedTarget) {
                                    var elementFinder = TogetherJS.require("elementFinder");
                                    var location = elementFinder.elementLocation(ui.helper[0]);
                                    TogetherJS.send({
                                        type: "simulate-annotation-change", 
                                        element: location,
                                        containerElement: '.annotationTimeline',
                                        resourceID: self.data.resourceId,
                                        startTime: self.data.start,
                                        endTime: self.data.end
                                    });
                                }
                            } catch (e) {}
                            
                            FrameTrail.module('AnnotationsController').stackTimelineView();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');

                            FrameTrail.triggerEvent('userAction', {
                                action: 'AnnotationChange',
                                annotation: self.data,
                                changes: [
                                    {
                                        property: 'start',
                                        oldValue: oldAnnotationData.start,
                                        newValue: self.data.start
                                    },
                                    {
                                        property: 'end',
                                        oldValue: oldAnnotationData.end,
                                        newValue: self.data.end
                                    }
                                ]
                            });

                        }
                    });

                },


                /**
                 * When I "got into focus" (which happens, when I become the referenced object in the AnnotationsController's
                 * {{#crossLink "AnnotationsController/annotationInFocus:attribute"}}annotationInFocus attribute{{/crossLink}}),
                 * then this method will be called.
                 *
                 * @method gotInFocus
                 */
                gotInFocus: function () {

                    FrameTrail.module('AnnotationsController').renderPropertiesControls(
                        this.resourceItem.renderTimeControls(this)
                    );

                    this.timelineElement.addClass('highlighted');

                },


                /**
                 * See also: {{#crossLink "Annotation/gotIntoFocus:method"}}this.gotIntoFocus(){{/crossLink}}
                 *
                 * When I was "removed from focus" (which happens, when the AnnotationsController's
                 * {{#crossLink "AnnotationsController/annotationInFocus:attribute"}}annotationInFocus attribute{{/crossLink}}),
                 * is set either to null or to an other annotation than myself),
                 * then this method will be called.
                 *
                 * @method removedFromFocus
                 */
                removedFromFocus: function () {

                    this.timelineElement.removeClass('highlighted');

                },


                /**
                 * When the global state editMode is "annotations", the user can also choose to create
                 * new annotations from other user's annotations (which makes a copy of that data and
                 * places a new annotation in the user's collection of his/her own annotations).
                 *
                 * These annotation timelines from other users are called "compare timelines" (in contrast to the user's own timeline),.
                 *
                 * For this purpose, I create a special, jquery-enabled HTMLElement, which carries
                 * all the necessary information to create a new annotation in its data attributes. The
                 * returned element is draggable, and ready to be
                 * {{#crossLink "AnnotationsController:makeTimelineDroppable:method"}}dropped onto the annotation timeline{{/crossLink}}.
                 *
                 * @method renderCompareTimelineItem
                 * @return HTMLElement
                 */
                renderCompareTimelineItem: function() {
                    
                    var cleanStart = FrameTrail.module('HypervideoController').formatTime(this.data.start),
                        cleanEnd = FrameTrail.module('HypervideoController').formatTime(this.data.end),
                        compareTimelineElement = $(
                            '<div class="compareTimelineElement" '
                        +   ' data-type="'
                        +   this.data.type
                        +   '" data-uri="'
                        +   this.data.uri
                        +   '" data-start="'
                        +   this.data.start
                        +   '" data-end="'
                        +   this.data.end
                        +   '">'
                        +   '    <div class="previewWrapper"></div>'
                        +   '    <div class="compareTimelineElementTime">'
                        +   '        <div class="compareTimeStart">'
                        +   cleanStart
                        +   '        </div>'
                        +   '        <div class="compareTimeEnd">'
                        +   cleanEnd
                        +   '        </div>'
                        +   '    </div>'
                        +   '</div>'
                    ),

                        HypervideoModel = FrameTrail.module('HypervideoModel'),
                        timeStart       = this.data.start - HypervideoModel.offsetIn,
                        timeEnd         = this.data.end - HypervideoModel.offsetOut;
                        videoDuration   = HypervideoModel.duration,
                        positionLeft    = 100 * (timeStart / videoDuration),
                        width           = 100 * ((this.data.end - this.data.start) / videoDuration);

                    if (this.data.end > HypervideoModel.offsetOut) {
                        compareTimelineElement.addClass('overlapRight');
                    }
                    if (HypervideoModel.offsetIn > this.data.start) {
                        compareTimelineElement.addClass('overlapLeft');
                    }

                    var numericValue = false,
                        maxNumericValue = '5',
                        annotationValueIndex = false,
                        dataType = false,
                        annotationType = '';

                    /*
                    console.log("ORIGIN-START: "+this.data.start);
                    console.log("START: "+timeStart);
                    console.log("DURATION: "+videoDuration);
                    console.log("Position Left: "+positionLeft);
                    */
                        
                    if (this.data.source.url.body) {
                        if (Array.isArray(this.data.source.url.body)) {
                            if (this.data.source.url.body[1].type == 'TextualBody') {
                                numericValue = this.data.source.url.body[0].annotationNumericValue;
                                maxNumericValue = this.data.source.url.body[0].maxNumericValue;
                                annotationValueIndex = this.data.source.url.body[0].annotationValueIndex;
                                dataType = this.data.source.url.body[0].type;
                                annotationType = this.data.source.url.body[0].annotationType;
                            } else {
                                numericValue = this.data.source.url.body[1].annotationNumericValue;
                                maxNumericValue = this.data.source.url.body[1].maxNumericValue;
                                annotationValueIndex = this.data.source.url.body[1].annotationValueIndex;
                                dataType = this.data.source.url.body[1].type;
                                annotationType = this.data.source.url.body[1].annotationType;
                            }
                            
                        } else {
                            numericValue = this.data.source.url.body.annotationNumericValue;
                            maxNumericValue = this.data.source.url.body.maxNumericValue;
                            annotationValueIndex = this.data.source.url.body.annotationValueIndex;
                            dataType = this.data.source.url.body.type;
                            annotationType = this.data.source.url.body.annotationType;
                        }
                    }

                   	//console.log('ORIGIN BODY:', this.data);
                    //console.log('numericValue:', numericValue);
                    //console.log('annotationValueIndex:', annotationValueIndex);

                    if (numericValue || annotationValueIndex) {
                        if (numericValue && Array.isArray(numericValue)) {
                            compareTimelineElement.attr({
                                'data-origin-type': dataType,
                                'data-numeric-value': numericValue,
                                'data-numeric-min': '0',
                                'data-numeric-max': maxNumericValue
                            });
                            if (dataType == 'ao:EvolvingValuesAnnotationType') {
                                var svgElem = this.renderEvolvingValues(numericValue, maxNumericValue);
                                compareTimelineElement.append(svgElem);
                                //jQuery SVG Hack
                                compareTimelineElement.html(compareTimelineElement.html());
                            } else if (dataType == 'ao:ContrastingValuesAnnotationType') {
                                var highestNumericValue = Math.max.apply(null, numericValue),
                                    relativeHeight = 100 * (highestNumericValue / maxNumericValue)
                                var contrastingElems = this.renderContrastingValues(numericValue, maxNumericValue, highestNumericValue);
                                compareTimelineElement.append(contrastingElems);
                                compareTimelineElement.css('height', relativeHeight + '%');
                            }
                        } else {
                            
                            var numericRatio = numericValue / maxNumericValue,
                                relativeHeight = 100 * (numericRatio),
                                timelineColor = (numericValue) ? Math.round(numericRatio * 12) : annotationValueIndex;
                            
                            compareTimelineElement.attr({
                                'data-origin-type': dataType,
                                'data-numeric-value': numericValue,
                                'data-numeric-min': '0',
                                'data-numeric-max': maxNumericValue
                            });
                            if (annotationType.indexOf('ColourAccent') != -1) {
                                var tmpText = this.data.name;
                                compareTimelineElement.attr('data-timeline-color', tmpText);
                                compareTimelineElement.append('<div class="barchartFraction" style="height: 100%; top: 0%; background-color: '+ tmpText +';" data-timeline-color="'+ tmpText +'"></div>');
                            } else {
                                compareTimelineElement.attr('data-timeline-color', timelineColor);
                            }
                            compareTimelineElement.css('height', relativeHeight + '%');
                            //compareTimelineElement.css('opacity', numericRatio);
                        }
                    } else {
        
                        var multipleAnnotationValues = null,
                            annotationType = null;
                        if (this.data.source.url.body) {
                            if (Array.isArray(this.data.source.url.body)) {
                                if (this.data.source.url.body[0].annotationValue) {
                                    multipleAnnotationValues  = this.data.source.url.body[0].annotationValue;
                                    annotationType  = this.data.source.url.body[0].annotationType;
                                } else if (this.data.source.url.body[1].annotationValue) {
                                    multipleAnnotationValues  = this.data.source.url.body[1].annotationValue;
                                    annotationType  = this.data.source.url.body[1].annotationType;
                                }
                            } else {
                                multipleAnnotationValues  = this.data.source.url.body.annotationValue;
                                annotationType  = this.data.source.url.body.annotationType;
                            }
                        }
                        if (multipleAnnotationValues) {
                            //console.log('HERE', multipleAnnotationValues);
                            compareTimelineElement.attr('data-origin-type', dataType);
                            var multipleElems = renderMultipleValues(annotationType, multipleAnnotationValues);
                            compareTimelineElement.append(multipleElems);
                        }
                    }

                    if (this.data.type == 'text' || this.data.type == 'entity') {
                        var decoded_string = $("<div/>").html(this.data.attributes.text).text();
                        compareTimelineElement.attr('title', decoded_string);
                    }

                    compareTimelineElement.css({
                        left:  positionLeft + '%',
                        width: width + '%'
                    });

                    compareTimelineElement.removeClass('previewPositionLeft previewPositionRight');

                    if (positionLeft < 10 && width < 10) {
                        compareTimelineElement.addClass('previewPositionLeft');
                    } else if (positionLeft > 90) {
                        compareTimelineElement.addClass('previewPositionRight');
                    }

                    compareTimelineElement.find('.previewWrapper').append(
                        this.resourceItem.renderThumb()
                    );

                    var self = this;

                    if (self.data.graphData) {
                    	if (self.data.graphDataType == 'soundwave') {
                    		compareTimelineElement.append(self.renderSoundwave(self.data.graphData));
                    	} else if (self.data.graphDataType == 'barchart') {
                    		compareTimelineElement.append(self.renderBarchart(self.data.graphData));
                    	}
                    }

                    compareTimelineElement.draggable({
                        containment:    '.mainContainer',
                        axis:           'y',
                        helper:         'clone',
                        appendTo:       'body',
                        zIndex:         1000,

                        start: function( event, ui ) {
                            ui.helper.css({
                                left: $(event.currentTarget).offset().left + "px",
                                width: $(event.currentTarget).width() + "px",
                                height: $(event.currentTarget).height() + "px",
                                backgroundColor: $(event.currentTarget).css('background-color')
                            });

                            ui.helper.data('originResourceData', self.data);
                        },

                        drag: function( event, ui ) {
                            ui.helper.css({
                                top: ui.position.top + ($(FrameTrail.getState('target')).find('.slideArea').css('margin-top')*2) + "px"
                            });
                        }

                    });

                    compareTimelineElement.click(function() {
                        FrameTrail.module('HypervideoController').currentTime = parseFloat($(this).data('start')) + 0.05;
                    });


                    return compareTimelineElement;

                },

                renderSoundwave: function(soundwaveDataString) {
                	
    				var graphDataElem = $('<div class="graphDataContainer"></div>');

					var width = 8000,
						height = 60,
						data = soundwaveDataString.split(" "),
						node = d3.select(graphDataElem[0]).append("canvas")
							.attr("width", width)
							.attr("height", height);

						var y = d3.scaleLinear().range([0, height]);
						var max_val = 100;
						y.domain([0, max_val]);
						var x = d3.scaleLinear().domain([0, data.length]);
						var bar_width = width / data.length;

						var chart = node;
						var context = chart.node().getContext("2d");

						data.forEach(function(d, i) {
							var thisY = height - Math.abs(y(d)/2) - height/2 + 2;
							var thisX = i * bar_width;
							var thisHeight = Math.abs(y(d)) + 2;

							context.beginPath();
							context.rect(thisX, thisY, bar_width, thisHeight);
							context.fillStyle="#333333";
							context.fill();
							context.closePath();
						});

                	return graphDataElem;
                },

                renderBarchart: function(barchartDataString) {
                	
    				var graphDataElem = $('<div class="graphDataContainer"></div>');

                    var width = 30000,
                        height = 60,
                        data = barchartDataString.split(" ");

                    var i,
                        j,
                        dataChunk,
                        chunkSize = 2000,
                        numberOfChunks = Math.ceil(data.length / chunkSize),
                        canvasPercentWidth = 100 / numberOfChunks,
                        finalChunkSize = data.length / numberOfChunks;

                    for (i=0,j=data.length; i<j; i+=finalChunkSize) {
                        
                        dataChunk = data.slice(i,i+finalChunkSize);
                        
                        var node = d3.select(graphDataElem[0]).append("canvas")
                            .attr("width", width)
                            .attr("height", height)
                            .attr("style", "width: "+ canvasPercentWidth +"%;");

                        var y = d3.scaleLinear().range([0, height]);
                        var max_val = 100;
                        y.domain([0, max_val]);
                        var x = d3.scaleLinear().domain([0, dataChunk.length]);
                        var bar_width = width / dataChunk.length;

                        var chart = node;
                        var context = chart.node().getContext("2d");

                        dataChunk.forEach(function(d, c) {
                            var thisY = height - Math.abs(y(d));
                            var thisX = c * bar_width;
                            var thisHeight = Math.abs(y(d));
                            
                            context.beginPath();
                            context.rect(thisX, thisY, bar_width, thisHeight);
                            context.fillStyle="#333333";
                            context.fill();
                            context.closePath();
                        });
                    }    

                    return graphDataElem;
                },

                renderEvolvingValues: function(values, maxValue) {
                    var svg = $('<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>'),
                        stepWidth = 100 / (values.length - 1),
                        invertedValues = [];

                    for (var i = 0; i < values.length; i++) {
                        var numericRatio = values[i] / maxValue,
                            relativeValue = 100 * (numericRatio);
                        invertedValues.push(100 - relativeValue);
                    }
                    
                    var path = "M 0 " + invertedValues[0];

                    for (var v=1; v<invertedValues.length; v++) {
                        path += " L " + stepWidth * v + " " + invertedValues[v];
                    }

                    path += " L 100 100 L 0 100 Z";
                    svg.append('<path d="' + path + '"></path>');

                    var timelineColor = Math.round(numericRatio * 12);
                    svg.attr('data-timeline-color', timelineColor);

                    return svg;
                },

                renderContrastingValues: function(values, maxValue, highestValue) {
                    
                    var barchartFractions = '';

                    values.sort(function(a, b) {
                        return b - a;
                    });

                    for (var v=0; v<values.length; v++) {
                        var numericRatio = (values[v] / maxValue),
                            timelineColor = Math.round(numericRatio * 12),
                            fractionPercentage = 100 * (values[v] / highestValue);
                        barchartFractions += '<div class="barchartFraction" style="height: '+ fractionPercentage +'%" data-timeline-color="'+ timelineColor +'"></div>';
                    }

                    return $(barchartFractions);
                },

                renderMultipleValues: function(annotationType, values) {
    
                    var barchartFractions = '',
                        heightPercentage = 100 / values.length;

                    if (typeof getAnnotationValueIndex == 'function') {
                        for (var v=0; v<values.length; v++) {
                            var valueIndex = getAnnotationValueIndex(annotationType, values[v]),
                                numericRatio = (v / values.length),
                                timelineColor = valueIndex,
                                fractionPercentage = 100 * (v / values.length);
                            if (annotationType.indexOf('Colour Range') != -1 || annotationType.indexOf('Colour Accent') != -1) {
                                barchartFractions += '<div class="barchartFraction" style="height: '+ heightPercentage +'%; top: '+ fractionPercentage +'%; background-color: '+ getLabelFromURI(values[v]) +';"></div>';
                            } else {
                                barchartFractions += '<div class="barchartFraction" style="height: '+ heightPercentage +'%; top: '+ fractionPercentage +'%" data-timeline-color="'+ timelineColor +'"></div>';
                            }
                        }
                    } else {
                        console.log('FrameTrail used outside AdA project context (getAnnotationValueIndex not defined)');
                    }
                    
                    return $(barchartFractions);
                    
                },

                // TODO

                setActiveInContentView: function (contentView) {

                    for (var i=0; i<this.contentViewElements.length; i++) {
                        this.contentViewElements[i].addClass('active');

                        if ( this.data.type == 'location'
                            && contentView.contentViewData.contentSize == 'large'
                            && (contentView.whichArea == 'left' || contentView.whichArea == 'right')
                            && this.contentViewElements[i].children('.resourceDetail').data('map') ) {

                            this.contentViewElements[i].children('.resourceDetail').data('map').updateSize();
                        }
                    }
                    //console.log(this, 'setActiveInContentView', contentView);


                    this._activeStateInContentView.push(contentView);
                },


                setInactiveInContentView: function (contentView) {

                    for (var i=0; i<this.contentViewElements.length; i++) {
                        this.contentViewElements[i].removeClass('active');
                    }
                    //console.log(this, 'setInactiveInContentView', contentView);

                    this._activeStateInContentView = this._activeStateInContentView.filter(function (each) {
                        return each !== contentView;
                    })
                },

                _activeStateInContentView: null,
                activeStateInContentView: function (contentView) {
                    if (!this._activeStateInContentView) {
                        this._activeStateInContentView = [];
                    }

                    return this._activeStateInContentView.indexOf(contentView) != -1;
                }



            }


        }
    }


);
