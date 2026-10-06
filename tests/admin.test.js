'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fflate = require('fflate');
var Q = require('../public/questionnaire.js');
var submit = require('../lib/submit-core.js');
var admin = require('../lib/admin-core.js');
var H = require('./helpers.js');

var PW = 'fjalekalim-shume-i-gjate-123';
var SECRET = 'sekret-sesioni-shume-i-gjate-0123456789abcdef';
var FIXED = new Date('2026-10-05T10:00:00Z');

async function setup(extraEnv) {
  var dir = H.tmpDir();
  var env = Object.assign({ STORAGE_DRIVER: 'file', STORAGE_DIR: dir, ADMIN_PASSWORD: PW, ADMIN_SESSION_SECRET: SECRET }, extraEnv || {});
  var p = H.submitPayload();
  var r = await submit.createSubmitHandler({ env: env, now: function () { return FIXED; }, log: function () {} })(H.jsonReq(p));
  assert.equal(r.status, 200);
  var clock = { t: Date.now() };
  var h = admin.createAdminHandler({ env: env, delay: async function () {}, nowMs: function () { return clock.t; } });
  return { dir: dir, env: env, p: p, id: r.body.id, h: h, clock: clock, base: path.join(dir, 'xau-q', 'submissions', p.submissionId) };
}
function rq(action, extra) {
  extra = extra || {};
  var q = Object.assign({ action: action }, extra.query || {});
  return { method: extra.method || 'GET', query: q, ip: extra.ip || '2.2.2.2', rawBody: extra.body ? Buffer.from(JSON.stringify(extra.body)) : Buffer.alloc(0), headers: Object.assign({ 'x-xau-admin': '1', host: 'pyetesori.test' }, extra.headers || {}) };
}
async function login(s, extraHeaders) {
  var r = await s.h(rq('login', { method: 'POST', body: { password: PW }, headers: extraHeaders }));
  assert.equal(r.status, 200);
  return r.headers['Set-Cookie'].split(';')[0];
}
function body(r) { return JSON.parse(r.body.toString('utf8')); }

test('paneli pa konfigurim, ose me fjalëkalim të shkurtër, nuk hapet', async function () {
  var h = admin.createAdminHandler({ env: { ADMIN_PASSWORD: 'shkurt', ADMIN_SESSION_SECRET: SECRET } });
  var r = await h(rq('list'));
  assert.equal(r.status, 503);
  assert.match(body(r).problems.join(' '), /16 shenja/);
  assert.equal((await admin.createAdminHandler({ env: {} })(rq('status'))).status, 503);
});

test('pa hyrje: çdo veprim dhe çdo eksport refuzohet në server', async function () {
  var s = await setup();
  var reqs = [rq('status'), rq('list'), rq('get', { query: { key: s.p.submissionId } }), rq('photo', { query: { key: s.p.submissionId, name: 'shembulli-1-buy-win.jpg' } })]
    .concat(['zip', 'txt', 'json'].map(function (f) { return rq('export', { query: { key: s.p.submissionId, format: f } }); }));
  for (var i = 0; i < reqs.length; i++) {
    var r = await s.h(reqs[i]);
    assert.equal(r.status, 401, reqs[i].query.action + ' ' + (reqs[i].query.format || ''));
    assert.ok(!Buffer.isBuffer(r.body) || r.body.toString('utf8').indexOf('RSI') < 0, 'asnjë e dhënë pa hyrje');
  }
  // Cookie i falsifikuar ose i ndryshuar
  var cookie = await login(s);
  var forged = cookie.replace(/\.[^.]+$/, '.AAAA');
  assert.equal((await s.h(rq('list', { headers: { cookie: forged } }))).status, 401);
  assert.equal((await s.h(rq('list', { headers: { cookie: 'xau_admin=abc' } }))).status, 401);
  // Pa header-in e panelit, ose nga një faqe tjetër
  assert.equal((await s.h(rq('list', { headers: { 'x-xau-admin': undefined, cookie: cookie } }))).status, 403);
  assert.equal((await s.h(rq('list', { headers: { cookie: cookie, origin: 'https://evil.test' } }))).status, 403);
});

