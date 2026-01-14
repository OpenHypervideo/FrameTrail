<?php

require_once("./config.php");
require_once("./user.php");

/**
 * @param $src
 * @param $subtitles
 * @return mixed
 *
Returning Code:
0		=	Success. Hypervideo has been added. Returning new Object in response
1		=	failed. User not logged in or inactive. See resp["string"]
4		=	failed. Name (min 3 chars) has not been submitted.
 *
 */
function hypervideoAdd($src, $subtitles = false) {

	global $conf;

	$login = userCheckLogin();

	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {
		$file = new sharedFile($conf["dir"]["data"]."/users.json");
		$json = $file->read();
		$file->close();
		$u = json_decode($json,true);
		$_SESSION["ohv"]["user"] = array_replace_recursive($_SESSION["ohv"]["user"], $u["user"][$_SESSION["ohv"]["user"]["id"]]);
	}


	if (!is_dir($conf["dir"]["data"]."/resources")) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Could not find the projects resources folder";
		return $return;
	}

	$newHV = json_decode($src, true);

	if ((!$newHV["meta"]["name"]) || (strlen($newHV["meta"]["name"]) <3)) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "Name (min 3 chars) has not been submitted.";
		return $return;
	}

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/_index.json");
	$json = $file->read();
	$hvi = json_decode($json,true);
	// BUGFIX: First video won't be linked as the initial value is null.
	if (!$hvi["hypervideo-increment"]) {
		$hvi["hypervideo-increment"] = 0;
	}
	$hvi["hypervideo-increment"]++;
	$hvi["hypervideos"][$hvi["hypervideo-increment"]] = "./".$hvi["hypervideo-increment"];
	$file->writeClose(json_encode($hvi, $conf["settings"]["json_flags"]));
	$newHVdir = $conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"];

	mkdir($newHVdir);
	mkdir($newHVdir."/annotations");
	mkdir($newHVdir."/subtitles");

	$time = time();

	$newAi["mainAnnotation"] = "1";
	$newAi["annotationfiles"]["1"]["name"] = "main";
	$newAi["annotationfiles"]["1"]["description"] = "";
	$newAi["annotationfiles"]["1"]["created"] = $time;
	$newAi["annotationfiles"]["1"]["lastchanged"] = $time;
	$newAi["annotationfiles"]["1"]["hidden"] = false;
	$newAi["annotationfiles"]["1"]["owner"] = $_SESSION["ohv"]["user"]["name"];
	$newAi["annotationfiles"]["1"]["ownerId"] = (string)$_SESSION["ohv"]["user"]["id"];
	$newHV["annotation-increment"] = 1;

	file_put_contents($newHVdir."/annotations/_index.json",json_encode($newAi,$conf["settings"]["json_flags"]));
	file_put_contents($newHVdir."/annotations/1.json","[]");

	if ($subtitles) {
		foreach ($subtitles["name"] as $subtitleKey=>$subtitleName) {
			move_uploaded_file($subtitles["tmp_name"][$subtitleKey], $newHVdir."/subtitles/".$subtitleKey.".vtt");
		}
	}

	//file_put_contents($newHVdir."/hypervideo.json", json_encode(json_decode($src,true), $conf["settings"]["json_flags"]));
	file_put_contents($newHVdir."/hypervideo.json", $src);


	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Hypervideo has been added. look at response";
	$return["response"] = $src;
	$return["newHypervideoID"] = $hvi["hypervideo-increment"];
	return $return;
}

/**
 * @param $hypervideoID
 * @param $src:json
 * @return mixed
 *
Returning Code:
0		=	Success. Hypervideo has been cloned. Returning new Object in response
1		=	failed. User not logged in or inactive
3		=	failed. Could not find the resources folder
4		=	failed. Name (min 3 chars) has not been submitted.
5		=	failed. hypervideoID has not been found
 */
