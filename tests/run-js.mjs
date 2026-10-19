/*
 * FrameTrail's tests: the fixtures in tests/fixtures/ against the JSON Schemas
 * in schemas/ (with FrameTrailSchema), through FrameTrailSerializer and
 * FrameTrailLint, plus unit tests of FrameTrailSchema, FrameTrailSerializer,
 * FrameTrailHTMLFormat, FrameTrailLint, FrameTrailKeyframes, FrameTrailWebVTT,
 * FrameTrailRingLayout and FrameTrailPairing, the pairing broker contract against the stub in
 * scripts/pairing-broker.mjs, and the storage adapters of a local folder and
 * a project file against an in-memory File System Access API.
 * No dependencies, Node 20 or later:
 *
 *     node tests/run-js.mjs
 *     node tests/run-js.mjs --data=path/to/_data   # also check a _data folder of your own (lint findings are listed, not failed)
 *
 * tests/README.md describes the fixtures and the rules a runner in another
 * language applies to them.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extractExamples, serialize, FIXTURES_DIR as EXAMPLE_FIXTURES } from './extract-examples.mjs';
import { bundleSchemas, typesDoc, OUTPUT as SCHEMA_BUNDLE, TYPES_OUTPUT } from '../scripts/bundle-schemas.mjs';
import { createBroker } from '../scripts/pairing-broker.mjs';

const require  = createRequire(import.meta.url);
const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

const Schema     = require('../src/_shared/frametrail-core/schema/FrameTrailSchema.js');
const Serializer = require('../src/_shared/frametrail-core/serialization/FrameTrailSerializer.js');
const Keyframes  = require('../src/_shared/frametrail-core/serialization/FrameTrailKeyframes.js');
const RingLayout = require('../src/_shared/frametrail-core/layout/FrameTrailRingLayout.js');
const HTMLFormat = require('../src/_shared/frametrail-core/serialization/FrameTrailHTMLFormat.js');
const Lint       = require('../src/_shared/frametrail-core/serialization/FrameTrailLint.js');
const WebVTT     = require('../src/_shared/frametrail-core/serialization/FrameTrailWebVTT.js');
const Pairing    = require('../src/_shared/frametrail-core/pairing/FrameTrailPairing.js');

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

function formatErrors(errors, indent = '    ') {
    return errors.map((e) => indent + (e.path || '(document)') + ': ' + e.message).join('\n');
}

const byPathAndMessage = (a, b) => (a.path + '\u0000' + a.message).localeCompare(b.path + '\u0000' + b.message);

const lintValidator = Schema.create([Lint.RESULT_SCHEMA]);

// A lint result follows FrameTrailLint.RESULT_SCHEMA, and errors and warnings count its findings.
function checkLintResult(result) {
    assert.deepStrictEqual(lintValidator.validate('lint-result.schema.json', result), [], 'the result follows FrameTrailLint.RESULT_SCHEMA');
    assert.equal(result.errors, result.findings.filter((finding) => finding.severity === 'error').length, 'errors counts the errors');
    assert.equal(result.warnings, result.findings.filter((finding) => finding.severity === 'warning').length, 'warnings counts the warnings');
}


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

// A folder's checks. listFindings: list each hypervideo's lint findings as diagnostics (they never fail).
function checkDataFolder(label, dir, listFindings) {

    describe(label, () => {

        const files = readDataFolder(dir),
              names = Object.keys(files);

        // Problems per JSON file: no schema, or the schema's errors.
        const problems = {};
        for (const file of names.filter((name) => name.endsWith('.json'))) {
            const schema = Serializer.schemaOfFile(file),
                  errors = schema ? validator.validate(schema, files[file]) : [];
            if (!schema) { problems[file] = file + ': no schema for this file'; }
            else if (errors.length) { problems[file] = file + ' (' + schema + ')\n' + formatErrors(errors); }
        }
        const invalid = Object.keys(problems);

        test('every file follows its schema', () => {
            assert.ok(names.some((name) => name.endsWith('hypervideo.json')), 'no hypervideo.json in ' + dir);
            if (invalid.length) { assert.fail(invalid.length + ' file(s) do not follow their schema:\n' + Object.values(problems).join('\n')); }
        });

        test('the files agree with each other (FrameTrailLint.checkFolder)', () => {
            const problems = Lint.checkFolder(files);
            if (problems.length) { assert.fail(problems.length + ' problem(s):\n' + formatErrors(problems)); }
        });

        test('each hypervideo lints, with a result that follows its schema', (t) => {
            if (invalid.length) { t.skip('the folder has invalid files'); return; }
            const project = Serializer.readBundle(files, 'folder');
            for (const id of Object.keys(project.hypervideos)) {
                const result = Lint.run(Lint.partsOf(project, { hypervideoId: id }));
                checkLintResult(result);
                if (listFindings) {
                    for (const finding of result.findings) {
                        t.diagnostic('hypervideo ' + id + ': ' + finding.severity + ' ' + finding.rule + ', ' + finding.kind
                            + (finding.ref !== undefined ? ' ' + finding.ref : '') + (finding.creator !== undefined ? ' of ' + finding.creator : '') + ': ' + finding.message);
                    }
                }
            }
        });

        test('hypervideos and annotation files round-trip through the serializer', () => {
            const failures = [];
            for (const file of names) {
                const schema = Serializer.schemaOfFile(file);
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
            project.files['tagdefinitions.json'] = Object.assign({}, project.files['tagdefinitions.json'], { added: { label: 'Added', description: '' } });
            const edited = HTMLFormat.writeProject(project.files, page),
                  start  = page.indexOf('<script type="application/ld+json"'),
                  end    = page.indexOf('</script>', start);
            assert.equal(edited.slice(0, start), page.slice(0, start));
            assert.equal(edited.slice(edited.indexOf('</script>', start)), page.slice(end));
            const bundle = HTMLFormat.parse(edited)[0].bundle,
                  errors = validator.validate('project-bundle.schema.json', bundle);
            assert.ok(!errors.length, formatErrors(errors));
            assert.equal(bundle.tagdefinitions.added.label, 'Added');
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
        extraData.forEach((dir) => checkDataFolder(path.relative(process.cwd(), dir) || dir, dir, true));
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
/*  Lint: fixtures/lint/                                                  */
/* ---------------------------------------------------------------------- */

const LINT_FIXTURES = path.join(FIXTURES, 'lint');

// Applies a JSON Patch (RFC 6902) with add, remove and replace to a document, in place.
function applyPatch(document, patch) {

    for (const operation of patch) {

        const tokens = operation.path.split('/').slice(1).map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~')),
              last   = tokens.pop(),
              where  = operation.op + ' ' + operation.path;
        let node = document;

        for (const token of tokens) {
            assert.ok(node !== null && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, token), 'patch: no ' + where);
            node = node[token];
        }
        assert.ok(node !== null && typeof node === 'object', 'patch: no ' + where);
        assert.ok(['add', 'remove', 'replace'].includes(operation.op), 'patch: ' + operation.op + ' is not add, remove or replace');

        if (Array.isArray(node)) {
            const index = (last === '-') ? node.length : Number(last);
            assert.ok(Number.isInteger(index) && index >= 0 && index <= node.length - (operation.op === 'add' ? 0 : 1), 'patch: no ' + where);
            if (operation.op === 'add')         { node.splice(index, 0, clone(operation.value)); }
            else if (operation.op === 'remove') { node.splice(index, 1); }
            else                                { node[index] = clone(operation.value); }
        } else {
            assert.ok(operation.op === 'add' || Object.prototype.hasOwnProperty.call(node, last), 'patch: no ' + where);
            if (operation.op === 'remove') { delete node[last]; }
            else                           { node[last] = clone(operation.value); }
        }

    }

    return document;

}

