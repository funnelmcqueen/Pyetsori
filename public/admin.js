/* Paneli privat i pronarit. Të dhënat vijnë vetëm nga /api/admin pas hyrjes; asgjë nuk ruhet në shfletues. */
(function () {
  'use strict';
  var Q = window.XAUQ;
  var API = '/api/admin';
  var views = ['config', 'login', 'list', 'detail'];
  var photoUrls = [];

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'cls') e.className = v; else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function show(v) { views.forEach(function (n) { $('view-' + n).hidden = n !== v; }); window.scrollTo(0, 0); }
  function msg(text, kind) { var m = $('global-msg'); m.textContent = text || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); }
  function fmt(iso) {
    try { return new Intl.DateTimeFormat('sq-AL', { timeZone: 'Europe/Tirane', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso; }
  }
  function api(params, init) {
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    init = init || {};
    init.credentials = 'same-origin';
    init.headers = Object.assign({ 'X-XAU-Admin': '1' }, init.headers || {});
    return fetch(API + '?' + qs, init);
  }
  function json(res) { return res.json().catch(function () { return {}; }); }
  function revokePhotos() { photoUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* */ } }); photoUrls = []; }

  function handleAuth(res) {
    if (res.status === 401) { show('login'); return true; }
    if (res.status === 503) {
      return json(res).then(function (d) {
        if (d.problems) { renderConfig(d.problems); return true; }
        return false;
      });
    }
    return false;
  }
  function renderConfig(problems) {
    var ul = $('config-problems'); ul.textContent = '';
    problems.forEach(function (p) { ul.appendChild(el('li', { text: p })); });
    show('config');
  }

  // ---------- Hyrja ----------
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('login-btn'); btn.disabled = true; $('login-msg').textContent = '';
    api({ action: 'login' }, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) })
      .then(function (res) {
        return json(res).then(function (d) {
          btn.disabled = false;
          if (res.ok && d.ok) { $('pw').value = ''; loadList(); return; }
          if (d.problems) return renderConfig(d.problems);
          $('login-msg').textContent = d.error || 'Hyrja nuk u krye.';
        });
      }, function () { btn.disabled = false; $('login-msg').textContent = 'Nuk u lidh dot me serverin.'; });
  });
  function logout() {
    api({ action: 'logout' }, { method: 'POST' }).then(function () { revokePhotos(); show('login'); msg(''); }, function () { show('login'); });
  }
  $('logout').addEventListener('click', logout);
  $('logout2').addEventListener('click', logout);

  // ---------- Eksporti ----------
  var FORMATS = [
    { f: 'zip', label: 'Paketë e plotë ZIP', desc: 'Specifikimi .txt, përgjigjet .json dhe të gjitha fotot.' },
    { f: 'txt', label: 'Specifikimi TXT', desc: 'Gati për Claude Code. Pa foto.' },
    { f: 'json', label: 'Përgjigjet JSON', desc: 'Të dhënat e strukturuara, me versionin e skemës. Pa foto.' }
  ];
  function exportMenu(sub, statusEl) {
    var d = el('details', { cls: 'export' });
    d.appendChild(el('summary', { text: 'Eksporto / Shkarko' }));
    var menu = el('div', { cls: 'export-menu', role: 'menu' });
    FORMATS.forEach(function (x) {
      var b = el('button', { type: 'button', role: 'menuitem', 'data-format': x.f }, [el('b', { text: x.label }), el('span', { text: x.desc })]);
      b.addEventListener('click', function () { d.open = false; download(sub, x.f, statusEl); });
      menu.appendChild(b);
    });
    menu.appendChild(el('p', { cls: 'export-note', text: 'TXT dhe JSON nuk përmbajnë fotografitë. Për paketën e plotë përdor ZIP.' }));
    d.appendChild(menu);
    return d;
  }
  function filenameFrom(res, sub, fmtName) {
    var x = res.headers.get('X-Filename');
    if (x) return x;
    var cd = res.headers.get('Content-Disposition') || '';
    var m = cd.match(/filename="([^"]+)"/);
    return m ? m[1] : 'pyetesori-xauusd-' + sub.id + '.' + fmtName;
  }
  function download(sub, format, statusEl) {
    statusEl.className = 'msg'; statusEl.textContent = 'Po përgatitet skedari…';
    api({ action: 'export', key: sub.key, format: format }).then(function (res) {
      if (res.status === 401) { show('login'); return; }
      if (!res.ok) return json(res).then(function (d) {
        statusEl.className = 'msg err';
        statusEl.textContent = (d.error || 'Eksporti dështoi.') + (format === 'zip' && res.status === 409 ? ' ZIP-i nuk u shkarkua, sepse nuk është i plotë.' : '');
      });
      var name = filenameFrom(res, sub, format);
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = el('a', { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        statusEl.className = 'msg ok';
        statusEl.textContent = 'U shkarkua: ' + name + (format === 'zip' ? '' : ' (pa foto)');
      });
    }, function () { statusEl.className = 'msg err'; statusEl.textContent = 'Nuk u lidh dot me serverin.'; });
  }

  // ---------- Lista ----------
  function badges(s) {
    var b = el('div', { cls: 'badges' });
    b.appendChild(el('span', { cls: 'badge ' + (s.mode === 'test' ? 'test' : 'real'), text: s.mode === 'test' ? 'Provë' : 'Dorëzim real' }));
    b.appendChild(el('span', { cls: 'badge ' + (s.ready ? 'yes' : 'no'), text: s.ready ? 'Gati për programim' : 'Jo gati: ' + s.openItems + (s.openItems === 1 ? ' çështje' : ' çështje') }));
    b.appendChild(el('span', { cls: 'badge', text: 'Foto: ' + s.photoCount }));
    return b;
  }
  function loadList() {
    msg('');
    revokePhotos();
    api({ action: 'status' }).then(function (res) {
      var h = handleAuth(res);
      return Promise.resolve(h).then(function (handled) {
        if (handled) return;
        return json(res).then(function (st) {
          $('storage-line').textContent = 'Ruajtja: ' + (st.storage === 'vercel-blob' ? 'Vercel Private Blob' : st.storage === 'file' ? 'dosje lokale (vetëm zhvillim)' : st.storage === 'none' ? 'NUK është konfiguruar' : 'gabim konfigurimi');
          var bn = $('list-banner'); bn.textContent = '';
          if (st.storage === 'none') bn.appendChild(el('p', { cls: 'banner err', text: 'Ruajtja nuk është konfiguruar në server: dorëzimet e klientit vetëm simulohen dhe NUK ruhen. Lidh një Vercel Private Blob store (shih README).' }));
          if (st.storage === 'error') bn.appendChild(el('p', { cls: 'banner err', text: 'Gabim në konfigurimin e ruajtjes: ' + (st.storageError || '') }));
          if (st.storage === 'none' || st.storage === 'error') { $('cards').textContent = ''; show('list'); return; }
          return api({ action: 'list' }).then(function (r2) {
            if (r2.status === 401) { show('login'); return; }
            return json(r2).then(function (d) {
              var box = $('cards'); box.textContent = '';
              if (!r2.ok) { box.appendChild(el('p', { cls: 'empty', text: d.error || 'Lista nuk u lexua.' })); show('list'); return; }
              if (!d.submissions.length) box.appendChild(el('p', { cls: 'empty', text: 'Ende s\'ka dorëzime.' }));
              d.submissions.forEach(function (s) {
                var st2 = el('p', { cls: 'msg', role: 'status' });
                var open = el('button', { type: 'button', cls: 'ghost', text: 'Hap' });
                open.addEventListener('click', function () { openDetail(s); });
                var card = el('article', { cls: 'card' + (s.mode === 'test' ? ' test' : ''), 'data-key': s.key }, [
                  el('div', { cls: 'card-top' }, [el('span', { cls: 'card-id', text: s.id }), el('span', { cls: 'card-date', text: fmt(s.submittedAt) })]),
                  badges(s),
                  el('div', { cls: 'card-actions' }, [open, exportMenu(s, st2)]),
                  st2
                ]);
                box.appendChild(card);
              });
              show('list');
            });
          });
        });
      });
    }, function () { msg('Nuk u lidh dot me serverin.', 'err'); });
  }
  $('refresh').addEventListener('click', loadList);
  $('back').addEventListener('click', loadList);

  // ---------- Detajet ----------
  function openDetail(s) {
    msg('Po hapet…');
    revokePhotos();
    api({ action: 'get', key: s.key }).then(function (res) {
      if (res.status === 401) { show('login'); return; }
      return json(res).then(function (d) {
        msg('');
        var box = $('detail'); box.textContent = '';
        if (!res.ok) { box.appendChild(el('p', { cls: 'banner err', text: d.error || 'Dorëzimi nuk u lexua.' })); show('detail'); return; }
        var m = d.manifest, state = d.answers.state;
        var stEl = el('p', { cls: 'msg', role: 'status' });
        box.appendChild(el('h1', { text: m.id }));
        box.appendChild(el('p', { cls: 'lead', text: 'Dorëzuar më ' + fmt(m.submittedAt) + '. Skema e pyetësorit: versioni ' + m.schemaVersion + '.' }));
        box.appendChild(badges({ mode: m.mode, ready: m.ready, openItems: m.openItems, photoCount: m.photoCount }));
        box.appendChild(el('div', { cls: 'card-actions' }, [exportMenu({ key: m.submissionKey, id: m.id }, stEl)]));
        box.appendChild(stEl);

        var an = Q.analyze(state);
        var issues = an.errors.map(function (e) { return 'Mungon: ' + (Q.byId[e.id] ? Q.fill(Q.byId[e.id].sq, state) : e.id); })
          .concat(an.unresolved.map(function (x) { return x.sq; }))
          .concat(an.contradictions.map(function (x) { return x.sq; }));
        box.appendChild(el('h2', { text: 'Çështje që presin sqarim' }));
        if (issues.length) { var ul = el('ul', { cls: 'issues' }); issues.forEach(function (t) { ul.appendChild(el('li', { text: t })); }); box.appendChild(ul); }
        else box.appendChild(el('p', { text: 'Asnjë.' }));

        Q.sections(state, 'sq').forEach(function (sec) {
          box.appendChild(el('h2', { text: sec.title }));
          var t = el('table', { cls: 'kv' });
          sec.items.forEach(function (it) { t.appendChild(el('tr', null, [el('td', { text: it.label }), el('td', { cls: it.unknown ? 'unk' : null, text: it.value })])); });
          box.appendChild(t);
        });

        box.appendChild(el('h2', { text: 'Shembujt' }));
        var exs = el('div', { cls: 'examples' });
        var names = Q.photoNames(state);
        Q.exampleLines(state, 'sq', names).forEach(function (line, i) {
          var card = el('div', { cls: 'ex' }, [el('p', { text: line })]);
          var ex = state.examples[i];
          if (ex && ex.photoId && names[ex.photoId]) {
            var img = el('img', { alt: 'Foto e shembullit ' + (i + 1) });
            card.appendChild(img);
            api({ action: 'photo', key: m.submissionKey, name: names[ex.photoId] }).then(function (r) {
              if (!r.ok) { img.replaceWith(el('p', { cls: 'msg err', text: 'Fotoja mungon në ruajtje: ' + names[ex.photoId] })); return; }
              return r.blob().then(function (b) { var u = URL.createObjectURL(b); photoUrls.push(u); img.src = u; });
            });
          }
          exs.appendChild(card);
        });
        box.appendChild(exs);

        if ((state.legacyNotes || []).length) {
          box.appendChild(el('h2', { text: 'Nga drafti i vjetër' }));
          var ln = el('ul'); state.legacyNotes.forEach(function (n) { ln.appendChild(el('li', { text: n.sq + ': ' + n.text })); }); box.appendChild(ln);
        }
        box.appendChild(el('h2', { text: 'Specifikimi i ruajtur' }));
        box.appendChild(el('pre', { cls: 'spec', text: d.spec }));
        show('detail');
      });
    }, function () { msg('Nuk u lidh dot me serverin.', 'err'); });
  }

  loadList();
  window.XAUAdmin = { loadList: loadList, openDetail: openDetail };
})();
