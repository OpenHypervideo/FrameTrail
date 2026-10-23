/**
 * @module Player
 */


/**
 * I am the QuizController. I ask the quizzes of the open hypervideo, count the answers and decide
 * them (FrameTrailQuiz), and do what the decision says.
 *
 * A quiz annotation is asked when playback reaches its start where it is shown (the
 * PauseController calls ask()): it pauses the video when the item has frametrail:pause, else the
 * vote runs while the video plays and is decided when playback crosses the annotation's end.
 * Everyone who sees it may answer: the paired phones whose views show it, and the player when one
 * of its open views does. When phones vote, they are who the quiz waits for (the player may answer
 * too); without phones, the player is. A quiz is decided when everyone it waits for has answered,
 * or when its countdown is over. Pressing play while it waits calls it off; seeking out of it too.
 *
 * After the decision the result is shown for a moment (longer with a text to read), then what the
 * decided answer says happens: playing on, a jump, another hypervideo. "Stay paused" and a link
 * wait for the person at the player (Continue, or play). A decision the player's own click made
 * alone acts at once, and opens a link at once (a browser opens a new tab only for a click).
 *
 * While phones vote, a panel over the video shows the question, the answers counted so far and
 * the countdown (.quizSessionPanel). The phones hear of all of it through the PairingHost
 * (quiz messages, docs/PAIRING.md) and answer through it.
 *
 * A quiz overlay is answered on the video by the person at the player and decided at once.
 *
 * On a paired phone (the companion state) I am the phone's side: I show the question the player
 * asks in a sheet of its own and send its answers.
 *
 * @class QuizController
 * @static
 */


