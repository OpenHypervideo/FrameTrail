/**
 * @module Shared
 */


/**
 * I am the AnimationLibrary. I hold everything about overlay animation that is
 * pure data or pure math, and touch no player state:
 *
 * * the ease registry (CSS timing functions plus a matching JS evaluator)
 * * the preset registry (entrance, emphasis, exit and text presets, each naming
 *   a CSS @keyframes rule from my presets.css)
 * * the timing window of an overlay (lead-in before start, trail-out after end)
 * * keyframe math for box motion (normalise, sample, union box)
 * * splitting rendered text into words or letters for text reveals
 *
 * The OverlayAnimator (player) drives the animations; I only describe them.
 * I live under _shared because the Database serialises box-motion keyframes,
 * and the Database also runs in the standalone resource manager.
 *
 * The spring and wiggle eases are ported from HyperFrames
 * (https://github.com/heygen-com/hyperframes, packages/core/src/parsers/springEase.ts
 * and packages/core/src/runtime/wiggleEase.ts), Copyright 2026 HeyGen, Inc.,
 * licensed under the Apache License, Version 2.0, modified for FrameTrail.
 * See THIRD-PARTY-NOTICES.md.
 *
 * @class AnimationLibrary
 * @static
 */

FrameTrail.defineModule('AnimationLibrary', function(FrameTrail){


    /* ------------------------------------------------------------------ */
    /*  Eases                                                             */
    /* ------------------------------------------------------------------ */

    // Cubic-bezier evaluator: solve x(t) = p by Newton, fall back to bisection.
    function bezierFn(x1, y1, x2, y2) {

        function coord(t, a1, a2) {
            var u = 1 - t;
            return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t;
        }

        function slope(t, a1, a2) {
            var u = 1 - t;
            return 3 * u * u * a1 + 6 * u * t * (a2 - a1) + 3 * t * t * (1 - a2);
        }

        return function(p) {
            if (p <= 0) { return 0; }
            if (p >= 1) { return 1; }
            var t = p, i, x, d;
            for (i = 0; i < 8; i++) {
                x = coord(t, x1, x2) - p;
                if (Math.abs(x) < 1e-6) { return coord(t, y1, y2); }
                d = slope(t, x1, x2);
                if (Math.abs(d) < 1e-6) { break; }
                t -= x / d;
            }
            var lo = 0, hi = 1;
            t = p;
            for (i = 0; i < 30; i++) {
                x = coord(t, x1, x2);
                if (Math.abs(x - p) < 1e-6) { break; }
                if (x < p) { lo = t; } else { hi = t; }
                t = (lo + hi) / 2;
            }
            return coord(t, y1, y2);
        };

    }

    // Endpoint-normalised damped cosine (HyperFrames evaluateSpringEase).
    function springFn(bounce) {
        var b = Math.max(0, Math.min(1, bounce)),
            decay = 12 - b * 6,
            omega = Math.PI * 2 * (1 + b * 1.5),
            endpoint = 1 - Math.exp(-decay) * Math.cos(omega);
        return function(p) {
            if (p <= 0) { return 0; }
            if (p >= 1) { return 1; }
            return (1 - Math.exp(-decay * p) * Math.cos(omega * p)) / endpoint;
        };
    }

    // Wiggle around the linear path (HyperFrames evaluateWiggleEase).
    function wiggleFn(wiggles, type, amplitude) {
        var peak = (amplitude != null) ? amplitude
                 : (type === 'easeInOut' ? 0.08 : type === 'uniform' ? 0.14 : type === 'anticipate' ? 0.12 : 0.16),
            direction = (type === 'anticipate') ? -1 : 1;
        return function(p) {
            if (p <= 0) { return 0; }
            if (p >= 1) { return 1; }
            var envelope = (type === 'easeInOut') ? peak * Math.sin(Math.PI * p)
                         : (type === 'uniform')   ? peak
                         : peak * (1 - p);
            return p + direction * envelope * Math.sin(Math.PI * 2 * wiggles * p);
        };
    }

    // Sample a JS ease into a CSS linear() timing function.
    function linearCss(fn, points) {
        var stops = [];
        for (var i = 0; i <= points; i++) {
            stops.push((Math.round(fn(i / points) * 10000) / 10000).toString());
        }
        return 'linear(' + stops.join(', ') + ')';
    }

    var supportsLinear = (function() {
        try {
            return !!(window.CSS && window.CSS.supports && window.CSS.supports('animation-timing-function', 'linear(0, 1)'));
        } catch (e) {
            return false;
        }
    })();

    /**
     * Ease groups in display order. Each ease has an id, a group, a label key
     * and either a cubic-bezier, a CSS keyword, or a sampled JS function.
     */
    var EASE_DEFINITIONS = [
        { id: 'linear',          group: 'Basic',  labelKey: 'EaseLinear',   css: 'linear' },
        { id: 'hold',            group: 'Basic',  labelKey: 'EaseHold',     css: 'steps(1, jump-end)', fn: function(p) { return p < 1 ? 0 : 1; } },
        { id: 'ease',            group: 'Basic',  labelKey: 'EaseStandard', bezier: [0.25, 0.1, 0.25, 1] },
        { id: 'easeIn',          group: 'Basic',  labelKey: 'EaseIn',       bezier: [0.42, 0, 1, 1] },
        { id: 'easeOut',         group: 'Basic',  labelKey: 'EaseOut',      bezier: [0, 0, 0.58, 1] },
        { id: 'easeInOut',       group: 'Basic',  labelKey: 'EaseInOut',    bezier: [0.42, 0, 0.58, 1] },
        { id: 'gentleOut',       group: 'Basic',  labelKey: 'EaseGentle',   bezier: [0.2, 0.7, 0.2, 1] },

        { id: 'power1In',        group: 'Power1', labelKey: 'EaseIn',       bezier: [0.11, 0, 0.5, 0] },
        { id: 'power1Out',       group: 'Power1', labelKey: 'EaseOut',      bezier: [0.5, 1, 0.89, 1] },
        { id: 'power1InOut',     group: 'Power1', labelKey: 'EaseInOut',    bezier: [0.45, 0, 0.55, 1] },
        { id: 'power2In',        group: 'Power2', labelKey: 'EaseIn',       bezier: [0.32, 0, 0.67, 0] },
        { id: 'power2Out',       group: 'Power2', labelKey: 'EaseOut',      bezier: [0.33, 1, 0.68, 1] },
        { id: 'power2InOut',     group: 'Power2', labelKey: 'EaseInOut',    bezier: [0.65, 0, 0.35, 1] },
        { id: 'power3In',        group: 'Power3', labelKey: 'EaseIn',       bezier: [0.5, 0, 0.75, 0] },
        { id: 'power3Out',       group: 'Power3', labelKey: 'EaseOut',      bezier: [0.25, 1, 0.5, 1] },
        { id: 'power3InOut',     group: 'Power3', labelKey: 'EaseInOut',    bezier: [0.76, 0, 0.24, 1] },
        { id: 'power4In',        group: 'Power4', labelKey: 'EaseIn',       bezier: [0.64, 0, 0.78, 0] },
        { id: 'power4Out',       group: 'Power4', labelKey: 'EaseOut',      bezier: [0.22, 1, 0.36, 1] },
        { id: 'power4InOut',     group: 'Power4', labelKey: 'EaseInOut',    bezier: [0.83, 0, 0.17, 1] },
        { id: 'sineIn',          group: 'Sine',   labelKey: 'EaseIn',       bezier: [0.12, 0, 0.39, 0] },
        { id: 'sineOut',         group: 'Sine',   labelKey: 'EaseOut',      bezier: [0.61, 1, 0.88, 1] },
        { id: 'sineInOut',       group: 'Sine',   labelKey: 'EaseInOut',    bezier: [0.37, 0, 0.63, 1] },
        { id: 'expoIn',          group: 'Expo',   labelKey: 'EaseIn',       bezier: [0.7, 0, 0.84, 0] },
        { id: 'expoOut',         group: 'Expo',   labelKey: 'EaseOut',      bezier: [0.16, 1, 0.3, 1] },
        { id: 'expoInOut',       group: 'Expo',   labelKey: 'EaseInOut',    bezier: [0.87, 0, 0.13, 1] },
        { id: 'circIn',          group: 'Circ',   labelKey: 'EaseIn',       bezier: [0.55, 0, 1, 0.45] },
        { id: 'circOut',         group: 'Circ',   labelKey: 'EaseOut',      bezier: [0, 0.55, 0.45, 1] },
        { id: 'circInOut',       group: 'Circ',   labelKey: 'EaseInOut',    bezier: [0.85, 0, 0.15, 1] },
        { id: 'backIn',          group: 'Back',   labelKey: 'EaseIn',       bezier: [0.36, 0, 0.66, -0.56] },
        { id: 'backOut',         group: 'Back',   labelKey: 'EaseOut',      bezier: [0.34, 1.56, 0.64, 1] },
        { id: 'backInOut',       group: 'Back',   labelKey: 'EaseInOut',    bezier: [0.68, -0.6, 0.32, 1.6] },

        { id: 'springGentle',    group: 'Spring', labelKey: 'EaseSpringGentle', fn: springFn(0.15), fallback: 'backOut' },
        { id: 'springQuick',     group: 'Spring', labelKey: 'EaseSpringQuick',  fn: springFn(0.4),  fallback: 'backOut' },
        { id: 'springBouncy',    group: 'Spring', labelKey: 'EaseSpringBouncy', fn: springFn(0.6),  fallback: 'backOut' },
        { id: 'springSlow',      group: 'Spring', labelKey: 'EaseSpringSlow',   fn: springFn(0.25), fallback: 'backOut' },
        { id: 'wiggle',          group: 'Wiggle', labelKey: 'EaseWiggleSubtle', fn: wiggleFn(3, 'easeInOut', 0.12), fallback: 'easeInOut' },
        { id: 'wiggleBounce',    group: 'Wiggle', labelKey: 'EaseWiggleBouncy', fn: wiggleFn(4, 'easeOut', 0.22),   fallback: 'easeInOut' }
    ];

    var EASE_GROUP_LABELS = {
        'Basic':  'EaseGroupBasic',
        'Power1': 'EaseGroupPower1',
        'Power2': 'EaseGroupPower2',
        'Power3': 'EaseGroupPower3',
        'Power4': 'EaseGroupPower4',
        'Sine':   'EaseGroupSine',
        'Expo':   'EaseGroupExpo',
        'Circ':   'EaseGroupCirc',
        'Back':   'EaseGroupBack',
        'Spring': 'EaseGroupSpring',
        'Wiggle': 'EaseGroupWiggle'
    };

    var EASES = {};

    EASE_DEFINITIONS.forEach(function(def) {
        var ease = {
            id:       def.id,
            group:    def.group,
            labelKey: def.labelKey
        };
        if (def.bezier) {
            ease.css = 'cubic-bezier(' + def.bezier.join(', ') + ')';
            ease.fn  = bezierFn(def.bezier[0], def.bezier[1], def.bezier[2], def.bezier[3]);
        } else if (def.css) {
            ease.css = def.css;
            ease.fn  = def.fn || function(p) { return Math.max(0, Math.min(1, p)); };
        } else {
            ease.fn       = def.fn;
            ease.fallback = def.fallback;
        }
        EASES[def.id] = ease;
    });

    // Resolve the sampled eases once the bezier eases (their fallbacks) exist.
    EASE_DEFINITIONS.forEach(function(def) {
        var ease = EASES[def.id];
        if (!ease.css) {
            ease.css = supportsLinear ? linearCss(ease.fn, 48) : EASES[ease.fallback].css;
        }
    });

    /**
     * I return the CSS timing function for an ease id (unknown ids are linear).
     * @method easeCss
     * @param {String} id
     * @return {String}
     */
    function easeCss(id) {
        return (EASES[id] || EASES.linear).css;
    }

    /**
     * I return a JS evaluator (progress 0..1 → eased progress) for an ease id.
     * @method easeFn
     * @param {String} id
     * @return {Function}
     */
    function easeFn(id) {
        return (EASES[id] || EASES.linear).fn;
    }


    /* ------------------------------------------------------------------ */
    /*  Presets                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * Every preset names a CSS @keyframes rule from presets.css. All keyframe
     * names start with "ft": the OverlayAnimator only drives animations whose
     * name starts with "ft", so unrelated CSS animations (e.g. the hotspot
     * pulse ring) keep running on their own clock.
     *
     * target:    'layer'  → the overlay's animation layer
     *            'stroke' → the stroke elements a type returns from getStrokeTargets()
     * appliesTo: optional list of overlay types the preset is offered for
     * uses:      optional parameters the preset reads ('distance', 'color')
     */
    var PRESET_DEFINITIONS = {

        'in': [
            { id: 'fadeIn',          labelKey: 'AnimationFade',           keyframes: 'ftInFade',            duration: 400, ease: 'easeOut' },
            { id: 'slideFromLeft',   labelKey: 'AnimationSlideLeft',      keyframes: 'ftInSlideFromLeft',   duration: 450, ease: 'power2Out', uses: ['distance'] },
            { id: 'slideFromRight',  labelKey: 'AnimationSlideRight',     keyframes: 'ftInSlideFromRight',  duration: 450, ease: 'power2Out', uses: ['distance'] },
            { id: 'slideFromTop',    labelKey: 'AnimationSlideDown',      keyframes: 'ftInSlideFromTop',    duration: 450, ease: 'power2Out', uses: ['distance'] },
            { id: 'slideFromBottom', labelKey: 'AnimationSlideUp',        keyframes: 'ftInSlideFromBottom', duration: 450, ease: 'power2Out', uses: ['distance'] },
            { id: 'zoomIn',          labelKey: 'AnimationZoom',           keyframes: 'ftInZoom',            duration: 400, ease: 'power2Out' },
            { id: 'popIn',           labelKey: 'AnimationPop',            keyframes: 'ftInPop',             duration: 550, ease: 'springBouncy' },
            { id: 'blurIn',          labelKey: 'AnimationBlur',           keyframes: 'ftInBlur',            duration: 500, ease: 'power2Out' },
            { id: 'wipeFromLeft',    labelKey: 'AnimationWipeFromLeft',   keyframes: 'ftInWipeFromLeft',    duration: 600, ease: 'power3InOut' },
            { id: 'wipeFromRight',   labelKey: 'AnimationWipeFromRight',  keyframes: 'ftInWipeFromRight',   duration: 600, ease: 'power3InOut' },
            { id: 'wipeFromTop',     labelKey: 'AnimationWipeFromTop',    keyframes: 'ftInWipeFromTop',     duration: 600, ease: 'power3InOut' },
            { id: 'wipeFromBottom',  labelKey: 'AnimationWipeFromBottom', keyframes: 'ftInWipeFromBottom',  duration: 600, ease: 'power3InOut' },
            { id: 'irisIn',          labelKey: 'AnimationIris',           keyframes: 'ftInIris',            duration: 600, ease: 'power2InOut' },
            { id: 'dropIn',          labelKey: 'AnimationDrop',           keyframes: 'ftInDrop',            duration: 650, ease: 'backOut',   uses: ['distance'] },
            { id: 'rotateIn',        labelKey: 'AnimationRotate',         keyframes: 'ftInRotate',          duration: 500, ease: 'power2Out' },
            { id: 'draw',            labelKey: 'AnimationDraw',           keyframes: 'ftInDraw',            duration: 800, ease: 'power2InOut', target: 'stroke', appliesTo: ['hotspot'] }
        ],

        'emphasis': [
            { id: 'pulse',           labelKey: 'AnimationPulse',          keyframes: 'ftLoopPulse',         duration: 1200, ease: 'easeInOut' },
            { id: 'breathe',         labelKey: 'AnimationBreathe',        keyframes: 'ftLoopBreathe',       duration: 3000, ease: 'easeInOut' },
            { id: 'wobble',          labelKey: 'AnimationWobble',         keyframes: 'ftLoopWobble',        duration: 900,  ease: 'easeInOut' },
            { id: 'shake',           labelKey: 'AnimationShake',          keyframes: 'ftLoopShake',         duration: 600,  ease: 'linear',    uses: ['distance'] },
            { id: 'bounce',          labelKey: 'AnimationBounce',         keyframes: 'ftLoopBounce',        duration: 1000, ease: 'easeOut',   uses: ['distance'] },
            { id: 'float',           labelKey: 'AnimationFloat',          keyframes: 'ftLoopFloat',         duration: 3000, ease: 'easeInOut', uses: ['distance'] },
            { id: 'heartbeat',       labelKey: 'AnimationHeartbeat',      keyframes: 'ftLoopHeartbeat',     duration: 1300, ease: 'easeInOut' },
            { id: 'flash',           labelKey: 'AnimationFlash',          keyframes: 'ftLoopFlash',         duration: 1000, ease: 'easeInOut' },
            { id: 'glow',            labelKey: 'AnimationGlow',           keyframes: 'ftLoopGlow',          duration: 1600, ease: 'easeInOut', uses: ['distance', 'color'] }
        ],

        'out': [
            { id: 'fadeOut',         labelKey: 'AnimationFade',           keyframes: 'ftOutFade',           duration: 300, ease: 'easeIn' },
            { id: 'slideToLeft',     labelKey: 'AnimationSlideLeftOut',   keyframes: 'ftOutSlideToLeft',    duration: 350, ease: 'power2In', uses: ['distance'] },
            { id: 'slideToRight',    labelKey: 'AnimationSlideRightOut',  keyframes: 'ftOutSlideToRight',   duration: 350, ease: 'power2In', uses: ['distance'] },
            { id: 'slideToTop',      labelKey: 'AnimationSlideUpOut',     keyframes: 'ftOutSlideToTop',     duration: 350, ease: 'power2In', uses: ['distance'] },
            { id: 'slideToBottom',   labelKey: 'AnimationSlideDownOut',   keyframes: 'ftOutSlideToBottom',  duration: 350, ease: 'power2In', uses: ['distance'] },
            { id: 'zoomOut',         labelKey: 'AnimationZoom',           keyframes: 'ftOutZoom',           duration: 300, ease: 'power2In' },
            { id: 'popOut',          labelKey: 'AnimationPop',            keyframes: 'ftOutPop',            duration: 350, ease: 'backIn' },
            { id: 'blurOut',         labelKey: 'AnimationBlur',           keyframes: 'ftOutBlur',           duration: 400, ease: 'power2In' },
            { id: 'wipeToLeft',      labelKey: 'AnimationWipeToLeft',     keyframes: 'ftOutWipeToLeft',     duration: 500, ease: 'power3InOut' },
            { id: 'wipeToRight',     labelKey: 'AnimationWipeToRight',    keyframes: 'ftOutWipeToRight',    duration: 500, ease: 'power3InOut' },
            { id: 'wipeToTop',       labelKey: 'AnimationWipeToTop',      keyframes: 'ftOutWipeToTop',      duration: 500, ease: 'power3InOut' },
            { id: 'wipeToBottom',    labelKey: 'AnimationWipeToBottom',   keyframes: 'ftOutWipeToBottom',   duration: 500, ease: 'power3InOut' },
            { id: 'irisOut',         labelKey: 'AnimationIris',           keyframes: 'ftOutIris',           duration: 500, ease: 'power2InOut' },
            { id: 'dropOut',         labelKey: 'AnimationDrop',           keyframes: 'ftOutDrop',           duration: 450, ease: 'backIn',   uses: ['distance'] },
            { id: 'rotateOut',       labelKey: 'AnimationRotate',         keyframes: 'ftOutRotate',         duration: 400, ease: 'power2In' },
            { id: 'undraw',          labelKey: 'AnimationErase',          keyframes: 'ftOutDraw',           duration: 500, ease: 'power2InOut', target: 'stroke', appliesTo: ['hotspot'] }
        ],

        'text': [
            { id: 'fadeUp',          labelKey: 'AnimationTextRise',       keyframes: 'ftTextFadeUp',        duration: 450, ease: 'gentleOut', stagger: 80 },
            { id: 'fade',            labelKey: 'AnimationFade',           keyframes: 'ftTextFade',          duration: 400, ease: 'easeOut',   stagger: 60 },
            { id: 'pop',             labelKey: 'AnimationPop',            keyframes: 'ftTextPop',           duration: 450, ease: 'springQuick', stagger: 60 },
            { id: 'blurIn',          labelKey: 'AnimationBlur',           keyframes: 'ftTextBlur',          duration: 500, ease: 'power2Out', stagger: 70 },
            { id: 'slideIn',         labelKey: 'AnimationTextSlide',      keyframes: 'ftTextSlide',         duration: 450, ease: 'power2Out', stagger: 70 },
            { id: 'typewriter',      labelKey: 'AnimationTypewriter',     keyframes: 'ftTextType',          duration: 10,  ease: 'hold',      stagger: 40, mode: 'letter' },
            { id: 'marker',          labelKey: 'AnimationMarker',         keyframes: 'ftTextMarker',        duration: 380, ease: 'power1Out', stagger: 120, inline: true, uses: ['color'] }
        ]

    };

    var PRESETS = {};

    Object.keys(PRESET_DEFINITIONS).forEach(function(phase) {
        PRESET_DEFINITIONS[phase].forEach(function(def) {
            def.phase  = phase;
            def.target = def.target || ((phase === 'text') ? 'text' : 'layer');
            PRESETS[phase + ':' + def.id] = def;
        });
    });

    /**
     * I return a preset definition, or null.
     * @method getPreset
     * @param {String} phase  'in' | 'emphasis' | 'out' | 'text'
     * @param {String} id
     * @return {Object|null}
     */
    function getPreset(phase, id) {
        return PRESETS[phase + ':' + id] || null;
    }

    /**
     * I list the presets of a phase that apply to an overlay type.
     * @method listPresets
     * @param {String} phase
     * @param {String} overlayType
     * @return {Array}
     */
    function listPresets(phase, overlayType) {
        return (PRESET_DEFINITIONS[phase] || []).filter(function(def) {
            return !def.appliesTo || def.appliesTo.indexOf(overlayType) >= 0;
        });
    }


    /* ------------------------------------------------------------------ */
    /*  Animation spec (attributes.animation) and legacy migration        */
    /* ------------------------------------------------------------------ */

    var LEGACY_IN = {
        'fade':       'fadeIn',
        'slideLeft':  'slideFromLeft',
        'slideRight': 'slideFromRight',
        'slideUp':    'slideFromBottom',
        'slideDown':  'slideFromTop',
        'zoom':       'zoomIn'
    };

    var LEGACY_OUT = {
        'fade':       'fadeOut',
        'slideLeft':  'slideToLeft',
        'slideRight': 'slideToRight',
        'slideUp':    'slideToTop',
        'slideDown':  'slideToBottom',
        'zoom':       'zoomOut'
    };

    function num(value, fallback) {
        var n = parseFloat(value);
        return isFinite(n) ? n : fallback;
    }

    function normalizePhase(phase, raw) {
        if (!raw || !raw.preset) { return null; }
        var preset = getPreset(phase, raw.preset);
        if (!preset) { return null; }
        var spec = {
            preset:   preset.id,
            duration: Math.max(0, num(raw.duration, preset.duration)),
            ease:     EASES[raw.ease] ? raw.ease : preset.ease,
            params:   (raw.params && typeof raw.params === 'object') ? raw.params : {}
        };
        if (phase === 'emphasis') {
            spec.iterations = Math.max(0, Math.round(num(raw.iterations, 0)));
        }
        if (phase === 'text') {
            spec.mode    = (raw.mode === 'letter' || raw.mode === 'word') ? raw.mode : (preset.mode || 'word');
            spec.stagger = Math.max(0, num(raw.stagger, preset.stagger || 80));
        }
        return spec;
    }

    /**
     * I return the normalised animation spec of an overlay:
     * { in, emphasis, out, text } — each null or a phase spec.
     *
     * attributes.animation wins. Without it, the legacy fields
     * animationIn / animationOut / animationDuration are mapped (read forever,
     * never written by the new editor). Loading never mutates the data.
     *
     * @method normalizeAnimation
     * @param {Object} attributes
     * @return {Object}
     */
    function normalizeAnimation(attributes) {

        var attrs = attributes || {},
            raw   = attrs.animation;

        if (!raw || typeof raw !== 'object') {
            var legacyDuration = (attrs.animationDuration != null) ? num(attrs.animationDuration, 300) : 300;
            raw = {};
            if (attrs.animationIn && LEGACY_IN[attrs.animationIn]) {
                raw['in'] = { preset: LEGACY_IN[attrs.animationIn], duration: legacyDuration, ease: 'easeOut' };
            }
            if (attrs.animationOut && LEGACY_OUT[attrs.animationOut]) {
                raw['out'] = { preset: LEGACY_OUT[attrs.animationOut], duration: legacyDuration, ease: 'easeIn' };
            }
        }

        return {
            'in':       normalizePhase('in', raw['in']),
            'emphasis': normalizePhase('emphasis', raw.emphasis),
            'out':      normalizePhase('out', raw.out),
            'text':     normalizePhase('text', raw.text)
        };

    }

    /**
     * I return true when a spec contains any animation.
     * @method hasAnimation
     * @param {Object} spec
     * @return {Boolean}
     */
    function hasAnimation(spec) {
        return !!(spec && (spec['in'] || spec.emphasis || spec.out || spec.text));
    }

    /**
     * I reduce a spec for prefers-reduced-motion: entrances and exits become
     * short opacity fades, emphasis and text reveals are dropped.
     * @method reducedSpec
     * @param {Object} spec
     * @return {Object}
     */
    function reducedSpec(spec) {
        var fade = function(phase, s) {
            if (!s) { return null; }
            return {
                preset:   (phase === 'in') ? 'fadeIn' : 'fadeOut',
                duration: Math.min(250, s.duration),
                ease:     'linear',
                params:   {}
            };
        };
        return {
            'in':       fade('in', spec['in']),
            'emphasis': null,
            'out':      fade('out', spec.out),
            'text':     null
        };
    }


    /* ------------------------------------------------------------------ */
    /*  Timing window                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * I compute the timing window of an overlay. Transitions frame the span:
     * the entrance leads into start, the exit trails after end, so the overlay
     * is fully present for exactly [start, end].
     *
     * The lead-in is clipped at the start of the video (offsetIn): an overlay
     * starting at 0:00 appears without a lead-in (a clipped lead-in shorter
     * than 40 ms is dropped).
     *
     * All times returned are absolute seconds, durations milliseconds.
     *
     * @method computeWindow
     * @param {Object} spec      normalised animation spec
     * @param {Number} start
     * @param {Number} end
     * @param {Number} offsetIn
     * @return {Object} { leadInMs, trailOutMs, spanMs, origin, windowStart, windowEnd }
     */
    function computeWindow(spec, start, end, offsetIn) {

        var inMs      = (spec && spec['in'])  ? spec['in'].duration  : 0,
            outMs     = (spec && spec.out)    ? spec.out.duration    : 0,
            available = Math.max(0, (start - (offsetIn || 0)) * 1000),
            leadInMs  = Math.min(inMs, available);

        if (leadInMs < 40) { leadInMs = 0; }

        var origin = start - leadInMs / 1000;

        return {
            leadInMs:    leadInMs,
            trailOutMs:  outMs,
            spanMs:      Math.max(0, (end - start) * 1000),
            origin:      origin,
            windowStart: origin,
            windowEnd:   end + outMs / 1000
        };

    }

    /**
     * I return the CSS `animation` shorthand entry for one animation.
     * @method animationEntry
     * @param {String} name
     * @param {Number} durationMs
     * @param {String} easeId
     * @param {Number} delayMs
     * @param {Number|String} iterations
     * @param {String} fill
     * @return {String}
     */
    function animationEntry(name, durationMs, easeId, delayMs, iterations, fill) {
        return name + ' '
             + Math.max(1, Math.round(durationMs)) + 'ms '
             + easeCss(easeId) + ' '
             + Math.round(delayMs) + 'ms '
             + (iterations != null ? iterations : 1) + ' normal '
             + (fill || 'both');
    }


    /* ------------------------------------------------------------------ */
    /*  Box motion keyframes                                              */
    /* ------------------------------------------------------------------ */

    /**
     * I validate, sort and de-duplicate raw keyframes. I return undefined when
     * nothing valid is left, so the caller can drop the key.
     *
     * Keyframe shape: { t: absolute seconds, xywh: [left, top, width, height] in
     * percent of the video frame, ease?: id of the segment to the next keyframe }
     *
     * @method normalizeKeyframes
     * @param {Array} raw
     * @return {Array|undefined}
     */
    function normalizeKeyframes(raw) {

        if (!Array.isArray(raw)) { return undefined; }

        var valid = [];

        raw.forEach(function(kf) {
            if (!kf || typeof kf !== 'object' || !Array.isArray(kf.xywh) || kf.xywh.length !== 4) { return; }
            var t = parseFloat(kf.t),
                xywh = kf.xywh.map(function(v) { return parseFloat(v); });
            if (!isFinite(t) || xywh.some(function(v) { return !isFinite(v); })) { return; }
            xywh[2] = Math.max(0, xywh[2]);
            xywh[3] = Math.max(0, xywh[3]);
            var clean = { t: t, xywh: xywh };
            if (kf.ease && kf.ease !== 'linear' && EASES[kf.ease]) {
                clean.ease = kf.ease;
            }
            valid.push(clean);
        });

        valid.sort(function(a, b) { return a.t - b.t; });

        var deduped = [];
        valid.forEach(function(kf) {
            if (deduped.length && Math.abs(deduped[deduped.length - 1].t - kf.t) < 0.0005) {
                deduped[deduped.length - 1] = kf;
            } else {
                deduped.push(kf);
            }
        });

        return deduped.length ? deduped : undefined;

    }

    /**
     * I sample the box of a keyframe track at time t (seconds). Before the
     * first keyframe the first box holds, after the last the last one.
     * @method sampleKeyframes
     * @param {Array} kfs
     * @param {Number} t
     * @return {Array} [left, top, width, height]
     */
    function sampleKeyframes(kfs, t) {

        if (!kfs || !kfs.length) { return null; }
        if (t <= kfs[0].t) { return kfs[0].xywh.slice(); }
        var last = kfs[kfs.length - 1];
        if (t >= last.t) { return last.xywh.slice(); }

        var lo = 0, hi = kfs.length - 1;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (kfs[mid].t <= t) { lo = mid; } else { hi = mid; }
        }

        var a = kfs[lo], b = kfs[hi],
            p = (t - a.t) / (b.t - a.t),
            e = easeFn(a.ease || 'linear')(p),
            out = [];

        for (var i = 0; i < 4; i++) {
            out.push(a.xywh[i] + (b.xywh[i] - a.xywh[i]) * e);
        }
        out[2] = Math.max(0, out[2]);
        out[3] = Math.max(0, out[3]);

        return out;

    }

    /**
     * I return the union bounding box of a track within [start, end], clamped
     * to the video frame (0..100). It is written as the plain xywh of the
     * overlay's FragmentSelector: the fallback for consumers that do not know
     * the frametrail:keyframes extension.
     * @method unionBox
     * @param {Array} kfs
     * @param {Number} start
     * @param {Number} end
     * @return {Object} { left, top, width, height }
     */
    function unionBox(kfs, start, end) {

        var samples = [sampleKeyframes(kfs, start), sampleKeyframes(kfs, end)];

        for (var i = 0; i < kfs.length; i++) {
            var kf = kfs[i], next = kfs[i + 1];
            if (kf.t > start && kf.t < end) { samples.push(kf.xywh); }
            if (next && next.t > start && kf.t < end) {
                for (var s = 1; s < 16; s++) {
                    var t = kf.t + (next.t - kf.t) * (s / 16);
                    if (t > start && t < end) { samples.push(sampleKeyframes(kfs, t)); }
                }
            }
        }

        var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        samples.forEach(function(b) {
            if (!b) { return; }
            x1 = Math.min(x1, b[0]);
            y1 = Math.min(y1, b[1]);
            x2 = Math.max(x2, b[0] + b[2]);
            y2 = Math.max(y2, b[1] + b[3]);
        });

        var clamp = function(v) { return Math.max(0, Math.min(100, v)); },
            round = function(v) { return Math.round(v * 10000) / 10000; };

        x1 = clamp(x1); y1 = clamp(y1); x2 = clamp(x2); y2 = clamp(y2);

        return {
            left:   round(x1),
            top:    round(y1),
            width:  round(Math.max(0, x2 - x1)),
            height: round(Math.max(0, y2 - y1))
        };

    }

    /**
     * I translate a keyframe track into Web Animations keyframes for the
     * overlay box (left/top/width/height in percent). The animation starts at
     * the first keyframe; fill 'both' holds the first and last box outside it.
     * @method boxAnimation
     * @param {Array} kfs
     * @return {Object|null} { keyframes, durationMs, startT }
     */
    function boxAnimation(kfs) {

        if (!kfs || kfs.length < 2) { return null; }

        var startT   = kfs[0].t,
            duration = kfs[kfs.length - 1].t - startT;

        if (duration <= 0) { return null; }

        var frames = kfs.map(function(kf, idx) {
            var frame = {
                offset: (kf.t - startT) / duration,
                left:   kf.xywh[0] + '%',
                top:    kf.xywh[1] + '%',
                width:  kf.xywh[2] + '%',
                height: kf.xywh[3] + '%'
            };
            if (idx < kfs.length - 1) {
                frame.easing = easeCss(kf.ease || 'linear');
            }
            return frame;
        });

        return { keyframes: frames, durationMs: duration * 1000, startT: startT };

    }


    /* ------------------------------------------------------------------ */
    /*  Text splitting                                                    */
    /* ------------------------------------------------------------------ */

    var SKIP_TAGS = { 'SCRIPT': 1, 'STYLE': 1, 'SVG': 1, 'TEXTAREA': 1, 'NOSCRIPT': 1 };

    function segments(text, granularity) {
        if (window.Intl && Intl.Segmenter) {
            try {
                var segmenter = new Intl.Segmenter(undefined, { granularity: granularity }),
                    result = [];
                var it = segmenter.segment(text)[Symbol.iterator](), step;
                while (!(step = it.next()).done) {
                    result.push({
                        text: step.value.segment,
                        word: (granularity === 'word') ? !/^\s+$/.test(step.value.segment) : true
                    });
                }
                return result;
            } catch (e) { /* fall through */ }
        }
        if (granularity === 'grapheme') {
            return Array.from(text).map(function(c) { return { text: c, word: true }; });
        }
        return text.split(/(\s+)/).filter(function(s) { return s.length; }).map(function(s) {
            return { text: s, word: !/^\s+$/.test(s) };
        });
    }

    /**
     * I split the text nodes of a rendered element into animation units.
     *
     * mode 'word':   every word becomes span.ftRevealUnit (inline-block)
     * mode 'letter': every word becomes span.ftRevealWord holding a visually
     *                hidden copy of the word for screen readers and one
     *                aria-hidden span.ftRevealUnit per grapheme
     * options.inline: units stay inline and keep their trailing whitespace
     *                (for background-based presets such as the marker)
     *
     * The stored HTML is never touched; unsplitText() restores the text nodes.
     *
     * @method splitText
     * @param {HTMLElement} root
     * @param {String} mode
     * @param {Object} options
     * @return {Array} units in reading order
     */
    function splitText(root, mode, options) {

        options = options || {};

        var textNodes = [],
            walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function(node) {
                    var p = node.parentNode;
                    while (p && p !== root) {
                        if (SKIP_TAGS[p.nodeName.toUpperCase()] || (p.hasAttribute && p.hasAttribute('data-ft-no-split'))) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        p = p.parentNode;
                    }
                    return node.nodeValue.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }),
            node;

        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        var units = [];

        textNodes.forEach(function(textNode) {

            var fragment = document.createDocumentFragment(),
                parts = segments(textNode.nodeValue, 'word'),
                lastUnit = null;

            parts.forEach(function(part) {

                if (!part.word) {
                    if (options.inline && lastUnit) {
                        lastUnit.appendChild(document.createTextNode(part.text));
                    } else {
                        fragment.appendChild(document.createTextNode(part.text));
                    }
                    return;
                }

                if (mode === 'letter') {
                    var word = document.createElement('span');
                    word.className = 'ftRevealWord';
                    var srOnly = document.createElement('span');
                    srOnly.className = 'ftSrOnly';
                    srOnly.textContent = part.text;
                    word.appendChild(srOnly);
                    segments(part.text, 'grapheme').forEach(function(g) {
                        var letter = document.createElement('span');
                        letter.className = 'ftRevealUnit';
                        letter.setAttribute('aria-hidden', 'true');
                        letter.textContent = g.text;
                        word.appendChild(letter);
                        units.push(letter);
                    });
                    fragment.appendChild(word);
                    lastUnit = null;
                } else {
                    var unit = document.createElement('span');
                    unit.className = 'ftRevealUnit' + (options.inline ? ' ftRevealInline' : '');
                    unit.textContent = part.text;
                    fragment.appendChild(unit);
                    units.push(unit);
                    lastUnit = unit;
                }

            });

            textNode.parentNode.replaceChild(fragment, textNode);

        });

        root.setAttribute('data-ft-split', mode);

        return units;

    }

    /**
     * I undo splitText(): every unit becomes plain text again.
     * @method unsplitText
     * @param {HTMLElement} root
     */
    function unsplitText(root) {

        if (!root || !root.hasAttribute('data-ft-split')) { return; }

        root.querySelectorAll('.ftRevealWord').forEach(function(word) {
            var sr = word.querySelector('.ftSrOnly');
            word.parentNode.replaceChild(document.createTextNode(sr ? sr.textContent : word.textContent), word);
        });

        root.querySelectorAll('.ftRevealUnit').forEach(function(unit) {
            unit.parentNode.replaceChild(document.createTextNode(unit.textContent), unit);
        });

        root.removeAttribute('data-ft-split');
        root.normalize();

    }


    /* ------------------------------------------------------------------ */

    return {

        EASE_DEFINITIONS:   EASE_DEFINITIONS,
        EASE_GROUP_LABELS:  EASE_GROUP_LABELS,

        easeCss:            easeCss,
        easeFn:             easeFn,
        hasEase:            function(id) { return !!EASES[id]; },

        getPreset:          getPreset,
        listPresets:        listPresets,

        normalizeAnimation: normalizeAnimation,
        hasAnimation:       hasAnimation,
        reducedSpec:        reducedSpec,
        computeWindow:      computeWindow,
        animationEntry:     animationEntry,

        normalizeKeyframes: normalizeKeyframes,
        sampleKeyframes:    sampleKeyframes,
        unionBox:           unionBox,
        boxAnimation:       boxAnimation,

        splitText:          splitText,
        unsplitText:        unsplitText

    };

});
