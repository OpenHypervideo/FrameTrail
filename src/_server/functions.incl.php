<?php
// HELPER FUNCTIONS


if ( !function_exists('mb_detect_encoding') ) {

// ----------------------------------------------------------------
    function mb_detect_encoding($string, $enc = null, $ret = null)
    {

        static $enclist = array(
            'UTF-8', 'ASCII',
            'ISO-8859-1', 'ISO-8859-2', 'ISO-8859-3', 'ISO-8859-4', 'ISO-8859-5',
            'ISO-8859-6', 'ISO-8859-7', 'ISO-8859-8', 'ISO-8859-9', 'ISO-8859-10',
            'ISO-8859-13', 'ISO-8859-14', 'ISO-8859-15', 'ISO-8859-16',
            'Windows-1251', 'Windows-1252', 'Windows-1254',
        );

        $result = false;

        foreach ($enclist as $item) {
            $sample = iconv($item, $item, $string);
            if (md5($sample) == md5($string)) {
                if ($ret === NULL) {
                    $result = $item;
                } else {
                    $result = true;
                }
                break;
            }
        }

        return $result;
    }
}


/**
 * Function: sanitize
 * Returns a sanitized string, typically for URLs.
 *
 * Parameters:
 *     $string - The string to sanitize.
 *     $force_lowercase - Force the string to lowercase?
 *     $anal - If set to *true*, will remove all non-alphanumeric characters.
 */
function sanitize($string, $force_lowercase = true, $anal = true)
{
    $strip = array("~", "`", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "=", "+", "[", "{", "]",
        "}", "\\", "|", ";", ":", "\"", "'", "&#8216;", "&#8217;", "&#8220;", "&#8221;", "&#8211;", "&#8212;",
        "â€”", "â€“", ",", "<", ".", ">", "/", "?");
    $clean = trim(str_replace($strip, "", strip_tags($string)));
    $clean = preg_replace('/[\s-]+/', "-", $clean);
    $clean = ($anal) ? preg_replace("/[^a-zA-Z0-9-]/", "", $clean) : $clean;
    return ($force_lowercase) ?
        (function_exists('mb_strtolower')) ?
            mb_strtolower($clean, 'UTF-8') :
            strtolower($clean) :
        $clean;
}

/**
 * Synchronise the "FrameTrail Private" rewrite block in the app-root .htaccess
 * with the current config.alwaysForceLogin setting.
 *
 * When the instance is private, a delimited rewrite block is inserted that
 * routes all _data/** requests through serve.php (which enforces a login).
 * When public, the block is removed so _data/** is served statically (fast).
 *
 * The block is delimited by BEGIN/END markers so it can be replaced or stripped
 * idempotently without disturbing the rest of the .htaccess (mime types, the
 * users.json deny rule, php_value settings, etc.).
 *
 * Only relevant on Apache (.htaccess is ignored by nginx). Requires the
 * app-root .htaccess (sibling of _server/ and _data/) to be writable.
 *
 * @return bool True on success or when no change was needed; false if the
 *              target .htaccess could not be written.
 */
function ftSyncPrivacyRules() {
    global $conf;

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (!file_exists($configFile)) {
        return false;
    }
    $cfg = json_decode(file_get_contents($configFile), true);
    $isPrivate = isset($cfg["alwaysForceLogin"]) && $cfg["alwaysForceLogin"] === true;

    // App-root .htaccess (parent of _server/).
    $htaccessPath = dirname(__DIR__) . "/.htaccess";

    $beginMarker = "# BEGIN FrameTrail Private";
    $endMarker   = "# END FrameTrail Private";

    $block = <<<'HTACCESS'
# BEGIN FrameTrail Private
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^_data/(.*)$ _server/serve.php?file=$1 [L,QSA]
</IfModule>
# END FrameTrail Private
HTACCESS;

    $current  = file_exists($htaccessPath) ? file_get_contents($htaccessPath) : "";
    $hasBlock = strpos($current, $beginMarker) !== false;

    // Already in the desired state — nothing to do.
    if (!$isPrivate && !$hasBlock) {
        return true;
    }

    // Remove any existing block (plus surrounding blank lines).
    $pattern  = '/\R*' . preg_quote($beginMarker, '/') . '.*?' . preg_quote($endMarker, '/') . '\R*/s';
    $stripped = preg_replace($pattern, "\n", $current);
    $stripped = rtrim($stripped);

    if ($isPrivate) {
        $newContent = ($stripped === "" ? "" : $stripped . "\n\n") . $block . "\n";
    } else {
        $newContent = $stripped . "\n";
    }

    if ($newContent === $current) {
        return true;
    }

    if (file_exists($htaccessPath) && !is_writable($htaccessPath)) {
        return false;
    }
    if (!file_exists($htaccessPath) && !is_writable(dirname($htaccessPath))) {
        return false;
    }

    return file_put_contents($htaccessPath, $newContent) !== false;
}

