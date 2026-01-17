<?php

require_once("./config.php");

header('Cache-Control: no-cache, must-revalidate');
header('Expires: Mon, 26 Jul 2020 05:00:00 GMT');
header('Content-type: application/json');

$return["status"] = "fail";
$return["code"] = "404";
$return["string"] = "No action was taken";


switch($_REQUEST["a"]) {


	/*#########################################
	 ############ User Handling
	 #########################################*/

	case "userGet":
		include_once("user.php");
		$return = userGet($_REQUEST["userID"]);
		break;


	case "userRegister":
		include_once("user.php");
		$return = userRegister($_REQUEST["name"], $_REQUEST["mail"], $_REQUEST["passwd"]);
		break;


	case "userLogin":
		include_once("user.php");
		$return = userLogin($_REQUEST["mail"], $_REQUEST["passwd"]);
		break;


	case "userLogout":
		include_once("user.php");
		$return = userLogout();
		break;


	case "userCheckLogin":
		include_once("user.php");
		$return = userCheckLogin($_REQUEST["role"]);
		break;

	case "userChange":
		include_once("user.php");
		$return = userChange($_REQUEST["userID"],$_REQUEST["mail"],$_REQUEST["name"],$_REQUEST["passwd"],$_REQUEST["color"],$_REQUEST["role"],$_REQUEST["active"]);
		break;


	/*#########################################
	 ############ File Handling
	 #########################################*/

	case "fileUpload":
		include_once("files.php");
		$return = fileUpload($_REQUEST["type"],$_REQUEST["name"],$_REQUEST["description"],$_REQUEST["attributes"],$_FILES,$_REQUEST["lat"], $_REQUEST["lon"], $_REQUEST["boundingBox"]);
		break;

	case "fileUploadThumb":
		include_once("files.php");
		$return = fileUploadThumb($_REQUEST["resourcesID"],$_REQUEST["thumb"]);
		break;

	case "fileDelete":
		include_once("files.php");
		$return = fileDelete($_REQUEST["resourcesID"]);
		break;

	case "fileGetByFilter":
		include_once("files.php");
		$return = fileGetByFilter($_REQUEST["key"],$_REQUEST["condition"],$_REQUEST["values"]);
		break;

	case "fileGetMaxUploadSize":
		include_once("files.php");
		$return = fileGetMaxUploadSize();
		break;

	case "fileGetMediaOptimizationConfig":
		include_once("files.php");
		$return = fileGetMediaOptimizationConfig();
		break;

	case "fileGetUrlInfo":
		include_once("files.php");
		$return = fileGetUrlInfo($_REQUEST["url"]);
		break;


	/*#########################################
	 ############ Hypervideo Handling
	 #########################################*/

	case "hypervideoAdd":
		include_once("hypervideos.php");
		$return = hypervideoAdd($_REQUEST["src"], $_FILES["subtitles"]);
		break;

	case "hypervideoClone":
		include_once("hypervideos.php");
		$return = hypervideoClone($_REQUEST["hypervideoID"],$_REQUEST["src"]);
		break;

	case "hypervideoDelete":
		include_once("hypervideos.php");
		$return = hypervideoDelete($_REQUEST["hypervideoID"],$_REQUEST["hypervideoName"]);
		break;

	case "hypervideoChange":
	case "hypervideoChangeFile":

		include_once("hypervideos.php");
		$return = hypervideoChange($_REQUEST["hypervideoID"], $_REQUEST["src"], $_REQUEST["SubtitlesToDelete"], $_FILES["subtitles"]);
		break;





	/*#########################################
	 ############ Annotation Handling
	 #########################################*/
	case "annotationfileSave":
		include_once("annotationfiles.php");
		$return = annotationfileSave($_REQUEST["hypervideoID"],$_REQUEST["annotationfileID"],$_REQUEST["action"],$_REQUEST["name"],$_REQUEST["description"],$_REQUEST["hidden"],$_REQUEST["src"]);
		break;

	/**
	 * in case we need to provide an api interface for deleting annotations:
	 *
	case "annotationfileDelete":
		include_once("annotationfiles.php");
		$return = annotationfileDelete($_REQUEST["projectID"],$_REQUEST["hypervideoID"],$_REQUEST["annotationfileID"]);
		break;
	 *
	 */






	/*#########################################
	 ############ Tag Handling
	 #########################################*/

	case "tagSet":
		include_once("tags.php");
		$return = tagSet($_REQUEST["tagName"],$_REQUEST["lang"],$_REQUEST["label"],$_REQUEST["description"]);
		break;

	case "tagDelete":
		include_once("tags.php");
		$return = tagDelete($_REQUEST["tagName"]);
		break;

	case "tagLangDelete":
		include_once("tags.php");
		$return = tagLangDelete($_REQUEST["lang"]);
		break;

	/*#########################################
	 ############ Config File Handling
	 #########################################*/

	case "configChange":
		
		include_once("files.php");
		$return = updateConfigFile($_REQUEST["src"]);
		break;

	/*#########################################
	 ############ CSS File Handling
	 #########################################*/

	case "globalCSSChange":
		
		include_once("files.php");
		$return = updateCSSFile($_REQUEST["src"]);
		break;

	/*#########################################
	 ############ Setup Handling
	 #########################################*/

	case "setupCheck":

		if ( version_compare(phpversion(), '5.4.4', '<') ) {
			$return["status"] = "fail";
			$return["code"] = 2;
			$return["string"] = "Server does not meet the requirements. PHP version needs to be 5.4.4 or later (".phpversion()." is installed)";
			echo json_encode($return);
			exit;
		}
		
		if ( !file_exists($conf["dir"]["data"]) && !is_writable("../") ) {
			chmod("../", 0755);
			if ( !is_writable("../") ) {
				$return["status"] = "fail";
				$return["code"] = 3;
				$return["string"] = "Root directory not writable. Please change permissions (755) or create '_data' directory manually.";
				echo json_encode($return);
				exit;
			}
		}

		if ( !is_writable($conf["dir"]["data"]) ) {
			chmod($conf["dir"]["data"], 0755);
			if ( !is_writable($conf["dir"]["data"]) ) {
				$return["status"] = "fail";
				$return["code"] = 4;
				$return["string"] = "Data directory not writable or missing. Please change permissions (755).";
				echo json_encode($return);
				exit;
			}
		}

		if (
				!  (file_exists($conf["dir"]["data"]."/users.json"))
				|| (!file_exists($conf["dir"]["data"]."/config.json"))
				|| (!file_exists($conf["dir"]["data"]."/tagdefinitions.json"))
			) {
			$return["status"] = "fail";
			$return["code"] = 5;
			$return["string"] = "Setup not correct. Server was not able to write needed database files. Please retry.";
			echo json_encode($return);
			exit;
		}

		$usrTmp = json_decode(file_get_contents($conf["dir"]["data"]."/users.json"),true);
		$tmpAdminAvailable = 0;
		foreach ($usrTmp["user"] as $tmpUser) {
			if ($tmpUser["role"] == "admin") {
				$tmpAdminAvailable++;
			}
		}
		if ($tmpAdminAvailable == 0) {
			$return["status"] = "fail";
			$return["code"] = 6;
			$return["string"] = "Setup not correct. No Admin has been set";
			echo json_encode($return);
			exit;
		}

		$return["status"] = "success";
		$return["code"] = 1;
		$return["string"] = "Setup finished.";

	break;

	case "setupInit":
		$errorCnt = 0;
		if (!file_exists($conf["dir"]["data"]) && !is_dir($conf["dir"]["data"])) {
			if (!mkdir($conf["dir"]["data"])) {
				$errorCnt++;
			} else {
				chmod($conf["dir"]["data"], 0755);
			}
		}
		if ((!$_REQUEST["passwd"]) || (!filter_var($_REQUEST["mail"], FILTER_VALIDATE_EMAIL)) || (!$_REQUEST["name"])) {
			$return["status"] = "fail";
			$return["code"] = 2;
			$return["string"] = "Fill out all fields";
			echo json_encode($return);
			exit;
		}
		
		if (!file_exists($conf["dir"]["data"]."/config.json")) {
			$tmpColors = array("597081", "339966", "16a09c", "cd4436", "0073a6", "8b5180", "999933", "CC3399", "7f8c8d", "ae764d", "cf910d", "b85e02");

			$tmpConf = array(
				"updateServiceURL"=> "https://update.frametrail.org",
				"autoUpdate"=> false,
				"allowCaching"=> false,
				"defaultUserRole"=> "user",
				"captureUserTraces"=> false,
				"userTracesStartAction"=> "",
				"userTracesEndAction"=> "",
				"userNeedsConfirmation"=> true,
				"alwaysForceLogin"=> false,
				"allowCollaboration"=> false,
				"allowUploads"=> true,
				"theme"=> "",
				"defaultHypervideoHidden"=> false,
				"userColorCollection"=> $tmpColors,
				"videoFit"=> "contain"
			);
			if (!file_put_contents($conf["dir"]["data"]."/config.json", json_encode($tmpConf,$conf["settings"]["json_flags"]))) {
				$errorCnt++;
			}
		}

		mkdir($conf["dir"]["data"]."/hypervideos");
		mkdir($conf["dir"]["data"]."/resources");
		file_put_contents($conf["dir"]["data"]."/hypervideos/_index.json", json_encode(array("hypervideo-increment"=>0,"hypervideos"=>array())),$conf["settings"]["json_flags"]);
		file_put_contents($conf["dir"]["data"]."/resources/_index.json", json_encode(array("resources-increment"=>0,"resources"=>array())),$conf["settings"]["json_flags"]);
		file_put_contents($conf["dir"]["data"]."/tagdefinitions.json", "{}");
		file_put_contents($conf["dir"]["data"]."/custom.css", "");
		include_once("user.php");
		$userSuccess = userRegister($_REQUEST["name"],$_REQUEST["mail"],$_REQUEST["passwd"]);
		if ($userSuccess["code"] != 0) {
			$errorCnt++;
		}

		/*if (!file_exists($conf["dir"]["data"]."/users.json") && !is_dir($conf["dir"]["data"])) {
			if (!mkdir($conf["dir"]["data"])) {
				$errorCnt++;
			} else {
				chmod($conf["dir"]["data"], 0755);
			}
		}*/


		if ($errorCnt > 0) {
			$return["status"] = "fail";
			$return["code"] = 0;
			$return["string"] = "An error occurred. Please try again";
			rmdir($conf["dir"]["data"]);
		} else {
			$return["status"] = "success";
			$return["code"] = 1;
			$return["string"] = "Installation successful";
		}
		break;
	default:
		$return["status"] = "success";
		$return["code"] = 0;
		$return["string"] = "No question? No answer!";
		break;
}

echo json_encode($return,$conf["settings"]["json_flags"]);