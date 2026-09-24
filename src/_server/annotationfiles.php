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
 * @param $hypervideoID
 * @param $annotationfileID
 * @param $action
 * @param $name
 * @param $description
 * @param $hidden
 * @param $src
 * @return mixed
 *
 * Returning Code:
 * 0       =   Success. File has been written.
 * 1       =   failed. Not logged in or user not active.
 * 4       =   failed. action not correct — expected "save" or "saveAs"
 * 5       =   failed. Name (min 3 chars) or description have not been submitted.
 * 6       =   failed. On save only — annotation with $id has not been found (in DB or as file).
 * 7       =   Permission denied. On save only — you are not the annotation's owner and not an administrator.
 * 8       =   failed. hypervideoID is not a hypervideo of this instance.
 */
function annotationfileSave($hypervideoID, $annotationfileID, $action, $name, $description, $hidden, $src) {
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

    $file = new sharedFile($hypervideoDir."/annotations/_index.json");
    $json = $file->read();
    $an = json_decode($json,true);

    // if (($action == "save") && ((!is_array($an["annotationfiles"][$annotationfileID])) || (!file_exists($hypervideoDir."/annotations/".$annotationfileID.".json")))) {
    //  $return["status"] = "fail";
    //  $return["code"] = 6;
    //  $return["string"] = "Annotation with id=".$annotationfileID." has not been found.";
    //  $file->close();
    //  return $return;
    // }

    // if (($action == "save") && (($_SESSION["ohv"]["user"]["id"] != $an["annotationfiles"][$annotationfileID]["ownerId"]) && ($_SESSION["ohv"]["user"]["role"] != "admin"))) {
    //  $return["status"] = "fail";
    //  $return["code"] = 7;
    //  $return["string"] = "Permission denied. You are not the annotations owner and no administrator!";
    //  $file->close();
    //  return $return;
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

    $fileStr = $hypervideoDir."/annotations/".$anID.".json";
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
