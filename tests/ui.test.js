'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var FIDB = require('fake-indexeddb');
var Q = require('../public/questionnaire.js');
var H = require('./helpers.js');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
var QJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'questionnaire.js'), 'utf8');
var APPJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

function loadPage(opts) {
  opts = opts || {};
  var dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  var w = dom.window;
  Object.keys(opts.storage || {}).forEach(function (k) { w.localStorage.setItem(k, opts.storage[k]); });
  w.indexedDB = opts.idb || new FIDB.IDBFactory();
  w.IDBKeyRange = FIDB.IDBKeyRange;
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};
  w.confirm = function () { return true; };
  w.XAU_COMPRESS = async function () { return { dataUrl: H.TINY_JPEG_URL }; };
  w.fetch = opts.fetch || async function () { throw new Error('fetch nuk pritej'); };
  w.eval(QJS);
  w.eval(APPJS);
  return { dom: dom, w: w, d: w.document, app: w.XAUApp };
}
function fire(w, el, type) { el.dispatchEvent(new w.Event(type || 'change', { bubbles: true })); }
function pick(p, name, value) { var e = p.d.querySelector('input[name="' + name + '"][value="' + value + '"]'); e.checked = true; fire(p.w, e); }
function fullStorage() {
  var s = H.fullState();
  s.examples.forEach(function (e, i) { e._k = 'k' + i; });
  s.step = Q.STEPS.length - 1;
  return JSON.stringify(s);
}
async function withPhotoInIdb(idb) {
  // ruan foton p1 në IndexedDB, si do ta kishte ruajtur faqja
  await new Promise(function (resolve, reject) {
    var r = idb.open('xau-q-photos', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
    r.onsuccess = function () { var tx = r.result.transaction('photos', 'readwrite'); tx.objectStore('photos').put({ dataUrl: H.TINY_JPEG_URL, name: 'a.jpg' }, 'p1'); tx.oncomplete = function () { r.result.close(); resolve(); }; tx.onerror = reject; };
    r.onerror = reject;
  });
}

test('faqja hapet me 9 hapa dhe pyetjet e kushtëzuara reagojnë', async function () {
  var p = loadPage();
  await p.app.ready();
  assert.equal(p.d.querySelectorAll('section.step').length, 9);
  assert.equal(p.d.querySelector('section.step:not([hidden])').getAttribute('data-step'), 'client');
  var maType = p.d.querySelector('[data-qid="dir_ma_type"]');
  assert.equal(maType.hidden, true);
  pick(p, 'dir_method', 'ma');
  assert.equal(maType.hidden, false);
  pick(p, 'dir_method', 'none');
  assert.equal(maType.hidden, true);
  pick(p, 'sides', 'sell_only');
  assert.match(p.d.querySelector('section[data-step="signal"] h2').textContent, /SELL/);
  assert.ok(p.d.querySelector('meta[name="viewport"]').content.indexOf('width=device-width') >= 0);
  p.w.close();
});

test('"Nuk e di" çaktivizon fushën dhe shënohet në draft', async function () {
  var p = loadPage();
  await p.app.ready();
  var cb = p.d.querySelector('input[data-unk="t_from"]');
  cb.checked = true; fire(p.w, cb);
  assert.equal(p.d.getElementById('f-t_from').disabled, true);
  assert.equal(p.app.getState().answers['?t_from'], true);
  p.w.close();
});

test('fushat e detyrueshme bllokojnë dërgimin dhe të çojnë te problemi i parë', async function () {
  var calls = 0;
  var p = loadPage({ fetch: async function () { calls++; } });
  await p.app.ready();
  p.app.showStep(8);
  p.d.getElementById('send').click();
  await tick(10);
  assert.equal(calls, 0);
  assert.equal(p.d.querySelector('section.step:not([hidden])').getAttribute('data-step'), 'client');
  var q = p.d.querySelector('[data-qid="facts_review"]');
  assert.ok(q.classList.contains('has-err'));
  assert.match(q.querySelector('.qerr').textContent, /duhet plotësuar/);
  pick(p, 'facts_review', 'ok');
  assert.ok(!q.classList.contains('has-err'), 'gabimi hiqet kur plotësohet');
  p.w.close();
});

test('ruajtja automatike dhe rikthimi pas rifreskimit', async function () {
  var p = loadPage();
  await p.app.ready();
  var words = p.d.getElementById('f-own_words');
  words.value = '1. EMA 200\n2. RSI'; fire(p.w, words, 'input');
  pick(p, 'tf_signal', 'M15');
  p.app.showStep(3);
  await tick(300);
  var saved = p.w.localStorage.getItem(Q.STORAGE_KEY);
  p.w.close();
  var p2 = loadPage({ storage: { 'xau-q:state': saved } });
  await p2.app.ready();
  assert.equal(p2.d.getElementById('f-own_words').value, '1. EMA 200\n2. RSI');
  assert.equal(p2.d.querySelector('input[name="tf_signal"][value="M15"]').checked, true);
  assert.equal(p2.d.querySelector('section.step:not([hidden])').getAttribute('data-step'), 'entry');
  assert.equal(JSON.parse(saved).schemaVersion, Q.SCHEMA_VERSION);
  p2.w.close();
});

test('drafti i vjetër migrohet, ruhet kopje rezervë dhe origjinali nuk fshihet', async function () {
  var raw = H.legacyDraftFromOriginal(function (u) { u.pick('tfe', 'H1'); u.pick('cond', 'MACD'); u.type('buy-condition-macd', '12/26/9 kryqëzim'); });
  var shots = JSON.stringify([{ name: 'a.jpg', dataUrl: H.TINY_JPEG_URL }]);
  var p = loadPage({ storage: { 'xau-ea-questionnaire-v11': raw, 'xau-ea-questionnaire-v11-shots': shots } });
  await p.app.ready();
  await tick(50);
  var st = p.app.getState();
  assert.equal(st.answers.tf_signal, 'H1');
  assert.deepEqual(Array.from(st.answers.cond), ['macd']);
  assert.equal(st.answers.macd_rule, '12/26/9 kryqëzim');
  assert.equal(st.examples.length, 1);
  assert.ok(st.examples[0].photoId);
  assert.ok(p.w.localStorage.getItem(Q.BACKUP_KEY));
  assert.equal(p.w.localStorage.getItem('xau-ea-questionnaire-v11'), raw);
  assert.match(p.d.getElementById('banners').textContent, /drafti yt i mëparshëm u kaluan/);
  p.w.close();
});

test('foto: shtohet te shembulli, ruhet në IndexedDB dhe rikthehet', async function () {
  var idb = new FIDB.IDBFactory();
  var p = loadPage({ idb: idb });
  await p.app.ready();
  p.app.showStep(7);
  p.d.getElementById('add-ex').click();
  var input = p.d.querySelector('input[data-photo="0"]');
  Object.defineProperty(input, 'files', { value: [new p.w.File(['x'], 'a.png', { type: 'image/png' })] });
  fire(p.w, input);
  await tick(80);
  var st = p.app.getState();
  assert.ok(st.examples[0].photoId);
  assert.ok(p.d.querySelector('#examples img'));
  await tick(300);
  var saved = p.w.localStorage.getItem(Q.STORAGE_KEY);
  p.w.close();
  var p2 = loadPage({ idb: idb, storage: { 'xau-q:state': saved } });
  await p2.app.ready();
  await tick(80);
  var img = p2.d.querySelector('#examples img');
  assert.ok(img && img.getAttribute('src') === H.TINY_JPEG_URL, 'fotoja rikthehet pas rifreskimit');
  p2.w.close();
});

test('dërgimi i suksesshëm: një kërkesë e vetme edhe me klikime të shpejta', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb);
  var bodies = [];
  var release;
  var gate = new Promise(function (r) { release = r; });
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() }, fetch: async function (url, init) { bodies.push(JSON.parse(init.body)); await gate; return { ok: true, status: 200, json: async function () { return { ok: true, simulated: false, stored: true, id: 'XAU-20261005-ABCDEF', submissionKey: bodies[0].submissionId, submittedAt: '2026-10-05T10:00:00.000Z', mode: 'real', photoCount: 1 }; } }; } });
  await p.app.ready();
  var btn = p.d.getElementById('send');
  btn.click(); btn.click(); p.app.send();
  await tick(30);
  assert.equal(btn.textContent, 'Po ruhet…');
  assert.equal(btn.disabled, true);
  release();
  await tick(30);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].photos.length, 1);
  assert.equal(bodies[0].photos[0].filename, 'shembulli-1-buy-win.jpg');
  assert.ok(!('_k' in bodies[0].state.examples[0]));
  assert.match(p.d.getElementById('send-status').textContent, /Përgjigjet u dorëzuan dhe u ruajtën\. ID: XAU-20261005-ABCDEF/);
  assert.match(p.d.querySelector('.status').textContent, /Përgjigjet u dorëzuan/);
  assert.match(p.d.querySelector('.status').textContent, /XAU-20261005-ABCDEF/);
  assert.equal(bodies[0].mode, 'real');
  assert.match(p.d.querySelector('.status').textContent, /Gati për programim/);
  p.w.close();
});

