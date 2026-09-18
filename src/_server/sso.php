<?php
/**
 * The landing page for external authentication.
 *
 * Deliberately not an action in ajaxServer.php. A login hand-off is a
 * *navigation*: it has to answer with a redirect and a Set-Cookie, while
 * ajaxServer.php commits to a JSON content type before it dispatches anything.
 * It also has to be able to render a failure a person can read, and — once LTI
 * lands — to accept a cross-site form POST that arrives carrying no cookie at
 * all. A standalone entry point is the shape all of that needs, and it gives
 * OIDC a stable redirect_uri to register.
 *
 *   GET  sso.php?token=<jws>[&next=…]   a platform hands over an identity
 *   GET  sso.php?token=<jws>&silent=1   the same, inside a frame: answers with a
 *                                       message to the opener instead of a redirect
 *   GET  sso.php?a=start[&next=…]       interactive login: enter the provider
 *   GET  sso.php?a=logout               end this session *and* the platform's,
 *                                       landing on its sign-in page
 *
 * After a successful hand-off the browser is sent to a clean URL, so the token
 * survives in neither the address bar, the history entry, nor any later Referer.
 */

require_once("./config.php");
require_once("./user.php");


/**
 * I am the app's base path — sso.php lives in _server/, the player one level up.
 *
 * @return String  e.g. "/" or "/FrameTrail/src/"
 */
function ftAppBaseUrl() {

    $script = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\', '/', $_SERVER['SCRIPT_NAME']) : '/_server/sso.php';
    $base   = rtrim(dirname(dirname($script)), '/');

    return $base . '/';

}


/**
 * I render a failure as a page rather than as JSON, because whoever is looking
 * at it is a person who clicked a link, not a script.
 *
 * @param {Number} $status
 * @param {String} $message
 */
