#!/usr/bin/env php
<?php
/**
 * FrameTrail Data Migration Script
 *
 * Converts old _data directories to the current format.
 * Simulates "re-adding" all resources as if done through the current UI:
 * - Fetches fresh metadata from APIs (Wikipedia, OpenGraph)
 * - Downloads and caches thumbnails locally
 * - Normalizes all data structures to current format
 * - Upgrades http:// and // URLs to https://
 * - Validates output data integrity
 *
 * Usage:
 *   php scripts/migrate_data.php <source_dir> <output_dir> [--skip-thumbs]
 *   php scripts/migrate_data.php --all <source_base> <output_base> [--skip-thumbs]
 *
 * Dependencies:
 *   - PHP 7.4+ with curl and json extensions
 *   - GD extension (for thumbnail generation)
 *   - ffmpeg (optional, for video thumbnails)
 */

// ============================================================================
// CLI Argument Parsing
// ============================================================================

// Manual argument parsing (getopt doesn't handle mixed positional + flag args well)
$isAll = false;
$skipThumbs = false;
$fixOnly = false;
$args = [];

for ($i = 1; $i < count($argv); $i++) {
    $a = $argv[$i];
    if ($a === '--all') { $isAll = true; }
    elseif ($a === '--skip-thumbs') { $skipThumbs = true; }
    elseif ($a === '--fix-only') { $fixOnly = true; }
    elseif ($a[0] !== '-') { $args[] = $a; }
}

if ($isAll) {
    if (count($args) < 2) {
        fwrite(STDERR, "Usage: php migrate_data.php --all <source_base> <output_base> [--skip-thumbs] [--fix-only]\n");
        exit(1);
    }
    $sourceBase = rtrim($args[0], '/');
    $outputBase = rtrim($args[1], '/');
} else {
    if (count($args) < 2) {
        fwrite(STDERR, "Usage: php migrate_data.php <source_dir> <output_dir> [--skip-thumbs] [--fix-only]\n");
        fwrite(STDERR, "       php migrate_data.php --all <source_base> <output_base> [--skip-thumbs] [--fix-only]\n");
        exit(1);
    }
    $sourceDir = rtrim($args[0], '/');
    $outputDir = rtrim($args[1], '/');
}

// ============================================================================
// Configuration
// ============================================================================

define('JSON_FLAGS', JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
define('WIKI_RATE_LIMIT_US', 1000000); // 1 second between Wikipedia API calls
define('URL_RATE_LIMIT_US', 500000);   // 0.5 seconds between URL fetches
define('HTTP_TIMEOUT', 10);

$ffmpegPath = null; // detected lazily
$report = ['warnings' => [], 'errors' => []];

// Caches for API results (shared between resource and annotation processing)
$wikiCache = [];   // URL → wiki info array
$embedCache = [];  // URL → 'allowed'|'forbidden'

// Default config template (from ajaxServer.php setupInit)
$DEFAULT_CONFIG = [
    "updateServiceURL" => "https://update.frametrail.org",
    "autoUpdate" => false,
    "allowCaching" => false,
    "captureUserTraces" => false,
    "userTracesStartAction" => "",
    "userTracesEndAction" => "",
    "userNeedsConfirmation" => true,
    "alwaysForceLogin" => false,
    "allowUploads" => true,
    "theme" => "",
    "userColorCollection" => ["597081", "339966", "16a09c", "cd4436", "0073a6", "8b5180", "999933", "CC3399", "7f8c8d", "ae764d", "cf910d", "b85e02"],
    "videoFit" => "contain",
    "defaultLanguage" => "en"
];

// ============================================================================
// Utility Functions
// ============================================================================

function logInfo($msg) {
    fwrite(STDOUT, "  [INFO] $msg\n");
}

function logWarn($msg) {
    global $report;
    fwrite(STDOUT, "  [WARN] $msg\n");
    $report['warnings'][] = $msg;
}

function logError($msg) {
    global $report;
    fwrite(STDERR, "  [ERROR] $msg\n");
    $report['errors'][] = $msg;
}

function sanitize($string, $force_lowercase = true) {
    $strip = ["~", "`", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "=", "+", "[", "{", "]",
        "}", "\\", "|", ";", ":", "\"", "'", "&#8216;", "&#8217;", "&#8220;", "&#8221;", "&#8211;", "&#8212;",
        "\xe2\x80\x94", "\xe2\x80\x93", ",", "<", ".", ">", "/", "?"];
    $clean = trim(str_replace($strip, "", strip_tags($string)));
    $clean = preg_replace('/[\s-]+/', "-", $clean);
    $clean = preg_replace("/[^a-zA-Z0-9-]/", "", $clean);
    return $force_lowercase ?
        (function_exists('mb_strtolower') ? mb_strtolower($clean, 'UTF-8') : strtolower($clean)) :
        $clean;
}

/**
 * Upgrade URLs: http:// → https://, //host → https://host
 * Only for external URLs (not local filenames).
 */
function upgradeUrl($url) {
    if (empty($url)) return $url;
    $url = trim($url);
    // Protocol-relative → https
    if (preg_match('#^//[a-zA-Z]#', $url)) {
        return 'https:' . $url;
    }
    // http → https
    if (strpos($url, 'http://') === 0) {
        return 'https://' . substr($url, 7);
    }
    return $url;
}

function curlGet($url, $timeout = HTTP_TIMEOUT, $userAgent = 'FrameTrail/1.4 (https://github.com/OpenHypervideo/FrameTrail; code@frametrail.org;)') {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $response, 'code' => $httpCode];
}

function curlGetWithHeaders($url, $timeout = HTTP_TIMEOUT) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'FrameTrail/1.4');
    curl_setopt($ch, CURLOPT_HEADER, true);
    $response = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $headerStr = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    return ['body' => $body, 'code' => $httpCode, 'headers' => $headerStr];
}

/**
 * Force JSON encoding of an associative array as an object, even when keys are
 * sequential integers (which PHP would normally encode as a JSON array).
 */
function forceObject($data) {
    if (!is_array($data)) return $data;
    // If all keys are sequential integers starting from 0, PHP encodes as array.
    // We need to force object encoding by wrapping in stdClass or using JSON_FORCE_OBJECT
    // on just this value. We'll cast to object.
    $obj = new stdClass();
    foreach ($data as $k => $v) {
        $obj->{(string)$k} = $v;
    }
    return $obj;
}

// ============================================================================
// FFmpeg Detection
// ============================================================================

function detectFFmpeg() {
    global $ffmpegPath;
    if ($ffmpegPath !== null) return $ffmpegPath;

    $paths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'];
    foreach ($paths as $path) {
        @exec(escapeshellcmd($path) . ' -version 2>&1', $output, $returnCode);
        if ($returnCode === 0 && !empty($output) && stripos(implode(' ', $output), 'ffmpeg') !== false) {
            $ffmpegPath = $path;
            logInfo("FFmpeg found at: $path");
            return $path;
        }
        $output = [];
    }
    $ffmpegPath = false;
    return false;
}

// ============================================================================
// Thumbnail Functions
// ============================================================================

function generateImageThumbnail($sourcePath, $thumbPath, $maxWidth = 600) {
    if (!extension_loaded('gd')) return ['error' => 'GD not available'];

    $imageInfo = @getimagesize($sourcePath);
    if (!$imageInfo) return ['error' => 'Invalid image file'];

    $sourceImage = null;
    switch ($imageInfo['mime']) {
        case 'image/jpeg': $sourceImage = @imagecreatefromjpeg($sourcePath); break;
        case 'image/png':  $sourceImage = @imagecreatefrompng($sourcePath); break;
        case 'image/gif':  $sourceImage = @imagecreatefromgif($sourcePath); break;
        case 'image/webp': if (function_exists('imagecreatefromwebp')) $sourceImage = @imagecreatefromwebp($sourcePath); break;
        default: return ['error' => 'Unsupported image type: ' . $imageInfo['mime']];
    }
    if (!$sourceImage) return ['error' => 'Failed to load image'];

    $w = imagesx($sourceImage);
    $h = imagesy($sourceImage);
    $newW = min($w, $maxWidth);
    $newH = (int)($h * ($newW / $w));

    $thumb = imagecreatetruecolor($newW, $newH);
    imagealphablending($thumb, false);
    imagesavealpha($thumb, true);
    $transparent = imagecolorallocatealpha($thumb, 0, 0, 0, 127);
    imagefill($thumb, 0, 0, $transparent);
    imagecopyresampled($thumb, $sourceImage, 0, 0, 0, 0, $newW, $newH, $w, $h);
    $saved = imagepng($thumb, $thumbPath, 6);
    imagedestroy($thumb);
    imagedestroy($sourceImage);

    return $saved ? ['success' => true] : ['error' => 'Failed to save thumbnail'];
}

