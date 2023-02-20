<?php

require_once("./config.php");

/**
 * @param $userID // (optional) ID of User - if send the function will just return the User
 * @return mixed
 */
function userGet($userID) {
	global $conf;

	$json = file_get_contents($conf["dir"]["data"]."/users.json");

	$uDB = json_decode($json,true);
	//if ($_SESSION["ohv"]["projects"][$projectID]["user"]["role"] != "admin") {
	foreach ($uDB["user"] as $k=>$u) {
		unset($uDB["user"][$k]["passwd"]);
	}
	//}
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
 * 1 = Mail or Password arent given or Mail is not a valid address
 * 2 = User already registered
 * 3 = Registration success but user needs to be activated

 */
function userRegister($name, $mail, $passwd) {
	global $conf;
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
	$user["user"][$user["user-increment"]]["passwd"] = hash("sha256",$passwd.$user["user"][$user["user-increment"]]["registrationDate"]);
	$user["user"][$user["user-increment"]]["role"] = (($tmpFirstUser) ? "admin" : $configDB["defaultUserRole"]);
    $user["user"][$user["user-increment"]]["active"] = (($tmpFirstUser) ? 1 : (($configDB["userNeedsConfirmation"]) ? 0 : 1));
	$user["user"][$user["user-increment"]]["lastLogin"] = "";
	$user["user"][$user["user-increment"]]["color"] = getUserColors()["freeColors"][0];

	$file->writeClose(json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

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
 * 1 = mail, passwd or projectID arent given
 * 2 = User not found
 * 3 = Password incorrect
 * 4 = Could not find user-database // Project is missing
 * 5 = User is not active

 */
function userLogin($mail, $passwd) {
	global $conf;

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
	if ($user["passwd"] != hash("sha256",$passwd.$user["registrationDate"])) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Wrong password!";
		$file->close();
		return $return;
	}


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
	$return["string"] = "Logout success";

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
		$return["string"] = "user logged in";
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
 * 2 = User is not Admin and not himself
 * 3 = All data has been saved but mail because its not valid. so old mailadress will still be saved/used

 */
function userChange($userID,$mail,$name,$passwd,$color,$role,$active) {
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
			$return["string"] = "user is not admin nor himself";
		} elseif (($_SESSION["ohv"]["user"]["active"] != 1)) {
			$return["status"] = "fail";
			$return["code"] = 5;
			$return["string"] = "user is not active";
			unset($_SESSION["ohv"]);
		} else {
			if ($userdb["user"][$userID]) {
				$return["code"] = 0;
				if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) {
					$mail = strtolower($userdb["user"][$userID]["mail"]);
					$return["code"] = 3;
				} else {
					$mail = strtolower($mail);
				}
				$userdb["user"][$userID]["role"] = ((($role) && ($_SESSION["ohv"]["user"]["role"] == "admin")) ? $role : $userdb["user"][$userID]["role"]);
				$userdb["user"][$userID]["name"] = $name;
				$userdb["user"][$userID]["mail"] = $mail;
				$userdb["user"][$userID]["color"] = $color;
				$userdb["user"][$userID]["active"] = ((($active==="1" || $active==="0") && (($_SESSION["ohv"]["user"]["role"] == "admin"))) ? $active*1 : $userdb["user"][$userID]["active"]*1);
				$userdb["user"][$userID]["passwd"] = ($passwd) ? hash("sha256",$passwd.$userdb["user"][$userID]["registrationDate"]) : $userdb["user"][$userID]["passwd"];
				$file->write(json_encode($userdb, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));				
				$return["status"] = "success";
				$return["string"] = "userdata updated";
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

function getUserColors() {
	global $conf;
	$json = file_get_contents($conf["dir"]["data"]."/config.json");
	$configDB = json_decode($json, true);
	$return["colorCollection"] = $configDB["userColorCollection"];

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