/*
 * Extracts the data the pages in examples/ pass to FrameTrail.init() and
 * writes it to tests/fixtures/examples/ as validation cases, one file per page.
 * Run it after changing an example:
 *
 *     node tests/extract-examples.mjs
 *
 * run-js.mjs extracts again and fails while the fixtures differ from the pages.
 *
 * The inline <script>s of each page run in a sandbox (node:vm) in which
 * FrameTrail.init() only records its options; the DOM is a stub. Math.random()
 * and the clock are fixed there, so a page that makes up data gives the same
 * data every time.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EXAMPLES_DIR = path.join(ROOT, 'examples');
export const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures', 'examples');


const FIXED_NOW = Date.UTC(2026, 0, 1);

class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
    static now() { return FIXED_NOW; }
}

// Math with a seeded Math.random() (mulberry32).
function seededMath(seed) {
    const math = Object.create(Math);
    math.random = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return math;
}

// The options of every FrameTrail.init() call on a page.
function initCalls(html, file) {

    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]),
          calls   = [],
          noop    = () => {},
          stub    = new Proxy(function() {}, {
              get: (target, key) => (key === Symbol.toPrimitive ? () => '' : stub),
              apply: () => stub
          });

    const sandbox = {
        FrameTrail: {
            init: (options) => {
                calls.push(JSON.parse(JSON.stringify(options, (key, value) => (typeof value === 'function' ? undefined : value))));
                return stub;
            },
            autoInit: noop,
            registerExtension: noop
        },
        console, JSON,
        Math: seededMath(1),
        Date: FixedDate,
        setTimeout: (fn) => fn(),
        clearTimeout: noop,
        fetch: () => new Promise(noop),
        document: {
            addEventListener: (event, fn) => fn(),
            querySelector: () => stub,
            querySelectorAll: () => [],
            getElementById: () => stub,
            createElement: () => stub,
            body: stub
        }
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = (event, fn) => { if (event === 'load' || event === 'DOMContentLoaded') { fn(); } };

    vm.createContext(sandbox);
    for (const script of scripts) {
        try {
            vm.runInContext(script, sandbox, { timeout: 2000 });
        } catch (e) {
            throw new Error(file + ': ' + e.message);
        }
    }

    return calls;

}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isItemList = (value) => Array.isArray(value) && value.every(isObject);

// The documents in one call's options, each with the schema it follows.
function casesOf(options, prefix) {

    const cases = [];

    if (isObject(options.config)) {
        cases.push({ name: prefix + 'config', schema: 'config.schema.json', data: options.config });
    }
    (Array.isArray(options.contents) ? options.contents : []).forEach((content, i) => {
        if (isObject(content.hypervideo)) {
            cases.push({ name: prefix + 'contents[' + i + '].hypervideo', schema: 'hypervideo.schema.json', data: content.hypervideo });
        }
        if (isItemList(content.annotations)) {
            cases.push({ name: prefix + 'contents[' + i + '].annotations', schema: 'annotation-file.schema.json', data: content.annotations });
        }
    });
    if (isItemList(options.annotations)) {
        cases.push({ name: prefix + 'annotations', schema: 'annotation-file.schema.json', data: options.annotations });
    }
    (Array.isArray(options.resources) ? options.resources : []).forEach((resources, i) => {
        if (isObject(resources.data)) {
            cases.push({ name: prefix + 'resources[' + i + '].data', schema: 'resources-index.schema.json', data: { resources: resources.data } });
        }
    });

    return cases;

}

/**
 * The fixture of every page in examples/ that passes data to FrameTrail.init():
 * { '<page>.json': { description, cases } }.
 */
export function extractExamples() {

    const fixtures = {};

    for (const file of fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.html')).sort()) {
        const calls = initCalls(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'), file),
              cases = calls.flatMap((options, i) => casesOf(options, calls.length > 1 ? 'init[' + i + '].' : ''));
        if (cases.length) {
            fixtures[file.replace(/\.html$/, '.json')] = {
                description: 'The data examples/' + file + ' passes to FrameTrail.init(). Written by tests/extract-examples.mjs; change the page, not this file.',
                cases
            };
        }
    }

    return fixtures;

}

export function serialize(fixture) {
    return JSON.stringify(fixture, null, 4) + '\n';
}


if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {

    const fixtures = extractExamples();

    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    for (const file of fs.readdirSync(FIXTURES_DIR)) {
        if (!fixtures[file]) { fs.rmSync(path.join(FIXTURES_DIR, file)); }
    }
    for (const [file, fixture] of Object.entries(fixtures)) {
        fs.writeFileSync(path.join(FIXTURES_DIR, file), serialize(fixture));
        console.log(path.relative(ROOT, path.join(FIXTURES_DIR, file)) + ': ' + fixture.cases.map(c => c.name).join(', '));
    }

}
