'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var Q = require('../public/questionnaire.js');
var H = require('./helpers.js');

test('drafti bosh ka gabime bllokuese; drafti i plotë kalon validimin dhe është gati', function () {
  assert.ok(Q.validate(Q.emptyState()).length > 10);
  var s = H.fullState();
  assert.deepEqual(Q.validate(s), []);
  var an = Q.analyze(s);
  assert.equal(an.unresolved.length, 0, JSON.stringify(an.unresolved));
  assert.equal(an.contradictions.length, 0, JSON.stringify(an.contradictions));
  assert.equal(an.ready, true);
});

test('pyetjet e kushtëzuara shfaqen dhe fshihen sipas zgjedhjeve', function () {
  var s = H.fullState();
  assert.ok(Q.isVisible('dir_ma_period', s));
  assert.ok(!Q.isVisible('dir_st_swing', s));
  s.answers.dir_method = 'structure';
  assert.ok(!Q.isVisible('dir_ma_period', s));
  assert.ok(Q.isVisible('dir_st_swing', s));
  // Përgjigjet e fshehura mbeten në draft, por jo në specifikim
  assert.equal(s.answers.dir_ma_period, '200');
  assert.ok(!/Direction MA period/.test(Q.buildSpec(s)));
  // Varësi zinxhir: tp_r_custom fshihet kur tp_method nuk është më "r", edhe pse tp_r ka mbetur "custom"
  s.answers.tp_r = 'custom'; s.answers.tp_r_custom = '2.5';
  assert.ok(Q.isVisible('tp_r_custom', s));
  s.answers.tp_method = 'level';
  assert.ok(!Q.isVisible('tp_r', s));
  assert.ok(!Q.isVisible('tp_r_custom', s));
  // Kombinimi shfaqet vetëm me më shumë se një kusht
  s.answers.cond = ['rsi'];
  assert.ok(!Q.isVisible('combine', s));
  // SELL si pasqyrim pyetet vetëm kur lejohen të dyja
  s.answers.sides = 'buy_only';
  assert.ok(!Q.isVisible('mirror', s));
  s.answers.sides = 'sell_only';
  assert.equal(Q.fill(Q.STEPS[2].sq, s), 'Entry signal për SELL');
});

test('"Nuk e di" lejon dorëzimin, por e bën specifikimin jo-gati', function () {
  var s = H.fullState();
  s.answers.tf_signal = Q.UNKNOWN;
  s.answers['?t_from'] = true; delete s.answers.t_from;
  assert.deepEqual(Q.validate(s), []);
  var an = Q.analyze(s);
  assert.equal(an.ready, false);
  assert.ok(an.unresolved.some(function (u) { return u.id === 'tf_signal'; }));
  assert.ok(an.unresolved.some(function (u) { return u.id === 't_from'; }));
  var spec = Q.buildSpec(s);
  assert.match(spec, /Signal \(entry\) timeframe: UNKNOWN/);
  assert.match(spec, /UNRESOLVED: Trading hours from: UNKNOWN/);
  assert.match(spec, /Ready for programming: NO/);
});

test('fushat e detyrueshme dhe formatet e gabuara bllokojnë', function () {
  var s = H.fullState();
  delete s.answers.facts_review;
  s.answers.sl_fixed = '-3';
  s.answers.t_to = '09:00';
  var ids = Q.validate(s).map(function (e) { return e.id; });
  ['facts_review', 'sl_fixed', 't_to'].forEach(function (id) { assert.ok(ids.indexOf(id) >= 0, id); });
  s = H.fullState();
  s.examples = s.examples.slice(0, 2);
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'examples'; }));
  s = H.fullState();
  s.examples[0].entry = '';
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'ex:0:entry'; }));
});

test('marrëdhëniet mes vlerave: kundërthënie dhe gabime', function () {
  var s = H.fullState();
  s.answers.risk_pct = '1.5';
  s.answers.mg_be = 'yes'; s.answers.be_trigger = 'r'; s.answers.be_trigger_r = '2'; s.answers.be_level = 'entry';
  s.answers.mg_partial = 'yes'; s.answers.pc1_r = '1'; s.answers.pc1_pct = '70'; s.answers.pc2_r = '1.5'; s.answers.pc2_pct = '40'; s.answers.pc_base = 'initial'; s.answers.pc_rest = 'trail';
  s.answers.count_partial = 'one'; s.answers.mg_priority = 'mbyllja e pjesshme para break-even';
  var an = Q.analyze(s);
  var en = an.contradictions.map(function (c) { return c.en; }).join('\n');
  assert.match(en, /Differs from confirmed fact "Risk: 1% per trade"/);
  assert.match(en, /Break-even trigger \(2R\) is at or beyond TP \(2R\)/);
  assert.match(en, /trailing stop is "No"/);
  assert.ok(an.errors.some(function (e) { return e.id === 'pc1_pct'; }), 'shuma 110% nga volumi fillestar bllokon');
  // Nuk ka kufi arbitrar: rrezik 5% pranohet si vlerë, vetëm shënohet si ndryshim nga fakti
  s = H.fullState(); s.answers.risk_pct = '5';
  assert.deepEqual(Q.validate(s), []);
});

