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

    case "fileUpdate":
        include_once("files.php");
        $return = fileUpdate(
            $_REQUEST["resourcesID"],
            $_REQUEST["name"],
            $_REQUEST["licenseType"],
            $_REQUEST["licenseAttribution"]
        );
        break;

    case "fileDownloadFromUrl":
        include_once("files.php");
        $return = fileDownloadFromUrl($_REQUEST["url"], $_REQUEST["name"], $_REQUEST["licenseType"], $_REQUEST["licenseAttribution"]);
        break;

    case "fileGetByFilter":
        include_once("files.php");
        $return = fileGetByFilter($_REQUEST["key"],$_REQUEST["condition"],$_REQUEST["values"]);
        break;

    case "fileGetCapabilities":
        include_once("files.php");
        $return = fileGetCapabilities();
        break;

    case "fileGetUrlInfo":
        include_once("files.php");
        $return = fileGetUrlInfo($_REQUEST["url"]);
        break;

    case "fileGetWikipediaInfo":
        include_once("files.php");
        $return = fileGetWikipediaInfo($_REQUEST["url"]);
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

    case "updateAnnotationSources":
        include_once("annotationfiles.php");
        $return = updateAnnotationSources($_REQUEST["hypervideoID"],$_REQUEST["newSourcePath"]);
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

        if ( version_compare(phpversion(), '7.4.0', '<') ) {
            $return["status"] = "fail";
            $return["code"] = 2;
            $return["string"] = "Server does not meet the requirements. PHP version needs to be 7.4 or later (".phpversion()." is installed)";
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
            $return["string"] = "Setup not correct. No admin has been set.";
            echo json_encode($return);
            exit;
        }

        $return["status"] = "success";
        $return["code"] = 1;
        $return["string"] = "Setup finished.";

        break;

    case "setupCheckDetailed":

        // Only available before setup is complete
        $alreadySetup = file_exists($conf["dir"]["data"]."/users.json")
                     && file_exists($conf["dir"]["data"]."/config.json")
                     && file_exists($conf["dir"]["data"]."/tagdefinitions.json");

        if ($alreadySetup) {
            $return["status"] = "success";
            $return["alreadySetup"] = true;
            $return["checks"] = array();
            break;
        }

        $checks = array();

        // PHP version
        $phpOk = version_compare(phpversion(), '7.4.0', '>=');
        $checks["php"] = array(
            "pass"   => $phpOk,
            "label"  => "PHP Version",
            "detail" => $phpOk
                ? "PHP " . phpversion()
                : "PHP " . phpversion() . " found — 7.4+ required"
        );

        // Root directory writable (needed to create _data/)
        $rootWritable = file_exists($conf["dir"]["data"]) || is_writable("../");
        $checks["root_writable"] = array(
            "pass"   => $rootWritable,
            "label"  => "Root Directory",
            "detail" => $rootWritable
                ? "Writable"
                : "Not writable. Run: chmod 755 " . realpath("../")
        );

        // Data directory writable (if it already exists)
        if (file_exists($conf["dir"]["data"])) {
            $dataWritable = is_writable($conf["dir"]["data"]);
            $checks["data_writable"] = array(
                "pass"   => $dataWritable,
                "label"  => "Data Directory",
                "detail" => $dataWritable
                    ? "Writable"
                    : "Not writable. Run: chmod -R 775 " . realpath($conf["dir"]["data"])
            );
        } else {
            $checks["data_writable"] = array(
                "pass"   => true,
                "label"  => "Data Directory",
                "detail" => "Will be created during setup"
            );
        }

        // Upload limits — check whether .user.ini / .htaccess values took effect
        $iniToBytes = function($v) {
            $v = trim($v);
            $n = (int) $v;
            switch (strtolower(substr($v, -1))) {
                case 'g': return $n * 1073741824;
                case 'm': return $n * 1048576;
                case 'k': return $n * 1024;
            }
            return $n;
        };
        $actualUpload  = ini_get('upload_max_filesize');
        $actualPost    = ini_get('post_max_size');
        $uploadOk      = $iniToBytes($actualUpload) >= $iniToBytes('400M')
                      && $iniToBytes($actualPost)   >= $iniToBytes('900M');
        $checks["upload_limits"] = array(
            "pass"   => true,   // non-blocking — low limits don't prevent installation
            "warn"   => !$uploadOk,
            "label"  => "Upload Limits",
            "detail" => $uploadOk
                ? "upload_max_filesize=" . $actualUpload . ", post_max_size=" . $actualPost
                : "upload_max_filesize=" . $actualUpload . " (need 400M), post_max_size=" . $actualPost . " (need 900M) — the .user.ini / .htaccess settings haven't taken effect. Set these values in your server's php.ini or ask your hosting provider."
        );

        $allPass = true;
        foreach ($checks as $c) {
            if (!$c["pass"]) { $allPass = false; break; }
        }

        $_SESSION["setup_csrf"] = bin2hex(random_bytes(16));
        $return["status"]       = $allPass ? "success" : "fail";
        $return["checks"]       = $checks;
        $return["alreadySetup"] = false;
        $return["csrf"]         = $_SESSION["setup_csrf"];
        break;

    case "setupInit":
        // Guard: reject if setup has already been completed
        $alreadySetup = file_exists($conf["dir"]["data"]."/users.json")
                     && file_exists($conf["dir"]["data"]."/config.json")
                     && file_exists($conf["dir"]["data"]."/tagdefinitions.json");
        if ($alreadySetup) {
            $return["status"] = "fail";
            $return["code"]   = 0;
            $return["string"] = "Already installed";
            break;
        }
        // CSRF validation — token was issued by setupCheckDetailed and stored in session
        if (empty($_SESSION["setup_csrf"]) || $_REQUEST["csrf"] !== $_SESSION["setup_csrf"]) {
            $return["status"] = "fail";
            $return["code"]   = 0;
            $return["string"] = "Invalid request";
            break;
        }
        unset($_SESSION["setup_csrf"]); // one-time token — consume immediately
        // Input length limits
        if (strlen(isset($_REQUEST["passwd"]) ? $_REQUEST["passwd"] : '') > 1024
            || strlen(isset($_REQUEST["name"]) ? $_REQUEST["name"] : '') > 200) {
            $return["status"] = "fail";
            $return["code"]   = 2;
            $return["string"] = "Input too long";
            break;
        }
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
                "defaultTheme"=> "",
                "videoFit"=> "contain",
                "defaultLanguage"=> "en"
            );
            // Apply optional config overrides sent by the setup wizard
            $configOverrides = array("defaultUserRole", "userNeedsConfirmation",
                                     "alwaysForceLogin", "allowUploads", "defaultTheme",
                                     "defaultLanguage");
            foreach ($configOverrides as $key) {
                if (isset($_REQUEST[$key])) {
                    $val = $_REQUEST[$key];
                    if ($val === "true")  $val = true;
                    if ($val === "false") $val = false;
                    // Sanitize theme: allow only safe identifier characters
                    if ($key === "defaultTheme") { $val = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$val)); }
                    // Sanitize defaultLanguage: allow only 2-character lowercase codes
                    if ($key === "defaultLanguage") {
                        $val = preg_replace('/[^a-z]/', '', strtolower((string)$val));
                        if (strlen($val) !== 2) { $val = "en"; }
                    }
                    $tmpConf[$key] = $val;
                }
            }

            if (!file_put_contents($conf["dir"]["data"]."/config.json", json_encode($tmpConf,$conf["settings"]["json_flags"]))) {
                $errorCnt++;
            } else {
                // Write the _data/.htaccess privacy gate if the wizard set the
                // instance private (alwaysForceLogin), otherwise leave it off.
                ftSyncPrivacyRules();
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
    /*#########################################
     ############ oEmbed Proxy
     #########################################*/

    case "oembedProxy":
        // Proxy oEmbed requests for endpoints that don't support CORS (e.g. Bluesky)
        $allowedHosts = array("embed.bsky.app");
        $oembedUrl = isset($_REQUEST["url"]) ? $_REQUEST["url"] : "";
        $parsedHost = parse_url($oembedUrl, PHP_URL_HOST);
        if (!$oembedUrl || !$parsedHost || !in_array($parsedHost, $allowedHosts)) {
            $return["status"] = "error";
            $return["code"] = 403;
            $return["string"] = "URL not allowed";
        } else {
            $result = false;
            if (function_exists('curl_init')) {
                $ch = curl_init($oembedUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                curl_setopt($ch, CURLOPT_USERAGENT, 'FrameTrail/1.0');
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
                $result = curl_exec($ch);
                if (curl_errno($ch)) { $result = false; }
                curl_close($ch);
            }
            if ($result === false) {
                $context = stream_context_create(array("http" => array(
                    "timeout" => 5,
                    "header" => "User-Agent: FrameTrail/1.0\r\n"
                )));
                $result = @file_get_contents($oembedUrl, false, $context);
            }
            if ($result !== false) {
                $decoded = json_decode($result, true);
                if ($decoded) {
                    $return = $decoded;
                    $return["status"] = "success";
                } else {
                    $return["status"] = "error";
                    $return["code"] = 500;
                    $return["string"] = "Invalid JSON from oEmbed endpoint";
                }
            } else {
                $return["status"] = "error";
                $return["code"] = 502;
                $return["string"] = "Failed to fetch oEmbed URL";
            }
        }
        break;

    /*#########################################
     ############ Data Export (ZIP)
     #########################################*/

    case "dataExport":
        // Public by default (excludes users.json). When the instance is private
        // (config.alwaysForceLogin), require a valid session — otherwise this is
        // a trivial bypass of the _data read gate.
        $exportConfigFile = $conf["dir"]["data"] . "/config.json";
        $exportPrivate = false;
        if (file_exists($exportConfigFile)) {
            $exportCfg = json_decode(file_get_contents($exportConfigFile), true);
            $exportPrivate = isset($exportCfg["alwaysForceLogin"]) && $exportCfg["alwaysForceLogin"] === true;
        }
        if ($exportPrivate) {
            include_once("user.php");
            if ($err = requireLogin()) {
                http_response_code(403);
                echo json_encode($err, $conf["settings"]["json_flags"]);
                exit;
            }
        }
        if (!class_exists('ZipArchive')) {
            $return["status"] = "error";
            $return["code"]   = 500;
            $return["string"] = "ZipArchive not available on this server";
            break;
        }
        $dataDir = realpath($conf["dir"]["data"]);
        if (!$dataDir || !is_dir($dataDir)) {
            $return["status"] = "error";
            $return["code"]   = 500;
            $return["string"] = "Data directory not found";
            break;
        }
        $tmpFile = tempnam(sys_get_temp_dir(), "ft_export_");
        $zip = new ZipArchive();
        $zip->open($tmpFile, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dataDir, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $relativePath = substr($file->getPathname(), strlen($dataDir) + 1);
                if (basename($relativePath) === "users.json") { continue; }
                $zip->addFile($file->getPathname(), "_data/" . str_replace(DIRECTORY_SEPARATOR, "/", $relativePath));
            }
        }
        $zip->close();
        header("Content-Type: application/zip");
        header("Content-Disposition: attachment; filename=\"frametrail-data-export.zip\"");
        header("Content-Length: " . filesize($tmpFile));
        header("Cache-Control: no-cache");
        readfile($tmpFile);
        unlink($tmpFile);
        exit;

    default:
        $return["status"] = "success";
        $return["code"] = 0;
        $return["string"] = "No question? No answer!";
        break;
}

echo json_encode($return,$conf["settings"]["json_flags"]);