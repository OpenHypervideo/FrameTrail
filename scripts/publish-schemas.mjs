/*
 * Publishes the schemas in schemas/ where their $ids point, https://frametrail.org/schemas/1/. Run it on main after a release, into the FrameTrail-Website repository, and deploy the website:
 *
 *     node scripts/publish-schemas.mjs ../FrameTrail-Website/schemas/1
 *
 * - Every *.schema.json is copied byte for byte, at its path below schemas/, with its titles and descriptions (unlike FrameTrailSchemas.js). A schema whose $id is not BASE + that path is refused: it would be published under a URL that is not its $id.
 * - index.html lists them, each with the first sentence of its description.
 * - A schema published before and no longer in schemas/ stays published and is listed; --remove deletes it. A published URL is meant to stay.
 *
 * --schemas <dir> publishes another folder instead, e.g. a release's without checking it out: git archive v2.0.0 schemas | tar -x -C <tmp>, then --schemas <tmp>/schemas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS_DIR, STANDARD_PART, firstSentence } from './bundle-schemas.mjs';

export const BASE = 'https://frametrail.org/schemas/1/';

const REPOSITORY = 'https://github.com/OpenHypervideo/FrameTrail/';

// The schemas of the files in _data/, in the order of schemas/README.md; one not listed here comes after them.
const DATA_FILES = ['config', 'tagdefinitions', 'resources-index', 'hypervideos-index', 'hypervideo', 'content-item', 'annotations-index', 'annotation-file']
    .map((name) => name + '.schema.json');

function schemaFiles(dir, rel = '') {
    if (!fs.existsSync(path.join(dir, rel))) { return []; }
    return fs.readdirSync(path.join(dir, rel)).sort().flatMap((name) => {
        const file = rel ? rel + '/' + name : name;
        if (fs.statSync(path.join(dir, file)).isDirectory()) { return schemaFiles(dir, file); }
        return name.endsWith('.schema.json') ? [file] : [];
    });
}

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// What a schema is about, in one sentence: an attribute schema's part before its standard part, as in docs/TYPES.md.
function summary(schema) {
    let text = schema.description || '';
    if (text.indexOf(STANDARD_PART) >= 0) { text = text.slice(0, text.indexOf(STANDARD_PART)); }
    const legacy = /^Legacy\.\s*/.exec(text);
    return legacy ? 'Legacy. ' + firstSentence(text.slice(legacy[0].length)) : firstSentence(text);
}

const schemaLink = (file) => '<a href="' + escape(file) + '"><code>' + escape(file) + '</code></a>';

function schemaTable(schemas, files) {
    return '        <table class="vocab-table">\n'
        + '            <thead><tr><th>Schema</th><th>Describes</th></tr></thead>\n'
        + '            <tbody>\n'
        + files.map((file) => '                <tr><td class="term-name">' + schemaLink(file) + '</td><td>' + escape(summary(schemas[file])) + '</td></tr>\n').join('')
        + '            </tbody>\n'
        + '        </table>\n';
}

function typeTable(schemas, files) {
    return '        <table class="vocab-table">\n'
        + '            <thead><tr><th>Type</th><th>What it is</th></tr></thead>\n'
        + '            <tbody>\n'
        + files.map((file) => '                <tr><td class="term-name"><a href="' + escape(file) + '"><code>' + escape(path.posix.basename(file, '.schema.json')) + '</code></a></td><td>' + escape(summary(schemas[file])) + '</td></tr>\n').join('')
        + '            </tbody>\n'
        + '        </table>\n';
}

/**
 * The index page of the published schemas.
 * @param {Object} schemas  parsed schemas by path below schemas/
 * @return {String}
 */
