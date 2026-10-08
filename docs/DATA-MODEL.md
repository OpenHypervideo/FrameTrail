# FrameTrail Data Model

FrameTrail keeps everything in JSON files: no database, one `_data/` folder per instance. This document is the contract for those files — what each one holds, how times and boxes are written, and which older shapes readers must still accept. It is written for anyone who reads or writes `_data/` from outside FrameTrail: import and export tools, platforms that provision instances, scripts that generate hypervideos.

The machine-readable half of the contract is the set of JSON Schemas in [`schemas/`](../schemas/). Every property FrameTrail reads is listed there with a description, its type and, where FrameTrail applies one, its default. This document explains how the pieces fit together; the schemas have the details.

## Schemas

The schemas follow JSON Schema draft 2020-12, restricted to a small subset (see [Schema subset](#schema-subset)) so that a validator in any language can check them completely.

| File | Schema |
|------|--------|
| `_data/config.json` | [`config.schema.json`](../schemas/config.schema.json) |
| `_data/tagdefinitions.json` | [`tagdefinitions.schema.json`](../schemas/tagdefinitions.schema.json) |
| `_data/resources/_index.json` | [`resources-index.schema.json`](../schemas/resources-index.schema.json) |
| `_data/hypervideos/_index.json` | [`hypervideos-index.schema.json`](../schemas/hypervideos-index.schema.json) |
| `_data/hypervideos/<id>/hypervideo.json` | [`hypervideo.schema.json`](../schemas/hypervideo.schema.json) |
| one item of `hypervideo.json` → `contents` | [`content-item.schema.json`](../schemas/content-item.schema.json) |
| `_data/hypervideos/<id>/annotations/_index.json` | [`annotations-index.schema.json`](../schemas/annotations-index.schema.json) |
| `_data/hypervideos/<id>/annotations/<userId>.json` | [`annotation-file.schema.json`](../schemas/annotation-file.schema.json) |
| `frametrail:attributes` of an item of type `<type>` | [`attributes/<type>.schema.json`](../schemas/attributes/) |
| a hypervideo with everything it needs, as one document | [`hypervideo-bundle.schema.json`](../schemas/hypervideo-bundle.schema.json) |
| a whole library as one document | [`project-bundle.schema.json`](../schemas/project-bundle.schema.json) |

[`common.schema.json`](../schemas/common.schema.json) holds the definitions the others share: dates, creators, selectors, keyframes, the animation spec.

Each schema's `$id` is `https://frametrail.org/schemas/1/<file>`. The `1` is the version of the data format. Additions that existing data does not need to change for — a new optional property, a new overlay type, a new animation preset — keep the number; a change to the meaning or shape of existing data gets a new one. The `$id`s are identifiers: the files live in this repository, and references between them are relative, so a validator loads the folder and never fetches anything.

Any 2020-12 validator works. With [Ajv](https://ajv.js.org/) in Node:

```javascript
const fs = require('fs'), path = require('path');
const Ajv2020 = require('ajv/dist/2020');

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
(function load(dir) {
    for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (fs.statSync(file).isDirectory()) load(file);
        else if (name.endsWith('.schema.json')) ajv.addSchema(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
})('schemas');

const validate = ajv.getSchema('https://frametrail.org/schemas/1/hypervideo.schema.json');
if (!validate(JSON.parse(fs.readFileSync('_data/hypervideos/1/hypervideo.json', 'utf8')))) {
    console.log(validate.errors);
}
```

FrameTrail has its own validator for exactly this subset, `FrameTrailSchema` ([`src/_shared/frametrail-core/schema/`](../src/_shared/frametrail-core/schema/)). Like the serializer it needs neither the DOM nor a FrameTrail instance, so it works in the browser as a plain script (`window.FrameTrailSchema`) and in Node. It refuses schemas that use anything outside the subset, and reports each error once, as a JSON Pointer into the document and a message, picking the alternative that was meant when a `oneOf` fails:

```javascript
const FrameTrailSchema = require('./src/_shared/frametrail-core/schema/FrameTrailSchema.js');

const schemas = [];   // every file in schemas/, parsed (load them as above)
const validator = FrameTrailSchema.create(schemas);

validator.validate('hypervideo.schema.json', JSON.parse(fs.readFileSync('_data/hypervideos/1/hypervideo.json', 'utf8')));
// [] when valid, otherwise e.g.
// [{ path: '/contents/3/body/frametrail:attributes/shape', message: 'must be one of "circle", "rectangle", …' }]
```

A name is resolved against `https://frametrail.org/schemas/1/`; a fragment selects a definition (`common.schema.json#/$defs/keyframe`). The player carries a copy of the schemas without titles and descriptions (`FrameTrailSchemas.js` in the same folder, written by `node scripts/bundle-schemas.mjs`) and validates what scripts and extensions give it to store. The tests in [`tests/`](../tests/README.md) hold valid and invalid documents, with the errors expected for each, and the exact rules for messages, so that validators in other languages can be checked against the same fixtures.

## File Layout

```
_data/
├── config.json                  # instance settings (public on a public instance)
├── users.json                   # accounts and their API token hashes — not covered here, never exported
├── tagdefinitions.json          # tag labels and descriptions per language
├── custom.css                   # global CSS, including custom themes
├── resources/
│   ├── _index.json              # the resource library
│   └── …                        # uploaded files and their thumbnails
├── hypervideos/
│   ├── _index.json              # the hypervideo library and the overview map
│   └── <id>/
│       ├── hypervideo.json      # metadata, settings, layout, clip, overlays, code snippets, chapters
│       ├── annotations/
│       │   ├── _index.json      # who has an annotation file
│       │   └── <userId>.json    # one user's annotations
│       └── subtitles/
│           └── <lang>.vtt       # WebVTT, one file per language
├── .auth/                       # secrets and external-auth state — never served, never exported
├── .collab/                     # presence and locks — ephemeral, never exported
├── .extensions/<name>/          # server extensions' own state — never served, never exported
└── .htaccess                    # privacy gate of a private instance (Apache), written by FrameTrail
```

Ids are strings in JSON (object keys). Hypervideo and resource ids handed out by FrameTrail are counting numbers (`"1"`, `"2"`, …), tracked by the increments in the two index files. Hypervideos passed to the player inline (init options) are numbered by their position, from `"0"`.

FrameTrail writes the files pretty-printed, indented by four spaces.

## Bundles

A bundle is a hypervideo or a whole library as one JSON document — the unit of export and import, independent of the folder layout. Media files are never embedded: they are referenced by URL or by their path in `_data/resources/`, as in the files themselves.

A **hypervideo bundle** holds one hypervideo and everything it needs:

```jsonc
{
    "bundle": "hypervideo",
    "formatVersion": 1,
    "id": "9",                                        // its id where it came from; importers assign a new one
    "hypervideo": { … },                              // hypervideo.json
    "annotations": {
        "index": { … },                               // annotations/_index.json
        "files": { "1": [ … ] }                       // annotations/1.json, keyed by file id
    },
    "resources": { "51": { … } },                     // the resource entries it uses: its clip, items made from resources
    "subtitles": { "en": "WEBVTT\n\n00:00.000 --> …" } // subtitle files as text, keyed by srclang
}
```

A **project bundle** holds a library:

```jsonc
{
    "bundle": "project",
    "formatVersion": 1,
    "hypervideosIndex": { … },                        // hypervideos/_index.json, with the overview map
    "hypervideos": { "9": { "bundle": "hypervideo", … } },  // keyed as in hypervideosIndex; without "resources"
    "resources": { … },                               // resources/_index.json
    "tagdefinitions": { … },
    "config": { "defaultTheme": "studio", "defaultLanguage": "en" },
    "customCSS": "…"                                  // custom.css
}
```

`config` carries only the settings that decide how the library looks and plays: `defaultTheme`, `defaultLanguage`, `videoFit`, `overviewMode`, `overviewTitle` and `overviewShowSearchBar`. Accounts, authentication, privacy and upload settings belong to an instance and never travel. A project bundle never contains `users.json` or anything from the dot-folders (`.auth/`, `.collab/` and any other).

A hypervideo's `globalEvents`, `customCSS` and code snippets are JavaScript and CSS that run in the viewer's browser. An importer should show them and ask before taking them.

## Reading and Writing in Code

FrameTrail reads and writes these files through one implementation, `FrameTrailSerializer` ([`src/_shared/frametrail-core/serialization/`](../src/_shared/frametrail-core/serialization/)). It touches neither the DOM nor a FrameTrail instance, so it works in the browser — `window.FrameTrailSerializer`, loaded by FrameTrail itself — and in Node:

```javascript
const fs = require('fs');
const Serializer = require('./src/_shared/frametrail-core/serialization/FrameTrailSerializer.js');

const model = Serializer.parseHypervideo(JSON.parse(fs.readFileSync('_data/hypervideos/9/hypervideo.json', 'utf8')));
model.overlays[0].start = 4;                          // the working model: start, end, position, attributes, …
const json = Serializer.serializeHypervideo(model, { now: Date.now() });
```

| Function | Does |
|----------|------|
| `parseHypervideo(json)` → model | `hypervideo.json` → `{ meta, config, layout, clips, overlays, codeSnippets, otherContents, chapters, subtitles, globalEvents, customCSS }` (`layout` is `config.layoutArea`) |
| `serializeHypervideo(model, context)` | model → `hypervideo.json`. `context`: `sourcePath` (the video every item targets; omitted: items keep theirs), `now` (written as `meta.lastchanged`), `purpose` (`'save'` or `'export'`, which turns Transcript views into CustomHTML), `subtitles` (parsed cues for that) |
| `parseAnnotationFile(json, source)`, `serializeAnnotationFile(annotations, context)` | an annotation file ⇄ annotations |
| `parseOverlay`, `serializeOverlay`, `parseCodeSnippet`, `serializeCodeSnippet`, `parseAnnotation`, `serializeAnnotation` | single items |
| `parseAnnotationIndex(json)`, `setAnnotationIndexEntry(json, fileId, fields)` | `annotations/_index.json`, including its legacy shape |
| `readBundle(source, format, options)`, `writeBundle(bundle, format, options)` | bundles in a registered format (`registerBundleFormat`) |

Writing keeps what the model does not cover. Every parsed object remembers what it was read from, and writing merges the model's changes into that: what did not change is written exactly as it was stored, legacy representations included; what changed is written in the current form; properties FrameTrail does not know are kept. Two things are always written in the current form: an item's `@context` and its `created` (ISO 8601 with milliseconds), so older files are upgraded by their next save.

The **folder** format maps a bundle to the `_data` layout: a map of paths relative to `_data/` to contents (parsed JSON for `.json` files, text for `.vtt` and `.css`). A project bundle is the whole tree; a hypervideo bundle is its folder under `hypervideos/` plus a `resources/_index.json` with the resources it carries. Reading takes `{ bundle: 'project' }`, or `{ bundle: 'hypervideo', id }` for one hypervideo.

The **html** format is the [portable HTML format](HTML-FORMAT.md): a page with the bundle in a JSON data block, which plays anywhere and is read back without running it. `FrameTrailHTMLFormat`, next to the serializer and loaded the same way, registers it (`readBundle(html, 'html')`, `writeBundle(bundle, 'html', { datapath, config, library })`) and also reads FrameTrail's HTML exports from before this format (`parseLegacy`). A page can also be a project file, edited in place: `readProject` reads it as the `_data` folder of a project, `writeProject` writes the folder back into its data block (see [Editing a Page in Place](HTML-FORMAT.md#editing-a-page-in-place)).

The box-motion math — normalising, sampling and bounding keyframes, and the ease functions — is in `FrameTrailKeyframes`, next to the serializer and loaded the same way.

Inside the player, scripts and extensions read and change the open hypervideo in this format through `instance.edit`, which validates against the schemas and keeps what it does not know ([EXTENDING.md](EXTENDING.md#editing-the-hypervideo)).

## The Files

### `config.json`

Instance settings. Missing keys mean the defaults in the schema. On a public instance anyone can read this file, so it must never hold a secret: the secret half of external authentication lives in `_data/.auth/config.php`, and an extension's secrets in `_data/.auth/<name>.php`.

Booleans are strict. The server refuses uploads only when `allowUploads` is `false` and treats an instance as private only when `alwaysForceLogin` is `true`; the strings `"false"` and `"true"` do neither. [docs/INTEGRATION.md](INTEGRATION.md#writing-the-settings) lists the settings with what a missing key means and when a change takes effect; [docs/DEPLOYMENT.md](DEPLOYMENT.md#configuration) covers `externalAuth`, `externalSettings`, `userAvatars` and `apiTokens`.

`extensions` lists extensions the instance loads, each `{ name, script, style, settings }` ([docs/EXTENDING.md](EXTENDING.md#writing-an-extension)). `script` and `style` are paths relative to the page, so on its origin; the player refuses anything else. `settings` is handed to the extension's `init()` untouched; FrameTrail neither reads nor validates it, so the schema leaves it open. An extension that cannot be loaded is skipped, so a `_data` directory naming one works on an installation that does not have it. An entry also switches on the extension's server part, if the installation has one in `_server/extensions/<name>/`.

### `tagdefinitions.json`

```json
{ "lecture": { "en": { "label": "Lecture", "description": "…" }, "de": { "label": "Vorlesung", "description": "…" } } }
```

Tag names are the keys. Items refer to tags by name in `frametrail:tags`.

### `resources/_index.json`

The resource library: uploaded files and external links that overlays and annotations can be made from. An entry has a `type`, a `name`, a `src` (a file name in `_data/resources/`, or a URL — for embeds the embed URL), an optional `thumb`, licence fields and type-specific `attributes`.

An item made from a resource keeps its **own copy** of the resource's data (`src`, `thumb`, licence, attributes) and refers back with `frametrail:resourceId`. Changing or deleting the resource does not change the item. `created` here is in seconds, unlike almost everywhere else.

### `hypervideos/_index.json` and the overview map

```jsonc
{
    "hypervideo-increment": 10,
    "hypervideos": { "1": "./1", "9": "./9" },        // id → folder, relative to _data/hypervideos/
    "overviewMap": {
        "background": "1_1788531102_overview.svg",     // the src of an image resource
        "backgroundColor": "#2f3139",
        "fit": "contain",                              // or "cover"
        "lastchanged": 1788942480663,                  // compare-and-swap token, milliseconds
        "markers": { "9": { "x": 0.371, "y": 0.182, "size": 6.08 } }
    }
}
```

The overview shows the hypervideos as a grid or, when `config.json` has `overviewMode: "map"`, as pins on the map's background. Marker `x`/`y` are the pin's centre in 0–1 of the background image, `size` its diameter in percent of the stage width; a hypervideo without a marker is not on the map. The map is content, so it lives here rather than in the settings.

### `hypervideos/<id>/hypervideo.json`

```jsonc
{
    "meta": { "name": "…", "description": "…", "thumb": "…", "creator": "demo", "creatorId": "1",
              "created": 1783322367127, "lastchanged": 1791235975527 },
    "config": { "slidingMode": "adjust", "theme": "", "autohideControls": false, "captionsVisible": false,
                "clipTimeVisible": false, "slidingTrigger": "key",
                "layoutArea": { "areaTop": [], "areaBottom": [], "areaLeft": [], "areaRight": [ { "type": "Transcript", … } ] } },
    "clips": [ { "resourceId": "51", "src": "1_1783322343_lecture.mp4", "duration": 0, "in": 0, "out": 0 } ],
    "contents": [ … ],                                // overlays and code snippets
    "chapters": [ { "start": 8, "title": "Chapter 3" } ],
    "subtitles": [ { "src": "en.vtt", "srclang": "en" } ],
    "globalEvents": { "onReady": "", "onPlay": "", "onPause": "", "onEnded": "" },
    "customCSS": ""
}
```

- **`meta.lastchanged`** is the compare-and-swap token of server-mode saves: a save carries the value it loaded, and the server refuses it when the file has changed since. A tool that writes this file must change it, or an editor that has the hypervideo open overwrites the tool's change with its next save. In local-folder mode the token is the file's modification time instead, so there any write is noticed (the editor shows that the hypervideo changed and refuses to save over it); a tool should still change `lastchanged`, for the same folder served by PHP.
- **`clips`** — only the first clip is played. `src` is a file name in `_data/resources/` or a URL (MP4, WebM, HLS, YouTube, Vimeo). Without `src` and `resourceId` the hypervideo has no video, just a timeline of `duration` seconds. `in` and `out` clip the media: the hypervideo shows the media from `in` to `out` (`0` or missing: its end).
- **`config.layoutArea`** — the content views around the video, in four areas. A content view is told apart by `type`: `TimedContent` (a collection of annotations, filtered by `collectionFilter`), `CustomHTML`, `Transcript` (built from the subtitles of `transcriptSource`), `Timelines` and `Chapters`. A transcript view is stored as a transcript; only an export that has to stand alone may turn it into `CustomHTML`.
- **`chapters`** — `{ start, title }`, ordered by `start`. A chapter has no other identity than its `start`, which is unique within the hypervideo.
- **`subtitles`** — one WebVTT file per language in the `subtitles/` folder next to the file, named `<srclang>.vtt`.
- **`globalEvents`** and **`customCSS`** — JavaScript run on player events and CSS for this hypervideo. Event code is the body of a function called with `FrameTrail` (the instance) and `hypervideo` (its HypervideoController).

### `annotations/_index.json` and `annotations/<userId>.json`

Each user's annotations of a hypervideo are in their own file, named by user id, and only that user (or an administrator through the server) writes it. The index lists the files:

```json
{
    "mainAnnotation": "1",
    "annotationfiles": {
        "1": { "name": "demo", "description": "demo's annotations", "created": 1773150038,
               "lastchanged": 1791417588906, "hidden": false, "owner": "demo", "ownerId": 1 }
    }
}
```

`created` is in seconds, `lastchanged` in milliseconds (seconds in older files). `lastchanged` is the compare-and-swap token of the user's file: the editor's save carries the value it loaded (`annotationfileSave` → `baseVersion`; `0` for a user who had no file), and the server refuses it with code 7 when the file has been saved since — from another tab, or by a script with the user's API token — so the editor shows that the annotations changed instead of overwriting them. A tool that writes an annotation file must therefore change its entry's `lastchanged` (`annotationfileSave` does; it may also send `baseVersion` itself). In a local folder or project file the token is the file's version (modification time and size), so there any write is noticed. User ids are strings, except `ownerId`, which the server writes as a number. In local-folder mode there are no accounts: a user id is derived from the name the user enters, as `guest_<name>-<hash>` (e.g. `guest_anna-b-919e0619`), so the same name finds its annotation file again. An annotation file is a JSON array of annotations (below).

## Items: Overlays, Code Snippets and Annotations

Overlays and code snippets (in `hypervideo.json` → `contents`) and annotations (in the annotation files) are [W3C Web Annotations](https://www.w3.org/TR/annotation-model/) with FrameTrail's extension terms:

```jsonc
{
    "@context": ["http://www.w3.org/ns/anno.jsonld", "https://frametrail.org/ns/context.jsonld"],
    "type": "Annotation",
    "frametrail:type": "Overlay",                      // Overlay | CodeSnippet | Annotation
    "creator": { "nickname": "demo", "type": "Person", "id": "1" },
    "created": "2026-10-06T09:36:45.127Z",
    "frametrail:tags": ["intro"],
    "target": {
        "type": "Video",
        "source": "1_1783322343_lecture.mp4",          // the hypervideo's video
        "selector": {
            "type": "FragmentSelector",
            "conformsTo": "http://www.w3.org/TR/media-frags/",
            "value": "t=12.5,20&xywh=percent:18,22,47,40"
        }
    },
    "body": {
        "type": "TextualBody",
        "frametrail:type": "text",                     // the resource type
        "format": "text/html",
        "value": "",
        "frametrail:name": "Welcome",
        "frametrail:thumb": null,
        "frametrail:resourceId": null,
        "frametrail:attributes": { "text": "&lt;p&gt;Hello&lt;/p&gt;", "animation": { "in": { "preset": "fadeIn" } } }
    },
    "frametrail:events": { "onStart": "FrameTrail.module('HypervideoController').pause();" }
}
```

| `frametrail:type` | Lives in | Target selector | Notes |
|-------------------|----------|-----------------|-------|
| `Overlay` | `hypervideo.json` → `contents` | time span and box | shown over the video; may move (keyframes) and rotate; `frametrail:events` |
| `CodeSnippet` | `hypervideo.json` → `contents` | a point in time `t=<start>` | body is `TextualBody`, `frametrail:type` `codesnippet`, `format` `text/javascript`, the code in `value` |
| `Annotation` | `annotations/<userId>.json` | time span | shown in timelines and content views; `frametrail:uri`, `frametrail:graphdata` |

### Resource types

The body's `frametrail:type` is the resource type. It decides how the item is rendered and which schema in `schemas/attributes/` describes its `frametrail:attributes`.

| `frametrail:type` | Overlay | Annotation | Resource | `body.type` | `body.format` | `src` in |
|-------------------|:-------:|:----------:|:--------:|-------------|---------------|----------|
| `text` | ✓ | ✓ | | TextualBody | text/html | `value` |
| `html` | ✓ | ✓ | | | | `source` |
| `quiz` | ✓ | ✓ | | TextualBody | text/html | `value` |
| `hotspot` | ✓ | | | TextualBody | text/html | — |
| `cursor` | ✓ | | | Dataset | application/x-frametrail-cursor | — |
| `counter` | ✓ | | | Dataset | application/x-frametrail-counter | — |
| `chart` | ✓ | | | Dataset | application/x-frametrail-chart | — |
| `image` | ✓ | ✓ | ✓ | Image | image/`<extension>` | `source` |
| `video` | ✓ | ✓ | ✓ | Video | video/mp4 | `source` |
| `audio`, `pdf` | ✓ | ✓ | ✓ | | | `source` |
| `youtube`, `vimeo`, `wistia`, `loom`, `twitch` | ✓ | ✓ | ✓ | Video | text/html | `source` |
| `soundcloud`, `spotify` | ✓ | ✓ | ✓ | Sound | text/html | `source` |
| `webpage`, `wikipedia`, `entity` | ✓ | ✓ | ✓ | Text | text/html | `value` |
| `location` | ✓ | ✓ | ✓ | Dataset | application/x-frametrail-location | — |
| `mastodon`, `codepen`, `urlpreview` | ✓ | ✓ | ✓ | Text | text/html | `source` |
| `figma` | ✓ | ✓ | ✓ | Image | text/html | `source` |

`body.type` and `body.format` are derived from `frametrail:type` for other W3C consumers; FrameTrail never reads them, and older files omit them for some types. The resource's `src` goes into `body.source` or `body.value` as the last column says; overlays read whichever is present. Items made from a resource repeat its name, thumbnail, licence and attributes in `frametrail:name`, `frametrail:thumb`, `frametrail:licenseType`, `frametrail:licenseAttribution` and `frametrail:attributes`.

The text of `text` and `html` items (`attributes.text`) is stored HTML-escaped (`&lt;p&gt;…`) and unescaped before rendering.

Every overlay type also takes `opacity`, `hoverStyle`, `zIndex` and `animation` in its attributes; hotspots take an action (`action`, `actionTarget`, `actionTargetTime`). They are listed in each attribute schema.

## Time and Space

### Time

Times are seconds, as decimal numbers, on the timeline of the **media**: they include the clip's `in` point. On a clip with `in: 30`, an overlay that appears 5 seconds into the hypervideo starts at `35`. This holds for items, chapters, keyframes and code snippets alike.

Items carry their time in the target selector's `value`, in [Media Fragments](https://www.w3.org/TR/media-frags/) syntax:

- `t=<start>,<end>` — a time span: overlays, annotations;
- `t=<start>` — a point in time: code snippets.

FrameTrail writes plain decimal numbers (`t=12.5,20`). Nothing else from the Media Fragments time syntax (`npt:`, clock times, open ranges) is read.

Video, YouTube and Vimeo items may also carry a selector on the **body**, `t=<startOffset>,<endOffset>`: the part of the embedded media to play, in seconds of that media.

### Space

An overlay's box follows the time span in the same `value`, joined by `&`:

```
t=12.5,20&xywh=percent:18,22,47,40
```

`xywh=percent:<left>,<top>,<width>,<height>`, in percent of the video frame. FrameTrail only writes and reads the `percent:` form. Values may be fractional.

### Box motion (keyframes) and rotation

An overlay's box can move, resize and rotate over its time span. Media Fragments can express one static rectangle per time range and no W3C or IIIF selector describes a moving region, so the motion is a FrameTrail extension on the overlay's selector:

```jsonc
"selector": {
    "type": "FragmentSelector",
    "conformsTo": "http://www.w3.org/TR/media-frags/",
    "value": "t=12.5,20&xywh=percent:18.2,22.4,46.8,19.7",  // union box of the motion within the span
    "frametrail:keyframes": [
        { "t": 12.5, "xywh": [18.2, 30.1, 15, 12] },
        { "t": 15.0, "xywh": [40.6, 24.0, 16, 13], "r": 30, "ease": "easeInOut" },
        { "t": 18.0, "xywh": [50.0, 22.4, 15, 12], "ease": "hold" }
    ]
}
```

- `t` is a time in seconds as above; keyframes are sorted by `t`. `xywh` is the box in percent of the video frame and may lie partly or wholly outside 0–100. `r` is the rotation in degrees, clockwise around the box centre (missing: 0). `ease` is the easing of the segment to the next keyframe (missing: linear; `hold` keeps the box until the next keyframe).
- The box between keyframes is interpolated; before the first and after the last keyframe it holds.
- The plain `xywh` in `value` is the union of the moving box within `[start, end]`, clamped to 0–100: what a consumer that does not know the extension shows. It is always the unrotated box.
- Keyframes may lie outside the time span; they still shape the motion at its edges.
- A box that does not move but is rotated has `frametrail:rotation` (degrees) on the selector instead. It is omitted when 0 and whenever there are keyframes, which carry the rotation themselves.

### Animation

Overlays can animate in, loop and animate out (`attributes.animation`, see [`common.schema.json`](../schemas/common.schema.json) → `animation`). The entrance plays before `start` and the exit after `end`, so the overlay is fully present for exactly `[start, end]`. Older overlays carry `animationIn`, `animationOut` and `animationDuration` instead; they are read and mapped to `animation`, which replaces them on the next edit.

## Identity and Timestamps

Items have no id property. Within its collection (a hypervideo's overlays, its code snippets, one user's annotations) an item is identified by its **`created`** timestamp; an annotation across files by its creator's id and `created`. A chapter is identified by its `start`. A tool that adds items must therefore keep `created` unique within the collection, and chapter starts unique within the hypervideo.

Write `created` as an ISO 8601 date-time in UTC with milliseconds — `"2026-10-06T09:36:45.127Z"` — which is the `xsd:dateTime` the W3C model requires. Older files carry the output of JavaScript's `Date.prototype.toString()` (`"Mon Jul 06 2026 09:36:45 GMT+0200 (Central European Summer Time)"`), which has no milliseconds: two items created within the same second share a value. Readers must accept both forms and keep such items apart. FrameTrail does so as it reads a file: of two items in a collection with the same `created` (or none), the later one in the array moves on by 1 ms, which its next save writes.

Timestamps are not all in the same unit:

| Where | Unit |
|-------|------|
| items' `created` | ISO 8601 (older: `toString()` text) |
| `hypervideo.json` → `meta.created`, `meta.lastchanged` | milliseconds since 1970 |
| `config.json` → `lastchanged`, `overviewMap.lastchanged` | milliseconds since 1970 |
| `resources/_index.json` → `created` | seconds since 1970 |
| `annotations/_index.json` → `created` | seconds since 1970 |
| `annotations/_index.json` → `lastchanged` | milliseconds since 1970 (seconds in older files) |

## Unknown Properties

The schemas allow unknown properties almost everywhere, and **a writer must keep what it does not know**: read the object, change what you own, write it back with everything else in place. That is what lets another tool's data survive a save, and an older reader survive newer data.

FrameTrail's own writer does this for every item, for `meta` and `config` of a hypervideo, and for content items of a kind it does not know, which it keeps untouched (see [Reading and writing in code](#reading-and-writing-in-code)).

The W3C `generator` property — the software that created or last changed an item, as an IRI or an object such as `{ "type": "Software", "name": "…" }` — is explicitly allowed on items. FrameTrail does not write it, and keeps it.

## Namespace and JSON-LD Context

FrameTrail's extension terms are in the namespace `http://frametrail.org/ns/`, documented at [frametrail.org/ns](https://frametrail.org/ns/). The namespace stays `http://`: it is an identifier, not a link, and every term's IRI is built from it, so switching to `https://` would rename every term. The documentation page itself is served over HTTPS.

The `@context` of an item is

```json
["http://www.w3.org/ns/anno.jsonld", "https://frametrail.org/ns/context.jsonld"]
```

The first entry is required by the W3C model. The second is FrameTrail's context document: it declares the `frametrail:` prefix, types the terms that hold JSON (`frametrail:attributes`, `frametrail:events`, `frametrail:keyframes`) as `@json` so that a JSON-LD processor keeps their contents, types `frametrail:uri` as an IRI and `frametrail:tags` as a set. `@json` needs a JSON-LD 1.1 processor.

Older files declare only the prefix inline, `["http://www.w3.org/ns/anno.jsonld", { "frametrail": "http://frametrail.org/ns/" }]`. That is enough for FrameTrail, which never reads `@context`, but a JSON-LD processor drops the contents of attributes, events and keyframes. To process such a file as JSON-LD, replace its `@context` with the one above.

## Legacy Shapes

Readers must accept these shapes. Each is in the schemas as a separate alternative or marked "Legacy" in its description.

| Shape | Where | Read as |
|-------|-------|---------|
| `created` as `Date.prototype.toString()` text | items | the same instant, without milliseconds |
| `[]` instead of `{}` | `frametrail:attributes`, `frametrail:events`, `globalEvents`, animation `params`, an extension's `settings` in `config.json`, and the maps in the index files and `tagdefinitions.json` | an empty object — PHP cannot tell the two apart when it re-encodes a file |
| body `frametrail:type` `"button"` | overlays | no Resource type exists; FrameTrail does not render the item and keeps it |
| user entries at the top level of `annotations/_index.json` (`{ name, description, hidden, src }`), next to or instead of `annotationfiles` | local-folder mode | an annotation file of that user; moved under `annotationfiles` when that user next saves |
| `annotation-increment` | `hypervideo.json`, `annotations/_index.json` | not used |
| `frametrail:attributes` at the item level instead of the body | very old overlays | the body's attributes, when the body has none |
| `frametrail:lat`, `frametrail:long`, `frametrail:boundingBox` on the body | location annotations | `attributes.lat`, `.lon`, `.boundingBox` |
| `animationIn`, `animationOut`, `animationDuration` | overlay attributes | `attributes.animation` |
| `linkUrl` | hotspot attributes | `action: "openUrl"` with that target, when `action` is empty |
| `overviewMap` (markers as a list of `{ hypervideoID, x, y, size }`) | `config.json` | the overview map, when `hypervideos/_index.json` has none; moved there by the first map save |
| `theme` | `config.json` | `defaultTheme` |
| `allowCollaboration`, `defaultUserRole`, `updateServiceURL`, `autoUpdate` | `config.json` | not used |
| `hidden` | `hypervideo.json` → `config` | not used |
| `start`, `end` | clips | not used |
| `embed` | `urlpreview` attributes | not used |
| `alternateVideoFile` | `video` attributes | not used |

## Schema Subset

The schemas use these keywords and nothing else:

| Keyword | Meaning |
|---------|---------|
| `$schema`, `$id`, `title`, `description` | Annotations; no effect on validation. |
| `default` | The value FrameTrail uses when the key is missing. No effect on validation. |
| `$defs` | Holds definitions for `$ref`. |
| `$ref` | A reference, resolved against the `$id` of the schema it is in: `#/$defs/x` in the same file, `common.schema.json#/$defs/x` or `attributes/text.schema.json` in the same folder. All targets are in `schemas/`; nothing is fetched. A `$ref` has no sibling keywords other than `description`. |
| `type` | A type name or a list of them: `object`, `array`, `string`, `number`, `integer` (a number without a fractional part), `boolean`, `null`. |
| `properties`, `required` | Properties of an object, and the ones that must be present. |
| `additionalProperties` | A schema for the properties not in `properties` (used for maps such as `resources`), or `false`. Without it, other properties are allowed. |
| `items`, `minItems`, `maxItems` | One schema for every item of an array; bounds on its length. |
| `enum`, `const` | Allowed values, compared as JSON (`const: []` matches only an empty array). |
| `minimum`, `maximum` | Inclusive bounds. |
| `pattern` | A regular expression the string must contain a match for; the schemas anchor theirs with `^…$`. Only syntax that ECMA-262 and PCRE read alike: literals, `\.`, character classes, groups, alternation, `?`, `*`, `+`, `{n,m}`. |
| `oneOf` | Exactly one alternative matches. Where every alternative is an object that fixes the same property with `const` — `frametrail:type`, a content view's `type`, a bundle's `bundle` — a validator can pick the alternative by that property and report only its errors. The other `oneOf`s set an object against PHP's empty array, or tell legacy forms apart by type or pattern. |

A validator that implements these keywords checks the schemas completely; a full JSON Schema 2020-12 validator gives the same results. `FrameTrailSchema` implements exactly these and refuses any other keyword, so a schema that needs more fails the tests. Decode JSON so that `{}` and `[]` stay different (in PHP: `json_decode($json)` without `true`, or an equivalent); otherwise an empty object cannot be told from an empty array.
