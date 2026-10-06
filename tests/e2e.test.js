'use strict';
// Provë nga fillimi në fund mbi HTTP: formulari dorëzon, paneli hyn, lista dhe eksportet, pastaj "rinisje" e serverit.
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var fflate = require('fflate');
var H = require('./helpers.js');

var PW = 'fjalekalim-shume-i-gjate-123';

function start(env) {
  Object.keys(env).forEach(function (k) { process.env[k] = env[k]; });
  var srv = require('../scripts/dev-server.js').createServer();
  return new Promise(function (r) { srv.listen(0, '127.0.0.1', function () { r({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port }); }); });
}
function stop(s) { return new Promise(function (r) { s.srv.close(r); }); }

test('HTTP: dorëzim, mbrojtje e panelit, tre eksportet dhe ruajtje pas rinisjes', async function () {
  var dir = H.tmpDir();
  var env = { STORAGE_DRIVER: 'file', STORAGE_DIR: dir, ADMIN_PASSWORD: PW, ADMIN_SESSION_SECRET: 'sekret-sesioni-shume-i-gjate-0123456789abcdef' };
  var s = await start(env);
  try {
    var page = await fetch(s.base + '/admin');
    assert.equal(page.status, 200);
    var html = await page.text();
    assert.ok(html.indexOf('Paneli i dorëzimeve') >= 0 && html.indexOf('XAU-') < 0, 'faqja e panelit nuk përmban të dhëna');

    var p = H.submitPayload();
    var r = await fetch(s.base + '/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    var d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.stored, true);

    var H1 = { 'X-XAU-Admin': '1' };
    assert.equal((await fetch(s.base + '/api/admin?action=list', { headers: H1 })).status, 401);
    assert.equal((await fetch(s.base + '/api/admin?action=export&key=' + p.submissionId + '&format=zip', { headers: H1 })).status, 401);
    var lg = await fetch(s.base + '/api/admin?action=login', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H1), body: JSON.stringify({ password: PW }) });
    assert.equal(lg.status, 200);
    var cookie = lg.headers.get('set-cookie').split(';')[0];
    var auth = Object.assign({ cookie: cookie }, H1);

    var list = await (await fetch(s.base + '/api/admin?action=list', { headers: auth })).json();
    assert.equal(list.submissions.length, 1);
    assert.equal(list.submissions[0].id, d.id);

    var sub = path.join(dir, 'xau-q', 'submissions', p.submissionId);
    var zipRes = await fetch(s.base + '/api/admin?action=export&key=' + p.submissionId + '&format=zip', { headers: auth });
    assert.equal(zipRes.status, 200);
    assert.match(zipRes.headers.get('content-disposition'), new RegExp('attachment; filename="pyetesori-xauusd-\\d{4}-\\d{2}-\\d{2}-' + d.id + '\\.zip"'));
    var files = fflate.unzipSync(new Uint8Array(await zipRes.arrayBuffer()));
    assert.ok(Buffer.from(files['specifikimi.txt']).equals(fs.readFileSync(path.join(sub, 'specifikimi.txt'))));
    assert.ok(Buffer.from(files['pergjigjet.json']).equals(fs.readFileSync(path.join(sub, 'pergjigjet.json'))));
    assert.ok(Buffer.from(files['fotot/shembulli-1-buy-win.jpg']).equals(Buffer.from(H.TINY_JPEG_B64, 'base64')));
    var txt = Buffer.from(await (await fetch(s.base + '/api/admin?action=export&key=' + p.submissionId + '&format=txt', { headers: auth })).arrayBuffer());
    assert.ok(txt.equals(fs.readFileSync(path.join(sub, 'specifikimi.txt'))));
    var js = await (await fetch(s.base + '/api/admin?action=export&key=' + p.submissionId + '&format=json', { headers: auth })).json();
    assert.deepEqual(js.state, p.state);
    assert.equal(js.schemaVersion, 4);
  } finally { await stop(s); }

  // "Rinisja": server i ri, e njëjta ruajtje
  var s2 = await start(env);
  try {
    var lg2 = await fetch(s2.base + '/api/admin?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-XAU-Admin': '1' }, body: JSON.stringify({ password: PW }) });
    var c2 = lg2.headers.get('set-cookie').split(';')[0];
    var l2 = await (await fetch(s2.base + '/api/admin?action=list', { headers: { cookie: c2, 'X-XAU-Admin': '1' } })).json();
    assert.equal(l2.submissions.length, 1);
  } finally { await stop(s2); }
});
