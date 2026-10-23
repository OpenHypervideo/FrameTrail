/**
 * @module Companion
 */


/**
 * I am the CompanionLauncher: the phone's side of pairing (docs/PAIRING.md),
 * started by companion.html.
 *
 * The page is opened from the QR code a player shows; its fragment holds the
 * room, the broker and the fingerprint of the player's certificate
 * (FrameTrailPairing.parseJoin). I offer a WebRTC connection into the room,
 * check that the answer carries that fingerprint, and keep the DataChannel
 * across hypervideos: each bundle the player sends starts a player instance
 * of its own (the previous one destroyed) with the companion state, my link:
 * it plays no video, follows the player's playhead (createClock), shows the
 * hypervideo's views for phones and turns play, pause and seeks into
 * requests, which the player carries out if this phone may control it.
 *
 * Around the player I draw the screens of the connection (connecting,
 * waiting, refused, lost, …) and a chip that says whether it is paired, keep
 * the screen awake while it is (Wake Lock), and come back after a dropped
 * connection with the resume token, for two minutes.
 *
 * A private instance serves its media to me only with the pairing grant the
 * player gives me and renews: I keep it as a cookie for the instance's
 * resources (FrameTrailPairing.grantCookie), which its media requests then
 * carry. That helps only where this page is on the instance's own origin.
 *
 * The page's Content Security Policy allows only its own scripts, and the
 * bundle comes without code: nothing an author wrote runs on the phone.
 *
 * @class CompanionLauncher
 * @static
 */

