# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FrameTrail is an open hypervideo environment for creating, annotating, and remixing interactive videos. It's a client-side JavaScript application with an optional PHP backend that uses **JSON files instead of a database** for all data storage. The entire system is portable — copy the `_data` directory between servers and everything works.

FrameTrail can run in five modes: with a PHP server (full multi-user), with the File System Access API for local editing in Chrome/Edge (no server needed) of a `_data` folder or of a project file (one HTML page in the portable format, saved in place), in-memory using the Download adapter (view + edit + export, no persistence — works everywhere but requires data to be passed via init options), or in static/CDN mode (read from a static host + in-memory edits + Export, no PHP backend needed).

## Repository Structure

All source code lives in `src/`. The `build/` directory (git-ignored) contains production output.

```
FrameTrail/
├── src/                            # ALL source code (runnable as-is for development)
│   ├── index.html                  # Player/editor entry point
│   ├── resources.html              # Standalone resource manager
│   ├── setup.html                  # First-run setup wizard
│   ├── companion.html              # The page a paired phone opens (strict CSP, no inline script)
│   ├── .htaccess                   # Apache rewrite rules
│   ├── favico.png
│   ├── _lib/                       # Vendored third-party libraries (12 packages)
│   ├── _shared/
│   │   ├── frametrail-core/
│   │   │   ├── frametrail-core.js  # Core: defineModule, defineType, init, state
│   │   │   ├── serialization/      # FrameTrailSerializer (stored JSON ⇄ model), FrameTrailKeyframes, FrameTrailHTMLFormat (portable HTML), FrameTrailLint (checks beyond the schemas), FrameTrailWebVTT (WebVTT to edit)
│   │   │   ├── schema/             # FrameTrailSchema (validator for the schemas/ subset), FrameTrailSchemas (generated copy of schemas/)
│   │   │   ├── storage/            # StorageAdapter + Server/Local/HTMLFile/Download/Static adapters
│   │   │   ├── pairing/            # FrameTrailPairing (pure: ids, join links, fingerprints, broker client, protocol messages, chunks, the phone's clock)
│   │   │   ├── layout/             # FrameTrailRingLayout (pure: the geometry of the ring of thumbnails around the video)
│   │   │   ├── quiz/               # FrameTrailQuiz (pure: a quiz's choices, tally, decision and the action that follows)
│   │   │   ├── _templateModule.js  # Module boilerplate template
│   │   │   └── _templateType.js    # Type boilerplate template
│   │   ├── modules/                # 17 shared modules
│   │   ├── types/                  # 26 resource types + the base Resource
│   │   ├── styles/                 # Global CSS (variables, generic, webfont)
│   │   └── fonts/                  # Webfonts (woff2 only)
│   ├── player/
│   │   ├── modules/                # 34 player-specific modules
│   │   └── types/                  # Player types (Annotation, Overlay, etc.)
│   ├── resourcemanager/
│   │   └── modules/ResourceManagerLauncher/
│   ├── companion/
│   │   └── modules/CompanionLauncher/  # The phone's side of pairing (companion.html)
│   ├── _server/                    # PHP backend
├── schemas/                        # JSON Schemas for the files in _data/ and for bundles
├── tests/                          # node tests/run-js.mjs; fixtures/ (data folders, cases, examples, lint)
├── scripts/
│   ├── build.sh                    # Production build script
│   ├── pairing-broker.mjs          # Stub pairing broker (contract v1; dev and tests)
│   └── pairing-lan.mjs             # Phone trials: FrameTrail (proxied) + the stub broker on one https origin on the WiFi
├── .github/workflows/
│   ├── build.yml                   # CI: tests + build verification on push/PR
│   └── release.yml                 # CD: package + GitHub Release on tags
├── docs/                           # Developer documentation (DATA-MODEL.md: the _data contract; TYPES.md: the item types, generated; HTML-FORMAT.md: the portable HTML format; PAIRING.md: pairing phones)
├── build/                          # Build output (git-ignored)
└── ...                             # README, LICENSE, CONTRIBUTING, etc.
```

## Architecture

### Application Structure

Four HTML entry points in `src/`:
- **`src/index.html`** — Main player/editor (bootstraps via `PlayerLauncher` module)
- **`src/resources.html`** — Standalone resource manager (bootstraps via `ResourceManagerLauncher`)
- **`src/setup.html`** — Initial setup wizard (one-time)
- **`src/companion.html`** — The page a paired phone opens (bootstraps via `CompanionLauncher`, which starts itself on pages marked `data-frametrail-companion`; see Device Pairing)

### Core Framework

**Custom Module System** (`src/_shared/frametrail-core/frametrail-core.js`):
- `FrameTrail.defineModule()` — registers modules with init() and onChange() lifecycle methods
- `FrameTrail.registerExtension()` — registers an extension: code outside FrameTrail that plugs in without changing its files (see Client Extensions)
- `FrameTrail.defineType()` — registers data types (Annotation, Overlay, Resource types, etc.)
- `FrameTrail.changeState()` / `FrameTrail.getState()` — global state management with change listeners
- Multiple FrameTrail instances can coexist on one page
- No build step for development — all modules loaded directly via `<script>` tags

### Key Directories

**Frontend:**
- `src/_shared/frametrail-core/` — Core framework and module loader
- `src/_shared/frametrail-core/storage/` — Storage adapters (Server, Local, HTMLFile, Download, Static)
- `src/_shared/frametrail-core/serialization/` — Pure serializer, keyframe math, HTML format and lint (plain globals, also `require()`-able in Node). `FrameTrailLint`: `run(partsOf(bundle, { hypervideoId, duration }))` checks a hypervideo against the rules the schemas cannot express (`RULES`, result `RESULT_SCHEMA`), `checkFolder(files)` the files of a `_data` folder against each other (and its WebVTT files with `checkVTT(text)`); FrameTrail itself shows neither, other tools use them (the transcripts editor uses `checkVTT` for uploads). `FrameTrailWebVTT`: a WebVTT text as a document to edit (`parse` / `write`, which keep what is not changed), times, SubRip conversion, cue text (`decodeText` / `encodeText`, `toPlain`, `speakerOf` / `withSpeaker`)
- `src/_shared/frametrail-core/schema/` — `FrameTrailSchema`, the validator for the schema subset (same wrapper), and `FrameTrailSchemas.js`, the schemas without titles/descriptions, generated by `node scripts/bundle-schemas.mjs` (never edit it by hand); the player loads both for the edit API
- `src/_shared/frametrail-core/layout/` — `FrameTrailRingLayout`, the geometry of the circular layout area (same wrapper; see Circular Layout Area)
- `src/_shared/modules/` — Shared modules (Database, UserManagement, ResourceManager, RouteNavigation, StorageManager, Localization, etc.)
- `src/_shared/types/` — Resource type definitions (26 types, all inherit from base Resource)
- `src/player/modules/` — Player modules (HypervideoModel, HypervideoController, AnnotationsController, OverlaysController, Interface, Titlebar, Sidebar, etc.)
- `src/player/types/` — Player types (Annotation, Overlay, Hypervideo, Subtitle, CodeSnippet, ContentView)
- `src/_shared/styles/` — Global CSS (variables.css, generic.css, frametrail-webfont.css)
- `src/_shared/fonts/` — Webfonts in woff2 format (FrameTrail icon font + Titillium Web)
- `src/_lib/` — Vendored third-party libraries

**Backend:**
- `src/_server/ajaxServer.php` — Central AJAX endpoint (switch statement dispatcher)
- `src/_server/user.php` — User management
- `src/_server/files.php` — File upload/download
- `src/_server/hypervideos.php` — Hypervideo CRUD
- `src/_server/annotationfiles.php` — Annotation persistence
- `src/_server/config.php` — Server configuration; starts the session, or authenticates a personal API token instead (`ftSessionBegin()`; `serve.php` defers it with `FT_DEFER_SESSION`)
- `src/_server/functions.incl.php` — Shared utility functions
- `src/_server/tokens.php` — Personal API tokens: bearer authentication, `userToken*` actions
- `src/_server/pairing.incl.php` — Pairing grants: paired phones read a private instance's `_data/resources/` without a session (`pairingGrant` action, read in `serve.php`)
- `src/_server/extensionloader.php` + `src/_server/extension.php` — Server extensions (`src/_server/extensions/<name>/`, shipped empty): loader, and the router for their routes

**Data Storage** (`_data/` directory — not in git, created at runtime):
```
_data/
├── config.json              # Global app configuration
├── users.json               # User accounts
├── tagdefinitions.json      # Tag definitions
├── custom.css               # Global custom styles
├── hypervideos/
│   ├── _index.json          # Hypervideo registry + the overview map document
│   └── {hypervideoId}/
│       ├── hypervideo.json  # Metadata, clips, overlays, config
│       ├── annotations/
│       │   ├── _index.json
│       │   └── {userId}.json # User annotations (W3C Web Annotation format)
│       └── subtitles/       # VTT subtitle files
└── resources/
    ├── _index.json          # Resource registry
    └── {files}              # Uploaded media files
```

### Vendored Libraries (`src/_lib/`)

| Directory | Library | Notes |
|-----------|---------|-------|
| `tabsjs/` | FTTabs (custom) | Pure vanilla-JS tab widget, API-compatible drop-in for the former jquery.tabs |
| `collisiondetection/` | Collision Detection | Overlay collision |
| `interactjs/` | Interact.js | Drag/drop and resize for overlay editing |
| `sortablejs/` | SortableJS | Sortable lists |
| `fflate/` | fflate | ZIP file creation for Export (ZIP Archive) |
| `dialog/` | dialog (custom) | Lightweight wrapper around native `<dialog>` |
| `leaflet/` | Leaflet | Map rendering (OpenStreetMap) |
| `codemirror6/` | CodeMirror 6 | Code editor (JS/CSS/HTML modes + linting) |
| `hlsjs/` | HLS.js | Adaptive video streaming |
| `quill/` | Quill | Rich text editing (replaces WYSIHTML5) |
| `parsers/` | VTT parser | Subtitle parsing |
| `qrcodegen/` | QR Code generator (Project Nayuki) | The pairing QR code (`PairingDialog` draws it as SVG); made JavaScript from the TypeScript source with Node's type stripping |

### Storage Modes (`storageMode` state)

