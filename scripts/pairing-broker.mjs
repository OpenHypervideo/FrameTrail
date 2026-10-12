/*
 * A stub of the pairing broker: the small HTTP service through which a
 * desktop FrameTrail (the host) and a phone (the guest) exchange their WebRTC
 * offer and answer. It implements contract v1 (docs/PAIRING.md, "Broker
 * contract") for development, tests and trying it out on a LAN; a production
 * broker is a separate project. Node 20 or later, no dependencies:
 *
 *     node scripts/pairing-broker.mjs                        # http://localhost:8787, LAN only (GET /ice answers 404)
 *     node scripts/pairing-broker.mjs --port 8787 --host 0.0.0.0
 *     node scripts/pairing-broker.mjs --stun stun:stun.example.org:3478
 *     node scripts/pairing-broker.mjs --turn turn:turn.example.org:3478 --turn-secret <coturn static-auth-secret>
 *     node scripts/pairing-broker.mjs --cert cert.pem --key key.pem   # https, for phones on an https page
 *
 * Then set pairingBrokerURL in config.json to its URL. The broker keeps
 * everything in memory, passes blobs on without reading them and never logs
 * them (an SDP holds IP addresses).
 *
 * tests/run-js.mjs runs the contract against createBroker() in-process.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = {
    roomTTL:    120000,         // ms; renewed by every call of the host
    blobTTL:    60000,          // ms; offers and answers
    maxBlob:    65536,          // bytes
    maxOffers:  64,             // waiting offers per room
    maxRooms:   10000,
    rateLimit:  600,            // requests per address and window
    rateWindow: 60000,          // ms
    turnTTL:    3600            // s; lifetime of TURN credentials
};

const ID = '([A-Za-z0-9_-]{16,64})';
const ROUTES = [
    { method: 'GET',    pattern: /^\/ice$/,                                         action: 'ice' },
    { method: 'PUT',    pattern: new RegExp('^/rooms/' + ID + '$'),                 action: 'openRoom' },
    { method: 'DELETE', pattern: new RegExp('^/rooms/' + ID + '$'),                 action: 'closeRoom' },
    { method: 'POST',   pattern: new RegExp('^/rooms/' + ID + '/offers/' + ID + '$'),  action: 'postOffer' },
    { method: 'GET',    pattern: new RegExp('^/rooms/' + ID + '/offers$'),          action: 'listOffers' },
    { method: 'PUT',    pattern: new RegExp('^/rooms/' + ID + '/answers/' + ID + '$'), action: 'putAnswer' },
    { method: 'GET',    pattern: new RegExp('^/rooms/' + ID + '/answers/' + ID + '$'), action: 'getAnswer' }
];


/**
 * TURN credentials for coturn's use-auth-secret (the "REST API"): the
 * username is "<expiry>:<random>", the credential base64(HMAC-SHA1(secret, username)).
 */
export function turnCredentials(secret, ttlSeconds, nowMs) {
    const username = Math.floor(nowMs / 1000 + ttlSeconds) + ':' + crypto.randomBytes(6).toString('hex');
    return { username, credential: crypto.createHmac('sha1', secret).update(username).digest('base64') };
}

function hashKey(key) {
    return crypto.createHash('sha256').update(key).digest();
}

function shortId(id) {
    return id.slice(0, 4) + '…';
}


/**
 * I make a broker: handle(req, res) answers the requests of the contract.
 *
 * options: now() (ms; the clock, injectable for tests), stun and turn (lists
 * of URLs), turnSecret, log (a function, or null for silence) and the limits
 * in DEFAULTS.
 */
