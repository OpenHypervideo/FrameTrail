<?php

/**
 * Server extensions: code that is not part of FrameTrail and adds actions and
 * endpoints to its PHP backend without changing any of its files.
 *
 * An extension's server part is a folder _server/extensions/<name>/ whose
 * extension.php returns what it offers:
 *
 *     return array(
 *         "actions"  => array("helloPing" => "ftHelloPing"),  // ajaxServer.php?a=helloPing
 *         "routes"   => array("whoami" => "ftHelloWhoami"),   // extension.php?e=hello&r=whoami
 *         "requires" => array("curl")                         // PHP extensions it needs
 *     );
 *
 * Only extensions named in config.json → extensions are loaded, the same list
 * that switches on their browser part, and only when their folder is there. An
 * entry without a server part is a plain browser extension, not a problem.
 *
 * The web server never runs a PHP file below _server/ directly (.htaccess), so
 * everything goes through ajaxServer.php (actions, answered as JSON like
 * FrameTrail's own) or extension.php (routes, which answer as they like: a
 * JSON-RPC endpoint, a feed, a stream). Both bootstrap through config.php, so a
 * handler finds the data directory, the session and a bearer token's user
 * exactly as FrameTrail's own actions do.
 *
 * Nothing here is ever fatal to FrameTrail: a manifest that does not load, a
 * missing requirement or a handler that throws costs that extension its
 * answer, and is reported to admins in userCheckLogin.
 *
 * A handler gets array("name" => …, "settings" => its config.json entry's
 * settings) and has FrameTrail's server functions at hand: requireLogin() and
 * userCheckLogin(), ftIsBearerRequest(), ftExtensionStorage(),
 * ftExtensionSecrets(), and everything a FrameTrail action can include.
 */

require_once(__DIR__ . "/user.php");


/**
 * I return the names of the extensions config.json switches on, in order,
 * each once. An entry is a name or an object with one; anything else is
 * skipped, as the browser skips it.
 *
 * @method ftExtensionNames
 * @return Array
 */
function ftExtensionNames() {

    global $conf;
    static $cache = null;

    if ($cache !== null) {
        return $cache;
    }

    $cache = array();

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (!file_exists($configFile)) {
        return $cache;
    }

    $json = json_decode(file_get_contents($configFile), true);
    if (!is_array($json) || !isset($json["extensions"]) || !is_array($json["extensions"])) {
        return $cache;
    }

    foreach ($json["extensions"] as $entry) {
        $name = is_string($entry) ? $entry : ((is_array($entry) && isset($entry["name"])) ? $entry["name"] : null);
        if (ftIsExtensionName($name) && !in_array($name, $cache, true)) {
            $cache[] = $name;
        }
    }

    return $cache;

}


/**
 * I say whether a value may name an extension: the pattern of
 * FrameTrail.registerExtension(), which also keeps it a safe folder name.
 *
 * @method ftIsExtensionName
 * @param {Mixed} $name
 * @return Boolean
 */
function ftIsExtensionName($name) {

    return is_string($name) && preg_match('/^[a-z0-9][a-z0-9-]*$/', $name) === 1 && strlen($name) <= 64;

}


/**
 * I say whether config.json switches the extension on.
 *
 * @method ftExtensionEnabled
 * @param {String} $name
 * @return Boolean
 */
function ftExtensionEnabled($name) {

    return in_array($name, ftExtensionNames(), true);

}


/**
 * I return the public settings of an extension's config.json entry, as its
 * browser part gets them (PHP's [] as an empty array either way).
 *
 * @method ftExtensionSettings
 * @param {String} $name
 * @return Array
 */
function ftExtensionSettings($name) {

    global $conf;

    $configFile = $conf["dir"]["data"] . "/config.json";
    $json = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : null;

    if (is_array($json) && isset($json["extensions"]) && is_array($json["extensions"])) {
        foreach ($json["extensions"] as $entry) {
            if (is_array($entry) && isset($entry["name"]) && $entry["name"] === $name) {
                return (isset($entry["settings"]) && is_array($entry["settings"])) ? $entry["settings"] : array();
            }
        }
    }

    return array();

}


