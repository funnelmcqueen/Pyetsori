'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var Q = require('../public/questionnaire.js');
var core = require('../lib/submit-core.js');
var subs = require('../lib/submissions.js');
var storageLib = require('../lib/storage.js');
var H = require('./helpers.js');

var FIXED = new Date('2026-10-05T10:00:00Z');
function fileEnv(dir, extra) { return Object.assign({ STORAGE_DRIVER: 'file', STORAGE_DIR: dir }, extra || {}); }
function handler(env, extra) { return core.createSubmitHandler(Object.assign({ env: env, now: function () { return FIXED; }, log: function () {} }, extra || {})); }
function subDir(dir, key) { return path.join(dir, 'xau-q', 'submissions', key); }

test('dorëzimi ruhet i plotë dhe konfirmohet me ID dhe datë nga serveri', async function () {
  var dir = H.tmpDir();
  var p = H.submitPayload();
  var r = await handler(fileEnv(dir))(H.jsonReq(p));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true); assert.equal(r.body.simulated, false); assert.equal(r.body.stored, true);
  assert.match(r.body.id, /^XAU-20261005-[A-Z2-9]{6}$/);
  assert.equal(r.body.submittedAt, FIXED.toISOString());
  assert.deepEqual(H.listFiles(subDir(dir, p.submissionId)), ['fotot/shembulli-1-buy-win.jpg', 'intent.json', 'manifest.json', 'pergjigjet.json', 'specifikimi.txt']);
  var stored = JSON.parse(fs.readFileSync(path.join(subDir(dir, p.submissionId), 'pergjigjet.json'), 'utf8'));
  assert.deepEqual(stored.state, p.state, 'përgjigjet ruhen saktësisht si u dorëzuan');
  assert.equal(stored.schemaVersion, Q.SCHEMA_VERSION);
  assert.equal(stored.id, r.body.id);
  assert.equal(stored.photosIncluded, false);
  assert.ok(Buffer.from(H.TINY_JPEG_B64, 'base64').equals(fs.readFileSync(path.join(subDir(dir, p.submissionId), 'fotot', 'shembulli-1-buy-win.jpg'))));
  var spec = fs.readFileSync(path.join(subDir(dir, p.submissionId), 'specifikimi.txt'), 'utf8');
  assert.equal(spec, Q.buildSpec(p.state, { submissionId: r.body.id, date: '2026-10-05', submitted: true, photoNames: Q.photoNames(p.state), photoCount: 1 }) + '\n');
  assert.match(spec, /Photos: 1 \(NOT included in this text file/);
});

test('riprovimet: e njëjta ID, asnjë kopje e dyfishtë, përmbajtja e pandryshuar', async function () {
  var dir = H.tmpDir();
  var h = handler(fileEnv(dir));
  var p = H.submitPayload();
  var a = await h(H.jsonReq(p));
  var before = H.listFiles(dir).map(function (f) { return f + ':' + fs.readFileSync(path.join(dir, f)).toString('base64'); });
  var b = await handler(fileEnv(dir))(H.jsonReq(p));
  assert.equal(b.status, 200);
  assert.equal(b.body.id, a.body.id);
  assert.equal(b.body.submittedAt, a.body.submittedAt);
  var after = H.listFiles(dir).map(function (f) { return f + ':' + fs.readFileSync(path.join(dir, f)).toString('base64'); });
  assert.deepEqual(after, before, 'asnjë skedar nuk ndryshon dhe nuk shtohet');
  var storage = storageLib.createStorage(fileEnv(dir));
  assert.equal((await subs.listSubmissions(storage)).length, 1);
});

test('i njëjti çelës me përmbajtje tjetër refuzohet (409)', async function () {
  var dir = H.tmpDir();
  var h = handler(fileEnv(dir));
  var p = H.submitPayload();
  await h(H.jsonReq(p));
  var q = JSON.parse(JSON.stringify(p));
  q.state.answers.notes = 'ndryshim';
  var r = await h(H.jsonReq(q));
  assert.equal(r.status, 409);
});

test('dështim gjatë ruajtjes: nuk konfirmohet, nuk shfaqet në listë, riprovimi e kryen me të njëjtën ID', async function () {
  var dir = H.tmpDir();
  var real = storageLib.fileDriver(dir);
  var failOnce = true;
  var flaky = Object.assign({}, real, { put: async function (key, body, ct) { if (failOnce && /specifikimi\.txt$/.test(key)) { failOnce = false; throw new Error('rrjeti ra'); } return real.put(key, body, ct); } });
  var env = fileEnv(dir);
  var origCreate = storageLib.createStorage;
  var p = H.submitPayload();
  var h = core.createSubmitHandler({ env: env, now: function () { return FIXED; }, log: function () {}, deps: {} });
  storageLib.createStorage = function () { return { mode: 'file', driver: flaky, prefix: 'xau-q/', error: null }; };
  try {
    var r1 = await h(H.jsonReq(p));
    assert.equal(r1.status, 503);
    assert.equal(r1.body.ok, false);
    assert.equal((await subs.listSubmissions({ driver: real, prefix: 'xau-q/' })).length, 0);
    var intent = JSON.parse(fs.readFileSync(path.join(subDir(dir, p.submissionId), 'intent.json'), 'utf8'));
    var r2 = await h(H.jsonReq(p));
    assert.equal(r2.status, 200);
    assert.equal(r2.body.id, intent.id, 'riprovimi përdor ID-në e caktuar herën e parë');
    assert.equal((await subs.listSubmissions({ driver: real, prefix: 'xau-q/' })).length, 1);
  } finally { storageLib.createStorage = origCreate; }
});

