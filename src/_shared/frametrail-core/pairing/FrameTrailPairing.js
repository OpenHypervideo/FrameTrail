/**
 * @module Shared
 */


/**
 * I am FrameTrailPairing: what a desktop FrameTrail (the host) and a phone
 * (the guest, companion.html) need to find each other through a broker and
 * to talk over a WebRTC DataChannel (docs/PAIRING.md):
 *
 *     FrameTrailPairing.randomId();                                // → 128 random bits, base64url
 *     FrameTrailPairing.joinURL(companionURL, room, broker, fp);   // → what the QR code holds
 *     FrameTrailPairing.parseJoin(location.hash);                  // → { room, broker, fp } or null
 *     FrameTrailPairing.checkFingerprint(answerSDP, fp);           // → is it the host's certificate?
 *     var broker = FrameTrailPairing.brokerClient(brokerURL);      // → ice(), openRoom(), postOffer(), …
 *     FrameTrailPairing.encode({ type: 'ping', id: 1 });           // → text for the channel
 *     FrameTrailPairing.decode(text, 'guest');                     // → the message, or null when it is not one
 *     FrameTrailPairing.bundleMessages(id, text);                  // → bundle-start, bundle-part …, bundle-end
 *     FrameTrailPairing.createAssembler();                         // → puts them together again
 *     FrameTrailPairing.createClock();                             // → the host's playhead, extrapolated
 *
 * The broker is a small HTTP service that passes opaque blobs between the
 * two, and nothing else; the stub in scripts/pairing-broker.mjs implements
 * its contract. Playback state belongs to the host: the guest only sends
 * requests, the host applies them and sends its state, on every change and
 * as a heartbeat.
 *
 * I touch neither the DOM nor any FrameTrail instance, so I run in the
 * browser as a plain script (window.FrameTrailPairing) and in Node under
 * require(). Ids need crypto.getRandomValues, the broker client fetch, the
 * ICE helpers an RTCPeerConnection; all three are globals in both.
 *
 * @class FrameTrailPairing
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailPairing = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {


    var PROTOCOL_VERSION = 1,

        // The DataChannel both sides create, negotiated: no in-band announcement.
        CHANNEL          = { label: 'frametrail', negotiated: true, id: 0 },

        // Characters of a bundle per bundle-part message: far below every
        // browser's message size limit, even for text that is mostly escapes.
        CHUNK_SIZE       = 16384,

        // How long an offer or answer waits for ICE gathering to complete.
        // Host candidates (the LAN) are there in milliseconds; a STUN or TURN
        // server that does not answer must not hold the handshake up.
        GATHER_TIMEOUT   = 3000,

        // How long a guest waits for the host's answer, and how often it asks.
        ANSWER_TIMEOUT   = 60000,
        POLL_INTERVAL    = 1000,

        // How far the guest's extrapolated playhead may be off before it
        // jumps to the host's.
        JUMP_THRESHOLD   = 0.25,

        // The largest blob a broker has to accept.
        MAX_BLOB         = 65536,

        ID_PATTERN          = /^[A-Za-z0-9_-]{16,64}$/,
        // SHA-256: 32 bytes, 43 characters of base64url.
        FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/,
        REFUSALS            = ['full', 'closed', 'version'];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * An error with a code: 'network' (no answer), 'http' (an unexpected
     * status), 'noRoom', 'forbidden', 'tooLarge', 'rateLimited', 'timeout',
     * 'aborted', 'invalid'.
     */
    function pairingError(code, message, status) {
        var error = new Error(message || code);
        error.name = 'FrameTrailPairingError';
        error.code = code;
        if (status !== undefined) { error.status = status; }
        return error;
    }


    /* ------------------------------------------------------------------ */
    /*  Ids                                                               */
    /* ------------------------------------------------------------------ */

    var BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    function toBase64url(bytes) {
        var out = '', i;
        for (i = 0; i + 2 < bytes.length; i += 3) {
            out += BASE64URL[bytes[i] >> 2]
                 + BASE64URL[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
                 + BASE64URL[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)]
                 + BASE64URL[bytes[i + 2] & 63];
        }
        if (i < bytes.length) {
            out += BASE64URL[bytes[i] >> 2];
            if (i + 1 < bytes.length) {
                out += BASE64URL[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)] + BASE64URL[(bytes[i + 1] & 15) << 2];
            } else {
                out += BASE64URL[(bytes[i] & 3) << 4];
            }
        }
        return out;
    }

    function fromBase64url(text) {
        var bytes = [], buffer = 0, bits = 0;
        for (var i = 0; i < text.length; i++) {
            var value = BASE64URL.indexOf(text[i]);
            if (value < 0) { return null; }
            buffer = (buffer << 6) | value;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                bytes.push((buffer >> bits) & 255);
            }
        }
        return new Uint8Array(bytes);
    }

    /**
     * I make an id: 128 random bits (or as many bytes as asked), base64url.
     *
     * @method randomId
     * @param {Number} [bytes] default 16
     * @return {String}
     */
    function randomId(bytes) {
        var array = new Uint8Array(bytes || 16);
        globalThis.crypto.getRandomValues(array);
        return toBase64url(array);
    }

    function isId(value) {
        return typeof value === 'string' && ID_PATTERN.test(value);
    }


    /* ------------------------------------------------------------------ */
    /*  Fingerprints                                                      */
    /* ------------------------------------------------------------------ */

    // "AB:CD:…" (as SDP and RTCCertificate write them) → base64url.
    function hexFingerprint(hex) {
        var pairs = String(hex).split(':');
        if (pairs.length < 2 || pairs.some(function(pair) { return !/^[0-9A-Fa-f]{2}$/.test(pair); })) { return null; }
        return toBase64url(pairs.map(function(pair) { return parseInt(pair, 16); }));
    }

    /**
     * The SHA-256 fingerprint of an RTCCertificate, base64url: what the join
     * link carries so the guest can tell the host's answer from a forged one.
     *
     * @method certificateFingerprint
     * @param {RTCCertificate} certificate
     * @return {String|null}
     */
    function certificateFingerprint(certificate) {
        var list = (certificate && typeof certificate.getFingerprints === 'function') ? certificate.getFingerprints() : [];
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].algorithm).toLowerCase() === 'sha-256') { return hexFingerprint(list[i].value); }
        }
        return null;
    }

    /**
     * The fingerprints an SDP announces (a=fingerprint lines, session or media level).
     *
     * @method sdpFingerprints
     * @param {String} sdp
     * @return {Array} [{ algorithm, value }], value base64url (null when unreadable)
     */
    function sdpFingerprints(sdp) {
        var result = [],
            pattern = /^a=fingerprint:(\S+)[ \t]+(\S+)[ \t]*$/gm,
            match;
        while ((match = pattern.exec(String(sdp || '')))) {
            result.push({ algorithm: match[1].toLowerCase(), value: hexFingerprint(match[2]) });
        }
        return result;
    }

    /**
     * Whether an SDP was made with the certificate of this fingerprint: it
     * announces at least one fingerprint, and every one is that SHA-256.
     *
     * @method checkFingerprint
     * @param {String} sdp
     * @param {String} expected base64url
     * @return {Boolean}
     */
    function checkFingerprint(sdp, expected) {
        var list = sdpFingerprints(sdp);
        return FINGERPRINT_PATTERN.test(expected || '') && list.length > 0 && list.every(function(fingerprint) {
            return fingerprint.algorithm === 'sha-256' && fingerprint.value === expected;
        });
    }


    /* ------------------------------------------------------------------ */
    /*  Join links, URLs                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * I make sure a broker's base URL ends with "/", so that paths of the
     * contract can be appended.
     *
     * @method brokerBase
     * @param {String} url
     * @return {String}
     */
    function brokerBase(url) {
        url = String(url || '').trim();
        return (url && url.slice(-1) !== '/') ? url + '/' : url;
    }

    /**
     * What is wrong with a broker URL for a page, or null: 'missing',
     * 'invalid' (not http(s)), 'insecure' (http on an https page, which the
     * browser would block — except on this machine: localhost, 127.0.0.1).
     *
     * @method checkBrokerURL
     * @param {String} url
     * @param {String} [pageProtocol] e.g. 'https:'
     * @return {String|null}
     */
    function checkBrokerURL(url, pageProtocol) {
        url = String(url || '').trim();
        if (!url) { return 'missing'; }
        var match = /^(https?):\/\/([^\/?#\s]+)/i.exec(url);
        if (!match) { return 'invalid'; }
        var local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(match[2]);
        if (pageProtocol === 'https:' && match[1].toLowerCase() === 'http' && !local) { return 'insecure'; }
        return null;
    }

    /**
     * The page a phone opens: the configured one, else companion.html beside
     * the page when that is served over http(s); null when there is none.
     *
     * @method companionURL
     * @param {String} configured  config.pairingCompanionURL
     * @param {String} pageURL     location.href
     * @return {String|null}
     */
    function companionURL(configured, pageURL) {
        configured = String(configured || '').trim();
        if (configured) {
            try { return new URL(configured, pageURL).href.split('#')[0]; } catch (e) { return null; }
        }
        if (!/^https?:/i.test(pageURL || '')) { return null; }
        try { return new URL('companion.html', pageURL).href; } catch (e) { return null; }
    }

    /**
     * The link a QR code holds: the companion page, with the room, the broker
     * and the host's fingerprint in the fragment (which no server sees).
     *
     * @method joinURL
     * @param {String} companion
     * @param {String} room
     * @param {String} broker
     * @param {String} fingerprint base64url
     * @return {String}
     */
    function joinURL(companion, room, broker, fingerprint) {
        return String(companion).split('#')[0]
            + '#pair=' + room
            + '&b=' + encodeURIComponent(brokerBase(broker))
            + '&fp=' + fingerprint;
    }

    /**
     * I read a join link, or its fragment.
     *
     * @method parseJoin
     * @param {String} urlOrHash
     * @return {Object|null} { room, broker, fp }
     */
    function parseJoin(urlOrHash) {
        var text = String(urlOrHash || ''),
            at   = text.indexOf('#'),
            hash = (at >= 0) ? text.slice(at + 1) : text,
            values = {};
        hash.split('&').forEach(function(part) {
            var eq = part.indexOf('=');
            if (eq <= 0) { return; }
            try { values[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1)); } catch (e) { /* not a value */ }
        });
        if (!isId(values.pair) || !FINGERPRINT_PATTERN.test(values.fp || '') || checkBrokerURL(values.b) !== null) {
            return null;
        }
        return { room: values.pair, broker: brokerBase(values.b), fp: values.fp };
    }

    /**
     * A short name for a device, from its user agent: what the host shows as
     * the guest's name.
     *
     * @method deviceLabel
     * @param {String} userAgent
     * @return {String}
     */
    function deviceLabel(userAgent) {
        var ua = String(userAgent || '');
        if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) { return 'iPad'; }
        if (/iPhone/.test(ua)) { return 'iPhone'; }
        if (/Android/.test(ua)) { return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'; }
        if (/Windows/.test(ua)) { return 'Windows'; }
        if (/Macintosh/.test(ua)) { return 'Mac'; }
        if (/Linux/.test(ua)) { return 'Linux'; }
        return 'Browser';
    }


    /* ------------------------------------------------------------------ */
    /*  The broker                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * A client of the broker contract (docs/PAIRING.md, "Broker contract").
     * Blobs go in and come out as objects; on the wire they are JSON text,
     * which the broker never reads. POST is sent as text/plain, so the
     * guest's first request needs no CORS preflight.
     *
     * @method brokerClient
     * @param {String} baseURL
     * @param {Object} [options] { fetch }
     * @return {Object}
     */
    function brokerClient(baseURL, options) {

        var base      = brokerBase(baseURL),
            fetchImpl = (options && options.fetch) || globalThis.fetch;

        function request(method, path, init) {
            init = init || {};
            var headers = {};
            if (init.hostKey) { headers['Authorization'] = 'Bearer ' + init.hostKey; }
            if (init.body !== undefined) { headers['Content-Type'] = 'text/plain;charset=UTF-8'; }
            return Promise.resolve().then(function() {
                return fetchImpl(base + path, {
                    method:      method,
                    headers:     headers,
                    body:        (init.body !== undefined) ? JSON.stringify(init.body) : undefined,
                    credentials: 'omit'
                });
            }).catch(function(error) {
                throw pairingError('network', 'The pairing broker cannot be reached (' + (error && error.message) + ')');
            }).then(function(response) {
                if (response.ok || (init.accept || []).indexOf(response.status) >= 0) { return response; }
                var codes = { 403: 'forbidden', 404: 'noRoom', 413: 'tooLarge', 429: 'rateLimited' };
                throw pairingError(codes[response.status] || 'http', 'The pairing broker answered ' + response.status, response.status);
            });
        }

        function readBlob(text) {
            try { return JSON.parse(text); } catch (e) { return null; }
        }

        function path(room, rest) {
            return 'rooms/' + encodeURIComponent(room) + (rest || '');
        }

        return {

            base: base,

            // The ICE servers to use: [] when the broker has none (LAN only).
            ice: function() {
                return request('GET', 'ice', { accept: [404] }).then(function(response) {
                    if (response.status === 404) { return []; }
                    return response.json().then(function(json) {
                        return (isObject(json) && Array.isArray(json.iceServers)) ? json.iceServers : [];
                    });
                });
            },

            openRoom: function(room, hostKey) {
                return request('PUT', path(room), { hostKey: hostKey }).then(function() {});
            },

            closeRoom: function(room, hostKey) {
                return request('DELETE', path(room), { hostKey: hostKey, accept: [404] }).then(function() {});
            },

            postOffer: function(room, guest, blob) {
                return request('POST', path(room, '/offers/' + encodeURIComponent(guest)), { body: blob }).then(function() {});
            },

            // { offers: [{ guest, cursor, blob }], cursor }; a blob that is not JSON is null.
            listOffers: function(room, hostKey, after) {
                return request('GET', path(room, '/offers?after=' + encodeURIComponent(after || 0)), { hostKey: hostKey }).then(function(response) {
                    return response.json();
                }).then(function(json) {
                    var offers = (isObject(json) && Array.isArray(json.offers)) ? json.offers : [];
                    return {
                        offers: offers.filter(isObject).map(function(offer) {
                            return { guest: offer.guest, cursor: offer.cursor, blob: (typeof offer.blob === 'string') ? readBlob(offer.blob) : null };
                        }),
                        cursor: (isObject(json) && typeof json.cursor === 'number') ? json.cursor : (after || 0)
                    };
                });
            },

            putAnswer: function(room, guest, hostKey, blob) {
                return request('PUT', path(room, '/answers/' + encodeURIComponent(guest)), { hostKey: hostKey, body: blob }).then(function() {});
            },

            // The answer, or null while there is none.
            getAnswer: function(room, guest) {
                return request('GET', path(room, '/answers/' + encodeURIComponent(guest)), { accept: [404] }).then(function(response) {
                    if (response.status === 404) { return null; }
                    return response.text().then(readBlob);
                });
            }

        };

    }

    function sleep(ms, signal) {
        return new Promise(function(resolve, reject) {
            if (signal && signal.aborted) { return reject(pairingError('aborted')); }
            var timer = setTimeout(function() {
                if (signal) { signal.removeEventListener('abort', onAbort); }
                resolve();
            }, ms);
            function onAbort() {
                clearTimeout(timer);
                reject(pairingError('aborted'));
            }
            if (signal) { signal.addEventListener('abort', onAbort); }
        });
    }

    /**
     * I ask the broker for the host's answer until there is one.
     *
     * @method pollAnswer
     * @param {Object} client  a brokerClient
     * @param {String} room
     * @param {String} guest
     * @param {Object} [options] { timeout, interval, signal }
     * @return {Promise} the answer blob; rejects with 'timeout', 'aborted' or a broker error
     */
    function pollAnswer(client, room, guest, options) {
        options = options || {};
        var timeout  = (options.timeout  != null) ? options.timeout  : ANSWER_TIMEOUT,
            interval = (options.interval != null) ? options.interval : POLL_INTERVAL,
            until    = Date.now() + timeout;

        function attempt() {
            if (options.signal && options.signal.aborted) { return Promise.reject(pairingError('aborted')); }
            return client.getAnswer(room, guest).then(function(blob) {
                if (blob !== null) { return blob; }
                if (Date.now() + interval > until) { throw pairingError('timeout', 'The host did not answer'); }
                return sleep(interval, options.signal).then(attempt);
            });
        }

        return attempt();
    }


    /* ------------------------------------------------------------------ */
    /*  Blobs                                                             */
    /* ------------------------------------------------------------------ */

    function offerBlob(sdp, label) {
        return { v: PROTOCOL_VERSION, sdp: String(sdp), label: String(label || '') };
    }

    function answerBlob(sdp) {
        return { v: PROTOCOL_VERSION, sdp: String(sdp) };
    }

    function refusalBlob(reason) {
        return { v: PROTOCOL_VERSION, refused: reason };
    }

    /**
     * A guest's offer as the host reads it: { sdp, label }, or { error }
     * ('version': a protocol this host does not speak; 'invalid').
     *
     * @method readOffer
     * @param {Object} blob
     * @return {Object}
     */
    function readOffer(blob) {
        if (!isObject(blob) || typeof blob.v !== 'number') { return { error: 'invalid' }; }
        if (blob.v !== PROTOCOL_VERSION) { return { error: 'version' }; }
        if (typeof blob.sdp !== 'string' || !blob.sdp) { return { error: 'invalid' }; }
        return { sdp: blob.sdp, label: (typeof blob.label === 'string') ? blob.label.slice(0, 64) : '' };
    }

    /**
     * The host's answer as the guest reads it: { sdp }, { refused } or null.
     *
     * @method readAnswer
     * @param {Object} blob
     * @return {Object|null}
     */
    function readAnswer(blob) {
        if (!isObject(blob) || typeof blob.v !== 'number') { return null; }
        if (typeof blob.refused === 'string') {
            return { refused: (REFUSALS.indexOf(blob.refused) >= 0) ? blob.refused : 'closed' };
        }
        if (blob.v !== PROTOCOL_VERSION) { return { refused: 'version' }; }
        return (typeof blob.sdp === 'string' && blob.sdp) ? { sdp: blob.sdp } : null;
    }


    /* ------------------------------------------------------------------ */
    /*  Messages                                                          */
    /* ------------------------------------------------------------------ */

    // What each side may send: field → type ('?' optional), or a list of allowed values.
    var MESSAGES = {
        host: {
            'welcome':      { v: 'number', canControl: 'boolean', resume: 'string', label: 'string' },
            'bundle-start': { id: 'string', size: 'number', parts: 'number' },
            'bundle-part':  { id: 'string', i: 'number', data: 'string' },
            'bundle-end':   { id: 'string' },
            'state':        { hypervideo: 'string', playing: 'boolean', time: 'number', rate: 'number', waiting: 'boolean', seq: 'number' },
            'control':      { canControl: 'boolean' },
            'view':         { mode: ['overview'] },
            'pong':         { id: 'number' },
            'bye':          { reason: 'string' }
        },
        guest: {
            'hello':        { v: 'number', guest: 'string', resume: 'string?', label: 'string' },
            'ready':        { id: 'string' },
            'request':      { action: ['play', 'pause', 'seek'], time: 'number?' },
            'ping':         { id: 'number' },
            'bye':          { reason: 'string?' }
        }
    };

    /**
     * What is wrong with a message from one side, or null.
     *
     * @method validateMessage
     * @param {Object} message
     * @param {String} from 'host' or 'guest'
     * @return {String|null}
     */
    function validateMessage(message, from) {
        if (!isObject(message) || typeof message.type !== 'string') { return 'not a message'; }
        var spec = (MESSAGES[from] || {})[message.type];
        if (!spec || !Object.prototype.hasOwnProperty.call(MESSAGES[from], message.type)) { return 'unknown message type "' + message.type + '"'; }
        var fields = Object.keys(spec);
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i], rule = spec[field], value = message[field];
            if (Array.isArray(rule)) {
                if (rule.indexOf(value) < 0) { return field + ' must be one of ' + rule.join(', '); }
                continue;
            }
            var optional = rule.slice(-1) === '?',
                type     = optional ? rule.slice(0, -1) : rule;
            if (value === undefined && optional) { continue; }
            if (typeof value !== type || (type === 'number' && !isFinite(value))) { return field + ' must be a ' + type; }
        }
        if (message.type === 'request' && message.action === 'seek' && typeof message.time !== 'number') { return 'a seek needs a time'; }
        return null;
    }

    function encode(message) {
        return JSON.stringify(message);
    }

    /**
     * I read a message one side sent; null when it is not valid JSON or not
     * a message that side may send.
     *
     * @method decode
     * @param {String} text
     * @param {String} from 'host' or 'guest'
     * @return {Object|null}
     */
    function decode(text, from) {
        var message;
        try { message = JSON.parse(text); } catch (e) { return null; }
        return (validateMessage(message, from) === null) ? message : null;
    }


    /* ------------------------------------------------------------------ */
    /*  Chunks                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * I cut a text into pieces of at most size characters, never between the
     * two halves of a surrogate pair.
     *
     * @method split
     * @param {String} text
     * @param {Number} [size] default CHUNK_SIZE
     * @return {Array}
     */
    function split(text, size) {
        size = Math.max(2, size || CHUNK_SIZE);
        var parts = [], at = 0;
        while (at < text.length) {
            var end = Math.min(text.length, at + size),
                code = text.charCodeAt(end - 1);
            if (end < text.length && code >= 0xD800 && code <= 0xDBFF) { end--; }
            parts.push(text.slice(at, end));
            at = end;
        }
        return parts;
    }

    /**
     * The messages that carry a large text, a bundle: bundle-start, a
     * bundle-part per piece, bundle-end.
     *
     * @method bundleMessages
     * @param {String} id
     * @param {String} text
     * @param {Number} [size]
     * @return {Array}
     */
    function bundleMessages(id, text, size) {
        var parts = split(text, size),
            messages = [{ type: 'bundle-start', id: id, size: text.length, parts: parts.length }];
        parts.forEach(function(data, i) {
            messages.push({ type: 'bundle-part', id: id, i: i, data: data });
        });
        messages.push({ type: 'bundle-end', id: id });
        return messages;
    }

    /**
     * I put the pieces of a bundle together again. accept() takes each
     * bundle-start, -part and -end message and returns { id, text } when the
     * end completes a bundle, else null; it throws ('invalid') on a piece
     * that does not fit. A new bundle-start drops an unfinished bundle.
     *
     * @method createAssembler
     * @return {Object}
     */
    function createAssembler() {

        var current = null;

        return {
            accept: function(message) {
                if (message.type === 'bundle-start') {
                    if (!(message.parts >= 0) || !(message.size >= 0) || message.parts !== Math.floor(message.parts)) {
                        throw pairingError('invalid', 'A bundle with an impossible size');
                    }
                    current = { id: message.id, size: message.size, parts: new Array(message.parts), received: 0 };
                    return null;
                }
                if (!current || message.id !== current.id) {
                    throw pairingError('invalid', 'A piece of a bundle that was not started');
                }
                if (message.type === 'bundle-part') {
                    if (message.i !== Math.floor(message.i) || message.i < 0 || message.i >= current.parts.length || current.parts[message.i] !== undefined) {
                        throw pairingError('invalid', 'A piece of a bundle out of place');
                    }
                    current.parts[message.i] = message.data;
                    current.received++;
                    return null;
                }
                if (message.type === 'bundle-end') {
                    var done = current;
                    current = null;
                    var text = done.parts.join('');
                    if (done.received !== done.parts.length || text.length !== done.size) {
                        throw pairingError('invalid', 'A bundle with pieces missing');
                    }
                    return { id: done.id, text: text };
                }
                return null;
            },
            get pending() { return current ? current.id : null; }
        };

    }


    /* ------------------------------------------------------------------ */
    /*  The guest's clock                                                 */
    /* ------------------------------------------------------------------ */

    /**
     * The host's playhead as the guest sees it: the last state, extrapolated.
     * While the host plays (and does not wait for data), the time is
     * time + (now − receivedAt + rtt / 2) × rate. A new state moves the clock
     * only when the host started or stopped, changed its rate, or the clock is
     * off by more than the threshold: small differences (network jitter) do
     * not make the playhead jump.
     *
     * @method createClock
     * @param {Object} [options] { threshold } seconds, default JUMP_THRESHOLD
     * @return {Object} { update(state, receivedAt, rtt) → moved, time(now), running, rate }
     */
    function createClock(options) {

        var threshold = (options && options.threshold != null) ? options.threshold : JUMP_THRESHOLD,
            anchor    = null;

        function time(now) {
            if (!anchor) { return null; }
            return anchor.running ? anchor.time + (now - anchor.at) / 1000 * anchor.rate : anchor.time;
        }

        return {
            update: function(state, receivedAt, rtt) {
                var running = !!state.playing && !state.waiting,
                    rate    = (state.rate > 0) ? state.rate : 1,
                    target  = state.time + (running ? (rtt || 0) / 2 / 1000 * rate : 0);
                if (anchor && running && anchor.running && anchor.rate === rate
                        && Math.abs(time(receivedAt) - target) <= threshold) {
                    return false;
                }
                anchor = { time: target, at: receivedAt, rate: rate, running: running };
                return true;
            },
            time: time,
            reset: function() { anchor = null; },
            get running() { return !!(anchor && anchor.running); },
            get rate()    { return anchor ? anchor.rate : 1; }
        };

    }


    /* ------------------------------------------------------------------ */
    /*  WebRTC helpers                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * I wait until a peer connection has gathered its ICE candidates, or the
     * timeout has passed, so that the description sent through the broker
     * carries them (no trickle ICE: the broker holds one blob per side).
     *
     * @method gatherComplete
     * @param {RTCPeerConnection} pc
     * @param {Number} [timeout] ms, default GATHER_TIMEOUT
     * @return {Promise} true when complete, false after the timeout
     */
    function gatherComplete(pc, timeout) {
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') { return resolve(true); }
            var timer = setTimeout(function() { done(false); }, (timeout != null) ? timeout : GATHER_TIMEOUT);
            function onState() { if (pc.iceGatheringState === 'complete') { done(true); } }
            function onCandidate(event) { if (!event.candidate) { done(true); } }
            function done(complete) {
                clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange', onState);
                pc.removeEventListener('icecandidate', onCandidate);
                resolve(complete);
            }
            pc.addEventListener('icegatheringstatechange', onState);
            pc.addEventListener('icecandidate', onCandidate);
        });
    }

    /**
     * The path a connection takes, from its stats: the candidate types of the
     * selected pair ('host', 'srflx', 'prflx', 'relay'), its protocol, and
     * whether it goes through a TURN relay. null before there is one.
     *
     * @method selectedPath
     * @param {RTCStatsReport|Map} stats
     * @return {Object|null} { local, remote, protocol, relayed, address }
     */
    function selectedPath(stats) {
        var byId = {}, pairId = null, pair = null;
        stats.forEach(function(report) {
            byId[report.id] = report;
            if (report.type === 'transport' && report.selectedCandidatePairId) { pairId = report.selectedCandidatePairId; }
        });
        if (pairId) { pair = byId[pairId]; }
        if (!pair) {
            stats.forEach(function(report) {
                if (!pair && report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded'))) { pair = report; }
            });
        }
        if (!pair) { return null; }
        var local = byId[pair.localCandidateId] || {}, remote = byId[pair.remoteCandidateId] || {};
        return {
            local:    local.candidateType || null,
            remote:   remote.candidateType || null,
            protocol: local.protocol || null,
            relayed:  local.candidateType === 'relay' || remote.candidateType === 'relay',
            address:  local.address || local.ip || null
        };
    }


    /* ------------------------------------------------------------------ */
    /*  What a phone gets                                                 */
    /* ------------------------------------------------------------------ */

    /**
     * A hypervideo bundle without anything that runs code, for the companion
     * page: no overlays and code snippets (hypervideo.contents), no global
     * events, no onClickContentItem of a content view. Its CSP stops the rest
     * (inline handlers in HTML); this keeps the player from even trying.
     * The bundle given is not changed.
     *
     * @method companionBundle
     * @param {Object} bundle a hypervideo bundle
     * @return {Object}
     */
    function companionBundle(bundle) {
        var result = JSON.parse(JSON.stringify(bundle)),
            hypervideo = result.hypervideo;
        if (!isObject(hypervideo)) { return result; }
        hypervideo.contents = [];
        hypervideo.globalEvents = {};
        var layout = isObject(hypervideo.config) ? hypervideo.config.layoutArea : null;
        if (isObject(layout)) {
            Object.keys(layout).forEach(function(area) {
                (Array.isArray(layout[area]) ? layout[area] : []).forEach(function(view) {
                    if (isObject(view)) { delete view.onClickContentItem; }
                });
            });
        }
        return result;
    }


    return {

        PROTOCOL_VERSION: PROTOCOL_VERSION,
        CHANNEL:          CHANNEL,
        CHUNK_SIZE:       CHUNK_SIZE,
        GATHER_TIMEOUT:   GATHER_TIMEOUT,
        ANSWER_TIMEOUT:   ANSWER_TIMEOUT,
        POLL_INTERVAL:    POLL_INTERVAL,
        JUMP_THRESHOLD:   JUMP_THRESHOLD,
        MAX_BLOB:         MAX_BLOB,
        MESSAGES:         MESSAGES,

        error:            pairingError,

        randomId:         randomId,
        isId:             isId,
        toBase64url:      toBase64url,
        fromBase64url:    fromBase64url,

        certificateFingerprint: certificateFingerprint,
        sdpFingerprints:  sdpFingerprints,
        checkFingerprint: checkFingerprint,

        brokerBase:       brokerBase,
        checkBrokerURL:   checkBrokerURL,
        companionURL:     companionURL,
        joinURL:          joinURL,
        parseJoin:        parseJoin,
        deviceLabel:      deviceLabel,

        brokerClient:     brokerClient,
        pollAnswer:       pollAnswer,
        sleep:            sleep,

        offerBlob:        offerBlob,
        answerBlob:       answerBlob,
        refusalBlob:      refusalBlob,
        readOffer:        readOffer,
        readAnswer:       readAnswer,

        validateMessage:  validateMessage,
        encode:           encode,
        decode:           decode,

        split:            split,
        bundleMessages:   bundleMessages,
        createAssembler:  createAssembler,

        createClock:      createClock,

        gatherComplete:   gatherComplete,
        selectedPath:     selectedPath,

        companionBundle:  companionBundle

    };

});
