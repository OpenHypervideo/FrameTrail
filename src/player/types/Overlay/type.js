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

                // Transitions animate this layer only, never the overlay box: the box
                // keeps its hover transform, selection outline and resize handles, and
                // .resourceDetail keeps the transform scaleOverlayElement() writes.
                this.animationLayer = document.createElement('div');
                this.animationLayer.className = 'overlayAnimationLayer';
                this.overlayElement.appendChild(this.animationLayer);

                if (!Array.isArray(this.data.keyframes) || !this.data.keyframes.length) {
                    delete this.data.keyframes;
                }

                if (!isFinite(parseFloat(this.data.rotation)) || parseFloat(this.data.rotation) === 0) {
                    delete this.data.rotation;
                } else {
                    this.data.rotation = parseFloat(this.data.rotation);
                }


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
                    this.getContentHost().append(newOverlayContent);

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

                    this.updateHoverStyle();

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.attach(this);
                    }

                    // Scaled types follow their box when box motion animates its size
                    if (window.ResizeObserver && this.isScaledType()) {
                        this._resizeObserver = new ResizeObserver(function() {
                            _self.scaleOverlayElement();
                        });
                        this._resizeObserver.observe(this.overlayElement);
                    }

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

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.detach(this);
                    }

                    if (this._resizeObserver) {
                        this._resizeObserver.disconnect();
                        this._resizeObserver = null;
                    }

                    var detail = this.overlayElement.querySelector('.resourceDetail');
                    if (detail && detail._ftCleanup) { detail._ftCleanup(); }

                    this.timelineElement.remove();
                    this.overlayElement.remove();

                },

                /**
                 * I return the element my content (.resourceDetail) lives in: the
                 * animation layer inside my overlayElement.
                 *
                 * @method getContentHost
                 * @return HTMLElement
                 */
                getContentHost: function () {

                    return this.animationLayer || this.overlayElement;

                },

                /**
                 * I tell the OverlayAnimator that my content was re-rendered or edited,
                 * so text reveals and content animations are rebuilt (debounced).
                 *
                 * @method contentChanged
                 */
                contentChanged: function () {

                    var self = this;

                    window.clearTimeout(this._contentChangedTimer);
                    this._contentChangedTimer = window.setTimeout(function() {
                        var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                        if (OverlayAnimator) {
                            OverlayAnimator.invalidate(self);
                        }
                    }, 100);

                },

                /**
                 * I replace my rendered content with a fresh render of my resource item,
                 * e.g. after an attribute changed that the content markup depends on.
                 *
                 * @method rerenderContent
                 */
                rerenderContent: function () {

                    var host = this.getContentHost(),
                        oldDetail = host.querySelector('.resourceDetail'),
                        newDetail = this.resourceItem.renderContent();

                    if (oldDetail) {
                        if (oldDetail._ftCleanup) { oldDetail._ftCleanup(); }
                        host.replaceChild(newDetail, oldDetail);
                    } else {
                        host.appendChild(newDetail);
                    }

                    this.updateOverlayElement();
                    this.scaleOverlayElement();

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.invalidate(this);
                    }

                    var FreeformShapeEditor = FrameTrail.module('FreeformShapeEditor');
                    if (FreeformShapeEditor) {
                        FreeformShapeEditor.refresh(this);
                    }

                },


                /* ---------------------------------------------------------- */
                /*  Box motion (keyframed position / size / rotation)         */
                /* ---------------------------------------------------------- */

                /**
                 * I tell whether my box moves (has keyframes).
                 * @method hasKeyframes
                 * @return {Boolean}
                 */
                hasKeyframes: function () {

                    return !!(this.data.keyframes && this.data.keyframes.length);

                },

                /**
                 * I return the current playhead time (absolute seconds).
                 * @method playheadTime
                 * @return {Number}
                 */
                playheadTime: function () {

                    var HypervideoController = FrameTrail.module('HypervideoController');
                    return HypervideoController ? HypervideoController.currentTime : this.data.start;

                },

                /**
                 * I return the time my box is edited at: the playhead, clamped to my
                 * span. Outside my span, where I am shown as a ghost, that is the
                 * nearest span edge, which is also where the ghost's box is sampled.
                 * @method editTime
                 * @return {Number}
                 */
                editTime: function () {

                    return Math.max(this.data.start, Math.min(this.data.end, this.playheadTime()));

                },

                /**
                 * I return the index of my keyframe at time t (within the 0.1 s a
                 * keyframe snaps to), or -1.
                 * @method keyframeIndexAt
                 * @param {Number} t
                 * @return {Number}
                 */
                keyframeIndexAt: function (t) {

                    var kfs = this.data.keyframes || [];
                    for (var i = 0; i < kfs.length; i++) {
                        if (Math.abs(kfs[i].t - t) <= 0.1) {
                            return i;
                        }
                    }
                    return -1;

                },

                /**
                 * I return my box at time t: sampled from my keyframes, or my position
                 * (and rotation).
                 * @method getRectAt
                 * @param {Number} t
                 * @return {Object} { top, left, width, height } in percent, rotation in degrees
                 */
                getRectAt: function (t) {

                    if (!this.hasKeyframes()) {
                        return {
                            top:      this.data.position.top,
                            left:     this.data.position.left,
                            width:    this.data.position.width,
                            height:   this.data.position.height,
                            rotation: this.data.rotation || 0
                        };
                    }

                    var Lib = FrameTrail.module('AnimationLibrary'),
                        box = Lib.sampleKeyframes(this.data.keyframes, t);
                    return { left: box[0], top: box[1], width: box[2], height: box[3], rotation: Lib.sampleRotation(this.data.keyframes, t) };

                },

                /**
                 * I return my rotation (degrees) at time t: sampled from my keyframes,
                 * or my static rotation.
                 * @method getRotationAt
                 * @param {Number} t
                 * @return {Number}
                 */
                getRotationAt: function (t) {

                    if (!this.hasKeyframes()) {
                        return this.data.rotation || 0;
                    }
                    return FrameTrail.module('AnimationLibrary').sampleRotation(this.data.keyframes, t);

                },

                /**
                 * While my box moves, my position is the union box of the track within
                 * my span (that is also what the FragmentSelector's xywh says).
                 * @method syncPositionFromKeyframes
                 */
                syncPositionFromKeyframes: function () {

                    if (!this.hasKeyframes()) { return; }

                    var union = FrameTrail.module('AnimationLibrary').unionBox(this.data.keyframes, this.data.start, this.data.end);
                    this.data.position.top    = union.top;
                    this.data.position.left   = union.left;
                    this.data.position.width  = union.width;
                    this.data.position.height = union.height;

                },

                /**
                 * I apply a new box. Without box motion it becomes my position; with box
                 * motion it becomes (or updates) the keyframe at the playhead (clamped to
                 * my span, see editTime). Without rect.rotation my rotation is kept.
                 * @method setRect
                 * @param {Object} rect { top, left, width, height } in percent, rotation? in degrees
                 */
                setRect: function (rect) {

                    if (rect.rotation === undefined || !isFinite(rect.rotation)) {
                        rect = Object.assign({}, rect, { rotation: this.getRotationAt(this.editTime()) });
                    }

                    if (this.hasKeyframes()) {
                        this.upsertKeyframe(this.editTime(), rect);
                    } else {
                        this.data.position.top    = rect.top;
                        this.data.position.left   = rect.left;
                        this.data.position.width  = rect.width;
                        this.data.position.height = rect.height;
                        this.setStaticRotation(rect.rotation);
                    }

                    this.updateOverlayElement();
                    this.scaleOverlayElement();

                },

                /**
                 * I write a keyframe at time t, replacing one within 0.1 s.
                 * @method upsertKeyframe
                 * @param {Number} t
                 * @param {Object} rect
                 */
                upsertKeyframe: function (t, rect) {

                    var kfs  = (this.data.keyframes || []).slice(),
                        xywh = [rect.left, rect.top, rect.width, rect.height],
                        r    = (rect.rotation !== undefined) ? rect.rotation : this.getRotationAt(t),
                        idx  = this.keyframeIndexAt(t);

                    if (idx !== -1) {
                        kfs[idx] = { t: kfs[idx].t, xywh: xywh, r: r, ease: kfs[idx].ease };
                    } else {
                        kfs.push({ t: t, xywh: xywh, r: r });
                    }

                    this.setKeyframes(kfs);

                },

                /**
                 * I set my rotation while my box does not move (0 removes it).
                 * @method setStaticRotation
                 * @param {Number} rotation degrees
                 */
                setStaticRotation: function (rotation) {

                    rotation = Math.round(parseFloat(rotation) * 100) / 100;
                    if (isFinite(rotation) && rotation !== 0) {
                        this.data.rotation = rotation;
                    } else {
                        delete this.data.rotation;
                    }

                },

                /**
                 * I replace my keyframes (normalised), keep my position in sync and
                 * refresh markers and animation.
                 * @method setKeyframes
                 * @param {Array} kfs
                 */
                setKeyframes: function (kfs) {

                    var normalized = FrameTrail.module('AnimationLibrary').normalizeKeyframes(kfs);

                    if (normalized) {
                        this.data.keyframes = normalized;
                        this.syncPositionFromKeyframes();
                    } else {
                        delete this.data.keyframes;
                    }

                    this.updateOverlayElement();
                    this.scaleOverlayElement();
                    this.renderKeyframeMarkers();

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.invalidate(this);
                    }

                },

                /**
                 * I switch box motion on (first keyframe at the playhead, clamped to my
                 * span, from my current position and rotation) or off (my position and
                 * rotation become the box at the playhead).
                 * @method setMotionEnabled
                 * @param {Boolean} enabled
                 */
                setMotionEnabled: function (enabled) {

                    var t = this.editTime();

                    if (enabled && !this.hasKeyframes()) {
                        var rotation = this.data.rotation || 0;
                        delete this.data.rotation;
                        this.setKeyframes([{
                            t: t,
                            xywh: [this.data.position.left, this.data.position.top, this.data.position.width, this.data.position.height],
                            r: rotation
                        }]);
                    } else if (!enabled && this.hasKeyframes()) {
                        var rect = this.getRectAt(t);
                        this.setKeyframes(null);
                        this.data.position.top    = rect.top;
                        this.data.position.left   = rect.left;
                        this.data.position.width  = rect.width;
                        this.data.position.height = rect.height;
                        this.setStaticRotation(rect.rotation);
                        this.updateOverlayElement();
                        this.scaleOverlayElement();
                    }

                },

                /**
                 * I render my keyframes as diamonds on my timelineElement (shown while
                 * editing): click jumps to the keyframe and opens its easing menu, drag
                 * retimes it.
                 * @method renderKeyframeMarkers
                 */
                renderKeyframeMarkers: function () {

                    var self = this,
                        el   = this.timelineElement;

                    el.querySelectorAll('.keyframeMarker').forEach(function(marker) {
                        try { interact(marker).unset(); } catch (e) {}
                        marker.remove();
                    });

                    if (!this.hasKeyframes()) { return; }

                    var span = this.data.end - this.data.start;
                    if (span <= 0) { return; }

                    var editing = el.classList.contains('ui-draggable'),
                        current = this.keyframeIndexAt(this.playheadTime());

                    this.data.keyframes.forEach(function(kf, idx) {

                        if (kf.t < self.data.start - 0.0005 || kf.t > self.data.end + 0.0005) { return; }

                        var marker = document.createElement('div');
                        marker.className = 'keyframeMarker';
                        marker.dataset.index = idx;
                        marker.style.left = (100 * (kf.t - self.data.start) / span) + '%';
                        marker.setAttribute('data-tooltip-top', self.labels['MessageKeyframeMarker']);
                        if (idx === current) {
                            marker.classList.add('current');
                        }

                        marker.addEventListener('click', function(evt) {
                            evt.stopPropagation();
                            FrameTrail.module('OverlaysController').selectOverlay(self);
                            FrameTrail.module('HypervideoController').currentTime = self.data.keyframes[idx].t;
                            FrameTrail.module('OverlayAnimationEditor').openKeyframeMenu(self, idx, marker);
                        });

                        if (editing) {
                            var before = null;
                            interact(marker).draggable({
                                listeners: {
                                    start: function() {
                                        before = self.snapshotState(['keyframes', 'position', 'rotation']);
                                        FrameTrail.module('OverlayAnimationEditor').closeKeyframeMenu();
                                    },
                                    move: function(e) {
                                        var width = el.offsetWidth,
                                            left  = parseFloat(marker.style.left) / 100 * width + e.dx,
                                            t     = self.data.start + Math.max(0, Math.min(width, left)) / width * span,
                                            kfs   = self.data.keyframes,
                                            prev  = kfs[idx - 1],
                                            next  = kfs[idx + 1];
                                        if (prev) { t = Math.max(t, prev.t + 0.01); }
                                        if (next) { t = Math.min(t, next.t - 0.01); }
                                        t = Math.max(self.data.start, Math.min(self.data.end, t));
                                        kfs[idx].t = t;
                                        marker.style.left = (100 * (t - self.data.start) / span) + '%';
                                        FrameTrail.module('HypervideoController').currentTime = t;
                                    },
                                    end: function() {
                                        FrameTrail.module('ViewVideo').swallowNextClick();
                                        self.setKeyframes(self.data.keyframes);
                                        FrameTrail.module('OverlaysController').registerStateUndo(self, self.labels['SettingsMotionMoveKeyframe'], before, self.snapshotState(['keyframes', 'position', 'rotation']));
                                        FrameTrail.module('OverlaysController').refreshMotionControls(self);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                    }
                                }
                            });
                        }

                        el.appendChild(marker);

                    });

                },

                /**
                 * I mark the keyframe marker at the playhead.
                 * @method updateKeyframeMarkerState
                 * @param {Number} t
                 */
                updateKeyframeMarkerState: function (t) {

                    if (!this.hasKeyframes()) { return; }

                    var current = this.keyframeIndexAt(t);
                    this.timelineElement.querySelectorAll('.keyframeMarker').forEach(function(marker) {
                        marker.classList.toggle('current', parseInt(marker.dataset.index, 10) === current);
                    });

                },

                /**
                 * I write my keyframes after a keyframe edit from the editing UI (the
                 * keyframe toggle on the video, the easing menu of a diamond) and
                 * register the undo step. Removing the last keyframe ends box motion,
                 * leaving the box where it is at the playhead.
                 * @method editKeyframes
                 * @param {String} description  undo description
                 * @param {Function} mutate     receives a copy of my keyframes, returns the new list
                 */
                editKeyframes: function (description, mutate) {

                    var before = this.snapshotState(['keyframes', 'position', 'rotation']),
                        kfs    = mutate((this.data.keyframes || []).map(function(kf) {
                            return { t: kf.t, xywh: kf.xywh.slice(), r: kf.r, ease: kf.ease };
                        }));

                    if (kfs && kfs.length) {
                        this.setKeyframes(kfs);
                    } else {
                        this.setMotionEnabled(false);
                    }

                    var OverlaysController = FrameTrail.module('OverlaysController');
                    OverlaysController.registerStateUndo(this, this.labels['SidebarOverlays'] + ' ' + description, before, this.snapshotState(['keyframes', 'position', 'rotation']));
                    OverlaysController.refreshMotionControls(this);
                    FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                },

                /**
                 * I render the keyframe toggle (a diamond next to my box on the video,
                 * shown while I am selected and the playhead is inside my span). It sets
                 * or removes the keyframe at the playhead; once a keyframe exists, moving
                 * or resizing me sets keyframes at the playhead (see setRect).
                 * @method renderKeyframeToggle
                 */
                renderKeyframeToggle: function () {

                    var self = this;

                    if (this.keyframeToggle) {
                        this.keyframeToggle.remove();
                    }

                    var toggle = document.createElement('div');
                    toggle.className = 'keyframeToggle';
                    toggle.setAttribute('role', 'button');

                    toggle.addEventListener('pointerdown', function(evt) {
                        evt.stopPropagation();
                    });
                    toggle.addEventListener('dblclick', function(evt) {
                        evt.stopPropagation();
                    });
                    toggle.addEventListener('click', function(evt) {
                        evt.stopPropagation();
                        var t = self.playheadTime();
                        if (t < self.data.start || t > self.data.end) { return; }
                        var idx = self.keyframeIndexAt(t);
                        if (idx !== -1) {
                            self.editKeyframes(self.labels['SettingsMotionDeleteKeyframe'], function(kfs) {
                                kfs.splice(idx, 1);
                                return kfs;
                            });
                        } else {
                            var rect = self.getRectAt(t);
                            self.editKeyframes(self.labels['KeyframeAdd'], function(kfs) {
                                kfs.push({ t: t, xywh: [rect.left, rect.top, rect.width, rect.height], r: rect.rotation });
                                return kfs;
                            });
                        }
                    });

                    this.keyframeToggle = toggle;
                    this.overlayElement.appendChild(toggle);

                    this.updateKeyframeToggle(this.playheadTime());

                },

                /**
                 * I update the keyframe toggle for time t: available inside my span,
                 * filled when a keyframe sits at t, and placed where my box leaves room.
                 * @method updateKeyframeToggle
                 * @param {Number} t
                 */
                updateKeyframeToggle: function (t) {

                    var toggle = this.keyframeToggle;
                    if (!toggle) { return; }

                    var inSpan = t >= this.data.start && t <= this.data.end,
                        on     = inSpan && this.keyframeIndexAt(t) !== -1,
                        rect   = this.getRectAt(this.editTime()),
                        atTop  = rect.top < 6;

                    toggle.classList.toggle('available', inSpan);
                    toggle.classList.toggle('on', on);
                    toggle.classList.toggle('below', atTop && rect.top + rect.height <= 94);
                    toggle.classList.toggle('inside', atTop && rect.top + rect.height > 94);
                    toggle.setAttribute('data-tooltip-right', on ? this.labels['KeyframeRemove'] : this.labels['KeyframeAdd'] + ' – ' + this.labels['KeyframeAddHint']);

                },

                /**
                 * I render the rotate handle (below my box on the video, shown while I
                 * am selected). Dragging it turns me around my centre (snapping to
                 * right angles, in 15° steps with Shift), double-clicking resets the
                 * rotation. With box motion the rotation is keyed at the playhead
                 * (see setRect).
                 * @method renderRotateHandle
                 */
                renderRotateHandle: function () {

                    var self = this,
                        drag = null;

                    if (this.rotateHandle) {
                        this.rotateHandle.remove();
                    }

                    var handle = document.createElement('div');
                    handle.className = 'rotateHandle';
                    handle.setAttribute('role', 'button');
                    handle.setAttribute('data-tooltip-left-left', this.labels['MessageRotateHandle']);
                    handle.innerHTML = '<span class="icon-cw"></span>';

                    var angleAt = function(evt) {
                        return Math.atan2(evt.clientY - drag.cy, evt.clientX - drag.cx) * 180 / Math.PI;
                    };

                    var commit = function(before, rotation, description) {
                        var rect = self.getRectAt(self.editTime());
                        rect.rotation = rotation;
                        self.setRect(rect);
                        var OverlaysController = FrameTrail.module('OverlaysController');
                        OverlaysController.registerStateUndo(self, self.labels['SidebarOverlays'] + ' ' + description, before, self.snapshotState(['position', 'rotation', 'keyframes']));
                        OverlaysController.refreshMotionControls(self);
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                    };

                    handle.addEventListener('pointerdown', function(evt) {
                        if (evt.button !== 0) { return; }
                        evt.stopPropagation();
                        evt.preventDefault();
                        FrameTrail.module('OverlaysController').selectOverlay(self);
                        var bounds = self.overlayElement.getBoundingClientRect();
                        drag = {
                            cx:     bounds.left + bounds.width  / 2,
                            cy:     bounds.top  + bounds.height / 2,
                            start:  self.getRotationAt(self.editTime()),
                            before: self.snapshotState(['position', 'rotation', 'keyframes']),
                            total:  0,
                            moved:  false
                        };
                        drag.last  = angleAt(evt);
                        drag.value = drag.start;
                        handle.setPointerCapture(evt.pointerId);
                        // The box animation must not fight the inline rotation below
                        FrameTrail.module('OverlayAnimator').suspendBox(self, true);
                    });

                    handle.addEventListener('pointermove', function(evt) {
                        if (!drag) { return; }
                        var angle = angleAt(evt),
                            delta = angle - drag.last;
                        if (delta > 180)  { delta -= 360; }
                        if (delta < -180) { delta += 360; }
                        drag.last   = angle;
                        drag.total += delta;
                        if (Math.abs(drag.total) > 0.5) { drag.moved = true; }
                        if (!drag.moved) { return; }
                        var value = drag.start + drag.total;
                        if (evt.shiftKey) {
                            value = Math.round(value / 15) * 15;
                        } else if (Math.abs(value - Math.round(value / 90) * 90) <= 3) {
                            value = Math.round(value / 90) * 90;
                        }
                        drag.value = Math.round(value * 10) / 10;
                        self.overlayElement.style.rotate = drag.value ? drag.value + 'deg' : '';
                        var rect = self.getRectAt(self.editTime());
                        rect.rotation = drag.value;
                        FrameTrail.module('OverlaysController').updateControlsDimensions(rect);
                    });

                    var end = function(evt) {
                        if (!drag) { return; }
                        var done = drag;
                        drag = null;
                        try { handle.releasePointerCapture(evt.pointerId); } catch (e) {}
                        if (done.moved) {
                            FrameTrail.module('ViewVideo').swallowNextClick();
                            commit(done.before, done.value, self.labels['GenericRotate']);
                        }
                        FrameTrail.module('OverlayAnimator').suspendBox(self, false);
                        self.updateOverlayElement();
                    };

                    handle.addEventListener('pointerup', end);
                    handle.addEventListener('pointercancel', end);
                    handle.addEventListener('click', function(evt) {
                        evt.stopPropagation();
                    });
                    handle.addEventListener('dblclick', function(evt) {
                        evt.stopPropagation();
                        if (!self.getRotationAt(self.editTime())) { return; }
                        commit(self.snapshotState(['position', 'rotation', 'keyframes']), 0, self.labels['GenericRotate']);
                    });

                    this.rotateHandle = handle;
                    this.overlayElement.appendChild(handle);

                    this.updateRotateHandle();

                },

                /**
                 * I place the rotate handle where my box leaves room: below it, above
                 * it at the bottom of the stage, inside it when it fills the height.
                 * @method updateRotateHandle
                 */
                updateRotateHandle: function () {

                    var handle = this.rotateHandle;
                    if (!handle) { return; }

                    var rect     = this.getRectAt(this.editTime()),
                        atBottom = rect.top + rect.height > 94;

                    handle.classList.toggle('above',  atBottom && rect.top >= 6);
                    handle.classList.toggle('inside', atBottom && rect.top < 6);

                },

                /**
                 * While I am selected but not shown at the playhead (outside my span and
                 * my transitions), I am a ghost: dimmed, still editable, showing my
                 * settled look with my box at the nearest span edge.
                 * @method setGhost
                 * @param {Boolean} ghost
                 */
                setGhost: function (ghost) {

                    ghost = !!ghost;
                    if (!!this.ghostState === ghost) { return; }

                    this.ghostState = ghost;
                    this.overlayElement.classList.toggle('ghost', ghost);

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.setGhost(this, ghost);
                    }

                },


                /* ---------------------------------------------------------- */
                /*  Box geometry in stage pixels (rotation aware)              */
                /* ---------------------------------------------------------- */

                /**
                 * I return the size of the stage my box lives in (the overlay
                 * container) in pixels.
                 * @method stageSize
                 * @return {Object} { width, height }
                 */
                stageSize: function () {

                    var container = FrameTrail.module('ViewVideo').OverlayContainer;
                    return { width: container.offsetWidth, height: container.offsetHeight };

                },

                /**
                 * I return my box at time t in stage pixels: centre, size and rotation.
                 * @method getBoxPx
                 * @param {Number} t
                 * @return {Object} { cx, cy, w, h, theta (radians) }
                 */
                getBoxPx: function (t) {

                    var stage = this.stageSize(),
                        rect  = this.getRectAt(t);

                    return {
                        cx:    (rect.left + rect.width  / 2) / 100 * stage.width,
                        cy:    (rect.top  + rect.height / 2) / 100 * stage.height,
                        w:     rect.width  / 100 * stage.width,
                        h:     rect.height / 100 * stage.height,
                        theta: (rect.rotation || 0) * Math.PI / 180
                    };

                },

                /**
                 * I map a point on the stage (pixels, relative to the overlay container)
                 * into my box at the edit time: 0..100 on both axes inside the box,
                 * in the box's own (rotated) frame.
                 * @method stageToLocal
                 * @param {Number} px
                 * @param {Number} py
                 * @return {Array} [u, v]
                 */
                stageToLocal: function (px, py) {

                    var box = this.getBoxPx(this.editTime()),
                        dx  = px - box.cx,
                        dy  = py - box.cy,
                        cos = Math.cos(box.theta),
                        sin = Math.sin(box.theta),
                        lx  =  dx * cos + dy * sin,
                        ly  = -dx * sin + dy * cos;

                    return [(lx / (box.w || 1) + 0.5) * 100, (ly / (box.h || 1) + 0.5) * 100];

                },

                /**
                 * I map a point of my box (0..100, see stageToLocal) onto the stage.
                 * @method localToStage
                 * @param {Number} u
                 * @param {Number} v
                 * @return {Array} [px, py]
                 */
                localToStage: function (u, v) {

                    var box = this.getBoxPx(this.editTime()),
                        lx  = (u / 100 - 0.5) * box.w,
                        ly  = (v / 100 - 0.5) * box.h,
                        cos = Math.cos(box.theta),
                        sin = Math.sin(box.theta);

                    return [box.cx + lx * cos - ly * sin, box.cy + lx * sin + ly * cos];

                },

                /**
                 * I make the region [u0..u1] x [v0..v1] of my box (0..100, may reach
                 * outside it) the whole box, keeping the rotation. With box motion
                 * every keyframe box is changed the same way, so the track keeps its
                 * shape.
                 * @method fitBoxToLocal
                 * @param {Number} u0
                 * @param {Number} v0
                 * @param {Number} u1
                 * @param {Number} v1
                 */
                fitBoxToLocal: function (u0, v0, u1, v1) {

                    var stage = this.stageSize();
                    if (!stage.width || !stage.height) { return; }

                    var round = function(v) { return Math.round(v * 10000) / 10000; };

                    var fit = function(left, top, width, height, rotation) {
                        var w     = width  / 100 * stage.width,
                            h     = height / 100 * stage.height,
                            cx    = (left + width  / 2) / 100 * stage.width,
                            cy    = (top  + height / 2) / 100 * stage.height,
                            theta = (rotation || 0) * Math.PI / 180,
                            ox    = ((u0 + u1) / 2 - 50) / 100 * w,
                            oy    = ((v0 + v1) / 2 - 50) / 100 * h,
                            nw    = w * (u1 - u0) / 100,
                            nh    = h * (v1 - v0) / 100,
                            ncx   = cx + ox * Math.cos(theta) - oy * Math.sin(theta),
                            ncy   = cy + ox * Math.sin(theta) + oy * Math.cos(theta);
                        return [
                            round((ncx - nw / 2) / stage.width  * 100),
                            round((ncy - nh / 2) / stage.height * 100),
                            round(nw / stage.width  * 100),
                            round(nh / stage.height * 100)
                        ];
                    };

                    if (this.hasKeyframes()) {
                        this.setKeyframes(this.data.keyframes.map(function(kf) {
                            return { t: kf.t, xywh: fit(kf.xywh[0], kf.xywh[1], kf.xywh[2], kf.xywh[3], kf.r), r: kf.r, ease: kf.ease };
                        }));
                    } else {
                        var p   = this.data.position,
                            box = fit(p.left, p.top, p.width, p.height, this.data.rotation);
                        p.left   = box[0];
                        p.top    = box[1];
                        p.width  = box[2];
                        p.height = box[3];
                        this.updateOverlayElement();
                        this.scaleOverlayElement();
                    }

                },


                /* ---------------------------------------------------------- */
                /*  Undo snapshots                                            */
                /* ---------------------------------------------------------- */

                /**
                 * I return a deep copy of some of my data keys, for undo.
                 * @method snapshotState
                 * @param {Array} keys (default: start, end, position, rotation, keyframes, attributes)
                 * @return {Object}
                 */
                snapshotState: function (keys) {

                    var self  = this,
                        state = {};

                    (keys || ['start', 'end', 'position', 'rotation', 'keyframes', 'attributes']).forEach(function(key) {
                        state[key] = (self.data[key] === undefined) ? null : JSON.parse(JSON.stringify(self.data[key]));
                    });

                    return state;

                },

                /**
                 * I restore a snapshot taken by snapshotState() and refresh everything
                 * that depends on it.
                 * @method applyState
                 * @param {Object} state
                 * @param {Object} options { rerender: re-render my content }
                 */
                applyState: function (state, options) {

                    var self = this;

                    Object.keys(state).forEach(function(key) {
                        if (state[key] === null) {
                            delete self.data[key];
                        } else {
                            self.data[key] = JSON.parse(JSON.stringify(state[key]));
                        }
                    });

                    if (!this.data.attributes) { this.data.attributes = {}; }
                    if (!this.data.position)   { this.data.position = {}; }

                    if (options && options.rerender) {
                        this.rerenderContent();
                    } else {
                        this.updateOverlayElement();
                        this.scaleOverlayElement();
                    }

                    this.updateHoverStyle();
                    this.updateTimelineElement();

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                    if (OverlayAnimator) {
                        OverlayAnimator.invalidate(this);
                    }

                    var FreeformShapeEditor = FrameTrail.module('FreeformShapeEditor');
                    if (FreeformShapeEditor) {
                        FreeformShapeEditor.refresh(this);
                    }

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

                    this.updateTimelineTails();

                    // Every start/end mutation (drag, resize, inputs, undo) ends up here
                    var span = this.data.start + ',' + this.data.end;
                    if (this._lastSpan !== undefined && this._lastSpan !== span) {
                        if (this.hasKeyframes()) {
                            this.syncPositionFromKeyframes();
                        }
                        var OverlayAnimator = FrameTrail.module('OverlayAnimator');
                        if (OverlayAnimator) {
                            OverlayAnimator.invalidate(this);
                        }
                    }
                    this._lastSpan = span;

                    this.renderKeyframeMarkers();

                },

                /**
                 * I show the lead-in and trail-out of my transitions as faded tails
                 * left and right of my timelineElement.
                 *
                 * @method updateTimelineTails
                 */
                updateTimelineTails: function () {

                    var OverlayAnimator = FrameTrail.module('OverlayAnimator'),
                        win  = OverlayAnimator ? OverlayAnimator.getWindow(this) : null,
                        span = this.data.end - this.data.start;

                    if (!win || span <= 0) {
                        this.timelineElement.style.removeProperty('--ft-tail-in');
                        this.timelineElement.style.removeProperty('--ft-tail-out');
                        return;
                    }

                    this.timelineElement.style.setProperty('--ft-tail-in',  (win.leadInMs   / 1000 / span).toString());
                    this.timelineElement.style.setProperty('--ft-tail-out', (win.trailOutMs / 1000 / span).toString());

                },

                /**
                 * I update the CSS of the {{#crossLink "Overlay/overlayElement:attribute"}}overlayElement{{/crossLink}}
                 * to its correct position within the overlaysContainer.
                 *
                 * @method updateOverlayElement
                 */
                updateOverlayElement: function () {

                    // With box motion the box at the playhead is the truth; the box
                    // animation overrides it while the overlay is armed anyway.
                    var rect = this.hasKeyframes()
                        ? this.getRectAt(FrameTrail.module('HypervideoController') ? FrameTrail.module('HypervideoController').currentTime : this.data.start)
                        : this.data.position;

                    var rotation = this.hasKeyframes() ? rect.rotation : (this.data.rotation || 0);

                    this.overlayElement.style.top    = rect.top    + '%';
                    this.overlayElement.style.left   = rect.left   + '%';
                    this.overlayElement.style.width  = rect.width  + '%';
                    this.overlayElement.style.height = rect.height + '%';
                    this.overlayElement.style.rotate = rotation ? rotation + 'deg' : '';
                    this.overlayElement.style.zIndex = (this.data.attributes.zIndex != null) ? this.data.attributes.zIndex : '';

                    var _rdChild = this.overlayElement.querySelector('.resourceDetail');
                    if (_rdChild) {
                        _rdChild.style.opacity = (this.data.attributes.opacity != null) ? this.data.attributes.opacity : 1;
                    }

                    var _rd = this.overlayElement.querySelector('.resourceDetail');
                    if (_rd && _rd._leafletMap) {
                        _rd._leafletMap.invalidateSize();
                    }

                },


                /**
                 * I tell whether my content is rendered at a reading width and scaled
                 * to fit (see scaleOverlayElement).
                 * @method isScaledType
                 * @return {Boolean}
                 */
                isScaledType: function() {

                    return ['wikipedia', 'webpage', 'text', 'html', 'quiz', 'mastodon', 'urlpreview'].indexOf(this.data.type) >= 0;

                },


                /**
                * I scale the overlay element in case the space is too small
                * (text overlays are always scaled to assure proper display)
                * @method scaleOverlayElement
                */
                scaleOverlayElement: function() {

                    if (this.isScaledType()) {

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
                 * When I am scheduled to be displayed, this is the method to be called.
                 *
                 * Entrance and exit animations are not started here: the OverlayAnimator
                 * arms animated overlays ahead of their start and runs their transitions
                 * on the video clock. I only switch on visibility, interactivity, synced
                 * media and the onStart event, exactly at the activation tick.
                 *
                 * @method setActive
                 * @param {Boolean} onlyTimelineElement (optional)
                 */
                setActive: function (onlyTimelineElement) {

                    if (!onlyTimelineElement) {
                        if (!this.overlayElement.classList.contains('active')) {
                            this.overlayElement.style.opacity = '1';
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
                 *
                 * An exit animation trails after my end time on the OverlayAnimator's
                 * timeline, so I stop being interactive right away; while the exit plays
                 * I stay visible through my 'present' state.
                 *
                 * @method setInactive
                 */
                setInactive: function () {

                    this.timelineElement.classList.remove('active');

                    if (!this.activeState) {
                        this.overlayElement.classList.remove('active');
                        return;
                    }

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

                    this.overlayElement.classList.remove('active');
                    if (!this.overlayElement.classList.contains('present')) {
                        this.overlayElement.style.opacity = '';
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

                    window.setTimeout(function() {
                        self.makeTimelineElementDraggable();
                        self.makeTimelineElementResizeable();

                        self.makeOverlayElementDraggable();
                        self.makeOverlayElementResizeable();
                    }, 50);

                    // Clicking selects without moving the playhead; double-clicking the
                    // timeline element (or my ghost on the video) jumps into my span.
                    this._editClickHandler = function select() {
                        OverlaysController.selectOverlay(self);
                    };

                    this._editDblClickHandlerTimeline = function jumpToStart(evt) {
                        if (evt.target.closest('.ui-resizable-handle, .keyframeMarker')) { return; }
                        OverlaysController.selectOverlay(self);
                        FrameTrail.module('HypervideoController').currentTime = self.data.start + 0.01;
                    };

                    this._editDblClickHandlerOverlay = function jumpFromGhost(evt) {
                        if (!self.ghostState || evt.target.closest('.ui-resizable-handle, .keyframeToggle, .rotateHandle, .freeformHandles')) { return; }
                        FrameTrail.module('HypervideoController').currentTime = self.data.start + 0.01;
                    };

                    this.timelineElement.addEventListener('click', this._editClickHandler);
                    this.overlayElement.addEventListener('click', this._editClickHandler);
                    this.timelineElement.addEventListener('dblclick', this._editDblClickHandlerTimeline);
                    this.overlayElement.addEventListener('dblclick', this._editDblClickHandlerOverlay);

                    this.renderKeyframeToggle();
                    this.renderRotateHandle();

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

                    this.timelineElement.removeEventListener('click', this._editClickHandler);
                    this.overlayElement.removeEventListener('click', this._editClickHandler);
                    this.timelineElement.removeEventListener('dblclick', this._editDblClickHandlerTimeline);
                    this.overlayElement.removeEventListener('dblclick', this._editDblClickHandlerOverlay);

                    if (this.keyframeToggle) {
                        this.keyframeToggle.remove();
                        this.keyframeToggle = null;
                    }
                    if (this.rotateHandle) {
                        this.rotateHandle.remove();
                        this.rotateHandle = null;
                    }
                    this.setGhost(false);

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
                        stateBefore;

                    var el = this.timelineElement;
                    this.timelineElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        ignoreFrom: '.ui-resizable-handle, .keyframeMarker',
                        listeners: {
                            start: function(e) {

                                FrameTrail.module('OverlaysController').selectOverlay(self);

                                // Capture old values for undo
                                stateBefore = self.snapshotState(['start', 'end', 'position', 'rotation', 'keyframes']);

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
                                FrameTrail.module('OverlaysController').updateControlsStart(newStartValue);
                                FrameTrail.module('OverlaysController').updateControlsEnd(newEndValue);

                            },

                            end: function(e) {

                                // The click ending this gesture must not change the selection

                                FrameTrail.module('ViewVideo').swallowNextClick();

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

                                var newStart = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                var newEnd   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                // Moving the whole overlay moves its box-motion keyframes along
                                var shift = newStart - stateBefore.start;
                                if (self.hasKeyframes() && shift !== 0) {
                                    self.data.keyframes.forEach(function(kf) { kf.t += shift; });
                                }

                                self.data.start = newStart;
                                self.data.end   = newEnd;

                                self.updateTimelineElement();

                                FrameTrail.module('OverlaysController').stackTimelineView();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                FrameTrail.module('OverlaysController').registerStateUndo(
                                    self,
                                    self.labels['SidebarOverlays'] + ' Move',
                                    stateBefore,
                                    self.snapshotState(['start', 'end', 'position', 'rotation', 'keyframes'])
                                );

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
                        stateBefore;

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

                                FrameTrail.module('OverlaysController').selectOverlay(self);

                                // Capture old values for undo
                                stateBefore = self.snapshotState(['start', 'end', 'position', 'rotation', 'keyframes']);

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
                                    FrameTrail.module('OverlaysController').updateControlsEnd(newValue);
                                } else {
                                    newValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                    FrameTrail.module('HypervideoController').currentTime = newValue;
                                    FrameTrail.module('OverlaysController').updateControlsStart(newValue);
                                }

                                self.scaleOverlayElement();

                            },

                            end: function(e) {

                                // The click ending this gesture must not change the selection

                                FrameTrail.module('ViewVideo').swallowNextClick();

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

                                var newStart = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                var newEnd   = ((leftPercent + widthPercent) * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                // Trimming leaves box-motion keyframes where they are
                                self.data.start = newStart;
                                self.data.end   = newEnd;

                                self.updateTimelineElement();

                                FrameTrail.module('OverlaysController').stackTimelineView();

                                self.scaleOverlayElement();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                FrameTrail.module('OverlaysController').registerStateUndo(
                                    self,
                                    self.labels['SidebarOverlays'] + ' Resize',
                                    stateBefore,
                                    self.snapshotState(['start', 'end', 'position', 'rotation', 'keyframes'])
                                );

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
                        stateBefore,
                        rotation = 0;

                    // A rotated box is kept on the stage by its rotated bounding box
                    var clampPosition = function(target, x, y) {
                        var parent = target.parentElement,
                            w = target.offsetWidth,
                            h = target.offsetHeight,
                            theta = rotation * Math.PI / 180,
                            halfW = (Math.abs(w * Math.cos(theta)) + Math.abs(h * Math.sin(theta))) / 2,
                            halfH = (Math.abs(w * Math.sin(theta)) + Math.abs(h * Math.cos(theta))) / 2,
                            cx = Math.max(halfW, Math.min(parent.offsetWidth  - halfW, x + w / 2)),
                            cy = Math.max(halfH, Math.min(parent.offsetHeight - halfH, y + h / 2));
                        return { x: cx - w / 2, y: cy - h / 2 };
                    };

                    var el = this.overlayElement;
                    this.overlayElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        ignoreFrom: '.ui-resizable-handle, .keyframeToggle, .rotateHandle, .freeformHandles',
                        listeners: {
                            start: function(e) {

                                FrameTrail.module('OverlaysController').selectOverlay(self);

                                // Capture old state for undo
                                stateBefore = self.snapshotState(['position', 'rotation', 'keyframes']);
                                rotation    = self.getRotationAt(self.editTime());

                                // The box animation must not fight the inline position below
                                FrameTrail.module('OverlayAnimator').suspendBox(self, true);

                                // Convert % positioning to px for interaction
                                e.target.dataset.ftX = e.target.offsetLeft;
                                e.target.dataset.ftY = e.target.offsetTop;
                                e.target.style.left  = e.target.offsetLeft + 'px';
                                e.target.style.top   = e.target.offsetTop  + 'px';

                            },

                            move: function(e) {

                                var parent  = e.target.parentElement;
                                var clamped = clampPosition(e.target, parseFloat(e.target.dataset.ftX) + e.dx, parseFloat(e.target.dataset.ftY) + e.dy);
                                var x = clamped.x;
                                var y = clamped.y;

                                // Follow the pointer 1:1; only show the snap guide lines (snap on release).
                                FrameTrail.module('OverlaysController').snapCanvasDrag(e.target, x, y, rotation);

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

                                // The click ending this gesture must not change the selection

                                FrameTrail.module('ViewVideo').swallowNextClick();

                                var x = parseFloat(e.target.dataset.ftX);
                                var y = parseFloat(e.target.dataset.ftY);
                                var parent = e.target.parentElement;

                                // Snap-on-release: snap the final drop position (if near a guide).
                                var snapped = FrameTrail.module('OverlaysController').snapCanvasDrag(e.target, x, y, rotation);
                                snapped = clampPosition(e.target, snapped.x, snapped.y);
                                x = snapped.x;
                                y = snapped.y;
                                e.target.style.left = x + 'px';
                                e.target.style.top  = y + 'px';

                                FrameTrail.module('OverlaysController').clearCanvasSnapLines();

                                var newPosition = {
                                    top:    y / parent.offsetHeight * 100,
                                    left:   x / parent.offsetWidth  * 100,
                                    width:  e.target.offsetWidth  / parent.offsetWidth  * 100,
                                    height: e.target.offsetHeight / parent.offsetHeight * 100
                                };

                                // Position, or the keyframe at the playhead when the box moves
                                self.setRect(newPosition);
                                FrameTrail.module('OverlayAnimator').suspendBox(self, false);

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                FrameTrail.module('OverlaysController').registerStateUndo(
                                    self,
                                    self.labels['SidebarOverlays'] + ' Move',
                                    stateBefore,
                                    self.snapshotState(['position', 'rotation', 'keyframes'])
                                );
                                FrameTrail.module('OverlaysController').refreshMotionControls(self);

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
                        stateBefore,
                        resizeEdges,
                        rotated = null;

                    // A rotated box is resized in its own frame: the pointer delta is
                    // turned into the box's axes and the opposite corner stays put.
                    var resizeRotated = function(target, edges) {
                        var parent = target.parentElement,
                            theta  = rotated.theta,
                            cos    = Math.cos(theta),
                            sin    = Math.sin(theta),
                            lx     =  rotated.sumX * cos + rotated.sumY * sin,
                            ly     = -rotated.sumX * sin + rotated.sumY * cos,
                            w0     = rotated.width,
                            h0     = rotated.height,
                            w      = Math.max(5, w0 + (edges.right ? lx : (edges.left ? -lx : 0))),
                            h      = Math.max(5, h0 + (edges.bottom ? ly : (edges.top ? -ly : 0))),
                            // anchor: the corner opposite the dragged one, relative to the centre
                            ax0    = edges.left ? w0 / 2 : -w0 / 2,
                            ay0    = edges.top  ? h0 / 2 : -h0 / 2,
                            ax     = edges.left ? w / 2  : -w / 2,
                            ay     = edges.top  ? h / 2  : -h / 2,
                            anchorX = rotated.cx + ax0 * cos - ay0 * sin,
                            anchorY = rotated.cy + ax0 * sin + ay0 * cos,
                            cx     = Math.max(0, Math.min(parent.offsetWidth,  anchorX - (ax * cos - ay * sin))),
                            cy     = Math.max(0, Math.min(parent.offsetHeight, anchorY - (ax * sin + ay * cos)));
                        return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
                    };

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

                                FrameTrail.module('OverlaysController').selectOverlay(self);

                                resizeEdges = e.edges;

                                // Capture old state for undo
                                stateBefore = self.snapshotState(['position', 'rotation', 'keyframes']);

                                // The box animation must not fight the inline size below
                                FrameTrail.module('OverlayAnimator').suspendBox(self, true);

                                var rotation = ((self.getRotationAt(self.editTime()) % 360) + 360) % 360;
                                rotated = (rotation > 0.01 && rotation < 359.99) ? {
                                    theta:  rotation * Math.PI / 180,
                                    cx:     e.target.offsetLeft + e.target.offsetWidth  / 2,
                                    cy:     e.target.offsetTop  + e.target.offsetHeight / 2,
                                    width:  e.target.offsetWidth,
                                    height: e.target.offsetHeight,
                                    sumX:   0,
                                    sumY:   0
                                } : null;

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

                                var newLeft, newTop, newWidth, newHeight;
                                var parent = e.target.parentElement;

                                if (rotated) {

                                    rotated.sumX += e.dx;
                                    rotated.sumY += e.dy;
                                    var box = resizeRotated(e.target, resizeEdges || e.edges);
                                    newLeft   = box.left;
                                    newTop    = box.top;
                                    newWidth  = box.width;
                                    newHeight = box.height;

                                } else {

                                    newLeft   = parseFloat(e.target.dataset.ftLeft)   + e.deltaRect.left;
                                    newTop    = parseFloat(e.target.dataset.ftTop)    + e.deltaRect.top;
                                    newWidth  = parseFloat(e.target.dataset.ftWidth)  + e.deltaRect.width;
                                    newHeight = parseFloat(e.target.dataset.ftHeight) + e.deltaRect.height;

                                    // Clamp to parent — follow the pointer 1:1, no live snapping.
                                    if (newLeft < 0)                        { newWidth  += newLeft;  newLeft = 0; }
                                    if (newTop  < 0)                        { newHeight += newTop;   newTop  = 0; }
                                    if (newLeft + newWidth  > parent.offsetWidth)  { newWidth  = parent.offsetWidth  - newLeft; }
                                    if (newTop  + newHeight > parent.offsetHeight) { newHeight = parent.offsetHeight - newTop;  }
                                    if (newWidth  < 5) { newWidth  = 5; }
                                    if (newHeight < 5) { newHeight = 5; }

                                    // Only show the snap guide lines; snap the actual rect on release.
                                    FrameTrail.module('OverlaysController').snapCanvasResize(
                                        e.target,
                                        { left: newLeft, top: newTop, width: newWidth, height: newHeight },
                                        e.edges
                                    );

                                }

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

                                // The click ending this gesture must not change the selection

                                FrameTrail.module('ViewVideo').swallowNextClick();

                                var parent      = e.target.parentElement;
                                var finalLeft   = parseFloat(e.target.dataset.ftLeft);
                                var finalTop    = parseFloat(e.target.dataset.ftTop);
                                var finalWidth  = parseFloat(e.target.dataset.ftWidth);
                                var finalHeight = parseFloat(e.target.dataset.ftHeight);

                                // Snap-on-release: snap the moving edges, then re-clamp to parent + min size.
                                // (Snap lines are axis aligned, so a rotated box is not snapped.)
                                if (!rotated) {
                                    var snappedRect = FrameTrail.module('OverlaysController').snapCanvasResize(
                                        e.target,
                                        { left: finalLeft, top: finalTop, width: finalWidth, height: finalHeight },
                                        resizeEdges || e.edges || {}
                                    );
                                    finalLeft   = snappedRect.left;
                                    finalTop    = snappedRect.top;
                                    finalWidth  = snappedRect.width;
                                    finalHeight = snappedRect.height;
                                    if (finalLeft < 0)                        { finalWidth  += finalLeft;  finalLeft = 0; }
                                    if (finalTop  < 0)                        { finalHeight += finalTop;   finalTop  = 0; }
                                    if (finalLeft + finalWidth  > parent.offsetWidth)  { finalWidth  = parent.offsetWidth  - finalLeft; }
                                    if (finalTop  + finalHeight > parent.offsetHeight) { finalHeight = parent.offsetHeight - finalTop;  }
                                    if (finalWidth  < 5) { finalWidth  = 5; }
                                    if (finalHeight < 5) { finalHeight = 5; }
                                }
                                e.target.style.left   = finalLeft   + 'px';
                                e.target.style.top    = finalTop    + 'px';
                                e.target.style.width  = finalWidth  + 'px';
                                e.target.style.height = finalHeight + 'px';

                                FrameTrail.module('OverlaysController').clearCanvasSnapLines();

                                var newPosition = {
                                    top:    finalTop    / parent.offsetHeight * 100,
                                    left:   finalLeft   / parent.offsetWidth  * 100,
                                    width:  finalWidth  / parent.offsetWidth  * 100,
                                    height: finalHeight / parent.offsetHeight * 100
                                };

                                // Position, or the keyframe at the playhead when the box moves
                                self.setRect(newPosition);
                                FrameTrail.module('OverlayAnimator').suspendBox(self, false);

                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                FrameTrail.module('OverlaysController').registerStateUndo(
                                    self,
                                    self.labels['SidebarOverlays'] + ' Resize',
                                    stateBefore,
                                    self.snapshotState(['position', 'rotation', 'keyframes'])
                                );
                                FrameTrail.module('OverlaysController').refreshMotionControls(self);

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
