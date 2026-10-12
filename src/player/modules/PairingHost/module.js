/**
 * @module Player
 */


/**
 * I am the PairingHost: the player's side of pairing a phone (docs/PAIRING.md).
 *
 * I open a room on the pairing broker (config.pairingBrokerURL) and make the
 * join link a QR code shows (PairingDialog draws it). A phone that opens the
 * link (companion.html) posts a WebRTC offer into the room; I answer it with
 * a certificate whose fingerprint the link carries, so the phone can tell my
 * answer from a forged one, and from then on we talk over a DataChannel. The
 * broker sees neither the hypervideo nor the playback.
 *
 * Over the channel I send the open hypervideo as a bundle (without code: no
 * overlays, code snippets or event handlers), again after a save, when edit
 * mode ends and when another hypervideo is opened, and the playback state:
 * on every change and as a heartbeat. The phone plays nothing itself; it
 * extrapolates my playhead and shows its content views (the companion area)
 * in step. What it sends are requests — play, pause, seek — which I carry
 * out through the HypervideoController when it may control me (canControl,
 * which the dialog switches). The state is mine alone, so a request and the
 * state it causes can never chase each other in a loop.
 *
 * This milestone accepts one phone at a time; the broker contract and the
 * protocol are made for rooms with many. While a phone is connected the room
 * is closed; when it drops, the room opens again, and a phone that comes back
 * with its resume token within two minutes keeps its control rights.
 *
 * HypervideoModel.updateHypervideo() clears every timer of the page, so
 * hypervideoChanged() starts mine again.
 *
 * @class PairingHost
 * @static
 */

