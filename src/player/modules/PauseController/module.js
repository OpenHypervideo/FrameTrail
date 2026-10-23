/**
 * @module Player
 */


/**
 * I am the PauseController. I pause the video at the start of the items that ask for it
 * (frametrail:pause, see FrameTrailSerializer.pausesAtStart()): an overlay, or an annotation
 * while it is shown — in an open content view of the player, or in the phone area while
 * phones are paired.
 *
 * An item pauses when playback crosses its start, or starts at it (an item at 0:00, "Play
 * from here"); seeking into the middle of its time span does not pause. I keep the time of
 * the last tick while playing: a start after it and up to now has been crossed. A seek puts
 * it a little before the new time, so a start right there counts. After a pause it stays
 * where playback stopped, so playing on does not pause again, and a jump back before the
 * start does.
 *
 * A quiz annotation is not paused at here: it goes to the QuizController, which asks it (and
 * pauses when it has frametrail:pause), also when it does not pause.
 *
 * Not on a paired phone (the player decides for it), and not in the editing modes but the
 * Preview.
 *
 * @class PauseController
 * @static
 */


FrameTrail.defineModule('PauseController', function(FrameTrail){

    var Serializer = window.FrameTrailSerializer;

    // A start this far before the time a seek lands on counts as reached (a tick is 0.15 s).
    var AT_START     = 0.25,
    // A step between two ticks longer than this was a jump, not playback (a hidden tab ticks about once a second).
        LONGEST_STEP = 3;

    var lastTime = null;


    function isActive() {
        var editMode = FrameTrail.getState('editMode');
        return !FrameTrail.getState('companion')
            && FrameTrail.getState('viewMode') === 'video'
            && (!editMode || editMode === 'preview');
    }

    function reached(item, from, to) {
        var start = parseFloat(item.data.start);
        return from < start && start <= to;
    }

    /**
     * I say whether an annotation is shown where someone sees it: in a collection view of the
     * player that is on screen, or in one for the phones while a phone is paired.
     *
     * @method isShown
     * @param {Annotation} annotation
     * @return {Boolean}
     */
    function isShown(annotation) {
        var shown   = FrameTrail.module('ViewLayout').viewsShowing(annotation),
            pairing = FrameTrail.getState('pairing');
        return shown.player.length > 0 || (shown.companion.length > 0 && !!pairing && pairing.connected > 0);
    }


    /**
     * I am called by the HypervideoController's low priority updater, while playing and after
     * every seek. I pause at the items whose start playback has reached since the last tick.
     *
     * @method update
     * @param {Number} currentTime
     */
    function update(currentTime) {

        var HypervideoController = FrameTrail.module('HypervideoController'),
            QuizController       = FrameTrail.module('QuizController');

        // A quiz being asked follows the playhead too (left by a seek, a vote decided at its end).
        if (QuizController) { QuizController.update(currentTime); }

        if (!HypervideoController || !HypervideoController.isPlaying) { return; }

        if (lastTime === null || currentTime < lastTime || currentTime - lastTime > LONGEST_STEP) {
            lastTime = currentTime - AT_START;
        }

        var from = lastTime;
        lastTime = currentTime;

        if (!isActive()) { return; }

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            pause           = false;

        HypervideoModel.overlays.forEach(function(overlay) {
            if (reached(overlay, from, currentTime) && Serializer.pausesAtStart(overlay.data)) {
                pause = true;
            }
        });

        HypervideoModel.annotations.forEach(function(annotation) {
            if (!reached(annotation, from, currentTime) || !isShown(annotation)) { return; }
            if (annotation.data.type === 'quiz' && QuizController) {
                QuizController.ask(annotation, { pause: Serializer.pausesAtStart(annotation.data) });
            } else if (Serializer.pausesAtStart(annotation.data)) {
                pause = true;
            }
        });

        if (pause) {
            HypervideoController.pause();
        }

    }

    /**
     * I am told where a seek lands, before the updaters run: a start right there counts as reached.
     *
     * @method seeked
     * @param {Number} time
     */
    function seeked(time) {
        lastTime = time - AT_START;
    }

    /**
     * I forget the last tick (another hypervideo).
     *
     * @method reset
     */
    function reset() {
        lastTime = null;
    }


    return {
        update: update,
        seeked: seeked,
        reset:  reset,
        isShown: isShown
    };

});
