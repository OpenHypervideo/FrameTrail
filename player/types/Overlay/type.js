/**
 * @module Player
 */


/**
 * I am the type definition of an Overlay.
 *
 * An Overlay displays the content of any type of {{#crossLink "Resource"}}Resource{{/crossLink}}
 * in a separate layer on top of the video.
 *
 * Overlays are managed by the {{#crossLink "OverlaysController"}}OverlaysController{{/crossLink}}.
 *
 * @class Overlay
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'Overlay',

    function (FrameTrail) {
        return {
            constructor: function(data){

                // compatibility fix
                if ( !data.events || Array.isArray(data.events) ) {
                    data.events = {};
                }


                this.data = data;

                this.resourceItem = FrameTrail.newObject(
                    ('Resource' + data.type.charAt(0).toUpperCase() + data.type.slice(1)),
                    data
                )


                if (    (this.data.type === 'video' || this.data.type === 'audio')
                     && this.data.attributes.autoPlay) {
                    // Note: Currently, the only synced media types are 'video' and 'audio', so we shortcut it

                    this.syncedMedia = true;

                }


                this.timelineElement = $('<div class="timelineElement"></div>');
                this.overlayElement  = $('<div class="overlayElement"></div>');


            },
            prototype: {
                /**
                 * I hold the data object of an Overlay, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the hypervideos's overlays.json file.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I hold the Resource object of the overlay.
                 * @attribute resourceItem
                 * @type Resource
                 */
                resourceItem:           {},

                /**
                 * I signal wether the time-based content of myself should be played synchronized with the main video.
                 * I am set to true during construction, when my resource type is video and my data.attributes.autoPlay is also true.
                 * This can be changed later in the {{#crossLink "ResourceVideo/renderPropertiesControls:method"}}ResourceVideo/renderPropertiesControls{{/crossLink}}.
                 *
                 * Se also {{#crossLink "Overlay/setSyncedMedia:method"}}Overlay/setSyncedMedia(){{/crossLink}}
                 *
                 * @attribute syncedMedia
                 * @type Boolean
                 */
                syncedMedia:            false,

                /**
                 * I store my state, wether I am "active" (this is, when I am displayed and my timelineElement is highlighted) or not active (invisible).
                 * @attribute activeState
                 * @type Boolean
                 */
                activeState:            false,

                /**
                 * I store my state, wether I am "in focus" or not. See also:
                 * * {{#crossLink "Overlay/gotInFocus:method"}}Overlay/gotInFocus(){{/crossLink}}
                 * * {{#crossLink "Overlay/removedFromFocus:method"}}Overlay/removedFromFocus(){{/crossLink}}
                 * * {{#crossLink "OverlaysController/overlayInFocus:attribute"}}OverlaysController/overlayInFocus{{/crossLink}}
                 * @attribute permanentFocusState
                 * @type Boolean
                 */
                permanentFocusState:    false,

                /**
                 * I hold the timelineElement (a jquery-enabled HTMLElement), which indicates my start and end time.
                 * @attribute timelineElement
                 * @type HTMLElement
                 */
                timelineElement:        null,

                /**
                 * I hold the overlayElement (a jquery-enabled HTMLElement), which displays my content on top of the video.
                 * @attribute overlayElement
                 * @type {}
                 */
                overlayElement:         null,


                /**
                 * I render my DOM elements ({{#crossLink "Overlay/timelineElement:attribute"}}Overlay/timelineElement{{/crossLink}}
                 * and {{#crossLink "Overlay/overlayElement:attribute"}}Overlay/overlayElement{{/crossLink}}) into the DOM.
                 *
                 * I am called, when the Overlay is initialized. My counterpart ist {{#crossLink "Overlay/removeFromDOM:method"}}Overlay/removeFromDOM{{/crossLink}}.
                 *
                 * @method renderInDOM
                 */
                renderInDOM: function () {

                    var ViewVideo = FrameTrail.module('ViewVideo');

                    ViewVideo.OverlayTimeline.append(this.timelineElement);
                    ViewVideo.OverlayContainer.append(this.overlayElement);

                    var newOverlayContent = this.resourceItem.renderContent()
                    this.overlayElement.append(newOverlayContent);

                    this.updateTimelineElement();
                    this.updateOverlayElement();


                    if (this.syncedMedia) {
                        this.setSyncedMedia(true);
                    }

                    if (   this.syncedMedia
                        && newOverlayContent.get(0) instanceof HTMLMediaElement) {

                        this.prepareSyncedHTML5Video(newOverlayContent);

                    }



                    this.timelineElement.hover(this.brushIn.bind(this), this.brushOut.bind(this));
                    this.overlayElement.hover(this.brushIn.bind(this), this.brushOut.bind(this));

                    if (this.data.events.onReady) {
                        try {
                            var readyEvent = new Function('FrameTrail', this.data.events.onReady);
                            readyEvent.call(this, FrameTrail);
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn('Event handler contains errors: '+ exception.message);
                        }
                    }

                    this.overlayElement.click({overlayObject: this}, function(evt) {

                        var self = evt.data.overlayObject;
                        if (self.data.events.onClick && FrameTrail.getState('editMode') != 'overlays') {
                            try {
                                var clickEvent = new Function('FrameTrail', self.data.events.onClick);
                                clickEvent.call(self, FrameTrail);
                            } catch (exception) {
                                // could not parse and compile JS code!
                                console.warn('Event handler contains errors: '+ exception.message);
                            }
                        }

                    });



                },


                /**
                 * I prepare the event listeners for a synced HTML5 video or audio used as overlay.
                 *
                 * @method prepareSyncedHTML5Media
                 * @param {jQuery} newOverlayMedia
                 */
                prepareSyncedHTML5Media: function (newOverlayMedia) {

                    var self = this,
                        HypervideoController = FrameTrail.module('HypervideoController'),
                        timeout = null;

                    newOverlayMedia.on('error', function(err) {
                        console.log('PLAYBACK ERROR: ', err);
                    });
                    newOverlayMedia.on('waiting', checkForStall);

                    newOverlayMedia.attr('preload', 'auto');
        			newOverlayMedia.get(0).load();

                    function checkForStall() {

                        if (self.activeState) {

                			if (newOverlayMedia.get(0).readyState > 0) {
                				HypervideoController.playbackStalled(false, self);
                			} else {
                                HypervideoController.playbackStalled(true, self);
                                if (timeout) {
                                    window.clearTimeout(timeout);
                                }
                                timeout = window.setTimeout(checkForStall, 1000);
                			}

                		} else {
                            HypervideoController.playbackStalled(false, self);
                        }

        			}

                },


                /**
                 * I remove my DOM elements ({{#crossLink "Overlay/timelineElement:attribute"}}Overlay/timelineElement{{/crossLink}}
                 * and {{#crossLink "Overlay/overlayElement:attribute"}}Overlay/overlayElement{{/crossLink}}) from the DOM.
                 *
                 * I am called when the Overlay is to be deleted.
                 *
                 * @method removeFromDOM
                 */
                removeFromDOM: function () {

                    this.timelineElement.remove();
                    this.overlayElement.remove();

                },

                /**
                 * I update the CSS of the {{#crossLink "Overlay/timelineElement:attribute"}}timelineElement{{/crossLink}}
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

                },

                /**
                 * I update the CSS of the {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}}
                 * to its correct position within the overlaysContainer.
                 *
                 * @method updateOverlayElement
                 */
                updateOverlayElement: function () {

                    this.overlayElement.css({
                        top:    this.data.position.top + '%',
                        left:   this.data.position.left + '%',
                        width:  this.data.position.width + '%',
                        height: this.data.position.height + '%'
                    });

                    this.overlayElement.children('.resourceDetail').css({
                        opacity: (this.data.attributes.opacity || 1)
                    });

                    if (this.overlayElement.find('.resourceDetail').data().map) {
                        this.overlayElement.find('.resourceDetail').data().map.updateSize();
                    }

                },


                /**
                * I scale the overlay element in case the space is too small
                * (text overlays are always scaled to assure proper display)
                * @method scaleOverlayElement
                */
                scaleOverlayElement: function() {

                    if (this.data.type == 'wikipedia' || this.data.type == 'webpage' || this.data.type == 'text') {

                        var elementToScale = this.overlayElement.children('.resourceDetail'),
                            wrapperElement = this.overlayElement,
                            scaleBase = (this.data.type == 'text') ? 800 : 400;

                        if (scaleBase / wrapperElement.width() < 1 && this.data.type != 'text') {
                            elementToScale.css({
                                top: 0,
                                left: 0,
                                height: '',
                                width: '',
                                transform: "none"
                            });
                            return;
                        }

                        var referenceWidth = (this.data.type == 'text') ? FrameTrail.module('ViewVideo').OverlayContainer.width() : wrapperElement.width();
                            scale = referenceWidth / scaleBase,
                            negScale = 1/scale,
                            newWidth = (this.data.type == 'text') ? wrapperElement.width() * negScale : scaleBase;

                        elementToScale.css({
                            top: 50 + '%',
                            left: 50 + '%',
                            width: newWidth + 'px',
                            height: wrapperElement.height() * negScale + 'px',
                            transform: "translate(-50%, -50%) scale(" + scale + ")"
                        });

                    }

                },


                /**
                 * I update my behavior, wether my time-based content (video or audio) should be synchronized with the main
                 * video or not.
                 *
                 * I control accordingly, wether the video / audio controls should be shown or not.
                 *
                 * I append dynamically an attribute to myself (this.mediaElement).
                 *
                 * Note: My attribute {{#crossLink "Overlay/syncedMedia:attribute"}}syncedMedia{{/crossLink}}
                 * is independent of this method and stores the current state for use in
                 * {{#crossLink "Overlays/setActive:method"}}this.setActive(){{/crossLink}} and
                 * {{#crossLink "Overlays/setInactive:method"}}this.setInactive(){{/crossLink}}.
                 *
                 * @method setSyncedMedia
                 * @param {Boolean} synced
                 */
                setSyncedMedia: function (synced) {

                    if (synced) {
                        if (this.overlayElement.find('.resourceDetail audio').length != 0) {
                            this.mediaElement = this.overlayElement.find('.resourceDetail audio')[0]
                        } else {
                            this.mediaElement = this.overlayElement.find('.resourceDetail video')[0]
                        }
                        
                        this.mediaElement.removeAttribute('controls');
                    } else {
                        this.mediaElement.setAttribute('controls', 'controls');
                        delete this.mediaElement;
                    }

                },

                /**
                 * When I am scheduled to be displayed, this is the method to be called.
                 * @method setActive
                 * @param {Boolean} onlyTimelineElement (optional)
                 */
                setActive: function (onlyTimelineElement) {

                    if (!onlyTimelineElement) {
                        this.overlayElement.addClass('active');

                        if (this.overlayElement.find('.resourceDetail').data().map) {
                            this.overlayElement.find('.resourceDetail').data().map.updateSize();
                        }

                    }

                    this.timelineElement.addClass('active');

                    if (this.syncedMedia) {

                        FrameTrail.module('OverlaysController').addSyncedMedia(this);

                    }

                    if (this.data.events.onStart && !this.activeState && !this.permanentFocusState) {
                        try {
                            var thisEvent = new Function('FrameTrail', this.data.events.onStart);
                            thisEvent.call(this, FrameTrail);
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn('Event handler contains errors: '+ exception.message);
                        }
                    }

                    this.activeState = true;

                },

                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.overlayElement.removeClass('active');
                    this.timelineElement.removeClass('active');

                    if (this.syncedMedia) {

                        FrameTrail.module('OverlaysController').removeSyncedMedia(this);

                    }

                    if (this.data.events.onEnd && this.activeState && !this.permanentFocusState) {
                        try {
                            var thisEvent = new Function('FrameTrail', this.data.events.onEnd);
                            thisEvent.call(this, FrameTrail);
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn('Event handler contains errors: '+ exception.message);
                        }
                    }

                    this.activeState = false;

                },


                /**
                 * When I "got into focus" (which happens, when I become the referenced object in the OverlaysController's
                 * {{#crossLink "OverlaysController/overlayInFocus:attribute"}}overlayInFocus attribute{{/crossLink}}),
                 * then this method will be called.
                 *
                 * @method gotInFocus
                 */
                gotInFocus: function () {

                    this.timelineElement.addClass('highlighted');
                    this.overlayElement.addClass('highlighted');

                    FrameTrail.module('OverlaysController').renderPropertiesControls(
                        this.resourceItem.renderPropertiesControls(this)
                    );

                },

                /**
                 * See also: {{#crossLink "Overlay/gotIntoFocus:method"}}this.gotIntoFocus(){{/crossLink}}
                 *
                 * When I was "removed from focus" (which happens, when the OverlaysController's
                 * {{#crossLink "OverlaysController/overlayInFocus:attribute"}}overlayInFocus attribute{{/crossLink}}),
                 * is set either to null or to an other overlay than myself),
                 * then this method will be called.
                 *
                 * @method removedFromFocus
                 */
                removedFromFocus: function () {

                    this.timelineElement.removeClass('highlighted');
                    this.overlayElement.removeClass('highlighted');

                },

                /**
                 * I am called when the mouse pointer is hovering over one of my two DOM elements
                 * @method brushIn
                 */
                brushIn: function () {

                    this.timelineElement.addClass('brushed');
                    this.overlayElement.addClass('brushed');

                },

                /**
                 * I am called when the mouse pointer is leaving the hovering area over my two DOM elements
                 * @method brushOut
                 */
                brushOut: function () {

                    this.timelineElement.removeClass('brushed');
                    this.overlayElement.removeClass('brushed');

                },


                /**
                 * I am called when the app switches to the editMode "overlays".
                 *
                 * I make sure
                 * * that my {{#crossLink "Overlay/timelineElement:attribute"}}timelineElement{{/crossLink}} is resizable and draggable
                 * * that my {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}} is resizable and draggable
                 * * that my elements have click handlers for putting myself into focus.
                 *
                 * @method startEditing
                 */
                startEditing: function () {

                    var self = this,
                        OverlaysController = FrameTrail.module('OverlaysController');

                    window.setTimeout(function() {
                        self.makeTimelineElementDraggable();
                        self.makeTimelineElementResizeable();

                        self.makeOverlayElementDraggable();
                        self.makeOverlayElementResizeable();
                    }, 50);

                    this.timelineElement.on('click.edit', putInFocus);
                    this.overlayElement.on('click.edit', putInFocus);

                    function putInFocus() {

                        if (OverlaysController.overlayInFocus === self){
                            return OverlaysController.overlayInFocus = null;
                        }

                        self.permanentFocusState = true;
                        OverlaysController.overlayInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start;

                    }

                },

                /**
                 * When the global editMode leaves the state "overlays", I am called to
                 * stop the editing features of the overlay.
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

                    if (this.overlayElement.data('ui-draggable')) {
                        this.overlayElement.draggable('destroy');
                    }
                    if (this.overlayElement.data('ui-resizable')) {
                        this.overlayElement.resizable('destroy');
                    }

                    this.timelineElement.unbind('click.edit');
                    this.overlayElement.unbind('click.edit');

                },


                /**
                 * I make my {{#crossLink "Overlay/timelineElement:attribute"}}timelineElement{{/crossLink}} draggable.
                 *
                 * The event handling changes my this.data.start and this.data.end attributes
                 * accordingly. Also it updates the control elements of my
                 * {{#crossLink "Resource/renderBasicPropertiesControls:method"}}properties control interface{{/crossLink}}.
                 *
                 * @method makeTimelineElementDraggable
                 */
                makeTimelineElementDraggable: function () {

                    var self = this;


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
                            FrameTrail.module('OverlaysController').updateControlsStart(newStartValue);
                            FrameTrail.module('OverlaysController').updateControlsEnd( newEndValue );


                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = self;
                            }

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = null;
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                widthPercent  = 100 * (ui.helper.width() / ui.helper.parent().width());

                            self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                            self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            self.updateTimelineElement();

                            FrameTrail.module('OverlaysController').stackTimelineView();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                        }
                    });

                },

                /**
                 * I make my {{#crossLink "Overlay/timelineElement:attribute"}}timelineElement{{/crossLink}} resizable.
                 *
                 * The event handling changes my this.data.start and this.data.end attributes
                 * accordingly. Also it updates the control elements of my
                 * {{#crossLink "Resource/renderBasicPropertiesControls:method"}}properties control interface{{/crossLink}}.
                 *
                 * @method makeTimelineElementResizeable
                 */
                makeTimelineElementResizeable: function () {

                    var self = this,
                        endHandleGrabbed;


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
                                FrameTrail.module('OverlaysController').updateControlsEnd( newValue );

                            } else {

                                newValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                FrameTrail.module('HypervideoController').currentTime = newValue;
                                FrameTrail.module('OverlaysController').updateControlsStart(newValue);

                            }

                            self.scaleOverlayElement();


                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = self;
                            }

                            endHandleGrabbed = $(event.originalEvent.target).hasClass('ui-resizable-e')

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = null;
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent  = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                widthPercent = 100 * (ui.helper.width() / ui.helper.parent().width());


                            self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                            self.data.end   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            FrameTrail.module('OverlaysController').stackTimelineView();

                            self.scaleOverlayElement();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                        }
                    });

                },


                /**
                 * I make my {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}} draggable.
                 *
                 * The event handling changes my this.data.position.[top|left|width|height] attributes
                 * accordingly. Also it updates the control elements of my
                 * {{#crossLink "Resource/renderBasicPropertiesControls:method"}}properties control interface{{/crossLink}}.
                 *
                 * @method makeOverlayElementDraggable
                 */
                makeOverlayElementDraggable: function () {

                    var self = this;

                    self.overlayElement.draggable({

                        containment: 'parent',

                        drag: function(event, ui) {

                            var parent =  ui.helper.parent();

                            FrameTrail.module('OverlaysController').updateControlsDimensions({
                                top:    ui.helper.position().top/parent.height()*100,
                                left:   ui.helper.position().left/parent.width()*100,
                                width:  ui.helper.width()/parent.width()*100,
                                height: ui.helper.height()/parent.height()*100
                            });

                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = self;
                            }

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = null;
                            }

                            var parent = ui.helper.parent();

                            self.data.position.top    = ui.helper.position().top/parent.height()*100;
                            self.data.position.left   = ui.helper.position().left/parent.width()*100;
                            self.data.position.width  = ui.helper.width()/parent.width()*100;
                            self.data.position.height = ui.helper.height()/parent.height()*100;

                            self.updateOverlayElement();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                        }
                    });

                },

                /**
                 * I make my {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}} resizable.
                 *
                 * The event handling changes my this.data.position.[top|left|width|height] attributes
                 * accordingly. Also it updates the control elements of my
                 * {{#crossLink "Resource/renderBasicPropertiesControls:method"}}properties control interface{{/crossLink}}.
                 *
                 * @method makeOverlayElementResizeable
                 */
                makeOverlayElementResizeable: function () {

                    var self = this;

                    self.overlayElement.resizable({

                        containment: 'parent',
                        handles: 'ne, se, sw, nw',

                        resize: function(event, ui) {

                            var parent =  ui.helper.parent();

                            FrameTrail.module('OverlaysController').updateControlsDimensions({
                                top:    ui.helper.position().top/parent.height()*100,
                                left:   ui.helper.position().left/parent.width()*100,
                                width:  ui.helper.width()/parent.width()*100,
                                height: ui.helper.height()/parent.height()*100
                            })

                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = self;
                            }

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('OverlaysController').overlayInFocus = null;
                            }


                            var parent = ui.helper.parent();

                            self.data.position.top    = ui.helper.position().top/parent.height()*100;
                            self.data.position.left   = ui.helper.position().left/parent.width()*100;
                            self.data.position.width  = ui.helper.width()/parent.width()*100;
                            self.data.position.height = ui.helper.height()/parent.height()*100;

                            self.updateOverlayElement();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                        }
                    });

                },










                // TODO

                setActiveInContentView: function (contentView) {
                    console.log(this, 'setActiveInContentView', contentView);


                    this._activeStateInContentView.push(contentView);
                },


                setInactiveInContentView: function (contentView) {
                    console.log(this, 'setInactiveInContentView', contentView);

                    this._activeStateInContentView = this._activeStateInContentView.filter(function (each) {
                        return each !== contentView;
                    })
                },

                _activeStateInContentView: null,
                activeStateInContentView: function (contentView) {
                    if (!this._activeStateInContentView) {
                        this._activeStateInContentView = [];
                    }

                    return this._activeStateInContentView.indexOf(contentView) >= 0;
                }





            }


        }
    }


);