test('dështimi: përgjigjet ruhen, shfaqen alternativat dhe riprovimi përdor të njëjtin ID', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb);
  var ids = [];
  var n = 0;
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() }, fetch: async function (url, init) {
    ids.push(JSON.parse(init.body).submissionId);
    n++;
    if (n === 1) return { ok: false, status: 502, json: async function () { return { ok: false, error: 'Shërbimi i emailit nuk e pranoi dërgimin.' }; } };
    if (n === 2) { var e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return { ok: true, status: 200, json: async function () { return { ok: true, simulated: true, stored: false, submissionKey: ids[0], mode: 'real' }; } };
  } });
  await p.app.ready();
  p.d.getElementById('send').click();
  await tick(30);
  assert.match(p.d.getElementById('send-status').textContent, /nuk e pranoi/);
  assert.equal(p.d.getElementById('fallback').hidden, false);
  assert.match(p.d.getElementById('fallback').textContent, /NUK i përfshijnë fotot/);
  assert.ok(p.w.localStorage.getItem(Q.STORAGE_KEY), 'drafti mbetet');
  p.d.getElementById('retry').click();
  await tick(30);
  assert.match(p.d.getElementById('send-status').textContent, /u ndërpre/);
  p.d.getElementById('retry').click();
  await tick(30);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], ids[1]); assert.equal(ids[1], ids[2]);
  assert.match(p.d.getElementById('send-status').textContent, /simuluar/);
  assert.match(p.d.querySelector('.status').textContent, /Ruajtje e simuluar/);
  assert.match(p.d.querySelector('.status').textContent, /NUK u ruajtën/);
  assert.equal(p.d.getElementById('send').disabled, false, 'pas simulimit mund të dorëzohet sërish');
  p.w.close();
});

