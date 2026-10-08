# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FrameTrail is an open hypervideo environment for creating, annotating, and remixing interactive videos. It's a client-side JavaScript application with an optional PHP backend that uses **JSON files instead of a database** for all data storage. The entire system is portable — copy the `_data` directory between servers and everything works.

FrameTrail can run in five modes: with a PHP server (full multi-user), with the File System Access API for local editing in Chrome/Edge (no server needed) of a `_data` folder or of a project file (one HTML page in the portable format, saved in place), in-memory using the Download adapter (view + edit + export, no persistence — works everywhere but requires data to be passed via init options), or in static/CDN mode (read from a static host + in-memory edits + Save As export, no PHP backend needed).

## Repository Structure

All source code lives in `src/`. The `build/` directory (git-ignored) contains production output.

```
FrameTrail/
├── src/                            # ALL source code (runnable as-is for development)
│   ├── index.html                  # Player/editor entry point
│   ├── resources.html              # Standalone resource manager
│   ├── setup.html                  # First-run setup wizard
│   ├── .htaccess                   # Apache rewrite rules
│   ├── favico.png
│   ├── _lib/                       # Vendored third-party libraries (11 packages)
│   ├── _shared/
│   │   ├── frametrail-core/
│   │   │   ├── frametrail-core.js  # Core: defineModule, defineType, init, state
│   │   │   ├── serialization/      # FrameTrailSerializer (stored JSON ⇄ model), FrameTrailKeyframes, FrameTrailHTMLFormat (portable HTML)
│   │   │   ├── schema/             # FrameTrailSchema (validator for the schemas/ subset), FrameTrailSchemas (generated copy of schemas/)
│   │   │   ├── storage/            # StorageAdapter + Server/Local/HTMLFile/Download/Static adapters
│   │   │   ├── _templateModule.js  # Module boilerplate template
│   │   │   └── _templateType.js    # Type boilerplate template
│   │   ├── modules/                # 17 shared modules
│   │   ├── types/                  # 26 resource types + the base Resource
│   │   ├── styles/                 # Global CSS (variables, generic, webfont)
│   │   └── fonts/                  # Webfonts (woff2 only)
│   ├── player/
│   │   ├── modules/                # 29 player-specific modules
│   │   └── types/                  # Player types (Annotation, Overlay, etc.)
│   ├── resourcemanager/
│   │   └── modules/ResourceManagerLauncher/
│   ├── _server/                    # PHP backend
├── schemas/                        # JSON Schemas for the files in _data/ and for bundles
├── tests/                          # node tests/run-js.mjs; fixtures/ (data folders, cases, examples)
├── scripts/
│   └── build.sh                    # Production build script
├── .github/workflows/
│   ├── build.yml                   # CI: tests + build verification on push/PR
│   └── release.yml                 # CD: package + GitHub Release on tags
├── docs/                           # Developer documentation (DATA-MODEL.md: the _data contract; HTML-FORMAT.md: the portable HTML format)
├── build/                          # Build output (git-ignored)
└── ...                             # README, LICENSE, CONTRIBUTING, etc.
```

## Architecture

### Application Structure

Three HTML entry points in `src/`:
- **`src/index.html`** — Main player/editor (bootstraps via `PlayerLauncher` module)
- **`src/resources.html`** — Standalone resource manager (bootstraps via `ResourceManagerLauncher`)
- **`src/setup.html`** — Initial setup wizard (one-time)

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
- `src/_shared/frametrail-core/serialization/` — Pure serializer and keyframe math (plain globals, also `require()`-able in Node)
- `src/_shared/frametrail-core/schema/` — `FrameTrailSchema`, the validator for the schema subset (same wrapper), and `FrameTrailSchemas.js`, the schemas without titles/descriptions, generated by `node scripts/bundle-schemas.mjs` (never edit it by hand); the player loads both for the edit API
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
- `src/_server/config.php` — Server configuration; starts the session, or authenticates a personal API token instead
- `src/_server/functions.incl.php` — Shared utility functions
- `src/_server/tokens.php` — Personal API tokens: bearer authentication, `userToken*` actions
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
| `fflate/` | fflate | ZIP file creation for Save As / All Data export |
| `dialog/` | dialog (custom) | Lightweight wrapper around native `<dialog>` |
| `leaflet/` | Leaflet | Map rendering (OpenStreetMap) |
| `codemirror6/` | CodeMirror 6 | Code editor (JS/CSS/HTML modes + linting) |
| `hlsjs/` | HLS.js | Adaptive video streaming |
| `quill/` | Quill | Rich text editing (replaces WYSIHTML5) |
| `parsers/` | VTT parser | Subtitle parsing |

