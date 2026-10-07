<?php

/**
 * extension.php — the router for server extensions' routes.
 *
 *     _server/extension.php?e=<name>&r=<route>[&dataPath=…]
 *
 * Actions answer in ajaxServer.php's shape (JSON, HTTP 200, a code inside).
 * Routes are for what that shape cannot do: their own content type, HTTP
 * status codes and methods, a JSON-RPC endpoint, server-sent events. The
 * handler writes its own answer; if it returns an array instead, that is sent
 * as JSON.
 *
 * Same bootstrap as ajaxServer.php (config.php): the data directory from
 * dataPath, the session, or the user of a personal API token sent as
 * "Authorization: Bearer ft_…". A route that streams should call
 * session_write_close() once it knows who is asking: PHP locks a session file
 * for as long as a request holds it, so an open stream would hold up the same
 * person's heartbeat and saves.
 *
 * See docs/EXTENDING.md, "Server Extensions".
 */

require_once("./config.php");
require_once("./extensionloader.php");

/**
 * I answer with a JSON failure and an HTTP status, and stop.
 *
 * @param int    $status
 * @param string $message
 */
function ftExtensionRouteFail($status, $message, $answer = null) {
    global $conf;
    http_response_code($status);
    header("Content-Type: application/json");
    echo json_encode($answer !== null ? $answer : array(
        "status" => "fail",
        "code"   => $status,
        "string" => $message
    ), $conf["settings"]["json_flags"]);
    exit;
}

header("Cache-Control: no-cache, must-revalidate");
header("X-Content-Type-Options: nosniff");

$name  = isset($_GET["e"]) ? (string)$_GET["e"] : "";
$route = isset($_GET["r"]) ? (string)$_GET["r"] : "";

$manifest = ftIsExtensionName($name) ? ftExtensionManifest($name) : null;

if ($manifest === null) {
    ftExtensionRouteFail(404, "No such extension.");
}

if (!isset($manifest["routes"][$route]) && $manifest["error"] === null) {
    ftExtensionRouteFail(404, "No such route.");
}

$result = ftExtensionCall($manifest, isset($manifest["routes"][$route]) ? $manifest["routes"][$route] : null);

if (!$result["ok"]) {
    ftExtensionRouteFail($result["status"], "", $result["answer"]);
}

if (is_array($result["value"])) {
    if (!headers_sent()) {
        header("Content-Type: application/json");
    }
    echo json_encode($result["value"], $conf["settings"]["json_flags"]);
}

?>
