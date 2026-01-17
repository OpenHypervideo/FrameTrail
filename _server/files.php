<?php

require_once("./config.php");
require_once("./user.php");
include_once("./opengraph.php");

/**
 * @param $type
 * @param $name
 * @param $description
 * @param $attributes
 * @param $files
 * @param $lat
 * @param $lon
 * @param $boundingBox
 * @return mixed
 *
Returning Code:
	0		=	Success. In $return["response"]["resource"] will the new JSON be returned. in $return["response"]["resId"] you can find the new ID
	1		=	failed. User is not logged in into the Project. Or User is not activated.
	3		= 	failed. Could not find the resources folder
	4		= 	failed. Type "image" was expected but the file wasn't transferred.
	5		= 	failed. Type "video" was expected but not both video files has been transferred.
	6		= 	failed. Type "video" was expected but attached File-Mimetypes seem to be incorrect.
	7		= 	failed. Type "map" was expected but $lat or $lon aren't send by parameter.
	8		= 	failed. $type or $name have not been transferred.
	9		= 	failed. $type was wrong.
	10		=	failed. File size too big.
	11		=	failed. Type "url" was expected but url is empty.
 *
 *
 */
function fileUpload($type, $name, $description="", $attributes, $files, $lat, $lon, $boundingBox) {
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
		exit;
	}

	if ((!$type) || (!$name) || ($name == "")) {
		$return["status"] = "fail";
		$return["code"] = 8;
		$return["string"] = "Name or Type have not been submitted.";
		return $return;
		exit;
	}

	if (!$attributes) {
		$attributes = new ArrayObject();
	}

	$max_upload = (int)(ini_get('upload_max_filesize'));
	$max_post = (int)(ini_get('post_max_size'));
	$memory_limit = (int)(ini_get('memory_limit'));
	$upload_mb = min($max_upload, $max_post, $memory_limit);

	$configjson = file_get_contents($conf["dir"]["data"]."/config.json");
	$configDB = json_decode($configjson, true);
	$uploadsAllowed = $configDB["allowUploads"];

	$cTime = time();
	$newResource["name"] = $name;
	$newResource["creator"] = (string)$_SESSION["ohv"]["user"]["name"];
	$newResource["creatorId"] = (string)$_SESSION["ohv"]["user"]["id"];
	$newResource["created"] = (int)$cTime;
	$newResource["description"] = $description;

	switch ($type) {
		case "url":
			
			$urlAttr = json_decode($attributes, true);

			if ( !$urlAttr["src"] || $urlAttr["src"] == "" ) {
				$return["status"] = "fail";
				$return["code"] = 11;
				$return["string"] = "Empty field: URL.";
				return $return;
				exit;
			}
			$newResource["src"] = $urlAttr["src"];
			$newResource["type"] = $urlAttr["type"];
			$newResource["attributes"] = $urlAttr["attributes"];
			$newResource["thumb"] = $urlAttr["thumb"];
		break;
		case "image":
			if ($uploadsAllowed === false) {
				$return["status"] = "fail";
				$return["code"] = 20;
				$return["string"] = "User not allowed to upload files";
				return $return;
				exit;
			}

			if ((!$files["image"]) || (!$files["image"]["size"])) {
				$return["status"] = "fail";
				$return["code"] = 4;
				$return["string"] = "No Image file to upload";
				return $return;
				exit;
			}

			// Validate file size
			$sizeValidation = validateFileSize($files["image"]["size"]);
			if (!$sizeValidation['valid']) {
				$return["status"] = "fail";
				$return["code"] = 10;
				$return["string"] = $sizeValidation['error'];
				return $return;
				exit;
			}

			// Check if optimization is enabled
			$configFile = $conf["dir"]["data"]."/config.json";
			$optimizationEnabled = false;
			if (file_exists($configFile)) {
				$configJson = file_get_contents($configFile);
				$config = json_decode($configJson, true);
				if (isset($config['mediaOptimization']['enabled'])) {
					$optimizationEnabled = $config['mediaOptimization']['enabled'];
				}
			}

			$filearray = preg_split("/\./", $files["image"]["name"]);
			$filetype = array_pop($filearray);

			// Preserve original file extension (GIF, PNG, JPG)
			$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_".sanitize($name),0,90).".".$filetype;
			$finalPath = $conf["dir"]["data"]."/resources/".$filename;

			// Move uploaded file to temporary location first
			$tempPath = $files["image"]["tmp_name"];

			if ($optimizationEnabled) {
				// Optimize the image
				$optimizeResult = optimizeImage($tempPath, $finalPath, 1920, 85);

				if (isset($optimizeResult['error'])) {
					// Optimization failed, fall back to original file
					error_log('FrameTrail: Image optimization failed: ' . $optimizeResult['error'] . ', saving original');
					move_uploaded_file($tempPath, $finalPath);
				}
				// If optimization succeeded, optimized file is already at $finalPath

				// Generate thumbnail
				$baseFilename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_thumb_".sanitize($name),0,90);
				$thumbFilename = $baseFilename.".png";
				$thumbPath = $conf["dir"]["data"]."/resources/".$thumbFilename;

				$thumbResult = generateThumbnail($finalPath, $thumbPath);
				if (isset($thumbResult['error'])) {
					error_log('FrameTrail: Thumbnail generation failed: ' . $thumbResult['error']);
					// Continue without thumbnail
				} else {
					$newResource["thumb"] = $thumbFilename;
				}
			} else {
				// No optimization, just move the file
				move_uploaded_file($tempPath, $finalPath);
			}

			$newResource["src"] = $filename;
			$newResource["type"] = "image";
			$newResource["attributes"] = ($attributes) ? $attributes : Array();
		break;
		case "pdf":
			if ($uploadsAllowed === false) {
				$return["status"] = "fail";
				$return["code"] = 20;
				$return["string"] = "User not allowed to upload files";
				return $return;
				exit;
			}

			if ((!$files["pdf"]) || (!$files["pdf"]["size"])) {
				$return["status"] = "fail";
				$return["code"] = 4;
				$return["string"] = "No PDF file to upload";
				return $return;
				exit;
			}

			// Validate file size
			$sizeValidation = validateFileSize($files["pdf"]["size"]);
			if (!$sizeValidation['valid']) {
				$return["status"] = "fail";
				$return["code"] = 10;
				$return["string"] = $sizeValidation['error'];
				return $return;
				exit;
			}

			$filearray = preg_split("/\./", $files["pdf"]["name"]);
			$filetype = array_pop($filearray);
			$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_".sanitize($name),0,90).".".$filetype;
			$newResource["src"] = $filename;
			$newResource["type"] = "pdf";
			$newResource["attributes"] = ($attributes) ? $attributes : Array();
			move_uploaded_file($files["pdf"]["tmp_name"], $conf["dir"]["data"]."/resources/".$filename);
		break;
		case "audio":
			if ($uploadsAllowed === false) {
				$return["status"] = "fail";
				$return["code"] = 20;
				$return["string"] = "User not allowed to upload files";
				return $return;
				exit;
			}

			if ((!$files["audio"]) || (!$files["audio"]["size"])) {
				$return["status"] = "fail";
				$return["code"] = 4;
				$return["string"] = "No audio file to upload";
				return $return;
				exit;
			}

			// Validate file size
			$sizeValidation = validateFileSize($files["audio"]["size"]);
			if (!$sizeValidation['valid']) {
				$return["status"] = "fail";
				$return["code"] = 10;
				$return["string"] = $sizeValidation['error'];
				return $return;
				exit;
			}

			$filearray = preg_split("/\./", $files["audio"]["name"]);
			$filetype = array_pop($filearray);
			$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_".sanitize($name),0,90).".".$filetype;
			$newResource["src"] = $filename;
			$newResource["type"] = "audio";
			$newResource["attributes"] = ($attributes) ? $attributes : Array();
			move_uploaded_file($files["audio"]["tmp_name"], $conf["dir"]["data"]."/resources/".$filename);
		break;
		case "video":
			if ($uploadsAllowed === false) {
				$return["status"] = "fail";
				$return["code"] = 20;
				$return["string"] = "User not allowed to upload files";
				return $return;
				exit;
			}
			if ( (!$_FILES["mp4"]) || (!$_FILES["mp4"]["size"]) ) {
				$return["status"] = "fail";
				$return["code"] = 5;
				$return["string"] = "Not enough video sources";
				return $return;
				exit;
			} else if ( (!in_array($_FILES["mp4"]["type"], array("video/mp4", "video/mpeg4"))) ) {
				$return["status"] = "fail";
				$return["code"] = 6;
				$return["string"] = "Wrong video file format";
				return $return;
				exit;
			}

			// Validate file size
			$sizeValidation = validateFileSize($_FILES["mp4"]["size"]);
			if (!$sizeValidation['valid']) {
				$return["status"] = "fail";
				$return["code"] = 10;
				$return["string"] = $sizeValidation['error'];
				return $return;
				exit;
			}

			$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_".sanitize($name),0,90);
			move_uploaded_file($files["mp4"]["tmp_name"], $conf["dir"]["data"]."/resources/".$filename.".mp4");
			$newResource["src"] = $filename.".mp4";
			$newResource["attributes"] = ($attributes) ? $attributes : Array();
			foreach ($files["subtitles"]["name"] as $k=>$v) {
				$filetype = array_pop(preg_split("/\./", $v));
				$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$cTime."_".sanitize($name),0,90)."_sub_".$k.".".$filetype;
				move_uploaded_file($files["subtitles"]["tmp_name"][$k], $conf["dir"]["data"]."/resources/".$filename);
				$newResource["subtitles"][$k] = $filename;
			}

			$newResource["type"] = "video";
		break;
		case "map":
			if ((!$lat) || (!$lon)) {
				$return["status"] = "fail";
				$return["code"] = 7;
				$return["string"] = "Lat or Lon are missing";
				return $return;
				exit;
			}
			$newResource["type"] = "location";
			$newResource["src"] = "";
			$newResource["attributes"] = ($attributes) ? $attributes : Array();
			$newResource["attributes"]["lat"] = $lat;
			$newResource["attributes"]["lon"] = $lon;
			$newResource["attributes"]["boundingBox"] = $boundingBox;
		break;
		default:
			$return["status"] = "fail";
			$return["code"] = 9;
			$return["string"] = "Type was not correct";
			return $return;
			exit;
		break;
	}
	$file = new sharedFile($conf["dir"]["data"]."/resources/_index.json");
	$json = $file->read();
	$res = json_decode($json,true);
	if (!$res["resources-increment"]) {
		$res["resources-increment"] = 0;
	}
	$res["resources-increment"]++;
	$res["resources"][$res["resources-increment"]] = $newResource;
	$file->writeClose(json_encode($res, $conf["settings"]["json_flags"]));

	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "File saved.";
	$return["response"]["resource"] = $newResource;
	$return["response"]["resId"] = $res["resources-increment"];
	return $return;
}