test('nuk premtohet humbje maksimale e garantuar', function () {
  var txt = JSON.stringify(Q.QUESTIONS) + Q.buildSpec(H.fullState());
  assert.ok(!/-3%|−3%|max -3|maksimum -3/i.test(txt));
});

test('përgjigjet, përmbledhja dhe specifikimi përputhen', function () {
  var s = H.fullState();
  var vis = Q.visibleIds(s);
  var sq = Q.sections(s, 'sq'), en = Q.sections(s, 'en');
  var sqIds = [], enIds = [];
  sq.forEach(function (x) { x.items.forEach(function (i) { sqIds.push(i.id); }); });
  en.forEach(function (x) { x.items.forEach(function (i) { enIds.push(i.id); }); });
  assert.deepEqual(sqIds, enIds);
  var spec = Q.buildSpec(s);
  en.forEach(function (x) { x.items.forEach(function (i) { assert.ok(spec.indexOf('- ' + i.label + ': ' + i.value) >= 0, i.id); }); });
  // Çdo pyetje e dukshme me përgjigje është në përmbledhje
  vis.forEach(function (id) {
    var q = Q.byId[id];
    if (['info', 'facts', 'examples'].indexOf(q.type) >= 0) return;
    var v = s.answers[id];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
    assert.ok(sqIds.indexOf(id) >= 0, 'mungon ' + id);
  });
  // Seksionet e kërkuara të specifikimit
  ['== 1. CLIENT ANSWERS ==', '== 2. PREVIOUSLY CONFIRMED FACTS ==', '== 3. ASSUMPTIONS PENDING CONFIRMATION ==', '== 4. UNRESOLVED ISSUES AND CONTRADICTIONS ==', '== 5. DEVELOPER VERIFICATIONS AND REQUIREMENTS =='].forEach(function (h) { assert.ok(spec.indexOf(h) >= 0, h); });
  assert.match(spec, /round DOWN to the volume step/);
  assert.match(spec, /below the broker minimum, skip the trade/);
  assert.match(spec, /Restore state after restart/);
  assert.match(spec, /Prevent duplicate orders/);
  assert.match(spec, /outside the EA's responsibility/);
  assert.match(spec, /shembulli-1-buy-win\.jpg/);
  assert.ok(!/Client:/.test(spec), 'pa të dhëna personale');
});

test('filtri i lajmeve kërkon testim me të dhëna historike në specifikim', function () {
  var s = H.fullState();
  s.answers.news = 'yes'; s.answers.news_events = ['nfp', 'cpi']; s.answers.news_before = '30'; s.answers.news_after = '15'; s.answers.news_open = 'keep';
  var spec = Q.buildSpec(s);
  assert.match(spec, /historical news data/);
  assert.match(spec, /modified rules/);
});

test('sanitizeState pranon vetëm çelësa dhe opsione të njohura', function () {
  var s = Q.sanitizeState({ answers: { tf_signal: 'H9', sides: 'both', evil: 'x', cond: ['rsi', 'hack'], rsi_rule: 'A'.repeat(900), client_name: 'X' }, examples: [{ kind: 'buy', bogus: 1 }] });
  assert.equal(s.answers.tf_signal, undefined);
  assert.equal(s.answers.sides, 'both');
  assert.equal(s.answers.evil, undefined);
  assert.deepEqual(s.answers.cond, ['rsi']);
  assert.equal(s.answers.rsi_rule.length, 900, 'drafti nuk shkurtohet kurrë në heshtje');
  assert.equal(s.answers.client_name, undefined, 'të dhënat personale nuk pranohen më');
  assert.equal(s.examples[0].bogus, undefined);
});

test('migrimi i draftit të vjetër (v11) nga skedari origjinal', function () {
  var raw = H.legacyDraftFromOriginal(function (u) {
    u.pick('tfe', 'M15'); u.pick('tfc', 'H1'); u.pick('dir', 'Moving average');
    u.pick('cond', 'RSI'); u.type('buy-condition-rsi', 'RSI 14 kalon mbi 50');
    u.pick('tpm', 'Exact multiple of SL distance'); u.pick('tp', 'Always 1:3');
    u.pick('nw', 'Yes, 30 min before/after'); u.type('buy', '1. EMA 200\n2. RSI');
    u.type('btp', 'shtator 2026');
  });
  assert.ok(raw, 'drafti i vjetër u ruajt nga faqja origjinale');
  var m = Q.migrateLegacy(raw, null);
  assert.ok(m);
  assert.equal(m.answers.tf_signal, 'M15');
  assert.equal(m.answers.tf_higher, 'H1');
  assert.equal(m.answers.dir_method, 'ma');
  assert.deepEqual(m.answers.cond, ['rsi']);
  assert.equal(m.answers.rsi_rule, 'RSI 14 kalon mbi 50');
  assert.equal(m.answers.tp_method, 'r');
  assert.equal(m.answers.tp_r, '3');
  assert.equal(m.answers.news, 'yes');
  assert.equal(m.answers.news_before, '30');
  assert.equal(m.answers.own_words, '1. EMA 200\n2. RSI');
  assert.equal(m.answers.mirror, undefined, 'SELL si pasqyrim nuk konfirmohet automatikisht');
  assert.ok(m.legacyNotes.some(function (n) { return n.text === 'shtator 2026'; }));
  assert.equal(m.answers.risk_pct, '1');
  assert.equal(Q.migrateLegacy('{"f":[1,2]}', null), null, 'struktura e panjohur nuk migrohet');
});

test('drafti me skemën 2 migrohet: ora e Shqipërisë dhe pa të dhëna personale', function () {
  var old = { schemaVersion: 2, answers: { day_reset: 'kosovo', t_tz: 'kosovo', tv_tz: 'kosovo', client_name: 'X', client_email: 'x@y.com', tf_signal: 'M15' }, examples: [] };
  var m = Q.migrateState(old);
  assert.equal(m.schemaVersion, Q.SCHEMA_VERSION);
  assert.equal(m.answers.day_reset, 'albania');
  assert.equal(m.answers.t_tz, 'albania');
  assert.equal(m.answers.tv_tz, 'albania');
  assert.equal(m.answers.client_name, undefined);
  assert.equal(m.answers.client_email, undefined);
  assert.equal(m.answers.tf_signal, 'M15');
  assert.equal(Q.migrateState({ schemaVersion: 1 }), null);
});

test('termat e trading-ut janë në anglisht', function () {
  var txt = JSON.stringify(Q.QUESTIONS) + JSON.stringify(Q.STEPS) + JSON.stringify(Q.EXAMPLE_FIELDS) + JSON.stringify(Q.CONFIRMED_FACTS);
  ['qiri', 'qirinj', 'majë', 'gropë', 'gropa', 'mesatare lëvizëse', 'kryqëzim', 'urdhri në pritje', 'tregti', 'Kosov'].forEach(function (w) {
    assert.ok(txt.toLowerCase().indexOf(w.toLowerCase()) < 0, 'gjendet ende: ' + w);
  });
});

test('madhësia e trade-it: fushat sipas mënyrës së zgjedhur', function () {
  var s = H.fullState();
  delete s.answers.size_method;
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'size_method'; }), 'pyetja është e detyrueshme');
  s.answers.size_method = 'fixed_lot';
  assert.ok(Q.isVisible('lot_fixed', s) && Q.isVisible('size_info_fixed', s));
  assert.ok(!Q.isVisible('risk_pct', s) && !Q.isVisible('risk_base', s) && !Q.isVisible('risk_money', s));
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'lot_fixed'; }));
  s.answers.size_method = 'risk_pct';
  assert.ok(Q.isVisible('risk_pct', s) && Q.isVisible('risk_base', s) && !Q.isVisible('lot_fixed', s));
  s.answers.size_method = 'risk_money';
  assert.ok(Q.isVisible('risk_money', s) && !Q.isVisible('risk_pct', s));
  assert.equal(Q.unitLabel(Q.byId.risk_money, s, 'sq'), 'USD');
  s.answers.account_ccy = 'other'; s.answers.account_ccy_other = 'gbp';
  assert.equal(Q.unitLabel(Q.byId.risk_money, s, 'sq'), 'GBP');
  s.answers.size_method = Q.UNKNOWN;
  assert.ok(!Q.validate(s).some(function (e) { return e.id === 'size_method'; }));
  assert.ok(Q.analyze(s).unresolved.some(function (u) { return u.id === 'size_method'; }));
  s.answers.lot_cap = 'yes';
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'lot_cap_value'; }));
});

