/**
 * @module Shared
 */


/**
 * I am FrameTrailAreaOpening: the rules of a layout area that is open only while an annotation of its views is active (a collection view's openWhenActive). I touch neither the DOM nor any FrameTrail instance, so I run in the browser as a plain script (window.FrameTrailAreaOpening) and in Node under require(), for tools and tests. The ViewLayout module does the rest.
 *
 * Everything is counted in video time, so what an area should be is a function of the playhead: pausing and seeking never leave a wrong state, and no timer is needed.
 *
 * * A view's annotations make windows: the times at which its area should be open. Annotations that overlap, touch, or follow one another within the view's gap (openGap, seconds) share a window, so the area does not close and open again between them.
 * * An area with several such views has the windows of all their annotations together, with the largest of their gaps.
 * * The area shows the view whose active annotation started last (the leader).
 * * I only say what to do when what the annotations want changes (step): entering a window opens the area, leaving it closes it, a new leader changes the tab. In between nothing is asked, so what the viewer or event code did by hand stays until the next change.
 * * Closing and changing the tab wait while the viewer uses the area (busy); opening does not.
 *
 * @class FrameTrailAreaOpening
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailAreaOpening = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {

    'use strict';

    // Seconds of video time between two annotations up to which the area stays open (a view's openGap).
    var DEFAULT_GAP = 3,
        MAX_GAP     = 600;


    /**
     * I return a view's gap in seconds: its openGap between 0 and MAX_GAP, the default when it has none.
     *
     * @method gapOf
     * @param {Number} value
     * @return {Number}
     */
    function gapOf(value) {

        if (typeof value !== 'number' || !isFinite(value)) { return DEFAULT_GAP; }

        return Math.max(0, Math.min(MAX_GAP, value));

    }


    // The spans that have a start and an end, by their start.
    function spansOf(list) {

        return (Array.isArray(list) ? list : []).filter(function(span) {
            return span && typeof span.start === 'number' && typeof span.end === 'number'
                && isFinite(span.start) && isFinite(span.end) && span.end >= span.start;
        }).map(function(span) {
            return { start: span.start, end: span.end };
        }).sort(function(a, b) {
            return (a.start - b.start) || (a.end - b.end);
        });

    }


    /**
     * I return the windows of some time spans: the spans, those joined that overlap, touch, or are no more than the gap apart. In order of their start.
     *
     * @method windows
     * @param {Array} spans [{ start, end }] in seconds, in any order
     * @param {Number} [gap] seconds, see gapOf
     * @return {Array} [{ start, end }]
     */
    function windows(spans, gap) {

        var bridge = gapOf(gap),
            list   = [];

        spansOf(spans).forEach(function(span) {
            var last = list[list.length - 1];
            if (last && span.start - last.end <= bridge) {
                last.end = Math.max(last.end, span.end);
            } else {
                list.push(span);
            }
        });

        return list;

    }


    /**
     * I return the window a time lies in (its start and end included), or null.
     *
     * @method windowAt
     * @param {Array} list windows()
     * @param {Number} time
     * @return {Object|null}
     */
    function windowAt(list, time) {

        if (typeof time !== 'number' || !isFinite(time)) { return null; }

        for (var i = 0; i < list.length; i++) {
            if (list[i].start <= time && time <= list[i].end) { return list[i]; }
        }

        return null;

    }


    /**
     * I return what an area's views make together: the largest of their gaps, and the windows of all their spans with it. So an annotation of one view keeps the area open for a follower in another.
     *
     * @method plan
     * @param {Array} views [{ spans: [{ start, end }], gap }]
     * @return {Object} { gap, windows }
     */
    function plan(views) {

        var gap   = 0,
            spans = [];

        (Array.isArray(views) ? views : []).forEach(function(view) {
            gap = Math.max(gap, gapOf(view && view.gap));
            Array.prototype.push.apply(spans, spansOf(view && view.spans));
        });

        return { gap: gap, windows: windows(spans, gap) };

    }


    /**
     * I return the leader at a time: the view whose active annotation started last, as { view (its index), start, key }. Of two that started together, the view listed first. Null when no annotation is active (also between two that share a window).
     *
     * @method leaderAt
     * @param {Array} views [{ spans: [{ start, end }] }]
     * @param {Number} time
     * @return {Object|null}
     */
    function leaderAt(views, time) {

        var leader = null;

        if (typeof time !== 'number' || !isFinite(time)) { return null; }

        (Array.isArray(views) ? views : []).forEach(function(view, index) {
            spansOf(view && view.spans).forEach(function(span) {
                if (span.start <= time && time <= span.end && (!leader || span.start > leader.start)) {
                    leader = { view: index, start: span.start, key: index + ':' + span.start };
                }
            });
        });

        return leader;

    }


    /**
     * I return what an area's annotations want at a time: { window, lead }. window names the window the time lies in (its start), null outside of all; lead is leaderAt(). The caller adds busy, see step.
     *
     * @method at
     * @param {Array} views [{ spans: [{ start, end }], gap }]
     * @param {Number} time
     * @return {Object}
     */
    function at(views, time) {

        var current = windowAt(plan(views).windows, time);

        return { window: current ? current.start : null, lead: leaderAt(views, time) };

    }


    /**
     * I decide what to do with an area, from what was decided before (state, {} at first) and what its annotations want now (facts: at() plus busy, true while the area is open and the viewer uses it).
     *
     * I answer { state, open, lead, held }:
     *
     * * state: what to hand me next time.
     * * open: true to open the area, false to close it, null to leave it as it is.
     * * lead: the index of the view to show, null to leave the tabs as they are.
     * * held: something waits for the viewer to be done; ask again soon, also while the video is paused.
     *
     * The first decision is taken whatever the viewer does: an area starts as its annotations say. Afterwards only a change is acted on. Entering a window (also from another one, after a seek) opens the area; leaving the windows closes it, once the viewer is not busy. A new leader changes the tab, once the viewer is not busy. Between the annotations of a window the leader is forgotten, so the annotation that starts next leads again even if it led before.
     *
     * @method step
     * @param {Object} state
     * @param {Object} facts { window, lead, busy }
     * @return {Object}
     */
    function step(state, facts) {

        var before = (state && typeof state === 'object') ? state : {},
            given  = (facts && typeof facts === 'object') ? facts : {},
            wanted = (given.window === undefined) ? null : given.window,
            lead   = given.lead || null,
            first  = (before.window === undefined),
            busy   = (given.busy === true) && !first,
            next   = { window: first ? null : before.window, lead: (before.lead === undefined) ? null : before.lead },
            result = { state: next, open: null, lead: null, held: false };

        if (first) {
            next.window = wanted;
            result.open = (wanted !== null);
        } else if (wanted !== before.window) {
            if (wanted !== null) {
                next.window = wanted;
                result.open = true;
            } else if (!busy) {
                next.window = null;
                result.open = false;
            } else {
                result.held = true;
            }
        }

        if (!lead) {
            next.lead = null;
        } else if (lead.key !== next.lead) {
            if (!busy) {
                next.lead   = lead.key;
                result.lead = lead.view;
            } else {
                result.held = true;
            }
        }

        return result;

    }


    return {

        DEFAULT_GAP: DEFAULT_GAP,
        MAX_GAP:     MAX_GAP,

        gapOf:       gapOf,
        windows:     windows,
        windowAt:    windowAt,
        plan:        plan,
        leaderAt:    leaderAt,
        at:          at,
        step:        step

    };

});