function generateVideoThumbnail($videoPath, $thumbPath) {
    $ffmpeg = detectFFmpeg();
    if (!$ffmpeg) return ['error' => 'FFmpeg not available'];

    // Get video duration
    $cmd = sprintf('%s -i %s 2>&1 | grep "Duration"', escapeshellcmd($ffmpeg), escapeshellarg($videoPath));
    exec($cmd, $output, $rc);

    $timeOffset = 2.0;
    if (!empty($output) && preg_match('/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/', $output[0], $m)) {
        $totalSeconds = (int)$m[1] * 3600 + (int)$m[2] * 60 + (float)$m[3];
        $timeOffset = $totalSeconds / 2.0;
    }

    $cmd = sprintf(
        '%s -ss %f -i %s -vframes 1 -vf "scale=\'min(600,iw)\':-2" %s 2>&1',
        escapeshellcmd($ffmpeg), $timeOffset, escapeshellarg($videoPath), escapeshellarg($thumbPath)
    );
    exec($cmd, $output2, $rc);

    return ($rc === 0 && file_exists($thumbPath)) ? ['success' => true] : ['error' => 'FFmpeg thumbnail failed'];
}

function downloadAndCacheThumbnail($imageUrl, $resourceName, $outputResDir, $creatorId, $timestamp) {
    if (empty($imageUrl) || !filter_var($imageUrl, FILTER_VALIDATE_URL)) {
        return ['error' => 'Invalid image URL'];
    }

    $result = curlGet($imageUrl, 15);
    if ($result['body'] === false || $result['code'] !== 200) {
        return ['error' => 'Failed to download image (HTTP ' . $result['code'] . ')'];
    }

    $tempPath = tempnam(sys_get_temp_dir(), 'ft_thumb_');
    file_put_contents($tempPath, $result['body']);

    $imageInfo = @getimagesize($tempPath);
    if (!$imageInfo || !in_array($imageInfo['mime'], ['image/jpeg', 'image/png', 'image/gif', 'image/webp'])) {
        unlink($tempPath);
        return ['error' => 'Not a valid image'];
    }

    if ($imageInfo[0] < 32 || $imageInfo[1] < 32) {
        unlink($tempPath);
        return ['error' => 'Image too small'];
    }

    $safeName = sanitize($resourceName);
    $thumbFilename = substr($creatorId . "_" . $timestamp . "_thumb_" . $safeName, 0, 90) . ".png";
    $thumbPath = $outputResDir . "/" . $thumbFilename;

    $genResult = generateImageThumbnail($tempPath, $thumbPath);
    unlink($tempPath);

    if (isset($genResult['error'])) {
        return ['error' => 'Thumbnail generation failed: ' . $genResult['error']];
    }

    return ['thumb' => $thumbFilename];
}

// ============================================================================
// OpenGraph Parser (simplified, standalone)
// ============================================================================

function fetchOpenGraph($url) {
    $result = curlGet($url, 15, 'Mozilla/5.0 (compatible; FrameTrail/1.4)');
    if ($result['body'] === false || $result['code'] !== 200) {
        return ['error' => 'Failed to fetch URL'];
    }

    $html = $result['body'];
    $old_libxml_error = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    @$doc->loadHTML($html);
    libxml_use_internal_errors($old_libxml_error);

    $tags = $doc->getElementsByTagName('meta');
    $og = [];
    $nonOgDesc = null;

    foreach ($tags as $tag) {
        if ($tag->hasAttribute('property') && strpos($tag->getAttribute('property'), 'og:') === 0) {
            $key = strtr(substr($tag->getAttribute('property'), 3), '-', '_');
            $og[$key] = $tag->getAttribute('content');
        }
        if ($tag->hasAttribute('value') && $tag->hasAttribute('property') && strpos($tag->getAttribute('property'), 'og:') === 0) {
            $key = strtr(substr($tag->getAttribute('property'), 3), '-', '_');
            $og[$key] = $tag->getAttribute('value');
        }
        if ($tag->hasAttribute('name') && $tag->getAttribute('name') === 'description') {
            $nonOgDesc = $tag->getAttribute('content');
        }
    }

    if (!isset($og['title'])) {
        $titles = $doc->getElementsByTagName('title');
        if ($titles->length > 0) $og['title'] = $titles->item(0)->textContent;
    }
    if (!isset($og['description']) && $nonOgDesc) {
        $og['description'] = $nonOgDesc;
    }

    // Fallback: twitter:image
    if (!isset($og['image'])) {
        foreach ($tags as $tag) {
            if ($tag->hasAttribute('name') && in_array($tag->getAttribute('name'), ['twitter:image', 'twitter:image:src'])) {
                $og['image'] = $tag->getAttribute('content');
                break;
            }
            if ($tag->hasAttribute('property') && in_array($tag->getAttribute('property'), ['twitter:image', 'twitter:image:src'])) {
                $og['image'] = $tag->getAttribute('content');
                break;
            }
        }
    }

    // Normalize image URL
    if (isset($og['image']) && $og['image']) {
        $og['image'] = ltrim($og['image'], '/');
        if (!filter_var($og['image'], FILTER_VALIDATE_URL)) {
            $parsed = parse_url($url);
            $og['image'] = $parsed['scheme'] . '://' . $parsed['host'] . '/' . $og['image'];
        }
    }

    return $og;
}

function checkEmbedStatus($url) {
    global $embedCache;
    $cacheKey = strtolower(trim($url));
    if (isset($embedCache[$cacheKey])) {
        return $embedCache[$cacheKey];
    }

    $result = curlGetWithHeaders($url);
    if ($result['code'] < 200 || $result['code'] >= 400) {
        $embedCache[$cacheKey] = 'unknown';
        return 'unknown';
    }

    $headers = $result['headers'];

    // Check X-Frame-Options
    if (preg_match('/^X-Frame-Options:\s*(.+)$/mi', $headers, $m)) {
        $xfo = strtolower(trim($m[1]));
        if ($xfo === 'sameorigin' || $xfo === 'deny') {
            $embedCache[$cacheKey] = 'forbidden';
            return 'forbidden';
        }
    }

    // Check CSP frame-ancestors
    if (preg_match('/^Content-Security-Policy:.*frame-ancestors\s+([^;]+)/mi', $headers, $m)) {
        if (trim($m[1]) !== '*') {
            $embedCache[$cacheKey] = 'forbidden';
            return 'forbidden';
        }
    }

    $embedCache[$cacheKey] = 'allowed';
    return 'allowed';
}

// ============================================================================
// Wikipedia API
// ============================================================================

