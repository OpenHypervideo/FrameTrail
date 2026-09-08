<?php

require_once("./config.php");
require_once("./user.php");

/**
 * @param $tagName
 * @param $lang
 * @param $label
 * @param $description
 * @return mixed
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in.
 * 3       =   failed. Name too short.
 * 4       =   failed. Language not correct (must be 2 chars).
 * 5       =   failed. Label too short (min 4 chars).
 * 6       =   failed. Description too short (min 4 chars).
 */
function tagSet($tagName,$lang,$label,$description) {
    global $conf;

    if ($err = requireLogin("admin")) return $err;

    if (strlen($tagName)<2) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "Tag name must have at least 2 characters";
        return $return;
    }

    if (strlen($lang) != 2) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Language is not valid. Two characters expected";
        return $return;
    }

    if (strlen($label) < 4) {
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "Label must have at least 4 characters";
        return $return;
    }

    if (strlen($description) > 0 && strlen($description) < 4) {
        $return["status"] = "fail";
        $return["code"] = 6;
        $return["string"] = "Description must have at least 4 characters";
        return $return;
    }

    if (!file_exists($conf["dir"]["data"]."/tagdefinitions.json")) {
        file_put_contents($conf["dir"]["data"]."/tagdefinitions.json","{}");
    }

    $file = new sharedFile($conf["dir"]["data"]."/tagdefinitions.json");
    $json = $file->read();
    $t = json_decode($json,true);

    $t[$tagName][$lang]["label"] = $label;
    $t[$tagName][$lang]["description"] = $description;

    $t = json_encode($t, $conf["settings"]["json_flags"]);
    $file->writeClose($t);

    include_once("collaboration.php");
    collabRecordWrite("tags", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Tag has been saved";
    $return["response"] = json_decode($t,true);
    return $return;
}


/**
 * @param $tagName
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in.
 * 3       =   failed. tagdefinitions.json has not been found.
 * 4       =   failed. tagName was not submitted.
 */
function tagDelete($tagName) {
    global $conf;

    if ($err = requireLogin("admin")) return $err;

    if (!file_exists($conf["dir"]["data"]."/tagdefinitions.json")) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "tagdefinitions.json has not been found.";
        return $return;
    }

    if (!$tagName) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "tagName has not been submitted.";
        return $return;
    }

    $file = new sharedFile($conf["dir"]["data"]."/tagdefinitions.json");

    $json = $file->read();

    $t = json_decode($json,true);

    $tagFound["count"] = 0;

    $hvi = json_decode(file_get_contents($conf["dir"]["data"]."/hypervideos/_index.json"),true);
    foreach ($hvi["hypervideos"] as $hvd) {
        $hv = json_decode(file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvd."/hypervideo.json"),true);
        foreach($hv["contents"] as $hvc) {
            if (in_array($tagName, $hvc["frametrail:tags"])) {
                $tagFound["count"]++;
                $tagFoundTmp["hypervideo"] = $hvd;
                $tagFoundTmp["where"] = "overlay";
                $tagFoundTmp["type"] = $hvc["frametrail:type"];
                $tagFoundTmp["owner"] = $hvc["creator"];
                $tagFound["matches"][] = $tagFoundTmp;
            }
        }
        $ani = json_decode(file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvd."/annotations/_index.json"),true);
        foreach($ani["annotationfiles"] as $anifk=>$anif) {
            $anifc = json_decode(file_get_contents($conf["dir"]["data"]."/hypervideos/".$hvd."/annotations/".$anifk.".json"),true);
            foreach ($anifc as $anifck=>$anifcv) {
                if (in_array($tagName, $anifcv["frametrail:tags"])) {
                    $tagFound["count"]++;
                    $tagFoundTmp["hypervideo"] = $hvd;
                    $tagFoundTmp["where"] = "annotation";
                    $tagFoundTmp["type"] = $anifcv["frametrail:type"];
                    $tagFoundTmp["owner"] = $anifcv["creator"];
                    $tagFoundTmp["content"] = $anifcv;
                    $tagFound["matches"][] = $tagFoundTmp;
                }
            }
        }
    }

    if ($tagFound["count"] > 0) {
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "tagName is in use";
        $return["response"] = $tagFound;
        return $return;
    }


    unset($t[$tagName]);

    $t = json_encode($t, $conf["settings"]["json_flags"]);
    $file->writeClose($t);

    include_once("collaboration.php");
    collabRecordWrite("tags", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Tag has been removed";
    $return["response"] = json_decode($t,true);
    return $return;

}




/**
 * Remove one language from one tag. Removing a tag's last language removes the
 * tag itself, which is what the client's local-storage branch has always done.
 *
 * I used to take only $lang and strip that language from EVERY tag, while the
 * client called me meaning "this one tag" — so the two sides disagreed about
 * what the operation was. The UI never reached me, which is the only reason
 * that never destroyed anyone's definitions.
 *
 * @param $tagName
 * @param $lang
 *
 * Returning Code:
 * 0       =   Success. In $return["response"] you will find the tag definitions.
 * 1       =   failed. User is not logged in as admin.
 * 3       =   failed. tagdefinitions.json has not been found.
 * 4       =   failed. lang must be exactly 2 characters.
 * 5       =   failed. tagName was not submitted, or is not defined.
 */
function tagLangDelete($tagName, $lang) {
    global $conf;

    if (strlen($lang) != 2) {
        $return["status"] = "fail";
        $return["code"] = 4;
        $return["string"] = "Language code is not valid (must be exactly 2 characters)";
        return $return;
    }

    if (!isset($tagName) || strlen($tagName) == 0) {
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "Tag name has not been submitted.";
        return $return;
    }


    if ($err = requireLogin("admin")) return $err;

    if (!file_exists($conf["dir"]["data"]."/tagdefinitions.json")) {
        $return["status"] = "fail";
        $return["code"] = 3;
        $return["string"] = "tagdefinitions.json has not been found.";
        return $return;
    }



    $file = new sharedFile($conf["dir"]["data"]."/tagdefinitions.json");

    $json = $file->read();

    $t = json_decode($json,true);

    if (!is_array($t) || !array_key_exists($tagName, $t)) {
        $file->close();
        $return["status"] = "fail";
        $return["code"] = 5;
        $return["string"] = "Tag '".$tagName."' is not defined.";
        return $return;
    }

    unset($t[$tagName][$lang]);

    // A tag with no languages left has no label in any locale, so it could only
    // ever render as its raw id. Drop it rather than leave that behind.
    if (count($t[$tagName]) == 0) {
        unset($t[$tagName]);
    }

    $t = json_encode($t, $conf["settings"]["json_flags"]);
    $file->writeClose($t);

    include_once("collaboration.php");
    collabRecordWrite("tags", "global",
                      $_SESSION["ohv"]["user"]["id"], $_SESSION["ohv"]["user"]["name"]);

    $return["status"] = "success";
    $return["code"] = 0;
    $return["string"] = "Tag language has been removed";
    $return["response"] = json_decode($t,true);
    return $return;

}

?>