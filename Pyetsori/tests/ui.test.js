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
  var dom = new JSDOM(HTML, { url: opts.url || 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
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
function pick(p, name, value) { var e = p.d.querySelector('input[name="' + name + '"][value="' + value + '"]'); if (!e) throw new Error('mungon ' + name + '=' + value); e.checked = true; fire(p.w, e); }
function type(p, id, value) { var e = p.d.getElementById('f-' + id); e.value = value; fire(p.w, e, 'input'); }
function current(p) { return p.d.querySelector('section.step:not([hidden])').getAttribute('data-screen'); }
function fullStorage(extra) {
  var s = H.fullState();
  s.examples.forEach(function (e, i) { e._k = 'k' + i; });
  s.screen = 'review';
  return JSON.stringify(Object.assign(s, extra || {}));
}
async function withPhotoInIdb(idb, id) {
  await new Promise(function (resolve, reject) {
    var r = idb.open('xau-q-photos', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
    r.onsuccess = function () { var tx = r.result.transaction('photos', 'readwrite'); tx.objectStore('photos').put({ dataUrl: H.TINY_JPEG_URL, name: 'a.jpg' }, id || 'p1'); tx.oncomplete = function () { r.result.close(); resolve(); }; tx.onerror = reject; };
    r.onerror = reject;
  });
}

test('pjesët me tituj të thjeshtë dhe ekrane të vegjël; pyetjet shtesë shfaqen vetëm kur lidhen', async function () {
  var p = loadPage();
  await p.app.ready();
  assert.equal(current(p), 'facts');
  assert.match(p.d.getElementById('stepline').textContent, /Pjesa 1 nga 6: Çfarë tregton\?/);
  var labels = Array.prototype.map.call(p.d.querySelectorAll('section.step .section-label'), function (n) { return n.textContent; });
  ['Çfarë tregton?', 'Kur hap një trade?', 'Kur e mbyll?', 'Sa do të rrezikosh?', 'Në cilat orare tregton?', 'Na trego disa shembuj.', 'Kontrollo përgjigjet.'].forEach(function (t) {
    assert.ok(labels.some(function (l) { return l.indexOf(t) >= 0; }), t);
  });
  // Ekranet e indikatorëve shfaqen vetëm kur zgjidhet indikatori
  assert.equal(p.app.visibleScreens().indexOf('ind_rsi'), -1);
  pick(p, 'cond', 'rsi'); pick(p, 'cond', 'macd');
  var vis = p.app.visibleScreens();
  assert.ok(vis.indexOf('ind_rsi') > 0 && vis.indexOf('ind_macd') > 0);
  assert.equal(vis.indexOf('ind_bb'), -1);
  // Cilësimet e një indikatori janë bashkë në një ekran
  ['rsi_period', 'rsi_tf', 'rsi_source', 'rsi_rule'].forEach(function (id) { assert.equal(p.d.querySelector('[data-qid="' + id + '"]').closest('section').getAttribute('data-screen'), 'ind_rsi'); });
  // Pyetje shtesë vetëm kur lidhen
  var maType = p.d.querySelector('[data-qid="dir_ma_type"]');
  assert.equal(maType.hidden, true);
  pick(p, 'dir_method', 'ma');
  assert.equal(maType.hidden, false);
  pick(p, 'dir_method', 'none');
  assert.equal(maType.hidden, true);
  // Shpjegimet dhe shembujt janë tekst; asnjë fushë nuk plotësohet
  var rsi = p.d.querySelector('[data-qid="rsi_rule"]');
  assert.match(rsi.textContent, /Shembull: RSI kalon nga poshtë mbi 30/);
  assert.equal(p.d.getElementById('f-rsi_rule').value, '');
  assert.equal(p.d.getElementById('f-risk_pct').value, '', 'risku nuk parazgjidhet');
  pick(p, 'sides', 'sell_only');
  assert.match(p.d.querySelector('section[data-screen="conditions"] .intro').textContent, /trade SELL/);
  p.w.close();
});

test('rruga e plotë: Vazhdo kalon çdo ekran të dukshëm deri te kontrolli, Prapa nuk humb asgjë', async function () {
  var p = loadPage();
  await p.app.ready();
  pick(p, 'cond', 'rsi');
  var vis = Array.from(p.app.visibleScreens());
  var seen = [current(p)];
  for (var i = 0; i < vis.length - 1; i++) { p.d.getElementById('next').click(); seen.push(current(p)); }
  assert.deepEqual(seen, vis);
  assert.equal(current(p), 'review');
  assert.equal(p.d.getElementById('next').style.display, 'none');
  p.app.showScreen('ind_rsi');
  type(p, 'rsi_rule', 'RSI kalon mbi 50');
  p.d.getElementById('back').click(); p.d.getElementById('back').click();
  p.d.getElementById('next').click(); p.d.getElementById('next').click();
  assert.equal(current(p), 'ind_rsi');
  assert.equal(p.d.getElementById('f-rsi_rule').value, 'RSI kalon mbi 50');
  assert.match(p.d.getElementById('stepline').textContent, /Pjesa 2 nga 6: Kur hap një trade\? \(ekrani \d+ nga \d+\)/);
  p.w.close();
});

test('"Nuk e di — ta sqarojmë bashkë": lejon vazhdimin, çaktivizon fushën dhe shfaqet te kontrolli', async function () {
  var p = loadPage({ storage: { 'xau-q:state': fullStorage({ screen: 'hours' }) } });
  await p.app.ready();
  var cb = p.d.querySelector('input[data-unk="t_from"]');
  assert.equal(cb.parentNode.textContent, 'Nuk e di — ta sqarojmë bashkë');
  cb.checked = true; fire(p.w, cb);
  assert.equal(p.d.getElementById('f-t_from').disabled, true);
  assert.equal(p.app.getState().answers['?t_from'], true);
  pick(p, 'sl_method', '?');
  p.app.showScreen('review');
  var rv = p.d.getElementById('review').textContent;
  assert.match(rv, /Këto do t'i sqarojmë bashkë/);
  assert.match(rv, /Nga ora/);
  assert.match(rv, /Ku e vendos Stop Loss/);
  assert.match(rv, /Specifikimi nuk është ende gati për zhvillim/);
  assert.match(rv, /Mund t'i dorëzosh tani/);
  assert.equal(p.app.getState().answers.sl_method, '?', 'nuk zëvendësohet me vlerë');
  p.w.close();
});

test('fushat e detyrueshme bllokojnë dorëzimin dhe të çojnë te pyetja e parë', async function () {
  var calls = 0;
  var p = loadPage({ fetch: async function () { calls++; } });
  await p.app.ready();
  p.app.showScreen('review');
  p.d.getElementById('send').click();
  await tick(10);
  assert.equal(calls, 0);
  assert.equal(current(p), 'facts');
  var q = p.d.querySelector('[data-qid="facts_review"]');
  assert.ok(q.classList.contains('has-err'));
  assert.match(q.querySelector('.qerr').textContent, /duhet plotësuar/);
  pick(p, 'facts_review', 'ok');
  assert.ok(!q.classList.contains('has-err'), 'gabimi hiqet kur plotësohet');
  p.w.close();
});

test('kontrolli: përmbledhje sipas pjesëve me "Ndrysho", dhe dallimi mes "U dorëzua" dhe "Gati për zhvillim"', async function () {
  var p = loadPage({ storage: { 'xau-q:state': fullStorage() } });
  await p.app.ready();
  var rv = p.d.getElementById('review');
  var heads = Array.prototype.map.call(rv.querySelectorAll('.sum-head strong'), function (n) { return n.textContent; });
  assert.deepEqual(heads.slice(0, 6), ['Çfarë tregton?', 'Kur hap një trade?', 'Kur e mbyll?', 'Sa do të rrezikosh?', 'Në cilat orare tregton?', 'Na trego disa shembuj.']);
  assert.match(rv.textContent, /Ende pa u dorëzuar/);
  assert.match(rv.textContent, /Specifikimi është gati për zhvillim/);
  var edit = Array.prototype.filter.call(rv.querySelectorAll('.sum-head button'), function (b) { return b.parentNode.textContent.indexOf('Kur e mbyll?') >= 0; })[0];
  edit.click();
  assert.equal(current(p), 'sl');
  p.w.close();
});

test('ruajtja automatike dhe rikthimi pas rifreskimit', async function () {
  var p = loadPage();
  await p.app.ready();
  type(p, 'own_words', '1. EMA 200\n2. RSI');
  pick(p, 'tf_signal', 'M15');
  p.app.showScreen('order');
  await tick(300);
  var saved = p.w.localStorage.getItem(Q.STORAGE_KEY);
  p.w.close();
  var p2 = loadPage({ storage: { 'xau-q:state': saved } });
  await p2.app.ready();
  assert.equal(p2.d.getElementById('f-own_words').value, '1. EMA 200\n2. RSI');
  assert.equal(p2.d.querySelector('input[name="tf_signal"][value="M15"]').checked, true);
  assert.equal(current(p2), 'order');
  assert.equal(JSON.parse(saved).schemaVersion, Q.SCHEMA_VERSION);
  assert.match(p2.d.getElementById('saved').textContent, /në këtë pajisje/);
  p2.w.close();
});

test('drafti i skemës 4 rikthehet pa humbje, me kopje rezervë', async function () {
  var old = H.fullState();
  old.schemaVersion = 4; old.step = 5; delete old.settingsPhotos; delete old.screen;
  old.examples.forEach(function (e, i) { e._k = 'k' + i; });
  var raw = JSON.stringify(old);
  var p = loadPage({ storage: { 'xau-q:state': raw } });
  await p.app.ready();
  var st = p.app.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(st.answers)), old.answers);
  assert.equal(st.examples.length, 3);
  assert.equal(current(p), 'sl', 'hapi i vjetër 5 (SL/TP) çon te ekrani Stop Loss');
  assert.ok(p.w.localStorage.getItem(Q.BACKUP_KEY));
  p.w.close();
});

test('drafti shumë i vjetër (v11) migrohet dhe origjinali nuk fshihet', async function () {
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
  assert.ok(p.w.localStorage.getItem(Q.BACKUP_KEY));
  assert.equal(p.w.localStorage.getItem('xau-ea-questionnaire-v11'), raw);
  p.w.close();
});

test('shembujt: udhëzim për shembullin e parë, foto me përshkrim, foto cilësimesh; rikthehen pas rifreskimit', async function () {
  var idb = new FIDB.IDBFactory();
  var p = loadPage({ idb: idb });
  await p.app.ready();
  p.app.showScreen('examples');
  assert.match(p.d.getElementById('coverage').textContent, /Fillo me një shembull/);
  assert.equal(p.d.getElementById('add-ex').textContent, '+ Shto shembullin e parë');
  p.d.getElementById('add-ex').click();
  var input = p.d.querySelector('input[data-photo="ex:0"]');
  Object.defineProperty(input, 'files', { value: [new p.w.File(['x'], 'a.png', { type: 'image/png' })] });
  fire(p.w, input);
  await tick(80);
  assert.ok(p.app.getState().examples[0].photoId);
  var note = p.d.querySelector('[data-exf="0:photoNote"] input');
  assert.ok(note && !note.closest('[data-exf]').hidden, 'përshkrimi shfaqet pasi shtohet fotoja');
  note.value = 'Hyrja pas kryqëzimit'; fire(p.w, note, 'input');
  p.d.getElementById('add-sp').click();
  var spIn = p.d.querySelector('input[data-photo="sp:0"]');
  Object.defineProperty(spIn, 'files', { value: [new p.w.File(['x'], 's.png', { type: 'image/png' })] });
  fire(p.w, spIn);
  await tick(80);
  var spNote = p.d.querySelector('input[data-spnote="0"]');
  spNote.value = 'RSI në M15'; fire(p.w, spNote, 'input');
  assert.ok(p.app.getState().settingsPhotos[0].photoId);
  await tick(300);
  var saved = p.w.localStorage.getItem(Q.STORAGE_KEY);
  p.w.close();
  var p2 = loadPage({ idb: idb, storage: { 'xau-q:state': saved } });
  await p2.app.ready();
  await tick(80);
  assert.equal(p2.d.querySelector('#examples img').getAttribute('src'), H.TINY_JPEG_URL);
  assert.equal(p2.d.querySelector('#settings img').getAttribute('src'), H.TINY_JPEG_URL);
  assert.equal(p2.app.getState().examples[0].photoNote, 'Hyrja pas kryqëzimit');
  assert.equal(p2.app.getState().settingsPhotos[0].note, 'RSI në M15');
  p2.w.close();
});

test('dorëzimi: një kërkesë e vetme, me të gjitha fotot dhe përgjigjet; "U dorëzua me sukses" pas ruajtjes', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
  await withPhotoInIdb(idb, 'sp1');
  var bodies = [];
  var release;
  var gate = new Promise(function (r) { release = r; });
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage({ settingsPhotos: [{ photoId: 'sp1', note: 'RSI në M15' }] }) }, fetch: async function (url, init) { bodies.push(JSON.parse(init.body)); await gate; return { ok: true, status: 200, json: async function () { return { ok: true, simulated: false, stored: true, id: 'XAU-20261005-ABCDEF', submissionKey: bodies[0].submissionId, submittedAt: '2026-10-05T10:00:00.000Z', mode: 'real', photoCount: 2 }; } }; } });
  await p.app.ready();
  var btn = p.d.getElementById('send');
  btn.click(); btn.click(); p.app.send();
  await tick(30);
  assert.equal(btn.textContent, 'Po ruhet…');
  release();
  await tick(30);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].photos.map(function (x) { return x.filename; }).sort(), ['cilesimet-1.jpg', 'shembulli-1-buy-win.jpg']);
  assert.equal(bodies[0].state.settingsPhotos[0].note, 'RSI në M15');
  assert.ok(!('_k' in bodies[0].state.examples[0]));
  assert.deepEqual(bodies[0].state.answers, H.fullState().answers, 'përgjigjet dërgohen pa ndryshim');
  assert.match(p.d.getElementById('send-status').textContent, /U dorëzua me sukses\. ID: XAU-20261005-ABCDEF/);
  var status = p.d.querySelector('.status').textContent;
  assert.match(status, /U dorëzua me sukses/);
  assert.match(status, /Specifikimi është gati për zhvillim/);
  p.w.close();
});