/**
 * @param $resourcesID
 * @param $thumb
 * @return mixed
 *
Returning Code:
0		=	Success. In $return["response"] will the full Object of manipulated Resource be returned.
1		=	failed. User is not logged in into the Project. Or User is not activated.
3		= 	failed. Could not find the resources folder
4		= 	failed. resourcesID or thumb are not transferred
5		= 	failed. No valid resourcesID
6		= 	failed. Not permitted. Its not your resource and you're not an admin!
 *
 */
function fileUploadThumb($resourcesID,$thumb) {
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
		exit;
	}

	if ((!$resourcesID) || (!$thumb) || ($thumb == "")) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "resourcesID or thumb are not transferred";
		return $return;
		exit;
	}
	$file = new sharedFile($conf["dir"]["data"]."/resources/_index.json");
	$json = $file->read();
	$res = json_decode($json,true);
	if (!is_array($res["resources"][$resourcesID])) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "No valid resourcesID";
		$return["response"] = $res;
		$file->close();
		return $return;
		exit;
	}
	if (($res["resources"][$resourcesID]["creatorId"] != $_SESSION["ohv"]["user"]["id"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
		$return["status"] = "fail";
		$return["code"] = 6;
		$return["string"] = "Not permitted. Its not your resource and you're not an admin!";
		$file->close();
		return $return;
		exit;
	}
	$thumb = str_replace('data:image/png;base64,', '', $thumb);
	//$_REQUEST["thumb"] = str_replace(' ', '+', $_REQUEST["thumb"]);
	//echo $_REQUEST["thumb"];
	$data = base64_decode($thumb);

	$filename = substr($_SESSION["ohv"]["user"]["id"]."_".$res["resources"][$resourcesID]["created"]."_thumb_".sanitize($res["resources"][$resourcesID]["name"]),0,90);
	file_put_contents($conf["dir"]["data"]."/resources/".$filename.".png", $data);

	$res["resources"][$resourcesID]["thumb"] = $filename.".png";
	$file->writeClose(json_encode($res, $conf["settings"]["json_flags"]));
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "thumb saved";
	$return["response"] = $res["resources"][$resourcesID];
	return $return;
}

/**
 * @param $resourcesID
 * @return mixed
 *
Returning Code:
0		=	Success. Resource and its thumbs have been deleted.
1		=	failed. User is not logged in or is inactive
2		=	failed. Could not find resources database (json)
3		= 	failed. resourcesID was not found. Missing or wrong ID
4		= 	failed. Not permitted. Its not your resource and you're no admin!
5		= 	failed. Resource is in use. Check out $return["used"] where
 *
 */
function fileDelete($resourcesID) {
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

	if (!file_exists($conf["dir"]["data"]."/resources/_index.json")) {
		$return["status"] = "fail";
		$return["code"] = 2;
		$return["string"] = "Could not find resources database";
		return $return;
		exit;
	}
	$file = new sharedFile($conf["dir"]["data"]."/resources/_index.json");
	$json = $file->read();
	$res = json_decode($json,true);
	if (!$res["resources"][$resourcesID]) {
		$return["status"] = "fail";
		$return["code"] = 3;
		$return["string"] = "No valid resoucesID";
		$file->close();
		return $return;
		exit;
	}
	if (($res["resources"][$resourcesID]["creatorId"] != $_SESSION["ohv"]["user"]["id"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
		$return["status"] = "fail";
		$return["code"] = 4;
		$return["string"] = "Not permitted. Its not your resource and you're no admin!";
		$file->close();
		return $return;
		exit;
	}


	$json = file_get_contents($conf["dir"]["data"]."/hypervideos/_index.json");
	$hv = json_decode($json,true);
	$usedcnt = 0;
	$used = array();
	foreach ($hv["hypervideos"] as $hvk=>$hvc) {
		$hvannotationJson = file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvk."/annotations/_index.json");
		$hvannotationIndex = json_decode($hvannotationJson,true);
		foreach ($hvannotationIndex["annotationfiles"] as $hvak=>$hvac) {
			$hvannotationFileJson = file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvk."/annotations/".$hvak.".json");
			$hvannotationFile = json_decode($hvannotationFileJson,true);
			foreach ($hvannotationFile as $hvannotationFileItem) {
				
				if ($hvannotationFileItem["body"]["frametrail:resourceId"] == $resourcesID) {
					$usedcnt++;
					$tmp = array();
					$tmp["hypervideoId"] = $hvk;
					$tmp["annotationfilesId"] = $hvak;
					$tmp["annotationfilesName"] = $hvac["name"];
					$tmp["type"] = "annotationsfile";
					$tmp["owner"] = $hvac["owner"];
					$tmp["ownerId"] = $hvac["ownerId"];
					array_push($used, $tmp);
				}
				
			}
		}
		
		$hvJson = file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvk."/hypervideo.json");
		$hvIndex = json_decode($hvJson,true);
		foreach ($hvIndex["contents"] as $hvcontentsKey=>$hvcontentsVal) {
			if ($hvcontentsVal["body"]["frametrail:resourceId"] == $resourcesID) {
				$usedcnt++;
				$tmp = array();
				$tmp["hypervideoId"] = $hvk;
				$tmp["type"] = $hvcontentsVal["frametrail:type"];
				$tmp["owner"] = $hvcontentsVal["creator"]["nickname"];
				$tmp["ownerId"] = $hvcontentsVal["creator"]["id"];
				array_push($used, $tmp);
			}
		}
		foreach ($hvIndex["clips"] as $hvclipsKey=>$hvclipsVal) {
			if ($hvclipsVal["resourceId"] == $resourcesID) {
				$usedcnt++;
				$tmp = array();
				$tmp["hypervideoId"] = $hvk;
				$tmp["type"] = "clip";
				$tmp["obj"] = $hvclipsVal;
				array_push($used, $tmp);
			}
		}
		
		
	}
	
	
	if ($usedcnt > 0) {
		$return["status"] = "fail";
		$return["code"] = 5;
		$return["string"] = "Resource is used";
		$return["usedCount"] = $usedcnt;
		$return["used"] = $used;
		$file->close();
		return $return;
		exit;
	}

	if ($res["resources"][$resourcesID]["type"] == "video") {
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"]);
		}
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"]);
		}
	} else if ($res["resources"][$resourcesID]["type"] == "image") {
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"]);
		}
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"]);
		}
	} else if ($res["resources"][$resourcesID]["type"] == "pdf") {
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["src"]);
		}
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"]);
		}
	} else {
		if (file_exists($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"])) {
			unlink($conf["dir"]["data"]."/resources/".$res["resources"][$resourcesID]["thumb"]);
		}
	}
	unset($res["resources"][$resourcesID]);
	$file->writeClose(json_encode($res, $conf["settings"]["json_flags"]));
	//$file->close();
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Resource deleted";
	return $return;
}

