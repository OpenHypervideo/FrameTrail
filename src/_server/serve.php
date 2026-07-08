<?php
/**
 * serve.php — request-time read gate for the _data directory.
 *
 * This endpoint is only reached on Apache+PHP installs when the app-root
 * .htaccess contains the "FrameTrail Private" rewrite block, which is added
 * whenever config.alwaysForceLogin is true (see ftSyncPrivacyRules() in
 * functions.incl.php). It routes _data/** requests through PHP so they can be
 * gated behind a valid FrameTrail session.
 *
 * When the instance is private, an unauthenticated request returns 403.
 * When authenticated, the requested file is streamed with the correct
 * Content-Type and full HTTP Range support (206 Partial Content) so media
 * seeking keeps working.
 *
 * Robustness: if the rewrite is stale (still present although the instance was
 * switched back to public), the file is served without requiring a session so
 * a now-public instance never fails closed. users.json is never served.
 */

require_once("./config.php");
require_once("./user.php");

/**
 * Emit an HTTP error status and a minimal plain-text body, then stop.
 * @param int    $code
 * @param string $message
 */
function serveError($code, $message) {
    http_response_code($code);
    header("Content-Type: text/plain; charset=utf-8");
    echo $code . " " . $message;
    exit;
}

// Determine privacy from config.json (filesystem read — never gated).
$configFile = $conf["dir"]["data"] . "/config.json";
$isPrivate  = false;
if (file_exists($configFile)) {
    $cfg = json_decode(file_get_contents($configFile), true);
    $isPrivate = isset($cfg["alwaysForceLogin"]) && $cfg["alwaysForceLogin"] === true;
}

// When private, require a valid session. (When public, this endpoint may still
// be reached via a stale rewrite — serve normally so we never fail closed.)
if ($isPrivate) {
    $login = userCheckLogin();
    if ($login["code"] != 1) {
        serveError(403, "Forbidden");
    }
}

// Resolve the requested path safely within the data directory.
$requested = isset($_GET["file"]) ? (string) $_GET["file"] : "";
$requested = str_replace("\0", "", $requested); // strip null bytes

if ($requested === "" || strpos($requested, "..") !== false) {
    serveError(404, "Not Found");
}

$dataRoot = realpath($conf["dir"]["data"]);
$target   = realpath($dataRoot . "/" . $requested);

if ($dataRoot === false
    || $target === false
    || strpos($target, $dataRoot . DIRECTORY_SEPARATOR) !== 0) {
    serveError(404, "Not Found");
}

if (!is_file($target)) {
    serveError(404, "Not Found");
}

$basename = basename($target);

// Never serve the user database, any dotfile (e.g. .htaccess), or PHP.
if ($basename === "users.json"
    || $basename === ""
    || $basename[0] === "."
    || preg_match('/\.php$/i', $basename)) {
    serveError(403, "Forbidden");
}

// Extension allowlist (maps to Content-Type).
$allowed = array(
    "json" => "application/json",
    "css"  => "text/css",
    "vtt"  => "text/vtt",
    "mp4"  => "video/mp4",
    "m4v"  => "video/x-m4v",
    "webm" => "video/webm",
    "ogg"  => "video/ogg",
    "ogv"  => "video/ogg",
    "ogm"  => "video/ogg",
    "weba" => "audio/webm",
    "mp3"  => "audio/mpeg",
    "wav"  => "audio/wav",
    "m4a"  => "audio/mp4",
    "aac"  => "audio/aac",
    "m3u8" => "application/vnd.apple.mpegurl",
    "ts"   => "video/mp2t",
    "png"  => "image/png",
    "jpg"  => "image/jpeg",
    "jpeg" => "image/jpeg",
    "gif"  => "image/gif",
    "webp" => "image/webp",
    "pdf"  => "application/pdf",
);

$ext = strtolower(pathinfo($target, PATHINFO_EXTENSION));
if (!isset($allowed[$ext])) {
    serveError(403, "Forbidden");
}

$contentType = $allowed[$ext];
$filesize    = filesize($target);

// Prevent PHP output buffering from holding the whole file in memory.
while (ob_get_level() > 0) { ob_end_clean(); }

header("Content-Type: " . $contentType);
header("Accept-Ranges: bytes");
header("Cache-Control: private, max-age=0, must-revalidate");

// HTTP Range handling for media seeking.
$start   = 0;
$end     = $filesize - 1;
$isRange = false;

if (isset($_SERVER["HTTP_RANGE"])
    && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER["HTTP_RANGE"], $m)) {

    $isRange = true;

    if ($m[1] === "" && $m[2] !== "") {
        // Suffix range: last N bytes.
        $start = max(0, $filesize - intval($m[2]));
        $end   = $filesize - 1;
    } else {
        if ($m[1] !== "") { $start = intval($m[1]); }
        if ($m[2] !== "") { $end   = intval($m[2]); }
    }

    $end = min($end, $filesize - 1);

    if ($start > $end || $start >= $filesize) {
        http_response_code(416);
        header("Content-Range: bytes */" . $filesize);
        exit;
    }
}

$length = $end - $start + 1;

if ($isRange) {
    http_response_code(206);
    header("Content-Range: bytes " . $start . "-" . $end . "/" . $filesize);
}
header("Content-Length: " . $length);

// Stream the (possibly partial) file in chunks.
$fp = fopen($target, "rb");
if ($fp === false) {
    serveError(500, "Internal Server Error");
}

fseek($fp, $start);
$bufferSize     = 8192;
$bytesRemaining = $length;

while ($bytesRemaining > 0 && !feof($fp)) {
    $readSize = ($bytesRemaining > $bufferSize) ? $bufferSize : $bytesRemaining;
    $data     = fread($fp, $readSize);
    if ($data === false) { break; }
    echo $data;
    flush();
    $bytesRemaining -= strlen($data);
}

fclose($fp);
exit;
