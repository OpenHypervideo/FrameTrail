/*
 * FrameTrail's tests: the fixtures in tests/fixtures/ against the JSON Schemas
 * in schemas/ (with FrameTrailSchema) and through FrameTrailSerializer, plus
 * unit tests of FrameTrailSchema, FrameTrailSerializer, FrameTrailHTMLFormat
 * and FrameTrailKeyframes.
 * No dependencies, Node 20 or later:
 *
 *     node tests/run-js.mjs
 *     node tests/run-js.mjs --data=path/to/_data   # also check a _data folder of your own
 *
 * tests/README.md describes the fixtures and the rules a runner in another
 * language applies to them.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extractExamples, serialize, FIXTURES_DIR as EXAMPLE_FIXTURES } from './extract-examples.mjs';
import { bundleSchemas, OUTPUT as SCHEMA_BUNDLE } from '../scripts/bundle-schemas.mjs';

const require  = createRequire(import.meta.url);
const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

const Schema     = require('../src/_shared/frametrail-core/schema/FrameTrailSchema.js');
const Serializer = require('../src/_shared/frametrail-core/serialization/FrameTrailSerializer.js');
const Keyframes  = require('../src/_shared/frametrail-core/serialization/FrameTrailKeyframes.js');
const HTMLFormat = require('../src/_shared/frametrail-core/serialization/FrameTrailHTMLFormat.js');

const NOW = 1999999999999;

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone    = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);


/* ---------------------------------------------------------------------- */
/*  Schemas                                                               */
/* ---------------------------------------------------------------------- */

function schemaFiles(dir = path.join(ROOT, 'schemas'), rel = '') {
    return fs.readdirSync(path.join(dir, rel)).sort().flatMap((name) => {
        const file = rel ? rel + '/' + name : name;
        if (fs.statSync(path.join(dir, file)).isDirectory()) { return schemaFiles(dir, file); }
        return name.endsWith('.schema.json') ? [file] : [];
    });
}

const SCHEMA_FILES = schemaFiles();

// Throws when a schema uses a keyword outside the subset or a $ref that resolves to nothing.
const validator = Schema.create(SCHEMA_FILES.map((file) => readJSON(path.join(ROOT, 'schemas', file))));

// The schema of a file in a _data folder, by its path relative to the folder.
function schemaOfDataFile(rel) {
    if (rel === 'config.json') { return 'config.schema.json'; }
    if (rel === 'tagdefinitions.json') { return 'tagdefinitions.schema.json'; }
    if (rel === 'resources/_index.json') { return 'resources-index.schema.json'; }
    if (rel === 'hypervideos/_index.json') { return 'hypervideos-index.schema.json'; }
    if (/^hypervideos\/[^/]+\/hypervideo\.json$/.test(rel)) { return 'hypervideo.schema.json'; }
    if (/^hypervideos\/[^/]+\/annotations\/_index\.json$/.test(rel)) { return 'annotations-index.schema.json'; }
    if (/^hypervideos\/[^/]+\/annotations\/[^/]+\.json$/.test(rel)) { return 'annotation-file.schema.json'; }
    return null;
}

function formatErrors(errors, indent = '    ') {
    return errors.map((e) => indent + (e.path || '(document)') + ': ' + e.message).join('\n');
}

const byPathAndMessage = (a, b) => (a.path + '\u0000' + a.message).localeCompare(b.path + '\u0000' + b.message);


/* ---------------------------------------------------------------------- */
/*  Round trips                                                           */
/* ---------------------------------------------------------------------- */

/*
 * What serialize(parse(x)) has to give for a stored document x. Only these
 * parts may differ from x, everything else is kept as stored, key order
 * included (a key x lacks is added at the end of its object):
 *
 * - an item's @context is the current context;
 * - an item's created is the ISO 8601 form of the stored value, made unique
 *   within its group by moving a value already taken (a missing one counts
 *   as 0) on by 1 ms, in order. Groups: a hypervideo's overlays, its code
 *   snippets; an annotation file's annotations per creator id;
 * - hypervideo.json: meta.lastchanged is the time of the save, and contents
 *   lists the overlays, then the code snippets, then items of any other
 *   frametrail:type, each in stored order.
 */
function normalizedItems(items, groupOf) {

    const taken = {};

    return items.map((stored) => {
        const item  = clone(stored),
              group = groupOf ? String(groupOf(item)) : '',
              used  = taken[group] || (taken[group] = new Set());
        let ms = (item.created == null || item.created === '') ? NaN : new Date(item.created).getTime();
        if (!isFinite(ms)) { ms = 0; }
        while (used.has(ms)) { ms += 1; }
        used.add(ms);
        item['@context'] = clone(Serializer.CONTEXT);
        item.created = new Date(ms).toISOString();
        return item;
    });

}

function expectedHypervideo(stored, now) {

    const expected = clone(stored),
          contents = Array.isArray(stored.contents) ? stored.contents : [],
          ofType   = (type) => contents.filter((item) => isObject(item) && item['frametrail:type'] === type);

    if (isObject(expected.meta)) { expected.meta.lastchanged = now; }

    expected.contents = normalizedItems(ofType('Overlay'))
        .concat(normalizedItems(ofType('CodeSnippet')))
        .concat(clone(contents.filter((item) => !isObject(item) || ['Overlay', 'CodeSnippet'].indexOf(item['frametrail:type']) < 0)));

    return expected;

}

function expectedAnnotationFile(stored) {
    return normalizedItems(stored, (item) => (isObject(item.creator) ? item.creator.id : undefined));
}

function expectedItem(stored) {
    const item = clone(stored),
          ms   = new Date(item.created).getTime();
    item['@context'] = clone(Serializer.CONTEXT);
    if (isFinite(ms)) { item.created = new Date(ms).toISOString(); }
    return item;
}

// Where two JSON values differ, as readable lines (at most `limit`).
function differences(expected, actual, limit = 8) {

    const lines = [];

    (function walk(a, b, where) {
        if (lines.length >= limit || JSON.stringify(a) === JSON.stringify(b)) { return; }
        if (isObject(a) && isObject(b)) {
            const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
            keys.forEach((key) => walk(a[key], b[key], where + '/' + key));
            if (!lines.length && Object.keys(a).join('\u0000') !== Object.keys(b).join('\u0000')) {
                lines.push((where || '(document)') + ': key order ' + JSON.stringify(Object.keys(b)) + ', expected ' + JSON.stringify(Object.keys(a)));
            }
            return;
        }
        if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
            a.forEach((item, i) => walk(item, b[i], where + '/' + i));
            return;
        }
        const show = (value) => (value === undefined ? '(missing)' : JSON.stringify(value).slice(0, 100));
        lines.push((where || '(document)') + ': ' + show(b) + ', expected ' + show(a));
    })(expected, actual, '');

    return lines;

}

// A failure message for a document that is not what was expected, or null.
function mismatch(expected, actual, what) {
    if (JSON.stringify(expected) === JSON.stringify(actual)) { return null; }
    return what + '\n' + differences(expected, actual).map((line) => '    ' + line).join('\n');
}

