<?php

require_once("./config.php");
require_once("./user.php");

/**
 * @param $hypervideoID
 * @param $annotationfileID
 * @param $action
 * @param $name
 * @param $description
 * @param $hidden
 * @param $src
 * @return mixed
 *
 *
Returning Code:
0		=	Success. File has been written
1		=	failed. Not logged in. Or User not active
4		=	failed. action not correct! "save" or "saveAs"
5		=	failed. Name (min 3 chars) or Description have not been submitted.
6		=	failed. Just on Save - Annotation with $id has not been found. (in DB or as file)
7		=	Permission denied. Just on Save. You are not the annotations owner and no administrator!
 *
 */
function annotationfileSave($hypervideoID, $annotationfileID, $action, $name, $description, $hidden, $src) {
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

    $annotationfileID = $_SESSION["ohv"]["user"]["id"];


	if (($action != "save") && ($action != "saveAs")) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "action not correct!";
		return $return;
	}

	if ((!$description) || (!$name) || (strlen($name) <3)) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Name (min 3 chars) or Description have not been submitted.";
		return $return;
	}

	if (!is_dir($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/")) {
		mkdir($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/");
	}
	if (!file_exists($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/_index.json")) {
		$tmp["mainAnnotation"] = $_SESSION["ohv"]["user"]["id"];
		$tmp["annotationfiles"] = (object)array();
		$annotationfileID = $_SESSION["ohv"]["user"]["id"];
		file_put_contents($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/_index.json", json_encode($tmp,$conf["settings"]["json_flags"]));
	}

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/_index.json");
	$json = $file->read();
	$an = json_decode($json,true);

	// if (($action == "save") && ((!is_array($an["annotationfiles"][$annotationfileID])) || (!file_exists($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/".$annotationfileID.".json")))) {
	// 	$return["status"] = "fail";
	// 	$return["code"] = 6;
	// 	$return["string"] = "Annotation with id=".$annotationfileID." has not been found.";
	// 	$file->close();
	// 	return $return;
	// }

	// if (($action == "save") && (($_SESSION["ohv"]["user"]["id"] != $an["annotationfiles"][$annotationfileID]["ownerId"]) && ($_SESSION["ohv"]["user"]["role"] != "admin"))) {
	// 	$return["status"] = "fail";
	// 	$return["code"] = 7;
	// 	$return["string"] = "Permission denied. You are not the annotations owner and no administrator!";
	// 	$file->close();
	// 	return $return;
	// }
	$time = time();

	if ($hidden === "false") {
		$hidden = false;
	} elseif ($hidden === "true") {
		$hidden = true;
	}

	if ($action == "save") {
		$anID = $annotationfileID;
		$created = $an["annotationfiles"][$anID]["created"];
	} else {
		// $an["annotation-increment"]++;
		// $anID = $an["annotation-increment"];
        $anID = $annotationfileID;
		$created = $time;
	}

	$an["annotationfiles"][$anID]["name"] = ($name) ? $name : $an["annotationfiles"][$anID]["name"];
	$an["annotationfiles"][$anID]["description"] = ($description) ? $description : $an["annotationfiles"][$anID]["description"];
	$an["annotationfiles"][$anID]["created"] = $created;
	$an["annotationfiles"][$anID]["lastchanged"] = $time;
	$an["annotationfiles"][$anID]["owner"] = $_SESSION["ohv"]["user"]["name"];
	$an["annotationfiles"][$anID]["ownerId"] = $_SESSION["ohv"]["user"]["id"];
	$an["annotationfiles"][$anID]["hidden"] = $hidden;

	$file->writeClose(json_encode($an, $conf["settings"]["json_flags"]));

	$fileStr = $conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/".$anID.".json";
	if (($action == "saveAs") && (!file_exists($fileStr))) {
		file_put_contents($fileStr, "");
	}
	$file = new sharedFile($fileStr);
	/*$src = json_decode($src,true);
	$src = json_encode($src, $conf["settings"]["json_flags"]);
	*/
	$file->writeClose($src);
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "File has been written";
	$return["annotationID"] = $anID;
	$file->close();
	return $return;
}

/**
 * @param $hypervideoID
 * @param $annotationfileID
 * @return mixed
 *
Returning Code:
0		=	Success. File has been written
1		=	failed. Not logged in. Or User not active
3		=	failed. Could not find the annotations folder
4		=	failed. Annotationfile is Main-file and cant be deleted.
5		=	failed. Annotation with id=$annotationfileID has not been found.
7		=	Permission denied. Permission denied. You are not the annotations owner and no administrator!
 */
function annotationfileDelete($hypervideoID,$annotationfileID) {
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

    $annotationfileID = $_SESSION["ohv"]["user"];

	if (!is_dir($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations")) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Could not find the annotations folder";
		return $return;
	}

	$file = new sharedFile($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/_index.json");
	$hvannotationsIndexJson = $file->read();
	$hvannotationsIndex = json_decode($hvannotationsIndexJson,true);

	if ($hvannotationsIndex["mainAnnotation"] == $annotationfileID) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "Annotationfile is Main-file and cant be deleted.";
		$file->close();
		return $return;
	}

	if ((!is_array($hvannotationsIndex["annotationfiles"][$annotationfileID])) || (!file_exists($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/".$annotationfileID.".json"))) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Annotation with id=".$annotationfileID." has not been found.";
		$file->close();
		return $return;
	}

	$currAnnotation = $hvannotationsIndex["annotationfiles"][$annotationfileID];

	// if (($_SESSION["ohv"]["user"]["id"] != $currAnnotation["ownerId"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
	// 	$return["status"] = "fail";
	// 	$return["code"] = 6;
	// 	$return["string"] = "Permission denied. You are not the annotations owner and no administrator!";
	// 	$file->close();
	// 	return $return;
	// }

	unlink($conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/".$annotationfileID.".json");
	unset($hvannotationsIndex["annotationfiles"][$annotationfileID]);

	$file->writeClose(json_encode($hvannotationsIndex, $conf["settings"]["json_flags"]));

	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Annotations deleted.";



	return $return;
}


/**
 * Update target.source in all annotation files for a hypervideo
 * Called when the video source changes to maintain data consistency
 * 
 * @param $hypervideoID
 * @param $newSourcePath - The new video source path to set
 * @return mixed
 *
 * Returning Code:
 * 0		=	Success. All annotation files updated
 * 1		=	failed. Not logged in. Or User not active
 * 3		=	failed. Could not find the annotations folder
 * 5		=	failed. Permission denied
 */
function updateAnnotationSources($hypervideoID, $newSourcePath) {
	global $conf;

	$login = userCheckLogin();

	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	}

	// Check if user is admin or hypervideo owner
	$hvFile = $conf["dir"]["data"]."/hypervideos/".$hypervideoID."/hypervideo.json";
	if (!file_exists($hvFile)) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "Hypervideo not found";
		return $return;
	}

	$hvContent = json_decode(file_get_contents($hvFile), true);
	if (($hvContent["meta"]["creatorId"] != $_SESSION["ohv"]["user"]["id"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Permission denied! The User is not an admin, nor is it his own hypervideo.";
		return $return;
	}

	$annotationsDir = $conf["dir"]["data"]."/hypervideos/".$hypervideoID."/annotations/";

	if (!is_dir($annotationsDir)) {
		// No annotations directory - that's okay, nothing to update
		$return["status"] = "success";
		$return["code"] = 0;
		$return["string"] = "No annotations to update";
		$return["filesUpdated"] = 0;
		return $return;
	}

	$filesUpdated = 0;
	$files = glob($annotationsDir . "*.json");

	foreach ($files as $file) {
		$filename = basename($file);
		if ($filename === "_index.json") {
			continue;
		}

		$content = json_decode(file_get_contents($file), true);
		if (is_array($content)) {
			$modified = false;
			foreach ($content as &$annotation) {
				if (isset($annotation["target"]["source"])) {
					$annotation["target"]["source"] = $newSourcePath;
					$modified = true;
				}
			}
			if ($modified) {
				file_put_contents($file, json_encode($content, $conf["settings"]["json_flags"]));
				$filesUpdated++;
			}
		}
	}

	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Annotation sources updated";
	$return["filesUpdated"] = $filesUpdated;
	return $return;
}

?>
