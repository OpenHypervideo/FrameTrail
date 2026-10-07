<?php

/**
 * Personal API tokens: how a program that is not a browser acts as a user.
 *
 * A script, an integration or any other client sends
 *
 *     Authorization: Bearer ft_<id>_<secret>
 *
 * and is that user for the one request, with the user's role and permissions.
 * config.php checks the header before anything reads the session: a request
 * that carries a token starts no session at all, so no session cookie is
 * issued and nothing outlives the request. (Starting one would let a single
 * use of a token mint a cookie session that survives the token's revocation.)
 * Everything downstream reads $_SESSION["ohv"]["user"] as it always has.
 *
 * Tokens live in the user's record in users.json:
 *
 *     "tokens": [ { "id", "label", "hash", "created", "lastUsed", "expires" } ]
 *
 * `hash` is the SHA-256 of the secret, compared with hash_equals(). Not
 * password_hash(): a bcrypt hash cannot be looked up, so every request would
 * pay a slow verify per stored token, and a 256-bit random secret needs no key
 * stretching. The id finds the record, the secret proves the token.
 *
 * Who creates them:
 * * config.json → "apiTokens": true lets each signed-in user create, list and
 *   revoke their own in "My settings". Off by default: tokens are a technical
 *   thing most instances never need.
 * * Under external authentication the `tokens` key belongs to the platform,
 *   which writes token hashes into the records it maintains anyway. The self
 *   service is off there whatever apiTokens says, so neither side overwrites
 *   the other's tokens.
 *
 * Tokens are accepted when either applies. Otherwise a token is refused, even
 * one that is stored: switching apiTokens off switches its tokens off at once.
 *
 * A token is never a way into the account itself: account and token actions
 * refuse bearer requests (ajaxServer.php), so a leaked token can neither change
 * the password nor mint itself a successor.
 */


/**
 * I say whether config.json switches the self-service on.
 *
 * @method ftApiTokensConfigured
 * @return Boolean
 */
function ftApiTokensConfigured() {

    global $conf;
    static $cache = null;

    if ($cache !== null) {
        return $cache;
    }

    $configFile = $conf["dir"]["data"] . "/config.json";
    $json = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : null;

    // Strict, like alwaysForceLogin: only a real true counts.
    return $cache = (is_array($json) && isset($json["apiTokens"]) && $json["apiTokens"] === true);

}


/**
 * I say whether bearer tokens are accepted at all: when the instance hands
 * them out itself, or when a platform writes them.
 *
 * @method ftApiTokensAccepted
 * @return Boolean
 */
function ftApiTokensAccepted() {

    return ftApiTokensConfigured() || ftExternalAuthEnabled();

}


/**
 * I say whether users manage their own tokens here ("My settings" and the
 * userToken* actions).
 *
 * @method ftApiTokensSelfService
 * @return Boolean
 */
function ftApiTokensSelfService() {

    return ftApiTokensConfigured() && !ftExternalAuthEnabled();

}


/**
 * I split a token into its id and secret, or return null when it is not one.
 *
 * The format is "ft_" + id (8–64 lowercase letters and digits) + "_" + secret
 * (32–128 characters of the base64url alphabet). The id has no "_", so the
 * first one after it ends it. FrameTrail mints a 16-character hex id and a
 * 43-character secret (256 bits); a platform may mint its own within the format.
 *
 * @method ftTokenParse
 * @param {String} $token
 * @return Array|null  array("id" => …, "secret" => …)
 */
function ftTokenParse($token) {

    if (!is_string($token) || !preg_match('/^ft_([a-z0-9]{8,64})_([A-Za-z0-9_-]{32,128})$/', $token, $m)) {
        return null;
    }

    return array("id" => $m[1], "secret" => $m[2]);

}


/**
 * I return the hash stored for a secret: lowercase hex SHA-256.
 *
 * @method ftTokenHash
 * @param {String} $secret
 * @return String
 */
function ftTokenHash($secret) {

    return hash("sha256", $secret);

}


/**
 * I return the token a request sends as "Authorization: Bearer ft_…", or null.
 *
 * Any other Authorization header is not mine and is left alone: an instance
 * behind a proxy that forwards its own bearer tokens, or behind HTTP Basic
 * authentication, keeps working as before.
 *
 * Apache with mod_php puts the header in HTTP_AUTHORIZATION; behind FastCGI it
 * arrives only through the rewrite in .htaccess, possibly prefixed REDIRECT_.
 *
 * @method ftBearerTokenFromRequest
 * @return String|null
 */