/**
 * I return the extension's private folder, _data/.extensions/<name>/, created
 * on first use. It is never served (.htaccess, serve.php) and never exported
 * (dataExport), so it is the place for an extension's own state. It travels
 * with a copy of _data/ like everything else, so it is no place for secrets.
 *
 * @method ftExtensionStorage
 * @param {String} $name
 * @return String|false  the path, false when it cannot be created
 */
function ftExtensionStorage($name) {

    global $conf;

    if (!ftIsExtensionName($name)) {
        return false;
    }

    $dir = $conf["dir"]["data"] . "/.extensions/" . $name;

    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    return $dir;

}


/**
 * I return the extension's secrets: the array _data/.auth/<name>.php returns,
 * or an empty one. PHP rather than JSON, so a web server that would serve the
 * file executes it instead; .auth/ is never served or exported either.
 *
 * @method ftExtensionSecrets
 * @param {String} $name
 * @return Array
 */
function ftExtensionSecrets($name) {

    global $conf;

    // .auth/config.php is external authentication's secret half, not the
    // secrets of an extension that happens to be called "config".
    if (!ftIsExtensionName($name) || $name === "config") {
        return array();
    }

    $file = $conf["dir"]["data"] . "/.auth/" . $name . ".php";
    if (!file_exists($file)) {
        return array();
    }

    $secrets = ftExtensionInclude($file);

    return is_array($secrets) ? $secrets : array();

}


/**
 * I include a file in a scope of its own, so it sees none of the caller's
 * variables and leaves none behind.
 *
 * @method ftExtensionInclude
 * @param {String} $__file
 * @return Mixed  what the file returns
 */
function ftExtensionInclude($__file) {

    return include $__file;

}


/**
 * I load an enabled extension's manifest, once per request, and check it.
 *
 * Returns null when the extension has no server part (or is not switched on),
 * otherwise
 *
 *     array("name", "actions" => array(name => callable), "routes" => …,
 *           "requires" => array(…), "missing" => array(…), "error" => String|null)
 *
 * An extension with an error or a missing requirement is still described, so
 * it can be reported, but none of its handlers is called.
 *
 * @method ftExtensionManifest
 * @param {String} $name
 * @return Array|null
 */
function ftExtensionManifest($name) {

    static $cache = array();

    if (array_key_exists($name, $cache)) {
        return $cache[$name];
    }

    $cache[$name] = null;

    if (!ftIsExtensionName($name) || !ftExtensionEnabled($name)) {
        return null;
    }

    $file = __DIR__ . "/extensions/" . $name . "/extension.php";
    if (!is_file($file)) {
        return null;
    }

    $manifest = array(
        "name"     => $name,
        "actions"  => array(),
        "routes"   => array(),
        "requires" => array(),
        "missing"  => array(),
        "error"    => null
    );

    // Not logged: this runs on many requests, and the reason reaches admins
    // in userCheckLogin and every caller in the failure answer.
    try {
        $declared = ftExtensionInclude($file);
    } catch (Throwable $e) {
        $manifest["error"] = "extension.php failed to load: " . $e->getMessage();
        return $cache[$name] = $manifest;
    }

    if (!is_array($declared)) {
        $manifest["error"] = "extension.php does not return an array.";
        return $cache[$name] = $manifest;
    }

    foreach (array("actions", "routes") as $kind) {

        if (!isset($declared[$kind])) {
            continue;
        }

        if (!is_array($declared[$kind])) {
            $manifest["error"] = "\"" . $kind . "\" is not an array.";
            continue;
        }

        foreach ($declared[$kind] as $key => $handler) {

            // Actions share ajaxServer.php's name space with FrameTrail's own,
            // routes become part of a URL.
            $pattern = ($kind === "actions") ? '/^[A-Za-z][A-Za-z0-9_]{0,63}$/' : '/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/';

            if (!is_string($key) || !preg_match($pattern, $key)) {
                $manifest["error"] = "\"" . $key . "\" is not a valid name for one of its " . $kind . ".";
            } elseif (!is_callable($handler)) {
                $manifest["error"] = "The handler of \"" . $key . "\" cannot be called.";
            } else {
                $manifest[$kind][$key] = $handler;
            }

        }

    }

    if (isset($declared["requires"])) {
        foreach ((array)$declared["requires"] as $requirement) {
            if (!is_string($requirement)) {
                continue;
            }
            $manifest["requires"][] = $requirement;
            if (!extension_loaded($requirement)) {
                $manifest["missing"][] = $requirement;
            }
        }
    }

    return $cache[$name] = $manifest;

}


