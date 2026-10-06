'use strict';
var fs = require('fs');
var path = require('path');
var Q = require('../public/questionnaire.js');

var TINY_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]).toString('base64');
var TINY_JPEG_URL = 'data:image/jpeg;base64,' + TINY_JPEG_B64;

function fullState() {
  var s = Q.emptyState();
  Object.assign(s.answers, {
    facts_review: 'ok',
    tf_signal: 'M15', tf_higher: 'H1', htf_candle: 'closed', sides: 'both',
    dir_method: 'ma', dir_ma_type: 'ema', dir_ma_period: '200', dir_ma_tf: 'H1', dir_ma_source: 'close', dir_ma_rule: 'close_vs_ma',
    cond: ['ma_cross', 'rsi'], cx_type: 'ema', cx_fast: '9', cx_slow: '21', cx_tf: 'same', cx_source: 'close',
    rsi_period: '14', rsi_tf: 'same', rsi_source: 'close', rsi_rule: 'RSI kalon mbi 50',
    combine: 'all', seq: 'same', sig_candle: 'closed', mirror: 'mirror',
    exe: 'market_close', spread_filter: 'dev', spread_block: 'cancel', new_signal: 'reset', entries_per_signal: '1', cooldown: 'none', opposite: 'ignore', skip: ['never'],
    account_ccy: 'USD', capital: '10000', size_method: 'risk_pct', lot_cap: 'no', size_conflict: 'skip',
    risk_pct: '1', risk_base: 'balance', max_trades: '3', max_open: '1', after_win: 'continue', loss_stop: 'none', daily_loss: 'no', day_reset: 'albania', account_kind: 'personal', other_trading: 'none',
    sl_method: 'fixed', sl_fixed: '5', sl_max: 'no', tp_method: 'r', tp_r: '2', mg_be: 'no', mg_partial: 'no', mg_trail: 'no',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'], t_from: '09:00', t_to: '17:00', t_tz: 'albania', t_dst: 'follow', end_positions: 'keep', friday: 'no', news: 'no', push: 'yes',
    tv_feed: 'oanda', tv_tz: 'albania', candle_type: 'standard', bt_from: '2026-09-01', bt_to: '2026-09-30', bt_trades: '20_40', bt_winrate: '50_55', bt_same_candle: 'never', bt_records: 'sheet',
    acc_period: 'same', acc_costs: 'real', acc_entry_tol: '0.5', acc_time_tol: 'same_candle', acc_match: 'explained'
  });
  s.examples = [
    { kind: 'buy', result: 'win', date: '2026-09-03', time: '10:15', tf: 'M15', entry: '2650.4', sl: '2645.4', tp: '2660.4', why: 'Kryqëzim dhe RSI mbi 50', photoId: 'p1' },
    { kind: 'sell', result: 'loss', date: '2026-09-10', time: '14:30', tf: 'M15', entry: '2660', sl: '2665', tp: '2650', why: 'Kryqëzim poshtë, RSI nën 50' },
    { kind: 'noentry', date: '2026-09-12', time: '09:45', tf: 'M15', why: 'RSI nuk e kaloi 50', photoId: null }
  ];
  return s;
}

// Krijon një draft të vjetër (v11) duke përdorur skedarin origjinal në një shfletues të simuluar.
function legacyDraftFromOriginal(actions) {
  var JSDOM = require('jsdom').JSDOM;
  var html = fs.readFileSync(path.join(__dirname, '..', 'original', 'Pyetesori-i-strategjise-roboti-XAUUSD.original.html'), 'utf8');
  var dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', beforeParse: function (w) { w.scrollTo = function () {}; } });
  var w = dom.window, d = w.document;
  function fire(e) { e.dispatchEvent(new w.Event('change', { bubbles: true })); e.dispatchEvent(new w.Event('input', { bubbles: true })); }
  actions({
    pick: function (name, value) { var e = d.querySelector('input[name="' + name + '"][value="' + value + '"]'); if (!e) throw new Error('missing ' + name + '=' + value); e.checked = true; fire(e); },
    uncheck: function (id) { var e = d.getElementById(id); e.checked = false; fire(e); },
    type: function (id, text) { var e = d.getElementById(id); if (!e) throw new Error('missing #' + id); e.value = text; fire(e); }
  });
  var raw = w.localStorage.getItem('xau-ea-questionnaire-v11');
  dom.window.close();
  return raw;
}

module.exports = { fullState: fullState, TINY_JPEG_B64: TINY_JPEG_B64, TINY_JPEG_URL: TINY_JPEG_URL, legacyDraftFromOriginal: legacyDraftFromOriginal };

// ---------- Ndihmës për ruajtjen ----------
var os = require('os');
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'xau-q-')); }
function listFiles(dir) {
  var out = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { var p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).split(path.sep).join('/')); }); })(dir);
  return out.sort();
}
// SDK i simuluar i Vercel Blob (në memorie), me të njëjtat funksione që përdor drejtuesi.
function fakeBlobSdk() {
  var store = new Map();
  function NotFound() { var e = new Error('not found'); e.name = 'BlobNotFoundError'; return e; }
  return {
    store: store,
    put: async function (p, body, o) {
      if (o.access !== 'private') throw new Error('duhet private');
      if (store.has(p) && !o.allowOverwrite) throw new Error('exists');
      store.set(p, { body: Buffer.from(body), contentType: o.contentType });
      return { pathname: p };
    },
    get: async function (p, o) {
      if (o.access !== 'private') throw new Error('duhet private');
      var v = store.get(p);
      if (!v) return null;
      return { statusCode: 200, stream: new ReadableStream({ start: function (c) { c.enqueue(new Uint8Array(v.body)); c.close(); } }) };
    },
    head: async function (p) { var v = store.get(p); if (!v) throw NotFound(); return { size: v.body.length, pathname: p }; },
    list: async function (o) {
      var all = Array.from(store.keys()).filter(function (k) { return k.indexOf(o.prefix || '') === 0; }).sort();
      return { blobs: all.map(function (k) { return { pathname: k, size: store.get(k).body.length }; }), hasMore: false };
    }
  };
}
function submitPayload(over) {
  var s = fullState();
  return Object.assign({ submissionId: require('crypto').randomUUID(), schemaVersion: Q.SCHEMA_VERSION, mode: 'real', state: { answers: s.answers, examples: s.examples, legacyNotes: [] }, photos: [{ id: 'p1', type: 'image/jpeg', data: TINY_JPEG_B64 }] }, over || {});
}
function jsonReq(body, extra) {
  extra = extra || {};
  var raw = typeof body === 'string' ? body : JSON.stringify(body);
  return Object.assign({ method: 'POST', headers: { 'content-type': 'application/json' }, ip: extra.ip || '1.1.1.1', rawBody: Buffer.from(raw) }, extra.over || {});
}
module.exports.tmpDir = tmpDir;
module.exports.listFiles = listFiles;
module.exports.fakeBlobSdk = fakeBlobSdk;
module.exports.submitPayload = submitPayload;
module.exports.jsonReq = jsonReq;
