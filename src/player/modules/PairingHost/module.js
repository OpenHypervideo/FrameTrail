/**
 * @module Player
 */


/**
 * I am the PairingHost: the player's side of pairing phones (docs/PAIRING.md).
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
 * which the dialog switches per phone). The state is mine alone, so a request
 * and the state it causes can never chase each other in a loop.
 *
 * A whole classroom can pair: the room stays open until pairing is stopped,
 * so the QR code can stay on the screen, and up to MAX_PHONES phones are
 * connected at once. The first phone may control the playback; the ones that
 * join it only watch, until the dialog lets them. Every phone gets the same
 * bundle, made once, and the same states. A phone that drops may come back
 * with its resume token within two minutes and keeps its control right.
 *
 * HypervideoModel.updateHypervideo() clears every timer of the page, so
 * hypervideoChanged() starts mine again.
 *
 * @class PairingHost
 * @static
 */

FrameTrail.defineModule('PairingHost', function(FrameTrail){

    var Pairing = window.FrameTrailPairing;

    var MAX_PHONES        = 50,       // phones connecting or connected at once; more are refused ('full')
        RESUME_WINDOW     = 120000,   // ms a dropped phone may come back in
        HANDSHAKE_TIMEOUT = 15000,    // ms from an offer to the phone's hello
        HELLO_TIMEOUT     = 10000,    // ms from an open channel to the phone's hello
        DISCONNECT_GRACE  = 5000,     // ms a connection may stay 'disconnected' before it counts as lost
        SAMPLE_INTERVAL   = 100,      // ms between looks at the playback
        HEARTBEAT_PLAYING = 1000,     // ms between states while playing …
        HEARTBEAT_PAUSED  = 5000,     // … and while not
        SEEK_THRESHOLD    = 0.2;      // s the playhead may be off its course before it counts as a seek

    var session      = null,       // the open room: { room, hostKey, broker, certificate, iceServers, link, cursor, polling }
        opening      = null,       // the promise of open() while it runs
        guests       = new Map(),  // the phones, by guest id: { id, number, label, pc, channel, status, canControl, resume, path, … }
        returning    = new Map(),  // the phones that dropped, by resume token, until their window ends: { id, number, label, canControl, until }
        joined       = 0,          // numbers the phones in the order they paired
        status       = 'off',      // off, opening, open
        problem      = null,       // the code of what went wrong last, for the dialog
        readyID      = null,       // the hypervideo that is completely open (not just being switched to)
        generation   = 0,          // counts close(): an open() that close() overtook gives up
        lastState    = null,       // the state sent last (to every phone), with the time it was sent
        seq          = 0,
        shared       = null,       // the bundle every phone gets: { key, id, texts: Promise }
        revision     = 0,          // counts the changes that make the bundle out of date
        timers       = { poll: null, sample: null, resume: null };


    function database()   { return FrameTrail.module('Database'); }
    function controller() { return FrameTrail.module('HypervideoController'); }
    function openID()     { var id = FrameTrail.module('RouteNavigation').hypervideoID; return id ? String(id) : null; }

    function failure(code) {
        var error = new Error(code);
        error.code = code;
        return error;
    }

    // Is this still the phone of its id (not one that was let go, or replaced by its own retry)?
    function current(g) {
        return guests.get(g.id) === g;
    }

    function connectedPhones() {
        var list = [];
        guests.forEach(function(g) { if (g.status === 'connected') { list.push(g); } });
        return list;
    }

    function returningPhone(id) {
        var found = null;
        returning.forEach(function(r) { if (r.id === id) { found = r; } });
        return found;
    }


    /* ------------------------------------------------------------------ */
    /*  Status                                                            */
    /* ------------------------------------------------------------------ */

    // How a phone is connected: on the local network, directly through the internet, or through a TURN relay.
    function pathOf(g) {
        if (!g.path) { return null; }
        return g.path.relayed ? 'relay' : ((g.path.local === 'host' && g.path.remote === 'host') ? 'lan' : 'direct');
    }

    /**
     * What the dialog and the pairing button show, also published as the
     * state "pairing". The phones are in the order they paired, those still
     * connecting last.
     *
     * @method snapshot
     * @return {Object} { status, link, phones: [{ id, number, label, status, canControl, path }], connected, max, problem }
     */
    function snapshot() {
        var phones    = [],
            connected = 0;
        guests.forEach(function(g) {
            if (g.status === 'connected') { connected++; }
            phones.push({ id: g.id, number: g.number || 0, label: g.label || '', status: g.status, canControl: !!g.canControl, path: pathOf(g) });
        });
        returning.forEach(function(r) {
            // Back already, still connecting: listed once.
            if (guests.has(r.id)) { return; }
            phones.push({ id: r.id, number: r.number, label: r.label || '', status: 'reconnecting', canControl: !!r.canControl, path: null });
        });
        phones.sort(function(a, b) { return (a.number || 1e9) - (b.number || 1e9); });
        return {
            status:    status,
            link:      session ? session.link : null,
            phones:    phones,
            connected: connected,
            max:       MAX_PHONES,
            problem:   problem
        };
    }

    function publish() {
        FrameTrail.changeState('pairing', snapshot());
    }

    function setStatus(newStatus) {
        status = newStatus;
        publish();
    }


    /* ------------------------------------------------------------------ */
    /*  The room                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * I open a room for phones, or return the one that is open. Rejects with
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
            startPolling();
            setStatus('open');
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

    // The room takes phones until pairing ends: I look for offers every second (which also keeps it alive).
    function startPolling() {
        window.clearInterval(timers.poll);
        if (!session) { return; }
        timers.poll = window.setInterval(poll, Pairing.POLL_INTERVAL);
        poll();
    }

    function poll() {
        var room = session;
        if (!room || room.polling) { return; }
        room.polling = true;
        room.broker.listOffers(room.room, room.hostKey, room.cursor).then(function(result) {
            room.polling = false;
            if (session !== room) { return; }
            if (problem === 'brokerUnreachable') { problem = null; publish(); }
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
                publish();
            }
        });
    }


    /* ------------------------------------------------------------------ */
    /*  The phones                                                        */
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

        // The same phone offering again (a retry, a reload, a connection it gave up on before I noticed) replaces
        // its attempt; a connected one is let go as dropped, so its hello with the resume token keeps its rights.
        // A phone coming back gets its place even when the room is full.
        var previous = guests.get(offer.guest);
        if (previous) {
            lose(previous);
        } else if (guests.size >= MAX_PHONES && !returningPhone(offer.guest)) {
            return refuse(offer.guest, 'full');
        }

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
                canControl: false,
                timers:     {}
            };

        guests.set(guestID, g);
        publish();

        wire(g);
        armHandshake(g);

        pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp }).then(function() {
            return pc.createAnswer();
        }).then(function(description) {
            return pc.setLocalDescription(description);
        }).then(function() {
            return Pairing.gatherComplete(pc);
        }).then(function() {
            if (!current(g) || session !== room) { return; }
            return room.broker.putAnswer(room.room, guestID, room.hostKey, Pairing.answerBlob(pc.localDescription.sdp));
        }).catch(function(error) {
            console.warn('FrameTrail pairing: could not answer the phone.', error);
            lose(g);
        });

    }

    function armHandshake(g) {
        window.clearTimeout(g.timers.handshake);
        g.timers.handshake = window.setTimeout(function() {
            if (current(g) && g.status === 'connecting') { lose(g); }
        }, HANDSHAKE_TIMEOUT);
    }

    function wire(g) {

        g.channel.addEventListener('open', function() {
            g.timers.hello = window.setTimeout(function() {
                if (current(g) && g.status === 'connecting') { lose(g); }
            }, HELLO_TIMEOUT);
        });

        g.channel.addEventListener('message', function(event) {
            if (current(g) && typeof event.data === 'string') { receive(g, event.data); }
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
                    if (current(g)) { publish(); }
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
                if (g.status === 'connected') { return; }
                if (message.v !== Pairing.PROTOCOL_VERSION) {
                    send(g, { type: 'bye', reason: 'version' });
                    lose(g);
                    return;
                }
                window.clearTimeout(g.timers.hello);
                window.clearTimeout(g.timers.handshake);
                g.label = message.label || g.label;
                var back = message.resume ? returning.get(message.resume) : null;
                if (back) {
                    returning.delete(message.resume);
                    scheduleResumeCheck();
                    g.canControl = back.canControl;
                    g.number     = back.number;
                } else {
                    // The first phone may control the playback; the ones that join it only watch, until they are let.
                    g.canControl = !connectedPhones().length && !returning.size;
                    g.number     = ++joined;
                }
                g.resume = Pairing.randomId();
                g.status = 'connected';
                send(g, { type: 'welcome', v: Pairing.PROTOCOL_VERSION, canControl: g.canControl, resume: g.resume, label: hostLabel() });
                publish();
                startSampling();
                sample();
                break;

            case 'ready':
                if (message.id === g.bundleID) {
                    g.fresh = true;
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

    // A phone is gone: it left, the connection broke, or the handshake did not finish.
    function lose(g) {

        if (!current(g)) { return; }

        var wasConnected = (g.status === 'connected');

        guests.delete(g.id);
        closeGuest(g);
        if (!connectedPhones().length) { stopSampling(); }

        if (!session) { return; }

        if (wasConnected && !g.leftOnPurpose) {
            // Two minutes for this phone to come back.
            returning.set(g.resume, { id: g.id, number: g.number, label: g.label, canControl: g.canControl, until: Date.now() + RESUME_WINDOW });
            scheduleResumeCheck();
        }

        publish();

    }

    // One timer for the resume window that ends first.
    function scheduleResumeCheck() {
        var next = Infinity;
        window.clearTimeout(timers.resume);
        timers.resume = null;
        returning.forEach(function(r) { next = Math.min(next, r.until); });
        if (next !== Infinity) {
            timers.resume = window.setTimeout(resumeWindowsOver, Math.max(0, next - Date.now()));
        }
    }

    function resumeWindowsOver() {
        var now   = Date.now(),
            ended = false;
        returning.forEach(function(r, token) {
            if (r.until <= now) { returning.delete(token); ended = true; }
        });
        scheduleResumeCheck();
        if (!ended) { return; }
        // No phone is left and nobody is looking at the QR code: pairing ends. Otherwise it waits for phones, as before.
        if (!guests.size && !returning.size && !(FrameTrail.module('PairingDialog') && FrameTrail.module('PairingDialog').isOpen)) {
            close();
        } else {
            publish();
        }
    }

    function hostLabel() {
        return (database().config && database().config.overviewTitle) || document.title || 'FrameTrail';
    }


    /* ------------------------------------------------------------------ */
    /*  What the phones show                                              */
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
     * I look at the playback and send the phones what changed: the overview,
     * a new hypervideo (its bundle first), or the state — when playing,
     * waiting or the rate changed, when the playhead left its course (a seek),
     * or when the heartbeat is due. A phone that has just shown a bundle or
     * come back from the overview (fresh) gets the state at once.
     */
    function sample() {

        var phones = connectedPhones().filter(function(g) { return g.channel.readyState === 'open'; });

        if (!phones.length) { return; }

        if (FrameTrail.getState('viewMode') !== 'video') {
            phones.forEach(function(g) {
                if (g.view !== 'overview') {
                    g.view = 'overview';
                    send(g, { type: 'view', mode: 'overview' });
                }
            });
            return;
        }

        var id = openID();

        // A hypervideo that is still being opened has no duration yet: wait for it.
        if (!id || id !== readyID) { return; }

        var now     = Date.now(),
            current = playback();

        if (!current) { return; }

        var due = !lastState
               || lastState.hypervideo !== current.hypervideo
               || lastState.playing !== current.playing
               || lastState.rate !== current.rate
               || lastState.waiting !== current.waiting
               || Math.abs(expectedTime(lastState, now) - current.time) > SEEK_THRESHOLD
               || now - lastState.at >= (current.playing ? HEARTBEAT_PLAYING : HEARTBEAT_PAUSED),
            text = null;

        phones.forEach(function(g) {
            if (g.view === 'overview') {
                g.view  = 'video';
                g.fresh = true;
            }
            if (g.bundleFor !== id) {
                sendBundle(g);
                return;
            }
            if (!due && !g.fresh) { return; }
            if (text === null) {
                current.seq = ++seq;
                text = Pairing.encode(current);
            }
            g.channel.send(text);
            g.fresh = false;
        });

        if (due && text !== null) {
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
        timers.sample = null;
        lastState = null;
    }

    /**
     * The open hypervideo as the phones get it, made once for all of them:
     * its bundle without code, where its relative media paths resolve, the
     * page's playback settings and the time span (a phone has no video to
     * learn it from), in pieces ready to send.
     */
    function currentBundle() {

        var id  = openID(),
            key = id + ':' + revision;

        if (shared && shared.key === key) { return shared; }

        var Export   = FrameTrail.module('BundleExport'),
            Model    = FrameTrail.module('HypervideoModel'),
            bundleID = Pairing.randomId(8),
            made     = { key: key, id: bundleID };

        made.texts = Export.bundle('hypervideo', id).then(function(bundle) {
            var payload = {
                bundle:   Pairing.companionBundle(bundle),
                datapath: Export.pageDatapath(),
                config:   Export.pageConfig('hypervideo'),
                offsetIn: Model.offsetIn || 0,
                duration: Model.duration || 0
            };
            return Pairing.bundleMessages(bundleID, JSON.stringify(payload)).map(Pairing.encode);
        });

        // One that failed is not kept, so the next phone gets a new try.
        made.texts.catch(function() { if (shared === made) { shared = null; } });

        shared = made;
        return made;

    }

    function sendBundle(g) {

        var bundle = currentBundle();

        g.bundleFor = openID();
        g.bundleID  = bundle.id;

        bundle.texts.then(function(texts) {
            if (!current(g) || g.bundleID !== bundle.id) { return; }
            return sendAll(g, texts);
        }).then(function() {
            sample();
        }).catch(function(error) {
            console.warn('FrameTrail pairing: could not send the hypervideo to the phone.', error);
        });

    }

    // Messages one after the other, holding back while the channel's buffer is full.
    function sendAll(g, texts) {

        var channel = g.channel,
            index   = 0;

        channel.bufferedAmountLowThreshold = 256 * 1024;

        return new Promise(function(resolve) {
            function pump() {
                while (index < texts.length) {
                    if (!current(g) || channel.readyState !== 'open') { return resolve(false); }
                    if (channel.bufferedAmount > 1024 * 1024) {
                        channel.addEventListener('bufferedamountlow', pump, { once: true });
                        return;
                    }
                    channel.send(texts[index++]);
                }
                resolve(true);
            }
            pump();
        });

    }

    /**
     * A phone asks for play, pause or a seek; I do it if it may.
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

    // The hypervideo changed where the phones cannot see it: they get it again.
    function resendBundle() {
        revision++;
        shared = null;
        guests.forEach(function(g) { g.bundleFor = null; });
        sample();
    }


    /* ------------------------------------------------------------------ */
    /*  From outside                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * I end pairing: the phones are told and let go, the room closed.
     *
     * @method close
     */
    function close() {

        var room = session,
            gone = [];

        guests.forEach(function(g) {
            send(g, { type: 'bye', reason: 'stopped' });
            gone.push(g);
        });
        guests.clear();
        stopSampling();
        // A moment for the goodbyes to leave before the channels close.
        if (gone.length) {
            window.setTimeout(function() { gone.forEach(closeGuest); }, 300);
        }

        window.clearInterval(timers.poll);
        window.clearTimeout(timers.resume);
        timers.resume = null;
        if (room) {
            room.broker.closeRoom(room.room, room.hostKey).catch(function() { /* it expires on its own */ });
        }

        generation++;
        opening   = null;
        session   = null;
        problem   = null;
        shared    = null;
        joined    = 0;
        returning.clear();
        setStatus('off');

    }

    /**
     * I let a phone control playback, or stop it from doing so. A phone that
     * dropped keeps what I set when it comes back.
     *
     * @method setCanControl
     * @param {String} id the phone's id in the snapshot
     * @param {Boolean} canControl
     */
    function setCanControl(id, canControl) {
        var g = guests.get(id),
            r = returningPhone(id);
        if (g && g.status === 'connected') {
            g.canControl = !!canControl;
            send(g, { type: 'control', canControl: g.canControl });
        } else if (r) {
            r.canControl = !!canControl;
        } else {
            return;
        }
        publish();
    }

    /**
     * I let a phone go: it is told pairing ended and cannot come back with
     * its rights (scanning the code again, it joins as a new phone).
     *
     * @method disconnect
     * @param {String} id the phone's id in the snapshot
     */
    function disconnect(id) {
        var g = guests.get(id);
        if (g) {
            guests.delete(id);
            send(g, { type: 'bye', reason: 'stopped' });
            window.setTimeout(function() { closeGuest(g); }, 300);
            if (!connectedPhones().length) { stopSampling(); }
        }
        returning.forEach(function(r, token) {
            if (r.id === id) { returning.delete(token); }
        });
        scheduleResumeCheck();
        publish();
    }

    /**
     * A hypervideo is completely open, at the start or after a switch. The
     * switch cleared every timer of the page, so I start mine again; the
     * phones get the new hypervideo with the next look at the playback.
     *
     * @method hypervideoChanged
     * @param {String} hypervideoID
     */
    function hypervideoChanged(hypervideoID) {
        readyID = hypervideoID ? String(hypervideoID) : null;
        if (session) {
            window.clearInterval(timers.poll);
            timers.poll = window.setInterval(poll, Pairing.POLL_INTERVAL);
        }
        guests.forEach(function(g) {
            if (g.status === 'connecting') { armHandshake(g); }
        });
        if (connectedPhones().length) {
            startSampling();
            sample();
        }
        scheduleResumeCheck();
    }

    // After a save the phones get what was saved; nothing of an edit reaches them before.
    FrameTrail.addEventListener('userAction', function(event) {
        if (event.detail && event.detail.action === 'EditSave') { resendBundle(); }
    });

    // Seeks (setCurrentTime updates at once) and playback reach the phones without waiting for the next look,
    // which a hidden tab's throttled timers would delay. A native video's pause lands a moment after the event.
    FrameTrail.addEventListener('timeupdate', function() { if (guests.size) { sample(); } });
    FrameTrail.addEventListener('play', function() { if (guests.size) { sample(); } });
    FrameTrail.addEventListener('pause', function() {
        if (guests.size) {
            window.setTimeout(sample, 0);
            window.setTimeout(sample, 60);
        }
    });

    window.addEventListener('pagehide', function() {
        guests.forEach(function(g) { send(g, { type: 'bye', reason: 'stopped' }); });
    });


    return {

        onChange: {
            viewMode: function() { window.setTimeout(sample, 0); },
            // Edit mode ended: what the phones have may be out of date (where nothing is saved, this is the only moment they get the edits).
            editMode: function(editMode, oldEditMode) { if (!editMode && oldEditMode) { resendBundle(); } }
        },

        open:              open,
        close:             close,
        setCanControl:     setCanControl,
        disconnect:        disconnect,
        hypervideoChanged: hypervideoChanged,

        /**
         * The status, as published in the state "pairing" (see snapshot()).
         * @attribute status
         * @readOnly
         */
        get status() { return snapshot(); }

    };

});
