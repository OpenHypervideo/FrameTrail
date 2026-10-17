<?php

require_once("./config.php");
require_once("./user.php");

/**
 * Tags: _data/tagdefinitions.json, { "<id>": { "label": …, "description": … } }.
 *
 * Any signed-in user may add a tag (tagAdd), so whoever tags an annotation can
 * make the tag they need; only admins change or delete one (tagSet, tagDelete)
 * and see where tags are used (tagUsage). An id never changes once it is
 * written: items name tags by id, and annotation thumbnails carry the ids as
 * class names. Older files hold a label per language code; tagSet replaces
 * that with the one-label form.
 *
 * Every write happens under the file's exclusive lock and is recorded for the
 * collaboration scope tags/global, so an open Manage Tags dialog re-reads.
 */


/**
 * An id as items may name it: 2 to 64 characters, none that could break out
 * of the markup or JSON it ends up in. New ids are made by the client from
 * the label (FrameTrailSerializer.tagID); this also accepts the ids that
 * imports bring along from older files.
 *
 * @param mixed $tagName
 * @return bool
 */
function ftTagIdValid($tagName) {
    if (!is_string($tagName)) return false;
    $length = mb_strlen($tagName, "UTF-8");
    return $length >= 2 && $length <= 64 && !preg_match('/[\x00-\x1f<>"\'&]/', $tagName);
}

/**
 * The label and description of a request, trimmed, or the answer refusing
 * them: a label of 1 to 80 characters, a description of at most 1000.
 *
 * @param mixed $label
 * @param mixed $description
 * @return array [ "label" => …, "description" => … ] or a fail answer with "status"
 */
function ftTagText($label, $description) {

    $label       = trim((string)$label);
    $description = trim((string)$description);

    if ($label === "" || mb_strlen($label, "UTF-8") > 80) {
        return [ "status" => "fail", "code" => 4, "string" => "A label of 1 to 80 characters is required" ];
    }
    if (mb_strlen($description, "UTF-8") > 1000) {
        return [ "status" => "fail", "code" => 4, "string" => "The description may have at most 1000 characters" ];
    }

    return [ "label" => $label, "description" => $description ];

}

/**
 * The tag definitions in a locked file, as an object (PHP's [] for an empty
 * file becomes {}).
 *
 * @param sharedFile $file
 * @return stdClass
 */
function ftTagDefinitionsRead($file) {
    $t = json_decode((string)$file->read());
    return ($t instanceof stdClass) ? $t : new stdClass();
}

/**
 * Write the definitions, release the lock and record the write.
 *
 * @param sharedFile $file
 * @param stdClass $t
 * @return stdClass the definitions, for the answer
 */