test('dorëzim me paqartësi: u dorëzua, por nuk shënohet gati për zhvillim', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
  var s = JSON.parse(fullStorage());
  s.answers.sl_method = '?';
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': JSON.stringify(s) }, fetch: async function (u, init) { var b = JSON.parse(init.body); return { ok: true, status: 200, json: async function () { return { ok: true, simulated: false, stored: true, id: 'XAU-20261005-UNKN22', submissionKey: b.submissionId, submittedAt: '2026-10-05T10:00:00.000Z', mode: 'real' }; } }; } });
  await p.app.ready();
  p.d.getElementById('send').click();
  await tick(40);
  var status = p.d.querySelector('.status').textContent;
  assert.match(status, /U dorëzua me sukses/);
  assert.match(status, /Specifikimi nuk është ende gati për zhvillim/);
  p.w.close();
});

test('dështimi: përgjigjet mbeten, shfaqen alternativat dhe riprovimi përdor të njëjtin ID', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
  var ids = [];
  var n = 0;
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() }, fetch: async function (url, init) {
    ids.push(JSON.parse(init.body).submissionId);
    n++;
    if (n === 1) return { ok: false, status: 503, json: async function () { return { ok: false, error: 'Ruajtja dështoi. Përgjigjet dhe fotot janë ende në pajisjen tënde; provo përsëri.' }; } };
    if (n === 2) { var e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return { ok: true, status: 200, json: async function () { return { ok: true, simulated: true, stored: false, submissionKey: ids[0], mode: 'real' }; } };
  } });
  await p.app.ready();
  p.d.getElementById('send').click();
  await tick(30);
  assert.match(p.d.getElementById('send-status').textContent, /Ruajtja dështoi/);
  assert.equal(p.d.getElementById('fallback').hidden, false);
  assert.match(p.d.getElementById('fallback').textContent, /NUK i përfshijnë fotot/);
  p.d.getElementById('retry').click();
  await tick(30);
  assert.match(p.d.getElementById('send-status').textContent, /u ndërpre/);
  p.d.getElementById('retry').click();
  await tick(30);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], ids[1]); assert.equal(ids[1], ids[2]);
  assert.match(p.d.querySelector('.status').textContent, /Ruajtje e simuluar/);
  assert.equal(p.d.getElementById('send').disabled, false, 'pas simulimit mund të dorëzohet sërish');
  p.w.close();
});

