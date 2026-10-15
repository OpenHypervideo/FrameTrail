# Pairing Phones

A phone pairs with a FrameTrail player by scanning a QR code. From then on the player shows the video, and the phone shows the hypervideo's content views — by default the annotations, one at a time, full screen — in step with the player's playback. A whole classroom can pair with one player: the first phone may play, pause and seek it, the ones that join it only watch, and the player can give or take that right per phone. Playback is synchronised peer to peer over a WebRTC DataChannel; the hypervideo itself goes the same way, so pairing works in every storage mode, includes unsaved edits and needs no login on the phone.

The only server in between is a **pairing broker**: a small HTTP service that passes the WebRTC offer and answer on, and nothing else. FrameTrail ships a stub of it for development and tests (`scripts/pairing-broker.mjs`); a production broker implements the contract below.

## Setting It Up

Three keys in `_data/config.json` (Administration → Advanced Settings → Pairing with phones), or in `data-frametrail-config` on a portable page. They are among the playback settings a project bundle carries, so a project file keeps them, an exported project page offers pairing with the same broker, and importing a project's settings brings them along:

| Key | Default | Meaning |
|-----|---------|---------|
| `pairingBrokerURL` | `""` | Base URL of the broker, or a path starting with `/` for a broker on the player page's own server (it then works under every name the page is opened by). Empty: no pairing. It must answer the page's origin (CORS) and be https on an https page (except on `localhost`) |
| `pairingButtonVisible` | `false` | Show the pairing button (a phone) in the player controls, while a hypervideo is open. Never on phones and tablets (`FrameTrail.isTouchPrimary()`); in edit mode only while a phone is paired |
| `pairingCompanionURL` | `""` | The page a phone opens. Empty: `companion.html` beside the player page, which exists only where that page is served over http(s) |

Before it shows a QR code, the player loads the companion page once and says what is missing if it cannot (no broker, an http broker on an https page, no companion page, a broker that does not answer).

