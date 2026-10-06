'use strict';
/*
 * Ruajtja e përhershme private.
 *  - vercel-blob: Vercel Private Blob (prodhim). Çdo lexim kërkon autentikim; nuk ka URL publike.
 *  - file: dosje lokale, vetëm për zhvillim në kompjuterin tënd. Refuzohet në Vercel.
 *  - none: nuk ka ruajtje; dorëzimet vetëm simulohen dhe NUK ruhen.
 */
var fs = require('fs');
var path = require('path');

var KEY_RE = /^[A-Za-z0-9._\-/]+$/;

function checkKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key) || key.indexOf('..') >= 0 || key.charAt(0) === '/') throw new Error('Çelës i pavlefshëm: ' + key);
  return key;
}

function fileDriver(dir) {
  var root = path.resolve(dir);
  function full(key) { return path.join(root, checkKey(key)); }
  return {
    name: 'file',
    put: async function (key, body, contentType) {
      var f = full(key);
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      var tmp = f + '.tmp-' + process.pid + '-' + Date.now();
      await fs.promises.writeFile(tmp, body);
      await fs.promises.rename(tmp, f);
      return { key: key, size: body.length, contentType: contentType };
    },
    get: async function (key) {
      try { return await fs.promises.readFile(full(key)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    head: async function (key) {
      try { var st = await fs.promises.stat(full(key)); return { size: st.size }; } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    list: async function (prefix) {
      var base = full(prefix.replace(/\/$/, '') || '.');
      var out = [];
      async function walk(d) {
        var entries;
        try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
        for (var i = 0; i < entries.length; i++) {
          var p = path.join(d, entries[i].name);
          if (entries[i].isDirectory()) await walk(p);
          else if (entries[i].name.indexOf('.tmp-') < 0) out.push({ key: path.relative(root, p).split(path.sep).join('/'), size: (await fs.promises.stat(p)).size });
        }
      }
      await walk(base);
      return out;
    }
  };
}

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (typeof stream.getReader === 'function') {
    var reader = stream.getReader();
    var chunks = [];
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      chunks.push(Buffer.from(r.value));
    }
    return Buffer.concat(chunks);
  }
  var parts = [];
  for await (var c of stream) parts.push(Buffer.from(c));
  return Buffer.concat(parts);
}

function blobDriver(sdk, env) {
  var opts = {};
  if (env.BLOB_READ_WRITE_TOKEN) opts.token = env.BLOB_READ_WRITE_TOKEN;
  function o(extra) { return Object.assign({}, opts, extra || {}); }
  function notFound(e) { return e && (e.name === 'BlobNotFoundError' || e.constructor && e.constructor.name === 'BlobNotFoundError'); }
  return {
    name: 'vercel-blob',
    put: async function (key, body, contentType) {
      await sdk.put(checkKey(key), body, o({ access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: contentType }));
      return { key: key, size: body.length, contentType: contentType };
    },
    get: async function (key) {
      var r = await sdk.get(checkKey(key), o({ access: 'private', useCache: false }));
      if (!r || r.statusCode === 404) return null;
      return streamToBuffer(r.stream);
    },
    head: async function (key) {
      try { var h = await sdk.head(checkKey(key), o()); return h ? { size: h.size } : null; } catch (e) { if (notFound(e)) return null; throw e; }
    },
    list: async function (prefix) {
      var out = [], cursor;
      do {
        var r = await sdk.list(o({ prefix: prefix, cursor: cursor, limit: 1000 }));
        (r.blobs || []).forEach(function (b) { out.push({ key: b.pathname, size: b.size }); });
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    }
  };
}

// Vendos drejtuesin sipas mjedisit. Kthen { driver, mode, error }.
function createStorage(env, deps) {
  env = env || process.env;
  deps = deps || {};
  var onVercel = !!env.VERCEL;
  var wanted = String(env.STORAGE_DRIVER || '').toLowerCase();
  if (!wanted && (env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID)) wanted = 'vercel-blob';
  var prefix = String(env.STORAGE_PREFIX || 'xau-q').replace(/\/+$/, '') + '/';
  if (!wanted || wanted === 'none') return { mode: 'none', driver: null, prefix: prefix, error: null };
  if (wanted === 'file') {
    if (onVercel) return { mode: 'error', driver: null, prefix: prefix, error: 'STORAGE_DRIVER=file nuk lejohet në Vercel: skedarët e funksionit janë të përkohshëm. Përdor Vercel Private Blob.' };
    return { mode: 'file', driver: fileDriver(env.STORAGE_DIR || path.join(__dirname, '..', '.data')), prefix: prefix, error: null };
  }
  if (wanted === 'vercel-blob') {
    var sdk = deps.blobSdk;
    if (!sdk) { try { sdk = require('@vercel/blob'); } catch (e) { return { mode: 'error', driver: null, prefix: prefix, error: 'Paketa @vercel/blob mungon.' }; } }
    if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return { mode: 'error', driver: null, prefix: prefix, error: 'Mungon lidhja me Blob store (BLOB_READ_WRITE_TOKEN ose BLOB_STORE_ID).' };
    return { mode: 'vercel-blob', driver: blobDriver(sdk, env), prefix: prefix, error: null };
  }
  return { mode: 'error', driver: null, prefix: prefix, error: 'STORAGE_DRIVER i panjohur: ' + wanted };
}

module.exports = { createStorage: createStorage, fileDriver: fileDriver, blobDriver: blobDriver, checkKey: checkKey };
