# Deploying FrameTrail

This guide covers the three ways to run FrameTrail (server, local folder, and in-memory), how to build from source, and the release process.

## Deployment Options

### Option 1: Server Deployment (PHP)

Full multi-user mode with file uploads and user management.

**Requirements:**
- PHP 7.4+
- The directory needs write permissions so FrameTrail can create `_data/`

**Quickest local setup:**
```bash
php -S localhost:8080
```
Then open `http://localhost:8080`. No Apache, no XAMPP needed if PHP is installed.

**Public / production server:** Use Apache (`.htaccess` included and handles security rules) or nginx + PHP-FPM (add a deny rule for `_data/` in your nginx config).

**Steps:**

1. Download the [latest release](https://github.com/OpenHypervideo/FrameTrail/releases) zip
2. Extract to your web server directory (e.g., `/var/www/html/frametrail/`)
3. Set write permissions:
   ```bash
   chmod -R 775 /var/www/html/frametrail/
   chown -R www-data:www-data /var/www/html/frametrail/
   ```
4. Open in your browser (e.g., `http://example.com/frametrail/`)
5. Follow the setup wizard to create an admin account
6. The wizard creates the `_data/` directory with initial configuration

**What's in the release zip:**
- `frametrail.min.js` + `frametrail.min.css` — Minified bundles
- `frametrail.js` + `frametrail.css` — Unminified bundles (for debugging)
- `index.html`, `resources.html`, `setup.html` — Entry points
- `_server/` — Full PHP backend
- `.htaccess` — Apache rewrite rules
- `favico.png`, `README.md`, `LICENSE.md`

**Or use Docker:**

```bash
git clone https://github.com/OpenHypervideo/FrameTrail.git
cd FrameTrail
docker compose up -d
```

Open `http://localhost:8080` and follow the setup wizard. The `Dockerfile` builds the minified bundle from source in a throwaway Node stage (mirrors `scripts/build.sh`) and serves it via PHP + Apache — no Node or build tooling ends up in the final image. `_data/` persists in the named `frametrail_data` volume across container restarts/upgrades.

FFmpeg (server-side video transcoding + thumbnail/scrub-sprite generation) is left out by default to keep the image lean (~500MB smaller); the app detects its absence at runtime and skips those features gracefully. To include it:

```bash
docker compose build --build-arg WITH_FFMPEG=true
```

or uncomment the `args:` block in `compose.yaml`.

### Option 2: Local Folder Mode (No Server)

Single-user editing without a server. Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) to read and write files directly on disk. File uploads (images, video, audio) are supported, but server-side capabilities like media transcoding and user management are not available.

**Requirements:**
- Chrome or Edge (the File System Access API is not supported in Firefox or Safari)

**Steps:**

1. Download and extract FrameTrail (either a release zip or the `src/` directory)
2. Open `index.html` directly in Chrome or Edge
3. FrameTrail detects the local environment and prompts you to select a `_data` folder
4. Select an existing `_data` folder or create a new empty folder
5. Editing is available — all changes are saved directly to the selected folder

**How it works:**

The `StorageAdapterLocal` class uses the File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`, etc.) to read and write JSON files and uploaded media. The browser asks for permission the first time you access a folder, then remembers it for the session.

**Limitations:**
- Identity is name-only (a login dialog prompts for a display name before entering edit mode; no account or password required)
- No media transcoding (no server-side processing)
- Browser must support File System Access API (Chrome/Edge only)

### Option 3: In-Memory Mode (All Browsers)

No server, no file system access required. FrameTrail automatically falls back to this mode when running in Firefox, Safari, or any browser without the File System Access API and no PHP backend.

**Requirements:**
- Any modern browser (Chrome, Firefox, Edge, Safari)

**How it works:**

The `StorageAdapterDownload` holds all data in memory. Hypervideo data is passed via init options at startup (see [Inline on a Page](#inline-on-a-page) below). Viewing is always available. For editing, a login dialog prompts for a display name (guest mode — no account needed). The Save button is disabled (no persistent target); use **Save As** to export your work.

**Limitations:**
- No persistence — changes are lost on page reload unless exported via Save As
- No resource management — adding or deleting resources is not available

### Save As / Export

The Save As dialog is available in all storage modes and offers two scopes:

**Current Hypervideo**
- **JSON** — exports a flat `hypervideo.json` matching the server on-disk format; can be reloaded via the `contents` init option
- **HTML** — generates a self-contained `.html` file with hypervideo data embedded inline and FrameTrail loaded from the jsDelivr CDN; opens in any browser with no server required. An optional *Resource base URL* field prefixes uploaded resource file paths so they resolve correctly (e.g. `https://example.com/_data/`)

