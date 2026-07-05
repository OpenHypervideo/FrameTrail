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

                this.labels = FrameTrail.module('Localization').labels;

                // compatibility fix
                if ( !data.events || Array.isArray(data.events) ) {
                    data.events = {};
                }

                if ( !data.attributes || Array.isArray(data.attributes) ) {
                    data.attributes = {};
                }


                this.data = data;

                this.resourceItem = FrameTrail.newObject(
                    ('Resource' + data.type.charAt(0).toUpperCase() + data.type.slice(1)),
                    data
                )


                if ( (this.data.type == 'video' || this.data.type == 'audio') && this.data.attributes.autoPlay ) {

                    this.syncedMedia = true;

                }


                var _teWrapper = document.createElement('div');
                _teWrapper.innerHTML = '<div class="timelineElement" data-type="'+ this.data.type +'"><div class="timelineElementIcon"></div><div class="timelineElementLabel"></div><div class="previewWrapper"></div></div>';
                this.timelineElement = _teWrapper.firstElementChild;
                this.overlayElement = document.createElement('div');
                this.overlayElement.className = 'overlayElement';


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
                 * I store whether the viewer has dismissed me via my close button.
                 * I am reset when I become inactive (the current time leaves my range) or when editing starts.
                 * @attribute closedByUser
                 * @type Boolean
                 */
                closedByUser:           false,

                /**
                 * I hold the timelineElement (a plain HTMLElement), which indicates my start and end time.
                 * @attribute timelineElement
                 * @type HTMLElement
                 */
                timelineElement:        null,

                /**
                 * I hold the overlayElement (a plain HTMLElement), which displays my content on top of the video.
                 * @attribute overlayElement
                 * @type HTMLElement
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

                    var timelineScroller = ViewVideo.OverlayTimeline.querySelector('.timelineScroller');
                    (timelineScroller || ViewVideo.OverlayTimeline).appendChild(this.timelineElement);
                    ViewVideo.OverlayContainer.appendChild(this.overlayElement);

                    var previewWrapper = this.timelineElement.querySelector('.previewWrapper');
                    previewWrapper.innerHTML = '';
                    previewWrapper.append(this.resourceItem.renderThumb());

                    // Set icon from resourceItem
                    this.timelineElement.querySelector('.timelineElementIcon').innerHTML =
                        '<span class="' + this.resourceItem.iconClass + '"></span>';

                    // Set label from resourceItem
                    this.timelineElement.querySelector('.timelineElementLabel').textContent =
                        this.resourceItem.getDisplayLabel();

                    var newOverlayContent = this.resourceItem.renderContent();
                    this.overlayElement.append(newOverlayContent);

                    this.updateTimelineElement();
                    this.updateOverlayElement();


                    if (this.syncedMedia) {
                        this.setSyncedMedia(true);
                    }

                    // newOverlayContent may be a DOM element — use querySelector
                    var newOverlayMediaElement = (newOverlayContent && typeof newOverlayContent.querySelector === 'function')
                        ? newOverlayContent.querySelector('video, audio')
                        : null;

                    if (   this.syncedMedia
                        && newOverlayMediaElement instanceof HTMLMediaElement) {

                        this.prepareSyncedHTML5Media(newOverlayMediaElement);

                    }



                    this._brushInHandler  = this.brushIn.bind(this);
                    this._brushOutHandler = this.brushOut.bind(this);
                    this.timelineElement.addEventListener('mouseenter', this._brushInHandler);
                    this.timelineElement.addEventListener('mouseleave', this._brushOutHandler);
                    this.overlayElement.addEventListener('mouseenter', this._brushInHandler);
                    this.overlayElement.addEventListener('mouseleave', this._brushOutHandler);

                    if (this.data.events.onReady) {
                        try {
                            var readyEvent = new Function('FrameTrail', 'hypervideo', this.data.events.onReady);
                            readyEvent.call(this, FrameTrail, FrameTrail.module('HypervideoController'));
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn(this.labels['MessageEventHandlerContainsErrors']+ ': '+ exception.message);
                        }
                    }

                    var _self = this;

                    this.closeButton = document.createElement('div');
                    this.closeButton.className = 'overlayCloseButton';
                    this.closeButton.innerHTML = '<span class="icon-cancel"></span>';
                    this.closeButton.addEventListener('click', function(evt) {
                        evt.stopPropagation();
                        _self.closeByUser();
                    });
                    this.overlayElement.appendChild(this.closeButton);
                    this.updateCloseButton();
                    this.updateHoverStyle();

                    this.overlayElement.addEventListener('click', function(evt) {
                        var self = _self;
                        if (FrameTrail.getState('editMode') != 'overlays') {
                            FrameTrail.triggerEvent('overlayClick', {
                                name: self.data.name,
                                type: self.data.type,
                                start: self.data.start,
                                end: self.data.end
                            });
                        }
                        if (self.data.events.onClick && FrameTrail.getState('editMode') != 'overlays') {
                            try {
                                var clickEvent = new Function('FrameTrail', 'hypervideo', self.data.events.onClick);
                                clickEvent.call(self, FrameTrail, FrameTrail.module('HypervideoController'));
                            } catch (exception) {
                                // could not parse and compile JS code!
                                console.warn(self.labels['MessageEventHandlerContainsErrors']+ ': '+ exception.message);
                            }
                        }

                    });



                },


                /**
                 * I prepare the event listeners for a synced HTML5 video or audio used as overlay.
                 *
                 * @method prepareSyncedHTML5Media
                 * @param {HTMLMediaElement} newOverlayMedia
                 */
                prepareSyncedHTML5Media: function (newOverlayMedia) {

                    var self = this,
                        HypervideoController = FrameTrail.module('HypervideoController'),
                        timeout = null;

                    newOverlayMedia.addEventListener('loadstart', function(evt) {
                        // load start
                        //console.log('loadstart');
                    });

                    newOverlayMedia.addEventListener('loadedmetadata', function(evt) {
                        FrameTrail.changeState('videoWorking', false);
                        newOverlayMedia.addEventListener('waiting', checkForStall);
                        newOverlayMedia.addEventListener('seeking', function(evt) {
                            FrameTrail.changeState('videoWorking', true);
                        });
                        newOverlayMedia.addEventListener('seeked', function(evt) {
                            FrameTrail.changeState('videoWorking', false);
                        });
                        newOverlayMedia.addEventListener('play', function(evt) {
                            FrameTrail.changeState('videoWorking', false);
                        });
                        newOverlayMedia.addEventListener('pause', function(evt) {
                            FrameTrail.changeState('videoWorking', false);
                        });
                    });

                    newOverlayMedia.setAttribute('preload', 'none');
                    //newOverlayMedia.load();

                    function checkForStall() {

                        if (self.activeState) {

                            if (newOverlayMedia.readyState > 0) {
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

                    this.timelineElement.style.top   = '';
                    this.timelineElement.style.left  = positionLeft + '%';
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
                 * I update the CSS of the {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}}
                 * to its correct position within the overlaysContainer.
                 *
                 * @method updateOverlayElement
                 */
                updateOverlayElement: function () {

                    this.overlayElement.style.top    = this.data.position.top    + '%';
                    this.overlayElement.style.left   = this.data.position.left   + '%';
                    this.overlayElement.style.width  = this.data.position.width  + '%';
                    this.overlayElement.style.height = this.data.position.height + '%';
                    this.overlayElement.style.zIndex = (this.data.attributes.zIndex != null) ? this.data.attributes.zIndex : '';

                    var _rdChild = this.overlayElement.querySelector('.resourceDetail');
                    if (_rdChild) {
                        _rdChild.style.opacity = (this.data.attributes.opacity || 1);
                    }

                    var _rd = this.overlayElement.querySelector('.resourceDetail');
                    if (_rd && _rd._leafletMap) {
                        _rd._leafletMap.invalidateSize();
                    }

                },


                /**
                * I scale the overlay element in case the space is too small
                * (text overlays are always scaled to assure proper display)
                * @method scaleOverlayElement
                */
                scaleOverlayElement: function() {

                    if (this.data.type == 'wikipedia' || this.data.type == 'webpage' || this.data.type == 'text' || this.data.type == 'html' || this.data.type == 'quiz' || this.data.type == 'mastodon' || this.data.type == 'urlpreview') {

                        var elementToScale = this.overlayElement ? this.overlayElement.querySelector('.resourceDetail') : null,
                            wrapperElement = this.overlayElement,
                            scaleBase = (this.data.type == 'text' || this.data.type == 'html') ? 800 : 400;

                        if (!elementToScale) { return; }

                        if (scaleBase / wrapperElement.offsetWidth < 1 && this.data.type != 'text' && this.data.type != 'html') {
                            elementToScale.style.top             = '';
                            elementToScale.style.left            = '';
                            elementToScale.style.height          = '';
                            elementToScale.style.minHeight       = '';
                            elementToScale.style.width           = '';
                            elementToScale.style.transform       = 'none';
                            elementToScale.style.transformOrigin = '';
                            return;
                        }

                        var referenceWidth = (this.data.type == 'text' || this.data.type == 'html') ? FrameTrail.module('ViewVideo').OverlayContainer.offsetWidth : wrapperElement.offsetWidth;
                            scale = referenceWidth / scaleBase,
                            negScale = 1/scale,
                            newWidth = (this.data.type == 'text' || this.data.type == 'html') ? wrapperElement.offsetWidth * negScale : scaleBase;

                        elementToScale.style.top             = '50%';
                        elementToScale.style.left            = '50%';
                        elementToScale.style.width           = newWidth + 'px';
                        elementToScale.style.height          = wrapperElement.offsetHeight * negScale + 'px';
                        elementToScale.style.minHeight       = '';
                        elementToScale.style.transformOrigin = '';
                        elementToScale.style.transform       = 'translate(-50%, -50%) scale(' + scale + ')';

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
                        var audioEl = this.overlayElement.querySelector('.resourceDetail audio');
                        if (audioEl !== null) {
                            this.mediaElement = audioEl;
                        } else {
                            this.mediaElement = this.overlayElement.querySelector('.resourceDetail video');
                        }

                        this.mediaElement.removeAttribute('controls');
                    } else {
                        this.mediaElement.setAttribute('controls', 'controls');
                        delete this.mediaElement;
                    }

                },

                /**
                 * I show or hide my close button according to my
                 * data.attributes.showCloseButton and data.attributes.allowClose flags.
                 * @method updateCloseButton
                 */
                updateCloseButton: function () {

                    if (!this.closeButton) { return; }

                    var visible = this.data.attributes.showCloseButton
                                  && this.data.attributes.allowClose !== false;

                    this.closeButton.style.display = visible ? '' : 'none';

                },

                /**
                 * I apply my hover style (data.attributes.hoverStyle) to the overlayElement
                 * as CSS custom properties. The actual :hover behavior is defined in my stylesheet.
                 * @method updateHoverStyle
                 */
                updateHoverStyle: function () {

                    var hoverStyle = this.data.attributes.hoverStyle,
                        el = this.overlayElement;

                    if (hoverStyle) {
                        el.classList.add('hasHoverStyle');
                        el.style.setProperty('--overlay-hover-opacity', (hoverStyle.opacity != null) ? hoverStyle.opacity : 1);
                        el.style.setProperty('--overlay-hover-scale', (hoverStyle.scale != null) ? hoverStyle.scale : 1);
                        el.style.setProperty('--overlay-hover-outline', hoverStyle.borderColor ? '2px solid ' + hoverStyle.borderColor : 'none');
                        el.style.setProperty('--overlay-hover-bg', hoverStyle.backgroundColor || 'transparent');
                    } else {
                        el.classList.remove('hasHoverStyle');
                        el.style.removeProperty('--overlay-hover-opacity');
                        el.style.removeProperty('--overlay-hover-scale');
                        el.style.removeProperty('--overlay-hover-outline');
                        el.style.removeProperty('--overlay-hover-bg');
                    }

                },

                /**
                 * I am called when the viewer clicks my close button.
                 * I hide my overlayElement until I become inactive again.
                 * I do nothing when data.attributes.allowClose is false.
                 * @method closeByUser
                 */
                closeByUser: function () {

                    if (this.data.attributes.allowClose === false) { return; }

                    this.closedByUser = true;
                    this.clearAnimationClasses();
                    this.overlayElement.style.opacity = '';
                    this.overlayElement.classList.add('closedByUser');

                    if (this.syncedMedia) {
                        FrameTrail.module('OverlaysController').removeSyncedMedia(this);
                    }

                },

                /**
                 * I return the CSS class name for the entrance animation.
                 * @method getAnimationInClass
                 * @return {String}
                 */
                getAnimationInClass: function() {
                    var anim = this.data.attributes.animationIn || 'none';
                    return 'anim-in-' + anim;
                },

                /**
                 * I return the CSS class name for the exit animation.
                 * @method getAnimationOutClass
                 * @return {String}
                 */
                getAnimationOutClass: function() {
                    var anim = this.data.attributes.animationOut || 'none';
                    return 'anim-out-' + anim;
                },

                /**
                 * I remove all animation classes from the overlay element.
                 * @method clearAnimationClasses
                 */
                clearAnimationClasses: function() {
                    this.overlayElement.classList.remove(
                        'anim-in-none', 'anim-in-fade', 'anim-in-slideLeft', 'anim-in-slideRight',
                        'anim-in-slideUp', 'anim-in-slideDown', 'anim-in-zoom',
                        'anim-out-fade', 'anim-out-slideLeft', 'anim-out-slideRight',
                        'anim-out-slideUp', 'anim-out-slideDown', 'anim-out-zoom', 'animating-out'
                    );
                },

                /**
                 * When I am scheduled to be displayed, this is the method to be called.
                 * @method setActive
                 * @param {Boolean} onlyTimelineElement (optional)
                 */
                setActive: function (onlyTimelineElement) {

                    if (!onlyTimelineElement) {
                        if (!this.overlayElement.classList.contains('active')) {
                            var self = this;
                            var animIn = this.data.attributes.animationIn || 'none';
                            var duration = this.data.attributes.animationDuration || 300;

                            this.clearAnimationClasses();

                            if (animIn !== 'none') {
                                this.overlayElement.style.setProperty('--overlay-anim-duration', duration + 'ms');
                                this.overlayElement.classList.add('anim-in-' + animIn);

                                // After entrance animation completes, clean up so it can't replay
                                var onEntranceEnd = function(e) {
                                    if (e.target === self.overlayElement) {
                                        self.overlayElement.removeEventListener('animationend', onEntranceEnd);
                                        self.clearAnimationClasses();
                                        self.overlayElement.style.opacity = '1';
                                    }
                                };
                                this.overlayElement.addEventListener('animationend', onEntranceEnd);
                            } else {
                                this.overlayElement.style.opacity = '1';
                            }
                        }
                        this.overlayElement.classList.add('active');

                        var _rd = this.overlayElement.querySelector('.resourceDetail');
                        if (_rd && _rd._leafletMap) {
                            _rd._leafletMap.invalidateSize();
                        }

                        if (this.syncedMedia) {

                            FrameTrail.module('OverlaysController').addSyncedMedia(this);

                        }

                    }

                    this.timelineElement.classList.add('active');

                    if (this.data.events.onStart && !this.activeState && !this.permanentFocusState) {
                        try {
                            var thisEvent = new Function('FrameTrail', 'hypervideo', this.data.events.onStart);
                            thisEvent.call(this, FrameTrail, FrameTrail.module('HypervideoController'));
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn(this.labels['MessageEventHandlerContainsErrors'] +': '+ exception.message);
                        }
                    }

                    this.activeState = true;

                },

                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.timelineElement.classList.remove('active');

                    if (!this.activeState) {
                        this.overlayElement.classList.remove('active');
                        return;
                    }

                    var self = this;
                    var animOut = this.data.attributes.animationOut || 'none';
                    var duration = this.data.attributes.animationDuration || 300;

                    if (this.syncedMedia) {

                        FrameTrail.module('OverlaysController').removeSyncedMedia(this);

                    }

                    if (this.data.events.onEnd && this.activeState && !this.permanentFocusState) {
                        try {
                            var thisEvent = new Function('FrameTrail', 'hypervideo', this.data.events.onEnd);
                            thisEvent.call(this, FrameTrail, FrameTrail.module('HypervideoController'));
                        } catch (exception) {
                            // could not parse and compile JS code!
                            console.warn(this.labels['MessageEventHandlerContainsErrors'] +': '+ exception.message);
                        }
                    }

                    // Only play exit animation if the overlay element is visually active.
                    // When only timeline-activated via setActive(true), the overlay element
                    // never got 'active' class, so skip the animation to avoid flicker.
                    var isVisuallyActive = this.overlayElement.classList.contains('active');

                    if (animOut === 'none' || !isVisuallyActive) {
                        this.clearAnimationClasses();
                        this.overlayElement.style.opacity = '';
                        this.overlayElement.classList.remove('active');
                    } else {
                        this.overlayElement.classList.add('animating-out');
                        this.clearAnimationClasses();
                        this.overlayElement.style.opacity = '';
                        this.overlayElement.style.setProperty('--overlay-anim-duration', duration + 'ms');
                        this.overlayElement.classList.add('anim-out-' + animOut);
                        this.overlayElement.classList.add('animating-out');

                        var onAnimEnd = function(e) {
                            if (e.target === self.overlayElement) {
                                self.overlayElement.removeEventListener('animationend', onAnimEnd);
                                self.clearAnimationClasses();
                                self.overlayElement.classList.remove('active');
                            }
                        };

                        this.overlayElement.addEventListener('animationend', onAnimEnd);

                        // Fallback timeout in case animationend doesn't fire
                        setTimeout(function() {
                            self.overlayElement.removeEventListener('animationend', onAnimEnd);
                            if (self.overlayElement.classList.contains('animating-out')) {
                                self.clearAnimationClasses();
                                self.overlayElement.classList.remove('active');
                            }
                        }, duration + 50);
                    }

                    this.activeState = false;

                    this.closedByUser = false;
                    this.overlayElement.classList.remove('closedByUser');

                },


                /**
                 * When I "got into focus" (which happens, when I become the referenced object in the OverlaysController's
                 * {{#crossLink "OverlaysController/overlayInFocus:attribute"}}overlayInFocus attribute{{/crossLink}}),
                 * then this method will be called.
                 *
                 * @method gotInFocus
                 */
                gotInFocus: function () {

                    this.timelineElement.classList.add('highlighted');
                    this.overlayElement.classList.add('highlighted');

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

                    this.timelineElement.classList.remove('highlighted');
                    this.overlayElement.classList.remove('highlighted');

                },

                /**
                 * I am called when the mouse pointer is hovering over one of my two DOM elements
                 * @method brushIn
                 */
                brushIn: function () {

                    this.timelineElement.classList.add('brushed');
                    this.overlayElement.classList.add('brushed');

                },

                /**
                 * I am called when the mouse pointer is leaving the hovering area over my two DOM elements
                 * @method brushOut
                 */
                brushOut: function () {

                    this.timelineElement.classList.remove('brushed');
                    this.overlayElement.classList.remove('brushed');

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

                    this.closedByUser = false;
                    this.overlayElement.classList.remove('closedByUser');

                    window.setTimeout(function() {
                        self.makeTimelineElementDraggable();
                        self.makeTimelineElementResizeable();

                        self.makeOverlayElementDraggable();
                        self.makeOverlayElementResizeable();
                    }, 50);

                    this._editClickHandlerTimeline = this._editClickHandlerOverlay = function putInFocus() {

                        if (OverlaysController.overlayInFocus === self){
                            return OverlaysController.overlayInFocus = null;
                        }

                        self.permanentFocusState = true;
                        OverlaysController.overlayInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start + 0.01;

                    };

                    this.timelineElement.addEventListener('click', this._editClickHandlerTimeline);
                    this.overlayElement.addEventListener('click', this._editClickHandlerOverlay);

                },

                /**
                 * When the global editMode leaves the state "overlays", I am called to
                 * stop the editing features of the overlay.
                 *
                 * @method stopEditing
                 */
                stopEditing: function () {

                    FrameTrail.module('ViewVideo').hideTimelineSnapIndicator();
                    FrameTrail.module('OverlaysController').clearCanvasSnapLines();

                    if (this.timelineElement) {
                        try { interact(this.timelineElement).unset(); } catch (ex) {}
                    }
                    this.timelineElement.classList.remove('ui-draggable', 'ui-draggable-dragging', 'ui-resizable');
                    this.timelineElement.querySelectorAll('.ui-resizable-handle').forEach(function(e) { e.remove(); });

                    if (this.overlayElement) {
                        try { interact(this.overlayElement).unset(); } catch (ex) {}
                    }
                    this.overlayElement.classList.remove('ui-draggable', 'ui-resizable');
                    this.overlayElement.querySelectorAll('.ui-resizable-handle').forEach(function(e) { e.remove(); });

                    this.timelineElement.removeEventListener('click', this._editClickHandlerTimeline);
                    this.overlayElement.removeEventListener('click', this._editClickHandlerOverlay);

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

                    var self = this,
                        oldStart,
                        oldEnd;

                    var el = this.timelineElement;
                    this.timelineElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        ignoreFrom: '.ui-resizable-handle',
                        listeners: {
                            start: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = self;
                                }

                                // Capture old values for undo
                                oldStart = self.data.start;
                                oldEnd   = self.data.end;

                                e.target.dataset.ftX    = e.target.offsetLeft;
                                e.target.dataset.ftRawX = e.target.offsetLeft;
                                e.target.style.left     = e.target.offsetLeft + 'px';
                                e.target.classList.add('ui-draggable-dragging');

                            },

                            move: function(e) {

                                var rawX = parseFloat(e.target.dataset.ftRawX) + e.dx;
                                e.target.dataset.ftRawX = rawX;
                                var x           = rawX;
                                var parentWidth = e.target.parentElement.offsetWidth;
                                var elWidth     = e.target.offsetWidth;

                                var ViewVideo = FrameTrail.module('ViewVideo');
                                var snapTargets = ViewVideo.getTimelineSnapTargets(e.target.parentElement, e.target);
                                var snapTolerance = 8;
                                var snappedLeft  = ViewVideo.closestSnapTarget(x, snapTargets, snapTolerance);
                                var snappedRight = ViewVideo.closestSnapTarget(x + elWidth, snapTargets, snapTolerance);

                                if (snappedLeft !== null && (snappedRight === null || Math.abs(snappedLeft - x) <= Math.abs(snappedRight - x - elWidth))) {
                                    x = snappedLeft;
                                    ViewVideo.showTimelineSnapIndicator(e.target.parentElement, x);
                                } else if (snappedRight !== null) {
                                    x = snappedRight - elWidth;
                                    ViewVideo.showTimelineSnapIndicator(e.target.parentElement, x + elWidth);
                                } else {
                                    ViewVideo.hideTimelineSnapIndicator();
                                }

                                x = Math.max(0, Math.min(parentWidth - elWidth, x));

                                e.target.style.left  = x + 'px';
                                e.target.dataset.ftX = x;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth),
                                    widthPercent  = 100 * (elWidth / parentWidth),
                                    newStartValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn,
                                    newEndValue   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                FrameTrail.module('HypervideoController').currentTime = newStartValue;
                                FrameTrail.module('OverlaysController').updateControlsStart(newStartValue);
                                FrameTrail.module('OverlaysController').updateControlsEnd(newEndValue);

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = null;
                                }

                                e.target.classList.remove('ui-draggable-dragging');

                                FrameTrail.module('ViewVideo').hideTimelineSnapIndicator();

                                var x           = parseFloat(e.target.dataset.ftX);
                                var parentWidth = e.target.parentElement.offsetWidth;
                                var elWidth     = e.target.offsetWidth;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth),
                                    widthPercent  = 100 * (elWidth / parentWidth);

                                var newStart = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                var newEnd   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                self.data.start = newStart;
                                self.data.end   = newEnd;

                                self.updateTimelineElement();

                                FrameTrail.module('OverlaysController').stackTimelineView();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                // Register undo command for timeline drag
                                (function(overlayId, capturedOldStart, capturedOldEnd, capturedNewStart, capturedNewEnd) {
                                    var findOverlay = function() {
                                        var overlays = FrameTrail.module('HypervideoModel').overlays;
                                        for (var i = 0; i < overlays.length; i++) {
                                            if (overlays[i].data.created === overlayId) {
                                                return overlays[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'overlays',
                                        description: self.labels['SidebarOverlays'] + ' Move',
                                        undo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.start = capturedOldStart;
                                            overlay.data.end = capturedOldEnd;
                                            overlay.updateTimelineElement();
                                            FrameTrail.module('OverlaysController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        },
                                        redo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.start = capturedNewStart;
                                            overlay.data.end = capturedNewEnd;
                                            overlay.updateTimelineElement();
                                            FrameTrail.module('OverlaysController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        }
                                    });
                                })(self.data.created, oldStart, oldEnd, newStart, newEnd);

                            }
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
                        endHandleGrabbed,
                        oldStart,
                        oldEnd;

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
                                    FrameTrail.module('OverlaysController').overlayInFocus = self;
                                }

                                // Capture old values for undo
                                oldStart = self.data.start;
                                oldEnd   = self.data.end;

                                e.target.dataset.ftLeft  = e.target.offsetLeft;
                                e.target.dataset.ftWidth = e.target.offsetWidth;
                                e.target.style.left      = e.target.offsetLeft + 'px';
                                e.target.style.width     = e.target.offsetWidth + 'px';

                            },

                            move: function(e) {

                                var newLeft    = parseFloat(e.target.dataset.ftLeft)  + e.deltaRect.left;
                                var newWidth   = parseFloat(e.target.dataset.ftWidth) + e.deltaRect.width;
                                var parentWidth = e.target.parentElement.offsetWidth;

                                var ViewVideo = FrameTrail.module('ViewVideo');
                                var snapTargets = ViewVideo.getTimelineSnapTargets(e.target.parentElement, e.target);
                                var snapTolerance = 8;

                                if (endHandleGrabbed) {
                                    var snappedRight = ViewVideo.closestSnapTarget(newLeft + newWidth, snapTargets, snapTolerance);
                                    if (snappedRight !== null) {
                                        newWidth = snappedRight - newLeft;
                                        ViewVideo.showTimelineSnapIndicator(e.target.parentElement, snappedRight);
                                    } else {
                                        ViewVideo.hideTimelineSnapIndicator();
                                    }
                                } else {
                                    var snappedLeft = ViewVideo.closestSnapTarget(newLeft, snapTargets, snapTolerance);
                                    if (snappedLeft !== null) {
                                        newWidth += newLeft - snappedLeft;
                                        newLeft   = snappedLeft;
                                        ViewVideo.showTimelineSnapIndicator(e.target.parentElement, newLeft);
                                    } else {
                                        ViewVideo.hideTimelineSnapIndicator();
                                    }
                                }

                                // Clamp to parent
                                if (newLeft < 0)                      { newWidth += newLeft; newLeft = 0; }
                                if (newLeft + newWidth > parentWidth) { newWidth = parentWidth - newLeft; }
                                if (newWidth < 2)                     { newWidth = 2; }

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
                                    FrameTrail.module('OverlaysController').updateControlsEnd(newValue);
                                } else {
                                    newValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                    FrameTrail.module('HypervideoController').currentTime = newValue;
                                    FrameTrail.module('OverlaysController').updateControlsStart(newValue);
                                }

                                self.scaleOverlayElement();

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = null;
                                }

                                FrameTrail.module('ViewVideo').hideTimelineSnapIndicator();

                                var finalLeft   = parseFloat(e.target.dataset.ftLeft);
                                var finalWidth  = parseFloat(e.target.dataset.ftWidth);
                                var parentWidth = e.target.parentElement.offsetWidth;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (finalLeft  / parentWidth),
                                    widthPercent  = 100 * (finalWidth / parentWidth);

                                var newStart = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                var newEnd   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                self.data.start = newStart;
                                self.data.end   = newEnd;

                                self.updateTimelineElement();

                                FrameTrail.module('OverlaysController').stackTimelineView();

                                self.scaleOverlayElement();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                // Register undo command for timeline resize
                                (function(overlayId, capturedOldStart, capturedOldEnd, capturedNewStart, capturedNewEnd) {
                                    var findOverlay = function() {
                                        var overlays = FrameTrail.module('HypervideoModel').overlays;
                                        for (var i = 0; i < overlays.length; i++) {
                                            if (overlays[i].data.created === overlayId) {
                                                return overlays[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'overlays',
                                        description: self.labels['SidebarOverlays'] + ' Resize',
                                        undo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.start = capturedOldStart;
                                            overlay.data.end = capturedOldEnd;
                                            overlay.updateTimelineElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('OverlaysController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        },
                                        redo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.start = capturedNewStart;
                                            overlay.data.end = capturedNewEnd;
                                            overlay.updateTimelineElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('OverlaysController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        }
                                    });
                                })(self.data.created, oldStart, oldEnd, newStart, newEnd);

                            }
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

                    var self = this,
                        oldPosition;

                    var el = this.overlayElement;
                    this.overlayElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        ignoreFrom: '.ui-resizable-handle',
                        listeners: {
                            start: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = self;
                                }

                                // Capture old position for undo
                                oldPosition = {
                                    top:    self.data.position.top,
                                    left:   self.data.position.left,
                                    width:  self.data.position.width,
                                    height: self.data.position.height
                                };

                                // Convert % positioning to px for interaction
                                e.target.dataset.ftX = e.target.offsetLeft;
                                e.target.dataset.ftY = e.target.offsetTop;
                                e.target.style.left  = e.target.offsetLeft + 'px';
                                e.target.style.top   = e.target.offsetTop  + 'px';

                            },

                            move: function(e) {

                                var x = parseFloat(e.target.dataset.ftX) + e.dx;
                                var y = parseFloat(e.target.dataset.ftY) + e.dy;
                                var parent = e.target.parentElement;
                                var maxX = parent.offsetWidth  - e.target.offsetWidth;
                                var maxY = parent.offsetHeight - e.target.offsetHeight;

                                var snappedPosition = FrameTrail.module('OverlaysController').snapCanvasDrag(e.target, x, y);
                                x = snappedPosition.x;
                                y = snappedPosition.y;

                                x = Math.max(0, Math.min(maxX, x));
                                y = Math.max(0, Math.min(maxY, y));

                                e.target.style.left  = x + 'px';
                                e.target.style.top   = y + 'px';
                                e.target.dataset.ftX = x;
                                e.target.dataset.ftY = y;

                                FrameTrail.module('OverlaysController').updateControlsDimensions({
                                    top:    y / parent.offsetHeight * 100,
                                    left:   x / parent.offsetWidth  * 100,
                                    width:  e.target.offsetWidth  / parent.offsetWidth  * 100,
                                    height: e.target.offsetHeight / parent.offsetHeight * 100
                                });

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = null;
                                }

                                FrameTrail.module('OverlaysController').clearCanvasSnapLines();

                                var x = parseFloat(e.target.dataset.ftX);
                                var y = parseFloat(e.target.dataset.ftY);
                                var parent = e.target.parentElement;

                                var newPosition = {
                                    top:    y / parent.offsetHeight * 100,
                                    left:   x / parent.offsetWidth  * 100,
                                    width:  e.target.offsetWidth  / parent.offsetWidth  * 100,
                                    height: e.target.offsetHeight / parent.offsetHeight * 100
                                };

                                self.data.position.top    = newPosition.top;
                                self.data.position.left   = newPosition.left;
                                self.data.position.width  = newPosition.width;
                                self.data.position.height = newPosition.height;

                                self.updateOverlayElement();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                // Register undo command for overlay drag
                                (function(overlayId, capturedOldPos, capturedNewPos) {
                                    var findOverlay = function() {
                                        var overlays = FrameTrail.module('HypervideoModel').overlays;
                                        for (var i = 0; i < overlays.length; i++) {
                                            if (overlays[i].data.created === overlayId) {
                                                return overlays[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'overlays',
                                        description: self.labels['SidebarOverlays'] + ' Move',
                                        undo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.position.top    = capturedOldPos.top;
                                            overlay.data.position.left   = capturedOldPos.left;
                                            overlay.data.position.width  = capturedOldPos.width;
                                            overlay.data.position.height = capturedOldPos.height;
                                            overlay.overlayElement.style.top    = '';
                                            overlay.overlayElement.style.left   = '';
                                            overlay.overlayElement.style.width  = '';
                                            overlay.overlayElement.style.height = '';
                                            overlay.updateOverlayElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        },
                                        redo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.position.top    = capturedNewPos.top;
                                            overlay.data.position.left   = capturedNewPos.left;
                                            overlay.data.position.width  = capturedNewPos.width;
                                            overlay.data.position.height = capturedNewPos.height;
                                            overlay.overlayElement.style.top    = '';
                                            overlay.overlayElement.style.left   = '';
                                            overlay.overlayElement.style.width  = '';
                                            overlay.overlayElement.style.height = '';
                                            overlay.updateOverlayElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        }
                                    });
                                })(self.data.created, oldPosition, newPosition);

                            }
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

                    var self = this,
                        oldPosition;

                    var el = this.overlayElement;
                    this.overlayElement.classList.add('ui-resizable');

                    // Inject corner handles if not yet present
                    ['ne', 'se', 'sw', 'nw'].forEach(function(dir) {
                        if (!el.querySelector('.ui-resizable-' + dir)) {
                            var h = document.createElement('div');
                            h.className = 'ui-resizable-handle ui-resizable-' + dir;
                            el.appendChild(h);
                        }
                    });

                    interact(el).resizable({
                        edges: {
                            top:    '.ui-resizable-nw, .ui-resizable-ne',
                            right:  '.ui-resizable-ne, .ui-resizable-se',
                            bottom: '.ui-resizable-se, .ui-resizable-sw',
                            left:   '.ui-resizable-sw, .ui-resizable-nw'
                        },
                        listeners: {
                            start: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = self;
                                }

                                // Capture old position for undo
                                oldPosition = {
                                    top:    self.data.position.top,
                                    left:   self.data.position.left,
                                    width:  self.data.position.width,
                                    height: self.data.position.height
                                };

                                // Convert % positioning to px for interaction
                                e.target.dataset.ftLeft   = e.target.offsetLeft;
                                e.target.dataset.ftTop    = e.target.offsetTop;
                                e.target.dataset.ftWidth  = e.target.offsetWidth;
                                e.target.dataset.ftHeight = e.target.offsetHeight;
                                e.target.style.left   = e.target.offsetLeft   + 'px';
                                e.target.style.top    = e.target.offsetTop    + 'px';
                                e.target.style.width  = e.target.offsetWidth  + 'px';
                                e.target.style.height = e.target.offsetHeight + 'px';

                            },

                            move: function(e) {

                                var newLeft   = parseFloat(e.target.dataset.ftLeft)   + e.deltaRect.left;
                                var newTop    = parseFloat(e.target.dataset.ftTop)    + e.deltaRect.top;
                                var newWidth  = parseFloat(e.target.dataset.ftWidth)  + e.deltaRect.width;
                                var newHeight = parseFloat(e.target.dataset.ftHeight) + e.deltaRect.height;
                                var parent    = e.target.parentElement;

                                // Clamp to parent
                                if (newLeft < 0)                        { newWidth  += newLeft;  newLeft = 0; }
                                if (newTop  < 0)                        { newHeight += newTop;   newTop  = 0; }
                                if (newLeft + newWidth  > parent.offsetWidth)  { newWidth  = parent.offsetWidth  - newLeft; }
                                if (newTop  + newHeight > parent.offsetHeight) { newHeight = parent.offsetHeight - newTop;  }
                                if (newWidth  < 5) { newWidth  = 5; }
                                if (newHeight < 5) { newHeight = 5; }

                                var snappedRect = FrameTrail.module('OverlaysController').snapCanvasResize(
                                    e.target,
                                    { left: newLeft, top: newTop, width: newWidth, height: newHeight },
                                    e.edges
                                );
                                newLeft   = snappedRect.left;
                                newTop    = snappedRect.top;
                                newWidth  = snappedRect.width;
                                newHeight = snappedRect.height;

                                e.target.style.left   = newLeft   + 'px';
                                e.target.style.top    = newTop    + 'px';
                                e.target.style.width  = newWidth  + 'px';
                                e.target.style.height = newHeight + 'px';
                                e.target.dataset.ftLeft   = newLeft;
                                e.target.dataset.ftTop    = newTop;
                                e.target.dataset.ftWidth  = newWidth;
                                e.target.dataset.ftHeight = newHeight;

                                FrameTrail.module('OverlaysController').updateControlsDimensions({
                                    top:    newTop    / parent.offsetHeight * 100,
                                    left:   newLeft   / parent.offsetWidth  * 100,
                                    width:  newWidth  / parent.offsetWidth  * 100,
                                    height: newHeight / parent.offsetHeight * 100
                                });

                                self.scaleOverlayElement();

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('OverlaysController').overlayInFocus = null;
                                }

                                FrameTrail.module('OverlaysController').clearCanvasSnapLines();

                                var finalLeft   = parseFloat(e.target.dataset.ftLeft);
                                var finalTop    = parseFloat(e.target.dataset.ftTop);
                                var finalWidth  = parseFloat(e.target.dataset.ftWidth);
                                var finalHeight = parseFloat(e.target.dataset.ftHeight);
                                var parent      = e.target.parentElement;

                                var newPosition = {
                                    top:    finalTop    / parent.offsetHeight * 100,
                                    left:   finalLeft   / parent.offsetWidth  * 100,
                                    width:  finalWidth  / parent.offsetWidth  * 100,
                                    height: finalHeight / parent.offsetHeight * 100
                                };

                                self.data.position.top    = newPosition.top;
                                self.data.position.left   = newPosition.left;
                                self.data.position.width  = newPosition.width;
                                self.data.position.height = newPosition.height;

                                self.updateOverlayElement();
                                self.scaleOverlayElement();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                // Register undo command for overlay resize
                                (function(overlayId, capturedOldPos, capturedNewPos) {
                                    var findOverlay = function() {
                                        var overlays = FrameTrail.module('HypervideoModel').overlays;
                                        for (var i = 0; i < overlays.length; i++) {
                                            if (overlays[i].data.created === overlayId) {
                                                return overlays[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'overlays',
                                        description: self.labels['SidebarOverlays'] + ' Resize',
                                        undo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.position.top    = capturedOldPos.top;
                                            overlay.data.position.left   = capturedOldPos.left;
                                            overlay.data.position.width  = capturedOldPos.width;
                                            overlay.data.position.height = capturedOldPos.height;
                                            overlay.overlayElement.style.top    = '';
                                            overlay.overlayElement.style.left   = '';
                                            overlay.overlayElement.style.width  = '';
                                            overlay.overlayElement.style.height = '';
                                            overlay.updateOverlayElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        },
                                        redo: function() {
                                            var overlay = findOverlay();
                                            if (!overlay) return;
                                            overlay.data.position.top    = capturedNewPos.top;
                                            overlay.data.position.left   = capturedNewPos.left;
                                            overlay.data.position.width  = capturedNewPos.width;
                                            overlay.data.position.height = capturedNewPos.height;
                                            overlay.overlayElement.style.top    = '';
                                            overlay.overlayElement.style.left   = '';
                                            overlay.overlayElement.style.width  = '';
                                            overlay.overlayElement.style.height = '';
                                            overlay.updateOverlayElement();
                                            overlay.scaleOverlayElement();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                        }
                                    });
                                })(self.data.created, oldPosition, newPosition);

                            }
                        }
                    });

                },

                // TODO

                setActiveInContentView: function (contentView) {
                    //console.log(this, 'setActiveInContentView', contentView);


                    this._activeStateInContentView.push(contentView);
                },


                setInactiveInContentView: function (contentView) {
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

                    return this._activeStateInContentView.indexOf(contentView) >= 0;
                }




            }


        }
    }


);