/**
 * @param $key
 * @param $condition
 * @param $values
 * @return mixed
 *
 *
Returning Code:
0		=	Success. Resource and its thumbs have been found
1		=	failed. Missing parameter
 *
 */
function fileGetByFilter($key,$condition,$values) {
	global $conf;
	if ((!$key) || (!$condition) || (!$values)) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = "Parameter missing!";
		return $return;
	}
	// allow string as values param
	if (is_string($values)) {
		$values = array($values);
	}
	$json = file_get_contents($conf["dir"]["data"]."/resources/_index.json");
	$res = json_decode($json,true);
	$return["result"] = Array();
	$return["resultCount"] = 0;
	foreach ($res["resources"] as $k=>$v) {
		$map = array(
			"==" => in_array($v[$key],$values),
			"!=" => !in_array($v[$key],$values),
			"<=" => $v[$key] <= $values[0],
			">=" => $v[$key] >= $values[0],
			"contains" => array_search($v[$key], $values) !== false
		);
		if ($map[$condition]) {
			$return["result"][$k] = $v;
			$return["resultCount"]++;
		}
	}
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "see result";
	return $return;
}

//fileGetUrlInfo("https://read.oecd-ilibrary.org/education/equity-in-education_9789264073234-en#page1");
/**
 * @param $url
 * @return mixed
 *
 *
Returning Code:
0		=	Success. URL Info successfully retrieved
1		=	failed. 
 *
 */
