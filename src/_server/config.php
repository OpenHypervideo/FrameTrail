<?php
error_reporting(E_ALL ^ E_NOTICE ^ E_WARNING);
ini_set('display_errors', '0');

$_isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
         || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => $_isHttps,
]);

// Scope the cookie's *name* to this host, not just its domain. A cookie set for
// a parent domain is sent to every subdomain under it, and PHP takes the first
// value it sees — so on a platform that gives each project its own subdomain,
// one project could otherwise plant a session id that another one adopts. The
// name is derived, not configured, so nothing has to be kept in sync.
// Note: this invalidates sessions in flight at upgrade time; people are asked
// to sign in once more, and nothing else changes.
session_name('FTSESS' . substr(sha1(isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost'), 0, 8));

session_start();

// Directories — default data path (sibling of _server/)
$conf["dir"]["data"] = "../_data";

// Allow the client to specify a custom data directory via the `dataPath` request parameter.
// The resolved path must be within the server root (parent of _server/) to prevent
// directory traversal. This is the sandbox boundary.
$_serverRoot = realpath(dirname(__DIR__));  // parent of _server/, e.g. src/

$_dataPathInput = !empty($_REQUEST["dataPath"]) ? $_REQUEST["dataPath"] : null;

if ($_dataPathInput !== null && $_serverRoot !== false) {
    // The client sends an absolute URL path (e.g. /_data-examples/hirmeos/_data/).
    // Map it to a filesystem path via DOCUMENT_ROOT.
    $_docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : dirname(__DIR__);
    $_candidate = realpath($_docRoot . '/' . $_dataPathInput);

    if ($_candidate !== false
        && is_dir($_candidate)
        && strpos($_candidate, $_serverRoot) === 0   // must be within sandbox
        && file_exists($_candidate . '/config.json')  // must be a valid data dir
    ) {
        $conf["dir"]["data"] = $_candidate;
    }
}

// JSON response flags
$conf["settings"]["json_flags"] = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

// Server config
$conf["server"]["session_lifetime"] = ini_get('session.gc_maxlifetime');
//$conf["server"]["session_lifetime"] = 40;

require_once("functions.incl.php");
require_once(__DIR__ . "/auth.php");
require_once(__DIR__ . "/externalsettings.php");

// One chokepoint, before anything has read $_SESSION. Every entry point comes
// through this file — the ajax dispatcher, the gated _data reader, the sign-in
// landing — so putting the check here is what makes it impossible to add an
// endpoint that forgets it. requireLogin() and userCheckLogin() inherit it and
// deliberately do not repeat it; userGet() and userChange() read the session
// directly, so a check in requireLogin() alone would have missed them.
//
// It has to come after the block above: the bound and the cookie name are read
// from the config.json in $conf["dir"]["data"], which the dataPath override
// just finished deciding.
ftExternalSessionEnforce();

?>