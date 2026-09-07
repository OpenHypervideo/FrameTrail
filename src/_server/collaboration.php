<?php

require_once("./config.php");
require_once("./user.php");

/**
 * Presence and soft-lock handling for multi-user editing.
 *
 * State lives in $data/.collab/<scope>-<scopeId>.json and is purely ephemeral:
 * it may be deleted at any time, is excluded from the data export, and is never
 * part of the portable _data payload.
 *
 * Two scopes exist:
 *   "hypervideo" — scopeId is the hypervideo ID; guards hypervideo.json
 *   "settings"   — scopeId is "global";          guards config.json + custom.css
 *
 * Annotations are deliberately NOT covered: they live in per-user files
 * (annotations/<userId>.json) and are safe to edit concurrently.
 *
 * Returning Code:
 * 0       =   Success.
 * 1       =   failed. User not logged in or inactive.
 * 2       =   failed. Invalid scope or scopeId.
 * 3       =   failed. Could not access collaboration state.
 * 4       =   failed. Lock is held by someone else.
 * 5       =   failed. Takeover refused: holder is active and has unsaved changes.
 */

define("COLLAB_LEASE", 45);


/**
 * Resolve and validate the state file path for a scope.
 * Returns false if the scope or id is not acceptable.
 */
function _collabStatePath($scope, $scopeId) {

    global $conf;

    if ($scope !== "hypervideo" && $scope !== "settings") {
        return false;
    }
    // No path separators, no traversal — the id becomes part of a filename.
    if (!is_string($scopeId) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $scopeId)) {
        return false;
    }

    $dir = $conf["dir"]["data"]."/.collab";
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
    }

    return $dir."/".$scope."-".$scopeId.".json";

}


/**
 * Resolve the directory of a hypervideo via the index, mirroring hypervideoChange().
 */
function _collabHypervideoDir($hypervideoID) {

    global $conf;

    $json = @file_get_contents($conf["dir"]["data"]."/hypervideos/_index.json");
    if ($json === false) {
        return false;
    }
    $hvi = json_decode($json, true);

    if (!isset($hvi["hypervideos"][$hypervideoID])) {
        return false;
    }

    $dir = realpath($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]);
    if ($dir === false || !is_dir($dir)) {
        return false;
    }

    return $dir;

}


/**
 * The version token a client compares against to detect that the underlying
 * document changed. Deliberately a modification time rather than a value read
 * out of the document: a stat is cheap enough to run on every poll, whereas
 * parsing a large hypervideo.json every few seconds is not.
 *
 * This is NOT the compare-and-swap token used on save — that one is
 * meta.lastchanged, which the client already holds from load time.
 */
function _collabVersion($scope, $scopeId) {

    global $conf;

    clearstatcache();

    if ($scope === "hypervideo") {
        $dir = _collabHypervideoDir($scopeId);
        if ($dir === false) {
            return 0;
        }
        $mtime = @filemtime($dir."/hypervideo.json");
        return ($mtime === false) ? 0 : $mtime;
    }

    $configTime = @filemtime($conf["dir"]["data"]."/config.json");
    $cssTime    = @filemtime($conf["dir"]["data"]."/custom.css");

    return max(($configTime === false ? 0 : $configTime), ($cssTime === false ? 0 : $cssTime));

}


/**
 * Drop participants that stopped heartbeating, and release an expired lock.
 */
function _collabPrune(&$state, $now) {

    if (!isset($state["participants"]) || !is_array($state["participants"])) {
        $state["participants"] = array();
    }

    foreach ($state["participants"] as $id => $participant) {
        if (!isset($participant["lastSeen"]) || ($now - $participant["lastSeen"]) > COLLAB_LEASE) {
            unset($state["participants"][$id]);
        }
    }

    if (isset($state["lock"]) && is_array($state["lock"])) {
        $holderId = $state["lock"]["holderId"];
        // A lock only survives while its holder is still heartbeating.
        if (!isset($state["participants"][$holderId])
            || !isset($state["lock"]["expires"])
            || $state["lock"]["expires"] < $now) {
            $state["lock"] = null;
        }
    } else {
        $state["lock"] = null;
    }

}


