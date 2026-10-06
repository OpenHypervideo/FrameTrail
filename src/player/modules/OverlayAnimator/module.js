/**
 * @module Player
 */


/**
 * I am the OverlayAnimator. I drive the animations of overlays in sync with the
 * video: entrance and exit transitions, emphasis loops, text reveals, content
 * animations of overlay types and keyframed box motion.
 *
 * Timing model — transitions frame the span. The entrance leads into the
 * overlay's start, the exit trails after its end, so the overlay is fully
 * present (and clickable) for exactly [start, end]. Emphasis loops, text
 * reveals and content animations play inside the span. Activation (onStart,
 * onEnd, pointer events, synced media) is untouched and stays with the
 * OverlaysController's tick.
 *
 * CSS-native. The motion lives in CSS @keyframes (AnimationLibrary/presets.css)
 * and runs natively in the browser's animation engine. I only keep it in sync
 * with the video, the way the OverlaysController keeps synced media in sync:
 * on play, pause, seek and rate changes I set every animation's time from the
 * video clock, and while playing I correct drift on the high-priority tick.
 * Paused or scrubbed, an overlay shows the exact frame of the current time.
 *
 * An overlay "needs" me when it has an animation spec, box-motion keyframes or
 * a type with an animateContent() hook. All other overlays keep the plain
 * class-toggle path of the OverlaysController.
 *
 * Every animated overlay gets three bookkeeping animations: ftArmed / ftDisarm
 * flip the animation layer's visibility exactly at the window edges (so I can
 * arm an overlay early, ahead of the coarse activation tick, without it showing
 * early), and an ftClock animation spans the whole window as the reference for
 * drift checks and per-frame content hooks.
 *
 * @class OverlayAnimator
 * @static
 */

