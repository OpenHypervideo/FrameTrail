<?php

/**
 * External settings: an instance whose settings belong to the platform hosting it.
 *
 * The companion of external authentication (auth.php). A platform that
 * provisions FrameTrail instances for other people usually has to decide some
 * of what the settings dialog decides — whether an instance is private, whether
 * uploads are allowed while it is over a storage limit — and a settings dialog
 * that any instance administrator can use would undo those decisions with one
 * click, or with one crafted request. So an instance can hand the whole of its
 * settings to the platform instead:
 *
 *     "externalSettings": {
 *         "providerId": "linkedvideo",
 *         "label":      "Linked.Video",
 *         "manageUrl":  "https://platform.example.org/projects/42"
 *     }
 *
 * While config.json carries that object, the platform is the only writer of
 * config.json and custom.css: configChange and globalCSSChange are refused
 * (code 8), the settings dialog does not open and its button is not drawn.
 * `manageUrl` is where an administrator is sent instead.
 *
 * No overlay file is needed, unlike externalAuth's secret half. The guard reads
 * the file on disk, never the request, and after setup configChange is the only
 * thing in FrameTrail that writes config.json — so refusing it while the key is
 * present is what keeps the key present. The only way to remove it is a write
 * that is refused while it is there.
 *
 * The switch is on whenever the key holds an object, even an empty one: a
 * malformed value locks the dialog rather than leaving it open.
 */


/**
 * I return the externalSettings object of the current data directory, or null
 * when this instance manages its own settings.
 *
 * Read from disk once per request, like ftExternalAuthConfig().
 *
 * @method ftExternalSettingsConfig
 * @return Array|null
 */
function ftExternalSettingsConfig() {

    global $conf;
    static $cache = false;

    if ($cache !== false) {
        return $cache;
    }

    $cache = null;

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (file_exists($configFile)) {
        $json = json_decode(file_get_contents($configFile), true);
        if (is_array($json) && isset($json["externalSettings"]) && is_array($json["externalSettings"])) {
            $cache = $json["externalSettings"];
        }
    }

    return $cache;

}


/**
 * I am the guard that takes the settings away from the instance.
 *
 * @method ftExternalSettingsEnabled
 * @return Boolean
 */
function ftExternalSettingsEnabled() {

    return ftExternalSettingsConfig() !== null;

}


/**
 * I return what the browser may know about external settings, or null.
 *
 * A whitelist, as ftExternalAuthPublic() is: a key added to the object on disk
 * must never reach the client by accident. `manageUrl` is passed on only when
 * it is an http(s) URL or a root-relative path — it becomes a link an
 * administrator clicks, so a `javascript:` value is dropped rather than drawn.
 *
 * @method ftExternalSettingsPublic
 * @return Array|null
 */
function ftExternalSettingsPublic() {

    $config = ftExternalSettingsConfig();
    if ($config === null) {
        return null;
    }

    $manageUrl = isset($config["manageUrl"]) ? (string)$config["manageUrl"] : "";
    if (!preg_match('#^(https?://|/(?!/))#i', $manageUrl)) {
        $manageUrl = "";
    }

    return array(
        "providerId" => isset($config["providerId"]) ? (string)$config["providerId"] : "",
        "label"      => isset($config["label"]) ? (string)$config["label"] : "",
        "manageUrl"  => $manageUrl
    );

}


/**
 * I am the answer to a settings write while the platform owns the settings.
 *
 * Code 8, shared by configChange and globalCSSChange: 7 already means "changed
 * by someone else", and an older client that does not know 8 shows its generic
 * save error, which is still true. The public block rides along so a client
 * that did not know yet can say where the settings live now.
 *
 * @method ftExternalSettingsRefusal
 * @return Array
 */
function ftExternalSettingsRefusal() {

    return array(
        "status"   => "fail",
        "code"     => 8,
        "string"   => "Settings are managed by the platform hosting this instance.",
        "response" => array("externalSettings" => ftExternalSettingsPublic())
    );

}


/**
 * I name the config.json keys that belong to whoever integrates the instance,
 * never to its settings dialog.
 *
 * Even with external settings off, configChange copies these from the file on
 * disk over whatever the request carried, so an administrator cannot remove
 * external authentication — and with it every decision the platform makes
 * about who may sign in — by posting a config without it.
 *
 * @method ftReservedConfigKeys
 * @return Array
 */
function ftReservedConfigKeys() {

    return array("externalAuth", "externalSettings");

}

?>