function fetchWikipediaInfo($url) {
    global $wikiCache;
    $cacheKey = strtolower(trim($url));
    if (isset($wikiCache[$cacheKey])) {
        return $wikiCache[$cacheKey];
    }

    if (!preg_match('#^https?://([a-z]{2,3})\.(?:m\.)?wikipedia\.org/wiki/(.+?)(?:\#.*)?$#i', $url, $matches)) {
        $result = ['error' => 'Not a valid Wikipedia URL'];
        $wikiCache[$cacheKey] = $result;
        return $result;
    }

    $lang = strtolower($matches[1]);
    $title = $matches[2];

    // Decode the title first (it may already be percent-encoded from the URL),
    // then re-encode it properly to avoid double-encoding.
    $decodedTitle = rawurldecode($title);

    // Try the API up to 2 times (first failure may be rate limiting)
    for ($attempt = 0; $attempt < 2; $attempt++) {
        if ($attempt > 0) {
            logInfo("  Retrying Wikipedia API for '{$decodedTitle}' (attempt " . ($attempt + 1) . ")...");
            usleep(WIKI_RATE_LIMIT_US * 2); // longer delay on retry
        }

        $apiUrl = "https://{$lang}.wikipedia.org/api/rest_v1/page/summary/" . rawurlencode($decodedTitle);
        $result = curlGet($apiUrl);

        if ($result['body'] !== false && $result['code'] === 200) {
            $data = json_decode($result['body'], true);
            if ($data && !empty($data['title'])) {
                $info = [
                    'title'        => $data['title'],
                    'description'  => isset($data['description']) ? $data['description'] : '',
                    'extract'      => isset($data['extract']) ? $data['extract'] : '',
                    'extract_html' => isset($data['extract_html']) ? $data['extract_html'] : '',
                    'image'        => null,
                    'articleUrl'   => isset($data['content_urls']['desktop']['page']) ? $data['content_urls']['desktop']['page'] : $url,
                    'wikiLang'     => $lang,
                    'dir'          => isset($data['dir']) ? $data['dir'] : 'ltr'
                ];

                if (!empty($data['thumbnail']['source'])) {
                    $info['image'] = $data['thumbnail']['source'];
                } elseif (!empty($data['originalimage']['source'])) {
                    $info['image'] = $data['originalimage']['source'];
                }

                $wikiCache[$cacheKey] = $info;
                return $info;
            }
        }
    }

    $errResult = ['error' => 'Wikipedia API request failed (HTTP ' . $result['code'] . ') for ' . $lang . ':' . $title];
    $wikiCache[$cacheKey] = $errResult;
    return $errResult;
}

// ============================================================================
// Resource Migration Handlers
// ============================================================================

function migrateResourceWikipedia($resource, $oldResDir, $newResDir) {
    $src = $resource['src'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];
    $name = $resource['name'];

    $resource['attributes'] = new stdClass();
    $resource['thumb'] = null;

    $info = fetchWikipediaInfo($src);
    if (isset($info['error'])) {
        logWarn("Resource '{$name}' (wikipedia): API failed: " . $info['error']);
        return $resource;
    }

    $resource['attributes'] = [
        'extract'      => $info['extract'],
        'extract_html' => $info['extract_html'],
        'description'  => $info['description'],
        'articleUrl'   => $info['articleUrl'],
        'wikiLang'     => $info['wikiLang'],
        'dir'          => $info['dir']
    ];

    if (!empty($info['image'])) {
        $cached = downloadAndCacheThumbnail($info['image'], $name, $newResDir, $creatorId, $timestamp);
        if (!isset($cached['error'])) {
            $resource['thumb'] = $cached['thumb'];
        } else {
            logWarn("Resource '{$name}' (wikipedia): thumbnail cache failed: " . $cached['error']);
            $resource['thumb'] = $info['image']; // fallback to external URL
        }
    }

    usleep(WIKI_RATE_LIMIT_US);
    return $resource;
}

function migrateResourceYoutube($resource, $oldResDir, $newResDir) {
    $src = $resource['src'];
    $name = $resource['name'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];

    $resource['attributes'] = new stdClass();

    // Extract video ID from various YouTube URL formats
    $videoId = null;
    $patterns = [
        '/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/',
    ];
    foreach ($patterns as $p) {
        if (preg_match($p, $src, $m)) {
            $videoId = $m[1];
            break;
        }
    }

    if (!$videoId) {
        logWarn("Resource '{$name}' (youtube): could not extract video ID from: $src");
        return $resource;
    }

    // Extract timecode if present
    $tcString = '';
    if (preg_match('/[?&#](?:t|start)=([0-9]+)/', $src, $tc)) {
        $tcString = '?start=' . $tc[1];
    }

    $resource['src'] = "https://www.youtube.com/embed/" . $videoId . $tcString;

    $thumbUrl = "https://img.youtube.com/vi/" . $videoId . "/hqdefault.jpg";
    $cached = downloadAndCacheThumbnail($thumbUrl, $name, $newResDir, $creatorId, $timestamp);
    if (!isset($cached['error'])) {
        $resource['thumb'] = $cached['thumb'];
    } else {
        logWarn("Resource '{$name}' (youtube): thumbnail download failed, keeping external URL");
        $resource['thumb'] = $thumbUrl;
    }

    return $resource;
}

function migrateResourceWebpage($resource, $oldResDir, $newResDir) {
    $src = $resource['src'];
    $name = $resource['name'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];

    $resource['attributes'] = new stdClass();
    $resource['thumb'] = null;

    // Fetch OpenGraph metadata
    $og = fetchOpenGraph($src);
    if (isset($og['error'])) {
        logWarn("Resource '{$name}' (webpage): URL fetch failed: " . $og['error']);
        // Can't reach URL → not embeddable, convert to urlpreview
        $resource['type'] = 'urlpreview';
        $resource['attributes'] = ['embed' => 'forbidden'];
        return $resource;
    }

    // Check embed status
    $embed = checkEmbedStatus($src);

    if ($embed !== 'allowed') {
        // forbidden or unknown → convert to urlpreview (conservative: don't show broken iframe)
        $resource['type'] = 'urlpreview';
        $resource['attributes'] = ['embed' => 'forbidden'];
    } else {
        $resource['attributes'] = ['embed' => 'allowed'];
    }

    // Use OG title as name if old name is generic
    if (!empty($og['title']) && (empty($name) || $name === $src)) {
        $resource['name'] = $og['title'];
    }
    if (!empty($og['description'])) {
        $resource['description'] = $og['description'];
    }

    // Cache thumbnail
    if (!empty($og['image'])) {
        $cached = downloadAndCacheThumbnail($og['image'], $name, $newResDir, $creatorId, $timestamp);
        if (!isset($cached['error'])) {
            $resource['thumb'] = $cached['thumb'];
        } else {
            $resource['thumb'] = $og['image']; // fallback
        }
    }

    usleep(URL_RATE_LIMIT_US);
    return $resource;
}

function migrateResourceVideo($resource, $oldResDir, $newResDir, $skipThumbs) {
    $src = $resource['src'];
    $name = $resource['name'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];

    // Preserve special attributes like alternateVideoFile
    $oldAttrs = is_array($resource['attributes']) && !empty($resource['attributes']) ?
        (array)$resource['attributes'] : [];
    $resource['attributes'] = !empty($oldAttrs) ? $oldAttrs : new stdClass();

    // Copy video file
    $oldFile = $oldResDir . "/" . $src;
    $newFile = $newResDir . "/" . $src;
    if (file_exists($oldFile)) {
        copy($oldFile, $newFile);
    } else {
        logWarn("Resource '{$name}' (video): source file not found: $src");
    }

    // Always regenerate video thumbnails from source (old ones are too small)
    $oldThumb = $resource['thumb'];
    if (!$skipThumbs && file_exists($newFile)) {
        $thumbFilename = substr($creatorId . "_" . $timestamp . "_thumb_" . sanitize($name), 0, 90) . ".png";
        $thumbResult = generateVideoThumbnail($newFile, $newResDir . "/" . $thumbFilename);
        if (!isset($thumbResult['error'])) {
            $resource['thumb'] = $thumbFilename;
            logInfo("Generated video thumbnail for '{$name}'");
        } elseif ($oldThumb && file_exists($oldResDir . "/" . $oldThumb)) {
            // Fallback to old thumbnail if ffmpeg fails
            copy($oldResDir . "/" . $oldThumb, $newResDir . "/" . $oldThumb);
        }
    } elseif ($oldThumb && file_exists($oldResDir . "/" . $oldThumb)) {
        copy($oldResDir . "/" . $oldThumb, $newResDir . "/" . $oldThumb);
    }

    return $resource;
}

