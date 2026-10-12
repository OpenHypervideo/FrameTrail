/*
 * Try pairing with a real phone while FrameTrail runs on this computer
 * (docs/PAIRING.md, "Trying It with a Phone"). Node 20 or later, no
 * dependencies:
 *
 *     node scripts/pairing-lan.mjs --path /frametrail/src/      # proxies https://localhost; --path only for the printed link
 *     node scripts/pairing-lan.mjs --target http://localhost:8080
 *     node scripts/pairing-lan.mjs --stun stun:stun.l.google.com:19302   # or any other public STUN server
 *
 * A phone cannot use what the player makes on localhost: the QR code, the
 * broker and the media all point at "localhost", which on the phone is the
 * phone. This serves everything on one https origin the phone can reach on
 * the same network, https://<this computer>.local:8443:
 *
 * - /pairing-broker/… is the stub broker (scripts/pairing-broker.mjs), so the
 *   broker URL can be the path "/pairing-broker/" whatever name the page is
 *   opened under;
 * - everything else is passed on to the local web server that serves
 *   FrameTrail (--target, default https://localhost), PHP included.
 *
 * The certificate is made with mkcert when it is installed (trusted on this
 * computer already; the phone trusts it once mkcert's root CA is installed
 * there), else self-signed with openssl (the phone shows a warning once).
 * --cert / --key use your own.
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBroker } from './pairing-broker.mjs';

const BROKER_PATH = '/pairing-broker/';

const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];


function parseArgs(argv) {
    const options = { port: 8443, host: '0.0.0.0', target: 'https://localhost', path: '/', stun: [], turn: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], next = () => argv[++i];
        switch (arg) {
            case '--port':        options.port = parseInt(next(), 10); break;
            case '--host':        options.host = next(); break;
            case '--target':      options.target = next().replace(/\/+$/, ''); break;
            case '--path':        options.path = next(); break;
            case '--name':        options.name = next(); break;
            case '--stun':        options.stun.push(next()); break;
            case '--turn':        options.turn.push(next()); break;
            case '--turn-secret': options.turnSecret = next(); break;
            case '--cert':        options.cert = next(); break;
            case '--key':         options.key = next(); break;
            case '--quiet':       options.quiet = true; break;
            case '--help':
                console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*|^ \* ?/gm, ''));
                process.exit(0);
                break;
            default:
                console.error('Unknown option ' + arg + ' (see --help)');
                process.exit(1);
        }
    }
    return options;
}

// The names a phone can reach this computer by: its Bonjour name, its host name, its addresses.
function localNames(preferred) {
    const names = [];
    if (preferred) { names.push(preferred); }
    try {
        const bonjour = execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (bonjour) { names.push(bonjour + '.local'); }
    } catch (e) { /* not macOS */ }
    names.push(os.hostname());
    const addresses = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const address of list || []) {
            if (address.family === 'IPv4' && !address.internal) { addresses.push(address.address); }
        }
    }
    return { names: [...new Set(names)], addresses };
}

// A certificate for those names: mkcert's if it is installed, else a self-signed one.
function certificate(options, names, addresses) {
    if (options.cert && options.key) {
        return { cert: fs.readFileSync(options.cert), key: fs.readFileSync(options.key), how: 'given' };
    }
    const dir = path.join(os.tmpdir(), 'frametrail-pairing-lan'),
          certFile = path.join(dir, 'cert.pem'),
          keyFile = path.join(dir, 'key.pem'),
          all = names.concat(addresses, ['localhost', '127.0.0.1']);
    fs.mkdirSync(dir, { recursive: true });
    try {
        execFileSync('mkcert', ['-cert-file', certFile, '-key-file', keyFile].concat(all), { stdio: 'ignore' });
        const caroot = execFileSync('mkcert', ['-CAROOT'], { encoding: 'utf8' }).trim();
        return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile), how: 'mkcert', ca: path.join(caroot, 'rootCA.pem') };
    } catch (e) { /* no mkcert */ }
    const san = names.map((n) => 'DNS:' + n).concat(['DNS:localhost'], addresses.concat(['127.0.0.1']).map((a) => 'IP:' + a)).join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-keyout', keyFile, '-out', certFile,
        '-subj', '/CN=' + names[0], '-addext', 'subjectAltName=' + san], { stdio: 'ignore' });
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile), how: 'self-signed' };
}