function hypervideoClone($hypervideoID, $src) {

	global $conf;
	$login = userCheckLogin();
	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {
		$file = new sharedFile($conf["dir"]["data"]."/users.json");
		$json = $file->read();
		$file->close();
		$u = json_decode($json,true);
		$_SESSION["ohv"]["user"] = array_replace_recursive($_SESSION["ohv"]["user"], $u["user"][$_SESSION["ohv"]["user"]["id"]]);
	}
	if (!is_dir($conf["dir"]["data"]."/resources")) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Could not find the resources folder";
		return $return;
	}

	$newHV = json_decode($src,true);

	if ((!$newHV["meta"]["name"]) || (strlen($newHV["meta"]["name"]) <3)) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "Name (min 3 chars) has not been submitted.";
		return $return;
	}

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/_index.json");
	$json = $file->read();
	$hvi = json_decode($json,true);
	if (!array_key_exists($hypervideoID,$hvi["hypervideos"])) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "hypervideoID seems to be wrong.";
		$file->close();
		return $return;
	}
	$hvi["hypervideo-increment"]++;
	mkdir($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]);
	copyr($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID], $conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]);
	$hvi["hypervideos"][$hvi["hypervideo-increment"]] = "./".$hvi["hypervideo-increment"];
	$file->writeClose(json_encode($hvi, $conf["settings"]["json_flags"]));

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/hypervideo.json");
	$json = $file->read();
	$newHV = json_decode($json,true);

	$time = time();

	/*
	$newHV["meta"]["creator"] = $_SESSION["ohv"]["projects"][$projectID]["user"]["name"];
	$newHV["meta"]["creatorId"] = (string)$_SESSION["ohv"]["projects"][$projectID]["user"]["id"];
	$newHV["meta"]["created"] = $time;
	$newHV["meta"]["lastchanged"] = $time;
	*/

	$fileA = new sharedFile($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotations/_index.json");
	$jsonA = $fileA->read();
	$annotationfiles = json_decode($jsonA,true);

	if ($annotationfiles["annotationfiles"]["1"]["ownerId"] != $_SESSION["ohv"]["user"]["id"]) {
		$tmpFound = 0;
		$oldAnnotationfiles = $annotationfiles["annotationfiles"];
		$newAnnotationfile = array();
		foreach ($oldAnnotationfiles as $k=>$v) {
			if ($v["ownerId"] == $_SESSION["ohv"]["user"]["id"]) {
				$tmpFound = 1;
				$newAnnotationfile["1"] = $v;
				rename($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotations/".$k.".json", $conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotations/1.json");
			} elseif ($k != 1) {
				unlink($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotations/".$k.".json");
			}
		}
		if ($tmpFound == 0) {
			file_put_contents($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotatios/1.json", "[]");
			$newAnnotationfile["1"]["name"] = $newHV["meta"]["name"];
			$newAnnotationfile["1"]["description"] = $newHV["meta"]["description"];
			$newAnnotationfile["1"]["hidden"] = false;
			$newAnnotationfile["1"]["owner"] = $_SESSION["ohv"]["user"]["name"];
			$newAnnotationfile["1"]["ownerId"] = (string)$_SESSION["ohv"]["user"]["id"];
		}
	} else {

		foreach ($newHV["annotationfiles"] as $k=>$v) {
			if ($k != 1) {
				unlink($conf["dir"]["data"] . "/hypervideos/" . $hvi["hypervideo-increment"] . "/annotations/" . $k . ".json");
			}
		}
		$newAnnotationfile["1"]["name"] = $newHV["meta"]["name"];
		$newAnnotationfile["1"]["description"] = $newHV["meta"]["description"];
		$newAnnotationfile["1"]["hidden"] = false;
		$newAnnotationfile["1"]["owner"] = $_SESSION["ohv"]["user"]["name"];
		$newAnnotationfile["1"]["ownerId"] = (string)$_SESSION["ohv"]["user"]["id"];
	}

	$tmpAnnotation["mainAnnotation"] = "1";
	$tmpAnnotation["annotation-increment"] = 1;
	$tmpAnnotation["annotationfiles"] = $newAnnotationfile;
	$tmpAnnotation["annotationfiles"]["1"]["created"] = $time;
	$tmpAnnotation["annotationfiles"]["1"]["lastchanged"] = $time;
	$fileA->writeClose(json_encode($tmpAnnotation, $conf["settings"]["json_flags"]));


	//$file->writeClose(json_encode(json_decode($src,true), $conf["settings"]["json_flags"]));
	$file->writeClose($src);
	/* TODO: How to handle annotation files? */

	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Hypervideo has been cloned. look at response";
	$return["response"] = $newHV;
	$return["newHypervideoID"] = $hvi["hypervideo-increment"];
	$return["clonedFrom"] = $hypervideoID;
	return $return;
}

/**
 * @param $hypervideoID
 * @param $hypervideoName
 * @return mixed
 *
Returning Code:
0		=	Success. Hypervideo deleted.
1		=	failed. Not logged in or User not active. see resp["string"]
3		=	failed. Could not find the hypervideosID folder
4		=	failed. hypervideoID could not be found in database.
5		=	failed. hypervideoName is not correct.
6		=	failed. permission denied! The User is not an admin, nor is it his own hypervideo.
 */
function hypervideoDelete($hypervideoID,$hypervideoName) {
	global $conf;

	$login = userCheckLogin();
	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {
		$file = new sharedFile($conf["dir"]["data"]."/users.json");
		$json = $file->read();
		$file->close();
		$u = json_decode($json,true);
		$_SESSION["ohv"]["user"] = array_replace_recursive($_SESSION["ohv"]["user"], $u["user"][$_SESSION["ohv"]["user"]["id"]]);
	}

	$json = file_get_contents($conf["dir"]["data"]."/users.json");
	$userdb = json_decode($json,true);
	$userdb["user"][$_SESSION["ohv"]["user"]["id"]]["id"] = $_SESSION["ohv"]["user"]["id"];
	$_SESSION["ohv"]["user"] = $userdb["user"][$_SESSION["ohv"]["user"]["id"]];


	if (!is_dir($conf["dir"]["data"]."/hypervideos/".$hypervideoID)) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Could not find the hypervideosID folder";
		return $return;
	}
	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/_index.json");
	$json = $file->read();
	$hvi = json_decode($json,true);

	if (!array_key_exists($hypervideoID,$hvi["hypervideos"])) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "hypervideoID could not be found in database.";
		$file->close();
		return $return;
	}

	$hv = json_decode(file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]."/hypervideo.json"),true);

	if (strtolower($hv["meta"]["name"]) != strtolower($hypervideoName)) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Hypervideo Name is not correct.";
		$file->close();
		return $return;
	}

	if (($_SESSION["ohv"]["user"]["role"] != "admin") && ($_SESSION["ohv"]["user"]["id"] != $hv["hypervideos"][$hypervideoID]["creatorId"])) {
		$return["status"] = "fail";
		$return["code"] = 6;
		$return["string"] = "Permission denied! The User is not an admin, nor is it his own hypervideo.";
		$file->close();
		return $return;
	}

	rrmdir($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]);
	unset($hvi["hypervideos"][$hypervideoID]);
	$file->writeClose(json_encode($hvi, $conf["settings"]["json_flags"]));
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Hypervideo deleted.";
	return $return;
}