function migrateResourceImage($resource, $oldResDir, $newResDir, $skipThumbs) {
    $src = $resource['src'];
    $name = $resource['name'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];

    $resource['attributes'] = new stdClass();

    $isUrl = filter_var($src, FILTER_VALIDATE_URL);

    if ($isUrl) {
        // External URL — download and cache thumbnail
        if (!$skipThumbs) {
            $cached = downloadAndCacheThumbnail($src, $name, $newResDir, $creatorId, $timestamp);
            if (!isset($cached['error'])) {
                $resource['thumb'] = $cached['thumb'];
                logInfo("Generated image thumbnail for '{$name}' (from URL)");
            } else {
                logWarn("Resource '{$name}' (image): thumbnail download failed: " . $cached['error']);
                $resource['thumb'] = null;
            }
        }
        return $resource;
    }

    // Copy local image file
    $oldFile = $oldResDir . "/" . $src;
    $newFile = $newResDir . "/" . $src;
    if (file_exists($oldFile)) {
        copy($oldFile, $newFile);
    } else {
        logWarn("Resource '{$name}' (image): source file not found: $src");
    }

    // Always regenerate image thumbnails from source (old ones are too small)
    $oldThumb = $resource['thumb'];
    if (!$skipThumbs && file_exists($newFile)) {
        $thumbFilename = substr($creatorId . "_" . $timestamp . "_thumb_" . sanitize($name), 0, 90) . ".png";
        $thumbResult = generateImageThumbnail($newFile, $newResDir . "/" . $thumbFilename);
        if (!isset($thumbResult['error'])) {
            $resource['thumb'] = $thumbFilename;
            logInfo("Generated image thumbnail for '{$name}'");
        } elseif ($oldThumb && file_exists($oldResDir . "/" . $oldThumb)) {
            // Fallback to old thumbnail if generation fails
            copy($oldResDir . "/" . $oldThumb, $newResDir . "/" . $oldThumb);
        }
    } elseif ($oldThumb && file_exists($oldResDir . "/" . $oldThumb)) {
        copy($oldResDir . "/" . $oldThumb, $newResDir . "/" . $oldThumb);
    }

    return $resource;
}

function migrateResourceVimeo($resource, $oldResDir, $newResDir) {
    $src = $resource['src'];
    $name = $resource['name'];
    $creatorId = (string)$resource['creatorId'];
    $timestamp = $resource['created'];

    $resource['attributes'] = new stdClass();

    // Extract Vimeo ID from various URL formats
    if (preg_match('/vimeo\.com\/(?:video\/)?(\d+)/', $src, $m)) {
        $vimeoId = $m[1];
    } elseif (preg_match('/player\.vimeo\.com\/video\/(\d+)/', $src, $m)) {
        $vimeoId = $m[1];
    } else {
        return $resource;
    }

    // Fetch Vimeo metadata
    $result = curlGet("https://vimeo.com/api/v2/video/{$vimeoId}.json");
    if ($result['body'] !== false && $result['code'] === 200) {
        $data = json_decode($result['body'], true);
        if (!empty($data[0]['thumbnail_medium'])) {
            $cached = downloadAndCacheThumbnail($data[0]['thumbnail_medium'], $name, $newResDir, $creatorId, $timestamp);
            if (!isset($cached['error'])) {
                $resource['thumb'] = $cached['thumb'];
            }
        }
    }

    return $resource;
}

function migrateResourceLocation($resource) {
    // Location resources: preserve attributes as-is (lat, lon, boundingBox)
    $attrs = $resource['attributes'];
    if (is_array($attrs) && (isset($attrs['lat']) || isset($attrs['lon']))) {
        $resource['attributes'] = $attrs;
    } else {
        $resource['attributes'] = new stdClass();
    }
    $resource['thumb'] = null;
    return $resource;
}

function migrateResourceText($resource) {
    // Text resources: preserve attributes.text as-is
    $attrs = $resource['attributes'];
    if (is_array($attrs) && isset($attrs['text'])) {
        $resource['attributes'] = $attrs;
    } elseif (is_object($attrs) && isset($attrs->text)) {
        $resource['attributes'] = (array)$attrs;
    } else {
        $resource['attributes'] = new stdClass();
    }
    $resource['thumb'] = null;
    return $resource;
}

function migrateResourceFile($resource, $oldResDir, $newResDir) {
    // Generic file resource (pdf, audio, etc): just copy
    $src = $resource['src'];
    $name = $resource['name'];

    $resource['attributes'] = new stdClass();

    if ($src && !filter_var($src, FILTER_VALIDATE_URL)) {
        $oldFile = $oldResDir . "/" . $src;
        $newFile = $newResDir . "/" . $src;
        if (file_exists($oldFile)) {
            copy($oldFile, $newFile);
        } else {
            logWarn("Resource '{$name}' ({$resource['type']}): source file not found: $src");
        }
    }

    // Copy existing thumbnail if present
    $oldThumb = $resource['thumb'];
    if ($oldThumb && !filter_var($oldThumb, FILTER_VALIDATE_URL) && file_exists($oldResDir . "/" . $oldThumb)) {
        copy($oldResDir . "/" . $oldThumb, $newResDir . "/" . $oldThumb);
    }

    return $resource;
}

// ============================================================================
// Main Migration Functions
// ============================================================================

function migrateConfig($srcDir, $outDir) {
    global $DEFAULT_CONFIG;

    // Determine config source
    if (file_exists($srcDir . "/config.json")) {
        $config = json_decode(file_get_contents($srcDir . "/config.json"), true);
        // Add defaultLanguage if missing
        if (!isset($config['defaultLanguage'])) {
            $config['defaultLanguage'] = 'en';
        }
    } elseif (file_exists($srcDir . "/project.json")) {
        // Slavin-style project.json: merge into default template
        $project = json_decode(file_get_contents($srcDir . "/project.json"), true);
        $config = $DEFAULT_CONFIG;
        $mappable = ['userNeedsConfirmation', 'theme'];
        foreach ($mappable as $key) {
            if (isset($project[$key])) {
                $config[$key] = $project[$key];
            }
        }
    } else {
        logWarn("No config.json or project.json found, using defaults");
        $config = $DEFAULT_CONFIG;
    }

    file_put_contents($outDir . "/config.json", json_encode($config, JSON_FLAGS));
    logInfo("config.json written");

    // users.json
    if (file_exists($srcDir . "/users.json")) {
        copy($srcDir . "/users.json", $outDir . "/users.json");
        logInfo("users.json copied");
    }

    // tagdefinitions.json
    if (file_exists($srcDir . "/tagdefinitions.json")) {
        copy($srcDir . "/tagdefinitions.json", $outDir . "/tagdefinitions.json");
        logInfo("tagdefinitions.json copied");
    } else {
        file_put_contents($outDir . "/tagdefinitions.json", "{}");
    }

    // custom.css
    if (file_exists($srcDir . "/custom.css")) {
        copy($srcDir . "/custom.css", $outDir . "/custom.css");
        logInfo("custom.css copied");
    } else {
        file_put_contents($outDir . "/custom.css", "");
    }
}

