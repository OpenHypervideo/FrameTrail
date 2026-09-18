<?php
/**
 * Compact JWS (JSON Web Signature) verification, without a library.
 *
 * FrameTrail has no composer and no autoloader, so this is hand-rolled — but it
 * is deliberately a *JWS* implementation rather than an ad-hoc signed envelope,
 * because the two protocols we expect to support next are both JWS: an OIDC
 * id_token and an LTI 1.3 launch are compact JWS documents. Writing a bespoke
 * format now would mean writing this file anyway, later, with a second format
 * to keep alive beside it.
 *
 * Only verification lives here. FrameTrail never mints a token — it is always
 * the relying party — so there is no signing code to get wrong.
 */


class ftJwsException extends Exception {}


/**
 * I report which signature algorithms this PHP build can actually verify.
 *
 * Worth asking rather than assuming: libsodium is bundled with PHP from 7.2,
 * but bundled is not the same as compiled in, and a stock Apache build can
 * perfectly well have openssl and no sodium — which makes EdDSA unverifiable on
 * a host that looks entirely modern. A platform provisioning an instance should
 * choose its signing algorithm from this list rather than from a version number.
 *
 * @method ftJwsSupportedAlgs
 * @return Array
 */
function ftJwsSupportedAlgs() {

    $algs = array();

    if (function_exists('openssl_verify')) {
        $algs[] = 'RS256';
    }
    if (function_exists('sodium_crypto_sign_verify_detached')) {
        $algs[] = 'EdDSA';
    }

    $algs[] = 'HS256';

    return $algs;

}


/**
 * The 12-byte DER SubjectPublicKeyInfo prefix that wraps a raw Ed25519 key.
 * A platform may hand us either shape; see ftJwsEd25519RawKey().
 */
define('FT_JWS_ED25519_SPKI_PREFIX', "\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00");


/**
 * I decode base64url strictly.
 *
 * Strictly matters: PHP's base64_decode() in non-strict mode silently skips
 * characters it does not recognise, which would let a token be mutated without
 * changing what we decode. A signature check over the *encoded* bytes is only
 * meaningful if the encoding is unambiguous.
 *
 * @method ftJwsB64uDecode
 * @param {String} $input
 * @return String
 */
function ftJwsB64uDecode($input) {

    if (!is_string($input) || $input === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $input)) {
        throw new ftJwsException("Malformed base64url segment");
    }

    $b64 = strtr($input, '-_', '+/');
    $pad = strlen($b64) % 4;
    if ($pad === 1) {
        throw new ftJwsException("Malformed base64url segment");
    }
    if ($pad > 0) {
        $b64 .= str_repeat('=', 4 - $pad);
    }

    $decoded = base64_decode($b64, true);
    if ($decoded === false) {
        throw new ftJwsException("Malformed base64url segment");
    }

    return $decoded;

}


/**
 * I turn whatever shape of Ed25519 public key the config carries into the raw
 * 32 bytes libsodium wants — either a bare base64 key or a base64 DER
 * SubjectPublicKeyInfo, which is what `openssl pkey -pubout` emits and
 * therefore what most platforms will paste in.
 *
 * @method ftJwsEd25519RawKey
 * @param {String} $key
 * @return String  32 raw bytes
 */
function ftJwsEd25519RawKey($key) {

    $key = trim((string)$key);

    // Tolerate a full PEM block.
    if (strpos($key, '-----BEGIN') !== false) {
        $key = preg_replace('/-----(BEGIN|END)[^-]*-----/', '', $key);
    }

    $raw = base64_decode(preg_replace('/\s+/', '', $key), true);
    if ($raw === false) {
        throw new ftJwsException("Ed25519 key is not valid base64");
    }

    if (strlen($raw) === 44 && strncmp($raw, FT_JWS_ED25519_SPKI_PREFIX, 12) === 0) {
        $raw = substr($raw, 12);
    }

    if (strlen($raw) !== 32) {
        throw new ftJwsException("Ed25519 key must be 32 bytes, got " . strlen($raw));
    }

    return $raw;

}


/**
 * I return a compact JWS's header without verifying anything.
 *
 * Needed because a key sometimes has to be chosen before the signature can be
 * checked: a provider publishes several and the header's `kid` says which one
 * signed this token. Nothing in here may be trusted — it is the untrusted half
 * of an unverified document, and is only ever used to *look up* a key, never to
 * decide whether one is acceptable.
 *
 * @method ftJwsHeader
 * @param {String} $jws
 * @return Array
 */
function ftJwsHeader($jws) {

    $parts = explode('.', (string)$jws);

    if (count($parts) !== 3) {
        throw new ftJwsException("Token is not a compact JWS");
    }

    $header = json_decode(ftJwsB64uDecode($parts[0]), true);

    if (!is_array($header)) {
        throw new ftJwsException("Token header is not a JSON object");
    }

    return $header;

}


/**
 * I turn a JSON Web Key into a PEM public key openssl_verify() can use.
 *
 * OIDC providers publish their signing keys as JWKs, and PHP has no built-in
 * conversion, so the DER is assembled here: an RSA public key is a SEQUENCE of
 * the algorithm identifier and a BIT STRING wrapping a SEQUENCE of the modulus
 * and exponent. Only RSA is handled — every provider signs with RS256 unless
 * told otherwise, and an EC key would silently produce a PEM that never
 * verifies, so an unsupported type says so instead.
 *
 * @method ftJwkToPem
 * @param {Array} $jwk
 * @return String  PEM
 */