function roundTripHypervideo(stored) {

    const problems = [],
          model    = Serializer.parseHypervideo(stored),
          written  = Serializer.serializeHypervideo(model, { now: NOW });

    problems.push(mismatch(expectedHypervideo(stored, NOW), written, 'serialize(parse(x)) differs from x:'));
    problems.push(mismatch(written, Serializer.serializeHypervideo(Serializer.parseHypervideo(written), { now: NOW }), 'a second round changes it:'));

    const invalid  = validator.validate('hypervideo.schema.json', written),
          exported = Serializer.serializeHypervideo(model, { now: NOW, purpose: 'export', sourcePath: 'video.mp4', subtitles: {} }),
          invalidExport = validator.validate('hypervideo.schema.json', exported);
    if (invalid.length) { problems.push('the written hypervideo is invalid:\n' + formatErrors(invalid)); }
    if (invalidExport.length) { problems.push('the exported hypervideo is invalid:\n' + formatErrors(invalidExport)); }

    return problems.filter(Boolean);

}

function roundTripAnnotationFile(stored) {

    const problems = [],
          written  = Serializer.serializeAnnotationFile(Serializer.parseAnnotationFile(stored), {});

    problems.push(mismatch(expectedAnnotationFile(stored), written, 'serialize(parse(x)) differs from x:'));
    problems.push(mismatch(written, Serializer.serializeAnnotationFile(Serializer.parseAnnotationFile(written), {}), 'a second round changes it:'));

    const invalid = validator.validate('annotation-file.schema.json', written);
    if (invalid.length) { problems.push('the written annotation file is invalid:\n' + formatErrors(invalid)); }

    return problems.filter(Boolean);

}

function roundTripItem(stored) {

    const overlay = stored['frametrail:type'] === 'Overlay',
          parse   = overlay ? Serializer.parseOverlay : Serializer.parseCodeSnippet,
          write   = overlay ? Serializer.serializeOverlay : Serializer.serializeCodeSnippet,
          written = write(parse(stored), {});

    return [
        mismatch(expectedItem(stored), written, 'serialize(parse(x)) differs from x:'),
        mismatch(written, write(parse(written), {}), 'a second round changes it:')
    ].filter(Boolean);

}

// The round trip a valid document of a schema goes through, if any.
const ROUND_TRIPS = {
    'hypervideo.schema.json':      roundTripHypervideo,
    'annotation-file.schema.json': roundTripAnnotationFile,
    'content-item.schema.json':    roundTripItem
};


/* ---------------------------------------------------------------------- */
/*  _data folders                                                         */
/* ---------------------------------------------------------------------- */

// The files of a _data folder the tests read: JSON, subtitles and CSS. Not
// users.json, nothing below a folder or file whose name starts with a dot,
// and of resources/ only the index.
function readDataFolder(dir) {

    const files = {};

    (function walk(rel) {
        for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
            const file = rel ? rel + '/' + name : name;
            if (name.startsWith('.') || file === 'users.json') { continue; }
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                if (file === 'resources') {
                    if (fs.existsSync(path.join(dir, 'resources/_index.json'))) { files['resources/_index.json'] = readJSON(path.join(dir, 'resources/_index.json')); }
                } else {
                    walk(file);
                }
            } else if (name.endsWith('.json')) {
                files[file] = readJSON(path.join(dir, file));
            } else if (/\.(vtt|css)$/.test(name)) {
                files[file] = fs.readFileSync(path.join(dir, file), 'utf8');
            }
        }
    })('');

    return files;

}

function checkDataFolder(label, dir) {

    describe(label, () => {

        const files = readDataFolder(dir),
              names = Object.keys(files);

        // Problems per JSON file: no schema, or the schema's errors.
        const problems = {};
        for (const file of names.filter((name) => name.endsWith('.json'))) {
            const schema = schemaOfDataFile(file),
                  errors = schema ? validator.validate(schema, files[file]) : [];
            if (!schema) { problems[file] = file + ': no schema for this file'; }
            else if (errors.length) { problems[file] = file + ' (' + schema + ')\n' + formatErrors(errors); }
        }
        const invalid = Object.keys(problems);

        test('every file follows its schema', () => {
            assert.ok(names.some((name) => name.endsWith('hypervideo.json')), 'no hypervideo.json in ' + dir);
            if (invalid.length) { assert.fail(invalid.length + ' file(s) do not follow their schema:\n' + Object.values(problems).join('\n')); }
        });

        test('hypervideos and annotation files round-trip through the serializer', () => {
            const failures = [];
            for (const file of names) {
                const schema = schemaOfDataFile(file);
                if (invalid.indexOf(file) >= 0 || (schema !== 'hypervideo.schema.json' && schema !== 'annotation-file.schema.json')) { continue; }
                ROUND_TRIPS[schema](files[file]).forEach((problem) => failures.push(file + ': ' + problem));
            }
            if (failures.length) { assert.fail(failures.join('\n')); }
        });

        test('read as bundles, they follow the bundle schemas and survive writing', (t) => {
            if (invalid.length) { t.skip('the folder has invalid files'); return; }
            const project = Serializer.readBundle(files, 'folder'),
                  errors  = validator.validate('project-bundle.schema.json', project);
            assert.ok(!errors.length, 'project bundle:\n' + formatErrors(errors));
            assert.deepStrictEqual(Serializer.readBundle(Serializer.writeBundle(project, 'folder'), 'folder'), project);
            assert.deepStrictEqual(Serializer.readBundle(Serializer.writeBundle(project, 'html'), 'html'), project);
            for (const id of Object.keys(project.hypervideos)) {
                const bundle = Serializer.readBundle(files, 'folder', { bundle: 'hypervideo', id }),
                      bundleErrors = validator.validate('hypervideo-bundle.schema.json', bundle);
                assert.ok(!bundleErrors.length, 'hypervideo bundle ' + id + ':\n' + formatErrors(bundleErrors));
                assert.deepStrictEqual(Serializer.readBundle(Serializer.writeBundle(bundle, 'folder'), 'folder', { bundle: 'hypervideo', id }), bundle);
                assert.deepStrictEqual(Serializer.readBundle(Serializer.writeBundle(bundle, 'html'), 'html'), bundle);
            }
        });

        test('as a project page, they are edited in place: only the data block changes', (t) => {
            if (invalid.length) { t.skip('the folder has invalid files'); return; }
            const page    = Serializer.writeBundle(Serializer.readBundle(files, 'folder'), 'html', { library: { css: '/* css */', js: '/* js */' }, datapath: './' }),
                  project = HTMLFormat.readProject(page);
            assert.equal(HTMLFormat.writeProject(project.files, page), page);
            project.files['tagdefinitions.json'] = Object.assign({}, project.files['tagdefinitions.json'], { added: { en: { label: 'Added', description: '' } } });
            const edited = HTMLFormat.writeProject(project.files, page),
                  start  = page.indexOf('<script type="application/ld+json"'),
                  end    = page.indexOf('</script>', start);
            assert.equal(edited.slice(0, start), page.slice(0, start));
            assert.equal(edited.slice(edited.indexOf('</script>', start)), page.slice(end));
            const bundle = HTMLFormat.parse(edited)[0].bundle,
                  errors = validator.validate('project-bundle.schema.json', bundle);
            assert.ok(!errors.length, formatErrors(errors));
            assert.equal(bundle.tagdefinitions.added.en.label, 'Added');
        });

    });

}

