<?php
/**
 * External (platform / LMS) authentication — the provider seam.
 *
 * When an instance is hosted by a platform, identity stops being FrameTrail's
 * to establish. The platform authenticates, and FrameTrail is handed a signed
 * assertion about who arrived. This file is the one place that knows that; the
 * session it produces is byte-identical in shape to the one userLogin() has
 * always produced, which is why every write gate, and the whole collaboration
 * layer, keep working without a line changed.
 *
 * Three provider shapes are anticipated and the interface is sized for all of
 * them: a signed-token bridge that lands once with its credential in the query
 * (implemented in authtoken.php), an OIDC relying party that must *start* a
 * redirect and come back to a callback, and an LTI 1.3 tool whose launch is a
 * cross-site form POST. Adding either of the latter two must not require
 * touching requireLogin(), the session code, or any client module.
 *
 * Server mode only, by construction — a provider needs PHP to verify anything.
 */

require_once(__DIR__ . "/jws.php");


/**
 * One external identity provider.
 *
 * beginLogin() is what a redirect-initiating protocol needs and a token bridge
 * does not, so it is allowed to answer "none".
 */
interface AuthProvider {

    /** @return string  stable id, also the provider tag stored on a principal */
    public function name();

    /** @return bool  whether a Login button inside FrameTrail can enter this provider */
    public function supportsInteractiveLogin();

    /**
     * @param  array $req  merged $_GET + $_POST
     * @param  array $ctx  ["origin", "next", "dataPath"]
     * @return array ["action"=>"redirect","url"=>...] | ["action"=>"none"] | ["action"=>"fail","string"=>...]
     */
    public function beginLogin($req, $ctx);

    /**
     * @return array ["status"=>"success","identity"=>array,"next"=>string|null]
     *             | ["status"=>"fail","string"=>string]
     */
    public function handleCallback($req, $ctx);

    /** @return string|null  where Logout should send the browser afterwards */
    public function logoutUrl($ctx);

}


/**
 * I return the effective external-auth config for the current data directory,
 * or null when this instance authenticates locally.
 *
 * Merge order, later winning: the `externalAuth` object in config.json, then
 * <dataDir>/.auth/config.php if present.
 *
 * config.json is world-readable over HTTP — the client fetches it that way —
 * so nothing secret may live in it. With the shipping EdDSA provider nothing
 * secret needs to: FrameTrail holds only a public key. The .auth/config.php
 * overlay exists for the HS256 option, where a shared secret is unavoidable;
 * being PHP rather than JSON, it is executed rather than served even if a
 * misconfigured web server tries to hand it out.
 *
 * @method ftExternalAuthConfig
 * @return Array|null
 */
function ftExternalAuthConfig() {

    global $conf;
    static $cache = false;

    if ($cache !== false) {
        return $cache;
    }

    $cache  = null;
    $config = array();

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (file_exists($configFile)) {
        $json = json_decode(file_get_contents($configFile), true);
        if (is_array($json) && isset($json["externalAuth"]) && is_array($json["externalAuth"])) {
            $config = $json["externalAuth"];
        }
    }

    $secretFile = $conf["dir"]["data"] . "/.auth/config.php";
    if (file_exists($secretFile)) {
        $overlay = @include($secretFile);
        if (is_array($overlay)) {
            $config = array_merge($config, $overlay);
        }
    }

    if (!empty($config["mode"]) && !empty($config["provider"])) {
        $cache = $config;
    }

    return $cache;

}


/**
 * I am the guard that turns off local password authentication.
 *
 * @method ftExternalAuthEnabled
 * @return Boolean
 */
function ftExternalAuthEnabled() {

    return ftExternalAuthConfig() !== null;

}


/**
 * I return the subset of the config the browser is allowed to see.
 *
 * A whitelist rather than a blacklist, on purpose: adding a key to the config
 * file must never be able to leak it, and the next provider will bring keys
 * nobody has thought about yet.
 *
 * @method ftExternalAuthPublic
 * @return Array|null
 */
