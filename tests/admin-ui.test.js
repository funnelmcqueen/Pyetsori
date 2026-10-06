'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var H = require('./helpers.js');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
var QJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'questionnaire.js'), 'utf8');
var ADMJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

function mkRes(w, status, data, headers) {
  var isBin = data instanceof Uint8Array;
  return {
    ok: status >= 200 && status < 300, status: status,
    headers: { get: function (k) { return (headers || {})[k] || null; } },
    json: async function () { return isBin ? {} : data; },
    blob: async function () { return new w.Blob([isBin ? data : JSON.stringify(data)]); }
  };
}
function loadAdmin(routes) {
  var dom = new JSDOM(HTML, { url: 'https://pyetesori.test/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  var w = dom.window;
  var calls = [];
  var downloads = [];
  w.scrollTo = function () {};
  w.URL.createObjectURL = function () { return 'blob:test/' + Math.random(); };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () { downloads.push({ download: this.getAttribute('download'), href: this.getAttribute('href') }); };
  w.fetch = async function (url, init) {
    var u = new URL(url, 'https://pyetesori.test');
    var action = u.searchParams.get('action');
    calls.push({ action: action, params: Object.fromEntries(u.searchParams), init: init });
    var r = routes(action, u.searchParams, init, calls);
    return mkRes(w, r[0], r[1], r[2]);
  };
  w.eval(QJS); w.eval(ADMJS);
  return { w: w, d: w.document, calls: calls, downloads: downloads };
}
var SUB = { id: 'XAU-20261005-ABCDEF', key: '11111111-2222-4333-8444-555555555555', submittedAt: '2026-10-05T10:00:00.000Z', mode: 'real', photoCount: 1, ready: true, openItems: 0, schemaVersion: 4 };

test('pa sesion shfaqet hyrja; pas hyrjes lista me datën, ID-në, fotot dhe statusin', async function () {
  var loggedIn = false;
  var p = loadAdmin(function (action, params, init) {
    if (action === 'login') { loggedIn = JSON.parse(init.body).password === 'sakte'; return loggedIn ? [200, { ok: true }] : [401, { ok: false, error: 'Fjalëkalimi nuk është i saktë.' }]; }
    if (!loggedIn) return [401, { ok: false }];
    if (action === 'status') return [200, { ok: true, storage: 'vercel-blob' }];
    if (action === 'list') return [200, { ok: true, submissions: [SUB, Object.assign({}, SUB, { id: 'XAU-20261004-QWERTY', key: '21111111-2222-4333-8444-555555555555', mode: 'test', ready: false, openItems: 3, photoCount: 0 })] }];
    return [404, {}];
  });
  await tick(20);
  assert.equal(p.d.getElementById('view-login').hidden, false);
  p.d.getElementById('pw').value = 'gabim';
  p.d.getElementById('login-form').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await tick(20);
  assert.match(p.d.getElementById('login-msg').textContent, /nuk është i saktë/);
  p.d.getElementById('pw').value = 'sakte';
  p.d.getElementById('login-form').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await tick(40);
  assert.equal(p.d.getElementById('view-list').hidden, false);
  assert.equal(p.d.getElementById('pw').value, '', 'fjalëkalimi pastrohet');
  var cards = p.d.querySelectorAll('#cards .card');
  assert.equal(cards.length, 2);
  assert.match(cards[0].textContent, /XAU-20261005-ABCDEF/);
  assert.match(cards[0].textContent, /Dorëzim real/);
  assert.match(cards[0].textContent, /Gati për programim/);
  assert.match(cards[0].textContent, /Foto: 1/);
  assert.match(cards[1].textContent, /Provë/);
  assert.match(cards[1].textContent, /Jo gati: 3/);
  assert.match(p.d.getElementById('storage-line').textContent, /Vercel Private Blob/);
  p.calls.forEach(function (c) { assert.equal(c.init.headers['X-XAU-Admin'], '1'); assert.equal(c.init.credentials, 'same-origin'); });
  p.w.close();
});

test('eksporti shkarkon në pajisje me emrin nga serveri; ZIP i paplotë tregon gabim dhe nuk shkarkohet', async function () {
  var p = loadAdmin(function (action, params) {
    if (action === 'status') return [200, { ok: true, storage: 'file' }];
    if (action === 'list') return [200, { ok: true, submissions: [SUB] }];
    if (action === 'export' && params.get('format') === 'zip') return [409, { ok: false, error: 'Paketa nuk është e plotë: mungon shembulli-1-buy-win.jpg.', missing: ['shembulli-1-buy-win.jpg'] }];
    if (action === 'export') return [200, new Uint8Array([1, 2, 3]), { 'X-Filename': 'pyetesori-xauusd-2026-10-05-XAU-20261005-ABCDEF.' + params.get('format') }];
    return [404, {}];
  });
  await tick(30);
  var card = p.d.querySelector('#cards .card');
  var menu = card.querySelector('details.export');
  assert.match(menu.textContent, /Paketë e plotë ZIP/);
  assert.match(menu.textContent, /Specifikimi TXT/);
  assert.match(menu.textContent, /Përgjigjet JSON/);
  assert.match(menu.textContent, /TXT dhe JSON nuk përmbajnë fotografitë/);
  menu.querySelector('button[data-format="txt"]').click();
  await tick(20);
  assert.deepEqual(p.downloads.map(function (d) { return d.download; }), ['pyetesori-xauusd-2026-10-05-XAU-20261005-ABCDEF.txt']);
  assert.match(card.querySelector('p.msg').textContent, /\(pa foto\)/);
  var exp = p.calls.filter(function (c) { return c.action === 'export'; })[0];
  assert.equal(exp.params.key, SUB.key);
  menu.querySelector('button[data-format="zip"]').click();
  await tick(20);
  assert.equal(p.downloads.length, 1, 'ZIP i paplotë nuk shkarkohet');
  assert.match(card.querySelector('p.msg').textContent, /nuk është e plotë/);
  assert.match(card.querySelector('p.msg').textContent, /ZIP-i nuk u shkarkua/);
  p.w.close();
});

test('detajet e një dorëzimi shfaqen nga të dhënat e ruajtura, me foto përmes panelit', async function () {
  var state = H.fullState();
  var photoCalls = 0;
  var p = loadAdmin(function (action, params) {
    if (action === 'status') return [200, { ok: true, storage: 'file' }];
    if (action === 'list') return [200, { ok: true, submissions: [SUB] }];
    if (action === 'get') return [200, { ok: true, manifest: Object.assign({ submissionKey: SUB.key, photos: [] }, SUB), answers: { schemaVersion: 4, state: { answers: state.answers, examples: state.examples, legacyNotes: [] } }, spec: 'XAUUSD EA SPECIFICATION ...' }];
    if (action === 'photo') { photoCalls++; return [200, new Uint8Array([0xff, 0xd8, 0xff])]; }
    return [404, {}];
  });
  await tick(30);
  p.d.querySelector('#cards .card button.ghost').click();
  await tick(40);
  assert.equal(p.d.getElementById('view-detail').hidden, false);
  var t = p.d.getElementById('detail').textContent;
  assert.match(t, /XAU-20261005-ABCDEF/);
  assert.match(t, /Entry signal për BUY/);
  assert.match(t, /RSI kalon mbi 50/);
  assert.match(t, /XAUUSD EA SPECIFICATION/);
  assert.equal(photoCalls, 1);
  assert.ok(p.d.querySelector('#detail img').getAttribute('src').indexOf('blob:') === 0);
  p.w.close();
});

test('paneli i pakonfiguruar tregon çfarë mungon', async function () {
  var p = loadAdmin(function () { return [503, { ok: false, error: 'Paneli nuk është konfiguruar në server.', problems: ['ADMIN_PASSWORD duhet të ketë të paktën 16 shenja'] }]; });
  await tick(20);
  assert.equal(p.d.getElementById('view-config').hidden, false);
  assert.match(p.d.getElementById('config-problems').textContent, /ADMIN_PASSWORD/);
  p.w.close();
});