### Storage Modes (`storageMode` state)

- `'server'` — PHP backend available, data loaded/saved via AJAX to `src/_server/ajaxServer.php`. Shared files are compare-and-swap writes (code 7): `hypervideo.json` (`meta.lastchanged`), `config.json`, `custom.css`, the overview map — and each user's annotation file, whose writer is the user but maybe from another tab or a script with an API token: `annotationfileSave` takes `baseVersion` (the user's index entry's `lastchanged`, milliseconds), and the `Collaboration` scope `annotations` / `<hypervideoId>` (observed, no lock, no own-writer suppression; token `"<lastchanged>:<mtime>:<size>"` for the session's user) shows the sidebar's notice.
- `'local'` — File System Access API active, data read/written via `StorageAdapterLocal` to a user-selected folder. Other programs may write the folder meanwhile: `Collaboration` runs in its `localFolder` mode (versions of `hypervideo.json`, `hypervideos/_index.json` and the user's own annotation file — modification time and size — checked on window focus, on entering edit mode and every 30 s while editing; the sidebar's "changed" notice), and `Database.saveHypervideo()` / `saveAnnotations()` / the hypervideo settings dialog refuse to overwrite a changed file (code 7, as on the server). The adapter remembers the version of every file it reads and writes, so its own writes are never reported.
- `'file'` — a project file: one HTML page in the portable format (`StorageAdapterHTMLFile`), read as a `_data` folder held in memory and written back into the page's first data block on every write (`FrameTrailHTMLFormat.readProject` / `writeProject`; the rest of the page is kept). Same interface as `StorageAdapterLocal` (incl. the per-path versions, so `Collaboration`'s `localFolder` mode and the code-7 refusal work; another tab's change of another path is not a conflict), minus media files: resources are URLs or paths relative to the page's datapath (`./` → `resources/` beside a new page), there is no upload tab. Entry points: the storage dialog (`StorageManager.openStorageDialog()`: Reopen, Select Folder, Open Project File, New Project File — shown in `'needsFolder'` and from the title bar's folder/file name), "Save to this file" on a page in the format opened from disk (sidebar Save, Ctrl+S; remembered per page as IndexedDB `page:<path>`, used at the next load only if permission is granted and the file still holds the page's data block), and Save As "Save to Project File" (no server). `StorageManager.isLocal()` = `'local'` or `'file'` (read/written through the adapter); `=== 'local'` where real files beside the data are needed. In file mode the bundle-derived init states (config, tagdefinitions, contents…) are ignored: the file is the only source.
- `'needsFolder'` — File System Access API supported but no folder or project file open yet (none remembered, or permission must be asked); the launcher shows the storage dialog
- `'download'` — No persistent storage available (Firefox/Safari, or any browser without File System Access API and no PHP); `StorageAdapterDownload` is used, which stores data in memory and lets users export/download it. Viewing and editing work; `canSave` is `false` (no persistent target); changes are exported via Save As. Data persists only until page reload.
- `'static'` — CDN/static hosting mode (no PHP backend). `StorageAdapterStatic` reads JSON from a CDN base URL (`dataPath` init option) and inherits in-memory write from `StorageAdapterDownload`; work leaves through Save As. Used when `dataPath` is set but `server` is omitted.

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

### Key Architectural Patterns