function ftExternalAuthPublic() {

    $config = ftExternalAuthConfig();
    if ($config === null) {
        return null;
    }

    $public = array(
        "mode"           => ($config["mode"] === "interactive") ? "interactive" : "transparent",
        "provider"       => (string)$config["provider"],
        "label"          => isset($config["label"]) ? (string)$config["label"] : "",
        "loginUrl"       => isset($config["loginUrl"]) ? (string)$config["loginUrl"] : "",
        "logoutUrl"      => isset($config["logoutUrl"]) ? (string)$config["logoutUrl"] : "",
        "manageUsersUrl" => isset($config["manageUsersUrl"]) ? (string)$config["manageUsersUrl"] : "",
        "renewUrl"       => isset($config["renewUrl"]) ? (string)$config["renewUrl"] : "",
        "canLogout"      => isset($config["canLogout"]) ? (bool)$config["canLogout"] : true
    );

    // sessionCookie and maxSessionAge are deliberately absent. They are
    // enforced here, on every request, not honoured out there — handing the
    // browser the rules it is being judged by invites a client that thinks it
    // knows better, and buys nothing it cannot already observe.

    return $public;

}


/**
 * I am the name of the cookie that says a platform session still exists.
 *
 * Optional: a provider that cannot set a cookie this instance would receive —
 * anything not hosted as a sibling of it — simply omits the key, and the
 * generation check below becomes inert. The absolute bound still applies.
 *
 * @method ftExternalSessionCookieName
 * @return String|null
 */
function ftExternalSessionCookieName() {

    $config = ftExternalAuthConfig();

    if ($config === null || empty($config["sessionCookie"])) {
        return null;
    }

    $name = (string)$config["sessionCookie"];

    // A cookie name, not an arbitrary string: this is used as an array key into
    // $_COOKIE and nothing good comes of accepting whatever is in the file.
    return preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $name) ? $name : null;

}


/**
 * I am how long a session established by a platform may live, in seconds.
 *
 * Counted from when it was established, never from the last request — that is
 * the whole point. A FrameTrail tab renews its PHP session for as long as it is
 * open, so idle expiry alone means a token minted to be valid for one minute
 * becomes a session that outlives everything that authorised it.
 *
 * There is a default even when the config names none, so an instance
 * provisioned before this existed is bounded anyway; a re-sync of its config is
 * then a correction rather than a prerequisite. An explicit 0 disables it.
 *
 * @method ftExternalSessionMaxAge
 * @return Number  seconds, or 0 for unbounded
 */
function ftExternalSessionMaxAge() {

    static $maxAge = null;

    if ($maxAge !== null) {
        return $maxAge;
    }

    $config = ftExternalAuthConfig();

    if ($config === null || !isset($config["maxSessionAge"])) {
        $maxAge = 86400;
        return $maxAge;
    }

    $value = (int)$config["maxSessionAge"];

    if ($value === 0) {
        $maxAge = 0;
        return $maxAge;
    }

    // Five minutes is the floor at which the client's heartbeat still makes
    // sense of it; thirty days the ceiling past which "bounded" stops meaning
    // anything.
    $maxAge = max(300, min(2592000, $value));

    return $maxAge;

}


/**
 * I am how long this session has left, for a client that wants to know.
 *
 * Null whenever the question does not apply: a local password session, or an
 * unbounded one. The client uses it to put its next heartbeat just past the
 * deadline instead of up to a full session lifetime after it.
 *
 * @method ftExternalSessionExpiresIn
 * @return Number|null  seconds
 */
function ftExternalSessionExpiresIn() {

    if (!isset($_SESSION["ohv"]["auth"]["at"])) {
        return null;
    }

    $maxAge = ftExternalSessionMaxAge();

    if ($maxAge === 0) {
        return null;
    }

    return max(0, ((int)$_SESSION["ohv"]["auth"]["at"] + $maxAge) - time());

}