function ftBearerTokenFromRequest() {

    $values = array();

    foreach (array("HTTP_AUTHORIZATION", "REDIRECT_HTTP_AUTHORIZATION") as $key) {
        if (isset($_SERVER[$key]) && is_string($_SERVER[$key])) {
            $values[] = $_SERVER[$key];
        }
    }

    if (function_exists("getallheaders")) {
        foreach ((array)getallheaders() as $header => $value) {
            if (strcasecmp($header, "Authorization") === 0 && is_string($value)) {
                $values[] = $value;
            }
        }
    }

    foreach ($values as $value) {
        if (preg_match('/^\s*Bearer\s+(ft_\S*)\s*$/i', $value, $m)) {
            return $m[1];
        }
    }

    return null;

}


/**
 * I say whether this request authenticated with a token rather than a session.
 *
 * @method ftIsBearerRequest
 * @return Boolean
 */
function ftIsBearerRequest() {

    return isset($GLOBALS["ftBearer"]);

}


/**
 * I return a user record as it may leave the server or sit in a session:
 * without the password hash and without the token hashes.
 *
 * @method ftUserWithoutSecrets
 * @param {Array} $record
 * @return Array
 */
function ftUserWithoutSecrets($record) {

    if (is_array($record)) {
        unset($record["passwd"], $record["tokens"]);
    }

    return $record;

}


/**
 * I return a token record as its owner may see it: everything but the hash.
 *
 * @method ftTokenPublic
 * @param {Array} $token
 * @return Array
 */
function ftTokenPublic($token) {

    return array(
        "id"       => isset($token["id"]) ? (string)$token["id"] : "",
        "label"    => isset($token["label"]) ? (string)$token["label"] : "",
        "created"  => isset($token["created"]) ? $token["created"] : null,
        "lastUsed" => isset($token["lastUsed"]) ? $token["lastUsed"] : null,
        "expires"  => isset($token["expires"]) ? $token["expires"] : null
    );

}


/**
 * Failed bearer attempts are counted per client address, so a token cannot be
 * guessed by trying (it could not anyway, at 256 bits, but nobody should get to
 * keep trying). The counts live with the other auth state in _data/.auth/,
 * which is never served or exported.
 */
function ftBearerFailureLimit()  { return 10; }    // failures …
function ftBearerFailureWindow() { return 600; }   // … per this many seconds


/**
 * I return the file counting the current client's failures.
 *
 * @method ftBearerFailureFile
 * @return String
 */
function ftBearerFailureFile() {

    $address = isset($_SERVER["REMOTE_ADDR"]) ? (string)$_SERVER["REMOTE_ADDR"] : "unknown";

    return ftAuthStateDir() . "/bearer/" . substr(hash("sha256", $address), 0, 32);

}


/**
 * I return how many seconds the current client still has to wait, or 0.
 *
 * @method ftBearerRetryAfter
 * @return Number
 */
function ftBearerRetryAfter() {

    $file = ftBearerFailureFile();
    if (!file_exists($file)) {
        return 0;
    }

    $state = json_decode((string)@file_get_contents($file), true);
    if (!is_array($state) || !isset($state["since"], $state["count"])) {
        return 0;
    }

    $until = (int)$state["since"] + ftBearerFailureWindow();
    if ($until <= time() || (int)$state["count"] < ftBearerFailureLimit()) {
        return 0;
    }

    return $until - time();

}


/**
 * I count a failed attempt of the current client.
 *
 * @method ftBearerRecordFailure
 */
function ftBearerRecordFailure() {

    $file = ftBearerFailureFile();
    $dir  = dirname($file);

    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return;
    }

    $handle = @fopen($file, "c+");
    if ($handle === false) {
        return;
    }

    flock($handle, LOCK_EX);

    $state = json_decode((string)stream_get_contents($handle), true);
    if (!is_array($state) || !isset($state["since"], $state["count"])
        || (int)$state["since"] + ftBearerFailureWindow() <= time()) {
        $state = array("since" => time(), "count" => 0);
    }
    $state["count"] = (int)$state["count"] + 1;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    // Swept rarely and opportunistically, like the replay store.
    if (mt_rand(1, 50) === 1) {
        foreach ((array)glob($dir . "/*") as $old) {
            if (@filemtime($old) < time() - ftBearerFailureWindow()) {
                @unlink($old);
            }
        }
    }

}