const options = parseArgs(process.argv.slice(2)),
      target  = new URL(options.target),
      client  = (target.protocol === 'https:') ? https : http,
      agent   = new client.Agent({ keepAlive: true, rejectUnauthorized: false }),
      { names, addresses } = localNames(options.name),
      tls     = certificate(options, names, addresses),
      log     = options.quiet ? null : (line) => console.log(line),
      // The broker's log, without the polls (once a second each while a phone pairs).
      broker  = createBroker({ stun: options.stun, turn: options.turn, turnSecret: options.turnSecret, log: log && ((line) => {
          if (!/^GET \/rooms\/\S+\/(offers\S* 200|answers\/\S+ 204)$/.test(line)) { log('broker ' + line); }
      }) });

// Passes a request on to the local web server, as if the browser had asked it.
function proxy(req, res) {

    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.indexOf(name) < 0) { headers[name] = value; }
    }
    headers.host = target.host;
    headers['x-forwarded-host'] = req.headers.host || '';
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-for'] = req.socket.remoteAddress || '';

    const upstream = client.request({
        protocol: target.protocol, hostname: target.hostname, port: target.port || undefined,
        method: req.method, path: req.url, headers, agent
    }, (answer) => {
        const out = {};
        for (const [name, value] of Object.entries(answer.headers)) {
            if (HOP_BY_HOP.indexOf(name) >= 0) { continue; }
            if (name === 'location') {
                // A redirect to the local server is one to this origin.
                out[name] = String(value).replace(target.origin, 'https://' + req.headers.host);
            } else if (name === 'set-cookie') {
                out[name] = [].concat(value).map((cookie) => cookie.replace(/;\s*domain=[^;]*/i, ''));
            } else {
                out[name] = value;
            }
        }
        res.writeHead(answer.statusCode, out);
        answer.pipe(res);
    });

    upstream.on('error', (error) => {
        if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); }
        res.end('The local web server (' + target.origin + ') does not answer: ' + error.message);
    });

    req.pipe(upstream);

}

const server = https.createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
    if (req.url.startsWith(BROKER_PATH)) {
        req.url = req.url.slice(BROKER_PATH.length - 1);
        broker.handle(req, res);
        return;
    }
    proxy(req, res);
});

server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'Port ' + options.port + ' is in use (--port).' : error.message);
    process.exit(1);
});

server.listen(options.port, options.host, () => {
    const origins = names.filter((n) => /\.local$/.test(n)).concat(addresses).map((n) => 'https://' + n + ':' + options.port),
          first = origins[0] || 'https://localhost:' + options.port;
    console.log([
        '',
        'FrameTrail and a pairing broker on the local network, proxied to ' + target.origin + ':',
        '    ' + origins.join('\n    '),
        '',
        '1. On this computer open the player through it, not through localhost (the phone gets the links the page makes):',
        '       ' + first + options.path,
        '   Android phones may not resolve .local names: then open it under the address (' + (addresses[0] || '?') + ').',
        '2. Set the pairing broker (Administration → Advanced Settings → Pairing broker URL) to the path ' + BROKER_PATH,
        '   and switch the pairing button on. The path works under every name above.',
        '3. Phone on the same WiFi: tap the phone button in the player and scan the QR code.',
        tls.how === 'mkcert'
            ? '   Certificate: mkcert. For no warning on the phone, install its root CA there once:\n       ' + tls.ca
              + '\n   iPhone: AirDrop it, install the profile (Settings → Profile Downloaded), then Settings → General → About\n   → Certificate Trust Settings → switch it on. Android: Settings → Security → Encryption & credentials → Install a certificate → CA.\n   Or accept the browser\'s warning once: everything is on this one origin.'
            : '   Certificate: ' + tls.how + '. Accept the browser\'s warning once, on the phone and here: everything is on this one origin.',
        options.stun.length ? '' : '   If the phone cannot connect (networks that keep devices apart, or no mDNS), add --stun stun:stun.l.google.com:19302 (or any other public STUN server).',
        ''
    ].join('\n'));
});
