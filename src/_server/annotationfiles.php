<?php

require_once("./config.php");
require_once("./user.php");

/**
 * I return the folder of a hypervideo the index knows, or null.
 *
 * The id arrives in the request and would otherwise go straight into a path —
 * "../../somewhere" made annotation files, and the directories to hold them,
 * wherever the web server could write. So it is looked up instead of trusted:
 * only a key of hypervideos/_index.json maps to a folder, and the folder name
 * is the index's, never the request's. The same lookup hypervideoClone() and
 * hypervideoDelete() make.
 *
 * @param $hypervideoID
 * @return String|null
 */
function ftAnnotationHypervideoDir($hypervideoID) {

    global $conf;

    $index = json_decode((string)@file_get_contents($conf["dir"]["data"]."/hypervideos/_index.json"), true);

    if (!is_array($index) || !isset($index["hypervideos"]) || !is_array($index["hypervideos"])) {
        return null;
    }

    $key = (string)$hypervideoID;
    if ($key === "" || !array_key_exists($key, $index["hypervideos"])) {
        return null;
    }

    // The index stores "./<id>"; anything else is not a folder it created.
    $folder = preg_replace('#^\./#', '', (string)$index["hypervideos"][$key]);
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $folder)) {
        return null;
    }

    $dir = $conf["dir"]["data"]."/hypervideos/".$folder;

    return is_dir($dir) ? $dir : null;

}

/**
 * The entry of a user's annotation file in an annotations index, or null: under
 * "annotationfiles", else at the top level of the file, where local-folder mode
 * used to write it (FrameTrailSerializer.parseAnnotationIndex reads it alike).
 *
 * @param array  $index
 * @param string $fileID
 * @return array|null
 */
function ftAnnotationIndexEntry($index, $fileID) {

    $fileID = (string)$fileID;

    if (isset($index["annotationfiles"][$fileID]) && is_array($index["annotationfiles"][$fileID])) {
        return $index["annotationfiles"][$fileID];
    }
    if (!in_array($fileID, array("mainAnnotation", "annotation-increment", "annotationfiles"), true)
        && isset($index[$fileID]) && is_array($index[$fileID])) {
        return $index[$fileID];
    }

    return null;

}

/**
 * @param $hypervideoID
 * @param $annotationfileID
 * @param $action
 * @param $name
 * @param $description
 * @param $hidden
 * @param $src
 * @param $baseVersion  the lastchanged of the user's entry in annotations/_index.json the client loaded (0: it had none)
 * @return mixed
 *
 * The file is always the signed-in user's own (annotations/<userId>.json).
 *
 * Compare-and-swap: a save that carries a baseVersion is refused when the
 * user's file has been saved since (another tab, a script with an API token):
 * writing $src would erase that change. Without a baseVersion the file is
 * written as before. lastchanged is written in milliseconds and always moves
 * on, so two saves never share a token.
 *
 * Returning Code:
 * 0       =   Success. File has been written. response: { lastchanged, version }
 * 1       =   failed. Not logged in or user not active.
 * 4       =   failed. action not correct — expected "save" or "saveAs"
 * 5       =   failed. Name (min 3 chars) or description have not been submitted.
 * 7       =   failed. The file was saved by someone else since baseVersion. response: { lastchanged, version }
 * 8       =   failed. hypervideoID is not a hypervideo of this instance.
 */