/**
 * I answer a bearer request that cannot be let in, and stop.
 *
 * @method ftBearerRefuse
 * @param {Number} $status      401 or 429
 * @param {String} $message
 * @param {Number} $retryAfter  seconds, for 429
 */
function ftBearerRefuse($status, $message, $retryAfter = 0) {

    http_response_code($status);
    header("Content-Type: application/json");
    header("Cache-Control: no-store");

    if ($status === 401) {
        header('WWW-Authenticate: Bearer realm="FrameTrail", error="invalid_token"');
    }
    if ($retryAfter > 0) {
        header("Retry-After: " . (int)$retryAfter);
    }

    echo json_encode(array(
        "status" => "fail",
        "code"   => $status,
        "string" => $message
    ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    exit;

}


/**
 * I resolve a token to its user, re-reading users.json, so a revoked token, an
 * expired one and the token of a deactivated or deleted user stop working with
 * the next request.
 *
 * @method ftBearerAuthenticate
 * @param {String} $token
 * @return Array  array("user" => record with "id", "tokenId" => …) or
 *                array("fail" => true, "status", "string", "count" => Boolean)
 */
function ftBearerAuthenticate($token) {

    global $conf;

    $invalid = array("fail" => true, "status" => 401, "string" => "The token is not valid.", "count" => true);

    if (!ftApiTokensAccepted()) {
        return array("fail" => true, "status" => 401, "string" => "API tokens are not enabled on this instance.", "count" => false);
    }

    $parsed = ftTokenParse($token);
    if ($parsed === null) {
        return $invalid;
    }

    $userFile = $conf["dir"]["data"] . "/users.json";
    if (!file_exists($userFile)) {
        return $invalid;
    }

    // Under the file's lock, as userCheckLogin() reads it: a read in the
    // middle of someone's write would otherwise refuse a valid token.
    $file   = new sharedFile($userFile);
    $userDB = json_decode($file->read(), true);
    $file->close();

    if (!is_array($userDB) || !isset($userDB["user"]) || !is_array($userDB["user"])) {
        return $invalid;
    }

    foreach ($userDB["user"] as $userID => $record) {

        if (!isset($record["tokens"]) || !is_array($record["tokens"])) {
            continue;
        }

        foreach ($record["tokens"] as $stored) {

            if (!is_array($stored) || !isset($stored["id"], $stored["hash"]) || (string)$stored["id"] !== $parsed["id"]) {
                continue;
            }

            if (!is_string($stored["hash"]) || !hash_equals(strtolower($stored["hash"]), ftTokenHash($parsed["secret"]))) {
                return $invalid;
            }

            if (isset($stored["expires"]) && $stored["expires"] !== null && $stored["expires"] !== "" && (int)$stored["expires"] <= time()) {
                return array("fail" => true, "status" => 401, "string" => "The token has expired.", "count" => true);
            }

            if (!isset($record["active"]) || (int)$record["active"] !== 1) {
                return array("fail" => true, "status" => 401, "string" => "The account of this token is not active.", "count" => true);
            }

            $user       = ftUserWithoutSecrets($record);
            $user["id"] = (string)$userID;

            ftTokenTouch((string)$userID, $parsed["id"], isset($stored["lastUsed"]) ? $stored["lastUsed"] : null);

            return array("user" => $user, "tokenId" => $parsed["id"]);

        }

    }

    return $invalid;

}


/**
 * I record when a token was last used, at most every five minutes: users.json
 * is rewritten under its lock, and a client making many requests should not
 * rewrite it on each one.
 *
 * @method ftTokenTouch
 * @param {String} $userID
 * @param {String} $tokenID
 * @param {Number|null} $lastUsed  as read
 */
function ftTokenTouch($userID, $tokenID, $lastUsed) {

    global $conf;

    if ($lastUsed !== null && is_numeric($lastUsed) && (int)$lastUsed > time() - 300) {
        return;
    }

    $file   = new sharedFile($conf["dir"]["data"] . "/users.json");
    $userDB = json_decode($file->read(), true);

    if (!is_array($userDB) || !isset($userDB["user"][$userID]["tokens"]) || !is_array($userDB["user"][$userID]["tokens"])) {
        $file->close();
        return;
    }

    foreach ($userDB["user"][$userID]["tokens"] as $i => $token) {
        if (is_array($token) && isset($token["id"]) && (string)$token["id"] === $tokenID) {
            $userDB["user"][$userID]["tokens"][$i]["lastUsed"] = time();
            $file->writeClose(json_encode($userDB, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
            return;
        }
    }

    $file->close();

}


/**
 * I let a request that sends a token in as the token's user, or answer it with
 * 401 / 429 and stop. Called by config.php instead of starting a session.
 *
 * @method ftBearerEstablish
 * @return Boolean  false when the request sends no token (start a session)
 */
function ftBearerEstablish() {

    $token = ftBearerTokenFromRequest();
    if ($token === null) {
        return false;
    }

    $wait = ftBearerRetryAfter();
    if ($wait > 0) {
        ftBearerRefuse(429, "Too many failed attempts. Try again later.", $wait);
    }

    $result = ftBearerAuthenticate($token);

    if (isset($result["fail"])) {
        if ($result["count"]) {
            ftBearerRecordFailure();
        }
        ftBearerRefuse($result["status"], $result["string"]);
    }

    // A session-shaped array that is never a session: nothing started it, so
    // nothing writes it anywhere when the request ends.
    $_SESSION = array("ohv" => array("login" => 1, "user" => $result["user"]));

    $GLOBALS["ftBearer"] = array("tokenId" => $result["tokenId"], "userId" => $result["user"]["id"]);

    return true;

}


/**
 * I refuse a bearer request to an action that only a signed-in browser may
 * call, or return null.
 *
 * @method ftBearerRefusesAction
 * @param {String} $action
 * @return Array|null
 */
function ftBearerRefusesAction($action) {

    $accountActions = array(
        "userLogin", "userLogout", "userRegister", "userChange", "userDelete",
        "userTokenCreate", "userTokenList", "userTokenRevoke",
        "setupCheckDetailed", "setupInit"
    );

    if (!ftIsBearerRequest() || !in_array($action, $accountActions, true)) {
        return null;
    }

    return array(
        "status" => "fail",
        "code"   => 403,
        "string" => "This action is not available with an API token."
    );

}


/**
 * The checks every token action starts with: a signed-in user (requireLogin(),
 * which also refuses inactive accounts) on an instance with the self-service.
 *
 * @method ftTokenActionGuard
 * @return Array|null  a failure answer, or null
 */
function ftTokenActionGuard() {

    include_once(__DIR__ . "/user.php");

    if ($err = requireLogin()) return $err;

    if (!ftApiTokensSelfService()) {
        return array(
            "status" => "fail",
            "code"   => 2,
            "string" => "API tokens are not available on this instance."
        );
    }

    return null;

}


/**
 * I list the current user's tokens, without their hashes.
 *
 * Returning codes:
 * 0 = success, the tokens in "response"
 * 1 = not signed in, or not active
 * 2 = this instance does not offer tokens to its users
 *
 * @method userTokenList
 * @return Array
 */
function userTokenList() {

    global $conf;

    if ($err = ftTokenActionGuard()) return $err;

    $file   = new sharedFile($conf["dir"]["data"] . "/users.json");
    $userDB = json_decode($file->read(), true);
    $file->close();
    $record = isset($userDB["user"][$_SESSION["ohv"]["user"]["id"]]) ? $userDB["user"][$_SESSION["ohv"]["user"]["id"]] : array();

    $tokens = array();
    if (isset($record["tokens"]) && is_array($record["tokens"])) {
        foreach ($record["tokens"] as $token) {
            if (is_array($token)) {
                $tokens[] = ftTokenPublic($token);
            }
        }
    }

    return array("status" => "success", "code" => 0, "string" => "see response", "response" => $tokens);

}


/**
 * I create a token for the current user and return it, the only time its
 * value is ever shown.
 *
 * Returning codes:
 * 0 = success: "response" has "token" (the value) and "record"
 * 1 = not signed in, or not active
 * 2 = this instance does not offer tokens to its users
 * 3 = label or expiry not valid
 * 4 = users.json could not be written
 * 5 = the user has the maximum number of tokens (20)
 *
 * @method userTokenCreate
 * @param {String} $label          1–80 characters
 * @param {String} $expiresInDays  "" or "0" for never, otherwise 1–3650
 * @return Array
 */
function userTokenCreate($label, $expiresInDays) {

    global $conf;

    if ($err = ftTokenActionGuard()) return $err;

    $label = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$label));
    if ($label === "" || !mb_check_encoding($label, "UTF-8") || mb_strlen($label, "UTF-8") > 80) {
        return array("status" => "fail", "code" => 3, "string" => "The label must have 1 to 80 characters.");
    }

    $expiresInDays = trim((string)$expiresInDays);
    if ($expiresInDays === "" || $expiresInDays === "0") {
        $expires = null;
    } elseif (ctype_digit($expiresInDays) && (int)$expiresInDays >= 1 && (int)$expiresInDays <= 3650) {
        $expires = time() + (int)$expiresInDays * 86400;
    } else {
        return array("status" => "fail", "code" => 3, "string" => "The expiry must be a number of days between 1 and 3650, or none.");
    }

    $file   = new sharedFile($conf["dir"]["data"] . "/users.json");
    $userDB = json_decode($file->read(), true);
    $userID = (string)$_SESSION["ohv"]["user"]["id"];

    if (!is_array($userDB) || !isset($userDB["user"][$userID])) {
        $file->close();
        return array("status" => "fail", "code" => 1, "string" => "User not found.");
    }

    $tokens = (isset($userDB["user"][$userID]["tokens"]) && is_array($userDB["user"][$userID]["tokens"]))
            ? array_values($userDB["user"][$userID]["tokens"])
            : array();

    if (count($tokens) >= 20) {
        $file->close();
        return array("status" => "fail", "code" => 5, "string" => "You have the maximum number of tokens. Revoke one first.");
    }

    // Unique across the instance: the id is how a token finds its user.
    $taken = array();
    foreach ($userDB["user"] as $other) {
        if (isset($other["tokens"]) && is_array($other["tokens"])) {
            foreach ($other["tokens"] as $token) {
                if (is_array($token) && isset($token["id"])) $taken[(string)$token["id"]] = true;
            }
        }
    }
    do {
        $id = bin2hex(random_bytes(8));
    } while (isset($taken[$id]));

    $secret = rtrim(strtr(base64_encode(random_bytes(32)), "+/", "-_"), "=");

    $record = array(
        "id"       => $id,
        "label"    => $label,
        "hash"     => ftTokenHash($secret),
        "created"  => time(),
        "lastUsed" => null,
        "expires"  => $expires
    );

    $tokens[] = $record;
    $userDB["user"][$userID]["tokens"] = $tokens;

    if (!$file->writeClose(json_encode($userDB, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT))) {
        return array("status" => "fail", "code" => 4, "string" => "Could not write the user database.");
    }

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Token created. Its value is shown only now.",
        "response" => array(
            "token"  => "ft_" . $id . "_" . $secret,
            "record" => ftTokenPublic($record)
        )
    );

}


/**
 * I revoke one of the current user's tokens. It stops working with the next
 * request.
 *
 * Returning codes:
 * 0 = success
 * 1 = not signed in, or not active
 * 2 = this instance does not offer tokens to its users
 * 3 = users.json could not be written
 * 4 = the user has no such token
 *
 * @method userTokenRevoke
 * @param {String} $tokenID
 * @return Array
 */
function userTokenRevoke($tokenID) {

    global $conf;

    if ($err = ftTokenActionGuard()) return $err;

    $file   = new sharedFile($conf["dir"]["data"] . "/users.json");
    $userDB = json_decode($file->read(), true);
    $userID = (string)$_SESSION["ohv"]["user"]["id"];

    if (is_array($userDB) && isset($userDB["user"][$userID]["tokens"]) && is_array($userDB["user"][$userID]["tokens"])) {

        foreach ($userDB["user"][$userID]["tokens"] as $i => $token) {

            if (is_array($token) && isset($token["id"]) && (string)$token["id"] === (string)$tokenID) {

                unset($userDB["user"][$userID]["tokens"][$i]);
                $userDB["user"][$userID]["tokens"] = array_values($userDB["user"][$userID]["tokens"]);

                if (!$file->writeClose(json_encode($userDB, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT))) {
                    return array("status" => "fail", "code" => 3, "string" => "Could not write the user database.");
                }

                return array("status" => "success", "code" => 0, "string" => "Token revoked.");

            }

        }

    }

    $file->close();

    return array("status" => "fail", "code" => 4, "string" => "No such token.");

}

?>
