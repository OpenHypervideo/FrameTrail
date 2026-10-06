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
 * Whether this instance is private (config.alwaysForceLogin), so that nothing in it may be read without a session. Strict, like every other reader of the key: only a real true counts.
 *
 * @return bool
 */
function ftInstanceIsPrivate() {
    global $conf;

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (!file_exists($configFile)) {
        return false;
    }
    $cfg = json_decode(file_get_contents($configFile), true);

    return isset($cfg["alwaysForceLogin"]) && $cfg["alwaysForceLogin"] === true;
}

/**
 * Synchronise the "FrameTrail Private" access gate with config.alwaysForceLogin.
 *
 * The gate lives entirely inside the data directory as `_data/.htaccess`, an
 * Apache per-directory rewrite that routes every `_data/**` request through
 * `_server/serve.php` (which enforces a valid session). Keeping the gate inside
 * `_data/` means all instance-specific state stays in the (portable) data dir
 * and the shared app-root `.htaccess` is never touched.
 *
 * - Private (alwaysForceLogin === true): the file is written.
 * - Public: the file is deleted, so `_data/**` is served statically (no PHP
 *   overhead).
 *
 * The rewrite target is a root-relative URL derived from the current request,
 * so it works both at the document root and in a sub-directory install. Because
 * that URL encodes the app's base path, an external process that toggles privacy
 * without going through FrameTrail's PHP (e.g. linked.video's provisioning) must
 * write/delete this same `_data/.htaccess` with the correct base itself.
 *
 * Apache only (`.htaccess` is ignored by nginx). Requires `_data/` to be
 * writable — which it already is, since FrameTrail writes `config.json` there.
 *
 * @return bool True on success or when no change was needed; false on a
 *              write/delete failure.
 */
function ftSyncPrivacyRules() {
    global $conf;

    $configFile = $conf["dir"]["data"] . "/config.json";
    if (!file_exists($configFile)) {
        return false;
    }
    $cfg = json_decode(file_get_contents($configFile), true);
    $isPrivate = isset($cfg["alwaysForceLogin"]) && $cfg["alwaysForceLogin"] === true;

    // The gate file lives inside the data directory.
    $htaccessPath = $conf["dir"]["data"] . "/.htaccess";

    if (!$isPrivate) {
        // Public: remove the gate so _data/** is served statically.
        if (file_exists($htaccessPath)) {
            return @unlink($htaccessPath);
        }
        return true;
    }

    // Private: (re)write the gate. Derive the app's URL base from the current
    // request so the rewrite target is correct for sub-directory installs too.
    // ftSyncPrivacyRules() is always reached via _server/ajaxServer.php, so the
    // app base is two levels up from SCRIPT_NAME.
    $scriptName = isset($_SERVER["SCRIPT_NAME"]) ? $_SERVER["SCRIPT_NAME"] : "/_server/ajaxServer.php";
    $appBase    = str_replace("\\", "/", dirname(dirname($scriptName))); // "/" or "/subdir"
    $serveUrl   = rtrim($appBase, "/") . "/_server/serve.php";

    $content = "# This file is auto-generated by FrameTrail because this instance is\n"
             . "# private (config.alwaysForceLogin). It routes every _data request through\n"
             . "# a login gate. Delete this file (or set alwaysForceLogin=false) to make the\n"
             . "# instance public again — do not edit it by hand.\n"
             . "<IfModule mod_rewrite.c>\n"
             . "    RewriteEngine On\n"
             . "    RewriteRule ^(.*)$ " . $serveUrl . "?file=\$1 [L,QSA]\n"
             . "</IfModule>\n";

    // Idempotent: skip the write when the file is already identical.
    if (file_exists($htaccessPath) && file_get_contents($htaccessPath) === $content) {
        return true;
    }

    return file_put_contents($htaccessPath, $content) !== false;
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
 * I return the absolute path of a file in resources/, or null.
 *
 * Resource entries name their files (src, thumb), and those names end up in
 * unlink() when a resource is deleted. So a name is only trusted as a plain
 * file name that resolves to a file directly inside resources/ — never a path,
 * a dotfile or the resource index itself.
 *
 * @param $name
 * @return String|null
 */
function ftResourceFilePath($name) {

    global $conf;

    if (!is_string($name) || $name === "" || $name !== basename($name)
        || strpos($name, "\\") !== false || $name[0] === "." || $name === "_index.json") {
        return null;
    }

    $dir  = realpath($conf["dir"]["data"]."/resources");
    $path = ($dir === false) ? false : realpath($dir."/".$name);

    if ($path === false || dirname($path) !== $dir || !is_file($path)) {
        return null;
    }

    return $path;

}

/**
 * I fetch an http(s) URL on behalf of a request, and only from the public
 * internet.
 *
 * Redirects are followed here rather than by curl, so every hop is checked the
 * same way: http or https, and a host that resolves to public addresses only
 * (ftIsPublicHost() in auth.php). Otherwise any URL a visitor can type would
 * reach whatever this server can — localhost, the private network, a cloud
 * metadata endpoint — or, through curl's other protocols, the file system.
 *
 * @param $url
 * @param $timeout      seconds per hop
 * @param $maxBytes     the body is abandoned beyond this
 * @param $userAgent
 * @return Array|null   { status, body, contentType, headers, url } for the
 *                      final hop (header names lowercased), or null
 */
function ftFetchPublicUrl($url, $timeout = 15, $maxBytes = 10485760, $userAgent = 'FrameTrail/1.0') {

    for ($hop = 0; $hop <= 5; $hop++) {

        $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
        $host   = parse_url($url, PHP_URL_HOST);

        if (!in_array($scheme, array("http", "https"), true) || !$host || !ftIsPublicHost($host)) {
            return null;
        }

        $headers = array();

        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER  => true,
            CURLOPT_FOLLOWLOCATION  => false,
            CURLOPT_PROTOCOLS       => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_TIMEOUT         => $timeout,
            CURLOPT_CONNECTTIMEOUT  => min(5, $timeout),
            CURLOPT_SSL_VERIFYPEER  => false,
            CURLOPT_SSL_VERIFYHOST  => false,
            CURLOPT_USERAGENT       => $userAgent,
            CURLOPT_HEADERFUNCTION  => function ($ch, $line) use (&$headers) {
                $parts = explode(":", $line, 2);
                if (count($parts) === 2) {
                    $name  = strtolower(trim($parts[0]));
                    $value = trim($parts[1]);
                    if (isset($headers[$name])) {
                        $headers[$name] = array_merge((array)$headers[$name], array($value));
                    } else {
                        $headers[$name] = $value;
                    }
                }
                return strlen($line);
            },
            CURLOPT_NOPROGRESS       => false,
            CURLOPT_PROGRESSFUNCTION => function ($res, $expected, $got) use ($maxBytes) {
                return ($got > $maxBytes) ? 1 : 0;
            },
        ));

        $body   = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $type   = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $next   = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);

        if ($body === false) {
            return null;
        }

        if ($status >= 300 && $status < 400 && $next !== "") {
            $url = $next;
            continue;
        }

        return array(
            "status"      => $status,
            "body"        => $body,
            "contentType" => $type,
            "headers"     => $headers,
            "url"         => $url
        );
    }

    return null;

}

