<?php

require_once("./config.php");

/**
 * @param $userID // (optional) ID of user — if sent the function will return only that user
 * @return mixed
 */
function userGet($userID) {
    global $conf;

    $userFile = $conf["dir"]["data"]."/users.json";
    if (!file_exists($userFile)) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Could not find user database";
        return $return;
    }

    $json = file_get_contents($userFile);

    $uDB = json_decode($json,true);

    // The client loads this roster at boot to render annotation authors, which
    // must keep working on a public instance — so this stays reachable without
    // a session, but an anonymous caller gets only what that rendering needs.
    // Anything else (mail, role, active, lastLogin) requires being logged in.
    // avatar belongs here with name and color: it is part of drawing an author,
    // and showing anonymous viewers initials where members see a photo would be
    // a difference with no meaning behind it.
    $isLoggedIn = (isset($_SESSION["ohv"]["login"]) && $_SESSION["ohv"]["login"] == 1);
    $publicFields = array("name", "color", "avatar");

    foreach ($uDB["user"] as $k=>$u) {
        unset($uDB["user"][$k]["passwd"]);
        if (!$isLoggedIn) {
            $uDB["user"][$k] = array_intersect_key($uDB["user"][$k], array_flip($publicFields));
        }
    }

    $uDB = ($userID) ? $uDB["user"][$userID] : $uDB;
    $return["status"] = "success";
    $return["code"] = 200;
    $return["string"] = "see response";
    $return["response"] = $uDB;

    return $return;
}

/**
 * @param $name
 * @param $mail
 * @param $passwd
 * @return mixed

 * Returning codes:
 * 0 = success
 * 1 = Mail or password aren't given or mail is not a valid address
 * 2 = User already registered
 * 3 = Registration successful but user needs to be activated

 */
