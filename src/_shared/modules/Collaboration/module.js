/**
 * @module Shared
 */

/**
 * I coordinate multi-user editing: who else is present, who holds the soft
 * lock on a given scope, and whether the underlying document has been changed
 * by someone else since we rendered it.
 *
 * I am deliberately transport-agnostic. Everything that talks to the backend
 * lives behind _transport below, so a push-based transport (a WebSocket hub,
 * say) can replace polling later without any of the feature code changing.
 *
 * I track several scopes at once, because more than one shared surface can be
 * open simultaneously — you can have the admin settings dialog open while a
 * hypervideo is loaded:
 *
 *   'hypervideo' / <id>       guards hypervideo.json
 *   'settings'   / 'global'   guards config.json and custom.css
 *   'users'      / 'global'   guards users.json
 *   'tags'       / 'global'   guards tagdefinitions.json
 *   'library'    / 'global'   guards hypervideos/_index.json and every hypervideo.json
 *
 * The hypervideo scope is the "primary" one, and every accessor defaults to it
 * so callers that only care about the hypervideo need not pass a scope.
 *
 * A session is either participating or merely *observing*. An observer polls
 * for staleness but registers no presence and takes no lock, which is how the
 * instance-wide scopes can be watched for a whole session without everyone
 * appearing to everyone else as though they had the settings dialog open. All
 * sessions are polled in a single request, so watching more costs nothing.
 *
 * I run in one of three modes, re-evaluated whenever login state changes:
 *
 *   'dormant'         Not a server instance, or nobody is logged in. No timers,
 *                     no requests, nothing.
 *   'stalenessOnly'   Server instance, logged in, but unable to save — i.e. a
 *                     guest. Guests can edit but never write to the server, so
 *                     they need no lock and must never be blocked by one. They
 *                     do need to know when their snapshot has gone stale, which
 *                     a conditional HEAD on the static hypervideo.json provides
 *                     without any authenticated endpoint.
 *   'full'            Server instance and able to save. Presence, locks and
 *                     staleness.
 *
 * Annotations are deliberately outside the lock: they live in per-user files
 * (annotations/<userId>.json) and are safe to edit concurrently.
 *
 * @class Collaboration
 * @static
 */

