'use strict';
// Funksion serverless për Vercel: POST /api/submit
var core = require('../lib/submit-core.js');
var handle = core.createSubmitHandler();

function readRaw(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0, over = false;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) { over = true; return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(over ? null : Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    var raw = req.method === 'POST' ? await readRaw(req, core.LIMITS.bodyBytes) : Buffer.alloc(0);
    var ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
    var out = raw === null
      ? { status: 413, body: { ok: false, error: 'Dërgimi është shumë i madh. Zvogëlo ose hiq disa foto.' } }
      : await handle({ method: req.method, headers: req.headers, ip: ip, rawBody: raw });
    res.statusCode = out.status;
    res.end(JSON.stringify(out.body));
  } catch (e) {
    console.error('[pyetesori] Gabim i papritur:', e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'Gabim në server.' }));
  }
};