- `'server'` — PHP backend available, data loaded/saved via AJAX to `src/_server/ajaxServer.php`. Shared files are compare-and-swap writes (code 7): `hypervideo.json` (`meta.lastchanged`), `config.json`, `custom.css`, the overview map — and each user's annotation file, whose writer is the user but maybe from another tab or a script with an API token: `annotationfileSave` takes `baseVersion` (the user's index entry's `lastchanged`, milliseconds), and the `Collaboration` scope `annotations` / `<hypervideoId>` (observed, no lock, no own-writer suppression; token `"<lastchanged>:<mtime>:<size>"` for the session's user) shows the sidebar's notice. `custom.css`'s token is a hash of its content (`ftCSSVersion()`; mtime had one-second resolution). Every request carries the page's id (`collabTab` = `StorageManager.tabID`), recorded with `lastWriter` (`tab`, null without one): `Collaboration` suppresses only this page's own writes (`wroteItHere()`), so the same user's other tab, device or token script is reported like anyone else.
- `'local'` — File System Access API active, data read/written via `StorageAdapterLocal` to a user-selected folder. Other programs may write the folder meanwhile: `Collaboration` runs in its `localFolder` mode (versions of `hypervideo.json`, `hypervideos/_index.json` and the user's own annotation file — modification time and size — checked on window focus, on entering edit mode and every 30 s while editing; the sidebar's "changed" notice), and `Database.saveHypervideo()` / `saveAnnotations()` / the hypervideo settings dialog refuse to overwrite a changed file (code 7, as on the server). The adapter remembers the version of every file it reads and writes, so its own writes are never reported; a file seen and then deleted elsewhere is *not* unchanged (a hypervideo deleted meanwhile answers code 4 instead of being written again), the adapter's own `deleteFile` / `deleteDirectory` forget what they saw. Shared indexes (`hypervideos/_index.json`, `resources/_index.json`, `tagdefinitions.json`, an annotation index, the overview map) are changed with `adapter.updateJSON(path, change)` (read, change, write; again when written in between) — `change` may run more than once, so it must not have side effects that add up. `requestAccess()` asks for the folder's permission again (the save's storage-problem dialog, "Allow").
- `'file'` — a project file: one HTML page in the portable format (`StorageAdapterHTMLFile`), read as a `_data` folder held in memory and written back into the page's first data block on every write (`FrameTrailHTMLFormat.readProject` / `writeProject`; the rest of the page is kept). Same interface as `StorageAdapterLocal` (incl. the per-path versions, so `Collaboration`'s `localFolder` mode and the code-7 refusal work; another tab's change of another path is not a conflict; `_flush()` takes the file in again before writing the whole page, and once more when it changed meanwhile, so two tabs saving at the same moment both end up in the file), minus media files: resources are URLs or paths relative to the page's datapath (`./` → `resources/` beside a new page), there is no upload tab. Entry points: the storage dialog (`StorageManager.openStorageDialog()`: Reopen, Select Folder, Open Project File, New Project File — shown in `'needsFolder'` and from the title bar's folder/file name), "Save to this file" on a page in the format opened from disk (sidebar Save, Ctrl+S; remembered per page as IndexedDB `page:<path>`, used at the next load only if permission is granted and the file still holds the page's data block). An HTML file Export downloads is such a page. `StorageManager.isLocal()` = `'local'` or `'file'` (read/written through the adapter); `=== 'local'` where real files beside the data are needed. In file mode the bundle-derived init states (config, tagdefinitions, contents…) are ignored: the file is the only source.
- `'needsFolder'` — File System Access API supported but no folder or project file open yet (none remembered, or permission must be asked); the launcher shows the storage dialog
- `'download'` — No persistent storage available (Firefox/Safari, or any browser without File System Access API and no PHP); `StorageAdapterDownload` is used, which stores data in memory and lets users export/download it. Viewing and editing work; `canSave` is `false` (no persistent target); changes leave through Export. Data persists only until page reload.
- `'static'` — CDN/static hosting mode (no PHP backend). `StorageAdapterStatic` reads JSON from a CDN base URL (`dataPath` init option) and inherits in-memory write from `StorageAdapterDownload`; work leaves through Export. Used when `dataPath` is set but `server` is omitted.

### Application Modes

**Three primary modes controlled by state:**
1. **Player Mode** (`viewMode: 'video'`) — Video playback with annotations/overlays (read-only)
2. **Editor Mode** (`editMode: true`) — Authenticated editing of annotations and overlays
3. **Overview Mode** (`viewMode: 'overview'`) — Gallery view of all hypervideos

**State variables:**
- `editMode` (true/false) — Whether user is editing
- `viewMode` ('video'/'overview') — Current view type
- `storageMode` ('server'/'local'/'file'/'needsFolder'/'download'/'static') — Active storage backend
- `dataPath` (string|null) — Base URL for `_data/` directory; `null` = auto-detect
- `server` (string|null) — Base URL for `_server/` PHP directory; `null` = auto-detect or no server
- `slidePosition` ('middle'/'bottom'/'top') — Layout positioning
- `sidebarOpen` (true/false) — Sidebar visibility
- `fullscreen` (true/false) — Fullscreen mode
- `viewSize` ([width, height]) — Responsive layout dimensions
- `editBusy` ({ description } / false) — An async transaction of the edit API is open; editing by hand waits
- `pairing` ({ status, link, phones, connected, max, problem }) — `PairingHost`'s status: `off`, `opening`, `open`; `phones` = `[{ id, number, label, status, canControl, path }]`, status `connecting`, `connected`, `reconnecting`
- `companion` (link / null) — Init option of a phone's player: the `CompanionLauncher`'s link to the desktop it follows

### Key Architectural Patterns

1. **Module Pattern**: Modules return public interfaces, private state hidden in closures
2. **Observer Pattern**: State changes trigger module `onChange(stateName, stateValue)` callbacks
3. **Lazy Loading**: Modules initialized on-demand via `FrameTrail.initModule()`
4. **File-Based Persistence**: All data stored as JSON files (no database)
5. **Event-Driven**: Timeline events, user actions broadcast to listeners
6. **W3C Web Annotations**: Uses standardized annotation format with FrameTrail extensions
7. **Guest Mode is orthogonal to storage mode**: `UserManagement.isGuestMode()` is an identity-layer flag — it means "editing without a server account", not "in download mode". A user can be in guest mode in any storage mode (local, download, or server). `StorageManager.canSave()` is the authoritative gate for save UI: it returns `false` for server mode when in guest mode, and delegates to `adapter.canSave` otherwise (`StorageAdapterDownload.canSave` is always `false`; `StorageAdapterLocal.canSave` is `true`). Always use `canSave()` — or `StorageManager.saveTarget()` (`'save'` / `'pageFile'` / `'export'`), which every Save the user can reach goes by (Save button, Ctrl+S, the unsaved-changes prompt) — rather than checking `isGuestMode()` or `storageMode` directly in save-related UI. A guest's `userID` is derived from the entered name (`FrameTrailSerializer.guestUserID()`: `guest_<slug>-<FNV-1a hash>`, case- and whitespace-insensitive), so the same name is the same user across sessions; in local mode it names the guest's annotation file and decides which annotations are editable.

**Important: FrameTrail instance vs global:**
- The global `FrameTrail` object is the factory/registry. `FrameTrail.module()`, `FrameTrail.changeState()`, etc. are only available on **initialized instances** (the `FrameTrail` parameter passed into `defineModule` callbacks).
- Modules defined via `FrameTrail.defineModule()` receive the instance as their closure argument — they can freely call `FrameTrail.module('X')`.
- Plain classes (e.g. `StorageAdapter` subclasses in `src/_shared/frametrail-core/storage/`) are **not** FrameTrail modules and do **not** have access to any instance. If they need to call module APIs, the caller must pass the FrameTrail instance explicitly.
- `window.FrameTrailSerializer`, `window.FrameTrailKeyframes`, `window.FrameTrailHTMLFormat`, `window.FrameTrailLint` and `window.FrameTrailWebVTT` (`src/_shared/frametrail-core/serialization/`), `window.FrameTrailSchema` / `window.FrameTrailSchemas` (`src/_shared/frametrail-core/schema/`), `window.FrameTrailPairing` (`src/_shared/frametrail-core/pairing/`), `window.FrameTrailRingLayout` (`src/_shared/frametrail-core/layout/`) and `window.FrameTrailQuiz` (`src/_shared/frametrail-core/quiz/`) are pure globals: no instance, no DOM. Their wrapper also exports them under `require()` in Node; keep it that way (tests and tools load them there).
- Every module must be initialized with `FrameTrail.initModule('ModuleName')` before it can be accessed via `FrameTrail.module('ModuleName')`. Calling `module()` on an uninitialized module returns undefined.

### Data Flow

**Client → Server:** All requests go through `src/_server/ajaxServer.php` with `action` parameter (e.g., `userLogin`, `fileUpload`, `hypervideoAdd`, `annotationfileSave`). Every request includes the `dataPath` parameter (an absolute URL path) so the PHP backend resolves the correct `_data` directory.

**Client → Local:** `StorageAdapterLocal` uses the File System Access API to read/write JSON files directly in the user's selected `_data` folder

**Client → Download:** `StorageAdapterDownload` enables exporting data as downloadable files when neither server nor File System Access API is available

**Client State Management:**
1. `Database` module loads JSON files via the active storage adapter on app init
2. State changes via `FrameTrail.changeState()` trigger module updates
3. Modules respond to state changes in their `onChange()` method
4. User edits saved back via the storage adapter to update JSON files

### Resource Types

All 26 resource types inherit from the base `Resource` type in `src/_shared/types/Resource/`:

| Type | Description |
|------|-------------|
| ResourceVideo | HTML5 video (with HLS.js support) |
| ResourceImage | Static images |
| ResourceAudio | HTML5 audio |
| ResourceYoutube | YouTube embeds |
| ResourceVimeo | Vimeo embeds |
| ResourceWistia | Wistia embeds |
| ResourceLoom | Loom embeds |
| ResourceTwitch | Twitch embeds |
| ResourceSoundcloud | SoundCloud embeds |
| ResourceSpotify | Spotify embeds |
| ResourceWebpage | Generic iframe embeds |
| ResourceWikipedia | Wikipedia article embeds |
| ResourcePDF | PDF document viewer |
| ResourceText | Rich text (WYSIWYG via Quill + HTML editor), optional title, plain or in a shape (rectangle, rounded, circle, speech bubble, cloud, block arrow) |
| ResourceHtml | Raw HTML (CodeMirror HTML editor only, no sanitisation) |
| ResourceLocation | OpenStreetMap (via Leaflet) |
| ResourceQuiz | Interactive quiz |
| ResourceHotspot | Clickable hotspot: circle, rectangle, rounded, arrow, underline, freeform (outline drawn on the video); outline, fill, pulse, label |
| ResourceEntity | Linked data entity |
| ResourceMastodon | Mastodon embeds |
| ResourceCodepen | CodePen embeds |
| ResourceFigma | Figma embeds |
| ResourceUrlPreview | URL preview cards |
| ResourceCursor | Mouse pointer moved by box motion, with click ripples (overlay only) |
| ResourceCounter | Animated number: count up or rolling digits (overlay only) |
| ResourceChart | Animated bar / line / donut chart or progress ring from `Label: value` lines (overlay only) |

## Development

### Prerequisites

- PHP 7.4+ (for server mode — run `php -S localhost:8080` in `src/`, no Apache needed for local dev)
- Or: Chrome/Edge for local folder mode (File System Access API)
- No build tools required for development — edit files directly in `src/`

### Running Locally

**Development (with server):**
1. Run `php -S localhost:8080` in the `src/` directory
2. Open `http://localhost:8080` — first run opens setup wizard
3. Creates `src/_data/` directory and admin account

**Development (local folder mode):**
1. Open `src/index.html` directly in Chrome or Edge
2. Select or create a `_data` folder when prompted

### Building for Production

```bash
# Install build tools (one-time)
npm install -g terser csso-cli

# Build
bash scripts/build.sh

# Build with version label
bash scripts/build.sh v2.0.0
```

The build script:
1. Concatenates all CSS files in load order → `build/frametrail.css`
2. Inlines woff2 fonts as base64 data URIs into the CSS
3. Concatenates all JS files in load order → `build/frametrail.js`
4. Minifies with terser/csso → `build/frametrail.min.js` + `build/frametrail.min.css`
5. Generates clean HTML entry points that load only the two bundles (`index.html`, `resources.html`, `companion.html`)
6. Copies `_server/`, `.htaccess`, `favico.png`, `LICENSE.md`

**Docker:** `Dockerfile` + `compose.yaml` in the repo root run this same build in a throwaway Node stage and serve the output via PHP + Apache (`docker compose up -d`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#option-1-server-deployment-php) for build args (e.g. `WITH_FFMPEG`) and volume details.

### Tests

```bash
node tests/run-js.mjs                         # Node 20+, no dependencies (node:test)
node tests/run-js.mjs --data=src/_data        # also check a real _data folder (its lint findings are listed as diagnostics)
node tests/run-php.mjs                        # server contract: php -S over src/ with a throwaway _data-test-* folder (CAS codes, locks, tokens, sessions per data folder); skipped without php
node tests/extract-examples.mjs               # after changing the data in an examples/*.html page
node scripts/bundle-schemas.mjs               # after changing a schema (the player's copy and docs/TYPES.md; the tests check both)
node scripts/pairing-broker.mjs               # stub pairing broker on http://localhost:8787 (see Device Pairing)
node scripts/pairing-lan.mjs --path <path to src>/                # try it with a real phone: https://<computer>.local:8443, broker at /pairing-broker/
```

`tests/fixtures/`: `data/<name>/` are `_data` folders (no `users.json`, no media; `all-types` has an item of every type and loads in the player), `cases/*.json` and `examples/*.json` are `{ description, cases: [{ name, schema, data, errors? }] }` — no `errors` means valid, otherwise exactly those errors. The runner validates everything with `FrameTrailSchema`, round-trips valid hypervideos, annotation files and content items through the serializer (allowed differences: `@context`, ISO `created` with de-dup bumps, `meta.lastchanged`, contents order overlays → code snippets → others), and reads data folders as bundles; every data folder must pass `FrameTrailLint.checkFolder`. `lint/*.json` are lint cases (`{ data, hypervideoId?, duration?, cases: [{ name, patch?, rules?, findings }] }`, `patch` a JSON Patch on a bundle in `lint/data/`); every rule needs a case that finds it. tests/README.md states these rules for runners in other languages. Expected errors in a case are what `FrameTrailSchema` reports, expected findings what `FrameTrailLint` reports; check they name the real problem before committing them.

### CI/CD

- **Tests** (`.github/workflows/build.yml`, job `test`): `node tests/run-js.mjs` on Node 20, on every push to `main`/`develop` and every PR.
- **Build verification** (`.github/workflows/build.yml`): Runs on every push to `main`/`develop` and every PR. Builds and verifies output.
- **Release packaging** (`.github/workflows/release.yml`): Runs on `v*` tags. Builds, zips, creates GitHub Release with the zip attached.

To create a release:
```bash
git checkout main
git tag v2.0.0
git push origin v2.0.0
# CI creates the GitHub Release automatically
node scripts/publish-schemas.mjs ../FrameTrail-Website/schemas/1   # then commit and deploy the website
```

### Branching Model

- `main` — Stable release branch, tagged for releases
- `develop` — Integration branch, feature branches merge here
- Feature branches created from `develop`, merged back via PR

### Making Changes

**Adding/Modifying Modules:**
1. Modules located in `src/_shared/modules/` or `src/player/modules/`
2. Follow template in `src/_shared/frametrail-core/_templateModule.js`
3. Register with `FrameTrail.defineModule('ModuleName', function() { ... })`
4. Add `<script>` tag to `src/index.html` (and `src/resources.html` if shared)
5. Add CSS if needed (one stylesheet per module)
6. Add files to `scripts/build.sh` in `JS_FILES`/`CSS_FILES` arrays

**Adding/Modifying Types:**
1. Types located in `src/_shared/types/` or `src/player/types/`
2. Follow template in `src/_shared/frametrail-core/_templateType.js`
3. Register with `FrameTrail.defineType('TypeName', function() { ... })`
4. Add `<script>` and `<link>` tags to HTML files
5. Add files to `scripts/build.sh`

**Modifying Server Logic:**
1. Add new action to switch statement in `src/_server/ajaxServer.php` (an extension adds actions as a server extension instead, see below)
2. Implement logic in specialized PHP file
3. Return JSON response with `success`/`error` keys
4. Client-side: Call via `FrameTrail.module('StorageManager').serverPost(new URLSearchParams({ a: action, … }))` (adds `dataPath`, resolves with the answer whatever its code)
5. An action that manages the account or its tokens goes into `ftBearerRefusesAction()` (`tokens.php`), so a personal API token cannot call it
6. A file that is read, changed and written back is decoded with `json_decode($json)` (objects), never with `true`, and an empty map is created as `new stdClass()`: PHP arrays write `{}` as `[]` (`ftResourceIndexRead()`, `ftHypervideoIndexRead()`, `tags.php`)

### File Conventions

**JavaScript:**
- Module structure: Private vars/functions in closure, return public interface
- Lifecycle: `init()` called once, `onChange(changedState, stateValue)` for state updates
- No ES6 modules — uses global `FrameTrail` namespace
- Plain DOM APIs throughout — jQuery has been fully removed

**CSS:**
- One stylesheet per module/type in same directory as JS
- Loaded in `<head>` of HTML file
- Global styles in `src/_shared/styles/`
- For `<select>` elements, wrap in a `<div class="custom-select">` to get consistent styled dropdowns with a caret icon (defined in `src/_shared/styles/generic.css`)

**Data Files:**
- All stored in `_data/` directory (not in git)
- JSON format with pretty printing (`JSON_PRETTY_PRINT`)
- Registry files: `_index.json` files list all items in directory
- Direct file I/O in PHP — no database abstraction layer

## Data Model and Schemas

The stored format is documented in [docs/DATA-MODEL.md](docs/DATA-MODEL.md) and described by the JSON Schemas in `schemas/` (draft 2020-12, `$id` `https://frametrail.org/schemas/1/…`): one schema per `_data` file, `content-item` / `annotation-file` for the W3C items, `attributes/<type>.schema.json` per resource type, and `hypervideo-bundle` / `project-bundle` for single-document export.

- **Any change to what is stored** — a new resource type, attribute, config key or file — updates the schemas and DATA-MODEL.md in the same change, and regenerates the player's copy and `docs/TYPES.md` (`node scripts/bundle-schemas.mjs`). Every property the code reads has a `description`; defaults the code applies go into `default`.
- **Type reference:** `docs/TYPES.md` is generated from the attribute schemas: the part of a root description before "This schema describes" says what the type is (its first sentence goes into the at-a-glance table, so make it say what the type is for), the property descriptions fill the tables. Improve type documentation there, never in TYPES.md. DATA-MODEL.md's table of resource types is tested against `RESOURCE_TYPES` and the schemas, its lint rule table against `FrameTrailLint.RULES`.
- **Lint:** a new type, attribute or rule that changes what makes sense (a required source, a new kind of item) updates `FrameTrailLint` and its cases in `tests/fixtures/lint/` together; findings are written for people, saying what is wrong and why it matters.
- **Schema subset:** only the keywords listed in DATA-MODEL.md ("Schema Subset"); patterns in syntax common to ECMA-262 and PCRE. Discriminated `oneOf` by a `const` property where possible (every alternative requires it, each with its own value — that is what lets `FrameTrailSchema` report the meant alternative's errors). `FrameTrailSchema` throws on any other keyword, so the tests fail on a schema outside the subset.
- **Tests:** a change to what is stored also adds fixtures (an item in `tests/fixtures/data/all-types`, cases in `tests/fixtures/cases/`) and keeps `node tests/run-js.mjs` green.
- **Legacy shapes stay valid:** older forms (toString `created`, PHP's `[]` for `{}`, local-mode annotation index entries, …) are separate `oneOf` alternatives or descriptions starting "Legacy.". Never drop one without checking that no stored data uses it.
- **Unknown properties are allowed** almost everywhere; writers keep them.
- **Serializer:** all reading and writing of `hypervideo.json`, content items and annotation files goes through `FrameTrailSerializer` (`parseHypervideo` / `serializeHypervideo`, `parseAnnotationFile` / `serializeAnnotationFile`, …); `Database` delegates to it. Every parsed object keeps the stored object it came from in `_stored`, and writing is a three-way merge (stored, what the writer makes of stored unchanged, what it makes of the model now): unchanged parts are written byte-for-byte as stored, unknown properties survive, and only `@context` and ISO `created` are always rewritten. Never build stored JSON by hand next to it, and add new stored fields to both the `parse*` and the `write*` side.
- **Item identity on load:** `parseContents` / `parseAnnotationFile` de-duplicate `created` per collection (annotations per creator) by moving the later item on by 1 ms (`dedupeCreated`).
- **Cross-hypervideo rule:** `HypervideoSettingsDialog` is also opened from the overview for any hypervideo. Anything it does to items must act on the edited one (`isLoadedHypervideo()` decides live data vs stored data), never on the loaded one. Shortening a duration deletes/truncates that hypervideo's overlays and code snippets — live for the loaded one, otherwise via `applyToStored()` on the JSON the dialog writes — and never touches annotations (they belong to their authors). The same goes for the `globalEvents` its Advanced Options edit: the loaded one's through `HypervideoModel.events` (live, not marked unsaved: the dialog's write saves them), another's through `applyToStored()`; events nobody changed are not written.
- **`convertToDatabaseFormat(id, purpose)`** builds the model from `hypervideos[id]` (meta, config, clips, chapters, subtitles — where the settings dialog edits them) and its `hypervideoData`; only when `id` is the open hypervideo does it take live overlays, code snippets, global events, custom CSS and the `ViewLayout` content views. `purpose: 'export'` turns Transcript views into CustomHTML; nothing in FrameTrail uses it any more — exports are bundles, which carry the subtitles, so they keep Transcript views like saves.
- **Namespace:** `http://frametrail.org/ns/` stays HTTP (it is an identifier). The JSON-LD context document is `https://frametrail.org/ns/context.jsonld`, maintained in the FrameTrail-Website repository (`ns/`) together with the namespace page. The schemas are served at their `$id`s, `https://frametrail.org/schemas/1/`: `scripts/publish-schemas.mjs` copies them byte for byte into that repository's `schemas/1/` (never edited there) and writes its `index.html`, from main after a release. A published schema stays published; a new format version gets `/schemas/2/` beside it.

## Server Configuration

**Key Configuration** (`src/_server/config.php`):
- `$conf["dir"]["data"]` — Data directory location (default: `../_data`)
- Session lifetime controlled by PHP `session.gc_maxlifetime`

**Data Directory Resolution (`dataPath`):**

The PHP backend supports a client-provided `dataPath` parameter to select which `_data` directory to use. This allows multiple data directories to coexist under the same server root.

Resolution order:
1. Request parameter (`$_REQUEST["dataPath"]`) — sent by the client with every request
2. Default: `../_data` (sibling of `_server/`, used when no `dataPath` is sent)

Security: The resolved path must pass three checks:
- `realpath()` must succeed (no dangling symlinks or non-existent paths)
- Must be a directory within the **sandbox boundary** (`dirname(__DIR__)` = parent of `_server/`)
- Must contain `config.json` (validates it's a real FrameTrail data directory)

There is no session-based override — every request is validated independently. This allows multiple data directories to be used in parallel (e.g. in different browser tabs). Each data directory has a session of its own: `config.php` names the session cookie after the host *and* the resolved data directory (set after the directory is decided), so a session opened for one is unknown to another — it used to be taken for the user with the same id there. The name alone is no boundary (a client chooses which id it sends under which name, and PHP keeps all sessions in one store), so `ftSessionBegin()` also stamps every session with its scope (`$_SESSION["ftScope"]`, sha1 of host + directory, `$conf["server"]["session_scope"]`) and sets aside one that carries another scope, or none while holding something: the request goes on with a new, empty session (`session_regenerate_id(false)`, so the named session stays intact for its own directory). Code that empties `$_SESSION` mid-request must leave the stamp to be written again (`ftSessionBegin()` stamps after `ftExternalSessionEnforce()`; logins keep it through `session_regenerate_id()`). `sso.php?a=logout` therefore needs `dataPath` too (`leaveToPlatform()` sends it).

**When adding new server actions:** The `dataPath` parameter is handled centrally in `config.php` — no per-action code needed. All PHP files that use `$conf["dir"]["data"]` automatically get the correct path.

**When adding new client-side server calls:** Include `dataPath` in the POST body. For modules with a `_serverPost()` helper, this is automatic. For direct `fetch()` calls, get the value via `FrameTrail.module('StorageManager').getAdapter().dataPathAbsolute`.

**Runtime Configuration** (`_data/config.json`):
- Authentication settings
- Upload restrictions (file types, sizes)
- Theme/UI settings
- Default user roles and permissions
- Custom labels for UI elements

**Theme:** a setting of the instance only, `config.json` → `theme` (Administration → Color Theme), shown on the overview and every hypervideo by `Database.applyTheme()`. `defaultTheme` is its former name: every way a config comes in (Database, the bundle and page settings in `PlayerLauncher` and `FrameTrailHTMLFormat.readProject`, a folder's `config.json` in `readBundle`, Import, the phone's config) goes through `FrameTrailSerializer.normalizeConfig()`, each source before merging. A hypervideo's `config.theme` is legacy: not used, not offered by the Edit API (`setConfig` refuses it), and kept in the file as stored (the writer no longer writes it, `HypervideoModel` skips it).

## Saving and Unsaved Changes

The contract (checked by the save audit, `plans/save-audit-results.md`): "saved" only after the write reached persistent storage; nothing drops unsaved work without asking; the dirty state, badges and lock agree with reality; a save never overwrites a change made elsewhere unseen; a session that ends never drops work silently.

- **One decision:** `StorageManager.saveTarget()`. `HypervideoModel.save()` refuses where nothing can be persisted (`canPersist()`: download, static, a server guest — it opens Export instead) and while `editBusy` (the autosave tries again later); a save that wrote nothing says nothing (unless it waited behind another save, `{ deferred: true }`); a failed save calls `callbackCancel`.
- **One prompt:** `HypervideoModel.confirmUnsaved({ proceed(outcome), cancel })` — Yes / Discard / Cancel ("Save to this file" for a page file; **Export** / Discard / Cancel where nothing can be saved, which opens the Export dialog and changes nothing). Used by `leaveEditMode` (logout, Leave edit mode, `stopEditing()`), the overview's open, `#hypervideo=` routes (Cancel restores the hash; `askingToSwitchTo` keeps popstate + hashchange to one question), new hypervideo (`Sidebar.openAfterAdding`), fork, a video-source change in the settings dialog, the title bar's folder/file switch and the admin settings' reloads (`reloadForSettings`). Anything new that drops the model or reloads the page goes through it. Discard = `discardUnsaved()` + the caller's reload; `updateHypervideo()` also calls `discardUnsaved()` (the new model starts clean).
- **Leaving the page:** one `beforeunload` listener per instance in `PlayerLauncher` (`preventDefault()` + `returnValue`; returning a string does nothing), removed in its `onUnload`.
- **Library reloads keep the editor's entry:** `Database.keepsEditorEntry()` — `loadHypervideoData()` does not replace (or re-read) the open hypervideo's entry, which holds its unsaved settings/chapters and its CAS baseline. Whoever writes the open hypervideo past `save()` sets the written `lastchanged` on the entry itself (the settings dialog: `noteWritten()`, after `HypervideoModel.whenSaveIdle()`, then `hypervideoPartSaved(version)`).
- **Failures:** code 1 → `ensureAuthenticated()` and one retry; code 4 (deleted elsewhere) → `ErrorHypervideoGone`; `NotAllowedError` / `SecurityError` / `NotFoundError` of a local adapter → `showStorageProblemDialog()` (Allow → `requestAccess()` and retry; Export); before writing the hypervideo, `Collaboration.confirmLock()` — a lock lost to a takeover writes the annotations only and says who took over (`MessageCollabLockLost`).
- **"Save to this file":** `Database.adoptAnnotationIndex()` before the follow-up save; `BundleExport` gives every annotation file of a download-mode project an index entry (it used to leave the user's own unlisted).

## Overview Map

The overview can present hypervideos as a grid or as pins on a background image. Which of the two is a **setting** (`config.overviewMode`: `"grid"` / `"map"`, decided once in `ViewOverview.create()`, so switching it reloads the page). The map itself is **content** and lives in the `overviewMap` key of `_data/hypervideos/_index.json`, reachable as `Database.overviewMap`:

```jsonc
"overviewMap": {
    "background": "1_1788531102_overview-vector.svg",  // a resource src
    "backgroundColor": "#2f3139",
    "fit": "contain",                                   // or "cover"
    "lastchanged": 1788942480663,                       // compare-and-swap token
    "markers": { "9": { "x": 0.371, "y": 0.182, "size": 6.08 },    // keyed by hypervideoID: one pin,
                 "1": [ { "x": 0.2, "y": 0.6 }, { "x": 0.8, "y": 0.3 } ] }   // or a list when placed more than once
}
```

`x`/`y` are normalized image coordinates of the pin's **centre**; `size` is the pin diameter as a percentage of stage width. A hypervideo can be placed more than once ("Place hypervideo" always adds a pin): its marker is then a list, written back as the pin itself once only one is left (`Database.normalizeOverviewMap()`, `ViewOverviewMap.getPins()` / `setPins()`). Keys stay hypervideo ids, so export selection, import remapping and pruning deleted hypervideos handle all of a hypervideo's pins at once. On the canvas a pin is named `<hypervideoID>/<index>` (`pinKey()`; elements, drag, resize, the card, "Remove from map" = that pin only); every pin carries `data-hypervideoid`.

Why the index rather than `config.json`, where it used to live: the map is part of the library, its coordinates are meaningless without the background they were placed against, and putting it in the config forced marker editing to take the `settings` lock — so arranging the map blocked every other admin's settings dialog, and every save rewrote a file the settings dialog also owned.

- **Writing:** `Database.saveOverviewMap()` → PHP action `overviewMapChange` (`hypervideos.php`), which replaces **only** the `overviewMap` key under the index file's lock. `hypervideoAdd`/`Clone`/`Delete` touch `hypervideos` and the increment, so the two can never clobber each other. Compare-and-swap is on `overviewMap.lastchanged`, returning code 7 like the other guarded writes.
- **Locking:** map editing claims the **`library`** collaboration scope, which already guards `_index.json`. It is claimed only by `ViewOverviewMap.setMapEditing(true)` (the sidebar's "Edit map" toggle) — *not* by the global edit mode.
- **Saving:** every change (drag, resize, add, remove, settings) auto-saves via a short debounce. There is no dirty flag, no save button and no discard prompt.
- **Who:** `ViewOverviewMap.mayEditMap()` = edit mode + `userRole === 'admin'` (a guest is one), not whether it can be written. Where nothing can be written (`StorageManager.canSave()` false: a guest on a server, download, static, a page file not yet saved into itself) `saveOverviewMap()` writes nothing and answers `{ inMemory: true }`: the change stays in `Database.overviewMap` and leaves with the project's Export ("Save to this file" too). `Database.hasUnexportedOverviewMap()` says so (badges on the map button and the overview's Export, the `beforeunload` prompt, `confirmUnsaved({ reload: true })` for callers that reload the page); `adoptOverviewMap()` keeps the in-memory map on library reloads while it holds such changes.
- **Settings:** background / fit / colour are edited in `OverviewMapSettingsDialog`, opened from map editing. `AdminSettingsDialog` only owns the grid/map mode cards.
- **Back-compat:** a `_data` directory whose map is still in `config.overviewMap` (markers as an array) is adopted on load and migrated to the index on the first map save, which then drops the legacy key.

## Tags

Tags route annotations into content views (a TimedContent view's `collectionFilter.tags`: any of them) and are class names on annotation thumbnails (custom CSS). Viewers never see them. Data: [docs/DATA-MODEL.md](docs/DATA-MODEL.md#tagdefinitionsjson).

- **One label per tag:** `tagdefinitions.json` → `{ "<id>": { label, description } }`. The legacy form (a label per language code) is read by `FrameTrailSerializer.tagEntry()` (interface language → `en` → first) and written in the one-label form on the first edit. There is no language UI.
- **Ids never change:** `FrameTrailSerializer.tagID(label, existing)` makes a class-safe id from the label for a new tag; renaming changes the label only. Deleting removes only the definition: items keep the id, which `TagModel.getTag()` reports as `known: false` (the picker shows it marked, Manage Tags lists it under "Not defined" with Define).
- **Who:** `TagModel.canCreate()` (anyone who can edit; on a server a signed-in account) adds tags (`addTag(label)`, PHP `tagAdd`, never over an existing id: code 5 answers with the definitions and the client takes the tag with that label or a new id); `canManage()` (admins) changes and deletes (`setTag`, `deleteTag(id, force)`, PHP `tagSet` / `tagDelete`, which refuses a tag in use without `force`). `usage()`: PHP `tagUsage` on a server, else counted from `BundleExport.collectFolder('project')`. `ensureTag(id, label)` (imports) adds an exact id if missing.
- **TagModel** is the only reader and writer of the definitions: in memory (download, static) what it wrote is the truth (`written`), `updateTagModel()` never fails a load (a missing file is no tags), `subscribe(fn)` tells open pickers.
- **UI:** `TagPicker.create({ selected, onAdd, onRemove })` (`src/_shared/modules/TagPicker/`): chips, a field with a top-layer popover list, "Create tag …", "Manage tags …" for admins. Used by the annotation panel (always visible, beside the thumbnail; one undo step per tag) and the content-view filter. `ManageTagsDialog`: one dialog, rows edited in place (written on Enter or blur, Esc reverts), usage per row, delete confirms.
- **Bundles:** a hypervideo bundle carries the definitions of the tags its items name (`FrameTrailSerializer.usedTagIds()`), a project bundle all of them.

## Annotation Properties

The properties panel of an annotation (`Resource.renderBasicTimeControls()`): a header (time controls, then the tags at the bottom beside the thumbnail), then the tabs Display | Options.

- **Display** (`ViewLayout.renderAnnotationDisplay(annotation)` → `{ element, refresh }`): the layout diagram (`ViewLayout.renderLayoutDiagram()`, also drawn by the layout areas panel in the controls: there without the areas that have no views, as the player shows them now — the ring as the strip where the player has one — and each area a click to open or close it) of the layout areas around the video (and the phone, when the Layout Editor shows it: `showsCompanionArea()`; the ring, when the circular area has a view: its view is a band around the video as thick as in the player, the band the view's border, its name in the top band) with their views as chips (icon and name), each area sized as in the player (its active view's size, read from the player's area container; an empty one a thin dashed strip, as in the Layout Editor), those that show the annotation marked (`ContentView.showsAnnotation()`: Annotations and Timelines views whose filter lets it through, asked of the filter, not of the view's collection), "Shown in: …" or a hint (no such views, or their filters leave it out), and `ViewLayout.renderOpenEditorButton()`. Editing hides the areas, so this is where an author sees where an annotation appears. Refreshed after a tag change and when the tab is opened.
- **Options:** what the type appends to `#AnnotationOptions` (Text, Custom HTML, Quiz, Location, Hotspot). The types fill it after `renderBasicTimeControls()` returns, so `AnnotationsController.renderPropertiesControls()` calls the interface's `initTabs()`, which drops an empty Options tab and opens the tab last chosen for the annotation (`_lastPropertiesTab`), else Options.
- **Layout Editor:** the edit mode `layout` is called Layout Editor everywhere (CSS `.layoutEditor*`, part of the theme selectors). Every link to it is `ViewLayout.renderOpenEditorButton()` ("Open Layout Editor", `icon-website`, disabled where `Sidebar.mayUseEditMode('layout')` is false).

## Circular Layout Area

A sixth layout area, `circular` (`config.layoutArea.areaCircular`): one collection (TimedContent) shown as a grid of annotation thumbnails in rectangular rings around the video, after the 2012 Open Hypervideo prototype. Optional: a hypervideo without it behaves and saves as before.

- **Where:** `.areaCircularContainer` (`.layoutArea[data-area="areaCircular"]`) and `.circularVideoBackdrop` are inside `.videoContainer`, the space the video gets after top, bottom, left and right, so it combines with them and the flex areas, controls and timelines are untouched. `ViewVideo.adjustHypervideo()` asks `ViewLayout.circularGeometry(width, height, aspect, narrow)` and fits the video into the ring's inner block (`ring.box`, letterboxed, never `videoFit: cover`), centring `.hypervideo` on `ring.video`; overlays, captions and the editing handles follow `.hypervideo` unchanged. While a ring is shown `.videoContainer` has `.hasCircularArea` (the other areas' view background, `--secondary-bg-color`; the area's container lies over the video and stays transparent), and only the backdrop (the inner block) is black (`#000`, whatever the theme). With autohide controls the ring ends above them. The container is z-index 30, above `.videoStartOverlay` (29), and `pointer-events: none` but on its cells, so they can be clicked before the first play and a click elsewhere still starts it.
- **Geometry:** `FrameTrailRingLayout` (pure, dual-wrapped, tested in `tests/run-js.mjs`): `layout({ width, height, aspect, count, size })` → `{ across, rings, cols, rows, cell, box, video, slots }` or null, `strip(…)`, `placeByTime(times, duration, slotCount)`, `capacity()`. Thumbnail-shaped cells (height 0.7 × width, stretched within ±15 % so whole cells fill the space edge to edge), sized relative to the player: `across` cells span the video's ringless width (medium 8, small 16), so a hypervideo has the same rings at every player size. The `gap` option (the view's `ringGap`, pixels, default 6; the 2012 prototype had 30) lies between the cells, between the ring and the video's block (`box`, which the backdrop covers) and between the ring and the space's four edges; the strip (`strip.x`/`w`, which `adjustHypervideo()` gives the area's container) is inset by it too. Slots are the thumbnails themselves; `gap: 0` is the gapless grid.
- **Order:** one spiral: ring 1 starts in the cell left of the video's bottom row and runs clockwise (up, along the top, down, back along the bottom) to its bottom-left corner; ring 2 starts left of that. With one ring, the groups of `contentGroups` (consecutive annotations of one resource merge, as in every view) take, in time order, the slots closest to their mid times (`placeByTime()`: least sum of squared distances to the slots' centre times, a slot early weighted `EARLY_WEIGHT` 0.8 of a slot late, the earlier slots on equal cost), so sparse they spread like a clock and a crowd is centred on its time, in doubt earlier. With several rings there is no time placement: they fill the spiral in order (`layoutRing()`), so the inner ring is always full (a second ring only opens when the first has too few slots).
- **Too many:** rings are added until the video would fall below half its ringless width, then the cells step smaller (medium 8 → 10 → 12 → 14 → 16 across, small 16 → 20 → 24). When nothing fits, and at 768 px player width or less: a **strip**, one row of cells below the video, video and strip centred together, laid out like the bottom area (`ContentView.isStrip()` makes `isHorizontalArea()` true, so `distributeElements()`, the slider and the scrollbar apply).
- **ContentView:** `ringGap()` (0–100, default 6), `computeRingGeometry()` (marks the area `.ring` / `.strip`, sets `--circular-cell-width` and `--circular-gap`, `.compact` below 120 px cells or at small: titles hidden, a `data-tooltip-top` instead), `clearRingGeometry()` (not shown), `layoutRing()` (from `updateLayout()`: each thumbnail absolutely positioned in its slot; slots laid out for another number, size or gap call `adjustHypervideo()` once), `_scheduleRingLayout()` (a change of the thumbnails, the size or the gap adjusts the video in the next frame, which can add or remove a ring). The thumbnails have no border (the gap is the space between them); the active one is framed inside by `::after`. The strip uses the gap between its thumbnails (`distributeElements()`) and around them. A click opens the preview (`.resourcePreviewButton`), after a custom `onClickContentItem`. The settings dialog has the gap as a number field (`getDataFromEditingUI()` reads number inputs as numbers, clamped to their `min` / `max`).
- **Progress bar around the video:** while a ring is shown (not in the strip), `.circularProgress` (an SVG in `.videoContainer`, z-index 30, `pointer-events: none`: it only shows the time, there is no seeking on it; the bar below the video stays) runs clockwise from the bottom-left corner of the video's block, up its left side first, as the slots do. The track is `--primary-bg-color` at `stroke-opacity: 0.8`, the range `--primary-fg-color`. `FrameTrailRingLayout.progressTrack(box, thickness)` puts it inside the block, its outer edge on the block's edge (the gap to the ring stays clear). `ViewVideo.placeCircularProgress()` (from `adjustHypervideo()`) places it, `updateCircularProgress(fraction)` fills it (`stroke-dasharray` / `stroke-dashoffset` in pixels of the track's length), called from `HypervideoController.updateProgressBar()`. The line is an open path whose last side runs on by half the thickness: Firefox draws a closed four-sided path as a rectangle, whose dashes start at its top-left corner (the bar started a side late there). When the video ends (native, YouTube, Vimeo), `HypervideoController.showEnd()` draws both bars at the end: the last time update can come before it (YouTube reports the end early), which left the ring's bar visibly short of its corner.
- **One view, a collection, small or medium:** a large one is shown and saved as medium (constructor); the settings dialog offers only the collection type and small/medium; the Edit API's `setLayout('circular', …)` refuses two views, another type and large (`invalid`); the schema has `maxItems: 1`; lint `circular-view-unshown`. `ViewLayout.circularView()` is the first view if it is TimedContent; `hv_config_areaCircularVisible` says whether there is one (never on a phone).
- **Editing:** hidden in the editing modes (`initEditMode()`; `circularGeometry()` is null outside Preview and the Layout Editor), back with `leaveEditMode()`. The layout areas panel toggles it on its band around the video (`ViewLayout.renderLayoutDiagram()`; `.closed` on the container, which `initClosed` sets too). Layout Editor: `.circularLayoutArea` wraps the video schematic in `.playerArea`; its own dropzone accepts only `.contentViewTemplate[data-type="TimedContent"]` and refuses while it has a view; `generateSchematic(type, size, 'ring')` draws the cells (`RING_SCHEMATIC`), and CSS insets the video schematic by one cell of the same grid (`--ring-cols` / `--ring-rows`). No sortable tabs.
- **Saving:** `getLayoutAreaData()` writes an optional area (`AREAS` entries with `optional: true`: companion, circular) only once it is stored or has a view, and carries every `layoutArea` key it does not know over as stored, so a later version's area survives a save by this one. Versions before it (v1.4.3 and older) drop `areaCircular` when they save the open hypervideo.

## Routing and View State

The hash fragment records **which view is on screen**, not just which hypervideo is loaded:

- `#hypervideo=<id>` — the video view. `&t=<seconds>` seeks.
- `#overview` — the overview. Outranks the `startID` init option, so a host that names a start hypervideo can still link to its own overview.

`RouteNavigation.navigateToView('overview' | 'video')` is the single entry point for user-driven view switching: it writes the hash via `history.pushState` and then changes the `viewMode` state. Going back to the overview **keeps the hypervideo loaded** — only the URL and the visible view change, so the titlebar switches straight back into it at its playhead.

`routeHasChanged()` listens on both `popstate` (history traversal) and `hashchange` (a fragment written by something else, e.g. the `jumpToHypervideo` action). `pushState`/`replaceState` fire neither, so the module's own writes cannot re-enter it.

## External Authentication

An instance can defer identity to a hosting platform (LMS, portal) or an institutional identity provider. Server mode only — a provider needs PHP to verify anything. User-facing documentation is [docs/INTEGRATION.md](docs/INTEGRATION.md); the configuration reference is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#external-authentication-externalauth).

- **Provider seam:** `src/_server/auth.php` defines `interface AuthProvider`. Two implementations: `authtoken.php` (a platform mints a short-lived compact JWS) and `authoidc.php` (OIDC relying party, code + PKCE). `jws.php` is verify-only — FrameTrail never signs anything. `ftAuthProvider()` is a hard-coded whitelist; a config value is never turned into a `require()` path. LTI 1.3 is anticipated in the interface but not implemented.
- **`sso.php` is a navigation endpoint, not an ajax action.** No `ajaxServer.php` switch cases were added. Entry points: `?token=`, `?token=…&silent=1` (hidden-frame renewal, answers by `postMessage`), `?a=start`, `?a=callback`, `?a=logout[&then=login]`.
- **Split config:** the public half is `config.json` → `externalAuth`, the secret half is `_data/.auth/config.php` (PHP, so it is executed rather than served), merged with the latter winning. `ftExternalAuthPublic()` is a **whitelist** of what the browser may see — adding a key to the config file must never be able to leak it. `sessionCookie` and `maxSessionAge` are deliberately absent from it.
- **`externalAuth` is never an init option.** The client discovers it at runtime from the `userCheckLogin` response, alongside `forceLogin` and `session_expires_in`. There is no `data-frametrail-*` attribute for it.
- **Client session handling** (`UserManagement`, for platform and password sessions alike): `workingAs` is the account the page's work belongs to — it outlives the session (cleared only by a logout the user asked for, and by guest mode). `isLoggedIn(cb, { quiet, noRenew })` answers `(loggedIn, why)`: code 1 for another account while editing or with unsaved work is not adopted (`sessionPresent`: signed out locally, account-changed dialog once per account, `why` `'changed'`); code 0 for a session that was here first tries the platform quietly (`renewSession`, one renewal shared by all who ask, `rearmTimers()` re-arms its deadline and the heartbeat after `updateHypervideo()`'s timer sweep), and only then signs out and announces (`announceSessionEnded`: the session-ended dialog when editing or unsaved — for password accounts "Sign in again" opens the login box in place —, a private platform instance's sign-in otherwise, else a message). `quiet` is for `ensureAuthenticated()`, which handles a missing session itself (login box; with unsaved work under external auth the session-ended dialog, never a navigation). A network error changes nothing and checks again in 30 s. Codes 3/4 show the dialog without "Sign in again". A login in the box as another account than `workingAs` with unsaved work runs nothing and shows the account-changed dialog. A poll of `Collaboration` answered code 1 triggers the check (at most every 30 s). Export after the session ended takes `workingAs`'s annotations.
- **One session shape:** `ftExternalLoginEstablish()` writes a `$_SESSION["ohv"]["user"]` array byte-identical to the one `userLogin()` produces, which is why `requireLogin()`, annotation file naming and the collaboration layer needed no changes. The extra `["auth"]` key (provider, sub, at, psid) is what `ftExternalSessionEnforce()` reads — called from `config.php` before anything else touches the session, so every entry point inherits it.
- **Role clamping:** `ftNormalizeIdentity()` maps anything that is not literally `"admin"` to `"user"`, so a provider cannot invent a third role and every `requireLogin("admin")` keeps its meaning.
- **`users.json` keys stay small integers** even for external accounts, because the user id becomes a filename (annotation files, uploads) while an OIDC `sub` may contain `/` or `..`. Lookup is by `external.provider` + `external.sub`.
- When external auth is on, `userRegister`, `userLogin` (code **6**, deliberately new) and `userDelete` are refused, `userChange` accepts only `color` and `avatar`, and `ManageUsersDialog` refuses to open.

## External Settings

An instance can hand its settings to the platform hosting it, the companion of external authentication. User-facing documentation is [docs/INTEGRATION.md](docs/INTEGRATION.md#handing-the-instance-settings-to-the-platform).

- **The key:** `config.json` → `externalSettings` (`providerId`, `label`, `manageUrl`). On whenever it is an object. `src/_server/externalsettings.php` holds the helpers: `ftExternalSettingsConfig()`, `ftExternalSettingsEnabled()`, `ftExternalSettingsPublic()` (a **whitelist**; `manageUrl` only if http(s) or root-relative), `ftExternalSettingsRefusal()` (code **8**) and `ftReservedConfigKeys()`.
- **Self-protecting, no overlay:** the guard reads the file on disk, and `updateConfigFile()` is the only in-instance writer of `config.json` after setup, so refusing it while the key is present keeps the key present. `updateCSSFile()` is refused the same way.
- **Reserved keys:** even with the switch off, `updateConfigFile()` copies `externalAuth` and `externalSettings` from disk over whatever the request carried (and drops them if the disk has none), and refuses anything that does not decode to a JSON object — it used to write back a config holding only `lastchanged`.
- **Client:** learned from `userCheckLogin` (`UserManagement.externalSettings()`), on every heartbeat. `Titlebar.updateAdminSettingsButton()` is the one rule for the gear; the user menu gets an "Administration" link to `manageUrl` and "Manage Tags". `AdminSettingsDialog.open()` refuses; a dialog that meets code 8 or notices the takeover closes via `closeAsManaged()`. `Sidebar.refreshSettings()` also reloads `custom.css`, which is how a platform's CSS change reaches an open page.
- Setup (`setupCheckDetailed`, `setupInit`) treats an instance under either switch as already set up.

## Server Extensions

The server part of an extension: actions and routes added to the PHP backend without changing FrameTrail's files. User documentation: [docs/EXTENDING.md](docs/EXTENDING.md#server-extensions); the example is `examples/extension-hello/server/`.

- **Manifest:** `_server/extensions/<name>/extension.php` returns `{ actions: { name: callable }, routes: { name: callable }, requires: [php extensions] }`. Loaded by `ftExtensionManifest()` (`extensionloader.php`) in a scope of its own, once per request; a throw or a non-array becomes `error`, a missing requirement `missing` — never fatal, the handlers just don't run (500 / 503 answers).
- **Switch:** only names in `config.json` → `extensions` (`ftExtensionNames()`; strings or `{ name }`), the same list as the browser part. Init-option-only extensions have no server part. The folder `src/_server/extensions/` ships empty (README only; `.gitignore` and `build.sh` keep installed ones out).
- **Actions:** the `default:` case of `ajaxServer.php` → `ftExtensionFindAction()` → `ftExtensionCall()`, so core names always win; first extension in config order wins among extensions. Answer = the handler's array.
- **Routes:** `_server/extension.php?e=<name>&r=<route>` (`$_GET`), handler writes its own output; an array return is sent as JSON. Unknown → 404 JSON.
- **Handlers** get `{ name, settings }`; `extensionloader.php` requires `user.php`, so `requireLogin()` / `userCheckLogin()` are at hand. Helpers: `ftExtensionStorage($name)` (`_data/.extensions/<name>/`, created on demand), `ftExtensionSecrets($name)` (`_data/.auth/<name>.php`), `ftExtensionSettings($name)`, `ftIsBearerRequest()`.
- **Reporting:** `userCheckLogin` → `serverExtensions` (admins only, `ftExtensionStatus()`); `UserManagement` warns once per problem in the console and exposes `serverExtensions()`.
- **Unreachable private storage:** `.htaccess` denies `.extensions` (with `.auth`, `.collab`); `serve.php` refuses any dot segment of the requested and the resolved path (it used to check the basename only, which served `.collab/*.json`); `dataExport` skips every dot-directory.
- **Subtitles from the server:** `hypervideoChange(…, $subtitleTexts)` / `hypervideoAdd(…, $subtitleTexts)` take WebVTT texts keyed by language (code 8 when invalid, checked before any write); `ftWriteSubtitleFiles()` does deletions, uploads and texts for both.
- **Client helper:** `StorageManager.extensionURL(name, route)` builds the route URL with `dataPath`.

## Personal API Tokens

Non-browser clients act as a user with `Authorization: Bearer ft_<id>_<secret>`. User documentation: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#personal-api-tokens-apitokens); the record shape for platforms in [docs/INTEGRATION.md](docs/INTEGRATION.md#personal-api-tokens).

- **Switches:** `config.json` → `apiTokens` (strict `true`, default off, no UI switch) turns on the self-service in My Settings (`ftApiTokensSelfService()` = flag and not `externalAuth`). Tokens are *accepted* when the flag is on **or** `externalAuth` is active (`ftApiTokensAccepted()`): under external auth the platform owns the `tokens` key and writes hashes itself, and FrameTrail's self-service stays off whatever the flag says. Flag off without external auth → every token refused (401), kept on disk.
- **Storage:** `users.json` → user → `tokens: [{ id, label, hash, created, lastUsed, expires }]`, seconds; `hash` = SHA-256 hex of the secret, `hash_equals`; `lastUsed` written at most every 5 min (`ftTokenTouch()`). Format check: `ftTokenParse()` (id `[a-z0-9]{8,64}`, secret `[A-Za-z0-9_-]{32,128}`). Max 20 per user; expiry 1–3650 days or none.
- **Request flow:** `config.php` resolves the data dir first, then `ftBearerEstablish()`: no `Bearer ft_…` header → `session_start()` + `ftExternalSessionEnforce()` as before; a token → `$_SESSION` filled in memory only (no session, no cookie) and `$GLOBALS["ftBearer"]`; an invalid one → 401 JSON and exit. Other `Authorization` values are ignored (proxies).
- **Never into the account:** `ftBearerRefusesAction()` refuses login/logout/register/userChange/userDelete/token actions/setup with code 403 before the switch in `ajaxServer.php`.
- **Rate limit:** 10 failures per address per 10 min → 429 with `Retry-After`, state in `_data/.auth/bearer/`.
- **No hashes out:** `ftUserWithoutSecrets()` strips `passwd` and `tokens` from `userGet`, `userCheckLogin`, `userChange`; session copies drop `tokens`.
- **Client:** `userCheckLogin` → `apiTokens` (boolean) → `UserManagement` shows the token section of My Settings (dialog 640 px instead of 340), reusing ManageUsersDialog's `.userList*` rows; the value is shown once and cleared on close.

## Overlay Scaling Mechanism

Overlays containing text-like content are scaled so they always render at a comfortable reading width regardless of how small the overlay is on screen. This is a **JS-driven transform**, not a CSS media query or container query.

**How it works (`src/player/types/Overlay/type.js` → `scaleOverlayElement()`):**

1. Called by `rescaleOverlays()` in `OverlaysController` whenever the video/overlay container resizes (triggered from `ViewVideo.adjustHypervideo()`).
2. Applies only to these types (`Overlay.isScaledType()`): `wikipedia`, `webpage`, `text`, `html`, `quiz`, `mastodon`, `urlpreview`. A ResizeObserver on the overlay box re-scales them when box motion animates their size.
3. Logic (`getScaleBase()`):
   - `text` and `html` (`isStageScaledType()`) are laid out on a **virtual stage 800 px wide**: `scale = stageWidth / 800`, `.resourceDetail` gets `width: boxWidth / scale`, `height: boxHeight / scale` and `transform: translate(-50%, -50%) scale(scale)`. Widths are fractional (`getBoundingClientRect()` of the stage, computed width of the box), so a box W % wide is exactly `W × 8` virtual px and lines break the same at every player size — which is what Auto Height measures against.
   - The other scaled types: `scaleBase` = 400px. If the overlay wrapper is **wider** than `scaleBase`, scaling is reset (no transform applied — content fills normally); otherwise `scale = wrapperWidth / scaleBase`, then the `.resourceDetail` is set to `width: scaleBase`, `height: wrapperHeight * (1/scale)`, and `transform: translate(-50%, -50%) scale(scale)` — so the content always *renders* at 400px wide but is visually scaled down to fit.

**CSS complement (`ResourceWebpage/style.css`):**
The iframe inside a webpage overlay gets an additional static zoom-out via `width/height: 133%` + `transform: scale(0.75)` so that the full-width iframe content fits within the 400px rendered container. This is layered on top of the JS scaling, not a replacement for it.

**To add scaling to a new type:** add its `data.type` string to `isScaledType()`. Do NOT use CSS container queries or static CSS transforms as a substitute — the JS mechanism is the authoritative approach. (The overlay-only types Cursor, Counter and Chart are not scaled types: they size their content with container query units.)

## Overlay Animation

Overlay animations are seekable: what an overlay shows is a function of the video time, so scrubbing, pausing and seeking always show the exact frame. The motion is CSS (`@keyframes` in `src/_shared/modules/AnimationLibrary/presets.css`, plus `ft*` keyframes in the new types' stylesheets) and runs natively in the browser's animation engine; JavaScript only keeps it in sync with the video. There is no GSAP (its license excludes visual animation builders).

- **Timing model — transitions frame the span.** The entrance plays *before* `start` (lead-in), the exit *after* `end` (trail-out, as the legacy exit did), so an overlay is fully present and clickable for exactly `[start, end]`. Emphasis loops, text reveals and content animations (counter, chart, cursor clicks) play inside the span. The lead-in is clipped at the video start (overlays at 0:00 appear without one). This is what keeps overlays that pause the video at their start (`frametrail:pause`: every new hotspot/quiz) fully visible at the pause.
- **Activation is unchanged.** `setActive`/`setInactive`, onStart/onEnd, pointer events and synced media still follow the 150 ms tick. Animated overlays additionally get a **presence** state (`.present`, visible but not interactive) from `OverlayAnimator.updatePresence()`, called first in `OverlaysController.updateStatesOfOverlays()`: they are armed 200 ms ahead of their window; the `ftArmed` / `ftDisarm` keyframes flip the animation layer's visibility exactly at the window edges, so arming early never shows anything early. Overlays without any animation keep the plain class-toggle path.
- **DOM.** `Overlay` puts its content into `.overlayAnimationLayer` (`overlay.getContentHost()`), between `.overlayElement` and `.resourceDetail`. Transitions animate only that layer and only `opacity`, individual `translate`/`scale`/`rotate`, `filter` and `clip-path` — never `transform` — so hover styles, `scaleOverlayElement()` and the editing handles keep working. Code that inserts content into an overlay must use `getContentHost()`.
- **Engine (`src/player/modules/OverlayAnimator/`).** Builds one inline `animation` list per overlay (origin = start − lead-in), collects the resulting `CSSAnimation`s (only names starting with `ft`, so e.g. the hotspot pulse keeps its own clock) and syncs them like synced media: on play/pause/seek/rate change it sets every animation's time from the video (`startTime` while playing — never `play()`, which auto-rewinds finished animations), and the 25 ms tick corrects drift (`checkSync`). It reads `HypervideoController.preciseTime` and respects `isStalled` / `isBuffering`. An `ftClock` animation per overlay is the reference for drift checks and for per-frame JS hooks. `invalidate(overlay)` rebuilds after any change; `Overlay.contentChanged()` (debounced) and `Overlay.rerenderContent()` call it.
- **Type hooks (optional, on Resource types):** `getTextRevealRoot(detail)` (Text), `getStrokeTargets(detail)` (Hotspot, for the Draw preset), `animateContent(detail, ctx)` → `{ update(localMs), destroy() }` (Counter, Chart, Cursor). `ctx` carries `leadInMs`, `spanMs`, `entry()` (builds a CSS `animation` entry), `easeCss`, `easeFn`, `reducedMotion`, `editMode`. Content animations put their delays at `ctx.leadInMs + …` so everything shares one origin.
- **Data:** `attributes.animation = { in, emphasis, out, text }`, each `{ preset, duration (ms), ease, params? }` (emphasis also `iterations`, 0 = fill the span; text also `mode` word/letter and `stagger`). It round-trips through `frametrail:attributes`. The legacy fields `animationIn` / `animationOut` / `animationDuration` are read forever (`AnimationLibrary.normalizeAnimation()`) and replaced by `animation` on the first edit in the Animation tab.
- **Registries (`src/_shared/modules/AnimationLibrary/`):** eases (CSS bezier / `linear()`-sampled spring and wiggle, with a JS evaluator each), presets per phase (`appliesTo` limits e.g. Draw to hotspots), window math and text splitting. The ease definitions and evaluators and the keyframe math (`normalizeKeyframes`, `sampleKeyframes`, `sampleRotation`, `unionBox`) live in `FrameTrailKeyframes` (`frametrail-core/serialization/`), which the serializer uses; `AnimationLibrary` re-exports them and adds the CSS side. Also initialised in the resource manager.
- **Editing:** the overlay properties panel has the tabs Options | Animation (`src/player/modules/OverlayAnimationEditor/`). Changes go through `OverlaysController.registerStateUndo()` with `Overlay.snapshotState()` / `applyState()`. Timeline bars show the lead-in / trail-out as faded tails while editing.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, transitions become ≤ 250 ms fades, emphasis and text reveals are dropped and content animations show their end state; box motion is kept.

## Box Motion (Keyframes) and Rotation

An overlay's box can move, resize and rotate over time. The editing UI is deliberately small (CapCut-style), there is no Motion tab:

- **Rotation** (every overlay type): the rotate handle (`.rotateHandle`, below the selected box, above it at the bottom of the stage) turns the box around its centre — snapping to right angles, 15° steps with Shift, double-click resets — and the Rotation input sits next to Top/Left/Width/Height. It is the individual CSS `rotate` property on `.overlayElement`, so it composes with the hover `transform` and with the animation layer's own transforms. Statically it is `data.rotation` (degrees, omitted when 0), serialized as `"frametrail:rotation"` on the FragmentSelector; while the box moves it is `r` on each keyframe instead (mirroring position: switching motion on moves `data.rotation` into the first keyframe, switching it off writes the rotation at the playhead back). A rotated box is resized in its own frame (opposite corner fixed, no snapping), dragged and snapped by its rotated bounding box.
- **Keyframe toggle** (`.keyframeToggle`, a diamond at the selected overlay's corner on the video, shown while the playhead is inside its span): hollow sets a keyframe at the playhead, filled removes it. The first keyframe switches motion on; removing the last switches it off and keeps the box where it is.
- **Auto-keying:** while an overlay has keyframes, every box change — canvas drag/resize, the position inputs, the align buttons — writes the keyframe at `Overlay.editTime()` (the playhead clamped to the span) via `Overlay.setRect()` → `upsertKeyframe()`, snapping to a keyframe within 0.1 s (`keyframeIndexAt()`).
- **Diamonds** on the overlay's timeline element: click jumps there and opens the keyframe menu (`OverlayAnimationEditor.openKeyframeMenu()`, a `popover="auto"` built from `.contextSelectList`: easing of the segment to the next keyframe — Linear / In / Out / In & Out / Hold — and Delete); drag retimes.
- Keyframe edits go through `Overlay.editKeyframes(description, mutate)`, which registers the snapshot undo step.

Media Fragments can only express one static rectangle per time range, and no W3C or IIIF selector describes a moving region, so the keyframes are a FrameTrail extension on the overlay's FragmentSelector:

```jsonc
"selector": {
    "type": "FragmentSelector",
    "conformsTo": "http://www.w3.org/TR/media-frags/",
    "value": "t=12.5,20&xywh=percent:18,22,47,40",           // union box of the track within the span
    "frametrail:keyframes": [
        { "t": 12.5, "xywh": [18.2, 30.1, 15, 12] },          // t: absolute video seconds (incl. offsetIn)
        { "t": 15.0, "xywh": [40.6, 24.0, 16, 13], "r": 30, "ease": "easeInOut" },  // r: rotation in degrees (missing = 0); ease: segment to the next keyframe
        { "t": 18.0, "xywh": [50.0, 22.4, 15, 12], "ease": "hold" }
    ]
}
```

- Internally `overlay.data.keyframes` has the same shape; `data.position` is kept equal to the union box (`AnimationLibrary.unionBox()`), which is also the fallback `xywh` other consumers see. `xywh` values may be off-frame inside keyframes; the fallback box is clamped to 0–100. The fallback box is always the **unrotated** box; rotation is only in the extensions.
- Moving the whole overlay in the timeline shifts its keyframes; trimming it does not (keyframes outside the span are kept).
- At runtime the box is one Web Animation on `.overlayElement` (`left/top/width/height` in percent, plus `rotate` when a keyframe is rotated), cancelled while interact.js drags it or the rotate handle turns it (`OverlayAnimator.suspendBox()`).
- Rotation-aware geometry lives on `Overlay`: `getBoxPx(t)`, `stageToLocal(px, py)` / `localToStage(u, v)` (stage pixels ↔ 0–100 box coordinates at `editTime()`, in the box's rotated frame) and `fitBoxToLocal(u0, v0, u1, v1)` (make a region of the box the whole box, keeping rotation; with keyframes every keyframe box is changed the same way).

## Overlay Auto Size, Inline Text Editing and Media Ratio

Boxes that follow their content, Canva/Figma-style.

- **Auto height** (`attributes.autoSize: "height"`, type `text` only; missing = the box keeps its size, which is what every older overlay does): the height is the content's, only the width is set by hand. `Overlay.hasAutoHeight()`, `measureContentHeight(widthPercent)` (sets `.resourceDetail` to `widthPercent × 8` px for a moment and reads the type hook `getContentFitRoot(detail)`'s `offsetHeight`; `height % = px × (stageWidth / stageHeight) / 8`, independent of the player size) and `fitToContent()` (keeps the top edge — on a rotated box the centre moves along its own y axis —, moves a growing unrotated box up at the stage bottom, caps at 100 %; with keyframes every keyframe gets the height of its own width). The `.autoHeight` class (set in `updateOverlayElement()`) makes `.resourceContent` `flex: none` and unclipped, so the content is never cut off when other fonts make it longer, and gives empty text one line (`min-height: 1lh`).
- **When it refits:** only on changes, never on load (no unsaved changes by themselves): `setRect()` (inputs, align buttons, resize end), tile drop (and again after `document.fonts.ready`), the shape controls (title, shape, fill, outline, padding, the "Auto height" switch), the HTML source, the inline editor, and `addOverlay()` / `replaceOverlayData()` (so the Edit API gets it; deterministic, so undo/redo replays agree). Undo steps around content changes snapshot `attributes` + `position` + `keyframes`. With auto height a corner drag changes only the width (top edge fixed, height measured live, only the side edges snap) and the Height input is disabled. The text tiles (Text, Quote, Notification, Speech Bubble, Cloud) start with auto height; `tile.size[1]` is only the height until measured.
- **Inline text editing** (`TextInlineEditor`, `src/player/modules/TextInlineEditor/`): text overlays are typed into on the video, not in the panel (whose Options keep title, shape and style, the "Auto height" switch and, in an Advanced Options `<details>` that stays open per overlay (`overlay._sourceOpen`), the HTML source; text **annotations** keep the panel's Visual / HTML editors). Starts on double-click (on a ghost too: it jumps into the span) and right after the Text tile is dropped (`start(overlay, { isNew: true })`). A session pauses the video, holds the overlay still (`OverlayAnimator.holdStill()`: animations torn down, text reveals unsplit, nothing built while held), re-renders it and mounts Quill (`theme: 'snow'`, shared setup in `ResourceText`: `quillFonts`, `quillFontSizes`, `registerQuillFormats()`, `addHexColorInput()`) on `.textOverlayBody`; the title becomes `contenteditable="plaintext-only"` (Enter goes on to the text). Quill's snow CSS is neutralised inside overlays. Drag is off through interact's `ignoreFrom: '.inlineEditing .resourceDetail'`, the handles are hidden. The toolbar is a `popover="manual"` (top layer: the video containers clip) placed above the box's bounding rect, below it when there is no room; Quill's link tooltip is hidden and links use a field in the toolbar. Every user `text-change` stores the editor's HTML (without Quill's `.ql-cursor` element and the empty wrappers it leaves) via `ResourceText.setTextHTML()` and refits; a ResizeObserver on the content refits when the height changes without a text change (a size picked for the next letters).
- **Ending:** Esc (window capture listener: closes the link field or an open picker first; `InteractionController.escapeKey()` asks `handleEscape()` when the focus is elsewhere), a pointerdown outside overlay and toolbar, play (`HypervideoController`), another selection (`setOverlayInFocus`), `Overlay.stopEditing()`, leaving the overlays mode, `editBusy`, `viewMode`, `updateHypervideo()` and `removeFromDOM()` (`stop({ discard: true })`). `stop()` re-renders from the data, releases the hold, refits and registers **one undo step per session** (`registerStateUndo`, nothing when nothing changed); a new Text gets its add-undo then (`OverlaysController.registerAddUndo`), or is deleted without a trace when left empty. The panel's title field and HTML source are updated in place (`ResourceText.refreshTextControls()`), never re-rendered, so the click that ended the session still reaches its control.
- **Keys in text fields:** `InteractionController` skips the player's keys (space, arrows, Esc) and Ctrl/Cmd+Z / Y for any `isContentEditable` target, as for inputs (a space typed into CodeMirror used to toggle playback). Quill 2 writes bullet lists as `<ol><li data-list="bullet">`; `.textOverlayBody:not(.ql-container) li[data-list="bullet"]` draws them as bullets.
- **Media ratio:** types with the hook `getIntrinsicRatio(detail, callback)` (Image: `naturalWidth/Height`; Video: `videoWidth/Height` after `loadedmetadata`; YouTube, Vimeo, Wistia, Loom, Twitch: 16:9) keep their shape: `Overlay.hasMediaRatio()`, `readMediaRatio(callback)` (null after 3 s), `fitToRatio(ratio, 'topLeft' | 'center')` (keeps the width; too high for the stage → narrower; keyframes around their centres). A dropped resource is fitted before its add-undo is registered; corner drags keep the box's ratio (Shift frees it; a free rect follows the pointer, the opposite corner stays; snap-on-release snaps one axis and derives the other); "Fit box to media" in Options (around the centre, one undo step). No data change.

## Freeform Hotspot Shape

The outline of a freeform hotspot is drawn and edited on the video by `FreeformShapeEditor` (`src/player/modules/FreeformShapeEditor/`); there is no path field.

- **Data:** `attributes.points: [{ x, y, smooth? }]` in 0–100 box coordinates. Smooth points let the outline curve through them (Catmull-Rom tangents → cubic Béziers, `ResourceHotspot.freeformSegments()`), the others are corners. `attributes.path` is still written, derived by `freeformPath()`, for consumers and older versions. A legacy path-only shape renders as written (the stroke scaled exactly by `scalePathData()`, arcs sampled) and is converted to points on its first edit (`parseFreeformPath()`).
- **Editing:** while a freeform hotspot is selected its points are handles in `.freeformHandles` (a child of `.overlayElement`, so they follow box motion and rotation). Drag a point; drag a "+" between two points to insert one; double-click a point for corner / smooth; select it and press Delete / Backspace to remove it (at least three stay); Esc clears the point selection first.
- **Drawing:** the "Draw shape" button, and right after the Freeform Hotspot tile is dropped (`tile.draw`): a layer over the stage takes clicks that place points; clicking the first point, double-clicking or Enter closes, Backspace takes back the last point, Esc cancels and keeps the previous outline.
- **Fitting:** every edit fits the box to the outline (sampled curves, not just the points) through `Overlay.fitBoxToLocal()`, keeping the rotation — a shape drawn on a rotated overlay gets its bounding box in that rotated frame — and stores the points relative to the new box. One undo step per edit (`registerStateUndo(…, { rerender: true })`).
- **Rendering:** the stroke is laid out in pixels of the box (like the other shapes), not as a stretched 0–100 viewBox with a non-scaling stroke: `pathLength="1"` dashes (the Draw entrance) would otherwise only cover part of the outline. The click area is a `clipPath` in object-bounding-box units.

## Pause at Start

Overlays and annotations can pause the video at their start: `frametrail:pause: true` on the item (`$defs/pause` in `common.schema.json`; model `data.pause`), set by a switch in the time controls of both properties panels, between End and Delete, with the pause icon (`icon-pause-1`) on its knob and no text label (`Resource.renderPauseAtStartSwitch()` / `initPauseAtStartSwitch()`, one undo step). There is no code involved, so it also works for annotations shown on paired phones.

- **When:** `PauseController` (`src/player/modules/PauseController/`, initialised once by `PlayerLauncher`), from the end of both low-priority updaters of `HypervideoController`, on ticks while playing: an item pauses when playback crosses its start (`lastTime < start ≤ t`, `lastTime` the previous playing tick). `seekTo()` calls `seeked(t)` first, which sets `lastTime = t − 0.25`, so a start right where a seek lands counts (an item at 0:00, "Play from here") and a seek into the middle of a span does not; a step over 3 s is a jump. After a pause `lastTime` stays put, so playing on never pauses again; a jump back before the start does. `updateHypervideo()` calls `reset()`.
- **Where:** overlays always; annotations only while shown (`isShown()`): `ViewLayout.viewsShowing(annotation)` → `{ player, companion }` from `managedAnnotations`, TimedContent views only (a Timelines view shows a bar), a player view only while its area is open and rendered and the view is its area's active tab (the ring: `circularView()`); the phone area counts while a phone is connected (`pairing` state). Not on a phone, not in the overview, not in editing modes other than Preview.
- **Defaults** are applied only when an item is made in the editor (`HypervideoModel.pausesWhenNew()`): a tile's `pause`, else the type's `pauseByDefault` (`Resource` false, `ResourceQuiz` and `ResourceHotspot` true). A missing `frametrail:pause` is false, so stored items keep their behaviour; the Edit API applies no defaults.
- **Legacy:** an overlay whose `onStart` is only a pause call (`FrameTrailSerializer.isPauseSnippet()`: `FrameTrail.module('HypervideoController').pause();` or `hypervideo.pause();`) and that has no `frametrail:pause` counts as pausing (`FrameTrailSerializer.pausesAtStart(data)`); `Overlay.setActive()` does not run that call. It stays in the file until the switch is touched, which also removes the call (and clears the onStart code editor).

## Quiz Sessions

A quiz (`ResourceQuiz`) is answered by voters and decided; each answer of a multipleChoice quiz says what follows. User docs: [docs/PAIRING.md](docs/PAIRING.md#questions-on-the-phones); data: `schemas/attributes/quiz.schema.json`; events `quizAnswered` (`source`) and `quizDecided` ([docs/EVENTS.md](docs/EVENTS.md)).

- **Rules** (`FrameTrailQuiz`, pure, dual-wrapped, `src/_shared/frametrail-core/quiz/`, tested in `tests/run-js.mjs`): `normalizeChoice` (index, sorted indices, rating step, text ≤ `MAX_TEXT`), `tally`, `decide` (the most votes; a tie and no votes go to the answer marked `default`, even outside the tie; without one a tie to the tied answer listed first, no votes to the first), `actionOf` → `{ action, target, targetTime, feedback }` (`''` continue, `pause`, `openUrl`, `jumpToTime` + play, `jumpToHypervideo`), `isLegacy` / `fromLegacy` (the old `onCorrectAnswer` / `onWrongAnswer` outcomes, read as actions; jumps relative to the time of answering, converted relative to the start), `changeType`, `newAttributes`, `itemKey` (`<creatorId>/<created ms>`, the same on player and phones).
- **Asking** (`QuizController`, `src/player/modules/QuizController/`, both roles): a quiz annotation reaching its start where it is shown goes from the `PauseController` to `ask(annotation, { pause })` (pause = its `frametrail:pause`; without, a vote while playing, decided when playback crosses its end). One session at a time, others queued. Voters: the phones that show it (`ViewLayout.viewsShowing().companion` and connected phones, minus those that answered `unknown`), else the player (its open views); the player may vote anyway. Decided when all it waits for answered, or at the countdown (a deadline, checked by its own interval and every update). `playRequested()` from `HypervideoController.play()` (not the `play` event: it comes after the play promise): an open paused quiz is called off, a decided one goes on now. A seek before its start or past its end calls it off. `reset()` in `updateHypervideo()`, on edit modes other than Preview and the overview.
- **After the decision:** decided by the player's own click alone → acts at once, a link opens at once (`window.open` needs the click); `pause` and a link while paused wait for Continue (or play); otherwise held 3 s (8 s with feedback, "Continue now") and then done. Phones' answers of phones gone for good are dropped; a phone that may come back keeps its answer.
- **Panel** `.quizSessionPanel` in `.hypervideo` (`ViewVideo.Hypervideo`) while phones vote: question, bars, n of m, countdown, decision and buttons; dark backdrop whatever the theme, sized in container units, z-index above every overlay. Quiz elements show the state through `ResourceQuiz.refreshQuizState()` (every rendered copy is kept on the resource item, `_rendered`; `QuizController.stateOf()` → `{ canAnswer, yours, decided, status, result }`); answers outside a session are disabled ("Answers open when the video gets here"), not in editing modes but Preview.
- **Phones:** protocol v2 `quiz` / `answer` (docs/PAIRING.md); `PairingHost.sendQuiz()` (encoded once), `phoneAnswer()` on `answer`, the open question to a phone on `ready`. On the phone, `link.quiz` / `link.answer()` (`CompanionLauncher`), and the guest role opens a sheet of its own (`Dialog`, `.quizSheetDialog`) with the quiz rendered: its views may differ from the player's copy.
- **Quiz overlays** are answered on the video by the person at the player and decided at once (`overlayAnswered` until the playhead leaves them); they pause through `frametrail:pause` like any overlay.
- **Editor** (`ResourceQuiz.renderQuizEditor()`): answers with a folded "Then:" (`Resource.renderActionControls(item, { target, actions, beforeChange, onChange })`, feedback, the default switch), "After answering" for the other types, the countdown for annotations; a legacy quiz is shown converted and becomes so on the first change; one snapshot undo per change (focus leaving the editor, or a choice). The annotations' Custom tab has a Quiz tile.

## Code Snippets, Events and Hypervideo CSS

There is no Custom Code edit mode (overlay actions cover running code).

- **Code snippets** (`CodeSnippet` items in `hypervideo.json` → `contents`) have no UI and are not a kind of the Edit API: they run when written into the file. `CodeSnippetsController` only compiles them (`initController()`) and runs them at their time (`updateStatesOfCodeSnippets()`); the type has no DOM. Imports, the settings dialog's duration cut and the phone's stripped bundle still handle them.
- **A hypervideo's `customCSS`** is deprecated: still applied (by `CodeSnippetsController`, in one `style.FrameTrailCustomCSS` element that the next hypervideo replaces), never edited; `HypervideoModel.customCSS` is read-only. CSS belongs in the instance's `custom.css` (Administration → Global CSS).
- **`globalEvents`** (onReady, onPlay, onPause, onEnded) are edited in the hypervideo settings dialog's Advanced Options (see the cross-hypervideo rule), below the "Auto-hide controls" switch (`config.autohideControls`) and the poster frame. The action preset picker of those editors and of the overlay actions is `HypervideoFormBuilder.renderActionPresetPicker()`.

## Editor Selection

Overlays and annotations share one selection model in their edit modes, following video-editor conventions:

- **Click** (timeline element, or an overlay on the video) selects the item (`OverlaysController.selectOverlay()`, `AnnotationsController.selectAnnotation()`) and **never moves the playhead**. Clicking a selected item does nothing.
- **Double-click** on the timeline element jumps to the item's start. Moving a timeline element horizontally and resizing it still seek (to the new start, or to the end when the end handle is dragged); so do the Start/End inputs.
- Dragging or resizing selects the item and keeps it selected. Every interact.js `end` listener calls `ViewVideo.swallowNextClick()`, so the click that ends a gesture never reaches selection, deselection or the play toggle; a scrub drag on an empty timeline does the same.
- **Deselect** with Esc (`InteractionController`), a plain click on empty timeline space (which also seeks, as before), or a click on empty video space (which then does not toggle playback).
- **Ghost:** a selected overlay that is not shown at the playhead (outside `[start, end]` and outside its animation window) gets `.ghost` — dimmed, dashed, still draggable and resizable. `OverlayAnimator.setGhost()` shows its settled look (`end` − 1 ms: entered, text revealed, content animations finished) with the box sampled at the nearest span edge, which is also where `editTime()` writes box changes. During the lead-in and trail-out the real frame is shown instead, so scrubbing and Preview stay WYSIWYG. Double-clicking a ghost jumps into its span.
- **Double-click on a text overlay** on the video edits its text there (see Overlay Auto Size, Inline Text Editing and Media Ratio); on a text ghost it also jumps into the span.

## Transcripts Edit Mode

Subtitles (one WebVTT file per language, `hypervideo.json` → `subtitles`) are made and changed in the edit mode `transcripts` (sidebar button after Chapters), and nowhere else: the hypervideo settings dialog and the new-hypervideo dialog have no subtitle UI. `TranscriptsEditor` (`src/player/modules/TranscriptsEditor/`) fills `ViewVideo.EditingOptions` and the transcript timeline (`ViewVideo.TranscriptTimeline`, shown only in this mode).

- **Panel:** a hint that transcripts appear as captions (CC button) and in Transcript views, with a link to the layout editor; the language select (names from `Localization.languageName()`, any code `[A-Za-z0-9_-]{1,32}`, suggestions from `Localization.LANGUAGE_CODES`) with "New transcript …" (empty, upload, generate); a menu (replace with a file, shift all times, generate, delete); the "Show captions from the start" switch (`config.captionsVisible`, written directly and saved as category `config` — not through `setConfig()`, which re-applies every `hv_config_*` and would bring back the layout areas the edit mode hides); which Transcript views show the language; the cue list (start, end, speaker, text; jump, split at the playhead, merge with the next, delete). Rows mark overlaps and cues outside `[offsetIn, offsetIn + duration]`; the cue at the playhead is marked and kept in view (`updateActiveCue()`, called next to `SubtitlesController.updateStatesOfSubtitles()`), unless the user is in a field or pointing at the list.
- **Writing:** the editor changes a `FrameTrailWebVTT` document and writes the whole text with `HypervideoModel.setSubtitles(lang, text)`, one undo step per change (category `subtitles`, which `UndoManager` maps to this mode and `Sidebar.newUnsavedChange` to its button). Text fields are taken on `change`, Enter or Ctrl/Cmd+S (`flush()`, also called by a non-silent `HypervideoModel.save()` and when leaving the mode); while typing only that cue's caption is updated (`Subtitle.setText()`). `HypervideoModel.setSubtitles()` calls `TranscriptsEditor.subtitlesChanged(lang)`, which redraws for changes the editor did not make (undo, redo, the edit API, a transcriber).
- **Typing workflow:** in a cue's text, Enter ends the cue at the playhead and starts the next one there (when the playhead is past the cue's start and before the next cue; otherwise it goes on to the next cue), Shift+Enter is a line break, Esc plays/pauses.
- **Timeline:** `renderTimeline()` (end of `renderCues()`) draws the shown language's cues as blocks (`.transcriptCueBlock`, label = speaker + plain text), cut to the video; the minimap shows them via `TranscriptsEditor.cueRanges()` (`TimelineController.getMinimapRanges()`; other unlisted edit modes show nothing there). Selection follows Editor Selection: click selects (row `.selected`, block `.highlighted`, no seek), double-click jumps, focusing a row's field selects its cue, Esc (`InteractionController`) or a click on empty timeline space deselects. Drag moves a cue, the edge handles change start/end (`beginGesture` / `moveGesture` / `endGesture`, one undo step via `commit()`); an edge touching the neighbour's (within 0.5 ms) moves both, free edges and moved cues stop at their neighbours, the video span and `MIN_CUE_LENGTH`; a free edge snaps to the neighbour's within 5 px (closing the gap).
- **Captions while editing:** entering the mode shows the captions of the edited language (`hv_config_captionsVisible` true, `selectedLang`), leaving restores the state (or the new default).
- **Uploads:** `.vtt` or `.srt` (`FrameTrailWebVTT.sniff` / `fromSRT`), checked with `FrameTrailLint.checkVTT` (problems listed by line); replacing a language with cues asks first.
- **Generating:** an extension's `slots.transcriber` (`Extensions.transcribers()`; see Client Extensions). A run survives switching edit modes; leaving editing or the hypervideo (`reset()` from `updateHypervideo()`) aborts it.
- **Transcript views:** `transcriptSource` names a language; empty, or a language without subtitles, means the first one (`HypervideoModel.transcriptLanguage()`, used by the view, its settings, `viewsShowing()` and the serializer's `transcriptsToHTML`). The settings' dropdown always has a language selected while there are transcripts (disabled "No transcripts yet" otherwise); a new view gets the first language; `HypervideoModel.setSubtitles()` re-renders Transcript views (`ViewLayout.updateTranscriptContentViews()`). Deleting a transcript that views show asks: show the next one there (or, for the last one, keep the views, which then show the next one made), or delete the views too — one undo step (`UndoManager.registerGroup()`: subtitles + `ViewLayout.setContentViews()` per area). Undoing a deletion puts the language back at its place in the list (`setSubtitles(lang, text, position)`), which decides the first.
- **Crosslinks:** the Transcript content view's settings link to the mode (`changeState('editMode', 'transcripts')`); the mode's hint links to the layout editor.
- **Display:** captions render cue markup through vtt.js (`WebVTT.convertCueToDOMTree`, never `innerHTML`) with a speaker prefix; Transcript views show plain text (`toPlain`) and start a paragraph with the speaker's name when it changes. Where the browser has no Fullscreen API (iOS), `SubtitlesController` gives an HTML5 video native `<track>`s made from the loaded texts (Blob URLs).

## Shapes (Text and Hotspot)

Text is the type for text in a shape, as in Keynote or PowerPoint; Hotspot the type for marking something in the picture (outline shapes with a pulse, drawn arrows, underline, freeform) with a click action. Data: `schemas/attributes/text.schema.json` (`box`), `hotspot.schema.json`.

- **Text:** `attributes.box` is the style: `shape` (`rectangle` | `rounded` | `circle` | `speechBubble` | `cloud` | `arrow`; missing: `rounded` when `radius > 0`, else `rectangle` — cards made before shapes), `direction` (bubble tail and the cloud's two trailing circles: 8 directions, default `downLeft`, the cloud also `none`; block arrow: right/left/up/down, default `right`), `background` (fill), `borderWidth` / `borderColor` (outline, 0 = none), `radius` (rounded, speechBubble; default 12), `padding`, `shadow`, `textColor`, `titleColor`. Plain text has no `box`: the panel (`ResourceText.renderShapeControls()`, always shown) writes it on the first style change and removes it when nothing of it is left; fill, outline or a shape on plain text start with padding 24, a shape on text that draws nothing gets a white fill. `ResourceText.applyShapeStyle()` draws rectangle, rounded and circle in CSS (circle: text in the inscribed rectangle, 14.645 % in), speech bubble, cloud and block arrow as one SVG outline behind the text (`.textShapeSvg`, `shapePath()` → `bubblePath()` / `cloudPath()` in a frame with the tail at the bottom (`shapeFrame()`), `arrowPath()`; in pixels of the content, re-laid out by a ResizeObserver, padding from `shapePadding()`). The bubble's tail curves smoothly out of the body to a sharp tip; the cloud's bumps are spaced evenly along an ellipse. Circle, bubble, cloud and arrow centre their text; with auto height they fill the box and `getContentFitHeight()` (asked by `Overlay.measureContentHeight()`) gives the height (circle √2 × the text's, cloud √2 × without the circles' strip, a left/right arrow 1 / 0.6). Lint: a text with a visible shape is complete without text.
- **Hotspot:** Outline (Line for arrow and underline: `color`, `borderWidth`, 0 = none) and Fill (`backgroundColor`, closed shapes only — not drawn for lines) are `Resource.renderColorSwitch()` controls (switch + colour; off keeps the colour, so on brings it back), also used for Text's Fill and Outline. `attributes.pulse` (`ResourceHotspot.hasPulse()`): missing means on unless filled (the rule before the switch); the editor writes it once the fill changes, so the fill no longer decides. Lines have no fill, label or pulse. Each change of the hotspot editor is one undo step (a snapshot of the attributes; overlays via `registerStateUndo`).

## Custom Overlay Gallery

The "Custom Overlay" tab of the overlay editing panel is one flat gallery built from `getCustomOverlayTiles()` in `OverlaysController`: Hotspot (unchanged defaults), Text (auto height, typed into on the video right after the drop), Quiz, then Rectangle, Rounded Rectangle, Circle, Speech Bubble, Cloud, Block Arrow (Text overlays in a shape; they drop without starting to type, double-click types), Arrow, Curved Arrow, Underline, Freeform Hotspot (Hotspot variants that draw themselves in; the freeform one starts in draw mode), Cursor (starts with box motion on), Counter, Bar / Line / Donut Chart and Progress Ring, Quote, Notification (pre-styled Text overlays with auto height), and last Custom HTML. A tile is `{ id, type, icon, label, attributes, size, events?, pause?, motion?, draw? }`; the drop handler builds the overlay from it. A tile without `pause` gets its type's default (`Resource.pauseByDefault`: quizzes and hotspots pause at their start); the drawn hotspot variants pass `pause: false`. The former "Presets" tab (Pause & Continue, Choice Buttons) has been removed.

## Client Extensions

Extensions are code that is not part of FrameTrail (add-ons, a hosting platform's tools) and must never require changes to `index.html`, `build.sh` or modules. User documentation: [docs/EXTENDING.md](docs/EXTENDING.md#writing-an-extension); the example is `examples/extension-hello/`.

- **Registration** is global (`FrameTrail.registerExtension(name, factory)`, `defs_extensions` in core); the factory runs once per instance via `instance.initExtension(name)` and gets the internal instance. Interface: `{ init(settings), onReady, onHypervideoChange(id), onChange, onUnload, slots }`.
- **Loading** (`src/player/modules/Extensions/`): entries come from the `extensions` init option (state `extensions`) and `config.json` → `extensions`; same name in both → init entry wins, config fills gaps. `Extensions.load(cb)` runs in `PlayerLauncher` after `Database.loadData` and before `initModule('Interface')`, on both the video and the overview path; with no entries it calls back synchronously (behaviour unchanged). Paths must match `^[^/:?#][^:?#]*$` and resolve to the page's origin. Scripts/stylesheets are added once per page (found again by URL; styles ref-counted, inserted before `custom.css`). Failures (404, 10 s timeout, invalid entry, throwing factory/`init`) warn and skip — never block the player. PHP's `[]` for empty `settings` is handed over as `{}`.
- **Dispatch:** core `changeState()` calls extensions' `onChange` after all modules, each in `try`/`catch` — an exception must never leave the update loop (that would freeze all state propagation). `onReady` is called by `PlayerLauncher`, `onHypervideoChange` there and in `HypervideoModel.updateHypervideo()`; `instance.destroy()` → `Extensions.unload()`.
- **Slots** are created in `Interface.create()` via `Extensions.create()`:
  - `sidePanel`: `.sidePanel` absolutely positioned in the target, right of `.mainContainer`, which gets `.sidePanelOpen` and narrows by `--ft-side-panel-width`; `ViewVideo.adjustHypervideo()` subtracts `Extensions.sidePanelWidth` (0 at ≤ 768 px, where the panel overlays). It lives outside `.viewVideo`, so it survives hypervideo switches. Every theme block in `variables.css` lists `.sidePanel:not(.editActive)`; a new theme must too.
  - `titlebarAction`: `Titlebar.addActionButton()` (before the admin settings button). `when: 'always' | 'edit' | 'view'` for both of these.
  - `transcriber`: `{ label?, available?(context), transcribe({ hypervideoId, language, signal, onProgress }) → Promise<{ language, vtt }> }`, no element; `Extensions.transcribers()` lists them, the transcripts edit mode uses the first that is offered (Generate). `available()`: `true`; `false` = not offered here (no button); a string = offered, but not now (shown when pressed).
  - `editPanel`: `Sidebar.addEditModeButton()`; the mode name is the extension's name. `editsHypervideo` (default true) adds it to `LOCK_GATED_EDIT_MODES`, which now drives both the collaboration lock and the owner/admin permission check. `ViewVideo.toggleEditMode` → `enterExtensionMode()` (`initEditMode()`); `Extensions` calls `enter(panel)` in a microtask (built-in modes clear the panel while leaving, in no fixed order) and `leave()` synchronously. `Interface` sets `.extensionEditMode` (CSS that names the built-in panel modes lists it too) and `.lockGated` (drives `.collabBlocker`).
- `updateHypervideo()` clears every timer on the page — documented for extension authors; don't "fix" an extension bug by relying on timers surviving a switch.

## Edit API

`instance.edit` (and `FrameTrail.edit` on the internal instance) is the `edit` object of the `EditAPI` module (`src/player/modules/EditAPI/`, which also has `stop(rollback)`, `busy` and `onChange`): the documented way for extensions and scripts to read and change the open hypervideo. User documentation: [docs/EXTENDING.md](docs/EXTENDING.md#editing-the-hypervideo); the script test page is `examples/edit-api.html`.

- **Stored format, not the model:** items are W3C items, chapters `{ start, title }`, content views and config as in `hypervideo.json`. Reads serialize the Database's data (`Database.overlays`, `.annotations`) with the serializer and `Database.sourcePathOf()`, so items of a type without renderer (legacy `button`) are listed and `_stored` never leaks. Writes: `add` completes the envelope (type, frametrail:type, creator, unique created, target type/source, selector type), `update` is a JSON Merge Patch on the stored form (created, creator and the body's type cannot change), then validation with `FrameTrailSchema` + `FrameTrailSchemas`, then `Serializer.parse*` → model (the given/merged item becomes `_stored`, which keeps unknown properties).
- **Around the data:** `getInfo()` (open id, video = `Database.sourcePathOf()`, `start`/`end`/`duration` from `HypervideoModel.offsetIn`/`duration`, `null` until known), `getUser()` (`{ id, name, role, guest }` or `null`), `permission(kind)` (`refusalOf()`, the same check `requireEditing()` throws, without claiming the lock), `listHypervideos()` (`{ id, open, meta, clips, subtitles }` from `Database.hypervideos`, the open one from `getHypervideo()`). Scripts and extensions use these instead of reading modules; keep them in step when the permission rules or the time model change.
- **Identity:** `created` (ISO; annotations per creator, `{ creator, created }` for others'), chapters by `start` — unique; the chapter editor also refuses a start another chapter has and a second "Add chapter" at the same playhead.
- **Writes go through the controllers**, which work in any edit mode: `addOverlay` / `replaceOverlayData` / `deleteOverlay` (and the annotation equivalents), `ChaptersController.addChapter` / `setChapterData` / `deleteChapter`, `ViewLayout.setContentViews`, `HypervideoModel.setSubtitles` / `setConfig`. Outside their own editor they must not stack the timeline, start editing, clear another item's selection or fill the edit panel (`renderChapterList` only in the chapters editor). Keep that when changing them.
- **Undo:** each write keeps a command; alone it is registered, in `transaction(description, fn)` they are collected and registered with `UndoManager.registerGroup()` (one category → switch to its mode; mixed → stay). The transaction's own `tx` object is the only way in; async `fn` is allowed; a throw/rejection runs the collected undos in reverse. Chapter edits in the UI (add, delete, start, title, drag) register undo too; subtitle steps (category `subtitles`) switch to the transcripts mode.
- **Busy editor:** while an async transaction is open, state `editBusy` = `{ description }`: other writes and transactions are refused, `UndoManager` refuses undo/redo, `Interface` sets `.editBusy` (CSS in `ViewVideo/style.css` makes video container, edit panel, timelines and layout editor inert; controls, progress bar and timeline zoom stay usable), the freeform editor ignores keys, `HypervideoSettingsDialog.open()` refuses the loaded hypervideo, `Sidebar` shows a fixed notice (`MessageEditBusy`, "Automated editing in progress") and Stop in its collaboration notice. `EditAPI.stop(true)` (Stop, `HypervideoModel.confirmUnsaved()` before its prompt — leaving edit mode and every switch —, `editMode` → false) takes the changes back; `stop(false)` in `updateHypervideo()`. The promise rejects with code `stopped`; `tx.signal` is aborted. A new editing surface must respect `.editBusy` (inside the regions above it does automatically).
- **Saving:** `subtitles` and `config` are save categories of `HypervideoModel` (`Sidebar.newUnsavedChange` tolerates categories without a button). Pending subtitle texts (`{ lang: text | null }`) go with `Database.saveHypervideo(cb, id, { subtitles })`: multipart `subtitles[<lang>]` / `SubtitlesToDelete[]` in `hypervideoChange` on the server, `writeText` / `deleteFile` through the adapter elsewhere; kept for the next save when it fails. `Database.subtitles[lang].vtt` holds the loaded text.
- **Permissions** as in the editor: edit mode; hypervideo kinds need admin or creator and no foreign collaboration lock (a write claims the lock); annotations only the user's own. Errors are `FrameTrailEditError` with `code` `invalid` (+ `errors: [{ path, message }]`), `notFound`, `notAllowed`.

## Device Pairing

Phones pair with the player by scanning a QR code and then show the hypervideo's views for phones in step with its playback; a phone can play, pause and seek it while it may (`canControl`). A whole classroom can pair with one player. User and contract documentation: [docs/PAIRING.md](docs/PAIRING.md); spike results and the real-device matrix still to fill in: `plans/device-pairing-spike.md` (git-ignored).

- **Config:** `pairingBrokerURL` (empty: off; a path starting with `/` is resolved against the page's origin, `FrameTrailPairing.resolveBrokerURL`), `pairingButtonVisible` (strict `true`), `pairingCompanionURL` (empty: `companion.html` beside the page, http(s) only) — Administration → Advanced Settings; `AdminSettingsDialog` republishes the `config` state after a save, which `ViewVideo.updatePairingButton()` hears. The button (`.pairingButton`, `icon-mobile-1`, before `.sharingWidget`) shows in the video view on non-touch devices (`FrameTrail.isTouchPrimary()` on the internal instance), not in companion mode, in edit mode only while paired.
- **Questions:** protocol v2 added `quiz` (player) and `answer` (phone, no control right needed); see Quiz Sessions.
- **Pure part** (`FrameTrailPairing`, dual-wrapped): ids, join link (`<companion>#pair=<room>&b=<broker>&fp=<sha-256, base64url>`), fingerprint check of the answer SDP, the broker client of contract v1 (`brokerClient`, `pollAnswer`), offer/answer/refusal blobs, message validation per side (`decode(text, 'host' | 'guest')`), chunking (`bundleMessages`, `createAssembler`), the phone's clock (`createClock`: extrapolates, jumps only beyond 0.25 s or on start/stop/rate), `gatherComplete`, `selectedPath(stats)`, `companionBundle()` (strips overlays, code snippets, global events, `onClickContentItem`).
- **Broker:** external, against the contract in PAIRING.md; `scripts/pairing-broker.mjs` is the stub (`createBroker({ now })` for tests, `--stun`, `--turn --turn-secret` for coturn REST credentials, `--cert/--key`). The tests run the contract against it in-process. The normal course answers no 4xx (browsers log those): no ICE servers is `{ iceServers: [] }`, no answer yet `204`, DELETE of a gone room `204`. `scripts/pairing-lan.mjs` serves a proxy to the local web server plus the stub at `/pairing-broker/` on `https://<computer>.local:8443` (mkcert certificate when available) for trials with a real phone.
- **Travels with a project:** the three keys are in `FrameTrailSerializer.PLAYBACK_CONFIG_KEYS` (and the project-bundle schema), so a project file keeps them and exported project pages and imported project settings carry them.
- **Host** (`PairingHost`, initialised by `PlayerLauncher` unless companion): room + host key, ECDSA certificate; the room stays open and is polled every second until `close()` (Stop), so the QR code stays up. Phones in `guests` (by guest id), up to `MAX_PHONES` (50) connecting or connected, more refused `full`; the same guest id offering again replaces its attempt. Control is decided at `hello`: a resume token restores it, otherwise only the first phone (none connected, none in `returning`) gets `canControl`. A dropped phone goes into `returning` (by resume token) for two minutes (one timer for the earliest window); when the last window ends with no phones left and the dialog closed, pairing ends. `setCanControl(id, on)` and `disconnect(id)` (`bye`, no resume) per phone. The bundle (`BundleExport.bundle()` + `pageDatapath()` / `pageConfig()`, `offsetIn`, `duration`) is built once per hypervideo and revision (`EditSave`, edit mode ending bump it; a hypervideo switch, once `hypervideoChanged(id)` says the new one is ready, changes the key) and the same encoded pieces go to every phone; the state comes from `timeupdate` / `play` / `pause` events plus a 100 ms sampler (heartbeat 1 s / 5 s), computed once and sent to every phone with the current bundle, at once to a phone that reports `ready` or comes back from the overview. Requests go to `HypervideoController.play/pause/currentTime`. `updateHypervideo()` clears all timers: `hypervideoChanged()` restarts them. Status in the `pairing` state; `PairingDialog` (QR via `qrcodegen`, link, status, the phones as `.userList` rows with a control switch and a disconnect button, Stop) renders it; the pairing button is active while `connected > 0`. What the dialog and the phone's screens say is for people at the player and on the phones, in plain words: no setting names, broker, WebRTC, connection paths or layout editor (`path` stays in the state, unshown); the technical reason goes to the console (`REASONS` + `explain()` in `PairingHost` and `CompanionLauncher`; the dialog maps the problem codes to `PairingErrorUnavailable` / `PairingErrorInterrupted` while the room is open).
- **Phone** (`CompanionLauncher` on `companion.html`, its own FrameTrail instance): offers, checks the fingerprint, keeps the channel, and runs `FrameTrail.init({ bundle, config, dataPath, companion: link }, 'PlayerLauncher')` per bundle in a child element (`destroy()` the previous one; core `destroy()` now stops the controller's intervals and calls every module's `onUnload`). Screens: connecting, waiting, loading, overview, reconnecting, full, closed, version, ended, failed, fingerprint, invalid; a chip; Wake Lock while paired; seeks coalesced to one per 100 ms.
- **Companion mode in the player** (the `companion` state): `HypervideoModel` uses `videoType 'canvas'` over the link's `offsetIn`/`duration`; `HypervideoController` reads `link.time()` in `nullVideoUpdater`, turns `play`/`pause`/`setCurrentTime` into `link.request()` (the local seek is `seekTo()`), follows states via `link.subscribe()`, and sets `.companionNoControl`; `ViewLayout.create()` makes only the `areaCompanion` views (none set: none shown, and `CompanionLauncher` says so) and `ViewVideo.AreaCompanionContainer` is the right area's container there; `Interface` sets `.companionMode` (CSS in `CompanionLauncher/style.css`); `Extensions` loads nothing; `ViewVideo.adjustHypervideo/adjustLayout` do nothing.
- **Companion area:** `config.layoutArea.areaCompanion`, a fifth collection in `ViewLayout` (`AREAS` table: name, key, cap; whichArea `'companion'`), rendered into the hidden `.areaCompanionContainer` so its settings UI works, shown in the layout editor as a phone (`.companionLayoutEditor`) when a broker is set or views exist. No default view: what a phone shows is set on purpose. `getLayoutAreaData()` writes the key only once it exists (an optional area, like the circular one), so other hypervideos are saved as they were. Sizes on a phone: no small (`ContentView` turns it into medium, the settings offer medium and large); medium as the right area; large TimedContent is a slideshow (`ContentView.isSlideshow()`): a horizontal row of full annotations (`isHorizontalArea()` drives every axis decision), following the playback via `updateCollectionSlider`, swiped through with the overlay the bottom/top details use (`initSwipeOverlay(container, step)`, `slideBy(step)` / `slideTo(element)`, by element: the slides are 10 px apart), with a strip of thumbnails beneath it (`initCollectionStrip` / `renderCollectionStrip` / `updateCollectionStrip`; each group's `stripElement` follows its active state, `.shown` marks the slide on screen and its thumbnail, both undimmed, a tap slides there), CSS in `CompanionLauncher/style.css` — as is the phone's tab row above the views (the right area's container with horizontal tabs). The phone, and the phone in the layout editor, open on the first view: `create()` and the layout editor activate it after all views are appended, since each view activates itself as it is appended (elsewhere the last one stays shown). On touch-primary devices a content view pauses following the playback for 6 s after a touch or scroll (`TOUCH_FOLLOW_PAUSE`) instead of using `mouseenter`/`mouseleave`. `ContentView.isVerticalArea()` (left, right, companion except a slideshow) replaces the old `left || right` checks; EditAPI and TranscriptsEditor know the area.
- **No code on the phone:** `companion.html` has `script-src 'self'` and no inline script; the bundle is stripped on both sides.
- **Private instances** (docs/PAIRING.md, *Private instances*): a phone has no session, so `serve.php` takes a **pairing grant** instead, for `_data/resources/` only. `src/_server/pairing.incl.php`: `<expiry>.<base64url HMAC-SHA256>` over `pairing-v1|resources|<expiry>`, signed with `_data/.auth/pairing_grant.php` (made by the first grant, `fopen 'x'`, 0600; the underscore keeps it out of extension names), 600 s (`FT_PAIRING_GRANT_TTL`), cookie name `FTPAIR` + the session name's host hash, path `<app base>/_data/resources/`. `ajaxServer.php?a=pairingGrant` (signed in, private only, refused to API tokens) mints one. `serve.php` decides on the *requested* path before resolving it (so nobody learns which files exist), checks the resolved target again, starts the session only when there is no valid grant (`FT_DEFER_SESSION` + `ftSessionBegin()`), and closes it before streaming. `PairingHost.fetchGrant()` runs in `open()` before the room opens and again from `sample()` at half the lifetime (no timer of its own: `updateHypervideo()` clears timers); `giveGrant(g)` sends `grant { token, ttl (seconds left), cookie, path }` to each phone before its bundle, never inside the cached bundle; while the grant a phone needs is still being fetched, its bundle waits (`holdBundles` in `sample()`), because media refused once are not asked for again. `CompanionLauncher` sets the cookie through `FrameTrailPairing.grantCookie()` (which refuses anything that could add a cookie attribute) and removes it on `bye`. Only for the default companion page on the instance's own origin.

## Export and Import

Export (`ExportDialog`) and `instance.export()` (`BundleExport`) write a hypervideo, the project or some of its hypervideos as a page in the **portable HTML format** ([docs/HTML-FORMAT.md](docs/HTML-FORMAT.md)), as a bundle (JSON), as the `_data` folder in a zip, or (the dialog) into a local folder with its media files. The **Import** button (`ImportDialog`; server, local-folder and project-file mode, edit mode) reads those, earlier HTML/JSON exports, and the server's zip with media.

- **The format:** the bundle is JSON in `<script type="application/ld+json" data-frametrail="hypervideo|project" data-frametrail-format="1">` (every `<` as `\u003c`), attributes `data-frametrail-datapath` (what relative media paths resolve against), `-config`, `-target`; then the library (jsDelivr pinned to a release version, or inline with `</script` → `<\/script`, `<!--` → `<\x21--`) and `FrameTrail.autoInit()`. `FrameTrailHTMLFormat` (pure, dual-wrapped) parses and writes it, registers `html` with the serializer, and reads earlier exports without evaluating them (`parseLegacy`).
- **Playing:** `autoInit()` turns each block (first per target) into `FrameTrail.init({ bundle, … })`; `PlayerLauncher` converts the `bundle` option into `contents` entries with the hypervideos' own `id`s, their annotations and subtitle texts, plus resources, tag definitions, and the internal states `overviewMap` and `customCSS`. `Database.contentsEntry(id)` finds an entry by id; inline subtitle texts are parsed instead of fetched. Download mode, nothing fetched: works from `file://`.
- **Export** builds a folder map (paths → contents) per storage mode — stored files through the adapter, the open hypervideo and the user's own annotations live — and `readBundle(…, 'folder')` makes the bundle. Media are never embedded in pages and bundles; the datapath is the instance's `_data/` URL (none from a local folder, a project file's own). A zip or a folder is always a project's `_data` folder (for one hypervideo: a project of it). Options (`exportData`): `hypervideoIDs` → `FrameTrailSerializer.selectFolder()` (index, map markers); `library` (project only, default true; a hypervideo never takes it) false → `FrameTrailSerializer.withoutLibrary()` (no resources listed, `frametrail:resourceId` and clip `resourceId` dropped, a clip named only by its resource gets its src — hypervideos never need the library to play); `localAuthors` → `FrameTrailSerializer.localAuthors()` (every non-`guest_` user id becomes `guestUserID(name)` in creators, file names and index entries; the current user's name as it is now; same names merge); `includeMedia` (zip, server mode) → action `exportZip` (`ajaxServer.php`): the folder map posted as JSON (decoded as objects, so `{}` stays `{}`), the media files of `mediaPaths()` added from `_data/resources/` via `ftResourceFilePath()`, stored uncompressed, those it lacks in the header `X-FrameTrail-Missing`. `dataExport` (the whole `_data` folder as stored) is no longer used by the client. Local folder mode makes blob URLs for every file in `resources/` (`preloadResourceURLs`), not only the library's, so an export without the library plays there.
- **Export dialog** (`ExportDialog`; sidebar `.exportButton` / `.projectExportButton`, Ctrl+S where nothing can be saved, the session-ended dialogs, `instance.saveAs()`) exports and never moves the tab. What, as option cards (`.exportScopeCards`): "This hypervideo" (its thumbnail and name) only when opened from within one (`viewMode` video, a hypervideo loaded), else "Whole project" (title if set, hypervideo count, a mosaic of the first six thumbnails) alone; beside them the library switch (project only, on), the authors switch ("Rewrite user annotations to their authors' names", `BundleExport.hasAccountAuthors()`: annotations under account ids, on by default). Where: **Export to Local Folder** (`BundleExport.exportToFolder()`: an empty folder, a `StorageAdapterLocal` of its own, data first, then the media files of `FrameTrailSerializer.mediaPaths()` streamed — from the local folder via `readFile`, else fetched from `getResourceURL()` — missing ones listed; without the File System Access API the column stays, inactive, with a note) and **Download Files** (HTML File with the "Embed FrameTrail into the file" switch, `StorageManager.embedSwitchHTML()`, also in New Project File; JSON Data; ZIP Archive, "Include media files" active in server mode). In `download` / `static` mode a finished folder export offers "Continue editing in <folder>": `StorageManager.adoptFolder()`, then the data is reloaded from the folder (the open hypervideo only in the video view: reloading it opens it).
- **Import rules:** new hypervideo ids, owned by the importer (`meta.creator`/`creatorId`); every source id remapped or dropped (resources in clips and items, `jumpToHypervideo` targets, map markers); resources deduped by absolute URL (re-importing an instance's own export reuses its uploads); relative media → `datapath + 'resources/' + path` unless a zip carries the file (copied: uploaded on a server, written in a local folder; never into a project file), unresolved ones reported; all annotations into the importer's file with their creators; code (global events, code snippets, hypervideo custom CSS, global CSS) only with "Import code", admin-only on a server; a project's map, playback settings and global CSS as switches, on for an empty instance, admin-only on a server, settings/CSS off under `externalSettings`; missing tags added (admin). Not in download/static mode.

## Localization

**Language Files:** `src/_shared/modules/Localization/locale/`
- Default: `en.js`
- German: `de.js`
- Add new languages by creating `{locale}.js` files
- **Important:** Locale files are `.js` files (not `.json`)
- Switch language via `FrameTrail.module('Localization').setLanguage(locale)`
- A key missing in the current locale falls back to English, per key. `Localization.addLabels({ en: {…}, de: {…} })` merges labels at runtime (extensions use it)

**Configuring the language:** Language is set via `config.defaultLanguage` in the init options — `language` is NOT a direct init option. The `data-frametrail-language` HTML attribute maps to `config.defaultLanguage` internally (handled in `_autoInit`). Example: `FrameTrail.init({ config: { defaultLanguage: 'de' } }, 'PlayerLauncher')`.