FrameTrail.defineModule('PairingHost', function(FrameTrail){

    var Pairing = window.FrameTrailPairing;

    var RESUME_WINDOW     = 120000,   // ms a dropped phone may come back in
        HANDSHAKE_TIMEOUT = 15000,    // ms from an offer to an open channel
        HANDSHAKE_PATIENCE = 10000,   // ms a phone still connecting holds the place against another one
        HELLO_TIMEOUT     = 10000,    // ms from an open channel to the phone's hello
        DISCONNECT_GRACE  = 5000,     // ms a connection may stay 'disconnected' before it counts as lost
        SAMPLE_INTERVAL   = 100,      // ms between looks at the playback
        HEARTBEAT_PLAYING = 1000,     // ms between states while playing …
        HEARTBEAT_PAUSED  = 5000,     // … and while not
        SEEK_THRESHOLD    = 0.2;      // s the playhead may be off its course before it counts as a seek

    var session      = null,   // the open room: { room, hostKey, broker, certificate, iceServers, link, cursor, accepting, polling }
        opening      = null,   // the promise of open() while it runs
        guest        = null,   // the phone: { id, label, pc, channel, status, canControl, resume, path, … }
        returning    = null,   // the phone that dropped, until the resume window ends: { token, canControl, label }
        status       = 'off',  // off, opening, waiting, connecting, connected, reconnecting
        problem      = null,   // the code of what went wrong last, for the dialog
        readyID      = null,   // the hypervideo that is completely open (not just being switched to)
        generation   = 0,      // counts close(): an open() that close() overtook gives up
        lastState    = null,   // the state sent last, with the time it was sent
        seq          = 0,
        timers       = { poll: null, sample: null, resume: null };


    function database()   { return FrameTrail.module('Database'); }
    function controller() { return FrameTrail.module('HypervideoController'); }
    function openID()     { var id = FrameTrail.module('RouteNavigation').hypervideoID; return id ? String(id) : null; }

    function failure(code) {
        var error = new Error(code);
        error.code = code;
        return error;
    }


    /* ------------------------------------------------------------------ */
    /*  Status                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * What the dialog and the pairing button show, also published as the
     * state "pairing".
     *
     * @method snapshot
     * @return {Object} { status, link, guest: { label, canControl, path } | null, problem }
     */
    function snapshot() {
        var who = guest || returning;
        return {
            status:  status,
            link:    session ? session.link : null,
            guest:   who ? {
                label:      who.label || '',
                canControl: !!who.canControl,
                // How the phone is connected: on the local network, directly through the internet, or through a TURN relay.
                path:       (guest && guest.path) ? (guest.path.relayed ? 'relay' : ((guest.path.local === 'host' && guest.path.remote === 'host') ? 'lan' : 'direct')) : null
            } : null,
            problem: problem
        };
    }

    function setStatus(newStatus) {
        status = newStatus;
        FrameTrail.changeState('pairing', snapshot());
    }


    /* ------------------------------------------------------------------ */
    /*  The room                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * I open a room for a phone, or return the one that is open. Rejects with
     * an error whose code says what is missing: brokerMissing, brokerInvalid,
     * brokerInsecure, brokerUnreachable, companionMissing,
     * companionUnreachable, noHypervideo, noWebRTC.
     *
     * @method open
     * @return {Promise} the snapshot
     */
    function open() {

        if (session) { return Promise.resolve(snapshot()); }
        if (opening) { return opening; }

        var config    = database().config || {},
            brokerURL = Pairing.resolveBrokerURL(config.pairingBrokerURL, window.location.href),
            brokerProblem = Pairing.checkBrokerURL(brokerURL, window.location.protocol),
            companion = Pairing.companionURL(config.pairingCompanionURL, window.location.href);

        problem = null;

        if (brokerProblem) {
            return Promise.reject(failure('broker' + brokerProblem.charAt(0).toUpperCase() + brokerProblem.slice(1)));
        }
        if (typeof RTCPeerConnection === 'undefined') {
            return Promise.reject(failure('noWebRTC'));
        }
        if (!openID() || !database().hypervideo || FrameTrail.getState('viewMode') !== 'video') {
            return Promise.reject(failure('noHypervideo'));
        }
        if (!companion) {
            return Promise.reject(failure('companionMissing'));
        }

        var room = {
            room:     Pairing.randomId(),
            hostKey:  Pairing.randomId(),
            broker:   Pairing.brokerClient(brokerURL),
            cursor:   0,
            accepting: false,
            polling:  false
        };

        readyID = readyID || openID();
        setStatus('opening');

        var mine = generation;

        opening = checkCompanion(companion).then(function() {
            return RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
        }).then(function(certificate) {
            room.certificate = certificate;
            return room.broker.ice();
        }).then(function(iceServers) {
            room.iceServers = iceServers;
            return room.broker.openRoom(room.room, room.hostKey);
        }).then(function() {
            if (mine !== generation) {
                room.broker.closeRoom(room.room, room.hostKey).catch(function() {});
                throw failure('stopped');
            }
            room.link = Pairing.joinURL(companion, room.room, brokerURL, Pairing.certificateFingerprint(room.certificate));
            session = room;
            opening = null;
            startAccepting(false);
            setStatus('waiting');
            return snapshot();
        }).catch(function(error) {
            if (mine !== generation) { throw failure('stopped'); }
            opening = null;
            problem = (error && /^(companion|broker|no)/.test(error.code)) ? error.code : 'brokerUnreachable';
            setStatus('off');
            throw failure(problem);
        });

        return opening;

    }

    /**
     * Is the companion page there? A page of this origin must answer 200; one
     * elsewhere is fetched without CORS, which tells only that it answers.
     */
    function checkCompanion(url) {
        var sameOrigin = false;
        try { sameOrigin = (new URL(url).origin === window.location.origin); } catch (e) { /* no URL */ }
        return fetch(url, { cache: 'no-store', credentials: 'omit', mode: sameOrigin ? 'same-origin' : 'no-cors' }).then(function(response) {
            if (sameOrigin && !response.ok) { throw failure('companionUnreachable'); }
        }, function() {
            throw failure('companionUnreachable');
        });
    }

    function startAccepting(reopen) {
        var room = session;
        if (!room) { return; }
        room.accepting = true;
        window.clearInterval(timers.poll);
        timers.poll = window.setInterval(poll, Pairing.POLL_INTERVAL);
        (reopen ? room.broker.openRoom(room.room, room.hostKey) : Promise.resolve()).then(poll, function() {
            problem = 'brokerUnreachable';
            setStatus(status);
        });
    }

    function stopAccepting() {
        var room = session;
        window.clearInterval(timers.poll);
        if (!room || !room.accepting) { return; }
        room.accepting = false;
        room.broker.closeRoom(room.room, room.hostKey).catch(function() { /* it expires on its own */ });
    }

    function poll() {
        var room = session;
        if (!room || !room.accepting || room.polling) { return; }
        room.polling = true;
        room.broker.listOffers(room.room, room.hostKey, room.cursor).then(function(result) {
            room.polling = false;
            if (session !== room || !room.accepting) { return; }
            if (problem === 'brokerUnreachable') { problem = null; setStatus(status); }
            room.cursor = result.cursor;
            result.offers.forEach(handleOffer);
        }, function(error) {
            room.polling = false;
            if (session !== room) { return; }
            if (error.code === 'noRoom') {
                // Expired while this page could not call (a sleeping laptop, a throttled tab): open it again.
                room.broker.openRoom(room.room, room.hostKey).catch(function() {});
            } else {
                problem = 'brokerUnreachable';
                setStatus(status);
            }
        });
    }


    /* ------------------------------------------------------------------ */
    /*  The phone                                                         */
    /* ------------------------------------------------------------------ */

    function refuse(guestID, reason) {
        var room = session;
        room.broker.putAnswer(room.room, guestID, room.hostKey, Pairing.refusalBlob(reason)).catch(function() {});
    }

    function handleOffer(offer) {

        if (!Pairing.isId(offer.guest)) { return; }

        var read = Pairing.readOffer(offer.blob);

        if (read.error === 'version') { return refuse(offer.guest, 'version'); }
        if (read.error) { return; }

        // One phone at a time. The same phone offering again (a retry) replaces its attempt, and so does
        // another phone when this one is not getting anywhere (it may have refused the answer: a forged link).
        if (guest && guest.id !== offer.guest
                && (guest.status === 'connected' || Date.now() - guest.since < HANDSHAKE_PATIENCE)) {
            return refuse(offer.guest, 'full');
        }
        if (guest) { closeGuest(guest); guest = null; }

        answer(offer.guest, read);

    }

    function answer(guestID, offer) {

        var room = session,
            pc   = new RTCPeerConnection({ iceServers: room.iceServers, certificates: [room.certificate] }),
            g    = {
                id:         guestID,
                label:      offer.label,
                pc:         pc,
                channel:    pc.createDataChannel(Pairing.CHANNEL.label, { negotiated: Pairing.CHANNEL.negotiated, id: Pairing.CHANNEL.id }),
                status:     'connecting',
                since:      Date.now(),
                canControl: true,
                timers:     {}
            };

        guest = g;
        setStatus('connecting');

        wire(g);

        g.timers.handshake = window.setTimeout(function() {
            if (guest === g && g.status === 'connecting') { lose(g); }
        }, HANDSHAKE_TIMEOUT);

        pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp }).then(function() {
            return pc.createAnswer();
        }).then(function(description) {
            return pc.setLocalDescription(description);
        }).then(function() {
            return Pairing.gatherComplete(pc);
        }).then(function() {
            if (guest !== g || session !== room) { return; }
            return room.broker.putAnswer(room.room, guestID, room.hostKey, Pairing.answerBlob(pc.localDescription.sdp));
        }).catch(function(error) {
            console.warn('FrameTrail pairing: could not answer the phone.', error);
            if (guest === g) { lose(g); }
        });

    }

    function wire(g) {

        g.channel.addEventListener('open', function() {
            g.timers.hello = window.setTimeout(function() {
                if (guest === g && g.status === 'connecting') { lose(g); }
            }, HELLO_TIMEOUT);
        });

        g.channel.addEventListener('message', function(event) {
            if (guest === g && typeof event.data === 'string') { receive(g, event.data); }
        });

        g.channel.addEventListener('close', function() { lose(g); });

        g.pc.addEventListener('connectionstatechange', function() {
            var state = g.pc.connectionState;
            window.clearTimeout(g.timers.grace);
            if (state === 'failed' || state === 'closed') {
                lose(g);
            } else if (state === 'disconnected') {
                // Often only a moment (WiFi roaming); ICE may recover.
                g.timers.grace = window.setTimeout(function() {
                    if (g.pc.connectionState === 'disconnected') { lose(g); }
                }, DISCONNECT_GRACE);
            } else if (state === 'connected') {
                g.pc.getStats().then(function(stats) {
                    g.path = Pairing.selectedPath(stats);
                    if (guest === g) { setStatus(status); }
                }).catch(function() {});
            }
        });

    }

    function send(g, message) {
        if (g && g.channel.readyState === 'open') {
            g.channel.send(Pairing.encode(message));
            return true;
        }
        return false;
    }

    function receive(g, text) {

        var message = Pairing.decode(text, 'guest');

        if (!message) { return; }

        switch (message.type) {

            case 'hello':
                if (message.v !== Pairing.PROTOCOL_VERSION) {
                    send(g, { type: 'bye', reason: 'version' });
                    lose(g);
                    return;
                }
                window.clearTimeout(g.timers.hello);
                window.clearTimeout(g.timers.handshake);
                g.label = message.label || g.label;
                if (returning && message.resume && message.resume === returning.token) {
                    g.canControl = returning.canControl;
                }
                returning = null;
                window.clearTimeout(timers.resume);
                g.resume = Pairing.randomId();
                g.status = 'connected';
                send(g, { type: 'welcome', v: Pairing.PROTOCOL_VERSION, canControl: g.canControl, resume: g.resume, label: hostLabel() });
                stopAccepting();
                setStatus('connected');
                lastState = null;
                startSampling();
                sample();
                break;

            case 'ready':
                if (message.id === g.bundleID) {
                    lastState = null;
                    sample();
                }
                break;

            case 'request':
                carryOut(g, message);
                break;

            case 'ping':
                send(g, { type: 'pong', id: message.id });
                break;

            case 'bye':
                g.leftOnPurpose = true;
                lose(g);
                break;

        }

    }

    function closeGuest(g) {
        Object.keys(g.timers).forEach(function(name) { window.clearTimeout(g.timers[name]); });
        try { g.channel.close(); } catch (e) { /* closed */ }
        try { g.pc.close(); } catch (e) { /* closed */ }
    }

    // The phone is gone: it left, the connection broke, or the handshake did not finish.
    function lose(g) {

        if (guest !== g) { return; }

        var wasConnected = (g.status === 'connected');

        guest = null;
        closeGuest(g);
        stopSampling();

        if (!session) { return; }

        if (wasConnected && !g.leftOnPurpose) {
            // The room opens again for two minutes, for this phone to come back.
            returning = { token: g.resume, canControl: g.canControl, label: g.label };
            window.clearTimeout(timers.resume);
            timers.resume = window.setTimeout(resumeWindowOver, RESUME_WINDOW);
            setStatus('reconnecting');
        } else {
            setStatus('waiting');
        }

        startAccepting(wasConnected);

    }

    function resumeWindowOver() {
        returning = null;
        if (status !== 'reconnecting') { return; }
        // Nobody is looking at the QR code: pairing ends. Otherwise it waits for a phone, as before.
        if (FrameTrail.module('PairingDialog') && FrameTrail.module('PairingDialog').isOpen) {
            setStatus('waiting');
        } else {
            close();
        }
    }

    function hostLabel() {
        return (database().config && database().config.overviewTitle) || document.title || 'FrameTrail';
    }


    /* ------------------------------------------------------------------ */
    /*  What the phone shows                                              */
    /* ------------------------------------------------------------------ */

    function playback() {
        var HC = controller();
        if (!HC) { return null; }
        return {
            type:       'state',
            hypervideo: openID(),
            playing:    !!HC.isPlaying,
            time:       Math.round((HC.preciseTime || 0) * 1000) / 1000,
            rate:       HC.playbackRate || 1,
            waiting:    !!(HC.isStalled || HC.isBuffering)
        };
    }

    // Where the playhead of the last state should be now.
    function expectedTime(state, now) {
        return (state.playing && !state.waiting) ? state.time + (now - state.at) / 1000 * state.rate : state.time;
    }

    /**
     * I look at the playback and send the phone what changed: the overview,
     * a new hypervideo (its bundle first), or the state — when playing,
     * waiting or the rate changed, when the playhead left its course (a seek),
     * or when the heartbeat is due.
     */
    function sample() {

        var g = guest;

        if (!g || g.status !== 'connected' || g.channel.readyState !== 'open') { return; }

        if (FrameTrail.getState('viewMode') !== 'video') {
            if (g.view !== 'overview') {
                g.view = 'overview';
                send(g, { type: 'view', mode: 'overview' });
            }
            return;
        }

        var id = openID();

        // A hypervideo that is still being opened has no duration yet: wait for it.
        if (!id || id !== readyID) { return; }

        if (g.view === 'overview') {
            g.view = 'video';
            lastState = null;
        }

        if (g.bundleFor !== id) {
            sendBundle(g);
            return;
        }

        var now     = Date.now(),
            current = playback();

        if (!current) { return; }

        var due = !lastState
               || lastState.hypervideo !== current.hypervideo
               || lastState.playing !== current.playing
               || lastState.rate !== current.rate
               || lastState.waiting !== current.waiting
               || Math.abs(expectedTime(lastState, now) - current.time) > SEEK_THRESHOLD
               || now - lastState.at >= (current.playing ? HEARTBEAT_PLAYING : HEARTBEAT_PAUSED);

        if (!due) { return; }

        current.seq = ++seq;
        if (send(g, current)) {
            lastState = current;
            lastState.at = now;
        }

    }

    function startSampling() {
        window.clearInterval(timers.sample);
        timers.sample = window.setInterval(sample, SAMPLE_INTERVAL);
    }

    function stopSampling() {
        window.clearInterval(timers.sample);
        lastState = null;
    }

    /**
     * I send the open hypervideo to the phone: its bundle without code, where
     * its relative media paths resolve, the page's playback settings and the
     * time span (the phone has no video to learn it from).
     */
    function sendBundle(g) {

        var id       = openID(),
            bundleID = Pairing.randomId(8),
            Export   = FrameTrail.module('BundleExport'),
            Model    = FrameTrail.module('HypervideoModel');

        g.bundleFor = id;
        g.bundleID  = bundleID;

        Export.bundle('hypervideo', id).then(function(bundle) {
            if (guest !== g || g.bundleID !== bundleID) { return; }
            var payload = {
                bundle:   Pairing.companionBundle(bundle),
                datapath: Export.pageDatapath(),
                config:   Export.pageConfig('hypervideo'),
                offsetIn: Model.offsetIn || 0,
                duration: Model.duration || 0
            };
            return sendAll(g, Pairing.bundleMessages(bundleID, JSON.stringify(payload)));
        }).then(function() {
            sample();
        }).catch(function(error) {
            console.warn('FrameTrail pairing: could not send the hypervideo to the phone.', error);
        });

    }

    // Messages one after the other, holding back while the channel's buffer is full.
    function sendAll(g, messages) {

        var channel = g.channel,
            index   = 0;

        channel.bufferedAmountLowThreshold = 256 * 1024;

        return new Promise(function(resolve) {
            function pump() {
                while (index < messages.length) {
                    if (guest !== g || channel.readyState !== 'open') { return resolve(false); }
                    if (channel.bufferedAmount > 1024 * 1024) {
                        channel.addEventListener('bufferedamountlow', pump, { once: true });
                        return;
                    }
                    channel.send(Pairing.encode(messages[index++]));
                }
                resolve(true);
            }
            pump();
        });

    }

    /**
     * The phone asks for play, pause or a seek; I do it if it may.
     */
    function carryOut(g, request) {

        var HC = controller();

        if (!g.canControl || g.status !== 'connected' || !HC || FrameTrail.getState('viewMode') !== 'video' || openID() !== readyID) {
            return;
        }

        if (request.action === 'play') {
            HC.play();
        } else if (request.action === 'pause') {
            HC.pause();
        } else if (request.action === 'seek') {
            HC.currentTime = request.time;
        }

        FrameTrail.triggerEvent('userAction', { action: 'PairedPhoneRequest', request: request.action, time: request.time });

        window.setTimeout(sample, 0);

    }

    // The hypervideo changed where the phone cannot see it: it gets it again.
    function resendBundle() {
        if (guest && guest.status === 'connected') {
            guest.bundleFor = null;
            sample();
        }
    }


    /* ------------------------------------------------------------------ */
    /*  From outside                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * I end pairing: the phone is told and let go, the room closed.
     *
     * @method close
     */
    function close() {

        var g = guest;

        if (g) {
            guest = null;
            send(g, { type: 'bye', reason: 'stopped' });
            stopSampling();
            // A moment for the goodbye to leave before the channel closes.
            window.setTimeout(function() { closeGuest(g); }, 300);
        }

        stopAccepting();
        window.clearTimeout(timers.resume);
        generation++;
        opening   = null;
        session   = null;
        returning = null;
        problem   = null;
        setStatus('off');

    }

    /**
     * I let the phone control playback, or stop it from doing so.
     *
     * @method setCanControl
     * @param {Boolean} canControl
     */
    function setCanControl(canControl) {
        if (!guest) { return; }
        guest.canControl = !!canControl;
        send(guest, { type: 'control', canControl: guest.canControl });
        setStatus(status);
    }

    /**
     * A hypervideo is completely open, at the start or after a switch. The
     * switch cleared every timer of the page, so I start mine again; the
     * phone gets the new hypervideo with the next look at the playback.
     *
     * @method hypervideoChanged
     * @param {String} hypervideoID
     */
    function hypervideoChanged(hypervideoID) {
        readyID = hypervideoID ? String(hypervideoID) : null;
        if (session && session.accepting) {
            window.clearInterval(timers.poll);
            timers.poll = window.setInterval(poll, Pairing.POLL_INTERVAL);
        }
        if (guest && guest.status === 'connected') {
            startSampling();
            sample();
        }
        if (returning) {
            window.clearTimeout(timers.resume);
            timers.resume = window.setTimeout(resumeWindowOver, RESUME_WINDOW);
        }
    }

    // After a save the phone gets what was saved; nothing of an edit reaches it before.
    FrameTrail.addEventListener('userAction', function(event) {
        if (event.detail && event.detail.action === 'EditSave') { resendBundle(); }
    });

    // Seeks (setCurrentTime updates at once) and playback reach the phone without waiting for the next look,
    // which a hidden tab's throttled timers would delay. A native video's pause lands a moment after the event.
    FrameTrail.addEventListener('timeupdate', function() { if (guest) { sample(); } });
    FrameTrail.addEventListener('play', function() { if (guest) { sample(); } });
    FrameTrail.addEventListener('pause', function() {
        if (guest) {
            window.setTimeout(sample, 0);
            window.setTimeout(sample, 60);
        }
    });

    window.addEventListener('pagehide', function() {
        if (guest) { send(guest, { type: 'bye', reason: 'stopped' }); }
    });


    return {

        onChange: {
            viewMode: function() { window.setTimeout(sample, 0); },
            // Edit mode ended: what the phone has may be out of date (where nothing is saved, this is the only moment it gets the edits).
            editMode: function(editMode, oldEditMode) { if (!editMode && oldEditMode) { resendBundle(); } }
        },

        open:              open,
        close:             close,
        setCanControl:     setCanControl,
        hypervideoChanged: hypervideoChanged,

        /**
         * The status, as published in the state "pairing" (see snapshot()).
         * @attribute status
         * @readOnly
         */
        get status() { return snapshot(); }

    };

});
