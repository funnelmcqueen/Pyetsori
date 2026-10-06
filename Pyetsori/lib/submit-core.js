'use strict';
/*
 * POST /api/submit: validon përgjigjet dhe fotot në server, i ruan në ruajtje private
 * dhe e konfirmon dorëzimin vetëm pasi gjithçka është ruajtur dhe verifikuar.
 */
var Q = require('../public/questionnaire.js');
var storageLib = require('./storage.js');
var subs = require('./submissions.js');
var notify = require('./notify.js');

var LIMITS = {
  bodyBytes: 4 * 1024 * 1024,      // nën kufirin 4.5 MB të funksioneve në Vercel
  photoBytes: 700 * 1024,          // pas dekodimit; faqja i kompreson në ≤ 600 KB
  photosTotalBytes: 3.6 * 1024 * 1024,
  maxPhotos: Q.MAX_PHOTOS,
  rateWindowMs: 10 * 60 * 1000,
  rateMax: 8
};
var ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function magicOk(type, buf) {
  if (type === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function createSubmitHandler(opts) {
  opts = opts || {};
  var env = opts.env || process.env;
  var now = opts.now || function () { return new Date(); };
  var log = opts.log || function () { console.log.apply(console, arguments); };
  var deps = opts.deps || {};
  var rate = new Map();
  var inflight = new Map();

  function rateLimited(ip) {
    var t = Date.now();
    var arr = (rate.get(ip) || []).filter(function (x) { return t - x < LIMITS.rateWindowMs; });
    if (arr.length >= LIMITS.rateMax) { rate.set(ip, arr); return true; }
    arr.push(t);
    rate.set(ip, arr);
    return false;
  }
  function reply(status, body) { return { status: status, body: body }; }

  return async function handle(req) {
    if (req.method !== 'POST') return reply(405, { ok: false, error: 'Metoda nuk lejohet.' });
    if (String(req.headers['content-type'] || '').indexOf('application/json') !== 0) return reply(415, { ok: false, error: 'Formati i kërkesës nuk pranohet.' });
    var raw = req.rawBody;
    var size = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw || ''));
    if (size > LIMITS.bodyBytes) return reply(413, { ok: false, error: 'Dorëzimi është shumë i madh. Zvogëlo ose hiq disa foto.' });
    var body;
    try { body = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch (e) { return reply(400, { ok: false, error: 'Të dhënat nuk u lexuan.' }); }
    if (!body || typeof body !== 'object') return reply(400, { ok: false, error: 'Të dhënat nuk u lexuan.' });

    var key = String(body.submissionId || '').toLowerCase();
    if (!subs.isKey(key)) return reply(400, { ok: false, error: 'Identifikuesi i dorëzimit mungon.' });
    if (body.schemaVersion !== Q.SCHEMA_VERSION) return reply(409, { ok: false, error: 'Faqja është përditësuar. Rifreskoje dhe provo përsëri; përgjigjet janë të ruajtura në pajisje.' });
    var mode = body.mode === 'test' ? 'test' : 'real';

    // Kontroll i rreptë: refuzohet çdo gjë jashtë skemës; asgjë nuk shkurtohet ose ndryshohet.
    var strict = Q.strictCheck(body.state);
    if (strict.length) return reply(422, { ok: false, error: strict[0].msg + ' (' + strict.length + ' probleme)', fields: strict.map(function (e) { return e.id; }) });
    var state = { answers: body.state.answers, examples: body.state.examples || [], settingsPhotos: body.state.settingsPhotos || [], legacyNotes: body.state.legacyNotes || [] };
    var errors = Q.validate(state);
    if (errors.length) return reply(422, { ok: false, error: 'Disa pyetje të detyrueshme mungojnë (' + errors.length + '). Kthehu te pyetësori dhe plotësoji.', fields: errors.map(function (e) { return e.id; }) });

    // Fotot
    var photosIn = Array.isArray(body.photos) ? body.photos : [];
    if (photosIn.length > LIMITS.maxPhotos) return reply(413, { ok: false, error: 'Maksimumi ' + LIMITS.maxPhotos + ' foto. Hiq disa dhe provo përsëri.' });
    var names = Q.photoNames(state);
    var seen = {};
    var photos = [];
    var total = 0;
    for (var i = 0; i < photosIn.length; i++) {
      var p = photosIn[i] || {};
      if (!ALLOWED_TYPES[p.type]) return reply(415, { ok: false, error: 'Lejohen vetëm foto JPG, PNG ose WEBP.' });
      if (!names[p.id] || seen[p.id]) return reply(422, { ok: false, error: 'Një foto nuk i përket asnjë shembulli ose cilësimi.' });
      if (typeof p.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(p.data)) return reply(422, { ok: false, error: 'Një foto është e dëmtuar.' });
      var buf = Buffer.from(p.data, 'base64');
      if (!magicOk(p.type, buf)) return reply(415, { ok: false, error: 'Një skedar nuk është foto e vlefshme.' });
      if (buf.length > LIMITS.photoBytes) return reply(413, { ok: false, error: 'Fotoja ' + names[p.id] + ' është shumë e madhe.' });
      total += buf.length;
      if (total > LIMITS.photosTotalBytes) return reply(413, { ok: false, error: 'Fotot së bashku janë shumë të mëdha.' });
      seen[p.id] = true;
      photos.push({ id: p.id, type: p.type, buf: buf });
    }
    var expected = Object.keys(names).length;
    if (photos.length !== expected) return reply(422, { ok: false, error: 'Mungojnë ' + (expected - photos.length) + ' foto. Rifreskoje faqen dhe provo përsëri.' });
    // Fotot ruhen sipas renditjes së shembujve
    photos.sort(function (a, b) { return names[a.id] < names[b.id] ? -1 : 1; });

    var storage = storageLib.createStorage(env, deps);
    if (storage.mode === 'none') {
      log('[pyetesori] Ruajtja nuk është konfiguruar: dorëzim i simuluar, asgjë nuk u ruajt. Çelësi ' + key);
      return reply(200, { ok: true, simulated: true, stored: false, submissionKey: key, mode: mode });
    }
    if (storage.mode === 'error') {
      log('[pyetesori] Gabim konfigurimi i ruajtjes: ' + storage.error);
      return reply(503, { ok: false, error: 'Ruajtja nuk është konfiguruar siç duhet në server. Përgjigjet janë ende në pajisjen tënde.' });
    }
    if (inflight.has(key)) return reply(409, { ok: false, error: 'Ky dorëzim po ruhet ende. Prit pak dhe provo përsëri.' });
    if (rateLimited(req.ip || 'unknown')) return reply(429, { ok: false, error: 'Shumë përpjekje. Provo përsëri pas disa minutash.' });

    inflight.set(key, true);
    var saved;
    try {
      saved = await subs.saveSubmission(storage, { key: key, state: state, raw: body.state, photos: photos, mode: mode }, now());
    } catch (e) {
      if (e && e.code === 'conflict') return reply(409, { ok: false, error: 'Ky dorëzim ekziston tashmë me përmbajtje tjetër. Rifreskoje faqen dhe dorëzoje përsëri.' });
      log('[pyetesori] Ruajtja dështoi:', e && (e.code || '') , e && e.message);
      return reply(503, { ok: false, error: 'Ruajtja dështoi. Përgjigjet dhe fotot janë ende në pajisjen tënde; provo përsëri.' });
    } finally {
      inflight.delete(key);
    }
    var m = saved.manifest;

    // Njoftimi opsional: vetëm për dorëzime të reja, dhe nuk ndikon në konfirmim.
    if (saved.created) {
      var nc = notify.notifyConfig(env);
      if (nc.enabled) {
        try {
          await Promise.race([notify.sendNotification(nc, m, deps), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 5000); })]);
        } catch (e) { log('[pyetesori] Njoftimi nuk u dërgua (dorëzimi është i ruajtur):', e && e.message); }
      }
    }
    return reply(200, { ok: true, simulated: false, stored: true, id: m.id, submissionKey: m.submissionKey, submittedAt: m.submittedAt, mode: m.mode, photoCount: m.photoCount });
  };
}

module.exports = { createSubmitHandler: createSubmitHandler, LIMITS: LIMITS };