export function createBroker(options = {}) {

    const config = Object.assign({}, DEFAULTS, options),
          now    = config.now || Date.now,
          log    = (config.log === undefined) ? console.log : config.log,
          rooms  = new Map(),
          hits   = new Map();

    let lastSweep = 0;

    function sweep() {
        const t = now();
        if (t - lastSweep < 1000) { return; }
        lastSweep = t;
        for (const [id, room] of rooms) {
            if (room.expires <= t) { rooms.delete(id); continue; }
            for (const [guest, offer] of room.offers) { if (offer.expires <= t) { room.offers.delete(guest); } }
            for (const [guest, answer] of room.answers) { if (answer.expires <= t) { room.answers.delete(guest); } }
        }
        for (const [address, entry] of hits) { if (entry.until <= t) { hits.delete(address); } }
    }

    function liveRoom(id) {
        const room = rooms.get(id);
        if (room && room.expires <= now()) { rooms.delete(id); return null; }
        return room || null;
    }

    function rateLimited(address) {
        const t = now();
        let entry = hits.get(address);
        if (!entry || entry.until <= t) {
            entry = { count: 0, until: t + config.rateWindow };
            hits.set(address, entry);
        }
        entry.count++;
        return (entry.count > config.rateLimit) ? Math.ceil((entry.until - t) / 1000) : 0;
    }

    function iceServers() {
        const servers = [];
        if (config.stun && config.stun.length) { servers.push({ urls: config.stun }); }
        if (config.turn && config.turn.length && config.turnSecret) {
            servers.push(Object.assign({ urls: config.turn }, turnCredentials(config.turnSecret, config.turnTTL, now())));
        }
        return servers.length ? servers : null;
    }

    function send(res, status, body, type) {
        const headers = {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age':       '600',
            'Cache-Control':                'no-store'
        };
        if (body !== undefined) {
            headers['Content-Type'] = type || 'application/json';
        }
        res.writeHead(status, headers);
        res.end(body === undefined ? undefined : ((typeof body === 'string') ? body : JSON.stringify(body)));
        return status;
    }

    // Is the request the host of this room? 401 without a key, 403 with another.
    function hostCheck(req, room) {
        const match = /^Bearer\s+(\S+)$/.exec(req.headers['authorization'] || '');
        if (!match) { return 401; }
        if (room && !crypto.timingSafeEqual(hashKey(match[1]), room.keyHash)) { return 403; }
        return 0;
    }

    function readBody(req) {
        return new Promise((resolve) => {
            const chunks = [];
            let size = 0, tooLarge = false;
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > config.maxBlob) { tooLarge = true; return; }
                if (!tooLarge) { chunks.push(chunk); }
            });
            req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')));
            req.on('error', () => resolve(null));
        });
    }

    const actions = {

        ice(req, res) {
            const servers = iceServers();
            return servers ? send(res, 200, { iceServers: servers }) : send(res, 404, { error: 'no ICE servers: LAN only' });
        },

        openRoom(req, res, [id]) {
            const room = liveRoom(id),
                  refused = hostCheck(req, room);
            if (refused) { return send(res, refused, { error: 'host key' }); }
            if (room) {
                room.expires = now() + config.roomTTL;
                return send(res, 204);
            }
            if (rooms.size >= config.maxRooms) { return send(res, 503, { error: 'too many rooms' }); }
            const key = /^Bearer\s+(\S+)$/.exec(req.headers['authorization'])[1];
            rooms.set(id, { keyHash: hashKey(key), expires: now() + config.roomTTL, cursor: 0, offers: new Map(), answers: new Map() });
            return send(res, 204);
        },

        closeRoom(req, res, [id]) {
            const room = liveRoom(id);
            if (!room) { return send(res, 404, { error: 'no room' }); }
            const refused = hostCheck(req, room);
            if (refused) { return send(res, refused, { error: 'host key' }); }
            rooms.delete(id);
            return send(res, 204);
        },

        async postOffer(req, res, [id, guest]) {
            const body = await readBody(req),
                  room = liveRoom(id);
            if (body === null) { return send(res, 413, { error: 'too large' }); }
            if (!room) { return send(res, 404, { error: 'no room' }); }
            if (!body) { return send(res, 400, { error: 'empty' }); }
            if (!room.offers.has(guest) && room.offers.size >= config.maxOffers) { return send(res, 429, { error: 'too many offers' }); }
            room.cursor++;
            room.offers.set(guest, { cursor: room.cursor, blob: body, expires: now() + config.blobTTL });
            room.answers.delete(guest);
            return send(res, 204);
        },

        listOffers(req, res, [id], query) {
            const room = liveRoom(id);
            if (!room) { return send(res, 404, { error: 'no room' }); }
            const refused = hostCheck(req, room);
            if (refused) { return send(res, refused, { error: 'host key' }); }
            room.expires = now() + config.roomTTL;
            const after = parseInt(query.get('after') || '0', 10) || 0,
                  t     = now(),
                  offers = [];
            for (const [guest, offer] of room.offers) {
                if (offer.cursor > after && offer.expires > t) { offers.push({ guest, cursor: offer.cursor, blob: offer.blob }); }
            }
            offers.sort((a, b) => a.cursor - b.cursor);
            return send(res, 200, { offers, cursor: room.cursor });
        },

        async putAnswer(req, res, [id, guest]) {
            const body = await readBody(req),
                  room = liveRoom(id);
            if (body === null) { return send(res, 413, { error: 'too large' }); }
            if (!room) { return send(res, 404, { error: 'no room' }); }
            const refused = hostCheck(req, room);
            if (refused) { return send(res, refused, { error: 'host key' }); }
            if (!body) { return send(res, 400, { error: 'empty' }); }
            room.expires = now() + config.roomTTL;
            room.answers.set(guest, { blob: body, expires: now() + config.blobTTL });
            return send(res, 204);
        },

        getAnswer(req, res, [id, guest]) {
            const room = liveRoom(id),
                  answer = room && room.answers.get(guest);
            if (!answer || answer.expires <= now()) { return send(res, 404, { error: 'no answer yet' }); }
            return send(res, 200, answer.blob, 'text/plain; charset=utf-8');
        }

    };

    async function handle(req, res) {

        sweep();

        const url    = new URL(req.url, 'http://broker'),
              where  = url.pathname.replace(/[A-Za-z0-9_-]{16,64}/g, shortId);
        let status;

        if (req.method === 'OPTIONS') {
            status = send(res, 204);
        } else {
            const wait = rateLimited(req.socket.remoteAddress || '');
            if (wait) {
                res.setHeader('Retry-After', String(wait));
                status = send(res, 429, { error: 'rate limited' });
            } else {
                const route = ROUTES.find((r) => r.method === req.method && r.pattern.test(url.pathname));
                if (!route) {
                    status = send(res, 404, { error: 'not part of the contract' });
                } else {
                    const ids = route.pattern.exec(url.pathname).slice(1);
                    try {
                        status = await actions[route.action](req, res, ids, url.searchParams);
                    } catch (error) {
                        status = res.headersSent ? 500 : send(res, 500, { error: 'broker error' });
                    }
                }
            }
        }

        if (log) { log(req.method + ' ' + where + ' ' + status); }

    }

    return {
        handle,
        get rooms() { return rooms; }
    };

}