function fileGetUrlInfo($url) {
	
	$siteInfo = OpenGraph::fetch($url);

	stream_context_set_default( [
	  'ssl' => [
	      'verify_peer' => false,
	      'verify_peer_name' => false,
	  ],
	]);
	$headers = get_headers($url, 1);

	if (isset($headers["X-Frame-Options"])) {
		if (is_array($headers["X-Frame-Options"])) {
			end($headers["X-Frame-Options"]);
			$xFrameResult = current($headers["X-Frame-Options"]);
			reset($headers["X-Frame-Options"]);
		} else {
			$xFrameResult = $headers["X-Frame-Options"];
		}
	}

	$xFrameResult = strtolower((string)$xFrameResult);

	if ( $xFrameResult == 'sameorigin' || $xFrameResult == 'deny' || $siteInfo["status"] == "error" ) {
		$return["embed"] = "forbidden";
	} else {
		$return["embed"] = "allowed";
	}

	if ($siteInfo["status"] == "error") {
		$return["status"] = "error";
		$return["code"] = 1;
		$return["string"] = $siteInfo["string"];
		$return["urlInfo"] = false;
		return $return;
	} else {
		
		if (isAbsoluteUrl($siteInfo["result"]->image)) {
			$imagePath = $siteInfo["result"]->image;
		} else {
			$urlResult = parse_url($url);
			$imagePath = ($siteInfo["result"]->image) ? $urlResult['scheme']."://".$urlResult['host']."/".$siteInfo["result"]->image : null;
		}

		$return["status"] = "success";
		$return["code"] = 0;
		$return["string"] = "URL Info successfully retrieved";
		$return["urlInfo"] = Array();
		$return["urlInfo"]["title"] = $siteInfo["result"]->title;
		$return["urlInfo"]["image"] = $imagePath;
		$return["urlInfo"]["description"] = $siteInfo["result"]->description;
		return $return;
	}
}


