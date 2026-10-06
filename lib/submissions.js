'use strict';
/*
 * Dorëzimet: ruajtja (pa dyfishim, me verifikim), leximi dhe eksporti.
 * Struktura në ruajtje (private):
 *   <prefix>submissions/<çelësi>/intent.json        ID-ja e caktuar nga serveri dhe hash-i i përmbajtjes
 *   <prefix>submissions/<çelësi>/fotot/<emri>.jpg   fotot
 *   <prefix>submissions/<çelësi>/pergjigjet.json    përgjigjet e strukturuara
 *   <prefix>submissions/<çelësi>/specifikimi.txt    specifikimi për Claude Code
 *   <prefix>submissions/<çelësi>/manifest.json      shkruhet i FUNDIT: dorëzimi quhet i kryer vetëm kur ekziston
 */
var crypto = require('crypto');
var fflate = require('fflate');
var Q = require('../public/questionnaire.js');

var KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var TXT_NOTE = 'Fotot nuk përfshihen në këtë skedar. Për fotot përdor paketën e plotë ZIP.';

function StoreError(code, message, extra) {
  var e = new Error(message);
  e.code = code;
  if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
  return e;
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
  return JSON.stringify(v);
}
function tiranaParts(d) {
  var m = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(function (p) { m[p.type] = p.value; });
  return m;
}
function tiranaDate(d) { var m = tiranaParts(d); return m.year + '-' + m.month + '-' + m.day; }
function newDisplayId(d) {
  var m = tiranaParts(d);
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var rnd = crypto.randomBytes(6);
  var tail = '';
  for (var i = 0; i < 6; i++) tail += alphabet[rnd[i] % alphabet.length];
  return 'XAU-' + m.year + m.month + m.day + '-' + tail;
}
function isKey(k) { return typeof k === 'string' && KEY_RE.test(k); }
function base(storage, key) { return storage.prefix + 'submissions/' + key.toLowerCase() + '/'; }
async function getJson(driver, path) {
  var buf = await driver.get(path);
  if (!buf) return null;
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw StoreError('corrupt', 'Skedar i dëmtuar: ' + path); }
}

// Hash-i i përmbajtjes: i njëjti për çdo riprovim të të njëjtave përgjigje dhe fotove.
function payloadHash(state, photos) {
  return sha256(canonical({ state: state, photos: photos.map(function (p) { return { id: p.id, type: p.type, sha256: sha256(p.buf) }; }) }));
}

/**
 * Ruan një dorëzim. Kthen manifestin vetëm pasi çdo skedar është shkruar dhe verifikuar.
 * Riprovimet me të njëjtin çelës dhe të njëjtën përmbajtje kthejnë të njëjtin dorëzim, pa kopje.
 */
async function saveSubmission(storage, input, now) {
  var d = storage.driver;
  var key = input.key.toLowerCase();
  var b = base(storage, key);
  var hash = payloadHash(input.state, input.photos);

  var existing = await getJson(d, b + 'manifest.json');
  if (existing) {
    if (existing.payloadHash !== hash) throw StoreError('conflict', 'Ky dorëzim ekziston tashmë me përmbajtje tjetër.');
    return { manifest: existing, created: false };
  }

  var intent = await getJson(d, b + 'intent.json');
  if (intent && intent.payloadHash !== hash) throw StoreError('conflict', 'Ky dorëzim ekziston tashmë me përmbajtje tjetër.');
  if (!intent) {
    intent = { id: newDisplayId(now), key: key, firstAttemptAt: now.toISOString(), payloadHash: hash };
    await d.put(b + 'intent.json', Buffer.from(JSON.stringify(intent, null, 2) + '\n', 'utf8'), 'application/json');
  }

  var names = Q.photoNames(input.state);
  var photoMeta = input.photos.map(function (p) {
    var ex = (input.state.examples || []).findIndex(function (e) { return e.photoId === p.id; });
    return { photoId: p.id, filename: names[p.id], type: p.type, bytes: p.buf.length, sha256: sha256(p.buf), exampleIndex: ex + 1 };
  });
  var submittedAt = now.toISOString();
  var an = Q.analyze(input.state);
  var spec = Q.buildSpec(input.state, { submissionId: intent.id, date: tiranaDate(now), submitted: true, photoNames: names, photoCount: photoMeta.length });
  var specBuf = Buffer.from(spec + '\n', 'utf8');
  var answers = {
    format: 'xauusd-pyetesori',
    schemaVersion: Q.SCHEMA_VERSION,
    id: intent.id,
    submissionKey: key,
    submittedAt: submittedAt,
    mode: input.mode,
    photosIncluded: false,
    photosNote: TXT_NOTE,
    photos: photoMeta,
    state: input.state
  };
  var answersBuf = Buffer.from(JSON.stringify(answers, null, 2) + '\n', 'utf8');

  for (var i = 0; i < input.photos.length; i++) await d.put(b + 'fotot/' + photoMeta[i].filename, input.photos[i].buf, input.photos[i].type);
  await d.put(b + 'pergjigjet.json', answersBuf, 'application/json; charset=utf-8');
  await d.put(b + 'specifikimi.txt', specBuf, 'text/plain; charset=utf-8');

  var manifest = {
    format: 'xauusd-pyetesori-manifest',
    id: intent.id,
    submissionKey: key,
    submittedAt: submittedAt,
    firstAttemptAt: intent.firstAttemptAt,
    mode: input.mode,
    storage: storage.mode,
    schemaVersion: Q.SCHEMA_VERSION,
    payloadHash: hash,
    ready: an.ready,
    openItems: an.errors.length + an.unresolved.length + an.contradictions.length,
    photoCount: photoMeta.length,
    photos: photoMeta.map(function (p) { return { filename: p.filename, type: p.type, bytes: p.bytes, sha256: p.sha256 }; }),
    files: {
      answers: { name: 'pergjigjet.json', bytes: answersBuf.length, sha256: sha256(answersBuf) },
      spec: { name: 'specifikimi.txt', bytes: specBuf.length, sha256: sha256(specBuf) }
    }
  };
  // Verifikimi i skedarëve PARA manifestit: dorëzimi nuk shfaqet si i kryer nëse mungon diçka.
  var checks = [{ p: b + 'pergjigjet.json', n: answersBuf.length }, { p: b + 'specifikimi.txt', n: specBuf.length }]
    .concat(photoMeta.map(function (m) { return { p: b + 'fotot/' + m.filename, n: m.bytes }; }));
  for (var j = 0; j < checks.length; j++) {
    var h = await d.head(checks[j].p);
    if (!h || h.size !== checks[j].n) throw StoreError('verify', 'Verifikimi dështoi për ' + checks[j].p);
  }
  var manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await d.put(b + 'manifest.json', manifestBuf, 'application/json; charset=utf-8');
  var back = await d.get(b + 'manifest.json');
  if (!back || sha256(back) !== sha256(manifestBuf)) throw StoreError('verify', 'Verifikimi i manifestit dështoi.');
  return { manifest: manifest, created: true };
}