test('ndryshimi pas një dështimi krijon ID të re; pa ndryshim ID mbetet', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb);
  var ids = [];
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() }, fetch: async function (url, init) { ids.push(JSON.parse(init.body).submissionId); return { ok: false, status: 503, json: async function () { return {}; } }; } });
  await p.app.ready();
  p.app.send(); await tick(30);
  p.app.send(); await tick(30);
  p.app.getState().answers.notes = 'shënim i ri';
  p.app.send(); await tick(30);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
  p.w.close();
});

test('kopjimi dhe .txt përmbajnë të njëjtin specifikim si serveri', async function () {
  var p = loadPage({ storage: { 'xau-q:state': fullStorage() } });
  await p.app.ready();
  var txt = p.app.specText();
  var s = Q.sanitizeState(JSON.parse(fullStorage()));
  Q.sections(s, 'en').forEach(function (sec) { sec.items.forEach(function (it) { assert.ok(txt.indexOf('- ' + it.label + ': ' + it.value) >= 0, it.id); }); });
  assert.match(txt, /Ready for programming: YES/);
  p.w.close();
});

test('dështimi i ruajtjes njoftohet', async function () {
  var p = loadPage();
  await p.app.ready();
  p.w.Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
  pick(p, 'facts_review', 'ok');
  await tick(300);
  assert.match(p.d.getElementById('banners').textContent, /Ruajtja automatike dështoi/);
  p.w.close();
});

