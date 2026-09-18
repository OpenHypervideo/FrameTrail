<?php
/**
 * The signed-token provider: a platform that already knows who the visitor is
 * hands FrameTrail a short-lived assertion saying so.
 *
 * The token is a compact JWS, and the shipping configuration signs it with
 * Ed25519 rather than an HMAC. That choice is worth stating, because it is the
 * reason this whole feature stores no secret: with a shared key, an accidental
 * exposure of config.json, a data export, or a web server that serves _data
 * statically would each be enough to forge any identity on the instance —
 * including an admin. With a public key there is simply nothing there to steal.
 * HS256 remains available for a self-hosted platform that wants it, and only
 * then does .auth/config.php hold anything worth protecting.
 *
 * Nothing here is specific to any one platform. A second host speaks the same
 * protocol by configuring its own issuer, audience and key.
 */


class ftAuthProviderToken implements AuthProvider {

    private $config;

    public function __construct($config) {
        $this->config = is_array($config) ? $config : array();
    }

    private function get($key, $default = null) {
        return isset($this->config[$key]) ? $this->config[$key] : $default;
    }

    private function fail($message) {
        return array("status" => "fail", "string" => $message);
    }


    /**
     * The tag stored on every principal this provider creates. It namespaces
     * the subject, so two providers on one instance can never collide.
     */
    public function name() {
        $name = (string)$this->get("providerId", "token");
        return preg_match('/^[a-z0-9_-]{1,32}$/', $name) ? $name : "token";
    }


    public function supportsInteractiveLogin() {
        return (string)$this->get("loginUrl", "") !== "";
    }


    /**
     * Entering this provider from inside FrameTrail means going back to the
     * platform and asking it to mint a token. There is nothing to negotiate —
     * no state, no PKCE — because the credential is minted, not exchanged.
     */
    public function beginLogin($req, $ctx) {

        $loginUrl = (string)$this->get("loginUrl", "");

        if ($loginUrl === "") {
            return array("action" => "none");
        }

        if (!empty($ctx["next"])) {
            $loginUrl .= (strpos($loginUrl, '?') === false ? '?' : '&')
                       . 'next=' . rawurlencode($ctx["next"]);
        }

        return array("action" => "redirect", "url" => $loginUrl);

    }


    public function logoutUrl($ctx) {
        $url = (string)$this->get("logoutUrl", "");
        return ($url === "") ? null : $url;
    }


    /**
     * I validate the assertion and return a normalized identity.
     *
     * Order matters and is deliberate: signature first, so nothing
     * attacker-controlled is interpreted before we know who wrote it; then the
     * claims that decide whether this token was meant for *us*; then freshness;
     * then one-time use. The identity is built last, from claims that have
     * already survived all of it.
     */
    public function handleCallback($req, $ctx) {

        $token = isset($req["token"]) ? $req["token"] : '';

        if (!is_string($token) || $token === '') {
            return $this->fail("No token supplied.");
        }

        // RS256 rather than EdDSA as the default, for availability rather than
        // preference: openssl is present in essentially every PHP build, while
        // libsodium — although bundled since 7.2 — is absent from plenty of
        // stock Apache builds. Both are asymmetric, so the property that matters
        // here, that FrameTrail holds no forgeable key, is the same either way.
        $algs = $this->get("algs", array("RS256"));
        if (!is_array($algs) || !count($algs)) {
            return $this->fail("No signature algorithm configured.");
        }

        $usable = array_intersect($algs, ftJwsSupportedAlgs());
        if (!count($usable)) {
            return $this->fail("This server cannot verify " . implode("/", $algs)
                . ". Available here: " . implode(", ", ftJwsSupportedAlgs()) . ".");
        }

        $keys = array();
        if ((string)$this->get("publicKey", "") !== "") {
            $keys["EdDSA"] = $this->get("publicKey");
            $keys["RS256"] = $this->get("publicKey");
        }
        if ((string)$this->get("hmacSecret", "") !== "") {
            $keys["HS256"] = $this->get("hmacSecret");
        }

        try {
            $claims = ftJwsVerify($token, $algs, $keys);
        } catch (ftJwsException $e) {
            return $this->fail("Token rejected: " . $e->getMessage());
        }

        $issuer = (string)$this->get("issuer", "");
        if ($issuer === "" || !isset($claims["iss"]) || !hash_equals($issuer, (string)$claims["iss"])) {
            return $this->fail("Token was not issued by the configured platform.");
        }

        // Compared against the *configured* audience, never against the request's
        // Host header: the latter is attacker-controlled, and trusting it would
        // let a token minted for one project be replayed at another.
        $audience = (string)$this->get("audience", "");
        if ($audience === "" || !$this->audienceMatches($claims, $audience)) {
            return $this->fail("Token was not issued for this instance.");
        }

        $now    = time();
        $skew   = (int)$this->get("skewSeconds", 60);
        $maxAge = (int)$this->get("maxAgeSeconds", 120);

        if (!isset($claims["exp"]) || !is_numeric($claims["exp"]) || (int)$claims["exp"] <= ($now - $skew)) {
            return $this->fail("Token has expired.");
        }
        if (isset($claims["nbf"]) && is_numeric($claims["nbf"]) && (int)$claims["nbf"] > ($now + $skew)) {
            return $this->fail("Token is not valid yet.");
        }
        if (!isset($claims["iat"]) || !is_numeric($claims["iat"])) {
            return $this->fail("Token has no issue time.");
        }
        if ((int)$claims["iat"] > ($now + $skew)) {
            return $this->fail("Token is not valid yet.");
        }
        // A token minted with a generous lifetime is refused even though its own
        // exp has not passed: how long a credential may live is our policy, not
        // the issuer's.
        if (((int)$claims["exp"] - (int)$claims["iat"]) > $maxAge) {
            return $this->fail("Token lifetime exceeds the configured maximum.");
        }

        if (!isset($claims["jti"]) || !ftReplayClaim($claims["jti"], (int)$claims["exp"])) {
            return $this->fail("Token has already been used.");
        }

        $identity = ftNormalizeIdentity(array(
            "provider" => $this->name(),
            "sub"      => isset($claims["sub"]) ? $claims["sub"] : '',
            "name"     => isset($claims["name"]) ? $claims["name"] : '',
            "mail"     => isset($claims["email"]) ? $claims["email"] : '',
            "role"     => isset($claims["ft_role"]) ? $claims["ft_role"] : 'user',
            "color"    => isset($claims["color"]) ? $claims["color"] : '',
            "avatar"   => isset($claims["picture"]) ? $claims["picture"] : '',
            "active"   => isset($claims["active"]) ? $claims["active"] : 1
        ));

        if ($identity === null) {
            return $this->fail("Token does not describe a usable identity.");
        }

        $next = isset($claims["next"]) ? ftSafeNext($claims["next"]) : null;
        if ($next === null && !empty($ctx["next"])) {
            $next = $ctx["next"];
        }

        return array("status" => "success", "identity" => $identity, "next" => $next);

    }


    /**
     * `aud` may be a string or, per RFC 7519, an array of strings.
     */
    private function audienceMatches($claims, $audience) {

        if (!isset($claims["aud"])) {
            return false;
        }

        $aud = is_array($claims["aud"]) ? $claims["aud"] : array($claims["aud"]);

        foreach ($aud as $candidate) {
            if (is_string($candidate) && hash_equals($audience, $candidate)) {
                return true;
            }
        }

        return false;

    }

}

?>