/**
 * I end a session that the platform no longer stands behind.
 *
 * Two questions, both asked on every single request, because config.php calls
 * this before anything has read $_SESSION:
 *
 * Is there still a session over there? The platform sets a cookie on the parent
 * domain when it signs someone in and throws it away when they sign out. We
 * recorded its value at hand-off; if it is gone or different, whoever we are
 * holding a session for has signed out, signed in as somebody else, or had
 * their session expire — all of which end this one. That is the whole of the
 * propagation mechanism: no back-channel to deliver, nothing to retry.
 *
 * Has it simply gone on too long? The absolute bound, for everything the cookie
 * cannot see — a provider that sets none, a cookie cleared by hand.
 *
 * Only ever applies to sessions a platform established. A local password
 * session has no "auth" key and is never touched by any of this.
 *
 * @method ftExternalSessionEnforce
 */
function ftExternalSessionEnforce() {

    if (!isset($_SESSION["ohv"]["auth"])) {
        return;
    }

    $auth   = $_SESSION["ohv"]["auth"];
    $cookie = ftExternalSessionCookieName();

    if ($cookie !== null && isset($auth["psid"]) && is_string($auth["psid"]) && $auth["psid"] !== "") {

        $present = isset($_COOKIE[$cookie]) ? (string)$_COOKIE[$cookie] : "";

        if ($present === "" || !hash_equals($auth["psid"], $present)) {
            ftExternalSessionAbandon();
            return;
        }

    }

    $maxAge = ftExternalSessionMaxAge();

    if ($maxAge === 0) {
        return;
    }

    // A missing or unreadable stamp counts as expired. It can only come from a
    // session written by something other than ftExternalLoginEstablish(), and
    // the safe way to be wrong about that is to end it.
    if (!isset($auth["at"]) || !is_numeric($auth["at"])) {
        ftExternalSessionAbandon();
        return;
    }

    if (((int)$auth["at"] + $maxAge) < time()) {
        ftExternalSessionAbandon();
    }

}


/**
 * I empty the session without destroying it.
 *
 * Deliberately not session_destroy(). This runs ahead of every entry point,
 * sso.php among them, and a destroyed session makes the
 * session_regenerate_id(true) inside ftExternalLoginEstablish() a no-op — so a
 * hand-off arriving a second after the old session lapsed would verify a
 * perfectly good token and then silently fail to sign anyone in.
 *
 * Emptying and regenerating leaves an active, anonymous session that a fresh
 * hand-off can write straight into, and the new id means the lapsed one cannot
 * be presented again. Which is what makes the silent re-auth possible at all:
 * the frame that arrives moments later is signing in, not resurrecting.
 *
 * @method ftExternalSessionAbandon
 */
function ftExternalSessionAbandon() {

    $_SESSION = array();

    @session_regenerate_id(true);

}


/**
 * I instantiate the configured provider, or return null.
 *
 * Lazily required: an ordinary save through ajaxServer.php must not pay for
 * parsing provider code it will never call.
 *
 * @method ftAuthProvider
 * @return AuthProvider|null
 */
function ftAuthProvider() {

    static $cache = false;

    if ($cache !== false) {
        return $cache;
    }

    $cache  = null;
    $config = ftExternalAuthConfig();

    if ($config === null) {
        return null;
    }

    // Whitelist, not a file path derived from config: `provider` comes from a
    // file the platform writes, and turning it into a require() target would
    // make a config edit into code execution. This is the one place a new
    // provider has to be named — nothing else in the codebase learns about it.
    if ($config["provider"] === "token") {
        require_once(__DIR__ . "/authtoken.php");
        $cache = new ftAuthProviderToken($config);
    } elseif ($config["provider"] === "oidc") {
        require_once(__DIR__ . "/authoidc.php");
        $cache = new ftAuthProviderOidc($config);
    }

    return $cache;

}


/**
 * I clamp a provider's claims into the shape the rest of FrameTrail expects.
 *
 * The role clamp is the single structural reason a provider cannot invent a
 * third role: whatever arrives, only "admin" or "user" can ever reach disk, so
 * every requireLogin("admin") gate keeps its existing meaning.
 *
 * @method ftNormalizeIdentity
 * @param {Array} $raw
 * @return Array|null  null when the identity is unusable
 */