FrameTrail.defineModule('Collaboration', function(FrameTrail){

    var MODE_DORMANT = 'dormant',
        MODE_STALENESS_ONLY = 'stalenessOnly',
        MODE_FULL = 'full';

    // Must stay below the server's COLLAB_LEASE (45s) with room for a missed poll.
    var POLL_EDITING = 5000,
        POLL_IDLE    = 15000,
        POLL_GUEST   = 30000;

    var mode       = MODE_DORMANT,
        sessions   = {},
        primaryKey = null,
        pollTimer  = null,
        revision   = 0,

        boundVisibility = null,
        boundPageHide   = null;


    function keyOf(scope, scopeId) {

        return scope + ':' + scopeId;

    }


    /**
     * Resolve a session from optional arguments, defaulting to the primary
     * (hypervideo) scope.
     */
    function sessionFor(scope, scopeId) {

        if (scope === undefined || scope === null) {
            return primaryKey ? sessions[primaryKey] : null;
        }

        return sessions[keyOf(scope, scopeId)] || null;

    }


    /* ------------------------------------------------------------------ *
     * Transport
     * ------------------------------------------------------------------ */

    var _transport = {

        /**
         * POST to the collaboration endpoints. Takes a plain object rather than
         * a form body, because every caller here builds one, and reports through
         * callbacks rather than a promise to match the rest of this module.
         */
        post: function(data, done, fail) {

            FrameTrail.module('StorageManager')
                .serverPost(new URLSearchParams(data))
                .then(done)
                .catch(function(err) { if (fail) fail(err); });

        },

        /**
         * Fire-and-forget release, for page unload. sendBeacon carries cookies
         * on a same-origin request, so the PHP session still identifies us.
         */
        beaconRelease: function(session) {

            if (!navigator.sendBeacon) return;

            var RouteNav  = FrameTrail.module('RouteNavigation'),
                serverURL = RouteNav ? RouteNav.resolveServerURL('ajaxServer.php') : null;

            if (!serverURL) return;

            var data = { a: 'collabLock', scope: session.scope, scopeId: session.scopeId, op: 'release' };
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            if (adapter && adapter.dataPathAbsolute) {
                data.dataPath = adapter.dataPathAbsolute;
            }

            navigator.sendBeacon(serverURL, new URLSearchParams(data));

        }

    };


    /* ------------------------------------------------------------------ *
     * Mode
     * ------------------------------------------------------------------ */

    function determineMode() {

        if (FrameTrail.getState('storageMode') !== 'server') {
            return MODE_DORMANT;
        }
        if (!FrameTrail.getState('loggedIn')) {
            return MODE_DORMANT;
        }

        var StorageManager = FrameTrail.module('StorageManager');
        if (!StorageManager || !StorageManager.canSave()) {
            // Logged in but cannot write to the server — a guest.
            return MODE_STALENESS_ONLY;
        }

        return MODE_FULL;

    }


    function broadcast() {

        FrameTrail.changeState('collabState', ++revision);

    }


    function ownUserID() {

        var UserManagement = FrameTrail.module('UserManagement');
        return UserManagement ? String(UserManagement.userID) : null;

    }


    /* ------------------------------------------------------------------ *
     * Polling
     * ------------------------------------------------------------------ */

    function currentInterval() {

        if (mode === MODE_STALENESS_ONLY) return POLL_GUEST;

        var interval = POLL_IDLE;
        for (var key in sessions) {
            if (sessions[key].editing) interval = POLL_EDITING;
        }

        return interval;

    }


    function scheduleNextPoll() {

        window.clearTimeout(pollTimer);

        if (mode === MODE_DORMANT) return;
        if (!Object.keys(sessions).length) return;
        if (document.hidden) return;   // resumed by the visibilitychange handler

        pollTimer = window.setTimeout(poll, currentInterval());

    }


    function poll() {

        if (mode === MODE_DORMANT) return;

        var keys = Object.keys(sessions);
        if (!keys.length) return;

        if (mode === MODE_STALENESS_ONLY) {
            pollGuest(keys);
        } else {
            pollBatch(keys);
        }

    }


    /**
     * One request for every scope we are watching. Batching is what makes the
     * always-on scopes affordable: they ride along in the request the primary
     * scope was going to send anyway, so watching more costs nothing.
     */
    function pollBatch(keys) {

        var payload = keys.map(function(key) {

            var session = sessions[key];

            return {
                scope:        session.scope,
                scopeId:      session.scopeId,
                editing:      !!session.editing,
                unsaved:      !!session.unsaved,
                observe:      !!session.observe,
                knownVersion: (session.knownVersion == null ? null : session.knownVersion)
            };

        });

        _transport.post({
            a:        'collabSync',
            sessions: JSON.stringify(payload)
        }, function(data) {

            if (data && data.code === 0 && data.response) {
                for (var key in data.response) {
                    // A session may have been stopped while the poll was in
                    // flight; there is nothing left to apply it to.
                    if (sessions[key]) applyState(sessions[key], data.response[key]);
                }
            }
            scheduleNextPoll();

        }, function() {
            // A failed poll is not worth surfacing — the next one may well work.
            scheduleNextPoll();
        });

    }


    /**
     * Scopes whose staleness a guest can detect without an authenticated
     * endpoint, because the file behind them is plain and static: its
     * Last-Modified header is a free signal.
     *
     * A scope absent from here is simply not watched in guest mode, which is
     * right for settings, users and tags — a guest can act on none of them.
     */
    var GUEST_STALENESS_PATHS = {
        hypervideo: function(scopeId) { return 'hypervideos/' + scopeId + '/hypervideo.json'; },
        library:    function()        { return 'hypervideos/_index.json'; }
    };


    function pollGuest(keys) {

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        if (!adapter || !adapter.dataPathAbsolute) {
            scheduleNextPoll();
            return;
        }

        Promise.all(keys.map(function(key) {

            var session = sessions[key],
                resolve = GUEST_STALENESS_PATHS[session.scope];

            if (!resolve) return Promise.resolve();

            return fetch(adapter.dataPathAbsolute + resolve(session.scopeId), {
                method: 'HEAD',
                cache:  'no-cache'
            }).then(function(r) {

                if (!r.ok) return;

                var lastModified = r.headers.get('Last-Modified');
                if (!lastModified) return;

                if (session.guestLastModified === null) {
                    session.guestLastModified = lastModified;
                } else if (session.guestLastModified !== lastModified && !session.stale) {
                    session.stale = true;
                    broadcast();
                }

            }).catch(function() {
                // Ignore — try again on the next tick.
            });

        })).then(scheduleNextPoll);

    }


    /**
     * Who is present, as a value that changes whenever the membership does.
     * A count would not: one person leaving as another joins is a different
     * room with the same number of people in it, and the presence row would
     * go on naming whoever left until something else happened to broadcast.
     */
    function participantSignature(participants) {

        return (participants || []).map(function(participant) {
            return String(participant.id);
        }).sort().join(',');

    }


    function applyState(session, response) {

        var previousStale     = session.stale,
            previousLock      = session.lock ? session.lock.holderId : null,
            previousSignature = participantSignature(session.participants);

        session.participants = response.participants || [];
        session.lock         = response.lock || null;
        session.lastWriter   = response.lastWriter || null;
        session.version      = response.version;

        if (session.knownVersion === null) {
            // First sync of the session: adopt whatever is on disk as our baseline.
            session.knownVersion = response.version;
            session.stale = false;
        } else if (session.lastWriter && String(session.lastWriter.id) === ownUserID()) {
            // We wrote it. Never tell someone about their own change — and adopt
            // the version so a save whose response we missed cannot leave us
            // permanently "stale" against ourselves.
            session.knownVersion = response.version;
            session.stale = false;
        } else {
            session.stale = !!response.stale;
        }

        if (session.stale !== previousStale
            || (session.lock ? session.lock.holderId : null) !== previousLock
            || participantSignature(session.participants) !== previousSignature) {
            broadcast();
        }

    }


    /* ------------------------------------------------------------------ *
     * Lifecycle
     * ------------------------------------------------------------------ */

    function bindWindowHandlers() {

        if (boundVisibility) return;

        boundVisibility = function() {
            if (document.hidden) {
                window.clearTimeout(pollTimer);
            } else {
                poll();
            }
        };
        document.addEventListener('visibilitychange', boundVisibility);

        boundPageHide = function() {
            for (var key in sessions) {
                if (holdsLock(sessions[key])) _transport.beaconRelease(sessions[key]);
            }
        };
        window.addEventListener('pagehide', boundPageHide);

    }


    function unbindWindowHandlers() {

        if (boundVisibility) {
            document.removeEventListener('visibilitychange', boundVisibility);
            boundVisibility = null;
        }
        if (boundPageHide) {
            window.removeEventListener('pagehide', boundPageHide);
            boundPageHide = null;
        }

    }


    /**
     * I begin tracking a scope. The hypervideo scope becomes the primary one,
     * which every accessor defaults to.
     *
     * @method start
     * @param {String} scope   'hypervideo', 'settings', 'users', 'tags' or 'library'
     * @param {String} scopeId hypervideo ID, or 'global'
     * @param {Object} [options] { observe: true } to watch without joining,
     *                           { editing: true } to heartbeat as an editor
     */
    function start(scope, scopeId, options) {

        // Register the session regardless of mode. Callers start us during
        // player init, which routinely happens before the user has logged in —
        // if we bailed out here, the later login would have no session to
        // activate and presence would never appear.
        mode = determineMode();

        scopeId = String(scopeId);
        var key = keyOf(scope, scopeId);

        if (scope === 'hypervideo' && primaryKey && primaryKey !== key) {
            // Switched to a different hypervideo — the old one is no longer ours.
            stop('hypervideo', sessions[primaryKey].scopeId);
        }

        if (sessions[key]) {
            // An ambient session may already be watching this scope; a caller
            // arriving to actually work in it takes it over rather than being
            // silently ignored.
            if (options && options.observe === false) setObserving(false, scope, scopeId);
            return;
        }

        sessions[key] = {
            scope:        scope,
            scopeId:      scopeId,
            participants: [],
            lock:         null,
            version:      null,
            knownVersion: null,
            stale:        false,
            // Set here rather than by a setEditing() after the fact, because
            // start() polls immediately: a scope that is only ever entered by
            // an editor would otherwise report editing:false on its very first
            // heartbeat and correct itself one tick later.
            editing:      !!(options && options.editing),
            unsaved:      false,
            observe:      !!(options && options.observe),
            lastWriter:   null,
            guestLastModified: null
        };

        if (scope === 'hypervideo') primaryKey = key;

        bindWindowHandlers();
        poll();

    }


    /**
     * I promote a watched scope to a participating one, or demote it back.
     *
     * An observed scope polls for staleness but registers no presence and holds
     * no lock, so a passive admin learns the settings changed without appearing
     * to everyone as though they had the settings dialog open. A surface that
     * actually edits the scope promotes it for as long as it is open.
     *
     * Demoting releases any lock we hold, so a closing dialog cannot strand one.
     *
     * @method setObserving
     * @param {Boolean} value
     * @param {String} [scope]
     * @param {String} [scopeId]
     */
    function setObserving(value, scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session || session.observe === !!value) return;

        session.observe = !!value;

        if (session.observe && holdsLock(session)) {
            lockOperation(session, 'release');
        }

        // Presence must not wait for the next tick to appear or disappear.
        poll();

    }


    /**
     * Tell the server we have left a scope, so we stop appearing to everyone
     * else in it. Without this the only way out is the lease expiring, and 45
     * seconds of ghost presence is exactly the staleness presence exists to
     * avoid — someone who left edit mode would go on being listed as editing.
     *
     * Spelled as an observing sync rather than a new operation because that is
     * already what leaving means: setObserving demotes the same way, and the
     * server drops a participant that turns up observing.
     *
     * Fire-and-forget: the session is going away regardless, and a failed
     * request only means falling back to the lease.
     */
    function deregister(session) {

        if (mode !== MODE_FULL || !session || session.observe) return;

        _transport.post({
            a:        'collabSync',
            sessions: JSON.stringify([{
                scope:        session.scope,
                scopeId:      session.scopeId,
                observe:      true,
                knownVersion: null
            }])
        }, function() {}, function() {});

    }


    /**
     * I stop tracking a scope, releasing its lock if we hold it.
     *
     * @method stop
     * @param {String} [scope]   omit to stop the primary scope
     * @param {String} [scopeId]
     */
    function stop(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session) return;

        var key = keyOf(session.scope, session.scopeId);

        if (holdsLock(session)) {
            lockOperation(session, 'release');
        }

        deregister(session);

        delete sessions[key];
        if (primaryKey === key) primaryKey = null;

        if (!Object.keys(sessions).length) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
            unbindWindowHandlers();
        }

    }


    function stopAll() {

        for (var key in sessions) {
            stop(sessions[key].scope, sessions[key].scopeId);
        }

    }


    /* ------------------------------------------------------------------ *
     * Lock operations
     * ------------------------------------------------------------------ */

    function lockOperation(session, op, callback) {

        if (mode !== MODE_FULL || !session) {
            if (callback) callback({ ok: false, reason: 'inactive' });
            return;
        }

        _transport.post({
            a:       'collabLock',
            scope:   session.scope,
            scopeId: session.scopeId,
            op:      op
        }, function(data) {

            if (data && data.response) {
                applyState(session, data.response);
                broadcast();
            }

            if (data && data.code === 0) {
                if (callback) callback({ ok: true });
            } else {
                if (callback) callback({ ok: false, code: data ? data.code : null, reason: data ? data.string : 'unknown' });
            }

        }, function(error) {
            if (callback) callback({ ok: false, reason: error.message });
        });

    }


    function claim(callback, scope, scopeId) {

        var session = sessionFor(scope, scopeId);

        // Taking the lock is joining by definition, and collabLock registers
        // presence server-side regardless — so an observing session that stayed
        // observing would show up in the state and then vanish on its next poll.
        if (session) session.observe = false;

        lockOperation(session, 'claim', callback);

    }

    function release(callback, scope, scopeId) {
        lockOperation(sessionFor(scope, scopeId), 'release', callback);
    }

    function takeover(callback, scope, scopeId) {
        lockOperation(sessionFor(scope, scopeId), 'takeover', callback);
    }


    /* ------------------------------------------------------------------ *
     * Accessors
     * ------------------------------------------------------------------ */

    function holdsLock(session) {

        return !!(session && session.lock && String(session.lock.holderId) === ownUserID());

    }


    function hasLock(scope, scopeId) {

        return holdsLock(sessionFor(scope, scopeId));

    }


    /**
     * The participant holding the lock, or null. Resolved against the presence
     * list so callers get a display name and colour, not just an ID.
     */
    function lockHolder(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session || !session.lock) return null;

        for (var i = 0; i < session.participants.length; i++) {
            if (String(session.participants[i].id) === String(session.lock.holderId)) {
                return session.participants[i];
            }
        }

        return { id: session.lock.holderId, name: '', color: '' };

    }


    /**
     * Everyone present except us. Drives both the presence UI and the decision
     * to auto-save: there is no reason to auto-save when nobody can see it.
     */
    function others(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session) return [];

        var self = ownUserID();

        return session.participants.filter(function(p) {
            return String(p.id) !== self;
        });

    }


    /**
     * True when the lock is held by somebody else — i.e. lock-gated editing
     * controls should be disabled. Never true in staleness-only mode, because
     * a guest's edits are local and cannot conflict with anything.
     */
    function isLockedByOther(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        return mode === MODE_FULL && !!session && !!session.lock && !holdsLock(session);

    }


    function setEditing(value, scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session) return;

        value = !!value;
        if (session.editing === value) return;

        session.editing = value;
        scheduleNextPoll();   // cadence depends on it

    }


    function setUnsaved(value, scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (session) session.unsaved = !!value;

    }


    /**
     * Called once the client is in sync with the server state — after a save of
     * our own, or after re-rendering from a refresh.
     *
     * Pass the version the server reported *after* the write. Without it we
     * would fall back to session.version, which is the token from the last
     * poll — i.e. from before our own save — and the next poll would report us
     * stale against our own change.
     *
     * @method acknowledgeVersion
     * @param {Number} [newVersion] version token reported by the write response
     */
    function acknowledgeVersion(newVersion, scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session) return;

        session.knownVersion = (newVersion === undefined || newVersion === null)
                             ? session.version
                             : newVersion;
        session.version = session.knownVersion;
        session.guestLastModified = null;
        session.stale = false;
        broadcast();

    }


    /**
     * Flag the document as changed underneath us without any UI interruption.
     * Used when an automatic save is rejected by the compare-and-swap guard:
     * a background action must never raise a modal, so it feeds the ordinary
     * "changes available" affordance instead.
     *
     * @method markStale
     */
    function markStale(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        if (!session || session.stale) return;

        session.stale = true;
        broadcast();

    }


    /**
     * Who last wrote this scope, as reported by the server. This is the correct
     * attribution for a staleness notice — the lock holder is not, since a
     * takeover changes the holder without changing who saved.
     *
     * @method lastWriter
     * @return {Object|null} { id, name, at }
     */
    function lastWriter(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        return session ? (session.lastWriter || null) : null;

    }


    function isStale(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        return !!(session && session.stale);

    }


    function participants(scope, scopeId) {

        var session = sessionFor(scope, scopeId);
        return session ? session.participants : [];

    }


    /**
     * Login state changed. Sessions survive the transition — only what we are
     * allowed to do with them changes — so reset per-session state that the
     * new identity invalidates and pick the polling back up.
     */
    /* ------------------------------------------------------------------ *
     * Presence avatars
     *
     * Shared here rather than in Titlebar because the settings dialogs show
     * the same avatars for their own scopes.
     * ------------------------------------------------------------------ */

    /**
     * Up to two initials: the first letters of the first two words, or a single
     * leading character for a one-word name. Array.from rather than charAt so a
     * name beginning with an astral character is not split mid-surrogate-pair.
     *
     * @method initialsOf
     * @param {String} name
     * @return String
     */
    function initialsOf(name) {

        var words = String(name || '').trim().split(/\s+/).filter(Boolean);

        if (!words.length) return '?';

        return words.slice(0, 2).map(function(word) {
            return Array.from(word)[0];
        }).join('').toUpperCase();

    }


    /**
     * Users pick their own colour from a palette spanning very dark to very
     * light, so the initials cannot simply be white — pick whichever of
     * dark/light actually reads on the given fill.
     *
     * @method readableTextColor
     * @param {String} hex
     * @return String
     */
    function readableTextColor(hex) {

        var value = String(hex).replace(/^#/, '');

        if (value.length === 3) {
            value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
        }
        if (!/^[0-9a-f]{6}$/i.test(value)) return '';

        var n = parseInt(value, 16),
            r = (n >> 16) & 255,
            g = (n >> 8) & 255,
            b = n & 255,
            // Rec. 601 luma — ample for a two-way light/dark decision.
            luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return (luma > 0.6) ? '#222222' : '#ffffff';

    }


    /**
     * Render one avatar per other participant in a scope into a container.
     * The lock holder is ringed; the full name lives in the tooltip.
     *
     * The options exist for the title bar, which draws a different set of
     * people than the one whose lock it wants to ring: its people come from the
     * instance-wide presence scope, while the ring must mean "and this is the
     * one editing what you are looking at". Every option defaults to the
     * single-scope behaviour, so a caller that only cares about one scope —
     * every dialog — passes nothing.
     *
     * @method renderAvatars
     * @param {HTMLElement} container
     * @param {String} [scope]
     * @param {String} [scopeId]
     * @param {Object} [options]
     * @param {String} [options.lockScope]   scope whose lock decides the ring
     * @param {String} [options.lockScopeId]
     * @param {String} [options.tooltip]     label key for a non-holder chip
     * @param {Number} [options.max]         cap; the rest collapse into one +N chip
     */
    function renderAvatars(container, scope, scopeId, options) {

        if (!container) return;

        options = options || {};

        var labels  = FrameTrail.module('Localization').labels,
            tooltip = options.tooltip || 'MessageCollabAlsoHere';

        container.innerHTML = '';

        var people = others(scope, scopeId);
        if (!people.length) return;

        var lock = ('lockScope' in options)
                 ? lockHolder(options.lockScope, options.lockScopeId)
                 : lockHolder(scope, scopeId);

        // The lock holder is the one chip that must never be the one dropped:
        // whoever is editing what you are looking at is the whole point of the
        // row. Everyone else keeps the server's order.
        if (lock && options.max && people.length > options.max) {
            people = people.slice().sort(function(a, b) {
                return (String(b.id) === String(lock.id)) - (String(a.id) === String(lock.id));
            });
        }

        var shown  = options.max ? people.slice(0, options.max) : people,
            hidden = options.max ? people.slice(options.max)    : [];

        shown.forEach(function(participant) {

            var isEditing = !!(lock && String(lock.id) === String(participant.id));

            var chip = document.createElement('span');
            chip.className = 'collaborationChip' + (isEditing ? ' editing' : '');
            chip.textContent = initialsOf(participant.name);
            chip.setAttribute('data-tooltip-bottom-right',
                isEditing ? labels['MessageCollabLockedBy'].replace('%s', participant.name)
                          : labels[tooltip].replace('%s', participant.name));

            if (participant.color) {
                // Stored without a leading # in users.json.
                var color = /^#/.test(participant.color) ? participant.color : '#' + participant.color;
                chip.style.backgroundColor = color;
                chip.style.color = readableTextColor(color);
            }

            container.appendChild(chip);

        });

        if (hidden.length) {

            // Deliberately left without an inline colour: .collaborationChip's
            // own fill is what marks this one as a count rather than a person.
            var more = document.createElement('span');
            more.className = 'collaborationChip';
            more.textContent = '+' + hidden.length;
            more.setAttribute('data-tooltip-bottom-right', hidden.map(function(participant) {
                return participant.name;
            }).join(', '));

            container.appendChild(more);

        }

    }


    /**
     * Mount presence UI into a dialog's title bar: avatars on the right, just
     * clear of the close button, and a status message centred in the title row.
     * This is title-level metadata about the document, not an action, so it
     * belongs here rather than in the button pane.
     *
     * @method mountDialogPresence
     * @param {Object} dialogCtrl a Dialog() controller
     * @return {Object|null} { presence, message } DOM elements
     */
    function mountDialogPresence(dialogCtrl) {

        var widget   = dialogCtrl && dialogCtrl.widget ? dialogCtrl.widget() : null,
            titlebar = widget ? widget.querySelector('.ft-dialog-titlebar') : null;

        if (!titlebar) return null;

        var messageEl = document.createElement('div');
        messageEl.className = 'dialogCollabMessage message error';

        var presenceEl = document.createElement('div');
        presenceEl.className = 'collaborationPresence dialogPresence';

        // Before the close button in DOM order; the button itself is absolutely
        // positioned, so the avatars reserve room for it via margin.
        var closeBtn = titlebar.querySelector('.ft-dialog-titlebar-close');
        if (closeBtn) {
            titlebar.insertBefore(messageEl, closeBtn);
            titlebar.insertBefore(presenceEl, closeBtn);
        } else {
            titlebar.appendChild(messageEl);
            titlebar.appendChild(presenceEl);
        }

        // The close button is normally pinned to the dialog's top-right corner,
        // which leaves it visibly above the avatars. Marking the bar lets CSS
        // pull the button into the flex row so everything sits on one line —
        // scoped to this class so no other dialog's layout changes.
        titlebar.classList.add('hasCollabPresence');

        return { presence: presenceEl, message: messageEl };

    }


    /**
     * Guest mode hands out the admin role locally, so anything gated on being
     * an admin also has to require a session that can actually write — a guest
     * has no business being told the settings moved.
     */
    function isAdmin() {

        var UserManagement = FrameTrail.module('UserManagement');
        return mode === MODE_FULL && !!UserManagement && UserManagement.userRole === 'admin';

    }


    /**
     * Scopes watched for the whole session rather than opened by one surface.
     *
     * Batched polling makes these free — they ride along in the request the
     * primary scope already sends — which is what lets a passive admin sitting
     * in the overview find out that somebody changed the instance settings, and
     * anyone at all find out that the hypervideo library changed.
     */
    var AMBIENT_SCOPES = [

        { scope: 'library',  scopeId: 'global', observe: true,
          wanted: function() { return mode !== MODE_DORMANT; } },

        { scope: 'settings', scopeId: 'global', observe: true,
          wanted: function() { return mode !== MODE_DORMANT && isAdmin(); } },

        // The one *participating* ambient scope, and the only one that guards
        // no file. It exists exactly as long as we are in edit mode, which is
        // what lets membership itself be the signal: the people in it are the
        // people editing this instance right now, so the presence row needs no
        // filtering and the lease does the "still active" pruning for free. A
        // passive viewer writes nothing to it and appears to nobody.
        { scope: 'presence', scopeId: 'global', observe: false,
          wanted: function() { return mode === MODE_FULL && !!FrameTrail.getState('editMode'); } }

    ];


    function syncAmbientScopes() {

        AMBIENT_SCOPES.forEach(function(entry) {

            var key    = keyOf(entry.scope, entry.scopeId),
                wanted = entry.wanted();

            if (wanted && !sessions[key]) {

                // Participating in an ambient scope means editing — that is the
                // only reason we join one — so it also sets the cadence. Without
                // it an editor working only in the overview polls at the idle
                // interval, because Sidebar's setEditing has no primary
                // hypervideo session to land on.
                start(entry.scope, entry.scopeId, {
                    observe: entry.observe,
                    editing: !entry.observe
                });

                if (sessions[key]) sessions[key].ambient = true;

            } else if (!wanted && sessions[key]
                       && sessions[key].ambient
                       && sessions[key].observe === entry.observe) {
                // Only ever retract what we opened ourselves, and only while it
                // is still in the state we opened it in — a surface that
                // promoted an observed scope owns it now and will stop it in
                // its turn. `ambient` alone would not say that, since the
                // presence scope is ours *and* participating.
                stop(entry.scope, entry.scopeId);
            }

        });

    }


    function reevaluateMode() {

        var next = determineMode();
        if (next === mode) return;

        mode = next;

        for (var key in sessions) {
            sessions[key].participants = [];
            sessions[key].lock         = null;
            sessions[key].lastWriter   = null;
            sessions[key].knownVersion = null;
            sessions[key].stale        = false;
            sessions[key].guestLastModified = null;
        }

        // The role that decides which ambient scopes apply is only known once
        // somebody is logged in, so this belongs here rather than at init.
        syncAmbientScopes();

        if (mode === MODE_DORMANT) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
        } else {
            poll();
        }

        broadcast();

    }


    /**
     * Entering or leaving edit mode joins or leaves the presence scope, which
     * is the whole of what "who is editing" means.
     *
     * Deliberately not reevaluateMode: the mode has not changed here, and that
     * function resets every session's state when it does.
     */
    function editModeChanged() {

        mode = determineMode();
        syncAmbientScopes();

    }


    // The player initializes me before storage and login are settled, so this
    // normally finds nothing to do and reevaluateMode opens the ambient scopes
    // later. It matters for a host that initializes me after the fact, where no
    // loggedIn change is ever going to arrive.
    mode = determineMode();
    syncAmbientScopes();


    return {

        start:              start,
        stop:               stop,
        stopAll:            stopAll,

        claim:              claim,
        release:            release,
        takeover:           takeover,

        setEditing:         setEditing,
        setUnsaved:         setUnsaved,
        setObserving:       setObserving,
        acknowledgeVersion: acknowledgeVersion,
        markStale:          markStale,
        lastWriter:         lastWriter,

        initialsOf:         initialsOf,
        readableTextColor:  readableTextColor,
        renderAvatars:      renderAvatars,
        mountDialogPresence: mountDialogPresence,

        hasLock:            hasLock,
        lockHolder:         lockHolder,
        isLockedByOther:    isLockedByOther,
        isStale:            isStale,
        participants:       participants,
        others:             others,
        othersPresent:      function(scope, scopeId) { return others(scope, scopeId).length > 0; },
        isActive:           function() { return mode === MODE_FULL; },
        mode:               function() { return mode; },

        onChange: {
            'loggedIn': reevaluateMode,
            'editMode': editModeChanged
        }

    };

});