**All Data**
- Downloads a ZIP containing all hypervideos, the resources index, and config as JSON files
- **Include media files** (requires PHP server) — triggers a full server-side ZIP via the `dataExport` endpoint, including all uploaded media files from `_data/`; `users.json` is excluded

## Player Initialization

To add FrameTrail to any web page, include `frametrail.min.js` and `frametrail.min.css` and call `FrameTrail.init()`. Three patterns are supported — choose the one that fits your page structure.

### Adopt an existing `<video>` element

Point FrameTrail at a `<video>` already in your page. FrameTrail auto-creates a wrapper div before it and takes over the element — your page layout is unchanged.

```html
<video id="my-video"
       src="https://example.com/video.mp4"
       style="width: 900px; height: 600px; display: block;"
       playsinline="">
</video>

<script>
document.addEventListener('DOMContentLoaded', function() {
    FrameTrail.init({
        videoElement: '#my-video',          // selector or DOM ref — no target needed
        annotations:  'annotations.json',  // URL string, array of URLs, or inline W3C objects
        config:       { defaultLanguage: 'en', autohideControls: true }
    }, 'PlayerLauncher');
});
</script>
```

The wrapper div inherits the video's computed `width` and `height`, so the player fills exactly the same space the `<video>` occupied.

### Explicit container + video URL

Use when you have a container `<div>` but no pre-existing `<video>` element.

```html
<div id="player" style="width: 900px; height: 600px;"></div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    FrameTrail.init({
        target:      '#player',
        videoSource: 'https://example.com/video.mp4',
        annotations: 'annotations.json',
        config:      { defaultLanguage: 'en' }
    }, 'PlayerLauncher');
});
</script>
```

### Data-attribute auto-init

The lowest-friction option: decorate `<video>` tags with `data-frametrail` and call `FrameTrail.autoInit()` once. One call initialises every matching element on the page.

```html
<video data-frametrail
       data-frametrail-annotations="annotations.json"
       data-frametrail-config='{"autohideControls": true}'
       src="https://example.com/video.mp4"
       playsinline="">
</video>

<!-- Multiple players: add more <video data-frametrail> elements -->

<script>
document.addEventListener('DOMContentLoaded', function() {
    FrameTrail.autoInit();
    // To limit the scan to a subtree: FrameTrail.autoInit(document.getElementById('article'));
});
</script>
```

Supported data attributes:

| Attribute | Effect |
|-----------|--------|
| `data-frametrail` | presence flag — marks the element for auto-init |
| `data-frametrail-annotations` | URL of a W3C annotations JSON file |
| `data-frametrail-language` | language code (e.g. `en`, `de`) — maps to `config.defaultLanguage` |
| `data-frametrail-config` | inline JSON config object |

All instances created by `autoInit()` are accessible via `FrameTrail.instances[]`.

See [examples/](../examples/) for runnable HTML files for each pattern.

### `dataPath` and `server` options — subdirectory or remote origin

When your page lives in a subdirectory of the FrameTrail installation (e.g. `examples/`) or on a different host, pass `dataPath` and `server` so that FrameTrail's internal requests resolve correctly without needing a `<base href>` on the page. Both take a **full base URL including the directory name** with a trailing slash.

```javascript
// Page is in examples/, FrameTrail root is one level up
FrameTrail.init({
    dataPath: '../_data/',
    server:   '../_server/',
    startID: 'your-hypervideo-id',
    // …
}, 'PlayerLauncher');

// FrameTrail backend on a separate server (the remote server must send CORS headers)
FrameTrail.init({
    dataPath: 'https://frametrail.example.com/_data/',
    server:   'https://frametrail.example.com/_server/',
    startID: 'your-hypervideo-id',
    // …
}, 'PlayerLauncher');
```

### Static CDN Hosting (read-only, no PHP)

FrameTrail can serve hypervideo data from a static CDN without any PHP backend. Pass an explicit `dataPath` pointing to the CDN and leave `server` unset. StorageManager detects this combination (explicit `dataPath`, no `server`) and sets `storageMode` to `'static'`: data is read from the CDN, edits are stored in memory, and users can export their changes via Save As.

