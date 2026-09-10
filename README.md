# FrameTrail 

[![Build](https://github.com/OpenHypervideo/FrameTrail/actions/workflows/build.yml/badge.svg)](https://github.com/OpenHypervideo/FrameTrail/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/OpenHypervideo/FrameTrail)](https://github.com/OpenHypervideo/FrameTrail/releases)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20GPL%20v3-blue)](LICENSE.md)

## Create, Annotate & Remix Interactive Videos

FrameTrail is an open source software that lets you experience, manage and edit interactive video directly in your web browser. Add multimedia overlays, annotations or clickable links to any video — or create time-based presentations without video at all. All data is stored as portable JSON files.

---

## Principles

> Film shall be programmed with Open Web Technologies.

**Open Source Film** — By "rendering" a film, we permanently seal it and "burn" all its fragments (media assets, cuts, text overlays, effects, animations) irreversibly into one flat video file. We will never render or export hypervideos to flat video files. 

**Player and Editor are one** — No separation of editor and viewer / player. Yes, that means anyone can edit any FrameTrail hypervideo anywhere (and then download or save the changes to their own FrameTrail installation). 

---

## Features

### Editing

- **Timebased Documents** — Use any video or even an empty canvas with just a duration as a basis for synchronizing contents (like interactive transcripts, overlays or annotation timelines). 

- **Hyperlinked Videos** — Create non-linear networks of videos which are connected via clickable hotspots and can be freely navigated by the user (like branching narratives or interactive explainer videos). 

- **Interactive Overlays** — Place documents on top of the video (e.g. text, images, web pages, interactive maps or custom text/html) and decide how and when they should be displayed.

- **Multimedia Annotations** — Add supplementing materials at certain points of time and decide how they should be displayed in the player using the interactive layout editor. 

### Data & Portability

- All data stored as **JSON files** in a `_data` directory — no database
- Copy the entire `_data` folder to move your instance between servers
- Export/download data with the built-in **Save As** feature (anyone can download hypervideos and then continue editing in their own FrameTrail installation or locally)
- Annotations follow the **W3C Web Annotation** data model

### 3 Ways to Run

FrameTrail works in three modes with different capabilities.

| | Server mode | Local folder mode | In-memory mode |
|---|---|---|---|
| **Requirements** | PHP 7.4+ | Chrome or Edge | Any modern browser |
| **Edit hypervideos** (overlays, annotations, code snippets, layout, theme) | ✓ | ✓ | ✓ |
| **Persistent saves** | ✓ | ✓ | — (export via Save As) |
| **Manage hypervideos** (add / delete) | ✓ | ✓ | — |
| **Manage resources** (add / delete) | ✓ | ✓ | — |
| **Thumbnail generation** | ✓ (server-side)| ✓ (client-side)| — |
| **Authentication & multi-user accounts** | ✓ | — | — |
| **Media transcoding** | ✓ | — | — |

---

## Installation

### Option 1: Server Deployment 

1. Download the [latest release](https://github.com/OpenHypervideo/FrameTrail/releases) or build from source
2. Extract to any directory
3. In that directory, run: `php -S localhost:8080`
4. Open `http://localhost:8080` and follow the setup wizard

**Requirements:** PHP 7.4+. The directory needs write permissions so FrameTrail can create `_data/`.

For public deployments, use Apache (`.htaccess` included) or nginx with PHP-FPM. No PHP installed? Use [XAMPP](https://www.apachefriends.org/) (Windows) or [MAMP](https://www.mamp.info/) (Mac/Windows).

**Or use Docker** — no PHP install needed:

```bash
docker compose up -d
```

Open `http://localhost:8080` and follow the setup wizard. The image builds the minified bundle from source in a throwaway Node stage and serves it via PHP + Apache, so no build tooling ends up in the final image; `_data/` persists in a named volume across restarts. Pass `--build-arg WITH_FFMPEG=true` (or uncomment the `args:` in `compose.yaml`) to include FFmpeg for server-side video transcoding and thumbnail generation — it's off by default to keep the image lean (~500MB smaller).

### Option 2: Local Folder Mode 

1. Download and extract FrameTrail
2. Open `index.html` in Chrome or Edge
3. When prompted, select or create a `_data` folder on your computer
4. Full editing — all changes saved directly to your local files

---

## Getting Started

1. **Enter edit mode** — Click the Edit button (top right). In server mode, log in with your account or continue as a guest (name only). In local folder and in-memory modes, only the guest option is shown.
2. **Create a hypervideo** — In the sidebar, click "New Hypervideo" and choose a video source
3. **Add resources** — Click "Manage Resources" to upload or link media
4. **Edit** — Drag resources onto the video timeline as overlays or annotations
5. **Save** — In server/local mode, Ctrl+S saves directly. As a guest, use Save As to export your changes as JSON.
6. **Share** — Copy the URL or export and share your hypervideo

---

## Development

### Quick Start

```bash
git clone https://github.com/OpenHypervideo/FrameTrail.git
cd FrameTrail/src
php -S localhost:8080
```

Open `http://localhost:8080` in your browser and complete the setup wizard. 

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

### Building for Production

```bash
# Install build tools (one-time)
npm install -g terser csso-cli

# Build
bash scripts/build.sh
```

This creates a `build/` directory with concatenated and minified JS/CSS bundles. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for details.

### Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — Development setup, code style, branching, CI/CD
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Module system, state management, storage modes, data model
- [docs/EXTENDING.md](docs/EXTENDING.md) — Adding resource types, modules, localization
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Server deployment, local usage, building, releasing

---

## Contributors

Joscha Jäger, Michael J. Zeder, Michael Morgenstern, Olivier Aubert, Philo van Kemenade

---

## License

FrameTrail is dual licensed under [MIT](http://www.opensource.org/licenses/mit-license.php) and [GPL v3](http://www.gnu.org/licenses/gpl-3.0.html).

See [LICENSE.md](LICENSE.md) for details.