function migrateResources($srcDir, $outDir, $skipThumbs) {
    $oldResDir = $srcDir . "/resources";
    $newResDir = $outDir . "/resources";

    $indexPath = $oldResDir . "/_index.json";
    if (!file_exists($indexPath)) {
        logWarn("No resources/_index.json found, creating empty index");
        file_put_contents($newResDir . "/_index.json", json_encode(["resources-increment" => 0, "resources" => new stdClass()], JSON_FLAGS));
        return;
    }

    $index = json_decode(file_get_contents($indexPath), true);
    $resources = isset($index['resources']) ? $index['resources'] : [];
    $total = count($resources);
    $migrated = 0;
    $warned = 0;

    logInfo("Migrating $total resources...");

    foreach ($resources as $id => $old) {
        $type = isset($old['type']) ? $old['type'] : 'unknown';

        // Build base resource with current fields
        $resource = [
            'name'               => isset($old['name']) ? $old['name'] : '',
            'type'               => $type,
            'src'                => isset($old['src']) ? $old['src'] : '',
            'thumb'              => isset($old['thumb']) ? $old['thumb'] : null,
            'description'        => isset($old['description']) ? $old['description'] : null,
            'creator'            => isset($old['creator']) ? $old['creator'] : '',
            'creatorId'          => (string)(isset($old['creatorId']) ? $old['creatorId'] : ''),
            'created'            => isset($old['created']) ? $old['created'] : 0,
            'licenseType'        => isset($old['licenseType']) ? $old['licenseType'] : null,
            'licenseAttribution' => isset($old['licenseAttribution']) ? $old['licenseAttribution'] : null,
            'tags'               => isset($old['tags']) ? $old['tags'] : null,
            'attributes'         => new stdClass(),
        ];

        // Upgrade src URL protocol (http:// → https://, // → https://)
        // upgradeUrl() trims whitespace and is safe for non-URL strings
        $resource['src'] = upgradeUrl($resource['src']);

        // Preserve old attributes as array if non-empty (for type-specific handling)
        $oldAttrs = isset($old['attributes']) ? $old['attributes'] : [];
        // Normalize [] to stdClass
        if (is_array($oldAttrs) && empty($oldAttrs)) {
            $oldAttrs = [];
        }
        $resource['attributes'] = $oldAttrs;

        $warnCount = count($GLOBALS['report']['warnings']);

        // Detect "webpage" resources that are actually local files (not URLs)
        // Old data sometimes stored PDFs as type=webpage with a local filename src
        if ($type === 'webpage') {
            $trimmedSrc = trim($resource['src']);
            $isUrl = (strpos($trimmedSrc, 'http://') === 0 || strpos($trimmedSrc, 'https://') === 0 || strpos($trimmedSrc, '//') === 0);
            if (!$isUrl && !empty($trimmedSrc)) {
                $ext = strtolower(pathinfo($trimmedSrc, PATHINFO_EXTENSION));
                if ($ext === 'pdf') {
                    $type = 'pdf';
                    $resource['type'] = 'pdf';
                    logInfo("Resource '{$resource['name']}': reclassified from webpage to pdf (local file: $trimmedSrc)");
                } elseif (in_array($ext, ['mp4', 'webm', 'ogv', 'mov'])) {
                    $type = 'video';
                    $resource['type'] = 'video';
                    logInfo("Resource '{$resource['name']}': reclassified from webpage to video (local file: $trimmedSrc)");
                } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'])) {
                    $type = 'image';
                    $resource['type'] = 'image';
                    logInfo("Resource '{$resource['name']}': reclassified from webpage to image (local file: $trimmedSrc)");
                } elseif (in_array($ext, ['mp3', 'ogg', 'wav', 'flac', 'aac'])) {
                    $type = 'audio';
                    $resource['type'] = 'audio';
                    logInfo("Resource '{$resource['name']}': reclassified from webpage to audio (local file: $trimmedSrc)");
                }
                // else: leave as webpage, migrateResourceWebpage will handle the failure
            }
        }

        // Type-specific migration
        switch ($type) {
            case 'wikipedia':
                $resource = migrateResourceWikipedia($resource, $oldResDir, $newResDir);
                break;
            case 'youtube':
                $resource = migrateResourceYoutube($resource, $oldResDir, $newResDir);
                break;
            case 'webpage':
                $resource = migrateResourceWebpage($resource, $oldResDir, $newResDir);
                break;
            case 'video':
                $resource = migrateResourceVideo($resource, $oldResDir, $newResDir, $skipThumbs);
                break;
            case 'image':
                $resource = migrateResourceImage($resource, $oldResDir, $newResDir, $skipThumbs);
                break;
            case 'vimeo':
                $resource = migrateResourceVimeo($resource, $oldResDir, $newResDir);
                break;
            case 'location':
                $resource = migrateResourceLocation($resource);
                break;
            case 'text':
                $resource = migrateResourceText($resource);
                break;
            default:
                // Generic file-based resource (pdf, audio, etc.)
                $resource = migrateResourceFile($resource, $oldResDir, $newResDir);
                break;
        }

        // Ensure attributes is an object, not empty array
        if (is_array($resource['attributes']) && empty($resource['attributes'])) {
            $resource['attributes'] = new stdClass();
        }

        $resources[$id] = $resource;
        $migrated++;

        if (count($GLOBALS['report']['warnings']) > $warnCount) {
            $warned++;
        }

        // Progress
        if ($migrated % 10 === 0 || $migrated === $total) {
            logInfo("  Progress: $migrated/$total resources");
        }
    }

    // Write new index — force "resources" to be a JSON object (not array)
    $maxId = 0;
    foreach (array_keys($resources) as $id) {
        if ((int)$id > $maxId) $maxId = (int)$id;
    }

    $newIndex = [
        'resources-increment' => $maxId,
        'resources' => forceObject($resources)
    ];
    file_put_contents($newResDir . "/_index.json", json_encode($newIndex, JSON_FLAGS));

    logInfo("Resources migration complete: $migrated migrated, $warned with warnings");
}

// ============================================================================
// Annotation Post-Processing
// ============================================================================

/**
 * Post-process annotations after migration:
 * - Wikipedia annotations: fetch API data and store as frametrail:attributes
 * - Webpage annotations: check embed status, convert to urlpreview if not embeddable
 * - Upgrade all http:// and // URLs to https://
 *
 * Annotations are self-contained — they carry all their data independently of the
 * resources index. This function enriches old annotations that were missing attributes.
 *
 * @param array $annotations Array of W3C annotation objects
 * @param string $outDir Output data directory (for thumbnail caching)
 * @return array Processed annotations
 */
function postProcessAnnotations($annotations, $outDir) {
    $newResDir = $outDir . "/resources";
    $processed = 0;

    foreach ($annotations as &$ann) {
        if (!isset($ann['body']) || !is_array($ann['body'])) continue;
        $body = &$ann['body'];
        $ftType = isset($body['frametrail:type']) ? $body['frametrail:type'] : '';

        // Upgrade URLs in body.value and body.source
        if (isset($body['value']) && is_string($body['value'])) {
            $body['value'] = upgradeUrl($body['value']);
        }
        if (isset($body['source']) && is_string($body['source'])) {
            $body['source'] = upgradeUrl($body['source']);
        }

        // Process wikipedia annotations — enrich with API data
        if ($ftType === 'wikipedia' && !empty($body['value'])) {
            $wikiUrl = $body['value'];

            // Skip if already has attributes with extract
            if (!empty($body['frametrail:attributes']['extract'])) {
                continue;
            }

            $wikiInfo = fetchWikipediaInfo($wikiUrl);
            if (!isset($wikiInfo['error'])) {
                $attrs = [
                    'extract'      => $wikiInfo['extract'],
                    'extract_html' => $wikiInfo['extract_html'],
                    'description'  => $wikiInfo['description'],
                    'articleUrl'   => $wikiInfo['articleUrl'],
                    'wikiLang'     => $wikiInfo['wikiLang'],
                    'dir'          => $wikiInfo['dir']
                ];

                // Download and cache thumbnail
                if (!empty($wikiInfo['image'])) {
                    $name = isset($body['frametrail:name']) ? $body['frametrail:name'] : 'wiki';
                    $creatorId = isset($ann['creator']['id']) ? (string)$ann['creator']['id'] : '0';
                    $timestamp = time();
                    $cached = downloadAndCacheThumbnail($wikiInfo['image'], $name, $newResDir, $creatorId, $timestamp);
                    if (!isset($cached['error'])) {
                        $body['frametrail:thumb'] = $cached['thumb'];
                    }
                }

                $body['frametrail:attributes'] = $attrs;
                $processed++;

                usleep(WIKI_RATE_LIMIT_US);
            } else {
                logWarn("Annotation wikipedia '{$body['frametrail:name']}': " . $wikiInfo['error']);
            }
        }

        // Detect webpage annotations that reference local files (e.g. PDFs)
        if ($ftType === 'webpage' && !empty($body['value'])) {
            $trimmedVal = trim($body['value']);
            $isUrl = (strpos($trimmedVal, 'http://') === 0 || strpos($trimmedVal, 'https://') === 0 || strpos($trimmedVal, '//') === 0);
            if (!$isUrl) {
                $ext = strtolower(pathinfo($trimmedVal, PATHINFO_EXTENSION));
                if ($ext === 'pdf') {
                    $body['frametrail:type'] = 'pdf';
                    // PDF uses body.source, not body.value
                    $body['source'] = $trimmedVal;
                    $body['frametrail:attributes'] = new stdClass();
                    $processed++;
                    $annName = isset($body['frametrail:name']) ? $body['frametrail:name'] : $trimmedVal;
                    logInfo("  Annotation '{$annName}': reclassified from webpage to pdf (local file)");
                    continue;
                }
            }
        }

        // Process webpage annotations — check embed status
        if ($ftType === 'webpage' && !empty($body['value'])) {
            $webUrl = $body['value'];
            $embed = checkEmbedStatus($webUrl);

            if ($embed !== 'allowed') {
                // Not embeddable → convert to urlpreview
                $body['frametrail:type'] = 'urlpreview';
                $body['frametrail:attributes'] = ['embed' => 'forbidden'];
                // Also set source = value so _normalizeAnnotation can find src
                // (urlpreview uses body.value but older code may look at body.source)
                if (!isset($body['source'])) {
                    $body['source'] = $body['value'];
                }
                $processed++;
            } else {
                $body['frametrail:attributes'] = ['embed' => 'allowed'];
            }

            usleep(URL_RATE_LIMIT_US);
        }
    }
    unset($ann, $body);

    if ($processed > 0) {
        logInfo("  Post-processed $processed annotations");
    }

    return $annotations;
}