```javascript
FrameTrail.init({
    dataPath: 'https://cdn.example.com/project/_data/',
    // no server option — StorageManager sees explicit dataPath + no server → 'static' mode
    startID: 'your-hypervideo-id',
}, 'PlayerLauncher');
```

**CORS requirement:** The CDN must send `Access-Control-Allow-Origin: *` (or your page's origin) for the JSON files under `_data/`. File uploads and user management are unavailable in static mode.

### Inline on a Page (full data, no server)

Pass all hypervideo and resource data directly via init options, bypassing the `_data/` directory entirely. This works in all three storage modes and is the primary approach for in-memory mode (Option 3).

```javascript
FrameTrail.init({
    target: '#container',
    startID: '0',
    config: { defaultTheme: 'dark' },
    contents: [{
        hypervideo: {
            meta: { name: 'My Video', creator: 'Anonymous', creatorId: 'anon',
                    created: Date.now(), lastchanged: Date.now() },
            config: { layoutArea: {}, hidden: false },
            clips: [{ resourceId: 'my-video', duration: 120, start: 0, end: 120 }],
            contents: [],
            subtitles: {},
            globalEvents: {},
            customCSS: ''
        },
        annotations: []
    }],
    resources: [{
        label: 'Inline resources',
        type: 'frametrail',
        data: {
            'my-video': { name: 'Main Video', type: 'youtube', src: 'dQw4w9WgXcQ' }
        }
    }]
}, 'PlayerLauncher');
```

**Note:** When no PHP server and no local folder are available, FrameTrail falls back to `storageMode: 'download'` — the `StorageAdapterDownload` holds data in memory. Inline data init options work fully in this mode: viewing and editing are both functional, and changes can be exported via the Save As dialog. Nothing persists past a page reload unless exported.

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the full initialization options reference.

## Building from Source

### Prerequisites

```bash
# Node.js 20+ required
npm install -g terser csso-cli
```

### Running the Build

```bash
# From the repository root
bash scripts/build.sh

# With a version label (embedded in the build README)
bash scripts/build.sh v2.0.0
```

### What the Build Script Does

1. **Concatenates CSS** — All CSS files from `src/` in load order → `build/frametrail.css`
2. **Inlines fonts** — Embeds woff2 font files as base64 data URIs in the CSS (4 fonts, ~170K base64 total)
3. **Concatenates JS** — All JS files from `src/` in load order → `build/frametrail.js`
4. **Minifies** — terser for JS, csso for CSS → `build/frametrail.min.js` + `build/frametrail.min.css`
5. **Generates HTML** — Clean entry points that load only the two bundles (instead of ~60 individual files)
6. **Copies static files** — `_server/`, `.htaccess`, `favico.png`, `LICENSE.md`

### Build Output

```
build/
├── index.html              # Player entry (loads bundles)
├── resources.html          # Resource manager entry
├── setup.html              # Setup wizard
├── frametrail.js           # All JS concatenated (~2MB)
├── frametrail.min.js       # Minified JS (~800KB)
├── frametrail.css          # All CSS concatenated (with inlined fonts)
├── frametrail.min.css      # Minified CSS
├── .htaccess               # Apache rules
├── favico.png
├── _server/                # PHP backend (copied as-is)
├── README.md               # Short installation guide
└── LICENSE.md
```

### Development vs Production

| | Development (`src/`) | Production (`build/`) |
|---|---|---|
| Files loaded | ~60 individual `<script>` and `<link>` tags | 2 bundles (`frametrail.min.js` + `.min.css`) |
| Edit workflow | Edit file → reload browser | Run build script → reload |
| Fonts | Loaded as separate woff2 files | Inlined as base64 in CSS |
| PHP backend | `src/_server/` | `build/_server/` (identical copy) |

For development, always work in `src/`. Only run the build when preparing a production deployment or testing the build output.

## CI/CD

### Build Verification

Every push to `main` or `develop` and every pull request triggers the build workflow (`.github/workflows/build.yml`):

1. Checks out the code on Ubuntu
2. Installs Node.js 20 + terser + csso-cli
3. Runs `scripts/build.sh`
4. Verifies all expected output files exist
5. Uploads the build as a downloadable artifact (7-day retention)

The artifact is downloadable from the **Actions** tab on GitHub — useful for quick testing without a full release.

### Creating a Release

Releases are fully automated via `.github/workflows/release.yml`. To create one:

```bash
# 1. Make sure main is up to date
git checkout main
git pull

# 2. Create and push a version tag
git tag v2.0.0
git push origin v2.0.0
```

GitHub Actions automatically:
1. Detects the `v2.0.0` tag
2. Runs `scripts/build.sh v2.0.0`
3. Zips the `build/` directory → `frametrail-v2.0.0.zip`
4. Creates a GitHub Release with the zip attached
5. Auto-generates release notes from merged PRs since the last tag

The release appears under **Releases** in the GitHub sidebar. Users download the zip, extract to their server, open in browser, done.

## Data Management

### Backing Up

Back up the entire `_data/` directory. It contains all user accounts, hypervideos, annotations, resources, and configuration. There is no database — it's all JSON files and uploaded media.

```bash
cp -r _data/ _data_backup_$(date +%Y%m%d)/
```

### Migrating Between Servers

Copy the `_data/` directory from one FrameTrail installation to another. Everything works immediately — user accounts, hypervideos, annotations, uploaded resources.

```bash
# On source server
tar czf frametrail-data.tar.gz _data/

# On target server
tar xzf frametrail-data.tar.gz
```

### Configuration

Server-side config is in `src/_server/config.php`:
- `$conf["dir"]["data"]` — Path to `_data` directory (default: `../_data`). Can be overridden by the client's `dataPath` init option — the PHP backend resolves the URL path to a filesystem path and validates it is within the server root (parent of `_server/`). The resolved path is locked into the session at login.

Runtime config is in `_data/config.json`:
- `defaultUserRole` — Role for new users (`"user"` or `"admin"`)
- `userNeedsConfirmation` — Require admin approval for new accounts
- `allowUploads` — Enable file uploads
- `allowCollaboration` — Allow multiple users to annotate
- `alwaysForceLogin` — Make the instance **private**: require a valid login to view any content (see below)
- `defaultTheme` — Default color theme

#### Private instances (`alwaysForceLogin`)

When `alwaysForceLogin` is `true`, FrameTrail turns the instance into a real access-controlled deployment (server mode only):

- Every file under `_data/**` is served through a session gate (`_server/serve.php`) instead of statically, so unauthenticated requests get `403`. Authenticated media requests keep full HTTP `Range` support for seeking. Uploaded media, JSON, subtitles, etc. are all covered; `users.json` is never served.
- The guest ("Edit as Guest") bypass is disabled — a real account is required to view or edit.
- The `dataExport` ZIP endpoint requires a valid session.
- The client authenticates first, then loads data.

How activation works:

- The gate is a small **`_data/.htaccess`** file (a per-directory Apache rewrite that routes `_data/**` to `_server/serve.php`). FrameTrail **writes** this file when the instance is private and **deletes** it when public, so all instance-specific state stays inside the (portable) `_data/` directory and the shared app-root `.htaccess` is never modified. FrameTrail regenerates it whenever **its own PHP** writes `config.json` (setup wizard, or any admin settings save). `_data/` must be **writable** by the web server (it already is — FrameTrail writes `config.json` there).
- The rewrite target inside `_data/.htaccess` is a root-relative URL that encodes the app's base path (so sub-directory installs work). If you copy `_data/` to an install served under a **different** URL base, regenerate the file (any config save does this) so the target path stays correct.
- **Apache only.** `.htaccess` is ignored by nginx. nginx has no per-directory config, so on nginx + PHP-FPM (e.g. Plesk) add a server/`location` rule that routes `_data/**` to `_server/serve.php` (and continue to deny `users.json`). `serve.php` reads `config.alwaysForceLogin` per request and serves public content without a session, so a single always-on `location` rule is safe for both public and private instances there.
- If `config.json` is written by an external process (not through FrameTrail's PHP), that process must create/delete `_data/.htaccess` itself with the correct base path — otherwise the gate will not activate. When turning **private**, create `_data/.htaccess` **before** (or together with) setting `alwaysForceLogin=true` to avoid a brief window where private content is still served statically.

When `alwaysForceLogin` is `false`, `_data/.htaccess` is absent and `_data/**` is served statically (no PHP overhead).

### File Permissions

The web server process (e.g., `www-data`) needs write access to:
- The installation directory (for creating `_data/` on first setup)
- `_data/` and all subdirectories (for saving data, uploading files)

```bash
chown -R www-data:www-data /path/to/frametrail/
chmod -R 775 /path/to/frametrail/_data/
```
