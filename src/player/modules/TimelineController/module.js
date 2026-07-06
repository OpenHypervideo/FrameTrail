/**
 * @module Player
 */

/**
 * I am the TimelineController.
 * I manage shared timeline functionality including zoom, scroll synchronization,
 * time ruler, and minimap across all timeline types (overlays, annotations, code snippets).
 *
 * @class TimelineController
 * @static
 */

FrameTrail.defineModule('TimelineController', function(FrameTrail) {

    var labels = FrameTrail.module('Localization').labels;

    // State
    var zoomLevel = 1,
        scrollPosition = 0,
        initialized = false,
        registeredTimelines = [],
        followerTimelines = [],
        controlsContainer = null,
        timeRulerElement = null,
        minimapElement = null,
        minimapViewport = null,
        playheadElements = [],
        rulerPlayhead = null,
        duration = 0,
        containerWidth = 0,
        isPlaying = false,
        timeUpdateHandler = null;

    // Constants
    var ZOOM_PRESETS = [1, 2, 4, 8];
    var MIN_ZOOM = 1;
    var MAX_ZOOM = 16;


    /**
     * Get the width of the first visible registered timeline.
     * Hidden timelines (display:none) report width 0, so we skip them.
     * @method getVisibleContainerWidth
     * @return {Number}
     */
    function getVisibleContainerWidth() {
        for (var i = 0; i < registeredTimelines.length; i++) {
            var el = registeredTimelines[i].element;
            if (el.offsetParent !== null && getComputedStyle(el).display !== 'none') {
                return el.offsetWidth;
            }
        }
        return containerWidth;
    }


    /**
     * Initialize all edit timelines at once.
     * Called when entering ANY edit mode for the first time.
     * @method initEditTimelines
     */
    function initEditTimelines() {
        if (initialized) return;

        var ViewVideo = FrameTrail.module('ViewVideo');
        duration = FrameTrail.module('HypervideoModel').duration;

        // Register all timelines
        registerTimeline(ViewVideo.OverlayTimeline);
        registerTimeline(ViewVideo.AnnotationTimeline);
        registerTimeline(ViewVideo.CodeSnippetTimeline);
        registerTimeline(ViewVideo.ChapterTimeline);

        // Create shared controls container
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'timelineControlsContainer';

        // DOM order in playerContainer is:
        //   codeSnippetTimeline > overlayTimeline > playerProgress > controls > annotationTimeline
        // Insert before codeSnippetTimeline so controls appear above all timelines
        var cst = ViewVideo.CodeSnippetTimeline;
        cst.insertAdjacentElement('beforebegin', controlsContainer);

        // Create UI elements
        createZoomControls();
        createMinimap();
        createTimeRuler();

        // Set initial container width
        if (registeredTimelines.length > 0) {
            containerWidth = getVisibleContainerWidth();
        }

        // Register timeupdate listener for playhead sync
        timeUpdateHandler = onTimeUpdate;
        FrameTrail.addEventListener('timeupdate', timeUpdateHandler);

        initialized = true;
    }


    /**
     * Clean up when leaving edit mode entirely.
     * @method destroyEditTimelines
     */
    function destroyEditTimelines() {
        if (!initialized) return;

        // Remove any detached preview popup still on body
        document.querySelectorAll('body > .timelineElement.previewPopupWrapper').forEach(function(el) { el.remove(); });

        // Clean up timelines: remove playheads, unwrap children from scroller back to timeline
        registeredTimelines.forEach(function(t) {
            t.element.removeEventListener('scroll', t._scrollHandler);
            t.element.removeEventListener('dragstart', t._dragstartHandler);
            if (t._previewHandlers) {
                t.element.removeEventListener('mousedown', t._previewHandlers.mousedown);
                t.element.removeEventListener('mouseover', t._previewHandlers.mouseover);
                t.element.removeEventListener('mouseout', t._previewHandlers.mouseout);
            }
            if (t.playhead) {
                t.playhead.remove();
            }
            if (t.scroller) {
                t.scroller.removeEventListener('pointerdown', t._scrubStart);
                t.scroller.removeEventListener('pointermove', t._scrubMove);
                t.scroller.removeEventListener('pointerup', t._scrubEnd);
                t.scroller.removeEventListener('pointercancel', t._scrubEnd);
                Array.from(t.scroller.children).forEach(function(c) { t.element.appendChild(c); });
                t.scroller.remove();
            }
        });
        registeredTimelines = [];

        // Clean up follower timelines
        followerTimelines.forEach(function(f) {
            f.wrapper.removeEventListener('scroll', f._scrollHandler);
            if (f._previewHandlers) {
                f.wrapper.removeEventListener('mousedown', f._previewHandlers.mousedown);
                f.wrapper.removeEventListener('mouseover', f._previewHandlers.mouseover);
                f.wrapper.removeEventListener('mouseout', f._previewHandlers.mouseout);
            }
        });
        followerTimelines = [];

        // Remove controls
        if (controlsContainer) {
            controlsContainer.remove();
            controlsContainer = null;
        }

        timeRulerElement = null;
        minimapElement = null;
        minimapViewport = null;
        playheadElements = [];
        rulerPlayhead = null;

        // Remove timeupdate listener
        if (timeUpdateHandler) {
            FrameTrail.removeEventListener('timeupdate', timeUpdateHandler);
            timeUpdateHandler = null;
        }

        // Reset state
        zoomLevel = 1;
        scrollPosition = 0;
        initialized = false;
        isPlaying = false;
    }


    /**
     * Handle timeupdate event to sync playhead positions.
     * @method onTimeUpdate
     * @private
     */
    function onTimeUpdate() {
        if (!initialized || registeredTimelines.length === 0 || duration === 0) return;

        var currentTime = FrameTrail.module('HypervideoController').currentTime;
        var playheadPercent = (currentTime / duration) * 100;

        // Update playhead positions on all timelines (percentage of scroller width)
        playheadElements.forEach(function(playhead) {
            playhead.style.left = playheadPercent + '%';
        });

        // Update ruler playhead
        if (rulerPlayhead) {
            rulerPlayhead.style.left = playheadPercent + '%';
        }

        // Auto-scroll to keep playhead visible when zoomed in
        if (zoomLevel > 1) {
            var scrollerWidth = containerWidth * zoomLevel;
            var playheadPixel = (playheadPercent / 100) * scrollerWidth;
            var visibleStart = scrollPosition;
            var visibleEnd = scrollPosition + containerWidth;
            var margin = containerWidth * 0.1;

            if (playheadPixel < visibleStart + margin ||
                playheadPixel > visibleEnd - margin) {
                scrollToTime(currentTime, false);
            }
        }
    }


    /**
     * Return a detached preview popup to its original element.
     * @method returnPreviewToElement
     * @param {HTMLElement} el - The element that should receive the preview
     */
    function returnPreviewToElement(el) {
        if (el.dataset.previewDetached) {
            var wrapper = document.querySelector('body > .timelineElement.previewPopupWrapper');
            if (wrapper) {
                var preview = wrapper.querySelector('.previewWrapper');
                if (preview) {
                    preview.style.position = '';
                    preview.style.top = '';
                    preview.style.left = '';
                    preview.style.marginLeft = '';
                    preview.style.display = '';
                    preview.style.zIndex = '';
                    el.appendChild(preview);
                }
                wrapper.remove();
            }
            delete el.dataset.previewDetached;
        }
    }


    /**
     * Set up preview popup behavior on a container: on hover, move .previewWrapper
     * to body to escape overflow clipping, and return it on mouseleave.
     * @method setupPreviewPopup
     * @param {HTMLElement} container - The parent element to listen on
     * @param {String} childSelector - CSS selector for the hoverable child elements
     * @return {Object} handlers object for later cleanup
     */
    function setupPreviewPopup(container, childSelector) {

        // Track the element whose preview is currently detached to body.
        // Needed because mouseenter on a new element can fire before mouseleave
        // on the previous one (fast mouse movement), which would leave two
        // previewPopupWrapper elements on the body simultaneously.
        var currentDetachedEl = null;

        // Dismiss preview before interact.js takes control of the pointer on mousedown.
        // mouseleave does not reliably fire once interact.js captures pointer events,
        // so without this the preview can stay visible for the entire drag.
        var mousedownHandler = function(e) {
            var target = e.target.closest(childSelector);
            if (!target) return;
            returnPreviewToElement(target);
            currentDetachedEl = null;
        };

        var mouseoverHandler = function(e) {
            var el = e.target.closest(childSelector);
            if (!el) return;
            // Simulate mouseenter: only fire when entering from outside the element
            if (e.relatedTarget && el.contains(e.relatedTarget)) return;

            var preview = el.querySelector('.previewWrapper');
            if (!preview || !preview.children.length) return;

            // If a different element's preview is still detached, return it first
            if (currentDetachedEl && currentDetachedEl !== el) {
                returnPreviewToElement(currentDetachedEl);
                currentDetachedEl = null;
            }

            // Already showing this element's preview — nothing to do
            if (el.dataset.previewDetached) return;

            var rect = el.getBoundingClientRect();
            var previewWidth = 80;
            var previewHeight = 60;
            var left = rect.left + (rect.width / 2) - (previewWidth / 2);
            var top = rect.top - previewHeight - 8;

            // Clamp to container (or viewport as fallback)
            var targetEl = document.querySelector(FrameTrail.getState('target'));
            var containerRect = targetEl ? targetEl.getBoundingClientRect() : { left: 0, right: window.innerWidth };
            if (left < containerRect.left + 4) left = containerRect.left + 4;
            if (left + previewWidth > containerRect.right - 4) left = containerRect.right - 4 - previewWidth;
            if (top < 4) {
                top = rect.bottom + 8;
            }

            // Create wrapper with .timelineElement class so body > .timelineElement .previewWrapper CSS applies
            var wrapper = document.createElement('div');
            wrapper.className = 'timelineElement previewPopupWrapper';
            wrapper.style.position = 'fixed';
            wrapper.style.top = top + 'px';
            wrapper.style.left = left + 'px';
            wrapper.style.width = previewWidth + 'px';
            wrapper.style.height = previewHeight + 'px';
            wrapper.style.zIndex = '200000';
            wrapper.style.pointerEvents = 'none';

            preview.style.display = 'block';
            preview.style.position = 'static';
            preview.style.width = '100%';
            preview.style.height = '100%';
            preview.style.left = 'auto';
            preview.style.top = 'auto';
            preview.style.marginLeft = '0';

            wrapper.appendChild(preview);
            document.body.appendChild(wrapper);

            el.dataset.previewDetached = '1';
            currentDetachedEl = el;
        };

        var mouseoutHandler = function(e) {
            var el = e.target.closest(childSelector);
            if (!el) return;
            // Simulate mouseleave: only fire when leaving the element entirely
            if (e.relatedTarget && el.contains(e.relatedTarget)) return;
            returnPreviewToElement(el);
            currentDetachedEl = null;
        };

        container.addEventListener('mousedown', mousedownHandler);
        container.addEventListener('mouseover', mouseoverHandler);
        container.addEventListener('mouseout', mouseoutHandler);

        return { mousedown: mousedownHandler, mouseover: mouseoverHandler, mouseout: mouseoutHandler };
    }


    /**
     * Register a timeline element to be managed.
     * @method registerTimeline
     * @param {jQuery|HTMLElement} timelineElement
     */
    function registerTimeline(timelineElement) {
        var el = timelineElement;

        // Ensure timeline has scroller wrapper
        var scroller = el.querySelector('.timelineScroller');
        if (!scroller) {
            scroller = document.createElement('div');
            scroller.className = 'timelineScroller';
            Array.from(el.children).forEach(function(c) { scroller.appendChild(c); });
            el.appendChild(scroller);
        }

        // Add playhead indicator inside scroller (positioned absolutely within it)
        var playhead = document.createElement('div');
        playhead.className = 'timelinePlayhead';
        scroller.appendChild(playhead);
        playheadElements.push(playhead);

        // Set up scroll synchronization
        var scrollHandler = function() {
            if (!el.dataset.programmaticScroll) {
                onTimelineScroll(el.scrollLeft);
            }
        };
        el.addEventListener('scroll', scrollHandler);

        // Drag-to-scrub on timeline (works for both click and drag, mouse + touch)
        var scrubbing = false;
        var scrubSeek = function(e) {
            var scrollerWidth = scroller.offsetWidth;
            if (scrollerWidth === 0 || duration === 0) return;
            var rect = scroller.getBoundingClientRect();
            var x = e.clientX - rect.left;
            FrameTrail.module('HypervideoController').currentTime = Math.max(0, Math.min((x / scrollerWidth) * duration, duration));
        };
        var scrubStart = function(e) {
            if (e.target.closest('.timelineElement')) return;
            if (e.button !== undefined && e.button !== 0) return;
            scrubbing = true;
            scroller.setPointerCapture(e.pointerId);
            scrubSeek(e);
        };
        var scrubMove = function(e) {
            if (!scrubbing) return;
            scrubSeek(e);
        };
        var scrubEnd = function() { scrubbing = false; };
        scroller.addEventListener('pointerdown', scrubStart);
        scroller.addEventListener('pointermove', scrubMove);
        scroller.addEventListener('pointerup', scrubEnd);
        scroller.addEventListener('pointercancel', scrubEnd);

        // Preview popup for main timeline elements
        var previewHandlers = setupPreviewPopup(el, '.timelineElement');

        // Return preview when drag starts
        var dragstartHandler = function(e) {
            var target = e.target.closest('.timelineElement');
            if (!target) return;
            returnPreviewToElement(target);
        };
        el.addEventListener('dragstart', dragstartHandler);

        var timelineData = {
            element: el,
            scroller: scroller,
            playhead: playhead,
            _scrollHandler: scrollHandler,
            _scrubStart: scrubStart,
            _scrubMove: scrubMove,
            _scrubEnd: scrubEnd,
            _dragstartHandler: dragstartHandler,
            _previewHandlers: previewHandlers
        };

        registeredTimelines.push(timelineData);

        // Apply current zoom
        applyZoomToTimeline(timelineData);
    }


    /**
     * Register a follower timeline that syncs zoom and scroll with the main timelines,
     * but without playhead, click-to-seek, or preview popups.
     * The element should contain a child scroller that will be width-scaled.
     * @method registerFollowerTimeline
     * @param {jQuery|HTMLElement} wrapperElement - The scrollable wrapper element
     * @param {jQuery|HTMLElement} scrollerElement - The inner element to scale width on
     */
    function registerFollowerTimeline(wrapperElement, scrollerElement) {
        var wrapper = wrapperElement;
        var scroller = scrollerElement;

        // Sync scroll from follower to main timelines
        var scrollHandler = function() {
            if (!wrapper.dataset.programmaticScroll) {
                onTimelineScroll(wrapper.scrollLeft);
            }
        };
        wrapper.addEventListener('scroll', scrollHandler);

        var followerData = {
            wrapper: wrapper,
            scroller: scroller,
            _scrollHandler: scrollHandler
        };

        followerTimelines.push(followerData);

        // Apply current zoom and scroll
        scroller.style.width = (zoomLevel * 100) + '%';
        wrapper.dataset.programmaticScroll = '1';
        wrapper.scrollLeft = scrollPosition;
        delete wrapper.dataset.programmaticScroll;
    }


    /**
     * Handle scroll event from any timeline.
     * @method onTimelineScroll
     * @param {Number} newScrollLeft
     */
    function onTimelineScroll(newScrollLeft) {
        scrollPosition = newScrollLeft;

        // Sync other timelines
        registeredTimelines.forEach(function(t) {
            if (t.element.scrollLeft !== scrollPosition) {
                t.element.dataset.programmaticScroll = '1';
                t.element.scrollLeft = scrollPosition;
                delete t.element.dataset.programmaticScroll;
            }
        });

        // Sync follower timelines
        followerTimelines.forEach(function(f) {
            if (f.wrapper.scrollLeft !== scrollPosition) {
                f.wrapper.dataset.programmaticScroll = '1';
                f.wrapper.scrollLeft = scrollPosition;
                delete f.wrapper.dataset.programmaticScroll;
            }
        });

        // Sync time ruler
        if (timeRulerElement) {
            timeRulerElement.scrollLeft = scrollPosition;
        }

        updateMinimapViewport();
    }


    /**
     * Apply current scroll position to all timelines.
     * Useful after a timeline becomes visible again.
     * @method syncScroll
     */
    function syncScroll() {
        registeredTimelines.forEach(function(t) {
            t.element.dataset.programmaticScroll = '1';
            t.element.scrollLeft = scrollPosition;
            delete t.element.dataset.programmaticScroll;
        });

        followerTimelines.forEach(function(f) {
            f.wrapper.dataset.programmaticScroll = '1';
            f.wrapper.scrollLeft = scrollPosition;
            delete f.wrapper.dataset.programmaticScroll;
        });

        if (timeRulerElement) {
            timeRulerElement.scrollLeft = scrollPosition;
        }

        updateMinimapViewport();
    }


    /**
     * Set zoom level.
     * @method setZoom
     * @param {Number} level
     * @param {Number} focusTime - Time to keep centered (optional, defaults to playhead)
     */
    function setZoom(level, focusTime) {
        level = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));

        if (level === zoomLevel) return;

        // Default focus to current playhead position
        if (focusTime === undefined) {
            focusTime = FrameTrail.module('HypervideoController').currentTime;
        }

        // Update container width reference
        if (registeredTimelines.length > 0) {
            containerWidth = getVisibleContainerWidth();
        }

        // Calculate new scroll position to maintain focus point
        var scrollerWidth = containerWidth * level;
        var focusPixel = (focusTime / duration) * scrollerWidth;
        var newScroll = focusPixel - (containerWidth / 2);

        // Clamp scroll position
        newScroll = Math.max(0, Math.min(newScroll, scrollerWidth - containerWidth));

        zoomLevel = level;

        // Apply to all timelines
        registeredTimelines.forEach(function(t) {
            applyZoomToTimeline(t);
        });

        // Apply to follower timelines
        followerTimelines.forEach(function(f) {
            f.scroller.style.width = (zoomLevel * 100) + '%';
        });

        // Update scroll
        scrollPosition = newScroll;
        syncScroll();

        // Update UI
        updateTimeRuler();
        updateMinimapViewport();
        updateZoomControlsActive();

        // Reposition playheads for new scroller width
        onTimeUpdate();
    }


    /**
     * Apply zoom to a specific timeline.
     * @method applyZoomToTimeline
     * @param {Object} timelineData
     */
    function applyZoomToTimeline(timelineData) {
        var widthPercent = zoomLevel * 100;
        timelineData.scroller.style.width = widthPercent + '%';
    }


    /**
     * Zoom in to next preset level.
     * @method zoomIn
     */
    function zoomIn() {
        var nextPreset = null;
        for (var i = 0; i < ZOOM_PRESETS.length; i++) {
            if (ZOOM_PRESETS[i] > zoomLevel) {
                nextPreset = ZOOM_PRESETS[i];
                break;
            }
        }
        setZoom(nextPreset || Math.min(zoomLevel * 2, MAX_ZOOM));
    }


    /**
     * Zoom out to previous preset level.
     * @method zoomOut
     */
    function zoomOut() {
        var prevPreset = null;
        for (var i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
            if (ZOOM_PRESETS[i] < zoomLevel) {
                prevPreset = ZOOM_PRESETS[i];
                break;
            }
        }
        setZoom(prevPreset || Math.max(zoomLevel / 2, MIN_ZOOM));
    }


    /**
     * Scroll to make a specific time visible.
     * @method scrollToTime
     * @param {Number} time - Time in seconds
     * @param {Boolean} center - If true, center the time
     */
    function scrollToTime(time, center) {
        if (registeredTimelines.length === 0) return;

        containerWidth = getVisibleContainerWidth();
        var scrollerWidth = containerWidth * zoomLevel;
        var timePixel = (time / duration) * scrollerWidth;

        if (center) {
            scrollPosition = timePixel - (containerWidth / 2);
        } else {
            // Only scroll if time is outside visible area
            var visibleStart = scrollPosition;
            var visibleEnd = scrollPosition + containerWidth;
            var margin = containerWidth * 0.1;

            if (timePixel < visibleStart + margin) {
                scrollPosition = timePixel - margin;
            } else if (timePixel > visibleEnd - margin) {
                scrollPosition = timePixel - containerWidth + margin;
            } else {
                return; // Already visible
            }
        }

        // Clamp
        var maxScroll = scrollerWidth - containerWidth;
        scrollPosition = Math.max(0, Math.min(scrollPosition, maxScroll));

        syncScroll();
    }


    /**
     * Create zoom controls UI.
     * @method createZoomControls
     */
    function createZoomControls() {
        var wrapper = document.createElement('div');
        wrapper.className = 'timelineZoomControlsWrapper';
        var controls = document.createElement('div');
        controls.className = 'timelineZoomControls';

        ZOOM_PRESETS.forEach(function(preset) {
            var label = preset === 1 ? 'Fit' : preset + 'x';
            var btn = document.createElement('button');
            btn.className = 'button timelineZoomPreset';
            btn.setAttribute('data-zoom', preset);
            btn.textContent = label;
            if (preset === zoomLevel) btn.classList.add('active');
            controls.appendChild(btn);
        });

        controls.addEventListener('click', function(e) {
            var btn = e.target.closest('.timelineZoomPreset');
            if (!btn) return;
            setZoom(parseFloat(btn.getAttribute('data-zoom')));
        });

        wrapper.appendChild(controls);
        controlsContainer.appendChild(wrapper);
    }


    /**
     * Update active state of zoom control buttons.
     * @method updateZoomControlsActive
     */
    function updateZoomControlsActive() {
        if (!controlsContainer) return;

        controlsContainer.querySelectorAll('.timelineZoomPreset').forEach(function(btn) { btn.classList.remove('active'); });
        var activeBtn = controlsContainer.querySelector('.timelineZoomPreset[data-zoom="' + zoomLevel + '"]');
        if (activeBtn) activeBtn.classList.add('active');
    }


    /**
     * Create time ruler UI.
     * @method createTimeRuler
     */
    function createTimeRuler() {
        var wrapper = document.createElement('div');
        wrapper.className = 'timelineRulerWrapper';
        var _rw = document.createElement('div');
        _rw.innerHTML = '<div class="timelineRuler"><div class="timelineRulerScroller"></div></div>';
        timeRulerElement = _rw.firstElementChild;

        updateTimeRuler();

        // Drag-to-scrub on time ruler (mouse + touch)
        var rulerScrubbing = false;
        var rulerSeek = function(e) {
            var rect = timeRulerElement.getBoundingClientRect();
            var x = e.clientX - rect.left + timeRulerElement.scrollLeft;
            var scrollerWidth = containerWidth * zoomLevel;
            FrameTrail.module('HypervideoController').currentTime = Math.max(0, Math.min((x / scrollerWidth) * duration, duration));
        };
        timeRulerElement.addEventListener('pointerdown', function(e) {
            if (e.button !== undefined && e.button !== 0) return;
            rulerScrubbing = true;
            timeRulerElement.setPointerCapture(e.pointerId);
            rulerSeek(e);
        });
        timeRulerElement.addEventListener('pointermove', function(e) {
            if (!rulerScrubbing) return;
            rulerSeek(e);
        });
        timeRulerElement.addEventListener('pointerup', function() { rulerScrubbing = false; });
        timeRulerElement.addEventListener('pointercancel', function() { rulerScrubbing = false; });

        wrapper.appendChild(timeRulerElement);
        controlsContainer.appendChild(wrapper);
    }


    /**
     * Update time ruler markers.
     * @method updateTimeRuler
     */
    function updateTimeRuler() {
        if (!timeRulerElement) return;

        var scroller = timeRulerElement.querySelector('.timelineRulerScroller');
        scroller.innerHTML = '';
        scroller.style.width = (zoomLevel * 100) + '%';

        var interval = getTimeInterval();

        for (var t = 0; t <= duration; t += interval) {
            var leftPercent = (t / duration) * 100;
            var marker = document.createElement('div');
            marker.className = 'timelineRulerMarker';
            marker.style.left = leftPercent + '%';
            marker.innerHTML = '<span class="timelineRulerLabel">' + formatTime(t) + '</span>';
            scroller.appendChild(marker);
        }

        // Re-add playhead indicator to ruler (scroller was emptied above)
        rulerPlayhead = document.createElement('div');
        rulerPlayhead.className = 'timelinePlayhead';
        scroller.appendChild(rulerPlayhead);

        // Sync scroll
        timeRulerElement.scrollLeft = scrollPosition;
    }


    /**
     * Get appropriate time interval for ruler based on zoom level.
     * @method getTimeInterval
     * @return {Number}
     */
    function getTimeInterval() {
        if (containerWidth === 0 || duration === 0) return 30;

        var pixelsPerSecond = (containerWidth * zoomLevel) / duration;
        var intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

        // Aim for markers roughly every 60-100 pixels
        for (var i = 0; i < intervals.length; i++) {
            if (intervals[i] * pixelsPerSecond >= 60) {
                return intervals[i];
            }
        }
        return intervals[intervals.length - 1];
    }


    /**
     * Format time for display.
     * @method formatTime
     * @param {Number} seconds
     * @return {String}
     */
    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }


    /**
     * Create minimap UI.
     * @method createMinimap
     */
    function createMinimap() {
        var wrapper = document.createElement('div');
        wrapper.className = 'timelineMinimapWrapper';
        minimapElement = document.createElement('div');
        minimapElement.className = 'timelineMinimap';
        var track = document.createElement('div');
        track.className = 'timelineMinimapTrack';
        minimapViewport = document.createElement('div');
        minimapViewport.className = 'timelineMinimapViewport';

        renderMinimapItems(track);

        minimapElement.append(track, minimapViewport);

        // Make viewport draggable (interact.js, x-axis only)
        interact(minimapViewport).draggable({
            listeners: {
                start: function(e) {
                    e.target.dataset.ftX = parseFloat(e.target.style.left) || e.target.offsetLeft || 0;
                },
                move: function(e) {
                    var x = parseFloat(e.target.dataset.ftX) + e.dx;
                    var parentWidth = minimapElement.offsetWidth;
                    var viewportWidth = minimapViewport.offsetWidth;
                    var maxLeft = parentWidth - viewportWidth;
                    if (maxLeft < 0) { maxLeft = 0; }
                    x = Math.max(0, Math.min(maxLeft, x));
                    e.target.style.left = x + 'px';
                    e.target.dataset.ftX = x;
                    if (maxLeft <= 0) { return; }
                    var scrollPercent = x / maxLeft;
                    var scrollerWidth = containerWidth * zoomLevel;
                    var maxScroll = scrollerWidth - containerWidth;
                    scrollPosition = scrollPercent * maxScroll;
                    syncScroll();
                }
            }
        });

        // Click on minimap to jump
        minimapElement.addEventListener('click', function(e) {
            if (e.target.classList.contains('timelineMinimapViewport')) return;

            var rect = minimapElement.getBoundingClientRect();
            var clickPercent = (e.clientX - rect.left) / rect.width;
            var time = clickPercent * duration;

            FrameTrail.module('HypervideoController').currentTime = time;
            scrollToTime(time, true);
        });

        updateMinimapViewport();

        wrapper.appendChild(minimapElement);
        controlsContainer.appendChild(wrapper);
    }


    /**
     * Render minimap item indicators.
     * @method renderMinimapItems
     * @param {HTMLElement} track - Optional track element, otherwise finds existing
     */
    function renderMinimapItems(track) {
        if (!track) {
            if (!minimapElement) return;
            track = minimapElement.querySelector('.timelineMinimapTrack');
        }

        track.innerHTML = '';

        var items = getAllItems();

        items.forEach(function(item) {
            var start = item.data.start;
            var leftPercent = (start / duration) * 100;
            var cssWidth = item.data.end
                ? Math.max(((item.data.end - start) / duration) * 100, 0.3) + '%'
                : '10px';

            var el = document.createElement('div');
            el.className = 'timelineMinimapItem';
            el.style.left = leftPercent + '%';
            el.style.width = cssWidth;
            track.appendChild(el);
        });

        // Use CollisionDetection to stack items (same mechanism as timelines)
        CollisionDetection(track, { spacing: 0, includeVerticalMargins: true, containerPadding: 5 });

        // CollisionDetection counts margin-bottom in height, which adds extra space
        // below the bottom row. Subtract it so top and bottom padding are equal.
        var firstItem = track.querySelector('.timelineMinimapItem');
        var itemMargin = 0;
        if (firstItem) {
            itemMargin = parseFloat(getComputedStyle(firstItem).marginBottom) || 0;
        }
        var trackHeight = Math.max(track.offsetHeight - itemMargin, 12);
        minimapElement.style.height = trackHeight + 'px';
    }


    /**
     * Get all timeline items for minimap.
     * @method getAllItems
     * @return {Array}
     */
    function getAllItems() {
        var HypervideoModel = FrameTrail.module('HypervideoModel');
        var editMode = FrameTrail.getState('editMode');

        switch (editMode) {
            case 'overlays':
                return HypervideoModel.overlays || [];
            case 'annotations':
                // Show only the current user's annotations (matches timeline display)
                return FrameTrail.module('TagModel').getContentCollection(
                    [],
                    false,
                    true,
                    [FrameTrail.module('UserManagement').userID],
                    '',
                    []
                );
            case 'codesnippets':
                return HypervideoModel.codeSnippets || [];
            case 'chapters':
                return HypervideoModel.chapters || [];
            default:
                // Non-edit mode: only overlays are visible (timelines are hidden)
                return HypervideoModel.overlays || [];
        }
    }


    /**
     * Update minimap viewport position and size.
     * @method updateMinimapViewport
     */
    function updateMinimapViewport() {
        if (!minimapElement || !minimapViewport) return;

        var minimapWidth = minimapElement.offsetWidth;

        if (zoomLevel <= 1 || minimapWidth === 0) {
            minimapViewport.style.width = '100%';
            minimapViewport.style.left = '0';
            return;
        }

        var viewportWidthPercent = (1 / zoomLevel) * 100;
        var scrollerWidth = containerWidth * zoomLevel;
        var maxScroll = scrollerWidth - containerWidth;

        var scrollPercent = maxScroll > 0 ? scrollPosition / maxScroll : 0;
        var maxLeft = minimapWidth * (1 - (1 / zoomLevel));
        var viewportLeft = scrollPercent * maxLeft;

        minimapViewport.style.width = viewportWidthPercent + '%';
        minimapViewport.style.left = viewportLeft + 'px';
    }


    /**
     * Refresh minimap when items change.
     * @method refreshMinimap
     */
    function refreshMinimap() {
        renderMinimapItems();
    }


    /**
     * Handle window resize.
     * @method onViewSizeChanged
     */
    function onViewSizeChanged() {
        if (!initialized) return;

        if (registeredTimelines.length > 0) {
            containerWidth = getVisibleContainerWidth();
        }

        updateTimeRuler();
        updateMinimapViewport();
    }


    // Public interface
    return {

        // Note: init/destroy are called explicitly from ViewVideo.initEditMode()
        // and ViewVideo.leaveEditMode(). No onChange.editMode handler needed
        // (would cause double-destruction).
        onChange: {
            viewSizeChanged: onViewSizeChanged,
            editMode: function() {
                if (initialized) refreshMinimap();
            }
        },

        initEditTimelines:      initEditTimelines,
        destroyEditTimelines:   destroyEditTimelines,

        setZoom:                setZoom,
        zoomIn:                 zoomIn,
        zoomOut:                zoomOut,

        syncScroll:             syncScroll,
        scrollToTime:           scrollToTime,
        registerFollowerTimeline: registerFollowerTimeline,

        refreshMinimap:         refreshMinimap,
        setupPreviewPopup:      setupPreviewPopup,

        /**
         * @attribute initialized
         * @type Boolean
         * @readOnly
         */
        get initialized()       { return initialized },

        /**
         * @attribute zoomLevel
         * @type Number
         * @readOnly
         */
        get zoomLevel()         { return zoomLevel },

        /**
         * @attribute ZOOM_PRESETS
         * @type Array
         * @readOnly
         */
        get ZOOM_PRESETS()      { return ZOOM_PRESETS }

    };

});