describe('fixtures/data', () => {
    for (const name of fs.readdirSync(path.join(FIXTURES, 'data')).sort()) {
        if (!name.startsWith('.')) { checkDataFolder(name, path.join(FIXTURES, 'data', name)); }
    }
});

const extraData = process.argv.filter((arg) => arg.startsWith('--data=')).map((arg) => path.resolve(arg.slice('--data='.length)));
if (extraData.length) {
    describe('--data', () => {
        extraData.forEach((dir) => checkDataFolder(path.relative(process.cwd(), dir) || dir, dir));
    });
}


/* ---------------------------------------------------------------------- */
/*  Cases: examples/ and cases/                                           */
/* ---------------------------------------------------------------------- */

// A case file: { description, cases: [{ name, schema, data, errors? }] }.
// Without errors a case is valid; valid hypervideos, annotation files and
// content items also round-trip.
function checkCaseFile(label, file) {

    const fixture = readJSON(file);

    describe(label, () => {
        for (const c of fixture.cases) {
            test(c.name, () => {
                const actual   = validator.validate(c.schema, c.data).slice().sort(byPathAndMessage),
                      expected = (c.errors || []).slice().sort(byPathAndMessage);
                assert.deepStrictEqual(actual, expected, expected.length
                    ? 'other errors than expected:\n' + formatErrors(actual)
                    : c.schema + ' rejects it:\n' + formatErrors(actual));
                if (!expected.length && ROUND_TRIPS[c.schema]) {
                    const problems = ROUND_TRIPS[c.schema](c.data);
                    if (problems.length) { assert.fail(problems.join('\n')); }
                }
            });
        }
    });

}

describe('fixtures/examples', () => {

    test('match the data in examples/*.html', () => {
        const extracted = extractExamples(),
              stored    = fs.readdirSync(EXAMPLE_FIXTURES).filter((name) => name.endsWith('.json')).sort(),
              stale     = stored.filter((name) => !extracted[name] || fs.readFileSync(path.join(EXAMPLE_FIXTURES, name), 'utf8') !== serialize(extracted[name])),
              missing   = Object.keys(extracted).filter((name) => stored.indexOf(name) < 0);
        assert.ok(!stale.length && !missing.length,
            'tests/fixtures/examples/ is out of date (' + stale.concat(missing).join(', ') + '): run node tests/extract-examples.mjs');
    });

    for (const name of fs.readdirSync(EXAMPLE_FIXTURES).filter((name) => name.endsWith('.json')).sort()) {
        checkCaseFile(name, path.join(EXAMPLE_FIXTURES, name));
    }

});

describe('fixtures/cases', () => {
    for (const name of fs.readdirSync(path.join(FIXTURES, 'cases')).filter((name) => name.endsWith('.json')).sort()) {
        checkCaseFile(name, path.join(FIXTURES, 'cases', name));
    }
});


/* ---------------------------------------------------------------------- */
/*  FrameTrailSchema                                                      */
/* ---------------------------------------------------------------------- */

