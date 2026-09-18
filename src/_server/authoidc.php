<?php
/**
 * OpenID Connect, as a relying party.
 *
 * The second provider, and the one that tests whether the seam was drawn in the
 * right place: nothing in user.php, sso.php or any client module knows this
 * file exists. It answers the same three questions the token bridge answers,
 * and the session it produces is established by the same ftExternalLoginEstablish().
 *
 * Where the token bridge is handed a credential, this one has to go and get it:
 * beginLogin() sends the browser to the provider, handleCallback() exchanges the
 * code it comes back with. That is the whole reason beginLogin() exists on the
 * interface.
 *
 * Authorization Code with PKCE, which is what the current OAuth security BCP
 * says to use even for a confidential client like this one — the code is
 * useless to anyone who intercepts it without the verifier that never left this
 * server.
 *
 * Configured across the two files the seam already uses. The public half goes
 * in _data/config.json, where the browser can read it:
 *
 *     "externalAuth": {
 *         "mode": "interactive",
 *         "provider": "oidc",
 *         "providerId": "keycloak",
 *         "label": "University Login",
 *         "canLogout": true
 *     }
 *
 * and the half that must not be public in _data/.auth/config.php, which is PHP
 * and is therefore executed rather than served:
 *
 *     <?php return array(
 *         "issuer"       => "https://sso.university.example/realms/main",
 *         "clientId"     => "frametrail",
 *         "clientSecret" => "…",
 *         "redirectUri"  => "https://video.university.example/_server/sso.php?a=callback",
 *         "scope"        => "openid profile email",
 *         // Optional: which claim, and which membership in it, means admin.
 *         // Without both, everyone is a user — the safe way to be wrong.
 *         "adminClaim"   => "groups",
 *         "adminValue"   => "video-admins"
 *     );
 *
 * Nothing else is needed: the endpoints and signing keys come from the
 * provider's own discovery document.
 */

class ftAuthProviderOidc implements AuthProvider {

    private $config;
    protected $discovered = null;

    public function __construct($config) {
        $this->config = is_array($config) ? $config : array();
    }

    private function get($key, $default = null) {
        return isset($this->config[$key]) ? $this->config[$key] : $default;
    }

    private function fail($message) {
        return array("status" => "fail", "string" => $message);
    }


    public function name() {
        $name = (string)$this->get("providerId", "oidc");

        return preg_match('/^[a-z0-9_-]{1,32}$/', $name) ? $name : "oidc";
    }


    /** Always: entering this provider is the only way it is ever used. */
    public function supportsInteractiveLogin() {
        return true;
    }


    /**
     * Send the browser to the provider.
     *
     * state, nonce and the PKCE verifier are minted here and kept in the PHP
     * session, which is the one place the browser cannot reach and the attacker
     * cannot set. They are what tie the response that comes back to the request
     * that went out; without them a callback is just a URL anyone can visit.
     */
    public function beginLogin($req, $ctx) {

        $meta = $this->discover();

        if (!$meta || empty($meta["authorization_endpoint"])) {
            return array("action" => "fail", "string" => "The sign-in provider could not be reached.");
        }

        $verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');

        $_SESSION["ohv_oidc"] = array(
            "state"    => bin2hex(random_bytes(16)),
            "nonce"    => bin2hex(random_bytes(16)),
            "verifier" => $verifier,
            "next"     => isset($ctx["next"]) ? $ctx["next"] : null,
            "at"       => time(),
        );

        $query = http_build_query(array(
            "response_type"         => "code",
            "client_id"             => (string)$this->get("clientId", ""),
            "redirect_uri"          => $this->redirectUri($ctx),
            "scope"                 => (string)$this->get("scope", "openid profile email"),
            "state"                 => $_SESSION["ohv_oidc"]["state"],
            "nonce"                 => $_SESSION["ohv_oidc"]["nonce"],
            "code_challenge"        => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            "code_challenge_method" => "S256",
        ));

        return array("action" => "redirect", "url" => $meta["authorization_endpoint"] . "?" . $query);

    }


    public function logoutUrl($ctx) {

        $meta = $this->discover();

        if (!$meta || empty($meta["end_session_endpoint"])) {
            return (string)$this->get("logoutUrl", "") ?: null;
        }

        return $meta["end_session_endpoint"];

    }


