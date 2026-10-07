<?php

/*
 * The server part of Hello: one action and one route. See docs/EXTENDING.md,
 * "Server Extensions".
 *
 * Installing it: copy this folder to _server/extensions/hello/ in the
 * FrameTrail code tree. The entry in _data/config.json → extensions that loads
 * Hello's browser part switches this part on too.
 *
 * - Action helloPing, through ajaxServer.php like FrameTrail's own actions:
 *   answers with the greeting from the entry's settings, who asked, and how
 *   often it has been asked, counted in Hello's private storage
 *   (_data/.extensions/hello/).
 *
 *       curl -d a=helloPing https://example.org/frametrail/_server/ajaxServer.php
 *
 * - Route whoami, through extension.php, answering in plain text: says who is
 *   asking, and whether by session or by personal API token.
 *
 *       curl -H "Authorization: Bearer ft_…" \
 *            "https://example.org/frametrail/_server/extension.php?e=hello&r=whoami"
 */

// Only ever run by FrameTrail's routers, which load this file to read what it
// returns. A web server that would run it on its own (PHP's built-in server
// has no .htaccess) finds nothing to do.
if (!function_exists("ftExtensionStorage")) {
    http_response_code(404);
    exit;
}


/**
 * @param Array $ext  array("name" => "hello", "settings" => …)
 * @return Array      the answer, sent as JSON like any action's
 */
function ftHelloPing($ext) {

    $greeting = (isset($ext["settings"]["greeting"]) && is_string($ext["settings"]["greeting"]))
              ? $ext["settings"]["greeting"]
              : "Hello";

    $login = userCheckLogin();
    $user  = ($login["code"] == 1) ? $login["response"]["name"] : null;

    $pings = 0;
    $dir   = ftExtensionStorage($ext["name"]);

    if ($dir !== false) {
        $handle = fopen($dir . "/pings.txt", "c+");
        if ($handle !== false) {
            flock($handle, LOCK_EX);
            $pings = (int)stream_get_contents($handle) + 1;
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, (string)$pings);
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Pong",
        "response" => array(
            "greeting" => $greeting,
            "user"     => $user,
            "pings"    => $pings
        )
    );

}


/**
 * @param Array $ext
 * @return null  the route writes its own answer
 */
function ftHelloWhoami($ext) {

    header("Content-Type: text/plain; charset=utf-8");

    $login = userCheckLogin();

    if ($login["code"] != 1) {
        http_response_code(401);
        echo "Nobody I know.\n";
        return null;
    }

    echo "You are " . $login["response"]["name"] . ", here by "
       . (ftIsBearerRequest() ? "personal API token" : "session") . ".\n";

    return null;

}


return array(
    "actions"  => array("helloPing" => "ftHelloPing"),
    "routes"   => array("whoami"    => "ftHelloWhoami"),
    "requires" => array("json")
);
