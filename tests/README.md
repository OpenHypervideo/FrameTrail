# FrameTrail Tests

Fixture-based tests for FrameTrail's data format: the JSON Schemas in [`schemas/`](../schemas/), the serializer and the validator. The fixtures are plain JSON, so tools in other languages can use them too; the rules a runner applies to them are below.

```bash
node tests/run-js.mjs                          # Node 20 or later, nothing to install
node --test-reporter=spec tests/run-js.mjs     # the same, with readable output outside a terminal
node tests/run-js.mjs --data=path/to/_data     # also check a _data folder of your own
```

CI runs the tests on every push and pull request (`.github/workflows/build.yml`).

| What | Checked |
|------|---------|
| `schemas/` | Every schema uses only the [schema subset](../docs/DATA-MODEL.md#schema-subset), every `$ref` resolves, every schema is named after its `$id`. The player's copy (`FrameTrailSchemas.js`, from `node scripts/bundle-schemas.mjs`) is up to date and judges every case alike. |
| `fixtures/data/` | Every file follows its schema. Hypervideos and annotation files round-trip through `FrameTrailSerializer`. Each folder, read as a project bundle and as one hypervideo bundle per hypervideo, follows the bundle schemas and survives writing and reading again, in the `folder` format and as a page in the [portable HTML format](../docs/HTML-FORMAT.md). |
| `fixtures/examples/` | Matches the data the pages in `examples/` pass to `FrameTrail.init()`. Each case as below. |
| `fixtures/cases/` | Each case validates with exactly the expected errors; valid hypervideos, annotation files and content items round-trip. |
| `fixtures/html/` | Exports from before the HTML format are read into valid hypervideo bundles. |
| Unit tests | `FrameTrailSchema`, `FrameTrailSerializer`, `FrameTrailHTMLFormat` (escaping of the data block and of an embedded library, attribute variants, newer formats refused), `FrameTrailKeyframes`. |

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

To add a fixture, add a case to a case file, or a folder to `fixtures/data/`. A case's expected errors come from `FrameTrailSchema`: check that they name the actual problem before you keep them.

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

Any other JSON file in a fixture is an error. `.vtt` and `.css` files have no schema.

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