test('ndryshimi pas një dështimi krijon ID të re; pa ndryshim ID mbetet', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
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

test('kopjimi dhe .txt kanë të njëjtin specifikim si serveri', async function () {
  var p = loadPage({ storage: { 'xau-q:state': fullStorage() } });
  await p.app.ready();
  var txt = p.app.specText();
  var s = Q.sanitizeState(JSON.parse(fullStorage()));
  Q.sections(s, 'en').forEach(function (sec) { sec.items.forEach(function (it) { assert.ok(txt.indexOf('- ' + it.label + ': ' + it.value) >= 0, it.id); }); });
  assert.match(txt, /Ready for programming: YES/);
  p.w.close();
});

test('dështimi i ruajtjes së draftit njoftohet', async function () {
  var p = loadPage();
  await p.app.ready();
  p.w.Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
  pick(p, 'facts_review', 'ok');
  await tick(300);
  assert.match(p.d.getElementById('banners').textContent, /Ruajtja automatike dështoi/);
  p.w.close();
});

test('madhësia e trade-it: shpjegim i veçantë për çdo mënyrë dhe monedha te shuma', async function () {
  var p = loadPage();
  await p.app.ready();
  p.app.showScreen('size');
  var fixed = p.d.querySelector('[data-qid="size_info_fixed"]');
  assert.equal(fixed.hidden, true);
  pick(p, 'size_method', 'fixed_lot');
  assert.equal(fixed.hidden, false);
  assert.match(fixed.textContent, /humbja ndryshon nga trade në trade/);
  pick(p, 'size_method', 'risk_money');
  assert.equal(fixed.hidden, true);
  assert.match(p.d.querySelector('[data-qid="size_info_money"]').textContent, /shumë në para, jo lëvizje e çmimit/);
  var unit = p.d.querySelector('[data-unitq="risk_money"]');
  assert.equal(unit.textContent, 'monedha e llogarisë');
  pick(p, 'account_ccy', 'EUR');
  assert.equal(unit.textContent, 'EUR');
  assert.equal(p.d.querySelector('[data-unitq="sl_fixed"]').textContent, '$ lëvizje çmimi', 'distanca e çmimit dallohet nga paratë');
  p.w.close();
});

test('kur zgjidhet "Tjetër", shfaqet fusha e sqarimit dhe merr fokusin', async function () {
  var p = loadPage();
  await p.app.ready();
  p.app.showScreen('direction');
  pick(p, 'dir_method', 'ma');
  var follow = p.d.querySelector('[data-qid="dir_ma_type_other"]');
  assert.equal(follow.hidden, true);
  pick(p, 'dir_ma_type', 'other');
  assert.equal(follow.hidden, false);
  await tick(10);
  assert.equal(p.d.activeElement, p.d.getElementById('f-dir_ma_type_other'));
  p.w.close();
});

test('modaliteti i provës (?prove=1) shënohet te dorëzimi', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
  var bodies = [];
  var p = loadPage({ url: 'http://localhost/?prove=1', idb: idb, storage: { 'xau-q:state': fullStorage() }, fetch: async function (u, init) { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async function () { return { ok: true, simulated: false, stored: true, id: 'XAU-20261005-TEST22', submissionKey: bodies[0].submissionId, submittedAt: '2026-10-05T10:00:00.000Z', mode: 'test' }; } }; } });
  await p.app.ready();
  assert.match(p.d.getElementById('banners').textContent, /Modaliteti i provës/);
  p.d.getElementById('send').click();
  await tick(40);
  assert.equal(bodies[0].mode, 'test');
  assert.match(p.d.querySelector('.status').textContent, /\(provë\)/);
  p.w.close();
});

test('"Fillo nga e para" fshin draftin dhe fotot nga pajisja', async function () {
  var idb = new FIDB.IDBFactory();
  await withPhotoInIdb(idb, 'p1');
  var p = loadPage({ idb: idb, storage: { 'xau-q:state': fullStorage() } });
  await p.app.ready();
  p.d.getElementById('reset').click();
  await tick(60);
  assert.equal(p.app.getState().examples.length, 0);
  assert.equal(p.app.getState().answers.facts_review, undefined);
  assert.equal(current(p), 'facts');
  p.w.close();
});
