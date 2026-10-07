# FrameTrail 

[![Build](https://github.com/OpenHypervideo/FrameTrail/actions/workflows/build.yml/badge.svg)](https://github.com/OpenHypervideo/FrameTrail/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/OpenHypervideo/FrameTrail)](https://github.com/OpenHypervideo/FrameTrail/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)

## Create, Annotate & Remix Interactive Videos

FrameTrail is an open source software that lets you experience, manage and edit interactive video directly in your web browser. Add multimedia overlays, annotations or clickable links to any video — or create time-based presentations without video at all. All data is stored as portable JSON files.

---

## Principles

> Film shall be programmed with Open Web Technologies.

**Open Source Film** — By "rendering" a film, we permanently seal it and "burn" all its fragments (media assets, cuts, text overlays, effects, animations) irreversibly into one flat video file. With FrameTrail, we do the opposite: we create a permanently open format, which can be viewed, remixed and edited forever in any web browser. 

**Player and Editor are one** — No separation of editor and viewer / player. Yes, that means anyone can edit any FrameTrail hypervideo anywhere. Changes can be saved directly (if you have the editing rights), downloaded or exported to another FrameTrail installation. Every hypervideo comes bundled with FrameTrail itself. If you can view it, you can edit it. 

---

## Features

### Editing

- **Timebased Documents** — Use any video or even an empty canvas with just a duration as a basis for synchronizing contents (like interactive transcripts, overlays or annotation timelines). 

- **Hyperlinked Videos** — Create non-linear networks of videos which are connected via clickable hotspots and can be freely navigated by the user (like branching narratives or interactive explainer videos). 

- **Interactive Overlays** — Place documents on top of the video (e.g. text, images, web pages, interactive maps or custom text/html) and decide how and when they should be displayed.

- **Multimedia Annotations** — Add supplementing materials at certain points of time and decide how they should be displayed in the player using the interactive layout editor. 

### Dynamic Design

- The way you use, arrange and display the different components of FrameTrail is up to you and the affordances of your project. From just using FrameTrail as a full-site video player up to using it as a highly interactive hypervideo solution, the **player layout is dynamically configurable**. 
- Multiple hypervideos can be connected via a **customizable overview map** or **grid view**, which serves as an entry point to a project and allows easy navigation. 

### Data & Portability

- All data stored as **JSON files** in a `_data` directory — no database
- Copy the entire `_data` folder to move your instance between servers
- Export a hypervideo or a whole project with the built-in **Save As** feature as one HTML file that plays anywhere, also offline and from the disk, and **import** it into any FrameTrail installation to continue editing
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
| **Collaborative editing** (see who else is editing, synchronise edits, block other users while someone is editing) | ✓ | — | — |

---

## Installation

### Option 1: Server Deployment 

1. Download the [latest release](https://github.com/OpenHypervideo/FrameTrail/releases) or build from source
2. Extract to any directory
3. In that directory, run: `php -S localhost:8080`
4. Open `http://localhost:8080` and follow the setup wizard

**Requirements:** PHP 7.4+. The directory needs write permissions so FrameTrail can create `_data/`.

For public deployments, use Apache (`.htaccess` included) or nginx with PHP-FPM. No PHP installed? Use [XAMPP](https://www.apachefriends.org/) (Windows) or [MAMP](https://www.mamp.info/) (Mac/Windows).

**Or use Docker** — no PHP install needed. This builds from source, so clone the repository rather than using the release zip:

```bash
git clone https://github.com/OpenHypervideo/FrameTrail.git
cd FrameTrail
docker compose up -d
```

Open `http://localhost:8080` and follow the setup wizard. The image builds the minified bundle from source in a throwaway Node stage and serves it via PHP + Apache, so no build tooling ends up in the final image; `_data/` persists in a named volume across restarts. Pass `--build-arg WITH_FFMPEG=true` (or uncomment the `args:` in `compose.yaml`) to include FFmpeg for server-side video transcoding and thumbnail generation — it's off by default to keep the image lean (~400MB smaller).

### Option 2: Local Folder Mode 

1. Download and extract FrameTrail
2. Open `index.html` in Chrome or Edge
3. When prompted, select or create a `_data` folder on your computer
4. Full editing — all changes saved directly to your local files

### Option 3: Project File

1. Open `index.html` in Chrome or Edge, as above
2. When prompted, choose **New Project File** or **Open Project File**
3. The whole project is one HTML file: every save writes it, and the file plays wherever it is opened (media by URL, or in a `resources` folder next to it)

A project page opened from the disk can also be saved into itself (**Save to this file**). See [Deployment](docs/DEPLOYMENT.md#option-3-project-file-one-html-file).

---

## Getting Started

1. **Enter edit mode** — Click the Edit button (top right). In server mode, log in with your account or continue as a guest (name only). In local folder, project file and in-memory modes, only the guest option is shown.
2. **Create a hypervideo** — In the sidebar, click "New Hypervideo" and choose a video source
3. **Add resources** — Click "Manage Resources" to upload or link media
4. **Edit** — Drag resources onto the video timeline as overlays or annotations
5. **Save** — In server, local folder and project file mode, Ctrl+S saves directly. As a guest, use Save As to download your work as an HTML file (or as JSON), which any FrameTrail installation can import.
6. **Share** — Copy the URL or export and share your hypervideo

(see also the [FrameTrail-Examples](https://github.com/OpenHypervideo/FrameTrail-Examples) repository) 

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

### Tests

```bash
node tests/run-js.mjs
```

Checks the JSON Schemas, the data fixtures and the serializer; Node 20 or later, nothing to install. See [tests/README.md](tests/README.md).

### Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — Development setup, code style, branching, CI/CD
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Module system, state management, storage modes
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — The files in `_data/`, with JSON Schemas in [`schemas/`](schemas/) for tools that read or write them
- [docs/HTML-FORMAT.md](docs/HTML-FORMAT.md) — The portable HTML format: a hypervideo or a whole project as one file that plays anywhere and can be imported again
- [docs/EXTENDING.md](docs/EXTENDING.md) — Extensions that plug in without changing FrameTrail, in the browser and on the server; editing hypervideos from scripts (`instance.edit`); adding resource types, modules, localization
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Server deployment, local usage, building, releasing
- [docs/INTEGRATION.md](docs/INTEGRATION.md) — Running FrameTrail inside an LMS or platform: external authentication (OIDC, signed tokens), external settings, personal API tokens
- [docs/EVENTS.md](docs/EVENTS.md) — The player event API for host pages and analytics

---

## Contributors

Joscha Jäger, Michael J. Zeder, Michael Morgenstern, Olivier Aubert, Philo van Kemenade

---

## License

FrameTrail is licensed under [MIT](http://www.opensource.org/licenses/mit-license.php).

See [LICENSE.md](LICENSE.md) for details, and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the third-party libraries, fonts and ported code FrameTrail includes.
