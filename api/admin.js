'use strict';
// Funksion serverless për Vercel: /api/admin?action=...  (paneli privat i pronarit)
var core = require('../lib/admin-core.js');
var handle = core.createAdminHandler();

function readRaw(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on('data', function (c) { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', function () { resolve(size > limit ? null : Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

module.exports = async function (req, res) {
  try {
    var url = new URL(req.url, 'http://localhost');
    var query = {};
    url.searchParams.forEach(function (v, k) { query[k] = v; });
    var raw = req.method === 'POST' ? await readRaw(req, 16 * 1024) : Buffer.alloc(0);
    if (raw === null) { res.statusCode = 413; return res.end(); }
    var ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
    var out = await handle({ method: req.method, headers: req.headers, query: query, rawBody: raw, ip: ip });
    res.statusCode = out.status;
    Object.keys(out.headers).forEach(function (k) { res.setHeader(k, out.headers[k]); });
    res.end(out.body);
  } catch (e) {
    console.error('[pyetesori] Gabim i papritur në panel:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Gabim në server.' }));
  }
};