function annotationfileSave($hypervideoID, $annotationfileID, $action, $name, $description, $hidden, $src, $baseVersion = null) {
    global $conf;

    if ($err = requireLogin()) return $err;

    $annotationfileID = $_SESSION["ohv"]["user"]["id"];

    $hypervideoDir = ftAnnotationHypervideoDir($hypervideoID);
    if ($hypervideoDir === null) {
        $return["status"] = "fail";
        $return["code"] = 8;
        $return["string"] = "hypervideoID is not a hypervideo of this instance.";
        return $return;
    }


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

    if (!is_dir($hypervideoDir."/annotations/")) {
        mkdir($hypervideoDir."/annotations/");
    }
    if (!file_exists($hypervideoDir."/annotations/_index.json")) {
        $tmp["mainAnnotation"] = $_SESSION["ohv"]["user"]["id"];
        $tmp["annotationfiles"] = (object)array();
        $annotationfileID = $_SESSION["ohv"]["user"]["id"];
        file_put_contents($hypervideoDir."/annotations/_index.json", json_encode($tmp,$conf["settings"]["json_flags"]));
    }

    include_once("collaboration.php");

    // Held until the index is written: the check, the annotation file and the
    // index change as one.
    $file = new sharedFile($hypervideoDir."/annotations/_index.json");
    $json = $file->read();
    $an = json_decode($json,true);
    if (!is_array($an)) {
        $an = array();
    }

    $anID    = (string)$annotationfileID;
    $entry   = ftAnnotationIndexEntry($an, $anID);
    $current = ($entry !== null && isset($entry["lastchanged"])) ? $entry["lastchanged"] : 0;

    if ($baseVersion !== null && $baseVersion !== "" && $current != $baseVersion) {
        $file->close();
        $return["status"]   = "fail";
        $return["code"]     = 7;
        $return["string"]   = "The annotations were saved elsewhere in the meantime.";
        $return["response"] = array(
            "lastchanged" => $current,
            "version"     => _collabAnnotationVersion($hypervideoID, $anID)
        );
        return $return;
    }

    $time = max((int)round(microtime(true) * 1000), (int)$current + 1);

    if ($hidden === "false") {
        $hidden = false;
    } elseif ($hidden === "true") {
        $hidden = true;
    }

    if ($action == "save" && $entry !== null && isset($entry["created"])) {
        $created = $entry["created"];
    } else {
        $created = time();
    }

    if (!isset($an["annotationfiles"]) || !is_array($an["annotationfiles"])) {
        $an["annotationfiles"] = array();
    }
    $previous = isset($an["annotationfiles"][$anID]) ? $an["annotationfiles"][$anID] : (($entry !== null) ? $entry : array());

    $an["annotationfiles"][$anID] = $previous;
    $an["annotationfiles"][$anID]["name"] = ($name) ? $name : (isset($previous["name"]) ? $previous["name"] : "");
    $an["annotationfiles"][$anID]["description"] = ($description) ? $description : (isset($previous["description"]) ? $previous["description"] : "");
    $an["annotationfiles"][$anID]["created"] = $created;
    $an["annotationfiles"][$anID]["lastchanged"] = $time;
    $an["annotationfiles"][$anID]["owner"] = $_SESSION["ohv"]["user"]["name"];
    $an["annotationfiles"][$anID]["ownerId"] = $_SESSION["ohv"]["user"]["id"];
    $an["annotationfiles"][$anID]["hidden"] = $hidden;

    // The entry says it once: a legacy top-level copy goes.
    if (!in_array($anID, array("mainAnnotation", "annotation-increment", "annotationfiles"), true) && isset($an[$anID]) && is_array($an[$anID])) {
        unset($an[$anID]);
    }

    // The annotation file first, then the index: whoever sees the new
    // lastchanged finds the file it belongs to.
    $fileStr = $hypervideoDir."/annotations/".$anID.".json";
    $annotationFile = new sharedFile($fileStr);
    $annotationFile->writeClose($src);

    $file->writeClose(json_encode($an, $conf["settings"]["json_flags"]));

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "File has been written";
    $return["annotationID"] = $anID;
    $return["response"] = array(
        "lastchanged" => $time,
        "version"     => _collabAnnotationVersion($hypervideoID, $anID)
    );
    return $return;
}

/**
 * @param $hypervideoID
 * @param $annotationfileID
 * @return mixed
 *
 * Returning Code:
 * 0       =   Success. Annotation file has been deleted.
 * 1       =   failed. Not logged in or user not active.
 * 3       =   failed. Could not find the annotations folder.
 * 4       =   failed. Annotation file is the main file and can't be deleted.
 * 5       =   failed. Annotation with id=$annotationfileID has not been found.
 * 7       =   Permission denied. You are not the annotation's owner and not an administrator.
 */
function annotationfileDelete($hypervideoID,$annotationfileID) {
    global $conf;

    if ($err = requireLogin()) return $err;

    $annotationfileID = $_SESSION["ohv"]["user"];

    // Same lookup as annotationfileSave(): an unknown id has no folder.
    $hypervideoDir = ftAnnotationHypervideoDir($hypervideoID);

    if ($hypervideoDir === null || !is_dir($hypervideoDir."/annotations")) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Could not find the annotations folder";
        return $return;
    }

    $file = new sharedFile($hypervideoDir."/annotations/_index.json");
    $hvannotationsIndexJson = $file->read();
    $hvannotationsIndex = json_decode($hvannotationsIndexJson,true);

    if ($hvannotationsIndex["mainAnnotation"] == $annotationfileID) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Annotation file is the main file and can't be deleted.";
        $file->close();
        return $return;
    }

    if ((!is_array($hvannotationsIndex["annotationfiles"][$annotationfileID])) || (!file_exists($hypervideoDir."/annotations/".$annotationfileID.".json"))) {
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "Annotation with id=".$annotationfileID." has not been found.";
        $file->close();
        return $return;
    }

    $currAnnotation = $hvannotationsIndex["annotationfiles"][$annotationfileID];

    // if (($_SESSION["ohv"]["user"]["id"] != $currAnnotation["ownerId"]) && ($_SESSION["ohv"]["user"]["role"] != "admin")) {
    //  $return["status"] = "fail";
    //  $return["code"] = 6;
    //  $return["string"] = "Permission denied. You are not the annotations owner and no administrator!";
    //  $file->close();
    //  return $return;
    // }

    unlink($hypervideoDir."/annotations/".$annotationfileID.".json");
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
 * 0        =   Success. All annotation files updated
 * 1        =   failed. Not logged in. Or User not active
 * 3        =   failed. Could not find the annotations folder
 * 5        =   failed. Permission denied
 */
function updateAnnotationSources($hypervideoID, $newSourcePath) {
    global $conf;

    if ($err = requireLogin()) return $err;

    // Resolved through the index like annotationfileSave(), not built from the
    // request: the files rewritten below are whatever this folder holds.
    $hypervideoDir = ftAnnotationHypervideoDir($hypervideoID);

    // Check if user is admin or hypervideo owner
    $hvFile = $hypervideoDir === null ? null : $hypervideoDir."/hypervideo.json";
    if ($hvFile === null || !file_exists($hvFile)) {
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

    $annotationsDir = $hypervideoDir."/annotations/";

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
