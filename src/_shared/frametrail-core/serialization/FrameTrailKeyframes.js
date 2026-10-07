/**
 * @module Shared
 */


/**
 * I am FrameTrailKeyframes: the pure math behind box motion. I know the eases
 * (as JavaScript evaluators) and how to normalise, sample and bound a track of
 * keyframes. I touch neither the DOM nor any FrameTrail instance, so I run in
 * the browser as a plain script (window.FrameTrailKeyframes) and in Node under
 * require(), for tools and tests.
 *
 * The AnimationLibrary module re-exports me and adds what only a browser
 * needs: the CSS timing functions of the eases and the Web Animations
 * keyframes of a track.
 *
 * Keyframe shape: { t: absolute seconds, xywh: [left, top, width, height] in
 * percent of the video frame, r?: rotation in degrees (missing = 0),
 * ease?: id of the segment to the next keyframe }
 *
 * The spring and wiggle eases are ported from HyperFrames
 * (https://github.com/heygen-com/hyperframes, packages/core/src/parsers/springEase.ts
 * and packages/core/src/runtime/wiggleEase.ts), Copyright 2026 HeyGen, Inc.,
 * licensed under the Apache License, Version 2.0, modified for FrameTrail.
 * See THIRD-PARTY-NOTICES.md.
 *
 * @class FrameTrailKeyframes
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailKeyframes = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {


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

    /**
     * Ease groups in display order. Each ease has an id, a group, a label key
     * and either a cubic-bezier, a CSS keyword, or a JS function (which the
     * AnimationLibrary samples into a CSS linear() timing function, or
     * replaces by its fallback where linear() is not supported).
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

    var EASE_FNS = {};

    EASE_DEFINITIONS.forEach(function(def) {
        EASE_FNS[def.id] = def.bezier
            ? bezierFn(def.bezier[0], def.bezier[1], def.bezier[2], def.bezier[3])
            : (def.fn || function(p) { return Math.max(0, Math.min(1, p)); });
    });

    /**
     * I return a JS evaluator (progress 0..1 → eased progress) for an ease id
     * (unknown ids are linear).
     * @method easeFn
     * @param {String} id
     * @return {Function}
     */
    function easeFn(id) {
        return EASE_FNS[id] || EASE_FNS.linear;
    }

    /**
     * I tell whether an ease id exists.
     * @method hasEase
     * @param {String} id
     * @return {Boolean}
     */
    function hasEase(id) {
        return Object.prototype.hasOwnProperty.call(EASE_FNS, id);
    }


    /* ------------------------------------------------------------------ */
    /*  Box motion keyframes                                              */
    /* ------------------------------------------------------------------ */

    /**
     * I validate, sort and de-duplicate raw keyframes. I return undefined when
     * nothing valid is left, so the caller can drop the key.
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
            var clean = { t: t, xywh: xywh },
                r = parseFloat(kf.r);
            if (isFinite(r) && Math.round(r * 100) !== 0) {
                clean.r = Math.round(r * 100) / 100;
            }
            if (kf.ease && kf.ease !== 'linear' && hasEase(kf.ease)) {
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
     * I sample the rotation (degrees) of a keyframe track at time t, with the
     * same segment easing as sampleKeyframes. Keyframes without r are at 0.
     * @method sampleRotation
     * @param {Array} kfs
     * @param {Number} t
     * @return {Number}
     */
    function sampleRotation(kfs, t) {

        if (!kfs || !kfs.length) { return 0; }
        if (t <= kfs[0].t) { return kfs[0].r || 0; }
        var last = kfs[kfs.length - 1];
        if (t >= last.t) { return last.r || 0; }

        var lo = 0, hi = kfs.length - 1;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (kfs[mid].t <= t) { lo = mid; } else { hi = mid; }
        }

        var a = kfs[lo], b = kfs[hi],
            p = (t - a.t) / (b.t - a.t),
            e = easeFn(a.ease || 'linear')(p);

        return (a.r || 0) + ((b.r || 0) - (a.r || 0)) * e;

    }

    /**
     * I return the union bounding box of a track within [start, end], clamped
     * to the video frame (0..100). It is written as the plain xywh of the
     * overlay's FragmentSelector: the fallback for consumers that do not know
     * the frametrail:keyframes extension. Rotation is ignored (the union of the
     * unrotated boxes).
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


    /* ------------------------------------------------------------------ */

    return {

        EASE_DEFINITIONS:   EASE_DEFINITIONS,

        easeFn:             easeFn,
        hasEase:            hasEase,

        normalizeKeyframes: normalizeKeyframes,
        sampleKeyframes:    sampleKeyframes,
        sampleRotation:     sampleRotation,
        unionBox:           unionBox

    };

});