describe('FrameTrailSchema', () => {

    const BASE = 'https://example.org/schemas/';
    const make = (...schemas) => Schema.create(schemas, { base: BASE });
    const one  = (schema) => make(Object.assign({ $id: BASE + 'test.schema.json' }, schema));
    const check = (schema, data) => one(schema).validate('test.schema.json', data);

    test('every schema in schemas/ is named after its $id', () => {
        for (const file of SCHEMA_FILES) {
            assert.equal(readJSON(path.join(ROOT, 'schemas', file)).$id, Schema.BASE + file);
        }
    });

    test('the copy the player loads is up to date and judges the cases alike', () => {
        assert.ok(fs.readFileSync(SCHEMA_BUNDLE, 'utf8') === bundleSchemas(),
            path.relative(ROOT, SCHEMA_BUNDLE) + ' is out of date: run node scripts/bundle-schemas.mjs');
        const bundled = Schema.create(require(SCHEMA_BUNDLE));
        for (const dir of [path.join(FIXTURES, 'cases'), EXAMPLE_FIXTURES]) {
            for (const name of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
                for (const c of readJSON(path.join(dir, name)).cases) {
                    assert.deepStrictEqual(bundled.validate(c.schema, c.data), validator.validate(c.schema, c.data), name + ': ' + c.name);
                }
            }
        }
    });

    test('type: a name or a list; integer is a number without a fraction', () => {
        assert.deepStrictEqual(check({ type: 'string' }, 'x'), []);
        assert.deepStrictEqual(check({ type: 'string' }, 5), [{ path: '', message: 'must be string, is number' }]);
        assert.deepStrictEqual(check({ type: ['string', 'null'] }, null), []);
        assert.deepStrictEqual(check({ type: ['string', 'integer', 'null'] }, []), [{ path: '', message: 'must be string, integer or null, is array' }]);
        assert.deepStrictEqual(check({ type: 'integer' }, 3), []);
        assert.deepStrictEqual(check({ type: 'integer' }, 3.5), [{ path: '', message: 'must be integer, is number' }]);
        assert.deepStrictEqual(check({ type: 'number' }, 3), []);
        assert.deepStrictEqual(check({ type: 'object' }, []), [{ path: '', message: 'must be object, is array' }]);
    });

    test('const and enum compare as JSON: [] is not {}, key order does not matter', () => {
        assert.deepStrictEqual(check({ const: [] }, []), []);
        assert.deepStrictEqual(check({ const: [] }, {}), [{ path: '', message: 'must be []' }]);
        assert.deepStrictEqual(check({ enum: [{ a: 1, b: 2 }] }, { b: 2, a: 1 }), []);
        assert.deepStrictEqual(check({ enum: ['a', null] }, 'b'), [{ path: '', message: 'must be one of "a", null' }]);
    });

    test('bounds, lengths and patterns', () => {
        assert.deepStrictEqual(check({ minimum: 0, maximum: 1 }, 0), []);
        assert.deepStrictEqual(check({ minimum: 0, maximum: 1 }, 1.5), [{ path: '', message: 'must be <= 1' }]);
        assert.deepStrictEqual(check({ minItems: 1, maxItems: 2 }, []), [{ path: '', message: 'must have at least 1 item' }]);
        assert.deepStrictEqual(check({ minItems: 1, maxItems: 2 }, [1, 2, 3]), [{ path: '', message: 'must have at most 2 items' }]);
        assert.deepStrictEqual(check({ pattern: 'b' }, 'abc'), [], 'a pattern needs a match, not a full match');
        assert.deepStrictEqual(check({ pattern: '^b$' }, 'abc'), [{ path: '', message: 'must match the pattern ^b$' }]);
        assert.deepStrictEqual(check({ pattern: '^.$' }, '😀'), [], 'patterns are Unicode-aware');
        assert.deepStrictEqual(check({ minimum: 0, pattern: '^a' }, true), [], 'keywords for other types do not apply');
    });

    test('objects: required, properties, additionalProperties; paths are JSON Pointers', () => {
        const schema = { type: 'object', required: ['a', 'b/c'], properties: { a: { type: 'string' } }, additionalProperties: { type: 'number' } };
        assert.deepStrictEqual(check(schema, { a: 'x', 'b/c': 1, 'd~e': 2 }), []);
        assert.deepStrictEqual(check(schema, { a: 1, 'd~e': 'x' }).sort(byPathAndMessage), [
            { path: '/a', message: 'must be string, is number' },
            { path: '/b~1c', message: 'is required' },
            { path: '/d~0e', message: 'must be number, is string' }
        ]);
        assert.deepStrictEqual(check({ properties: { a: {} }, additionalProperties: false }, { a: 1, b: 2 }), [{ path: '/b', message: 'is not allowed' }]);
        assert.deepStrictEqual(check({ required: ['a'] }, { a: undefined }), [{ path: '/a', message: 'is required' }], 'undefined is no value');
    });

    test('arrays: items', () => {
        assert.deepStrictEqual(check({ items: { type: 'integer' } }, [1, 'x', 3, null]), [
            { path: '/1', message: 'must be integer, is string' },
            { path: '/3', message: 'must be integer, is null' }
        ]);
    });

    test('oneOf: exactly one alternative', () => {
        const schema = { oneOf: [{ type: 'string' }, { type: 'number', minimum: 10 }] };
        assert.deepStrictEqual(check(schema, 'x'), []);
        assert.deepStrictEqual(check(schema, 20), []);
        assert.deepStrictEqual(check({ oneOf: [{ type: 'string' }, { minimum: 10 }] }, 'x'), [{ path: '', message: 'must match exactly one of the alternatives, matches 2' }],
            'minimum does not apply to a string, so both match');
    });

    test('oneOf: a required const property picks the alternative', () => {
        const schema = {
            oneOf: [
                { type: 'object', required: ['kind'], properties: { kind: { const: 'circle' }, r: { type: 'number' } } },
                { type: 'object', required: ['kind'], properties: { kind: { const: 'box' }, w: { type: 'number' } } }
            ]
        };
        assert.deepStrictEqual(check(schema, { kind: 'box', w: 'wide' }), [{ path: '/w', message: 'must be number, is string' }]);
        assert.deepStrictEqual(check(schema, { kind: 'star' }), [{ path: '/kind', message: 'must be one of "circle", "box"' }]);
        assert.deepStrictEqual(check(schema, { r: 1 }), [{ path: '/kind', message: 'is required' }]);
        assert.deepStrictEqual(check(schema, 'circle'), [{ path: '', message: 'must be object, is string' }]);
    });

    test('oneOf: a const that is the same in every alternative does not pick one', () => {
        const schema = {
            oneOf: [
                { type: 'object', required: ['type', 'kind'], properties: { type: { const: 'Shape' }, kind: { const: 'circle' } } },
                { type: 'object', required: ['type', 'kind'], properties: { type: { const: 'Shape' }, kind: { const: 'box' } } }
            ]
        };
        assert.deepStrictEqual(check(schema, { type: 'Shape', kind: 'star' }), [{ path: '/kind', message: 'must be one of "circle", "box"' }]);
    });

    test('oneOf without such a property: the alternatives whose type fits, the one with the fewest errors', () => {
        const emptyList = { description: "PHP's empty object", const: [] };
        const attributes = { oneOf: [{ type: 'object', properties: { size: { type: 'number' }, color: { type: 'string' } } }, emptyList] };
        assert.deepStrictEqual(check(attributes, []), []);
        assert.deepStrictEqual(check(attributes, { size: 'big' }), [{ path: '/size', message: 'must be number, is string' }]);
        assert.deepStrictEqual(check(attributes, [1]), [{ path: '', message: 'must be object, is array' }]);
        const created = { oneOf: [{ type: 'string', pattern: '^[0-9]{4}-' }, { type: 'string', pattern: '^[A-Z][a-z]{2} ' }] };
        assert.deepStrictEqual(check(created, 'yesterday'), [{ path: '', message: 'must match the pattern ^[0-9]{4}-' }], 'a tie goes to the first');
        assert.deepStrictEqual(check(created, 5), [{ path: '', message: 'must be string, is number' }]);
        const shapes = { oneOf: [{ type: 'object', required: ['a', 'b', 'c'] }, { type: 'object', required: ['x'] }] };
        assert.deepStrictEqual(check(shapes, { a: 1 }), [{ path: '/x', message: 'is required' }]);
    });

    test('$ref: in the same document, to another document, relative to the referring $id', () => {
        const validator = make(
            { $id: BASE + 'main.schema.json', $defs: { 'a/b': { type: 'string' } }, properties: {
                local:  { $ref: '#/$defs/a~1b' },
                shared: { $ref: 'common.schema.json#/$defs/count' },
                nested: { $ref: 'sub/thing.schema.json' }
            } },
            { $id: BASE + 'common.schema.json', $defs: { count: { type: 'integer', minimum: 0 } } },
            { $id: BASE + 'sub/thing.schema.json', properties: { n: { $ref: '../common.schema.json#/$defs/count' } } }
        );
        assert.deepStrictEqual(validator.validate('main.schema.json', { local: 'x', shared: 1, nested: { n: 2 } }), []);
        assert.deepStrictEqual(validator.validate('main.schema.json', { local: 1, shared: -1, nested: { n: 'x' } }), [
            { path: '/local', message: 'must be string, is number' },
            { path: '/shared', message: 'must be >= 0' },
            { path: '/nested/n', message: 'must be integer, is string' }
        ]);
        assert.deepStrictEqual(validator.validate('common.schema.json#/$defs/count', -1), [{ path: '', message: 'must be >= 0' }]);
        assert.deepStrictEqual(validator.validate(BASE + 'sub/thing.schema.json', { n: 1 }), [], 'an absolute $id works too');
        assert.equal(validator.has('sub/thing.schema.json'), true);
        assert.equal(validator.has('nothing.schema.json'), false);
        assert.throws(() => validator.validate('nothing.schema.json', {}), /Cannot resolve/);
    });

    test('schemas outside the subset are refused', () => {
        const id = BASE + 'bad.schema.json';
        assert.throws(() => make({ $id: id, anyOf: [{}] }), /Unsupported keyword "anyOf"/);
        assert.throws(() => make({ $id: id, properties: { a: { format: 'date' } } }), /Unsupported keyword "format" at .*#\/properties\/a/);
        assert.throws(() => make({ $id: id, $ref: 'other.schema.json' }), /Cannot resolve "other.schema.json"/);
        assert.throws(() => make({ $id: id, $ref: '#/$defs/missing' }), /Cannot resolve/);
        assert.throws(() => make({ $id: id, type: 'date' }), /Invalid type/);
        assert.throws(() => make({ $id: id, pattern: '(' }), /Invalid pattern/);
        assert.throws(() => make({ $id: id, required: 'a' }), /"required" must be a list/);
        assert.throws(() => make({ $id: id }, { $id: id }), /Two schemas/);
        assert.throws(() => make({ type: 'object' }), /absolute \$id/);
    });

});


/* ---------------------------------------------------------------------- */
/*  FrameTrailSerializer                                                  */
/* ---------------------------------------------------------------------- */

describe('FrameTrailSerializer', () => {

    const legacyContext   = ['http://www.w3.org/ns/anno.jsonld', { frametrail: 'http://frametrail.org/ns/' }];
    const toStringCreated = 'Mon Jul 06 2026 09:36:45 GMT+0200 (Central European Summer Time)';
    const isoPattern      = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

    function overlayItem(created, extra) {
        return Object.assign({
            '@context': legacyContext,
            creator: { nickname: 'demo', type: 'Person', id: '1' },
            created: created, type: 'Annotation', 'frametrail:type': 'Overlay', 'frametrail:tags': [],
            target: { type: 'Video', source: 'video.mp4', selector: { conformsTo: 'http://www.w3.org/TR/media-frags/', type: 'FragmentSelector', value: 't=2,8&xywh=percent:10,20,30,40' } },
            body: { type: 'TextualBody', 'frametrail:type': 'text', format: 'text/html', value: '', 'frametrail:name': 'Hello', 'frametrail:thumb': null,
                    'frametrail:licenseType': null, 'frametrail:licenseAttribution': null, 'frametrail:attributes': { text: '&lt;p&gt;Hi&lt;/p&gt;', custom: 42 } },
            'frametrail:events': {}
        }, extra || {});
    }

    function hypervideo(contents) {
        return {
            meta: { name: 'HV', description: '', thumb: null, creator: 'demo', creatorId: '1', created: 1700000000000, lastchanged: 1700000000001, extraMeta: { keep: true } },
            config: { slidingMode: 'adjust', slidingTrigger: 'key', autohideControls: false, captionsVisible: false, clipTimeVisible: false, theme: '', unknownConfig: 'x',
                      layoutArea: { areaTop: [], areaBottom: [], areaLeft: [], areaRight: [{ type: 'Transcript', name: 'Transcript', transcriptSource: 'en', contentSize: 'large' }] } },
            clips: [{ resourceId: null, src: 'video.mp4', duration: 60, in: 0, out: 0 }],
            globalEvents: [], customCSS: '', contents: contents, chapters: [{ start: 3, title: 'One' }], subtitles: [{ src: 'en.vtt', srclang: 'en' }]
        };
    }

    test('generator on an overlay survives round-trip and an edit', () => {
        const generator = { type: 'Software', name: 'Some Tool', model: 'x' };
        const model = Serializer.parseHypervideo(hypervideo([overlayItem(toStringCreated, { generator })]));
        let out = Serializer.serializeHypervideo(model, { now: 5 });
        assert.deepStrictEqual(out.contents[0].generator, generator);
        model.overlays[0].start = 4;
        model.overlays[0].attributes.text = 'changed';
        out = Serializer.serializeHypervideo(model, { now: 6 });
        assert.deepStrictEqual(out.contents[0].generator, generator);
        assert.equal(out.contents[0].target.selector.value, 't=4,8&xywh=percent:10,20,30,40');
        assert.equal(out.contents[0].body['frametrail:attributes'].custom, 42);
        assert.equal(out.contents[0].body['frametrail:attributes'].text, 'changed');
    });

    test('generator on an annotation survives round-trip and an edit', () => {
        const generator = 'https://example.org/tool';
        const stored = [{ '@context': legacyContext, creator: { nickname: 'demo', type: 'Person', id: '1' }, created: toStringCreated, type: 'Annotation',
            'frametrail:type': 'Annotation', 'frametrail:tags': [], generator,
            target: { type: 'Video', source: 'v.mp4', selector: { conformsTo: 'http://www.w3.org/TR/media-frags/', type: 'FragmentSelector', value: 't=1,2' } },
            body: { 'frametrail:type': 'audio', source: 'a.mp3', 'frametrail:name': 'Audio', 'frametrail:resourceId': '3', 'frametrail:attributes': {} } }];
        const items = Serializer.parseAnnotationFile(stored);
        let out = Serializer.serializeAnnotationFile(items, {});
        assert.equal(out[0].generator, generator);
        assert.equal(out[0].body.type, undefined, 'an unchanged body keeps its shape');
        items[0].end = 5;
        out = Serializer.serializeAnnotationFile(items, {});
        assert.equal(out[0].generator, generator);
        assert.equal(out[0].target.selector.value, 't=1,5');
        assert.deepStrictEqual(out[0]['@context'], Serializer.CONTEXT);
        assert.match(out[0].created, isoPattern);
    });

    test('unknown keys in meta and config survive round-trip and edits', () => {
        const model = Serializer.parseHypervideo(hypervideo([]));
        model.meta.name = 'Renamed';
        model.config.slidingMode = 'overlay';
        const out = Serializer.serializeHypervideo(model, { now: 7 });
        assert.deepStrictEqual(out.meta.extraMeta, { keep: true });
        assert.equal(out.config.unknownConfig, 'x');
        assert.equal(out.meta.name, 'Renamed');
        assert.equal(out.config.slidingMode, 'overlay');
        assert.equal(out.meta.lastchanged, 7);
    });

    test('overlays with the same second-precision created stay distinct and are written as ISO', () => {
        const model = Serializer.parseHypervideo(hypervideo([overlayItem(toStringCreated), overlayItem(toStringCreated), overlayItem(undefined)]));
        const created = model.overlays.map((o) => o.created);
        assert.equal(new Set(created).size, 3, 'distinct: ' + created);
        assert.equal(created[1] - created[0], 1);
        const out = Serializer.serializeHypervideo(model, { now: 1 });
        const iso = out.contents.map((item) => item.created);
        assert.ok(iso.every((value) => isoPattern.test(value)), iso.join(' '));
        assert.equal(new Set(iso).size, 3);
        assert.deepStrictEqual(Serializer.parseHypervideo(out).overlays.map((o) => o.created), created, 'reading the written file gives the same identities');
    });

    test('annotations: created is unique per creator, not across creators', () => {
        const annotation = (id) => ({ creator: { nickname: 'u' + id, id }, created: toStringCreated, 'frametrail:type': 'Annotation', target: { selector: { value: 't=1,2' } }, body: { 'frametrail:type': 'text', value: '' } });
        const items = Serializer.parseAnnotationFile([annotation('1'), annotation('2'), annotation('1')]);
        assert.equal(items[0].created, items[1].created);
        assert.equal(items[2].created, items[0].created + 1);
    });

    test('a Transcript view survives a save; an export turns it into CustomHTML', () => {
        const model = Serializer.parseHypervideo(hypervideo([]));
        const saved = Serializer.serializeHypervideo(model, { now: 1, purpose: 'save' });
        assert.equal(saved.config.layoutArea.areaRight[0].type, 'Transcript');
        const subtitles = { en: { label: 'English', cues: [{ startTime: 1, endTime: 2, text: 'Hello <world>' }] } };
        const view = Serializer.serializeHypervideo(model, { now: 1, purpose: 'export', subtitles }).config.layoutArea.areaRight[0];
        assert.equal(view.type, 'CustomHTML');
        assert.equal(view.html, '<span class="timebased" data-start="1" data-end="2">Hello &lt;world&gt; </span>');
        assert.equal(view.contentSize, 'large');
        assert.equal(model.layout.areaRight[0].type, 'Transcript', 'the model is not changed by an export');
    });

    test('removing the rotation and adding keyframes rewrite the selector', () => {
        const stored = hypervideo([overlayItem('2026-10-06T09:36:45.127Z')]);
        stored.contents[0].target.selector['frametrail:rotation'] = 30;
        const model = Serializer.parseHypervideo(stored);
        assert.equal(model.overlays[0].rotation, 30);
        model.overlays[0].rotation = undefined;
        let out = Serializer.serializeHypervideo(model, { now: 1 });
        assert.ok(!('frametrail:rotation' in out.contents[0].target.selector));
        model.overlays[0].keyframes = [{ t: 2, xywh: [0, 0, 10, 10] }, { t: 8, xywh: [50, 50, 10, 10], r: 45 }];
        out = Serializer.serializeHypervideo(model, { now: 1 });
        const selector = out.contents[0].target.selector;
        assert.equal(selector.value, 't=2,8&xywh=percent:0,0,60,60');
        assert.equal(selector['frametrail:keyframes'].length, 2);
        assert.equal(out.contents[0].created, '2026-10-06T09:36:45.127Z');
    });

    test("PHP's [] for {} is read as an object and kept while unchanged", () => {
        const stored = hypervideo([overlayItem(toStringCreated)]);
        stored.contents[0].body['frametrail:attributes'] = [];
        stored.contents[0]['frametrail:events'] = [];
        const model = Serializer.parseHypervideo(stored);
        assert.deepStrictEqual(model.overlays[0].attributes, {});
        assert.deepStrictEqual(model.overlays[0].events, {});
        assert.deepStrictEqual(model.globalEvents, {});
        let out = Serializer.serializeHypervideo(model, { now: 1 });
        assert.deepStrictEqual(out.contents[0].body['frametrail:attributes'], []);
        assert.deepStrictEqual(out.globalEvents, []);
        model.overlays[0].attributes.text = 'x';
        model.globalEvents.onPlay = 'go()';
        out = Serializer.serializeHypervideo(model, { now: 1 });
        assert.deepStrictEqual(out.contents[0].body['frametrail:attributes'], { text: 'x' });
        assert.deepStrictEqual(out.globalEvents, { onPlay: 'go()' });
    });

    test('items of an unknown frametrail:type pass through untouched', () => {
        const other = { 'frametrail:type': 'Something', foo: [1, 2], '@context': legacyContext };
        const out = Serializer.serializeHypervideo(Serializer.parseHypervideo(hypervideo([other, overlayItem(toStringCreated)])), { now: 1 });
        assert.deepStrictEqual(out.contents[1], other, 'written after the overlays');
    });

    test('an overlay\'s resourceId is read back; an annotation\'s graph data is written', () => {
        const stored = hypervideo([overlayItem(toStringCreated)]);
        stored.contents[0].body['frametrail:resourceId'] = '12';
        assert.equal(Serializer.parseHypervideo(stored).overlays[0].resourceId, '12');
        const annotation = Serializer.parseAnnotation({ creator: { id: '1' }, created: toStringCreated, target: { selector: { value: 't=1,2' } }, body: { 'frametrail:type': 'text' },
            'frametrail:graphdata': '1 2 3', 'frametrail:graphdatatype': 'audio' }, {});
        assert.equal(Serializer.serializeAnnotation(annotation, {})['frametrail:graphdata'], '1 2 3');
        delete annotation._stored;
        const fresh = Serializer.serializeAnnotation(annotation, { sourcePath: 'v.mp4' });
        assert.equal(fresh['frametrail:graphdatatype'], 'audio');
        assert.equal(fresh.target.source, 'v.mp4');
        assert.equal(fresh.body.type, 'TextualBody');
    });

    test('a new item (never stored) is written in the current shape', () => {
        const overlay = { name: 'N', creator: 'demo', creatorId: '1', created: Date.UTC(2026, 9, 7, 10, 0, 0, 5), type: 'image', src: 'pic.png', thumb: null,
                          start: 1, end: 2, startOffset: 0, endOffset: 0, resourceId: '7', attributes: {}, position: { top: 1, left: 2, width: 3, height: 4 } };
        const written = Serializer.serializeOverlay(overlay, { sourcePath: 'v.mp4' });
        assert.equal(written.created, '2026-10-07T10:00:00.005Z');
        assert.deepStrictEqual(written['@context'], Serializer.CONTEXT);
        assert.equal(written.body.format, 'image/png');
        assert.equal(written.body['frametrail:resourceId'], '7');
        assert.equal(written.target.selector.value, 't=1,2&xywh=percent:2,1,3,4');
        assert.deepStrictEqual(validator.validate('content-item.schema.json', written), []);
    });

    test('the target source follows the context, or stays as stored', () => {
        const model = Serializer.parseHypervideo(hypervideo([overlayItem(toStringCreated)]));
        assert.equal(Serializer.serializeHypervideo(model, {}).contents[0].target.source, 'video.mp4');
        assert.equal(Serializer.serializeHypervideo(model, { sourcePath: 'other.mp4' }).contents[0].target.source, 'other.mp4');
    });

    test('the output shares no objects with the model or the stored file', () => {
        const stored = hypervideo([overlayItem(toStringCreated)]);
        const before = clone(stored);
        const model = Serializer.parseHypervideo(stored);
        const out = Serializer.serializeHypervideo(model, { now: 1 });
        out.clips[0].src = 'mutated';
        out.contents[0].body['frametrail:attributes'].text = 'mutated';
        out.config.layoutArea.areaRight.pop();
        model.overlays[0].attributes.custom = 'mutated';
        assert.deepStrictEqual(stored, before);
        assert.equal(model.clips[0].src, 'video.mp4');
        assert.equal(model.layout.areaRight.length, 1);
    });

    test('annotations index: legacy top-level entries are read; writing moves them', () => {
        const legacy = { mainAnnotation: '1', annotationfiles: { '1': { name: 'main' } }, local: { name: 'me', description: '', hidden: false, src: 'local.json' } };
        assert.deepStrictEqual(Object.keys(Serializer.parseAnnotationIndex(legacy).annotationfiles), ['1', 'local']);
        const written = Serializer.setAnnotationIndexEntry(legacy, 'local', { name: 'me', lastchanged: 5 });
        assert.ok(!('local' in written));
        assert.equal(written.annotationfiles.local.lastchanged, 5);
        assert.ok('local' in legacy, 'the input is not changed');
        assert.deepStrictEqual(Serializer.parseAnnotationIndex({ annotationfiles: [] }).annotationfiles, {});
    });

    test('folder bundles refuse paths that leave the tree, and unknown formats', () => {
        assert.throws(() => Serializer.writeBundle({ bundle: 'project', formatVersion: 1, hypervideosIndex: { hypervideos: { 1: '../../x' } }, hypervideos: { 1: { hypervideo: {} } } }, 'folder'));
        assert.throws(() => Serializer.writeBundle({ bundle: 'hypervideo', formatVersion: 1, id: '1', hypervideo: {}, annotations: { files: { '../evil': [] } } }, 'folder'));
        assert.throws(() => Serializer.readBundle({}, 'nope'), /Unknown bundle format/);
    });

});


/* ---------------------------------------------------------------------- */
/*  FrameTrailKeyframes                                                   */
/* ---------------------------------------------------------------------- */

describe('FrameTrailHTMLFormat', () => {

    const allTypes = () => Serializer.readBundle(readDataFolder(path.join(FIXTURES, 'data', 'all-types')), 'folder', { bundle: 'hypervideo', id: '1' });

    // A text overlay whose content tries every way out of a <script> and a <style>.
    function hostile() {
        const bundle = allTypes(),
              text   = bundle.hypervideo.contents.find((item) => item.body && item.body['frametrail:type'] === 'text');
        text.body['frametrail:attributes'].text = '</script><script>alert(1)</script><!-- <SCRIPT> </style> \u2028 & "quotes"';
        return bundle;
    }

    test('a page carries the bundle and the page settings, and reads back as written', () => {
        const bundle = allTypes(),
              html   = HTMLFormat.write(bundle, { datapath: 'https://example.org/_data/', config: { defaultTheme: 'dark', defaultLanguage: 'de' }, target: '#player' }),
              blocks = HTMLFormat.parse(html);
        assert.equal(blocks.length, 1);
        assert.deepStrictEqual(blocks[0], { kind: 'hypervideo', format: 1, datapath: 'https://example.org/_data/', config: { defaultTheme: 'dark', defaultLanguage: 'de' }, target: '#player', bundle });
        assert.match(html, /<html lang="de">/);
        assert.match(html, /<title>All Item Types<\/title>/);
        assert.match(html, /<script>FrameTrail\.autoInit\(\);<\/script>/);
    });

    test('nothing in the content can end the block: every "<" is \\u003c', () => {
        const bundle = hostile(),
              html   = HTMLFormat.write(bundle),
              block  = html.slice(html.indexOf('<script type="application/ld+json"'), html.indexOf('</script>'));
        assert.ok(block.indexOf('<', 1) < 0, 'a "<" inside the data block');
        assert.equal((html.match(/<\/script/gi) || []).length, 3, 'one closing tag per script element');
        assert.deepStrictEqual(Serializer.readBundle(html, 'html'), bundle);
    });

    test('an embedded library cannot end its element either', () => {
        const bundle  = hostile(),
              library = { css: 'body { content: "</style>"; }', js: 'var a = "</script>", b = /<\/script>/u; window.FrameTrail = { autoInit: function(){} };' },
              html    = HTMLFormat.write(bundle, { library });
        assert.equal((html.match(/<\/script/gi) || []).length, 3);
        assert.equal((html.match(/<\/style/gi) || []).length, 1);
        assert.ok(html.indexOf('var a = "<\\/script>", b = /<\\/script>/u;') > 0);
        assert.deepStrictEqual(Serializer.readBundle(html, 'html'), bundle);
        const commented = HTMLFormat.write(bundle, { library: { css: '', js: 'var c = "<!--", d = /<!--/u;' } });
        assert.ok(commented.indexOf('var c = "<\\x21--", d = /<\\x21--/u;') > 0);
        assert.deepStrictEqual(new Function('return ["<\\x21--", /<\\x21--/u.test("<!--")]')(), ['<!--', true]);
    });

    test('pages written by hand: attribute order, quotes, case, entities, whitespace', () => {
        const bundle = { bundle: 'project', formatVersion: 1, hypervideosIndex: { hypervideos: {} }, hypervideos: {} },
              html   = '<body><script src="x.js"></script>\n<SCRIPT data-frametrail-config=\'{"defaultTheme":"a&amp;b"}\' Type = "Application/LD+JSON" data-frametrail data-frametrail-datapath=../data/ >\n\n  '
                     + JSON.stringify(bundle) + '  \n</Script >';
        assert.deepStrictEqual(HTMLFormat.parse(html), [{ kind: 'project', format: 1, datapath: '../data/', config: { defaultTheme: 'a&b' }, target: null, bundle }]);
        assert.deepStrictEqual(HTMLFormat.parse('<script type="application/ld+json">{"other":"data"}</script>'), []);
    });

    test('a newer format or broken JSON is refused, a page without data has no bundle', () => {
        assert.throws(() => HTMLFormat.parse('<script type="application/ld+json" data-frametrail="project" data-frametrail-format="2">{}</script>'), /format 2/);
        assert.throws(() => HTMLFormat.parse('<script type="application/ld+json" data-frametrail="project">{ nope }</script>'), /not valid JSON/);
        assert.throws(() => Serializer.readBundle('<html><body>Hello</body></html>', 'html'), /No FrameTrail data block/);
    });

    test('an export from before this format is read without running it', () => {
        const html   = fs.readFileSync(path.join(FIXTURES, 'html', 'legacy-export.html'), 'utf8'),
              legacy = HTMLFormat.parseLegacy(html),
              errors = validator.validate('hypervideo-bundle.schema.json', legacy.bundle);
        assert.ok(!errors.length, formatErrors(errors));
        assert.equal(legacy.datapath, 'https://example.org/_data/');
        assert.deepStrictEqual(legacy.config, { defaultLanguage: 'en' });
        assert.equal(legacy.bundle.hypervideo.meta.name, 'All Item Types');
        assert.equal(Object.values(legacy.bundle.annotations.files).flat().length, 22);
        assert.deepStrictEqual(Serializer.readBundle(html, 'html', { legacy: true }), legacy.bundle);
        assert.equal(HTMLFormat.parseLegacy('<script>FrameTrail.init(window.options)</script>'), null);
    });

    test('a hypervideo.json exported before bundles makes a valid bundle', () => {
        const hypervideo = readJSON(path.join(FIXTURES, 'html', 'legacy-hypervideo.json')),
              errors     = validator.validate('hypervideo-bundle.schema.json', HTMLFormat.hypervideoBundle(hypervideo));
        assert.ok(!errors.length, formatErrors(errors));
    });

    test('editing a page in place keeps everything around its first data block', () => {
        const project = Serializer.readBundle(readDataFolder(path.join(FIXTURES, 'data', 'zoom-in-on-dna')), 'folder'),
              block   = HTMLFormat.write(project).match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/)[0],
              page    = '<!doctype html>\n<!-- my page --><html><head><title>Mine</title><script src="frametrail.min.js"></script></head>\n<body><h1>Hello</h1>\n'
                      + block.replace('<script ', '<script id="data" ') + '\n'
                      + '<script type="application/ld+json" data-frametrail="hypervideo">{"second":"block"}</script>\n<script>FrameTrail.autoInit();</script></body></html>\n',
              files   = HTMLFormat.readProject(page).files;
        files['config.json'] = { defaultTheme: 'dark' };
        const edited = HTMLFormat.writeProject(files, page),
              start  = page.indexOf('<script id="data"'),
              blocks = HTMLFormat.parse(edited);
        assert.equal(edited.slice(0, start), page.slice(0, start));
        assert.equal(edited.slice(edited.indexOf('</script>', start)), page.slice(page.indexOf('</script>', start)));
        assert.match(edited, /<script id="data" type="application\/ld\+json" data-frametrail="project" data-frametrail-format="1">/);
        assert.equal(blocks.length, 2);
        assert.deepStrictEqual(blocks[0].bundle.config, { defaultTheme: 'dark' });
        assert.deepStrictEqual(blocks[1].bundle, { second: 'block' });
        assert.equal(HTMLFormat.firstBlockText(edited), '\n' + HTMLFormat.blockJSON(blocks[0].bundle) + '\n');
    });

    test('a hypervideo page is read as a project with that hypervideo; its page settings move into the data', () => {
        const bundle = allTypes(),
              page   = HTMLFormat.write(bundle, { datapath: 'https://example.org/_data/', config: { defaultTheme: 'dark', videoFit: 'cover' } })
                           .replace('data-frametrail-format="1"', 'data-frametrail-format="1" data-frametrail-language="fr"'),
              read   = HTMLFormat.readProject(page);
        assert.equal(read.kind, 'hypervideo');
        assert.equal(read.datapath, 'https://example.org/_data/');
        assert.deepStrictEqual(read.files['hypervideos/_index.json'], { 'hypervideo-increment': 1, 'hypervideos': { '1': './1' } });
        assert.deepStrictEqual(read.files['config.json'], { defaultTheme: 'dark', videoFit: 'cover', defaultLanguage: 'fr' });
        const written = HTMLFormat.parse(HTMLFormat.writeProject(read.files, page)),
              errors  = validator.validate('project-bundle.schema.json', written[0].bundle);
        assert.ok(!errors.length, formatErrors(errors));
        assert.deepStrictEqual([written[0].kind, written[0].config, written[0].datapath], ['project', null, 'https://example.org/_data/']);
        assert.deepStrictEqual(written[0].bundle.config, { defaultTheme: 'dark', defaultLanguage: 'fr', videoFit: 'cover' });
        assert.deepStrictEqual(written[0].bundle.hypervideos['1'].hypervideo, bundle.hypervideo);
        assert.deepStrictEqual(written[0].bundle.hypervideos['1'].annotations, bundle.annotations);
        assert.deepStrictEqual(written[0].bundle.resources.resources, bundle.resources);
    });

    test('a hypervideo listed before its folder is written is left out', () => {
        const files = HTMLFormat.emptyProject();
        files['hypervideos/_index.json'] = { 'hypervideo-increment': 2, 'hypervideos': { '1': './1', '2': './2' } };
        files['hypervideos/1/hypervideo.json'] = allTypes().hypervideo;
        const bundle = HTMLFormat.projectBundle(files);
        assert.deepStrictEqual(Object.keys(bundle.hypervideos), ['1']);
        assert.deepStrictEqual(bundle.hypervideosIndex, { 'hypervideo-increment': 2, 'hypervideos': { '1': './1' } });
    });

    test('a new page from an empty project; pages without data are refused', () => {
        const page = HTMLFormat.writeProject(HTMLFormat.emptyProject(), null, { library: { css: '/* css */', js: '/* js */' }, datapath: './', title: 'My project' }),
              read = HTMLFormat.parse(page)[0],
              errors = validator.validate('project-bundle.schema.json', read.bundle);
        assert.ok(!errors.length, formatErrors(errors));
        assert.deepStrictEqual([read.kind, read.datapath], ['project', './']);
        assert.match(page, /<title>My project<\/title>/);
        assert.equal(HTMLFormat.readProject(' \n').empty, true);
        assert.throws(() => HTMLFormat.readProject('<html><body>Hello</body></html>'), /No FrameTrail data block/);
        assert.throws(() => HTMLFormat.readProject('<script type="application/ld+json" data-frametrail>{"other":"data"}</script>'), /no bundle/);
        assert.equal(HTMLFormat.firstBlockText('<p>none</p>'), null);
    });

    test('content written back into a page cannot end the block either', () => {
        const page   = HTMLFormat.write(allTypes()),
              read   = HTMLFormat.readProject(page),
              file   = 'hypervideos/1/hypervideo.json',
              text   = read.files[file].contents.find((item) => item.body && item.body['frametrail:type'] === 'text');
        text.body['frametrail:attributes'].text = '</script><script>alert(1)</script><!-- </style>';
        const edited = HTMLFormat.writeProject(read.files, page),
              block  = HTMLFormat.firstBlockText(edited);
        assert.ok(block.indexOf('<') < 0, 'a "<" inside the data block');
        assert.equal((edited.match(/<\/script/gi) || []).length, (page.match(/<\/script/gi) || []).length);
        assert.equal(HTMLFormat.readProject(edited).files[file].contents.find((item) => item.body && item.body['frametrail:type'] === 'text').body['frametrail:attributes'].text, text.body['frametrail:attributes'].text);
    });

});

