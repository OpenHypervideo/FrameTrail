<?php

require_once("./config.php");
require_once("./user.php");

/**
 * @param $src
 * @param $subtitles
 * @return mixed
 *
 * Returning Code:
 * 0       =   Success. Hypervideo has been added. Returns new object in response.
 * 1       =   failed. User not logged in or inactive. See resp["string"]
 * 4       =   failed. Name (min 3 chars) has not been submitted.
 */
function hypervideoAdd($src, $subtitles = false) {

    global $conf;

    if ($err = requireLogin()) return $err;

    if (!is_dir($conf["dir"]["data"]."/resources")) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Could not find the project's resources folder";
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

    include_once("collaboration.php");
    collabRecordWrite("library", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["code"] = 0;
    $return["string"] = "Hypervideo has been added. Look at response.";
    $return["response"] = $src;
    $return["newHypervideoID"] = $hvi["hypervideo-increment"];
    return $return;
}

/**
 * @param $hypervideoID
 * @param $src:json
 * @return mixed
 *
 * Returning Code:
 * 0       =   Success. Hypervideo has been cloned. Returns new object in response.
 * 1       =   failed. User not logged in or inactive
 * 3       =   failed. Could not find the resources folder
 * 4       =   failed. Name (min 3 chars) has not been submitted.
 * 5       =   failed. hypervideoID has not been found
 */
function hypervideoClone($hypervideoID, $src) {

    global $conf;
    if ($err = requireLogin()) return $err;

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
            file_put_contents($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideo-increment"]."/annotations/1.json", "[]");
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


    include_once("collaboration.php");
    collabRecordWrite("library", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Hypervideo has been cloned. Look at response.";
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
 * Returning Code:
 * 0       =   Success. Hypervideo deleted.
 * 1       =   failed. Not logged in or user not active. See resp["string"]
 * 3       =   failed. Could not find the hypervideoID folder
 * 4       =   failed. hypervideoID could not be found in database.
 * 5       =   failed. hypervideoName is not correct.
 * 6       =   failed. Permission denied! The user is not an admin, nor is it their own hypervideo.
 */
function hypervideoDelete($hypervideoID,$hypervideoName) {
    global $conf;

    if ($err = requireLogin()) return $err;

    if (!is_dir($conf["dir"]["data"]."/hypervideos/".$hypervideoID)) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Could not find the hypervideoID folder";
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

    if (($_SESSION["ohv"]["user"]["role"] != "admin") && ($_SESSION["ohv"]["user"]["id"] != $hv["meta"]["creatorId"])) {
        $return["status"] = "fail";
        $return["code"] = 6;
        $return["string"] = "Permission denied! The User is not an admin, nor is it his own hypervideo.";
        $file->close();
        return $return;
    }

    rrmdir($conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]);
    unset($hvi["hypervideos"][$hypervideoID]);
    $file->writeClose(json_encode($hvi, $conf["settings"]["json_flags"]));

    include_once("collaboration.php");
    collabRecordWrite("library", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);
    // Nobody can be present in a hypervideo that no longer exists.
    collabForgetScope("hypervideo", $hypervideoID);

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
 * Returning Code:
 * 0       =   Success. File has been written.
 * 1       =   failed. Not logged in or user not active. See resp["string"]
 * 3       =   failed. Type not correct.
 * 4       =   failed. HypervideoID not found.
 * 5       =   failed. Permission denied! The user is not an admin, nor is it their own hypervideo.
 * 6       =   failed. $src too short (< 10 chars)
 */
function hypervideoChange($hypervideoID, $src, $subtitlesToDelete = false, $subtitles = false, $baseVersion = null) {

    global $conf;
    if ($err = requireLogin()) return $err;

    if (strlen($src) < 10) {
        $return["status"] = "fail";
        $return["code"] = 6;
        $return["string"] = "Hypervideo JSON has not been sent.";
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

    // Compare-and-swap: the client sends the meta.lastchanged it loaded. If the
    // file has moved on since then, someone else saved in the meantime and
    // writing $src verbatim would silently erase their work. A missing
    // baseVersion skips the check, so older clients keep working.
    if ($baseVersion !== null && $baseVersion !== "" && $hv["meta"]["lastchanged"] != $baseVersion) {
        $file->close();
        $return["status"]   = "fail";
        $return["code"]     = 7;
        $return["string"]   = "Hypervideo was changed by someone else.";
        $return["response"] = array(
            "lastchanged" => $hv["meta"]["lastchanged"],
            "creator"     => $hv["meta"]["creator"]
        );
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
    $hypervideoPath = $conf["dir"]["data"]."/hypervideos/".$hvi["hypervideos"][$hypervideoID]."/hypervideo.json";

    $file->writeClose($src);

    // Hand the writer the post-write version token. Without this the client
    // would keep the version it read before saving, immediately consider itself
    // stale, and notify the user about their own change.
    clearstatcache(true, $hypervideoPath);
    $newVersion = @filemtime($hypervideoPath);

    // Name the actual writer, so the staleness notice does not misattribute the
    // change to whoever happens to hold the lock.
    include_once("collaboration.php");
    collabRecordWrite("hypervideo", $hypervideoID,
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    // The library token spans every hypervideo.json, because a rename shows
    // up in the overview but never touches _index.json. Record there as well,
    // or the self-write suppression misses and authors are told about their
    // own save the moment they look at the overview.
    collabRecordWrite("library", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Hypervideo #".$hypervideoID." has been changed.";
    $return["response"] = array("version" => ($newVersion === false) ? null : $newVersion);
    return $return;
}

/**
 * @param $src:json  the complete overviewMap document
 * @param $baseVersion  the overviewMap.lastchanged the client loaded
 * @return mixed
 *
 * I write the overview map document into the hypervideo index.
 *
 * The map is content, not configuration: which hypervideos are on it and where
 * they sit belongs to the library, so it lives in _index.json next to the
 * hypervideos it places. Only the "overviewMap" key is replaced, under the
 * index file's own lock — hypervideoAdd/Clone/Delete touch "hypervideos" and
 * the increment, so the two can never clobber each other however stale either
 * client's copy of the file is.
 *
 * Returning Code:
 * 0       =   Success. Overview map has been written.
 * 1       =   failed. Not logged in, inactive, or not an admin.
 * 3       =   failed. $src is not a JSON object.
 * 7       =   failed. The map was changed by someone else.
 */
function overviewMapChange($src, $baseVersion = null) {

    global $conf;

    // Same gate as the config file: placing hypervideos on the shared overview
    // is an instance-wide act, not something a hypervideo's own author may do.
    if ($err = requireLogin("admin")) return $err;

    $newMap = json_decode($src, true);

    if (!is_array($newMap)) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Overview map JSON has not been sent.";
        return $return;
    }

    $indexPath = $conf["dir"]["data"]."/hypervideos/_index.json";

    $file = new sharedFile($indexPath);
    $hvi = json_decode($file->read(), true);

    if (!is_array($hvi)) {
        $hvi = array();
    }

    // Compare-and-swap on the map's own token, not on the index file as a
    // whole: a hypervideo added since we loaded is no reason to refuse a
    // marker drag.
    $currentChanged = isset($hvi["overviewMap"]["lastchanged"]) ? $hvi["overviewMap"]["lastchanged"] : null;

    if ($baseVersion !== null && $baseVersion !== ""
        && $currentChanged !== null && $currentChanged != $baseVersion) {
        $file->close();
        $return["status"]   = "fail";
        $return["code"]     = 7;
        $return["string"]   = "Overview map was changed by someone else.";
        $return["response"] = array("overviewMap" => $hvi["overviewMap"]);
        return $return;
    }

    $newMap["lastchanged"] = round(microtime(true) * 1000);

    // An empty markers object decodes to an empty PHP array and would be
    // re-encoded as [] — which the client reads back as "no map at all".
    if (!isset($newMap["markers"]) || !is_array($newMap["markers"])) {
        $newMap["markers"] = array();
    }
    if (count($newMap["markers"]) === 0) {
        $newMap["markers"] = new stdClass();
    }

    $hvi["overviewMap"] = $newMap;

    $file->writeClose(json_encode($hvi, $conf["settings"]["json_flags"]));

    clearstatcache(true, $indexPath);

    include_once("collaboration.php");
    collabRecordWrite("library", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Overview map has been changed.";
    // lastchanged is the compare-and-swap token for the map itself;
    // version is the mtime the collaboration poll compares against.
    $return["response"] = array(
        "lastchanged" => $newMap["lastchanged"],
        "version"     => @filemtime($indexPath)
    );
    return $return;
}
?>