function ftSsoFail($status, $message) {

    $config = ftExternalAuthConfig();
    $label  = ($config !== null && !empty($config["label"])) ? $config["label"] : "the platform";
    $back   = ($config !== null && !empty($config["loginUrl"])) ? $config["loginUrl"] : "";

    http_response_code($status);
    header("Content-Type: text/html; charset=utf-8");
    header("Referrer-Policy: no-referrer");
    header("Cache-Control: no-store");

    echo '<!DOCTYPE html><html><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<title>Sign-in failed</title>'
       . '<style>body{font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;'
       . 'align-items:center;justify-content:center;background:#2f3139;color:#e6e6e6}'
       . 'div{max-width:32em;padding:2em;text-align:center}h1{font-size:1.25em;font-weight:600}'
       . 'p{color:#b0b4bd;line-height:1.5}a{color:#fff}</style></head><body><div>'
       . '<h1>Sign-in failed</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>'
       . '<p>Please return to ' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . ' and try again.</p>'
       . ($back !== '' ? '<p><a href="' . htmlspecialchars($back, ENT_QUOTES, 'UTF-8') . '">Back to '
            . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</a></p>' : '')
       . '</div></body></html>';

    exit;

}


/**
 * I answer a frame, which needs a message rather than a page.
 *
 * A silent re-auth is loaded by a page that is already open and wants its
 * session back without losing what is on screen. Nothing here is ever seen: a
 * redirect would take the frame somewhere pointless, and ftSsoFail()'s error
 * page would be an apology nobody can read. The answer is the message, and it
 * is always 200 — a status code the opener cannot inspect across the hop tells
 * it nothing.
 *
 * The message goes to this document's own origin. By the time this runs the
 * frame has followed the platform's redirect back here, so it is same-origin
 * with the page that opened it, and naming that origin explicitly means the
 * message cannot be delivered anywhere else.
 *
 * @param {Boolean} $ok
 */
function ftSsoSilentAnswer($ok) {

    header("Content-Type: text/html; charset=utf-8");
    header("Referrer-Policy: no-referrer");
    header("Cache-Control: no-store");

    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>…</title></head><body><script>'
       . 'try{parent.postMessage({frametrail:"sso",ok:' . ($ok ? 'true' : 'false') . '},'
       . 'window.location.origin);}catch(e){}'
       . '</script></body></html>';

    exit;

}


/**
 * I send the browser on, always to a path inside this installation.
 *
 * `next` is resolved against the app base rather than the document root, so a
 * hand-off can only ever land somewhere in the app it authenticated into.
 *
 * @param {String|null} $next
 */
function ftSsoRedirect($next) {

    $target = ftAppBaseUrl();

    if ($next !== null && $next !== '') {
        $target .= ltrim($next, '/');
    }

    header("Referrer-Policy: no-referrer");
    header("Cache-Control: no-store");
    http_response_code(303);
    header("Location: " . $target);

    exit;

}


$provider = ftAuthProvider();

if ($provider === null) {
    ftSsoFail(404, "This instance is not configured for external authentication.");
}

$request = array_merge($_GET, $_POST);
$action  = isset($request["a"]) ? $request["a"] : "";

$context = array(
    "origin"   => (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : ''),
    "dataPath" => (isset($_REQUEST["dataPath"]) ? $_REQUEST["dataPath"] : null),
    "next"     => ftSafeNext(isset($request["next"]) ? $request["next"] : null)
);


if ($action === "logout") {

    /*
     * A sign-out has to be something the person asked for.
     *
     * Sec-Fetch-Dest is 'document' only for a real top-level navigation, so
     * this refuses the forgery that actually exists — an <img> or a hidden
     * frame on some other page — and lets every genuine click through. A
     * missing header means a client too old to send one, which is allowed
     * rather than locked out.
     *
     * It matters more here than on the platform: a drive-by hit on this does
     * not end one session, it cascades into the platform's as well.
     */
    $dest = isset($_SERVER['HTTP_SEC_FETCH_DEST']) ? $_SERVER['HTTP_SEC_FETCH_DEST'] : null;

    if ($dest !== null && $dest !== 'document') {
        ftSsoFail(400, "A sign-out has to be something you asked for.");
    }

    $target = $provider->logoutUrl($context);

    // "And then let them sign in again", for somebody switching accounts
    // rather than leaving. Without it the platform returns them to this
    // project signed out, and they would have to ask a second time for the
    // sign-in they already asked for.
    //
    // A strict allowlist rather than a pass-through: this appends to a URL
    // belonging to another host, and a parameter we do not understand is not
    // ours to hand onward.
    if ($target !== null && isset($request["then"]) && $request["then"] === "login") {
        $target .= (strpos($target, '?') === false ? '?' : '&') . 'then=login';
    }

    // Idempotent on purpose: arriving here with no session is not an error,
    // and still has to hand the browser on to the platform, which may well
    // still have one of its own.
    ftSessionEnd();

    if ($target !== null) {
        header("Referrer-Policy: no-referrer");
        header("Cache-Control: no-store");
        http_response_code(303);
        header("Location: " . $target);
        exit;
    }

    ftSsoRedirect(null);

}


if ($action === "start") {

    $begin = $provider->beginLogin($request, $context);

    if (isset($begin["action"]) && $begin["action"] === "redirect") {
        header("Referrer-Policy: no-referrer");
        header("Cache-Control: no-store");
        http_response_code(302);
        header("Location: " . $begin["url"]);
        exit;
    }

    ftSsoFail(400, isset($begin["string"])
        ? $begin["string"]
        : "This instance cannot start a sign-in by itself.");

}


/*
 * Whether this hand-off is being watched by a page or by a person.
 *
 * A silent hand-off is the same hand-off in every respect that matters — the
 * same token, verified the same way, establishing the same session. Only the
 * answer differs: a message to the opener instead of a redirect, and a failure
 * it can act on instead of a page it cannot show.
 */
$silent = isset($request["silent"]) && $request["silent"] === "1";

$result = $provider->handleCallback($request, $context);

if (!isset($result["status"]) || $result["status"] !== "success") {
    if ($silent) {
        ftSsoSilentAnswer(false);
    }
    ftSsoFail(403, isset($result["string"]) ? $result["string"] : "The sign-in could not be verified.");
}

$login = ftExternalLoginEstablish($result["identity"]);

if ($login["code"] != 0) {
    if ($silent) {
        ftSsoSilentAnswer(false);
    }
    ftSsoFail(403, $login["string"]);
}

if ($silent) {
    // No redirect: the page that opened this frame is staying exactly where it
    // is, which is the entire point of doing it this way.
    ftSsoSilentAnswer(true);
}

ftSsoRedirect(isset($result["next"]) ? $result["next"] : null);

?>