test('madhësia e trade-it: kundërthëniet dhe specifikimi', function () {
  var s = H.fullState();
  s.answers.size_method = 'fixed_lot'; s.answers.lot_fixed = '0.5'; s.answers.lot_cap = 'yes'; s.answers.lot_cap_value = '0.3'; s.answers.size_conflict = 'reduce';
  var an = Q.analyze(s);
  var en = an.contradictions.map(function (c) { return c.en; }).join('\n');
  assert.match(en, /Confirmed fact is "Risk: 1% per trade", but the sizing method chosen is: Fixed lot/);
  assert.match(en, /Fixed lot \(0\.5\) is above the max lot cap \(0\.3\)/);
  var spec = Q.buildSpec(s);
  assert.match(spec, /POSITION SIZING \(exactly one active method; never combine methods\): FIXED LOT of 0\.5 lots/);
  assert.match(spec, /A fixed lot is not a fixed loss/);
  assert.match(spec, /Max lot per trade: 0\.3 lots/);
  assert.match(spec, /client choice = REDUCE the volume/);
  assert.match(spec, /never increase the volume above the allowed risk/);
  assert.match(spec, /Never change the size silently/);
  assert.match(spec, /- Position sizing method \(only one active\): Fixed lot: same volume on every trade/);
  assert.match(spec, /- Fixed lot per trade: 0\.5 lots/);
  assert.ok(!/Risk per trade:/.test(spec), 'risk % i fshehur nuk hyn në specifikim');
  // Risk monetar: krahasimi me daily loss limit dhe kapitalin
  s = H.fullState();
  s.answers.size_method = 'risk_money'; s.answers.risk_money = '300'; s.answers.daily_loss = 'yes'; s.answers.dl_pct = '2'; s.answers.dl_base = 'balance_start'; s.answers.dl_floating = 'yes'; s.answers.dl_scope = 'robot'; s.answers.dl_action = 'stop';
  en = Q.analyze(s).contradictions.map(function (c) { return c.en; }).join('\n');
  assert.match(en, /Daily loss limit \(2%\) is reached by a single loss \(3%\)/);
  spec = Q.buildSpec(s);
  assert.match(spec, /FIXED MONEY RISK: risk money = 300 USD per trade/);
  assert.match(spec, /- Fixed money risk per trade: 300 USD/);
  assert.match(spec, /- Planned trading capital: 10000 USD/);
  assert.match(spec, /client choice = SKIP the trade/);
  // Risk %: pa kundërthënie me faktin
  s = H.fullState();
  assert.equal(Q.analyze(s).contradictions.length, 0);
  assert.match(Q.buildSpec(s), /RISK %: risk money = balance x 1%/);
});