function migrateHypervideos($srcDir, $outDir) {
    $oldHvDir = $srcDir . "/hypervideos";
    $newHvDir = $outDir . "/hypervideos";

    // Load migrated resources index for meta.thumb resolution
    $resIndexPath = $outDir . "/resources/_index.json";
    $migratedResources = [];
    if (file_exists($resIndexPath)) {
        $resData = json_decode(file_get_contents($resIndexPath), true);
        $migratedResources = isset($resData['resources']) ? $resData['resources'] : [];
    }

    $indexPath = $oldHvDir . "/_index.json";
    if (!file_exists($indexPath)) {
        logWarn("No hypervideos/_index.json found, creating empty index");
        file_put_contents($newHvDir . "/_index.json", json_encode(["hypervideo-increment" => 0, "hypervideos" => new stdClass()], JSON_FLAGS));
        return;
    }

    // Copy _index.json as-is
    copy($indexPath, $newHvDir . "/_index.json");

    $index = json_decode(file_get_contents($indexPath), true);
    $hypervideos = isset($index['hypervideos']) ? $index['hypervideos'] : [];
    $total = count($hypervideos);

    logInfo("Migrating $total hypervideos...");

    foreach ($hypervideos as $id => $path) {
        // Resolve path — typically "./1" or "1"
        $hvName = ltrim($path, './');
        $oldHv = $oldHvDir . "/" . $hvName;
        $newHv = $newHvDir . "/" . $hvName;

        if (!is_dir($oldHv)) {
            logWarn("Hypervideo '$id': directory not found at $oldHv");
            continue;
        }

        // Create output directory structure
        @mkdir($newHv, 0755, true);
        @mkdir($newHv . "/annotations", 0755, true);
        @mkdir($newHv . "/subtitles", 0755, true);

        // Migrate hypervideo.json — upgrade URLs in clips and src fields
        if (file_exists($oldHv . "/hypervideo.json")) {
            $hv = json_decode(file_get_contents($oldHv . "/hypervideo.json"), true);

            // Point meta.thumb to the clip's video resource thumbnail (regenerated
            // via ffmpeg during resource migration) instead of keeping the old tiny one.
            $newResDir = $outDir . "/resources";

            if (isset($hv['clips']) && !empty($hv['clips'])) {
                $clipResId = (string)$hv['clips'][0]['resourceId'];
                if (isset($migratedResources[$clipResId]) && !empty($migratedResources[$clipResId]['thumb'])) {
                    $hv['meta']['thumb'] = $migratedResources[$clipResId]['thumb'];
                }
            }

            // Upgrade any http:// URLs in config.layoutArea items
            if (isset($hv['config']['layoutArea'])) {
                foreach (['areaTop', 'areaBottom', 'areaLeft', 'areaRight'] as $area) {
                    if (isset($hv['config']['layoutArea'][$area]) && is_array($hv['config']['layoutArea'][$area])) {
                        // Deduplicate layout area items by name+type
                        $seen = [];
                        $deduped = [];
                        foreach ($hv['config']['layoutArea'][$area] as $item) {
                            $key = ($item['type'] ?? '') . '::' . ($item['name'] ?? '') . '::' . ($item['transcriptSource'] ?? '');
                            if (!isset($seen[$key])) {
                                $seen[$key] = true;
                                $deduped[] = $item;
                            } else {
                                logWarn("Hypervideo '$id': removed duplicate layout area item '{$item['name']}' in $area");
                            }
                        }
                        $hv['config']['layoutArea'][$area] = $deduped;
                    }
                }
            }

            file_put_contents($newHv . "/hypervideo.json", json_encode($hv, JSON_FLAGS));
        } else {
            logWarn("Hypervideo '$id': no hypervideo.json found");
        }

        // Migrate annotations/_index.json (add annotation-increment, normalize ownerId)
        $annIndexPath = $oldHv . "/annotations/_index.json";
        if (file_exists($annIndexPath)) {
            $annIndex = json_decode(file_get_contents($annIndexPath), true);

            // Add annotation-increment if missing
            if (!isset($annIndex['annotation-increment'])) {
                $annCount = isset($annIndex['annotationfiles']) ? count($annIndex['annotationfiles']) : 0;
                $annIndex['annotation-increment'] = $annCount;
            }

            // Normalize ownerId to string
            if (isset($annIndex['annotationfiles'])) {
                foreach ($annIndex['annotationfiles'] as $annId => &$annFile) {
                    if (isset($annFile['ownerId'])) {
                        $annFile['ownerId'] = (string)$annFile['ownerId'];
                    }
                }
                unset($annFile);
            }

            file_put_contents($newHv . "/annotations/_index.json", json_encode($annIndex, JSON_FLAGS));

            // Copy and post-process annotation data files
            if (isset($annIndex['annotationfiles'])) {
                foreach ($annIndex['annotationfiles'] as $annId => $annMeta) {
                    $annFile = $oldHv . "/annotations/" . $annId . ".json";
                    if (file_exists($annFile)) {
                        $annData = json_decode(file_get_contents($annFile), true);
                        if (is_array($annData)) {
                            $annData = postProcessAnnotations($annData, $outDir);
                        }
                        file_put_contents($newHv . "/annotations/" . $annId . ".json",
                            json_encode($annData, JSON_FLAGS));
                    }
                }
            }
        }

        // Copy subtitle files
        if (is_dir($oldHv . "/subtitles")) {
            $subtitleFiles = glob($oldHv . "/subtitles/*.vtt");
            foreach ($subtitleFiles as $subFile) {
                copy($subFile, $newHv . "/subtitles/" . basename($subFile));
            }
            if (empty($subtitleFiles)) {
                logWarn("Hypervideo '$id': subtitles directory exists but no .vtt files found");
            } else {
                logInfo("Hypervideo '$id': copied " . count($subtitleFiles) . " subtitle file(s)");
            }
        }

        logInfo("Hypervideo '$id' migrated");
    }

    logInfo("Hypervideos migration complete: $total hypervideos");
}

// ============================================================================
// Fix-Only Mode: re-process resources with missing data
// ============================================================================