test('hyrja: fjalëkalimi i gabuar refuzohet, bllokim pas 5 përpjekjeve, cookie HttpOnly dhe SameSite=Strict', async function () {
  var s = await setup();
  var https = { 'x-forwarded-proto': 'https' };
  var bad = await s.h(rq('login', { method: 'POST', body: { password: 'gabim' }, ip: '9.9.9.9', headers: https }));
  assert.equal(bad.status, 401);
  for (var i = 0; i < 4; i++) await s.h(rq('login', { method: 'POST', body: { password: 'gabim' }, ip: '9.9.9.9', headers: https }));
  assert.equal((await s.h(rq('login', { method: 'POST', body: { password: PW }, ip: '9.9.9.9', headers: https }))).status, 429, 'bllokuar edhe me fjalëkalimin e saktë');
  var ok = await s.h(rq('login', { method: 'POST', body: { password: PW }, headers: https }));
  var sc = ok.headers['Set-Cookie'];
  assert.match(sc, /^__Host-xau_admin=/);
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Secure/); assert.match(sc, /Path=\//);
  var cookie = sc.split(';')[0];
  assert.equal((await s.h(rq('list', { headers: Object.assign({ cookie: cookie }, https) }))).status, 200);
  // Sesioni skadon
  s.clock.t += 13 * 3600 * 1000;
  assert.equal((await s.h(rq('list', { headers: Object.assign({ cookie: cookie }, https) }))).status, 401);
  // Dalja fshin cookie-n
  var out = await s.h(rq('logout', { method: 'POST', headers: https }));
  assert.match(out.headers['Set-Cookie'], /Max-Age=0/);
});

test('ndryshimi i fjalëkalimit i anulon sesionet ekzistuese', async function () {
  var s = await setup();
  var cookie = await login(s);
  var h2 = admin.createAdminHandler({ env: Object.assign({}, s.env, { ADMIN_PASSWORD: PW + '-i-ri' }), delay: async function () {} });
  assert.equal((await h2(rq('list', { headers: { cookie: cookie } }))).status, 401);
});

test('lista, leximi dhe foto: të dhënat e ruajtura, jo drafti', async function () {
  var s = await setup();
  var cookie = await login(s);
  var l = body(await s.h(rq('list', { headers: { cookie: cookie } })));
  assert.equal(l.submissions.length, 1);
  var it = l.submissions[0];
  assert.equal(it.id, s.id); assert.equal(it.submittedAt, FIXED.toISOString()); assert.equal(it.photoCount, 1); assert.equal(it.ready, true); assert.equal(it.mode, 'real');
  var g = body(await s.h(rq('get', { query: { key: s.p.submissionId }, headers: { cookie: cookie } })));
  assert.deepEqual(g.answers.state, s.p.state);
  assert.equal(g.spec, fs.readFileSync(path.join(s.base, 'specifikimi.txt'), 'utf8'));
  var ph = await s.h(rq('photo', { query: { key: s.p.submissionId, name: 'shembulli-1-buy-win.jpg' }, headers: { cookie: cookie } }));
  assert.equal(ph.status, 200);
  assert.ok(ph.body.equals(Buffer.from(H.TINY_JPEG_B64, 'base64')));
  // Përpjekje për të dalë nga dosja ose për skedarë që nuk i përkasin dorëzimit
  assert.equal((await s.h(rq('get', { query: { key: '../../etc' }, headers: { cookie: cookie } }))).status, 404);
  assert.equal((await s.h(rq('photo', { query: { key: s.p.submissionId, name: '../manifest.json' }, headers: { cookie: cookie } }))).status, 404);
});