/**
 * I find the extension that offers an action, in the order of config.json.
 * Only reached for names FrameTrail does not know itself, so its own actions
 * always win.
 *
 * @method ftExtensionFindAction
 * @param {String} $action
 * @return Array|null  array("manifest" => …, "handler" => …)
 */
function ftExtensionFindAction($action) {

    if (!is_string($action) || $action === "") {
        return null;
    }

    foreach (ftExtensionNames() as $name) {
        $manifest = ftExtensionManifest($name);
        if ($manifest !== null && isset($manifest["actions"][$action])) {
            return array("manifest" => $manifest, "handler" => $manifest["actions"][$action]);
        }
    }

    return null;

}


/**
 * I call an extension's handler with its context, array("name", "settings"),
 * or say why it cannot run.
 *
 * Returns array("ok" => true, "value" => what the handler returned) or
 * array("ok" => false, "status" => HTTP status, "answer" => a failure answer).
 *
 * @method ftExtensionCall
 * @param {Array} $manifest
 * @param {Callable} $handler
 * @return Array
 */
function ftExtensionCall($manifest, $handler) {

    $name = $manifest["name"];

    if ($manifest["error"] !== null) {
        return array("ok" => false, "status" => 500, "answer" => array(
            "status" => "fail",
            "code"   => 500,
            "string" => "The server part of the extension \"" . $name . "\" is not usable: " . $manifest["error"]
        ));
    }

    if (count($manifest["missing"]) > 0) {
        return array("ok" => false, "status" => 503, "answer" => array(
            "status" => "fail",
            "code"   => 503,
            "string" => "The extension \"" . $name . "\" needs the PHP extension(s) " . implode(", ", $manifest["missing"]) . ", which this server does not have."
        ));
    }

    try {
        $value = call_user_func($handler, array(
            "name"     => $name,
            "settings" => ftExtensionSettings($name)
        ));
    } catch (Throwable $e) {
        error_log("FrameTrail: server extension \"" . $name . "\" failed: " . $e->getMessage());
        return array("ok" => false, "status" => 500, "answer" => array(
            "status" => "fail",
            "code"   => 500,
            "string" => "The extension \"" . $name . "\" failed to answer."
        ));
    }

    return array("ok" => true, "value" => $value);

}


/**
 * I describe the server part of every enabled extension that has one, for
 * admins: what it offers and what keeps it from working. Rides along in
 * userCheckLogin, so a missing PHP extension shows up without breaking
 * anything else.
 *
 * @method ftExtensionStatus
 * @return Array  a list of array("name", "actions", "routes", "missing", "error")
 */
function ftExtensionStatus() {

    $status = array();

    foreach (ftExtensionNames() as $name) {
        $manifest = ftExtensionManifest($name);
        if ($manifest === null) {
            continue;
        }
        $status[] = array(
            "name"    => $name,
            "actions" => array_keys($manifest["actions"]),
            "routes"  => array_keys($manifest["routes"]),
            "missing" => $manifest["missing"],
            "error"   => $manifest["error"]
        );
    }

    return $status;

}

?>
