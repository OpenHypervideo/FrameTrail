/**
 * @module Shared
 */


/**
 * I am FrameTrailTransition: the rules of a transition between two hypervideos (config.json →
 * hypervideoTransition), apart from how it looks and how it is timed. I touch neither the DOM nor
 * any FrameTrail instance, so I run in the browser as a plain script (window.FrameTrailTransition)
 * and in Node under require(), for tools and tests. The HypervideoTransition module does the rest.
 *
 * A transition has three phases around a change of hypervideo:
 *
 * * leave: a cover comes in over the hypervideo that is left, which is still on screen.
 * * wait: the hypervideo changes under the cover.
 * * enter: the new hypervideo is ready and the cover goes out.
 *
 * Between them are two moments without duration, "covered" (leave is over) and "arrived" (the new
 * hypervideo is ready). A jump to another hypervideo is only taken up at these moments and when
 * nothing runs: while a phase runs, such a change of the address is held, and applied at the next
 * moment. So a second jump during wait is taken up on arrival, and the hypervideo is never changed
 * while another change is still loading. One change is not held: during leave, an address that
 * names the hypervideo on screen again (Back) or the overview takes the jump back at once.
 *
 * @class FrameTrailTransition
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailTransition = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {

    'use strict';

    var STATES = ['idle', 'leave', 'covered', 'wait', 'arrived', 'enter'];

    // The looks FrameTrail has itself: keyframes of the overlay animations (AnimationLibrary/presets.css)
    // on a black cover, which comes in during leave and goes out during enter.
    var LOOKS = {
        fade: { leave: 'ftInFade',         enter: 'ftOutFade',        duration: 500 },
        wipe: { leave: 'ftInWipeFromLeft', enter: 'ftOutWipeToRight', duration: 500 },
        iris: { leave: 'ftInIris',         enter: 'ftOutIris',        duration: 500 }
    };

    // What every look becomes with prefers-reduced-motion: a short fade.
    var REDUCED_LOOK = { leave: 'ftInFade', enter: 'ftOutFade', duration: 150 };

    // A phase that does not end by itself ends after this many milliseconds.
    var CAPS = { leave: 10000, wait: 30000, enter: 10000 };

    // While waiting, the built-in looks show a spinner after this many milliseconds.
    var SPINNER_DELAY = 1000;

    // The cover starts to go out this many milliseconds after the arrival: the new view is laid out once more 300 ms after it.
    var ENTER_DELAY = 350;

    // Names of extensions, and so of their transitions (FrameTrail.registerExtension).
    var NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;


    /**
     * I tell which transition a setting means.
     *
     * @method resolveLook
     * @param {String} setting config.json → hypervideoTransition
     * @param {Array} extensionNames The names of the loaded extensions that have a transition
     * @param {Boolean} reducedMotion The viewer asks for reduced motion
     * @return {Object} { kind: 'none' | 'builtin' | 'extension', id, reduced? }
     */
    function resolveLook(setting, extensionNames, reducedMotion) {

        var none = { kind: 'none', id: 'none' };

        if (typeof setting !== 'string' || setting === '' || setting === 'none') { return none; }

        var builtIn   = Object.prototype.hasOwnProperty.call(LOOKS, setting),
            extension = !builtIn && Array.isArray(extensionNames) && extensionNames.indexOf(setting) >= 0;

        if (!builtIn && !extension) { return none; }

        // Reduced motion: whatever is set becomes the short fade, and no extension is asked.
        if (reducedMotion) { return { kind: 'builtin', id: 'fade', reduced: true }; }

        return { kind: builtIn ? 'builtin' : 'extension', id: setting };

    }


    /**
     * I return the keyframes and duration of a built-in look.
     *
     * @method lookOf
     * @param {Object} look What resolveLook() answered
     * @return {Object} { leave, enter, duration } or null
     */
    function lookOf(look) {

        if (!look || look.kind !== 'builtin') { return null; }
        if (look.reduced) { return REDUCED_LOOK; }
        return LOOKS[look.id] || null;

    }


    /**
     * The address was read. I tell what follows.
     *
     * @method route
     * @param {String} state
     * @param {Object} facts { other: it names a hypervideo that is not the open one, overview: it names the overview, eligible: a transition may run now }
     * @return {Object} { state, held, action }: held = nothing of the address is applied now; action = 'leave' (start the cover), 'switch' (the hypervideo changes under the cover), 'enter' (the cover goes out), 'uncover' (the cover goes away at once) or null
     */
    function route(state, facts) {

        var other    = !!(facts && facts.other),
            overview = !!(facts && facts.overview),
            eligible = !!(facts && facts.eligible);

        switch (state) {

            case 'leave':
                // Nothing has changed yet: Back, or the overview, takes the jump back at once.
                if (!other) { return { state: 'idle', held: false, action: 'uncover' }; }
                return { state: state, held: true, action: null };

            case 'wait':
            case 'enter':
                return { state: state, held: true, action: null };

            case 'covered':
                if (other && eligible) { return { state: 'wait', held: false, action: 'switch' }; }
                return { state: 'idle', held: false, action: 'uncover' };

            case 'arrived':
                if (other)    { return { state: 'wait', held: false, action: 'switch' }; }
                if (overview) { return { state: 'idle', held: false, action: 'uncover' }; }
                return { state: 'enter', held: false, action: 'enter' };

            default:
                if (other && eligible) { return { state: 'leave', held: true, action: 'leave' }; }
                return { state: 'idle', held: false, action: null };

        }

    }


    /**
     * Something happened that is not the address. I return the next state.
     *
     * @method next
     * @param {String} state
     * @param {String} event 'leaveDone', 'arrived', 'enterDone' or 'abort' (a failure, a cap, edit mode, the overview)
     * @return {String} The next state; the same state when the event does not belong to it
     */
    function next(state, event) {

        if (event === 'abort') { return 'idle'; }
        if (event === 'leaveDone' && state === 'leave') { return 'covered'; }
        if (event === 'arrived'   && state === 'wait')  { return 'arrived'; }
        if (event === 'enterDone' && state === 'enter') { return 'idle'; }
        return state;

    }


    // The cover is on screen.
    function covers(state) {
        return state !== 'idle' && STATES.indexOf(state) >= 0;
    }

    // A play() is kept for the end of the transition: the hypervideo under the cover is changing or not shown yet.
    function holds(state) {
        return state === 'wait' || state === 'arrived' || state === 'enter';
    }

    // The hypervideo on screen is being left: it plays on, but its end is no longer reported.
    function leaving(state) {
        return state === 'leave' || state === 'covered' || state === 'wait';
    }


    /**
     * I tell whether a hypervideo starts playing by itself now that it is ready (hypervideo.json → config.autoplay).
     * It does when the viewer came to it inside the page, never on a fresh page and never while editing.
     *
     * @method autoplays
     * @param {Object} facts { cameHere: a jump or an opening from the overview led to it, autoplay: its setting, editMode, viewMode }
     * @return {Boolean}
     */
    function autoplays(facts) {

        return !!facts && facts.cameHere === true && facts.autoplay === true && !facts.editMode && facts.viewMode === 'video';

    }


    return {

        STATES:        STATES,
        LOOKS:         LOOKS,
        REDUCED_LOOK:  REDUCED_LOOK,
        CAPS:          CAPS,
        SPINNER_DELAY: SPINNER_DELAY,
        ENTER_DELAY:   ENTER_DELAY,
        NAME_PATTERN:  NAME_PATTERN,

        resolveLook:   resolveLook,
        lookOf:        lookOf,
        route:         route,
        next:          next,
        covers:        covers,
        holds:         holds,
        leaving:       leaving,
        autoplays:     autoplays

    };

});