describe('FrameTrailKeyframes', () => {

    test('normalizeKeyframes sorts, drops broken keyframes and tiny rotations', () => {
        const keyframes = Keyframes.normalizeKeyframes([
            { t: 2, xywh: [0, 0, 10, 10], ease: 'easeInOut' },
            { t: 1, xywh: ['5', 5, 10, 10], r: 0.004 },
            { t: 3, xywh: [1, 2] }
        ]);
        assert.deepStrictEqual(keyframes, [{ t: 1, xywh: [5, 5, 10, 10] }, { t: 2, xywh: [0, 0, 10, 10], ease: 'easeInOut' }]);
        assert.deepStrictEqual(Keyframes.unionBox(keyframes, 1, 2), { left: 0, top: 0, width: 15, height: 15 });
    });

    test('eases', () => {
        assert.ok(Math.abs(Keyframes.easeFn('easeInOut')(0.5) - 0.5) < 1e-6);
        assert.ok(Keyframes.hasEase('springBouncy'));
        assert.ok(!Keyframes.hasEase('nope'));
    });

    test('every ease the schemas allow exists', () => {
        const eases = readJSON(path.join(ROOT, 'schemas', 'common.schema.json')).$defs.ease.enum;
        assert.deepStrictEqual(eases.filter((ease) => !Keyframes.hasEase(ease)), []);
    });

});