FrameTrail.defineModule('CompanionLauncher', function(FrameTrail){

    var Pairing = window.FrameTrailPairing;

    var STORE              = 'frametrail-pairing',
        RECONNECT_INTERVAL = 3000,      // ms between attempts after the connection dropped
        RECONNECT_WINDOW   = 120000,    // ms the player keeps the room open for this phone
        OPEN_TIMEOUT       = 20000,     // ms from the answer to an open channel
        PING_INTERVAL      = 2000,
        SEEK_COALESCE      = 100;       // ms: a drag on the progress bar sends one seek per moment

    // What lies behind a screen, for whoever looks into it (the console); the screens say it in plain words.
    var REASONS = {
        failed:      'no connection to the player came about. The phone and the player may not reach each other: a network that keeps its devices apart needs a TURN relay (docs/PAIRING.md).',
        fingerprint: 'the answer did not come from the player whose code was scanned (its certificate has another fingerprint).',
        version:     'this page and the player are different versions of FrameTrail.',
        invalid:     'there is no pairing link in this address (#pair=…).',
        noWebRTC:    'this browser has no WebRTC.'
    };

    FrameTrail.initModule('Localization');

    var Localization = FrameTrail.module('Localization'),
        labels       = Localization.labels,
        language     = String(navigator.language || 'en').slice(0, 2).toLowerCase();

    if (window.FrameTrail_L10n[language]) {
        Localization.setLanguage(language);
    }

    var targetElement = document.querySelector(FrameTrail.getState('target')),
        header, title, chip, stage, screen, emptyNote;

    var join        = null,
        guestID     = null,
        resume      = null,
        broker      = null,
        pc          = null,
        channel     = null,
        attempt     = 0,
        phase       = 'connecting',
        paired      = false,     // the channel was open and welcomed at least once
        ended       = false,     // nothing more to try
        lostAt      = 0,
        canControl  = false,
        assembler   = Pairing.createAssembler(),
        clock       = Pairing.createClock(),
        lastState   = null,
        rtt         = 0,
        pings       = {},
        pingCount   = 0,
        subscribers = [],
        payload     = null,
        player      = null,
        playerCount = 0,
        playerReady = false,
        overview    = false,
        grant       = null,      // the pairing grant the player gave last, to remove its cookie when pairing ends
        lastQuiz    = null,      // the player's last question message (kept across players: the phone's player reads it when it is ready)
        unknownSent = {},        // questions this phone said it does not have, once each
        wakeLock    = null,
        pendingSeek = null,
        timers      = {};


    /* ------------------------------------------------------------------ */
    /*  The link: what the phone's player reads (the companion state)     */
    /* ------------------------------------------------------------------ */

    var link = {

        // May this phone play, pause and seek the player?
        get canControl() { return canControl; },

        // The player's last state for the hypervideo shown here, or null.
        get state() { return (lastState && payload && lastState.hypervideo === String(payload.bundle.id)) ? lastState : null; },

        // The time span of the hypervideo shown (the player's, which knows its video's duration).
        get offsetIn() { return payload ? (payload.offsetIn || 0) : 0; },
        get duration() { return payload ? (payload.duration || 0) : 0; },

        // The player's playhead now, extrapolated.
        time: function() {
            var t = link.state ? clock.time(Date.now()) : null;
            return (t === null) ? link.offsetIn : t;
        },

        request: request,

        // The player's question for the hypervideo shown here (a quiz message, docs/PAIRING.md), or null.
        get quiz() { return (lastQuiz && payload && lastQuiz.hypervideo === String(payload.bundle.id)) ? lastQuiz : null; },

        answer: answer,

        // fn({ type: 'state', moved }), fn({ type: 'control' }) or fn({ type: 'quiz' }); returns the unsubscribe function.
        subscribe: function(fn) {
            subscribers.push(fn);
            return function() {
                var index = subscribers.indexOf(fn);
                if (index >= 0) { subscribers.splice(index, 1); }
            };
        }

    };

    function notify(event) {
        subscribers.slice().forEach(function(fn) {
            try { fn(event); } catch (e) { console.error('FrameTrail companion:', e); }
        });
    }

    /**
     * I send the answer to the player's question: a choice, or { unknown: true } when this phone does not have
     * the question (once per question). Every phone may answer, without the control right.
     */
    function answer(item, choice) {

        if (!payload || !channel || channel.readyState !== 'open') { return false; }

        var message = { type: 'answer', hypervideo: String(payload.bundle.id), item: String(item) };

        if (choice && !Array.isArray(choice) && typeof choice === 'object' && choice.unknown === true) {
            if (unknownSent[message.item]) { return true; }
            unknownSent[message.item] = true;
            message.unknown = true;
        } else {
            message.choice = choice;
        }

        send(message);
        return true;

    }

    function request(action, time) {

        if (!canControl || !channel || channel.readyState !== 'open') { return false; }

        if (action === 'seek') {
            if (timers.seek) {
                pendingSeek = time;
                return true;
            }
            send({ type: 'request', action: 'seek', time: time });
            timers.seek = window.setTimeout(function() {
                timers.seek = null;
                if (pendingSeek !== null) {
                    var next = pendingSeek;
                    pendingSeek = null;
                    request('seek', next);
                }
            }, SEEK_COALESCE);
            return true;
        }

        send({ type: 'request', action: action });
        return true;

    }


    /* ------------------------------------------------------------------ */
    /*  Screens                                                           */
    /* ------------------------------------------------------------------ */

    function build() {

        targetElement.classList.add('companionPage');
        targetElement.setAttribute('data-frametrail-theme', 'classic');

        header = document.createElement('div');
        header.className = 'companionHeader';
        header.innerHTML = '<div class="companionTitle"></div><div class="companionChip"></div>';
        title = header.querySelector('.companionTitle');
        chip  = header.querySelector('.companionChip');

        stage = document.createElement('div');
        stage.className = 'companionStage';

        screen = document.createElement('div');
        screen.className = 'companionScreen';

        emptyNote = document.createElement('div');
        emptyNote.className = 'companionEmpty';
        emptyNote.textContent = labels['CompanionNoViews'];
        emptyNote.style.display = 'none';

        stage.appendChild(emptyNote);
        stage.appendChild(screen);
        targetElement.appendChild(header);
        targetElement.appendChild(stage);

        screen.addEventListener('click', function(event) {
            if (event.target.closest('.companionRetry')) { retry(); }
        });

    }

    var SCREENS = {
        connecting:   { label: 'CompanionConnecting',   busy: true },
        waiting:      { label: 'CompanionWaiting',      busy: true },
        loading:      { label: 'CompanionLoading',      busy: true },
        reconnecting: { label: 'CompanionReconnecting', busy: true },
        overview:     { label: 'CompanionOverview' },
        full:         { label: 'CompanionRefusedFull',  retry: true },
        closed:       { label: 'CompanionClosed' },
        version:      { label: 'CompanionVersion' },
        ended:        { label: 'CompanionEnded' },
        failed:       { label: 'CompanionFailed',       retry: true },
        fingerprint:  { label: 'CompanionFingerprint' },
        invalid:      { label: 'CompanionInvalid' },
        noWebRTC:     { label: 'CompanionNoWebRTC' }
    };

    function show(newPhase) {

        phase = newPhase;

        var spec = (phase === 'connected') ? null : SCREENS[phase];

        if (spec) {
            screen.innerHTML = (spec.busy ? '<div class="workingSpinner"></div>' : '<span class="icon-mobile-1"></span>')
                             + '<p>' + labels[spec.label] + '</p>'
                             + (spec.retry ? '<button type="button" class="companionRetry">' + labels['CompanionTryAgain'] + '</button>' : '');
            screen.classList.toggle('busy', !!spec.busy);
            screen.style.display = '';
        } else {
            screen.style.display = 'none';
        }

        chip.className = 'companionChip ' + ((phase === 'connected' || phase === 'overview' || phase === 'loading') ? 'paired' : (phase === 'reconnecting' ? 'reconnecting' : ''));
        chip.textContent = (phase === 'connected' || phase === 'overview' || phase === 'loading')
                         ? labels['CompanionChipPaired'] + (canControl ? '' : ' · ' + labels['CompanionChipViewOnly'])
                         : (phase === 'reconnecting' ? labels['CompanionChipReconnecting'] : '');

        keepAwake(phase === 'connected' || phase === 'overview' || phase === 'loading');

    }

    // The screen stays on while paired (the phone is something to look at, not to touch).
    function keepAwake(on) {
        if (!navigator.wakeLock) { return; }
        if (on && !wakeLock && document.visibilityState === 'visible') {
            navigator.wakeLock.request('screen').then(function(lock) {
                wakeLock = lock;
                lock.addEventListener('release', function() { wakeLock = null; });
            }).catch(function() { /* refused: battery saver, no permission */ });
        } else if (!on && wakeLock) {
            wakeLock.release().catch(function() {});
            wakeLock = null;
        }
    }

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            keepAwake(phase === 'connected' || phase === 'overview' || phase === 'loading');
        }
    });


    /* ------------------------------------------------------------------ */
    /*  Connecting                                                        */
    /* ------------------------------------------------------------------ */

    function readStore() {
        try { return JSON.parse(window.sessionStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
    }

    function writeStore() {
        try { window.sessionStorage.setItem(STORE, JSON.stringify({ join: join, guest: guestID, resume: resume })); } catch (e) { /* private mode */ }
    }

    function failure(code) {
        var error = new Error(code);
        error.code = code;
        return error;
    }

    function explain(code, cause) {
        var text = 'FrameTrail companion: ' + (REASONS[code] || 'could not connect to the player (' + code + ').');
        // My own failure() says no more than its code.
        if (cause && cause.message !== code) { console.warn(text, cause); } else { console.warn(text); }
    }

    /**
     * I offer a connection into the player's room and wait for its answer.
     */
    function connect() {

        var mine = ++attempt;

        closeConnection();
        show(paired ? 'reconnecting' : 'connecting');

        broker = Pairing.brokerClient(join.broker);

        broker.ice().catch(function(error) {
            if (error.code === 'network') { throw error; }
            return [];
        }).then(function(iceServers) {
            if (mine !== attempt) { throw failure('stale'); }
            pc = new RTCPeerConnection({ iceServers: iceServers });
            channel = pc.createDataChannel(Pairing.CHANNEL.label, { negotiated: Pairing.CHANNEL.negotiated, id: Pairing.CHANNEL.id });
            wire(pc, channel, mine);
            return pc.createOffer();
        }).then(function(description) {
            return pc.setLocalDescription(description);
        }).then(function() {
            return Pairing.gatherComplete(pc);
        }).then(function() {
            if (mine !== attempt) { throw failure('stale'); }
            return broker.postOffer(join.room, guestID, Pairing.offerBlob(pc.localDescription.sdp, Pairing.deviceLabel(navigator.userAgent)));
        }).then(function() {
            if (!paired) { show('waiting'); }
            return Pairing.pollAnswer(broker, join.room, guestID);
        }).then(function(blob) {
            if (mine !== attempt) { throw failure('stale'); }
            var answer = Pairing.readAnswer(blob);
            if (!answer) { throw failure('failed'); }
            if (answer.refused) { throw failure(answer.refused === 'full' ? 'full' : answer.refused); }
            // Only the player whose code was scanned holds the certificate of this fingerprint.
            if (!Pairing.checkFingerprint(answer.sdp, join.fp)) { throw failure('fingerprint'); }
            return pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
        }).then(function() {
            timers.open = window.setTimeout(function() {
                if (mine === attempt && (!channel || channel.readyState !== 'open')) { failed(mine, failure('failed')); }
            }, OPEN_TIMEOUT);
        }).catch(function(error) {
            failed(mine, error);
        });

    }

    function failed(mine, error) {

        if (mine !== attempt || ended || (error && error.code === 'stale')) { return; }

        var code = (error && error.code) || 'failed';

        if (code === 'version' || code === 'fingerprint') {
            ended = true;
            attempt++;
            closeConnection();
            explain(code, error);
            show(code);
            return;
        }

        // Within the window after a drop the player opens its room again: keep trying.
        if (paired && Date.now() - lostAt < RECONNECT_WINDOW) {
            show('reconnecting');
            window.clearTimeout(timers.retry);
            timers.retry = window.setTimeout(connect, RECONNECT_INTERVAL);
            return;
        }

        // Giving up: what the closing connection reports afterwards is not news.
        attempt++;
        closeConnection();

        if (code === 'noRoom' || code === 'closed') {
            show('closed');
        } else if (code === 'full') {
            show('full');
        } else {
            explain(code, error);
            show('failed');
        }

    }

    function retry() {
        ended = false;
        lostAt = Date.now();
        connect();
    }

    function wire(connection, dataChannel, mine) {

        dataChannel.addEventListener('open', function() {
            if (mine !== attempt) { return; }
            window.clearTimeout(timers.open);
            send({ type: 'hello', v: Pairing.PROTOCOL_VERSION, guest: guestID, resume: resume || undefined, label: Pairing.deviceLabel(navigator.userAgent) });
        });

        dataChannel.addEventListener('message', function(event) {
            if (mine === attempt && typeof event.data === 'string') { receive(event.data); }
        });

        dataChannel.addEventListener('close', function() {
            if (mine === attempt) { lost(); }
        });

        connection.addEventListener('connectionstatechange', function() {
            if (mine === attempt && (connection.connectionState === 'failed' || connection.connectionState === 'closed')) { lost(); }
        });

    }

    function closeConnection() {
        window.clearTimeout(timers.open);
        window.clearInterval(timers.ping);
        if (channel) { try { channel.close(); } catch (e) { /* closed */ } }
        if (pc) { try { pc.close(); } catch (e) { /* closed */ } }
        channel = null;
        pc = null;
    }

    // The connection dropped: try to come back while the player waits for us.
    function lost() {
        if (ended || (phase === 'reconnecting' && !pc)) { return; }
        closeConnection();
        if (!paired) {
            failed(attempt, failure('failed'));
            return;
        }
        lostAt = Date.now();
        show('reconnecting');
        window.clearTimeout(timers.retry);
        timers.retry = window.setTimeout(connect, 500);
    }

    function send(message) {
        if (channel && channel.readyState === 'open') {
            channel.send(Pairing.encode(message));
        }
    }


    /* ------------------------------------------------------------------ */
    /*  What the player says                                              */
    /* ------------------------------------------------------------------ */

    function receive(text) {

        var message = Pairing.decode(text, 'host');

        if (!message) { return; }

        switch (message.type) {

            case 'welcome':
                if (message.v !== Pairing.PROTOCOL_VERSION) {
                    ended = true;
                    closeConnection();
                    explain('version', 'The player speaks pairing protocol version ' + message.v + ', this page ' + Pairing.PROTOCOL_VERSION + '.');
                    show('version');
                    return;
                }
                paired     = true;
                resume     = message.resume;
                canControl = message.canControl;
                writeStore();
                startPings();
                notify({ type: 'control' });
                show(player && playerReady ? (overview ? 'overview' : 'connected') : 'loading');
                break;

            case 'bundle-start':
            case 'bundle-part':
            case 'bundle-end':
                try {
                    var done = assembler.accept(message);
                    if (done) { bundleArrived(done); }
                } catch (e) {
                    console.warn('FrameTrail companion: a broken bundle.', e);
                }
                break;

            case 'state':
                stateArrived(message);
                break;

            case 'control':
                canControl = message.canControl;
                notify({ type: 'control' });
                show(phase);
                break;

            case 'view':
                overview = true;
                if (playerReady) { show('overview'); }
                break;

            case 'grant':
                keepGrant(message);
                break;

            case 'quiz':
                lastQuiz = message;
                if (message.status === 'open') { delete unknownSent[message.item]; }
                if (playerReady) { notify({ type: 'quiz' }); }
                break;

            case 'pong':
                if (pings[message.id]) {
                    var sample = Date.now() - pings[message.id];
                    delete pings[message.id];
                    rtt = rtt ? rtt * 0.8 + sample * 0.2 : sample;
                }
                break;

            case 'bye':
                ended    = true;
                lastQuiz = null;
                closeConnection();
                stopPlayer();
                dropGrant();
                show(message.reason === 'version' ? 'version' : 'ended');
                try { window.sessionStorage.removeItem(STORE); } catch (e) { /* private mode */ }
                break;

        }

    }

    function keepGrant(message) {
        var cookie = Pairing.grantCookie(message, window.location.protocol === 'https:');
        if (!cookie) {
            console.warn('FrameTrail companion: a pairing grant that is not one.');
            return;
        }
        document.cookie = cookie;
        grant = message;
    }

    function dropGrant() {
        if (!grant) { return; }
        var cookie = Pairing.grantCookie(Object.assign({}, grant, { ttl: 0 }), window.location.protocol === 'https:');
        if (cookie) { document.cookie = cookie; }
        grant = null;
    }

    function startPings() {
        window.clearInterval(timers.ping);
        timers.ping = window.setInterval(function() {
            var id = ++pingCount;
            pings[id] = Date.now();
            send({ type: 'ping', id: id });
            // Answers that never came are forgotten.
            Object.keys(pings).forEach(function(key) { if (Date.now() - pings[key] > 10000) { delete pings[key]; } });
        }, PING_INTERVAL);
    }

    function stateArrived(state) {
        overview = false;
        lastState = state;
        if (payload && state.hypervideo === String(payload.bundle.id)) {
            var moved = clock.update(state, Date.now(), rtt);
            if (playerReady) {
                if (phase === 'overview') { show('connected'); }
                notify({ type: 'state', moved: moved });
            }
        }
    }

    function bundleArrived(done) {

        var data;
        try { data = JSON.parse(done.text); } catch (e) { return; }
        if (!data || typeof data.bundle !== 'object' || !data.bundle || typeof data.bundle.hypervideo !== 'object') { return; }

        data.bundle = Pairing.companionBundle(data.bundle);
        if (data.bundle.id == null || data.bundle.id === '') { data.bundle.id = '0'; }

        startPlayer(data, done.id);

    }


    /* ------------------------------------------------------------------ */
    /*  The player                                                        */
    /* ------------------------------------------------------------------ */

    function startPlayer(data, bundleID) {

        stopPlayer();

        payload     = data;
        overview    = false;
        playerReady = false;
        clock.reset();
        if (lastState && lastState.hypervideo === String(data.bundle.id)) {
            clock.update(lastState, Date.now(), rtt);
        }

        // The theme is the instance's (its config), never the hypervideo's.
        var meta  = data.bundle.hypervideo.meta || {},
            theme = window.FrameTrailSerializer.normalizeConfig(Object.assign({}, data.config || {})).theme || 'classic';

        title.textContent = meta.name || '';
        document.title = meta.name || 'FrameTrail';
        targetElement.setAttribute('data-frametrail-theme', theme);

        // What a phone shows is set on purpose (views for phones, in the layout editor): without any, it shows none, and says so.
        var layoutArea = (data.bundle.hypervideo.config && data.bundle.hypervideo.config.layoutArea) || {};
        emptyNote.style.display = (Array.isArray(layoutArea.areaCompanion) && layoutArea.areaCompanion.length) ? 'none' : '';

        var element = document.createElement('div');
        element.className = 'companionPlayer';
        element.id = 'ftCompanionPlayer' + (++playerCount);
        stage.insertBefore(element, screen);

        show('loading');

        player = window.FrameTrail.init({
            target:    '#' + element.id,
            bundle:    data.bundle,
            config:    Object.assign({}, data.config || {}),
            dataPath:  data.datapath || null,
            companion: link,
            fullPage:  false
        }, 'PlayerLauncher');

        var started = player;

        player.onReady(function() {
            if (player !== started) { return; }
            playerReady = true;
            send({ type: 'ready', id: bundleID });
            show(overview ? 'overview' : 'connected');
            notify({ type: 'state', moved: true });
            notify({ type: 'quiz' });
        });

    }

    function stopPlayer() {
        emptyNote.style.display = 'none';
        if (!player) { return; }
        subscribers = [];
        var old = player;
        player = null;
        playerReady = false;
        try { old.destroy(); } catch (e) { console.warn('FrameTrail companion: could not remove the previous player.', e); }
    }


    /* ------------------------------------------------------------------ */

    build();

    var stored = readStore();

    join = Pairing.parseJoin(window.location.hash) || (stored && stored.join) || null;

    if (!join) {
        explain('invalid');
        show('invalid');
    } else if (typeof RTCPeerConnection === 'undefined') {
        explain('noWebRTC');
        show('noWebRTC');
    } else {
        // The same room as before (a reload): the same phone, which may resume.
        if (stored && stored.join && stored.join.room === join.room) {
            guestID = stored.guest;
            resume  = stored.resume;
        }
        guestID = Pairing.isId(guestID) ? guestID : Pairing.randomId();
        writeStore();
        connect();
    }

    return {

        /**
         * The link the phone's player follows (the companion state).
         * @attribute link
         * @readOnly
         */
        get link()  { return link; },

        /**
         * Where the connection is: connecting, waiting, loading, connected, overview, reconnecting, full, closed, version, ended, failed, fingerprint, invalid, noWebRTC.
         * @attribute phase
         * @readOnly
         */
        get phase() { return phase; }

    };

});


// companion.html carries no script of its own (its Content Security Policy
// allows none inline): it is marked, and starts me here.
document.addEventListener('DOMContentLoaded', function() {
    if (document.documentElement.hasAttribute('data-frametrail-companion')) {
        window.FrameTrailCompanion = FrameTrail.init({ target: 'body', config: {} }, 'CompanionLauncher');
    }
});