/**
 * Read state under an exclusive lock. Returns array($file, $state) or false.
 */
function _collabOpen($path) {

    $file = new sharedFile($path);
    if (!$file->isLocked()) {
        return false;
    }

    $json  = $file->read();
    $state = ($json === false || trim($json) === "") ? array() : json_decode($json, true);
    if (!is_array($state)) {
        $state = array();
    }

    return array($file, $state);

}


/**
 * Shape the state for the client, resolving the lock holder's display data.
 */
function _collabResponse($state, $scope, $scopeId, $knownVersion) {

    $version = _collabVersion($scope, $scopeId);

    $participants = array();
    foreach ($state["participants"] as $id => $participant) {
        $participants[] = array(
            "id"       => (string)$id,
            "name"     => $participant["name"],
            "color"    => $participant["color"],
            "editing"  => !empty($participant["editing"]),
            "lastSeen" => $participant["lastSeen"]
        );
    }

    return array(
        "participants" => $participants,
        "lock"         => $state["lock"],
        "lastWriter"   => isset($state["lastWriter"]) ? $state["lastWriter"] : null,
        "version"      => $version,
        "stale"        => ($knownVersion !== null && $knownVersion !== "" && (string)$knownVersion !== (string)$version)
    );

}


/**
 * Record who last wrote this scope, so the staleness notice can name the person
 * who actually saved. The edit lock is not a reliable proxy: after a takeover
 * the holder is not the last writer, and a client that saves without ever
 * claiming the lock has no holder at all.
 *
 * Called from the write paths themselves (hypervideoChange, updateConfigFile),
 * so it must never fail the write it is annotating — every error is swallowed.
 *
 * @param string $scope   "hypervideo" | "settings"
 * @param string $scopeId hypervideo ID, or "global"
 * @param string $userId
 * @param string $userName
 */
function collabRecordWrite($scope, $scopeId, $userId, $userName) {

    global $conf;

    $path = _collabStatePath($scope, $scopeId);
    if ($path === false) {
        return;
    }

    $opened = _collabOpen($path);
    if ($opened === false) {
        return;
    }
    list($file, $state) = $opened;

    _collabPrune($state, time());

    $state["lastWriter"] = array(
        "id"   => (string)$userId,
        "name" => $userName,
        "at"   => time()
    );

    $file->writeClose(json_encode($state, $conf["settings"]["json_flags"]));

}


/**
 * Heartbeat: register/refresh the caller's presence and read back the state.
 *
 * @param string $scope         "hypervideo" | "settings"
 * @param string $scopeId       hypervideo ID, or "global"
 * @param bool   $editing       caller is currently in edit mode
 * @param bool   $unsaved       caller holds unsaved changes (gates takeover)
 * @param mixed  $knownVersion  version the caller last rendered from
 */
function collabSync($scope, $scopeId, $editing, $unsaved, $knownVersion) {

    global $conf;

    if ($err = requireLogin()) return $err;

    $userId    = (string)$_SESSION["ohv"]["user"]["id"];
    $userName  = $_SESSION["ohv"]["user"]["name"];
    $userColor = isset($_SESSION["ohv"]["user"]["color"]) ? $_SESSION["ohv"]["user"]["color"] : "";

    // Nothing below touches the session; release it so a user's other requests
    // are not serialised behind this poll by PHP's session file lock.
    session_write_close();

    $path = _collabStatePath($scope, $scopeId);
    if ($path === false) {
        return array("status" => "fail", "code" => 2, "string" => "Invalid collaboration scope.");
    }

    $opened = _collabOpen($path);
    if ($opened === false) {
        return array("status" => "fail", "code" => 3, "string" => "Could not access collaboration state.");
    }
    list($file, $state) = $opened;

    $now = time();
    _collabPrune($state, $now);

    $state["participants"][$userId] = array(
        "name"     => $userName,
        "color"    => $userColor,
        "editing"  => (bool)$editing,
        "lastSeen" => $now
    );

    // Refresh our own lease and record whether we are safe to take over from.
    if ($state["lock"] !== null && (string)$state["lock"]["holderId"] === $userId) {
        $state["lock"]["expires"] = $now + COLLAB_LEASE;
        $state["lock"]["unsaved"] = (bool)$unsaved;
    }

    $file->writeClose(json_encode($state, $conf["settings"]["json_flags"]));

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Collaboration state synced.",
        "response" => _collabResponse($state, $scope, $scopeId, $knownVersion)
    );

}