describe('fixtures/lint', () => {

    const found = new Set(),
          files = fs.readdirSync(LINT_FIXTURES).filter((name) => name.endsWith('.json')).sort(),
          data  = (name) => readJSON(path.join(LINT_FIXTURES, 'data', name + '.json'));

    test('every data set is a valid bundle', () => {
        for (const name of fs.readdirSync(path.join(LINT_FIXTURES, 'data')).filter((name) => name.endsWith('.json'))) {
            const bundle = readJSON(path.join(LINT_FIXTURES, 'data', name)),
                  errors = validator.validate(bundle.bundle === 'project' ? 'project-bundle.schema.json' : 'hypervideo-bundle.schema.json', bundle);
            assert.ok(!errors.length, name + ':\n' + formatErrors(errors));
        }
    });

    for (const file of files) {

        const fixture = readJSON(path.join(LINT_FIXTURES, file));

        describe(file, () => {
            for (const c of fixture.cases) {
                test(c.name, () => {
                    const given   = (key) => (c[key] !== undefined) ? c[key] : fixture[key],
                          bundle  = applyPatch(data(given('data')), c.patch || []),
                          result  = Lint.run(Lint.partsOf(bundle, { hypervideoId: given('hypervideoId'), duration: given('duration') }), c.rules ? { rules: c.rules } : undefined);
                    checkLintResult(result);
                    assert.deepStrictEqual(result.findings, c.findings);
                    result.findings.forEach((finding) => found.add(finding.rule));
                });
            }
        });

    }

    test('every rule is found by some case', () => {
        assert.deepStrictEqual(Lint.RULES.map((rule) => rule.id).filter((id) => !found.has(id)), []);
    });

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

    test('docs/TYPES.md is up to date', () => {
        assert.ok(fs.readFileSync(TYPES_OUTPUT, 'utf8') === typesDoc(),
            path.relative(ROOT, TYPES_OUTPUT) + ' is out of date: run node scripts/bundle-schemas.mjs');
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

    test("a hypervideo's legacy theme is kept as stored; one never stored is written without one", () => {
        const stored = hypervideo([]);
        stored.config.theme = 'lagoon';
        const model = Serializer.parseHypervideo(stored);
        model.config.slidingMode = 'overlay';
        assert.equal(Serializer.serializeHypervideo(model, { now: 7 }).config.theme, 'lagoon');
        const fresh = Serializer.parseHypervideo(hypervideo([]));
        delete fresh._stored;
        delete fresh.config.theme;
        assert.ok(!('theme' in Serializer.serializeHypervideo(fresh, { now: 7 }).config));
    });

    test('normalizeConfig: defaultTheme, the former name of theme, becomes theme when that is empty', () => {
        assert.deepStrictEqual(Serializer.normalizeConfig({ defaultTheme: 'dark', videoFit: 'cover' }), { theme: 'dark', videoFit: 'cover' });
        assert.deepStrictEqual(Serializer.normalizeConfig({ theme: 'lagoon', defaultTheme: 'dark' }), { theme: 'lagoon' });
        assert.deepStrictEqual(Serializer.normalizeConfig({ theme: '', defaultTheme: 'dark' }), { theme: 'dark' });
        assert.deepStrictEqual(Serializer.normalizeConfig({ defaultTheme: '' }), {});
        assert.deepStrictEqual(Serializer.normalizeConfig({ theme: 'studio' }), { theme: 'studio' });
        const config = { defaultTheme: 'dark' };
        assert.equal(Serializer.normalizeConfig(config), config);
        assert.equal(Serializer.normalizeConfig(null), null);
        assert.equal(Serializer.normalizeConfig('config.json'), 'config.json');
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

    test('an export fills a Transcript view naming no transcript, or a missing one, from the first subtitles', () => {
        const subtitles = { en: { cues: [{ startTime: 1, endTime: 2, text: 'Hello' }] }, de: { cues: [{ startTime: 1, endTime: 2, text: 'Hallo' }] } };
        ['', 'fr'].forEach((source) => {
            const stored = hypervideo([]);
            stored.config.layoutArea.areaRight[0].transcriptSource = source;
            const view = Serializer.serializeHypervideo(Serializer.parseHypervideo(stored), { now: 1, purpose: 'export', subtitles }).config.layoutArea.areaRight[0];
            assert.equal(view.type, 'CustomHTML');
            assert.equal(view.html, '<span class="timebased" data-start="1" data-end="2">Hello </span>');
        });
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

    test('a new item whose model holds PHP\'s [] (copied from an older resource) is written with {}', () => {
        const base = { name: 'N', creator: 'demo', creatorId: '1', created: Date.UTC(2026, 9, 7, 10, 0, 0, 5), type: 'image', src: 'pic.png', thumb: null, start: 1, end: 2 };
        const annotation = Serializer.serializeAnnotation(Object.assign({}, base, { attributes: [], tags: [] }), { sourcePath: 'v.mp4' });
        assert.deepStrictEqual(annotation.body['frametrail:attributes'], {});
        const overlay = Serializer.serializeOverlay(Object.assign({}, base, { attributes: [], events: [], position: { top: 1, left: 2, width: 3, height: 4 } }), { sourcePath: 'v.mp4' });
        assert.deepStrictEqual(overlay.body['frametrail:attributes'], {});
        assert.deepStrictEqual(overlay['frametrail:events'], {});
        const snippet = Serializer.serializeCodeSnippet({ name: 'S', creator: 'demo', creatorId: '1', created: base.created, snippet: 'x()', start: 1, attributes: [] }, { sourcePath: 'v.mp4' });
        assert.deepStrictEqual(snippet.body['frametrail:attributes'], {});
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

    test('schemaOfFile: the schema of a file in a _data folder, by its path', () => {
        assert.equal(Serializer.schemaOfFile('config.json'), 'config.schema.json');
        assert.equal(Serializer.schemaOfFile('resources/_index.json'), 'resources-index.schema.json');
        assert.equal(Serializer.schemaOfFile('hypervideos/_index.json'), 'hypervideos-index.schema.json');
        assert.equal(Serializer.schemaOfFile('hypervideos/12/hypervideo.json'), 'hypervideo.schema.json');
        assert.equal(Serializer.schemaOfFile('hypervideos/12/annotations/_index.json'), 'annotations-index.schema.json');
        assert.equal(Serializer.schemaOfFile('hypervideos/12/annotations/guest_anna-b-919e0619.json'), 'annotation-file.schema.json');
        assert.equal(Serializer.schemaOfFile('hypervideos\\12\\hypervideo.json'), 'hypervideo.schema.json', 'Windows separators');
        assert.equal(Serializer.schemaOfFile('./tagdefinitions.json'), 'tagdefinitions.schema.json');
        for (const none of ['users.json', 'custom.css', 'hypervideos/12/subtitles/en.vtt', 'resources/1_1790000000_a.png', 'hypervideos/12/x/hypervideo.json', 'other.json']) {
            assert.equal(Serializer.schemaOfFile(none), null, none);
        }
    });

    test("guestUserID: the same name is the same id; DATA-MODEL.md's example holds", () => {
        const example = /the name "([^"]+)" gives `(guest_[a-z0-9-]+)`/.exec(fs.readFileSync(path.join(ROOT, 'docs', 'DATA-MODEL.md'), 'utf8'));
        assert.ok(example, 'DATA-MODEL.md gives an example of a guest id');
        assert.equal(Serializer.guestUserID(example[1]), example[2]);
        assert.equal(Serializer.guestUserID('  anna \t B '), example[2], 'case and runs of white space do not matter');
        assert.equal(Serializer.guestUserID('Zoë'), Serializer.guestUserID('ZOË'));
        assert.notEqual(Serializer.guestUserID('Zoë'), Serializer.guestUserID('Zoe'), 'names that read alike once reduced stay apart');
        assert.match(Serializer.guestUserID('李明'), /^guest_[0-9a-f]{8}$/);
    });

    test('tagEntry: one label, or the legacy one per language; the id where there is none', () => {
        const legacy = { de: { label: 'Vorlesung' }, en: { label: 'Lecture', description: 'Hall' }, fr: { label: 'Cours', description: 5 } };
        assert.deepStrictEqual(Serializer.tagEntry({ label: 'Demo', description: 'For the demo' }, 'demo', 'de'), { label: 'Demo', description: 'For the demo' });
        assert.deepStrictEqual(Serializer.tagEntry({ label: 'Demo' }, 'demo'), { label: 'Demo', description: '' });
        assert.deepStrictEqual(Serializer.tagEntry(legacy, 'lecture', 'de'), { label: 'Vorlesung', description: '' });
        assert.deepStrictEqual(Serializer.tagEntry(legacy, 'lecture', 'it'), { label: 'Lecture', description: 'Hall' }, 'else English');
        assert.deepStrictEqual(Serializer.tagEntry(legacy, 'lecture', 'fr'), { label: 'Cours', description: '' });
        assert.deepStrictEqual(Serializer.tagEntry({ de: { label: 'Nur deutsch' } }, 'x', 'en'), { label: 'Nur deutsch', description: '' }, 'else the first');
        assert.deepStrictEqual(Serializer.tagEntry(undefined, 'gone', 'en'), { label: 'gone', description: '' });
        assert.deepStrictEqual(Serializer.tagEntry({ en: { description: 'no label' } }, 'odd', 'en'), { label: 'odd', description: '' });
    });

    test('tagID: a class name made from the label, unique; tagLabelKey tells labels apart', () => {
        assert.equal(Serializer.tagID('Fact Check'), 'fact-check');
        assert.equal(Serializer.tagID('  Über-Größe! '), 'uber-grosse', 'accents go, ß is ss');
        assert.equal(Serializer.tagID('Café', ['cafe']), 'cafe-2');
        assert.equal(Serializer.tagID('Café', { cafe: {}, 'cafe-2': {} }), 'cafe-3', 'the definitions work as the list of ids');
        assert.equal(Serializer.tagID('2024'), 'tag-2024');
        assert.equal(Serializer.tagID('A'), 'tag-a');
        assert.equal(Serializer.tagID('李明'), 'tag');
        assert.equal(Serializer.tagID('李明', ['tag']), 'tag-2');
        assert.equal(Serializer.tagID('constructor'), 'constructor', 'no inherited property is taken');
        assert.ok(Serializer.tagID('x'.repeat(39) + ' yz').length <= 40);
        assert.match(Serializer.tagID('a'.repeat(39) + ' b'), /^[a-z][a-z0-9-]*[a-z0-9]$/, 'no dash at the end after cutting');
        assert.equal(Serializer.tagLabelKey(' Fact   check '), Serializer.tagLabelKey('fact Check'));
        assert.notEqual(Serializer.tagLabelKey('Café'), Serializer.tagLabelKey('Cafe'));
    });

    test('usedTagIds: the tags a hypervideo bundle\'s items name; a hypervideo bundle carries their definitions', () => {
        const bundle = Serializer.readBundle(readDataFolder(path.join(FIXTURES, 'data', 'all-types')), 'folder', { bundle: 'hypervideo', id: '1' });
        assert.deepStrictEqual(Serializer.usedTagIds(bundle), ['demo']);
        assert.deepStrictEqual(Object.keys(bundle.tagdefinitions), ['demo'], 'only the tags it names');
        assert.deepStrictEqual(Serializer.usedTagIds({ hypervideo: { contents: [{ 'frametrail:tags': ['a', 'b'] }] }, annotations: { files: { 1: [{ 'frametrail:tags': ['b', 'c', 5] }] } } }), ['a', 'b', 'c']);
    });

    test("DATA-MODEL.md's table of resource types matches the serializer and the schemas", () => {
        const text    = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-MODEL.md'), 'utf8'),
              table   = text.slice(text.indexOf('| `frametrail:type` | Overlay |'), text.indexOf('\n\n', text.indexOf('| `frametrail:type` | Overlay |'))),
              typesIn = (file) => [...new Set([...fs.readFileSync(path.join(ROOT, 'schemas', file), 'utf8').matchAll(/"\$ref": "attributes\/([a-z]+)\.schema\.json"/g)].map((m) => m[1]))],
              places  = { overlay: typesIn('content-item.schema.json'), annotation: typesIn('annotation-file.schema.json'), resource: typesIn('resources-index.schema.json') },
              listed  = [];
        for (const row of table.split('\n').slice(2)) {
            const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
            for (const type of [...cells[0].matchAll(/`([a-z]+)`/g)].map((m) => m[1])) {
                const info = Serializer.RESOURCE_TYPES[type],
                      src  = (info.src === null) ? '—' : '`' + (info.src || 'source') + '`';
                listed.push(type);
                assert.deepStrictEqual([cells[1] === '✓', cells[2] === '✓', cells[3] === '✓'],
                    [places.overlay.includes(type), places.annotation.includes(type), places.resource.includes(type)], type + ': overlay, annotation, resource');
                assert.equal(cells[4], info.type || '', type + ': body.type');
                assert.equal(cells[5], (type === 'image') ? 'image/`<extension>`' : (info.format || ''), type + ': body.format');
                assert.equal(cells[6], src, type + ': src in');
            }
        }
        assert.deepStrictEqual(listed.sort(), Object.keys(Serializer.RESOURCE_TYPES).filter((type) => type !== 'codesnippet').sort(), 'every type, once');
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
              html   = HTMLFormat.write(bundle, { datapath: 'https://example.org/_data/', config: { theme: 'dark', defaultLanguage: 'de' }, target: '#player' }),
              blocks = HTMLFormat.parse(html);
        assert.equal(blocks.length, 1);
        assert.deepStrictEqual(blocks[0], { kind: 'hypervideo', format: 1, datapath: 'https://example.org/_data/', config: { theme: 'dark', defaultLanguage: 'de' }, target: '#player', bundle });
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
              html   = '<body><script src="x.js"></script>\n<SCRIPT data-frametrail-config=\'{"theme":"a&amp;b"}\' Type = "Application/LD+JSON" data-frametrail data-frametrail-datapath=../data/ >\n\n  '
                     + JSON.stringify(bundle) + '  \n</Script >';
        assert.deepStrictEqual(HTMLFormat.parse(html), [{ kind: 'project', format: 1, datapath: '../data/', config: { theme: 'a&b' }, target: null, bundle }]);
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
        // A config.json in the former form keeps its theme.
        files['config.json'] = { defaultTheme: 'dark' };
        const edited = HTMLFormat.writeProject(files, page),
              start  = page.indexOf('<script id="data"'),
              blocks = HTMLFormat.parse(edited);
        assert.equal(edited.slice(0, start), page.slice(0, start));
        assert.equal(edited.slice(edited.indexOf('</script>', start)), page.slice(page.indexOf('</script>', start)));
        assert.match(edited, /<script id="data" type="application\/ld\+json" data-frametrail="project" data-frametrail-format="1">/);
        assert.equal(blocks.length, 2);
        assert.deepStrictEqual(blocks[0].bundle.config, { theme: 'dark' });
        assert.deepStrictEqual(blocks[1].bundle, { second: 'block' });
        assert.equal(HTMLFormat.firstBlockText(edited), '\n' + HTMLFormat.blockJSON(blocks[0].bundle) + '\n');
    });

    test('a hypervideo page is read as a project with that hypervideo; its page settings move into the data', () => {
        const bundle = allTypes(),
              page   = HTMLFormat.write(bundle, { datapath: 'https://example.org/_data/', config: { theme: 'dark', videoFit: 'cover' } })
                           .replace('data-frametrail-format="1"', 'data-frametrail-format="1" data-frametrail-language="fr"'),
              read   = HTMLFormat.readProject(page);
        assert.equal(read.kind, 'hypervideo');
        assert.equal(read.datapath, 'https://example.org/_data/');
        assert.deepStrictEqual(read.files['hypervideos/_index.json'], { 'hypervideo-increment': 1, 'hypervideos': { '1': './1' } });
        assert.deepStrictEqual(read.files['config.json'], { theme: 'dark', videoFit: 'cover', defaultLanguage: 'fr' });
        const written = HTMLFormat.parse(HTMLFormat.writeProject(read.files, page)),
              errors  = validator.validate('project-bundle.schema.json', written[0].bundle);
        assert.ok(!errors.length, formatErrors(errors));
        assert.deepStrictEqual([written[0].kind, written[0].config, written[0].datapath], ['project', null, 'https://example.org/_data/']);
        assert.deepStrictEqual(written[0].bundle.config, { theme: 'dark', defaultLanguage: 'fr', videoFit: 'cover' });
        assert.deepStrictEqual(written[0].bundle.hypervideos['1'].hypervideo, bundle.hypervideo);
        assert.deepStrictEqual(written[0].bundle.hypervideos['1'].annotations, bundle.annotations);
        assert.deepStrictEqual(written[0].bundle.resources.resources, bundle.resources);
    });

    test("a page's settings in the former form still override its project's theme", () => {
        const project = Serializer.readBundle(readDataFolder(path.join(FIXTURES, 'data', 'zoom-in-on-dna')), 'folder');
        project.config = { theme: 'lagoon', videoFit: 'cover' };
        const page = HTMLFormat.write(project, { config: { defaultTheme: 'dark' } }),
              read = HTMLFormat.readProject(page);
        assert.deepStrictEqual(read.files['config.json'], { theme: 'dark', videoFit: 'cover' });
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

describe('FrameTrailLint', () => {

    const allTypesFolder = () => readDataFolder(path.join(FIXTURES, 'data', 'all-types'));
    const lecture = () => readJSON(path.join(FIXTURES, 'lint', 'data', 'lecture.json'));

    test('the rules have ids, severities and descriptions; the result schema is in the subset', () => {
        const ids = Lint.RULES.map((rule) => rule.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const rule of Lint.RULES) {
            assert.match(rule.id, /^[a-z]+(-[a-z]+)*$/, rule.id);
            assert.ok(['error', 'warning'].includes(rule.severity), rule.id);
            assert.ok(typeof rule.description === 'string' && rule.description !== '', rule.id);
        }
        assert.deepStrictEqual(lintValidator.validate('lint-result.schema.json', { errors: 0, warnings: 0, findings: [] }), []);
        assert.notDeepStrictEqual(lintValidator.validate('lint-result.schema.json', { findings: [{ rule: 'x' }] }), []);
    });

    test('DATA-MODEL.md lists every rule with its severity', () => {
        const text = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-MODEL.md'), 'utf8'),
              rows = [...text.matchAll(/^\| `([a-z-]+)` \| (error|warning) \|/gm)].map((m) => ({ id: m[1], severity: m[2] }));
        assert.deepStrictEqual(rows, Lint.RULES.map((rule) => ({ id: rule.id, severity: rule.severity })));
    });

    test('run: nothing to find in nothing; an unknown rule is refused', () => {
        assert.deepStrictEqual(Lint.run({}), { errors: 0, warnings: 0, findings: [] });
        assert.throws(() => Lint.run({}, { rules: ['no-such-rule'] }), /Unknown lint rule: no-such-rule/);
    });

    test('partsOf: the items as the serializer writes them, the time from the clip or the media', () => {
        const parts = Lint.partsOf(lecture(), { duration: 600 });
        assert.deepStrictEqual(parts.info, { start: 0, end: 600 });
        assert.deepStrictEqual([parts.overlays.length, parts.codeSnippets.length, parts.annotations.length, parts.chapters.length], [4, 1, 3, 3]);
        assert.deepStrictEqual(parts.subtitles.map((entry) => entry.lang), ['en']);
        assert.deepStrictEqual(Object.keys(parts.resources), ['1', '2']);
        assert.equal(Lint.partsOf(lecture()).info.end, null, 'a clip of duration 0 without the media\'s');
        const project = readJSON(path.join(FIXTURES, 'lint', 'data', 'project.json'));
        assert.deepStrictEqual(Lint.partsOf(project).info, { start: 0, end: 90 }, 'the first hypervideo');
        assert.deepStrictEqual(Lint.partsOf(project, { hypervideoId: 7 }).info, { start: 12, end: 132 }, 'in and out points');
        assert.deepStrictEqual(Lint.partsOf(project).resources, {});
        assert.throws(() => Lint.partsOf(project, { hypervideoId: '99' }), /No hypervideo "99"/);
        const legacy = Lint.partsOf(readJSON(path.join(FIXTURES, 'lint', 'data', 'legacy.json')));
        assert.deepStrictEqual(legacy.overlays.map((item) => item.created), ['2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.001Z'], 'created in ISO form, unique');
    });

    test('plainText and cues follow the rules in tests/README.md', () => {
        assert.equal(Lint.plainText('&lt;p&gt;A &lt;b&gt;bold&lt;/b&gt; &amp;amp; B&lt;/p&gt;'), 'A bold & B');
        assert.equal(Lint.plainText('a < b <!-- note --> &NBSP;c&#x41;&#66;&copy;'), 'a < b cAB&copy;');
        assert.equal(Lint.plainText(null), '');
        const vtt = '\uFEFFWEBVTT\r\n\r\nNOTE a note\r\n\r\n1\r\n00:01.5 --> 00:02.000\r\nno hours, one decimal\r\n\r\n00:03.000 -> 00:04.000\r\nnot a cue\r\n\r\n'
                  + 'intro\r\n01:02:03,250 --> 01:02:04.000 align:start\r\n<v Ada>Hello</v>\r\nworld\r\n\r\n00:00:05.000 --> 00:00:06.000\r\n\r\n';
        assert.deepStrictEqual(Lint.cues(vtt), [{ start: 1.5, end: 2, text: 'no hours, one decimal' }, { start: 3723.25, end: 3724, text: 'Hello world' }]);
        assert.deepStrictEqual(Lint.timeSpan('t=1.5e1&xywh=percent:1,2,3,4'), { start: 15, end: 15 });
        assert.deepStrictEqual(Lint.box('t=1,2&xywh=percent:-5,2.5,1e1,40'), { left: -5, top: 2.5, width: 10, height: 40 });
        assert.deepStrictEqual(Lint.clipSpan([{ in: 10, out: 0, duration: 0 }], 70), { start: 10, duration: 60 });
    });

    test('checkVTT: the header, cue timings as the player reads them, cues that end before they start', () => {
        assert.deepStrictEqual(Lint.checkVTT('WEBVTT\n\n1\n00:01.000 --> 00:02.500\nHello\n\n1:00:01.000 --> 1:00:02.000 align:start\nLater'), []);
        assert.deepStrictEqual(Lint.checkVTT(String.fromCharCode(0xFEFF) + 'WEBVTT - a title\r\n\r\nNOTE a --> in a note line\r\n\r\n00:01.000 --> 00:02.000\r\nHi')
            .map((problem) => problem.line), [3], 'a "-->" outside a timing line counts as one');
        assert.deepStrictEqual(Lint.checkVTT('00:01.000 --> 00:02.000\nHi'), [{ line: 1, message: 'Does not start with the line "WEBVTT"; the player reads no subtitles from it.' }]);
        const problems = Lint.checkVTT('WEBVTT\n\n00:01,000 --> 00:02.000\nA\n\n00:01.00 --> 00:02.000\nB\n\n75:00.000 --> 76:00.000\nC\n\n00:03.000 --> 00:02.000\nD');
        assert.deepStrictEqual(problems.map((problem) => problem.line), [3, 6, 9, 12]);
        assert.equal(problems[0].message, 'The cue timing "00:01,000 --> 00:02.000" is not mm:ss.ttt --> mm:ss.ttt or hh:mm:ss.ttt --> hh:mm:ss.ttt (a dot before exactly three digits); the player skips such a cue or shows it at another time.');
        assert.equal(problems[3].message, 'The cue ends at or before its start (00:03.000 --> 00:02.000); it is never shown.');
    });

    test('messages give seconds to the millisecond; the all-types fixture has no lint errors', () => {
        const result = Lint.run({ hypervideo: {}, info: { start: 0, end: 10.000000000000002 }, chapters: [{ start: 10.999999999999998, title: 'Late' }] });
        assert.equal(result.findings[0].message, 'Is at 11 s, outside the video (0 s to 10 s); the player never reaches it.');
        assert.equal(result.findings[0].ref, 10.999999999999998, 'the ref stays as stored');
        const bundle = Serializer.readBundle(allTypesFolder(), 'folder');
        assert.deepStrictEqual(Lint.run(Lint.partsOf(bundle, { hypervideoId: '1' })).findings.filter((finding) => finding.severity === 'error'), []);
    });

    test('checkFolder: nothing in a consistent folder', () => {
        assert.deepStrictEqual(Lint.checkFolder(allTypesFolder()), []);
    });

    test('checkFolder: files that do not agree with each other', () => {
        const files = allTypesFolder(),
              hv    = 'hypervideos/1/';
        files['tagdefinitions.json'] = '{ "a": ';
        files['hypervideos/_index.json'].hypervideos['6'] = './6';
        files['hypervideos/_index.json'].hypervideos['7'] = '../outside';
        files['hypervideos/5/hypervideo.json'] = clone(files[hv + 'hypervideo.json']);
        files['hypervideos/5/hypervideo.json'].subtitles = [];
        files[hv + 'annotations/9.json'] = [];
        files[hv + 'annotations/_index.json'].annotationfiles['8'] = { name: 'gone' };
        files[hv + 'annotations/_index.json'].local = { name: 'legacy entry', src: 'local.json' };
        files[hv + 'annotations/local.json'] = [];
        files[hv + 'subtitles/de.vtt'] = 'WEBVTT\n';
        files[hv + 'subtitles/en.vtt'] = files[hv + 'subtitles/en.vtt'].replace('00:00:00.500 --> 00:00:04.000', '00:00:00,500 --> 00:00:04.000');
        files[hv + 'hypervideo.json'].subtitles.push({ src: 'fr.vtt', srclang: 'fr' });
        const problems = Lint.checkFolder(files);
        assert.match(problems.find((problem) => problem.path === 'tagdefinitions.json').message, /^Is not valid JSON: /);
        assert.deepStrictEqual(problems.filter((problem) => problem.path !== 'tagdefinitions.json'), [
            { path: hv + 'annotations/9.json', message: 'Has no entry in annotations/_index.json; FrameTrail does not load these annotations.' },
            { path: hv + 'annotations/_index.json', message: 'Lists the annotation file "8", but hypervideos/1/annotations/8.json is missing; FrameTrail cannot load the hypervideo.' },
            { path: hv + 'hypervideo.json', message: 'Lists subtitles "fr", but hypervideos/1/subtitles/fr.vtt is missing.' },
            { path: hv + 'subtitles/de.vtt', message: 'Is not listed in the subtitles of hypervideos/1/hypervideo.json; FrameTrail does not show it.' },
            { path: hv + 'subtitles/en.vtt', message: 'Line 4: The cue timing "00:00:00,500 --> 00:00:04.000" is not mm:ss.ttt --> mm:ss.ttt or hh:mm:ss.ttt --> hh:mm:ss.ttt (a dot before exactly three digits); the player skips such a cue or shows it at another time.' },
            { path: 'hypervideos/5/annotations/_index.json', message: 'Is missing; on a server FrameTrail then loads no hypervideo at all.' },
            { path: 'hypervideos/5/hypervideo.json', message: 'Is not listed in hypervideos/_index.json; FrameTrail does not show this hypervideo.' },
            { path: 'hypervideos/_index.json', message: 'Lists hypervideo "6" in "./6", but hypervideos/6/hypervideo.json is missing; FrameTrail cannot load it.' },
            { path: 'hypervideos/_index.json', message: 'Lists hypervideo "7" in "../outside", which is no folder inside hypervideos/.' }
        ]);
    });

    test('checkFolder: a project file\'s folder, JSON given as text', () => {
        const page  = HTMLFormat.write(Serializer.readBundle(allTypesFolder(), 'folder')),
              files = HTMLFormat.readProject(page).files;
        assert.deepStrictEqual(Lint.checkFolder(files), []);
        const text = Object.fromEntries(Object.entries(files).map(([file, content]) => [file, file.endsWith('.json') ? JSON.stringify(content) : content]));
        assert.deepStrictEqual(Lint.checkFolder(text), []);
    });

});

describe('FrameTrailSerializer: folders for export', () => {

    const allTypesFolder = () => readDataFolder(path.join(FIXTURES, 'data', 'all-types'));

    // Every JSON file follows its schema, and the files agree with each other.
    function assertConsistent(files) {
        for (const file of Object.keys(files).filter((name) => name.endsWith('.json'))) {
            const errors = validator.validate(Serializer.schemaOfFile(file), files[file]);
            if (errors.length) { assert.fail(file + '\n' + formatErrors(errors)); }
        }
        assert.deepStrictEqual(Lint.checkFolder(files), []);
    }

    // all-types with a copy of its hypervideo as "2", an overview map with a
    // marker for each, and a resource nobody uses.
    function twoHypervideos() {
        const files = allTypesFolder();
        for (const file of Object.keys(files).filter((name) => name.startsWith('hypervideos/1/'))) {
            files[file.replace('hypervideos/1/', 'hypervideos/2/')] = clone(files[file]);
        }
        const index = files['hypervideos/_index.json'];
        index['hypervideo-increment'] = 2;
        index.hypervideos['2'] = './2';
        index.overviewMap = { background: 'map.svg', fit: 'contain', markers: { 1: { x: 0.2, y: 0.3, size: 5 }, 2: { x: 0.6, y: 0.4, size: 5 } } };
        files['resources/_index.json'].resources['20'] = Object.assign(clone(files['resources/_index.json'].resources['2']), {
            name: 'Unused', src: '1_1790001000_unused.png', thumb: '1_1790001000_thumb_unused.png'
        });
        return files;
    }

    test('selectFolder: the chosen hypervideos and their markers; the library stays', () => {
        const files    = twoHypervideos(),
              before   = clone(files),
              selected = Serializer.selectFolder(files, ['2']);
        assert.deepStrictEqual(files, before, 'the map given is not changed');
        assert.deepStrictEqual(selected['hypervideos/_index.json'].hypervideos, { 2: './2' });
        assert.deepStrictEqual(Object.keys(selected['hypervideos/_index.json'].overviewMap.markers), ['2']);
        assert.deepStrictEqual(Object.keys(selected).filter((name) => name.startsWith('hypervideos/1/')), []);
        assert.ok(selected['hypervideos/2/hypervideo.json'] && selected['hypervideos/2/annotations/_index.json'] && selected['hypervideos/2/subtitles/en.vtt']);
        assert.deepStrictEqual(selected['resources/_index.json'], files['resources/_index.json']);
        assertConsistent(selected);
        assert.deepStrictEqual(Object.keys(Serializer.readBundle(selected, 'folder').hypervideos), ['2']);
        assert.deepStrictEqual(Object.keys(Serializer.selectFolder(files)['hypervideos/_index.json'].hypervideos), ['1', '2'], 'default: all');
        assert.throws(() => Serializer.selectFolder({}, ['1']), /Missing hypervideos\/_index\.json/);
    });

    test('withoutLibrary: no resources listed, nothing points back at them, the hypervideos still have their media', () => {
        const files  = twoHypervideos(),
              before = clone(files),
              hv     = 'hypervideos/1/';
        files[hv + 'hypervideo.json'].clips[0].src = null;   // a clip that names its video only by its resource
        const bare = Serializer.withoutLibrary(files);
        assert.deepStrictEqual(Object.assign(clone(files), { [hv + 'hypervideo.json']: before[hv + 'hypervideo.json'] }), before, 'the map given is not changed');
        assert.deepStrictEqual(bare['resources/_index.json'], { 'resources-increment': files['resources/_index.json']['resources-increment'], resources: {} });
        assert.deepStrictEqual(bare[hv + 'hypervideo.json'].clips[0], Object.assign(clone(before[hv + 'hypervideo.json'].clips[0]), { resourceId: null }), 'the src comes from the resource');
        const items = bare[hv + 'hypervideo.json'].contents.concat(bare[hv + 'annotations/1.json']);
        assert.ok(items.every((item) => !('frametrail:resourceId' in item.body)));
        assert.deepStrictEqual(Serializer.mediaPaths(bare).filter((file) => /unused/.test(file)), [], 'the library\'s other files are not referred to');
        assert.ok(Serializer.mediaPaths(bare).includes('1_1790000000_fixture-lecture.mp4'), 'the video is');
        assertConsistent(bare);
        assert.deepStrictEqual(Lint.run(Lint.partsOf(Serializer.readBundle(bare, 'folder'), { hypervideoId: '1' })).findings.filter((finding) => finding.rule === 'unknown-resource'), []);
    });

    test('mediaPaths: the files in resources/ a folder refers to, not URLs, nothing outside', () => {
        const files = twoHypervideos();
        assert.deepStrictEqual(Serializer.mediaPaths(files), [
            '1_1790000000_fixture-lecture.mp4',
            '1_1790000000_thumb_fixture-lecture.png',
            '1_1790000060_dna-double-helix.png',
            '1_1790000060_thumb_dna-double-helix.png',
            '1_1790000120_narration.mp3',
            '1_1790000180_handout.pdf',
            '1_1790000180_thumb_handout.png',
            '1_1790000780_thumb_dna.png',
            '1_1790001000_thumb_unused.png',
            '1_1790001000_unused.png',
            'map.svg'
        ]);
        // Only through the items: the library left out, the paths items carry are still there.
        delete files['resources/_index.json'];
        const hypervideo = files['hypervideos/1/hypervideo.json'];
        hypervideo.meta.thumb = '../outside.png';
        hypervideo.clips[0].src = '/absolute/video.mp4';
        assert.deepStrictEqual(Serializer.mediaPaths(files).filter((file) => !/^1_/.test(file)), ['map.svg']);
        assert.ok(Serializer.mediaPaths(files).includes('1_1790000180_handout.pdf'), 'from the PDF overlay');
        assert.ok(!Serializer.mediaPaths(files).includes('1_1790001000_unused.png'));
    });

    test('localAuthors: account annotations become their authors\' guest annotations', () => {
        const files  = allTypesFolder(),
              before = clone(files),
              dir    = 'hypervideos/1/annotations/',
              demo   = Serializer.guestUserID('demo'),
              local  = Serializer.localAuthors(files);
        assert.deepStrictEqual(files, before, 'the map given is not changed');
        assert.deepStrictEqual(local.ids, { 1: demo });
        assert.equal(local.files[dir + '1.json'], undefined);
        assert.equal(local.files[dir + demo + '.json'].length, files[dir + '1.json'].length);
        assert.ok(local.files[dir + demo + '.json'].every((item) => item.creator.id === demo && item.creator.nickname === 'demo'));
        assert.deepStrictEqual(local.files[dir + '_index.json'], {
            mainAnnotation: demo,
            annotationfiles: { [demo]: Object.assign({}, files[dir + '_index.json'].annotationfiles['1'], { ownerId: demo, owner: 'demo' }) }
        });
        assertConsistent(local.files);
        assert.deepStrictEqual(Serializer.localAuthors(local.files), { files: local.files, ids: {} }, 'nothing left to do');

        const joscha = Serializer.localAuthors(files, { names: { 1: 'Joscha' } });
        assert.ok(joscha.files[dir + Serializer.guestUserID('Joscha') + '.json'], 'a given name comes first');
        assert.equal(joscha.files[dir + '_index.json'].annotationfiles[Serializer.guestUserID('Joscha')].owner, 'Joscha');
    });

    test('localAuthors: two accounts with the same name share a file; guests and imported items of others', () => {
        const files = allTypesFolder(),
              dir   = 'hypervideos/1/annotations/',
              anna  = Serializer.guestUserID('Anna');
        const second = files[dir + '1.json'].slice(0, 2).map((item, i) => Object.assign(clone(item), {
            creator: { nickname: 'DEMO', type: 'Person', id: '2' }, created: '2026-10-08T10:00:0' + i + '.000Z'
        }));
        files[dir + '2.json'] = second;
        files[dir + '_index.json'].annotationfiles['2'] = { name: 'DEMO', description: '', created: 1791000000, lastchanged: 1791999999000, hidden: false, owner: ' DEMO ', ownerId: 2 };
        // A guest's file, which also holds an item someone imported with its account creator.
        const imported = Object.assign(clone(files[dir + '1.json'][0]), { creator: { nickname: 'Bert', type: 'Person', id: '7' }, created: '2026-10-08T11:00:00.000Z' });
        const guestItem = Object.assign(clone(files[dir + '1.json'][1]), { creator: { nickname: 'Anna', type: 'Person', id: anna } });
        files[dir + anna + '.json'] = [guestItem, imported];
        files[dir + '_index.json'].annotationfiles[anna] = { name: 'Anna', description: '', created: 1791000000, lastchanged: 1791000000000, hidden: false, owner: 'Anna', ownerId: anna };

        const local = Serializer.localAuthors(files),
              demo  = Serializer.guestUserID('demo'),
              entry = local.files[dir + '_index.json'].annotationfiles;
        assert.deepStrictEqual(local.ids, { 1: demo, 2: demo, 7: Serializer.guestUserID('Bert') });
        assert.deepStrictEqual(Object.keys(entry).sort(), [anna, demo].sort());
        assert.equal(local.files[dir + demo + '.json'].length, files[dir + '1.json'].length + 2, 'merged');
        assert.equal(entry[demo].created, 1791000000, 'the earliest creation');
        assert.equal(entry[demo].lastchanged, 1791999999000, 'the latest change');
        assert.deepStrictEqual(local.files[dir + anna + '.json'].map((item) => item.creator.id), [anna, Serializer.guestUserID('Bert')]);
        assert.deepStrictEqual(entry[anna], files[dir + '_index.json'].annotationfiles[anna], 'a guest\'s entry stays');
        assertConsistent(local.files);
    });

    test('localAuthors: a hypervideo made in memory, without indexes, and a listed file that is missing', () => {
        const item  = { creator: { nickname: 'Joscha', type: 'Person', id: '3' }, created: '2026-10-08T10:00:00.000Z', body: {}, target: {} },
              local = Serializer.localAuthors({ 'hypervideos/4/hypervideo.json': {}, 'hypervideos/4/annotations/3.json': [item] }, { names: { 3: 'Joscha J' } }),
              id    = Serializer.guestUserID('Joscha J');
        assert.deepStrictEqual(Object.keys(local.files), ['hypervideos/4/hypervideo.json', 'hypervideos/4/annotations/' + id + '.json'], 'no index is made');
        assert.equal(local.files['hypervideos/4/annotations/' + id + '.json'][0].creator.id, id);

        const files = allTypesFolder();
        files['hypervideos/1/annotations/_index.json'].annotationfiles['5'] = { name: 'gone', owner: 'Gone' };
        const missing = Serializer.localAuthors(files).files;
        assert.ok(missing['hypervideos/1/annotations/_index.json'].annotationfiles[Serializer.guestUserID('Gone')], 'the entry is renamed');
        assert.equal(missing['hypervideos/1/annotations/' + Serializer.guestUserID('Gone') + '.json'], undefined, 'no file is made up');
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

describe('FrameTrailRingLayout', () => {

    const A      = 16 / 9,
          EPS    = 1e-6,
          SPACES = [[1094, 740], [1440, 815], [900, 500], [1920, 975], [700, 900]],
          COUNTS = [1, 7, 24, 60, 120],
          SIZES  = ['small', 'medium'];

    // Every layout of the spaces, counts and sizes that fits
    const layouts = SPACES.flatMap(([width, height]) => SIZES.flatMap((size) => COUNTS.map((count) => ({
        width, height, size, count, ring: RingLayout.layout({ width, height, aspect: A, count, size })
    })))).filter((entry) => entry.ring);

    const overlap = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

    test('there are slots for every item, as many as the rings hold', () => {
        assert.ok(layouts.length >= SPACES.length * SIZES.length * 3, 'most of them fit');
        for (const { count, ring } of layouts) {
            assert.equal(ring.slots.length, RingLayout.capacity(ring.cols, ring.rows, ring.rings));
            assert.ok(ring.slots.length >= count, count + ' items, ' + ring.slots.length + ' slots');
        }
    });

    test('the slots run clockwise on one spiral from the cell left of the video\'s bottom row', () => {
        for (const { ring } of layouts) {
            assert.deepStrictEqual([ring.slots[0].c, ring.slots[0].r], [-1, ring.rows - 1]);
            for (let i = 1; i < ring.slots.length; i++) {
                const a = ring.slots[i - 1], b = ring.slots[i];
                assert.equal(Math.abs(a.c - b.c) + Math.abs(a.r - b.r), 1, 'slot ' + i + ' is next to the one before');
            }
            for (let j = 1; j <= ring.rings; j++) {
                const last = ring.slots.filter((slot) => slot.ring === j).pop();
                assert.deepStrictEqual([last.c, last.r], [-j, ring.rows - 1 + j], 'ring ' + j + ' ends in its bottom-left corner');
            }
        }
    });

    test('the slots stay inside the space, off the video and off each other', () => {
        for (const { width, height, ring } of layouts) {
            ring.slots.forEach((slot, i) => {
                assert.ok(slot.x >= -EPS && slot.y >= -EPS && slot.x + slot.w <= width + EPS && slot.y + slot.h <= height + EPS, 'slot ' + i + ' is inside');
                assert.ok(!overlap(slot, ring.video), 'slot ' + i + ' is off the video');
                for (let k = i + 1; k < ring.slots.length; k++) {
                    assert.ok(!overlap(slot, ring.slots[k]), 'slots ' + i + ' and ' + k + ' do not overlap');
                }
            });
        }
    });

    test('the grid fills the space edge to edge, the video is centred, the cells stay thumbnail-shaped', () => {
        for (const { width, height, ring } of layouts) {
            const near = (a, b) => Math.abs(a - b) < EPS;
            assert.ok(near(Math.min(...ring.slots.map((slot) => slot.x)), 0));
            assert.ok(near(Math.min(...ring.slots.map((slot) => slot.y)), 0));
            assert.ok(near(Math.max(...ring.slots.map((slot) => slot.x + slot.w)), width));
            assert.ok(near(Math.max(...ring.slots.map((slot) => slot.y + slot.h)), height));
            assert.ok(near(ring.video.x + ring.video.w / 2, width / 2) && near(ring.video.y + ring.video.h / 2, height / 2), 'the video is centred');
            const ratio = ring.cell.h / ring.cell.w;
            assert.ok(ratio >= 0.7 * 0.85 && ratio <= 0.7 * 1.15, 'cell ratio ' + ratio);
        }
    });

    test('the video keeps its shape and at least half its ringless width; more items never mean bigger cells', () => {
        for (const { width, height, ring } of layouts) {
            assert.ok(Math.abs(ring.video.w / ring.video.h - A) < EPS);
            assert.ok(ring.video.w >= 0.5 * Math.min(width, height * A) - EPS);
        }
        for (const [width, height] of SPACES) {
            for (const size of SIZES) {
                const across = COUNTS.map((count) => RingLayout.layout({ width, height, aspect: A, count, size }))
                                     .filter(Boolean).map((ring) => ring.across);
                assert.deepStrictEqual(across, [...across].sort((a, b) => a - b), width + '×' + height + ' ' + size);
            }
        }
        assert.equal(RingLayout.layout({ width: 1094, height: 740, aspect: A, count: 1000, size: 'medium' }), null);
        assert.equal(RingLayout.layout({ width: 0, height: 740, aspect: A, count: 1, size: 'medium' }), null);
    });

    test('a gap lies between the thumbnails, between them and the video, and around the ring', () => {
        const near = (a, b) => Math.abs(a - b) < EPS,
              apart = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        let tried = 0;
        for (const [width, height] of SPACES) {
            for (const size of SIZES) {
                for (const gap of [4, 30]) {
                    const ring = RingLayout.layout({ width, height, aspect: A, count: 24, size, gap });
                    if (!ring) { continue; }
                    tried++;
                    ring.slots.forEach((slot, i) => {
                        if (i > 0) { assert.ok(near(apart(ring.slots[i - 1], slot), gap), 'neighbours on the spiral are the gap apart'); }
                        assert.ok(apart(slot, ring.box) >= gap - EPS, 'slot ' + i + ' is the gap away from the video\'s block');
                    });
                    assert.ok(near(Math.min(...ring.slots.map((slot) => apart(slot, ring.box))), gap), 'the inner ring is the gap away from it');
                    assert.ok(near(Math.min(...ring.slots.map((slot) => slot.x)), gap) && near(Math.min(...ring.slots.map((slot) => slot.y)), gap), 'the gap at the left and the top');
                    assert.ok(near(Math.max(...ring.slots.map((slot) => slot.x + slot.w)), width - gap), 'at the right');
                    assert.ok(near(Math.max(...ring.slots.map((slot) => slot.y + slot.h)), height - gap), 'and at the bottom');
                    assert.ok(ring.video.x >= ring.box.x - EPS && ring.video.x + ring.video.w <= ring.box.x + ring.box.w + EPS, 'the video is in its block');
                    const ratio = ring.cell.h / ring.cell.w;
                    assert.ok(ratio >= 0.7 * 0.85 && ratio <= 0.7 * 1.15, 'cell ratio ' + ratio);
                }
                const s = RingLayout.strip({ width, height, aspect: A, size, gap: 30 });
                assert.ok(near(s.video.y + s.video.h + 30, s.strip.y), 'the strip is the gap below the video');
                assert.ok(s.strip.y + s.strip.h <= height - 30 + EPS, 'and above the bottom');
                assert.ok(near(s.strip.x, 30) && near(s.strip.x + s.strip.w, width - 30), 'and from the sides');
            }
        }
        assert.ok(tried >= 10, tried + ' layouts with a gap');
        assert.deepStrictEqual(RingLayout.layout({ width: 1094, height: 740, aspect: A, count: 24, size: 'medium', gap: 0 }),
                               RingLayout.layout({ width: 1094, height: 740, aspect: A, count: 24, size: 'medium' }), 'gap 0 is no gap');
    });

    test('the same hypervideo has the same rings at every player size', () => {
        for (const { width, height, size, count, ring } of layouts) {
            const twice = RingLayout.layout({ width: 2 * width, height: 2 * height, aspect: A, count, size });
            assert.deepStrictEqual([twice.across, twice.rings, twice.cols, twice.rows], [ring.across, ring.rings, ring.cols, ring.rows]);
            assert.ok(Math.abs(twice.video.w - 2 * ring.video.w) < EPS);
        }
    });

    test('placeByTime puts items where their time is and packs them when crowded', () => {
        const range = (n) => Array.from({ length: n }, (_, i) => i);
        assert.deepStrictEqual(RingLayout.placeByTime([13.5, 60.5, 111.5, 141.5, 161.5, 187.5, 205.5], 215.24, 24), [1, 6, 12, 15, 18, 20, 22], 'sparse: like a clock');
        assert.deepStrictEqual(RingLayout.placeByTime(range(10).map((i) => i * 0.1), 1, 10), range(10), 'a full track');
        assert.deepStrictEqual(RingLayout.placeByTime([9, 9.5, 9.9], 10, 10), [7, 8, 9], 'crowding at the end is pulled back');
        const police = [12, 12.5, 13, 13.5, 14, 60.5, 111, 111.5, 112, 141, 141.5, 142, 142.5, 143, 161.5, 187, 187.5, 188, 204, 204.5, 205, 205.5, 206, 206.5];
        assert.deepStrictEqual(RingLayout.placeByTime(police, 215.24, 24), range(24), '24 items on 24 slots');
        const on26 = RingLayout.placeByTime(police, 215.24, 26);
        assert.ok(on26.every((slot, i) => slot >= 0 && slot < 26 && (i === 0 || slot > on26[i - 1])), 'strictly increasing: ' + on26);
        assert.equal(RingLayout.placeByTime([1, 2, 3], 10, 2), null, 'more items than slots');
        assert.deepStrictEqual(RingLayout.placeByTime([5, 1, 3], 0, 6), [0, 1, 2], 'without a duration: in order');
    });

    test('the strip stands below the video, both centred together, across the whole width', () => {
        for (const [width, height] of SPACES) {
            for (const size of SIZES) {
                const s = RingLayout.strip({ width, height, aspect: A, size });
                assert.ok(Math.abs(s.video.y + s.video.h - s.strip.y) < EPS);
                assert.ok(Math.abs((height - s.video.h - s.strip.h) / 2 - s.video.y) < EPS);
                assert.equal(s.strip.x, 0);
                assert.equal(s.strip.w, width);
                assert.ok(Math.abs(s.video.w / s.video.h - A) < EPS);
            }
        }
    });

});

describe('FrameTrailWebVTT', () => {

    const vttFiles = (function find(dir) {
        return fs.readdirSync(dir).sort().flatMap((name) => {
            const file = path.join(dir, name);
            if (fs.statSync(file).isDirectory()) { return find(file); }
            return name.endsWith('.vtt') ? [file] : [];
        });
    })(FIXTURES);

    test('every .vtt fixture is written back as it is', () => {
        assert.ok(vttFiles.length > 0);
        for (const file of vttFiles) {
            const text = fs.readFileSync(file, 'utf8');
            assert.equal(WebVTT.write(WebVTT.parse(text)), text, path.relative(ROOT, file));
        }
    });

    test('what is not changed stays: byte order mark, line endings, header, notes, styles, ids, settings, timing lines', () => {
        const text = String.fromCharCode(0xFEFF) + 'WEBVTT - Lecture\r\nKind: captions\r\n\r\nSTYLE\r\n::cue { color: lime }\r\n\r\nNOTE written by hand\r\n\r\nintro\r\n0:01.5 --> 0:03.000 align:start line:0\r\n<v Ada>Hello</v>\r\n\r\n00:03.000 --> 00:04.000\r\nSecond\r\n',
              doc  = WebVTT.parse(text);
        assert.equal(WebVTT.write(doc), text);
        assert.deepStrictEqual(doc.header, ['WEBVTT - Lecture', 'Kind: captions']);
        assert.deepStrictEqual(doc.blocks.map((block) => block.type), ['style', 'note', 'cue', 'cue']);
        const cue = WebVTT.cuesOf(doc)[0];
        assert.deepStrictEqual([cue.id, cue.start, cue.end, cue.settings, cue.text], ['intro', 1.5, 3, 'align:start line:0', '<v Ada>Hello</v>']);
        cue.end = 2.5;
        assert.equal(WebVTT.write(doc), text.replace('0:01.5 --> 0:03.000', '00:01.500 --> 00:02.500'), 'a changed cue gets a new timing line, the file keeps its line endings');
    });

    test('cues are written in the order of their start; a note stays with the cue after it', () => {
        const doc = WebVTT.parse('WEBVTT\n\nREGION\nid:r\n\n00:05.000 --> 00:06.000\nB\n\nNOTE about A\n\n00:01.000 --> 00:02.000\nA\n\n00:01.000 --> 00:03.000\nA2\n');
        assert.equal(WebVTT.write(doc), 'WEBVTT\n\nREGION\nid:r\n\nNOTE about A\n\n00:01.000 --> 00:02.000\nA\n\n00:01.000 --> 00:03.000\nA2\n\n00:05.000 --> 00:06.000\nB\n');
    });

    test('new documents and cues; text that would break the file', () => {
        const doc = WebVTT.create();
        assert.equal(WebVTT.write(doc), 'WEBVTT\n');
        doc.blocks.push({ type: 'cue', id: '', start: 3725.5, end: 3727, settings: '', text: 'one\n\n  \ntwo --> three' });
        assert.equal(WebVTT.write(doc), 'WEBVTT\n\n01:02:05.500 --> 01:02:07.000\none\ntwo --&gt; three\n');
        assert.deepStrictEqual(Lint.checkVTT(WebVTT.write(doc)), []);
    });

    test('times', () => {
        assert.equal(WebVTT.parseTime('12'), 12);
        assert.equal(WebVTT.parseTime('12,5'), 12.5);
        assert.equal(WebVTT.parseTime('1:02.5'), 62.5);
        assert.equal(WebVTT.parseTime('01:02:03.456'), 3723.456);
        assert.equal(WebVTT.parseTime('1:75'), null);
        assert.equal(WebVTT.parseTime('a minute'), null);
        assert.equal(WebVTT.formatTime(5.5), '00:05.500');
        assert.equal(WebVTT.formatTime(5.5, true), '00:00:05.500');
        assert.equal(WebVTT.formatTime(3723.4567), '01:02:03.457');
    });

    test('SubRip', () => {
        const srt = '1\r\n00:00:01,000 --> 00:00:04,500 X1:10 X2:20\r\n{\\an8}<font color="red">Hello</font> <i>you</i>\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\nBye\r\n';
        assert.equal(WebVTT.sniff(srt), 'srt');
        assert.equal(WebVTT.sniff('WEBVTT\n'), 'vtt');
        assert.equal(WebVTT.sniff('Hello'), null);
        const vtt = WebVTT.fromSRT(srt);
        assert.equal(vtt, 'WEBVTT\n\n00:00:01.000 --> 00:00:04.500\nHello <i>you</i>\n\n00:00:05.000 --> 00:00:06.000\nBye\n');
        assert.deepStrictEqual(Lint.checkVTT(vtt), []);
    });

    test('cue text: references, markup, speakers', () => {
        assert.equal(WebVTT.decodeText('Fish &amp; chips &lt;3 <i>yes</i> &#x41;'), 'Fish & chips <3 <i>yes</i> A');
        assert.equal(WebVTT.encodeText('Fish & chips <3 <i>yes</i> <00:01.000>later'), 'Fish &amp; chips &lt;3 <i>yes</i> <00:01.000>later');
        assert.equal(WebVTT.encodeText(WebVTT.decodeText('a &lt;b&gt; <b>c</b>')), 'a <b> <b>c</b>', 'text that reads as a tag becomes markup: the one ambiguity');
        assert.equal(WebVTT.toPlain('<v Ada><i>Fish</i> &amp; chips</v>'), 'Fish & chips');
        assert.deepStrictEqual(WebVTT.speakerOf('<v.loud Ada Lovelace>Hello</v>'), { speaker: 'Ada Lovelace', classes: '.loud', text: 'Hello' });
        assert.deepStrictEqual(WebVTT.speakerOf('<v Ada>Hi <v Bob>there'), { speaker: '', classes: '', text: '<v Ada>Hi <v Bob>there' }, 'two speakers: none of them is the cue\'s');
        assert.deepStrictEqual(WebVTT.speakerOf('No one'), { speaker: '', classes: '', text: 'No one' });
        assert.equal(WebVTT.withSpeaker('Ada & <Bob>', 'Hi', '.loud'), '<v.loud Ada &amp; &lt;Bob&gt;>Hi');
        assert.equal(WebVTT.withSpeaker('  ', 'Hi'), 'Hi');
    });

});


/* ---------------------------------------------------------------------- */
/*  Pairing                                                               */
/* ---------------------------------------------------------------------- */

describe('FrameTrailPairing', () => {

    const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');

    test('ids and base64url', () => {
        const id = Pairing.randomId();
        assert.match(id, /^[A-Za-z0-9_-]{22}$/);
        assert.notEqual(Pairing.randomId(), id);
        assert.ok(Pairing.isId(id));
        assert.ok(!Pairing.isId('short') && !Pairing.isId('a/b' + id) && !Pairing.isId(42));
        for (let length = 0; length < 40; length++) {
            const bytes = crypto.randomBytes(length);
            assert.equal(Pairing.toBase64url(bytes), bytes.toString('base64url'));
            assert.deepStrictEqual(Buffer.from(Pairing.fromBase64url(bytes.toString('base64url'))), bytes);
        }
        assert.equal(Pairing.fromBase64url('not base64!'), null);
    });

    test('fingerprints: of a certificate, in an SDP, and the check of an answer', () => {
        const bytes = crypto.randomBytes(32),
              other = crypto.randomBytes(32),
              fp    = bytes.toString('base64url'),
              cert  = { getFingerprints: () => [{ algorithm: 'sha-1', value: hex(other.subarray(0, 20)) }, { algorithm: 'sha-256', value: hex(bytes) }] };
        assert.equal(Pairing.certificateFingerprint(cert), fp);
        assert.equal(Pairing.certificateFingerprint({ getFingerprints: () => [] }), null);
        const sdp = (list) => 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' + list.map((f) => 'a=fingerprint:' + f + '\r\n').join('') + 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
        assert.deepStrictEqual(Pairing.sdpFingerprints(sdp(['sha-256 ' + hex(bytes)])), [{ algorithm: 'sha-256', value: fp }]);
        assert.ok(Pairing.checkFingerprint(sdp(['sha-256 ' + hex(bytes)]), fp));
        assert.ok(Pairing.checkFingerprint(sdp(['SHA-256 ' + hex(bytes).toLowerCase(), 'sha-256 ' + hex(bytes)]), fp), 'case does not matter; every section may repeat it');
        assert.ok(!Pairing.checkFingerprint(sdp(['sha-256 ' + hex(other)]), fp), 'another certificate');
        assert.ok(!Pairing.checkFingerprint(sdp(['sha-256 ' + hex(bytes), 'sha-256 ' + hex(other)]), fp), 'one of them is another certificate');
        assert.ok(!Pairing.checkFingerprint(sdp([]), fp), 'none');
        assert.ok(!Pairing.checkFingerprint(sdp(['sha-1 ' + hex(bytes.subarray(0, 20))]), fp), 'another algorithm');
        assert.ok(!Pairing.checkFingerprint(sdp(['sha-256 ' + hex(bytes)]), 'abc'), 'no expected fingerprint');
    });

    test('join links and URLs', () => {
        const room = Pairing.randomId(), fp = crypto.randomBytes(32).toString('base64url'),
              link = Pairing.joinURL('https://ft.example.org/companion.html#old', room, 'https://broker.example.org/pair', fp);
        assert.equal(link, 'https://ft.example.org/companion.html#pair=' + room + '&b=' + encodeURIComponent('https://broker.example.org/pair/') + '&fp=' + fp);
        assert.deepStrictEqual(Pairing.parseJoin(link), { room, broker: 'https://broker.example.org/pair/', fp });
        assert.deepStrictEqual(Pairing.parseJoin(link.split('#')[1]), { room, broker: 'https://broker.example.org/pair/', fp }, 'the fragment alone');
        assert.equal(Pairing.parseJoin(link.replace(room, 'short')), null, 'room');
        assert.equal(Pairing.parseJoin(link.replace(fp, fp.slice(1))), null, 'fingerprint');
        assert.equal(Pairing.parseJoin(link.replace(encodeURIComponent('https://'), encodeURIComponent('ftp://'))), null, 'broker');
        assert.equal(Pairing.parseJoin(''), null);
        assert.equal(Pairing.brokerBase('https://b.example.org'), 'https://b.example.org/');
        assert.equal(Pairing.brokerBase(' https://b.example.org/x/ '), 'https://b.example.org/x/');
        assert.equal(Pairing.checkBrokerURL(''), 'missing');
        assert.equal(Pairing.checkBrokerURL('broker.example.org'), 'invalid');
        assert.equal(Pairing.checkBrokerURL('http://192.168.1.2:8787', 'https:'), 'insecure');
        assert.equal(Pairing.checkBrokerURL('http://192.168.1.2:8787', 'http:'), null);
        assert.equal(Pairing.checkBrokerURL('http://localhost:8787/', 'https:'), null, 'this machine is trusted');
        assert.equal(Pairing.checkBrokerURL('https://b.example.org', 'https:'), null);
        assert.equal(Pairing.resolveBrokerURL('/pairing-broker/', 'https://mac.local:8443/ft/index.html#hypervideo=1'), 'https://mac.local:8443/pairing-broker/', 'a path: the broker on the page\'s own server');
        assert.equal(Pairing.resolveBrokerURL(' https://b.example.org/ ', 'https://ft.example.org/'), 'https://b.example.org/');
        assert.equal(Pairing.resolveBrokerURL('//b.example.org/', 'https://ft.example.org/'), '//b.example.org/', 'not protocol-relative');
        assert.equal(Pairing.checkBrokerURL(Pairing.resolveBrokerURL('/pairing-broker/', 'file:///Users/me/index.html'), 'file:'), 'invalid', 'a page without a server has no path for it');
        assert.equal(Pairing.companionURL('', 'https://ft.example.org/sub/index.html#hypervideo=1'), 'https://ft.example.org/sub/companion.html');
        assert.equal(Pairing.companionURL('', 'file:///Users/me/index.html'), null, 'no sibling on file:');
        assert.equal(Pairing.companionURL('https://pair.example.org/c.html#x', 'file:///Users/me/index.html'), 'https://pair.example.org/c.html');
        assert.equal(Pairing.companionURL('phone.html', 'https://ft.example.org/sub/'), 'https://ft.example.org/sub/phone.html', 'relative to the page');
        assert.equal(Pairing.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'iPhone');
        assert.equal(Pairing.deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), 'Android phone');
        assert.equal(Pairing.deviceLabel(''), 'Browser');
    });

    test('offer and answer blobs', () => {
        assert.deepStrictEqual(Pairing.readOffer(Pairing.offerBlob('v=0', 'iPhone')), { sdp: 'v=0', label: 'iPhone' });
        assert.deepStrictEqual(Pairing.readOffer({ v: 2, sdp: 'v=0' }), { error: 'version' });
        assert.deepStrictEqual(Pairing.readOffer({ v: 1 }), { error: 'invalid' });
        assert.deepStrictEqual(Pairing.readOffer('v=0'), { error: 'invalid' });
        assert.deepStrictEqual(Pairing.readAnswer(Pairing.answerBlob('v=0')), { sdp: 'v=0' });
        assert.deepStrictEqual(Pairing.readAnswer(Pairing.refusalBlob('full')), { refused: 'full' });
        assert.deepStrictEqual(Pairing.readAnswer({ v: 1, refused: 'something new' }), { refused: 'closed' });
        assert.deepStrictEqual(Pairing.readAnswer({ v: 2, sdp: 'v=0' }), { refused: 'version' });
        assert.equal(Pairing.readAnswer(null), null);
    });

    test('messages: what each side may send', () => {
        const valid = {
            host: [
                { type: 'welcome', v: 1, canControl: true, resume: 'r', label: 'Lecture' },
                { type: 'state', hypervideo: '3', playing: true, time: 12.5, rate: 1, waiting: false, seq: 4 },
                { type: 'control', canControl: false },
                { type: 'view', mode: 'overview' },
                { type: 'pong', id: 7 },
                { type: 'grant', token: '1760000600.' + 'a'.repeat(43), ttl: 600, cookie: 'FTPAIR0123abcd', path: '/_data/resources/' },
                { type: 'bye', reason: 'stopped' }
            ],
            guest: [
                { type: 'hello', v: 1, guest: 'g', label: 'iPhone' },
                { type: 'hello', v: 1, guest: 'g', resume: 'r', label: 'iPhone' },
                { type: 'request', action: 'play' },
                { type: 'request', action: 'seek', time: 3 },
                { type: 'ready', id: 'b' },
                { type: 'ping', id: 1 },
                { type: 'bye' }
            ]
        };
        for (const from of ['host', 'guest']) {
            for (const message of valid[from]) {
                assert.equal(Pairing.validateMessage(message, from), null, JSON.stringify(message));
                assert.deepStrictEqual(Pairing.decode(Pairing.encode(message), from), message);
            }
        }
        assert.equal(Pairing.decode(Pairing.encode(valid.host[1]), 'guest'), null, 'a guest cannot send state');
        assert.equal(Pairing.decode(Pairing.encode({ type: 'request', action: 'play' }), 'host'), null, 'nor the host requests');
        assert.equal(Pairing.decode('{"type":', 'guest'), null);
        assert.equal(Pairing.validateMessage({ type: 'request', action: 'seek' }, 'guest'), 'a seek needs a time');
        assert.equal(Pairing.validateMessage({ type: 'request', action: 'stop' }, 'guest'), 'action must be one of play, pause, seek');
        assert.equal(Pairing.validateMessage({ type: 'state', hypervideo: '3', playing: true, time: NaN, rate: 1, waiting: false, seq: 1 }, 'host'), 'time must be a number');
        assert.equal(Pairing.validateMessage({ type: 'toString' }, 'guest'), 'unknown message type "toString"');
        assert.equal(Pairing.validateMessage([], 'guest'), 'not a message');
        assert.equal(Pairing.decode(Pairing.encode(valid.host[5]), 'guest'), null, 'a guest cannot hand out grants');
        assert.equal(Pairing.validateMessage({ type: 'grant', token: 't', ttl: '600', cookie: 'c', path: '/' }, 'host'), 'ttl must be a number');
    });

    test('grants: the cookie a phone keeps a private instance\'s grant in', () => {
        const grant = { type: 'grant', token: '1760000600.' + 'Ab_-'.repeat(10) + 'xyz', ttl: 598.7, cookie: 'FTPAIR0123abcd', path: '/_data/resources/' };
        assert.equal(Pairing.grantCookie(grant, true), 'FTPAIR0123abcd=' + grant.token + '; Path=/_data/resources/; Max-Age=598; SameSite=Strict; Secure');
        assert.equal(Pairing.grantCookie(grant, false), 'FTPAIR0123abcd=' + grant.token + '; Path=/_data/resources/; Max-Age=598; SameSite=Strict', 'Secure only on https');
        assert.match(Pairing.grantCookie(Object.assign({}, grant, { ttl: 0 }), true), /; Max-Age=0;/, 'the cookie that removes it');
        assert.match(Pairing.grantCookie(Object.assign({}, grant, { ttl: 86400 }), true), /; Max-Age=600;/, 'never longer than a grant lives');
        assert.match(Pairing.grantCookie(Object.assign({}, grant, { path: '/FrameTrail/src/_data/resources/' }), true), /; Path=\/FrameTrail\/src\/_data\/resources\/;/);
        for (const wrong of [
            { cookie: 'FTSESS0123abcd' }, { cookie: 'FTPAIR0123abcd; Domain=example.org' }, { cookie: 'FTPAIR' },
            { path: '_data/resources/' }, { path: '/_data/resources' }, { path: '/; Domain=example.org/' }, { path: '/a b/' },
            { token: 'x' }, { token: grant.token + '; Domain=example.org' }, { token: '1760000600.' + 'a'.repeat(42) },
            { ttl: NaN }, { ttl: '600' }
        ]) {
            assert.equal(Pairing.grantCookie(Object.assign({}, grant, wrong), true), null, JSON.stringify(wrong));
        }
        assert.equal(Pairing.grantCookie(null, true), null);
    });

    test('chunks: a bundle in pieces and together again', () => {
        const text = JSON.stringify({ name: 'Ünïcödé 😀 '.repeat(5000), quote: '"'.repeat(3000) });
        const messages = Pairing.bundleMessages('b1', text, 1000);
        assert.equal(messages[0].type, 'bundle-start');
        assert.equal(messages[messages.length - 1].type, 'bundle-end');
        assert.ok(messages.slice(1, -1).every((m) => m.data.length <= 1000));
        for (const part of Pairing.split(text, 1000)) {
            const last = part.charCodeAt(part.length - 1);
            assert.ok(!(last >= 0xD800 && last <= 0xDBFF), 'no piece ends inside a surrogate pair');
        }
        assert.ok(messages.every((m) => Pairing.validateMessage(m, 'host') === null));
        const assembler = Pairing.createAssembler();
        let result = null;
        for (const message of messages) { result = assembler.accept(message) || result; }
        assert.deepStrictEqual(result, { id: 'b1', text });
        assert.deepStrictEqual(Pairing.bundleMessages('e', ''), [{ type: 'bundle-start', id: 'e', size: 0, parts: 0 }, { type: 'bundle-end', id: 'e' }]);
        assert.deepStrictEqual(assembler.accept({ type: 'bundle-start', id: 'e', size: 0, parts: 0 }) || assembler.accept({ type: 'bundle-end', id: 'e' }), { id: 'e', text: '' });

        const broken = Pairing.createAssembler();
        assert.throws(() => broken.accept({ type: 'bundle-part', id: 'x', i: 0, data: 'a' }), { code: 'invalid' }, 'not started');
        broken.accept({ type: 'bundle-start', id: 'x', size: 2, parts: 2 });
        broken.accept({ type: 'bundle-part', id: 'x', i: 0, data: 'a' });
        assert.throws(() => broken.accept({ type: 'bundle-part', id: 'x', i: 0, data: 'a' }), { code: 'invalid' }, 'twice');
        assert.throws(() => broken.accept({ type: 'bundle-end', id: 'x' }), { code: 'invalid' }, 'a piece missing');
        broken.accept({ type: 'bundle-start', id: 'y', size: 1, parts: 1 });
        assert.throws(() => broken.accept({ type: 'bundle-part', id: 'x', i: 1, data: 'b' }), { code: 'invalid' }, 'a new start drops the unfinished bundle');
        assert.equal(broken.pending, 'y');
    });

    test('the guest\'s clock', () => {
        const clock = Pairing.createClock();
        assert.equal(clock.time(0), null);
        const state = (time, playing, extra) => Object.assign({ type: 'state', hypervideo: '1', time, playing, rate: 1, waiting: false, seq: 1 }, extra);
        assert.equal(clock.update(state(10, true), 1000, 40), true);
        assert.equal(clock.time(1000), 10.02, 'half the round trip on top');
        assert.equal(clock.time(3000), 12.02, 'runs while the host plays');
        assert.equal(clock.update(state(12.1, true), 3000, 40), false, 'within the threshold: no jump');
        assert.equal(clock.time(3000), 12.02);
        assert.equal(clock.update(state(12.5, true), 3000, 40), true, 'beyond it: jumps');
        assert.equal(clock.time(3000), 12.52);
        assert.equal(clock.update(state(12.6, false), 3100, 40), true, 'a pause always moves the clock');
        assert.equal(clock.time(9000), 12.6, 'and holds it');
        assert.equal(clock.update(state(12.65, false), 9000, 40), true, 'paused, every state is exact');
        clock.update(state(20, true, { rate: 2 }), 10000, 0);
        assert.equal(clock.time(11000), 22, 'rate');
        assert.equal(clock.update(state(22, true, { rate: 2, waiting: true }), 11000, 0), true);
        assert.equal(clock.time(15000), 22, 'stands while the host waits for data');
        assert.ok(!clock.running);
    });

    test('waiting for ICE gathering', async () => {
        const fakePC = (state) => {
            const pc = new EventTarget();
            pc.iceGatheringState = state;
            return pc;
        };
        assert.equal(await Pairing.gatherComplete(fakePC('complete'), 10), true);
        const gathering = fakePC('gathering'),
              done = Pairing.gatherComplete(gathering, 1000);
        gathering.iceGatheringState = 'complete';
        gathering.dispatchEvent(new Event('icegatheringstatechange'));
        assert.equal(await done, true);
        const lastCandidate = fakePC('gathering'),
              done2 = Pairing.gatherComplete(lastCandidate, 1000),
              event = new Event('icecandidate');
        event.candidate = null;
        lastCandidate.dispatchEvent(event);
        assert.equal(await done2, true, 'the null candidate ends gathering');
        assert.equal(await Pairing.gatherComplete(fakePC('gathering'), 20), false, 'the timeout');
    });

    test('the path a connection takes', () => {
        const stats = new Map([
            ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' }],
            ['P1', { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1', nominated: true, state: 'succeeded' }],
            ['P2', { id: 'P2', type: 'candidate-pair', localCandidateId: 'L2', remoteCandidateId: 'R1' }],
            ['L1', { id: 'L1', type: 'local-candidate', candidateType: 'host', protocol: 'udp', address: '192.168.1.2' }],
            ['L2', { id: 'L2', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', address: '203.0.113.5' }],
            ['R1', { id: 'R1', type: 'remote-candidate', candidateType: 'srflx' }]
        ]);
        assert.deepStrictEqual(Pairing.selectedPath(stats), { local: 'relay', remote: 'srflx', protocol: 'udp', relayed: true, address: '203.0.113.5' });
        stats.delete('T');
        assert.deepStrictEqual(Pairing.selectedPath(stats), { local: 'host', remote: 'srflx', protocol: 'udp', relayed: false, address: '192.168.1.2' }, 'without a transport report: the nominated pair');
        assert.equal(Pairing.selectedPath(new Map()), null);
    });

    test('what a phone gets has no code', () => {
        const bundle = {
            bundle: 'hypervideo', id: '1',
            hypervideo: {
                meta: { name: 'Talk' }, clips: [],
                config: { layoutArea: { areaRight: [{ type: 'TimedContent', onClickContentItem: 'alert(1)' }], areaCompanion: [{ type: 'CustomHTML', html: '<b>x</b>', onClickContentItem: 'alert(2)' }] } },
                contents: [{ type: 'Annotation' }],
                globalEvents: { onReady: 'alert(3)' },
                customCSS: '.x { color: red }'
            },
            annotations: { files: { 1: [] } }
        };
        const phone = Pairing.companionBundle(bundle);
        assert.deepStrictEqual(phone.hypervideo.contents, []);
        assert.deepStrictEqual(phone.hypervideo.globalEvents, {});
        assert.equal(phone.hypervideo.config.layoutArea.areaRight[0].onClickContentItem, undefined);
        assert.equal(phone.hypervideo.config.layoutArea.areaCompanion[0].onClickContentItem, undefined);
        assert.equal(phone.hypervideo.config.layoutArea.areaCompanion[0].html, '<b>x</b>', 'authored HTML stays (the page\'s CSP keeps it from running anything)');
        assert.equal(phone.hypervideo.customCSS, '.x { color: red }');
        assert.equal(bundle.hypervideo.contents.length, 1, 'the bundle given is not changed');
    });

});


describe('pairing broker (contract v1, scripts/pairing-broker.mjs)', () => {

    // A broker on a free port, with a clock the test moves.
    async function withBroker(options, run) {
        let now = 1000000;
        const broker = createBroker(Object.assign({ now: () => now, log: null }, options)),
              server = http.createServer(broker.handle);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const base = 'http://127.0.0.1:' + server.address().port + '/';
        try {
            await run({ base, client: Pairing.brokerClient(base), advance: (ms) => { now += ms; }, broker });
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    }

    const room = Pairing.randomId(), hostKey = Pairing.randomId(), guest = Pairing.randomId();

    test('a handshake: room, offer, answer', () => withBroker({}, async ({ client }) => {
        await client.openRoom(room, hostKey);
        await client.openRoom(room, hostKey);
        assert.deepStrictEqual(await client.listOffers(room, hostKey, 0), { offers: [], cursor: 0 });
        const offer = Pairing.offerBlob('v=0 offer', 'iPhone');
        await client.postOffer(room, guest, offer);
        const listed = await client.listOffers(room, hostKey, 0);
        assert.deepStrictEqual(listed, { offers: [{ guest, cursor: 1, blob: offer }], cursor: 1 });
        assert.deepStrictEqual(await client.listOffers(room, hostKey, listed.cursor), { offers: [], cursor: 1 }, 'after the cursor: nothing new');
        assert.equal(await client.getAnswer(room, guest), null, 'no answer yet');
        await client.putAnswer(room, guest, hostKey, Pairing.answerBlob('v=0 answer'));
        assert.deepStrictEqual(await client.getAnswer(room, guest), { v: 1, sdp: 'v=0 answer' });
        await client.closeRoom(room, hostKey);
        await assert.rejects(client.postOffer(room, guest, offer), { code: 'noRoom' });
        await assert.rejects(client.listOffers(room, hostKey, 0), { code: 'noRoom' });
        await assert.rejects(client.getAnswer(room, guest), { code: 'noRoom' }, 'a phone waiting for an answer learns that the room is gone');
        await client.closeRoom(room, hostKey);
    }));

    test('the normal course answers no request with an error status (a browser would log it)', () => withBroker({}, async ({ base, client }) => {
        const statuses = [];
        const logged = Pairing.brokerClient(base, { fetch: (url, init) => fetch(url, init).then((response) => { statuses.push(init.method + ' ' + response.status); return response; }) });
        await logged.ice();
        await logged.openRoom(room, hostKey);
        await logged.listOffers(room, hostKey, 0);
        await logged.postOffer(room, guest, Pairing.offerBlob('v=0'));
        await logged.getAnswer(room, guest);
        await logged.putAnswer(room, guest, hostKey, Pairing.answerBlob('v=0'));
        await logged.getAnswer(room, guest);
        await logged.closeRoom(room, hostKey);
        await logged.closeRoom(room, hostKey);
        assert.deepStrictEqual(statuses, ['GET 200', 'PUT 204', 'GET 200', 'POST 204', 'GET 204', 'PUT 204', 'GET 200', 'DELETE 204', 'DELETE 204']);
    }));

    test('only the host of a room acts as its host', () => withBroker({}, async ({ base, client }) => {
        await client.openRoom(room, hostKey);
        const other = Pairing.randomId();
        await assert.rejects(client.openRoom(room, other), { code: 'forbidden' });
        await assert.rejects(client.listOffers(room, other, 0), { code: 'forbidden' });
        await assert.rejects(client.putAnswer(room, guest, other, Pairing.answerBlob('x')), { code: 'forbidden' });
        await assert.rejects(client.closeRoom(room, other), { code: 'forbidden' });
        const anonymous = await fetch(base + 'rooms/' + room + '/offers?after=0');
        assert.equal(anonymous.status, 401);
    }));

    test('limits: blob size, ids, rate', () => withBroker({ rateLimit: 30 }, async ({ base, client }) => {
        await client.openRoom(room, hostKey);
        await assert.rejects(client.postOffer(room, guest, { v: 1, sdp: 'x'.repeat(Pairing.MAX_BLOB) }), { code: 'tooLarge' });
        assert.equal((await fetch(base + 'rooms/short/offers/' + guest, { method: 'POST', body: '{}' })).status, 404, 'not an id: not part of the contract');
        let limited = null;
        for (let i = 0; i < 40 && !limited; i++) {
            const response = await fetch(base + 'rooms/' + room + '/answers/' + guest);
            if (response.status === 429) { limited = response; }
        }
        assert.ok(limited, 'rate limited');
        assert.ok(parseInt(limited.headers.get('retry-after'), 10) > 0);
    }));

    test('rooms and blobs expire', () => withBroker({}, async ({ client, advance }) => {
        await client.openRoom(room, hostKey);
        advance(100000);
        await client.listOffers(room, hostKey, 0);
        advance(100000);
        await client.postOffer(room, guest, Pairing.offerBlob('v=0'));
        assert.equal((await client.listOffers(room, hostKey, 0)).offers.length, 1, 'every call of the host renews the room');
        advance(61000);
        assert.deepStrictEqual((await client.listOffers(room, hostKey, 0)).offers, [], 'an offer lives 60 s');
        await client.putAnswer(room, guest, hostKey, Pairing.answerBlob('v=0'));
        advance(61000);
        await client.listOffers(room, hostKey, 0);
        assert.equal(await client.getAnswer(room, guest), null, 'so does an answer');
        advance(121000);
        await assert.rejects(client.postOffer(room, guest, Pairing.offerBlob('v=0')), { code: 'noRoom' }, 'a room lives 120 s after the host\'s last call');
    }));

    test('CORS: any origin, preflight answered', () => withBroker({}, async ({ base }) => {
        const response = await fetch(base + 'rooms/' + room, { method: 'OPTIONS' });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
        assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
    }));

    test('GET /ice: none (LAN only), STUN, TURN with coturn REST credentials', async () => {
        await withBroker({}, async ({ base, client }) => {
            assert.deepStrictEqual(await (await fetch(base + 'ice')).json(), { iceServers: [] });
            assert.deepStrictEqual(await client.ice(), []);
        });
        assert.deepStrictEqual(await Pairing.brokerClient('http://broker/', { fetch: async () => new Response('', { status: 404 }) }).ice(), [], 'a broker that answers 404: LAN only as well');
        await withBroker({ stun: ['stun:stun.example.org:3478'], turn: ['turn:turn.example.org:3478'], turnSecret: 's3cret', turnTTL: 600 }, async ({ client }) => {
            const servers = await client.ice();
            assert.deepStrictEqual(servers[0], { urls: ['stun:stun.example.org:3478'] });
            assert.deepStrictEqual(servers[1].urls, ['turn:turn.example.org:3478']);
            const [expiry] = servers[1].username.split(':');
            assert.equal(parseInt(expiry, 10), 1000 + 600, 'expiry: now + ttl, in seconds');
            assert.equal(servers[1].credential, crypto.createHmac('sha1', 's3cret').update(servers[1].username).digest('base64'));
        });
    });

    test('pollAnswer waits for the answer, or gives up', () => withBroker({}, async ({ client }) => {
        await client.openRoom(room, hostKey);
        setTimeout(() => { client.putAnswer(room, guest, hostKey, Pairing.answerBlob('late')); }, 60);
        assert.deepStrictEqual(await Pairing.pollAnswer(client, room, guest, { interval: 20, timeout: 2000 }), { v: 1, sdp: 'late' });
        await assert.rejects(Pairing.pollAnswer(client, room, Pairing.randomId(), { interval: 10, timeout: 50 }), { code: 'timeout' });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 30);
        await assert.rejects(Pairing.pollAnswer(client, room, Pairing.randomId(), { interval: 10, timeout: 5000, signal: controller.signal }), { code: 'aborted' });
    }));

    test('no broker there', async () => {
        await assert.rejects(Pairing.brokerClient('http://127.0.0.1:9/').ice(), { code: 'network' });
    });

});


/* ---------------------------------------------------------------------- */
/*  Storage adapters (local folder, project file)                         */
/* ---------------------------------------------------------------------- */

// The adapters are browser classes without a module wrapper: they run here in
// a context of their own, against an in-memory stand-in for the File System
// Access API whose clock moves on with every write (versions are
// "lastModified:size").
function loadStorageAdapters() {
    const dir  = path.join(ROOT, 'src', '_shared', 'frametrail-core', 'storage');
    const code = ['StorageAdapter.js', 'StorageAdapterLocal.js', 'StorageAdapterHTMLFile.js']
        .map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n;\n')
        + '\n;this.StorageAdapterLocal = StorageAdapterLocal; this.StorageAdapterHTMLFile = StorageAdapterHTMLFile;';
    const context = vm.createContext({ window: {}, console, File, Blob, TextDecoder, TextEncoder, URL, setTimeout, clearTimeout, FrameTrailHTMLFormat: HTMLFormat });
    vm.runInContext(code, context);
    return context;
}

let fakeClock = 1700000000000;
const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });

class FakeFileHandle {
    constructor(name, store) { this.kind = 'file'; this.name = name; this.store = store || { data: '', mtime: ++fakeClock }; }
    async getFile() {
        if (this.store.deleted) { throw notFound(); }
        return new File([this.store.data], this.name, { lastModified: this.store.mtime });
    }
    async createWritable() {
        const chunks = [], store = this.store;
        return {
            async write(data) { chunks.push(typeof data === 'string' ? data : await new Blob([data]).text()); },
            async truncate() {}, async seek() {}, async abort() {},
            async close() { store.data = chunks.join(''); store.mtime = ++fakeClock; store.deleted = false; }
        };
    }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(other) { return other.store === this.store; }
}

class FakeDirectoryHandle {
    constructor(name) { this.kind = 'directory'; this.name = name; this.children = new Map(); }
    async getDirectoryHandle(name, options) {
        let child = this.children.get(name);
        if (!child || child.kind !== 'directory') {
            if (!(options && options.create)) { throw notFound(); }
            child = new FakeDirectoryHandle(name);
            this.children.set(name, child);
        }
        return child;
    }
    async getFileHandle(name, options) {
        let child = this.children.get(name);
        if (!child || child.kind !== 'file') {
            if (!(options && options.create)) { throw notFound(); }
            child = new FakeFileHandle(name);
            this.children.set(name, child);
        }
        return child;
    }
    async removeEntry(name) { if (!this.children.delete(name)) { throw notFound(); } }
    async *entries() { for (const entry of this.children) { yield entry; } }
    async *values() { for (const value of this.children.values()) { yield value; } }
    async *keys() { for (const key of this.children.keys()) { yield key; } }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
}

// Another program writing or deleting a file of the folder.
async function writeOutside(root, rel, text) {
    const parts = rel.split('/'), name = parts.pop();
    let dir = root;
    for (const part of parts) { dir = await dir.getDirectoryHandle(part, { create: true }); }
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
}
async function removeOutside(root, rel) {
    const parts = rel.split('/'), name = parts.pop();
    let dir = root;
    for (const part of parts) { dir = await dir.getDirectoryHandle(part); }
    await dir.removeEntry(name, { recursive: true });
}

describe('storage adapters: changes made elsewhere', () => {

    const { StorageAdapterLocal, StorageAdapterHTMLFile } = loadStorageAdapters();
    const hypervideo = 'hypervideos/1/hypervideo.json';

    async function localFolder() {
        const root = new FakeDirectoryHandle('folder'), adapter = new StorageAdapterLocal();
        await adapter.init(root);
        await adapter.createDirectory('hypervideos/1');
        await adapter.writeJSON(hypervideo, { meta: { name: 'One' } });
        await adapter.readJSON(hypervideo);
        return { root, adapter };
    }

    test('local folder: an own write is unchanged, another program\'s is not', async () => {
        const { root, adapter } = await localFolder();
        assert.equal(await adapter.isUnchanged(hypervideo), true);
        await adapter.writeJSON(hypervideo, { meta: { name: 'Two' } });
        assert.equal(await adapter.isUnchanged(hypervideo), true, 'own write');
        await writeOutside(root, hypervideo, JSON.stringify({ meta: { name: 'Elsewhere' } }));
        assert.equal(await adapter.isUnchanged(hypervideo), false, 'another program');
    });

    test('local folder: a file seen and then deleted elsewhere is not unchanged (no orphan is written)', async () => {
        const { root, adapter } = await localFolder();
        await removeOutside(root, 'hypervideos/1');
        assert.equal(await adapter.isUnchanged(hypervideo), false);
    });

    test('local folder: the adapter\'s own deletes forget what it had seen', async () => {
        const { adapter } = await localFolder();
        await adapter.deleteFile(hypervideo);
        assert.equal(await adapter.isUnchanged(hypervideo), true, 'deleteFile');
        await adapter.writeJSON(hypervideo, { meta: { name: 'Again' } });
        await adapter.deleteDirectory('hypervideos/1');
        assert.equal(await adapter.isUnchanged(hypervideo), true, 'deleteDirectory');
    });

    async function projectFile() {
        const handle = new FakeFileHandle('project.html');
        const files  = HTMLFormat.emptyProject(),
              entry  = (name) => ({ name, description: name + "'s annotations", created: 1, lastchanged: 1, hidden: false, owner: name, ownerId: name });
        files['hypervideos/_index.json'] = { 'hypervideo-increment': 1, hypervideos: { 1: './1' } };
        files[hypervideo] = readDataFolder(path.join(FIXTURES, 'data', 'all-types'))[hypervideo];
        files['hypervideos/1/annotations/_index.json'] = { mainAnnotation: 'one', annotationfiles: { one: entry('one'), two: entry('two') } };
        files['hypervideos/1/annotations/one.json'] = [];
        files['hypervideos/1/annotations/two.json'] = [];
        await new StorageAdapterHTMLFile().init(handle, { files, library: { css: '', js: '' }, datapath: './', title: 'Test' });
        const open = async () => { const adapter = new StorageAdapterHTMLFile(); await adapter.init(handle); return adapter; };
        return { handle, one: await open(), two: await open() };
    }

    test('project file: another tab writing another path is no conflict; the same path is', async () => {
        const { one, two } = await projectFile();
        await one.readJSON(hypervideo);
        await one.readJSON('hypervideos/1/annotations/one.json');
        await two.writeJSON('hypervideos/1/annotations/two.json', [{ by: 'two' }]);
        assert.equal(await one.isUnchanged(hypervideo), true, 'another path');
        const changed = clone(await two.readJSON(hypervideo));
        changed.meta.name = 'Two';
        await two.writeJSON(hypervideo, changed);
        assert.equal(await one.isUnchanged(hypervideo), false, 'the same path');
    });

    test('project file: two tabs writing at the same moment both end up in the file', async () => {
        const { handle, one, two } = await projectFile();
        await Promise.all([
            one.writeJSON('hypervideos/1/annotations/one.json', [{ by: 'one' }]),
            two.writeJSON('hypervideos/1/annotations/two.json', [{ by: 'two' }])
        ]);
        const files = HTMLFormat.readProject(handle.store.data).files;
        assert.deepStrictEqual(files['hypervideos/1/annotations/one.json'], [{ by: 'one' }]);
        assert.deepStrictEqual(files['hypervideos/1/annotations/two.json'], [{ by: 'two' }]);
    });

    test('project file: a path seen and then deleted in another tab is not unchanged', async () => {
        const { one, two } = await projectFile();
        await one.readJSON('hypervideos/1/annotations/two.json');
        await two.deleteFile('hypervideos/1/annotations/two.json');
        assert.equal(await one.isUnchanged('hypervideos/1/annotations/two.json'), false);
    });

});