    /**
     * Turn the callback into an identity.
     *
     * Order matters: the request is tied back to ours before anything in it is
     * used, the code is exchanged over a back channel the browser never sees,
     * and only the id_token's *signature* makes its claims worth reading.
     */
    public function handleCallback($req, $ctx) {

        $session = isset($_SESSION["ohv_oidc"]) ? $_SESSION["ohv_oidc"] : null;
        unset($_SESSION["ohv_oidc"]);   // one callback per authorization, always

        if (!$session) {
            return $this->fail("This sign-in did not start here. Please try again.");
        }

        if ((time() - (int)$session["at"]) > 600) {
            return $this->fail("This sign-in took too long. Please try again.");
        }

        if (!empty($req["error"])) {
            return $this->fail("The sign-in provider refused: " . preg_replace('/[^A-Za-z0-9 _-]/', '', (string)$req["error"]));
        }

        // The whole of the CSRF defence for the callback.
        if (empty($req["state"]) || !hash_equals((string)$session["state"], (string)$req["state"])) {
            return $this->fail("This sign-in could not be matched to a request from this browser.");
        }

        if (empty($req["code"])) {
            return $this->fail("The sign-in provider returned no authorization code.");
        }

        $meta = $this->discover();

        if (!$meta || empty($meta["token_endpoint"])) {
            return $this->fail("The sign-in provider could not be reached.");
        }

        $tokens = $this->exchange($meta["token_endpoint"], (string)$req["code"], $session["verifier"], $ctx);

        if (!$tokens || empty($tokens["id_token"])) {
            return $this->fail("The sign-in provider did not return an identity token.");
        }

        try {
            $claims = $this->verifyIdToken($tokens["id_token"], $meta);
        } catch (ftJwsException $e) {
            return $this->fail("Identity token rejected: " . $e->getMessage());
        }

        // Binds the token to the request that asked for it, so one captured from
        // another sign-in cannot be replayed into this one.
        if (empty($claims["nonce"]) || !hash_equals((string)$session["nonce"], (string)$claims["nonce"])) {
            return $this->fail("The identity token belongs to a different sign-in.");
        }

        $identity = ftNormalizeIdentity(array(
            "provider" => $this->name(),
            "sub"      => isset($claims["sub"]) ? $claims["sub"] : '',
            "name"     => $this->displayName($claims),
            "mail"     => isset($claims["email"]) ? $claims["email"] : '',
            "role"     => $this->role($claims),
            "avatar"   => isset($claims["picture"]) ? $claims["picture"] : '',
            "active"   => 1,
        ));

        if ($identity === null) {
            return $this->fail("The identity token does not describe a usable identity.");
        }

        return array(
            "status"   => "success",
            "identity" => $identity,
            "next"     => isset($session["next"]) ? $session["next"] : null,
        );

    }


    /**
     * Which FrameTrail role this person holds.
     *
     * A provider's groups are its own vocabulary, so the mapping is configured
     * rather than guessed: `adminClaim` names the claim to read and `adminValue`
     * the membership that means admin. Absent that, everyone is a user — the
     * safe direction to be wrong in.
     */
    private function role($claims) {

        $claim = (string)$this->get("adminClaim", "");
        $value = (string)$this->get("adminValue", "");

        if ($claim === '' || $value === '' || !isset($claims[$claim])) {
            return 'user';
        }

        $held = is_array($claims[$claim]) ? $claims[$claim] : array($claims[$claim]);

        foreach ($held as $one) {
            if (is_string($one) && hash_equals($value, $one)) {
                return 'admin';
            }
        }

        return 'user';

    }


    private function displayName($claims) {

        foreach (array("name", "preferred_username", "nickname", "email") as $key) {
            if (!empty($claims[$key]) && is_string($claims[$key])) {
                return $claims[$key];
            }
        }

        return isset($claims["sub"]) ? (string)$claims["sub"] : '';

    }