1. **Module Pattern**: Modules return public interfaces, private state hidden in closures
2. **Observer Pattern**: State changes trigger module `onChange(stateName, stateValue)` callbacks
3. **Lazy Loading**: Modules initialized on-demand via `FrameTrail.initModule()`
4. **File-Based Persistence**: All data stored as JSON files (no database)
5. **Event-Driven**: Timeline events, user actions broadcast to listeners
6. **W3C Web Annotations**: Uses standardized annotation format with FrameTrail extensions
7. **Guest Mode is orthogonal to storage mode**: `UserManagement.isGuestMode()` is an identity-layer flag — it means "editing without a server account", not "in download mode". A user can be in guest mode in any storage mode (local, download, or server). `StorageManager.canSave()` is the authoritative gate for save UI: it returns `false` for server mode when in guest mode, and delegates to `adapter.canSave` otherwise (`StorageAdapterDownload.canSave` is always `false`; `StorageAdapterLocal.canSave` is `true`). Always use `canSave()` rather than checking `isGuestMode()` or `storageMode` directly in save-related UI. A guest's `userID` is derived from the entered name (`guestUserID()`: `guest_<slug>-<FNV-1a hash>`, case- and whitespace-insensitive), so the same name is the same user across sessions; in local mode it names the guest's annotation file and decides which annotations are editable.

**Important: FrameTrail instance vs global:**
- The global `FrameTrail` object is the factory/registry. `FrameTrail.module()`, `FrameTrail.changeState()`, etc. are only available on **initialized instances** (the `FrameTrail` parameter passed into `defineModule` callbacks).
- Modules defined via `FrameTrail.defineModule()` receive the instance as their closure argument — they can freely call `FrameTrail.module('X')`.
- Plain classes (e.g. `StorageAdapter` subclasses in `src/_shared/frametrail-core/storage/`) are **not** FrameTrail modules and do **not** have access to any instance. If they need to call module APIs, the caller must pass the FrameTrail instance explicitly.
- `window.FrameTrailSerializer` and `window.FrameTrailKeyframes` (`src/_shared/frametrail-core/serialization/`) and `window.FrameTrailSchema` / `window.FrameTrailSchemas` (`src/_shared/frametrail-core/schema/`) are pure globals: no instance, no DOM. Their wrapper also exports them under `require()` in Node; keep it that way (tests and tools load them there).
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
| ResourceText | Rich text (WYSIWYG via Quill + HTML editor), optional title and card style |
| ResourceHtml | Raw HTML (CodeMirror HTML editor only, no sanitisation) |
| ResourceLocation | OpenStreetMap (via Leaflet) |
| ResourceQuiz | Interactive quiz |
| ResourceHotspot | Clickable hotspot: circle, rectangle, rounded, arrow, underline, freeform (outline drawn on the video) |
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
5. Generates clean HTML entry points that load only the two bundles
6. Copies `_server/`, `.htaccess`, `favico.png`, `LICENSE.md`