function ftNormalizeIdentity($raw) {

    if (!is_array($raw) || empty($raw["provider"]) || !isset($raw["sub"]) || $raw["sub"] === '') {
        return null;
    }

    $name = isset($raw["name"]) ? trim((string)$raw["name"]) : '';
    if ($name === '') {
        return null;
    }

    $mail = isset($raw["mail"]) ? strtolower(trim((string)$raw["mail"])) : '';
    if ($mail !== '' && !filter_var($mail, FILTER_VALIDATE_EMAIL)) {
        $mail = '';
    }

    $color = isset($raw["color"]) ? ltrim(trim((string)$raw["color"]), '#') : '';
    if (!preg_match('/^[0-9a-fA-F]{6}$/', $color)) {
        $color = '';
    }

    return array(
        "provider" => (string)$raw["provider"],
        "sub"      => (string)$raw["sub"],
        "name"     => mb_substr($name, 0, 200),
        "mail"     => $mail,
        "role"     => (isset($raw["role"]) && $raw["role"] === "admin") ? "admin" : "user",
        "color"    => $color,
        "avatar"   => ftNormalizeAvatar(isset($raw["avatar"]) ? $raw["avatar"] : ''),
        "active"   => (isset($raw["active"]) && (int)$raw["active"] === 0) ? 0 : 1
    );

}


/**
 * I report how this instance handles profile pictures.
 *
 *   off     no pictures anywhere; initials only. The default.
 *   local   pictures, but only ones stored in this instance's own _data.
 *   cache   as local, and a provider-supplied picture is fetched once,
 *           server-side, and stored here.
 *   remote  as local, and a provider-supplied picture is rendered straight
 *           from wherever it lives.
 *
 * The ladder is about origins, not features. Only `remote` makes a visitor's
 * browser talk to a third party, which for some hosts is a published promise
 * rather than a preference — so it is opt-in, never inherited.
 *
 * @method ftAvatarMode
 * @return String
 */
function ftAvatarMode() {

    global $conf;
    static $cache = null;

    if ($cache !== null) {
        return $cache;
    }

    $cache = 'off';
    $file  = $conf["dir"]["data"] . "/config.json";

    if (file_exists($file)) {
        $config = json_decode(file_get_contents($file), true);
        $mode   = isset($config["userAvatars"]) ? (string)$config["userAvatars"] : 'off';

        if (in_array($mode, array('off', 'local', 'cache', 'remote'), true)) {
            $cache = $mode;
        }
    }

    return $cache;

}


/**
 * I validate an avatar reference: either an absolute https URL or a path
 * relative to the data directory, the same two shapes a resource src may take.
 *
 * Anything else — data:, javascript:, plain http, protocol-relative, traversal
 * — becomes the empty string, which renders as initials.
 *
 * @method ftNormalizeAvatar
 * @param {String} $avatar
 * @return String
 */
function ftNormalizeAvatar($avatar) {

    $avatar = trim((string)$avatar);
    $mode   = ftAvatarMode();

    if ($mode === 'off' || $avatar === '' || strlen($avatar) > 512 || strpos($avatar, '..') !== false) {
        return '';
    }

    if (strncmp($avatar, 'https://', 8) === 0) {

        // Fetched once and kept here, so no visitor's browser ever asks the
        // provider for it. Falls back to the URL only where the instance has
        // said it is willing to load one.
        if ($mode === 'cache') {
            $local = ftCacheAvatar($avatar);

            return $local !== '' ? $local : '';
        }

        return ($mode === 'remote') ? $avatar : '';

    }

    if (preg_match('#^resources/[A-Za-z0-9._/-]{1,180}$#', $avatar)) {
        return $avatar;
    }

    return '';

}


/**
 * I fetch a provider's picture once and keep it here, returning the local
 * reference — or an empty string, which renders as initials.
 *
 * This is a server-side fetch of a URL that ultimately came from outside, which
 * is the shape of an SSRF: a token claiming `picture: http://169.254.169.254/…`
 * would otherwise have this instance read its own cloud metadata and store the
 * result where anyone can fetch it. Hence: https only, the resolved address
 * must be a public one, one redirect at most, a byte cap, and the response has
 * to actually decode as an image.
 *
 * The image is re-encoded rather than copied, because a file can be a valid
 * image and a valid script at once; decoding and re-encoding keeps the pixels
 * and discards everything else.
 *
 * @method ftCacheAvatar
 * @param {String} $url
 * @return String  a _data-relative path, or ''
 */
