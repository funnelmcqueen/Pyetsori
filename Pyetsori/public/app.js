/* Pyetësori XAUUSD: ndërfaqja. Kërkon questionnaire.js (window.XAUQ). */
(function () {
  'use strict';
  var Q = window.XAUQ;
  var meta = document.querySelector('meta[name="xau-endpoint"]');
  var ENDPOINT = (meta && meta.content) || '/api/submit';
  var LEGACY_KEYS = ['xau-ea-questionnaire-v11', 'xau-ea-questionnaire-v10', 'xau-ea-questionnaire-v9', 'xau-ea-questionnaire-v8', 'xau-ea-questionnaire-v7', 'xau-ea-questionnaire-v6', 'xau-ea-questionnaire-v5', 'xau-ea-questionnaire-v4', 'xau-ea-questionnaire-v3', 'xau-ea-questionnaire-v2', 'xau-ea-questionnaire-v1'];
  var OLD_STEP_TO_SCREEN = ['facts', 'chart', 'conditions', 'order', 'size', 'sl', 'hours', 'examples', 'review'];
  var MAX_PHOTO_BYTES = 320 * 1024;   // pas kompresimit, për foto (8 foto mbeten nën kufirin e kërkesës)
  var MAX_BODY_CHARS = 4000000;       // nën kufirin 4.5 MB të hostimit
  var TIMEOUT_MS = 60000;
  // ?prove=1 te linku: dorëzimi shënohet si provë (për testet e pronarit), jo si dorëzim real.
  var TEST_MODE = /[?&]prove=1(&|$)/.test(window.location.search);
  var SECTION_COUNT = Q.SECTIONS.length - 1;   // pa "Kontrollo përgjigjet"

  var app = document.getElementById('app');
  var state;
  var storageOk = true;
  var photoCache = {};
  var sending = false;
  var screensById = {};
  Q.SCREENS.forEach(function (s) { screensById[s.id] = s; });

  // ---------------- Ndihmës ----------------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'cls') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }
  function cleanExamples() { return state.examples.map(function (e) { var c = {}; Object.keys(e).forEach(function (k) { if (k !== '_k') c[k] = e[k]; }); return c; }); }
  function cleanSettings() { return (state.settingsPhotos || []).map(function (p) { return { photoId: p.photoId || null, note: p.note || '' }; }); }
  function fingerprint() { return fnv(JSON.stringify({ a: state.answers, e: cleanExamples(), s: cleanSettings(), n: state.legacyNotes })); }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('sq-AL', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
  }
  function sectionIndex(id) { for (var i = 0; i < Q.SECTIONS.length; i++) if (Q.SECTIONS[i].id === id) return i; return 0; }

  // ---------------- Banera ----------------
  var banners = {};
  function banner(key, kind, text) {
    var box = document.getElementById('banners');
    if (banners[key]) { banners[key].remove(); delete banners[key]; }
    if (!kind) return;
    var b = el('p', { cls: 'banner ' + kind, role: kind === 'err' ? 'alert' : 'status', text: text });
    banners[key] = b;
    box.appendChild(b);
  }
  function setSaved(t) { document.getElementById('saved').textContent = t; }

  // ---------------- Ruajtja e draftit ----------------
  function saveNow() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(Q.STORAGE_KEY, JSON.stringify(state));
      setSaved('Ruajtur automatikisht në këtë pajisje');
      if (!storageOk) { storageOk = true; banner('storage'); }
    } catch (e) {
      storageOk = false;
      setSaved('');
      banner('storage', 'err', 'Ruajtja automatike dështoi në këtë pajisje (memoria mund të jetë plot ose je në shfletim privat). Mos e mbyll faqen para se t\'i dorëzosh përgjigjet.');
    }
  }
  var saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }

  function backup(key, raw, shots) {
    try {
      if (localStorage.getItem(Q.BACKUP_KEY)) return true;
      localStorage.setItem(Q.BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), key: key, raw: raw, shots: shots || null }));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    var raw = null, rawKey = Q.STORAGE_KEY;
    try {
      raw = localStorage.getItem(Q.STORAGE_KEY);
      for (var k = 0; !raw && k < Q.PREV_STORAGE_KEYS.length; k++) { raw = localStorage.getItem(Q.PREV_STORAGE_KEYS[k]); rawKey = Q.PREV_STORAGE_KEYS[k]; }
    } catch (e) { storageOk = false; }
    if (raw) {
      try {
        var orig = JSON.parse(raw);
        var d = Q.migrateState(orig);
        if (d && (rawKey !== Q.STORAGE_KEY || orig.schemaVersion !== Q.SCHEMA_VERSION)) backup(rawKey, raw, null);
        if (d && d.schemaVersion === Q.SCHEMA_VERSION) {
          state = Q.sanitizeState(d);
          state.examples.forEach(function (ex, i) { ex._k = (d.examples[i] && d.examples[i]._k) || uuid(); });
          state.screen = screensById[d.screen] ? d.screen : (typeof d.step === 'number' ? OLD_STEP_TO_SCREEN[d.step] || 'facts' : 'facts');
          state.submission = d.submission && typeof d.submission === 'object' ? d.submission : null;
          state.pending = d.pending && typeof d.pending === 'object' ? d.pending : null;
          if (rawKey !== Q.STORAGE_KEY || orig.schemaVersion !== Q.SCHEMA_VERSION) saveNow();
          return Promise.resolve();
        }
      } catch (e) { /* bie poshtë */ }
      backup(rawKey, raw, null);
    }
    state = Q.emptyState();
    state.screen = 'facts';
    state.submission = null;
    state.pending = null;
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var lraw = null, lshots = null;
      try { lraw = localStorage.getItem(LEGACY_KEYS[i]); lshots = localStorage.getItem(LEGACY_KEYS[i] + '-shots'); } catch (e) { /* */ }
      if (!lraw && !lshots) continue;
      var backedUp = backup(LEGACY_KEYS[i], lraw, lshots);
      var m = lraw ? Q.migrateLegacy(lraw, lshots) : null;
      if (!m) {
        banner('legacy', 'warn', 'U gjet një draft i vjetër që nuk mund të lexohet automatikisht. ' + (backedUp ? 'U ruajt si kopje rezervë në këtë pajisje.' : '') + ' Plotësoje pyetësorin nga e para.');
        return Promise.resolve();
      }
      Object.keys(m.answers).forEach(function (k) { state.answers[k] = m.answers[k]; });
      state.legacyNotes = m.legacyNotes;
      var puts = m.photos.map(function (p) {
        var id = uuid();
        state.examples.push({ _k: uuid(), photoId: id });
        photoCache[id] = p.dataUrl;
        return putPhoto(id, { dataUrl: p.dataUrl, name: p.name || 'foto.jpg' });
      });
      banner('legacy', 'warn', 'Përgjigjet nga drafti yt i mëparshëm u kaluan në këtë version (dhe u ruajt një kopje rezervë). Disa pyetje janë të reja, prandaj kontrolloji të gjitha pjesët.');
      return Promise.all(puts).then(function () { saveNow(); });
    }
    return Promise.resolve();
  }

  // ---------------- Fotot (IndexedDB) ----------------
  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        var req = window.indexedDB.open('xau-q-photos', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    }).then(function (d) {
      if (!d) banner('photos', 'warn', 'Fotot nuk mund të ruhen në këtë pajisje. Mos e rifresko faqen derisa t\'i dorëzosh përgjigjet.');
      return d;
    });
    return dbPromise;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('photos', mode);
        var r = fn(tx.objectStore('photos'));
        tx.oncomplete = function () { resolve(r && 'result' in r ? r.result : null); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function putPhoto(id, rec) {
    photoCache[id] = rec.dataUrl;
    return idb('readwrite', function (s) { return s.put(rec, id); }).catch(function () {
      banner('photos', 'warn', 'Fotoja nuk u ruajt në memorien e pajisjes. Mos e rifresko faqen derisa t\'i dorëzosh përgjigjet.');
    });
  }
  function getPhoto(id) {
    if (photoCache[id]) return Promise.resolve(photoCache[id]);
    return idb('readonly', function (s) { return s.get(id); }).then(function (rec) {
      if (rec && rec.dataUrl) photoCache[id] = rec.dataUrl;
      return photoCache[id] || null;
    }).catch(function () { return null; });
  }
  function delPhoto(id) {
    delete photoCache[id];
    return idb('readwrite', function (s) { return s.delete(id); }).catch(function () {});
  }
  function dataUrlBytes(u) { var i = u.indexOf(','); return Math.floor((u.length - i - 1) * 3 / 4); }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Zgjidh një fotografi (JPG, PNG ose WEBP).'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Fotoja nuk u lexua. Provo një tjetër.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Fotoja nuk u lexua. Provo një tjetër.')); };
        img.onload = function () {
          var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
          for (var attempt = 0; attempt < 5; attempt++) {
            var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
            for (var q = 0.82; q >= 0.5; q -= 0.08) {
              var url = c.toDataURL('image/jpeg', q);
              if (dataUrlBytes(url) <= MAX_PHOTO_BYTES) return resolve({ dataUrl: url });
            }
            scale *= 0.75;
          }
          reject(new Error('Fotoja është shumë e madhe edhe pas zvogëlimit. Bëj një screenshot më të vogël.'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------------- Ekranet ----------------
  function screenVisible(s) {
    if (s.special) return true;
    return Q.QUESTIONS.some(function (q) { return q.screen === s.id && q.type !== 'info' && Q.isVisible(q.id, state); });
  }
  function visibleScreens() { return Q.SCREENS.filter(screenVisible); }

  // ---------------- Pyetjet ----------------
  var qEls = {};
  function labelNode(q, forId) {
    var lab = el(forId ? 'label' : 'legend', forId ? { cls: 'ql', for: forId } : null);
    lab.appendChild(el('span', { 'data-tpl': q.sq, text: Q.fill(q.sq, state) }));
    if (q.opt) lab.appendChild(el('span', { cls: 'opt-tag', text: ' (opsionale)' }));
    if (q.hint) lab.appendChild(el('span', { cls: 'hint', text: q.hint }));
    if (q.ex) lab.appendChild(el('span', { cls: 'hint ex', text: 'Shembull: ' + q.ex }));
    return lab;
  }
  function unknownToggle(q) {
    var cb = el('input', { type: 'checkbox', 'data-unk': q.id });
    if (state.answers['?' + q.id]) cb.checked = true;
    return el('label', { cls: 'unk' }, [cb, el('span', { text: Q.UNKNOWN_SQ })]);
  }
  function chipInput(type, name, opt, checked, extra) {
    var inp = el('input', { type: type, name: name, value: opt.v });
    if (extra) Object.keys(extra).forEach(function (k) { inp.setAttribute(k, extra[k]); });
    if (checked) inp.checked = true;
    return el('label', { cls: opt.v === Q.UNKNOWN ? 'unkchip' : null }, [inp, el('span', { text: opt.sq })]);
  }
  function renderQuestion(q) {
    var a = state.answers;
    var wrap;
    var id = 'f-' + q.id;
    if (q.type === 'facts') {
      var ul = el('ul', { cls: 'facts' });
      Q.CONFIRMED_FACTS.forEach(function (f) { ul.appendChild(el('li', { text: f.sq })); });
      wrap = el('div', { cls: 'q', 'data-qid': q.id }, [el('p', { cls: 'ql', text: q.sq }), ul]);
    } else if (q.type === 'info') {
      wrap = el('div', { cls: 'info note', 'data-qid': q.id }, [el('strong', { text: q.sq }), el('span', { text: q.text })]);
    } else if (q.type === 'examples') {
      wrap = el('div', { cls: 'q', 'data-qid': q.id }, [
        el('div', { id: 'examples' }),
        el('p', { cls: 'coverage', id: 'coverage', 'aria-live': 'polite' }),
        el('button', { type: 'button', cls: 'ghost', id: 'add-ex', text: '+ Shto shembull' }),
        el('p', { cls: 'qerr', hidden: true })
      ]);
    } else if (q.type === 'settings') {
      wrap = el('div', { cls: 'q settings-q', 'data-qid': q.id }, [
        el('p', { cls: 'ql', text: q.sq }, [el('span', { cls: 'opt-tag', text: ' (opsionale)' })]),
        el('p', { cls: 'hint', text: 'Screenshot i dritares së cilësimeve të indikatorëve (p.sh. RSI, EMA). Na ndihmon të kontrollojmë numrat që shkrove.' }),
        el('div', { id: 'settings' }),
        el('button', { type: 'button', cls: 'ghost', id: 'add-sp', text: '+ Shto foto të cilësimeve' })
      ]);
    } else if (q.type === 'single' || q.type === 'multi') {
      var type = q.type === 'single' ? 'radio' : 'checkbox';
      var chips = el('div', { cls: 'chips' });
      var opts = q.options.slice();
      if (q.unk) opts.push({ v: Q.UNKNOWN, sq: Q.UNKNOWN_SQ });
      opts.forEach(function (op) {
        var checked = q.type === 'single' ? a[q.id] === op.v : (Array.isArray(a[q.id]) && a[q.id].indexOf(op.v) >= 0);
        chips.appendChild(chipInput(type, q.id, op, checked, { 'data-qid': q.id }));
      });
      wrap = el('fieldset', { cls: 'q', 'data-qid': q.id }, [labelNode(q, null), chips, el('p', { cls: 'qerr', hidden: true })]);
    } else {
      var input;
      if (q.type === 'textarea') input = el('textarea', { id: id, 'data-qid': q.id, rows: 4 });
      else input = el('input', { id: id, 'data-qid': q.id, type: q.type === 'number' ? 'text' : q.type, inputmode: q.type === 'number' ? 'decimal' : null, autocomplete: 'off' });
      input.value = a[q.id] !== undefined ? a[q.id] : '';
      if (state.answers['?' + q.id]) input.disabled = true;
      var control = input;
      if (q.type === 'number' && q.unit && Q.unitLabel(q, state, 'sq')) control = el('div', { cls: 'num' }, [input, el('span', { cls: 'unit', 'data-unitq': q.id, text: Q.unitLabel(q, state, 'sq') })]);
      wrap = el('div', { cls: 'q', 'data-qid': q.id }, [labelNode(q, id), control, q.unk ? unknownToggle(q) : null, el('p', { cls: 'qerr', hidden: true })]);
    }
    qEls[q.id] = wrap;
    return wrap;
  }

  function renderAll() {
    app.textContent = '';
    qEls = {};
    Q.SCREENS.forEach(function (sc) {
      var si = sectionIndex(sc.section);
      var sec = el('section', { cls: 'step', 'data-screen': sc.id, 'data-section': sc.section, hidden: true });
      var head = el('div', { cls: 'screen-head' });
      head.appendChild(el('p', { cls: 'section-label' }, [el('span', { cls: 'section-num', text: sc.section === 'review' ? '✓' : String(si + 1) }), document.createTextNode(Q.SECTIONS[si].sq)]));
      head.appendChild(el('h2', { 'data-tpl': sc.sq, text: Q.fill(sc.sq, state) }));
      if (sc.intro) head.appendChild(el('p', { cls: 'intro', 'data-tpl': sc.intro, text: Q.fill(sc.intro, state) }));
      sec.appendChild(head);
      if (sc.special === 'review') { sec.appendChild(el('div', { id: 'review', cls: 'review' })); app.appendChild(sec); return; }
      var currentRow = null, rowKey = null;
      Q.QUESTIONS.filter(function (q) { return q.screen === sc.id; }).forEach(function (q) {
        var node = renderQuestion(q);
        if (q.row) {
          if (rowKey !== q.row) { currentRow = el('div', { cls: 'row', 'data-row': q.row }); sec.appendChild(currentRow); rowKey = q.row; }
          currentRow.appendChild(node);
        } else { rowKey = null; currentRow = null; sec.appendChild(node); }
      });
      app.appendChild(sec);
    });
    document.getElementById('add-ex').addEventListener('click', addExample);
    document.getElementById('add-sp').addEventListener('click', addSettingsPhoto);
    renderExamples();
    renderSettings();
  }

  // ---------------- Shembujt ----------------
  function exFieldNode(f, ex, i) {
    var key = i + ':' + f.id;
    var val = ex[f.id] || '';
    var node;
    var label = f.sq + (f.req ? '' : '');
    if (f.type === 'single') {
      var chips = el('div', { cls: 'chips' });
      f.options.forEach(function (op) { chips.appendChild(chipInput('radio', 'ex' + ex._k + f.id, op, val === op.v, { 'data-ex': i, 'data-f': f.id })); });
      node = el('fieldset', { cls: 'q', 'data-exf': key }, [el('legend', { text: label }), chips, el('p', { cls: 'qerr', hidden: true })]);
    } else {
      var id = 'ex-' + ex._k + '-' + f.id;
      var input = f.type === 'textarea'
        ? el('textarea', { id: id, 'data-ex': i, 'data-f': f.id, rows: 3 })
        : el('input', { id: id, 'data-ex': i, 'data-f': f.id, type: f.type === 'number' ? 'text' : f.type, inputmode: f.type === 'number' ? 'decimal' : null });
      input.value = val;
      node = el('div', { cls: 'q', 'data-exf': key }, [el('label', { cls: 'ql', for: id, text: label }), input, el('p', { cls: 'qerr', hidden: true })]);
    }
    node.hidden = !Q.exVisible(f, ex) || (f.photo && !ex.photoId);
    return node;
  }
  function photoBlock(ownerAttr, idx, photoId, label, hint) {
    var wrap = el('div', { cls: 'q photo-q' });
    wrap.appendChild(el('p', { cls: 'ql', text: label }));
    var row = el('div', { cls: 'photo' });
    var fileId = 'ph-' + ownerAttr + '-' + idx + '-' + (photoId || 'new');
    var file = el('input', { type: 'file', id: fileId, accept: 'image/jpeg,image/png,image/webp', 'data-photo': ownerAttr + ':' + idx, hidden: true });
    if (photoId) {
      var img = el('img', { alt: label });
      getPhoto(photoId).then(function (u) { if (u) img.src = u; else img.alt = 'Fotoja nuk u gjet në pajisje. Shtoje përsëri.'; });
      row.appendChild(img);
      row.appendChild(el('label', { cls: 'upl', for: fileId, text: 'Ndrysho' }));
      row.appendChild(el('button', { type: 'button', cls: 'small', 'data-delphoto': ownerAttr + ':' + idx, text: 'Hiqe' }));
    } else {
      row.appendChild(el('label', { cls: 'upl', for: fileId, text: 'Shto foto' }));
      if (hint) row.appendChild(el('span', { cls: 'hint', text: hint }));
    }
    row.appendChild(file);
    wrap.appendChild(row);
    wrap.appendChild(el('p', { cls: 'qerr', hidden: true, 'data-photoerr': ownerAttr + ':' + idx }));
    return wrap;
  }
  function renderExamples() {
    var box = document.getElementById('examples');
    if (!box) return;
    box.textContent = '';
    state.examples.forEach(function (ex, i) {
      if (!ex._k) ex._k = uuid();
      var card = el('div', { cls: 'ex', 'data-exi': i });
      card.appendChild(el('div', { cls: 'ex-head' }, [el('span', { text: 'Shembulli ' + (i + 1) }), el('button', { type: 'button', cls: 'small', 'data-remove': i, text: 'Fshije' })]));
      var row = null, rk = null;
      Q.EXAMPLE_FIELDS.forEach(function (f) {
        if (f.photo) return;
        var n = exFieldNode(f, ex, i);
        if (f.row) { if (rk !== f.row) { row = el('div', { cls: 'row' }); card.appendChild(row); rk = f.row; } row.appendChild(n); }
        else { rk = null; card.appendChild(n); }
      });
      card.appendChild(photoBlock('ex', i, ex.photoId, 'Foto e grafikut (opsionale, por shumë e dobishme)', 'Ku duken candle e hyrjes, Stop Loss, Take Profit dhe indikatorët.'));
      Q.EXAMPLE_FIELDS.filter(function (f) { return f.photo; }).forEach(function (f) { card.appendChild(exFieldNode(f, ex, i)); });
      box.appendChild(card);
    });
    var add = document.getElementById('add-ex');
    if (add) {
      add.disabled = state.examples.length >= Q.MAX_EXAMPLES;
      add.textContent = state.examples.length >= Q.MAX_EXAMPLES ? 'Maksimumi ' + Q.MAX_EXAMPLES + ' shembuj' : (state.examples.length ? '+ Shto një shembull tjetër' : '+ Shto shembullin e parë');
    }
    updateCoverage();
  }
  function updateCoverage() {
    var c = document.getElementById('coverage');
    if (!c) return;
    var exs = state.examples;
    if (!exs.length) { c.textContent = 'Fillo me një shembull: një trade që ke bërë sipas kësaj strategjie.'; return; }
    var miss = [];
    if (!exs.some(function (e) { return e.result === 'loss'; })) miss.push('një trade që ka humbur');
    if (!exs.some(function (e) { return e.kind === 'noentry'; })) miss.push('një rast kur NUK ke hyrë');
    if (state.answers.sides === 'both' && !(exs.some(function (e) { return e.kind === 'buy'; }) && exs.some(function (e) { return e.kind === 'sell'; }))) miss.push('shembuj për BUY dhe SELL');
    c.textContent = miss.length ? 'Nëse mundesh, shto edhe: ' + miss.join(', ') + '. Përndryshe do t\'i sqarojmë bashkë.' : 'Shumë mirë: shembujt mbulojnë rastet kryesore.';
  }
  function renderSettings() {
    var box = document.getElementById('settings');
    if (!box) return;
    box.textContent = '';
    (state.settingsPhotos || []).forEach(function (p, i) {
      var card = el('div', { cls: 'ex sp', 'data-spi': i });
      card.appendChild(el('div', { cls: 'ex-head' }, [el('span', { text: 'Foto e cilësimeve ' + (i + 1) }), el('button', { type: 'button', cls: 'small', 'data-spremove': i, text: 'Fshije' })]));
      card.appendChild(photoBlock('sp', i, p.photoId, 'Fotoja', null));
      var nid = 'sp-note-' + i;
      var note = el('input', { type: 'text', id: nid, 'data-spnote': i });
      note.value = p.note || '';
      card.appendChild(el('div', { cls: 'q' }, [el('label', { cls: 'ql', for: nid, text: 'Përshkrim i shkurtër' }, [el('span', { cls: 'hint ex', text: 'Shembull: cilësimet e RSI në M15' })]), note]));
      box.appendChild(card);
    });
    var add = document.getElementById('add-sp');
    if (add) { add.disabled = (state.settingsPhotos || []).length >= Q.MAX_SETTINGS_PHOTOS; }
  }
  function addExample() {
    if (state.examples.length >= Q.MAX_EXAMPLES) return;
    state.examples.push({ _k: uuid(), photoId: null });
    renderExamples(); refresh(); clearError('examples'); save();
    var cards = document.querySelectorAll('#examples .ex');
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'start' });
  }
  function addSettingsPhoto() {
    state.settingsPhotos = state.settingsPhotos || [];
    if (state.settingsPhotos.length >= Q.MAX_SETTINGS_PHOTOS) return;
    state.settingsPhotos.push({ photoId: null, note: '' });
    renderSettings(); save();
  }

  // ---------------- Rifreskimi ----------------
  function condRefs(c, out) {
    if (!c) return out;
    (c.all || []).forEach(function (x) { condRefs(x, out); });
    (c.any || []).forEach(function (x) { condRefs(x, out); });
    if (c.q) out.push(c);
    return out;
  }
  function focusFollowUp(id, val) {
    if (val !== 'other' && val !== 'custom') return;
    var target = Q.QUESTIONS.filter(function (r) {
      return r.type !== 'info' && condRefs(r.show, []).some(function (c) { return c.q === id && (c.eq === val || c.has === val || (c.in && c.in.indexOf(val) >= 0)); });
    })[0];
    var n = target && qEls[target.id];
    if (!n || n.hidden) return;
    var f = n.querySelector('input[type=text]:not([disabled]), textarea:not([disabled])');
    if (f) setTimeout(function () { try { f.focus({ preventScroll: false }); } catch (e) { f.focus(); } }, 0);
  }
  function refresh() {
    Q.QUESTIONS.forEach(function (q) { var n = qEls[q.id]; if (n) n.hidden = !Q.isVisible(q.id, state); });
    app.querySelectorAll('[data-tpl]').forEach(function (n) { n.textContent = Q.fill(n.getAttribute('data-tpl'), state); });
    app.querySelectorAll('[data-unitq]').forEach(function (n) { n.textContent = Q.unitLabel(Q.byId[n.getAttribute('data-unitq')], state, 'sq'); });
    app.querySelectorAll('.row').forEach(function (r) { r.hidden = Array.prototype.every.call(r.children, function (c) { return c.hidden; }); });
    state.examples.forEach(function (ex, i) {
      Q.EXAMPLE_FIELDS.forEach(function (f) {
        var n = app.querySelector('[data-exf="' + i + ':' + f.id + '"]');
        if (n) n.hidden = !Q.exVisible(f, ex) || (f.photo && !ex.photoId);
      });
    });
    updateCoverage();
    updateProgress();
    if (state.screen === 'review') renderReview();
  }

  function onInput(e) {
    var t = e.target;
    if (t.hasAttribute('data-unk')) {
      var uid = t.getAttribute('data-unk');
      if (t.checked) state.answers['?' + uid] = true; else delete state.answers['?' + uid];
      var inp = app.querySelector('#f-' + uid);
      if (inp) inp.disabled = t.checked;
      clearError(uid);
    } else if (t.hasAttribute('data-qid')) {
      var id = t.getAttribute('data-qid');
      var q = Q.byId[id];
      if (q.type === 'single') { if (t.checked) state.answers[id] = t.value; }
      else if (q.type === 'multi') {
        var boxes = app.querySelectorAll('input[name="' + id + '"]');
        if (t.checked && t.value === Q.UNKNOWN) boxes.forEach(function (b) { if (b !== t) b.checked = false; });
        else if (t.checked) boxes.forEach(function (b) { if (b.value === Q.UNKNOWN) b.checked = false; });
        state.answers[id] = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.value; });
      } else state.answers[id] = t.value;
      clearError(id);
      if ((q.type === 'single' || q.type === 'multi') && t.checked) { refresh(); save(); focusFollowUp(id, t.value); return; }
    } else if (t.hasAttribute('data-ex')) {
      var i = parseInt(t.getAttribute('data-ex'), 10), f = t.getAttribute('data-f');
      if (!state.examples[i]) return;
      if (t.type === 'radio') { if (t.checked) state.examples[i][f] = t.value; }
      else state.examples[i][f] = t.value;
      clearError('ex:' + i + ':' + f);
    } else if (t.hasAttribute('data-spnote')) {
      var si = parseInt(t.getAttribute('data-spnote'), 10);
      if (state.settingsPhotos[si]) state.settingsPhotos[si].note = t.value;
    } else if (t.hasAttribute('data-photo') && e.type === 'change') {
      onPhoto(t);
      return;
    } else return;
    refresh();
    save();
  }
  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-remove')) {
      var i = parseInt(t.getAttribute('data-remove'), 10);
      if (!window.confirm('Ta fshij shembullin ' + (i + 1) + '?')) return;
      var ex = state.examples[i];
      if (ex && ex.photoId) delPhoto(ex.photoId);
      state.examples.splice(i, 1);
      renderExamples(); refresh(); save();
    } else if (t.hasAttribute('data-spremove')) {
      var k = parseInt(t.getAttribute('data-spremove'), 10);
      var sp = state.settingsPhotos[k];
      if (sp && sp.photoId) delPhoto(sp.photoId);
      state.settingsPhotos.splice(k, 1);
      renderSettings(); save();
    } else if (t.hasAttribute('data-delphoto')) {
      var parts = t.getAttribute('data-delphoto').split(':');
      var owner = parts[0] === 'ex' ? state.examples[+parts[1]] : state.settingsPhotos[+parts[1]];
      if (owner && owner.photoId) { delPhoto(owner.photoId); owner.photoId = null; if (parts[0] === 'ex') { renderExamples(); refresh(); } else renderSettings(); save(); }
    } else if (t.hasAttribute('data-goto')) {
      goToScreen(t.getAttribute('data-goto'), t.getAttribute('data-target'));
    }
  }
  function onPhoto(input) {
    var parts = input.getAttribute('data-photo').split(':');
    var kind = parts[0], i = parseInt(parts[1], 10);
    var file = input.files && input.files[0];
    var errEl = app.querySelector('[data-photoerr="' + kind + ':' + i + '"]');
    var owner = kind === 'ex' ? state.examples[i] : state.settingsPhotos[i];
    if (!file || !owner) return;
    if (errEl) { errEl.hidden = false; errEl.style.color = 'var(--muted)'; errEl.textContent = 'Po përgatitet fotoja…'; }
    var compress = window.XAU_COMPRESS || compressImage;
    compress(file).then(function (res) {
      if (!res || typeof res.dataUrl !== 'string' || dataUrlBytes(res.dataUrl) > MAX_PHOTO_BYTES) throw new Error('Fotoja është shumë e madhe. Bëj një screenshot më të vogël.');
      var old = owner.photoId;
      var id = uuid();
      return putPhoto(id, { dataUrl: res.dataUrl, name: file.name }).then(function () {
        if (old) delPhoto(old);
        owner.photoId = id;
        if (kind === 'ex') { renderExamples(); refresh(); } else renderSettings();
        saveNow();
      });
    }).catch(function (err) {
      var e3 = app.querySelector('[data-photoerr="' + kind + ':' + i + '"]');
      if (e3) { e3.hidden = false; e3.style.color = ''; e3.textContent = err.message || 'Fotoja nuk u shtua.'; }
    });
  }

  // ---------------- Gabimet ----------------
  function errScreen(id) {
    if (id.indexOf('ex:') === 0 || id === 'examples' || id.indexOf('sp:') === 0 || id === 'settings_photos') return 'examples';
    var q = Q.byId[id];
    return q ? q.screen : 'review';
  }
  function errNode(id) {
    if (id.indexOf('ex:') === 0) { var p = id.split(':'); return app.querySelector('[data-exf="' + p[1] + ':' + p[2] + '"]'); }
    return qEls[id] || null;
  }
  function clearError(id) {
    var n = errNode(id);
    if (!n) return;
    n.classList.remove('has-err');
    var m = n.querySelector(':scope > .qerr');
    if (m) { m.hidden = true; m.textContent = ''; }
  }
  function clearAllErrors() {
    app.querySelectorAll('.has-err').forEach(function (n) { n.classList.remove('has-err'); });
    app.querySelectorAll('.qerr').forEach(function (m) { if (!m.hasAttribute('data-photoerr')) { m.hidden = true; m.textContent = ''; } });
  }
  function showErrors(errors) {
    clearAllErrors();
    errors.forEach(function (er) {
      var n = errNode(er.id);
      if (!n) return;
      n.classList.add('has-err');
      var m = n.querySelector(':scope > .qerr');
      if (m && !m.textContent) { m.hidden = false; m.textContent = er.msg; }
    });
    var order = Q.SCREENS.map(function (s) { return s.id; });
    var first = errors.slice().sort(function (x, y) { return order.indexOf(errScreen(x.id)) - order.indexOf(errScreen(y.id)); })[0];
    if (first) goToScreen(errScreen(first.id), first.id);
  }
  function goToScreen(screenId, targetId) {
    showScreen(screenId);
    var n = targetId ? errNode(targetId) : null;
    if (n) {
      n.scrollIntoView({ block: 'center' });
      var f = n.querySelector('input:not([type=hidden]):not([disabled]), textarea, button');
      if (f) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    }
  }

  // ---------------- Navigimi ----------------
  function updateProgress() {
    var cur = screensById[state.screen] || Q.SCREENS[0];
    var si = sectionIndex(cur.section);
    var track = document.getElementById('track');
    if (track) {
      if (track.children.length !== Q.SECTIONS.length) { track.textContent = ''; Q.SECTIONS.forEach(function () { track.appendChild(document.createElement('i')); }); }
      Array.prototype.forEach.call(track.children, function (seg, k) { seg.className = k < si ? 'done' : (k === si ? 'current' : ''); });
    }
    var vis = visibleScreens();
    var inSection = vis.filter(function (s) { return s.section === cur.section; });
    var pos = inSection.map(function (s) { return s.id; }).indexOf(cur.id) + 1;
    document.getElementById('stepline').textContent = cur.section === 'review'
      ? 'Kontrolli i fundit'
      : 'Pjesa ' + (si + 1) + ' nga ' + SECTION_COUNT + ': ' + Q.SECTIONS[si].sq + (inSection.length > 1 ? ' (ekrani ' + pos + ' nga ' + inSection.length + ')' : '');
    var idx = vis.map(function (s) { return s.id; }).indexOf(cur.id);
    document.getElementById('back').style.visibility = idx <= 0 ? 'hidden' : 'visible';
    var next = document.getElementById('next');
    var isReview = cur.id === 'review';
    next.style.display = isReview ? 'none' : '';
    var nextScreen = vis[idx + 1];
    next.textContent = nextScreen && nextScreen.id === 'review' ? 'Kontrollo përgjigjet' : 'Vazhdo';
  }
  function showScreen(id) {
    if (!screensById[id] || !screenVisible(screensById[id])) id = 'facts';
    state.screen = id;
    app.querySelectorAll('section.step').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== id; });
    if (id === 'review') renderReview();
    updateProgress();
    window.scrollTo(0, 0);
    save();
  }
  function move(delta) {
    var vis = visibleScreens().map(function (s) { return s.id; });
    var idx = vis.indexOf(state.screen);
    if (idx < 0) idx = 0;
    var target = vis[Math.max(0, Math.min(vis.length - 1, idx + delta))];
    showScreen(target);
  }

  // ---------------- Kontrolli dhe dorëzimi ----------------
  function specText() {
    var sub = state.submission;
    return Q.buildSpec(stateForServer(), {
      submissionId: (sub && sub.id) || (state.pending && state.pending.id) || '(pa u dorëzuar)',
      photoCount: state.examples.filter(function (e) { return e.photoId; }).length + (state.settingsPhotos || []).filter(function (p) { return p.photoId; }).length,
      date: new Date().toISOString().slice(0, 10),
      submitted: !!(sub && sub.ok && !sub.simulated && sub.fp === fingerprint()),
      photoNames: Q.photoNames(stateForServer())
    });
  }
  function stateForServer() { return { answers: state.answers, examples: cleanExamples(), settingsPhotos: cleanSettings(), legacyNotes: state.legacyNotes || [] }; }
  function firstScreenOf(section) {
    var v = visibleScreens().filter(function (s) { return s.section === section; });
    return v.length ? v[0].id : 'facts';
  }
  function renderReview() {
    var box = document.getElementById('review');
    if (!box) return;
    var st = stateForServer();
    var an = Q.analyze(st);
    var fp = fingerprint();
    var sub = state.submission;
    var submittedCurrent = sub && sub.ok && !sub.simulated && sub.fp === fp;
    box.textContent = '';

    var status = el('div', { cls: 'status' });
    var subLine = el('p');
    if (submittedCurrent) {
      subLine.appendChild(el('span', { cls: 'badge yes', text: 'U dorëzua me sukses' }));
      subLine.appendChild(document.createTextNode(' ' + fmtDate(sub.at) + (sub.id ? ', ID ' + sub.id : '') + (sub.mode === 'test' ? ' (provë)' : '') + '.'));
    } else if (sub && sub.ok && sub.simulated && sub.fp === fp) {
      subLine.appendChild(el('span', { cls: 'badge no', text: 'Ruajtje e simuluar' }));
      subLine.appendChild(document.createTextNode(' Serveri nuk ka ruajtje të konfiguruar, prandaj përgjigjet NUK u ruajtën.'));
    } else if (sub && sub.ok) {
      subLine.appendChild(el('span', { cls: 'badge no', text: 'Ndryshuar pas dorëzimit' }));
      subLine.appendChild(document.createTextNode(' Dorëzoji përsëri që të ruhet versioni i ri.'));
    } else {
      subLine.appendChild(el('span', { cls: 'badge no', text: 'Ende pa u dorëzuar' }));
    }
    status.appendChild(subLine);
    var open = an.errors.length + an.unresolved.length + an.contradictions.length;
    var readyLine = el('p');
    readyLine.appendChild(el('span', { cls: 'badge ' + (an.ready ? 'yes' : 'no'), text: an.ready ? 'Specifikimi është gati për zhvillim' : 'Specifikimi nuk është ende gati për zhvillim' }));
    readyLine.appendChild(document.createTextNode(an.ready ? '' : ' ' + (an.errors.length ? 'Plotëso pyetjet e shënuara më poshtë.' : 'Mund t\'i dorëzosh tani; pikat e hapura i sqarojmë bashkë.')));
    status.appendChild(readyLine);
    box.appendChild(status);
    box.appendChild(el('p', { cls: 'note', text: 'Drafti ruhet vetëm në këtë pajisje dhe në këtë shfletues, derisa ta dorëzosh.' }));

    if (an.errors.length) {
      box.appendChild(el('h3', { text: 'Duhen plotësuar para dorëzimit' }));
      var bySc = {};
      an.errors.forEach(function (e) { var s = errScreen(e.id); (bySc[s] = bySc[s] || []).push(e); });
      var ul = el('ul', { cls: 'issues' });
      Q.SCREENS.forEach(function (sc) {
        if (!bySc[sc.id]) return;
        var n = bySc[sc.id].length;
        ul.appendChild(el('li', null, [document.createTextNode(Q.fill(sc.sq, state) + ': ' + n + (n === 1 ? ' pyetje' : ' pyetje')), el('button', { type: 'button', cls: 'small', 'data-goto': sc.id, 'data-target': bySc[sc.id][0].id, text: 'Shko' })]));
      });
      box.appendChild(ul);
    }
    var together = an.unresolved.concat(an.contradictions);
    box.appendChild(el('h3', { text: 'Këto do t\'i sqarojmë bashkë' }));
    if (together.length) {
      var u = el('ul', { cls: 'issues' });
      together.forEach(function (x) {
        var li = el('li', { text: x.sq + ' ' });
        if (x.id) li.appendChild(el('button', { type: 'button', cls: 'small', 'data-goto': errScreen(x.id), 'data-target': x.id, text: 'Ndrysho' }));
        u.appendChild(li);
      });
      box.appendChild(u);
    } else box.appendChild(el('p', { text: 'Asgjë. Çdo gjë është e qartë.' }));
    if (an.devChecks.length) box.appendChild(el('p', { cls: 'note', text: 'Disa detaje teknike do t\'i verifikojë zhvilluesi vetë (p.sh. monedhën e llogarisë dhe specifikimet e simbolit te Tauro).' }));

    box.appendChild(el('h3', { text: 'Përmbledhja' }));
    Q.sections(st, 'sq').forEach(function (sec) {
      var card = el('div', { cls: 'sum' });
      card.appendChild(el('div', { cls: 'sum-head' }, [el('strong', { text: sec.title }), el('button', { type: 'button', cls: 'small', 'data-goto': firstScreenOf(sec.id), text: 'Ndrysho' })]));
      var dl = el('dl');
      sec.items.forEach(function (it) {
        dl.appendChild(el('dt', { text: it.label }));
        dl.appendChild(el('dd', { cls: it.unknown ? 'unk-val' : null, text: it.value }));
      });
      card.appendChild(dl);
      box.appendChild(card);
    });
    var exCard = el('div', { cls: 'sum' });
    exCard.appendChild(el('div', { cls: 'sum-head' }, [el('strong', { text: 'Shembujt dhe fotot' }), el('button', { type: 'button', cls: 'small', 'data-goto': 'examples', text: 'Ndrysho' })]));
    var exl = Q.exampleLines(st, 'sq', Q.photoNames(st)).concat(Q.settingsLines(st, 'sq'));
    if (exl.length) { var ul2 = el('ul'); exl.forEach(function (l) { ul2.appendChild(el('li', { text: l })); }); exCard.appendChild(ul2); }
    else exCard.appendChild(el('p', { cls: 'note', text: 'Ende pa shembuj.' }));
    box.appendChild(exCard);
    if ((state.legacyNotes || []).length) {
      box.appendChild(el('h3', { text: 'Nga drafti yt i vjetër (kontrolloji)' }));
      var ln = el('ul');
      state.legacyNotes.forEach(function (n) { ln.appendChild(el('li', { text: n.sq + ': ' + n.text })); });
      box.appendChild(ln);
    }

    var sendBtn = el('button', { type: 'button', cls: 'main', id: 'send', text: submittedCurrent ? 'U dorëzua' : 'Dorëzo përgjigjet' });
    if (submittedCurrent) sendBtn.disabled = true;
    sendBtn.addEventListener('click', send);
    var resetBtn = el('button', { type: 'button', cls: 'ghost', id: 'reset', text: 'Fillo nga e para' });
    resetBtn.addEventListener('click', resetAll);
    box.appendChild(el('div', { cls: 'actions' }, [sendBtn, resetBtn]));
    box.appendChild(el('p', { id: 'send-status', 'aria-live': 'polite' }));
    box.appendChild(fallbackNode());
  }
  function fallbackNode() {
    var wrap = el('div', { cls: 'fallback', id: 'fallback', hidden: true });
    wrap.appendChild(el('p', { cls: 'note', text: 'Nëse dorëzimi nuk funksionon edhe pas riprovimit, mund t\'i kopjosh ose shkarkosh përgjigjet si rezervë.' }));
    var retry = el('button', { type: 'button', cls: 'main', id: 'retry', text: 'Provo përsëri' });
    retry.addEventListener('click', send);
    var copy = el('button', { type: 'button', cls: 'ghost', id: 'copy', text: 'Kopjo përgjigjet' });
    copy.addEventListener('click', copySpec);
    var dl = el('button', { type: 'button', cls: 'ghost', id: 'download', text: 'Shkarko .txt' });
    dl.addEventListener('click', downloadSpec);
    wrap.appendChild(el('div', { cls: 'actions' }, [retry, copy, dl]));
    var names = Q.photoNames(stateForServer());
    var ids = Object.keys(names);
    if (ids.length) {
      wrap.appendChild(el('p', { cls: 'note', text: 'Kujdes: kopjimi dhe skedari .txt NUK i përfshijnë fotot. Shkarkoji fotot më poshtë dhe dërgoji veçmas:' }));
      var list = el('div', { cls: 'actions' });
      ids.forEach(function (pid) {
        var b = el('button', { type: 'button', cls: 'small', text: names[pid] });
        b.addEventListener('click', function () { getPhoto(pid).then(function (u) { if (u) triggerDownload(u, names[pid]); }); });
        list.appendChild(b);
      });
      wrap.appendChild(list);
    }
    wrap.appendChild(el('p', { cls: 'note', id: 'fb-status', 'aria-live': 'polite' }));
    return wrap;
  }
  function triggerDownload(href, name) {
    var a = el('a', { href: href, download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadSpec() {
    try {
      var blob = new Blob([specText()], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      triggerDownload(url, 'pyetesori-xauusd-' + new Date().toISOString().slice(0, 10) + '.txt');
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      document.getElementById('fb-status').textContent = 'Skedari u shkarkua. Mos harro fotot.';
    } catch (e) { document.getElementById('fb-status').textContent = 'Shkarkimi nuk u lejua në këtë pajisje. Përdor kopjimin.'; }
  }
  function copySpec() {
    var text = specText();
    var fb = document.getElementById('fb-status');
    function manual() {
      var ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* */ }
      ta.remove();
      fb.textContent = ok ? 'U kopjua. Ngjite në mesazh dhe dërgo fotot veçmas.' : 'Kopjimi nuk u lejua. Përdor "Shkarko .txt".';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { fb.textContent = 'U kopjua. Ngjite në mesazh dhe dërgo fotot veçmas.'; }, manual);
    else manual();
  }
  function setSendStatus(text, kind) {
    var s = document.getElementById('send-status');
    if (!s) return;
    s.textContent = text;
    s.className = kind || '';
  }
  function setSending(on) {
    sending = on;
    ['send', 'retry'].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.disabled = on;
      if (id === 'send') b.textContent = on ? 'Po ruhet…' : 'Dorëzo përgjigjet';
    });
  }
  function collectPhotos() {
    var st = stateForServer();
    var names = Q.photoNames(st);
    return Promise.all(Object.keys(names).map(function (pid) {
      return getPhoto(pid).then(function (u) {
        if (!u) throw Object.assign(new Error('missing-photo'), { userMsg: 'Një foto (' + names[pid] + ') nuk u gjet në pajisje. Shtoje përsëri ose hiqe.' });
        return { id: pid, filename: names[pid], type: u.slice(5, u.indexOf(';')), data: u.slice(u.indexOf(',') + 1) };
      });
    }));
  }
  function send() {
    if (sending) return;
    var st = stateForServer();
    var errors = Q.validate(st);
    if (errors.length) {
      setSendStatus('Disa pyetje të detyrueshme mungojnë. Të çova te e para.', 'err');
      showErrors(errors);
      return;
    }
    var fp = fingerprint();
    if (state.submission && state.submission.ok && !state.submission.simulated && state.submission.fp === fp) { setSendStatus('Këto përgjigje janë dorëzuar tashmë.', 'ok'); return; }
    if (!state.pending || state.pending.fp !== fp) state.pending = { id: uuid(), fp: fp };
    saveNow();
    setSending(true);
    setSendStatus('Po ruhet…', '');
    var fb = document.getElementById('fallback');
    collectPhotos().then(function (photos) {
      var body = JSON.stringify({ submissionId: state.pending.id, schemaVersion: Q.SCHEMA_VERSION, mode: TEST_MODE ? 'test' : 'real', state: st, photos: photos });
      if (body.length > MAX_BODY_CHARS) throw Object.assign(new Error('too-big'), { userMsg: 'Fotot së bashku janë shumë të mëdha për dorëzim. Zëvendëso disa me screenshot më të vegjël.' });
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
      return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          clearTimeout(timer);
          return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
        }, function (err) { clearTimeout(timer); throw err; });
    }).then(function (r) {
      if (r.res.ok && r.data && r.data.ok) {
        state.submission = { ok: true, id: r.data.id || null, key: r.data.submissionKey || state.pending.id, at: r.data.submittedAt || new Date().toISOString(), fp: fp, simulated: !!r.data.simulated, mode: r.data.mode || 'real' };
        if (!r.data.simulated) state.pending = null;
        saveNow();
        setSending(false);
        renderReview();
        setSendStatus(r.data.simulated
          ? 'Ruajtje e simuluar: serveri nuk ka ruajtje të konfiguruar, prandaj përgjigjet NUK u ruajtën. Mos e mbyll faqen dhe njofto pronarin.'
          : 'U dorëzua me sukses. ID: ' + r.data.id + '. Nuk ke nevojë të dërgosh asgjë tjetër.', r.data.simulated ? 'err' : 'ok');
        return;
      }
      var msg = (r.data && r.data.error) || '';
      var stc = r.res.status;
      var text;
      if (stc === 409) text = msg || 'Ky dorëzim po ruhet ende. Prit pak dhe provo përsëri; nuk do të ruhet dy herë.';
      else if (stc === 429) text = 'Shumë përpjekje brenda pak kohe. Provo përsëri pas disa minutash.';
      else if (stc === 413) text = msg || 'Fotot janë shumë të mëdha për dorëzim.';
      else if (stc >= 400 && stc < 500) text = msg || 'Serveri nuk i pranoi përgjigjet.';
      else text = msg || 'Ruajtja nuk u krye tani.';
      throw Object.assign(new Error('server'), { userMsg: text });
    }).catch(function (err) {
      setSending(false);
      var text;
      if (err && err.userMsg) text = err.userMsg;
      else if (err && err.name === 'AbortError') text = 'Dorëzimi u ndërpre sepse lidhja ishte shumë e ngadaltë.';
      else text = 'Nuk u lidh dot me serverin. Kontrollo internetin.';
      setSendStatus(text + ' Përgjigjet dhe fotot janë ende në këtë pajisje. Provo përsëri: nuk krijohet kopje e dyfishtë.', 'err');
      if (fb) fb.hidden = false;
    });
  }

  function resetAll() {
    if (!window.confirm('Të fshihen të gjitha përgjigjet dhe fotot nga kjo pajisje?')) return;
    var ids = Object.keys(Q.photoNames(stateForServer()));
    Promise.all(ids.map(delPhoto)).then(function () {
      try { localStorage.removeItem(Q.STORAGE_KEY); } catch (e) { /* */ }
      state = Q.emptyState();
      state.screen = 'facts';
      state.submission = null;
      state.pending = null;
      renderAll();
      refresh();
      showScreen('facts');
      saveNow();
    });
  }

  // ---------------- Nisja ----------------
  document.getElementById('next').addEventListener('click', function () { move(1); });
  document.getElementById('back').addEventListener('click', function () { move(-1); });
  app.addEventListener('input', onInput);
  app.addEventListener('change', onInput);
  app.addEventListener('click', onClick);

  load().then(function () {
    if (TEST_MODE) banner('testmode', 'warn', 'Modaliteti i provës: ky dorëzim do të shënohet si provë në panel, jo si dorëzim real.');
    renderAll();
    refresh();
    showScreen(state.screen || 'facts');
    if (storageOk) setSaved('Përgjigjet ruhen automatikisht në këtë pajisje');
    db();
  });

  // Për testet
  window.XAUApp = {
    getState: function () { return state; },
    send: send, showScreen: showScreen, next: function () { move(1); }, back: function () { move(-1); },
    visibleScreens: function () { return visibleScreens().map(function (s) { return s.id; }); },
    specText: specText, flush: saveNow,
    ready: function () { return new Promise(function (r) { (function wait() { if (state && document.querySelector('section.step')) r(); else setTimeout(wait, 5); })(); }); }
  };
})();