function userRegister($name, $mail, $passwd) {
    global $conf;

    // Accounts belong to the platform when one is configured. Registering here
    // would create a credential that can never be used to log in, and a person
    // the platform has never heard of.
    if (ftExternalAuthEnabled()) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Accounts are managed by the platform hosting this instance.";
        return $return;
    }

    $tmpFirstUser = false;
    $json = file_get_contents($conf["dir"]["data"]."/config.json");
    $configDB = json_decode($json, true);
    
    $userFile = $conf["dir"]["data"]."/users.json";


    if (!$mail || !$passwd || (!filter_var($mail, FILTER_VALIDATE_EMAIL)) || !$name) {
        $return["status"] = "fail";
        $return["code"] = 1;
        $return["string"] = "Fill out all fields";
        return $return;
    }

    if (!file_exists($userFile)) {
        $tmp["user-increment"] = 0;
        $tmp["user"] = array();
        $tmpFirstUser = true;
        file_put_contents($userFile, json_encode($tmp, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    }

    $file = new sharedFile($userFile);
    $json = $file->read();

    $user = json_decode($json,true);

    foreach ($user["user"] as $k=>$v) {
        if ($v["mail"] == strtolower($_REQUEST["mail"])) {
            $return["status"] = "fail";
            $return["code"] = 2;
            $return["string"] = "Already registered";
            $file->close();
            return $return;
        }
    }

    $user["user-increment"]++;
    $user["user"][$user["user-increment"]]["name"] = $name;
    $user["user"][$user["user-increment"]]["mail"] = strtolower($mail);
    $user["user"][$user["user-increment"]]["registrationDate"] =  time();
    $user["user"][$user["user-increment"]]["passwd"] = password_hash($passwd, PASSWORD_DEFAULT);
    // New accounts are always plain users; an admin promotes them afterwards in
    // the User Administration tab. The very first account is the exception —
    // there is nobody to promote it.
    $user["user"][$user["user-increment"]]["role"] = (($tmpFirstUser) ? "admin" : "user");
    $user["user"][$user["user-increment"]]["active"] = (($tmpFirstUser) ? 1 : (($configDB["userNeedsConfirmation"]) ? 0 : 1));
    $user["user"][$user["user-increment"]]["lastLogin"] = "";
    $user["user"][$user["user-increment"]]["color"] = getUserColors()["freeColors"][0];

    $file->writeClose(json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    // Public sign-up reaches this without a session, so the new account names
    // itself as the writer — there is nobody else it could be.
    include_once("collaboration.php");
    collabRecordWrite("users", "global",
                      isset($_SESSION["ohv"]["user"]["id"])   ? $_SESSION["ohv"]["user"]["id"]   : $user["user-increment"],
                      isset($_SESSION["ohv"]["user"]["name"]) ? $_SESSION["ohv"]["user"]["name"] : $name);

    $return["status"] = "success";
    $return["code"] = ($user["user"][$user["user-increment"]]["active"] == 1) ? 0 : 3;
    $return["string"] = "Registration succeeded";
    return $return;
}


/**
 * @param $mail
 * @param $passwd

 * Returning codes:
 * 0 = success
 * 1 = mail or passwd aren't given
 * 2 = User not found
 * 3 = Password incorrect
 * 4 = Could not find user-database // Project is missing
 * 5 = User is not active
 * 6 = Password login is disabled — this instance authenticates externally

 */
function userLogin($mail, $passwd) {
    global $conf;

    // A new code rather than reusing one of the above: the client's existing
    // switch handles 1-5, so an older client meeting a newer server falls
    // through to no message at all rather than to a confidently wrong one.
    if (ftExternalAuthEnabled()) {
        $return["status"] = "fail";
        $return["code"] = 6;
        $return["string"] = "Password sign-in is disabled on this instance.";
        return $return;
    }

    $userFile = $conf["dir"]["data"]."/users.json";

    if ((!$passwd) || (!$mail)) {
        $return["status"] = "fail";
        $return["code"] = 1;
        $return["string"] = "Fill out all fields";
        return $return;
    }

    if (!file_exists($userFile)) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Could not find user database";
        return $return;
    }

    $mail = strtolower($mail);

    $file = new sharedFile($userFile);
    $json = $file->read();

    $userDB = json_decode($json,true);
    foreach ($userDB["user"] as $k=>$v) {
        if ($v["mail"] == $mail) {
            $user = $userDB["user"][$k];
            $user["id"] = $k;
            break;
        }
    }
    if (!$user) {
        $return["status"] = "fail";
        $return["code"] = 2;
        $return["string"] = "User not found!";
        $file->close();
        return $return;
    }
    if ($user["active"] != 1) {
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "User not active!";
        $file->close();
        return $return;
    }
    if (!password_verify($passwd, $user["passwd"])) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Wrong password!";
        $file->close();
        return $return;
    }


    // Never carry a pre-login session id across the privilege change. Anyone who
    // can set a cookie on a sibling subdomain — and on a host that gives every
    // project its own subdomain, that is every project — can otherwise plant an
    // id here and inherit the session it becomes.
    session_regenerate_id(true);

    $_SESSION["ohv"]["login"] = 1;
    $_SESSION["ohv"]["user"] = $user;

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Login successful";

    $return["userdata"]["id"] = $user["id"];
    $return["userdata"]["mail"] = $user["mail"];
    $return["userdata"]["name"] = $user["name"];
    $return["userdata"]["registrationDate"] = $user["registrationDate"];
    $return["userdata"]["role"] = $user["role"];
    $return["userdata"]["color"] = $user["color"];
    $userDB["user"][$user["id"]]["lastLogin"] = time();
    $file->writeClose(json_encode($userDB, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    $return["session_lifetime"] = $conf["server"]["session_lifetime"];

    return $return;
}




/**
 * Returning codes:
 * 0 = success for one project
 * 1 = success for all projects

 */
function userLogout() {
    $return["status"] = "success";
    session_destroy();
    $return["code"] = 1;
    $return["string"] = "Logout successful";

    return $return;
}



/**
 * @param $userRole // Optional. Beside checking for login, also returns if user has this role.
 *
 * checks if User is logged in and/or has given userlevel
 * Returning codes:
 * 2 = Userfile missing
 * 1 = success
 * 0 = nope
 * 3 = yes, but inactive
 * 4 = yes, but has not given user role
 *
 */
function userCheckLogin($userRole = false) {
    global $conf;

    if (!file_exists($conf["dir"]["data"]."/users.json")) {
        $return["status"] = "fail";
        $return["code"] = 2;
        $return["string"] = "Userfile is missing";
    } elseif ($_SESSION["ohv"]["login"] == 1) {

        $userFile = $conf["dir"]["data"]."/users.json";
        $file = new sharedFile($userFile);

        $json = $file->read();
        $userdb = json_decode($json,true);

        //Update own data to check if user is still admin or other things have changed
        $tmpUserID = $_SESSION["ohv"]["user"]["id"];
        $_SESSION["ohv"]["user"] = $userdb["user"][$tmpUserID];
        $_SESSION["ohv"]["user"]["id"] = $tmpUserID;
        $file->close();

        $return["status"] = "success";
        $return["code"] = 1;
        $return["string"] = "User logged in";
        $return["session_lifetime"] = $conf["server"]["session_lifetime"];

        if ($_SESSION["ohv"]["user"]["active"] == 0) {
            $return["status"] = "success";
            $return["code"] = 3;
            $return["string"] = "User is logged in but not active";
        }

        if ($userRole && ($_SESSION["ohv"]["user"]["role"] != $userRole)) {
            $return["status"] = "success";
            $return["code"] = 4;
            $return["string"] = "User is logged in but does not have the required user role";
        }


        $return["response"] = $_SESSION["ohv"]["user"];
        unset($return["response"]["passwd"]);
    } else {
        $return["status"] = "fail";
        $return["code"] = 0;
        $return["string"] = "User not logged in";
    }

    // Expose whether this instance requires login to view content. The client
    // reads this to decide whether to authenticate before loading _data (which
    // is gated over HTTP when private). Read from the filesystem — never gated.
    $return["forceLogin"] = false;
    $cfgFile = $conf["dir"]["data"]."/config.json";
    if (file_exists($cfgFile)) {
        $cfg = json_decode(file_get_contents($cfgFile), true);
        $return["forceLogin"] = (isset($cfg["alwaysForceLogin"]) && $cfg["alwaysForceLogin"] === true);
    }

    // Rides along for the same reason forceLogin does: the client has to know
    // whether a login box can do anything at all, and it has to know before
    // config.json is loadable — which on a private instance it is not, until
    // after authenticating. A whitelist, so a key added to the config file
    // downstream cannot leak through here.
    $return["externalAuth"] = ftExternalAuthPublic();

    return $return;
}

/**
 * @param $userID
 * @param $mail
 * @param $name
 * @param $passwd
 * @param $color
 * @param $role
 * @param $active

 * Returning codes:
 * 0 = success
 * 1 = UserDB could not be find
 * 2 = User is not an admin and not the account owner
 * 3 = All data has been saved but mail was not updated because it's not valid — old mail address will still be used

 */
function userChange($userID,$mail,$name,$passwd,$color,$role,$active,$avatar = null) {
    global $conf;
    $userFile = $conf["dir"]["data"]."/users.json";



    if (!file_exists($userFile)) {
        $return["status"] = "fail";
        $return["code"] = 1;
        $return["string"] = "User DB missing";
        return $return;
    }

    if ($_SESSION["ohv"]["login"] == 1) {
        $file = new sharedFile($userFile);

        $json = $file->read();
        $userdb = json_decode($json,true);

        //Update own data to check if user is still admin
        $tmpUserID = $_SESSION["ohv"]["user"]["id"];
        $_SESSION["ohv"]["user"] = $userdb["user"][$tmpUserID];
        $_SESSION["ohv"]["user"]["id"] = $tmpUserID;
        if ((($_SESSION["ohv"]["user"]["role"] != "admin") && ($userID != $tmpUserID))) {
            $return["status"] = "fail";
            $return["code"] = 2;
            $return["string"] = "User is not an admin and not the account owner";
        } elseif (($_SESSION["ohv"]["user"]["active"] != 1)) {
            $return["status"] = "fail";
            $return["code"] = 5;
            $return["string"] = "User is not active";
            unset($_SESSION["ohv"]);
        } else {
            if ($userdb["user"][$userID]) {
                $return["code"] = 0;

                if (ftExternalAuthEnabled()) {

                    // Name, mail, role and active are the platform's, and the next
                    // sign-in rewrites them from the token regardless — so accepting
                    // an edit to them here would only produce a change that silently
                    // reverts. Colour and avatar are the person's own: the upsert
                    // leaves an existing choice alone.
                    $userdb["user"][$userID]["color"]  = ($color !== null && $color !== "") ? $color : $userdb["user"][$userID]["color"];
                    $userdb["user"][$userID]["avatar"] = ($avatar !== null && $avatar !== "")
                                                       ? ftNormalizeAvatar($avatar)
                                                       : (isset($userdb["user"][$userID]["avatar"]) ? $userdb["user"][$userID]["avatar"] : "");
                    $userdb["user"][$userID] = ftAssertNoPasswd($userdb["user"][$userID]);

                } else {

                    if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) {
                        $mail = strtolower($userdb["user"][$userID]["mail"]);
                        $return["code"] = 3;
                    } else {
                        $mail = strtolower($mail);
                    }
                    $userdb["user"][$userID]["role"] = ((($role) && ($_SESSION["ohv"]["user"]["role"] == "admin")) ? $role : $userdb["user"][$userID]["role"]);
                    // Only overwrite what was actually submitted. role, active and
                    // passwd already work this way; name and color did not, so any
                    // caller that omitted them silently wiped the stored value.
                    $userdb["user"][$userID]["name"] = ($name !== null && $name !== "") ? $name : $userdb["user"][$userID]["name"];
                    $userdb["user"][$userID]["mail"] = $mail;
                    $userdb["user"][$userID]["color"] = ($color !== null && $color !== "") ? $color : $userdb["user"][$userID]["color"];
                    $userdb["user"][$userID]["active"] = ((($active==="1" || $active==="0") && (($_SESSION["ohv"]["user"]["role"] == "admin"))) ? $active*1 : $userdb["user"][$userID]["active"]*1);
                    $userdb["user"][$userID]["passwd"] = ($passwd) ? password_hash($passwd, PASSWORD_DEFAULT) : $userdb["user"][$userID]["passwd"];

                }

                $file->write(json_encode($userdb, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

                include_once("collaboration.php");
                collabRecordWrite("users", "global",
                                  $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

                $return["status"] = "success";
                $return["string"] = "User data updated";
                $return["response"] = $userdb["user"][$userID];
                unset($return["response"]["passwd"]);
            } else {
                $return["status"] = "fail";
                $return["code"] = 6;
                $return["string"] = "Targeted User not found";
            }
        }
        $file->close();
    } else {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "User not logged in";
    }

    return $return;
}

/**
 * @param $userID
 * @return mixed
 *
 * Removes a user account. Their authored content is deliberately left in place:
 * annotation files (annotations/<id>.json) and the creatorId references inside
 * hypervideo contents stay exactly as they are, so nothing a deleted person
 * wrote disappears. The client already tolerates an unknown creatorId and falls
 * back to a neutral colour.
 *
 * Returning Code:
 * 0    =   Success. User deleted.
 * 1    =   failed. Not logged in, or not an admin.
 * 2    =   failed. User database missing.
 * 3    =   failed. Targeted user not found.
 * 4    =   failed. Refusing to delete your own account.
 * 5    =   failed. Refusing to remove the last remaining admin.
 */
function userDelete($userID) {

    global $conf;

    if ($err = requireLogin("admin")) return $err;

    // Membership is the platform's to end. Deleting here would leave the two
    // sides disagreeing until the next push put the record straight back.
    if (ftExternalAuthEnabled()) {
        return array(
            "status" => "fail",
            "code"   => 6,
            "string" => "Accounts are managed by the platform hosting this instance."
        );
    }

    $userID = (string)$userID;

    if ($userID === (string)$_SESSION["ohv"]["user"]["id"]) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "You cannot delete your own account.";
        return $return;
    }

    $userFile = $conf["dir"]["data"]."/users.json";
    if (!file_exists($userFile)) {
        $return["status"] = "fail";
        $return["code"] = 2;
        $return["string"] = "Could not find user database";
        return $return;
    }

    $file = new sharedFile($userFile);
    $uDB  = json_decode($file->read(), true);

    if (!isset($uDB["user"][$userID])) {
        $file->close();
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Targeted User not found";
        return $return;
    }

    // Never leave the instance without an administrator — there would be no way
    // back into the admin dialog to appoint one.
    if ($uDB["user"][$userID]["role"] == "admin") {
        $admins = 0;
        foreach ($uDB["user"] as $u) {
            if ($u["role"] == "admin") { $admins++; }
        }
        if ($admins <= 1) {
            $file->close();
            $return["status"] = "fail";
            $return["code"] = 5;
            $return["string"] = "Cannot remove the last remaining admin.";
            return $return;
        }
    }

    $deletedName = $uDB["user"][$userID]["name"];
    unset($uDB["user"][$userID]);

    $file->writeClose(json_encode($uDB, $conf["settings"]["json_flags"]));

    include_once("collaboration.php");
    collabRecordWrite("users", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "User '".$deletedName."' has been deleted.";
    return $return;
}

/**
 * Guards a function that requires a logged-in user (optionally with a specific role).
 * Returns a fail response array that callers can return immediately, or null on success.
 * The session is refreshed from disk as a side effect of userCheckLogin().
 *
 * Usage:  if ($err = requireLogin()) return $err;
 *         if ($err = requireLogin("admin")) return $err;
 *
 * @param string|false $role  Optional role to require (e.g. "admin")
 * @return array|null  Fail response array on failure, or null on success
 */
function requireLogin($role = false) {
    $login = userCheckLogin($role);
    if ($login["code"] != 1) {
        return [
            "status" => "fail",
            "code"   => 1,
            "string" => $login["string"],
        ];
    }
    return null;
}

function getUserColors() {
    global $conf;
    $defaultColors = array("597081", "339966", "16a09c", "cd4436", "0073a6", "8b5180", "999933", "CC3399", "7f8c8d", "ae764d", "cf910d", "b85e02");
    $json = file_get_contents($conf["dir"]["data"]."/config.json");
    $configDB = json_decode($json, true);
    $return["colorCollection"] = (isset($configDB["userColorCollection"]) && is_array($configDB["userColorCollection"]))
        ? $configDB["userColorCollection"]
        : $defaultColors;

    $json = file_get_contents($conf["dir"]["data"]."/users.json");
    $user = json_decode($json, true);
    foreach ($user["user"] as $k => $u) {
        $used[$k] = $u["color"];
    }
    $return["user"] = $used;

    //because array_diff returns keys too.
    $used = (is_array($used) ? $used : array());
    foreach ($return["colorCollection"] as $c) {
        if (!in_array($c, $used)) {
            $return["freeColors"][] = $c;
        }
    }

    if (count($return["freeColors"]) < 1) {
        $return["freeColors"] = $return["colorCollection"][0];
    }

    return $return;
}


/**
 * I find or create the local record standing for an externally-authenticated
 * person, and return it with its id.
 *
 * The map key stays a small integer, exactly as it has always been, and the
 * external subject lives in a field. That is not merely conservative: the user
 * id becomes a *filename* — annotationfiles.php names a person's annotation
 * file after it, and files.php puts it in upload names — and an OIDC subject is
 * an opaque string that may legally contain a slash or a dot-dot. Keeping the
 * subject out of the path is what makes a second provider safe to add. It also
 * means an existing instance can adopt a platform by writing an `external`
 * block onto an account that already has annotations, which is account linking
 * for free.
 *
 * Name, mail, role and active are the platform's and are rewritten on every
 * sign-in. Colour and avatar are the person's: the platform may seed them, but
 * a choice made here survives.
 *
 * @method ftPrincipalUpsert
 * @param {Array} $identity  normalized
 * @return Array|null  the record, with "id"
 */
function ftPrincipalUpsert($identity) {

    global $conf;

    $userFile = $conf["dir"]["data"]."/users.json";
    $file     = new sharedFile($userFile);
    $userDB   = json_decode($file->read(), true);

    if (!is_array($userDB) || !isset($userDB["user"]) || !is_array($userDB["user"])) {
        $userDB = array("user-increment" => 0, "user" => array());
    }

    $key = null;
    foreach ($userDB["user"] as $k => $u) {
        if (isset($u["external"]["provider"], $u["external"]["sub"])
            && $u["external"]["provider"] === $identity["provider"]
            && (string)$u["external"]["sub"] === $identity["sub"]) {
            $key = (string)$k;
            break;
        }
    }

    if ($key === null) {

        // Step past every numeric key in use, not just the stored increment: a
        // directory that also holds legacy password accounts must not hand out
        // a key that is already one of them.
        $highest = isset($userDB["user-increment"]) ? (int)$userDB["user-increment"] : 0;
        foreach (array_keys($userDB["user"]) as $existing) {
            if (ctype_digit((string)$existing) && (int)$existing > $highest) {
                $highest = (int)$existing;
            }
        }

        $key = (string)($highest + 1);
        $userDB["user-increment"] = (int)$key;
        $userDB["user"][$key] = array(
            "name"             => "",
            "mail"             => "",
            "registrationDate" => time(),
            "role"             => "user",
            "active"           => 1,
            "lastLogin"        => "",
            "color"            => "",
            "avatar"           => ""
        );

    }

    $record = $userDB["user"][$key];

    $record["name"]      = $identity["name"];
    $record["mail"]      = $identity["mail"];
    $record["role"]      = $identity["role"];
    $record["active"]    = $identity["active"];
    $record["lastLogin"] = time();

    if (empty($record["color"])) {
        if ($identity["color"] !== "") {
            $record["color"] = $identity["color"];
        } else {
            $colors = getUserColors();
            $record["color"] = is_array($colors["freeColors"]) ? $colors["freeColors"][0] : $colors["freeColors"];
        }
    }

    if ($identity["avatar"] !== "") {
        $record["avatar"] = $identity["avatar"];
    } elseif (!isset($record["avatar"])) {
        $record["avatar"] = "";
    }

    $record["external"] = array(
        "provider" => $identity["provider"],
        "sub"      => $identity["sub"],
        "syncedAt" => time()
    );

    $record = ftAssertNoPasswd($record);

    $userDB["user"][$key] = $record;

    // A marker on the file itself, so a password write is refused even if
    // config.json were swapped out from under us.
    $userDB["externalAuth"] = array("provider" => $identity["provider"]);

    $written = $file->writeClose(json_encode($userDB, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    if ($written === false) {
        return null;
    }

    $record["id"] = $key;

    return $record;

}


/**
 * I establish a session for an externally-authenticated identity.
 *
 * This is the only seam between any provider and the session, which is the
 * point: the array I leave in $_SESSION["ohv"]["user"] has exactly the shape
 * userLogin() has always left there, so requireLogin(), every admin gate, the
 * annotation file naming and the whole collaboration layer cannot tell the
 * difference — and a future provider will not have to touch any of them.
 *
 * Returning codes:
 * 0 = success
 * 1 = this instance does not use external authentication
 * 2 = the account exists but is not active
 * 3 = the user directory could not be written
 * 4 = the identity was unusable
 *
 * @method ftExternalLoginEstablish
 * @param {Array} $identity
 * @return Array
 */
function ftExternalLoginEstablish($identity) {

    if (!ftExternalAuthEnabled()) {
        return array("code" => 1, "string" => "This instance does not use external authentication.");
    }

    $identity = ftNormalizeIdentity($identity);

    if ($identity === null) {
        return array("code" => 4, "string" => "The sign-in did not describe a usable identity.");
    }

    $user = ftPrincipalUpsert($identity);

    if ($user === null) {
        return array("code" => 3, "string" => "Could not write the user directory.");
    }

    if ((int)$user["active"] !== 1) {
        return array("code" => 2, "string" => "This account is not active.");
    }

    // The session id that arrived may have been planted by a page on a sibling
    // subdomain — and a host that gives every project its own subdomain makes
    // that a page it serves itself. Never keep it across a privilege change.
    session_regenerate_id(true);

    unset($user["passwd"]);

    $_SESSION["ohv"]["login"] = 1;
    $_SESSION["ohv"]["user"]  = $user;
    $_SESSION["ohv"]["auth"]  = array(
        "provider" => $identity["provider"],
        "sub"      => $identity["sub"],
        "at"       => time()
    );

    return array("code" => 0, "string" => "Login successful");

}