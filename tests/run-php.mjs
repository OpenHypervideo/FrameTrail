/*
 * FrameTrail's server contract: the PHP backend in src/_server/ against a
 * throwaway data folder, served by PHP's built-in web server — the codes and
 * versions the client relies on to never overwrite somebody else's work.
 * No dependencies, Node 20 or later, and php (7.4 or later) on PATH:
 *
 *     node tests/run-php.mjs
 *
 * Without php the tests are skipped with a notice. The data folder
 * (src/_data-test-<…>/) is made through the setup actions and removed
 * afterwards. Checked:
 *
 * - writes without a session are refused with code 1;
 * - compare-and-swap (code 7) of every shared write: hypervideoChange
 *   (meta.lastchanged), annotationfileSave (the index entry's lastchanged),
 *   configChange (lastchanged), globalCSSChange, overviewMapChange
 *   (overviewMap.lastchanged);
 * - the collaboration lock: claim, held by another (4), takeover refused while
 *   the holder has unsaved changes (5), takeover; lastWriter names who wrote;
 * - personal API tokens: a token writes as its user and cannot manage the
 *   account (403);
 * - a session belongs to the data folder it was opened for, also when its id
 *   is sent under another folder's cookie name;
 * - a change of the video source changes the version of every annotation
 *   file it rewrites, so their owners' next saves do not undo it;
 * - tags: any signed-in user adds one, never over an existing id; only admins
 *   change (written with one label) and delete them, a tag in use only when
 *   asked to.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = path.join(ROOT, 'src');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'data', 'all-types');

const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.log('# php is not on PATH: the server contract tests are skipped.');
    process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 4));

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

let server, base;
const folders = [];

/** A data folder made through setup: Admin A (1, admin), User B (2), Admin C (3), and the all-types hypervideo as 1. */
async function makeDataFolder() {

    const name = '_data-test-' + process.pid + '-' + folders.length;
    const dir  = path.join(SRC, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    folders.push(dir);

    const folder = { name, dir, dataPath: '/' + name + '/' };
    const setup  = new Client(folder);
    const check  = await setup.post({ a: 'setupCheckDetailed' });
    const init   = await setup.post({ a: 'setupInit', csrf: check.csrf, name: 'Admin A', mail: 'a@example.org', passwd: 'adminadmin' });
    assert.equal(String(init.code), '1', 'setupInit: ' + JSON.stringify(init));

    writeJSON(path.join(dir, 'config.json'), { userNeedsConfirmation: false, apiTokens: true, defaultLanguage: 'en', lastchanged: Date.now() });

    await new Client(folder).post({ a: 'userRegister', name: 'User B', mail: 'b@example.org', passwd: 'userbuser' });
    await new Client(folder).post({ a: 'userRegister', name: 'Admin C', mail: 'c@example.org', passwd: 'admincadmin' });
    const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
    await a.post({ a: 'userChange', userID: '3', role: 'admin', active: '1' });

    fs.cpSync(path.join(FIXTURE, 'hypervideos', '1'), path.join(dir, 'hypervideos', '1'), { recursive: true });
    const hv = readJSON(path.join(dir, 'hypervideos', '1', 'hypervideo.json'));
    hv.meta.creatorId = '1';
    writeJSON(path.join(dir, 'hypervideos', '1', 'hypervideo.json'), hv);
    writeJSON(path.join(dir, 'hypervideos', '_index.json'), { 'hypervideo-increment': 1, hypervideos: { 1: './1' } });

    return folder;

}

class Client {

    constructor(folder) { this.folder = folder; this.cookies = new Map(); this.bearer = null; }

    static async signedIn(folder, mail, passwd) {
        const client = new Client(folder);
        const answer = await client.post({ a: 'userLogin', mail, passwd });
        assert.equal(String(answer.code), '0', 'userLogin ' + mail + ': ' + JSON.stringify(answer));
        return client;
    }

    async post(params, folder = this.folder) {
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (this.cookies.size) { headers.Cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; '); }
        if (this.bearer) { headers.Authorization = 'Bearer ' + this.bearer; }
        const body = new URLSearchParams(Object.assign({ dataPath: folder.dataPath }, params));
        const res  = await fetch(base + '/_server/ajaxServer.php', { method: 'POST', headers, body });
        for (const cookie of res.headers.getSetCookie()) {
            const [pair] = cookie.split(';');
            const at = pair.indexOf('=');
            const key = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
            if (value === '' || value === 'deleted') { this.cookies.delete(key); } else { this.cookies.set(key, value); }
        }
        const text = await res.text();
        try { return Object.assign(JSON.parse(text), { httpStatus: res.status }); }
        catch (e) { return { httpStatus: res.status, text }; }
    }

}

const hypervideoFile = (folder) => path.join(folder.dir, 'hypervideos', '1', 'hypervideo.json');
const annotationIndexFile = (folder) => path.join(folder.dir, 'hypervideos', '1', 'annotations', '_index.json');

/** hypervideoChange as the client sends it: the whole document, the version it was read at. */
function changeHypervideo(client, folder, change, baseVersion) {
    const hv = readJSON(hypervideoFile(folder));
    const base = (baseVersion === undefined) ? hv.meta.lastchanged : baseVersion;
    change(hv);
    hv.meta.lastchanged = Date.now();
    return client.post({ a: 'hypervideoChange', hypervideoID: '1', src: JSON.stringify(hv, null, 4), baseVersion: String(base) });
}

function saveAnnotations(client, uid, items, baseVersion) {
    return client.post({
        a: 'annotationfileSave', hypervideoID: '1', annotationfileID: uid, action: 'save',
        name: 'Admin A', description: "Admin A's annotations", hidden: 'false',
        src: JSON.stringify(items, null, 4), baseVersion: String(baseVersion)
    });
}

before(async () => {
    const port = await freePort();
    base = 'http://127.0.0.1:' + port;
    server = spawn('php', ['-S', '127.0.0.1:' + port, '-t', SRC], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
        try { await fetch(base + '/favico.png'); return; } catch (e) { await sleep(100); }
    }
    throw new Error('php -S did not start');
});

after(() => {
    if (server) { server.kill(); }
    for (const dir of folders) { fs.rmSync(dir, { recursive: true, force: true }); }
});


describe('server contract (src/_server/)', () => {

    let folder;
    before(async () => { folder = await makeDataFolder(); });

    test('writes without a session are refused with code 1', async () => {
        const anonymous = new Client(folder);
        const hv = readJSON(hypervideoFile(folder));
        for (const params of [
            { a: 'hypervideoChange', hypervideoID: '1', src: JSON.stringify(hv), baseVersion: String(hv.meta.lastchanged) },
            { a: 'annotationfileSave', hypervideoID: '1', annotationfileID: '1', action: 'save', name: 'Nobody', description: 'x', hidden: 'false', src: '[]', baseVersion: '0' },
            { a: 'configChange', src: '{}', baseVersion: '' },
            { a: 'globalCSSChange', src: 'body {}', baseVersion: '' },
            { a: 'overviewMapChange', src: '{}', baseVersion: '' },
            { a: 'collabSync', sessions: JSON.stringify([{ scope: 'hypervideo', scopeId: '1' }]) }
        ]) {
            const answer = await anonymous.post(params);
            assert.equal(String(answer.code), '1', params.a + ': ' + JSON.stringify(answer));
        }
    });

    test('hypervideoChange: compare-and-swap on meta.lastchanged (code 7)', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const stale = readJSON(hypervideoFile(folder)).meta.lastchanged;
        const first = await changeHypervideo(a, folder, (hv) => { hv.meta.name = 'First'; });
        assert.equal(String(first.code), '0', JSON.stringify(first));
        const second = await changeHypervideo(a, folder, (hv) => { hv.meta.name = 'Second'; }, stale);
        assert.equal(String(second.code), '7', JSON.stringify(second));
        assert.equal(readJSON(hypervideoFile(folder)).meta.name, 'First');
    });

    test('annotationfileSave: compare-and-swap on the index entry (code 7)', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const entry = readJSON(annotationIndexFile(folder)).annotationfiles['1'];
        const items = readJSON(path.join(folder.dir, 'hypervideos', '1', 'annotations', '1.json'));
        const first = await saveAnnotations(a, '1', items, entry.lastchanged);
        assert.equal(String(first.code), '0', JSON.stringify(first));
        const second = await saveAnnotations(a, '1', items, entry.lastchanged);
        assert.equal(String(second.code), '7', JSON.stringify(second));
    });

    test('configChange: compare-and-swap on lastchanged (code 7)', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const config = readJSON(path.join(folder.dir, 'config.json'));
        const first = await a.post({ a: 'configChange', src: JSON.stringify(Object.assign({}, config, { overviewTitle: 'First' })), baseVersion: String(config.lastchanged) });
        assert.equal(String(first.code), '0', JSON.stringify(first));
        const second = await a.post({ a: 'configChange', src: JSON.stringify(Object.assign({}, config, { overviewTitle: 'Second' })), baseVersion: String(config.lastchanged) });
        assert.equal(String(second.code), '7', JSON.stringify(second));
        assert.equal(readJSON(path.join(folder.dir, 'config.json')).overviewTitle, 'First');
    });

    test('globalCSSChange: compare-and-swap, also for two writes within a second (code 7)', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const version = async () => (await a.post({ a: 'configVersions' })).response.css;
        assert.equal(String((await a.post({ a: 'globalCSSChange', src: '.zero {}', baseVersion: String(await version()) })).code), '0');
        // Read right after a write, so that the next two land within the same second as it.
        const stale = await version();
        const first = await a.post({ a: 'globalCSSChange', src: '.first {}', baseVersion: String(stale) });
        assert.equal(String(first.code), '0', JSON.stringify(first));
        const second = await a.post({ a: 'globalCSSChange', src: '.second {}', baseVersion: String(stale) });
        assert.equal(String(second.code), '7', JSON.stringify(second));
        assert.equal(fs.readFileSync(path.join(folder.dir, 'custom.css'), 'utf8'), '.first {}');
    });

    test('overviewMapChange: compare-and-swap on overviewMap.lastchanged (code 7)', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const first = await a.post({ a: 'overviewMapChange', src: JSON.stringify({ background: '', markers: {} }), baseVersion: '' });
        assert.equal(String(first.code), '0', JSON.stringify(first));
        const version = readJSON(path.join(folder.dir, 'hypervideos', '_index.json')).overviewMap.lastchanged;
        const second = await a.post({ a: 'overviewMapChange', src: JSON.stringify({ background: 'two.png', markers: {} }), baseVersion: String(version) });
        assert.equal(String(second.code), '0', JSON.stringify(second));
        const third = await a.post({ a: 'overviewMapChange', src: JSON.stringify({ background: 'three.png', markers: {} }), baseVersion: String(version) });
        assert.equal(String(third.code), '7', JSON.stringify(third));
    });

    test('the lock: held by another (4), takeover refused while the holder has unsaved changes (5), takeover', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const c = await Client.signedIn(folder, 'c@example.org', 'admincadmin');
        const sync = (client, unsaved) => client.post({ a: 'collabSync', sessions: JSON.stringify([{ scope: 'hypervideo', scopeId: '1', editing: true, unsaved }]) });

        assert.equal(String((await a.post({ a: 'collabLock', scope: 'hypervideo', scopeId: '1', op: 'claim' })).code), '0');
        assert.equal(String((await c.post({ a: 'collabLock', scope: 'hypervideo', scopeId: '1', op: 'claim' })).code), '4');

        await sync(a, true);
        assert.equal(String((await c.post({ a: 'collabLock', scope: 'hypervideo', scopeId: '1', op: 'takeover' })).code), '5');

        await sync(a, false);
        const takeover = await c.post({ a: 'collabLock', scope: 'hypervideo', scopeId: '1', op: 'takeover' });
        assert.equal(String(takeover.code), '0', JSON.stringify(takeover));
        assert.equal(String(takeover.response.lock.holderId), '3');

        await c.post({ a: 'collabLock', scope: 'hypervideo', scopeId: '1', op: 'release' });
    });

    test('lastWriter names who wrote', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const c = await Client.signedIn(folder, 'c@example.org', 'admincadmin');
        const written = await changeHypervideo(c, folder, (hv) => { hv.meta.description = 'by C'; });
        assert.equal(String(written.code), '0', JSON.stringify(written));
        const answer = await a.post({ a: 'collabSync', sessions: JSON.stringify([{ scope: 'hypervideo', scopeId: '1' }]) });
        const response = answer.response['hypervideo:1'];
        assert.equal(String(response.lastWriter.id), '3', JSON.stringify(response));
    });

    test('personal API tokens: a token writes as its user and cannot manage the account', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const created = await a.post({ a: 'userTokenCreate', label: 'contract test' });
        assert.equal(String(created.code), '0', JSON.stringify(created));
        const script = new Client(folder);
        script.bearer = created.response.token;
        const entry = readJSON(annotationIndexFile(folder)).annotationfiles['1'];
        const items = readJSON(path.join(folder.dir, 'hypervideos', '1', 'annotations', '1.json'));
        const written = await saveAnnotations(script, '1', items, entry.lastchanged);
        assert.equal(String(written.code), '0', JSON.stringify(written));
        const refused = await script.post({ a: 'userTokenCreate', label: 'from a token' });
        assert.equal(String(refused.code), '403', JSON.stringify(refused));
    });

    test('a session belongs to the data folder it was opened for', async () => {
        const other = await makeDataFolder();
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const there = await a.post({ a: 'userCheckLogin' }, other);
        assert.equal(String(there.code), '0', 'the other folder must see no session: ' + JSON.stringify(there).slice(0, 200));
        const here = await a.post({ a: 'userCheckLogin' });
        assert.equal(String(here.code), '1', 'and the session goes on where it was opened');

        // The client decides which id it sends under which cookie name: the id of this folder's session,
        // sent under the other folder's name, must not be its user (Admin A, id 1) there either.
        const cookieName = async (f) => {
            const client = new Client(f);
            await client.post({ a: 'userCheckLogin' });
            return [...client.cookies.keys()].find((key) => key.startsWith('FTSESS'));
        };
        const ownName = await cookieName(folder), otherName = await cookieName(other);
        assert.notEqual(ownName, otherName);
        const replay = new Client(other);
        replay.cookies.set(otherName, a.cookies.get(ownName));
        const replayed = await replay.post({ a: 'userCheckLogin' });
        assert.equal(String(replayed.code), '0', 'a session sent under another folder\'s cookie name must be no session there: ' + JSON.stringify(replayed).slice(0, 200));
        const still = await a.post({ a: 'userCheckLogin' });
        assert.equal(String(still.code), '1', 'and the session it was taken from goes on');
    });

    test('a change of the video source changes the version of every annotation file it rewrites', async () => {
        const a = await Client.signedIn(folder, 'a@example.org', 'adminadmin');
        const before = readJSON(annotationIndexFile(folder)).annotationfiles['1'].lastchanged;
        const changed = await a.post({ a: 'updateAnnotationSources', hypervideoID: '1', newSourcePath: 'contract-test.mp4' });
        assert.equal(String(changed.code), '0', JSON.stringify(changed));
        const after = readJSON(annotationIndexFile(folder)).annotationfiles['1'].lastchanged;
        assert.notEqual(String(after), String(before), 'the owner\'s next save must meet a new version');
    });

    test('tags: any signed-in user adds one; only admins change and delete them, a tag in use only when asked to', async () => {
        const anonymous = new Client(folder),
              a    = await Client.signedIn(folder, 'a@example.org', 'adminadmin'),
              b    = await Client.signedIn(folder, 'b@example.org', 'userbuser'),
              file = path.join(folder.dir, 'tagdefinitions.json'),
              code = async (client, params) => String((await client.post(params)).code);
        writeJSON(file, { lecture: { en: { label: 'Lecture', description: '' }, de: { label: 'Vorlesung', description: '' } }, demo: { label: 'Demo' } });

        assert.equal(await code(anonymous, { a: 'tagAdd', tagName: 'x-tag', label: 'X' }), '1');
        const added = await b.post({ a: 'tagAdd', tagName: 'fact-check', label: ' Fact check ', description: '' });
        assert.equal(String(added.code), '0', JSON.stringify(added));
        assert.deepStrictEqual(readJSON(file)['fact-check'], { label: 'Fact check', description: '' });
        const again = await b.post({ a: 'tagAdd', tagName: 'fact-check', label: 'Other' });
        assert.equal(String(again.code), '5', JSON.stringify(again));
        assert.equal(again.response['fact-check'].label, 'Fact check', 'an existing tag is never changed by adding');
        assert.equal(await code(b, { a: 'tagAdd', tagName: 'a"b', label: 'Quote' }), '3');
        assert.equal(await code(b, { a: 'tagAdd', tagName: 'blank', label: '   ' }), '4');
        assert.equal(await code(b, { a: 'tagSet', tagName: 'fact-check', label: 'Mine' }), '1', 'only admins change tags');
        assert.equal(await code(b, { a: 'tagDelete', tagName: 'fact-check' }), '1');
        assert.equal(await code(b, { a: 'tagUsage' }), '1');

        assert.equal(await code(a, { a: 'tagSet', tagName: 'lecture', label: 'Lecture', description: 'Hall' }), '0');
        assert.deepStrictEqual(readJSON(file).lecture, { label: 'Lecture', description: 'Hall' }, 'a label per language becomes one label');

        const items     = fs.readdirSync(path.join(folder.dir, 'hypervideos', '1', 'annotations')).filter((name) => name !== '_index.json')
                            .flatMap((name) => readJSON(path.join(folder.dir, 'hypervideos', '1', 'annotations', name)))
                            .concat(readJSON(hypervideoFile(folder)).contents),
              demoCount = items.filter((item) => (item['frametrail:tags'] || []).includes('demo')).length;
        assert.ok(demoCount > 0, 'the fixture tags items with demo');
        const usage = await a.post({ a: 'tagUsage' });
        assert.deepStrictEqual(usage.response.demo, { count: demoCount, hypervideos: ['1'] }, JSON.stringify(usage));

        const refused = await a.post({ a: 'tagDelete', tagName: 'demo' });
        assert.equal(String(refused.code), '5', JSON.stringify(refused));
        assert.equal(refused.response.count, demoCount);
        assert.equal(await code(a, { a: 'tagDelete', tagName: 'demo', force: '1' }), '0');
        assert.ok(!('demo' in readJSON(file)), 'deleted');
        assert.equal(await code(a, { a: 'tagDelete', tagName: 'fact-check' }), '0', 'a tag nothing uses needs no force');
        assert.equal(await code(a, { a: 'tagDelete', tagName: 'lecture' }), '0');
        assert.equal(fs.readFileSync(file, 'utf8').trim(), '{}', "no tags left is {}, not PHP's []");
    });

});
