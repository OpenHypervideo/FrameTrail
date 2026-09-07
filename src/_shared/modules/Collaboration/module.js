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
 * I track several scopes at once, because the two shared surfaces can be open
 * simultaneously — you can have the admin settings dialog open while a
 * hypervideo is loaded:
 *
 *   'hypervideo' / <id>       guards hypervideo.json
 *   'settings'   / 'global'   guards config.json and custom.css
 *
 * The hypervideo scope is the "primary" one, and every accessor defaults to it
 * so callers that only care about the hypervideo need not pass a scope.
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
        pollInFlight = 0,

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
         * POST to the collaboration endpoints. Mirrors Database._ajax's POST
         * branch, including the dataPath the PHP backend needs to resolve the
         * right _data directory.
         */
        post: function(data, done, fail) {

            var RouteNav  = FrameTrail.module('RouteNavigation'),
                serverURL = RouteNav ? RouteNav.resolveServerURL('ajaxServer.php') : null;

            if (!serverURL) {
                if (fail) fail(new Error('No server configured'));
                return;
            }

            var adapter = FrameTrail.module('StorageManager').getAdapter();
            if (adapter && adapter.dataPathAbsolute) {
                data.dataPath = adapter.dataPathAbsolute;
            }

            fetch(serverURL, {
                method: 'POST',
                cache:  'no-cache',
                body:   new URLSearchParams(data)
            }).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(done).catch(function(err) {
                if (fail) fail(err);
            });

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

        pollInFlight = keys.length;

        keys.forEach(function(key) {
            if (mode === MODE_STALENESS_ONLY) {
                pollGuest(sessions[key]);
            } else {
                pollSession(sessions[key]);
            }
        });

    }


    function pollDone() {

        if (--pollInFlight <= 0) {
            pollInFlight = 0;
            scheduleNextPoll();
        }

    }


    function pollSession(session) {

        _transport.post({
            a:            'collabSync',
            scope:        session.scope,
            scopeId:      session.scopeId,
            editing:      session.editing ? '1' : '0',
            unsaved:      session.unsaved ? '1' : '0',
            knownVersion: (session.knownVersion == null ? '' : session.knownVersion)
        }, function(data) {

            if (data && data.code === 0 && data.response) {
                applyState(session, data.response);
            }
            pollDone();

        }, function() {
            // A failed poll is not worth surfacing — the next one may well work.
            pollDone();
        });

    }


    /**
     * Guests have no authenticated endpoint, but hypervideo.json is a plain
     * static file, so its Last-Modified header is a free staleness signal.
     */
    function pollGuest(session) {

        if (session.scope !== 'hypervideo') {
            pollDone();
            return;
        }

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        if (!adapter || !adapter.dataPathAbsolute) {
            pollDone();
            return;
        }

        var url = adapter.dataPathAbsolute + 'hypervideos/' + session.scopeId + '/hypervideo.json';

        fetch(url, { method: 'HEAD', cache: 'no-cache' }).then(function(r) {

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
        }).then(pollDone);

    }


    function applyState(session, response) {

        var previousStale = session.stale,
            previousLock  = session.lock ? session.lock.holderId : null,
            previousCount = session.participants.length;

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
            || session.participants.length !== previousCount) {
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
     * @param {String} scope   'hypervideo' or 'settings'
     * @param {String} scopeId hypervideo ID, or 'global'
     */
    function start(scope, scopeId) {

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

        if (sessions[key]) return;

        sessions[key] = {
            scope:        scope,
            scopeId:      scopeId,
            participants: [],
            lock:         null,
            version:      null,
            knownVersion: null,
            stale:        false,
            editing:      false,
            unsaved:      false,
            lastWriter:   null,
            guestLastModified: null
        };

        if (scope === 'hypervideo') primaryKey = key;

        bindWindowHandlers();
        poll();

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
        lockOperation(sessionFor(scope, scopeId), 'claim', callback);
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
     * @method renderAvatars
     * @param {HTMLElement} container
     * @param {String} [scope]
     * @param {String} [scopeId]
     */
    function renderAvatars(container, scope, scopeId) {

        if (!container) return;

        var labels = FrameTrail.module('Localization').labels;

        container.innerHTML = '';

        var people = others(scope, scopeId);
        if (!people.length) return;

        var lock = lockHolder(scope, scopeId);

        people.forEach(function(participant) {

            var isEditing = !!(lock && String(lock.id) === String(participant.id));

            var chip = document.createElement('span');
            chip.className = 'collaborationChip' + (isEditing ? ' editing' : '');
            chip.textContent = initialsOf(participant.name);
            chip.setAttribute('data-tooltip-bottom-right',
                isEditing ? labels['MessageCollabLockedBy'].replace('%s', participant.name)
                          : labels['MessageCollabAlsoHere'].replace('%s', participant.name));

            if (participant.color) {
                // Stored without a leading # in users.json.
                var color = /^#/.test(participant.color) ? participant.color : '#' + participant.color;
                chip.style.backgroundColor = color;
                chip.style.color = readableTextColor(color);
            }

            container.appendChild(chip);

        });

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

        if (mode === MODE_DORMANT) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
        } else {
            poll();
        }

        broadcast();

    }


    return {

        start:              start,
        stop:               stop,
        stopAll:            stopAll,

        claim:              claim,
        release:            release,
        takeover:           takeover,

        setEditing:         setEditing,
        setUnsaved:         setUnsaved,
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
            'loggedIn': reevaluateMode
        }

    };

});
