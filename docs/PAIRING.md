# Pairing a Phone

A phone pairs with a FrameTrail player by scanning a QR code. From then on the player shows the video, and the phone shows the hypervideo's content views — by default the annotations, one at a time, full screen — in step with the player's playback. The phone can play, pause and seek the player, unless the player takes that right away. Playback is synchronised peer to peer over a WebRTC DataChannel; the hypervideo itself goes the same way, so pairing works in every storage mode, includes unsaved edits and needs no login on the phone.

The only server in between is a **pairing broker**: a small HTTP service that passes the WebRTC offer and answer on, and nothing else. FrameTrail ships a stub of it for development and tests (`scripts/pairing-broker.mjs`); a production broker implements the contract below.

## Setting It Up

Three keys in `_data/config.json` (Administration → Advanced Settings → Pairing with phones), or in `data-frametrail-config` on a portable page:

| Key | Default | Meaning |
|-----|---------|---------|
| `pairingBrokerURL` | `""` | Base URL of the broker. Empty: no pairing. It must answer the page's origin (CORS) and be https on an https page (except on `localhost`) |
| `pairingButtonVisible` | `false` | Show the pairing button (a phone) in the player controls, while a hypervideo is open. Never on phones and tablets (`FrameTrail.isTouchPrimary()`); in edit mode only while a phone is paired |
| `pairingCompanionURL` | `""` | The page a phone opens. Empty: `companion.html` beside the player page, which exists only where that page is served over http(s) |

Before it shows a QR code, the player loads the companion page once and says what is missing if it cannot (no broker, an http broker on an https page, no companion page, a broker that does not answer).

What the phone shows is authored per hypervideo: the layout editor shows a phone beside the player layout (when a broker is set, or when the hypervideo has views for it), and content views dropped there are stored in `config.layoutArea.areaCompanion` ([DATA-MODEL.md](DATA-MODEL.md)). The phone lays them out like the right-hand area at full width. Without any, it shows one large collection of all annotations: the active ones, full size. Overlays (positioned on the video) and code snippets are not phone content.

### Where it works

| Player | Can pair | Companion page (default) | Relative media on the phone |
|---|---|---|---|
| server | yes | `companion.html` beside the page | from the instance's `_data/`; **not** on a private instance (`alwaysForceLogin`): the phone has no session |
| static (`dataPath`, no server) | yes | beside the page, if deployed | from `dataPath` |
| local folder | yes | none: set `pairingCompanionURL` | none (the files have no URL); absolute URLs work |
| project file | yes | beside the file, if it is served over http(s) | from the file's datapath, if http(s) |
| download / portable page | yes | beside the page, if there is one | from the page's datapath |
| overview, no hypervideo open | no | — | — |

## The Stub Broker

```bash
node scripts/pairing-broker.mjs                          # http://localhost:8787, LAN only
node scripts/pairing-broker.mjs --host 0.0.0.0 --port 8787
node scripts/pairing-broker.mjs --stun stun:stun.example.org:3478
node scripts/pairing-broker.mjs --turn turn:turn.example.org:3478 --turn-secret <secret>
node scripts/pairing-broker.mjs --cert cert.pem --key key.pem    # https
```

Node 20 or later, no dependencies. It keeps everything in memory and logs method, path (ids shortened) and status, never a blob. For a phone on the LAN, serve FrameTrail under the computer's LAN name with a certificate the phone accepts, and run the broker with `--host 0.0.0.0` and the same certificate (an https page may only call an https broker).

### Off the local network: STUN and TURN