/**
 * I start a broker on a port (0: any free one). Resolves with the server;
 * server.address().port tells which port.
 */
export function startBroker(options = {}) {
    const broker = createBroker(options),
          server = (options.cert && options.key)
                 ? https.createServer({ cert: fs.readFileSync(options.cert), key: fs.readFileSync(options.key) }, broker.handle)
                 : http.createServer(broker.handle);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port || 0, options.host || 'localhost', () => resolve(server));
    });
}


function parseArgs(argv) {
    const options = { port: 8787, host: 'localhost', stun: [], turn: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], next = () => argv[++i];
        switch (arg) {
            case '--port':        options.port = parseInt(next(), 10); break;
            case '--host':        options.host = next(); break;
            case '--stun':        options.stun.push(next()); break;
            case '--turn':        options.turn.push(next()); break;
            case '--turn-secret': options.turnSecret = next(); break;
            case '--turn-ttl':    options.turnTTL = parseInt(next(), 10); break;
            case '--cert':        options.cert = next(); break;
            case '--key':         options.key = next(); break;
            case '--quiet':       options.log = null; break;
            case '--help':
                console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*|^ \* ?/gm, ''));
                process.exit(0);
                break;
            default:
                console.error('Unknown option ' + arg + ' (see --help)');
                process.exit(1);
        }
    }
    if (options.turn.length && !options.turnSecret) {
        console.error('--turn needs --turn-secret (coturn: use-auth-secret, static-auth-secret)');
        process.exit(1);
    }
    return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const options = parseArgs(process.argv.slice(2));
    startBroker(options).then((server) => {
        const scheme = options.cert ? 'https' : 'http',
              ice    = [options.stun.length ? 'STUN' : '', options.turn.length ? 'TURN' : ''].filter(Boolean).join(' + ') || 'none (LAN only)';
        console.log('Pairing broker (contract v1) at ' + scheme + '://' + options.host + ':' + server.address().port + '/  ICE servers: ' + ice);
    }, (error) => {
        console.error(error.message);
        process.exit(1);
    });
}
