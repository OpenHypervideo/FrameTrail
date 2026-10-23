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

Each schema's `$id` is `https://frametrail.org/schemas/1/<file>`. The `1` is the version of the data format. Additions that existing data does not need to change for — a new optional property, a new overlay type, a new animation preset — keep the number; a change to the meaning or shape of existing data gets a new one. The `$id`s are identifiers: the files live in this repository, and references between them are relative, so a validator loads the folder and never fetches anything. The schemas of the latest release are also published at those URLs, listed at [frametrail.org/schemas/1](https://frametrail.org/schemas/1/), for tools that load schemas by URL.

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

A name is resolved against `https://frametrail.org/schemas/1/`; a fragment selects a definition (`common.schema.json#/$defs/keyframe`). The player carries a copy of the schemas without titles and descriptions (`FrameTrailSchemas.js` in the same folder, written by `node scripts/bundle-schemas.mjs`) and validates what scripts and extensions give it to store. The same script writes [TYPES.md](TYPES.md), the reference of the item types: what each is for and the attributes it takes, from the descriptions in `schemas/attributes/`. The tests in [`tests/`](../tests/README.md) hold valid and invalid documents, with the errors expected for each, and the exact rules for messages, so that validators in other languages can be checked against the same fixtures.

### Checking files in an editor

FrameTrail does not write `$schema` into the files it stores. To have an editor check the files of a data folder and show the schemas' descriptions while you edit them, map the files to the published schemas. In VS Code, in `settings.json`:

```json
"json.schemas": [
    { "fileMatch": ["**/_data/config.json"],                           "url": "https://frametrail.org/schemas/1/config.schema.json" },
    { "fileMatch": ["**/_data/tagdefinitions.json"],                   "url": "https://frametrail.org/schemas/1/tagdefinitions.schema.json" },
    { "fileMatch": ["**/_data/resources/_index.json"],                 "url": "https://frametrail.org/schemas/1/resources-index.schema.json" },
    { "fileMatch": ["**/_data/hypervideos/_index.json"],               "url": "https://frametrail.org/schemas/1/hypervideos-index.schema.json" },
    { "fileMatch": ["**/_data/hypervideos/*/hypervideo.json"],         "url": "https://frametrail.org/schemas/1/hypervideo.schema.json" },
    { "fileMatch": ["**/_data/hypervideos/*/annotations/_index.json"], "url": "https://frametrail.org/schemas/1/annotations-index.schema.json" },
    { "fileMatch": ["**/_data/hypervideos/*/annotations/*.json", "!**/annotations/_index.json"],
      "url": "https://frametrail.org/schemas/1/annotation-file.schema.json" }
]
```

Where a data folder has another name, put it in place of `_data`. JetBrains IDEs take the same mappings in Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings.

## File Layout

```
_data/
├── config.json                  # instance settings (public on a public instance)
├── users.json                   # accounts and their API token hashes — not covered here, never exported
├── tagdefinitions.json          # tags: label and description per tag id
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
├── .auth/                       # secrets and external-auth state (also the pairing grant secret, pairing_grant.php) — never served, never exported
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
    "tagdefinitions": { "fact-check": { … } },        // the definitions of the tags its items name
    "subtitles": { "en": "WEBVTT\n\n00:00.000 --> …" } // subtitle files as text, keyed by srclang
}
```

A **project bundle** holds a library:

```jsonc
{
    "bundle": "project",
    "formatVersion": 1,
    "hypervideosIndex": { … },                        // hypervideos/_index.json, with the overview map
    "hypervideos": { "9": { "bundle": "hypervideo", … } },  // keyed as in hypervideosIndex; without "resources" and "tagdefinitions"
    "resources": { … },                               // resources/_index.json
    "tagdefinitions": { … },
    "config": { "theme": "studio", "defaultLanguage": "en" },
    "customCSS": "…"                                  // custom.css
}
```

