<?php
/**
 * Pairing grants: the media of a private instance for paired phones (docs/PAIRING.md, "Private instances").
 *
 * A phone paired with the player has no session, so on a private instance serve.php would refuse it the
 * pictures, sounds and documents in _data/resources/ that the views on the phone show. A grant lets it read
 * there, and nowhere else, for a few minutes at a time:
 *
 * - The signed-in player asks for one (ajaxServer.php, a=pairingGrant) and passes it to its phones over the
 *   encrypted channel: never in the QR code, never through the broker. It asks again at half the lifetime,
 *   for as long as pairing is on.
 * - A phone keeps it as a cookie on this origin, for the path of _data/resources/ (the player tells it the
 *   cookie's name and path, both from here), so its media requests carry it like any other.
 * - serve.php accepts a valid grant for a file in _data/resources/ in place of a session, and starts no
 *   session for it.
 *
 * A grant is "<expiry>.<signature>": the expiry in Unix seconds, and base64url(HMAC-SHA256(secret,
 * "pairing-v1|resources|<expiry>")) with a secret of this data directory's own (_data/.auth/pairing_grant.php,
 * made on the first grant). It names no one: whoever holds it reads the resources until it expires. That is
 * what a projected code offers anyway: everyone who scans it sees what the phones show. Deleting the secret
 * file ends every grant at once.
 */

// Seconds a grant is valid. The player renews it at half of this.
define('FT_PAIRING_GRANT_TTL', 600);


/**
 * I am where this data directory keeps the secret grants are signed with. Its name has an underscore, so no
 * extension (whose names are [a-z0-9-]) can be handed it as its own secrets file.
 *
 * @return String
 */
function ftPairingSecretFile() {
    return ftAuthStateDir() . '/pairing_grant.php';
}

/**
 * I read the secret, or return null when there is none (yet). Reading never makes one: serve.php only reads.
 *
 * @return String|null
 */
function ftPairingSecretRead() {
    $file = ftPairingSecretFile();
    if (!is_file($file)) {
        return null;
    }
    $secret = @include($file);
    return (is_string($secret) && strlen($secret) >= 32) ? $secret : null;
}

/**
 * I return the secret, and make it on the first call. The file is created exclusively, so two first calls
 * at once cannot leave two secrets behind.
 *
 * @return String|null  null when _data/.auth/ cannot be written
 */
function ftPairingSecret() {

    $secret = ftPairingSecretRead();
    if ($secret !== null) {
        return $secret;
    }

    $dir = ftAuthStateDir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return null;
    }

    $file   = ftPairingSecretFile();
    $handle = @fopen($file, 'x');
    if ($handle === false) {
        // Made by another request in the meantime.
        return ftPairingSecretRead();
    }

    $secret = rtrim(strtr(base64_encode(random_bytes(32)), "+/", "-_"), "=");
    fwrite($handle, "<?php\n// The secret pairing grants are signed with (_server/pairing.incl.php). Delete this file to end every grant at once.\nreturn '" . $secret . "';\n");
    fclose($handle);
    @chmod($file, 0600);

    return $secret;

}

/**
 * I am the signature of a grant that expires at $expires.
 *
 * @param String $secret
 * @param Int    $expires  Unix seconds
 * @return String  base64url, 43 characters
 */
function ftPairingGrantSign($secret, $expires) {
    return rtrim(strtr(base64_encode(hash_hmac('sha256', 'pairing-v1|resources|' . $expires, $secret, true)), "+/", "-_"), "=");
}

/**
 * I make a grant valid for $ttl seconds from $now.
 *
 * @param String $secret
 * @param Int    $now  Unix seconds
 * @param Int    $ttl  seconds
 * @return String
 */
function ftPairingGrantMake($secret, $now, $ttl) {
    $expires = (int) $now + (int) $ttl;
    return $expires . '.' . ftPairingGrantSign($secret, $expires);
}

/**
 * Whether $token is a grant signed with $secret and valid at $now. One that claims to run longer than a
 * grant lives is refused too, so shortening the lifetime shortens the grants already out.
 *
 * @param String|null $secret
 * @param String      $token
 * @param Int         $now  Unix seconds
 * @return Bool
 */
function ftPairingGrantCheck($secret, $token, $now) {

    if (!is_string($secret) || $secret === '' || !is_string($token)
        || !preg_match('/^([0-9]{1,12})\.([A-Za-z0-9_-]{43})$/', $token, $m)) {
        return false;
    }

    $expires = (int) $m[1];
    if ($expires <= $now || $expires > $now + FT_PAIRING_GRANT_TTL) {
        return false;
    }

    return hash_equals(ftPairingGrantSign($secret, $expires), $m[2]);

}

/**
 * I am the name of the grant cookie: per host, like the session's (config.php), so that grants of instances
 * on sibling subdomains never meet under one name.
 *
 * @return String  "FTPAIR" and eight hexadecimal digits
 */
function ftPairingCookieName() {
    return 'FTPAIR' . substr(sha1(isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost'), 0, 8);
}

/**
 * I am the path of the grant cookie: the URL path of _data/resources/, the only place a grant opens. Every
 * entry point is a script in _server/, whose sibling the data directory is.
 *
 * @return String  e.g. "/_data/resources/" or "/FrameTrail/src/_data/resources/"
 */
function ftPairingCookiePath() {
    $script = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\', '/', $_SERVER['SCRIPT_NAME']) : '/_server/ajaxServer.php';
    return rtrim(dirname(dirname($script)), '/') . '/_data/resources/';
}

/**
 * Whether this request carries a valid grant (serve.php).
 *
 * @return Bool
 */
function ftPairingRequestGranted() {
    $name = ftPairingCookieName();
    if (!isset($_COOKIE[$name])) {
        return false;
    }
    return ftPairingGrantCheck(ftPairingSecretRead(), (string) $_COOKIE[$name], time());
}

/**
 * A grant for the phones paired with this player (a=pairingGrant): only for someone signed in, and only on a
 * private instance (a public one serves its resources to everyone).
 *
 * @return Array  response: { token, ttl, cookie: { name, path } }
 */
function pairingGrant() {

    if ($err = requireLogin()) {
        return $err;
    }

    if (!ftInstanceIsPrivate()) {
        return array(
            "status" => "fail",
            "code"   => 2,
            "string" => "This instance is public: paired phones need no grant."
        );
    }

    $secret = ftPairingSecret();
    if ($secret === null) {
        return array(
            "status" => "error",
            "code"   => 3,
            "string" => "The pairing grant cannot be signed: _data/.auth/ is not writable."
        );
    }

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Pairing grant",
        "response" => array(
            "token"  => ftPairingGrantMake($secret, time(), FT_PAIRING_GRANT_TTL),
            "ttl"    => FT_PAIRING_GRANT_TTL,
            "cookie" => array(
                "name" => ftPairingCookieName(),
                "path" => ftPairingCookiePath()
            )
        )
    );

}

?>
