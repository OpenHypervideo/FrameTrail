/**
 * @module Shared
 */


/**
 * I am FrameTrailAreaOpening: the rules of a layout area that is open only while an annotation of its views is active (a collection view's openWhenActive). I touch neither the DOM nor any FrameTrail instance, so I run in the browser as a plain script (window.FrameTrailAreaOpening) and in Node under require(), for tools and tests. The ViewLayout module does the rest.
 *
 * Everything is counted in video time, so what an area should be is a function of the playhead: pausing and seeking never leave a wrong state, and no timer is needed.
 *
 * * A view's annotations make windows: the times at which its area should be open. Annotations that overlap, touch, or follow one another within the view's gap (openGap, seconds) share a window, so the area does not close and open again between them.
 * * An area follows the view in its active tab, with that view's own gap; the views in the other tabs neither open it nor keep it open. When the active tab's view does not have the option, nothing is done. I never change the tab: only the viewer does.
 * * I only say what to do when what the annotations want changes (step): entering a window opens the area, leaving it closes it. A tab the viewer picks is such a change too, as its view's annotations count from then on. In between nothing is asked, so what the viewer or event code did by hand stays until the next change.
 * * Closing waits while the viewer uses the area (busy); opening does not.
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
     * I return what a view's annotations want at a time: { window }, the start of the window the time lies in, null outside of all. The caller adds view and busy, see step.
     *
     * @method at
     * @param {Object} view { spans: [{ start, end }], gap }
     * @param {Number} time
     * @return {Object}
     */
    function at(view, time) {

        var current = windowAt(windows(view && view.spans, view && view.gap), time);

        return { window: current ? current.start : null };

    }


    /**
     * I decide what to do with an area, from what was decided before (state, {} at first) and what the view in its active tab wants now (facts):
     *
     * * view: names that view (any value, compared with ===), null when it does not open the area (no openWhenActive);
     * * window: at() for that view;
     * * busy: true while the area is open and the viewer uses it.
     *
     * I answer { state, open, held }:
     *
     * * state: what to hand me next time.
     * * open: true to open the area, false to close it, null to leave it as it is.
     * * held: closing waits for the viewer to be done; ask again soon, also while the video is paused.
     *
     * The first decision is taken whatever the viewer does: an area starts as its active tab's annotations say. Afterwards only a change is acted on. Entering a window (also from another one, after a seek, or another view's after a change of tab) opens the area; leaving the windows (or changing to a tab whose view has no window now) closes it, once the viewer is not busy. Being outside of all windows is the same for every view, so changing between two tabs that want nothing now changes nothing. While the active tab's view does not open the area, nothing is done and the state is kept: such a tab is passed over, as if the viewer had gone straight from the view before it to the one after it.
     *
     * @method step
     * @param {Object} state
     * @param {Object} facts { view, window, busy }
     * @return {Object}
     */
    function step(state, facts) {

        var before = (state && typeof state === 'object') ? state : {},
            given  = (facts && typeof facts === 'object') ? facts : {},
            view   = (given.view === undefined) ? null : given.view,
            wanted = (view === null || given.window === undefined) ? null : given.window,
            first  = (before.window === undefined),
            busy   = (given.busy === true) && !first,
            result = { state: { view: view, window: wanted }, open: null, held: false };

        // The active tab does not open the area: it stays as it is, and what was decided before is kept, so the tab is passed over
        if (view === null) {
            result.state = first ? { view: null, window: null } : { view: before.view, window: before.window };
            return result;
        }

        if (first) {
            result.open = (wanted !== null);
            return result;
        }

        var same = (wanted === null) ? (before.window === null)
                                     : (before.window === wanted && before.view === view);

        if (same) { return result; }

        if (wanted !== null) {
            result.open = true;
        } else if (!busy) {
            result.open = false;
        } else {
            result.state = { view: before.view, window: before.window };
            result.held  = true;
        }

        return result;

    }


    return {

        DEFAULT_GAP: DEFAULT_GAP,
        MAX_GAP:     MAX_GAP,

        gapOf:       gapOf,
        windows:     windows,
        windowAt:    windowAt,
        at:          at,
        step:        step

    };

});