/**
 * @param $hypervideoID
 * @param $src:json
 * @param $subtitlesToDelete:array
 * @param $subtitles:file
 * @return mixed
 *
Returning Code:
0		=	Success. File has been written
1		=	failed. Not logged in or User not active. see resp["string"]
3		=	failed. type not correct. ("overlays")
4		=	failed. HypervideoID not found.
5		=	failed. permission denied! The User is not an admin, nor is it his own hypervideo.
6		=	failed. $src too short (10)
 *
 */
function hypervideoChange($hypervideoID, $src, $subtitlesToDelete = false, $subtitles = false) {

	global $conf;
	$login = userCheckLogin();
	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {
		$file = new sharedFile($conf["dir"]["data"]."/users.json");
		$json = $file->read();
		$file->close();
		$u = json_decode($json,true);
		$_SESSION["ohv"]["user"] = array_replace_recursive($_SESSION["ohv"]["user"], $u["user"][$_SESSION["ohv"]["user"]["id"]]);
	}


	if (strlen($src) < 10) {
		$return["status"] = "fail";
		$return["code"] = 6;
		$return["string"] = "Hypervideo JSON has not been send.";
		return $return;
	}

	$json = file_get_contents($conf["dir"]["data"]."/hypervideos/_index.json");
	$hvi = json_decode($json,true);

	if ((!array_key_exists($hypervideoID,$hvi["hypervideos"])) || (!is_dir(realpath($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID])))) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "HypervideoID not found.";
		return $return;
	}

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]."/hypervideo.json");
	$json = $file->read();
	$hv = json_decode($json,true);

	if (($hv["meta"]["creatorId"] != $_SESSION["ohv"]["user"]["id"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Permission denied! The User is not an admin, nor is it his own hypervideo.";
		return $return;
	}

	if ($subtitlesToDelete) {
		foreach($subtitlesToDelete as $sd) {
			unlink($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/subtitles/".$sd.".vtt");
			/*foreach ($hv["subtitles"] as $sk=>$s) {
				if ($sd == $s["srclang"]) {
					unlink($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/subtitles/".$s["src"]);
				}
			} */
		}
	}
	if ($subtitles) {
		if (!is_dir($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/subtitles")) {
			mkdir($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/subtitles");
		}

		foreach ($subtitles["name"] as $subtitleKey=>$subtitleName) {
			/*$tmpFound = 0;
			foreach($hv["subtitles"] as $k=>$v) {
				if ($v["srclang"] == $subtitleKey) {
					$tmpFound++;
				}
			}
			if ($tmpFound === 0) {
				$tmpObj["src"] = $subtitleKey.".vtt";
				$tmpObj["srclang"] = $subtitleKey;
				$hv["subtitles"][] = $tmpObj;
			}*/
			move_uploaded_file($subtitles["tmp_name"][$subtitleKey], $conf["dir"]["data"]."/hypervideos/".$hypervideoID."/subtitles/".$subtitleKey.".vtt");
		}
	}

	//$file->writeClose(json_encode(json_decode($src,true), $conf["settings"]["json_flags"]));
	$file->writeClose($src);

	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Hypervideo #".$hypervideoID." has been changed.";
	return $return;
}
?>