function ftCacheAvatar($url) {

    global $conf;

    if (!function_exists('curl_init') || !function_exists('imagecreatefromstring')) {
        return '';
    }

    $name = 'avatars/' . hash('sha256', $url) . '.jpg';
    $path = $conf["dir"]["data"] . '/resources/' . $name;

    // One fetch per picture per week: a provider's URL rarely changes, and the
    // point of caching is not to ask them on every sign-in.
    if (file_exists($path) && (time() - filemtime($path)) < 604800) {
        return 'resources/' . $name;
    }

    $host = parse_url($url, PHP_URL_HOST);
    if (!$host || !ftIsPublicHost($host)) {
        return '';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 1,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT      => 'FrameTrail',
        // Stop reading rather than trust a Content-Length nobody has to send.
        CURLOPT_BUFFERSIZE     => 16384,
        CURLOPT_NOPROGRESS     => false,
        CURLOPT_PROGRESSFUNCTION => function ($res, $expected, $got) {
            return ($got > 2097152) ? 1 : 0;
        },
    ));

    $body = curl_exec($ch);
    $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $final = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);

    if ($body === false || $code !== 200 || strncmp($type, 'image/', 6) !== 0) {
        return '';
    }

    // A redirect can leave the allowlist the first request satisfied.
    $finalHost = parse_url($final, PHP_URL_HOST);
    if (!$finalHost || !ftIsPublicHost($finalHost)) {
        return '';
    }

    $image = @imagecreatefromstring($body);
    if ($image === false) {
        return '';
    }

    $square = ftSquareImage($image, 128);
    imagedestroy($image);

    if (!is_dir(dirname($path)) && !@mkdir(dirname($path), 0755, true) && !is_dir(dirname($path))) {
        imagedestroy($square);

        return '';
    }

    $ok = imagejpeg($square, $path, 82);
    imagedestroy($square);

    return $ok ? 'resources/' . $name : '';

}


/**
 * I answer whether a hostname resolves to an address on the public internet.
 *
 * Resolved rather than pattern-matched: "localhost" and "127.0.0.1" are the
 * obvious spellings, but a hostname an attacker controls can simply have an A
 * record pointing at a private address, so the name tells us nothing and the
 * answer does.
 *
 * @method ftIsPublicHost
 * @param {String} $host
 * @return Boolean
 */