`config` carries only the settings that decide how the library looks and plays: `theme`, `defaultLanguage`, `videoFit`, `overviewMode`, `overviewTitle` and `overviewShowSearchBar`. Accounts, authentication, privacy and upload settings belong to an instance and never travel. A project bundle never contains `users.json` or anything from the dot-folders (`.auth/`, `.collab/` and any other).

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
| `guestUserID(name)` | the user id of a guest, who edits without an account (see [annotations](#annotations_indexjson-and-annotationsuseridjson)) |
| `schemaOfFile(path)` | the schema a file of a `_data` folder follows, by its path relative to the folder (`hypervideos/9/hypervideo.json` → `hypervideo.schema.json`); `null` for files without one |
| `readBundle(source, format, options)`, `writeBundle(bundle, format, options)` | bundles in a registered format (`registerBundleFormat`) |

Writing keeps what the model does not cover. Every parsed object remembers what it was read from, and writing merges the model's changes into that: what did not change is written exactly as it was stored, legacy representations included; what changed is written in the current form; properties FrameTrail does not know are kept. Two things are always written in the current form: an item's `@context` and its `created` (ISO 8601 with milliseconds), so older files are upgraded by their next save.

The **folder** format maps a bundle to the `_data` layout: a map of paths relative to `_data/` to contents (parsed JSON for `.json` files, text for `.vtt` and `.css`). A project bundle is the whole tree; a hypervideo bundle is its folder under `hypervideos/` plus a `resources/_index.json` with the resources it carries. Reading takes `{ bundle: 'project' }`, or `{ bundle: 'hypervideo', id }` for one hypervideo.

The **html** format is the [portable HTML format](HTML-FORMAT.md): a page with the bundle in a JSON data block, which plays anywhere and is read back without running it. `FrameTrailHTMLFormat`, next to the serializer and loaded the same way, registers it (`readBundle(html, 'html')`, `writeBundle(bundle, 'html', { datapath, config, library })`) and also reads FrameTrail's HTML exports from before this format (`parseLegacy`). A page can also be a project file, edited in place: `readProject` reads it as the `_data` folder of a project, `writeProject` writes the folder back into its data block (see [Editing a Page in Place](HTML-FORMAT.md#editing-a-page-in-place)).

The box-motion math — normalising, sampling and bounding keyframes, and the ease functions — is in `FrameTrailKeyframes`, next to the serializer and loaded the same way. So are the checks beyond the schemas, `FrameTrailLint` ([below](#checks-beyond-the-schemas)).

Inside the player, scripts and extensions read and change the open hypervideo in this format through `instance.edit`, which validates against the schemas and keeps what it does not know ([EXTENDING.md](EXTENDING.md#editing-the-hypervideo)).

## Checks Beyond the Schemas

A schema judges one file at a time. Data can be valid file by file and still not do what was meant: an overlay that starts after the end of the video, an annotation file the index does not list. `FrameTrailLint` (`src/_shared/frametrail-core/serialization/`, next to the serializer and loaded the same way: `window.FrameTrailLint` in the browser, `require()` in Node) finds these.

```javascript
const Lint = require('./src/_shared/frametrail-core/serialization/FrameTrailLint.js');

const parts  = Lint.partsOf(bundle, { hypervideoId: '9', duration: 600 });   // a hypervideo bundle or a project bundle
const result = Lint.run(parts);                                              // or Lint.run(parts, { rules: ['chapter-order'] })
// { errors: 1, warnings: 0, findings: [{ rule: 'item-outside-video', severity: 'error', kind: 'overlays',
//   ref: '2026-10-01T10:00:00.000Z', message: 'Runs from 605 s to 620 s, outside the video (0 s to 600 s); the player never shows it.' }] }

Lint.checkFolder(files);   // a _data folder in the folder format → [{ path, message }]
```

`run()` checks one hypervideo against the rules below. `partsOf()` reads it from a bundle the way the editor does (through the serializer, so an item's `created` is in its ISO form). `duration` is the length of the video as the media file tells it, for a clip that does not say (`duration` 0, no `out`); without it the end of such a video is unknown, and the rules that need it check only the start. A finding names what it is about by `kind` and `ref` — an item's `created`, a chapter's `start`, the language of subtitles — and an annotation also by its `creator`. `Lint.RESULT_SCHEMA` describes the result, in the schema subset.

| Rule | Severity | Finds |
|------|----------|-------|
| `item-outside-video` | error | an item or chapter the player never reaches: at or after the end of the video, or before its start (the clip's `in`) |
| `item-partly-outside` | warning | an overlay or annotation that runs past the end of the video or begins before its start |
| `overlay-overlap` | warning | two overlays covering the same area at the same time; hotspots and cursors are meant to lie over others and are left out |
| `unknown-resource` | warning | the clip or an item naming a resource that is not in the library |
| `empty-required` | error | an item lacking what its type needs: a source, text (or a visible shape), HTML, a question and answers, a position, chart data, the target of an action (a hotspot's, a quiz answer's, a quiz's `onAnswered`), code |
| `missing-license` | warning | an overlay made from a library resource, or showing a media file, without a licence type |
| `chapter-order` | warning | chapters not stored in order of their start, or two with the same start |
| `cue-outside-video` | warning | subtitle cues that start at or after the end of the video, so probably belong to another one |
| `circular-view-unshown` | warning | a view in the ring around the video (`areaCircular`) that is not shown as stored: another type than a collection (`TimedContent`), or a large one (shown as medium) |
| `quiz-defaults` | warning | a quiz that marks more than one answer as default (decided on a tie or when nobody answers): only the first counts |

`checkFolder()` looks at a whole folder for files that do not agree with each other, and for the files no schema describes: a `.json` file that is not JSON; a `.vtt` file the player cannot read as meant (no `WEBVTT` header, a cue timing it does not read, a cue that ends before it starts; `checkVTT(text)` checks one text); a hypervideo `hypervideos/_index.json` lists without its `hypervideo.json`, or one it does not list; a hypervideo without `annotations/_index.json`; an annotation file without its entry in that index, or an entry without its file; a `subtitles` entry without its `.vtt` file, or a `.vtt` file no entry names. A project file is checked through its folder, `FrameTrailHTMLFormat.readProject(html).files`.

The fixtures in [`tests/fixtures/lint/`](../tests/fixtures/lint/) and the [rules in tests/README.md](../tests/README.md#lint-rules) specify both exactly. `node tests/run-js.mjs --data=path/to/_data` runs them on a folder of your own and lists the findings.

## The Files

### `config.json`

Instance settings. Missing keys mean the defaults in the schema. On a public instance anyone can read this file, so it must never hold a secret: the secret half of external authentication lives in `_data/.auth/config.php`, and an extension's secrets in `_data/.auth/<name>.php`.

Booleans are strict. The server refuses uploads only when `allowUploads` is `false` and treats an instance as private only when `alwaysForceLogin` is `true`; the strings `"false"` and `"true"` do neither. [docs/INTEGRATION.md](INTEGRATION.md#writing-the-settings) lists the settings with what a missing key means and when a change takes effect; [docs/DEPLOYMENT.md](DEPLOYMENT.md#configuration) covers `externalAuth`, `externalSettings`, `userAvatars` and `apiTokens`.

`pairingBrokerURL`, `pairingButtonVisible` and `pairingCompanionURL` set up pairing with phones ([docs/PAIRING.md](PAIRING.md)): the broker phones and the player find each other through (a URL, or a path on the player's own server; empty: pairing off), whether the player controls offer the pairing button, and the page a phone opens (empty: `companion.html` beside the player page). What a paired phone shows is per hypervideo, in its `config.layoutArea.areaCompanion`.

`extensions` lists extensions the instance loads, each `{ name, script, style, settings }` ([docs/EXTENDING.md](EXTENDING.md#writing-an-extension)). `script` and `style` are paths relative to the page, so on its origin; the player refuses anything else. `settings` is handed to the extension's `init()` untouched; FrameTrail neither reads nor validates it, so the schema leaves it open. An extension that cannot be loaded is skipped, so a `_data` directory naming one works on an installation that does not have it. An entry also switches on the extension's server part, if the installation has one in `_server/extensions/<name>/`.

### `tagdefinitions.json`

```json
{ "fact-check": { "label": "Fact check", "description": "Claims checked against sources." } }
```

The tags of the instance, keyed by id: each has a `label` and an optional `description`. Items refer to tags by id in `frametrail:tags`; a content view's `collectionFilter.tags` shows the annotations having any of the tags it lists. Only editors see labels and descriptions: in the tag pickers and in Manage Tags.

Annotation thumbnails carry their tag ids as class names (`resourceThumb fact-check`), so global CSS can style tagged annotations. That is why an id never changes: renaming a tag changes its label only. FrameTrail makes the id of a new tag from its label, as a class name: lowercase letters, digits and dashes, starting with a letter (`Größe` → `grosse`, `2024` → `tag-2024`), with `-2`, `-3`, … when it is taken. Ids in older files may have other characters.

An item may name a tag that is not defined, for instance after the tag was deleted: deleting removes only the definition. Such a tag shows as its id, marked as no longer defined, until the item's author removes it or the tag is defined again with that id.

Older files have a label and description per language code (`{ "lecture": { "en": { "label": "Lecture" }, "de": { "label": "Vorlesung" } } }`). FrameTrail reads the label in the interface language, else the English one, else the first, and writes the one-label form the first time the tag is edited.

### `resources/_index.json`

The resource library: uploaded files and external links that overlays and annotations can be made from. An entry has a `type`, a `name`, a `src` (a file name in `_data/resources/`, or a URL — for embeds the embed URL), an optional `thumb`, licence fields and type-specific `attributes`.

An item made from a resource keeps its **own copy** of the resource's data (`src`, `thumb`, licence, attributes) and refers back with `frametrail:resourceId`. Changing or deleting the resource does not change the item. `created` here is in seconds, unlike almost everywhere else.

A video entry may still carry `subtitles` (file names keyed by language) from earlier versions, which stored subtitle files uploaded together with a video. Nothing reads or writes them any more: a hypervideo's subtitles are in its own `subtitles/` folder.

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
        "markers": {
            "9": { "x": 0.371, "y": 0.182, "size": 6.08 },                       // one pin
            "1": [ { "x": 0.2, "y": 0.6, "size": 6 }, { "x": 0.8, "y": 0.3 } ]   // placed twice
        }
    }
}
```

The overview shows the hypervideos as a grid or, when `config.json` has `overviewMode: "map"`, as pins on the map's background. Markers are keyed by hypervideo id; a marker is one pin, or a list of pins for a hypervideo placed more than once (FrameTrail writes a single pin as the pin itself, never as a list of one). A pin's `x`/`y` are its centre in 0–1 of the background image, `size` its diameter in percent of the stage width; a hypervideo without a marker is not on the map. The map is content, so it lives here rather than in the settings.

### `hypervideos/<id>/hypervideo.json`

```jsonc
{
    "meta": { "name": "…", "description": "…", "thumb": "…", "creator": "demo", "creatorId": "1",
              "created": 1783322367127, "lastchanged": 1791235975527 },
    "config": { "slidingMode": "adjust", "autohideControls": false, "captionsVisible": false,
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
- **`config.layoutArea`** — the content views around the video, in four areas, and those of a phone paired with the player in `areaCompanion` ([docs/PAIRING.md](PAIRING.md)): never shown in the player itself; medium views are laid out like the right area's, a large collection shows the annotations at full size in a swipeable row that follows the playback, and a small view is shown (and saved) as medium; empty or missing means the phone shows no views. `areaCircular` holds one collection (`TimedContent`) shown as a grid of annotation thumbnails in rings around the video, clockwise in time from the cell left of the video's bottom edge; the video shrinks to make room for more rings. It is small or medium (a large view is shown, and saved, as medium), a view of another type is not shown, and at 768 px player width or less, or when the thumbnails do not fit around the video, they form a row below the video instead; empty or missing means no ring. The view's `ringGap` (pixels, default 6) is the space between the thumbnails, between them and the video, and between the ring and the player's edges. An area FrameTrail does not know (one of a later version) is kept as it is when the hypervideo is saved. A content view is told apart by `type`: `TimedContent` (a collection of annotations, filtered by `collectionFilter`), `CustomHTML`, `Transcript` (built from the subtitles of `transcriptSource`; empty, or a language without subtitles, means the first subtitles), `Timelines` and `Chapters`. A transcript view is stored as a transcript; only an export that has to stand alone may turn it into `CustomHTML`.
- **`chapters`** — `{ start, title }`, ordered by `start`. A chapter has no other identity than its `start`, which is unique within the hypervideo.
- **`subtitles`** — one WebVTT file per language in the `subtitles/` folder next to the file, named `<srclang>.vtt`. The editor shows them as transcripts (the Transcripts edit mode), in Transcript views and as captions; cue times are on the video's timeline (a clip with an in point starts later than 0). It keeps what it does not change in a file (header, NOTE, STYLE and REGION blocks, cue ids and settings, line endings) and writes cues in the order of their start. A speaker is a voice tag at the start of a cue (`<v Ada>Hello`); `config.captionsVisible` turns captions on from the start.
- **`globalEvents`** — JavaScript run on player events, edited in the hypervideo settings (Advanced Options). Event code is the body of a function called with `FrameTrail` (the instance) and `hypervideo` (its HypervideoController).
- **`customCSS`** — deprecated: CSS for this hypervideo. It is still applied while the hypervideo is shown, but FrameTrail no longer edits it; CSS belongs in the instance's `custom.css`.

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

`created` is in seconds, `lastchanged` in milliseconds (seconds in older files). `lastchanged` is the compare-and-swap token of the user's file: the editor's save carries the value it loaded (`annotationfileSave` → `baseVersion`; `0` for a user who had no file), and the server refuses it with code 7 when the file has been saved since — from another tab, or by a script with the user's API token — so the editor shows that the annotations changed instead of overwriting them. A tool that writes an annotation file must therefore change its entry's `lastchanged` (`annotationfileSave` does; it may also send `baseVersion` itself). In a local folder or project file the token is the file's version (modification time and size), so there any write is noticed. User ids are strings, except `ownerId`, which the server writes as a number. In local-folder mode there are no accounts: a user id is derived from the name the user enters, as `guest_<name>-<hash>` (the name "Anna B" gives `guest_anna-b-919e0619`; `FrameTrailSerializer.guestUserID(name)` computes it), so the same name finds its annotation file again. An annotation file is a JSON array of annotations (below).

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
    "frametrail:events": { "onClick": "console.log('clicked');" },
    "frametrail:pause": true
}
```

| `frametrail:type` | Lives in | Target selector | Notes |
|-------------------|----------|-----------------|-------|
| `Overlay` | `hypervideo.json` → `contents` | time span and box | shown over the video; may move (keyframes) and rotate; `frametrail:events`, `frametrail:pause` |
| `CodeSnippet` | `hypervideo.json` → `contents` | a point in time `t=<start>` | body is `TextualBody`, `frametrail:type` `codesnippet`, `format` `text/javascript`, the code in `value`; FrameTrail has no editor for them, they run when written into the file |
| `Annotation` | `annotations/<userId>.json` | time span | shown in timelines and content views; `frametrail:uri`, `frametrail:graphdata`, `frametrail:pause` |

`frametrail:pause: true` (overlays and annotations) pauses the video at the item's start: when playback crosses it, or starts at it (an item at 0:00, "Play from here"); seeking into the middle of its time span does not. An annotation pauses only while it is shown: in an open content view of the player, or in the phone area while phones are paired. Items made in the editor get their type's default — `true` for quizzes and the plain hotspot, `false` otherwise; a missing `frametrail:pause` is `false`.

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
| `location` | ✓ | ✓ | ✓ | Dataset | application/x-frametrail-location | `source` |
| `mastodon`, `codepen`, `urlpreview` | ✓ | ✓ | ✓ | Text | text/html | `source` |
| `figma` | ✓ | ✓ | ✓ | Image | text/html | `source` |

`body.type` and `body.format` are derived from `frametrail:type` for other W3C consumers; FrameTrail never reads them, and older files omit them for some types. The resource's `src` goes into `body.source` or `body.value` as the last column says; overlays read whichever is present. Items made from a resource repeat its name, thumbnail, licence and attributes in `frametrail:name`, `frametrail:thumb`, `frametrail:licenseType`, `frametrail:licenseAttribution` and `frametrail:attributes`.

The text of `text` and `html` items (`attributes.text`) is stored HTML-escaped (`&lt;p&gt;…`) and unescaped before rendering.

Every overlay type also takes `opacity`, `hoverStyle`, `zIndex` and `animation` in its attributes; hotspots take an action (`action`, `actionTarget`, `actionTargetTime`), and so do a quiz's answers and its `onAnswered` (with the quiz's own actions `""` continue and `pause` beside them). They are listed in each attribute schema. [TYPES.md](TYPES.md) has every type's attributes with their values and defaults, and what each type is for.

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

A text overlay with `attributes.autoSize: "height"` has a box as high as its content: the editor writes the height whenever the content or the width changes, so the stored box is what the author saw. Text is laid out on a stage 800 px wide, whatever the player's size, so the height that fits depends only on the content, the width and the video's aspect ratio. When shown, the content of such an overlay is never clipped, in case other fonts make it longer.

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
| `hypervideo.json` → `meta.created`, `meta.lastchanged` | Unix timestamp in milliseconds |
| `config.json` → `lastchanged` | Unix timestamp in milliseconds |
| `hypervideos/_index.json` → `overviewMap.lastchanged` | Unix timestamp in milliseconds |
| `resources/_index.json` → `created` | Unix timestamp in seconds |
| `annotations/_index.json` → `created` | Unix timestamp in seconds |
| `annotations/_index.json` → `lastchanged` | Unix timestamp in milliseconds (seconds in older files) |

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
| `[]` instead of `{}` | `frametrail:attributes`, `frametrail:events`, `globalEvents`, animation `params`, a resource's `attributes`, an extension's `settings` in `config.json`, and the maps in the index files and `tagdefinitions.json` | an empty object — older versions of the PHP backend wrote it, because they decoded files to PHP arrays, which cannot tell the two apart. FrameTrail now writes `{}`, and keeps a `[]` it finds where nothing changes |
| body `frametrail:type` `"button"` | overlays | no Resource type exists; FrameTrail does not render the item and keeps it |
| user entries at the top level of `annotations/_index.json` (`{ name, description, hidden, src }`), next to or instead of `annotationfiles` | local-folder mode | an annotation file of that user; moved under `annotationfiles` when that user next saves |
| `annotation-increment` | `hypervideo.json`, `annotations/_index.json` | not used |
| `frametrail:attributes` at the item level instead of the body | very old overlays | the body's attributes, when the body has none |
| `frametrail:lat`, `frametrail:long`, `frametrail:boundingBox` on the body | location annotations | `attributes.lat`, `.lon`, `.boundingBox` |
| `animationIn`, `animationOut`, `animationDuration` | overlay attributes | `attributes.animation` |
| `linkUrl` | hotspot attributes | `action: "openUrl"` with that target, when `action` is empty |
| `onCorrectAnswer`, `onWrongAnswer` (`showText`, `resumePlayback`, `jumpForward`, `jumpBackward`), and `onAnswered` with `showText` / `resumePlayback` | quiz attributes, when no answer and no `onAnswered` has an `action` | actions: the correct or wrong outcome for the decided answer, a jump as `jumpToTime` from where the quiz was answered, `resumePlayback: false` as `pause`, `showText` as `feedback`. The quiz editor converts them on its first change (jumps from the quiz's start; a multiSelect quiz keeps its correct outcome as `onAnswered`) |
| an `onStart` that only pauses (`FrameTrail.module('HypervideoController').pause();`, or `hypervideo.pause();`) | overlays without `frametrail:pause` (quiz and hotspot overlays made before it) | `frametrail:pause: true`; the call is not run. Kept as stored until the item's pause is switched in the editor, which writes `frametrail:pause` and removes the call |
| a label and description per language code (`{ "en": { "label": … }, "de": { … } }`) | tags in `tagdefinitions.json` | the label in the interface language, else the English one, else the first; written as `{ label, description }` the first time the tag is edited |
| `overviewMap` (markers as a list of `{ hypervideoID, x, y, size }`) | `config.json` | the overview map, when `hypervideos/_index.json` has none; moved there by the first map save |
| `defaultTheme` | `config.json`, a project bundle's `config`, init options, `data-frametrail-config` | `theme`, when that is empty |
| `allowCollaboration`, `defaultUserRole`, `updateServiceURL`, `autoUpdate` | `config.json` | not used |
| `theme` | `hypervideo.json` → `config` | not used: a hypervideo has no theme of its own, the instance's `theme` applies. Kept in the file as it is |
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

A validator that implements these keywords checks the schemas completely; a full JSON Schema 2020-12 validator gives the same results. `FrameTrailSchema` implements exactly these and refuses any other keyword, so a schema that needs more fails the tests. Decode JSON so that `{}` and `[]` stay different (in PHP: `json_decode($json)` without `true`, or an equivalent); otherwise an empty object cannot be told from an empty array, and a file written back turns every `{}` into `[]`. FrameTrail's PHP backend decodes this way wherever it writes a file back.