function rrmdir($dir) {
    if (is_dir($dir)) {
        $objects = scandir($dir);
        foreach ($objects as $object) {
            if ($object != "." && $object != "..") {
                if (filetype($dir."/".$object) == "dir") rrmdir($dir."/".$object); else unlink($dir."/".$object);
            }
        }
        reset($objects);
        rmdir($dir);
    }
}

/**
 * @param $source
 * @param $dest
 * Recursive copy of a dir
 */
function copyr($source, $dest) {
    if (is_dir($source)) {
        $dir_handle = opendir($source);
        while ($file = readdir($dir_handle)) {
            if ($file != "." && $file != "..") {
                if (is_dir($source."/".$file)) {
                    if (!is_dir($dest."/".$file)) {
                        mkdir($dest."/".$file);
                    }
                    copyr($source."/".$file, $dest."/".$file);
                } else {
                    copy($source."/".$file, $dest."/".$file);
                }
            }
        }
        closedir($dir_handle);
    } else {
        copy($source, $dest);
    }
}

/**
 * sharedFile class
 * @class           sharedFile
 * @file            shared/sharedFile.class.php
 * @brief           This class handles reading/writing a file with an exclusive lock
 * @version         0.1
 * @date            2012-06-28
 * @copyright       OpenSource : LGPLv3
 *
 * This class handles reading/writing a file with an exclusive lock
 */
class sharedFile{
    private $file;
    private $filename;
    private $fileExist;
    private $locked;

    /**
     * Constructor
     * @param string $file The file to read
     */
    public function __construct($file){
        $this->locked = false;
        $this->filename = $file;
        $this->fileExist = file_exists($file);

        //Trying to create file
        if($this->fileExist === false){
            touch($file);
        }

        $this->file = @fopen($file, "rb+");
        if($this->file !== false){
            $this->locked = flock($this->file, LOCK_EX);
        }
    }

    /**
     * Destructor : Perform a lock release if needed
     */
    public function __destruct(){
        $this->close();
    }

    /**
     * Get the existence state of the file
     * @return boolean True if the file exists, false otherwise
     */
    public function exists(){
        return $this->fileExist;
    }

    /**
     * Get the filename of the current watched file
     * @return string The filename
     */
    public function getFilename(){
        return $this->filename;
    }

    /**
     * Get the file content (alias of read function)
     * @return mixed False if there is an open or locked error, a string if the content was fully read
     */
    public function get(){
        return $this->read();
    }

    /**
     * Get the file content
     * @return mixed False if there is an open or locked error, a string if the content was fully read
     */
    public function read(){
        if($this->file === false && $this->locked !== true){
            return false;
        }

        //Start from beginning
        fseek($this->file, 0);
        $result = "";
        //Read data
        while(!feof($this->file)){
            $result .= fgets($this->file, 4096);
        }
        return $result;
    }

    /**
     * Set the file content (alias of write function)
     * @param string $data The data to store into file
     * @return boolean True if the data were saved, false otherwise.
     */
    public function set($data){
        return $this->write($data);
    }

    /**
     * Set the file content
     * @param string $data The data to store into file
     * @return boolean True if the data were saved, false otherwise.
     */
    public function write($data){
        if($this->file === false  && $this->locked !== true){
            return false;
        }

        //Clearing content and go back to first characters
        ftruncate($this->file, 0);
        rewind($this->file);

        //Save data (in UTF8 if possible)
        if(!mb_detect_encoding($data, "UTF-8", true)){
            fwrite($this->file, utf8_encode($data));
        }else{
            fwrite($this->file, $data);
        }
        fflush($this->file);
        return true;
    }

    /**
     * Write data to file, and close, send back the write state result
     * @param string $data The data to store into file
     * @return boolean True if the data were saved, false otherwise.
     */
    public function writeClose($data){
        $tmp = $this->write($data);
        $this->close();
        return $tmp;
    }

    /**
     * Get the lock state of the file
     * @return boolean True if the file is locked, false if the lock failed
     */
    public function isLocked(){
        return $this->locked;
    }

    /**
     * Close the opened file and release the lock
     */
    public function close(){
        if($this->locked === true){
            flock($this->file, LOCK_UN);
        }
        $this->locked = false;

        if(($this->file !== false) && (get_resource_type($this->file) === "stream")){
            fclose($this->file);
        }
    }
}


?>