test('verifikimi: nëse një skedar nuk gjendet pas shkrimit, dorëzimi nuk konfirmohet', async function () {
  var dir = H.tmpDir();
  var real = storageLib.fileDriver(dir);
  var lossy = Object.assign({}, real, { head: async function (k) { return /fotot\//.test(k) ? null : real.head(k); } });
  var origCreate = storageLib.createStorage;
  storageLib.createStorage = function () { return { mode: 'file', driver: lossy, prefix: 'xau-q/', error: null }; };
  try {
    var p = H.submitPayload();
    var r = await handler(fileEnv(dir))(H.jsonReq(p));
    assert.equal(r.status, 503);
    assert.ok(!fs.existsSync(path.join(subDir(dir, p.submissionId), 'manifest.json')), 'pa manifest: nuk shfaqet si i kryer');
  } finally { storageLib.createStorage = origCreate; }
});

test('pa konfigurim ruajtjeje: simulohet qartë dhe asgjë nuk ruhet', async function () {
  var r = await handler({})(H.jsonReq(H.submitPayload()));
  assert.equal(r.status, 200);
  assert.equal(r.body.simulated, true);
  assert.equal(r.body.stored, false);
  assert.equal(r.body.id, undefined);
});

test('në Vercel, ruajtja në skedarë të përkohshëm refuzohet', async function () {
  var dir = H.tmpDir();
  var r = await handler(fileEnv(dir, { VERCEL: '1' }))(H.jsonReq(H.submitPayload()));
  assert.equal(r.status, 503);
  assert.deepEqual(H.listFiles(dir), []);
  assert.equal(storageLib.createStorage({ VERCEL: '1', STORAGE_DRIVER: 'file' }).mode, 'error');
  assert.equal(storageLib.createStorage({ STORAGE_DRIVER: 'vercel-blob' }).mode, 'error', 'pa lidhje me store nuk pretendohet ruajtje');
});

test('tekstet nuk shkurtohen kurrë: tekst brenda kufirit ruhet i plotë, tekst mbi kufirin refuzohet', async function () {
  var dir = H.tmpDir();
  var h = handler(fileEnv(dir));
  var ok = H.submitPayload();
  ok.state.answers.own_words = 'ë'.repeat(Q.MAX_LEN.textarea);
  var r = await h(H.jsonReq(ok));
  assert.equal(r.status, 200);
  var stored = JSON.parse(fs.readFileSync(path.join(subDir(dir, ok.submissionId), 'pergjigjet.json'), 'utf8'));
  assert.equal(stored.state.answers.own_words.length, Q.MAX_LEN.textarea);
  var long = H.submitPayload();
  long.state.answers.own_words = 'x'.repeat(Q.MAX_LEN.textarea + 1);
  var r2 = await h(H.jsonReq(long));
  assert.equal(r2.status, 422);
  assert.match(r2.body.error, /shumë i gjatë/);
  assert.ok(!fs.existsSync(subDir(dir, long.submissionId)));
  var bad = H.submitPayload(); bad.state.answers.tf_signal = 'H9';
  assert.equal((await h(H.jsonReq(bad))).status, 422);
  var extra = H.submitPayload(); extra.state.answers.hacked = 'x';
  assert.equal((await h(H.jsonReq(extra))).status, 422);
  var name = H.submitPayload(); name.state.answers.client_name = 'Emër';
  assert.equal((await h(H.jsonReq(name))).status, 422, 'të dhënat personale nuk pranohen');
});

test('kontrollet e kërkesës dhe të fotove', async function () {
  var dir = H.tmpDir();
  var h = handler(fileEnv(dir));
  assert.equal((await h(Object.assign(H.jsonReq(H.submitPayload()), { method: 'GET' }))).status, 405);
  assert.equal((await h(H.jsonReq(H.submitPayload(), { over: { headers: { 'content-type': 'text/plain' } } }))).status, 415);
  assert.equal((await h(H.jsonReq('{oops'))).status, 400);
  assert.equal((await h(H.jsonReq(H.submitPayload({ submissionId: 'abc' })))).status, 400);
  assert.equal((await h(H.jsonReq(H.submitPayload({ schemaVersion: 1 })))).status, 409);
  assert.equal((await h(H.jsonReq(H.submitPayload({ photos: [{ id: 'p1', type: 'image/gif', data: H.TINY_JPEG_B64 }] })))).status, 415);
  assert.equal((await h(H.jsonReq(H.submitPayload({ photos: [{ id: 'p1', type: 'image/jpeg', data: Buffer.from('jo foto').toString('base64') }] })))).status, 415);
  var huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(core.LIMITS.photoBytes + 1)]).toString('base64');
  assert.equal((await h(H.jsonReq(H.submitPayload({ photos: [{ id: 'p1', type: 'image/jpeg', data: huge }] })))).status, 413);
  assert.equal((await h(H.jsonReq(H.submitPayload({ photos: [{ id: 'zzz', type: 'image/jpeg', data: H.TINY_JPEG_B64 }] })))).status, 422);
  var rm = await h(H.jsonReq(H.submitPayload({ photos: [] })));
  assert.equal(rm.status, 422); assert.match(rm.body.error, /Mungojnë 1 foto/);
  var noFacts = H.submitPayload(); delete noFacts.state.answers.facts_review;
  var r = await h(H.jsonReq(noFacts));
  assert.equal(r.status, 422); assert.ok(r.body.fields.indexOf('facts_review') >= 0);
  assert.deepEqual(H.listFiles(dir), [], 'asgjë nuk ruhet kur validimi dështon');
});

test('dy kërkesa njëkohësisht me të njëjtin çelës: vetëm njëra ruan', async function () {
  var dir = H.tmpDir();
  var real = storageLib.fileDriver(dir);
  var release;
  var gate = new Promise(function (r) { release = r; });
  var slow = Object.assign({}, real, { put: async function (k, b, c) { await gate; return real.put(k, b, c); } });
  var origCreate = storageLib.createStorage;
  storageLib.createStorage = function () { return { mode: 'file', driver: slow, prefix: 'xau-q/', error: null }; };
  try {
    var h = handler(fileEnv(dir));
    var p = H.submitPayload();
    var first = h(H.jsonReq(p));
    await new Promise(function (r) { setTimeout(r, 20); });
    var second = await h(H.jsonReq(p));
    assert.equal(second.status, 409);
    release();
    assert.equal((await first).status, 200);
  } finally { storageLib.createStorage = origCreate; }
});

test('kufizimi i kërkesave sipas IP-së', async function () {
  var dir = H.tmpDir();
  var h = handler(fileEnv(dir));
  var last;
  for (var i = 0; i < core.LIMITS.rateMax + 1; i++) last = await h(H.jsonReq(H.submitPayload(), { ip: '7.7.7.7' }));
  assert.equal(last.status, 429);
  assert.equal((await h(H.jsonReq(H.submitPayload(), { ip: '8.8.8.8' }))).status, 200);
});

test('Vercel Private Blob: ruajtje private, lexim dhe listë (me SDK të simuluar)', async function () {
  var sdk = H.fakeBlobSdk();
  var env = { STORAGE_DRIVER: 'vercel-blob', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test' };
  var h = core.createSubmitHandler({ env: env, deps: { blobSdk: sdk }, now: function () { return FIXED; }, log: function () {} });
  var p = H.submitPayload({ mode: 'test' });
  var r = await h(H.jsonReq(p));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, 'test');
  var keys = Array.from(sdk.store.keys()).sort();
  assert.deepEqual(keys, ['fotot/shembulli-1-buy-win.jpg', 'intent.json', 'manifest.json', 'pergjigjet.json', 'specifikimi.txt'].map(function (k) { return 'xau-q/submissions/' + p.submissionId + '/' + k; }).sort());
  var storage = storageLib.createStorage(env, { blobSdk: sdk });
  var list = await subs.listSubmissions(storage);
  assert.equal(list.length, 1); assert.equal(list[0].mode, 'test');
  var read = await subs.readSubmission(storage, p.submissionId);
  assert.deepEqual(read.answers.state, p.state);
});

test('njoftimi opsional: pa përgjigje e foto, nuk ndikon në konfirmim, nuk përsëritet në riprovim', async function () {
  var dir = H.tmpDir();
  var calls = [];
  var env = fileEnv(dir, { NOTIFY_EMAIL_TO: 'pronari@test.dev', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Pyetësori <p@test.dev>' });
  var h = core.createSubmitHandler({ env: env, now: function () { return FIXED; }, log: function () {}, deps: { fetch: async function (u, init) { calls.push(JSON.parse(init.body)); return { ok: false, status: 500 }; } } });
  var p = H.submitPayload();
  var r = await h(H.jsonReq(p));
  assert.equal(r.status, 200, 'njoftimi i dështuar nuk e prish dorëzimin');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attachments, undefined);
  assert.ok(calls[0].text.indexOf('RSI kalon mbi 50') < 0, 'pa përgjigje në email');
  assert.match(calls[0].subject, /Dorëzim i ri: Pyetësori XAUUSD — XAU-/);
  await h(H.jsonReq(p));
  assert.equal(calls.length, 1, 'riprovimi nuk dërgon njoftim të dytë');
});