/**
 * Claim, release or take over the soft lock for a scope.
 *
 * @param string $scope   "hypervideo" | "settings"
 * @param string $scopeId hypervideo ID, or "global"
 * @param string $op      "claim" | "release" | "takeover"
 */
function collabLock($scope, $scopeId, $op) {

    global $conf;

    if ($err = requireLogin()) return $err;

    $userId    = (string)$_SESSION["ohv"]["user"]["id"];
    $userName  = $_SESSION["ohv"]["user"]["name"];
    $userColor = isset($_SESSION["ohv"]["user"]["color"]) ? $_SESSION["ohv"]["user"]["color"] : "";

    session_write_close();

    if ($op !== "claim" && $op !== "release" && $op !== "takeover") {
        return array("status" => "fail", "code" => 2, "string" => "Invalid lock operation.");
    }

    $path = _collabStatePath($scope, $scopeId);
    if ($path === false) {
        return array("status" => "fail", "code" => 2, "string" => "Invalid collaboration scope.");
    }

    $opened = _collabOpen($path);
    if ($opened === false) {
        return array("status" => "fail", "code" => 3, "string" => "Could not access collaboration state.");
    }
    list($file, $state) = $opened;

    $now = time();
    _collabPrune($state, $now);

    // Keep the caller present, so a claim immediately followed by a prune
    // on the next poll does not drop the lock we just handed out.
    $state["participants"][$userId] = array(
        "name"     => $userName,
        "color"    => $userColor,
        "editing"  => ($op !== "release"),
        "lastSeen" => $now
    );

    $failure = null;

    if ($op === "release") {

        if ($state["lock"] !== null && (string)$state["lock"]["holderId"] === $userId) {
            $state["lock"] = null;
        }

    } else if ($state["lock"] !== null && (string)$state["lock"]["holderId"] !== $userId) {

        if ($op === "claim") {
            $failure = array("code" => 4, "string" => "Lock is held by another user.");
        } else if (!empty($state["lock"]["unsaved"])) {
            // The holder is provably alive (prune would have cleared the lock
            // otherwise) and has work that only exists in their browser.
            $failure = array("code" => 5, "string" => "The current editor has unsaved changes.");
        } else {
            $state["lock"] = array(
                "holderId" => $userId,
                "since"    => $now,
                "expires"  => $now + COLLAB_LEASE,
                "unsaved"  => false
            );
        }

    } else if ($state["lock"] === null) {

        $state["lock"] = array(
            "holderId" => $userId,
            "since"    => $now,
            "expires"  => $now + COLLAB_LEASE,
            "unsaved"  => false
        );

    } else {

        // Already ours — just extend it.
        $state["lock"]["expires"] = $now + COLLAB_LEASE;

    }

    $file->writeClose(json_encode($state, $conf["settings"]["json_flags"]));

    $response = _collabResponse($state, $scope, $scopeId, null);

    if ($failure !== null) {
        return array(
            "status"   => "fail",
            "code"     => $failure["code"],
            "string"   => $failure["string"],
            "response" => $response
        );
    }

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Lock operation '".$op."' succeeded.",
        "response" => $response
    );

}

?>