function ftIsPublicHost($host) {

    $addresses = array();

    foreach (array(DNS_A, DNS_AAAA) as $type) {
        foreach ((array)@dns_get_record($host, $type) as $record) {
            if (isset($record['ip']))   $addresses[] = $record['ip'];
            if (isset($record['ipv6'])) $addresses[] = $record['ipv6'];
        }
    }

    if (!$addresses) {
        // A literal address rather than a name, or a name that does not resolve.
        $addresses = array($host);
    }

    foreach ($addresses as $address) {
        if (!filter_var($address, FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
    }

    return true;

}


/**
 * I crop an image to a centred square and scale it, so a chip 26 pixels across
 * is not asked to letterbox a panorama.
 *
 * @method ftSquareImage
 * @param {resource} $image
 * @param {Number} $size
 * @return resource
 */
function ftSquareImage($image, $size) {

    $width  = imagesx($image);
    $height = imagesy($image);
    $side   = min($width, $height);

    $square = imagecreatetruecolor($size, $size);

    imagecopyresampled(
        $square, $image,
        0, 0,
        (int)(($width - $side) / 2), (int)(($height - $side) / 2),
        $size, $size,
        $side, $side
    );

    return $square;

}


/**
 * I strip credential material before any users.json write.
 *
 * Belt and braces with the caller: in external mode there is no password to
 * verify, so a `passwd` key can only ever be a mistake or an attempt, and in
 * either case it must not reach disk.
 *
 * @method ftAssertNoPasswd
 * @param {Array} $record
 * @return Array
 */
function ftAssertNoPasswd($record) {

    if (ftExternalAuthEnabled() && is_array($record) && array_key_exists("passwd", $record)) {
        trigger_error("FrameTrail: refusing to write passwd while external auth is configured", E_USER_WARNING);
        unset($record["passwd"]);
    }

    return $record;

}


/**
 * I am the directory holding ephemeral auth state — currently only the replay
 * store. Treated exactly like .collab/: not secret, but never served and never
 * exported.
 *
 * @method ftAuthStateDir
 * @return String
 */
function ftAuthStateDir() {

    global $conf;
    return $conf["dir"]["data"] . "/.auth";

}


/**
 * I burn a token id, returning true the first time and false on every replay.
 *
 * An exclusive create is the whole mechanism: on a POSIX filesystem exactly one
 * caller can win an O_CREAT|O_EXCL open, which is precisely what one-time-use
 * means. No lock, no database, no window between checking and claiming.
 *
 * A failure to write is a failure to claim, so a full or read-only disk makes
 * logins fail closed rather than become replayable.
 *
 * @method ftReplayClaim
 * @param {String} $jti
 * @param {Number} $expiresAt
 * @return Boolean
 */
function ftReplayClaim($jti, $expiresAt) {

    if (!preg_match('/^[A-Za-z0-9._-]{16,128}$/', (string)$jti)) {
        return false;
    }

    $hash = hash('sha256', $jti);
    $dir  = ftAuthStateDir() . "/jti/" . substr($hash, 0, 2);

    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false;
    }

    $handle = @fopen($dir . "/" . $hash, 'x');
    if ($handle === false) {
        return false;
    }

    fwrite($handle, (string)(int)$expiresAt);
    fclose($handle);

    // Swept rarely and opportunistically — the store is only ever a few minutes
    // deep, so a scheduled job would be more machinery than the problem needs.
    if (mt_rand(1, 50) === 1) {
        ftReplayGarbageCollect();
    }

    return true;

}


/**
 * I delete replay records that can no longer protect anything, because the
 * tokens they name have expired and would now be refused on their own.
 *
 * @method ftReplayGarbageCollect
 * @return void
 */
function ftReplayGarbageCollect() {

    $root   = ftAuthStateDir() . "/jti";
    $cutoff = time() - 900;

    if (!is_dir($root)) {
        return;
    }

    foreach ((array)glob($root . "/*", GLOB_ONLYDIR) as $shard) {
        foreach ((array)glob($shard . "/*") as $file) {
            if (@filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }

}


/**
 * I sanitise a post-login return target.
 *
 * Only a same-origin path is ever acceptable. Accepting an absolute URL here —
 * or reflecting the Referer — would turn the login landing into an open
 * redirect, which is exactly the shape phishing wants: a link that really does
 * start at the platform's own trusted domain.
 *
 * @method ftSafeNext
 * @param {String} $next
 * @return String|null
 */
function ftSafeNext($next) {

    if (!is_string($next) || $next === '' || strlen($next) > 512) {
        return null;
    }

    // A leading "//" is a protocol-relative URL, and a backslash is normalised
    // to a slash by some browsers — both would leave the origin. A "..", while
    // it cannot leave the origin, would climb out of the installation the token
    // authenticated into, which on a host serving more than one app under one
    // domain is a distinction that matters.
    if ($next[0] !== '/' || strncmp($next, '//', 2) === 0
        || strpos($next, '\\') !== false || strpos($next, '..') !== false) {
        return null;
    }

    // Delimited with / and the inner slashes escaped, because the allowed set
    // has to include '#' for a fragment — and a '#' delimiter would end the
    // pattern right there, leaving preg_match to fail and every return path to
    // be discarded without a word.
    if (!preg_match('/^\/[A-Za-z0-9._~!$&\'()*+,;=:@%\/?#=&-]{0,511}$/', $next)) {
        return null;
    }

    return $next;

}

?>