function isAbsoluteUrl($url) {
    $pattern = "/^(?:ftp|https?|file)?:?\/\/(?:(?:(?:[\w\.\-\+!$&'\(\)*\+,;=]|%[0-9a-f]{2})+:)*
    (?:[\w\.\-\+%!$&'\(\)*\+,;=]|%[0-9a-f]{2})+@)?(?:
    (?:[a-z0-9\-\.]|%[0-9a-f]{2})+|(?:\[(?:[0-9a-f]{0,4}:)*(?:[0-9a-f]{0,4})\]))(?::[0-9]+)?(?:[\/|\?]
    (?:[\w#!:\.\?\+\|=&@$'~*,;\/\(\)\[\]\-]|%[0-9a-f]{2})*)?$/xi";

    return (bool) preg_match($pattern, $url);
}


/**
 *
 * Returns a file size limit in bytes based on the PHP upload_max_filesize and post_max_size
 * Credits: Drupal Developers, GPL license v2 or later
 *
 * @return int
 *
 */
function fileGetMaxUploadSize() {
	global $conf;

	static $max_size = -1;

	if ($max_size < 0) {
	    // Start with post_max_size.
	    $max_size = parse_size(ini_get('post_max_size'));

	    // If upload_max_size is less, then reduce. Except if upload_max_size is
	    // zero, which indicates no limit.
	    $upload_max = parse_size(ini_get('upload_max_filesize'));
	    if ($upload_max > 0 && $upload_max < $max_size) {
	    	$max_size = $upload_max;
	    }
	}

	$return["maxuploadbytes"] = $max_size;
	$return["status"] = "success";
	$return["code"] = 0;
	$return["string"] = "Max Upload Bytes received";
	return $return;
}

function parse_size($size) {
	$unit = preg_replace('/[^bkmgtpezy]/i', '', $size); // Remove the non-unit characters from the size.
	$size = preg_replace('/[^0-9\.]/', '', $size); // Remove the non-numeric characters from the size.
	
	if ($unit) {
		// Find the position of the unit in the ordered string which is the power of magnitude to multiply a kilobyte by.
		return round($size * pow(1024, stripos('bkmgtpezy', $unit[0])));
	} else {
		return round($size);
	}
}

/**
 * @param $configstring
 * @return mixed
 *
 * Returning Code:
 * 0	=	Success. Config file saved.
 * 1	=	failed. User is not logged in or is inactive or not admin (see resp["string"])
 * 2	=	failed. Config file not found or not writable
 * 3	= 	failed. Config string must be > 3 characters
 *
 */
function updateConfigFile($configstring) {
	
	global $conf;
	$login = userCheckLogin("admin");
	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {

		if (!is_writable($conf["dir"]["data"]."/config.json")) {
			$return["status"] = "fail";
			$return["code"] = 2;
			$return["string"] = "Config file (config.json) not writable.";
			return $return;
		}

		if ((strlen($_REQUEST["src"]) <3)) {
			$return["status"] = "fail";
			$return["code"] = 3;
			$return["string"] = "Config string length must be > 3 characters.";
			return $return;
		}

		$file = new sharedFile($conf["dir"]["data"]."/config.json");
		$src = json_decode($configstring, true);
		$jsonsrc = json_encode($src,$conf["settings"]["json_flags"]);
		$file->writeClose($jsonsrc);

		$return["status"] = "success";
		$return["code"] = 0;
		$return["string"] = "Config successfully saved.";
		return $return;

	}
}

/**
 * @param $cssstring
 * @return mixed
 *
 * Returning Code:
 * 0	=	Success. CSS file saved.
 * 1	=	failed. User is not logged in or is inactive or not admin (see resp["string"])
 * 2	=	failed. CSS file not found or not writable
 *
 */
function updateCSSFile($cssstring) {
	
	global $conf;
	$login = userCheckLogin("admin");
	if ($login["code"] != 1) {
		$return["status"] = "fail";
		$return["code"] = 1;
		$return["string"] = $login["string"];
		return $return;
	} else {

		if (!is_writable($conf["dir"]["data"]."/custom.css")) {
			$return["status"] = "fail";
			$return["code"] = 2;
			$return["string"] = "CSS file (custom.css) not writable.";
			return $return;
		}

		$file = new sharedFile($conf["dir"]["data"]."/custom.css");
		$file->writeClose($cssstring);

		$return["status"] = "success";
		$return["code"] = 0;
		$return["string"] = "CSS file successfully saved.";
		return $return;

	}
}

/**
 * Optimize an uploaded image
 * - Resize if larger than maxWidth
 * - Compress to specified quality
 * - Preserve format (JPEG, PNG, GIF)
 *
 * @param string $sourcePath Path to source image
 * @param string $destPath Path to save optimized image
 * @param int $maxWidth Maximum width (default 1920)
 * @param int $quality JPEG quality 0-100 (default 85), PNG compression 0-9 (default 6)
 * @return array Success/error response
 */
function optimizeImage($sourcePath, $destPath, $maxWidth = 1920, $quality = 85) {
	global $conf;

	// Check if GD library is available
	if (!function_exists('imagecreatefromjpeg')) {
		error_log('FrameTrail: GD library not available for image optimization');
		return ['error' => 'GD library not available'];
	}

	// Get image info
	$imageInfo = @getimagesize($sourcePath);
	if (!$imageInfo) {
		return ['error' => 'Invalid image file'];
	}

	$sourceImage = null;
	$imageType = $imageInfo['mime'];

	// Load source image based on type
	switch ($imageType) {
		case 'image/jpeg':
			$sourceImage = @imagecreatefromjpeg($sourcePath);
			break;
		case 'image/png':
			$sourceImage = @imagecreatefrompng($sourcePath);
			break;
		case 'image/gif':
			// Don't process GIFs - they may be animated
			// Just copy the original file
			copy($sourcePath, $destPath);
			return ['success' => true, 'resized' => false, 'preserved' => 'GIF (may be animated)'];
		default:
			return ['error' => 'Unsupported image type: ' . $imageType];
	}

	if (!$sourceImage) {
		return ['error' => 'Failed to load image'];
	}

	$width = imagesx($sourceImage);
	$height = imagesy($sourceImage);

	// Calculate new dimensions if resizing needed
	if ($width > $maxWidth) {
		$newWidth = $maxWidth;
		$newHeight = (int)(($height / $width) * $newWidth);

		// Create new image with calculated dimensions
		$destImage = imagecreatetruecolor($newWidth, $newHeight);

		// Preserve transparency for PNG
		if ($imageType === 'image/png') {
			imagealphablending($destImage, false);
			imagesavealpha($destImage, true);
			$transparent = imagecolorallocatealpha($destImage, 0, 0, 0, 127);
			imagefill($destImage, 0, 0, $transparent);
		}

		// Resample image
		imagecopyresampled($destImage, $sourceImage, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

		// Save in original format
		$saved = false;
		if ($imageType === 'image/jpeg') {
			$saved = imagejpeg($destImage, $destPath, $quality);
		} else if ($imageType === 'image/png') {
			// PNG compression level 0-9 (9 = maximum compression)
			$pngCompression = 6;
			$saved = imagepng($destImage, $destPath, $pngCompression);
		}

		imagedestroy($destImage);
		imagedestroy($sourceImage);

		if ($saved) {
			return ['success' => true, 'resized' => true, 'originalSize' => [$width, $height], 'newSize' => [$newWidth, $newHeight]];
		} else {
			return ['error' => 'Failed to save optimized image'];
		}
	} else {
		// Image is already small enough, just optimize compression
		$saved = false;
		if ($imageType === 'image/jpeg') {
			// Re-save JPEG with specified quality
			$saved = imagejpeg($sourceImage, $destPath, $quality);
		} else if ($imageType === 'image/png') {
			// Re-save PNG with compression
			$pngCompression = 6;
			$saved = imagepng($sourceImage, $destPath, $pngCompression);
		}

		imagedestroy($sourceImage);

		if ($saved) {
			return ['success' => true, 'resized' => false];
		} else {
			return ['error' => 'Failed to save optimized image'];
		}
	}
}

/**
 * Generate thumbnail for an image
 * - Creates a 400x300 thumbnail
 * - Saves as PNG to preserve transparency
 *
 * @param string $sourcePath Path to source image
 * @param string $thumbPath Path to save thumbnail
 * @return array Success/error response
 */
function generateThumbnail($sourcePath, $thumbPath) {
	global $conf;

	// Check if GD library is available
	if (!function_exists('imagecreatefromjpeg')) {
		error_log('FrameTrail: GD library not available for thumbnail generation');
		return ['error' => 'GD library not available'];
	}

	// Get image info
	$imageInfo = @getimagesize($sourcePath);
	if (!$imageInfo) {
		return ['error' => 'Invalid image file'];
	}

	$sourceImage = null;
	$imageType = $imageInfo['mime'];

	// Load source image based on type
	switch ($imageType) {
		case 'image/jpeg':
			$sourceImage = @imagecreatefromjpeg($sourcePath);
			break;
		case 'image/png':
			$sourceImage = @imagecreatefrompng($sourcePath);
			break;
		case 'image/gif':
			$sourceImage = @imagecreatefromgif($sourcePath);
			break;
		default:
			return ['error' => 'Unsupported image type: ' . $imageType];
	}

	if (!$sourceImage) {
		return ['error' => 'Failed to load image'];
	}

	$sourceWidth = imagesx($sourceImage);
	$sourceHeight = imagesy($sourceImage);

	// Target thumbnail dimensions (400x300 max, maintaining aspect ratio)
	$thumbWidth = 400;
	$thumbHeight = 300;

	// Calculate dimensions while maintaining aspect ratio
	$aspectRatio = $sourceWidth / $sourceHeight;
	if ($aspectRatio > ($thumbWidth / $thumbHeight)) {
		// Width is limiting factor
		$newWidth = $thumbWidth;
		$newHeight = (int)($thumbWidth / $aspectRatio);
	} else {
		// Height is limiting factor
		$newHeight = $thumbHeight;
		$newWidth = (int)($thumbHeight * $aspectRatio);
	}

	// Create thumbnail canvas
	$thumbImage = imagecreatetruecolor($newWidth, $newHeight);

	// Preserve transparency
	imagealphablending($thumbImage, false);
	imagesavealpha($thumbImage, true);
	$transparent = imagecolorallocatealpha($thumbImage, 0, 0, 0, 127);
	imagefill($thumbImage, 0, 0, $transparent);

	// Resample image to thumbnail size
	imagecopyresampled($thumbImage, $sourceImage, 0, 0, 0, 0, $newWidth, $newHeight, $sourceWidth, $sourceHeight);

	// Save as PNG (preserves transparency)
	$saved = imagepng($thumbImage, $thumbPath, 6);

	imagedestroy($thumbImage);
	imagedestroy($sourceImage);

	if ($saved) {
		return ['success' => true, 'thumbSize' => [$newWidth, $newHeight]];
	} else {
		return ['error' => 'Failed to save thumbnail'];
	}
}

/**
 * Validate file size against upload limits
 *
 * @param int $fileSize File size in bytes
 * @return array Valid/error response
 */
function validateFileSize($fileSize) {
	$maxUploadSize = fileGetMaxUploadSize();

	if ($fileSize > $maxUploadSize['maxuploadbytes']) {
		return [
			'valid' => false,
			'error' => 'File size (' . formatBytes($fileSize) . ') exceeds maximum upload size (' . formatBytes($maxUploadSize['maxuploadbytes']) . ')'
		];
	}

	return ['valid' => true];
}

/**
 * Format bytes to human-readable format
 *
 * @param int $bytes
 * @param int $precision
 * @return string
 */
function formatBytes($bytes, $precision = 2) {
	$units = ['B', 'KB', 'MB', 'GB', 'TB'];

	$bytes = max($bytes, 0);
	$pow = floor(($bytes ? log($bytes) : 0) / log(1024));
	$pow = min($pow, count($units) - 1);

	$bytes /= pow(1024, $pow);

	return round($bytes, $precision) . ' ' . $units[$pow];
}


?>