test('çdo "Tjetër" ka fushë sqarimi të detyrueshme që shfaqet vetëm kur zgjidhet', function () {
  function refs(c, out) { if (!c) return out; (c.all || []).forEach(function (x) { refs(x, out); }); (c.any || []).forEach(function (x) { refs(x, out); }); if (c.q) out.push(c); return out; }
  var checked = 0;
  Q.QUESTIONS.forEach(function (q) {
    (q.options || []).forEach(function (op) {
      if (!(op.v === 'other' || op.v === 'custom' || /^Tjetër/.test(op.sq))) return;
      checked++;
      var follow = Q.QUESTIONS.filter(function (r) {
        return r.req && r.type !== 'info' && refs(r.show, []).some(function (c) { return c.q === q.id && (c.eq === op.v || c.has === op.v || (c.in && c.in.indexOf(op.v) >= 0)); });
      });
      assert.ok(follow.length > 0, q.id + ' = ' + op.v + ' nuk ka fushë sqarimi');
    });
  });
  assert.ok(checked >= 20);
  // Shembull konkret: MA "Tjetër" te crossover bllokon derisa të sqarohet
  var s = H.fullState();
  s.answers.cx_type = 'other';
  assert.ok(Q.isVisible('cx_type_other', s));
  assert.ok(Q.validate(s).some(function (e) { return e.id === 'cx_type_other'; }));
  s.answers.cx_type_other = 'HMA';
  assert.deepEqual(Q.validate(s), []);
  assert.match(Q.buildSpec(s), /- Crossover MA type \(other\): HMA/);
  s.answers.cx_type = 'ema';
  assert.ok(!Q.isVisible('cx_type_other', s));
  assert.ok(!/Crossover MA type \(other\)/.test(Q.buildSpec(s)), 'sqarimi i fshehur nuk hyn në specifikim');
});
