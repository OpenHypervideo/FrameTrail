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
 * The scopes are declared once in _collabScopes() below. Every one of them is
 * a shared file (or set of files) that two people can be looking at, and only
 * one of them can win a write to.
 *
 * Annotations are deliberately NOT covered: they live in per-user files
 * (annotations/<userId>.json) and are safe to edit concurrently. Neither are
 * uploaded resources — the resource manager re-reads its index after every
 * operation of its own, so a version token would only add noise.
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
 * The single source of truth for which collaboration scopes exist and which
 * files each one guards.
 *
 * _collabStatePath() uses the keys as its whitelist; _collabVersion() takes the
 * newest mtime across a scope's files as the token clients compare against.
 * Adding a scope is therefore one entry here and nothing else.
 *
 * "files" is a callable so a scope whose file set depends on its id — or on a
 * directory listing — can say so without a second lookup table. "global" marks
 * a singleton scope, whose only valid scopeId is "global".
 */
function _collabScopes() {

    global $conf;
    $data = $conf["dir"]["data"];

    return array(

        "hypervideo" => array(
            "global" => false,
            "files"  => function($scopeId) {
                $dir = _collabHypervideoDir($scopeId);
                return ($dir === false) ? array() : array($dir."/hypervideo.json");
            }
        ),

        "settings" => array(
            "global" => true,
            "files"  => function($scopeId) use ($data) {
                return array($data."/config.json", $data."/custom.css");
            }
        ),

        "users" => array(
            "global" => true,
            "files"  => function($scopeId) use ($data) {
                return array($data."/users.json");
            }
        ),

        "tags" => array(
            "global" => true,
            "files"  => function($scopeId) use ($data) {
                return array($data."/tagdefinitions.json");
            }
        ),

        // The index alone would miss a rename: hypervideoChange writes only
        // hypervideo.json, and the overview lists the names out of it. Statting
        // every hypervideo.json is a handful of stat() calls per poll — cheap
        // next to parsing them, which is the whole reason this token exists.
        "library" => array(
            "global" => true,
            "files"  => function($scopeId) use ($data) {
                $files = array($data."/hypervideos/_index.json");
                $found = glob($data."/hypervideos/*/hypervideo.json");
                return ($found === false) ? $files : array_merge($files, $found);
            }
        ),

        // Not a document, so it guards no files and carries no version token:
        // joining it *is* the statement "I am editing somewhere on this
        // instance". Everything else a scope already provides — the lease, the
        // pruning, the participant record — is exactly what presence needs, so
        // it costs one entry here and nothing else.
        "presence" => array(
            "global" => true,
            "files"  => function($scopeId) {
                return array();
            }
        )

    );

}


/**
 * Resolve and validate the state file path for a scope.
 * Returns false if the scope or id is not acceptable.
 */
function _collabStatePath($scope, $scopeId) {

    global $conf;

    $scopes = _collabScopes();

    if (!isset($scopes[$scope])) {
        return false;
    }
    // No path separators, no traversal — the id becomes part of a filename.
    if (!is_string($scopeId) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $scopeId)) {
        return false;
    }
    // A singleton scope has exactly one state file. Anything else would create
    // orphans that nobody ever reads or prunes.
    if ($scopes[$scope]["global"] && $scopeId !== "global") {
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

    clearstatcache();

    $scopes = _collabScopes();
    if (!isset($scopes[$scope])) {
        return 0;
    }

    $newest = 0;

    foreach (call_user_func($scopes[$scope]["files"], $scopeId) as $path) {
        $mtime = @filemtime($path);
        if ($mtime !== false && $mtime > $newest) {
            $newest = $mtime;
        }
    }

    return $newest;

}


/**
 * Drop a scope's ephemeral state, e.g. when its subject is deleted. Errors are
 * swallowed: this is housekeeping, never a reason to fail the caller.
 *
 * @param string $scope
 * @param string $scopeId
 */