function fixResources($outDir, $srcDir, $skipThumbs) {
    $resDir = $outDir . "/resources";
    $indexPath = $resDir . "/_index.json";
    if (!file_exists($indexPath)) {
        logWarn("No resources/_index.json found in output, nothing to fix");
        return;
    }

    $index = json_decode(file_get_contents($indexPath), true);
    $resources = isset($index['resources']) ? $index['resources'] : [];
    $fixed = 0;

    $oldResDir = $srcDir . "/resources";

    foreach ($resources as $id => &$res) {
        $type = isset($res['type']) ? $res['type'] : '';
        $attrs = isset($res['attributes']) ? $res['attributes'] : [];
        $needsFix = false;

        // Wikipedia: fix if extract is missing
        if ($type === 'wikipedia') {
            if (empty($attrs) || (is_array($attrs) && !isset($attrs['extract']))) {
                logInfo("Fixing wikipedia resource #{$id}: '{$res['name']}'");
                $res = migrateResourceWikipedia($res, $oldResDir, $resDir);
                $needsFix = true;
            }
        }

        // Upgrade http:// and // URLs
        if (isset($res['src']) && (strpos($res['src'], 'http://') === 0 || preg_match('#^//[a-zA-Z]#', $res['src']))) {
            $res['src'] = upgradeUrl($res['src']);
            $needsFix = true;
        }

        // Fix empty array attributes → stdClass
        if (is_array($res['attributes']) && empty($res['attributes'])) {
            $res['attributes'] = new stdClass();
            $needsFix = true;
        }

        // Fix creatorId to string
        if (isset($res['creatorId']) && !is_string($res['creatorId'])) {
            $res['creatorId'] = (string)$res['creatorId'];
            $needsFix = true;
        }

        if ($needsFix) $fixed++;
    }
    unset($res);

    if ($fixed > 0) {
        // Rewrite with forceObject
        $maxId = 0;
        foreach (array_keys($resources) as $id) {
            if ((int)$id > $maxId) $maxId = (int)$id;
        }
        $newIndex = [
            'resources-increment' => $maxId,
            'resources' => forceObject($resources)
        ];
        file_put_contents($indexPath, json_encode($newIndex, JSON_FLAGS));
        logInfo("Fixed $fixed resource(s)");
    } else {
        logInfo("No resources need fixing");
    }
}

// ============================================================================
// Index HTML Generation
// ============================================================================

function generateIndexHtml($outDir, $buildRelPath, $serverRelPath = null) {
    $serverLine = $serverRelPath !== null
        ? "\n                server:         '" . $serverRelPath . "',"
        : '';
    $html = '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="cache-control" content="no-cache">
    <title>FrameTrail</title>
    <link rel="stylesheet" href="' . $buildRelPath . 'frametrail.min.css">
    <link rel="stylesheet" href="_data/custom.css">
    <script src="' . $buildRelPath . 'frametrail.min.js"></script>
    <script>
        document.addEventListener(\'DOMContentLoaded\', function() {
            window.myInstance = FrameTrail.init({
                target:         \'body\',' . $serverLine . '
                dataPath:       \'./_data/\',
                contentTargets: {},
                contents:       null,
                startID:        null,
                resources:      [{ label: "Choose Resources",
                                   data: "_data/resources/_index.json",
                                   type: "frametrail" }],
                tagdefinitions: null,
                config:         null
            });
        });
    </script>
</head>
<body></body>
</html>
';
    file_put_contents($outDir . "/index.html", $html);
    logInfo("index.html generated");
}

// ============================================================================
// Validation
// ============================================================================