Without ICE servers (`GET /ice` answers 404) the two sides connect only through their local addresses, so the phone has to be on the same network — and that network must let its devices reach each other and resolve the mDNS names browsers hide local addresses behind (some campus and guest networks do neither). A STUN server lets them connect through their public addresses as well, which works across most home routers. A phone on cellular, or networks that block direct connections, needs a TURN relay: [coturn](https://github.com/coturn/coturn) with the REST API's shared secret.

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
GET    /ice                                     → 200 { iceServers: [...] } | 404 (LAN only)
PUT    /rooms/{room}                [host key]  → 204   create, or keep alive
DELETE /rooms/{room}                [host key]  → 204 | 404
POST   /rooms/{room}/offers/{guest} blob        → 204 | 404 no room | 413 too large | 429
GET    /rooms/{room}/offers?after=c [host key]  → 200 { offers: [{ guest, cursor, blob }], cursor }
PUT    /rooms/{room}/answers/{guest} [host key] blob → 204
GET    /rooms/{room}/answers/{guest}            → 200 blob | 404 not yet
```

- **Ids** (`room`, `guest`) are 128-bit random values in base64url (`[A-Za-z0-9_-]{16,64}` is accepted). Paths with anything else are not part of the contract (404).
- **Host key**: `Authorization: Bearer <hostKey>`, a second random id. The first `PUT /rooms/{room}` sets it (the broker keeps its hash); every later host call must carry it (401 without, 403 with another). A guest has no key, so people who saw a projected QR code can post offers but cannot answer other guests.
- **Lifetimes**: a room lives 120 s after the host's last call (every host call renews it), offers and answers 60 s. A guest posting again replaces its offer and drops its old answer.
- **Sizes**: blobs up to 64 KB (413 above). The stub allows 64 waiting offers per room and 10,000 rooms.
- **CORS**: any origin; `Authorization` and `Content-Type` allowed; preflight answered. Guests post `text/plain`, so their first request needs no preflight.
- **Rate limit** per address (the stub: 600 requests a minute, 429 with `Retry-After`). Mind classrooms behind one address.
- **No logs of blobs**: an SDP holds IP addresses.
- **Base URL**: everything is relative to `pairingBrokerURL`, so a broker can live under a path; a PHP implementation can take the path from `PATH_INFO`.

Blobs are the clients' JSON: an offer `{ v: 1, sdp, label }`, an answer `{ v: 1, sdp }` or a refusal `{ v: 1, refused: 'full' | 'closed' | 'version' }`.

## Handshake

1. **The player** (`PairingHost`) generates an ECDSA P-256 `RTCCertificate`, fetches `/ice`, makes a room id and a host key, opens the room, and shows the QR code of `<companion page>#pair=<room>&b=<broker>&fp=<SHA-256 fingerprint of its certificate, base64url>`. The fragment is never sent to a server. It polls for offers every second while it accepts phones.
2. **The phone** (`companion.html`, `CompanionLauncher`) reads the fragment (kept in `sessionStorage`, with its guest id and resume token, for reloads), fetches `/ice`, creates the peer connection and the negotiated channel (`createDataChannel('frametrail', { negotiated: true, id: 0 })`), waits for ICE gathering to complete (or 3 s), posts its offer and polls for the answer for up to 60 s.
3. **The player** answers the offer with its certificate, after the same gathering wait — or refuses it: `full` while another phone is paired (this release accepts one), `version` for another protocol version.
4. **The phone** checks that every `a=fingerprint` of the answer is the fingerprint from the QR code, so a broker cannot put itself in the player's place, and the channel opens. The phone says `hello`, the player `welcome`.

While a phone is connected the player closes the room. When the phone drops, the player opens the same room again for two minutes; a phone that comes back with its resume token in that time keeps its control rights. Then, unless the dialog is open, pairing ends.

## Protocol v1

JSON messages over the channel, `{ type, … }`; `FrameTrailPairing.decode(text, from)` checks them.

| From | Message | Meaning |
|---|---|---|
| player | `welcome { v, canControl, resume, label }` | The phone is paired. `resume`: the token for coming back |
| player | `bundle-start { id, size, parts }`, `bundle-part { id, i, data }`, `bundle-end { id }` | A hypervideo, in pieces of 16,384 characters, sent with backpressure (`bufferedAmountLowThreshold`) |
| player | `state { hypervideo, playing, time, rate, waiting, seq }` | The playback, on every change (play, pause, seek, rate, stall) and as a heartbeat (1 s playing, 5 s paused). `time` is absolute (includes the clip's in point) |
| player | `control { canControl }` | Whether the phone may control playback |
| player | `view { mode: 'overview' }` | The player shows its overview |
| player | `pong { id }`, `bye { reason }` | Round trip; the end of pairing (`stopped`, `version`) |
| phone | `hello { v, guest, resume?, label }` | First message on an open channel |
| phone | `ready { id }` | The bundle `id` is shown |
| phone | `request { action: 'play' \| 'pause' \| 'seek', time? }` | Carried out only while `canControl` |
| phone | `ping { id }`, `bye { reason? }` | Round trip (every 2 s); leaving |

The bundle payload is `{ bundle, datapath, config, offsetIn, duration }`: the hypervideo bundle without code (`FrameTrailPairing.companionBundle()`: no overlays and code snippets, no global events, no `onClickContentItem`), what its relative media paths resolve against, the page's playback settings, and the time span (the phone has no video to learn it from). It is sent when a phone is paired, after every save, when edit mode ends and when another hypervideo is opened; edits in between do not reach the phone.

**The state belongs to the player.** The phone sends only requests; the player carries them out through the `HypervideoController` and sends its new state. The phone never sends anything in reaction to a state, so the two cannot chase each other. The phone's clock extrapolates the last state: `time + (now − receivedAt + rtt / 2) × rate` while playing and not waiting; a new state moves it when the player started or stopped, changed its rate, or the clock is more than 0.25 s off. The phone's player (the `companion` state) is a player without video: `HypervideoModel` uses a canvas clock over the player's time span, `HypervideoController` reads the extrapolated time and turns play, pause and seeks into requests, `ViewLayout` puts the companion views into the right area.

## Security Model

- **The broker cannot impersonate the player**: the QR code carries the fingerprint of the player's certificate, and the phone refuses an answer with another one. WebRTC encrypts the channel (DTLS), so neither the broker nor a TURN relay can read it.
- **Spectators cannot take over**: the room's host key keeps everyone else from answering phones, the player accepts one phone at a time, and it can take that phone's control rights away. A projected QR code stays valid while the player accepts phones; Stop ends it.
- **Nothing an author wrote runs on the phone.** The phone may be outside the local network, so this is a must: the bundle comes without code, the companion page's Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'none'`) refuses inline scripts, inline event handlers and `eval`, and the page has no script of its own (CompanionLauncher starts itself on pages marked `data-frametrail-companion`). Third-party embeds that need inline scripts fall back to what they show without.
- **What the broker learns**: when a room exists, how many offers it gets, and the IP addresses inside the SDPs (local addresses are hidden behind mDNS names by default). Not the hypervideo, the playback, or who is who.
- **Private instances**: the phone gets the hypervideo from the player, but loads its relative media from the instance itself, which refuses it without a session. Pair such hypervideos only where the media are public URLs.

## Not in This Release

- Several phones at once (the contract and the protocol are ready; the player's interface and limits are not).
- Media of local-folder hypervideos on the phone (small images over the channel).
- A phone browsing ahead of the player; opting a hypervideo out of pairing.
- A production broker, coturn setup and hosted companion page: a separate project, `FrameTrail-Pairing`. FrameTrail has no public default broker.