test('eksporti: ZIP, TXT dhe JSON përputhen me dorëzimin e ruajtur dhe kanë datën dhe ID-në në emër', async function () {
  var s = await setup();
  var cookie = await login(s);
  var specBytes = fs.readFileSync(path.join(s.base, 'specifikimi.txt'));
  var jsonBytes = fs.readFileSync(path.join(s.base, 'pergjigjet.json'));
  var photoBytes = fs.readFileSync(path.join(s.base, 'fotot', 'shembulli-1-buy-win.jpg'));
  var expectName = 'pyetesori-xauusd-2026-10-05-' + s.id;

  var txt = await s.h(rq('export', { query: { key: s.p.submissionId, format: 'txt' }, headers: { cookie: cookie } }));
  assert.equal(txt.status, 200);
  assert.equal(txt.headers['Content-Disposition'], 'attachment; filename="' + expectName + '.txt"');
  assert.match(txt.headers['Content-Type'], /text\/plain/);
  assert.ok(txt.body.equals(specBytes));
  assert.match(txt.body.toString('utf8'), /NOT included in this text file/);

  var js = await s.h(rq('export', { query: { key: s.p.submissionId, format: 'json' }, headers: { cookie: cookie } }));
  assert.equal(js.headers['X-Filename'], expectName + '.json');
  assert.ok(js.body.equals(jsonBytes));
  var parsed = JSON.parse(js.body.toString('utf8'));
  assert.equal(parsed.schemaVersion, Q.SCHEMA_VERSION);
  assert.equal(parsed.photosIncluded, false);
  assert.deepEqual(parsed.state, s.p.state);

  var zip = await s.h(rq('export', { query: { key: s.p.submissionId, format: 'zip' }, headers: { cookie: cookie } }));
  assert.equal(zip.status, 200);
  assert.equal(zip.headers['Content-Disposition'], 'attachment; filename="' + expectName + '.zip"');
  var files = fflate.unzipSync(new Uint8Array(zip.body));
  assert.deepEqual(Object.keys(files).sort(), ['fotot/shembulli-1-buy-win.jpg', 'pergjigjet.json', 'specifikimi.txt']);
  assert.ok(Buffer.from(files['specifikimi.txt']).equals(specBytes));
  assert.ok(Buffer.from(files['pergjigjet.json']).equals(jsonBytes));
  assert.ok(Buffer.from(files['fotot/shembulli-1-buy-win.jpg']).equals(photoBytes));

  assert.equal((await s.h(rq('export', { query: { key: s.p.submissionId, format: 'exe' }, headers: { cookie: cookie } }))).status, 400);
});

test('ZIP nuk paraqitet si i plotë kur mungon ose është ndryshuar një foto e regjistruar', async function () {
  var s = await setup();
  var cookie = await login(s);
  var photo = path.join(s.base, 'fotot', 'shembulli-1-buy-win.jpg');
  fs.unlinkSync(photo);
  var r = await s.h(rq('export', { query: { key: s.p.submissionId, format: 'zip' }, headers: { cookie: cookie } }));
  assert.equal(r.status, 409);
  var b = body(r);
  assert.match(b.error, /nuk është e plotë/);
  assert.deepEqual(b.missing, ['shembulli-1-buy-win.jpg']);
  assert.equal(r.headers['Content-Disposition'], undefined, 'asnjë skedar nuk shkarkohet');
  // TXT dhe JSON vazhdojnë të funksionojnë (nuk përmbajnë foto)
  assert.equal((await s.h(rq('export', { query: { key: s.p.submissionId, format: 'txt' }, headers: { cookie: cookie } }))).status, 200);
  // Foto e ndryshuar
  fs.writeFileSync(photo, Buffer.concat([Buffer.from(H.TINY_JPEG_B64, 'base64'), Buffer.from([1])]));
  assert.equal((await s.h(rq('export', { query: { key: s.p.submissionId, format: 'zip' }, headers: { cookie: cookie } }))).status, 409);
});

test('ruajtja pas rinisjes: një server i ri lexon të njëjtat dorëzime', async function () {
  var s = await setup();
  var h2 = admin.createAdminHandler({ env: s.env, delay: async function () {} });
  var r = await h2(rq('login', { method: 'POST', body: { password: PW } }));
  var cookie = r.headers['Set-Cookie'].split(';')[0];
  var l = body(await h2(rq('list', { headers: { cookie: cookie } })));
  assert.equal(l.submissions.length, 1);
  assert.equal(l.submissions[0].id, s.id);
});