FrameTrail.defineModule('QuizController', function(FrameTrail){

    var Quiz      = window.FrameTrailQuiz,
        labels    = FrameTrail.module('Localization').labels,
        companion = FrameTrail.getState('companion');

    // How long a decision is shown before what follows it happens (ms); longer with a text to read.
    var HOLD          = 3000,
        HOLD_FEEDBACK = 8000,
    // Phones hear of new answers at most this often (ms).
        SEND_EVERY    = 250,
    // The countdown and the hold are looked at this often (ms).
        TICK          = 250,
    // How far past its end a quiz may be before it is left (seconds; a tick is 0.15 s). It is asked at
    // its start or later, so before its start it is left at once (but for rounding).
        SLACK         = 0.3,
        EARLY         = 0.05;

    var session         = null,     // the quiz being asked: see ask()
        queue           = [],       // quizzes that started while another was asked
        overlayAnswered = {},       // quiz overlays answered, by key, until the playhead leaves them
        lastSent        = 0,
        timers          = {},
        panel           = null,
        // On a phone:
        mine            = {},       // this phone's answers, by key
        sheet           = null,
        sheetKey        = null,
        quizAt          = 0;        // when the last question message came


    /* ------------------------------------------------------------------ */
    /*  Helpers                                                           */
    /* ------------------------------------------------------------------ */

    function controller() { return FrameTrail.module('HypervideoController'); }
    function openID()     { var id = FrameTrail.module('RouteNavigation').hypervideoID; return id ? String(id) : null; }

    function attributesOf(data) {
        return (data && data.attributes) || {};
    }

    function overlayOf(data) {
        var overlays = FrameTrail.module('HypervideoModel').overlays || [];
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].data === data) { return overlays[i]; }
        }
        return null;
    }

    function annotationByKey(key) {
        var annotations = FrameTrail.module('HypervideoModel').annotations || [];
        for (var i = 0; i < annotations.length; i++) {
            if (annotations[i].data.type === 'quiz' && Quiz.itemKey(annotations[i].data) === key) { return annotations[i]; }
        }
        return null;
    }

    function phones(statuses) {
        var pairing = FrameTrail.getState('pairing');
        return (pairing && Array.isArray(pairing.phones))
            ? pairing.phones.filter(function(phone) { return statuses.indexOf(phone.status) >= 0; }).map(function(phone) { return phone.id; })
            : [];
    }

    // What a voter chose, as the quiz names it: an answer's text (several for multiSelect), the rating, the text.
    function answerValue(attrs, choice) {
        var answers = Array.isArray(attrs.answers) ? attrs.answers : [];
        switch (Quiz.questionType(attrs)) {
            case 'multipleChoice': return answers[choice] ? answers[choice].text : null;
            case 'multiSelect':    return choice.map(function(index) { return answers[index] ? answers[index].text : null; });
            default:               return choice;
        }
    }

    function isLink(act) {
        return !!act && act.action === 'openUrl' && !!act.target && String(act.target).charAt(0) !== '#';
    }

    function seconds(ms) {
        return Math.max(0, Math.ceil(ms / 1000));
    }

    function format(label) {
        var args = Array.prototype.slice.call(arguments, 1);
        return String(label || '').replace(/%s/g, function() { return args.length ? String(args.shift()) : ''; });
    }

    // The quiz elements of a resource item show the change (ResourceQuiz.refreshQuizState()).
    function refresh(item) {
        if (item && item.resourceItem && typeof item.resourceItem.refreshQuizState === 'function') {
            item.resourceItem.refreshQuizState();
        }
    }


    /* ------------------------------------------------------------------ */
    /*  Asking (on the player)                                            */
    /* ------------------------------------------------------------------ */

    /**
     * I ask a quiz annotation whose start playback has reached where it is shown (PauseController).
     * While another one is asked, it waits its turn.
     *
     * @method ask
     * @param {Annotation} annotation
     * @param {Object} options { pause: pause the video while it is asked (frametrail:pause) }
     */
    function ask(annotation, options) {

        if (companion) { return; }

        if (session) {
            if (session.annotation !== annotation && queue.indexOf(annotation) < 0) { queue.push(annotation); }
            return;
        }

        var shown     = FrameTrail.module('ViewLayout').viewsShowing(annotation),
            countdown = parseFloat(attributesOf(annotation.data).countdown);

        session = {
            key:           Quiz.itemKey(annotation.data),
            annotation:    annotation,
            pause:         !!(options && options.pause),
            onPlayer:      shown.player.length > 0,
            onPhones:      shown.companion.length > 0,
            votes:         new Map(),     // voter (a phone's id, or 'player') → normalized choice
            unknown:       {},            // phones that do not have the quiz
            state:         'open',
            openedAt:      Date.now(),
            endsAt:        (countdown > 0) ? Date.now() + countdown * 1000 : null,
            decision:      null,
            act:           null,
            holdUntil:     null,
            awaitContinue: false,
            linkOpened:    false
        };

        if (session.pause) {
            controller().pause();
        }

        timers.tick = window.setInterval(tick, TICK);

        show();
        broadcast(true);

    }

    // Who the quiz waits for: the phones that show it, else the player.
    function required() {
        var waitFor = session.onPhones
            ? phones(['connected']).filter(function(id) { return !session.unknown[id]; })
            : [];
        if (waitFor.length) { return waitFor; }
        return session.onPlayer ? ['player'] : [];
    }

    // Who takes part: those it waits for, and those who answered.
    function voters() {
        var list = required();
        session.votes.forEach(function(choice, id) { if (list.indexOf(id) < 0) { list.push(id); } });
        return list;
    }

    function phonesVote() {
        return voters().some(function(id) { return id !== 'player'; });
    }

    function checkAnswered(gesture) {

        if (!session || session.state !== 'open') { return; }

        var waitFor = required();

        // Nobody left who could answer (the phones left, the player does not show it): called off, the video stays.
        if (!waitFor.length) {
            cancel();
            return;
        }

        if (waitFor.every(function(id) { return session.votes.has(id); })) {
            decide({ gesture: gesture });
        }

    }

    /**
     * I decide the quiz being asked from the answers it has.
     *
     * @method decide
     * @param {Object} [options] { gesture: the player's own click made the decision }
     */
    function decide(options) {

        if (!session || session.state !== 'open') { return; }

        var attrs    = attributesOf(session.annotation.data),
            votes    = Array.from(session.votes.values()),
            decision = Quiz.decide(attrs, votes),
            act      = Quiz.actionOf(attrs, decision, controller().currentTime),
            alone    = voters().length === 1 && session.votes.has('player'),
            counted  = Quiz.tally(attrs, votes);

        session.state    = 'decided';
        session.decision = decision;
        session.act      = act;
        session.endsAt   = null;

        FrameTrail.triggerEvent('quizDecided', {
            question:     attrs.question,
            questionType: Quiz.questionType(attrs),
            answer:       (decision.index !== null) ? answerValue(attrs, decision.index) : null,
            index:        decision.index,
            reason:       decision.reason,
            correct:      decision.correct,
            counts:       counted.counts,
            votes:        counted.voters,
            voters:       voters().length,
            action:       act.action
        });

        if (act.action === 'pause' && controller().isPlaying) {
            controller().pause();
        }

        // The player's own click decided it: act now, a link opens now (a new tab needs the click).
        if (options && options.gesture && alone) {
            if (isLink(act)) {
                window.open(String(act.target), '_blank', 'noopener');
                session.linkOpened = true;
            }
            if (act.feedback || isLink(act) || act.action === 'pause') {
                session.awaitContinue = true;
            } else {
                run(false);
                return;
            }
        } else if (act.action === 'pause' || (isLink(act) && session.pause)) {
            // Stay paused, or a link to open while paused: the person at the player goes on.
            session.awaitContinue = true;
        } else {
            session.holdUntil = Date.now() + ((act.feedback || isLink(act)) ? HOLD_FEEDBACK : HOLD);
        }

        show();
        broadcast(true);

    }

    /**
     * I do what the decision says, and end the quiz.
     *
     * @method run
     * @param {Boolean} byPlay play was pressed: it plays, I only move where the decision says
     */
    function run(byPlay) {

        if (!session) { return; }

        var ended = session,
            act   = ended.act || { action: '' },
            HC    = controller();

        session = null;
        stop(ended, 'closed');

        switch (act.action) {
            case 'pause':
                // It stayed paused until now: Continue plays on.
                if (!byPlay) { HC.play(); }
                break;
            case 'jumpToTime':
                HC.currentTime = parseFloat(act.target) || 0;
                if (!byPlay) { HC.play(); }
                break;
            case 'jumpToHypervideo':
                ended.annotation.resourceItem.executeOverlayAction({ action: 'jumpToHypervideo', actionTarget: act.target, actionTargetTime: act.targetTime });
                break;
            case 'openUrl':
                if (!isLink(act)) {
                    ended.annotation.resourceItem.executeOverlayAction({ action: 'openUrl', actionTarget: act.target });
                    break;
                }
                if (!byPlay && ended.pause) { HC.play(); }
                break;
            default:
                if (!byPlay && ended.pause) { HC.play(); }
        }

        askNext();

    }

    /**
     * I call off the quiz being asked: nothing it says happens, the video stays as it is.
     *
     * @method cancel
     */
    function cancel() {
        if (!session) { return; }
        var ended = session;
        session = null;
        queue = [];
        stop(ended, 'cancelled');
    }

    function stop(ended, status) {
        window.clearInterval(timers.tick);
        window.clearTimeout(timers.send);
        timers.tick = timers.send = null;
        var Host = FrameTrail.module('PairingHost');
        if (Host && Host.sendQuiz && openID()) {
            Host.sendQuiz({ type: 'quiz', hypervideo: openID(), item: ended.key, status: status, answered: ended.votes.size, voters: ended.votes.size });
        }
        show();
        refresh(ended.annotation);
    }

    // The next quiz that started while another was asked, if playback is still in it.
    function askNext() {
        var now = controller().currentTime;
        while (queue.length) {
            var next = queue.shift();
            if (next.data.start <= now + SLACK && next.data.end >= now) {
                ask(next, { pause: window.FrameTrailSerializer.pausesAtStart(next.data) });
                return;
            }
        }
    }

    // The countdown and the hold, and the clock on the panel.
    function tick() {
        if (!session) { return; }
        var now = Date.now();
        if (session.state === 'open' && session.endsAt && now >= session.endsAt) {
            decide();
            return;
        }
        if (session.state === 'decided' && session.holdUntil && now >= session.holdUntil) {
            run(false);
            return;
        }
        if (session.endsAt || session.holdUntil) {
            show();
        }
    }

    /**
     * I am called by the PauseController on every update of the HypervideoController (playing,
     * and after seeks): a quiz left by a seek is called off, a vote while playing is decided at its
     * end, an answered quiz overlay may be answered again once the playhead left it.
     *
     * @method update
     * @param {Number} currentTime
     */
    function update(currentTime) {

        if (companion) { return; }

        Object.keys(overlayAnswered).forEach(function(key) {
            var overlay = overlayAnswered[key].overlay;
            if (currentTime < overlay.data.start - EARLY || currentTime > overlay.data.end + SLACK) {
                delete overlayAnswered[key];
                refresh(overlay);
            }
        });

        if (!session) { return; }

        var HC    = controller(),
            start = parseFloat(session.annotation.data.start),
            end   = parseFloat(session.annotation.data.end);

        if (session.state === 'open') {
            if (!session.pause && HC.isPlaying && currentTime >= end && currentTime - end < 1) {
                decide();
                return;
            }
            if (currentTime < start - EARLY || currentTime > end + SLACK) {
                cancel();
                return;
            }
            // Played without play() (a click into a YouTube or Vimeo player).
            if (session.pause && HC.isPlaying && Date.now() - session.openedAt > 1000) {
                cancel();
                return;
            }
        } else if (session.pause && (currentTime < start - EARLY || currentTime > end + SLACK)) {
            // Decided, and the viewer went elsewhere before going on: what it said no longer happens.
            var ended = session;
            session = null;
            stop(ended, 'closed');
            return;
        }

        tick();

    }

    /**
     * I am told that play was pressed (HypervideoController.play(), also a phone's request): a quiz
     * that waits for answers is called off, a decided one goes on now.
     *
     * @method playRequested
     */
    function playRequested() {
        if (companion || !session) { return; }
        if (session.state === 'open') {
            if (session.pause) { cancel(); }
        } else {
            run(true);
        }
    }

    // The person at the player goes on after a decision.
    function proceed() {
        if (session && session.state === 'decided') { run(false); }
    }

    function openLink() {
        if (!session || !isLink(session.act)) { return; }
        window.open(String(session.act.target), '_blank', 'noopener');
        session.linkOpened = true;
        show();
    }


    /* ------------------------------------------------------------------ */
    /*  Answers                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * I take an answer given on this device (ResourceQuiz): on the player to the quiz being asked
     * or a quiz overlay, on a phone to the player.
     *
     * @method answer
     * @param {Resource} resourceItem the quiz's ResourceQuiz
     * @param {*} choice
     */
    function answer(resourceItem, choice) {

        var data       = resourceItem.resourceData,
            attrs      = attributesOf(data),
            normalized = Quiz.normalizeChoice(attrs, choice),
            key        = Quiz.itemKey(data);

        if (normalized === null) { return; }

        if (companion) {
            var question = companion.quiz;
            if (!question || question.item !== key || question.status !== 'open') { return; }
            mine[key] = normalized;
            companion.answer(key, normalized);
            refresh(annotationByKey(key));
            return;
        }

        var overlay = overlayOf(data);
        if (overlay) {
            answerOverlay(overlay, normalized);
            return;
        }

        if (!session || session.state !== 'open' || session.annotation.data !== data || !session.onPlayer) { return; }

        session.votes.set('player', normalized);
        emitAnswered(attrs, normalized, 'player');
        show();
        broadcast(false);
        checkAnswered(true);

    }

    /**
     * I take a phone's answer (PairingHost): to the quiz being asked, the phone's latest counts.
     *
     * @method phoneAnswer
     * @param {String} phoneID
     * @param {Object} message the answer message
     */
    function phoneAnswer(phoneID, message) {

        if (!session || session.state !== 'open' || message.item !== session.key) { return; }

        if (message.unknown === true) {
            session.unknown[phoneID] = true;
        } else {
            var attrs      = attributesOf(session.annotation.data),
                normalized = Quiz.normalizeChoice(attrs, message.choice);
            if (normalized === null) { return; }
            session.votes.set(phoneID, normalized);
            emitAnswered(attrs, normalized, 'phone');
        }

        show();
        broadcast(false);
        checkAnswered(false);

    }

    function emitAnswered(attrs, choice, source) {
        FrameTrail.triggerEvent('quizAnswered', {
            question:     attrs.question,
            questionType: Quiz.questionType(attrs),
            answer:       answerValue(attrs, choice),
            correct:      Quiz.correctOf(attrs, choice),
            source:       source
        });
    }

    // A quiz overlay: the person at the player answers, alone, and it is decided at once.
    function answerOverlay(overlay, choice) {

        var key   = Quiz.itemKey(overlay.data),
            attrs = attributesOf(overlay.data);

        if (overlayAnswered[key]) { return; }

        var decision = Quiz.decide(attrs, [choice]),
            act      = Quiz.actionOf(attrs, decision, controller().currentTime),
            entry    = { overlay: overlay, choice: choice, decision: decision, act: act, awaitContinue: false };

        overlayAnswered[key] = entry;
        emitAnswered(attrs, choice, 'player');

        if (isLink(act)) {
            window.open(String(act.target), '_blank', 'noopener');
        }
        if (act.feedback || isLink(act) || act.action === 'pause') {
            entry.awaitContinue = true;
            refresh(overlay);
            return;
        }

        refresh(overlay);
        runOverlay(entry);

    }

    function runOverlay(entry) {

        var act = entry.act,
            HC  = controller();

        entry.awaitContinue = false;
        refresh(entry.overlay);

        switch (act.action) {
            case 'pause':
                HC.play();
                break;
            case 'jumpToTime':
                HC.currentTime = parseFloat(act.target) || 0;
                HC.play();
                break;
            case 'jumpToHypervideo':
                entry.overlay.resourceItem.executeOverlayAction({ action: 'jumpToHypervideo', actionTarget: act.target, actionTargetTime: act.targetTime });
                break;
            case 'openUrl':
                if (!isLink(act)) {
                    entry.overlay.resourceItem.executeOverlayAction({ action: 'openUrl', actionTarget: act.target });
                } else {
                    HC.play();
                }
                break;
            default:
                HC.play();
        }

    }


    /* ------------------------------------------------------------------ */
    /*  What a quiz shows                                                 */
    /* ------------------------------------------------------------------ */

    /**
     * I say what a quiz element shows and allows (ResourceQuiz.refreshQuizState()):
     * { canAnswer, yours, decided, status, result }. result is the element below the answers
     * (the decision's text and buttons), or null.
     *
     * @method stateOf
     * @param {Resource} resourceItem
     * @return {Object}
     */
    function stateOf(resourceItem) {

        var data  = resourceItem.resourceData,
            attrs = attributesOf(data),
            key   = Quiz.itemKey(data);

        if (companion) {
            var question = companion.quiz;
            if (!question || question.item !== key || question.status === 'closed' || question.status === 'cancelled') {
                return { canAnswer: false, status: labels['QuizNotYet'] };
            }
            var open = question.status === 'open';
            return {
                canAnswer: open,
                yours:     mine[key],
                decided:   open ? null : { index: (question.decided === undefined) ? null : question.decided },
                status:    open ? phoneStatus(question, mine[key] !== undefined) : decidedText(attrs, question.decided),
                result:    (!open && question.feedback) ? resultElement(question.feedback, []) : null
            };
        }

        var overlay = overlayOf(data);
        if (overlay) {
            var entry = overlayAnswered[key];
            if (!entry) { return { canAnswer: true }; }
            return {
                canAnswer: false,
                yours:     entry.choice,
                decided:   entry.decision,
                status:    '',
                result:    entry.awaitContinue ? resultElement(entry.act.feedback, [{ label: labels['GenericContinue'], click: function() { runOverlay(entry); } }]) : null
            };
        }

        if (!session || session.annotation.data !== data) {
            return { canAnswer: false, status: labels['QuizNotYet'] };
        }

        return {
            canAnswer: session.state === 'open' && session.onPlayer,
            yours:     session.votes.get('player'),
            decided:   (session.state === 'decided') ? session.decision : null,
            status:    statusText(),
            result:    (session.state === 'decided') ? resultOfSession() : null
        };

    }

    // n of m answered, and the time left.
    function statusText() {
        if (session.state === 'decided') {
            return phonesVote() ? decidedText(attributesOf(session.annotation.data), session.decision.index) : '';
        }
        var parts = [];
        if (phonesVote()) {
            parts.push(format(labels['QuizAnsweredCount'], countAnswered(), voters().length));
        }
        if (session.endsAt) {
            parts.push(format(labels['QuizSecondsLeft'], seconds(session.endsAt - Date.now())));
        }
        return parts.join(' · ');
    }

    function countAnswered() {
        var list = voters(), count = 0;
        session.votes.forEach(function(choice, id) { if (list.indexOf(id) >= 0) { count++; } });
        return count;
    }

    function decidedText(attrs, index) {
        var answers = Array.isArray(attrs.answers) ? attrs.answers : [];
        return (Quiz.questionType(attrs) === 'multipleChoice' && answers[index]) ? format(labels['QuizDecided'], answers[index].text) : '';
    }

    function phoneStatus(question, answered) {
        var parts = [];
        if (answered) {
            parts.push(format(labels['QuizAnsweredCount'], question.answered, question.voters));
        }
        if (question.endsIn !== undefined) {
            parts.push(format(labels['QuizSecondsLeft'], seconds(question.endsIn - (Date.now() - quizAt))));
        }
        return parts.join(' · ');
    }

    // The decision's text and its buttons, on the player.
    function resultOfSession() {
        var act     = session.act,
            buttons = [];
        if (isLink(act)) {
            buttons.push({ label: labels['QuizOpenLink'], click: openLink, main: !session.linkOpened });
        }
        if (session.awaitContinue) {
            buttons.push({ label: labels['GenericContinue'], click: proceed, main: !isLink(act) || session.linkOpened });
        } else if (session.holdUntil) {
            buttons.push({ label: format(labels['QuizContinueNow'], seconds(session.holdUntil - Date.now())), click: proceed });
        }
        return resultElement(act.feedback, buttons);
    }

    function resultElement(feedback, buttons) {
        if (!feedback && !buttons.length) { return null; }
        var element = document.createElement('div');
        element.className = 'quizResultBlock';
        if (feedback) {
            var text = document.createElement('p');
            text.className = 'quizFeedback';
            text.textContent = feedback;
            element.appendChild(text);
        }
        buttons.forEach(function(spec) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'quizResultButton' + (spec.main ? ' main' : '');
            button.textContent = spec.label;
            button.addEventListener('click', function(evt) {
                evt.stopPropagation();
                spec.click();
            });
            element.appendChild(button);
        });
        return element;
    }


    /* ------------------------------------------------------------------ */
    /*  The panel over the video (while phones vote)                      */
    /* ------------------------------------------------------------------ */

    function show() {
        if (session) { refresh(session.annotation); }
        renderPanel();
    }

    function renderPanel() {

        var ViewVideo = FrameTrail.module('ViewVideo'),
            host      = ViewVideo && ViewVideo.Hypervideo;

        if (!session || !session.onPhones || !phonesVote() || !host) {
            if (panel) { panel.remove(); panel = null; }
            return;
        }

        if (!panel || panel.parentElement !== host) {
            if (panel) { panel.remove(); }
            panel = document.createElement('div');
            panel.className = 'quizSessionPanel';
            host.appendChild(panel);
        }

        var attrs   = attributesOf(session.annotation.data),
            type    = Quiz.questionType(attrs),
            votes   = [],
            answers = Array.isArray(attrs.answers) ? attrs.answers : [];

        session.votes.forEach(function(choice) { votes.push(choice); });

        var counted = Quiz.tally(attrs, votes),
            most    = Math.max.apply(null, [1].concat(counted.counts)),
            decided = (session.state === 'decided') ? session.decision : null;

        panel.innerHTML = '';
        panel.classList.toggle('decided', !!decided);

        var question = document.createElement('div');
        question.className = 'quizSessionQuestion';
        question.textContent = attrs.question || '';
        panel.appendChild(question);

        if (type !== 'freeText') {
            var rows = document.createElement('div');
            rows.className = 'quizSessionRows';
            counted.counts.forEach(function(count, i) {
                var row   = document.createElement('div'),
                    label = document.createElement('span'),
                    bar   = document.createElement('span'),
                    fill  = document.createElement('span'),
                    value = document.createElement('span');
                row.className   = 'quizSessionRow';
                label.className = 'quizSessionLabel';
                bar.className   = 'quizSessionBar';
                value.className = 'quizSessionCount';
                label.textContent = (type === 'rating') ? String(i + 1) : ((answers[i] && answers[i].text) || '');
                fill.style.width  = (100 * count / most) + '%';
                value.textContent = String(count);
                if (decided && decided.index === i) { row.classList.add('decided'); }
                if (decided && type !== 'rating' && answers[i] && answers[i].correct === true && Quiz.correctOf(attrs, i) !== null) { row.classList.add('correct'); }
                bar.appendChild(fill);
                row.appendChild(label);
                row.appendChild(bar);
                row.appendChild(value);
                rows.appendChild(row);
            });
            panel.appendChild(rows);
        }

        var status = document.createElement('div');
        status.className = 'quizSessionStatus';
        var parts = [format(labels['QuizAnsweredCount'], countAnswered(), voters().length)];
        if (type === 'rating' && counted.average !== null) {
            parts.push(format(labels['QuizAverage'], (Math.round(counted.average * 10) / 10).toLocaleString()));
        }
        if (session.endsAt) {
            parts.push(format(labels['QuizSecondsLeft'], seconds(session.endsAt - Date.now())));
        }
        status.textContent = parts.join(' · ');
        panel.appendChild(status);

        if (decided) {
            var text = decidedText(attrs, decided.index);
            if (text) {
                var decision = document.createElement('div');
                decision.className = 'quizSessionDecision';
                decision.textContent = text;
                panel.appendChild(decision);
            }
            var result = resultOfSession();
            if (result) { panel.appendChild(result); }
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Phones                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * The question message for the phones, or null when none is asked.
     *
     * @method quizMessage
     * @return {Object|null}
     */
    function quizMessage() {
        if (companion || !session || !openID()) { return null; }
        var message = { type: 'quiz', hypervideo: openID(), item: session.key, status: session.state, answered: countAnswered(), voters: voters().length };
        if (session.endsAt) { message.endsIn = Math.max(0, session.endsAt - Date.now()); }
        if (session.state === 'decided') {
            if (session.decision.index !== null) { message.decided = session.decision.index; }
            if (session.act.feedback) { message.feedback = session.act.feedback; }
        }
        return message;
    }

    // The phones hear of the change: at once for a new state, new answers at most every SEND_EVERY.
    function broadcast(now) {
        var Host = FrameTrail.module('PairingHost');
        if (!Host || !Host.sendQuiz) { return; }
        var wait = SEND_EVERY - (Date.now() - lastSent);
        if (!now && wait > 0) {
            if (!timers.send) {
                timers.send = window.setTimeout(function() { timers.send = null; broadcast(true); }, wait);
            }
            return;
        }
        window.clearTimeout(timers.send);
        timers.send = null;
        lastSent = Date.now();
        var message = quizMessage();
        if (message) { Host.sendQuiz(message); }
    }

    function pairingChanged() {
        if (companion || !session) { return; }
        // Answers of phones that are gone for good no longer count (one that may come back keeps its answer).
        var known = phones(['connected', 'reconnecting']);
        session.votes.forEach(function(choice, id) {
            if (id !== 'player' && known.indexOf(id) < 0) { session.votes.delete(id); }
        });
        show();
        broadcast(false);
        checkAnswered(false);
    }


    /* ------------------------------------------------------------------ */
    /*  On a phone                                                        */
    /* ------------------------------------------------------------------ */

    // The player's question changed: the sheet opens, shows the state, or closes.
    function questionChanged() {

        var question = companion.quiz;
        quizAt = Date.now();

        if (!question || question.status === 'closed' || question.status === 'cancelled') {
            closeSheet();
            return;
        }

        var annotation = annotationByKey(question.item);

        if (!annotation) {
            // Another version of the hypervideo is shown here: the player need not wait for this phone.
            companion.answer(question.item, { unknown: true });
            closeSheet();
            return;
        }

        if (sheetKey !== question.item) {
            closeSheet();
            // Asked again (a jump back): this phone has not answered yet.
            if (question.status === 'open') { delete mine[question.item]; }
            openSheet(annotation, question.item);
        }

        refresh(annotation);

    }

    function openSheet(annotation, key) {

        var content = document.createElement('div');
        content.className = 'quizSheet';
        content.appendChild(annotation.resourceItem.renderContent());

        sheetKey = key;
        sheet = Dialog({
            content:       content,
            modal:         true,
            titlebar:      false,
            closeOnEscape: false,
            resizable:     false,
            classes:       'quizSheetDialog',
            inheritTheme:  document.querySelector(FrameTrail.getState('target'))
        });

        window.clearInterval(timers.sheet);
        timers.sheet = window.setInterval(function() {
            var question = companion.quiz;
            if (question && question.status === 'open' && question.endsIn !== undefined) { refresh(annotation); }
        }, 500);

    }

    function closeSheet() {
        window.clearInterval(timers.sheet);
        timers.sheet = null;
        if (sheetKey) {
            refresh(annotationByKey(sheetKey));
        }
        if (sheet) {
            var old = sheet;
            sheet = null;
            try { old.destroy(); } catch (e) { /* gone */ }
        }
        sheetKey = null;
    }


    /* ------------------------------------------------------------------ */

    /**
     * I end everything (another hypervideo, editing, the overview): a quiz being asked is called off.
     *
     * @method reset
     */
    function reset() {
        queue = [];
        cancel();
        overlayAnswered = {};
        window.clearInterval(timers.tick);
        window.clearTimeout(timers.send);
        timers.tick = timers.send = null;
        if (panel) { panel.remove(); panel = null; }
    }

    if (companion) {
        companion.subscribe(function(event) {
            if (event.type === 'quiz') { questionChanged(); }
        });
    }


    return {

        onChange: {
            pairing:  pairingChanged,
            editMode: function(editMode) { if (editMode && editMode !== 'preview') { reset(); } },
            viewMode: function(viewMode) { if (viewMode !== 'video') { reset(); } }
        },

        onUnload: function() {
            reset();
            closeSheet();
        },

        ask:           ask,
        update:        update,
        playRequested: playRequested,
        answer:        answer,
        phoneAnswer:   phoneAnswer,
        quizMessage:   quizMessage,
        stateOf:       stateOf,
        reset:         reset

    };

});