    /**
     * Verify the id_token: signature first, then who it is for.
     *
     * The key is chosen by the header's `kid` from the provider's published set;
     * the allowlist of algorithms is ours, not the token's, which is what keeps
     * a token from choosing how it gets checked.
     */
    private function verifyIdToken($idToken, $meta) {

        $header = ftJwsHeader($idToken);
        $algs   = $this->get("algs", array("RS256"));
        $jwks   = $this->fetchJson($meta["jwks_uri"], "jwks");

        if (!$jwks || empty($jwks["keys"])) {
            throw new ftJwsException("The provider published no signing keys");
        }

        $kid = isset($header["kid"]) ? $header["kid"] : null;
        $pem = null;

        foreach ($jwks["keys"] as $jwk) {
            if ($kid === null || (isset($jwk["kid"]) && $jwk["kid"] === $kid)) {
                $pem = ftJwkToPem($jwk);
                break;
            }
        }

        if ($pem === null) {
            throw new ftJwsException("No published key matches this token");
        }

        $claims = ftJwsVerify($idToken, $algs, array("RS256" => $pem));

        if (!isset($claims["iss"]) || !hash_equals((string)$meta["issuer"], (string)$claims["iss"])) {
            throw new ftJwsException("Issued by someone else");
        }

        $audience = (string)$this->get("clientId", "");
        $aud = isset($claims["aud"]) ? (is_array($claims["aud"]) ? $claims["aud"] : array($claims["aud"])) : array();

        $matched = false;
        foreach ($aud as $one) {
            if (is_string($one) && hash_equals($audience, $one)) {
                $matched = true;
            }
        }

        if (!$matched) {
            throw new ftJwsException("Issued for a different application");
        }

        if (!isset($claims["exp"]) || (int)$claims["exp"] <= (time() - 60)) {
            throw new ftJwsException("Expired");
        }

        return $claims;

    }


    /** The back-channel code exchange. The client secret never reaches the browser. */
    protected function exchange($endpoint, $code, $verifier, $ctx) {

        $body = http_build_query(array(
            "grant_type"    => "authorization_code",
            "code"          => $code,
            "redirect_uri"  => $this->redirectUri($ctx),
            "client_id"     => (string)$this->get("clientId", ""),
            "client_secret" => (string)$this->get("clientSecret", ""),
            "code_verifier" => $verifier,
        ));

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER     => array("Accept: application/json"),
        ));

        $response = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $code !== 200) {
            return null;
        }

        $decoded = json_decode($response, true);

        return is_array($decoded) ? $decoded : null;

    }


    /**
     * The provider's own description of itself.
     *
     * Cached, because it changes about never and every sign-in would otherwise
     * begin with two extra round trips.
     */
    protected function discover() {

        if ($this->discovered !== null) {
            return $this->discovered;
        }

        $issuer = rtrim((string)$this->get("issuer", ""), '/');

        if ($issuer === '') {
            return $this->discovered = false;
        }

        $meta = $this->fetchJson($issuer . "/.well-known/openid-configuration", "discovery");

        // A provider that names a different issuer than the one configured is
        // either misconfigured or not the provider we meant to talk to.
        if (!$meta || empty($meta["issuer"]) || !hash_equals($issuer, rtrim((string)$meta["issuer"], '/'))) {
            return $this->discovered = false;
        }

        return $this->discovered = $meta;

    }


    /** Fetch and cache a JSON document under _data/.auth. */
    protected function fetchJson($url, $slot) {

        global $conf;

        $path = ftAuthStateDir() . "/" . preg_replace('/[^a-z]/', '', $slot) . ".json";
        $ttl  = (int)$this->get("cacheSeconds", 21600);

        if (file_exists($path) && (time() - filemtime($path)) < $ttl) {
            $cached = json_decode(file_get_contents($path), true);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER     => array("Accept: application/json"),
        ));

        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            // Serve a stale copy rather than locking everyone out because the
            // provider's metadata endpoint had a bad minute.
            if (file_exists($path)) {
                $stale = json_decode(file_get_contents($path), true);
                if (is_array($stale)) {
                    return $stale;
                }
            }

            return null;
        }

        $decoded = json_decode($response, true);

        if (!is_array($decoded)) {
            return null;
        }

        if (!is_dir(dirname($path))) {
            @mkdir(dirname($path), 0700, true);
        }

        @file_put_contents($path, json_encode($decoded));

        return $decoded;

    }


    /**
     * Where the provider sends the browser back.
     *
     * Registered with the provider, so it is configured rather than derived from
     * the request — a redirect_uri built from a Host header is one the request
     * itself gets to choose.
     */
    private function redirectUri($ctx) {

        $configured = (string)$this->get("redirectUri", "");

        if ($configured !== '') {
            return $configured;
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host   = isset($ctx["origin"]) ? $ctx["origin"] : '';
        $script = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/_server/sso.php';

        return $scheme . '://' . $host . $script . '?a=callback';

    }

}

?>
