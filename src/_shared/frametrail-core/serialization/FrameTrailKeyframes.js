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
 * ease?: id of the segment to the next keyframe, points?: the outline of a
 * freeform hotspot at this keyframe }
 *
 * An outline is a closed list of points [{ x, y, smooth? }] in 0–100
 * coordinates of the keyframe's box. A track morphs (its outline changes with
 * the keyframes) when every keyframe has an outline with the same number of
 * points, three or more; the points are matched by index. Whether a point is
 * a corner or a curve (smooth) is the same in every keyframe: the first
 * keyframe says. I also know the geometry of an outline (its curve segments
 * and bounds) and the edits of a morphing track's points, so that they can be
 * tested without a browser.
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

    // An outline as [{ x, y, smooth? }]; undefined for anything that is not a
    // list of points with numbers for x and y.
    function normalizePoints(raw) {

        if (!Array.isArray(raw) || !raw.length) { return undefined; }

        var points = [];

        for (var i = 0; i < raw.length; i++) {
            var p = raw[i];
            if (!p || typeof p !== 'object') { return undefined; }
            var x = parseFloat(p.x),
                y = parseFloat(p.y);
            if (!isFinite(x) || !isFinite(y)) { return undefined; }
            var point = { x: x, y: y };
            if (p.smooth) { point.smooth = true; }
            points.push(point);
        }

        return points;

    }

    /**
     * I validate, sort and de-duplicate raw keyframes. I return undefined when
     * nothing valid is left, so the caller can drop the key. A keyframe keeps
     * its outline (points) when that is a list of points; whether the outlines
     * of a track fit together is another question (see morphs).
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
            var points = normalizePoints(kf.points);
            if (points) {
                clean.points = points;
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
    /*  Outlines that change with the keyframes                           */
    /* ------------------------------------------------------------------ */

    /**
     * I tell whether the outline of a track changes with its keyframes: every
     * keyframe has an outline, all with the same number of points, three or
     * more. Anything else is shown with the static outline.
     * @method morphs
     * @param {Array} kfs
     * @return {Boolean}
     */
    function morphs(kfs) {

        if (!Array.isArray(kfs) || !kfs.length) { return false; }

        var count = (kfs[0] && Array.isArray(kfs[0].points)) ? kfs[0].points.length : 0;
        if (count < 3) { return false; }

        for (var i = 1; i < kfs.length; i++) {
            if (!kfs[i] || !Array.isArray(kfs[i].points) || kfs[i].points.length !== count) { return false; }
        }

        return true;

    }

    /**
     * I sample the outline of a morphing track at time t (seconds): each point
     * moves in a straight line in box coordinates, with the eased progress of
     * the segment, as the box does (sampleKeyframes). Before the first
     * keyframe the first outline holds, after the last the last one. Corner
     * or curve is what the first keyframe says. I return null when the
     * keyframes I read have no outlines that fit together.
     * @method samplePoints
     * @param {Array} kfs
     * @param {Number} t
     * @return {Array|null} [{ x, y, smooth? }]
     */
    function samplePoints(kfs, t) {

        if (!kfs || !kfs.length) { return null; }

        var first = kfs[0].points,
            last  = kfs[kfs.length - 1],
            a, b, e = 0;

        if (!Array.isArray(first) || first.length < 3) { return null; }

        if (!(t > kfs[0].t)) {
            a = b = kfs[0];
        } else if (t >= last.t) {
            a = b = last;
        } else {
            var lo = 0, hi = kfs.length - 1;
            while (hi - lo > 1) {
                var mid = (lo + hi) >> 1;
                if (kfs[mid].t <= t) { lo = mid; } else { hi = mid; }
            }
            a = kfs[lo];
            b = kfs[hi];
            e = easeFn(a.ease || 'linear')((t - a.t) / (b.t - a.t));
        }

        if (!Array.isArray(a.points) || !Array.isArray(b.points)
                || a.points.length !== first.length || b.points.length !== first.length) {
            return null;
        }

        var out = [];

        for (var i = 0; i < first.length; i++) {
            var pa = a.points[i],
                pb = b.points[i],
                point = { x: pa.x + (pb.x - pa.x) * e, y: pa.y + (pb.y - pa.y) * e };
            if (first[i].smooth) { point.smooth = true; }
            out.push(point);
        }

        return out;

    }

    function round2(v) {
        return Math.round(v * 100) / 100;
    }

    function clonePoint(p) {
        var point = { x: p.x, y: p.y };
        if (p.smooth) { point.smooth = true; }
        return point;
    }

    // A copy of a keyframe with other points (none when points is undefined).
    function withPoints(kf, points) {
        var copy = {};
        Object.keys(kf).forEach(function(key) {
            if (key !== 'points') { copy[key] = kf[key]; }
        });
        if (points) { copy.points = points; }
        return copy;
    }

    /**
     * I give every keyframe of next that has no outline the outline prev has
     * at its time, when prev morphs. So a keyframe that is made at a time
     * without one (a box change at the playhead, the keyframe toggle), or one
     * rebuilt without its points, keeps a morphing track morphing. Keyframes
     * that have an outline are returned as they are.
     * @method inheritPoints
     * @param {Array} next
     * @param {Array} prev
     * @return {Array}
     */
    function inheritPoints(next, prev) {

        if (!Array.isArray(next) || !morphs(prev)) { return next; }

        return next.map(function(kf) {
            if (!kf || typeof kf !== 'object' || Array.isArray(kf.points)) { return kf; }
            var points = samplePoints(prev, parseFloat(kf.t));
            if (!points) { return kf; }
            return withPoints(kf, points.map(function(p) {
                var point = { x: round2(p.x), y: round2(p.y) };
                if (p.smooth) { point.smooth = true; }
                return point;
            }));
        });

    }

    /**
     * I return the segments of an outline, one from each point to the next
     * (the last one back to the first), as cubic Béziers { a, c1, c2, b,
     * straight }. Smooth points get Catmull-Rom tangents, so the outline
     * curves through them; corners have none.
     * @method outlineSegments
     * @param {Array} points
     * @return {Array}
     */
    function outlineSegments(points) {

        var n = points.length,
            tangent = function(i) {
                var p = points[i], prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
                return p.smooth ? [(next.x - prev.x) / 6, (next.y - prev.y) / 6] : [0, 0];
            };

        return points.map(function(a, i) {
            var j  = (i + 1) % n,
                b  = points[j],
                ta = tangent(i),
                tb = tangent(j);
            return {
                a:        a,
                c1:       { x: a.x + ta[0], y: a.y + ta[1] },
                c2:       { x: b.x - tb[0], y: b.y - tb[1] },
                b:        b,
                straight: !a.smooth && !b.smooth
            };
        });

    }

    /**
     * I return the bounds [x0, y0, x1, y1] of an outline: of the outline
     * itself, not of its points (a curve through smooth points can bulge past
     * them).
     * @method outlineBounds
     * @param {Array} points
     * @return {Array}
     */
    function outlineBounds(points) {

        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

        outlineSegments(points).forEach(function(seg) {
            for (var i = 0; i <= (seg.straight ? 1 : 16); i++) {
                var t = seg.straight ? i : i / 16, mt = 1 - t,
                    x = mt * mt * mt * seg.a.x + 3 * mt * mt * t * seg.c1.x + 3 * mt * t * t * seg.c2.x + t * t * t * seg.b.x,
                    y = mt * mt * mt * seg.a.y + 3 * mt * mt * t * seg.c1.y + 3 * mt * t * t * seg.c2.y + t * t * t * seg.b.y;
                x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
        });

        return [x0, y0, x1, y1];

    }

    /**
     * I return the point in the middle of the segment that starts at point
     * index: where a new point is put. It is a curve unless the segment is
     * straight.
     * @method outlineMidpoint
     * @param {Array} points
     * @param {Number} index
     * @return {Object} { x, y, smooth? }
     */
    function outlineMidpoint(points, index) {

        var seg   = outlineSegments(points)[index],
            point = {
                x: (seg.a.x + 3 * seg.c1.x + 3 * seg.c2.x + seg.b.x) / 8,
                y: (seg.a.y + 3 * seg.c1.y + 3 * seg.c2.y + seg.b.y) / 8
            };

        if (!seg.straight) { point.smooth = true; }

        return point;

    }

    /**
     * I return an outline in the coordinates of the box [x0, y0, x1, y1]
     * (given in the outline's own coordinates), rounded to two decimals: what
     * the points are once that box is the overlay's box.
     * @method fitPoints
     * @param {Array} points
     * @param {Array} bounds
     * @return {Array}
     */
    function fitPoints(points, bounds) {

        var w = (bounds[2] - bounds[0]) || 1,
            h = (bounds[3] - bounds[1]) || 1;

        return points.map(function(p) {
            var point = { x: round2((p.x - bounds[0]) / w * 100), y: round2((p.y - bounds[1]) / h * 100) };
            if (p.smooth) { point.smooth = true; }
            return point;
        });

    }

    // The points of every keyframe changed by change(points, kf), with corner
    // or curve as the first keyframe has it.
    function editPoints(kfs, change) {

        var flags = kfs[0].points.map(function(p) { return !!p.smooth; });

        return kfs.map(function(kf) {
            return withPoints(kf, change(kf.points.map(function(p, i) {
                var point = { x: p.x, y: p.y };
                if (flags[i]) { point.smooth = true; }
                return point;
            }), kf));
        });

    }

    /**
     * I give every keyframe the same outline: how a track starts to morph.
     * @method seedPoints
     * @param {Array} kfs
     * @param {Array} points
     * @return {Array} a new track
     */
    function seedPoints(kfs, points) {
        return kfs.map(function(kf) {
            return withPoints(kf, points.map(clonePoint));
        });
    }

    /**
     * I add a point to every outline of a morphing track, after point index,
     * in the middle of each keyframe's own segment to the next point. The
     * outlines keep their shapes.
     * @method insertPoint
     * @param {Array} kfs
     * @param {Number} index
     * @return {Array} a new track
     */
    function insertPoint(kfs, index) {
        return editPoints(kfs, function(points) {
            points.splice(index + 1, 0, outlineMidpoint(points, index));
            return points;
        });
    }

    /**
     * I remove point index from every outline of a morphing track.
     * @method removePoint
     * @param {Array} kfs
     * @param {Number} index
     * @return {Array} a new track
     */
    function removePoint(kfs, index) {
        return editPoints(kfs, function(points) {
            points.splice(index, 1);
            return points;
        });
    }

    /**
     * I make point index a curve (smooth) or a corner in every outline of a
     * morphing track.
     * @method smoothPoint
     * @param {Array} kfs
     * @param {Number} index
     * @param {Boolean} smooth
     * @return {Array} a new track
     */
    function smoothPoint(kfs, index, smooth) {
        return editPoints(kfs, function(points) {
            if (smooth) { points[index].smooth = true; } else { delete points[index].smooth; }
            return points;
        });
    }

    /**
     * I take the outlines off the keyframes: the track moves its box only.
     * @method stripPoints
     * @param {Array} kfs
     * @return {Array} a new track
     */
    function stripPoints(kfs) {
        return kfs.map(function(kf) {
            return withPoints(kf);
        });
    }


    /* ------------------------------------------------------------------ */

    return {

        EASE_DEFINITIONS:   EASE_DEFINITIONS,

        easeFn:             easeFn,
        hasEase:            hasEase,

        normalizeKeyframes: normalizeKeyframes,
        sampleKeyframes:    sampleKeyframes,
        sampleRotation:     sampleRotation,
        unionBox:           unionBox,

        morphs:             morphs,
        samplePoints:       samplePoints,
        inheritPoints:      inheritPoints,

        outlineSegments:    outlineSegments,
        outlineBounds:      outlineBounds,
        outlineMidpoint:    outlineMidpoint,
        fitPoints:          fitPoints,

        seedPoints:         seedPoints,
        insertPoint:        insertPoint,
        removePoint:        removePoint,
        smoothPoint:        smoothPoint,
        stripPoints:        stripPoints

    };

});