async function listSubmissions(storage) {
  var all = await storage.driver.list(storage.prefix + 'submissions/');
  var manifests = all.filter(function (o) { return /\/manifest\.json$/.test(o.key); });
  var out = [];
  for (var i = 0; i < manifests.length; i++) {
    var m = await getJson(storage.driver, manifests[i].key);
    if (m) out.push({ id: m.id, key: m.submissionKey, submittedAt: m.submittedAt, mode: m.mode, photoCount: m.photoCount, ready: m.ready, openItems: m.openItems, schemaVersion: m.schemaVersion });
  }
  return out.sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; });
}

async function readManifest(storage, key) {
  if (!isKey(key)) throw StoreError('notfound', 'Dorëzimi nuk u gjet.');
  var m = await getJson(storage.driver, base(storage, key) + 'manifest.json');
  if (!m) throw StoreError('notfound', 'Dorëzimi nuk u gjet.');
  return m;
}
async function readVerified(storage, key, file, expected) {
  var buf = await storage.driver.get(base(storage, key) + file);
  if (!buf) throw StoreError('missing', 'Mungon skedari ' + file + '.', { missing: [file] });
  if (expected && sha256(buf) !== expected) throw StoreError('missing', 'Skedari ' + file + ' nuk përputhet me dorëzimin e ruajtur.', { missing: [file] });
  return buf;
}

async function readSubmission(storage, key) {
  var m = await readManifest(storage, key);
  var answersBuf = await readVerified(storage, key, 'pergjigjet.json', m.files.answers.sha256);
  var specBuf = await readVerified(storage, key, 'specifikimi.txt', m.files.spec.sha256);
  return { manifest: m, answers: JSON.parse(answersBuf.toString('utf8')), spec: specBuf.toString('utf8') };
}

async function readPhoto(storage, key, filename) {
  var m = await readManifest(storage, key);
  var meta = m.photos.filter(function (p) { return p.filename === filename; })[0];
  if (!meta) throw StoreError('notfound', 'Fotoja nuk u gjet.');
  var buf = await readVerified(storage, key, 'fotot/' + filename, meta.sha256);
  return { buf: buf, type: meta.type, filename: filename };
}

function exportName(m, ext) { return 'pyetesori-xauusd-' + tiranaDate(new Date(m.submittedAt)) + '-' + m.id + '.' + ext; }

async function exportSubmission(storage, key, format) {
  var m = await readManifest(storage, key);
  if (format === 'txt') return { filename: exportName(m, 'txt'), contentType: 'text/plain; charset=utf-8', body: await readVerified(storage, key, 'specifikimi.txt', m.files.spec.sha256) };
  if (format === 'json') return { filename: exportName(m, 'json'), contentType: 'application/json; charset=utf-8', body: await readVerified(storage, key, 'pergjigjet.json', m.files.answers.sha256) };
  if (format !== 'zip') throw StoreError('badformat', 'Format i panjohur.');
  var spec = await readVerified(storage, key, 'specifikimi.txt', m.files.spec.sha256);
  var answers = await readVerified(storage, key, 'pergjigjet.json', m.files.answers.sha256);
  var files = { 'specifikimi.txt': [new Uint8Array(spec), { level: 6 }], 'pergjigjet.json': [new Uint8Array(answers), { level: 6 }] };
  var missing = [];
  for (var i = 0; i < m.photos.length; i++) {
    var p = m.photos[i];
    var buf = await storage.driver.get(base(storage, key) + 'fotot/' + p.filename);
    if (!buf || sha256(buf) !== p.sha256) { missing.push(p.filename); continue; }
    files['fotot/' + p.filename] = [new Uint8Array(buf), { level: 0 }];
  }
  if (missing.length) throw StoreError('missing', 'Paketa nuk është e plotë: mungon ' + missing.join(', ') + '.', { missing: missing });
  var zip = fflate.zipSync(files, { mtime: new Date(m.submittedAt) });
  return { filename: exportName(m, 'zip'), contentType: 'application/zip', body: Buffer.from(zip) };
}

module.exports = {
  saveSubmission: saveSubmission, listSubmissions: listSubmissions, readSubmission: readSubmission,
  readPhoto: readPhoto, exportSubmission: exportSubmission, payloadHash: payloadHash, isKey: isKey,
  sha256: sha256, tiranaDate: tiranaDate, exportName: exportName, TXT_NOTE: TXT_NOTE
};