FrameTrail.defineModule('OverlayAnimator', function(FrameTrail){

    var Lib = FrameTrail.module('AnimationLibrary') || FrameTrail.initModule('AnimationLibrary');

    var LOOKAHEAD      = 0.2,   // seconds an overlay is armed before its window opens
        DRIFT_NATIVE   = 40,    // ms of tolerated drift against a native / canvas video
        DRIFT_EMBEDDED = 120,   // ms against YouTube / Vimeo, whose reported time is coarse
        DEFAULT_DISTANCE = 5;   // percent of the stage's smaller side

    var entries = [],
        rafID   = null,
        reducedMotionQuery = (window.matchMedia) ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;


    function onReducedMotionChange() {
        invalidateAll();
    }

    if (reducedMotionQuery && reducedMotionQuery.addEventListener) {
        reducedMotionQuery.addEventListener('change', onReducedMotionChange);
    }


    /* ------------------------------------------------------------------ */
    /*  Helpers                                                           */
    /* ------------------------------------------------------------------ */

    function isReducedMotion() {
        return !!(reducedMotionQuery && reducedMotionQuery.matches);
    }

    function playbackState() {
        var HC = FrameTrail.module('HypervideoController');
        if (!HC) {
            return { time: 0, playing: false, rate: 1 };
        }
        return {
            time:    (HC.preciseTime != null) ? HC.preciseTime : HC.currentTime,
            playing: !!(HC.isPlaying && !HC.isStalled && !HC.isBuffering),
            rate:    HC.playbackRate || 1
        };
    }

    function offsetIn() {
        var HypervideoModel = FrameTrail.module('HypervideoModel');
        return (HypervideoModel && HypervideoModel.offsetIn) || 0;
    }

    function driftTolerance() {
        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            videoType = HypervideoModel ? HypervideoModel.videoType : 'native';
        return (videoType === 'youtube' || videoType === 'vimeo') ? DRIFT_EMBEDDED : DRIFT_NATIVE;
    }

    function getSpec(overlay) {
        var spec = Lib.normalizeAnimation(overlay.data.attributes);
        return isReducedMotion() ? Lib.reducedSpec(spec) : spec;
    }

    function hasKeyframes(overlay) {
        return !!(overlay.data.keyframes && overlay.data.keyframes.length);
    }

    function hasContentHook(overlay) {
        return !!(overlay.resourceItem && typeof overlay.resourceItem.animateContent === 'function');
    }

    /**
     * I tell whether an overlay needs the animation engine at all.
     * @method needsEngine
     * @param {Overlay} overlay
     * @return {Boolean}
     */
    function needsEngine(overlay) {
        return Lib.hasAnimation(Lib.normalizeAnimation(overlay.data.attributes))
            || hasKeyframes(overlay)
            || hasContentHook(overlay);
    }

    function getEntry(overlay) {
        return overlay ? overlay._animatorEntry : null;
    }

    function getDetail(overlay) {
        return overlay.animationLayer ? overlay.animationLayer.querySelector('.resourceDetail') : null;
    }

    function computeWin(entry) {
        var data = entry.overlay.data;
        entry.spec = getSpec(entry.overlay);
        entry.win  = Lib.computeWindow(entry.spec, data.start, data.end, offsetIn());
        return entry.win;
    }

    function phaseParams(spec) {
        var params = {};
        ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
            var s = spec[phase];
            if (!s || !s.params) { return; }
            if (s.params.distance != null && params.distance == null) { params.distance = parseFloat(s.params.distance); }
            if (s.params.color && !params.color) { params.color = s.params.color; }
        });
        return params;
    }


    /* ------------------------------------------------------------------ */
    /*  Build / teardown                                                  */
    /* ------------------------------------------------------------------ */

    function teardown(entry) {

        var overlay = entry.overlay,
            layer   = overlay.animationLayer;

        entry.anims.forEach(function(anim) {
            if (anim.id === 'ftClock' || anim.id === 'ftBox') {
                try { anim.cancel(); } catch (e) {}
            }
        });

        if (layer) {
            layer.style.animation = '';
            layer.style.removeProperty('--ft-anim-dist');
            layer.style.removeProperty('--ft-anim-color');
        }

        entry.strokeTargets.forEach(function(el) {
            el.style.animation = '';
        });

        if (entry.textRoot) {
            Lib.unsplitText(entry.textRoot);
        }

        entry.hooks.forEach(function(hook) {
            if (hook && typeof hook.destroy === 'function') {
                try { hook.destroy(); } catch (e) { console.warn(e); }
            }
        });

        entry.anims         = [];
        entry.hooks         = [];
        entry.strokeTargets = [];
        entry.textRoot      = null;
        entry.clock         = null;
        entry.boxAnim       = null;
        entry.built         = false;

    }

    function build(entry) {

        teardown(entry);

        var overlay = entry.overlay,
            data    = overlay.data,
            layer   = overlay.animationLayer,
            detail  = getDetail(overlay);

        if (!layer) { return; }

        var win    = computeWin(entry),
            spec   = entry.spec,
            leadIn = win.leadInMs,
            spanMs = win.spanMs,
            list   = [],
            strokeIn  = null,
            strokeOut = null;

        // Parameters shared by the presets of this overlay
        var params   = phaseParams(spec),
            distance = (params.distance != null && isFinite(params.distance)) ? params.distance : DEFAULT_DISTANCE;
        layer.style.setProperty('--ft-anim-dist', 'calc(var(--ft-stage-min, 400px) * ' + (distance / 100) + ')');
        if (params.color) {
            layer.style.setProperty('--ft-anim-color', params.color);
        }

        // Window edges: hidden before the window opens, hidden after it closes.
        // Both edges belong to the window: ftArmed runs in the millisecond before
        // it opens (at local 0 it would still be on its hidden 'from' frame, so an
        // overlay without lead-in would be invisible with the playhead exactly at
        // its start), ftDisarm in the millisecond after it closes.
        list.push(Lib.animationEntry('ftArmed', 1, 'linear', -1, 1, 'both'));

        if (spec['in'] && leadIn > 0) {
            var inPreset = Lib.getPreset('in', spec['in'].preset);
            if (inPreset.target === 'stroke') {
                strokeIn = Lib.animationEntry(inPreset.keyframes, leadIn, spec['in'].ease, 0, 1, 'both');
            } else {
                list.push(Lib.animationEntry(inPreset.keyframes, leadIn, spec['in'].ease, 0, 1, 'both'));
            }
        }

        if (spec.emphasis && spanMs > 0) {
            var emPreset   = Lib.getPreset('emphasis', spec.emphasis.preset),
                emDuration = Math.max(1, spec.emphasis.duration),
                iterations = spec.emphasis.iterations || Math.floor(spanMs / emDuration);
            iterations = Math.min(iterations, Math.floor(spanMs / emDuration));
            if (iterations > 0) {
                list.push(Lib.animationEntry(emPreset.keyframes, emDuration, spec.emphasis.ease, leadIn, iterations, 'none'));
            }
        }

        if (spec.out && spec.out.duration > 0) {
            var outPreset = Lib.getPreset('out', spec.out.preset);
            if (outPreset.target === 'stroke') {
                strokeOut = Lib.animationEntry(outPreset.keyframes, spec.out.duration, spec.out.ease, leadIn + spanMs, 1, 'forwards');
            } else {
                list.push(Lib.animationEntry(outPreset.keyframes, spec.out.duration, spec.out.ease, leadIn + spanMs, 1, 'forwards'));
            }
        }

        list.push(Lib.animationEntry('ftDisarm', 1, 'linear', leadIn + spanMs + win.trailOutMs, 1, 'forwards'));

        layer.style.animation = list.join(', ');

        // Stroke presets (e.g. hotspot Draw) animate the type's stroke elements
        if ((strokeIn || strokeOut) && detail && overlay.resourceItem && typeof overlay.resourceItem.getStrokeTargets === 'function') {
            var targets = overlay.resourceItem.getStrokeTargets(detail) || [];
            targets.forEach(function(el) {
                el.style.animation = [strokeIn, strokeOut].filter(Boolean).join(', ');
            });
            entry.strokeTargets = targets;
        }

        // Text reveal, inside the span
        if (spec.text && detail && overlay.resourceItem && typeof overlay.resourceItem.getTextRevealRoot === 'function') {
            var root = overlay.resourceItem.getTextRevealRoot(detail);
            if (root) {
                var textPreset = Lib.getPreset('text', spec.text.preset),
                    mode       = textPreset.mode || spec.text.mode,
                    units      = Lib.splitText(root, mode, { inline: !!textPreset.inline });
                if (units.length > 400 && mode === 'letter') {
                    Lib.unsplitText(root);
                    units = Lib.splitText(root, 'word', { inline: !!textPreset.inline });
                }
                if (units.length > 400) {
                    Lib.unsplitText(root);
                    units = [];
                }
                if (units.length) {
                    var count    = units.length,
                        duration = spec.text.duration,
                        stagger  = spec.text.stagger;
                    if (count > 1 && (count - 1) * stagger + duration > spanMs) {
                        stagger = Math.max(0, (spanMs - duration) / (count - 1));
                    }
                    units.forEach(function(unit, idx) {
                        unit.style.animation = Lib.animationEntry(textPreset.keyframes, duration, spec.text.ease, leadIn + idx * stagger, 1, 'both');
                    });
                    entry.textRoot = root;
                }
            }
        }

        // Content animations of the overlay type (Counter, Chart, Cursor, …)
        if (detail && hasContentHook(overlay)) {
            try {
                var hook = overlay.resourceItem.animateContent(detail, {
                    leadInMs:      leadIn,
                    spanMs:        spanMs,
                    entry:         Lib.animationEntry,
                    easeCss:       Lib.easeCss,
                    easeFn:        Lib.easeFn,
                    reducedMotion: isReducedMotion(),
                    editMode:      FrameTrail.getState('editMode') === 'overlays'
                });
                if (hook) { entry.hooks.push(hook); }
            } catch (e) {
                console.warn('animateContent failed for overlay', data.name, e);
            }
        }

        // Clock: spans the whole window and never finishes inside it
        entry.clock = layer.animate([{}, {}], {
            duration: (win.windowEnd - win.origin) * 1000 + 3600000,
            fill:     'both',
            id:       'ftClock'
        });

        // Box motion on the overlay box itself
        if (hasKeyframes(overlay) && !entry.boxSuspended) {
            var box = Lib.boxAnimation(data.keyframes);
            if (box) {
                entry.boxAnim = overlay.overlayElement.animate(box.keyframes, {
                    duration: box.durationMs,
                    delay:    (box.startT - win.origin) * 1000,
                    fill:     'both',
                    id:       'ftBox'
                });
            }
        }

        // Collect what I drive: only ft* animations, never e.g. the hotspot pulse
        var anims = layer.getAnimations({ subtree: true }).filter(function(anim) {
            var name = anim.animationName || anim.id || '';
            return name.indexOf('ft') === 0;
        });
        if (entry.boxAnim) {
            anims.push(entry.boxAnim);
        }
        anims.forEach(function(anim) { anim.pause(); });

        entry.anims = anims;
        entry.built = true;
        entry.dirty = false;

    }


    /* ------------------------------------------------------------------ */
    /*  Sync                                                              */
    /* ------------------------------------------------------------------ */

    function needsRebuild(entry) {
        if (!entry.built || entry.dirty) { return true; }
        for (var i = 0; i < entry.anims.length; i++) {
            if (entry.anims[i].playState === 'idle') { return true; }
        }
        return false;
    }

    function runHooks(entry, localMs) {
        if (!entry.hooks.length) { return; }
        var spanLocal = localMs - entry.win.leadInMs;
        entry.hooks.forEach(function(hook) {
            if (hook && typeof hook.update === 'function') {
                try { hook.update(spanLocal); } catch (e) { console.warn(e); }
            }
        });
    }

    function syncEntry(entry, state) {

        if (needsRebuild(entry)) {
            build(entry);
        }
        if (!entry.built) { return; }

        var local = (state.time - entry.win.origin) * 1000,
            now   = document.timeline ? document.timeline.currentTime : null;

        entry.anims.forEach(function(anim) {
            if (state.playing && now != null) {
                // Setting startTime (instead of currentTime + play()) never
                // auto-rewinds a finished or not-yet-started animation.
                anim.playbackRate = state.rate;
                anim.startTime = now - local / state.rate;
            } else {
                anim.pause();
                anim.currentTime = local;
            }
        });

        runHooks(entry, local);

    }

    /**
     * I sync every present overlay to the current video state. Called after
     * play, pause, seeks and rate changes.
     * @method syncAll
     */
    function syncAll() {
        var state = playbackState();
        entries.forEach(function(entry) {
            if (entry.present) { syncEntry(entry, state); }
        });
        ensureLoop();
    }

    /**
     * I correct drift between the native animations and the video while
     * playing. Called on the controller's high-priority tick.
     * @method checkSync
     */
    function checkSync() {
        var state = playbackState();
        if (!state.playing) { return; }
        var tolerance = driftTolerance();
        entries.forEach(function(entry) {
            if (!entry.present) { return; }
            if (!entry.clock || entry.clock.playState === 'idle') {
                syncEntry(entry, state);
                return;
            }
            var expected = (state.time - entry.win.origin) * 1000;
            if (Math.abs(entry.clock.currentTime - expected) > tolerance) {
                syncEntry(entry, state);
            }
        });
    }

    function tick() {
        rafID = null;
        var state = playbackState(),
            any = false;
        entries.forEach(function(entry) {
            if (entry.present && entry.hooks.length && entry.clock) {
                runHooks(entry, entry.clock.currentTime);
                any = true;
            }
        });
        if (any && state.playing) {
            rafID = window.requestAnimationFrame(tick);
        }
    }

    function ensureLoop() {
        if (rafID || !playbackState().playing) { return; }
        var any = entries.some(function(entry) { return entry.present && entry.hooks.length; });
        if (any) {
            rafID = window.requestAnimationFrame(tick);
        }
    }


    /* ------------------------------------------------------------------ */
    /*  Presence                                                          */
    /* ------------------------------------------------------------------ */

    function present(entry) {
        var el = entry.overlay.overlayElement;
        entry.present = true;
        el.classList.add('present');
        el.style.opacity = '1';
        syncEntry(entry, playbackState());
        ensureLoop();
    }

    function absent(entry) {
        var el = entry.overlay.overlayElement;
        entry.present = false;
        el.classList.remove('present');
        if (!el.classList.contains('active')) {
            el.style.opacity = '';
        }
        entry.anims.forEach(function(anim) {
            try { anim.pause(); } catch (e) {}
        });
    }

    /**
     * I arm or disarm an overlay depending on whether time t lies inside its
     * animation window (lead-in … trail-out). Called by the OverlaysController
     * for every overlay on each state update, before activation.
     * @method updatePresence
     * @param {Overlay} overlay
     * @param {Number} t
     */
    function updatePresence(overlay, t) {

        var entry = getEntry(overlay);
        if (!entry) { return; }

        if (!entry.engine) {
            if (entry.present) { absent(entry); }
            return;
        }

        var win = entry.win || computeWin(entry),
            inWindow = (t >= win.windowStart - LOOKAHEAD) && (t <= win.windowEnd);

        if (inWindow && !entry.present) {
            present(entry);
        } else if (!inWindow && entry.present) {
            absent(entry);
        }

        if (entry.ghost && !entry.present) {
            syncGhost(entry, t);
        }

    }

    /**
     * I tell whether an overlay is armed (inside its animation window).
     * @method isPresent
     * @param {Overlay} overlay
     * @return {Boolean}
     */
    function isPresent(overlay) {
        var entry = getEntry(overlay);
        return !!(entry && entry.present);
    }


    /* ------------------------------------------------------------------ */
    /*  Ghost (selected in the editor, playhead outside the window)       */
    /* ------------------------------------------------------------------ */

    /**
     * A ghost shows the overlay's settled look (entered, text revealed, content
     * animations finished, before the exit) with its box at the nearest span
     * edge, which is where the editor writes box changes (Overlay.editTime).
     */
    function syncGhost(entry, t) {

        if (needsRebuild(entry)) {
            build(entry);
        }
        if (!entry.built) { return; }

        var data    = entry.overlay.data,
            origin  = entry.win.origin,
            settled = Math.max(0, (data.end - origin) * 1000 - 1),
            boxAt   = (Math.max(data.start, Math.min(data.end, t)) - origin) * 1000;

        entry.anims.forEach(function(anim) {
            anim.pause();
            anim.currentTime = (anim === entry.boxAnim) ? boxAt : settled;
        });

        runHooks(entry, settled);

    }

    /**
     * I switch an overlay's ghost look on or off (see Overlay.setGhost).
     * @method setGhost
     * @param {Overlay} overlay
     * @param {Boolean} ghost
     */
    function setGhost(overlay, ghost) {

        var entry = getEntry(overlay);
        if (!entry) { return; }

        entry.ghost = !!ghost;
        if (!entry.engine || entry.present) { return; }

        if (entry.ghost) {
            var HC = FrameTrail.module('HypervideoController');
            syncGhost(entry, HC ? HC.currentTime : overlay.data.start);
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I start tracking an overlay. Called at the end of Overlay.renderInDOM().
     * @method attach
     * @param {Overlay} overlay
     */
    function attach(overlay) {
        if (getEntry(overlay)) { return; }
        var entry = {
            overlay:       overlay,
            engine:        needsEngine(overlay),
            built:         false,
            dirty:         true,
            present:       false,
            spec:          null,
            win:           null,
            anims:         [],
            hooks:         [],
            strokeTargets: [],
            textRoot:      null,
            clock:         null,
            boxAnim:       null,
            boxSuspended:  false,
            ghost:         false
        };
        overlay._animatorEntry = entry;
        entries.push(entry);
    }

    /**
     * I stop tracking an overlay and remove every trace of my animations.
     * @method detach
     * @param {Overlay} overlay
     */
    function detach(overlay) {
        var entry = getEntry(overlay);
        if (!entry) { return; }
        teardown(entry);
        if (entry.present) { absent(entry); }
        entries.splice(entries.indexOf(entry), 1);
        delete overlay._animatorEntry;
    }

    /**
     * I mark an overlay's animations as outdated (its animation spec, timing,
     * content or keyframes changed). A present overlay is rebuilt and resynced
     * immediately, others when they are armed next.
     * @method invalidate
     * @param {Overlay} overlay
     */
    function invalidate(overlay) {

        var entry = getEntry(overlay);
        if (!entry) { return; }

        var wasEngine = entry.engine;
        entry.engine = needsEngine(overlay);
        entry.dirty  = true;
        entry.win    = null;

        if (!entry.engine) {
            teardown(entry);
            if (entry.present) { absent(entry); }
            if (wasEngine) {
                // Back to the plain path: reflect the activation state
                var el = overlay.overlayElement;
                el.style.opacity = el.classList.contains('active') ? '1' : '';
            }
            return;
        }

        var HC = FrameTrail.module('HypervideoController');
        if (HC) {
            updatePresence(overlay, HC.currentTime);
        }
        if (entry.present) {
            syncEntry(entry, playbackState());
            ensureLoop();
        }

    }

    function invalidateAll() {
        entries.slice().forEach(function(entry) {
            invalidate(entry.overlay);
        });
    }

    /**
     * While the user drags or resizes an overlay with box motion, the box
     * animation must not override the inline position interact.js writes.
     * @method suspendBox
     * @param {Overlay} overlay
     * @param {Boolean} suspended
     */
    function suspendBox(overlay, suspended) {
        var entry = getEntry(overlay);
        if (!entry) { return; }
        entry.boxSuspended = suspended;
        if (suspended) {
            if (entry.boxAnim) {
                try { entry.boxAnim.cancel(); } catch (e) {}
                entry.anims = entry.anims.filter(function(anim) { return anim !== entry.boxAnim; });
                entry.boxAnim = null;
            }
        } else {
            invalidate(overlay);
        }
    }

    /**
     * I return the animation window of an overlay (absolute seconds), or null
     * when it has no transitions. Used for timeline tails and the preview.
     * @method getWindow
     * @param {Overlay} overlay
     * @return {Object|null}
     */
    function getWindow(overlay) {
        var spec = Lib.normalizeAnimation(overlay.data.attributes);
        if (!spec['in'] && !spec.out) {
            return null;
        }
        return Lib.computeWindow(spec, overlay.data.start, overlay.data.end, offsetIn());
    }

    /**
     * I stop everything (hypervideo switch / teardown of the controller).
     * @method stop
     */
    function stop() {
        if (rafID) {
            window.cancelAnimationFrame(rafID);
            rafID = null;
        }
        entries.slice().forEach(function(entry) {
            teardown(entry);
            delete entry.overlay._animatorEntry;
        });
        entries = [];
        if (reducedMotionQuery && reducedMotionQuery.removeEventListener) {
            reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
        }
    }


    return {

        attach:          attach,
        detach:          detach,
        invalidate:      invalidate,
        invalidateAll:   invalidateAll,
        updatePresence:  updatePresence,
        isPresent:       isPresent,
        setGhost:        setGhost,
        syncAll:         syncAll,
        checkSync:       checkSync,
        suspendBox:      suspendBox,
        getWindow:       getWindow,
        needsEngine:     needsEngine,
        isReducedMotion: isReducedMotion,
        stop:            stop

    };

});
