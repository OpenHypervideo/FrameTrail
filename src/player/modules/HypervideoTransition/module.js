/**
 * @module Player
 */


/**
 * I am the HypervideoTransition: what the viewer sees while one hypervideo is left for another, and when the new one starts.
 *
 * A transition (config.json → hypervideoTransition: "fade", "wipe", "iris" or the name of an extension that has
 * slots.transition; missing or "none": no transition) runs when a link, a quiz answer, event code or Back / Forward
 * leads from the hypervideo on screen to another one. Opening a hypervideo from the overview, and every change while
 * editing, stay as they are. It has three phases:
 *
 * * leave: my cover comes in over the hypervideo that is left. It plays on, but counts as left: its end is not reported.
 * * wait: {{#crossLink "HypervideoModel/updateHypervideo:method"}}HypervideoModel/updateHypervideo(){{/crossLink}} runs under the cover, without its "Loading …" message.
 * * enter: the new hypervideo is ready, the cover goes out, and a play() that came meanwhile is carried out.
 *
 * The rules (which state follows which, which look a setting means) are {{#crossLink "FrameTrailTransition"}}FrameTrailTransition{{/crossLink}}'s;
 * I do the cover, the timing and the calls. A jump to another hypervideo is only taken up between the phases, see there;
 * Back during leave takes the jump back at once.
 *
 * A change of hypervideo clears every timer on the page, so nothing here uses one: a phase ends with its
 * animation (Animation.finished) or the extension's promise, and the caps are checked on animation frames.
 *
 * I also start a hypervideo that has config.autoplay, when the viewer came to it inside the page (after a jump,
 * with or without a transition, or from the overview), never on a fresh page.
 *
 * @class HypervideoTransition
 * @static
 */

