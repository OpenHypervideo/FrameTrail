# The Portable HTML Format

A hypervideo, or a whole project, as **one HTML file**:

- it plays wherever it is opened, from a web server or straight from the disk (`file://`);
- its data can be read back without running anything in it;
- it can be imported into any FrameTrail instance.

FrameTrail's Save As writes this format ("Download as Files" → HTML), and its import dialog reads it ([DEPLOYMENT.md](DEPLOYMENT.md#save-as--export)). This page describes the format itself, for anyone who writes or reads such files.

## A File

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="FrameTrail">
<title>Zoom in on DNA</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@frametrail/frametrail@2.0.0/frametrail.min.css">
</head>
<body>
<script type="application/ld+json" data-frametrail="hypervideo" data-frametrail-format="1"
        data-frametrail-datapath="https://example.org/_data/"
        data-frametrail-config="{&quot;defaultTheme&quot;:&quot;dark&quot;}">
{
    "bundle": "hypervideo",
    "formatVersion": 1,
    "id": "9",
    "hypervideo": { … },
    "annotations": { "index": { … }, "files": { "1": [ … ] } },
    "resources": { … },
    "subtitles": { "en": "WEBVTT\n\n00:00.000 --> 00:04.000\nHello" }
}
</script>
<script src="https://cdn.jsdelivr.net/npm/@frametrail/frametrail@2.0.0/frametrail.min.js"></script>
<script>FrameTrail.autoInit();</script>
</body>
</html>
```

The data is a **bundle**: a hypervideo bundle or a project bundle, as described in [DATA-MODEL.md](DATA-MODEL.md#bundles) and by `schemas/hypervideo-bundle.schema.json` and `schemas/project-bundle.schema.json`. A hypervideo bundle carries the hypervideo, all users' annotations, the resource entries it uses and its subtitles. A project bundle carries every hypervideo, the overview map, the resource library, the tag definitions, the playback settings and the global CSS.

## The Data Block

The bundle is the text of a `<script type="application/ld+json">` element with a `data-frametrail` attribute. It is JSON, never JavaScript: nothing in the file has to run for its data to be read.

| Attribute | |
|-----------|---|
| `data-frametrail` | `hypervideo` or `project`, the kind of bundle (required; the bundle's own `bundle` property says the same) |
| `data-frametrail-format` | the version of this format, `1`. A reader refuses a block in a newer format. Default `1` |
| `data-frametrail-datapath` | what relative media paths resolve against: the `_data/` folder they are relative to (an uploaded file `x.mp4` is at `<datapath>resources/x.mp4`). Absolute or relative to the page. Without it, a `_data/` folder next to the file |
| `data-frametrail-config` | playback settings for the page, as JSON: `defaultTheme`, `defaultLanguage`, `videoFit`, … For a project they override the bundle's own `config` |
| `data-frametrail-language` | the language, shorthand for `defaultLanguage` |
| `data-frametrail-target` | where to mount the player, a CSS selector. Default: the `<body>`. Only the first block for each target is played |
| `data-frametrail-fullpage` | `true` or `false`: may the player name the browser tab (as for `<video data-frametrail>`) |

**Escaping.** Every `<` in the JSON is written as `<`. JSON reads it back as `<`, and no text in the content (`</script>`, `<!--`) can end the block or change how the browser parses it.

**Media** is never embedded. Media paths are URLs, or paths in `_data/resources/` that resolve against `data-frametrail-datapath`. Save As in server and static mode writes the instance's own `_data/` URL there. The file then plays its uploaded media from that instance, as long as it is reachable; a private instance serves it only to a signed-in browser. An export from a local folder writes none, so its relative media are looked for in a `_data/` folder next to the file. YouTube and other embeds are URLs and need no base; some of them refuse to play in a page opened from the disk.

## The Library

FrameTrail itself is loaded by ordinary tags. Either:

- **from the web:** `<link>` and `<script src>` pointing at a published release on jsDelivr, pinned to the version that wrote the file. The file stays small and needs a network connection;
- **inside the file:** `<style data-frametrail-library>` and `<script data-frametrail-library>` with the library's text (about 3 MB), so the file also works offline. The text is made safe for its element: `</script` becomes `<\/script`, `<!--` becomes `<\x21--`, `</style` becomes `<\/style`, each of which means the same where it occurs.

A one-line `<script>FrameTrail.autoInit();</script>` after the library plays the data block. Readers of the data ignore the library either way.

## Playing

`FrameTrail.autoInit()` finds the data blocks (and `<video data-frametrail>` elements, see [ARCHITECTURE.md](ARCHITECTURE.md#scenario-c--data-attribute-auto-scan)) and starts a player for each target. A host page can also pass a bundle directly:

```javascript
FrameTrail.init({
    bundle:   bundle,                          // a hypervideo or project bundle
    dataPath: 'https://example.org/_data/',     // what relative media paths resolve against
    config:   { defaultTheme: 'dark' },         // optional; overrides a project's config
    target:   '#player'
}, 'PlayerLauncher');
```

A hypervideo bundle starts in its hypervideo, under its own id. A project bundle starts in the overview (in map mode with its overview map) unless a `startID` or the page's hash names a hypervideo. Annotations, subtitles (also in Transcript views), tag definitions and the global CSS come from the bundle; nothing is fetched. The player runs in memory (`storageMode: 'download'`): it can be edited and exported again with Save As, and nothing is saved.

## Reading Without Running

Any HTML parser will do: take the text of the first `script` element whose `type` is `application/ld+json` and that has a `data-frametrail` attribute, and parse it as JSON. In JavaScript, `FrameTrailHTMLFormat` (`src/_shared/frametrail-core/serialization/`) does it without a DOM, in the browser and under `require()` in Node:

```javascript
const HTMLFormat = require('./src/_shared/frametrail-core/serialization/FrameTrailHTMLFormat.js');

const [block] = HTMLFormat.parse(fs.readFileSync('Zoom_in_on_DNA.html', 'utf8'));
// block: { kind, format, datapath, config, target, bundle }

const html = HTMLFormat.write(bundle, { datapath: 'https://example.org/_data/', library: HTMLFormat.cdnLibrary('2.0.0') });
```

It also registers the format `html` with `FrameTrailSerializer`, so `readBundle(html, 'html')` and `writeBundle(bundle, 'html', options)` work like the `folder` format.

**Earlier exports.** Before this format, Save As embedded the data as the JSON argument of `FrameTrail.init({…}, 'PlayerLauncher')`. `HTMLFormat.parseLegacy(html)` finds that argument by scanning, never by evaluating it, and returns `{ bundle, datapath, config }`: a hypervideo bundle with the hypervideo and its annotations, one file per creator. `readBundle(html, 'html', { legacy: true })` falls back to it. The flat `hypervideo.json` that Save As JSON wrote then becomes a bundle with `HTMLFormat.hypervideoBundle(hypervideo)`.

## Relation to Web Annotations in HTML

The W3C Note [Embedding Web Annotations in HTML](https://www.w3.org/TR/annotation-html/) puts annotations into a page as JSON-LD in `<script type="application/ld+json">`. A bundle's annotations and items are such Web Annotations (with FrameTrail's [JSON-LD context](DATA-MODEL.md#namespace-and-json-ld-context)), carried in one data block together with the hypervideo they belong to.
