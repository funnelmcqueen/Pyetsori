'use strict';
/*
 * API e panelit privat: /api/admin?action=...
 * Çdo veprim (përveç hyrjes) kërkon sesion të vlefshëm, të kontrolluar në server.
 * Kredencialet: ADMIN_PASSWORD (≥ 16 shenja) dhe ADMIN_SESSION_SECRET (≥ 32 shenja), vetëm në server.
 */
var crypto = require('crypto');
var storageLib = require('./storage.js');
var subs = require('./submissions.js');

var SESSION_HOURS = 12;
var HEADER = 'x-xau-admin';

function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function safeEqual(a, b) {
  var ha = crypto.createHash('sha256').update(String(a)).digest();
  var hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function parseCookies(h) {
  var out = {};
  String(h || '').split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}

function adminConfig(env) {
  var pw = env.ADMIN_PASSWORD || '';
  var secret = env.ADMIN_SESSION_SECRET || '';
  var problems = [];
  if (pw.length < 16) problems.push('ADMIN_PASSWORD duhet të ketë të paktën 16 shenja');
  if (secret.length < 32) problems.push('ADMIN_SESSION_SECRET duhet të ketë të paktën 32 shenja');
  return { ok: problems.length === 0, problems: problems, password: pw, signingKey: hmac(secret, 'xau-admin-v1:' + crypto.createHash('sha256').update(pw).digest('hex')) };
}

function createAdminHandler(opts) {
  opts = opts || {};
  var env = opts.env || process.env;
  var deps = opts.deps || {};
  var nowMs = opts.nowMs || function () { return Date.now(); };
  var delay = opts.delay || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var failures = new Map();

  function secureReq(req) { return !!env.VERCEL || String(req.headers['x-forwarded-proto'] || '').indexOf('https') === 0; }
  function cookieName(req) { return secureReq(req) ? '__Host-xau_admin' : 'xau_admin'; }
  function cookieHeader(req, value, maxAge) {
    return cookieName(req) + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secureReq(req) ? '; Secure' : '');
  }
  function base(status, body, extraHeaders) {
    var h = Object.assign({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }, extraHeaders || {});
    if (Buffer.isBuffer(body)) return { status: status, headers: h, body: body };
    h['Content-Type'] = 'application/json; charset=utf-8';
    return { status: status, headers: h, body: Buffer.from(JSON.stringify(body), 'utf8') };
  }
  function sign(cfg) {
    var payload = b64u(JSON.stringify({ v: 1, exp: nowMs() + SESSION_HOURS * 3600 * 1000, n: b64u(crypto.randomBytes(9)) }));
    return payload + '.' + b64u(hmac(cfg.signingKey, payload));
  }
  function validSession(cfg, req) {
    var token = parseCookies(req.headers.cookie)[cookieName(req)];
    if (!token || token.indexOf('.') < 0) return false;
    var parts = token.split('.');
    var expected = hmac(cfg.signingKey, parts[0]);
    var got = fromB64u(parts[1]);
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
    try { var p = JSON.parse(fromB64u(parts[0]).toString('utf8')); return p.v === 1 && typeof p.exp === 'number' && p.exp > nowMs(); } catch (e) { return false; }
  }
  function sameOrigin(req) {
    var origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
  }

  return async function handle(req) {
    var cfg = adminConfig(env);
    if (!cfg.ok) return base(503, { ok: false, error: 'Paneli nuk është konfiguruar në server.', problems: cfg.problems });
    var q = req.query || {};
    var action = String(q.action || '');
    // Mbrojtje nga kërkesat e falsifikuara nga faqe të tjera: çdo thirrje vjen nga paneli me këtë header.
    if (req.headers[HEADER] !== '1' || !sameOrigin(req)) return base(403, { ok: false, error: 'Kërkesë e palejuar.' });

    if (action === 'login') {
      if (req.method !== 'POST') return base(405, { ok: false, error: 'Metoda nuk lejohet.' });
      var ip = req.ip || 'unknown';
      var f = failures.get(ip) || { n: 0, until: 0 };
      if (f.until > nowMs()) return base(429, { ok: false, error: 'Shumë përpjekje të gabuara. Provo përsëri më vonë.' });
      var pw = '';
      try { pw = String(JSON.parse(Buffer.from(req.rawBody || '').toString('utf8')).password || ''); } catch (e) { /* bosh */ }
      if (!safeEqual(pw, cfg.password)) {
        f.n += 1;
        if (f.n >= 5) { f.until = nowMs() + 15 * 60 * 1000; f.n = 0; }
        failures.set(ip, f);
        await delay(600);
        return base(401, { ok: false, error: 'Fjalëkalimi nuk është i saktë.' });
      }
      failures.delete(ip);
      return base(200, { ok: true }, { 'Set-Cookie': cookieHeader(req, sign(cfg), SESSION_HOURS * 3600) });
    }
    if (action === 'logout') {
      if (req.method !== 'POST') return base(405, { ok: false, error: 'Metoda nuk lejohet.' });
      return base(200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
    }

    // Nga këtu e tutje: vetëm me sesion të vlefshëm.
    if (!validSession(cfg, req)) return base(401, { ok: false, error: 'Duhet të hysh në panel.' });
    if (req.method !== 'GET') return base(405, { ok: false, error: 'Metoda nuk lejohet.' });

    var storage = storageLib.createStorage(env, deps);
    if (action === 'status') return base(200, { ok: true, storage: storage.mode, storageError: storage.mode === 'error' ? storage.error : null });
    if (storage.mode === 'none') return base(503, { ok: false, error: 'Ruajtja nuk është konfiguruar: nuk ka dorëzime të ruajtura.' });
    if (storage.mode === 'error') return base(503, { ok: false, error: storage.error });

    try {
      if (action === 'list') return base(200, { ok: true, submissions: await subs.listSubmissions(storage) });
      if (action === 'get') {
        var s = await subs.readSubmission(storage, String(q.key || '').toLowerCase());
        return base(200, { ok: true, manifest: s.manifest, answers: s.answers, spec: s.spec });
      }
      if (action === 'photo') {
        var ph = await subs.readPhoto(storage, String(q.key || '').toLowerCase(), String(q.name || ''));
        return base(200, ph.buf, { 'Content-Type': ph.type, 'Content-Disposition': 'inline; filename="' + ph.filename + '"' });
      }
      if (action === 'export') {
        var x = await subs.exportSubmission(storage, String(q.key || '').toLowerCase(), String(q.format || ''));
        return base(200, x.body, { 'Content-Type': x.contentType, 'Content-Disposition': 'attachment; filename="' + x.filename + '"', 'X-Filename': x.filename });
      }
      return base(400, { ok: false, error: 'Veprim i panjohur.' });
    } catch (e) {
      if (e && e.code === 'notfound') return base(404, { ok: false, error: e.message });
      if (e && e.code === 'missing') return base(409, { ok: false, error: e.message, missing: e.missing || [] });
      if (e && e.code === 'badformat') return base(400, { ok: false, error: e.message });
      console.error('[pyetesori] Gabim në panel:', e);
      return base(500, { ok: false, error: 'Gabim në server.' });
    }
  };
}

module.exports = { createAdminHandler: createAdminHandler, adminConfig: adminConfig };