FrameTrail.defineModule('HypervideoTransition', function(FrameTrail){

    var Rules  = window.FrameTrailTransition,
        labels = FrameTrail.module('Localization').labels;

    var state        = 'idle',
        run          = 0,       // counts the phases: an end that comes late belongs to no phase
        look         = null,    // what FrameTrailTransition.resolveLook() answered for the running transition
        transition   = null,    // the extension's transition, if it is one: { name, slot }
        ctx          = null,    // what an extension's transition is given
        aborter      = null,    // its ctx.signal
        animations   = [],      // the cover's animations of the running phase
        phaseStart   = 0,
        frameID      = null,
        routeHeld    = false,   // the address changed while a phase ran

        expected     = null,    // the hypervideo the change under way leads to
        awaited      = false,   // updateHypervideo() runs and has not reported back: one arrival per change
        pendingPlay  = false,   // a play() to carry out when the cover is gone
        released     = false,   // an extension's transition let the hypervideo start while its cover still goes out

        target       = document.querySelector(FrameTrail.getState('target')),
        cover        = document.createElement('div'),
        spinner      = document.createElement('div'),
        stages       = {},      // one element per extension transition, where it keeps its DOM

        reducedMotionQuery = (window.matchMedia) ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    cover.className   = 'hypervideoTransitionCover';
    spinner.className = 'workingSpinner';
    cover.appendChild(spinner);
    target.appendChild(cover);

    document.addEventListener('visibilitychange', onVisibilityChange);


    /* ------------------------------------------------------------------ */
    /*  Which transition                                                  */
    /* ------------------------------------------------------------------ */

    function extensionTransitions() {

        var Extensions = FrameTrail.module('Extensions');

        return (Extensions && typeof Extensions.transitions === 'function') ? Extensions.transitions() : [];

    }


    function isBuiltIn(id) {

        return Object.prototype.hasOwnProperty.call(Rules.LOOKS, id);

    }


    /**
     * I return the transition that is set and can run now: { look, transition }, the look's kind "none" when there is none.
     *
     * @method pickLook
     * @private
     */
    function pickLook() {

        var database = FrameTrail.module('Database'),
            setting  = (database && database.config) ? database.config.hypervideoTransition : undefined,
            offered  = extensionTransitions(),
            resolved = Rules.resolveLook(setting, offered.map(function(item) { return item.name; }), !!(reducedMotionQuery && reducedMotionQuery.matches)),
            found    = null;

        if (resolved.kind === 'extension') {

            found = offered.filter(function(item) { return item.name === resolved.id; })[0];

            // An extension that is not ready (its files still loading, or failed) is no transition: the hypervideo changes at once.
            if (typeof found.slot.available === 'function') {
                var available = false;
                try {
                    available = found.slot.available();
                } catch (e) {
                    console.error('FrameTrail extension "' + found.name + '": its transition\'s available() failed.', e);
                }
                if (available === false) {
                    return { look: { kind: 'none', id: 'none' }, transition: null };
                }
            }

        }

        return { look: resolved, transition: found };

    }


    /**
     * A transition may run: a hypervideo is on screen, nobody edits, nothing is unsaved, this is no paired phone,
     * and somebody can see it.
     *
     * @method mayRun
     * @private
     */
    function mayRun() {

        return FrameTrail.getState('viewMode') === 'video'
            && !FrameTrail.getState('editMode')
            && !FrameTrail.getState('unsavedChanges')
            && !FrameTrail.getState('companion')
            && !document.hidden
            && !!FrameTrail.module('HypervideoController');

    }


    /**
     * I list what the instance's setting can be, for Administration: [{ id, label, extension? }].
     *
     * @method looks
     * @return {Array}
     */
    function looks() {

        var list = [
            { id: 'none', label: labels['SettingsTransitionNone'] },
            { id: 'fade', label: labels['SettingsTransitionFade'] },
            { id: 'wipe', label: labels['SettingsTransitionWipe'] },
            { id: 'iris', label: labels['SettingsTransitionIris'] }
        ];

        extensionTransitions().forEach(function(item) {
            // A built-in name wins over an extension of the same name.
            if (item.name === 'none' || isBuiltIn(item.name)) { return; }
            list.push({
                id:        item.name,
                label:     (typeof item.slot.label === 'string' && item.slot.label) ? item.slot.label : item.name,
                extension: true
            });
        });

        return list;

    }


    /* ------------------------------------------------------------------ */
    /*  The cover                                                         */
    /* ------------------------------------------------------------------ */

    function stageOf(name) {

        if (!stages[name]) {
            stages[name] = document.createElement('div');
            stages[name].className = 'hypervideoTransitionStage';
            stages[name].setAttribute('data-extension', name);
            cover.appendChild(stages[name]);
        }

        return stages[name];

    }


    function showCover() {

        // The target can have been emptied and filled again (the interface is built after me).
        if (!cover.isConnected) { target.appendChild(cover); }

        cover.setAttribute('data-kind', look.kind);
        cover.classList.remove('waiting');
        cover.classList.add('active');

        for (var name in stages) {
            stages[name].classList.toggle('active', !!transition && transition.name === name);
        }

    }


    function hideCover() {

        clearAnimation();
        cover.classList.remove('active', 'waiting');
        cover.removeAttribute('data-kind');

        for (var name in stages) {
            stages[name].classList.remove('active');
        }

    }


    function clearAnimation() {

        animations = [];
        cover.style.animation = '';

    }


    /**
     * I play one of the overlay animations' keyframes on the cover and resolve when it is over.
     * Without an animation (the keyframes are missing, the page is hidden) I resolve at once.
     *
     * @method animate
     * @private
     */
    function animate(name, duration, delay) {

        if (document.hidden) {
            clearAnimation();
            return Promise.resolve();
        }

        cover.style.animation = name + ' ' + duration + 'ms ease ' + (delay || 0) + 'ms both';

        // getAnimations() flushes the style, so the animation set just now is there.
        animations = (typeof cover.getAnimations === 'function') ? cover.getAnimations().filter(function(animation) {
            return animation.animationName === name;
        }) : [];

        if (!animations.length) { return Promise.resolve(); }

        return Promise.all(animations.map(function(animation) { return animation.finished; }));

    }


    // A hidden page runs no animations: what is running ends now, so the phase goes on.
    function onVisibilityChange() {

        if (!document.hidden || state === 'idle') { return; }

        animations.forEach(function(animation) {
            try { animation.finish(); } catch (e) {}
        });

    }


    /* ------------------------------------------------------------------ */
    /*  The extension's transition                                        */
    /* ------------------------------------------------------------------ */

    function callTransition(method) {

        if (!transition || typeof transition.slot[method] !== 'function') { return undefined; }

        try {
            return transition.slot[method](ctx);
        } catch (e) {
            console.error('FrameTrail extension "' + transition.name + '": its transition\'s ' + method + '() failed.', e);
            return undefined;
        }

    }


    function failedPromise(method) {

        var name = transition ? transition.name : '';

        return function(e) {
            console.error('FrameTrail extension "' + name + '": its transition\'s ' + method + '() failed.', e);
        };

    }


    /* ------------------------------------------------------------------ */
    /*  The phases                                                        */
    /* ------------------------------------------------------------------ */

    function now() {

        return (window.performance && performance.now) ? performance.now() : Date.now();

    }


    function startPhase(newState) {

        state      = newState;
        phaseStart = now();
        run++;

        if (frameID === null) {
            frameID = window.requestAnimationFrame(watch);
        }

        return run;

    }


    /**
     * On animation frames (timers do not survive a change of hypervideo) I show the spinner of a long wait and
     * end a phase that does not end by itself: leave and enter go on as if they had ended, a wait gives the view free.
     *
     * @method watch
     * @private
     */
    function watch() {

        frameID = null;

        if (state === 'idle') { return; }

        var elapsed = now() - phaseStart;

        if (state === 'wait' && elapsed >= Rules.SPINNER_DELAY) {
            cover.classList.add('waiting');
        }

        if (state === 'leave' && elapsed >= Rules.CAPS.leave) {
            leaveDone(run);
        } else if (state === 'enter' && elapsed >= Rules.CAPS.enter) {
            enterDone(run);
        } else if (state === 'wait' && elapsed >= Rules.CAPS.wait) {
            // The hypervideo is still loading: from here on as without a transition.
            stop();
            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoading']);
        }

        if (state !== 'idle' && frameID === null) {
            frameID = window.requestAnimationFrame(watch);
        }

    }


    /**
     * An extension's transition calls ctx.release() during enter(): a play() that was kept is carried out now,
     * and the hypervideo plays under what is left of the cover.
     *
     * @method release
     * @private
     */
    function release() {

        if (state !== 'enter' || released) { return; }

        released = true;

        if (pendingPlay && FrameTrail.module('HypervideoController')) {
            pendingPlay = false;
            FrameTrail.module('HypervideoController').play();
        }

    }


    function startLeave(id, info, picked) {

        var myRun;

        look       = picked.look;
        transition = picked.transition;
        aborter    = (typeof AbortController === 'function') ? new AbortController() : null;
        routeHeld  = false;

        ctx = {
            from:   FrameTrail.module('RouteNavigation').hypervideoID,
            to:     id,
            time:   (info && info.time !== undefined && info.time !== null && !isNaN(parseFloat(info.time))) ? parseFloat(info.time) : null,
            source: (info && info.source) || null,
            cover:  transition ? stageOf(transition.name) : cover,
            muted:  !!FrameTrail.getState('muted'),
            signal: aborter ? aborter.signal : undefined,
            // For enter(): the new hypervideo may start now, though the cover is still going out.
            release: release
        };

        myRun = startPhase('leave');
        showCover();

        var done = function() { leaveDone(myRun); };

        if (transition) {
            Promise.resolve(callTransition('leave')).then(done, function(e) { failedPromise('leave')(e); done(); });
        } else {
            var builtIn = Rules.lookOf(look);
            animate(builtIn.leave, builtIn.duration, 0).then(done, done);
        }

    }


    function leaveDone(ofRun) {

        if (ofRun !== run || state !== 'leave') { return; }

        state = Rules.next(state, 'leaveDone');
        run++;
        clearAnimation();

        // The address decides: another hypervideo (the one clicked, or a newer one), or back to the one on screen.
        FrameTrail.module('RouteNavigation').applyRoute();

        // Nothing took it up (the router did not come to me): the view is given free.
        if (state === 'covered') { stop(); }

    }


    function startEnter() {

        var myRun = startPhase('enter');

        cover.classList.remove('waiting');
        routeHeld = false;

        if (ctx) { ctx.muted = !!FrameTrail.getState('muted'); }

        var done = function() { enterDone(myRun); };

        if (transition) {
            Promise.resolve(callTransition('enter')).then(done, function(e) { failedPromise('enter')(e); done(); });
        } else {
            var builtIn = Rules.lookOf(look);
            animate(builtIn.enter, builtIn.duration, Rules.ENTER_DELAY).then(done, done);
        }

    }


    function enterDone(ofRun) {

        if (ofRun !== run || state !== 'enter') { return; }

        var reapply = routeHeld;

        end(true);

        if (reapply) {
            FrameTrail.module('RouteNavigation').applyRoute();
        }

    }


    /**
     * The transition is over: the cover goes away. A play() that was kept is carried out, or forgotten.
     *
     * @method end
     * @param {Boolean} release
     * @private
     */
    function end(release) {

        var play = release && pendingPlay;

        state       = 'idle';
        run++;
        pendingPlay = false;
        released    = false;
        routeHeld   = false;
        look        = null;
        transition  = null;
        ctx         = null;
        aborter     = null;

        hideCover();

        if (play && FrameTrail.module('HypervideoController')) {
            FrameTrail.module('HypervideoController').play();
        }

    }


    /**
     * The transition ends before its time: the extension is told (cancel(), ctx.signal), the cover goes away,
     * a kept play() is forgotten.
     *
     * @method stop
     * @private
     */
    function stop() {

        callTransition('cancel');
        if (aborter) { aborter.abort(); }

        end(false);

    }


    /**
     * I end a running transition early. An address that was held meanwhile is applied afterwards, as without a transition.
     *
     * @method abort
     */
    function abort() {

        if (state === 'idle') { return; }

        var reapply = routeHeld || state === 'leave';

        stop();

        if (reapply) {
            // Not from inside the state change or the router call that led here.
            Promise.resolve().then(function() {
                if (state === 'idle') { FrameTrail.module('RouteNavigation').applyRoute(); }
            });
        }

    }


    /* ------------------------------------------------------------------ */
    /*  The router asks                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * The address names another hypervideo than the open one. I answer whether I take it:
     * true = the router does nothing now (I started to leave, or a phase runs and the address is read again when it is over).
     *
     * @method takes
     * @param {String} id
     * @param {Object} [info] { time, source }: the time to arrive at, the element that started the jump
     * @return {Boolean}
     */
    function takes(id, info) {

        // Nothing runs: a transition starts if one is set and may run. Leave is over: the change goes on under the cover if it still may.
        var picked   = (state === 'idle' && mayRun()) ? pickLook() : null,
            eligible = (state === 'idle') ? (!!picked && picked.look.kind !== 'none') : mayRun(),
            result   = Rules.route(state, { other: true, eligible: eligible });

        if (result.held && state !== 'idle') { routeHeld = true; }

        switch (result.action) {
            case 'leave':
                startLeave(id, info, picked);
                break;
            case 'switch':
                // The router calls updateHypervideo() next, which reports to switching().
                state = result.state;
                if (ctx) {
                    ctx.to = id;
                    if (info && info.time !== undefined && info.time !== null && !isNaN(parseFloat(info.time))) { ctx.time = parseFloat(info.time); }
                }
                break;
            case 'uncover':
                stop();
                break;
        }

        return result.held;

    }


    /**
     * The address names the open hypervideo, or the overview. I answer whether the router does nothing now (true),
     * as with {{#crossLink "HypervideoTransition/takes:method"}}takes(){{/crossLink}}. During leave this is Back
     * (or the overview): the jump is taken back at once and the router goes on.
     *
     * @method stays
     * @param {Boolean} overview
     * @return {Boolean}
     */
    function stays(overview) {

        var result = Rules.route(state, { other: false, overview: !!overview, eligible: false });

        if (result.held && state !== 'idle') { routeHeld = true; }

        switch (result.action) {
            case 'enter':
                startEnter();
                break;
            case 'uncover':
                stop();
                break;
        }

        return result.held;

    }


    /* ------------------------------------------------------------------ */
    /*  The change of hypervideo reports                                  */
    /* ------------------------------------------------------------------ */

    /**
     * {{#crossLink "HypervideoModel/updateHypervideo:method"}}updateHypervideo(){{/crossLink}} begins.
     * I answer whether my cover is up (then it shows no "Loading …" message).
     *
     * @method switching
     * @param {String} id
     * @return {Boolean}
     */
    function switching(id) {

        expected = id;
        awaited  = true;

        if (state === 'wait') {

            startPhase('wait');
            cover.classList.remove('waiting');
            clearAnimation();
            if (ctx) { ctx.to = id; }
            callTransition('wait');

            return true;

        }

        // A change that did not come through me (a reload, a new hypervideo) ends what is running.
        if (state !== 'idle') { abort(); }

        return false;

    }


    /**
     * The hypervideo is ready. Only the first report of a change counts (an embedded player can report twice).
     *
     * @method arrived
     * @param {String} id
     * @param {Boolean} cameHere The viewer came to it inside the page: by a jump, or from the overview
     */
    function arrived(id, cameHere) {

        if (!awaited || String(id) !== String(expected)) { return; }
        awaited = false;

        var database   = FrameTrail.module('Database'),
            hypervideo = database && database.hypervideo,
            autoplay   = Rules.autoplays({
                cameHere: cameHere === true,
                autoplay: !!(hypervideo && hypervideo.config && hypervideo.config.autoplay === true),
                editMode: FrameTrail.getState('editMode'),
                viewMode: FrameTrail.getState('viewMode')
            });

        if (state !== 'wait') {
            if (autoplay) { FrameTrail.module('HypervideoController').play(); }
            return;
        }

        state = Rules.next(state, 'arrived');
        run++;

        if (autoplay) { pendingPlay = true; }

        // The address decides again: the cover goes out, or a newer jump is taken up under it.
        FrameTrail.module('RouteNavigation').applyRoute();

        if (state === 'arrived') { end(true); }

    }


    /**
     * The hypervideo did not come (an error message, a login that was cancelled): the view is given free.
     *
     * @method failed
     */
    function failed() {

        awaited = false;

        if (state === 'idle') { return; }

        stop();

    }


    /* ------------------------------------------------------------------ */
    /*  Playback                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * {{#crossLink "HypervideoController/play:method"}}play(){{/crossLink}} asks whether to wait:
     * under the cover the hypervideo is changing or not shown yet, so I keep the play() for the end of the transition.
     *
     * @method holdPlay
     * @return {Boolean}
     */
    function holdPlay() {

        if (!Rules.holds(state) || released) { return false; }

        pendingPlay = true;
        return true;

    }


    function onUnload() {

        document.removeEventListener('visibilitychange', onVisibilityChange);

        if (frameID !== null) {
            window.cancelAnimationFrame(frameID);
            frameID = null;
        }

        if (state !== 'idle') { stop(); }

        cover.remove();

    }


    return {

        onChange: {
            // The overview and editing are not what a transition covers.
            viewMode: function(viewMode) { if (viewMode !== 'video') { abort(); } },
            editMode: function(editMode) { if (editMode) { abort(); } }
        },

        onUnload:   onUnload,

        takes:      takes,
        stays:      stays,
        switching:  switching,
        arrived:    arrived,
        failed:     failed,
        abort:      abort,
        looks:      looks,

        holdPlay:   holdPlay,

        /**
         * A pause() takes back a play() that was kept.
         * @method forgetPlay
         */
        forgetPlay: function() { pendingPlay = false; },

        /**
         * A play() is being kept back: the hypervideo under the cover is changing or not shown yet.
         * @attribute holding
         * @readOnly
         */
        get holding() { return Rules.holds(state) && !released; },

        /**
         * The hypervideo on screen is being left: its end is not reported any more.
         * @attribute leaving
         * @readOnly
         */
        get leaving() { return Rules.leaving(state); },

        /**
         * 'idle', 'leave', 'covered', 'wait', 'arrived' or 'enter'.
         * @attribute state
         * @readOnly
         */
        get state() { return state; }

    };

});