function validateMigratedData($outDir) {
    $issues = [];

    // 1. Validate resources/_index.json
    $resIndex = $outDir . "/resources/_index.json";
    if (file_exists($resIndex)) {
        $raw = file_get_contents($resIndex);
        $data = json_decode($raw, true);

        // Check that "resources" is encoded as a JSON object (not array)
        // by looking for array bracket vs object brace after "resources":
        if (preg_match('/"resources"\s*:\s*\[/', $raw)) {
            $issues[] = "CRITICAL: resources/_index.json 'resources' is a JSON array, must be object";
        }

        if ($data) {
            $resources = isset($data['resources']) ? $data['resources'] : [];
            $wikiNoExtract = 0;
            $httpUrls = 0;
            $protocolRelative = 0;

            foreach ($resources as $id => $res) {
                // Check wikipedia resources have extract
                if (isset($res['type']) && $res['type'] === 'wikipedia') {
                    $attrs = isset($res['attributes']) ? $res['attributes'] : [];
                    if (empty($attrs) || (is_array($attrs) && !isset($attrs['extract']))) {
                        $wikiNoExtract++;
                    }
                }
                // Check for http:// URLs (including with leading whitespace)
                if (isset($res['src']) && strpos(trim($res['src']), 'http://') === 0) {
                    $httpUrls++;
                }
                // Check for protocol-relative URLs
                if (isset($res['src']) && preg_match('#^\s*//[a-zA-Z]#', $res['src'])) {
                    $protocolRelative++;
                }
                // Check attributes is encoded as object in the raw JSON
                if (preg_match('/"' . preg_quote((string)$id) . '":\s*\{[^}]*"attributes"\s*:\s*\[\s*\]/', $raw)) {
                    $issues[] = "Resource $id: attributes encoded as empty array [], must be {}";
                }
                // Check creatorId is string
                if (isset($res['creatorId']) && !is_string($res['creatorId'])) {
                    $issues[] = "Resource $id: creatorId is not a string";
                }
            }

            if ($wikiNoExtract > 0) {
                $issues[] = "WARNING: $wikiNoExtract wikipedia resource(s) have no extract (will render as iframe fallback)";
            }
            if ($httpUrls > 0) {
                $issues[] = "WARNING: $httpUrls resource(s) still have http:// URLs";
            }
            if ($protocolRelative > 0) {
                $issues[] = "WARNING: $protocolRelative resource(s) still have protocol-relative URLs";
            }
        }
    } else {
        $issues[] = "CRITICAL: resources/_index.json not found";
    }

    // 2. Validate hypervideos
    $hvIndex = $outDir . "/hypervideos/_index.json";
    if (file_exists($hvIndex)) {
        $data = json_decode(file_get_contents($hvIndex), true);
        $hypervideos = isset($data['hypervideos']) ? $data['hypervideos'] : [];

        foreach ($hypervideos as $id => $path) {
            $hvName = ltrim($path, './');
            $hvDir = $outDir . "/hypervideos/" . $hvName;

            // Check hypervideo.json exists
            if (!file_exists($hvDir . "/hypervideo.json")) {
                $issues[] = "Hypervideo $id: missing hypervideo.json";
                continue;
            }

            $hv = json_decode(file_get_contents($hvDir . "/hypervideo.json"), true);

            // Check subtitles referenced in config exist
            if (isset($hv['subtitles']) && is_array($hv['subtitles'])) {
                foreach ($hv['subtitles'] as $sub) {
                    $subFile = $hvDir . "/subtitles/" . $sub['src'];
                    if (!file_exists($subFile)) {
                        $issues[] = "Hypervideo $id: referenced subtitle file '{$sub['src']}' not found";
                    }
                }
            }

            // Check Transcript layout areas reference existing subtitles
            if (isset($hv['config']['layoutArea'])) {
                foreach (['areaTop', 'areaBottom', 'areaLeft', 'areaRight'] as $area) {
                    if (!isset($hv['config']['layoutArea'][$area])) continue;
                    foreach ($hv['config']['layoutArea'][$area] as $item) {
                        if (isset($item['type']) && $item['type'] === 'Transcript' && !empty($item['transcriptSource'])) {
                            $lang = $item['transcriptSource'];
                            $found = false;
                            if (isset($hv['subtitles'])) {
                                foreach ($hv['subtitles'] as $sub) {
                                    if ($sub['srclang'] === $lang) { $found = true; break; }
                                }
                            }
                            if (!$found) {
                                $issues[] = "Hypervideo $id: Transcript layout area '{$item['name']}' references language '$lang' but no matching subtitle found";
                            }
                        }
                    }

                    // Check for duplicate layout area items
                    $seen = [];
                    foreach ($hv['config']['layoutArea'][$area] as $item) {
                        $key = ($item['type'] ?? '') . '::' . ($item['name'] ?? '');
                        if (isset($seen[$key])) {
                            $issues[] = "Hypervideo $id: duplicate layout area item '{$item['name']}' in $area";
                        }
                        $seen[$key] = true;
                    }
                }
            }

            // Check annotation-increment exists and validate annotation content
            $annIndex = $hvDir . "/annotations/_index.json";
            if (file_exists($annIndex)) {
                $ann = json_decode(file_get_contents($annIndex), true);
                if (!isset($ann['annotation-increment'])) {
                    $issues[] = "Hypervideo $id: annotations/_index.json missing annotation-increment";
                }

                // Validate annotation file contents
                if (isset($ann['annotationfiles'])) {
                    foreach ($ann['annotationfiles'] as $annId => $annMeta) {
                        $annFile = $hvDir . "/annotations/" . $annId . ".json";
                        if (!file_exists($annFile)) continue;
                        $annData = json_decode(file_get_contents($annFile), true);
                        if (!is_array($annData)) continue;

                        foreach ($annData as $annItem) {
                            $body = isset($annItem['body']) ? $annItem['body'] : [];
                            $ftType = isset($body['frametrail:type']) ? $body['frametrail:type'] : '';
                            $ftName = isset($body['frametrail:name']) ? $body['frametrail:name'] : '';
                            $value = isset($body['value']) ? $body['value'] : '';

                            // Wikipedia without extract
                            if ($ftType === 'wikipedia') {
                                $attrs = isset($body['frametrail:attributes']) ? $body['frametrail:attributes'] : [];
                                if (empty($attrs['extract'])) {
                                    $issues[] = "Hypervideo $id: wikipedia annotation '$ftName' missing extract (will render as iframe)";
                                }
                            }

                            // http:// in body.value (not W3C namespace)
                            if (is_string($value) && strpos($value, 'http://') === 0
                                && strpos($value, 'http://www.w3.org/') !== 0
                                && strpos($value, 'http://frametrail.org/') !== 0) {
                                $issues[] = "Hypervideo $id: annotation '$ftName' has http:// URL in body.value";
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Check referenced thumbnail files exist
    $resIndex = $outDir . "/resources/_index.json";
    if (file_exists($resIndex)) {
        $data = json_decode(file_get_contents($resIndex), true);
        $resources = isset($data['resources']) ? $data['resources'] : [];
        foreach ($resources as $resId => $res) {
            $thumb = isset($res['thumb']) ? $res['thumb'] : null;
            if ($thumb && strpos($thumb, './') === 0) {
                $thumbPath = $outDir . "/resources/" . substr($thumb, 2);
                if (!file_exists($thumbPath)) {
                    $issues[] = "Resource $resId: referenced thumbnail '$thumb' not found on disk";
                }
            }
        }
    }

    // 4. Check required top-level files
    foreach (['config.json', 'users.json', 'tagdefinitions.json'] as $f) {
        if (!file_exists($outDir . "/" . $f)) {
            $issues[] = "Missing required file: $f";
        }
    }

    return $issues;
}

function writeReport($outDir, $srcDir) {
    global $report;

    // Run validation
    $validationIssues = validateMigratedData($outDir);

    $reportData = [
        'source'    => realpath($srcDir) ?: $srcDir,
        'output'    => realpath($outDir) ?: $outDir,
        'timestamp' => date('c'),
        'warnings'  => $report['warnings'],
        'errors'    => $report['errors'],
        'validation' => $validationIssues,
        'summary'   => [
            'warningCount'    => count($report['warnings']),
            'errorCount'      => count($report['errors']),
            'validationCount' => count($validationIssues)
        ]
    ];

    file_put_contents($outDir . "/migration_report.json", json_encode($reportData, JSON_FLAGS));
    logInfo("Migration report written to migration_report.json");

    // Print validation results
    if (!empty($validationIssues)) {
        fwrite(STDOUT, "\n  --- Validation Results ---\n");
        foreach ($validationIssues as $issue) {
            fwrite(STDOUT, "  [VALIDATE] $issue\n");
        }
    } else {
        fwrite(STDOUT, "\n  --- Validation: All checks passed ---\n");
    }
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Compute the relative path from an output directory to the repo-root build/ folder.
 * The script is always run from the repo root, so we count the depth of $outDir
 * and prepend the right number of '../' segments.
 * e.g. '_data-migrated/hirmeos'       → '../../build/'   (depth 2)
 *      'src/_data-examples/hirmeos'    → '../../../build/' (depth 3)
 */
function computeBuildRelPath($outDir) {
    $normalized = trim(str_replace('\\', '/', $outDir), '/');
    $depth = count(explode('/', $normalized));
    return str_repeat('../', $depth) . 'build/';
}

// ============================================================================
// Project Migration Orchestrator
// ============================================================================

function migrateProject($srcDir, $outDir, $skipThumbs, $fixOnly, $buildRelPath) {
    global $report;
    $report = ['warnings' => [], 'errors' => []];

    $projectName = basename($srcDir);
    $dataDir = $outDir . "/_data";

    if ($fixOnly) {
        fwrite(STDOUT, "\n=== Fixing project: $projectName ===\n");

        if (!is_dir($dataDir)) {
            logError("Output _data directory does not exist: $dataDir (run without --fix-only first)");
            return false;
        }

        // Fix resources with missing data
        fwrite(STDOUT, "\n--- Fixing Resources ---\n");
        fixResources($dataDir, $srcDir, $skipThumbs);

        // Re-validate and report
        fwrite(STDOUT, "\n--- Validation & Report ---\n");
        writeReport($dataDir, $srcDir);

        $wc = count($report['warnings']);
        $ec = count($report['errors']);
        fwrite(STDOUT, "\n=== Fix complete: $projectName ($wc warnings, $ec errors) ===\n\n");
        return true;
    }

    fwrite(STDOUT, "\n=== Migrating project: $projectName ===\n");
    fwrite(STDOUT, "  Source: $srcDir\n");
    fwrite(STDOUT, "  Output: $outDir/_data/\n");
    if ($skipThumbs) fwrite(STDOUT, "  Mode: Skip thumbnail generation\n");

    // Validate source
    if (!is_dir($srcDir)) {
        logError("Source directory does not exist: $srcDir");
        return false;
    }

    // Create output structure with _data subdirectory
    @mkdir($outDir, 0755, true);
    @mkdir($dataDir, 0755, true);
    @mkdir($dataDir . "/resources", 0755, true);
    @mkdir($dataDir . "/hypervideos", 0755, true);

    // Phase 1: Config & structure
    fwrite(STDOUT, "\n--- Phase 1: Config & Structure ---\n");
    migrateConfig($srcDir, $dataDir);

    // Phase 2: Resources
    fwrite(STDOUT, "\n--- Phase 2: Resources ---\n");
    migrateResources($srcDir, $dataDir, $skipThumbs);

    // Phase 3: Hypervideos & Annotations
    fwrite(STDOUT, "\n--- Phase 3: Hypervideos & Annotations ---\n");
    migrateHypervideos($srcDir, $dataDir);

    // Phase 4: Generate index.html
    fwrite(STDOUT, "\n--- Phase 4: Generate index.html ---\n");
    generateIndexHtml($outDir, $buildRelPath);

    // Phase 5: Validation & Report
    fwrite(STDOUT, "\n--- Phase 5: Validation & Report ---\n");
    writeReport($dataDir, $srcDir);

    $wc = count($report['warnings']);
    $ec = count($report['errors']);
    fwrite(STDOUT, "\n=== Migration complete: $projectName ($wc warnings, $ec errors) ===\n\n");

    return true;
}

// ============================================================================
// Main
// ============================================================================

if ($isAll) {
    if (!is_dir($sourceBase)) {
        fwrite(STDERR, "Source base directory not found: $sourceBase\n");
        exit(1);
    }

    $dirs = array_filter(scandir($sourceBase), function($d) use ($sourceBase) {
        return $d[0] !== '.' && is_dir($sourceBase . '/' . $d);
    });

    $action = $fixOnly ? "fix" : "migrate";
    fwrite(STDOUT, "Found " . count($dirs) . " project(s) to {$action}: " . implode(', ', $dirs) . "\n");

    foreach ($dirs as $dir) {
        $outDir = $outputBase . '/' . $dir;
        $buildRelPath = computeBuildRelPath($outDir);
        migrateProject($sourceBase . '/' . $dir, $outDir, $skipThumbs, $fixOnly, $buildRelPath);
    }

    fwrite(STDOUT, "All projects {$action}d.\n");
} else {
    $buildRelPath = computeBuildRelPath($outputDir);
    if (!migrateProject($sourceDir, $outputDir, $skipThumbs, $fixOnly, $buildRelPath)) {
        exit(1);
    }
}