/**
 * A file held under an exclusive lock for a read-modify-write cycle.
 *
 * Opening takes the lock — creating the file first if it does not exist — and
 * keeps it until close(), writeClose() or the end of the object, so whatever is
 * read can be written back without losing a change made in between. The lock is
 * advisory (flock): it only excludes other writers that use this class, which is
 * why every shared data file is written through it.
 *
 * Writes replace the content in place (truncate, then write) instead of writing
 * a temporary file and renaming it over the old one: a rename would swap the
 * file out from under a process that is still waiting for the old file's lock.
 */
class sharedFile {

    /** @var resource|null */
    private $handle = null;

    /** @var string */
    private $path;

    /** @var bool Whether the file was there before it was opened here. */
    private $existed;

    /** @var bool */
    private $locked = false;

    /**
     * Open the file, creating it if needed, and wait for its exclusive lock.
     *
     * @param string $path
     */
    public function __construct($path) {

        $this->path    = $path;
        $this->existed = file_exists($path);

        if (!$this->existed) {
            @touch($path);
        }

        $handle = @fopen($path, "rb+");
        if ($handle !== false) {
            $this->handle = $handle;
            $this->locked = flock($handle, LOCK_EX);
        }

    }

    public function __destruct() {
        $this->close();
    }

    /**
     * @return bool Whether the file existed before this object opened it
     */
    public function exists() {
        return $this->existed;
    }

    /**
     * @return string
     */
    public function getFilename() {
        return $this->path;
    }

    /**
     * @return bool Whether the exclusive lock is held
     */
    public function isLocked() {
        return $this->locked;
    }

    /**
     * The whole content of the file.
     *
     * @return string|false false when the file could not be opened
     */
    public function read() {

        if ($this->handle === null) {
            return false;
        }

        rewind($this->handle);

        return stream_get_contents($this->handle);

    }

    /**
     * Same as read().
     *
     * @return string|false
     */
    public function get() {
        return $this->read();
    }

    /**
     * Replace the whole content of the file. Text that is not valid UTF-8 is
     * read as ISO-8859-1 and converted, so the data files stay UTF-8.
     *
     * @param string $data
     * @return bool Whether all of it was written
     */
    public function write($data) {

        if ($this->handle === null) {
            return false;
        }

        $data = (string)$data;
        if (!mb_check_encoding($data, "UTF-8")) {
            $data = mb_convert_encoding($data, "UTF-8", "ISO-8859-1");
        }

        if (!ftruncate($this->handle, 0) || !rewind($this->handle)) {
            return false;
        }

        $length  = strlen($data);
        $written = 0;
        while ($written < $length) {
            $bytes = fwrite($this->handle, substr($data, $written));
            if (!$bytes) {
                return false;
            }
            $written += $bytes;
        }

        fflush($this->handle);

        return true;

    }

    /**
     * Same as write().
     *
     * @param string $data
     * @return bool
     */
    public function set($data) {
        return $this->write($data);
    }

    /**
     * Write, then release the file.
     *
     * @param string $data
     * @return bool Whether all of it was written
     */
    public function writeClose($data) {
        $written = $this->write($data);
        $this->close();
        return $written;
    }

    /**
     * Release the lock and the file. Safe to call more than once.
     */
    public function close() {

        if ($this->handle === null) {
            return;
        }

        if ($this->locked) {
            flock($this->handle, LOCK_UN);
            $this->locked = false;
        }

        fclose($this->handle);
        $this->handle = null;

    }

}


?>