# FrameTrail Tests

Fixture-based tests for FrameTrail's data format: the JSON Schemas in [`schemas/`](../schemas/), the serializer, the validator and the checks beyond the schemas (`FrameTrailLint`). The fixtures are plain JSON, so tools in other languages can use them too; the rules a runner applies to them are below.

```bash
node tests/run-js.mjs                          # Node 20 or later, nothing to install
node --test-reporter=spec tests/run-js.mjs     # the same, with readable output outside a terminal
node tests/run-js.mjs --data=path/to/_data     # also check a _data folder of your own; its lint findings are listed, not failed
```

CI runs the tests on every push and pull request (`.github/workflows/build.yml`).

| What | Checked |
|------|---------|
| `schemas/` | Every schema uses only the [schema subset](../docs/DATA-MODEL.md#schema-subset), every `$ref` resolves, every schema is named after its `$id`. What `node scripts/bundle-schemas.mjs` writes is up to date: the player's copy (`FrameTrailSchemas.js`), which judges every case alike, and [`docs/TYPES.md`](../docs/TYPES.md). The table of resource types in [DATA-MODEL.md](../docs/DATA-MODEL.md#resource-types) matches the serializer and the schemas, its table of lint rules `FrameTrailLint.RULES`. |
| `fixtures/data/` | Every file follows its schema, and the files agree with each other (`FrameTrailLint.checkFolder`). Each hypervideo lints, with a result that follows `FrameTrailLint.RESULT_SCHEMA`. Hypervideos and annotation files round-trip through `FrameTrailSerializer`. Each folder, read as a project bundle and as one hypervideo bundle per hypervideo, follows the bundle schemas and survives writing and reading again, in the `folder` format and as a page in the [portable HTML format](../docs/HTML-FORMAT.md). As a project page it is edited in place: read as a folder and written back, the page is the same byte for byte, and after a change only its data block differs. |
| `fixtures/examples/` | Matches the data the pages in `examples/` pass to `FrameTrail.init()`. Each case as below. |
| `fixtures/cases/` | Each case validates with exactly the expected errors; valid hypervideos, annotation files and content items round-trip. |
| `fixtures/html/` | Exports from before the HTML format are read into valid hypervideo bundles. |
| `fixtures/lint/` | Every data set is a valid bundle. Each case finds exactly the findings given, with a result that follows `FrameTrailLint.RESULT_SCHEMA`; every rule is found by some case. |
| Unit tests | `FrameTrailSchema`, `FrameTrailSerializer` (also `schemaOfFile`, `guestUserID` with the example in DATA-MODEL.md), `FrameTrailHTMLFormat` (escaping of the data block and of an embedded library, attribute variants, newer formats refused; editing a page in place: the page around the block kept, a hypervideo page read as a project with its page settings moved into the data, an index entry without its folder left out, a new page from an empty project), `FrameTrailLint` (`partsOf`, plain text and WebVTT cues, `checkFolder` on a folder with every problem it reports and on a project file's folder), `FrameTrailKeyframes`. |

The tests do not cover the user interface; see [CONTRIBUTING.md](../CONTRIBUTING.md#testing).

## Fixtures

### `fixtures/data/`

Each folder is a `_data` folder without `users.json` and without media files (`resources/` holds only its `_index.json`).

| Folder | Source | Covers |
|--------|--------|--------|
| `all-types` | made for the tests | An item of every type in the current form: 26 overlays, a code snippet, 22 annotations, 19 resources (one of each overlay, annotation and library type); every content view, chapters, subtitles, box motion, rotation, animation, hotspot actions, tags. The entity overlay and resource are there although the editor has no way to add an entity resource. The player loads this folder (media files aside). |
| `animation` | FrameTrail's development data | Box motion and animation presets as the editor writes them, charts, counters, legacy `button` overlays, the overview map, subtitles and a Transcript view, an empty annotation file. |
| `zoom-in-on-dna` | [FrameTrail-Examples](https://github.com/OpenHypervideo/FrameTrail-Examples) | Hotspot and image overlays, Wikipedia and URL preview annotations, CustomHTML views, global event code, custom CSS. |

`animation` and `zoom-in-on-dna` are older files as FrameTrail wrote them: `created` as `Date.toString()` text, the prefix-only `@context`, PHP's `[]` for `{}`, unused keys.

### Case files: `fixtures/cases/` and `fixtures/examples/`

```json
{
    "description": "What the cases in this file have in common.",
    "cases": [
        {
            "name": "hotspot shape triangle",
            "schema": "content-item.schema.json",
            "data": { "...": "the document" },
            "errors": [
                { "path": "/body/frametrail:attributes/shape", "message": "must be one of \"circle\", \"rectangle\", \"rounded\", \"arrow\", \"underline\", \"freeform\"" }
            ]
        }
    ]
}
```

- `schema` is a file in `schemas/`, optionally with a fragment (`common.schema.json#/$defs/keyframe`).
- A case without `errors` is valid. A case with `errors` has exactly those, in any order.

| File | Cases |
|------|-------|
| `cases/legacy-shapes.json` | Older shapes FrameTrail still reads ([DATA-MODEL.md, Legacy Shapes](../docs/DATA-MODEL.md#legacy-shapes)). All valid. |
| `cases/minimal.json` | Documents with only the required properties, and documents with properties FrameTrail does not know (`generator`, unknown keys). All valid. |
| `cases/invalid-*.json` | Broken items, hypervideos, files and bundles, with the errors expected for them. |
| `examples/<page>.json` | The data `examples/<page>.html` passes to `FrameTrail.init()`. Written by `node tests/extract-examples.mjs`; run it after changing a page's data, the tests fail until then. |

### `fixtures/html/`

| File | |
|------|---|
| `legacy-export.html` | Save As HTML of FrameTrail before the portable HTML format (data as the argument of `FrameTrail.init(…)`), written from `fixtures/data/all-types` with its `dataPath` set to `https://example.org/_data/`. |
| `legacy-hypervideo.json` | Save As JSON of the same version: a flat `hypervideo.json`. |

### `fixtures/lint/`

Cases of the lint rules (`FrameTrailLint.run`), one file per topic, and the data sets they start from:

| File | |
|------|---|
| `data/lecture.json` | A hypervideo bundle in the current form: text, hotspot, rotated image and moving overlays, a code snippet, three chapters, annotations of two users (one `created` shared between them), English subtitles, two content views. Its video's duration comes from the media (`clips[0].duration` is 0), so cases give it. |
| `data/project.json` | A project bundle with two hypervideos: an empty timeline of another user (90 s) and a trimmed video (in 12, out 132), hidden, with German subtitles. |
| `data/legacy.json` | A hypervideo bundle in older shapes: `created` as `Date.toString()` text, two overlays made in the same second, the prefix-only `@context`, PHP's `[]` for `{}`, the clip's video named by its resource, an annotations index of local-folder mode, keys FrameTrail does not know. |
| `time.json`, `content.json`, `layout.json` | Where things lie in time; what items hold; how things are arranged, and older data. |

```json
{
    "description": "What the cases in this file have in common.",
    "data": "lecture",
    "duration": 600,
    "cases": [
        {
            "name": "an overlay after the end",
            "patch": [{ "op": "replace", "path": "/hypervideo/contents/0/target/selector/value", "value": "t=605,620&xywh=percent:10,10,50,20" }],
            "rules": ["item-outside-video"],
            "findings": [{ "rule": "item-outside-video", "severity": "error", "kind": "overlays", "ref": "2026-10-01T10:00:00.000Z", "message": "Runs from 605 s to 620 s, outside the video (0 s to 600 s); the player never shows it." }]
        }
    ]
}
```

| Key | Meaning |
|-----|---------|
| `data` | A file in `lint/data/`, without `.json`. |
| `hypervideoId` | In a project bundle, the hypervideo that is checked (default: the first in `hypervideos`). |
| `duration` | Seconds: the video's duration as the media tells it, for a clip that does not say; `null` or absent: unknown. |
| `patch` | A [JSON Patch (RFC 6902)](https://www.rfc-editor.org/rfc/rfc6902) with `add`, `remove` and `replace` only, applied to the data first: how the case differs from the data set. Absent: the data as it is. |
| `rules` | Run only these rules. Absent: all of them. |
| `findings` | Exactly the findings, in order, compared as JSON values. |

The file's `data`, `hypervideoId` and `duration` hold for every case; a case may give its own.

To add a fixture, add a case to a case file, or a folder to `fixtures/data/`. A case's expected errors come from `FrameTrailSchema`, a lint case's findings from `FrameTrailLint`: check that they name the actual problem before you keep them.

## Rules for Runners

A runner in another language — a PHP port of the serializer and the validator, say — uses the same fixtures and applies these rules.

### Which schema a file follows

Paths are relative to the `_data` folder.

| File | Schema |
|------|--------|
| `config.json` | `config.schema.json` |
| `tagdefinitions.json` | `tagdefinitions.schema.json` |
| `resources/_index.json` | `resources-index.schema.json` |
| `hypervideos/_index.json` | `hypervideos-index.schema.json` |
| `hypervideos/<dir>/hypervideo.json` | `hypervideo.schema.json` |
| `hypervideos/<dir>/annotations/_index.json` | `annotations-index.schema.json` |
| `hypervideos/<dir>/annotations/<file>.json` | `annotation-file.schema.json` |

Any other JSON file in a fixture is an error. `.vtt` and `.css` files have no schema. `FrameTrailSerializer.schemaOfFile(path)` gives the schema of a path.

### Validation errors

An error is `{ "path", "message" }`. The path is a JSON Pointer ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)) into the document: `""` is the document itself, `~` and `/` in a key are written `~0` and `~1`.

| Problem | Path | Message |
|---------|------|---------|
| `type` | the value | `must be <types>, is <type>`. Types are joined with `, ` and a final ` or `; the value's type is one of `object`, `array`, `string`, `number`, `boolean`, `null` (every number is `number`). |
| `required` | the missing property | `is required` |
| `additionalProperties: false` | the property | `is not allowed` |
| `const` | the value | `must be <value>` |
| `enum` | the value | `must be one of <value>, <value>, …` |
| `minimum`, `maximum` | the value | `must be >= <n>`, `must be <= <n>` |
| `minItems`, `maxItems` | the array | `must have at least <n> items`, `must have at most <n> items` (`item` for 1) |
| `pattern` | the string | `must match the pattern <pattern>` |
| `oneOf`, several match | the value | `must match exactly one of the alternatives, matches <n>` |

Values in messages are compact JSON. When `type` fails, nothing else is reported for that value. The same error is reported once.

When no alternative of a `oneOf` matches:

1. If every alternative (after following a `$ref`) is an object schema that requires the same property and fixes it with `const`, each to a different value, that property picks the alternative: its errors are reported. A missing property gives `is required` at the property; a value no alternative has gives `must be one of <values>` at the property.
2. Otherwise, of the alternatives that declare a `type` the value has, the one with the fewest errors (the first on a tie) is reported.
3. If no alternative declares such a `type`: `must be <types>, is <type>` with the types the alternatives declare, in order.

### Round trips

`serialize(parse(x))` for a valid `hypervideo.json`, annotation file or content item `x` equals `x`, including key order, except for:

- an item's `@context`, which is the current context `["http://www.w3.org/ns/anno.jsonld", "https://frametrail.org/ns/context.jsonld"]`;
- an item's `created`, which is the ISO 8601 form (UTC, milliseconds) of the stored value, made unique within its group by moving a value already taken (or a missing one, counted as 0) on by 1 ms, in order. Groups: a hypervideo's overlays; its code snippets; an annotation file's annotations with the same `creator.id`. A single content item has no group;
- in `hypervideo.json`, `meta.lastchanged`, which is the time of the save, and `contents`, which lists the overlays, then the code snippets, then items of any other `frametrail:type`, each group in stored order.

A key `x` lacks is added at the end of its object. Serializing the result again changes nothing, and it follows its schema. `run-js.mjs` implements these rules in `expectedHypervideo()`, `expectedAnnotationFile()` and `expectedItem()`.

### Lint rules

A runner applies a lint case's patch to its data set, reads the hypervideo from the result (`FrameTrailLint.partsOf`), runs the rules (all, or the case's `rules`), and checks that the result follows `FrameTrailLint.RESULT_SCHEMA`, that `errors` and `warnings` count the findings of each severity, and that the findings are exactly those given. Every rule must be found by some case. The rules, their ids and severities are `FrameTrailLint.RULES`; this is what they do beyond their descriptions:

- **What is read:** the hypervideo as the serializer reads and writes it (`parseHypervideo` and `serializeHypervideo`; every annotation file through `parseAnnotationFile`, then `created` made unique per creator across the files as on reading, then `serializeAnnotation`): its overlays and code snippets, the annotations of every user (files in the order of their keys), its chapters sorted by start (`chapter-order` reads them in stored order), its first clip, the text of each language in `subtitles`, and the resources — a hypervideo bundle's `resources`, a project bundle's `resources.resources`; without them nothing is known about resources and `unknown-resource` finds nothing.
- **The video's time** starts at the clip's `in` (0 when missing) and ends at its `out` when that is above 0, else at the media's duration (the case's `duration`, else the clip's `duration` when above 0), rounded to the millisecond. The end is unknown when none of these says, or when it is not after the start.
- **Order:** findings by rule in the order of `FrameTrailLint.RULES`; within a rule overlays, then annotations, then code snippets, then chapters, each as listed. `overlay-overlap` goes through the pairs by the later overlay, then the earlier.
- **Times:** an item's span is its Media Fragments time (`t=start,end`). Outside the video: a span that starts at or after the end, or ends at or before the start while starting before it; a point (code snippet, chapter) at or after the end, or before the start. Partly outside: a span not outside whose end is after the end, or whose start is before the start. A span of no length at the start is neither. Without a known end, only the start counts.
- **Overlap:** the boxes of `xywh=percent:` (with box motion, the union box the selector carries), width and height above 0; time spans and boxes that only touch do not overlap; hotspots and cursors are left out. The time in the message is from the later start to the earlier end.
- **Empty:** a value counts as empty when it is not a string or is white space only; a text overlay's text and title, a quiz's question and answer texts are made plain text (below) first, HTML, chart data, code and sources are taken as they are. Source types are image, video, audio, pdf, youtube, vimeo, wistia, loom, twitch, soundcloud, spotify, webpage, wikipedia, mastodon, codepen, figma and urlpreview (a source in `body.source` or `body.value`); entity also takes the item's `frametrail:uri`. A location needs `lat` and `lon` that read as numbers. Quizzes without `questionType` are multiple choice. Hotspot actions that need a target: `openUrl`, `jumpToTime`, `jumpToHypervideo` (`actionTarget` missing, `null` or empty text; `0` is a target). The message lists what is missing; a quiz's question comes before its answers.
- **License:** an overlay is made from a resource when its body has a `frametrail:resourceId` that is not `null` or empty; it shows a media file when it is an image, video, audio or pdf with a source.
- **Cues:** by the WebVTT rule below; only for a clip without an out point (a positive `out`) and a known end; one finding per language, counting the cues that start at or after the end.
- **Plain text:** decode character references (`&amp; &lt; &gt; &quot; &apos; &nbsp;`, case-insensitive, `&nbsp;` as a space, and numeric ones `&#…;` `&#x…;` of valid code points; nothing else), remove tags (`<` and a letter, or `</` and a letter, up to `>`) and comments, decode again, collapse white space to single spaces, trim. `FrameTrailLint.plainText()`.
- **WebVTT cues:** a byte order mark is dropped and line ends may be CR LF; blocks are separated by empty lines; a block whose first or second line is a timing line (`[h:]mm:ss.ttt --> …`: hours optional, one or two digits of minutes, one to three of fractions, `.` or `,` before them) is a cue, every other block (header, `NOTE`, `STYLE`, `REGION`) is not; a cue's text is the lines after its timing line as plain text, joined by a space; cues without text are left out; times in seconds rounded to the millisecond. `FrameTrailLint.cues()`.
- **Numbers in messages:** as JavaScript's `String(number)` writes them (`605`, `605.5`). An item's `ref` is its `created` as `partsOf` gives it, a chapter's its `start`, the subtitles' their language.

### The folder check

`FrameTrailLint.checkFolder(files)` takes a folder in the serializer's `folder` format (JSON parsed or as text) and reports `{ path, message }`, sorted by path:

- a `.json` file given as text that is not JSON (`Is not valid JSON: …`; it takes part in no other check);
- `hypervideos/_index.json`: an entry that is no folder inside `hypervideos/`, and an entry whose `hypervideo.json` is missing (both at the index's path); a `hypervideos/<dir>/hypervideo.json` no entry names (at its path);
- for each `hypervideos/<dir>/hypervideo.json`: a missing `annotations/_index.json`; an annotation file without an entry in that index (read with `parseAnnotationIndex`, so legacy top-level entries count), at the file's path; an entry without its file, at the index's path; a `subtitles` entry whose file (`subtitles/<src>`, else `subtitles/<srclang>.vtt`) is missing, at `hypervideo.json`; a `.vtt` file in `subtitles/` no entry names, at its path.

The messages are those in the unit tests of `run-js.mjs`.
