'use strict';
// Server lokal: shërben faqet nga public/, POST /api/submit dhe /api/admin, pa Vercel.
// Përdorimi: npm run dev  (lexon .env nëse ekziston)
var http = require('http');
var fs = require('fs');
var path = require('path');

function loadEnv() {
  var f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) return;
    var v = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  });
}

var PUB = path.join(__dirname, '..', 'public');
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function createServer() {
  var submit = require('../api/submit.js');
  var admin = require('../api/admin.js');
  return http.createServer(function (req, res) {
    var url = req.url.split('?')[0];
    if (url === '/api/submit') return submit(req, res);
    if (url === '/api/admin') return admin(req, res);
    if (url === '/admin') url = '/admin.html';
    var file = path.normalize(path.join(PUB, url === '/' ? 'index.html' : url));
    if (file.indexOf(PUB) !== 0) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, function (err, data) {
      if (err) { res.statusCode = 404; return res.end('Nuk u gjet'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      if (/admin\.html$/.test(file)) { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Cache-Control', 'no-store'); }
      res.end(data);
    });
  });
}

if (require.main === module) {
  loadEnv();
  var storage = require('../lib/storage.js').createStorage(process.env);
  var admin = require('../lib/admin-core.js').adminConfig(process.env);
  var PORT = parseInt(process.env.PORT || '3000', 10);
  createServer().listen(PORT, function () {
    console.log('Pyetësori:  http://localhost:' + PORT);
    console.log('Paneli:     http://localhost:' + PORT + '/admin');
    console.log('Ruajtja:    ' + (storage.mode === 'none' ? 'NUK është konfiguruar: dorëzimet simulohen dhe NUK ruhen.' : storage.mode === 'error' ? 'GABIM: ' + storage.error : storage.mode));
    console.log('Hyrja:      ' + (admin.ok ? 'e konfiguruar' : 'NUK është konfiguruar (' + admin.problems.join('; ') + ')'));
  });
}

module.exports = { createServer: createServer };