test('drafti i ruajtur me skemën 2 migrohet në faqe, me kopje rezervë', async function () {
  var old = H.fullState();
  old.schemaVersion = 2;
  old.answers.t_tz = 'kosovo'; old.answers.client_name = 'Emër';
  old.examples.forEach(function (e, i) { e._k = 'k' + i; });
  var raw = JSON.stringify(old);
  var p = loadPage({ storage: { 'xau-q:v2': raw } });
  await p.app.ready();
  var st = p.app.getState();
  assert.equal(st.answers.t_tz, 'albania');
  assert.equal(st.answers.client_name, undefined);
  assert.ok(p.w.localStorage.getItem(Q.BACKUP_KEY));
  assert.ok(p.w.localStorage.getItem(Q.STORAGE_KEY), 'ruhet nën çelësin e ri');
  assert.equal(p.w.localStorage.getItem('xau-q:v2'), raw, 'origjinali nuk fshihet');
  p.w.close();
});

test('madhësia e trade-it në faqe: shpjegimi për lot fiks dhe monedha te shuma', async function () {
  var p = loadPage();
  await p.app.ready();
  var info = p.d.querySelector('[data-qid="size_info_fixed"]');
  assert.equal(info.hidden, true);
  pick(p, 'size_method', 'fixed_lot');
  assert.equal(info.hidden, false);
  assert.match(info.textContent, /Lot fiks nuk do të thotë humbje fikse/);
  assert.equal(p.d.querySelector('[data-qid="lot_fixed"]').hidden, false);
  pick(p, 'size_method', 'risk_money');
  assert.equal(info.hidden, true);
  assert.equal(p.d.querySelector('[data-qid="lot_fixed"]').hidden, true);
  var unit = p.d.querySelector('[data-unitq="risk_money"]');
  assert.equal(unit.textContent, 'monedha e llogarisë');
  pick(p, 'account_ccy', 'EUR');
  assert.equal(unit.textContent, 'EUR');
  assert.equal(p.d.querySelector('[data-unitq="capital"]').textContent, 'EUR');
  p.w.close();
});

test('kur zgjidhet "Tjetër", shfaqet fusha e sqarimit dhe merr fokusin', async function () {
  var p = loadPage();
  await p.app.ready();
  p.app.showStep(1);
  pick(p, 'dir_method', 'ma');
  var follow = p.d.querySelector('[data-qid="dir_ma_type_other"]');
  assert.equal(follow.hidden, true);
  pick(p, 'dir_ma_type', 'other');
  assert.equal(follow.hidden, false);
  await tick(10);
  assert.equal(p.d.activeElement, p.d.getElementById('f-dir_ma_type_other'));
  pick(p, 'dir_ma_type', 'ema');
  assert.equal(follow.hidden, true);
  p.w.close();
});

test('modaliteti i provës (?prove=1) shënohet te dorëzimi dhe shfaqet në faqe', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb);
  var bodies = [];
  var dom = new JSDOM(HTML, { url: 'http://localhost/?prove=1', runScripts: 'outside-only', pretendToBeVisual: true });
  var w = dom.window;
  w.localStorage.setItem('xau-q:state', fullStorage());
  w.indexedDB = idb; w.IDBKeyRange = FIDB.IDBKeyRange;
  w.Element.prototype.scrollIntoView = function () {}; w.scrollTo = function () {}; w.confirm = function () { return true; };
  w.fetch = async function (u, init) { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async function () { return { ok: true, simulated: false, stored: true, id: 'XAU-20261005-TEST22', submissionKey: bodies[0].submissionId, submittedAt: '2026-10-05T10:00:00.000Z', mode: 'test' }; } }; };
  w.eval(QJS); w.eval(APPJS);
  await w.XAUApp.ready();
  assert.match(w.document.getElementById('banners').textContent, /Modaliteti i provës/);
  w.document.getElementById('send').click();
  await tick(40);
  assert.equal(bodies[0].mode, 'test');
  assert.match(w.document.querySelector('.status').textContent, /\(provë\)/);
  w.close();
});

test('"Fillo nga e para" fshin draftin dhe fotot nga pajisja', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb);
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() } });
  await p.app.ready();
  p.d.getElementById('reset').click();
  await tick(60);
  assert.equal(p.app.getState().examples.length, 0);
  assert.equal(p.app.getState().answers.facts_review, undefined);
  assert.equal(p.d.querySelector('section.step:not([hidden])').getAttribute('data-step'), 'client');
  p.w.close();
});