**Docker:** `Dockerfile` + `compose.yaml` in the repo root run this same build in a throwaway Node stage and serve the output via PHP + Apache (`docker compose up -d`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#option-1-server-deployment-php) for build args (e.g. `WITH_FFMPEG`) and volume details.

### Tests

```bash
node tests/run-js.mjs                         # Node 20+, no dependencies (node:test)
node tests/run-js.mjs --data=src/_data        # also check a real _data folder
node tests/extract-examples.mjs               # after changing the data in an examples/*.html page
node scripts/bundle-schemas.mjs               # after changing a schema (the player's copy; the tests check it)
```

`tests/fixtures/`: `data/<name>/` are `_data` folders (no `users.json`, no media; `all-types` has an item of every type and loads in the player), `cases/*.json` and `examples/*.json` are `{ description, cases: [{ name, schema, data, errors? }] }` — no `errors` means valid, otherwise exactly those errors. The runner validates everything with `FrameTrailSchema`, round-trips valid hypervideos, annotation files and content items through the serializer (allowed differences: `@context`, ISO `created` with de-dup bumps, `meta.lastchanged`, contents order overlays → code snippets → others), and reads data folders as bundles. tests/README.md states these rules for runners in other languages. Expected errors in a case are what `FrameTrailSchema` reports; check they name the real problem before committing them.

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

- **Any change to what is stored** — a new resource type, attribute, config key or file — updates the schemas and DATA-MODEL.md in the same change, and regenerates the player's copy (`node scripts/bundle-schemas.mjs`). Every property the code reads has a `description`; defaults the code applies go into `default`.
- **Schema subset:** only the keywords listed in DATA-MODEL.md ("Schema Subset"); patterns in syntax common to ECMA-262 and PCRE. Discriminated `oneOf` by a `const` property where possible (every alternative requires it, each with its own value — that is what lets `FrameTrailSchema` report the meant alternative's errors). `FrameTrailSchema` throws on any other keyword, so the tests fail on a schema outside the subset.
- **Tests:** a change to what is stored also adds fixtures (an item in `tests/fixtures/data/all-types`, cases in `tests/fixtures/cases/`) and keeps `node tests/run-js.mjs` green.
- **Legacy shapes stay valid:** older forms (toString `created`, PHP's `[]` for `{}`, local-mode annotation index entries, …) are separate `oneOf` alternatives or descriptions starting "Legacy.". Never drop one without checking that no stored data uses it.
- **Unknown properties are allowed** almost everywhere; writers keep them.
- **Serializer:** all reading and writing of `hypervideo.json`, content items and annotation files goes through `FrameTrailSerializer` (`parseHypervideo` / `serializeHypervideo`, `parseAnnotationFile` / `serializeAnnotationFile`, …); `Database` delegates to it. Every parsed object keeps the stored object it came from in `_stored`, and writing is a three-way merge (stored, what the writer makes of stored unchanged, what it makes of the model now): unchanged parts are written byte-for-byte as stored, unknown properties survive, and only `@context` and ISO `created` are always rewritten. Never build stored JSON by hand next to it, and add new stored fields to both the `parse*` and the `write*` side.
- **Item identity on load:** `parseContents` / `parseAnnotationFile` de-duplicate `created` per collection (annotations per creator) by moving the later item on by 1 ms (`dedupeCreated`).
- **Cross-hypervideo rule:** `HypervideoSettingsDialog` is also opened from the overview for any hypervideo. Anything it does to items must act on the edited one (`isLoadedHypervideo()` decides live data vs stored data), never on the loaded one. Shortening a duration deletes/truncates that hypervideo's overlays and code snippets — live for the loaded one, otherwise via `cutContents()` on the JSON the dialog writes — and never touches annotations (they belong to their authors).
- **`convertToDatabaseFormat(id, purpose)`** builds the model from `hypervideos[id]` (meta, config, clips, chapters, subtitles — where the settings dialog edits them) and its `hypervideoData`; only when `id` is the open hypervideo does it take live overlays, code snippets, global events, custom CSS and the `ViewLayout` content views. `purpose: 'export'` turns Transcript views into CustomHTML; nothing in FrameTrail uses it any more — exports are bundles, which carry the subtitles, so they keep Transcript views like saves.
- **Namespace:** `http://frametrail.org/ns/` stays HTTP (it is an identifier). The JSON-LD context document is `https://frametrail.org/ns/context.jsonld`, maintained in the FrameTrail-Website repository (`ns/`) together with the namespace page.

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

There is no session-based override — every request is validated independently. This allows multiple data directories to be used in parallel (e.g. in different browser tabs).

**When adding new server actions:** The `dataPath` parameter is handled centrally in `config.php` — no per-action code needed. All PHP files that use `$conf["dir"]["data"]` automatically get the correct path.

**When adding new client-side server calls:** Include `dataPath` in the POST body. For modules with a `_serverPost()` helper, this is automatic. For direct `fetch()` calls, get the value via `FrameTrail.module('StorageManager').getAdapter().dataPathAbsolute`.

**Runtime Configuration** (`_data/config.json`):
- Authentication settings
- Upload restrictions (file types, sizes)
- Theme/UI settings
- Default user roles and permissions
- Custom labels for UI elements

## Overview Map

The overview can present hypervideos as a grid or as pins on a background image. Which of the two is a **setting** (`config.overviewMode`: `"grid"` / `"map"`, decided once in `ViewOverview.create()`, so switching it reloads the page). The map itself is **content** and lives in the `overviewMap` key of `_data/hypervideos/_index.json`, reachable as `Database.overviewMap`:

```jsonc
"overviewMap": {
    "background": "1_1788531102_overview-vector.svg",  // a resource src
    "backgroundColor": "#2f3139",
    "fit": "contain",                                   // or "cover"
    "lastchanged": 1788942480663,                       // compare-and-swap token
    "markers": { "9": { "x": 0.371, "y": 0.182, "size": 6.08 } }   // keyed by hypervideoID
}
```

`x`/`y` are normalized image coordinates of the pin's **centre**; `size` is the pin diameter as a percentage of stage width.

Why the index rather than `config.json`, where it used to live: the map is part of the library, its coordinates are meaningless without the background they were placed against, and putting it in the config forced marker editing to take the `settings` lock — so arranging the map blocked every other admin's settings dialog, and every save rewrote a file the settings dialog also owned.

- **Writing:** `Database.saveOverviewMap()` → PHP action `overviewMapChange` (`hypervideos.php`), which replaces **only** the `overviewMap` key under the index file's lock. `hypervideoAdd`/`Clone`/`Delete` touch `hypervideos` and the increment, so the two can never clobber each other. Compare-and-swap is on `overviewMap.lastchanged`, returning code 7 like the other guarded writes.
- **Locking:** map editing claims the **`library`** collaboration scope, which already guards `_index.json`. It is claimed only by `ViewOverviewMap.setMapEditing(true)` (the sidebar's "Edit map" toggle) — *not* by the global edit mode.
- **Saving:** every change (drag, resize, add, remove, settings) auto-saves via a short debounce. There is no dirty flag, no save button and no discard prompt.
- **Settings:** background / fit / colour are edited in `OverviewMapSettingsDialog`, opened from map editing. `AdminSettingsDialog` only owns the grid/map mode cards.
- **Back-compat:** a `_data` directory whose map is still in `config.overviewMap` (markers as an array) is adopted on load and migrated to the index on the first map save, which then drops the legacy key.

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
3. Logic:
   - `scaleBase` = 400px (800px for `text`)
   - If the overlay wrapper is **wider** than `scaleBase`, scaling is reset (no transform applied — content fills normally)
   - Otherwise: `scale = wrapperWidth / scaleBase`, then the `.resourceDetail` is set to `width: scaleBase`, `height: wrapperHeight * (1/scale)`, and `transform: translate(-50%, -50%) scale(scale)` — so the content always *renders* at 400px wide but is visually scaled down to fit
4. The `text` type uses the full overlay container width as the reference instead of the wrapper.

**CSS complement (`ResourceWebpage/style.css`):**
The iframe inside a webpage overlay gets an additional static zoom-out via `width/height: 133%` + `transform: scale(0.75)` so that the full-width iframe content fits within the 400px rendered container. This is layered on top of the JS scaling, not a replacement for it.

**To add scaling to a new type:** add its `data.type` string to `isScaledType()`. Do NOT use CSS container queries or static CSS transforms as a substitute — the JS mechanism is the authoritative approach. (The overlay-only types Cursor, Counter and Chart are not scaled types: they size their content with container query units.)

## Overlay Animation

Overlay animations are seekable: what an overlay shows is a function of the video time, so scrubbing, pausing and seeking always show the exact frame. The motion is CSS (`@keyframes` in `src/_shared/modules/AnimationLibrary/presets.css`, plus `ft*` keyframes in the new types' stylesheets) and runs natively in the browser's animation engine; JavaScript only keeps it in sync with the video. There is no GSAP (its license excludes visual animation builders).

- **Timing model — transitions frame the span.** The entrance plays *before* `start` (lead-in), the exit *after* `end` (trail-out, as the legacy exit did), so an overlay is fully present and clickable for exactly `[start, end]`. Emphasis loops, text reveals and content animations (counter, chart, cursor clicks) play inside the span. The lead-in is clipped at the video start (overlays at 0:00 appear without one). This is what keeps overlays whose `onStart` pauses the video (every new hotspot/quiz) fully visible at the pause.
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

## Freeform Hotspot Shape

The outline of a freeform hotspot is drawn and edited on the video by `FreeformShapeEditor` (`src/player/modules/FreeformShapeEditor/`); there is no path field.

- **Data:** `attributes.points: [{ x, y, smooth? }]` in 0–100 box coordinates. Smooth points let the outline curve through them (Catmull-Rom tangents → cubic Béziers, `ResourceHotspot.freeformSegments()`), the others are corners. `attributes.path` is still written, derived by `freeformPath()`, for consumers and older versions. A legacy path-only shape renders as written (the stroke scaled exactly by `scalePathData()`, arcs sampled) and is converted to points on its first edit (`parseFreeformPath()`).
- **Editing:** while a freeform hotspot is selected its points are handles in `.freeformHandles` (a child of `.overlayElement`, so they follow box motion and rotation). Drag a point; drag a "+" between two points to insert one; double-click a point for corner / smooth; select it and press Delete / Backspace to remove it (at least three stay); Esc clears the point selection first.
- **Drawing:** the "Draw shape" button, and right after the Freeform Hotspot tile is dropped (`tile.draw`): a layer over the stage takes clicks that place points; clicking the first point, double-clicking or Enter closes, Backspace takes back the last point, Esc cancels and keeps the previous outline.
- **Fitting:** every edit fits the box to the outline (sampled curves, not just the points) through `Overlay.fitBoxToLocal()`, keeping the rotation — a shape drawn on a rotated overlay gets its bounding box in that rotated frame — and stores the points relative to the new box. One undo step per edit (`registerStateUndo(…, { rerender: true })`).
- **Rendering:** the stroke is laid out in pixels of the box (like the other shapes), not as a stretched 0–100 viewBox with a non-scaling stroke: `pathLength="1"` dashes (the Draw entrance) would otherwise only cover part of the outline. The click area is a `clipPath` in object-bounding-box units.

## Editor Selection

Overlays, annotations and code snippets share one selection model in their edit modes, following video-editor conventions:

- **Click** (timeline element, or an overlay on the video) selects the item (`OverlaysController.selectOverlay()`, `AnnotationsController.selectAnnotation()`, `CodeSnippetsController.selectCodeSnippet()`) and **never moves the playhead**. Clicking a selected item does nothing.
- **Double-click** on the timeline element jumps to the item's start. Moving a timeline element horizontally and resizing it still seek (to the new start, or to the end when the end handle is dragged); so do the Start/End inputs.
- Dragging or resizing selects the item and keeps it selected. Every interact.js `end` listener calls `ViewVideo.swallowNextClick()`, so the click that ends a gesture never reaches selection, deselection or the play toggle; a scrub drag on an empty timeline does the same.
- **Deselect** with Esc (`InteractionController`), a plain click on empty timeline space (which also seeks, as before), or a click on empty video space (which then does not toggle playback).
- **Ghost:** a selected overlay that is not shown at the playhead (outside `[start, end]` and outside its animation window) gets `.ghost` — dimmed, dashed, still draggable and resizable. `OverlayAnimator.setGhost()` shows its settled look (`end` − 1 ms: entered, text revealed, content animations finished) with the box sampled at the nearest span edge, which is also where `editTime()` writes box changes. During the lead-in and trail-out the real frame is shown instead, so scrubbing and Preview stay WYSIWYG. Double-clicking a ghost jumps into its span.

## Custom Overlay Gallery

The "Custom Overlay" tab of the overlay editing panel is one flat gallery built from `getCustomOverlayTiles()` in `OverlaysController`: Text, Custom HTML, Quiz, Hotspot (unchanged defaults), then Card, Quote, Notification (pre-styled Text overlays), Arrow, Curved Arrow, Underline, Freeform Hotspot (Hotspot variants that draw themselves in; the freeform one starts in draw mode), Cursor (starts with box motion on), Counter, and Bar / Line / Donut Chart and Progress Ring. A tile is `{ id, type, icon, label, attributes, size, events?, motion?, draw? }`; the drop handler builds the overlay from it. Tiles that pass `events: {}` opt out of the pause-on-start default of hotspots and quizzes. The former "Presets" tab (Pause & Continue, Choice Buttons) has been removed.

## Client Extensions

Extensions are code that is not part of FrameTrail (add-ons, a hosting platform's tools) and must never require changes to `index.html`, `build.sh` or modules. User documentation: [docs/EXTENDING.md](docs/EXTENDING.md#writing-an-extension); the example is `examples/extension-hello/`.

- **Registration** is global (`FrameTrail.registerExtension(name, factory)`, `defs_extensions` in core); the factory runs once per instance via `instance.initExtension(name)` and gets the internal instance. Interface: `{ init(settings), onReady, onHypervideoChange(id), onChange, onUnload, slots }`.
- **Loading** (`src/player/modules/Extensions/`): entries come from the `extensions` init option (state `extensions`) and `config.json` → `extensions`; same name in both → init entry wins, config fills gaps. `Extensions.load(cb)` runs in `PlayerLauncher` after `Database.loadData` and before `initModule('Interface')`, on both the video and the overview path; with no entries it calls back synchronously (behaviour unchanged). Paths must match `^[^/:?#][^:?#]*$` and resolve to the page's origin. Scripts/stylesheets are added once per page (found again by URL; styles ref-counted, inserted before `custom.css`). Failures (404, 10 s timeout, invalid entry, throwing factory/`init`) warn and skip — never block the player. PHP's `[]` for empty `settings` is handed over as `{}`.
- **Dispatch:** core `changeState()` calls extensions' `onChange` after all modules, each in `try`/`catch` — an exception must never leave the update loop (that would freeze all state propagation). `onReady` is called by `PlayerLauncher`, `onHypervideoChange` there and in `HypervideoModel.updateHypervideo()`; `instance.destroy()` → `Extensions.unload()`.
- **Slots** are created in `Interface.create()` via `Extensions.create()`:
  - `sidePanel`: `.sidePanel` absolutely positioned in the target, right of `.mainContainer`, which gets `.sidePanelOpen` and narrows by `--ft-side-panel-width`; `ViewVideo.adjustHypervideo()` subtracts `Extensions.sidePanelWidth` (0 at ≤ 768 px, where the panel overlays). It lives outside `.viewVideo`, so it survives hypervideo switches. Every theme block in `variables.css` lists `.sidePanel:not(.editActive)`; a new theme must too.
  - `titlebarAction`: `Titlebar.addActionButton()` (before the admin settings button). `when: 'always' | 'edit' | 'view'` for both of these.
  - `editPanel`: `Sidebar.addEditModeButton()`; the mode name is the extension's name. `editsHypervideo` (default true) adds it to `LOCK_GATED_EDIT_MODES`, which now drives both the collaboration lock and the owner/admin permission check. `ViewVideo.toggleEditMode` → `enterExtensionMode()` (`initEditMode()`); `Extensions` calls `enter(panel)` in a microtask (built-in modes clear the panel while leaving, in no fixed order) and `leave()` synchronously. `Interface` sets `.extensionEditMode` (CSS that names the built-in panel modes lists it too) and `.lockGated` (drives `.collabBlocker`).
- `updateHypervideo()` clears every timer on the page — documented for extension authors; don't "fix" an extension bug by relying on timers surviving a switch.

## Edit API

`instance.edit` (and `FrameTrail.edit` on the internal instance) is the `edit` object of the `EditAPI` module (`src/player/modules/EditAPI/`, which also has `stop(rollback)`, `busy` and `onChange`): the documented way for extensions and scripts to read and change the open hypervideo. User documentation: [docs/EXTENDING.md](docs/EXTENDING.md#editing-the-hypervideo); the script test page is `examples/edit-api.html`.

- **Stored format, not the model:** items are W3C items, chapters `{ start, title }`, content views and config as in `hypervideo.json`. Reads serialize the Database's data (`Database.overlays`, `.codeSnippets.timebasedEvents`, `.annotations`) with the serializer and `Database.sourcePathOf()`, so items of a type without renderer (legacy `button`) are listed and `_stored` never leaks. Writes: `add` completes the envelope (type, frametrail:type, creator, unique created, target type/source, selector type), `update` is a JSON Merge Patch on the stored form (created, creator and the body's type cannot change), then validation with `FrameTrailSchema` + `FrameTrailSchemas`, then `Serializer.parse*` → model (the given/merged item becomes `_stored`, which keeps unknown properties).
- **Identity:** `created` (ISO; annotations per creator, `{ creator, created }` for others'), chapters by `start` — unique; the chapter editor also refuses a start another chapter has and a second "Add chapter" at the same playhead.
- **Writes go through the controllers**, which work in any edit mode: `addOverlay` / `replaceOverlayData` / `deleteOverlay` (and the annotation and code snippet equivalents), `ChaptersController.addChapter` / `setChapterData` / `deleteChapter`, `ViewLayout.setContentViews`, `HypervideoModel.setSubtitles` / `setConfig`. Outside their own editor they must not stack the timeline, start editing, clear another item's selection or fill the edit panel (`renderChapterList` only in the chapters editor). Keep that when changing them.
- **Undo:** each write keeps a command; alone it is registered, in `transaction(description, fn)` they are collected and registered with `UndoManager.registerGroup()` (one category → switch to its mode; mixed → stay). The transaction's own `tx` object is the only way in; async `fn` is allowed; a throw/rejection runs the collected undos in reverse. Chapter edits in the UI (add, delete, start, title, drag) register undo too.
- **Busy editor:** while an async transaction is open, state `editBusy` = `{ description }`: other writes and transactions are refused, `UndoManager` refuses undo/redo, `Interface` sets `.editBusy` (CSS in `ViewVideo/style.css` makes video container, edit panel, timelines and layout editor inert; controls, progress bar and timeline zoom stay usable), the freeform editor ignores keys, `HypervideoSettingsDialog.open()` refuses the loaded hypervideo, `Sidebar` shows a fixed notice (`MessageEditBusy`, "Automated editing in progress") and Stop in its collaboration notice. `EditAPI.stop(true)` (Stop, `leaveEditMode()` before its prompt, `editMode` → false) takes the changes back; `stop(false)` in `updateHypervideo()`. The promise rejects with code `stopped`; `tx.signal` is aborted. A new editing surface must respect `.editBusy` (inside the regions above it does automatically).
- **Saving:** `subtitles` and `config` are save categories of `HypervideoModel` (`Sidebar.newUnsavedChange` tolerates categories without a button). Pending subtitle texts (`{ lang: text | null }`) go with `Database.saveHypervideo(cb, id, { subtitles })`: multipart `subtitles[<lang>]` / `SubtitlesToDelete[]` in `hypervideoChange` on the server, `writeText` / `deleteFile` through the adapter elsewhere; kept for the next save when it fails. `Database.subtitles[lang].vtt` holds the loaded text.
- **Permissions** as in the editor: edit mode; hypervideo kinds need admin or creator and no foreign collaboration lock (a write claims the lock); annotations only the user's own. Errors are `FrameTrailEditError` with `code` `invalid` (+ `errors: [{ path, message }]`), `notFound`, `notAllowed`.

## Export and Import

Save As and `instance.export()` (`BundleExport`) write a hypervideo or the project as a page in the **portable HTML format** ([docs/HTML-FORMAT.md](docs/HTML-FORMAT.md)), as a bundle (JSON), or the `_data` folder as a zip. The **Import** button (`ImportDialog`; server, local-folder and project-file mode, edit mode) reads those, earlier HTML/JSON exports, and the server's zip with media.

- **The format:** the bundle is JSON in `<script type="application/ld+json" data-frametrail="hypervideo|project" data-frametrail-format="1">` (every `<` as `\u003c`), attributes `data-frametrail-datapath` (what relative media paths resolve against), `-config`, `-target`; then the library (jsDelivr pinned to a release version, or inline with `</script` → `<\/script`, `<!--` → `<\x21--`) and `FrameTrail.autoInit()`. `FrameTrailHTMLFormat` (pure, dual-wrapped) parses and writes it, registers `html` with the serializer, and reads earlier exports without evaluating them (`parseLegacy`).
- **Playing:** `autoInit()` turns each block (first per target) into `FrameTrail.init({ bundle, … })`; `PlayerLauncher` converts the `bundle` option into `contents` entries with the hypervideos' own `id`s, their annotations and subtitle texts, plus resources, tag definitions, and the internal states `overviewMap` and `customCSS`. `Database.contentsEntry(id)` finds an entry by id; inline subtitle texts are parsed instead of fetched. Download mode, nothing fetched: works from `file://`.
- **Export** builds a folder map (paths → contents) per storage mode — stored files through the adapter, the open hypervideo and the user's own annotations live — and `readBundle(…, 'folder')` makes the bundle. Media are never embedded; the datapath is the instance's `_data/` URL (none from a local folder, a project file's own).
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
