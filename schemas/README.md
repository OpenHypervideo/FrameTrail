# FrameTrail JSON Schemas

JSON Schemas (draft 2020-12) for the files in a FrameTrail `_data/` folder and for the bundles that carry a hypervideo or a whole library as one document. [docs/DATA-MODEL.md](../docs/DATA-MODEL.md) explains the files, which schema validates which, and the subset of JSON Schema these use.

| Schema | Validates |
|--------|-----------|
| `config.schema.json` | `_data/config.json` |
| `tagdefinitions.schema.json` | `_data/tagdefinitions.json` |
| `resources-index.schema.json` | `_data/resources/_index.json` |
| `hypervideos-index.schema.json` | `_data/hypervideos/_index.json` |
| `hypervideo.schema.json` | `_data/hypervideos/<id>/hypervideo.json` |
| `content-item.schema.json` | an overlay or code snippet in `hypervideo.json` → `contents` |
| `annotations-index.schema.json` | `_data/hypervideos/<id>/annotations/_index.json` |
| `annotation-file.schema.json` | `_data/hypervideos/<id>/annotations/<userId>.json` |
| `attributes/<type>.schema.json` | `frametrail:attributes` of an item (or `attributes` of a resource) of that type |
| `hypervideo-bundle.schema.json` | one hypervideo with its annotations, resources and subtitles |
| `project-bundle.schema.json` | a whole library |
| `common.schema.json` | shared definitions |

The schemas reference each other by relative URI against their `$id` (`https://frametrail.org/schemas/1/…`). Load the whole folder into your validator; nothing is fetched.

FrameTrail's own validator for them is `FrameTrailSchema` (`src/_shared/frametrail-core/schema/`). [`tests/`](../tests/README.md) holds valid and invalid documents for them, with the errors expected for each.
