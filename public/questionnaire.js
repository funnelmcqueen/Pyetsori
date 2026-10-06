/*
 * Pyetësori XAUUSD: skema dhe logjika e përbashkët.
 * Përdoret nga faqja (window.XAUQ), paneli dhe serveri (require). Nuk ka varësi.
 * ID-të e pyetjeve dhe vlerat e opsioneve mbahen të qëndrueshme mes versioneve,
 * që draftet dhe dorëzimet e vjetra të lexohen pa humbje.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XAUQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 5;
  var STORAGE_KEY = 'xau-q:state';
  var PREV_STORAGE_KEYS = ['xau-q:v2'];
  var BACKUP_KEY = 'xau-q:legacy-backup';
  var MAX_EXAMPLES = 6;
  var MIN_EXAMPLES = 1;
  var MAX_SETTINGS_PHOTOS = 2;
  var MAX_PHOTOS = MAX_EXAMPLES + MAX_SETTINGS_PHOTOS;
  var UNKNOWN = '?';
  var UNKNOWN_SQ = 'Nuk e di — ta sqarojmë bashkë';
  var UNKNOWN_EN = 'UNKNOWN — to clarify with the client';
  // Kufijtë e gjatësisë: tekstet e gjata refuzohen me mesazh, nuk shkurtohen kurrë në heshtje.
  var MAX_LEN = { text: 2000, textarea: 20000, email: 254, number: 40, time: 5, date: 10 };
  var MAX_LEN_EX = { text: 500, textarea: 4000, number: 40, time: 5, date: 10 };

  // Ajo që klienti na ka thënë më parë (nuk shpiken të reja).
  var CONFIRMED_FACTS = [
    { id: 'broker', sq: 'Brokeri yt është Tauro dhe tregton në MetaTrader 5', en: 'Broker: Tauro, on MetaTrader 5' },
    { id: 'symbol', sq: 'Tregton vetëm arin, me simbolin XAUUSD.r', en: 'Instrument: gold only, symbol XAUUSD.r' },
    { id: 'auto', sq: 'Roboti do t\'i hapë, menaxhojë dhe mbyllë trade-et vetë', en: 'Fully automatic: the EA opens, manages and closes trades itself' },
    { id: 'strategy', sq: 'Ke një strategji, të testuar me dorë për 1 muaj në TradingView', en: 'One strategy, manually backtested for one month on TradingView' },
    { id: 'risk', sq: 'Ke përmendur risk 1% për trade', en: 'Risk: 1% per trade', value: 1 },
    { id: 'maxtrades', sq: 'Ke përmendur maksimumi 3 trade-e në ditë', en: 'Maximum 3 trades per day', value: 3 }
  ];

  // Pjesët e pyetësorit (siç i sheh klienti).
  var SECTIONS = [
    { id: 'trade', sq: 'Çfarë tregton?', en: 'What is traded' },
    { id: 'entry', sq: 'Kur hap një trade?', en: 'When a trade is opened' },
    { id: 'exit', sq: 'Kur e mbyll?', en: 'When a trade is closed' },
    { id: 'risk', sq: 'Sa do të rrezikosh?', en: 'Risk and position size' },
    { id: 'time', sq: 'Në cilat orare tregton?', en: 'Trading hours and news' },
    { id: 'examples', sq: 'Na trego disa shembuj.', en: 'Examples, backtest and acceptance' },
    { id: 'review', sq: 'Kontrollo përgjigjet.', en: 'Review' }
  ];

  // Ekranet: një grup i vogël pyetjesh të lidhura. Ekranet pa pyetje të dukshme kapërcehen.
  var SCREENS = [
    { id: 'facts', section: 'trade', sq: 'Ajo që na ke thënë deri tani', intro: 'Kontrollo nëse është e saktë. Përgjigjet ruhen vetë në këtë pajisje, kështu që mund të ndalosh dhe të vazhdosh më vonë.', special: 'facts' },
    { id: 'chart', section: 'trade', sq: 'Grafiku dhe drejtimi', intro: 'Si e shikon grafikun kur tregton. Përgjigju ashtu si ke tregtuar në testin në TradingView.' },
    { id: 'direction', section: 'entry', sq: 'Si e zgjedh drejtimin', intro: 'Para sinjalit: si vendos nëse kërkon BUY apo SELL.' },
    { id: 'conditions', section: 'entry', sq: 'Sinjali për të hyrë', intro: 'Zgjidh gjithçka që kontrollon para se të hapësh një trade {SIDE}. Për secilën do të pyesim më pas për cilësimet.' },
    { id: 'ind_ma_cross', section: 'entry', sq: 'Cilësimet: dy Moving Average që kryqëzohen', intro: 'Hape dritaren e cilësimeve të indikatorit në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_pullback', section: 'entry', sq: 'Cilësimet: kthimi te një Moving Average', intro: 'Hape dritaren e cilësimeve të indikatorit në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_rsi', section: 'entry', sq: 'Cilësimet: RSI', intro: 'Hape dritaren e cilësimeve të RSI në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_macd', section: 'entry', sq: 'Cilësimet: MACD', intro: 'Hape dritaren e cilësimeve të MACD në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_stoch', section: 'entry', sq: 'Cilësimet: Stochastic', intro: 'Hape dritaren e cilësimeve të Stochastic në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_bb', section: 'entry', sq: 'Cilësimet: Bollinger Bands', intro: 'Hape dritaren e cilësimeve të Bollinger Bands në grafik dhe kopjo numrat këtu.' },
    { id: 'ind_breakout', section: 'entry', sq: 'Cilësimet: kalimi i një niveli (breakout)', intro: 'Breakout = çmimi kalon një nivel të rëndësishëm, p.sh. pikën më të lartë të ditës së kaluar.' },
    { id: 'ind_retest', section: 'entry', sq: 'Cilësimet: kthimi te niveli (retest)', intro: 'Retest = pasi kalon nivelin, çmimi kthehet ta prekë sërish para se të vazhdojë.' },
    { id: 'ind_candle', section: 'entry', sq: 'Cilësimet: forma e candle-s', intro: 'Candle = shufra në grafik që tregon lëvizjen e çmimit për një periudhë (p.sh. 15 minuta).' },
    { id: 'ind_fib', section: 'entry', sq: 'Cilësimet: Fibonacci', intro: 'Si e vizaton dhe cilin nivel përdor.' },
    { id: 'ind_custom', section: 'entry', sq: 'Indikatori i personalizuar', intro: 'Indikatorët e TradingView duhen rindërtuar për MT5, prandaj na duhet të dimë si funksionojnë.' },
    { id: 'ind_other', section: 'entry', sq: 'Kushti tjetër', intro: 'Përshkruaje me fjalët e tua.' },
    { id: 'combine', section: 'entry', sq: 'Si bashkohen kushtet', intro: 'Kur kontrollon disa gjëra, si i bashkon.' },
    { id: 'sell', section: 'entry', sq: 'BUY dhe SELL, me fjalët e tua', intro: 'Pyetja e fundit për hyrjen është opsionale, por shumë e dobishme.' },
    { id: 'order', section: 'entry', sq: 'Si hapet trade-i', intro: 'Çfarë ndodh në momentin kur kushtet plotësohen.' },
    { id: 'repeat', section: 'entry', sq: 'Përsëritja dhe sinjali i kundërt', intro: 'Çfarë bën kur sinjali vazhdon ose kur del sinjal në drejtimin tjetër.' },
    { id: 'skip', section: 'entry', sq: 'Kur NUK hyn', intro: 'Rastet kur sinjali është aty, por ti nuk e merr trade-in.' },
    { id: 'sl', section: 'exit', sq: 'Stop Loss', intro: 'Stop Loss = çmimi ku trade-i mbyllet vetë me humbje, që humbja të mos rritet më.' },
    { id: 'tp', section: 'exit', sq: 'Take Profit', intro: 'Take Profit = çmimi ku trade-i mbyllet vetë me fitim. 1R = sa larg është Stop Loss nga hyrja. Shembull: Stop Loss 5$ larg, atëherë 2R do të thotë Take Profit 10$ larg.' },
    { id: 'be', section: 'exit', sq: 'Stop Loss te hyrja', intro: 'Disa traderë e zhvendosin Stop Loss te çmimi i hyrjes kur trade-i shkon në fitim (quhet break-even).' },
    { id: 'partial', section: 'exit', sq: 'Mbyllja e një pjese', intro: 'Disa traderë mbyllin një pjesë të trade-it herët dhe e lënë pjesën tjetër të vazhdojë.' },
    { id: 'trail', section: 'exit', sq: 'Stop Loss që ndjek çmimin', intro: 'Trailing stop = Stop Loss që lëviz vetë pas çmimit kur trade-i shkon në fitim.' },
    { id: 'account', section: 'risk', sq: 'Llogaria', intro: 'Pak informacion për llogarinë ku do të punojë roboti.' },
    { id: 'size', section: 'risk', sq: 'Madhësia e trade-it', intro: 'Lot = madhësia e trade-it. Sa më i madh loti, aq më shumë fiton ose humb për çdo lëvizje të çmimit.' },
    { id: 'limits', section: 'risk', sq: 'Kufijtë e ditës', intro: 'Rregullat që e ndalojnë robotin të tregtojë shumë në një ditë.' },
    { id: 'hours', section: 'time', sq: 'Oraret', intro: 'Kur lejohet roboti të hapë trade-e.' },
    { id: 'news', section: 'time', sq: 'Lajmet dhe njoftimet', intro: 'Gjatë lajmeve të mëdha ekonomike ari lëviz shumë shpejt.' },
    { id: 'backtest', section: 'examples', sq: 'Testi yt në TradingView', intro: 'Këto na ndihmojnë ta krahasojmë robotin me trade-et e tua.' },
    { id: 'examples', section: 'examples', sq: 'Shembuj', intro: 'Fillo me një shembull. Pastaj, nëse mundesh, shto një trade që ka humbur dhe një rast kur NUK ke hyrë edhe pse dukej si sinjal. Nuk ka nevojë të jenë të përsosur: do t\'i sqarojmë bashkë.', special: 'examples' },
    { id: 'acceptance', section: 'examples', sq: 'Si do ta kontrollojmë robotin', intro: 'Pasi ta ndërtojmë, e testojmë robotin në të njëjtën periudhë dhe e krahasojmë me trade-et e tua. Kjo kontrollon që rregullat janë zbatuar saktë. Nuk premton fitim.' },
    { id: 'review', section: 'review', sq: 'Kontrollo përgjigjet', intro: 'Lexoji edhe një herë. Mund të korrigjosh çdo pjesë para se t\'i dorëzosh.', special: 'review' }
  ];

  var UNITS = {
    usd: { sq: '$ lëvizje çmimi', en: 'USD of gold price movement' },
    pct: { sq: '% e llogarisë', en: '% of account' },
    pctv: { sq: '% e trade-it', en: '% of position' },
    candles: { sq: 'candles', en: 'candles' },
    min: { sq: 'minuta', en: 'minutes' },
    period: { sq: '', en: 'period' },
    r: { sq: 'R', en: 'R' },
    price: { sq: 'çmimi', en: 'price' },
    count: { sq: 'trade-e', en: 'trades' },
    mult: { sq: '×', en: 'x' },
    lot: { sq: 'lot', en: 'lots' },
    ccy: { sq: 'monedha e llogarisë', en: 'account currency' }
  };

  function o(v, sq, en) { return { v: v, sq: sq, en: en || sq }; }
  var TF = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map(function (t) { return o(t, t); });
  var TF_SAME = [o('same', 'I njëjti me grafikun ku hyn', 'Same as signal timeframe')].concat(TF);
  var SOURCE = [o('close', 'Close (mbyllja)', 'Close'), o('open', 'Open (hapja)', 'Open'), o('high', 'High', 'High'), o('low', 'Low', 'Low'), o('hl2', 'Median (HL/2)', 'HL2'), o('hlc3', 'Typical (HLC/3)', 'HLC3')];
  var MA_TYPE = [o('ema', 'EMA'), o('sma', 'SMA'), o('other', 'Tjetër', 'Other')];
  var YES_NOTUSED = [o('no', 'Jo, nuk e përdor', 'No (not used)'), o('yes', 'Po', 'Yes')];
  var KEEP_CANCEL = [o('cancel', 'E fshin urdhrin', 'Cancel the pending order'), o('keep', 'E lë', 'Keep it')];
  var SOURCE_HINT = 'Te cilësimet quhet "Apply to". Nëse s\'e ke ndryshuar, zakonisht është Close.';

  function has(q, v) { return { q: q, has: v }; }
  function eq(q, v) { return { q: q, eq: v }; }
  function inn(q, vs) { return { q: q, in: vs }; }
  function all() { return { all: Array.prototype.slice.call(arguments) }; }

  // type: single | multi | text | textarea | number | time | date | info | facts | examples | settings
  // hint = shpjegim i shkurtër; ex = shembull (vetëm tekst, nuk plotëson asgjë); verify: 'dev' = zhvilluesi mund ta verifikojë vetë.
  var Q = [
    // ---------- Çfarë tregton? ----------
    { id: 'facts', screen: 'facts', type: 'facts', sq: 'Më herët na ke thënë:', en: 'Previously confirmed facts' },
    { id: 'facts_review', screen: 'facts', type: 'single', req: true, sq: 'A është e saktë?', en: 'Client review of confirmed facts', options: [o('ok', 'Po, është e saktë', 'Client confirms all facts'), o('fix', 'Diçka nuk është e saktë', 'Client flags a correction')] },
    { id: 'facts_fix', screen: 'facts', type: 'textarea', req: true, sq: 'Çfarë duhet korrigjuar?', en: 'Correction to confirmed facts', show: eq('facts_review', 'fix') },

    { id: 'tf_signal', screen: 'chart', type: 'single', req: true, unk: true, sq: 'Në cilin timeframe e shikon grafikun kur vendos të hapësh një trade?', hint: 'Timeframe = sa kohë përfaqëson çdo candle (shufër) në grafik. M15 = 15 minuta, H1 = 1 orë.', en: 'Signal (entry) timeframe', options: TF },
    { id: 'tf_higher', screen: 'chart', type: 'single', req: true, unk: true, sq: 'A shikon edhe një timeframe më të madh për drejtimin e tregut?', hint: 'Disa traderë hyjnë në M15, por shikojnë H1 për të parë nëse tregu po ngrihet apo po bie.', en: 'Higher timeframe used for direction', options: [o('none', 'Jo, shikoj vetëm një timeframe', 'None')].concat(TF.slice(2)) },
    { id: 'htf_candle', screen: 'chart', type: 'single', req: true, unk: true, sq: 'Te {HTF}, a pret që candle të mbyllet?', hint: 'Një candle e mbyllur nuk ndryshon më. Ajo që po formohet mund të ndryshojë deri sa të mbyllet.', en: 'Higher-timeframe candle used', show: { q: 'tf_higher', nin: ['none', UNKNOWN] }, options: [o('closed', 'Po, shikoj vetëm candles të mbyllura', 'Closed candles only'), o('forming', 'Jo, shikoj edhe candle-n që po formohet', 'Also the forming (unclosed) candle')] },
    { id: 'sides', screen: 'chart', type: 'single', req: true, unk: true, sq: 'Çfarë trade-esh hap?', hint: 'BUY = blen, fiton kur çmimi i arit ngrihet. SELL = shet, fiton kur çmimi bie.', en: 'Allowed directions', options: [o('both', 'Edhe BUY edhe SELL', 'Both BUY and SELL'), o('buy_only', 'Vetëm BUY', 'BUY only'), o('sell_only', 'Vetëm SELL', 'SELL only')] },

    // ---------- Kur hap një trade? ----------
    { id: 'dir_method', screen: 'direction', type: 'single', req: true, unk: true, sq: 'Si e vendos nëse kërkon BUY apo SELL?', en: 'Direction filter method', options: [o('ma', 'Me një Moving Average (MA), p.sh. çmimi mbi ose nën EMA 200', 'Moving average'), o('structure', 'Nga majat dhe gropat e grafikut', 'Market structure (swing highs/lows)'), o('indicator', 'Me një indikator tjetër', 'Other indicator'), o('none', 'Nuk përdor filtër drejtimi', 'No direction filter')] },
    { id: 'dir_ma_type', screen: 'direction', type: 'single', req: true, sq: 'Cilin lloj MA përdor?', en: 'Direction MA type', show: eq('dir_method', 'ma'), options: MA_TYPE },
    { id: 'dir_ma_type_other', screen: 'direction', type: 'text', req: true, sq: 'Cila MA saktësisht?', ex: 'WMA, HMA', en: 'Direction MA type (other)', show: eq('dir_ma_type', 'other') },
    { id: 'dir_ma_period', screen: 'direction', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e MA-së', hint: 'Numri që shkruan te cilësimet e indikatorit.', ex: '200', en: 'Direction MA period', show: eq('dir_method', 'ma') },
    { id: 'dir_ma_tf', screen: 'direction', type: 'single', req: true, sq: 'Në cilin timeframe e shikon këtë MA?', en: 'Direction MA timeframe', show: eq('dir_method', 'ma'), options: TF_SAME },
    { id: 'dir_ma_source', screen: 'direction', type: 'single', req: true, unk: true, sq: 'Nga cili çmim llogaritet MA?', hint: SOURCE_HINT, en: 'Direction MA price source', show: eq('dir_method', 'ma'), options: SOURCE },
    { id: 'dir_ma_rule', screen: 'direction', type: 'single', req: true, sq: 'Si e lexon MA-në?', en: 'Direction MA rule', show: eq('dir_method', 'ma'), options: [o('close_vs_ma', 'BUY kur candle mbyllet mbi MA, SELL kur mbyllet nën të', 'BUY when candle closes above the MA, SELL when it closes below'), o('two_ma', 'Përdor dy MA: BUY kur MA e shpejtë është mbi të ngadaltën', 'BUY when a fast MA is above a slow MA (SELL the reverse)'), o('other', 'Ndryshe', 'Other')] },
    { id: 'dir_ma_period2', screen: 'direction', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e MA-së së shpejtë', ex: '50 (dhe 200 për të ngadaltën)', en: 'Direction fast MA period', show: eq('dir_ma_rule', 'two_ma') },
    { id: 'dir_ma_rule_text', screen: 'direction', type: 'text', req: true, sq: 'Si e lexon saktë?', en: 'Direction MA rule (own words)', show: eq('dir_ma_rule', 'other') },
    { id: 'dir_st_tf', screen: 'direction', type: 'single', req: true, sq: 'Në cilin timeframe i shikon majat dhe gropat?', en: 'Structure timeframe', show: eq('dir_method', 'structure'), options: TF_SAME },
    { id: 'dir_st_swing', screen: 'direction', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Sa candles në secilën anë duhet të jenë më poshtë, që një pikë të quhet majë?', hint: 'Majë (swing high) = pika më e lartë para se çmimi të kthehej poshtë. Gropë (swing low) = e kundërta.', ex: '3', en: 'Swing definition: candles on each side', show: eq('dir_method', 'structure') },
    { id: 'dir_st_rule', screen: 'direction', type: 'text', req: true, unk: true, sq: 'Kur e quan tregun në rritje (për BUY)?', ex: 'maja e fundit dhe gropa e fundit janë më lart se të mëparshmet', en: 'Structure rule for bullish direction', show: eq('dir_method', 'structure') },
    { id: 'dir_ind_text', screen: 'direction', type: 'text', req: true, sq: 'Cili indikator, me cilat cilësime, në cilin timeframe, dhe si e lexon?', ex: 'MACD 12/26/9 në H4: BUY kur histogrami është mbi zero', en: 'Direction indicator rule', show: eq('dir_method', 'indicator') },

    { id: 'cond', screen: 'conditions', type: 'multi', req: true, unk: true, sq: 'Çfarë duhet të ndodhë që të hapësh një trade?', en: 'Entry conditions', options: [
      o('ma_cross', 'Dy Moving Average kryqëzohen', 'MA crossover'), o('pullback', 'Çmimi kthehet te një Moving Average', 'Pullback to a MA'), o('rsi', 'RSI'), o('macd', 'MACD'), o('stoch', 'Stochastic'), o('bb', 'Bollinger Bands'),
      o('breakout', 'Çmimi kalon një nivel (breakout)', 'Level breakout'), o('retest', 'Çmimi kthehet te niveli që sapo kaloi (retest)', 'Retest of a broken level'), o('candle', 'Një formë e caktuar candle-i, p.sh. engulfing', 'Candle pattern'), o('fib', 'Fibonacci', 'Fibonacci retracement'),
      o('custom', 'Një indikator i personalizuar nga TradingView', 'Custom TradingView indicator'), o('other', 'Tjetër', 'Other')] },

    // Cilësimet e çdo indikatori, bashkë në një ekran
    { id: 'cx_type', screen: 'ind_ma_cross', type: 'single', req: true, sq: 'Lloji i MA-ve', en: 'Crossover MA type', show: has('cond', 'ma_cross'), options: MA_TYPE },
    { id: 'cx_type_other', screen: 'ind_ma_cross', type: 'text', req: true, sq: 'Cila MA saktësisht?', ex: 'WMA, HMA', en: 'Crossover MA type (other)', show: eq('cx_type', 'other') },
    { id: 'cx_fast', screen: 'ind_ma_cross', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e MA-së së shpejtë', ex: '9', en: 'Crossover fast period', show: has('cond', 'ma_cross'), row: 'cx' },
    { id: 'cx_slow', screen: 'ind_ma_cross', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e MA-së së ngadaltë', ex: '21', en: 'Crossover slow period', show: has('cond', 'ma_cross'), row: 'cx' },
    { id: 'cx_tf', screen: 'ind_ma_cross', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Crossover timeframe', show: has('cond', 'ma_cross'), options: TF_SAME },
    { id: 'cx_source', screen: 'ind_ma_cross', type: 'single', req: true, unk: true, sq: 'Nga cili çmim llogariten?', hint: SOURCE_HINT, en: 'Crossover price source', show: has('cond', 'ma_cross'), options: SOURCE },
    { id: 'cx_note', screen: 'ind_ma_cross', type: 'text', opt: true, sq: 'Diçka tjetër për këtë kryqëzim?', ex: 'vlen vetëm kur ndodh mbi EMA 200', en: 'Crossover note', show: has('cond', 'ma_cross') },
    { id: 'pb_type', screen: 'ind_pullback', type: 'single', req: true, sq: 'Lloji i MA-së', en: 'Pullback MA type', show: has('cond', 'pullback'), options: MA_TYPE },
    { id: 'pb_type_other', screen: 'ind_pullback', type: 'text', req: true, sq: 'Cila MA saktësisht?', ex: 'WMA, HMA', en: 'Pullback MA type (other)', show: eq('pb_type', 'other') },
    { id: 'pb_period', screen: 'ind_pullback', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha', ex: '50', en: 'Pullback MA period', show: has('cond', 'pullback') },
    { id: 'pb_tf', screen: 'ind_pullback', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Pullback MA timeframe', show: has('cond', 'pullback'), options: TF_SAME },
    { id: 'pb_touch', screen: 'ind_pullback', type: 'single', req: true, sq: 'Sa afër MA-së duhet të vijë çmimi?', en: 'Pullback touch rule', show: has('cond', 'pullback'), options: [o('touch', 'Candle e prek MA-në', 'Candle touches the MA'), o('near', 'Candle vjen brenda disa $ prej saj', 'Candle comes within a distance of the MA'), o('close_back', 'E prek dhe mbyllet përsëri në anën e trendit', 'Touches the MA and closes back on the trend side')] },
    { id: 'pb_dist', screen: 'ind_pullback', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Brenda sa $?', hint: 'Lëvizje e çmimit të arit, jo para.', ex: '1', en: 'Pullback max distance', show: eq('pb_touch', 'near') },
    { id: 'pb_note', screen: 'ind_pullback', type: 'text', opt: true, sq: 'Diçka tjetër për këtë kthim?', en: 'Pullback note', show: has('cond', 'pullback') },
    { id: 'rsi_period', screen: 'ind_rsi', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e RSI', hint: 'Zakonisht është 14.', en: 'RSI period', show: has('cond', 'rsi') },
    { id: 'rsi_tf', screen: 'ind_rsi', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'RSI timeframe', show: has('cond', 'rsi'), options: TF_SAME },
    { id: 'rsi_source', screen: 'ind_rsi', type: 'single', req: true, unk: true, sq: 'Nga cili çmim llogaritet?', hint: SOURCE_HINT, en: 'RSI price source', show: has('cond', 'rsi'), options: SOURCE },
    { id: 'rsi_rule', screen: 'ind_rsi', type: 'text', req: true, sq: 'Çfarë duhet të bëjë RSI që të hysh?', ex: 'RSI kalon nga poshtë mbi 30', en: 'RSI condition', show: has('cond', 'rsi') },
    { id: 'macd_fast', screen: 'ind_macd', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Fast EMA', hint: 'Zakonisht 12, 26 dhe 9.', en: 'MACD fast', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_slow', screen: 'ind_macd', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Slow EMA', en: 'MACD slow', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_signal', screen: 'ind_macd', type: 'number', req: true, num: 'int', unit: 'period', sq: 'MACD SMA (signal)', en: 'MACD signal', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_tf', screen: 'ind_macd', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'MACD timeframe', show: has('cond', 'macd'), options: TF_SAME },
    { id: 'macd_rule', screen: 'ind_macd', type: 'text', req: true, sq: 'Çfarë duhet të bëjë MACD që të hysh?', ex: 'vija MACD kalon mbi vijën signal, nën zero', en: 'MACD condition', show: has('cond', 'macd') },
    { id: 'st_k', screen: 'ind_stoch', type: 'number', req: true, num: 'int', unit: 'period', sq: '%K period', hint: 'Zakonisht 14, 3 dhe 3.', en: 'Stochastic %K', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_d', screen: 'ind_stoch', type: 'number', req: true, num: 'int', unit: 'period', sq: '%D period', en: 'Stochastic %D', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_slow', screen: 'ind_stoch', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Slowing', en: 'Stochastic slowing', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_tf', screen: 'ind_stoch', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Stochastic timeframe', show: has('cond', 'stoch'), options: TF_SAME },
    { id: 'st_rule', screen: 'ind_stoch', type: 'text', req: true, sq: 'Çfarë duhet të bëjë Stochastic që të hysh?', ex: '%K kalon mbi %D nën nivelin 20', en: 'Stochastic condition', show: has('cond', 'stoch') },
    { id: 'bb_period', screen: 'ind_bb', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Period', hint: 'Zakonisht 20 dhe 2.', en: 'Bollinger period', show: has('cond', 'bb'), row: 'bb' },
    { id: 'bb_dev', screen: 'ind_bb', type: 'number', req: true, num: 'pos', unit: 'mult', sq: 'Deviations', en: 'Bollinger deviation', show: has('cond', 'bb'), row: 'bb' },
    { id: 'bb_tf', screen: 'ind_bb', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Bollinger timeframe', show: has('cond', 'bb'), options: TF_SAME },
    { id: 'bb_source', screen: 'ind_bb', type: 'single', req: true, unk: true, sq: 'Nga cili çmim llogaritet?', hint: SOURCE_HINT, en: 'Bollinger price source', show: has('cond', 'bb'), options: SOURCE },
    { id: 'bb_rule', screen: 'ind_bb', type: 'text', req: true, sq: 'Çfarë duhet të ndodhë me brezat që të hysh?', ex: 'candle prek brezin e poshtëm dhe mbyllet brenda tij', en: 'Bollinger condition', show: has('cond', 'bb') },
    { id: 'br_level', screen: 'ind_breakout', type: 'single', req: true, sq: 'Cilin nivel kalon çmimi?', en: 'Breakout level', show: has('cond', 'breakout'), options: [o('n_high', 'Pikën më të lartë ose më të ulët të disa candles të fundit', 'Highest high / lowest low of the last N candles'), o('prev_day', 'Pikën më të lartë ose më të ulët të ditës së kaluar', 'Previous day high/low'), o('swing', 'Majën ose gropën e fundit', 'Last confirmed swing high/low'), o('other', 'Tjetër', 'Other')] },
    { id: 'br_n', screen: 'ind_breakout', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', ex: '20', en: 'Breakout lookback candles', show: eq('br_level', 'n_high') },
    { id: 'br_swing', screen: 'ind_breakout', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Sa candles në secilën anë e konfirmojnë majën?', ex: '3', en: 'Breakout swing: candles on each side', show: eq('br_level', 'swing') },
    { id: 'br_other', screen: 'ind_breakout', type: 'text', req: true, sq: 'Si e gjen nivelin saktë?', en: 'Breakout level (own words)', show: eq('br_level', 'other') },
    { id: 'br_tf', screen: 'ind_breakout', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Breakout timeframe', show: has('cond', 'breakout'), options: TF_SAME },
    { id: 'br_confirm', screen: 'ind_breakout', type: 'single', req: true, unk: true, sq: 'Kur e quan nivelin të kaluar?', en: 'Breakout confirmation', show: has('cond', 'breakout'), options: [o('close', 'Kur candle mbyllet përtej tij', 'Candle closes beyond the level'), o('touch', 'Mjafton që çmimi ta prekë', 'A touch is enough'), o('close_dist', 'Kur candle mbyllet të paktën disa $ përtej', 'Closes at least a distance beyond')] },
    { id: 'br_dist', screen: 'ind_breakout', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ përtej?', ex: '0.5', en: 'Breakout minimum close distance', show: eq('br_confirm', 'close_dist') },
    { id: 'rt_within', screen: 'ind_retest', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Brenda sa candles pas kalimit duhet të kthehet çmimi?', ex: '10', en: 'Retest window after breakout', show: has('cond', 'retest') },
    { id: 'rt_tol', screen: 'ind_retest', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa afër nivelit duhet të vijë?', ex: '0.5', en: 'Retest tolerance around level', show: has('cond', 'retest') },
    { id: 'rt_confirm', screen: 'ind_retest', type: 'single', req: true, unk: true, sq: 'Si e kupton që kthimi mbaroi?', en: 'Retest confirmation', show: has('cond', 'retest'), options: [o('touch', 'Mjafton që ta prekë nivelin', 'Touch of the level'), o('close_back', 'E prek dhe mbyllet përsëri në anën e kalimit', 'Touches the level and closes back on the breakout side'), o('other', 'Tjetër', 'Other')] },
    { id: 'rt_other', screen: 'ind_retest', type: 'text', req: true, sq: 'Si saktësisht?', en: 'Retest confirmation (own words)', show: eq('rt_confirm', 'other') },
    { id: 'cp_type', screen: 'ind_candle', type: 'multi', req: true, sq: 'Cilat forma të candle-s?', en: 'Candle patterns', show: has('cond', 'candle'), options: [o('engulfing', 'Engulfing'), o('pinbar', 'Pin bar'), o('inside', 'Inside bar'), o('other', 'Tjetër', 'Other')] },
    { id: 'cp_type_other', screen: 'ind_candle', type: 'text', req: true, sq: 'Cila formë tjetër?', ex: 'morning star, doji, hammer', en: 'Candle pattern (other)', show: has('cp_type', 'other') },
    { id: 'cp_def', screen: 'ind_candle', type: 'textarea', req: true, sq: 'Si e njeh secilën?', ex: 'bullish engulfing: candle jeshile që e mbulon plotësisht trupin e candle-s së kuqe para saj', en: 'Candle pattern exact definition', show: has('cond', 'candle') },
    { id: 'cp_tf', screen: 'ind_candle', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Candle pattern timeframe', show: has('cond', 'candle'), options: TF_SAME },
    { id: 'fib_from', screen: 'ind_fib', type: 'text', req: true, sq: 'Nga cila pikë te cila e vizaton Fibonacci?', ex: 'nga gropa e fundit te maja e fundit në H1', en: 'Fibonacci anchor points', show: has('cond', 'fib') },
    { id: 'fib_swing', screen: 'ind_fib', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Sa candles në secilën anë e konfirmojnë majën ose gropën?', ex: '3', en: 'Fibonacci swing: candles on each side', show: has('cond', 'fib') },
    { id: 'fib_level', screen: 'ind_fib', type: 'multi', req: true, sq: 'Në cilin nivel hyn?', en: 'Fibonacci entry level', show: has('cond', 'fib'), options: [o('0.382', '0.382'), o('0.5', '0.5'), o('0.618', '0.618'), o('0.786', '0.786'), o('other', 'Tjetër', 'Other')] },
    { id: 'fib_level_other', screen: 'ind_fib', type: 'text', req: true, sq: 'Cili nivel saktësisht?', ex: '0.705', en: 'Fibonacci level (other)', show: has('fib_level', 'other') },
    { id: 'fib_entry', screen: 'ind_fib', type: 'single', req: true, unk: true, sq: 'Kur e quan nivelin të arritur?', en: 'Fibonacci level trigger', show: has('cond', 'fib'), options: [o('touch', 'Kur çmimi e prek', 'Price touches the level'), o('close', 'Kur candle mbyllet atje dhe kthehet', 'Candle closes at the level and turns')] },
    { id: 'fib_tf', screen: 'ind_fib', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Fibonacci timeframe', show: has('cond', 'fib'), options: TF_SAME },
    { id: 'cu_name', screen: 'ind_custom', type: 'text', req: true, sq: 'Si quhet indikatori në TradingView?', en: 'Custom indicator name', show: has('cond', 'custom') },
    { id: 'cu_rule', screen: 'ind_custom', type: 'text', req: true, sq: 'Çfarë sinjali jep dhe si e përdor?', ex: 'shigjeta jeshile poshtë candle-s = BUY', en: 'Custom indicator signal used', show: has('cond', 'custom') },
    { id: 'cu_code', screen: 'ind_custom', type: 'single', req: true, sq: 'A e ke kodin ose formulat e tij?', en: 'Custom indicator code availability', show: has('cond', 'custom'), options: [o('pine', 'Po, do ta dërgoj kodin (Pine Script)', 'Pine Script code will be sent separately'), o('formula', 'Po, i shkruaj formulat këtu', 'Formulas written below'), o('none', 'Jo, nuk e kam kodin', 'No code available')] },
    { id: 'cu_formula', screen: 'ind_custom', type: 'textarea', req: true, sq: 'Shkruaji formulat', en: 'Custom indicator formulas', show: eq('cu_code', 'formula') },
    { id: 'cu_repaint', screen: 'ind_custom', type: 'single', req: true, unk: true, sq: 'Pasi shfaqet një sinjal, a ndodh që më vonë të ndryshojë, të zhduket ose të lëvizë?', en: 'Custom indicator repaints', show: has('cond', 'custom'), options: [o('no', 'Jo, mbetet aty ku doli', 'No, signals never change after they appear'), o('yes', 'Po, ndonjëherë ndryshon', 'Yes, signals can change, vanish or move')] },
    { id: 'cu_tf', screen: 'ind_custom', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Custom indicator timeframe', show: has('cond', 'custom'), options: TF_SAME },
    { id: 'ot_text', screen: 'ind_other', type: 'textarea', req: true, sq: 'Përshkruaje kushtin, me numra', en: 'Other condition', show: has('cond', 'other') },

    { id: 'combine', screen: 'combine', type: 'single', req: true, unk: true, sq: 'Duhet të plotësohen të gjitha kushtet, apo mjafton njëri?', en: 'How conditions combine', show: { q: 'cond', countGt: 1 }, options: [o('all', 'Të gjitha', 'All conditions must be true'), o('any', 'Mjafton njëri', 'Any one condition is enough'), o('custom', 'Një kombinim i caktuar', 'Custom combination')] },
    { id: 'combine_text', screen: 'combine', type: 'text', req: true, sq: 'Cili kombinim?', ex: '(kryqëzimi DHE RSI) OSE breakout', en: 'Custom combination', show: eq('combine', 'custom') },
    { id: 'seq', screen: 'combine', type: 'single', req: true, unk: true, sq: 'Kur duhet të ndodhin?', en: 'Timing between conditions', show: all({ q: 'cond', countGt: 1 }, { q: 'combine', nin: ['any'] }), options: [o('same', 'Në të njëjtën candle', 'All on the same candle'), o('order', 'Njëri pas tjetrit', 'In sequence')] },
    { id: 'seq_order', screen: 'combine', type: 'text', req: true, sq: 'Në çfarë rendi?', ex: '1) kryqëzimi, 2) RSI kalon 50', en: 'Sequence order', show: eq('seq', 'order') },
    { id: 'seq_window', screen: 'combine', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Brenda sa candles duhet të ndodhë i gjithë rendi?', ex: '3', en: 'Sequence window', show: eq('seq', 'order') },
    { id: 'seq_valid', screen: 'combine', type: 'single', req: true, unk: true, sq: 'Kur ndodh kushti i fundit, a duhet të jenë ende të vërteta kushtet e mëparshme?', en: 'Earlier conditions must still be valid', show: eq('seq', 'order'), options: [o('yes', 'Po, duhet të vlejnë ende', 'Yes, they must still hold'), o('no', 'Jo, mjafton që kanë ndodhur', 'No, it is enough that they happened')] },
    { id: 'sig_candle', screen: 'combine', type: 'single', req: true, unk: true, sq: 'A pret që candle të mbyllet para se të vendosësh?', hint: 'Kur candle mbyllet, sinjali nuk ndryshon më.', en: 'Signal evaluated on', options: [o('closed', 'Po, pres që candle të mbyllet', 'Closed candle'), o('forming', 'Jo, vendos sapo kushtet plotësohen, edhe para mbylljes', 'Forming (unclosed) candle')] },
    { id: 'mirror', screen: 'sell', type: 'single', req: true, sq: 'A është SELL e kundërta e saktë e BUY?', hint: 'E kundërta e saktë = çdo rregull përmbys: edhe hyrja, edhe Stop Loss, edhe Take Profit.', en: 'SELL is an exact mirror of BUY (entries and exits)', show: eq('sides', 'both'), options: [o('mirror', 'Po, saktësisht e kundërta', 'Yes, exact mirror including exits'), o('differs', 'Jo, SELL ndryshon', 'No, SELL differs')] },
    { id: 'sell_entry', screen: 'sell', type: 'textarea', req: true, sq: 'Si hap SELL?', en: 'SELL entry rules', show: eq('mirror', 'differs') },
    { id: 'sell_exits', screen: 'sell', type: 'single', req: true, sq: 'A ndryshojnë edhe Stop Loss, Take Profit ose menaxhimi për SELL?', en: 'SELL exits differ', show: eq('mirror', 'differs'), options: [o('same', 'Jo, janë si te BUY', 'No, same as BUY'), o('differ', 'Po, ndryshojnë', 'Yes, they differ')] },
    { id: 'sell_exits_text', screen: 'sell', type: 'textarea', req: true, sq: 'Si ndryshojnë për SELL?', en: 'SELL exit rules', show: eq('sell_exits', 'differ') },
    { id: 'own_words', screen: 'sell', type: 'textarea', opt: true, sq: 'Shpjegoje hyrjen me fjalët e tua, hap pas hapi', hint: 'Si t\'ia shpjegoje dikujt që s\'ka tregtuar kurrë.', en: 'Entry rule in the trader\'s own words' },

    { id: 'exe', screen: 'order', type: 'single', req: true, unk: true, sq: 'Kur plotësohen kushtet, si e hap trade-in?', hint: 'Menjëherë = me çmimin aktual. Pending order = urdhër që pret derisa çmimi të arrijë një nivel.', en: 'Order execution after signal confirmation', options: [o('market_close', 'Menjëherë, sapo mbyllet candle e sinjalit', 'Market order immediately at the close of the signal candle'), o('market_now', 'Menjëherë, pa pritur mbylljen e candle-s', 'Market order the moment conditions are met (intrabar)'), o('stop', 'Me pending order (stop) pak përtej candle-s së sinjalit', 'Stop order beyond the signal candle'), o('limit', 'Me pending order (limit) te një nivel', 'Limit order at a level')] },
    { id: 'pd_level', screen: 'order', type: 'text', req: true, sq: 'Ku e vendos pending order?', ex: 'mbi pikën më të lartë të candle-s së sinjalit', en: 'Pending order reference', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_dist', screen: 'order', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ larg asaj pike?', ex: '0.5', en: 'Pending order distance from reference', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_expiry', screen: 'order', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Nëse nuk hapet, pas sa candles e fshin?', ex: '3', en: 'Pending order expiry', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_dirchange', screen: 'order', type: 'single', req: true, unk: true, sq: 'Nëse ndryshon drejtimi i tregut:', en: 'Pending order when direction changes', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_opposite', screen: 'order', type: 'single', req: true, unk: true, sq: 'Nëse del sinjal në drejtimin tjetër:', en: 'Pending order on opposite signal', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_session', screen: 'order', type: 'single', req: true, unk: true, sq: 'Kur mbaron orari yt i tregtimit:', en: 'Pending order at end of trading hours', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_news', screen: 'order', type: 'single', req: true, unk: true, sq: 'Kur afrohet një lajm që e shmang:', en: 'Pending order before an avoided news event', show: all(inn('exe', ['stop', 'limit']), eq('news', 'yes')), options: KEEP_CANCEL },

    { id: 'new_signal', screen: 'repeat', type: 'single', req: true, unk: true, sq: 'Pasi mbyllet një trade, kur e quan sinjalin të ri?', hint: 'Ndonjëherë kushtet janë ende të plotësuara edhe pasi trade-i mbyllet.', en: 'Definition of a new signal', options: [o('reset', 'Kushtet duhet të prishen dhe të plotësohen sërish', 'Conditions must reset and form again'), o('new_candle', 'Çdo candle e re që i plotëson kushtet', 'Every new candle that meets the conditions')] },
    { id: 'entries_per_signal', screen: 'repeat', type: 'single', req: true, unk: true, sq: 'Sa trade-e hap për të njëjtin sinjal?', en: 'Entries allowed per signal', options: [o('1', 'Vetëm një', 'Only one'), o('more', 'Më shumë se një', 'More than one')] },
    { id: 'entries_n', screen: 'repeat', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa gjithsej?', en: 'Entries per signal', show: eq('entries_per_signal', 'more') },
    { id: 'cooldown', screen: 'repeat', type: 'single', req: true, unk: true, sq: 'Pasi mbyllet një trade, a pret pak para se të hapësh tjetrin?', en: 'Cooldown after a trade closes', options: [o('none', 'Jo', 'No cooldown'), o('candles', 'Po, disa candles', 'Yes, a number of candles'), o('minutes', 'Po, disa minuta', 'Yes, a number of minutes')] },
    { id: 'cooldown_n', screen: 'repeat', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', en: 'Cooldown candles', show: eq('cooldown', 'candles') },
    { id: 'cooldown_min', screen: 'repeat', type: 'number', req: true, num: 'int', unit: 'min', sq: 'Sa minuta?', en: 'Cooldown minutes', show: eq('cooldown', 'minutes') },
    { id: 'opposite', screen: 'repeat', type: 'single', req: true, unk: true, sq: 'Ke një BUY të hapur dhe shfaqet sinjal për SELL. Çfarë bën?', en: 'Opposite signal while a trade is open', show: eq('sides', 'both'), options: [o('ignore', 'Asgjë: e lë BUY-n deri te Stop Loss ose Take Profit', 'Ignore it, trade runs to SL/TP'), o('close', 'E mbyll BUY-n', 'Close the open trade only'), o('reverse', 'E mbyll BUY-n dhe hap SELL', 'Close and open the opposite trade')] },

    { id: 'skip', screen: 'skip', type: 'multi', req: true, unk: true, sq: 'A ka raste kur sinjali është aty, por ti nuk hyn?', en: 'Skip a valid signal when', options: [o('never', 'Jo, hyj gjithmonë', 'Never, always take valid signals'), o('far_ma', 'Kur çmimi është shumë larg një MA-je', 'Price too far from a MA'), o('big', 'Kur candle e sinjalit është shumë e madhe', 'Signal candle too big'), o('range', 'Kur tregu lëviz anash, pa drejtim', 'Market ranging'), o('level', 'Kur çmimi është afër një niveli të fortë', 'Too close to a strong level'), o('other', 'Tjetër', 'Other')] },
    { id: 'skip_far_ma_which', screen: 'skip', type: 'text', req: true, sq: 'Cila MA?', ex: 'EMA 50 në M15', en: 'Skip: which MA', show: has('skip', 'far_ma') },
    { id: 'skip_far_ma_usd', screen: 'skip', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa larg është "shumë larg"?', ex: '8', en: 'Skip: max distance from MA', show: has('skip', 'far_ma') },
    { id: 'skip_big_usd', screen: 'skip', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa e madhe është "shumë e madhe" (nga pika më e lartë te më e ulëta)?', ex: '10', en: 'Skip: max signal candle range', show: has('skip', 'big') },
    { id: 'skip_range', screen: 'skip', type: 'text', req: true, sq: 'Si e kupton që tregu lëviz anash?', ex: 'EMA 50 dhe EMA 200 janë brenda 2$ nga njëra-tjetra', en: 'Skip: ranging market definition', show: has('skip', 'range') },
    { id: 'skip_level', screen: 'skip', type: 'text', req: true, sq: 'Cili nivel?', ex: 'pika më e lartë ose më e ulët e ditës së kaluar', en: 'Skip: which strong level', show: has('skip', 'level') },
    { id: 'skip_level_usd', screen: 'skip', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Nuk hyn kur je brenda sa $ prej tij?', ex: '3', en: 'Skip: distance to strong level', show: has('skip', 'level') },
    { id: 'skip_other', screen: 'skip', type: 'text', req: true, sq: 'Cili rast tjetër, me numra?', en: 'Skip: other case', show: has('skip', 'other') },
    { id: 'spread_filter', screen: 'skip', type: 'single', req: true, unk: true, sq: 'A duhet të mos hyjë roboti kur spread-i është shumë i lartë?', hint: 'Spread = diferenca mes çmimit të blerjes dhe të shitjes. Zakonisht rritet gjatë lajmeve dhe rreth mesnatës.', en: 'Max spread filter', options: [o('dev', 'Po, vlerën le ta vendosë zhvilluesi', 'Yes, developer sets a value for XAUUSD.r'), o('value', 'Po, kam një vlerë', 'Yes, trader value'), o('no', 'Jo, nuk e përdor', 'No spread filter')] },
    { id: 'spread_value', screen: 'skip', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Spread-i maksimal', ex: '0.40', en: 'Max spread', show: eq('spread_filter', 'value') },
    { id: 'spread_block', screen: 'skip', type: 'single', req: true, unk: true, sq: 'Nëse spread-i është i lartë kur del sinjali:', en: 'When spread blocks entry', show: inn('spread_filter', ['dev', 'value']), options: [o('cancel', 'Sinjali anulohet', 'Signal is cancelled'), o('wait', 'Roboti pret derisa spread-i të bjerë', 'Wait for spread to drop')] },
    { id: 'spread_wait', screen: 'skip', type: 'number', req: true, unk: true, num: 'int', unit: 'min', sq: 'Pret maksimum sa minuta?', ex: '5', en: 'Max wait for spread', show: eq('spread_block', 'wait') },
    { id: 'spread_wait_valid', screen: 'skip', type: 'single', req: true, unk: true, sq: 'Pas pritjes, hyn vetëm nëse kushtet janë ende të plotësuara?', en: 'After waiting, conditions must still hold', show: eq('spread_block', 'wait'), options: [o('yes', 'Po', 'Yes, conditions must still hold'), o('no', 'Jo, hyn gjithsesi', 'No, enter anyway')] },

    // ---------- Kur e mbyll? ----------
    { id: 'sl_method', screen: 'sl', type: 'single', req: true, unk: true, sq: 'Ku e vendos Stop Loss?', en: 'Stop loss placement', options: [o('swing', 'Pak përtej majës ose gropës së fundit', 'Beyond the last swing low/high'), o('signal_candle', 'Pak përtej candle-s së sinjalit', 'Beyond the signal candle low/high'), o('fixed', 'Në një distancë fikse nga hyrja', 'Fixed distance'), o('atr', 'Sipas ATR (indikator që mat sa lëviz tregu)', 'ATR-based'), o('other', 'Tjetër', 'Other')] },
    { id: 'sl_sw_def', screen: 'sl', type: 'single', req: true, unk: true, sq: 'Si e gjen gropën (për BUY) ose majën (për SELL)?', en: 'SL swing definition', show: eq('sl_method', 'swing'), options: [o('lowest_n', 'Pika më e ulët e disa candles të fundit', 'Lowest low of the last N candles'), o('fractal', 'Gropa e konfirmuar me candles në të dy anët', 'Confirmed swing (fractal) with N candles each side')] },
    { id: 'sl_sw_n', screen: 'sl', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', ex: '10', en: 'SL swing candles', show: inn('sl_sw_def', ['lowest_n', 'fractal']) },
    { id: 'sl_sw_buf', screen: 'sl', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej saj?', ex: '1', en: 'SL buffer beyond swing', show: eq('sl_method', 'swing') },
    { id: 'sl_sc_buf', screen: 'sl', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej candle-s?', ex: '0.5', en: 'SL buffer beyond signal candle', show: eq('sl_method', 'signal_candle') },
    { id: 'sl_fixed', screen: 'sl', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ larg hyrjes?', hint: 'Kjo është lëvizje e çmimit të arit, jo para. Shembull: 5$ = nga 2650.00 në 2645.00.', en: 'SL fixed distance', show: eq('sl_method', 'fixed') },
    { id: 'sl_atr_period', screen: 'sl', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e ATR', ex: '14', en: 'SL ATR period', show: eq('sl_method', 'atr'), row: 'slatr' },
    { id: 'sl_atr_mult', screen: 'sl', type: 'number', req: true, num: 'pos', unit: 'mult', sq: 'Shumëzuesi', ex: '1.5', en: 'SL ATR multiplier', show: eq('sl_method', 'atr'), row: 'slatr' },
    { id: 'sl_atr_tf', screen: 'sl', type: 'single', req: true, sq: 'Timeframe i ATR', en: 'SL ATR timeframe', show: eq('sl_method', 'atr'), options: TF_SAME },
    { id: 'sl_other', screen: 'sl', type: 'text', req: true, sq: 'Si e vendos saktë?', en: 'SL (own words)', show: eq('sl_method', 'other') },
    { id: 'sl_max', screen: 'sl', type: 'single', req: true, unk: true, sq: 'Nëse Stop Loss del shumë larg, a e anashkalon trade-in?', en: 'Skip trade if SL is too large', options: [o('no', 'Jo, hyj gjithsesi', 'No, always take the trade'), o('yes', 'Po', 'Yes')] },
    { id: 'sl_max_usd', screen: 'sl', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Mbi sa $ larg?', ex: '15', en: 'Max SL distance', show: eq('sl_max', 'yes') },

    { id: 'tp_method', screen: 'tp', type: 'single', req: true, unk: true, sq: 'Si e vendos Take Profit?', en: 'Take profit method', options: [o('r', 'Disa herë më larg se Stop Loss (p.sh. 1:2)', 'Multiple of the initial risk (R)'), o('level', 'Te një nivel në grafik', 'At a price level')] },
    { id: 'tp_r', screen: 'tp', type: 'single', req: true, sq: 'Sa herë më larg se Stop Loss?', en: 'Take profit multiple', show: eq('tp_method', 'r'), options: [o('2', '2 herë (1:2)', '2R'), o('3', '3 herë (1:3)', '3R'), o('custom', 'Tjetër', 'Custom'), o('depends', 'Varet nga situata', 'Depends on conditions')] },
    { id: 'tp_r_custom', screen: 'tp', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Sa herë saktë?', ex: '2.5', en: 'Take profit multiple (custom)', show: eq('tp_r', 'custom') },
    { id: 'tp_depends', screen: 'tp', type: 'text', req: true, unk: true, sq: 'Kur zgjedh cilën?', ex: '1:3 kur tregu po ngrihet fort në H4, përndryshe 1:2', en: 'Take profit selection rule', show: eq('tp_r', 'depends') },
    { id: 'tp_level', screen: 'tp', type: 'text', req: true, sq: 'Cili nivel?', ex: 'pika më e lartë e ditës së kaluar', en: 'Take profit level', show: eq('tp_method', 'level') },

    { id: 'mg_be', screen: 'be', type: 'single', req: true, unk: true, sq: 'A e zhvendos Stop Loss te çmimi ku hape trade-in?', hint: 'Kështu, nëse çmimi kthehet, trade-i mbyllet pa humbje.', en: 'Break-even', options: [o('no', 'Jo, nuk e bëj', 'No (not used)'), o('yes', 'Po', 'Yes')] },
    { id: 'be_trigger', screen: 'be', type: 'single', req: true, sq: 'Kur e zhvendos?', en: 'Break-even trigger', show: eq('mg_be', 'yes'), options: [o('r', 'Kur fitimi arrin sa distanca e Stop Loss, ose disa herë më shumë', 'When profit reaches X R'), o('usd', 'Kur çmimi lëviz disa $ në favorin tim', 'When price moves X USD in profit')] },
    { id: 'be_trigger_r', screen: 'be', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Pas sa R?', hint: '1R = fitimi është sa distanca e Stop Loss.', ex: '1', en: 'Break-even trigger (R)', show: eq('be_trigger', 'r') },
    { id: 'be_trigger_usd', screen: 'be', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Pas sa $ lëvizje?', ex: '5', en: 'Break-even trigger (USD move)', show: eq('be_trigger', 'usd') },
    { id: 'be_level', screen: 'be', type: 'single', req: true, unk: true, sq: 'Saktësisht ku e vendos?', en: 'New SL level at break-even', show: eq('mg_be', 'yes'), options: [o('entry', 'Saktë te çmimi i hyrjes', 'Exactly at entry'), o('entry_costs', 'Pak përtej, që të mbulohen kostot (spread, komision)', 'Entry plus costs (spread, commission)'), o('entry_plus', 'Disa $ përtej hyrjes', 'Entry plus a USD amount')] },
    { id: 'be_plus', screen: 'be', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ përtej?', ex: '0.5', en: 'Break-even offset', show: eq('be_level', 'entry_plus') },

    { id: 'mg_partial', screen: 'partial', type: 'single', req: true, unk: true, sq: 'A mbyll një pjesë të trade-it përpara se të arrijë Take Profit?', en: 'Partial close', options: [o('no', 'Jo, nuk e bëj', 'No (not used)'), o('yes', 'Po', 'Yes')] },
    { id: 'pc1_r', screen: 'partial', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Mbyllja e parë: kur?', ex: '1 (kur fitimi = sa Stop Loss)', en: 'Partial 1 at (R)', show: eq('mg_partial', 'yes'), row: 'pc1' },
    { id: 'pc1_pct', screen: 'partial', type: 'number', req: true, num: 'pct', unit: 'pctv', sq: 'Sa % mbyll?', ex: '50', en: 'Partial 1 size', show: eq('mg_partial', 'yes'), row: 'pc1' },
    { id: 'pc2_r', screen: 'partial', type: 'number', opt: true, num: 'pos', unit: 'r', sq: 'Mbyllja e dytë: kur?', en: 'Partial 2 at (R)', show: eq('mg_partial', 'yes'), row: 'pc2', pair: 'pc2_pct' },
    { id: 'pc2_pct', screen: 'partial', type: 'number', opt: true, num: 'pct', unit: 'pctv', sq: 'Sa % mbyll?', en: 'Partial 2 size', show: eq('mg_partial', 'yes'), row: 'pc2', pair: 'pc2_r' },
    { id: 'pc_base', screen: 'partial', type: 'single', req: true, unk: true, sq: 'Përqindja llogaritet nga:', en: 'Partial % based on', show: eq('mg_partial', 'yes'), options: [o('initial', 'Madhësia fillestare e trade-it', 'Initial volume'), o('remaining', 'Ajo që ka mbetur', 'Remaining volume')] },
    { id: 'pc_rest', screen: 'partial', type: 'single', req: true, unk: true, sq: 'Pjesa që mbetet:', en: 'Remaining volume after partial', show: eq('mg_partial', 'yes'), options: [o('tp', 'Vazhdon deri te Take Profit ose Stop Loss', 'Runs to TP or SL'), o('be', 'Stop Loss shkon te hyrja', 'SL moves to break-even'), o('trail', 'Ndiqet me trailing stop', 'Managed by trailing stop')] },

    { id: 'mg_trail', screen: 'trail', type: 'single', req: true, unk: true, sq: 'A përdor Stop Loss që ndjek çmimin (trailing stop)?', en: 'Trailing stop', options: YES_NOTUSED },
    { id: 'tr_method', screen: 'trail', type: 'single', req: true, sq: 'Si e ndjek çmimin?', en: 'Trailing method', show: eq('mg_trail', 'yes'), options: [o('fixed', 'Në një distancë fikse në $', 'Fixed USD distance'), o('atr', 'Sipas ATR', 'ATR-based'), o('swing', 'Pas majës ose gropës së fundit', 'Behind the last swing'), o('candle', 'Pas candle-s së mëparshme', 'Behind the previous candle')] },
    { id: 'tr_dist', screen: 'trail', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ pas çmimit?', ex: '5', en: 'Trailing distance', show: eq('tr_method', 'fixed') },
    { id: 'tr_atr', screen: 'trail', type: 'text', req: true, sq: 'Periudha dhe shumëzuesi i ATR', ex: 'ATR 14 × 2', en: 'Trailing ATR settings', show: eq('tr_method', 'atr') },
    { id: 'tr_swing_n', screen: 'trail', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles në secilën anë e konfirmojnë gropën?', ex: '3', en: 'Trailing swing candles', show: eq('tr_method', 'swing') },
    { id: 'tr_buf', screen: 'trail', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej?', ex: '0.5', en: 'Trailing buffer', show: inn('tr_method', ['swing', 'candle']) },
    { id: 'tr_activate', screen: 'trail', type: 'single', req: true, unk: true, sq: 'Kur fillon të lëvizë?', en: 'Trailing activation', show: eq('mg_trail', 'yes'), options: [o('immediate', 'Menjëherë pas hyrjes', 'Immediately'), o('r', 'Kur fitimi arrin disa R', 'At X R profit'), o('usd', 'Kur çmimi lëviz disa $ në favorin tim', 'After X USD in profit')] },
    { id: 'tr_act_r', screen: 'trail', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Pas sa R?', ex: '1', en: 'Trailing activation (R)', show: eq('tr_activate', 'r') },
    { id: 'tr_act_usd', screen: 'trail', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Pas sa $?', ex: '5', en: 'Trailing activation (USD)', show: eq('tr_activate', 'usd') },
    { id: 'tr_step', screen: 'trail', type: 'number', opt: true, num: 'nonneg', unit: 'usd', sq: 'Me çfarë hapi lëviz?', hint: 'Lëre bosh nëse lëviz me çdo përmirësim të çmimit.', en: 'Trailing step', show: eq('mg_trail', 'yes') },
    { id: 'tr_freq', screen: 'trail', type: 'single', req: true, unk: true, sq: 'Sa shpesh përditësohet?', en: 'Trailing update frequency', show: eq('mg_trail', 'yes'), options: [o('tick', 'Me çdo lëvizje të çmimit', 'Every tick'), o('candle', 'Kur mbyllet çdo candle', 'On each candle close')] },
    { id: 'mg_priority', screen: 'trail', type: 'text', req: true, unk: true, sq: 'Nëse disa nga këto ndodhin në të njëjtën kohë, cila vjen e para?', ex: 'fillimisht mbyll pjesën, pastaj Stop Loss te hyrja, pastaj trailing', en: 'Priority between management rules', show: { countYes: ['mg_be', 'mg_partial', 'mg_trail'], gt: 1 } },

    // ---------- Sa do të rrezikosh? ----------
    { id: 'account_ccy', screen: 'account', type: 'single', req: true, unk: true, verify: 'dev', sq: 'Në cilën monedhë është llogaria?', hint: 'E sheh te MT5, poshtë te Toolbox, pranë Balance.', en: 'Account currency', options: [o('USD', 'USD'), o('EUR', 'EUR'), o('other', 'Tjetër', 'Other')] },
    { id: 'account_ccy_other', screen: 'account', type: 'text', req: true, sq: 'Cila monedhë?', ex: 'GBP', max: 10, en: 'Account currency (other)', show: eq('account_ccy', 'other') },
    { id: 'capital', screen: 'account', type: 'number', req: true, unk: true, num: 'pos', unit: 'ccy', sq: 'Me sa para planifikon ta përdorësh robotin?', hint: 'Shuma në llogari që do të përdorë roboti.', en: 'Planned trading capital' },
    { id: 'account_kind', screen: 'account', type: 'single', req: true, unk: true, sq: 'Llogaria është:', en: 'Account kind', options: [o('personal', 'Personale', 'Personal'), o('prop', 'Prop firm (llogari e financuar nga një kompani)', 'Prop firm')] },
    { id: 'prop_name', screen: 'account', type: 'text', req: true, sq: 'Cila prop firm?', en: 'Prop firm', show: eq('account_kind', 'prop') },
    { id: 'prop_daily', screen: 'account', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Humbja maksimale në ditë që lejon', en: 'Prop firm daily loss limit', show: eq('account_kind', 'prop'), row: 'prop' },
    { id: 'prop_maxdd', screen: 'account', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Humbja maksimale gjithsej që lejon', en: 'Prop firm max drawdown', show: eq('account_kind', 'prop'), row: 'prop' },
    { id: 'prop_rules', screen: 'account', type: 'textarea', opt: true, sq: 'Rregulla të tjera të prop firm-ës', ex: 'pa trade-e gjatë lajmeve, pa trade-e të hapura në fundjavë', en: 'Other prop firm rules', show: eq('account_kind', 'prop') },
    { id: 'other_trading', screen: 'account', type: 'single', req: true, unk: true, sq: 'A hap trade-e dikush ose diçka tjetër në të njëjtën llogari?', en: 'Other trading on the same account', options: [o('none', 'Jo, vetëm roboti', 'No, only this EA'), o('manual', 'Po, edhe unë me dorë', 'Yes, manual trades'), o('robots', 'Po, robotë të tjerë', 'Yes, other EAs'), o('both', 'Po, të dyja', 'Yes, manual trades and other EAs')] },

    { id: 'size_method', screen: 'size', type: 'single', req: true, unk: true, sq: 'Si ta vendosë roboti madhësinë e çdo trade-i?', hint: 'Roboti përdor vetëm një nga këto mënyra. Kufijtë e tjerë të riskut vlejnë gjithsesi.', en: 'Position sizing method (only one active)', options: [
      o('fixed_lot', 'Lot fiks: e njëjta madhësi në çdo trade', 'Fixed lot: same volume on every trade'),
      o('risk_pct', 'Përqindje e llogarisë: humbja në Stop Loss është gjithmonë e njëjta % e llogarisë', 'Risk %: volume computed from the chosen % and the SL distance'),
      o('risk_money', 'Shumë fikse në para: humbja në Stop Loss është gjithmonë e njëjta shumë', 'Fixed money risk: volume computed from a fixed amount risked to the SL')] },
    { id: 'size_info_fixed', screen: 'size', type: 'info', sq: 'Kujdes me lot fiks', text: 'Me lot fiks, humbja ndryshon nga trade në trade, sepse varet nga sa larg është Stop Loss. Shembull: 0.10 lot humbet rreth 50 USD kur Stop Loss është 5$ larg, por rreth 100 USD kur është 10$ larg.', show: eq('size_method', 'fixed_lot') },
    { id: 'size_info_pct', screen: 'size', type: 'info', sq: 'Si funksionon', text: 'Roboti zgjedh lot-in që humbja në Stop Loss të jetë përqindja që shkruan, pavarësisht sa larg është Stop Loss. Shembull: me 10,000 USD në llogari dhe 0.5%, humbja në Stop Loss do të ishte rreth 50 USD.', show: eq('size_method', 'risk_pct') },
    { id: 'size_info_money', screen: 'size', type: 'info', sq: 'Si funksionon', text: 'Roboti zgjedh lot-in që humbja në Stop Loss të jetë shuma që shkruan. Kjo është shumë në para, jo lëvizje e çmimit të arit.', show: eq('size_method', 'risk_money') },
    { id: 'lot_fixed', screen: 'size', type: 'number', req: true, num: 'pos', unit: 'lot', sq: 'Sa lot për çdo trade?', ex: '0.10', en: 'Fixed lot per trade', show: eq('size_method', 'fixed_lot') },
    { id: 'risk_pct', screen: 'size', type: 'number', req: true, num: 'pct', unit: 'pct', fact: 'risk', sq: 'Sa % e llogarisë humbet një trade që mbyllet në Stop Loss?', en: 'Risk per trade', show: eq('size_method', 'risk_pct') },
    { id: 'risk_base', screen: 'size', type: 'single', req: true, unk: true, sq: 'Përqindja llogaritet nga:', en: 'Risk % calculated from', show: eq('size_method', 'risk_pct'), options: [o('balance', 'Balance: paratë në llogari, pa trade-et e hapura', 'Balance'), o('equity', 'Equity: balance plus ose minus fitimi/humbja e trade-eve të hapura', 'Equity')] },
    { id: 'risk_money', screen: 'size', type: 'number', req: true, num: 'pos', unit: 'ccy', sq: 'Sa para humbet një trade që mbyllet në Stop Loss?', en: 'Fixed money risk per trade', show: eq('size_method', 'risk_money') },
    { id: 'lot_cap', screen: 'size', type: 'single', req: true, unk: true, sq: 'A do një kufi maksimal për madhësinë e trade-it?', en: 'Maximum lot per trade', options: [o('no', 'Jo', 'No cap (broker maximum still applies)'), o('yes', 'Po', 'Yes')] },
    { id: 'lot_cap_value', screen: 'size', type: 'number', req: true, num: 'pos', unit: 'lot', sq: 'Maksimumi', ex: '0.50', en: 'Max lot per trade', show: eq('lot_cap', 'yes') },
    { id: 'size_conflict', screen: 'size', type: 'single', req: true, unk: true, sq: 'Nëse madhësia e llogaritur kalon një kufi, roboti:', hint: 'Roboti nuk e rrit kurrë madhësinë mbi riskun e lejuar dhe e shënon çdo ndryshim.', en: 'When the requested size conflicts with a risk or broker limit', options: [o('skip', 'E anashkalon trade-in', 'Skip the trade'), o('reduce', 'E zvogëlon deri te kufiri', 'Reduce the volume down to the allowed limit')] },

    { id: 'max_trades', screen: 'limits', type: 'number', req: true, num: 'int', unit: 'count', fact: 'maxtrades', sq: 'Sa trade-e në ditë, maksimumi?', en: 'Max trades per day' },
    { id: 'max_open', screen: 'limits', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa trade-e mund të jenë të hapura në të njëjtën kohë?', en: 'Max positions open at the same time' },
    { id: 'combined_risk', screen: 'limits', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Sa % e llogarisë mund të jetë në risk gjithsej për trade-et e hapura njëkohësisht?', en: 'Max combined risk of open positions', show: { q: 'max_open', gt: 1 } },
    { id: 'count_partial', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Një trade që mbyllet me pjesë numërohet si:', en: 'Partially closed trade counts as', show: eq('mg_partial', 'yes'), options: [o('one', 'Një trade', 'One trade'), o('each', 'Çdo pjesë si trade më vete', 'Each partial close counts as a trade')] },
    { id: 'after_win', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Nëse trade-i i parë i ditës fiton, a vazhdon atë ditë?', en: 'After a winning trade', options: [o('continue', 'Po, deri te maksimumi i ditës', 'Keep trading up to the daily max'), o('stop', 'Jo, ndalem', 'Stop for the day after a win')] },
    { id: 'loss_stop', screen: 'limits', type: 'single', req: true, unk: true, sq: 'A ndalon pas disa humbjeve atë ditë?', en: 'Stop after losses', options: [o('none', 'Jo', 'No'), o('consecutive', 'Po, pas disa humbjeve radhazi', 'Yes, after consecutive losses'), o('total', 'Po, pas disa humbjeve gjithsej', 'Yes, after total losses in the day')] },
    { id: 'loss_stop_n', screen: 'limits', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Pas sa humbjeve?', en: 'Losses before stopping', show: inn('loss_stop', ['consecutive', 'total']) },
    { id: 'be_counts', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Një trade që mbyllet te hyrja (pa fitim, pa humbje) quhet:', en: 'Break-even close counts as', show: all(inn('loss_stop', ['consecutive', 'total']), eq('mg_be', 'yes')), options: [o('neutral', 'As fitim, as humbje', 'Neither win nor loss'), o('loss', 'Humbje', 'Loss'), o('win', 'Fitim', 'Win')] },
    { id: 'daily_loss', screen: 'limits', type: 'single', req: true, unk: true, sq: 'A ka një kufi humbjeje për ditë, në %?', en: 'Daily loss limit', options: YES_NOTUSED },
    { id: 'dl_pct', screen: 'limits', type: 'number', req: true, num: 'pct', unit: 'pct', sq: 'Sa %?', en: 'Daily loss limit', show: eq('daily_loss', 'yes') },
    { id: 'dl_base', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Llogaritet nga:', en: 'Daily limit base', show: eq('daily_loss', 'yes'), options: [o('balance_start', 'Balance në fillim të ditës', 'Balance at start of day'), o('equity_start', 'Equity në fillim të ditës', 'Equity at start of day')] },
    { id: 'dl_floating', screen: 'limits', type: 'single', req: true, unk: true, sq: 'A llogarit edhe humbjen e trade-eve ende të hapura?', en: 'Daily limit includes floating losses', show: eq('daily_loss', 'yes'), options: [o('yes', 'Po', 'Yes, includes open positions'), o('no', 'Jo, vetëm trade-et e mbyllura', 'No, closed trades only')] },
    { id: 'dl_scope', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Vlen për:', en: 'Daily limit scope', show: eq('daily_loss', 'yes'), options: [o('robot', 'Vetëm trade-et e robotit', 'This EA only'), o('account', 'Gjithë llogarinë', 'Whole account')] },
    { id: 'dl_action', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Kur arrihet ky kufi, roboti:', en: 'Action when daily limit is hit', show: eq('daily_loss', 'yes'), options: [o('stop', 'Nuk hap trade-e të reja', 'Stops new entries'), o('stop_cancel', 'Nuk hap të reja dhe fshin pending orders', 'Stops entries and cancels pending orders'), o('stop_cancel_close', 'Mbyll edhe trade-et e hapura', 'Stops entries, cancels pending orders and closes open positions')] },
    { id: 'day_reset', screen: 'limits', type: 'single', req: true, unk: true, sq: 'Kur fillon "dita e re" për këto kufij?', en: 'Daily reset time', options: [o('albania', 'Në mesnatë, ora e Shqipërisë', 'Midnight, Albania time (Europe/Tirane)'), o('server', 'Në mesnatë, ora e serverit të Tauro (ora e MT5)', 'Midnight, broker server time'), o('other', 'Në një orë tjetër', 'Other time')] },
    { id: 'day_reset_other', screen: 'limits', type: 'text', req: true, sq: 'Në cilën orë dhe sipas cilës zonë kohore?', ex: '08:00, ora e Shqipërisë', en: 'Daily reset (other)', show: eq('day_reset', 'other') },

    // ---------- Në cilat orare tregton? ----------
    { id: 'days', screen: 'hours', type: 'multi', req: true, sq: 'Në cilat ditë tregton?', en: 'Trading days', options: [o('mon', 'E hënë', 'Mon'), o('tue', 'E martë', 'Tue'), o('wed', 'E mërkurë', 'Wed'), o('thu', 'E enjte', 'Thu'), o('fri', 'E premte', 'Fri')] },
    { id: 't_from', screen: 'hours', type: 'time', req: true, unk: true, sq: 'Nga ora', en: 'Trading hours from', row: 'hours' },
    { id: 't_to', screen: 'hours', type: 'time', req: true, unk: true, sq: 'Deri në orën', en: 'Trading hours to', row: 'hours' },
    { id: 't_tz', screen: 'hours', type: 'single', req: true, unk: true, sq: 'Këto orë janë sipas orës së:', en: 'Timezone of trading hours', options: [o('albania', 'Shqipërisë', 'Albania time (Europe/Tirane)'), o('utc', 'UTC', 'UTC'), o('ny', 'New York-ut', 'New York time'), o('server', 'Serverit të Tauro (ora e MT5)', 'Broker server time')] },
    { id: 't_dst', screen: 'hours', type: 'single', req: true, unk: true, sq: 'Kur ndërrohet ora verore/dimërore:', en: 'DST handling', show: { q: 't_tz', nin: ['utc', UNKNOWN] }, options: [o('follow', 'Oraret mbeten të njëjta sipas orës lokale', 'Hours follow local clock (DST-aware)'), o('fixed', 'Oraret mbeten fikse sipas UTC', 'Hours stay fixed in UTC all year')] },
    { id: 'end_positions', screen: 'hours', type: 'single', req: true, unk: true, sq: 'Kur mbaron orari, çfarë bën me trade-et e hapura?', en: 'Open positions at end of trading hours', options: [o('keep', 'I lë deri te Stop Loss ose Take Profit', 'Keep until SL/TP'), o('close', 'I mbyll', 'Close them')] },
    { id: 'friday', screen: 'hours', type: 'single', req: true, unk: true, sq: 'A i mbyll të gjitha para fundjavës?', en: 'Close before the weekend', options: [o('no', 'Jo', 'No'), o('yes', 'Po', 'Yes')] },
    { id: 'friday_time', screen: 'hours', type: 'time', req: true, sq: 'Të premten në orën:', hint: 'Sipas të njëjtës orë si më lart.', en: 'Friday close time', show: eq('friday', 'yes') },
    { id: 'friday_pending', screen: 'hours', type: 'single', req: true, sq: 'Edhe pending orders?', en: 'Friday: pending orders', show: all(eq('friday', 'yes'), inn('exe', ['stop', 'limit'])), options: [o('cancel', 'Po, i fshin', 'Cancel them'), o('keep', 'Jo, i lë', 'Keep them')] },

    { id: 'news', screen: 'news', type: 'single', req: true, unk: true, sq: 'A e shmang tregtimin gjatë lajmeve të mëdha ekonomike?', hint: 'Shembuj: NFP, CPI, vendimet e Fed-it për normat e interesit.', en: 'News filter', options: [o('no', 'Jo, nuk i shmang', 'No (not used)'), o('yes', 'Po', 'Yes')] },
    { id: 'news_events', screen: 'news', type: 'multi', req: true, sq: 'Cilat lajme?', en: 'News events avoided', show: eq('news', 'yes'), options: [o('nfp', 'NFP'), o('cpi', 'CPI'), o('fomc', 'FOMC dhe vendimi i Fed-it', 'FOMC / Fed rate decision'), o('usd_high', 'Çdo lajm i rëndësishëm i USD', 'All high-impact USD news'), o('other', 'Tjetër', 'Other')] },
    { id: 'news_other', screen: 'news', type: 'text', req: true, sq: 'Cilat të tjera?', en: 'Other news events', show: has('news_events', 'other') },
    { id: 'news_before', screen: 'news', type: 'number', req: true, num: 'nonneg', unit: 'min', sq: 'Sa minuta para?', ex: '30', en: 'Minutes before news', show: eq('news', 'yes'), row: 'news' },
    { id: 'news_after', screen: 'news', type: 'number', req: true, num: 'nonneg', unit: 'min', sq: 'Sa minuta pas?', ex: '30', en: 'Minutes after news', show: eq('news', 'yes'), row: 'news' },
    { id: 'news_open', screen: 'news', type: 'single', req: true, unk: true, sq: 'Trade-et e hapura para lajmit:', en: 'Open positions before news', show: eq('news', 'yes'), options: [o('keep', 'I lë', 'Keep'), o('close', 'I mbyll', 'Close before the news'), o('be', 'E çoj Stop Loss te hyrja', 'Move SL to break-even')] },
    { id: 'push', screen: 'news', type: 'single', req: true, sq: 'A do njoftim në telefon kur roboti hap ose mbyll një trade?', en: 'Phone push notifications', options: [o('yes', 'Po', 'Yes'), o('no', 'Jo', 'No')] },

    // ---------- Na trego disa shembuj. ----------
    { id: 'tv_feed', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Cilin grafik ari ke përdorur në TradingView?', hint: 'Shkruhet lart majtas në grafik.', en: 'TradingView gold chart', options: [o('oanda', 'OANDA:XAUUSD'), o('fxcm', 'FXCM / FX:XAUUSD'), o('tvc', 'TVC:GOLD'), o('other', 'Tjetër', 'Other')] },
    { id: 'tv_feed_other', screen: 'backtest', type: 'text', req: true, sq: 'Si quhet saktë?', ex: 'PEPPERSTONE:XAUUSD', en: 'TradingView chart (other)', show: eq('tv_feed', 'other') },
    { id: 'tv_tz', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Në cilën orë e ke grafikun në TradingView?', hint: 'Shkruhet poshtë djathtas në grafik.', en: 'TradingView chart timezone', options: [o('albania', 'Ora e Shqipërisë', 'Albania (Europe/Tirane)'), o('utc', 'UTC'), o('ny', 'New York')] },
    { id: 'candle_type', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Çfarë lloj candles ke përdorur?', en: 'Candle type in backtest', options: [o('standard', 'Candles të zakonshme', 'Standard candlesticks'), o('ha', 'Heikin Ashi'), o('other', 'Tjetër', 'Other')] },
    { id: 'candle_type_other', screen: 'backtest', type: 'text', req: true, sq: 'Cilat?', en: 'Candle type (other)', show: eq('candle_type', 'other') },
    { id: 'bt_from', screen: 'backtest', type: 'date', req: true, unk: true, sq: 'Testi nga data', en: 'Backtest from', row: 'btdates' },
    { id: 'bt_to', screen: 'backtest', type: 'date', req: true, unk: true, sq: 'deri më', en: 'Backtest to', row: 'btdates' },
    { id: 'bt_trades', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Sa trade-e dolën gjithsej?', en: 'Trades in backtest', options: [o('lt20', 'Nën 20', 'Under 20'), o('20_40', '20–40'), o('40_60', '40–60'), o('gt60', 'Mbi 60', 'Over 60'), o('exact', 'E di numrin e saktë', 'Exact number')] },
    { id: 'bt_trades_n', screen: 'backtest', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa saktë?', en: 'Trades in backtest (exact)', show: eq('bt_trades', 'exact') },
    { id: 'bt_winrate', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Sa prej tyre fituan, afërsisht?', en: 'Win rate in backtest', options: [o('lt45', 'Nën 45%', 'Under 45%'), o('45_50', '45–50%'), o('50_55', '50–55%'), o('55_60', '55–60%'), o('gt60', 'Mbi 60%', 'Over 60%'), o('exact', 'E di përqindjen e saktë', 'Exact value')] },
    { id: 'bt_winrate_n', screen: 'backtest', type: 'number', req: true, num: 'pct', unit: 'pct', sq: 'Sa % saktë?', en: 'Win rate (exact)', show: eq('bt_winrate', 'exact') },
    { id: 'bt_same_candle', screen: 'backtest', type: 'single', req: true, unk: true, sq: 'Kur në të njëjtën candle preknin edhe Stop Loss edhe Take Profit, si e numërove?', en: 'SL and TP hit in the same candle (manual backtest)', options: [o('loss', 'Si humbje', 'Counted as loss'), o('win', 'Si fitim', 'Counted as win'), o('lower_tf', 'E kontrollova në timeframe më të vogël', 'Checked on a lower timeframe'), o('never', 'Nuk ndodhi asnjëherë', 'Never happened')] },
    { id: 'bt_records', screen: 'backtest', type: 'single', req: true, sq: 'A i ke shënuar trade-et diku?', en: 'Backtest trades recorded', options: [o('sheet', 'Po, në Excel ose Sheets', 'Yes, in a spreadsheet (can be shared)'), o('chart', 'Po, në grafik', 'Yes, marked on TradingView'), o('none', 'Jo', 'Not recorded')] },

    { id: 'examples', screen: 'examples', type: 'examples', req: true, sq: 'Shembuj', en: 'Examples' },
    { id: 'settings_photos', screen: 'examples', type: 'settings', sq: 'Foto të cilësimeve të indikatorëve', en: 'Indicator settings photos' },

    { id: 'acc_period', screen: 'acceptance', type: 'single', req: true, sq: 'Në cilën periudhë ta krahasojmë robotin me testin tënd?', en: 'Comparison period', options: [o('same', 'Në të njëjtën periudhë si testi im', 'Same period as the trader backtest'), o('other', 'Në një periudhë tjetër', 'Other period')] },
    { id: 'acc_period_text', screen: 'acceptance', type: 'text', req: true, sq: 'Cila periudhë?', en: 'Comparison period (other)', show: eq('acc_period', 'other') },
    { id: 'acc_costs', screen: 'acceptance', type: 'single', req: true, unk: true, sq: 'A ta bëjmë krahasimin me kostot reale të Tauro?', hint: 'Kosto = spread dhe komision. TradingView zakonisht nuk i llogarit.', en: 'Costs in comparison', options: [o('real', 'Po, me spread-in dhe komisionin real', 'With real Tauro spread and commission'), o('none', 'Jo, pa kosto, si në TradingView', 'Without costs, as on TradingView')] },
    { id: 'acc_entry_tol', screen: 'acceptance', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ mund të ndryshojë çmimi i hyrjes së robotit nga i yti?', hint: 'TradingView dhe Tauro nuk kanë saktësisht të njëjtat çmime.', ex: '0.5', en: 'Accepted entry price deviation' },
    { id: 'acc_time_tol', screen: 'acceptance', type: 'single', req: true, unk: true, sq: 'Hyrja e robotit duhet të jetë:', en: 'Accepted entry time deviation', options: [o('same_candle', 'Në të njëjtën candle si e jotja', 'Same candle'), o('one_candle', 'Brenda 1 candle-s', 'Within 1 candle')] },
    { id: 'acc_match', screen: 'acceptance', type: 'single', req: true, unk: true, sq: 'Sa nga trade-et e tua duhet t\'i hapë edhe roboti?', en: 'Required trade match', options: [o('all', 'Të gjitha', 'All trades'), o('explained', 'Të gjitha, përveç dallimeve që shpjegohen nga çmimet ose kostot', 'All, except differences explained by price feed or costs')] },
    { id: 'notes', screen: 'acceptance', type: 'textarea', opt: true, sq: 'Diçka tjetër që duhet ta dimë?', en: 'Other notes' }
  ];

  // Fushat e një shembulli
  var EX = [
    { id: 'kind', type: 'single', req: true, sq: 'Çfarë tregon ky shembull?', en: 'Type', options: [o('buy', 'Një trade BUY', 'BUY'), o('sell', 'Një trade SELL', 'SELL'), o('noentry', 'Një rast kur NUK hyra', 'Case where the EA must NOT enter')] },
    { id: 'result', type: 'single', req: true, sq: 'Si përfundoi?', en: 'Result', show: { ex: 'kind', in: ['buy', 'sell'] }, options: [o('win', 'Fitoi', 'Winner'), o('loss', 'Humbi', 'Loser')] },
    { id: 'date', type: 'date', req: true, sq: 'Data', en: 'Date', row: 'dt' },
    { id: 'time', type: 'time', sq: 'Ora e candle-s, nëse e di', en: 'Candle time', row: 'dt' },
    { id: 'tf', type: 'single', sq: 'Timeframe, nëse e mban mend', en: 'Timeframe', options: TF },
    { id: 'entry', type: 'number', num: 'pos', unit: 'price', sq: 'Çmimi i hyrjes', en: 'Entry price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'sl', type: 'number', num: 'pos', unit: 'price', sq: 'Stop Loss', en: 'Stop loss price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'tp', type: 'number', num: 'pos', unit: 'price', sq: 'Take Profit', en: 'Take profit price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'why', type: 'textarea', req: true, sq: 'Pse hyre, ose pse nuk hyre?', en: 'Explanation' },
    { id: 'photoNote', type: 'text', sq: 'Përshkrim i shkurtër i fotos', en: 'Photo description', photo: true }
  ];

  var SCREEN_SECTION = {};
  SCREENS.forEach(function (s) { SCREEN_SECTION[s.id] = s.section; });
  Q.forEach(function (q) { q.step = SCREEN_SECTION[q.screen]; });
  var STEPS = SECTIONS;

  var NON_ANSWER = { info: true, facts: true, examples: true, settings: true };
  var byId = {};
  Q.forEach(function (q) { byId[q.id] = q; });

  // ---------- Ndihmës ----------
  function isEmpty(v) {
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim() === '';
  }
  function parseNum(v) {
    if (v === undefined || v === null) return NaN;
    var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function isUnknownVal(state, id) {
    var a = state.answers || {};
    var q = byId[id];
    if (!q) return false;
    if (q.type === 'single') return a[id] === UNKNOWN;
    if (q.type === 'multi') return Array.isArray(a[id]) && a[id].indexOf(UNKNOWN) >= 0;
    return a['?' + id] === true;
  }
  function side(state) { return (state.answers || {}).sides === 'sell_only' ? 'SELL' : 'BUY'; }
  function fill(text, state) {
    var a = state.answers || {};
    return String(text || '').replace(/\{SIDE\}/g, side(state)).replace(/\{HTF\}/g, a.tf_higher || '');
  }

  // ---------- Dukshmëria ----------
  function evalCond(c, state, memo) {
    if (!c) return true;
    var a = state.answers || {};
    if (c.all) return c.all.every(function (x) { return evalCond(x, state, memo); });
    if (c.any) return c.any.some(function (x) { return evalCond(x, state, memo); });
    if (c.countYes) {
      var n = c.countYes.filter(function (id) { return isVisible(id, state, memo) && a[id] === 'yes'; }).length;
      return n > c.gt;
    }
    if (!isVisible(c.q, state, memo)) return false;
    var v = a[c.q];
    if ('eq' in c) return v === c.eq;
    if ('in' in c) return c.in.indexOf(v) >= 0;
    if ('nin' in c) return !isEmpty(v) && c.nin.indexOf(v) < 0;
    if ('has' in c) return Array.isArray(v) && v.indexOf(c.has) >= 0;
    if ('countGt' in c) return Array.isArray(v) && v.filter(function (x) { return x !== UNKNOWN; }).length > c.countGt;
    if ('gt' in c) { if (a['?' + c.q]) return false; var nv = parseNum(v); return !isNaN(nv) && nv > c.gt; }
    return true;
  }
  function isVisible(id, state, memo) {
    memo = memo || {};
    if (id in memo) return memo[id];
    memo[id] = false; // mbrojtje nga ciklet
    var q = byId[id];
    var r = !!q && evalCond(q.show, state, memo);
    memo[id] = r;
    return r;
  }
  function visibleIds(state) {
    var memo = {};
    return Q.filter(function (q) { return isVisible(q.id, state, memo); }).map(function (q) { return q.id; });
  }
  function exVisible(f, ex) {
    if (!f.show) return true;
    return f.show.in.indexOf(ex[f.show.ex]) >= 0;
  }

  // ---------- Vlerat ----------
  function currency(state) {
    var a = state.answers || {};
    if (a.account_ccy === 'other' && !isEmpty(a.account_ccy_other)) return String(a.account_ccy_other).trim().toUpperCase();
    if (a.account_ccy && a.account_ccy !== 'other' && a.account_ccy !== UNKNOWN) return a.account_ccy;
    return null;
  }
  function unitLabel(q, state, lang) {
    if (!q.unit) return '';
    if (q.unit === 'ccy') return currency(state) || UNITS.ccy[lang];
    return UNITS[q.unit][lang];
  }
  function optLabel(q, v, lang) {
    if (v === UNKNOWN) return lang === 'sq' ? UNKNOWN_SQ : UNKNOWN_EN;
    for (var i = 0; i < (q.options || []).length; i++) if (q.options[i].v === v) return q.options[i][lang];
    return String(v);
  }
  function display(q, state, lang) {
    var a = state.answers || {};
    var v = a[q.id];
    if (q.type !== 'single' && q.type !== 'multi' && a['?' + q.id]) return { text: lang === 'sq' ? UNKNOWN_SQ : UNKNOWN_EN, unknown: true };
    if (isEmpty(v)) return null;
    if (q.type === 'single') return { text: optLabel(q, v, lang), unknown: v === UNKNOWN };
    if (q.type === 'multi') return { text: v.map(function (x) { return optLabel(q, x, lang); }).join(', '), unknown: v.indexOf(UNKNOWN) >= 0 };
    if (q.type === 'number') {
      var u = q.unit ? unitLabel(q, state, lang) : '';
      return { text: String(v).trim().replace(',', '.') + (u ? ' ' + u : '') };
    }
    return { text: String(v).trim() };
  }

  // ---------- Validimi (bllokues) ----------
  function checkNumber(q, v) {
    var n = parseNum(v);
    if (isNaN(n)) return 'Shkruaj një numër.';
    if (q.num === 'int' && (n < 1 || Math.floor(n) !== n)) return 'Shkruaj një numër të plotë, 1 ose më shumë.';
    if (q.num === 'pos' && n <= 0) return 'Duhet të jetë më e madhe se 0.';
    if (q.num === 'nonneg' && n < 0) return 'Nuk mund të jetë negative.';
    if (q.num === 'pct' && (n <= 0 || n > 100)) return 'Duhet të jetë mbi 0 dhe deri në 100.';
    return null;
  }
  function validFormat(q, v) {
    if (q.type === 'number') return checkNumber(q, v);
    if (q.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? null : 'Email-i nuk duket i saktë.';
    if (q.type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? null : 'Shkruaj orën si 09:30.';
    if (q.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? null : 'Zgjidh një datë.';
    return null;
  }
  function lengthError(len, max) { return len > max ? 'Teksti është shumë i gjatë: ' + len + ' shenja, maksimumi ' + max + '. Shkurtoje vetë.' : null; }
  function maxFor(q, isEx) { return q.max || (isEx ? MAX_LEN_EX : MAX_LEN)[q.type] || 2000; }
  function validate(state) {
    var a = state.answers || {};
    var errors = [];
    var vis = visibleIds(state);
    var visSet = {};
    vis.forEach(function (id) { visSet[id] = true; });
    vis.forEach(function (id) {
      var q = byId[id];
      if (NON_ANSWER[q.type]) return;
      var unknown = isUnknownVal(state, id);
      var v = a[id];
      if (unknown) return;
      if (isEmpty(v)) {
        if (q.req) errors.push({ id: id, step: q.step, msg: 'Kjo pyetje duhet plotësuar.' });
        else if (q.pair && !isEmpty(a[q.pair])) errors.push({ id: id, step: q.step, msg: 'Plotëso edhe këtë fushë, ose fshi fushën ngjitur.' });
        return;
      }
      var f = lengthError(String(v).length, maxFor(q, false)) || validFormat(q, v);
      if (f) errors.push({ id: id, step: q.step, msg: f });
    });
    // Marrëdhënie që e bëjnë përgjigjen të pavlefshme
    if (visSet.t_from && visSet.t_to && !a['?t_from'] && !a['?t_to'] && a.t_from && a.t_to && a.t_from === a.t_to) errors.push({ id: 't_to', step: 'time', msg: 'Ora e fillimit dhe e mbarimit nuk mund të jenë të njëjta.' });
    if (visSet.bt_from && visSet.bt_to && !a['?bt_from'] && !a['?bt_to'] && a.bt_from && a.bt_to && a.bt_from > a.bt_to) errors.push({ id: 'bt_to', step: 'examples', msg: 'Data e mbarimit duhet të jetë pas datës së fillimit.' });
    if (visSet.mg_partial && a.mg_partial === 'yes' && a.pc_base === 'initial') {
      var sum = [parseNum(a.pc1_pct), parseNum(a.pc2_pct)].filter(function (n) { return !isNaN(n); }).reduce(function (s, n) { return s + n; }, 0);
      if (sum > 100) errors.push({ id: 'pc1_pct', step: 'exit', msg: 'Përqindjet nga madhësia fillestare kalojnë 100% gjithsej.' });
    }
    // Shembujt
    var exs = state.examples || [];
    if (exs.length < MIN_EXAMPLES) errors.push({ id: 'examples', step: 'examples', msg: 'Shto të paktën një shembull.' });
    if (exs.length > MAX_EXAMPLES) errors.push({ id: 'examples', step: 'examples', msg: 'Maksimumi ' + MAX_EXAMPLES + ' shembuj.' });
    var sp = state.settingsPhotos || [];
    if (sp.length > MAX_SETTINGS_PHOTOS) errors.push({ id: 'settings_photos', step: 'examples', msg: 'Maksimumi ' + MAX_SETTINGS_PHOTOS + ' foto cilësimesh.' });
    sp.forEach(function (p, i) { var le = p && p.note ? lengthError(String(p.note).length, MAX_LEN_EX.text) : null; if (le) errors.push({ id: 'sp:' + i, step: 'examples', msg: le }); });
    exs.forEach(function (ex, i) {
      EX.forEach(function (f) {
        if (!exVisible(f, ex)) return;
        var v = ex[f.id];
        var key = 'ex:' + i + ':' + f.id;
        if (isEmpty(v)) { if (f.req) errors.push({ id: key, step: 'examples', msg: 'Plotëso këtë fushë të shembullit ' + (i + 1) + '.' }); return; }
        var fe = lengthError(String(v).length, maxFor(f, true)) || validFormat(f, v);
        if (fe) errors.push({ id: key, step: 'examples', msg: fe });
      });
    });
    return errors;
  }

  // ---------- Analiza: çështje të pazgjidhura, kundërthënie, supozime ----------
  function analyze(state) {
    var a = state.answers || {};
    var vis = visibleIds(state);
    var visSet = {};
    vis.forEach(function (id) { visSet[id] = true; });
    var unresolved = [];
    var contradictions = [];
    var assumptions = [];
    var devChecks = [];
    function V(id) { return visSet[id] && !isUnknownVal(state, id) ? a[id] : undefined; }
    function N(id) { return parseNum(V(id)); }
    function add(list, sq, en, id) { list.push({ sq: sq, en: en, id: id || null }); }

    vis.forEach(function (id) {
      var q = byId[id];
      if (!isUnknownVal(state, id)) return;
      var label = fill(q.sq, state).replace(/[:?]\s*$/, '');
      if (q.verify === 'dev') add(devChecks, label + ': do ta verifikojë zhvilluesi', q.en + ': unknown to the client, developer to verify on the account', id);
      else add(unresolved, label, q.en + ': ' + UNKNOWN_EN, id);
    });

    if (a.facts_review === 'fix') add(contradictions, 'Klienti tha që një fakt i konfirmuar nuk është i saktë: ' + (a.facts_fix || ''), 'Client flagged a confirmed fact as wrong: ' + (a.facts_fix || ''), 'facts_fix');
    CONFIRMED_FACTS.forEach(function (f) {
      if (f.value === undefined) return;
      var qid = f.id === 'risk' ? 'risk_pct' : 'max_trades';
      var n = N(qid);
      if (!isNaN(n) && n !== f.value) add(contradictions, 'Ndryshim nga fakti i konfirmuar: ' + f.sq + ', ndërsa këtu u zgjodh ' + n, 'Differs from confirmed fact "' + f.en + '": answer is ' + n, qid);
    });
    var method = V('size_method');
    var methodQ = byId.size_method;
    if (method && method !== UNKNOWN && method !== 'risk_pct') add(contradictions, 'Fakti i konfirmuar është "Risk: 1% për trade", por u zgjodh: ' + optLabel(methodQ, method, 'sq') + '.', 'Confirmed fact is "Risk: 1% per trade", but the sizing method chosen is: ' + optLabel(methodQ, method, 'en') + '.', 'size_method');
    if (!isNaN(N('lot_cap_value')) && !isNaN(N('lot_fixed')) && N('lot_fixed') > N('lot_cap_value')) add(contradictions, 'Lot fiks (' + N('lot_fixed') + ') është mbi kufirin maksimal (' + N('lot_cap_value') + '): çdo trade do të binte ndesh me kufirin.', 'Fixed lot (' + N('lot_fixed') + ') is above the max lot cap (' + N('lot_cap_value') + '): every trade would conflict.', 'lot_fixed');
    var moneyPct = !isNaN(N('risk_money')) && !isNaN(N('capital')) ? N('risk_money') / N('capital') * 100 : NaN;
    if (!isNaN(moneyPct) && moneyPct >= 100) add(contradictions, 'Shuma për trade (' + N('risk_money') + ') është sa ose më shumë se kapitali (' + N('capital') + ').', 'Money risk per trade is at or above the planned capital.', 'risk_money');
    var risk = !isNaN(N('risk_pct')) ? N('risk_pct') : moneyPct;
    if (!isNaN(N('combined_risk')) && !isNaN(risk) && N('combined_risk') < risk) add(contradictions, 'Max risk total (' + N('combined_risk') + '%) është më i vogël se risk-u i një trade (' + Math.round(risk * 100) / 100 + '%).', 'Combined risk (' + N('combined_risk') + '%) is below the risk of a single trade (' + Math.round(risk * 100) / 100 + '%).', 'combined_risk');
    if (!isNaN(N('dl_pct')) && !isNaN(risk) && N('dl_pct') <= risk) add(contradictions, 'Daily loss limit (' + N('dl_pct') + '%) arrihet me një loss të vetëm (' + Math.round(risk * 100) / 100 + '%). Konfirmo që është i qëllimshëm.', 'Daily loss limit (' + N('dl_pct') + '%) is reached by a single loss (' + Math.round(risk * 100) / 100 + '%). Confirm intended.', 'dl_pct');
    if (!isNaN(N('prop_daily')) && !isNaN(N('dl_pct')) && N('dl_pct') > N('prop_daily')) add(contradictions, 'Daily loss limit i robotit (' + N('dl_pct') + '%) është më i lartë se ai i prop firm-ës (' + N('prop_daily') + '%).', 'EA daily limit exceeds the prop firm daily limit.', 'dl_pct');
    if (!isNaN(N('loss_stop_n')) && !isNaN(N('max_trades')) && N('loss_stop_n') >= N('max_trades')) add(contradictions, 'Ndalimi pas ' + N('loss_stop_n') + ' losses nuk ndikon, sepse max është ' + N('max_trades') + ' trades në ditë.', 'Loss stop (' + N('loss_stop_n') + ') never triggers before the daily trade maximum (' + N('max_trades') + ').', 'loss_stop_n');
    if (!isNaN(N('entries_n')) && !isNaN(N('max_trades')) && N('entries_n') > N('max_trades')) add(contradictions, 'Entries për signal (' + N('entries_n') + ') kalojnë max trades të ditës (' + N('max_trades') + ').', 'Entries per signal exceed the daily trade maximum.', 'entries_n');
    var skip = V('skip');
    if (Array.isArray(skip) && skip.indexOf('never') >= 0 && skip.filter(function (x) { return x !== 'never' && x !== UNKNOWN; }).length) add(contradictions, 'U zgjodh "bëj entry gjithmonë" bashkë me raste pa entry.', '"Always enter" was selected together with skip cases.', 'skip');
    var tpR = V('tp_r') === '2' ? 2 : V('tp_r') === '3' ? 3 : V('tp_r') === 'custom' ? N('tp_r_custom') : NaN;
    if (!isNaN(tpR)) {
      if (!isNaN(N('be_trigger_r')) && N('be_trigger_r') >= tpR) add(contradictions, 'Break-even aktivizohet te ' + N('be_trigger_r') + 'R, kurse TP është te ' + tpR + 'R: nuk aktivizohet kurrë.', 'Break-even trigger (' + N('be_trigger_r') + 'R) is at or beyond TP (' + tpR + 'R).', 'be_trigger_r');
      if (!isNaN(N('tr_act_r')) && N('tr_act_r') >= tpR) add(contradictions, 'Trailing aktivizohet te ' + N('tr_act_r') + 'R, kurse TP është te ' + tpR + 'R.', 'Trailing activation is at or beyond TP.', 'tr_act_r');
      ['pc1_r', 'pc2_r'].forEach(function (id) { if (!isNaN(N(id)) && N(id) >= tpR) add(contradictions, 'Partial close te ' + N(id) + 'R është te TP ose përtej tij (' + tpR + 'R).', 'Partial close at or beyond TP.', id); });
    }
    if (!isNaN(N('pc1_r')) && !isNaN(N('pc2_r')) && N('pc2_r') <= N('pc1_r')) add(contradictions, 'Partial close 2 duhet të jetë më larg se partial close 1.', 'Partial 2 must be further than partial 1.', 'pc2_r');
    if (!isNaN(N('sl_max_usd')) && !isNaN(N('sl_fixed')) && N('sl_fixed') > N('sl_max_usd')) add(contradictions, 'SL fiks (' + N('sl_fixed') + '$) është më i madh se kufiri (' + N('sl_max_usd') + '$): çdo trade do anashkalohej.', 'Fixed SL exceeds max SL: every trade would be skipped.', 'sl_max_usd');
    if (V('pc_rest') === 'trail' && V('mg_trail') === 'no') add(contradictions, 'Pjesa e mbetur ndiqet me trailing, por trailing stop u zgjodh "Jo".', 'Remaining volume uses trailing, but trailing stop is "No".', 'pc_rest');
    if (V('pc_rest') === 'be' && V('mg_be') === 'no') add(contradictions, 'Pjesa e mbetur kalon në break-even, por break-even u zgjodh "Jo".', 'Remaining volume moves to break-even, but break-even is "No".', 'pc_rest');
    if (V('sig_candle') === 'closed' && V('exe') === 'market_now') add(contradictions, 'Signal-i kontrollohet në candle të mbyllur, por order-i dërgohet brenda candle-it.', 'Signal uses closed candles but execution is intrabar.', 'exe');
    if (V('dir_ma_rule') === 'two_ma' && !isNaN(N('dir_ma_period2')) && !isNaN(N('dir_ma_period')) && N('dir_ma_period2') >= N('dir_ma_period')) add(contradictions, 'Fast MA duhet të ketë periudhë më të vogël se slow MA.', 'Fast MA period must be smaller than slow MA period.', 'dir_ma_period2');
    if (!isNaN(N('cx_fast')) && !isNaN(N('cx_slow')) && N('cx_fast') >= N('cx_slow')) add(contradictions, 'Te MA crossover, fast MA duhet të ketë periudhë më të vogël.', 'Crossover fast period must be smaller than slow period.', 'cx_fast');
    if (V('cu_repaint') === 'yes') add(unresolved, 'Indikatori i personalizuar ndryshon signals më vonë (repaint): duhet verifikuar para ndërtimit.', 'Custom indicator repaints: must be verified before building.', 'cu_repaint');
    if (V('cu_code') === 'pine') add(unresolved, 'Pritet kodi Pine Script i indikatorit.', 'Awaiting Pine Script source of the custom indicator.', 'cu_code');
    if (V('cu_code') === 'none') add(unresolved, 'Indikatori i personalizuar nuk ka kod ose formula: nuk mund të rindërtohet pa to.', 'Custom indicator has no code or formulas: cannot be rebuilt without them.', 'cu_code');
    if (V('facts_review') === undefined && visSet.facts_review) { /* bllokohet nga validimi */ }

    // Mbulimi i shembujve
    var exs = state.examples || [];
    var kinds = exs.map(function (e) { return e.kind; });
    var results = exs.map(function (e) { return e.result; });
    if (exs.length) {
      if (results.indexOf('win') < 0) add(unresolved, 'Shto një trade që ka fituar.', 'No winning example provided.', 'examples');
      if (results.indexOf('loss') < 0) add(unresolved, 'Shto një trade që ka humbur.', 'No losing example provided.', 'examples');
      if (kinds.indexOf('noentry') < 0) add(unresolved, 'Shto një rast kur NUK ke hyrë, edhe pse dukej si sinjal.', 'No "must not enter" example provided.', 'examples');
      if (a.sides === 'both' && (kinds.indexOf('buy') < 0 || kinds.indexOf('sell') < 0)) add(unresolved, 'Shto shembuj për të dy drejtimet, BUY dhe SELL.', 'Examples do not cover both BUY and SELL.', 'examples');
      exs.forEach(function (e, i) {
        if ((e.kind === 'buy' || e.kind === 'sell') && !e.photoId && (isEmpty(e.entry) || isEmpty(e.sl) || isEmpty(e.tp))) add(unresolved, 'Shembulli ' + (i + 1) + ': shto çmimet (hyrja, Stop Loss, Take Profit) ose një foto të grafikut.', 'Example ' + (i + 1) + ': no prices and no chart photo.', 'examples');
      });
      exs.forEach(function (e, i) {
        if (e.kind === 'buy' || e.kind === 'sell') {
          var en = parseNum(e.entry), sl = parseNum(e.sl), tp = parseNum(e.tp);
          if (!isNaN(en) && !isNaN(sl) && !isNaN(tp)) {
            var okBuy = sl < en && en < tp, okSell = tp < en && en < sl;
            if ((e.kind === 'buy' && !okBuy) || (e.kind === 'sell' && !okSell)) add(contradictions, 'Shembulli ' + (i + 1) + ': SL dhe TP nuk përputhen me drejtimin ' + e.kind.toUpperCase() + '.', 'Example ' + (i + 1) + ': SL/TP inconsistent with ' + e.kind.toUpperCase() + '.');
          }
        }
      });
    }
    if (visSet.acc_period && a.acc_period === 'same' && (isEmpty(a.bt_from) || a['?bt_from'])) add(assumptions, 'Periudha e krahasimit = periudha e backtest-it, por datat e backtest-it mungojnë.', 'Comparison period equals the trader backtest period, but the backtest dates are unknown.');
    add(assumptions, '1R = distanca fillestare nga entry te SL-ja e parë, në $ të çmimit të arit.', '1R = initial distance from entry to the original SL, in USD of gold price.');
    if ((state.legacyNotes || []).length) add(assumptions, 'Disa shënime u morën nga një draft i vjetër dhe duhen rikontrolluar.', 'Some notes were migrated from an older draft and must be re-checked.');

    var errors = validate(state);
    return { errors: errors, unresolved: unresolved, contradictions: contradictions, assumptions: assumptions, devChecks: devChecks, ready: errors.length === 0 && unresolved.length === 0 && contradictions.length === 0 };
  }

  // ---------- Seksionet (për përmbledhjen, emailin dhe specifikimin) ----------
  function sections(state, lang) {
    var vis = visibleIds(state);
    var visSet = {};
    vis.forEach(function (id) { visSet[id] = true; });
    var out = [];
    SECTIONS.forEach(function (st) {
      if (st.id === 'review') return;
      var items = [];
      Q.forEach(function (q) {
        if (q.step !== st.id || !visSet[q.id]) return;
        if (NON_ANSWER[q.type]) return;
        var d = display(q, state, lang);
        if (!d) return;
        items.push({ id: q.id, label: (lang === 'sq' ? fill(q.sq, state) : fill(q.en, state)).replace(/:\s*$/, ''), value: d.text, unknown: !!d.unknown });
      });
      if (st.id === 'signal' && state.answers && state.answers.sides === 'both' && state.answers.mirror === 'mirror') {
        // pasqyrimi është përgjigje e dukshme, s'ka nevojë për rresht shtesë
      }
      if (items.length) out.push({ id: st.id, title: lang === 'sq' ? fill(st.sq, state) : fill(st.en, state), items: items });
    });
    return out;
  }
  function exampleLines(state, lang, photoNames) {
    return (state.examples || []).map(function (ex, i) {
      var parts = [];
      EX.forEach(function (f) {
        if (!exVisible(f, ex) || isEmpty(ex[f.id])) return;
        var val = f.type === 'single' ? optLabel(f, ex[f.id], lang) : String(ex[f.id]).trim();
        parts.push((lang === 'sq' ? f.sq : f.en) + ': ' + val);
      });
      var photo = photoNames && photoNames[ex.photoId] ? photoNames[ex.photoId] : null;
      parts.push((lang === 'sq' ? 'Foto: ' : 'Photo: ') + (photo || (lang === 'sq' ? 'nuk ka' : 'none')));
      return (lang === 'sq' ? 'Shembulli ' : 'Example ') + (i + 1) + ' | ' + parts.join(' | ');
    });
  }

  // Emra të qëndrueshëm për fotot (të njëjtë në faqe, panel, specifikim dhe ZIP)
  function photoNames(state) {
    var names = {};
    (state.examples || []).forEach(function (ex, i) {
      if (!ex.photoId) return;
      var tag = ex.kind === 'noentry' ? 'no-entry' : (ex.kind || 'shembull') + (ex.result ? '-' + ex.result : '');
      names[ex.photoId] = 'shembulli-' + (i + 1) + '-' + tag + '.jpg';
    });
    (state.settingsPhotos || []).forEach(function (p, i) {
      if (p && p.photoId) names[p.photoId] = 'cilesimet-' + (i + 1) + '.jpg';
    });
    return names;
  }
  function settingsLines(state, lang, names) {
    names = names || photoNames(state);
    return (state.settingsPhotos || []).filter(function (p) { return p && p.photoId; }).map(function (p) {
      var note = p.note && String(p.note).trim() ? String(p.note).trim() : (lang === 'sq' ? 'pa përshkrim' : 'no description');
      return (names[p.photoId] || '') + ': ' + note;
    });
  }

  // ---------- Madhësia e trade-it (për programuesin) ----------
  function sizingRequirement(state, vis) {
    var a = state.answers || {};
    var ccy = currency(state) || 'account currency';
    var m = vis.size_method ? a.size_method : undefined;
    var how;
    if (m === 'fixed_lot') how = 'FIXED LOT of ' + (a.lot_fixed || '?') + ' lots on every trade. A fixed lot is not a fixed loss: compute the money at risk for each trade from the actual SL distance, contract size, tick value and commission, and check it against the risk limits below.';
    else if (m === 'risk_pct') how = 'RISK %: risk money = ' + (a.risk_base === 'equity' ? 'equity' : a.risk_base === 'balance' ? 'balance' : '(base UNKNOWN)') + ' x ' + (a.risk_pct || '?') + '%. Volume = risk money / (SL distance in price x money value of 1.0 lot per price unit), using SYMBOL_TRADE_TICK_VALUE / SYMBOL_TRADE_TICK_SIZE, including commission when known.';
    else if (m === 'risk_money') how = 'FIXED MONEY RISK: risk money = ' + (a.risk_money || '?') + ' ' + ccy + ' per trade. Volume = risk money / (SL distance in price x money value of 1.0 lot per price unit), using SYMBOL_TRADE_TICK_VALUE / SYMBOL_TRADE_TICK_SIZE, including commission when known.';
    else how = 'Sizing method UNKNOWN: do not implement sizing until the client confirms it.';
    var cap = vis.lot_cap && a.lot_cap === 'yes' ? 'Max lot per trade: ' + (a.lot_cap_value || '?') + ' lots.' : 'No client lot cap (the broker maximum still applies).';
    var conflict = vis.size_conflict ? (a.size_conflict === 'skip' ? 'SKIP the trade' : a.size_conflict === 'reduce' ? 'REDUCE the volume to the largest volume that satisfies every limit' : 'UNKNOWN: ask the client') : 'UNKNOWN: ask the client';
    return 'POSITION SIZING (exactly one active method; never combine methods): ' + how + ' ' + cap +
      ' General risk limits apply in every method (daily loss limit, combined risk of open positions, prop firm limits, max trades). ' +
      'When the requested volume conflicts with the lot cap, a risk limit or the broker volume max/step: client choice = ' + conflict + '. ' +
      'Always round DOWN to the volume step; never round up and never increase the volume above the allowed risk. If the volume would be below the broker minimum, skip the trade (it cannot be reduced further). ' +
      'Never change the size silently: log every reduction or skip with the requested volume, the final volume and the reason' + (a.push === 'yes' ? ', and include it in the push notification.' : '.') +
      ' Account currency: ' + ccy + '; planned capital: ' + (a.capital ? a.capital + ' ' + ccy : 'unknown') + ' (used to validate the settings, not as a sizing base).';
  }

  // ---------- Kërkesat për programuesin ----------
  function developerRequirements(state) {
    var a = state.answers || {};
    var vis = {};
    visibleIds(state).forEach(function (id) { vis[id] = true; });
    var r = [
      'VERIFY ON THE CLIENT ACCOUNT (not asked to the client): symbol XAUUSD.r specification (digits, point, tick size/value, contract size), volume min/max/step, stops level and freeze level, commission per lot, typical and news-time spread, hedging vs netting, filling modes, broker server timezone and DST behaviour, trading session times.',
      'Trade the chart symbol (_Symbol) so the EA runs on XAUUSD.r and on test accounts with other names.',
      'Restore state after restart or reconnect (daily counters, loss counters, cooldowns, pending orders, partial-close stages) from trade history and open positions, not from memory only.',
      'Prevent duplicate orders: one order per signal (respect entries-per-signal), check existing positions/orders by magic number before sending, handle requotes, partial fills and trade server return codes; retry only on retryable codes.',
      'Do not modify, close or count trades outside the EA\'s responsibility (other magic numbers, manual trades) unless the answers explicitly say a limit applies to the whole account.',
      'Every rule and limit is an input parameter; plain-English comments; log every decision (entry, skip with reason, modification, exit).',
      'Signals evaluated on ' + (a.sig_candle === 'forming' ? 'the forming candle as answered' : 'closed candles') + '; never use future bars; avoid repainting.',
      'Push notifications: ' + (a.push === 'yes' ? 'send via SendNotification() on open, modify and close.' : 'not requested.'),
      'Provide a demo-only build option (refuses to trade on real accounts) for client testing before payment.'
    ];
    r.splice(2, 0, sizingRequirement(state, vis));
    if (vis.news && a.news === 'yes') r.push('News filter is part of the strategy: backtest with historical news data (e.g. a stored calendar file). The MQL5 Economic Calendar is not available in the Strategy Tester. Any backtest with the news filter disabled must be labelled as a test with modified rules.');
    if (vis.spread_filter && a.spread_filter === 'dev') r.push('Choose a max spread value for XAUUSD.r from measured spreads and document it as an input.');
    if (Array.isArray(a.cond) && a.cond.indexOf('custom') >= 0) r.push('Custom TradingView indicator must be re-implemented in MQL5 from its code/formulas and validated bar-by-bar against TradingView before use.');
    r.push('Photos (examples and indicator settings) are for checking the written rules only. Do NOT infer or invent parameters from photos; if a photo seems to disagree with an answer, ask the client.');
    analyze(state).devChecks.forEach(function (x) { r.push('VERIFY: ' + x.en); });
    r.push('Do not start coding while unresolved issues or contradictions exist. Send questions back to the client.');
    return r;
  }

  // ---------- Specifikimi (.txt për Claude Code) ----------
  function buildSpec(state, meta) {
    meta = meta || {};
    var an = analyze(state);
    var a = state.answers || {};
    var L = [];
    L.push('XAUUSD EA SPECIFICATION (MetaTrader 5 / MQL5)');
    L.push('Schema version: ' + SCHEMA_VERSION);
    L.push('Submission ID: ' + (meta.submissionId || '(draft)'));
    if (meta.photoCount !== undefined) L.push('Photos: ' + meta.photoCount + ' (NOT included in this text file; download the full ZIP package for the photos)');
    L.push('Date: ' + (meta.date || ''));
    L.push('Status: ' + (meta.submitted ? 'Answers submitted' : 'Draft') + ' | Ready for programming: ' + (an.ready ? 'YES' : 'NO (' + (an.errors.length + an.unresolved.length + an.contradictions.length) + ' open items)'));
    L.push('');
    L.push('Free-text answers are in Albanian. Do not invent rules: anything missing goes back to the client as a question.');
    L.push('');
    L.push('== 1. CLIENT ANSWERS ==');
    sections(state, 'en').forEach(function (s) {
      L.push('');
      L.push('-- ' + s.title + ' --');
      s.items.forEach(function (it) { L.push('- ' + it.label + ': ' + it.value); });
    });
    var exl = exampleLines(state, 'en', meta.photoNames || photoNames(state));
    if (exl.length) { L.push(''); L.push('-- Examples --'); exl.forEach(function (x) { L.push('- ' + x); }); }
    var spl = settingsLines(state, 'en', meta.photoNames || photoNames(state));
    if (spl.length) { L.push(''); L.push('-- Indicator settings photos --'); spl.forEach(function (x) { L.push('- ' + x); }); }
    L.push('');
    L.push('== 2. PREVIOUSLY CONFIRMED FACTS ==');
    CONFIRMED_FACTS.forEach(function (f) { L.push('- ' + f.en); });
    L.push('- Client review: ' + (a.facts_review === 'ok' ? 'confirmed all facts' : a.facts_review === 'fix' ? 'flagged a correction: ' + (a.facts_fix || '') : 'not reviewed'));
    L.push('');
    L.push('== 3. ASSUMPTIONS PENDING CONFIRMATION ==');
    if (an.assumptions.length) an.assumptions.forEach(function (x) { L.push('- ' + x.en); }); else L.push('- None');
    if ((state.legacyNotes || []).length) {
      L.push('- Notes migrated from an older draft (re-check with the client):');
      state.legacyNotes.forEach(function (n) { L.push('  * ' + n.en + ': ' + n.text); });
    }
    L.push('');
    L.push('== 4. TO CLARIFY WITH THE CLIENT (unresolved issues and contradictions) ==');
    var any = false;
    an.errors.forEach(function (e) { any = true; var q = byId[e.id]; L.push('- MISSING: ' + (q ? q.en : e.id) + ' (' + e.msg + ')'); });
    an.unresolved.forEach(function (x) { any = true; L.push('- UNRESOLVED: ' + x.en); });
    an.contradictions.forEach(function (x) { any = true; L.push('- CONTRADICTION: ' + x.en); });
    if (!any) L.push('- None');
    L.push('');
    L.push('== 5. DEVELOPER VERIFICATIONS AND REQUIREMENTS ==');
    developerRequirements(state).forEach(function (x) { L.push('- ' + x); });
    L.push('');
    L.push('== 6. ACCEPTANCE (rule implementation, not profit) ==');
    L.push('- Backtest the EA on the comparison period above with the listed costs, then compare its trades with the trader\'s examples and records within the accepted price and time deviations.');
    L.push('- Acceptance verifies that the rules are implemented correctly. It does not promise future profit.');
    return L.join('\n');
  }

  // ---------- Migrimi nga drafti i vjetër (v11) ----------
  // Rendi i fushave të versionit të vjetër (nga skedari origjinal), për ta lexuar draftin e ruajtur.
  var LEGACY_V11 = [["tfe","M1"],["tfe","M5"],["tfe","M15"],["tfe","M30"],["tfe","H1"],["tfe","H4"],["tfc","None"],["tfc","M15"],["tfc","H1"],["tfc","H4"],["tfc","D1"],["dir","Moving average"],["dir","Market structure (higher highs/lows)"],["dir","Other indicator"],["dir","No direction filter, both BUY and SELL allowed"],["direction-moving-average-rule"],["direction-market-structure-rule"],["direction-other-indicator-rule"],["cond","MA crossover"],["cond","Pullback to a moving average"],["cond","RSI"],["cond","MACD"],["cond","Stochastic"],["cond","Bollinger Bands"],["cond","Break of a level"],["cond","Retest of a broken level"],["cond","Candle pattern"],["cond","Fibonacci retracement"],["cond","Custom TradingView indicator"],["cond","Other"],["buy-condition-ma-crossover"],["buy-condition-pullback-to-ma"],["buy-condition-rsi"],["buy-condition-macd"],["buy-condition-stochastic"],["buy-condition-bollinger-bands"],["buy-condition-level-breakout"],["buy-condition-retest"],["buy-condition-candle-pattern"],["buy-condition-fibonacci"],["buy-condition-custom-indicator"],["buy-condition-other"],["tim","All on the same candle"],["tim","In order, within a number of candles"],["detail:tim:In order, within a number of candles"],["exe","Market order at the close of the signal candle"],["exe","Buy stop above the high of the signal candle"],["exe","Limit order at a level"],["detail:exe:Buy stop above the high of the signal candle"],["detail:exe:Limit order at a level"],["buy"],["mirror","on"],["sell"],["skip","Never, always take valid signals"],["skip","Price too far from the MA"],["skip","Signal candle too big"],["skip","Market ranging (sideways)"],["skip","Too close to a strong level"],["skip-max-distance-from-ma"],["skip-max-signal-candle-size"],["skip-how-ranging-market-is-detected"],["skip-distance-to-strong-level"],["opp","Ignore it, let the trade hit SL/TP"],["opp","Close the open trade only"],["opp","Close and open the opposite trade"],["re","No, wait for a completely new signal"],["re","Yes, enter again"],["sl","Beyond the last swing low/high"],["sl","Beyond the signal candle low/high"],["sl","Fixed distance"],["sl","ATR-based"],["sl-swing-definition-and-buffer"],["sl-buffer-below-signal-candle"],["sl-fixed-distance"],["sl-atr-settings"],["msl","No, always take the trade"],["msl","Yes, skip if SL is larger than"],["detail:msl:Yes, skip if SL is larger than"],["tpm","Exact multiple of SL distance"],["tpm","At a price level"],["tp-which-level"],["tp","Always 1:2"],["tp","Always 1:3"],["tp","Depends"],["detail:tp:Depends"],["be","No"],["be","Yes, when profit reaches 1R"],["be","Yes, other"],["detail:be:Yes, other"],["pc","No, full position until SL or TP"],["pc","Partial close"],["pc","Trailing stop"],["detail:pc:Partial close"],["detail:pc:Trailing stop"],["aw","Keep trading up to the daily max"],["aw","Stop for the day after a win"],["ds","Only at the daily max of trades (max -3%)"],["ds","Stop after 2 losses"],["ds","Stop after 1 loss"],["ses","Asia"],["ses","London"],["ses","New York"],["ses","All day"],["detail:Sessions"],["se","Leave it open until SL or TP"],["se","Close it at the end of the trading hours"],["nw","No"],["nw","Yes, 15 min before/after"],["nw","Yes, 30 min before/after"],["nw","Yes, 60 min before/after"],["wk","No"],["wk","Yes, Friday evening"],["pn","Yes"],["pn","No"],["tvs","OANDA:XAUUSD"],["tvs","FX:XAUUSD / FXCM"],["tvs","TVC:GOLD"],["tvs","Other"],["detail:tvs:Other"],["tz","Kosovo / Europe Berlin (UTC+1/+2)"],["tz","UTC"],["tz","New York (UTC-5/-4)"],["tz","Other / unknown"],["btp"],["btn","Under 20"],["btn","20–40"],["btn","40–60"],["btn","Over 60"],["detail:Number of trades in backtest"],["btw","45–50%"],["btw","50–55%"],["btw","55–60%"],["btw","Over 60%"],["rec","Yes, in a spreadsheet (can share)"],["rec","Yes, marked on TradingView charts"],["rec","Not recorded"],["oth"]];
  var LEGACY_MAP = {
    tfe: function (v, A) { A.tf_signal = v; },
    tfc: function (v, A) { A.tf_higher = v === 'None' ? 'none' : v; },
    dir: function (v, A) { var m = { 'Moving average': 'ma', 'Market structure (higher highs/lows)': 'structure', 'Other indicator': 'indicator', 'No direction filter, both BUY and SELL allowed': 'none' }; if (m[v]) A.dir_method = m[v]; if (m[v] === 'none') A.sides = 'both'; },
    cond: function (vs, A) { var m = { 'MA crossover': 'ma_cross', 'Pullback to a moving average': 'pullback', 'RSI': 'rsi', 'MACD': 'macd', 'Stochastic': 'stoch', 'Bollinger Bands': 'bb', 'Break of a level': 'breakout', 'Retest of a broken level': 'retest', 'Candle pattern': 'candle', 'Fibonacci retracement': 'fib', 'Custom TradingView indicator': 'custom', 'Other': 'other' }; A.cond = vs.map(function (x) { return m[x]; }).filter(Boolean); },
    tim: function (v, A) { A.combine = 'all'; A.seq = v === 'All on the same candle' ? 'same' : 'order'; },
    exe: function (v, A) { var m = { 'Market order at the close of the signal candle': 'market_close', 'Buy stop above the high of the signal candle': 'stop', 'Limit order at a level': 'limit' }; if (m[v]) A.exe = m[v]; },
    opp: function (v, A) { var m = { 'Ignore it, let the trade hit SL/TP': 'ignore', 'Close the open trade only': 'close', 'Close and open the opposite trade': 'reverse' }; if (m[v]) A.opposite = m[v]; },
    re: function (v, A) { A.entries_per_signal = v === 'Yes, enter again' ? 'more' : '1'; },
    skip: function (vs, A) { var m = { 'Never, always take valid signals': 'never', 'Price too far from the MA': 'far_ma', 'Signal candle too big': 'big', 'Market ranging (sideways)': 'range', 'Too close to a strong level': 'level' }; A.skip = vs.map(function (x) { return m[x]; }).filter(Boolean); },
    sl: function (v, A) { var m = { 'Beyond the last swing low/high': 'swing', 'Beyond the signal candle low/high': 'signal_candle', 'Fixed distance': 'fixed', 'ATR-based': 'atr' }; if (m[v]) A.sl_method = m[v]; },
    msl: function (v, A) { A.sl_max = v === 'No, always take the trade' ? 'no' : 'yes'; },
    tpm: function (v, A) { A.tp_method = v === 'At a price level' ? 'level' : 'r'; },
    tp: function (v, A) { var m = { 'Always 1:2': '2', 'Always 1:3': '3', 'Depends': 'depends' }; if (m[v]) A.tp_r = m[v]; },
    be: function (v, A) { if (v === 'No') A.mg_be = 'no'; else { A.mg_be = 'yes'; if (v === 'Yes, when profit reaches 1R') { A.be_trigger = 'r'; A.be_trigger_r = '1'; } } },
    pc: function (v, A) { if (v === 'Partial close') A.mg_partial = 'yes'; else if (v === 'Trailing stop') A.mg_trail = 'yes'; else { A.mg_partial = 'no'; A.mg_trail = 'no'; } },
    aw: function (v, A) { A.after_win = v === 'Stop for the day after a win' ? 'stop' : 'continue'; },
    ds: function (v, A) { if (v.indexOf('Only at the daily max') === 0) A.loss_stop = 'none'; else { var n = parseInt(v.replace(/\D/g, ''), 10); if (n) A.loss_stop_n = String(n); } },
    se: function (v, A) { A.end_positions = v === 'Close it at the end of the trading hours' ? 'close' : 'keep'; },
    nw: function (v, A) { if (v === 'No') A.news = 'no'; else { A.news = 'yes'; var n = parseInt(v.replace(/\D/g, ''), 10); if (n) { A.news_before = String(n); A.news_after = String(n); } } },
    wk: function (v, A) { A.friday = v === 'No' ? 'no' : 'yes'; },
    pn: function (v, A) { A.push = v === 'Yes' ? 'yes' : 'no'; },
    tvs: function (v, A) { var m = { 'OANDA:XAUUSD': 'oanda', 'FX:XAUUSD / FXCM': 'fxcm', 'TVC:GOLD': 'tvc', 'Other': 'other' }; if (m[v]) A.tv_feed = m[v]; },
    tz: function (v, A) { var m = { 'Kosovo / Europe Berlin (UTC+1/+2)': 'albania', 'UTC': 'utc', 'New York (UTC-5/-4)': 'ny', 'Other / unknown': UNKNOWN }; if (m[v]) A.tv_tz = m[v]; },
    btn: function (v, A) { var m = { 'Under 20': 'lt20', '20–40': '20_40', '40–60': '40_60', 'Over 60': 'gt60' }; if (m[v]) A.bt_trades = m[v]; },
    btw: function (v, A) { var m = { '45–50%': '45_50', '50–55%': '50_55', '55–60%': '55_60', 'Over 60%': 'gt60' }; if (m[v]) A.bt_winrate = m[v]; },
    rec: function (v, A) { var m = { 'Yes, in a spreadsheet (can share)': 'sheet', 'Yes, marked on TradingView charts': 'chart', 'Not recorded': 'none' }; if (m[v]) A.bt_records = m[v]; }
  };
  var LEGACY_TEXT = {
    'buy': ['own_words'], 'sell': ['sell_entry'], 'oth': ['notes'],
    'buy-condition-rsi': ['rsi_rule'], 'buy-condition-macd': ['macd_rule'], 'buy-condition-stochastic': ['st_rule'], 'buy-condition-bollinger-bands': ['bb_rule'],
    'buy-condition-candle-pattern': ['cp_def'], 'buy-condition-fibonacci': ['fib_from'], 'buy-condition-custom-indicator': ['cu_rule'], 'buy-condition-other': ['ot_text'],
    'direction-market-structure-rule': ['dir_st_rule'], 'direction-other-indicator-rule': ['dir_ind_text'],
    'detail:tim:In order, within a number of candles': ['seq_order'], 'detail:exe:Buy stop above the high of the signal candle': ['pd_level'], 'detail:exe:Limit order at a level': ['pd_level'],
    'tp-which-level': ['tp_level'], 'detail:tp:Depends': ['tp_depends'], 'detail:tvs:Other': ['tv_feed_other'], 'skip-how-ranging-market-is-detected': ['skip_range']
  };
  var LEGACY_NOTE_LABEL = {
    'direction-moving-average-rule': ['Rregulli i MA-së për drejtimin', 'Direction MA rule'], 'buy-condition-ma-crossover': ['MA crossover', 'MA crossover'], 'buy-condition-pullback-to-ma': ['Pullback te MA', 'Pullback to MA'],
    'buy-condition-level-breakout': ['Breakout', 'Level breakout'], 'buy-condition-retest': ['Retest-i', 'Retest'], 'skip-max-distance-from-ma': ['Larg MA-së', 'Skip: far from MA'],
    'skip-max-signal-candle-size': ['Qiri i madh', 'Skip: big candle'], 'skip-distance-to-strong-level': ['Afër nivelit', 'Skip: near level'], 'sl-swing-definition-and-buffer': ['SL pas swing-ut', 'SL beyond swing'],
    'sl-buffer-below-signal-candle': ['SL pas qiriut', 'SL beyond signal candle'], 'sl-fixed-distance': ['SL fiks', 'SL fixed'], 'sl-atr-settings': ['SL me ATR', 'SL ATR'],
    'detail:msl:Yes, skip if SL is larger than': ['SL maksimal', 'Max SL'], 'detail:be:Yes, other': ['Break-even', 'Break-even'], 'detail:pc:Partial close': ['Mbyllja e pjesshme', 'Partial close'],
    'detail:pc:Trailing stop': ['Trailing stop', 'Trailing stop'], 'detail:Sessions': ['Orari', 'Trading hours'], 'btp': ['Periudha e backtest-it', 'Backtest period'],
    'detail:Number of trades in backtest': ['Numri i tregtive', 'Number of trades'], '__ses': ['Seancat', 'Sessions']
  };
  function migrateLegacy(raw, rawShots) {
    var d;
    try { d = JSON.parse(raw); } catch (e) { return null; }
    if (!d || !Array.isArray(d.f) || d.f.length !== LEGACY_V11.length) return null;
    var multi = {}, single = {}, texts = {};
    LEGACY_V11.forEach(function (m, i) {
      var val = d.f[i];
      if (m.length === 2) {
        if (val !== true) return;
        if (m[0] === 'cond' || m[0] === 'skip' || m[0] === 'ses') (multi[m[0]] = multi[m[0]] || []).push(m[1]);
        else if (m[0] === 'mirror') single.mirror = true;
        else single[m[0]] = m[1];
      } else if (typeof val === 'string' && val.trim()) texts[m[0]] = val.trim();
    });
    var A = {};
    Object.keys(single).forEach(function (k) { if (LEGACY_MAP[k]) LEGACY_MAP[k](single[k], A); });
    Object.keys(multi).forEach(function (k) { if (LEGACY_MAP[k]) LEGACY_MAP[k](multi[k], A); });
    // SELL si pasqyrim duhet konfirmuar shprehimisht: nuk migrohet si "Po".
    if (single.mirror !== true && texts.sell) A.mirror = 'differs';
    var notes = [];
    Object.keys(texts).forEach(function (k) {
      if (LEGACY_TEXT[k]) { var t = LEGACY_TEXT[k][0]; if (isEmpty(A[t])) A[t] = texts[k]; return; }
      var lab = LEGACY_NOTE_LABEL[k] || [k, k];
      notes.push({ sq: lab[0], en: lab[1], text: texts[k] });
    });
    if (multi.ses && multi.ses.length) notes.push({ sq: 'Seancat', en: 'Sessions', text: multi.ses.join(', ') });
    if (Array.isArray(d.o)) {
      if (d.o[0]) A.risk_pct = String(d.o[0]);
      if (d.o[1]) A.max_trades = String(d.o[1]);
      if (d.o[2]) A.max_open = String(d.o[2]);
    }
    var photos = [];
    try { var s = JSON.parse(rawShots || '[]'); if (Array.isArray(s)) photos = s.filter(function (x) { return x && typeof x.dataUrl === 'string' && x.dataUrl.indexOf('data:image/') === 0; }).slice(0, MAX_PHOTOS); } catch (e) { /* injoro */ }
    return { answers: A, legacyNotes: notes, photos: photos };
  }

  // Migron draftin e ruajtur me skemën 2 (para ndryshimeve) në skemën aktuale.
  function migrateState(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.schemaVersion === SCHEMA_VERSION) return d;
    if ([2, 3, 4].indexOf(d.schemaVersion) < 0) return null;
    var A = Object.assign({}, d.answers || {});
    if (d.schemaVersion === 2) {
      ['day_reset', 't_tz', 'tv_tz'].forEach(function (k) { if (A[k] === 'kosovo') A[k] = 'albania'; });
      delete A.client_name; delete A.client_email;
    }
    // 3 -> 4: pyetjet e reja për madhësinë e trade-it mbeten bosh; klienti i plotëson vetë.
    // 4 -> 5: ekrane të reja dhe foto cilësimesh; përgjigjet mbeten të njëjtat (ID-të nuk ndryshuan).
    return Object.assign({}, d, { schemaVersion: SCHEMA_VERSION, answers: A, settingsPhotos: Array.isArray(d.settingsPhotos) ? d.settingsPhotos : [] });
  }

  function emptyState() {
    var A = {};
    Q.forEach(function (q) { if (q.def !== undefined) A[q.id] = q.def; });
    return { schemaVersion: SCHEMA_VERSION, answers: A, examples: [], settingsPhotos: [], screen: null, legacyNotes: [], updatedAt: null };
  }

  // Pastron gjendjen që vjen nga jashtë (p.sh. në server): vetëm çelësa të njohur, tipe të sakta.
  function sanitizeState(input) {
    var s = emptyState();
    if (!input || typeof input !== 'object') return s;
    var A = input.answers && typeof input.answers === 'object' ? input.answers : {};
    s.answers = {};
    Q.forEach(function (q) {
      if (NON_ANSWER[q.type]) return;
      var v = A[q.id];
      if (q.type === 'multi') { if (Array.isArray(v)) s.answers[q.id] = v.filter(function (x) { return typeof x === 'string' && (x === UNKNOWN || (q.options || []).some(function (op) { return op.v === x; })); }).slice(0, 20); }
      else if (q.type === 'single') { if (typeof v === 'string' && (v === UNKNOWN || (q.options || []).some(function (op) { return op.v === v; }))) s.answers[q.id] = v; }
      else if (typeof v === 'string' || typeof v === 'number') s.answers[q.id] = String(v);
      if (A['?' + q.id] === true) s.answers['?' + q.id] = true;
    });
    s.examples = (Array.isArray(input.examples) ? input.examples : []).slice(0, MAX_EXAMPLES).map(function (ex) {
      var e = { photoId: typeof ex.photoId === 'string' ? ex.photoId : null };
      EX.forEach(function (f) {
        var v = ex[f.id];
        if (f.type === 'single') { if (typeof v === 'string' && f.options.some(function (op) { return op.v === v; })) e[f.id] = v; }
        else if (typeof v === 'string' || typeof v === 'number') e[f.id] = String(v);
      });
      return e;
    });
    s.settingsPhotos = (Array.isArray(input.settingsPhotos) ? input.settingsPhotos : []).slice(0, MAX_SETTINGS_PHOTOS).map(function (p) {
      return { photoId: p && typeof p.photoId === 'string' ? p.photoId : null, note: p && (typeof p.note === 'string') ? p.note : '' };
    });
    s.legacyNotes = (Array.isArray(input.legacyNotes) ? input.legacyNotes : []).slice(0, 40).map(function (n) {
      return { sq: String(n && n.sq || ''), en: String(n && n.en || ''), text: String(n && n.text || '') };
    });
    return s;
  }

  // Kontroll i rreptë për serverin: refuzon çdo gjë jashtë skemës, pa e ndryshuar përmbajtjen.
  function strictCheck(input) {
    var errs = [];
    function bad(field, msg) { errs.push({ id: field, msg: msg }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) { bad('state', 'Mungojnë të dhënat.'); return errs; }
    Object.keys(input).forEach(function (k) { if (['answers', 'examples', 'settingsPhotos', 'legacyNotes'].indexOf(k) < 0) bad(k, 'Fushë e panjohur.'); });
    var A = input.answers;
    if (!A || typeof A !== 'object' || Array.isArray(A)) { bad('answers', 'Mungojnë përgjigjet.'); return errs; }
    Object.keys(A).forEach(function (k) {
      var unk = k.charAt(0) === '?';
      var q = byId[unk ? k.slice(1) : k];
      var v = A[k];
      if (!q || NON_ANSWER[q.type]) return bad(k, 'Pyetje e panjohur.');
      if (unk) { if (v !== true || !q.unk || q.type === 'single' || q.type === 'multi') bad(k, 'Vlerë e pavlefshme.'); return; }
      if (q.type === 'single') { if (typeof v !== 'string' || !(v === UNKNOWN ? q.unk : q.options.some(function (op) { return op.v === v; }))) bad(k, 'Opsion i pavlefshëm.'); return; }
      if (q.type === 'multi') {
        if (!Array.isArray(v) || v.some(function (x) { return typeof x !== 'string' || !(x === UNKNOWN ? q.unk : q.options.some(function (op) { return op.v === x; })); })) bad(k, 'Opsion i pavlefshëm.');
        return;
      }
      if (typeof v !== 'string') return bad(k, 'Vlerë e pavlefshme.');
      var le = lengthError(v.length, maxFor(q, false));
      if (le) bad(k, le);
    });
    var E = input.examples;
    if (E !== undefined && !Array.isArray(E)) bad('examples', 'Format i pavlefshëm.');
    (Array.isArray(E) ? E : []).forEach(function (ex, i) {
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return bad('ex:' + i, 'Format i pavlefshëm.');
      Object.keys(ex).forEach(function (k) {
        var v = ex[k];
        if (k === 'photoId') { if (v !== null && (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v))) bad('ex:' + i + ':photoId', 'Identifikues i pavlefshëm.'); return; }
        var f = EX.filter(function (x) { return x.id === k; })[0];
        if (!f) return bad('ex:' + i + ':' + k, 'Fushë e panjohur.');
        if (f.type === 'single') { if (typeof v !== 'string' || !f.options.some(function (op) { return op.v === v; })) bad('ex:' + i + ':' + k, 'Opsion i pavlefshëm.'); return; }
        if (typeof v !== 'string') return bad('ex:' + i + ':' + k, 'Vlerë e pavlefshme.');
        var le = lengthError(v.length, maxFor(f, true));
        if (le) bad('ex:' + i + ':' + k, le);
      });
    });
    var SP = input.settingsPhotos;
    if (SP !== undefined && (!Array.isArray(SP) || SP.length > MAX_SETTINGS_PHOTOS)) bad('settingsPhotos', 'Format i pavlefshëm.');
    (Array.isArray(SP) ? SP : []).forEach(function (p, i) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return bad('sp:' + i, 'Format i pavlefshëm.');
      Object.keys(p).forEach(function (k) {
        if (k === 'photoId') { if (p.photoId !== null && (typeof p.photoId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.photoId))) bad('sp:' + i, 'Identifikues i pavlefshëm.'); }
        else if (k === 'note') { if (typeof p.note !== 'string') bad('sp:' + i, 'Vlerë e pavlefshme.'); else { var le = lengthError(p.note.length, MAX_LEN_EX.text); if (le) bad('sp:' + i, le); } }
        else bad('sp:' + i + ':' + k, 'Fushë e panjohur.');
      });
    });
    var N = input.legacyNotes;
    if (N !== undefined && (!Array.isArray(N) || N.some(function (n) { return !n || typeof n.sq !== 'string' || typeof n.en !== 'string' || typeof n.text !== 'string' || n.text.length > 20000; }))) bad('legacyNotes', 'Format i pavlefshëm.');
    return errs;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, STORAGE_KEY: STORAGE_KEY, BACKUP_KEY: BACKUP_KEY, UNKNOWN: UNKNOWN,
    MAX_EXAMPLES: MAX_EXAMPLES, MIN_EXAMPLES: MIN_EXAMPLES, MAX_PHOTOS: MAX_PHOTOS,
    CONFIRMED_FACTS: CONFIRMED_FACTS, STEPS: STEPS, SECTIONS: SECTIONS, SCREENS: SCREENS, QUESTIONS: Q, EXAMPLE_FIELDS: EX, UNITS: UNITS, byId: byId,
    UNKNOWN_SQ: UNKNOWN_SQ, MAX_SETTINGS_PHOTOS: MAX_SETTINGS_PHOTOS, settingsLines: settingsLines, NON_ANSWER: NON_ANSWER,
    isVisible: function (id, state) { return isVisible(id, state, {}); }, visibleIds: visibleIds, exVisible: exVisible,
    isUnknown: isUnknownVal, parseNum: parseNum, fill: fill, side: side, unitLabel: unitLabel, currency: currency,
    validate: validate, analyze: analyze, sections: sections, exampleLines: exampleLines, buildSpec: buildSpec,
    developerRequirements: developerRequirements, photoNames: photoNames, emptyState: emptyState, sanitizeState: sanitizeState,
    migrateLegacy: migrateLegacy, migrateState: migrateState, strictCheck: strictCheck, MAX_LEN: MAX_LEN, PREV_STORAGE_KEYS: PREV_STORAGE_KEYS, LEGACY_V11_LENGTH: LEGACY_V11.length
  };
});