What the phone shows is authored per hypervideo: the layout editor shows a phone beside the player layout (when a broker is set, or when the hypervideo has views for it), and content views dropped there are stored in `config.layoutArea.areaCompanion` ([DATA-MODEL.md](DATA-MODEL.md)). What a phone shows is set on purpose: without any views it shows nothing (and says so). Several views are tabs in a row above them, and the phone opens on the first one (the row scrolls sideways when it is too long); the views take the whole width, medium ones laid out like the right-hand area. A large collection shows the annotations at full size in a row that follows the playback, with a gap around each one and the playing one framed; it can be swiped through (as the bottom area's details can: over embedded players and maps too), and a tap on an annotation's "Play from here" sends the player there. Beneath it a strip shows all its annotations as small thumbnails, like the bottom area's small view: the playing ones highlighted, the one on screen marked, the edges showing when there are more to either side; a tap on a thumbnail slides the collection there (without moving the player). There is no small size on a phone; a small view is shown, and saved, as medium. Overlays (positioned on the video) and code snippets are not phone content.

### Where it works

| Player | Can pair | Companion page (default) | Relative media on the phone |
|---|---|---|---|
| server | yes | `companion.html` beside the page | from the instance's `_data/`; on a private instance (`alwaysForceLogin`) with a pairing grant (see *Private instances*), and only on the default companion page |
| static (`dataPath`, no server) | yes | beside the page, if deployed | from `dataPath` |
| local folder | yes | none: set `pairingCompanionURL` | none (the files have no URL); absolute URLs work |
| project file | yes | beside the file, if it is served over http(s) | from the file's datapath, if http(s) |
| download / portable page | yes | beside the page, if there is one | from the page's datapath |
| overview, no hypervideo open | no | — | — |

### In a classroom

The QR code stays on the screen until pairing is stopped, so it can be projected while a class joins. The player takes up to 50 phones at once; more are told it is full. The first phone to pair (usually the presenter's) may play, pause and seek; every phone that joins it only watches, until the switch beside it in the pairing dialog is turned on. The dialog lists the phones in the order they paired, numbered, with how each is connected, and can let one go. The player sends the hypervideo to every phone itself — prepared once, the hypervideo's data without its media, which the phones load from their own URLs — and after that only the playback state, a few hundred bytes a second per phone.

The network matters more than the player. School and guest WiFi often keeps devices apart (client isolation): then the phones cannot reach the player directly and need a TURN relay (below), which carries every phone's traffic. And a class reaches the broker from one public address: each phone makes a handful of requests while it pairs, so a broker for classrooms must allow that per address (the stub allows 600 requests a minute per address and 64 waiting offers per room).

### Private instances

A phone has no session, so a private instance (`alwaysForceLogin`, its `_data/` behind `_server/serve.php`) would refuse it the hypervideo's media: the pictures, sounds and documents in `_data/resources/`. The text reaches the phone anyway, inside the bundle. So on a private instance the player gets a **pairing grant** from its server when pairing opens (`ajaxServer.php?a=pairingGrant`, for a signed-in user only) and a new one at half its lifetime, ten minutes, for as long as pairing is on. It gives the current grant to each phone over the channel, before the bundle (`grant`, see Protocol). The phone keeps it as a cookie for the path of `_data/resources/`, so the media requests of its player carry it, and `serve.php` lets a request with a valid grant read a file in `_data/resources/` without a session, and nothing else.

- **What a grant is:** `<expiry>.<signature>`, the expiry in Unix seconds and an HMAC-SHA256 with a secret of the data directory's own, `_data/.auth/pairing_grant.php`, which the first grant creates. It names no one; whoever holds it reads `_data/resources/` until it expires. Deleting the secret file ends every grant at once.
- **Where it helps:** only where the phone's page is on the instance's own origin, the default `companion.html` beside the player: a cookie is set for the page's own origin. A companion page elsewhere (`pairingCompanionURL`) shows the text but no media of a private instance.
- **Who sees what:** everyone who scans the code sees what the phones show, on a private instance too. That was so before for the text; the grant extends it to the media, for the time pairing is on and ten minutes after.
- **Not for:** `config.json`, the hypervideos' own files, `users.json` and everything else in `_data/`; requests other than reads (`serve.php` only reads); personal API tokens (`pairingGrant` is refused to them).

## The Stub Broker

```bash
node scripts/pairing-broker.mjs                          # http://localhost:8787, LAN only
node scripts/pairing-broker.mjs --host 0.0.0.0 --port 8787
node scripts/pairing-broker.mjs --stun stun:stun.example.org:3478
node scripts/pairing-broker.mjs --turn turn:turn.example.org:3478 --turn-secret <secret>
node scripts/pairing-broker.mjs --cert cert.pem --key key.pem    # https
```

Node 20 or later, no dependencies. It keeps everything in memory and logs method, path (ids shortened) and status, never a blob. For a phone on the LAN, serve FrameTrail under the computer's LAN name with a certificate the phone accepts, and run the broker with `--host 0.0.0.0` and the same certificate (an https page may only call an https broker).

### Trying It with a Phone

A phone cannot use a player that runs on `localhost`: the QR code, the broker and the media all point at `localhost`, which on the phone is the phone. `scripts/pairing-lan.mjs` serves FrameTrail and the stub broker on one https origin the phone can reach on the same WiFi:

```bash
node scripts/pairing-lan.mjs --path /frametrail/src/          # proxies https://localhost; --target for another local server
```

It listens on `https://<this computer>.local:8443` (and the computer's addresses), passes every request on to the local web server (`--target`, default `https://localhost`, PHP included) and answers `/pairing-broker/…` itself. Then:

1. Open the player through it on the computer, not through `localhost`: the phone gets the links the page makes. Android phones may not resolve `.local` names; open the page under the computer's address then.
2. Set the pairing broker to the path `/pairing-broker/` (Administration → Advanced Settings) and switch the pairing button on.
3. Tap the phone button and scan the QR code with the phone.

The certificate comes from [mkcert](https://github.com/FiloSottile/mkcert) when it is installed (the computer trusts it already; on the phone, install mkcert's root CA once — the script prints where it is), otherwise it is self-signed. Either way the phone may also just accept the warning once: everything is on this one origin. Where the WiFi keeps devices apart or does not pass mDNS, add `--stun stun:stun.l.google.com:19302` (or any other public STUN server).

### Off the local network: STUN and TURN

Without ICE servers (`GET /ice` answers an empty list) the two sides connect only through their local addresses, so the phone has to be on the same network — and that network must let its devices reach each other and resolve the mDNS names browsers hide local addresses behind (some campus and guest networks do neither). A STUN server lets them connect through their public addresses as well, which works across most home routers. A phone on cellular, or networks that block direct connections, needs a TURN relay: [coturn](https://github.com/coturn/coturn) with the REST API's shared secret.

```
# /etc/turnserver.conf (excerpt)
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=<a long random secret>
realm=pair.example.org
total-quota=100
no-cli
```

The broker hands out short-lived credentials made from that secret (`username = <expiry>:<random>`, `credential = base64(HMAC-SHA1(secret, username))`), so the secret never reaches a browser. The relay sees only DTLS-encrypted traffic.

## Broker Contract v1

The broker passes opaque blobs between the player (host) and phones (guests) of a room. It never reads them.

```
GET    /ice                                     → 200 { iceServers: [...] }   ([] for the local network only)
PUT    /rooms/{room}                [host key]  → 204   create, or keep alive
DELETE /rooms/{room}                [host key]  → 204   (also when the room is gone already)
POST   /rooms/{room}/offers/{guest} blob        → 204 | 404 no room | 413 too large | 429
GET    /rooms/{room}/offers?after=c [host key]  → 200 { offers: [{ guest, cursor, blob }], cursor }
PUT    /rooms/{room}/answers/{guest} [host key] blob → 204
GET    /rooms/{room}/answers/{guest}            → 200 blob | 204 not yet | 404 no room
```

- **Ids** (`room`, `guest`) are 128-bit random values in base64url (`[A-Za-z0-9_-]{16,64}` is accepted). Paths with anything else are not part of the contract (404).
- **Host key**: `Authorization: Bearer <hostKey>`, a second random id. The first `PUT /rooms/{room}` sets it (the broker keeps its hash); every later host call must carry it (401 without, 403 with another). A guest has no key, so people who saw a projected QR code can post offers but cannot answer other guests.
- **Lifetimes**: a room lives 120 s after the host's last call (every host call renews it), offers and answers 60 s. A guest posting again replaces its offer and drops its old answer.
- **Sizes**: blobs up to 64 KB (413 above). The stub allows 64 waiting offers per room and 10,000 rooms.
- **CORS**: any origin; `Authorization` and `Content-Type` allowed; preflight answered. Guests post `text/plain`, so their first request needs no preflight.
- **Rate limit** per address (the stub: 600 requests a minute, 429 with `Retry-After`). Mind classrooms behind one address.
- **No logs of blobs**: an SDP holds IP addresses.
- **No error status in the normal course**: browsers log every 4xx answer to `fetch` in the console, and a phone asks for its answer once a second, so "nothing yet" is `204` and "no ICE servers" an empty list. A 4xx means something went wrong (a closed room, a wrong key). Clients still read a `404` from `GET /ice` as "no ICE servers".
- **Base URL**: everything is relative to `pairingBrokerURL`, so a broker can live under a path; a PHP implementation can take the path from `PATH_INFO`.

Blobs are the clients' JSON: an offer `{ v: 1, sdp, label }`, an answer `{ v: 1, sdp }` or a refusal `{ v: 1, refused: 'full' | 'closed' | 'version' }`.

## Handshake

1. **The player** (`PairingHost`) generates an ECDSA P-256 `RTCCertificate`, fetches `/ice`, makes a room id and a host key, opens the room, and shows the QR code of `<companion page>#pair=<room>&b=<broker>&fp=<SHA-256 fingerprint of its certificate, base64url>`. The fragment is never sent to a server. It polls for offers every second until pairing is stopped.
2. **The phone** (`companion.html`, `CompanionLauncher`) reads the fragment (kept in `sessionStorage`, with its guest id and resume token, for reloads), fetches `/ice`, creates the peer connection and the negotiated channel (`createDataChannel('frametrail', { negotiated: true, id: 0 })`), waits for ICE gathering to complete (or 3 s), posts its offer and polls for the answer for up to 60 s.
3. **The player** answers the offer with its certificate, after the same gathering wait — or refuses it: `full` while 50 phones are connected or connecting, `version` for another protocol version.
4. **The phone** checks that every `a=fingerprint` of the answer is the fingerprint from the QR code, so a broker cannot put itself in the player's place, and the channel opens. The phone says `hello`, the player `welcome`.

The room stays open until pairing is stopped. A phone gets `canControl` when it is the first: no other phone is connected or within its time to come back; the ones that join it get `false`, until the player switches them (`control`). When a phone drops, it has two minutes to come back with its resume token and keeps its control right. When the last phone's two minutes are over and the pairing dialog is closed, pairing ends. A phone the player lets go is told `bye`; scanning the code again, it joins as a new phone.

## Protocol v1

JSON messages over the channel, `{ type, … }`; `FrameTrailPairing.decode(text, from)` checks them.

| From | Message | Meaning |
|---|---|---|
| player | `welcome { v, canControl, resume, label }` | The phone is paired. `resume`: the token for coming back |
| player | `bundle-start { id, size, parts }`, `bundle-part { id, i, data }`, `bundle-end { id }` | A hypervideo, in pieces of 16,384 characters, sent with backpressure (`bufferedAmountLowThreshold`) |
| player | `state { hypervideo, playing, time, rate, waiting, seq }` | The playback, on every change (play, pause, seek, rate, stall) and as a heartbeat (1 s playing, 5 s paused). `time` is absolute (includes the clip's in point) |
| player | `control { canControl }` | Whether the phone may control playback |
| player | `view { mode: 'overview' }` | The player shows its overview |
| player | `grant { token, ttl, cookie, path }` | On a private instance: the pairing grant, the cookie's name and path to keep it under, and the seconds it has left (see *Private instances*). Before the first bundle, then again at half its lifetime |
| player | `pong { id }`, `bye { reason }` | Round trip; the end of pairing (`stopped`, `version`) |
| phone | `hello { v, guest, resume?, label }` | First message on an open channel |
| phone | `ready { id }` | The bundle `id` is shown |
| phone | `request { action: 'play' \| 'pause' \| 'seek', time? }` | Carried out only while `canControl` |
| phone | `ping { id }`, `bye { reason? }` | Round trip (every 2 s); leaving |

The bundle payload is `{ bundle, datapath, config, offsetIn, duration }`: the hypervideo bundle without code (`FrameTrailPairing.companionBundle()`: no overlays and code snippets, no global events, no `onClickContentItem`), what its relative media paths resolve against, the page's playback settings, and the time span (the phone has no video to learn it from). It is sent when a phone is paired, after every save, when edit mode ends and when another hypervideo is opened; edits in between do not reach the phones. The player makes it once for all phones, so every phone shows the same.

**The state belongs to the player.** The phone sends only requests; the player carries them out through the `HypervideoController` and sends its new state. The phone never sends anything in reaction to a state, so the two cannot chase each other. The phone's clock extrapolates the last state: `time + (now − receivedAt + rtt / 2) × rate` while playing and not waiting; a new state moves it when the player started or stopped, changed its rate, or the clock is more than 0.25 s off. The phone's player (the `companion` state) is a player without video: `HypervideoModel` uses a canvas clock over the player's time span, `HypervideoController` reads the extrapolated time and turns play, pause and seeks into requests, `ViewLayout` renders the companion views into the right area's container (`ViewVideo.AreaCompanionContainer`).

## Security Model

- **The broker cannot impersonate the player**: the QR code carries the fingerprint of the player's certificate, and the phone refuses an answer with another one. WebRTC encrypts the channel (DTLS), so neither the broker nor a TURN relay can read it.
- **Spectators cannot take over**: the room's host key keeps everyone else from answering phones, phones that join while another is paired only watch, the player takes at most 50 at once, and it can take any phone's control right away or let the phone go. A projected QR code stays valid until Stop.
- **Nothing an author wrote runs on the phone.** The phone may be outside the local network, so this is a must: the bundle comes without code, the companion page's Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'none'`) refuses inline scripts, inline event handlers and `eval`, and the page has no script of its own (CompanionLauncher starts itself on pages marked `data-frametrail-companion`). Third-party embeds that need inline scripts fall back to what they show without.
- **What the broker learns**: when a room exists, how many offers it gets, and the IP addresses inside the SDPs (local addresses are hidden behind mDNS names by default). Not the hypervideo, the playback, or who is who.
- **Private instances**: the phone gets the hypervideo from the player and loads its relative media from the instance itself with a pairing grant (see *Private instances*): only `_data/resources/`, only for reading, for ten minutes at a time, renewed by the signed-in player while pairing is on. A grant travels only over the encrypted channel, never in the QR code or through the broker; a phone checks its cookie name, path and token before it keeps it (`FrameTrailPairing.grantCookie`), so nothing in a grant can add an attribute to the cookie.

## Not in This Release

- Media of local-folder hypervideos on the phone (small images over the channel).
- A phone browsing ahead of the player; opting a hypervideo out of pairing.
- A production broker, coturn setup and hosted companion page: a separate project, `FrameTrail-Pairing`. FrameTrail has no public default broker.