export function indexPage(schemas) {

    const files      = Object.keys(schemas).sort(),
          attributes = files.filter((file) => file.indexOf('attributes/') === 0),
          bundles    = files.filter((file) => /^[^/]+-bundle\.schema\.json$/.test(file)),
          shared     = files.filter((file) => file === 'common.schema.json'),
          rank       = (file) => (DATA_FILES.indexOf(file) >= 0 ? DATA_FILES.indexOf(file) : DATA_FILES.length),
          data       = files.filter((file) => [attributes, bundles, shared].every((group) => group.indexOf(file) < 0))
                            .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
          types      = attributes.filter((file) => !/^Legacy\./.test(schemas[file].description || ''))
                            .concat(attributes.filter((file) => /^Legacy\./.test(schemas[file].description || ''))),
          doc        = (file) => REPOSITORY + 'blob/main/' + file;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FrameTrail JSON Schemas — ${BASE}</title>
    <meta name="description" content="JSON Schemas for the files FrameTrail stores, the attributes of its item types and the bundles it exports: version 1 of the FrameTrail data format.">
    <link rel="canonical" href="${BASE}">
    <!-- Generated by scripts/publish-schemas.mjs in the FrameTrail repository. Do not edit: change the schemas there and publish them again. -->
    <style>
        /* ── Colors from FrameTrail (variables.css), as on /ns/ ── */

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            line-height: 1.65;
            color: #2F323A;
            background: #fff;
        }

        .page-header {
            background: #2F323A;
            color: #ddd;
            padding: 2.5rem 2rem 2rem;
        }
        .page-header h1 {
            font-size: 1.75rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: .35rem;
        }
        .page-header .subtitle {
            font-size: .95rem;
            color: #aaa;
        }
        .page-header .ns-uri {
            display: inline-block;
            margin-top: .75rem;
            padding: .35rem .75rem;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.15);
            font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
            font-size: .85rem;
            color: #D8D3AD;
            word-break: break-all;
        }

        .container {
            max-width: 52rem;
            margin: 0 auto;
            padding: 2.5rem 2rem 4rem;
        }

        section { margin-bottom: 3rem; }
        h2 {
            font-size: 1.3rem;
            font-weight: 700;
            margin-bottom: .75rem;
            padding-bottom: .35rem;
            border-bottom: 1px solid #ddd;
        }
        p { margin-bottom: 1rem; }
        a { color: #2F323A; text-decoration: underline; }
        a:hover { color: #000; }

        .vocab-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0 1.5rem;
            font-size: .9rem;
        }
        .vocab-table thead th {
            text-align: left;
            font-weight: 600;
            font-size: .75rem;
            text-transform: uppercase;
            letter-spacing: .05em;
            padding: .5rem .75rem;
            border-bottom: 2px solid #2F323A;
        }
        .vocab-table tbody td {
            padding: .6rem .75rem;
            border-bottom: 1px solid #eee;
            vertical-align: top;
        }
        .vocab-table tbody td:last-child { overflow-wrap: anywhere; }
        .term-name {
            font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
            font-size: .85rem;
            font-weight: 600;
            white-space: nowrap;
        }
        code {
            font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
            font-size: .85em;
            background: #f0f0f0;
            padding: .15em .35em;
        }
        .term-name code { background: none; padding: 0; font-size: inherit; }

        .page-footer {
            text-align: center;
            padding: 2rem;
            color: #999;
            font-size: .8rem;
            border-top: 1px solid #eee;
        }

        @media (max-width: 640px) {
            .page-header { padding: 1.5rem 1rem; }
            .container { padding: 1.5rem 1rem 3rem; }
            .vocab-table { font-size: .8rem; }
            .term-name { white-space: normal; }
            .vocab-table thead th,
            .vocab-table tbody td { padding: .4rem .5rem; }
        }
    </style>
</head>
<body>

<header class="page-header">
    <h1>FrameTrail JSON Schemas</h1>
    <div class="subtitle">Version 1 of the FrameTrail data format</div>
    <div class="ns-uri">${BASE}</div>
</header>

<main class="container">

    <section id="overview">
        <h2>Overview</h2>
        <p>
            JSON Schemas (draft 2020-12) for the files in a FrameTrail
            <code>_data</code> folder, for the attributes of each item type and
            for the bundles that carry a hypervideo or a whole project as one
            document. These are the schemas of the latest FrameTrail release;
            each one's URL is its <code>$id</code>.
        </p>
        <p>
            The schemas refer to each other by relative URLs, so a validator
            that is given all of them never fetches anything, and one that loads
            schemas by URL finds every reference here. The <code>1</code> is the
            version of the data format: additions that existing data does not
            need to change for keep it, a change to the meaning or shape of
            existing data gets a new number, and version 1 stays here.
        </p>
        <p>
            <a href="${doc('docs/DATA-MODEL.md')}">docs/DATA-MODEL.md</a>
            explains the files and how to validate them, also
            <a href="${doc('docs/DATA-MODEL.md#checking-files-in-an-editor')}">in an editor</a>;
            <a href="${doc('docs/TYPES.md')}">docs/TYPES.md</a> is the reference
            of the item types, made from the attribute schemas. The
            <code>frametrail:</code> terms in items are documented in the
            <a href="/ns/">FrameTrail vocabulary</a>. The source of these files is
            <a href="${REPOSITORY}tree/main/schemas">schemas/</a> in the FrameTrail
            repository.
        </p>
    </section>

    <section id="data-files">
        <h2>Files of a <code>_data</code> folder</h2>
${schemaTable(schemas, data)}    </section>

    <section id="bundles">
        <h2>Bundles</h2>
${schemaTable(schemas, bundles)}    </section>

    <section id="types">
        <h2>Item types</h2>
        <p>
            The <code>frametrail:attributes</code> of an overlay, annotation or
            code snippet, and the <code>attributes</code> of a library resource,
            by type. Each type's schema is
            <code>attributes/&lt;type&gt;.schema.json</code>.
        </p>
${typeTable(schemas, types)}    </section>

    <section id="shared">
        <h2>Shared definitions</h2>
${schemaTable(schemas, shared)}    </section>

</main>

<footer class="page-footer">
    <p>
        FrameTrail is open source, licensed under
        <a href="https://opensource.org/licenses/MIT">MIT</a>.
    </p>
</footer>

</body>
</html>
`;

}

function publish(sourceDir, outDir, remove) {

    const files   = schemaFiles(sourceDir),
          texts   = {},
          schemas = {};

    if (files.length === 0) { throw new Error('No schemas in ' + sourceDir); }

    for (const file of files) {
        texts[file]   = fs.readFileSync(path.join(sourceDir, file));
        schemas[file] = JSON.parse(texts[file].toString('utf8'));
        if (schemas[file].$id !== BASE + file) {
            throw new Error(file + ': its $id is ' + JSON.stringify(schemas[file].$id) + ', published it would be ' + BASE + file);
        }
    }

    let written = 0;
    for (const file of files) {
        const target = path.join(outDir, file);
        if (fs.existsSync(target) && fs.readFileSync(target).equals(texts[file])) { continue; }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, texts[file]);
        written++;
    }
    fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(schemas));
    console.log('Published ' + files.length + ' schemas to ' + outDir + ' (' + written + ' changed) and wrote index.html');

    const gone = schemaFiles(outDir).filter((file) => files.indexOf(file) < 0);
    if (gone.length === 0) { return; }
    if (remove) {
        for (const file of gone) { fs.unlinkSync(path.join(outDir, file)); }
        console.log('Removed ' + gone.join(', '));
    } else {
        console.log('Still published, no longer in ' + sourceDir + ' (run again with --remove to delete them, which breaks their URLs):\n  ' + gone.join('\n  '));
    }

}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {

    const args    = process.argv.slice(2),
          remove  = args.indexOf('--remove') >= 0,
          at      = args.indexOf('--schemas'),
          source  = (at >= 0) ? path.resolve(args[at + 1] || '') : SCHEMAS_DIR,
          rest    = args.filter((arg, i) => arg !== '--remove' && (at < 0 || (i !== at && i !== at + 1)));

    if (rest.length !== 1 || rest[0].indexOf('--') === 0 || (at >= 0 && !args[at + 1])) {
        console.error('Usage: node scripts/publish-schemas.mjs [--schemas <dir>] [--remove] <outDir>');
        process.exit(1);
    }

    try {
        publish(source, path.resolve(rest[0]), remove);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

}
