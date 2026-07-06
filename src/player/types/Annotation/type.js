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

                this.labels = FrameTrail.module('Localization').labels;

                this.data = data;

                this.resourceItem = FrameTrail.newObject(
                    ('Resource' + data.type.charAt(0).toUpperCase() + data.type.slice(1)),
                    data
                )

                var _anWrapper = document.createElement('div');
                _anWrapper.innerHTML = '<div class="timelineElement" data-type="'+ this.data.type +'" data-uri="'+ this.data.uri +'"><div class="timelineElementIcon"></div><div class="timelineElementLabel"></div><div class="previewWrapper"></div></div>';
                this.timelineElement = _anWrapper.firstElementChild;
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

                    var timelineTarget = ViewVideo.AnnotationTimeline.querySelector('.timelineScroller');
                    (timelineTarget || ViewVideo.AnnotationTimeline).appendChild(this.timelineElement);

                    var _pw = this.timelineElement.querySelector('.previewWrapper');
                    _pw.innerHTML = '';
                    _pw.append(this.resourceItem.renderThumb());

                    // Set icon from resourceItem
                    this.timelineElement.querySelector('.timelineElementIcon').innerHTML = '<span class="' + this.resourceItem.iconClass + '"></span>';

                    // Set label from resourceItem
                    this.timelineElement.querySelector('.timelineElementLabel').textContent = this.resourceItem.getDisplayLabel();

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

                    if (this._brushInHandler)  { this.timelineElement.removeEventListener('mouseenter', this._brushInHandler); }
                    if (this._brushOutHandler) { this.timelineElement.removeEventListener('mouseleave', this._brushOutHandler); }
                    //this.tileElement.unbind('hover');
                    //this.tileElement.unbind('click')
                    this._brushInHandler  = this.brushIn.bind(this);
                    this._brushOutHandler = this.brushOut.bind(this);
                    this.timelineElement.addEventListener('mouseenter', this._brushInHandler);
                    this.timelineElement.addEventListener('mouseleave', this._brushOutHandler);
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
                    };
                    this.timelineElement.addEventListener('click', this._annotationClickHandler);
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

                    this.timelineElement.style.top = '';
                    this.timelineElement.style.left = positionLeft + '%';
                    this.timelineElement.style.right = '';
                    this.timelineElement.style.width = width + '%';

                    this.timelineElement.classList.remove('previewPositionLeft', 'previewPositionRight');

                    if (positionLeft < 10 && width < 10) {
                        this.timelineElement.classList.add('previewPositionLeft');
                    } else if (positionLeft > 90) {
                        this.timelineElement.classList.add('previewPositionRight');
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
                 * @method brushIn
                 */
                brushIn: function () {
                    this.timelineElement.classList.add('brushed');
                },


                /**
                 * I am called when the mouse pointer is leaving the hovering area over my two DOM elements.
                 * @method brushOut
                 */
                brushOut: function () {
                    this.timelineElement.classList.remove('brushed');
                },


                /**
                 * When I am scheduled to be displayed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.activeState = true;
                    this.timelineElement.classList.add('active');

                },


                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.activeState = false;
                    this.timelineElement.classList.remove('active');

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

                    this.timelineElement.classList.add('open');

                    ViewVideo.ExpandButton.addEventListener('click', this.closeAnnotation.bind(this), { once: true });
                    
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
                    
                    this._annotationClickHandler = function(){

                        if (AnnotationsController.annotationInFocus === self){
                            return AnnotationsController.annotationInFocus = null;
                        }

                        self.permanentFocusState = true;
                        AnnotationsController.annotationInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start;

                    };

                    this.timelineElement.addEventListener('click', this._annotationClickHandler);

                },

                /**
                 * When the global editMode leaves the state "annotations", I am called to
                 * stop the editing features of the annotations.
                 *
                 * @method stopEditing
                 */
                stopEditing: function () {

                    try { interact(this.timelineElement).unset(); } catch (ex) {}
                    this.timelineElement.classList.remove('ui-draggable', 'ui-draggable-dragging', 'ui-resizable');
                    this.timelineElement.querySelectorAll('.ui-resizable-handle').forEach(function(h) { h.remove(); });

                    if (this._annotationClickHandler) { this.timelineElement.removeEventListener('click', this._annotationClickHandler); this._annotationClickHandler = null; }

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

                    var el = this.timelineElement;
                    this.timelineElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        ignoreFrom: '.ui-resizable-handle',
                        listeners: {
                            start: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('AnnotationsController').annotationInFocus = self;
                                }

                                oldAnnotationData = Object.assign({}, self.data);

                                e.target.dataset.ftX    = e.target.offsetLeft;
                                e.target.dataset.ftRawX = e.target.offsetLeft;
                                e.target.style.left     = e.target.offsetLeft + 'px';
                                e.target.classList.add('ui-draggable-dragging');

                            },

                            move: function(e) {

                                var rawX = parseFloat(e.target.dataset.ftRawX) + e.dx;
                                e.target.dataset.ftRawX = rawX;
                                var parentWidth = e.target.parentElement.offsetWidth;
                                var elWidth     = e.target.offsetWidth;
                                // Follow the pointer 1:1 — no live snapping (snap only on release).
                                var x = Math.max(0, Math.min(parentWidth - elWidth, rawX));

                                var ViewVideo = FrameTrail.module('ViewVideo');
                                var snap = ViewVideo.computeTimelineSnap(e.target.parentElement, e.target, x, elWidth, 5, { left: true, right: true });
                                if (snap.indicator !== null) {
                                    ViewVideo.showTimelineSnapIndicator(e.target.parentElement, snap.indicator);
                                } else {
                                    ViewVideo.hideTimelineSnapIndicator();
                                }

                                e.target.style.left  = x + 'px';
                                e.target.dataset.ftX = x;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth),
                                    widthPercent  = 100 * (elWidth / parentWidth),
                                    newStartValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn,
                                    newEndValue   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                FrameTrail.module('HypervideoController').currentTime = newStartValue;
                                FrameTrail.module('AnnotationsController').updateControlsStart(newStartValue);
                                FrameTrail.module('AnnotationsController').updateControlsEnd(newEndValue);

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('AnnotationsController').annotationInFocus = null;
                                }

                                e.target.classList.remove('ui-draggable-dragging');

                                var ViewVideo   = FrameTrail.module('ViewVideo');
                                ViewVideo.hideTimelineSnapIndicator();

                                var parentWidth = e.target.parentElement.offsetWidth;
                                var elWidth     = e.target.offsetWidth;
                                var x           = parseFloat(e.target.dataset.ftX);

                                // Snap-on-release: snap the final drop position (if near a target).
                                var snap = ViewVideo.computeTimelineSnap(e.target.parentElement, e.target, x, elWidth, 5, { left: true, right: true });
                                x = Math.max(0, Math.min(parentWidth - elWidth, snap.left));
                                e.target.style.left = x + 'px';

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth),
                                    widthPercent  = 100 * (elWidth / parentWidth);

                                self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                try {
                                    if (TogetherJS && TogetherJS.running) {
                                        var elementFinder = TogetherJS.require("elementFinder");
                                        var location = elementFinder.elementLocation(e.target);
                                        TogetherJS.send({
                                            type: "simulate-annotation-change",
                                            element: location,
                                            containerElement: '.annotationTimeline',
                                            resourceID: self.data.resourceId,
                                            startTime: self.data.start,
                                            endTime: self.data.end
                                        });
                                    }
                                } catch (ex) {}

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

                                // Register undo command for timeline drag
                                (function(annotationId, capturedOldStart, capturedOldEnd, capturedNewStart, capturedNewEnd, labels) {
                                    var findAnnotation = function() {
                                        var annotations = FrameTrail.module('HypervideoModel').annotations;
                                        for (var i = 0; i < annotations.length; i++) {
                                            if (annotations[i].data.created === annotationId) {
                                                return annotations[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'annotations',
                                        description: labels['SidebarMyAnnotations'] + ' Move',
                                        undo: function() {
                                            var annotation = findAnnotation();
                                            if (!annotation) return;
                                            annotation.data.start = capturedOldStart;
                                            annotation.data.end = capturedOldEnd;
                                            annotation.updateTimelineElement();
                                            FrameTrail.module('AnnotationsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                        },
                                        redo: function() {
                                            var annotation = findAnnotation();
                                            if (!annotation) return;
                                            annotation.data.start = capturedNewStart;
                                            annotation.data.end = capturedNewEnd;
                                            annotation.updateTimelineElement();
                                            FrameTrail.module('AnnotationsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                        }
                                    });
                                })(self.data.created, oldAnnotationData.start, oldAnnotationData.end, self.data.start, self.data.end, self.labels);

                            }
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

                    var el = this.timelineElement;

                    // Inject resize handles if not yet present
                    if (!el.querySelector('.ui-resizable-e')) {
                        var handleE = document.createElement('div');
                        handleE.className = 'ui-resizable-handle ui-resizable-e';
                        el.appendChild(handleE);
                    }
                    if (!el.querySelector('.ui-resizable-w')) {
                        var handleW = document.createElement('div');
                        handleW.className = 'ui-resizable-handle ui-resizable-w';
                        el.appendChild(handleW);
                    }
                    el.classList.add('ui-resizable');

                    interact(el).resizable({
                        edges: { left: '.ui-resizable-w', right: '.ui-resizable-e' },
                        listeners: {
                            start: function(e) {

                                endHandleGrabbed = !!e.edges.right;

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('AnnotationsController').annotationInFocus = self;
                                }

                                oldAnnotationData = Object.assign({}, self.data);

                                e.target.dataset.ftLeft  = e.target.offsetLeft;
                                e.target.dataset.ftWidth = e.target.offsetWidth;
                                e.target.style.left      = e.target.offsetLeft + 'px';
                                e.target.style.width     = e.target.offsetWidth + 'px';

                            },

                            move: function(e) {

                                var newLeft    = parseFloat(e.target.dataset.ftLeft)  + e.deltaRect.left;
                                var newWidth   = parseFloat(e.target.dataset.ftWidth) + e.deltaRect.width;
                                var parentWidth = e.target.parentElement.offsetWidth;

                                // Clamp to parent — follow the pointer 1:1, no live snapping.
                                if (newLeft < 0)                      { newWidth += newLeft; newLeft = 0; }
                                if (newLeft + newWidth > parentWidth) { newWidth = parentWidth - newLeft; }
                                if (newWidth < 2)                     { newWidth = 2; }

                                var ViewVideo = FrameTrail.module('ViewVideo');
                                var snap = ViewVideo.computeTimelineSnap(e.target.parentElement, e.target, newLeft, newWidth, 5,
                                    endHandleGrabbed ? { left: false, right: true } : { left: true, right: false });
                                if (snap.indicator !== null) {
                                    ViewVideo.showTimelineSnapIndicator(e.target.parentElement, snap.indicator);
                                } else {
                                    ViewVideo.hideTimelineSnapIndicator();
                                }

                                e.target.style.left      = newLeft + 'px';
                                e.target.style.width     = newWidth + 'px';
                                e.target.dataset.ftLeft  = newLeft;
                                e.target.dataset.ftWidth = newWidth;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (newLeft  / parentWidth),
                                    widthPercent  = 100 * (newWidth / parentWidth),
                                    newValue;

                                if (endHandleGrabbed) {
                                    newValue = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                    FrameTrail.module('HypervideoController').currentTime = newValue;
                                    FrameTrail.module('AnnotationsController').updateControlsEnd(newValue);
                                } else {
                                    newValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                    FrameTrail.module('HypervideoController').currentTime = newValue;
                                    FrameTrail.module('AnnotationsController').updateControlsStart(newValue);
                                }

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('AnnotationsController').annotationInFocus = null;
                                }

                                var ViewVideo   = FrameTrail.module('ViewVideo');
                                ViewVideo.hideTimelineSnapIndicator();

                                var parentWidth = e.target.parentElement.offsetWidth;
                                var finalLeft   = parseFloat(e.target.dataset.ftLeft);
                                var finalWidth  = parseFloat(e.target.dataset.ftWidth);

                                // Snap-on-release: snap the moving edge to a nearby target, then re-clamp.
                                var snap = ViewVideo.computeTimelineSnap(e.target.parentElement, e.target, finalLeft, finalWidth, 5,
                                    endHandleGrabbed ? { left: false, right: true } : { left: true, right: false });
                                finalLeft  = snap.left;
                                finalWidth = snap.width;
                                if (finalLeft < 0)                      { finalWidth += finalLeft; finalLeft = 0; }
                                if (finalLeft + finalWidth > parentWidth) { finalWidth = parentWidth - finalLeft; }
                                if (finalWidth < 2)                     { finalWidth = 2; }
                                e.target.style.left  = finalLeft + 'px';
                                e.target.style.width = finalWidth + 'px';

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (finalLeft  / parentWidth),
                                    widthPercent  = 100 * (finalWidth / parentWidth);

                                self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                try {
                                    if (TogetherJS && TogetherJS.running) {
                                        var elementFinder = TogetherJS.require("elementFinder");
                                        var location = elementFinder.elementLocation(e.target);
                                        TogetherJS.send({
                                            type: "simulate-annotation-change",
                                            element: location,
                                            containerElement: '.annotationTimeline',
                                            resourceID: self.data.resourceId,
                                            startTime: self.data.start,
                                            endTime: self.data.end
                                        });
                                    }
                                } catch (ex) {}

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

                                // Register undo command for timeline resize
                                (function(annotationId, capturedOldStart, capturedOldEnd, capturedNewStart, capturedNewEnd, labels) {
                                    var findAnnotation = function() {
                                        var annotations = FrameTrail.module('HypervideoModel').annotations;
                                        for (var i = 0; i < annotations.length; i++) {
                                            if (annotations[i].data.created === annotationId) {
                                                return annotations[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'annotations',
                                        description: labels['SidebarMyAnnotations'] + ' Resize',
                                        undo: function() {
                                            var annotation = findAnnotation();
                                            if (!annotation) return;
                                            annotation.data.start = capturedOldStart;
                                            annotation.data.end = capturedOldEnd;
                                            annotation.updateTimelineElement();
                                            FrameTrail.module('AnnotationsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                        },
                                        redo: function() {
                                            var annotation = findAnnotation();
                                            if (!annotation) return;
                                            annotation.data.start = capturedNewStart;
                                            annotation.data.end = capturedNewEnd;
                                            annotation.updateTimelineElement();
                                            FrameTrail.module('AnnotationsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                        }
                                    });
                                })(self.data.created, oldAnnotationData.start, oldAnnotationData.end, self.data.start, self.data.end, self.labels);

                            }
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

                    this.timelineElement.classList.add('highlighted');

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

                    this.timelineElement.classList.remove('highlighted');

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
                        compareTimelineElement = document.createElement('div'),

                        HypervideoModel = FrameTrail.module('HypervideoModel'),
                        timeStart       = this.data.start - HypervideoModel.offsetIn,
                        timeEnd         = this.data.end - HypervideoModel.offsetOut;
                        videoDuration   = HypervideoModel.duration,
                        positionLeft    = 100 * (timeStart / videoDuration),
                        width           = 100 * ((this.data.end - this.data.start) / videoDuration);

                    compareTimelineElement.className = 'compareTimelineElement';
                    compareTimelineElement.setAttribute('data-type', this.data.type);
                    compareTimelineElement.setAttribute('data-uri', this.data.uri);
                    compareTimelineElement.setAttribute('data-start', this.data.start);
                    compareTimelineElement.setAttribute('data-end', this.data.end);
                    compareTimelineElement.innerHTML = '<div class="previewWrapper"></div>'
                        + '<div class="compareTimelineElementTime">'
                        + '<div class="compareTimeStart">' + cleanStart + '</div>'
                        + '<div class="compareTimeEnd">' + cleanEnd + '</div>'
                        + '</div>';

                    if (this.data.end > HypervideoModel.offsetOut) {
                        compareTimelineElement.classList.add('overlapRight');
                    }
                    if (HypervideoModel.offsetIn > this.data.start) {
                        compareTimelineElement.classList.add('overlapLeft');
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
                            compareTimelineElement.setAttribute('data-origin-type', dataType);
                            compareTimelineElement.setAttribute('data-numeric-value', numericValue);
                            compareTimelineElement.setAttribute('data-numeric-min', '0');
                            compareTimelineElement.setAttribute('data-numeric-max', maxNumericValue);
                            if (dataType == 'ao:EvolvingValuesAnnotationType') {
                                var svgElem = this.renderEvolvingValues(numericValue, maxNumericValue);
                                compareTimelineElement.appendChild(svgElem);
                            } else if (dataType == 'ao:ContrastingValuesAnnotationType') {
                                var highestNumericValue = Math.max.apply(null, numericValue),
                                    relativeHeight = 100 * (highestNumericValue / maxNumericValue)
                                var contrastingElems = this.renderContrastingValues(numericValue, maxNumericValue, highestNumericValue);
                                compareTimelineElement.appendChild(contrastingElems);
                                compareTimelineElement.style.height = relativeHeight + '%';
                            }
                            } else {
                            
                            var numericRatio = numericValue / maxNumericValue,
                                relativeHeight = 100 * (numericRatio),
                                timelineColor = (numericValue) ? Math.round(numericRatio * 12) : annotationValueIndex;
                            
                            compareTimelineElement.setAttribute('data-origin-type', dataType);
                            compareTimelineElement.setAttribute('data-numeric-value', numericValue);
                            compareTimelineElement.setAttribute('data-numeric-min', '0');
                            compareTimelineElement.setAttribute('data-numeric-max', maxNumericValue);
                            if (annotationType.indexOf('ColourAccent') != -1) {
                                var tmpText = this.data.name;
                                compareTimelineElement.setAttribute('data-timeline-color', tmpText);
                                compareTimelineElement.insertAdjacentHTML('beforeend', '<div class="barchartFraction" style="height: 100%; top: 0%; background-color: '+ tmpText +';" data-timeline-color="'+ tmpText +'"></div>');
                            } else {
                                compareTimelineElement.setAttribute('data-timeline-color', timelineColor);
                            }
                            compareTimelineElement.style.height = relativeHeight + '%';
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
                            compareTimelineElement.setAttribute('data-origin-type', dataType);
                            var multipleElems = renderMultipleValues(annotationType, multipleAnnotationValues);
                            compareTimelineElement.appendChild(multipleElems);
                        }
                    }

                    if (this.data.type == 'text' || this.data.type == 'html' || this.data.type == 'entity') {
                        var _dh = document.createElement('div');
                        _dh.innerHTML = this.data.attributes.text || '';
                        var decoded_string = _dh.textContent;
                        compareTimelineElement.setAttribute('title', decoded_string);
                    }

                    compareTimelineElement.style.left = positionLeft + '%';
                    compareTimelineElement.style.width = width + '%';

                    compareTimelineElement.classList.remove('previewPositionLeft', 'previewPositionRight');

                    if (positionLeft < 10 && width < 10) {
                        compareTimelineElement.classList.add('previewPositionLeft');
                    } else if (positionLeft > 90) {
                        compareTimelineElement.classList.add('previewPositionRight');
                    }

                    compareTimelineElement.querySelector('.previewWrapper').appendChild(
                        this.resourceItem.renderThumb()
                    );

                    var self = this;

                    if (self.data.graphData) {
                        if (self.data.graphDataType == 'soundwave') {
                            compareTimelineElement.appendChild(self.renderSoundwave(self.data.graphData));
                        } else if (self.data.graphDataType == 'barchart') {
                            compareTimelineElement.appendChild(self.renderBarchart(self.data.graphData));
                        }
                    }

                    // Store origin data directly on element so drop handlers can read it
                    compareTimelineElement._originResourceData = self.data;

                    (function() {
                        var dragClone = null;
                        interact(compareTimelineElement).draggable({
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
                                        dragClone.style.top = (parseFloat(dragClone.style.top) + e.dy) + 'px';
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

                    compareTimelineElement.addEventListener('click', function() {
                        FrameTrail.module('HypervideoController').currentTime = parseFloat(this.getAttribute('data-start')) + 0.05;
                    });


                    return compareTimelineElement;

                },

                renderSoundwave: function(soundwaveDataString) {

                    var graphDataElem = document.createElement('div');
                    graphDataElem.className = 'graphDataContainer';

                    var width = 8000,
                        height = 60,
                        max_val = 100,
                        data = soundwaveDataString.split(" "),
                        canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        graphDataElem.appendChild(canvas);

                        var bar_width = width / data.length;
                        var context = canvas.getContext("2d");

                        data.forEach(function(d, i) {
                            var scaled = d * height / max_val;
                            var thisY = height - Math.abs(scaled / 2) - height / 2 + 2;
                            var thisX = i * bar_width;
                            var thisHeight = Math.abs(scaled) + 2;

                            context.beginPath();
                            context.rect(thisX, thisY, bar_width, thisHeight);
                            context.fillStyle="#333333";
                            context.fill();
                            context.closePath();
                        });

                    return graphDataElem;
                },

                renderBarchart: function(barchartDataString) {

                    var graphDataElem = document.createElement('div');
                    graphDataElem.className = 'graphDataContainer';

                    var width = 30000,
                        height = 60,
                        max_val = 100,
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

                        var canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        canvas.style.width = canvasPercentWidth + '%';

                        graphDataElem.appendChild(canvas);

                        var bar_width = width / dataChunk.length;
                        var context = canvas.getContext("2d");

                        dataChunk.forEach(function(d, c) {
                            var scaled = d * height / max_val;
                            var thisY = height - Math.abs(scaled);
                            var thisX = c * bar_width;
                            var thisHeight = Math.abs(scaled);

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
                    var svgNS = 'http://www.w3.org/2000/svg',
                        svg = document.createElementNS(svgNS, 'svg'),
                        stepWidth = 100 / (values.length - 1),
                        invertedValues = [];

                    svg.setAttribute('width', '100%');
                    svg.setAttribute('height', '100%');
                    svg.setAttribute('viewBox', '0 0 100 100');
                    svg.setAttribute('preserveAspectRatio', 'none');

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
                    var pathElem = document.createElementNS(svgNS, 'path');
                    pathElem.setAttribute('d', path);
                    svg.appendChild(pathElem);

                    var timelineColor = Math.round(numericRatio * 12);
                    svg.setAttribute('data-timeline-color', timelineColor);

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

                    var _tmp = document.createElement('div');
                    _tmp.innerHTML = barchartFractions;
                    var fragment = document.createDocumentFragment();
                    while (_tmp.firstChild) { fragment.appendChild(_tmp.firstChild); }
                    return fragment;
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
                    
                    var _tmp = document.createElement('div');
                    _tmp.innerHTML = barchartFractions;
                    var fragment = document.createDocumentFragment();
                    while (_tmp.firstChild) { fragment.appendChild(_tmp.firstChild); }
                    return fragment;
                    
                },

                // TODO

                setActiveInContentView: function (contentView) {

                    for (var i=0; i<this.contentViewElements.length; i++) {
                        this.contentViewElements[i].classList.add('active');

                        if ( this.data.type == 'location'
                            && contentView.contentViewData.contentSize == 'large'
                            && (contentView.whichArea == 'left' || contentView.whichArea == 'right') ) {

                            var _resourceDetail = this.contentViewElements[i].querySelector('.resourceDetail');
                            if (_resourceDetail && _resourceDetail._leafletMap) {
                                _resourceDetail._leafletMap.invalidateSize();
                            }
                        }
                    }
                    //console.log(this, 'setActiveInContentView', contentView);


                    this._activeStateInContentView.push(contentView);

                    contentView.scaleDetailElements();
                },


                setInactiveInContentView: function (contentView) {

                    for (var i=0; i<this.contentViewElements.length; i++) {
                        this.contentViewElements[i].classList.remove('active');
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