function collabForgetScope($scope, $scopeId) {

    $path = _collabStatePath($scope, $scopeId);

    if ($path !== false && file_exists($path)) {
        @unlink($path);
    }

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
 * Heartbeat one scope: register/refresh the caller's presence and read back the
 * state. Returns array("response" => …) or array("error" => …).
 *
 * Assumes the caller has already authenticated and closed the session, because
 * a batch does both once for all of its scopes.
 *
 * @param array  $d         { scope, scopeId, editing, unsaved, knownVersion, observe }
 * @param string $userId
 * @param string $userName
 * @param string $userColor
 * @param int    $now
 */
function _collabSyncOne($d, $userId, $userName, $userColor, $now) {

    global $conf;

    $scope        = isset($d["scope"])   ? $d["scope"]   : null;
    $scopeId      = isset($d["scopeId"]) ? (string)$d["scopeId"] : "";
    $knownVersion = isset($d["knownVersion"]) ? $d["knownVersion"] : null;

    $path = _collabStatePath($scope, $scopeId);
    if ($path === false) {
        return array("error" => array("code" => 2, "string" => "Invalid collaboration scope."));
    }

    $opened = _collabOpen($path);
    if ($opened === false) {
        return array("error" => array("code" => 3, "string" => "Could not access collaboration state."));
    }
    list($file, $state) = $opened;

    _collabPrune($state, $now);

    // An observer wants the staleness signal and nothing else. Registering it as
    // a participant would put every admin merely in edit mode into the settings
    // dialog's avatar row, where "who else is here" has to keep meaning "who
    // else has this dialog open".
    //
    // Observing is also how a session *leaves*: a closing dialog demotes itself
    // to an observer, and stop() sends one final observing sync on its way out.
    // So an observer that is still on the participant list is one that has just
    // left, and must be dropped now rather than lingering for a whole lease —
    // 45 seconds of ghost presence is exactly the staleness this exists to
    // avoid. Writing only when something actually changed keeps the common
    // case, an observer that was never a participant, a pure read.
    if (!empty($d["observe"])) {

        if (isset($state["participants"][$userId])) {

            unset($state["participants"][$userId]);

            // _collabPrune ran before we removed ourselves, so a lock we held
            // would otherwise survive until somebody else's next request.
            if (isset($state["lock"]) && is_array($state["lock"])
                && (string)$state["lock"]["holderId"] === $userId) {
                $state["lock"] = null;
            }

            $file->writeClose(json_encode($state, $conf["settings"]["json_flags"]));

        } else {
            $file->close();
        }

        return array("response" => _collabResponse($state, $scope, $scopeId, $knownVersion));

    }

    $state["participants"][$userId] = array(
        "name"     => $userName,
        "color"    => $userColor,
        "editing"  => !empty($d["editing"]),
        "lastSeen" => $now
    );

    // Refresh our own lease and record whether we are safe to take over from.
    if ($state["lock"] !== null && (string)$state["lock"]["holderId"] === $userId) {
        $state["lock"]["expires"] = $now + COLLAB_LEASE;
        $state["lock"]["unsaved"] = !empty($d["unsaved"]);
    }

    $file->writeClose(json_encode($state, $conf["settings"]["json_flags"]));

    return array("response" => _collabResponse($state, $scope, $scopeId, $knownVersion));

}


/**
 * Heartbeat for one or more scopes at once.
 *
 * The client polls every scope it is watching, so batching them into a single
 * request keeps the request count flat as the number of watched scopes grows —
 * which is what makes ambient, always-on scopes affordable at all.
 *
 * The response is keyed "<scope>:<scopeId>" rather than an ordered array, so
 * nothing depends on the server echoing back what it was handed. The keys
 * always contain a colon, so json_encode can never degrade the map to a list.
 *
 * @param array $sessionDescriptors  [{ scope, scopeId, editing, unsaved, knownVersion, observe }, …]
 * @param bool  $legacySingle        return the lone response unwrapped
 */
function collabSync($sessionDescriptors, $legacySingle = false) {

    if ($err = requireLogin()) return $err;

    $userId    = (string)$_SESSION["ohv"]["user"]["id"];
    $userName  = $_SESSION["ohv"]["user"]["name"];
    $userColor = isset($_SESSION["ohv"]["user"]["color"]) ? $_SESSION["ohv"]["user"]["color"] : "";

    // Nothing below touches the session; release it so a user's other requests
    // are not serialised behind this poll by PHP's session file lock.
    session_write_close();

    if (!is_array($sessionDescriptors) || count($sessionDescriptors) === 0) {
        return array("status" => "fail", "code" => 2, "string" => "No collaboration scopes submitted.");
    }

    $now       = time();
    $responses = array();
    $errors    = array();

    foreach ($sessionDescriptors as $d) {

        if (!is_array($d)) continue;

        $key = (isset($d["scope"]) ? $d["scope"] : "?").":".(isset($d["scopeId"]) ? $d["scopeId"] : "?");
        $one = _collabSyncOne($d, $userId, $userName, $userColor, $now);

        if (isset($one["error"])) {
            $errors[$key] = $one["error"];
        } else {
            $responses[$key] = $one["response"];
        }

    }

    return array(
        "status"   => "success",
        "code"     => 0,
        "string"   => "Collaboration state synced.",
        "response" => $legacySingle ? (count($responses) ? reset($responses) : null) : $responses,
        "errors"   => $errors
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