function ftJwkToPem($jwk) {

    if (!isset($jwk['kty']) || $jwk['kty'] !== 'RSA' || !isset($jwk['n'], $jwk['e'])) {
        throw new ftJwsException("Only RSA JSON Web Keys are supported");
    }

    $modulus  = ftJwsB64uDecode($jwk['n']);
    $exponent = ftJwsB64uDecode($jwk['e']);

    $der = ftDerSequence(
        ftDerSequence(
            // OID 1.2.840.113549.1.1.1 rsaEncryption, then NULL.
            "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00"
        )
        . ftDerBitString(
            ftDerSequence(ftDerInteger($modulus) . ftDerInteger($exponent))
        )
    );

    return "-----BEGIN PUBLIC KEY-----\n"
         . chunk_split(base64_encode($der), 64, "\n")
         . "-----END PUBLIC KEY-----\n";

}


/** DER length prefix: short form below 128, long form above. */
function ftDerLength($length) {

    if ($length < 128) {
        return chr($length);
    }

    $bytes = '';
    while ($length > 0) {
        $bytes = chr($length & 0xff) . $bytes;
        $length >>= 8;
    }

    return chr(0x80 | strlen($bytes)) . $bytes;

}

function ftDerSequence($contents) {
    return "\x30" . ftDerLength(strlen($contents)) . $contents;
}

function ftDerBitString($contents) {
    // The leading zero is the count of unused bits in the final byte.
    return "\x03" . ftDerLength(strlen($contents) + 1) . "\x00" . $contents;
}

function ftDerInteger($bytes) {

    $bytes = ltrim($bytes, "\x00");

    // DER integers are signed, so a leading bit of 1 would read as negative.
    if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
        $bytes = "\x00" . $bytes;
    }

    return "\x02" . ftDerLength(strlen($bytes)) . $bytes;

}


/**
 * I verify a compact JWS and return its decoded claims.
 *
 * The header's own `alg` is used *only to select* from the caller's allowlist,
 * never to decide what is acceptable. That single rule is the whole of the
 * algorithm-confusion defence, and it is why `none` needs no special case: it
 * is simply never in an allowlist. It is also why an RSA public key can never
 * be pressed into service as an HMAC secret — the caller said which algorithms
 * it would accept before it ever saw the token.
 *
 * @method ftJwsVerify
 * @param {String} $jws
 * @param {Array}  $allowedAlgs  e.g. array("EdDSA")
 * @param {Array}  $keys         alg => key material ("EdDSA" => base64/PEM, "RS256" => PEM, "HS256" => secret)
 * @return Array  the decoded claims
 */
function ftJwsVerify($jws, $allowedAlgs, $keys) {

    if (!is_string($jws) || $jws === '') {
        throw new ftJwsException("Empty token");
    }
    if (strlen($jws) > 8192) {
        throw new ftJwsException("Token too large");
    }
    if (!is_array($allowedAlgs) || !count($allowedAlgs)) {
        throw new ftJwsException("No algorithms allowed by configuration");
    }

    $parts = explode('.', $jws);
    if (count($parts) !== 3) {
        throw new ftJwsException("Token is not a compact JWS");
    }

    $header = json_decode(ftJwsB64uDecode($parts[0]), true);
    if (!is_array($header) || !isset($header["alg"]) || !is_string($header["alg"])) {
        throw new ftJwsException("Token header has no algorithm");
    }

    $alg = $header["alg"];
    if (!in_array($alg, $allowedAlgs, true)) {
        throw new ftJwsException("Algorithm '" . $alg . "' is not allowed by configuration");
    }
    if (!isset($keys[$alg]) || $keys[$alg] === '') {
        throw new ftJwsException("No key configured for algorithm '" . $alg . "'");
    }

    // Signed over the *encoded* segments, exactly as they arrived on the wire.
    $signingInput = $parts[0] . '.' . $parts[1];
    $signature    = ftJwsB64uDecode($parts[2]);
    $key          = $keys[$alg];

    $ok = false;

    if ($alg === 'EdDSA') {

        if (!function_exists('sodium_crypto_sign_verify_detached')) {
            throw new ftJwsException("EdDSA requires libsodium (PHP 7.2+)");
        }
        if (strlen($signature) !== 64) {
            throw new ftJwsException("Ed25519 signature must be 64 bytes");
        }
        $ok = sodium_crypto_sign_verify_detached($signature, $signingInput, ftJwsEd25519RawKey($key));

    } elseif ($alg === 'RS256') {

        if (!function_exists('openssl_verify')) {
            throw new ftJwsException("RS256 requires the openssl extension");
        }
        $ok = (openssl_verify($signingInput, $signature, $key, OPENSSL_ALGO_SHA256) === 1);

    } elseif ($alg === 'HS256') {

        $ok = hash_equals(hash_hmac('sha256', $signingInput, $key, true), $signature);

    } else {

        throw new ftJwsException("Algorithm '" . $alg . "' is not implemented");

    }

    if (!$ok) {
        throw new ftJwsException("Signature verification failed");
    }

    // Deliberately after the signature check: we do not parse attacker-supplied
    // JSON until we know who wrote it.
    $claims = json_decode(ftJwsB64uDecode($parts[1]), true);
    if (!is_array($claims)) {
        throw new ftJwsException("Token payload is not a JSON object");
    }

    return $claims;

}

?>
