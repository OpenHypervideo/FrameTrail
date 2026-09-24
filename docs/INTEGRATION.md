# Integrating FrameTrail into an existing platform

FrameTrail can run as a component of a larger system — a learning management system, a research portal, a media archive — rather than as a standalone site. This guide covers the part that is hardest to get right: **identity**. When a platform hosts FrameTrail, the platform already knows who the visitor is, and FrameTrail should not ask them again. A platform that also decides an instance's settings — whether it is private, whether uploads are allowed — can take those over as well; see [Handing the Instance Settings to the Platform](#handing-the-instance-settings-to-the-platform).

Getting the player onto a page is a separate question, covered in [docs/DEPLOYMENT.md](DEPLOYMENT.md#player-initialization); nothing here depends on how you embed it.

The document has two parts, because there are two genuinely different jobs. **Part 1** is for deployers who already run an identity provider and want FrameTrail to use it — that is OpenID Connect, and FrameTrail is the relying party. **Part 2** is for teams building the hosting platform itself, who want a visitor to move from the platform into FrameTrail without a visible sign-in — that is the signed token bridge, and you implement the other side of it.

## Requirements and Constraints

**Server mode only.** External authentication needs PHP to verify anything. It does not apply to local-folder, download or static modes (see [docs/DEPLOYMENT.md](DEPLOYMENT.md#deployment-options)).

**Silent re-authentication needs same-site hosting.** The hidden-frame session renewal described under [`renewUrl`](#renewurl) works only when FrameTrail is served from the same site as the platform — typically a subdomain of it, so the frame is first-party and its cookies are actually sent. Against an unrelated domain the frame gets nowhere and the attempt times out after ten seconds. Everything else in this document works cross-site; only silent renewal does not.

**HTTPS throughout.** Tokens, authorization codes and session cookies all travel over it. See the security checklist in [docs/DEPLOYMENT.md](DEPLOYMENT.md#securing-an-external-auth-install).

## How External Authentication Works

A provider seam in [`src/_server/auth.php`](../src/_server/auth.php) defines what an identity provider must answer, and each provider implements it. The session a provider establishes is identical in shape to the one local password login has always produced, which is why every write gate and the whole collaboration layer work unchanged.

The hand-off is a **navigation endpoint**, `_server/sso.php` — not an `ajaxServer.php` action. Browsers are redirected to it; nothing calls it with `fetch`.

| URL | What it does |
|-----|--------------|
| `sso.php?token=<jws>[&next=/path]` | Token hand-off. Verifies, signs in, redirects to `next` |
| `sso.php?token=<jws>&silent=1` | The same, inside a hidden frame. Answers by `postMessage` instead of redirecting |
| `sso.php?a=start[&next=/path]` | Begins an interactive sign-in (OIDC authorize redirect) |
| `sso.php?a=callback&code=…&state=…` | The OIDC callback |
| `sso.php?a=logout[&then=login]` | Ends the FrameTrail session, then hands the browser to the platform's logout |

Every request into the instance — `ajaxServer.php`, `serve.php`, `sso.php` alike — passes through `ftExternalSessionEnforce()`, called from `config.php` before anything reads the session. That is where session bounds and logout propagation are enforced, so no individual action has to remember them.

**Two modes**, set by `externalAuth.mode`:

- `interactive` — FrameTrail shows a sign-in wall with a button that leads to the platform. Use this when visitors may arrive at FrameTrail directly.
- `transparent` — identity is the platform's to give and there is nothing to ask. When a session ends, FrameTrail leaves for the platform on its own, except when unsaved work would be lost, in which case it asks first.

## Part 1 — You Already Have an Identity Provider (OIDC)

FrameTrail acts as a confidential relying party using Authorization Code with PKCE. Endpoints and signing keys come from the provider's discovery document, so there is little to configure beyond the client registration. Tested shape: Keycloak. Any standards-compliant provider (Shibboleth with an OIDC front end, Azure AD / Entra ID, Auth0, Authentik) should work the same way.

### 1. Register the client with your provider

Create a confidential client and register the redirect URI **exactly** as FrameTrail will use it:

```
https://video.university.example/_server/sso.php?a=callback
```

Note the query string is part of the registered URI. Take note of the client ID and secret.

### 2. Write the public half of the config

In `_data/config.json`, add an `externalAuth` object. Everything here is readable by the browser, so nothing secret goes in it:

```json
"externalAuth": {
    "mode": "interactive",
    "provider": "oidc",
    "providerId": "keycloak",
    "label": "University Login",
    "loginUrl": "/_server/sso.php?a=start",
    "canLogout": true
}
```

`loginUrl` points at FrameTrail's own `sso.php?a=start`, because with OIDC it is FrameTrail that starts the redirect. `label` is interpolated into every sign-in string the visitor sees ("Sign in with University Login"). `providerId` tags the accounts this provider creates and namespaces their subjects, so two providers on one instance can never collide.

### 3. Write the secret half

Create `_data/.auth/config.php`. It is PHP rather than JSON, so a misconfigured web server executes it instead of serving it:

```php
<?php return array(
    "issuer"       => "https://sso.university.example/realms/main",
    "clientId"     => "frametrail",
    "clientSecret" => "…",
    "redirectUri"  => "https://video.university.example/_server/sso.php?a=callback",
    "scope"        => "openid profile email",
    "adminClaim"   => "groups",
    "adminValue"   => "video-admins"
);
```

Set `redirectUri` explicitly rather than relying on the fallback, which derives it from the request's Host header.

### 4. Map administrators

`adminClaim` names the claim to read and `adminValue` the membership that means admin. Without both, **everyone is a user** — the safe direction to be wrong in. The claim may hold a string or an array of strings. No other role can be produced: whatever the provider sends, only `admin` or `user` ever reaches disk.

The display name falls back through `name` → `preferred_username` → `nickname` → `email` → `sub`.

### 5. Verify

Open the instance signed out. You should see a sign-in wall labelled with your `label`; the button should lead to your provider and come back signed in. Check `_data/users.json` for a new record carrying an `external` block.

PKCE, `state` and `nonce` are handled for you and need no configuration.

## Part 2 — You Are the Platform (Signed Token Bridge)

When you control the system that hosts FrameTrail, you can hand it a signed assertion about who arrived instead of running an authorization round trip. The platform mints a short-lived compact JWS and lands the browser on:

```
https://video.example.org/_server/sso.php?token=<jws>&next=/index.html%23hypervideo=3
```

FrameTrail verifies it, establishes the session, and redirects to `next` with the token gone from the address bar, the history and the referrer.

### 1. Choose a signing algorithm

| Algorithm | Requires | FrameTrail stores |
|-----------|----------|-------------------|
| `RS256` | openssl (present in practically every PHP build) | Public key only |
| `EdDSA` (Ed25519) | libsodium (bundled since PHP 7.2, absent from some stock builds) | Public key only |
| `HS256` | Nothing | **A shared secret** |

Prefer an asymmetric algorithm. With `RS256` or `EdDSA` there is no forgeable key anywhere on the FrameTrail side, so an exposed config, a data export, or a web server that serves `_data` statically cannot be turned into a forged admin login. `HS256` is available for a self-hosted platform that wants it, and is the only case where `_data/.auth/config.php` holds anything worth protecting.

Pick from what the target PHP build actually supports. If FrameTrail cannot verify the algorithm you configured, the sign-in fails with a message naming what it does support.

### 2. Configure FrameTrail

Public half, in `_data/config.json`:

```json
"externalAuth": {
    "mode": "transparent",
    "provider": "token",
    "providerId": "campus",
    "label": "Campus",
    "loginUrl": "https://platform.example.org/frametrail/login",
    "renewUrl": "https://platform.example.org/frametrail/renew",
    "logoutUrl": "https://platform.example.org/logout",
    "manageUsersUrl": "https://platform.example.org/admin/users",
    "issuer": "https://platform.example.org",
    "audience": "https://video.example.org",
    "algs": ["RS256"],
    "publicKey": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"
}
```

The public key is not secret and may live here. If you chose `HS256`, put `hmacSecret` in `_data/.auth/config.php` instead — never in `config.json`, which the browser fetches over HTTP.

`audience` is compared against the configured value and never against the request's Host header, so a token minted for one instance cannot be replayed at another.

### 3. Mint the token

| Claim | Required | Meaning |
|-------|----------|---------|
| `iss` | Yes | Must equal the configured `issuer`, exactly |
| `aud` | Yes | Must contain the configured `audience`. String or array |
| `iat` | Yes | Issue time. Must not be in the future beyond `skewSeconds` |
| `exp` | Yes | Expiry. `exp - iat` must not exceed `maxAgeSeconds` (default 120) |
| `nbf` | No | Honoured if present |
| `jti` | Yes | Unique per token, enforced one-time-use. Must match `^[A-Za-z0-9._-]{16,128}$` — a UUID or 32 hex characters both qualify |
| `sub` | Yes | Stable subject id. Namespaced by `providerId`, so it need only be unique within your platform |
| `name` | Yes | Display name. **An identity without one is rejected** |
| `email` | No | Dropped if it does not validate as an address |
| `ft_role` | No | `"admin"` grants admin; anything else, or absent, means `user` |
| `picture` | No | Avatar URL. Honoured only when `userAvatars` is enabled — see [docs/DEPLOYMENT.md](DEPLOYMENT.md#user-avatars-useravatars) |
| `color` | No | Six hex digits, no `#`. The person's chip colour |
| `active` | No | `0` deactivates the account |
| `next` | No | Where to land afterwards. A same-origin path; alternatively pass `next` as a query parameter |

**Mint on demand, never cache.** A token is valid for a maximum of `maxAgeSeconds` (default 120) from `iat`, and a token minted with a generous lifetime is refused even before its own `exp` passes — how long a credential may live is FrameTrail's policy, not the issuer's. The `jti` is recorded and a second presentation is refused, so each token carries exactly one visitor through exactly once.

A minimal PHP minter, using RS256:

```php
function mintFrameTrailToken($privateKey, $user, $next) {

    $now = time();

    $header = array("alg" => "RS256", "typ" => "JWT");

    $claims = array(
        "iss"     => "https://platform.example.org",
        "aud"     => "https://video.example.org",
        "iat"     => $now,
        "exp"     => $now + 60,
        "jti"     => bin2hex(random_bytes(16)),
        "sub"     => (string)$user["id"],
        "name"    => $user["displayName"],
        "email"   => $user["email"],
        "ft_role" => $user["isAdmin"] ? "admin" : "user",
        "next"    => $next
    );

    $b64 = function ($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    };

    $signingInput = $b64(json_encode($header)) . '.' . $b64(json_encode($claims));

    openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);

    return $signingInput . '.' . $b64($signature);

}
```

Any standard JWT library produces the same thing; there is nothing FrameTrail-specific about the encoding.

### 4. Verify

Mint a token by hand and open `sso.php?token=…` in a browser. A success lands on the app with a clean URL. A failure renders as a readable page naming the reason — expired, wrong audience, already used — rather than as JSON, because whoever is looking at it clicked a link.

## The Platform-Side Pages

The token bridge expects the platform to serve up to three pages. Only `loginUrl` is needed for a minimal integration.

### `loginUrl`

Receives `?next=<url-encoded path>`, authenticates the visitor however the platform normally does, and redirects to `sso.php?token=…&next=…`, passing the `next` through unchanged. If the visitor cannot be signed in, or is signed in but has no access to this project, send them back to FrameTrail with a [return marker](#return-markers) instead.

### `renewUrl`

FrameTrail loads this in a hidden frame when its own session has lapsed but the platform's may not have. The page mints a token for the existing platform session and redirects the frame to `sso.php?token=…&silent=1`. FrameTrail's own `sso.php` then establishes the session and reports success by posting to the parent window — you do not write that part:

```js
parent.postMessage({ frametrail: "sso", ok: true }, window.location.origin);
```

The failure path is yours. When the platform decides it cannot help — no session, or no access to this project — it answers from its own origin instead, without minting anything:

```js
parent.postMessage({ frametrail: "sso", ok: false, reason: "nosession" }, frametrailOrigin);
```

`reason` may be `nosession` or `noaccess`; the two need opposite things offered to the person, and saying which saves a round trip to find out. FrameTrail accepts messages from its own origin and from the origin of the configured `renewUrl`, and ignores everything else.

Three behaviours to design against: FrameTrail **never takes the frame's word for it** — it re-checks the session server-side before relying on it, and treats a session belonging to a *different* person as a failure rather than a renewal; there is a **ten-second timeout**; and only **one renewal is in flight** at a time. Every caller can carry on when renewal fails, because a platform that has genuinely signed out answers false by design.

This is the one feature that requires same-site hosting. Omit `renewUrl` entirely if FrameTrail lives on an unrelated domain — the attempts would only ever time out.

### `logoutUrl`

The second hop after `sso.php?a=logout`. FrameTrail ends its own session first, then hands the browser on. When the person is switching accounts rather than leaving, `?then=login` is appended so the platform can offer a sign-in immediately instead of returning them signed out to a project they asked to enter.

Set `canLogout: false` if signing out of FrameTrail makes no sense in your platform; the menu entry disappears.

### Return Markers

The platform cannot draw anything on FrameTrail's domain, so when it needs to report something about a project it says so in the URL and lets FrameTrail present it properly. Append either marker when sending the browser back:

| Marker | Shows |
|--------|-------|
| `?ft_denied` | "That account cannot open this project" |
| `?ft_signedout` | A sign-out confirmation notice |

Both are cleared from the URL immediately, so a reload or a shared link does not replay a message about a moment that has passed.

## What Changes Once External Authentication Is On

Turning it on takes account management away from FrameTrail. Specifically:

- **Registration, local password login and account deletion are refused.** Local login returns error code `6`, deliberately distinct from the older codes so an out-of-date client cannot show a misleading message. Registration and deletion return code `4` and `6` respectively.
- **Profile editing is reduced** to chip colour and avatar. Name, mail and password belong to the platform, and the next sign-in would overwrite them anyway.
- **The user management dialog refuses to open.** Administrators are routed to `manageUsersUrl` instead, if you configured one.
- **Accounts are created on first arrival**, keyed on `providerId` + `sub`. The `users.json` key stays a small integer, because that id becomes a filename for annotation files and uploads while a subject may contain anything at all.
- **Name, mail, role and active status are rewritten on every sign-in.** Colour and avatar are the person's: colour is seeded only when empty, and the avatar is overwritten only when the identity supplies one.
- **Existing accounts can be adopted.** Writing an `external` block onto an existing password account links it, annotations and all — which is how you migrate an instance that already has users. Any stored password is stripped on the next write.
- **Revocation runs through the platform.** Deactivate or delete the record there and the next client heartbeat ends the FrameTrail session.

## Sessions and Logout Propagation

A session established by a platform is bounded from **when it was established**, never from the last request. A FrameTrail tab renews its PHP session for as long as it is open, so idle expiry alone would let a token minted to be valid for one minute become a session that outlives everything that authorised it.

- **`maxSessionAge`** (seconds, default `86400`) is the absolute bound. Values are clamped to between 300 and 2592000; an explicit `0` disables it. This key is enforced server-side and never sent to the browser.
- **`sessionCookie`** names the platform's own session cookie. FrameTrail records its value at hand-off and compares it on every request: if the cookie is gone or different, the person has signed out, signed in as somebody else, or had their platform session expire — all of which end the FrameTrail session too. This is the whole of the propagation mechanism; there is no back channel. It requires the cookie to actually reach FrameTrail, so it is a same-site arrangement. Omit the key and only the absolute bound applies. Also never sent to the browser.

The client puts its next heartbeat just past the known deadline rather than a full session lifetime after it, so an expiry is noticed within seconds.

## Handing the Instance Settings to the Platform

A platform that provisions instances for other people usually has to decide some of what the settings dialog decides: whether an instance may be private is part of what a customer pays for, and uploads are switched off while an account is over its storage limit. A settings dialog that any instance administrator can use undoes those decisions with one click — or with one crafted request, since `configChange` writes whatever it is sent. So an instance can hand **all** of its settings to the platform:

```json
"externalSettings": {
    "providerId": "linkedvideo",
    "label":      "Linked.Video",
    "manageUrl":  "https://platform.example.org/projects/42"
}
```

The key lives in `_data/config.json`, next to `externalAuth`. The switch is on whenever it holds an object, even an empty one, so a malformed value locks the dialog rather than leaving it open. It needs no secret half and no overlay file: the guard reads the file on disk, and `configChange` is the only thing in FrameTrail that writes `config.json` after setup — so refusing it while the key is present is what keeps the key present.

External settings is independent of external authentication, but they are meant to go together: a platform that owns the accounts and not the settings leaves every decision it makes about an instance one dialog away from being reversed.

### What Changes Once External Settings Are On

- **The settings dialog is gone.** Its title bar button is not drawn, and the dialog refuses to open for any other caller. A dialog already open when the platform takes over closes itself, on the first change it notices or on its next save.
- **`configChange` and `globalCSSChange` are refused** with code `8` ("Settings are managed by the platform hosting this instance"). The public block rides along in `response.externalSettings`. An older client shows its generic save error, which is still true.
- **The user menu links to `manageUrl`** for administrators, labelled "Administration", in a new tab — the same pattern as `manageUsersUrl`. Omit `manageUrl` and there is no link. "Manage Tags", which used to be reached only through the dialog, moves into the same menu.
- **The platform is the only writer** of `config.json`, of `custom.css`, and of the privacy gate in `_data/.htaccess`: `ftSyncPrivacyRules()` used to run after every settings save, and there are none now. A platform that makes an instance private writes that rule itself.
- **Setup counts as done.** `setupCheckDetailed` and `setupInit` treat an instance with either `externalSettings` or `externalAuth` as already set up, whatever files it has, because setup rewrites `custom.css` and the indexes.

What stays with the instance: per-hypervideo themes and CSS (in each `hypervideo.json`), the overview map's content (in `hypervideos/_index.json`), tag definitions, and — unless external authentication is also on — the user accounts.

`manageUrl` reaches the browser only if it starts with `https://`, `http://` or a single `/`; anything else is replaced with an empty string rather than drawn as a link. What the browser learns is a whitelist, `ftExternalSettingsPublic()` in [`src/_server/externalsettings.php`](../src/_server/externalsettings.php).

### Writing the Settings

The keys the dialog used to write, with what FrameTrail does when a key is missing:

| Key | Values | Missing means | Takes effect |
|-----|--------|---------------|--------------|
| `defaultTheme` | a theme id, `""` | `classic` | at once |
| `overviewTitle` | any string, shown as text | the localized "Overview" | at once |
| `overviewMode` | `"grid"`, `"map"` | grid | on reload |
| `overviewShowSearchBar` | boolean | off | at once |
| `defaultLanguage` | `"en"`, `"de"`, `"fr"` | `en` | on reload |
| `videoFit` | `"contain"`, `"cover"` | `contain` | at once |
| `allowUploads` | boolean | **allowed** | at once |
| `captureUserTraces` | boolean | off | on reload |
| `userTracesStartAction`, `userTracesEndAction` | a user action, e.g. `"UserLogin"`, `"UserLogout"` | **no trace ever starts** | on reload |
| `userNeedsConfirmation` | boolean | off | has no effect under external authentication |
| `custom.css` | a file, not a key | empty | at once |

Three traps worth knowing:

- **`allowUploads` and `alwaysForceLogin` are strict.** The server refuses uploads only on `=== false` and treats an instance as private only on `=== true`. Write real booleans, never `"false"`.
- **An empty trace action matches nothing.** Write both actions explicitly, as setup does.
- **Write atomically and keep unknown keys.** FrameTrail reads `config.json` while you write it, and a newer release may add keys yours does not know. Read, change what you own, write to a temporary file and rename it over the old one.

Pages that are already open pick changes up through the collaboration poll on the `settings` scope, which watches both files: an administrator sees the usual "settings have changed" notice with Refresh, which re-reads the config and reloads `custom.css`. Keys marked "on reload" need a page load to show.

### Detecting Support

A release supports external settings if it ships `_server/externalsettings.php`. On a running instance, an anonymous `userCheckLogin` that answers with a non-null `externalSettings` proves the deployed code honours the key. Older releases ignore it: their dialog keeps working and keeps writing, so a platform has to treat those instances as settings-owned-by-FrameTrail until they are upgraded.

## Notes for Specific Platforms

None of these are certified integrations; they are starting points.

**Moodle and ILIAS** can both act as OpenID Connect providers, which makes Part 1 the shortest route — no platform-side code at all. If you want a deep link to carry a person straight into a specific hypervideo without an authorization round trip, a small plugin page minting tokens per Part 2 is the alternative. Either way, host FrameTrail as a subdomain of the LMS if you want silent renewal.

**Canvas** speaks LTI natively, which FrameTrail does not yet implement (below). Until it does, a token-minting endpoint in an LTI tool you control, or plain OIDC against the institution's provider, are the available routes.

**Keycloak, Shibboleth, Azure AD / Entra ID, Auth0, Authentik** are all plain OIDC — follow Part 1. For Shibboleth, note that FrameTrail speaks OIDC, not SAML directly, so you need the OIDC front end.

**Your own platform** — Part 2, with `mode: "transparent"`, which is what it was built for.

## LTI 1.3

Not implemented. The provider seam and the JWS verification code were written to accommodate it — an LTI launch is a signed assertion much like the token bridge's, and `sso.php` already merges `GET` and `POST` — but the launch arrives as a cross-site form POST carrying no cookie at all, and handling that properly is the open work. Use the token bridge or OIDC today.