function ftTagDefinitionsWrite($file, $t) {
    global $conf;

    $file->writeClose(json_encode($t, $conf["settings"]["json_flags"]));

    include_once("collaboration.php");
    collabRecordWrite("tags", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    return $t;
}

/**
 * The tag definitions file, created empty when missing.
 *
 * @return sharedFile
 */
function ftTagDefinitionsFile() {
    global $conf;
    $path = $conf["dir"]["data"]."/tagdefinitions.json";
    if (!file_exists($path)) {
        file_put_contents($path, "{}");
    }
    return new sharedFile($path);
}


/**
 * Add a tag. Open to every signed-in user; never changes a tag that exists.
 *
 * @param string $tagName the new tag's id
 * @param string $label
 * @param string $description
 * @return array
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in.
 * 3       =   failed. The id is not valid.
 * 4       =   failed. The label or the description is not valid.
 * 5       =   failed. A tag with this id exists. In $return["response"] you will find the tag definitions.
 */
function tagAdd($tagName, $label, $description) {

    if ($err = requireLogin()) return $err;

    if (!ftTagIdValid($tagName)) {
        return [ "status" => "fail", "code" => 3, "string" => "The tag id is not valid" ];
    }

    $text = ftTagText($label, $description);
    if (isset($text["status"])) return $text;

    $file = ftTagDefinitionsFile();
    $t    = ftTagDefinitionsRead($file);

    if (property_exists($t, $tagName)) {
        $file->close();
        return [
            "status"   => "fail",
            "code"     => 5,
            "string"   => "A tag with this id exists",
            "response" => $t,
        ];
    }

    $t->{$tagName} = (object)[ "label" => $text["label"], "description" => $text["description"] ];

    return [
        "status"   => "success",
        "code"     => 0,
        "string"   => "Tag has been added",
        "response" => ftTagDefinitionsWrite($file, $t),
    ];

}


/**
 * Set a tag's label and description, adding the tag when it is not there
 * (defining an id items already name, an import). A tag with a label per
 * language is written in the one-label form.
 *
 * @param string $tagName
 * @param string $label
 * @param string $description
 * @return array
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in as admin.
 * 3       =   failed. The id is not valid.
 * 4       =   failed. The label or the description is not valid.
 */
function tagSet($tagName, $label, $description) {

    if ($err = requireLogin("admin")) return $err;

    if (!ftTagIdValid($tagName)) {
        return [ "status" => "fail", "code" => 3, "string" => "The tag id is not valid" ];
    }

    $text = ftTagText($label, $description);
    if (isset($text["status"])) return $text;

    $file = ftTagDefinitionsFile();
    $t    = ftTagDefinitionsRead($file);

    $t->{$tagName} = (object)[ "label" => $text["label"], "description" => $text["description"] ];

    return [
        "status"   => "success",
        "code"     => 0,
        "string"   => "Tag has been saved",
        "response" => ftTagDefinitionsWrite($file, $t),
    ];

}


/**
 * Where tags are used: every id that an overlay, a code snippet or an
 * annotation of any hypervideo names, defined or not.
 *
 * @return array [ "<id>" => [ "count" => …, "hypervideos" => [ "<hypervideo id>", … ] ] ]
 */
function ftTagUsage() {
    global $conf;

    $usage = [];
    $base  = $conf["dir"]["data"]."/hypervideos/";
    $hvi   = json_decode((string)@file_get_contents($base."_index.json"), true);
    $index = (is_array($hvi) && isset($hvi["hypervideos"]) && is_array($hvi["hypervideos"])) ? $hvi["hypervideos"] : [];

    $count = function($items, $hypervideoID) use (&$usage) {
        if (!is_array($items)) return;
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item["frametrail:tags"]) || !is_array($item["frametrail:tags"])) continue;
            foreach (array_unique(array_filter($item["frametrail:tags"], "is_string")) as $tag) {
                if (!isset($usage[$tag])) $usage[$tag] = [ "count" => 0, "hypervideos" => [] ];
                $usage[$tag]["count"]++;
                if (!in_array((string)$hypervideoID, $usage[$tag]["hypervideos"], true)) {
                    $usage[$tag]["hypervideos"][] = (string)$hypervideoID;
                }
            }
        }
    };

    foreach ($index as $hypervideoID => $folder) {

        $dir = $base.preg_replace('#^\./#', '', (string)$folder);
        if (!is_dir($dir)) continue;

        $hv = json_decode((string)@file_get_contents($dir."/hypervideo.json"), true);
        if (is_array($hv) && isset($hv["contents"])) {
            $count($hv["contents"], $hypervideoID);
        }

        foreach (glob($dir."/annotations/*.json") ?: [] as $annotationFile) {
            if (basename($annotationFile) === "_index.json") continue;
            $count(json_decode((string)@file_get_contents($annotationFile), true), $hypervideoID);
        }

    }

    return $usage;

}


/**
 * Where tags are used, for Manage Tags.
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find what ftTagUsage() returns ({} when no tag is used).
 * 1       =   failed. User is not logged in as admin.
 */
function tagUsage() {

    if ($err = requireLogin("admin")) return $err;

    $usage = ftTagUsage();

    return [
        "status"   => "success",
        "code"     => 0,
        "string"   => "Tag usage",
        "response" => $usage ?: new stdClass(),
    ];

}


/**
 * Delete a tag's definition. Items that name it keep the id, which then shows
 * as a tag no longer defined. A tag in use is deleted only with $force, so a
 * caller that did not ask first cannot delete one by accident.
 *
 * @param string $tagName
 * @param mixed $force
 * @return array
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in as admin.
 * 3       =   failed. tagdefinitions.json has not been found.
 * 4       =   failed. tagName was not submitted.
 * 5       =   failed. The tag is in use and $force was not given. In $return["response"] you will find { count, hypervideos }.
 */
function tagDelete($tagName, $force = false) {
    global $conf;

    if ($err = requireLogin("admin")) return $err;

    if (!file_exists($conf["dir"]["data"]."/tagdefinitions.json")) {
        return [ "status" => "fail", "code" => 3, "string" => "tagdefinitions.json has not been found." ];
    }

    if (!is_string($tagName) || $tagName === "") {
        return [ "status" => "fail", "code" => 4, "string" => "tagName has not been submitted." ];
    }

    if (!$force || $force === "false" || $force === "0") {
        $usage = ftTagUsage();
        if (isset($usage[$tagName])) {
            return [
                "status"   => "fail",
                "code"     => 5,
                "string"   => "The tag is in use",
                "response" => $usage[$tagName],
            ];
        }
    }

    $file = ftTagDefinitionsFile();
    $t    = ftTagDefinitionsRead($file);

    unset($t->{$tagName});

    return [
        "status"   => "success",
        "code"     => 0,
        "string"   => "Tag has been removed",
        "response" => ftTagDefinitionsWrite($file, $t),
    ];

}

?>
