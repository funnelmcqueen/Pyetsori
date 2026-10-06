/*
 * Pyetësori XAUUSD: skema dhe logjika e përbashkët.
 * Përdoret nga faqja (window.XAUQ) dhe nga serveri (require). Nuk ka varësi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XAUQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 4;
  var STORAGE_KEY = 'xau-q:state';
  var PREV_STORAGE_KEYS = ['xau-q:v2'];
  var BACKUP_KEY = 'xau-q:legacy-backup';
  var MAX_EXAMPLES = 6;
  var MIN_EXAMPLES = 3;
  var MAX_PHOTOS = 6;
  var UNKNOWN = '?';
  // Kufijtë e gjatësisë: tekstet e gjata refuzohen me mesazh, nuk shkurtohen kurrë në heshtje.
  var MAX_LEN = { text: 2000, textarea: 20000, email: 254, number: 40, time: 5, date: 10 };
  var MAX_LEN_EX = { text: 100, textarea: 4000, number: 40, time: 5, date: 10 };

  // Fakte të konfirmuara më parë nga klienti (nuk shpiken të reja).
  var CONFIRMED_FACTS = [
    { id: 'broker', sq: 'Brokeri: Tauro, në MetaTrader 5', en: 'Broker: Tauro, on MetaTrader 5' },
    { id: 'symbol', sq: 'Vetëm gold (ari), simboli XAUUSD.r', en: 'Instrument: gold only, symbol XAUUSD.r' },
    { id: 'auto', sq: 'Roboti bën trade plotësisht vetë', en: 'Fully automatic: the EA opens, manages and closes trades itself' },
    { id: 'strategy', sq: 'Një strategji, me backtest manual për 1 muaj në TradingView', en: 'One strategy, manually backtested for one month on TradingView' },
    { id: 'risk', sq: 'Risk: 1% për trade', en: 'Risk: 1% per trade', value: 1 },
    { id: 'maxtrades', sq: 'Max 3 trades në ditë', en: 'Maximum 3 trades per day', value: 3 }
  ];

  var STEPS = [
    { id: 'client', sq: 'Faktet', en: 'Confirmed facts', intro: 'Kontrollo atë që kemi konfirmuar deri tani.' },
    { id: 'timeframes', sq: 'Timeframe dhe drejtimi', en: 'Timeframes and direction', intro: 'Përgjigju ashtu si ke tregtuar në backtest-in në TradingView.' },
    { id: 'signal', sq: 'Entry signal për {SIDE}', en: 'Entry signal ({SIDE})', intro: 'Zgjidh kushtet që duhen për të hapur {SIDE}. Për secilin shkruaj numrat e saktë.' },
    { id: 'entry', sq: 'Entry dhe re-entry', en: 'Entry, cancellation and re-entry', intro: 'Kur dhe si dërgohet order-i, pasi konfirmohet signal-i.' },
    { id: 'risk', sq: 'Risk dhe limitet', en: 'Risk and limits', intro: 'Limitet e risk-ut për çdo trade dhe për çdo ditë.' },
    { id: 'exits', sq: 'SL, TP dhe menaxhimi', en: 'Stop loss, take profit and trade management', intro: '1R = distanca fillestare nga entry te Stop Loss. Shembull: SL 5$ larg entry-t, atëherë 1R = 5$ dhe 2R = 10$.' },
    { id: 'time', sq: 'Trading hours dhe news', en: 'Trading hours and news', intro: 'Kur lejohet roboti të bëjë trade.' },
    { id: 'backtest', sq: 'Backtest-i dhe shembujt', en: 'Trader backtest, examples and acceptance', intro: 'Me këto e krahasojmë robotin me mënyrën si tregton ti.' },
    { id: 'done', sq: 'Kontrolli dhe dërgimi', en: 'Review and submit' }
  ];

  var UNITS = {
    usd: { sq: '$ lëvizje e arit', en: 'USD of gold price movement' },
    pct: { sq: '% e llogarisë', en: '% of account' },
    pctv: { sq: '% e volume', en: '% of volume' },
    candles: { sq: 'candles', en: 'candles' },
    min: { sq: 'minuta', en: 'minutes' },
    period: { sq: 'periudha', en: 'period' },
    r: { sq: 'R', en: 'R' },
    price: { sq: 'çmimi', en: 'price' },
    count: { sq: 'trades', en: 'trades' },
    lot: { sq: 'lot', en: 'lots' },
    ccy: { sq: 'monedha e llogarisë', en: 'account currency' },
    mult: { sq: '×', en: 'x' }
  };

  function o(v, sq, en) { return { v: v, sq: sq, en: en || sq }; }
  var TF = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map(function (t) { return o(t, t); });
  var TF_SAME = [o('same', 'Si timeframe-i i signal-it', 'Same as signal timeframe')].concat(TF);
  var SOURCE = [o('close', 'Mbyllja', 'Close'), o('open', 'Hapja', 'Open'), o('high', 'Maksimumi', 'High'), o('low', 'Minimumi', 'Low'), o('hl2', '(Max+Min)/2', 'HL2'), o('hlc3', '(Max+Min+Mbyllja)/3', 'HLC3')];
  var MA_TYPE = [o('ema', 'EMA'), o('sma', 'SMA'), o('other', 'Tjetër', 'Other')];
  var YESNO = [o('yes', 'Po', 'Yes'), o('no', 'Jo', 'No')];
  var KEEP_CANCEL = [o('cancel', 'E fshin pending order-in', 'Cancel the pending order'), o('keep', 'E lë', 'Keep it')];

  function has(q, v) { return { q: q, has: v }; }
  function eq(q, v) { return { q: q, eq: v }; }
  function inn(q, vs) { return { q: q, in: vs }; }
  function all() { return { all: Array.prototype.slice.call(arguments) }; }

  // type: single | multi | text | textarea | number | time | date | email | info | facts | examples
  var Q = [
    // ---------- 1. Klienti ----------
    { id: 'facts', step: 'client', type: 'facts', sq: 'Këto i kemi konfirmuar më parë', en: 'Previously confirmed facts' },
    { id: 'facts_review', step: 'client', type: 'single', req: true, sq: 'A janë të sakta?', en: 'Client review of confirmed facts', options: [o('ok', 'Po, janë të sakta', 'Client confirms all facts'), o('fix', 'Diçka nuk është e saktë', 'Client flags a correction')] },
    { id: 'facts_fix', step: 'client', type: 'textarea', req: true, sq: 'Çfarë duhet korrigjuar?', en: 'Correction to confirmed facts', show: eq('facts_review', 'fix') },

    // ---------- 2. Timeframe dhe drejtimi ----------
    { id: 'tf_signal', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'Në cilin timeframe e merr entry signal-in?', en: 'Signal (entry) timeframe', options: TF },
    { id: 'tf_higher', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'A shikon një timeframe më të madh për drejtimin?', en: 'Higher timeframe used for direction', options: [o('none', 'Jo', 'None')].concat(TF.slice(2)) },
    { id: 'htf_candle', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'Te timeframe-i {HTF}, cilin candle shikon?', en: 'Higher-timeframe candle used', show: { q: 'tf_higher', nin: ['none', UNKNOWN] }, options: [o('closed', 'Vetëm candles të mbyllura', 'Closed candles only'), o('forming', 'Edhe candle-in që po formohet', 'Also the forming (unclosed) candle')] },
    { id: 'sides', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'Çfarë lejohet të hapë roboti?', en: 'Allowed directions', options: [o('both', 'BUY dhe SELL', 'Both BUY and SELL'), o('buy_only', 'Vetëm BUY', 'BUY only'), o('sell_only', 'Vetëm SELL', 'SELL only')] },
    { id: 'dir_method', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'Si e vendos nëse kërkon BUY apo SELL?', en: 'Direction filter method', options: [o('ma', 'Me Moving Average (MA)', 'Moving average'), o('structure', 'Me market structure', 'Market structure (swing highs/lows)'), o('indicator', 'Me indikator tjetër', 'Other indicator'), o('none', 'S\'kam filtër drejtimi', 'No direction filter')] },
    { id: 'dir_ma_type', step: 'timeframes', type: 'single', req: true, sq: 'Lloji i MA-së', en: 'Direction MA type', show: eq('dir_method', 'ma'), options: MA_TYPE },
    { id: 'dir_ma_type_other', step: 'timeframes', type: 'text', req: true, sq: 'Cila MA saktësisht?', en: 'Direction MA type (other)', ph: 'P.sh. WMA, HMA, VWAP', show: eq('dir_ma_type', 'other') },
    { id: 'dir_ma_period', step: 'timeframes', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha', en: 'Direction MA period', ph: '200', show: eq('dir_method', 'ma'), row: 'dirma' },
    { id: 'dir_ma_tf', step: 'timeframes', type: 'single', req: true, sq: 'Në cilin timeframe?', en: 'Direction MA timeframe', show: eq('dir_method', 'ma'), options: TF_SAME },
    { id: 'dir_ma_source', step: 'timeframes', type: 'single', req: true, unk: true, sq: 'Nga cili çmim llogaritet?', en: 'Direction MA price source', show: eq('dir_method', 'ma'), options: SOURCE },
    { id: 'dir_ma_rule', step: 'timeframes', type: 'single', req: true, sq: 'Si e lexon?', en: 'Direction MA rule', show: eq('dir_method', 'ma'), options: [o('close_vs_ma', 'BUY kur candle mbyllet mbi MA, SELL kur mbyllet nën të', 'BUY when candle closes above the MA, SELL when it closes below'), o('two_ma', 'BUY kur fast MA është mbi slow MA', 'BUY when a fast MA is above a slow MA (SELL the reverse)'), o('other', 'Ndryshe', 'Other')] },
    { id: 'dir_ma_period2', step: 'timeframes', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e fast MA', en: 'Direction fast MA period', ph: '50', show: eq('dir_ma_rule', 'two_ma') },
    { id: 'dir_ma_rule_text', step: 'timeframes', type: 'text', req: true, sq: 'Si e lexon saktë?', en: 'Direction MA rule (own words)', show: eq('dir_ma_rule', 'other') },
    { id: 'dir_st_tf', step: 'timeframes', type: 'single', req: true, sq: 'Në cilin timeframe e shikon market structure?', en: 'Structure timeframe', show: eq('dir_method', 'structure'), options: TF_SAME },
    { id: 'dir_st_swing', step: 'timeframes', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Një swing high është high më i lartë se sa candles majtas dhe djathtas?', en: 'Swing definition: candles on each side', ph: '3', show: eq('dir_method', 'structure') },
    { id: 'dir_st_rule', step: 'timeframes', type: 'text', req: true, unk: true, sq: 'Kur është uptrend (BUY)?', en: 'Structure rule for bullish direction', ph: 'P.sh. higher high dhe higher low: swing high dhe swing low i fundit janë më lart se të mëparshmit', show: eq('dir_method', 'structure') },
    { id: 'dir_ind_text', step: 'timeframes', type: 'text', req: true, sq: 'Cili indikator, me cilat settings, në cilin timeframe, dhe si e lexon?', en: 'Direction indicator rule', ph: 'P.sh. MACD 12/26/9 në H4: BUY kur histogrami është mbi zero', show: eq('dir_method', 'indicator') },

    // ---------- 3. Sinjali ----------
    { id: 'cond', step: 'signal', type: 'multi', req: true, unk: true, sq: 'Çfarë duhet të ndodhë për të hapur {SIDE}?', en: 'Entry conditions', options: [
      o('ma_cross', 'MA crossover', 'MA crossover'), o('pullback', 'Pullback te një MA', 'Pullback to a MA'), o('rsi', 'RSI'), o('macd', 'MACD'), o('stoch', 'Stochastic'), o('bb', 'Bollinger Bands'),
      o('breakout', 'Breakout i një level-i', 'Level breakout'), o('retest', 'Retest pas breakout', 'Retest of a broken level'), o('candle', 'Candle pattern', 'Candle pattern'), o('fib', 'Fibonacci', 'Fibonacci retracement'),
      o('custom', 'Indikator i personalizuar nga TradingView', 'Custom TradingView indicator'), o('other', 'Tjetër', 'Other')] },
    // MA crossover
    { id: 'cx_type', step: 'signal', type: 'single', req: true, group: 'MA crossover', sq: 'Lloji', en: 'Crossover MA type', show: has('cond', 'ma_cross'), options: MA_TYPE },
    { id: 'cx_type_other', step: 'signal', type: 'text', req: true, sq: 'Cila MA saktësisht?', en: 'Crossover MA type (other)', ph: 'P.sh. WMA, HMA, VWAP', show: eq('cx_type', 'other') },
    { id: 'cx_fast', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Fast MA', en: 'Crossover fast period', ph: '9', show: has('cond', 'ma_cross'), row: 'cx' },
    { id: 'cx_slow', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Slow MA', en: 'Crossover slow period', ph: '21', show: has('cond', 'ma_cross'), row: 'cx' },
    { id: 'cx_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Crossover timeframe', show: has('cond', 'ma_cross'), options: TF_SAME },
    { id: 'cx_source', step: 'signal', type: 'single', req: true, unk: true, sq: 'Nga cili çmim?', en: 'Crossover price source', show: has('cond', 'ma_cross'), options: SOURCE },
    { id: 'cx_note', step: 'signal', type: 'text', opt: true, sq: 'Shënim për crossover-in', en: 'Crossover note', ph: 'P.sh. vlen vetëm kur crossover ndodh mbi EMA 200', show: has('cond', 'ma_cross') },
    // Pullback
    { id: 'pb_type', step: 'signal', type: 'single', req: true, group: 'Pullback te MA', sq: 'Lloji i MA-së', en: 'Pullback MA type', show: has('cond', 'pullback'), options: MA_TYPE },
    { id: 'pb_type_other', step: 'signal', type: 'text', req: true, sq: 'Cila MA saktësisht?', en: 'Pullback MA type (other)', ph: 'P.sh. WMA, HMA, VWAP', show: eq('pb_type', 'other') },
    { id: 'pb_period', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha', en: 'Pullback MA period', ph: '50', show: has('cond', 'pullback') },
    { id: 'pb_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Pullback MA timeframe', show: has('cond', 'pullback'), options: TF_SAME },
    { id: 'pb_touch', step: 'signal', type: 'single', req: true, sq: 'Sa afër duhet të vijë çmimi?', en: 'Pullback touch rule', show: has('cond', 'pullback'), options: [o('touch', 'Candle prek MA-në', 'Candle touches the MA'), o('near', 'Candle vjen brenda disa $ prej saj', 'Candle comes within a distance of the MA'), o('close_back', 'Prek MA-në dhe mbyllet në anën e trendit', 'Touches the MA and closes back on the trend side')] },
    { id: 'pb_dist', step: 'signal', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Brenda sa $?', en: 'Pullback max distance', ph: '1', show: eq('pb_touch', 'near') },
    { id: 'pb_note', step: 'signal', type: 'text', opt: true, sq: 'Shënim për pullback-un', en: 'Pullback note', show: has('cond', 'pullback') },
    // RSI
    { id: 'rsi_period', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', group: 'RSI', sq: 'Periudha', en: 'RSI period', ph: '14', show: has('cond', 'rsi') },
    { id: 'rsi_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'RSI timeframe', show: has('cond', 'rsi'), options: TF_SAME },
    { id: 'rsi_source', step: 'signal', type: 'single', req: true, unk: true, sq: 'Nga cili çmim?', en: 'RSI price source', show: has('cond', 'rsi'), options: SOURCE },
    { id: 'rsi_rule', step: 'signal', type: 'text', req: true, sq: 'Kushti i saktë', en: 'RSI condition', ph: 'P.sh. RSI kalon nga poshtë mbi 30', show: has('cond', 'rsi') },
    // MACD
    { id: 'macd_fast', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', group: 'MACD', sq: 'Fast', en: 'MACD fast', ph: '12', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_slow', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Slow', en: 'MACD slow', ph: '26', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_signal', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Signal', en: 'MACD signal', ph: '9', show: has('cond', 'macd'), row: 'macd' },
    { id: 'macd_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'MACD timeframe', show: has('cond', 'macd'), options: TF_SAME },
    { id: 'macd_rule', step: 'signal', type: 'text', req: true, sq: 'Kushti i saktë', en: 'MACD condition', ph: 'P.sh. MACD line kalon mbi signal line, nën zero', show: has('cond', 'macd') },
    // Stochastic
    { id: 'st_k', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', group: 'Stochastic', sq: '%K', en: 'Stochastic %K', ph: '14', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_d', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: '%D', en: 'Stochastic %D', ph: '3', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_slow', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Slowing', en: 'Stochastic slowing', ph: '3', show: has('cond', 'stoch'), row: 'st' },
    { id: 'st_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Stochastic timeframe', show: has('cond', 'stoch'), options: TF_SAME },
    { id: 'st_rule', step: 'signal', type: 'text', req: true, sq: 'Kushti i saktë', en: 'Stochastic condition', ph: 'P.sh. %K kalon mbi %D nën level 20', show: has('cond', 'stoch') },
    // Bollinger
    { id: 'bb_period', step: 'signal', type: 'number', req: true, num: 'int', unit: 'period', group: 'Bollinger Bands', sq: 'Periudha', en: 'Bollinger period', ph: '20', show: has('cond', 'bb'), row: 'bb' },
    { id: 'bb_dev', step: 'signal', type: 'number', req: true, num: 'pos', unit: 'mult', sq: 'Deviation', en: 'Bollinger deviation', ph: '2', show: has('cond', 'bb'), row: 'bb' },
    { id: 'bb_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Bollinger timeframe', show: has('cond', 'bb'), options: TF_SAME },
    { id: 'bb_source', step: 'signal', type: 'single', req: true, unk: true, sq: 'Nga cili çmim?', en: 'Bollinger price source', show: has('cond', 'bb'), options: SOURCE },
    { id: 'bb_rule', step: 'signal', type: 'text', req: true, sq: 'Kushti i saktë', en: 'Bollinger condition', ph: 'P.sh. candle prek lower band dhe mbyllet brenda tij', show: has('cond', 'bb') },
    // Breakout
    { id: 'br_level', step: 'signal', type: 'single', req: true, group: 'Breakout', sq: 'Cili level?', en: 'Breakout level', show: has('cond', 'breakout'), options: [o('n_high', 'High/low i disa candles të fundit', 'Highest high / lowest low of the last N candles'), o('prev_day', 'High/low i ditës së kaluar', 'Previous day high/low'), o('swing', 'Swing high/low i fundit i konfirmuar', 'Last confirmed swing high/low'), o('other', 'Tjetër', 'Other')] },
    { id: 'br_n', step: 'signal', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', en: 'Breakout lookback candles', ph: '20', show: eq('br_level', 'n_high') },
    { id: 'br_swing', step: 'signal', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Swing high konfirmohet kur është më lart se sa candles në secilën anë?', en: 'Breakout swing: candles on each side', ph: '3', show: eq('br_level', 'swing') },
    { id: 'br_other', step: 'signal', type: 'text', req: true, sq: 'Si e gjen level-in saktë?', en: 'Breakout level (own words)', show: eq('br_level', 'other') },
    { id: 'br_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Breakout timeframe', show: has('cond', 'breakout'), options: TF_SAME },
    { id: 'br_confirm', step: 'signal', type: 'single', req: true, unk: true, sq: 'Kur quhet breakout?', en: 'Breakout confirmation', show: has('cond', 'breakout'), options: [o('close', 'Candle mbyllet përtej level-it', 'Candle closes beyond the level'), o('touch', 'Mjafton prekja', 'A touch is enough'), o('close_dist', 'Mbyllet të paktën disa $ përtej', 'Closes at least a distance beyond')] },
    { id: 'br_dist', step: 'signal', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ përtej?', en: 'Breakout minimum close distance', ph: '0.5', show: eq('br_confirm', 'close_dist') },
    // Retest
    { id: 'rt_within', step: 'signal', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', group: 'Retest-i', sq: 'Brenda sa candles pas breakout?', en: 'Retest window after breakout', ph: '10', show: has('cond', 'retest') },
    { id: 'rt_tol', step: 'signal', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa afër level-it duhet të kthehet?', en: 'Retest tolerance around level', ph: '0.5', show: has('cond', 'retest') },
    { id: 'rt_confirm', step: 'signal', type: 'single', req: true, unk: true, sq: 'Si e konfirmon retest-in?', en: 'Retest confirmation', show: has('cond', 'retest'), options: [o('touch', 'Mjafton prekja e level-it', 'Touch of the level'), o('close_back', 'Prek level-in dhe mbyllet në anën e breakout', 'Touches the level and closes back on the breakout side'), o('other', 'Tjetër', 'Other')] },
    { id: 'rt_other', step: 'signal', type: 'text', req: true, sq: 'Si saktësisht?', en: 'Retest confirmation (own words)', show: eq('rt_confirm', 'other') },
    // Candle pattern
    { id: 'cp_type', step: 'signal', type: 'multi', req: true, group: 'Candle pattern', sq: 'Cilat patterns?', en: 'Candle patterns', show: has('cond', 'candle'), options: [o('engulfing', 'Engulfing'), o('pinbar', 'Pin bar'), o('inside', 'Inside bar'), o('other', 'Tjetër', 'Other')] },
    { id: 'cp_type_other', step: 'signal', type: 'text', req: true, sq: 'Cili candle pattern tjetër?', en: 'Candle pattern (other)', ph: 'P.sh. morning star, doji, hammer', show: has('cp_type', 'other') },
    { id: 'cp_def', step: 'signal', type: 'textarea', req: true, sq: 'Si e përcakton saktë secilin?', en: 'Candle pattern exact definition', ph: 'P.sh. bullish engulfing: body i candle jeshil mbulon plotësisht body-n e candle të kuq para tij', show: has('cond', 'candle') },
    { id: 'cp_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Candle pattern timeframe', show: has('cond', 'candle'), options: TF_SAME },
    // Fibonacci
    { id: 'fib_from', step: 'signal', type: 'text', req: true, group: 'Fibonacci', sq: 'Nga cili swing low te cili swing high e tërheq?', en: 'Fibonacci anchor points', ph: 'P.sh. nga swing low i fundit te swing high i fundit në H1', show: has('cond', 'fib') },
    { id: 'fib_swing', step: 'signal', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Swing high/low konfirmohet me sa candles në secilën anë?', en: 'Fibonacci swing: candles on each side', ph: '3', show: has('cond', 'fib') },
    { id: 'fib_level', step: 'signal', type: 'multi', req: true, sq: 'Në cilin level bën entry?', en: 'Fibonacci entry level', show: has('cond', 'fib'), options: [o('0.382', '0.382'), o('0.5', '0.5'), o('0.618', '0.618'), o('0.786', '0.786'), o('other', 'Tjetër', 'Other')] },
    { id: 'fib_level_other', step: 'signal', type: 'text', req: true, sq: 'Cili level saktësisht?', en: 'Fibonacci level (other)', ph: 'P.sh. 0.705', show: has('fib_level', 'other') },
    { id: 'fib_entry', step: 'signal', type: 'single', req: true, unk: true, sq: 'Kur quhet i arritur level-i?', en: 'Fibonacci level trigger', show: has('cond', 'fib'), options: [o('touch', 'Kur çmimi e prek', 'Price touches the level'), o('close', 'Kur candle mbyllet atje dhe kthehet', 'Candle closes at the level and turns')] },
    { id: 'fib_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Fibonacci timeframe', show: has('cond', 'fib'), options: TF_SAME },
    // Custom indicator
    { id: 'cu_name', step: 'signal', type: 'text', req: true, group: 'Indikatori i personalizuar', sq: 'Emri i indikatorit në TradingView', en: 'Custom indicator name', show: has('cond', 'custom') },
    { id: 'cu_rule', step: 'signal', type: 'text', req: true, sq: 'Çfarë signal jep dhe si e përdor?', en: 'Custom indicator signal used', ph: 'P.sh. shigjeta jeshile poshtë candle = BUY', show: has('cond', 'custom') },
    { id: 'cu_code', step: 'signal', type: 'single', req: true, sq: 'A e ke kodin ose formulat?', en: 'Custom indicator code availability', show: has('cond', 'custom'), options: [o('pine', 'Po, do ta dërgoj kodin Pine Script', 'Pine Script code will be sent separately'), o('formula', 'Po, i shkruaj formulat këtu', 'Formulas written below'), o('none', 'Nuk e kam kodin', 'No code available')] },
    { id: 'cu_formula', step: 'signal', type: 'textarea', req: true, sq: 'Formulat e plota', en: 'Custom indicator formulas', show: eq('cu_code', 'formula') },
    { id: 'cu_repaint', step: 'signal', type: 'single', req: true, unk: true, sq: 'Pasi del një signal, a ndryshon, zhduket ose zhvendoset më vonë (repaint)?', en: 'Custom indicator repaints', show: has('cond', 'custom'), options: [o('no', 'Jo, mbetet aty ku doli', 'No, signals never change after they appear'), o('yes', 'Po, ndonjëherë ndryshon', 'Yes, signals can change, vanish or move')] },
    { id: 'cu_tf', step: 'signal', type: 'single', req: true, sq: 'Timeframe', en: 'Custom indicator timeframe', show: has('cond', 'custom'), options: TF_SAME },
    // Other
    { id: 'ot_text', step: 'signal', type: 'textarea', req: true, group: 'Kushti tjetër', sq: 'Përshkruaje saktë, me numra', en: 'Other condition', show: has('cond', 'other') },
    // Combination
    { id: 'combine', step: 'signal', type: 'single', req: true, unk: true, sq: 'Sa kushte duhen?', en: 'How conditions combine', show: { q: 'cond', countGt: 1 }, options: [o('all', 'Të gjitha', 'All conditions must be true'), o('any', 'Mjafton njëri', 'Any one condition is enough'), o('custom', 'Një kombinim', 'Custom combination')] },
    { id: 'combine_text', step: 'signal', type: 'text', req: true, sq: 'Cili kombinim?', en: 'Custom combination', ph: 'P.sh. (MA crossover DHE RSI) OSE Breakout', show: eq('combine', 'custom') },
    { id: 'seq', step: 'signal', type: 'single', req: true, unk: true, sq: 'Kur duhet të plotësohen?', en: 'Timing between conditions', show: all({ q: 'cond', countGt: 1 }, { q: 'combine', nin: ['any'] }), options: [o('same', 'Në të njëjtin candle', 'All on the same candle'), o('order', 'Me radhë, njëri pas tjetrit', 'In sequence')] },
    { id: 'seq_order', step: 'signal', type: 'text', req: true, sq: 'Në çfarë rendi?', en: 'Sequence order', ph: 'P.sh. 1) MA crossover, 2) RSI kalon 50', show: eq('seq', 'order') },
    { id: 'seq_window', step: 'signal', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'I gjithë rendi duhet të ndodhë brenda sa candles?', en: 'Sequence window', ph: '3', show: eq('seq', 'order') },
    { id: 'seq_valid', step: 'signal', type: 'single', req: true, unk: true, sq: 'Kur ndodh kushti i fundit, a duhet që të mëparshmit të jenë ende të vlefshëm?', en: 'Earlier conditions must still be valid', show: eq('seq', 'order'), options: [o('yes', 'Po, duhet të vlejnë ende', 'Yes, they must still hold'), o('no', 'Jo, mjafton që kanë ndodhur', 'No, it is enough that they happened')] },
    { id: 'sig_candle', step: 'signal', type: 'single', req: true, unk: true, sq: 'Kushtet e signal-it kontrollohen:', en: 'Signal evaluated on', options: [o('closed', 'Kur mbyllet candle', 'Closed candle'), o('forming', 'Brenda candle-it që po formohet', 'Forming (unclosed) candle')] },
    { id: 'own_words', step: 'signal', type: 'textarea', opt: true, sq: 'Shpjegoje edhe me fjalët e tua, hap pas hapi', en: 'Entry rule in the trader\'s own words', ph: '1. …\n2. …\n3. …' },
    { id: 'mirror', step: 'signal', type: 'single', req: true, sq: 'A është SELL pasqyrim i saktë i BUY?', hint: 'Pasqyrim do të thotë: çdo rregull i kundërt, edhe entry edhe exit.', en: 'SELL is an exact mirror of BUY (entries and exits)', show: eq('sides', 'both'), options: [o('mirror', 'Po, saktësisht i kundërt', 'Yes, exact mirror including exits'), o('differs', 'Jo, SELL ndryshon', 'No, SELL differs')] },
    { id: 'sell_entry', step: 'signal', type: 'textarea', req: true, sq: 'Si bën entry në SELL?', en: 'SELL entry rules', show: eq('mirror', 'differs') },
    { id: 'sell_exits', step: 'signal', type: 'single', req: true, sq: 'A ndryshojnë edhe exit-et (SL, TP, trade management) për SELL?', en: 'SELL exits differ', show: eq('mirror', 'differs'), options: [o('same', 'Jo, janë si te BUY', 'No, same as BUY'), o('differ', 'Po, ndryshojnë', 'Yes, they differ')] },
    { id: 'sell_exits_text', step: 'signal', type: 'textarea', req: true, sq: 'Si ndryshojnë exit-et për SELL?', en: 'SELL exit rules', show: eq('sell_exits', 'differ') },

    // ---------- 4. Hyrja ----------
    { id: 'exe', step: 'entry', type: 'single', req: true, unk: true, sq: 'Pasi konfirmohet signal-i, si dërgohet order-i?', en: 'Order execution after signal confirmation', options: [o('market_close', 'Market order, sapo mbyllet signal candle', 'Market order immediately at the close of the signal candle'), o('market_now', 'Market order, në momentin që plotësohen kushtet', 'Market order the moment conditions are met (intrabar)'), o('stop', 'Stop order përtej signal candle', 'Stop order beyond the signal candle'), o('limit', 'Limit order te një level', 'Limit order at a level')] },
    { id: 'pd_level', step: 'entry', type: 'text', req: true, group: 'Pending order', sq: 'Nga cila pikë matet pending order?', en: 'Pending order reference', ph: 'P.sh. high i signal candle', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_dist', step: 'entry', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ larg asaj pike?', en: 'Pending order distance from reference', ph: '0.5', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_expiry', step: 'entry', type: 'number', req: true, unk: true, num: 'int', unit: 'candles', sq: 'Fshihet nëse s\'aktivizohet pas sa candles?', en: 'Pending order expiry', ph: '3', show: inn('exe', ['stop', 'limit']) },
    { id: 'pd_dirchange', step: 'entry', type: 'single', req: true, unk: true, sq: 'Nëse ndryshon drejtimi (hapi 2):', en: 'Pending order when direction changes', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_opposite', step: 'entry', type: 'single', req: true, unk: true, sq: 'Nëse del opposite signal:', en: 'Pending order on opposite signal', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_session', step: 'entry', type: 'single', req: true, unk: true, sq: 'Kur mbarojnë trading hours:', en: 'Pending order at end of trading hours', show: inn('exe', ['stop', 'limit']), options: KEEP_CANCEL },
    { id: 'pd_news', step: 'entry', type: 'single', req: true, unk: true, sq: 'Kur afrohet një news që e shmang:', en: 'Pending order before an avoided news event', show: all(inn('exe', ['stop', 'limit']), eq('news', 'yes')), options: KEEP_CANCEL },
    { id: 'spread_filter', step: 'entry', type: 'single', req: true, unk: true, sq: 'Mos hyjë roboti kur spread-i është shumë i lartë?', en: 'Max spread filter', options: [o('dev', 'Po, vlerën e vendos programuesi', 'Yes, developer sets a value for XAUUSD.r'), o('value', 'Po, kam një vlerë', 'Yes, trader value'), o('no', 'Jo', 'No spread filter')] },
    { id: 'spread_value', step: 'entry', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Max spread', hint: 'Diferenca mes Ask dhe Bid, në $ të çmimit të arit.', en: 'Max spread', ph: '0.40', show: eq('spread_filter', 'value') },
    { id: 'spread_block', step: 'entry', type: 'single', req: true, unk: true, sq: 'Kur spread-i e bllokon entry-n:', en: 'When spread blocks entry', show: inn('spread_filter', ['dev', 'value']), options: [o('cancel', 'Signal-i anulohet', 'Signal is cancelled'), o('wait', 'Pret derisa spread-i të bjerë', 'Wait for spread to drop')] },
    { id: 'spread_wait', step: 'entry', type: 'number', req: true, unk: true, num: 'int', unit: 'min', sq: 'Pret maksimum sa minuta?', en: 'Max wait for spread', ph: '5', show: eq('spread_block', 'wait') },
    { id: 'spread_wait_valid', step: 'entry', type: 'single', req: true, unk: true, sq: 'Pas pritjes, bën entry vetëm nëse kushtet janë ende të plotësuara?', en: 'After waiting, conditions must still hold', show: eq('spread_block', 'wait'), options: [o('yes', 'Po', 'Yes, conditions must still hold'), o('no', 'Jo, hyn gjithsesi', 'No, enter anyway')] },
    { id: 'new_signal', step: 'entry', type: 'single', req: true, unk: true, sq: 'Çfarë quhet signal i ri?', en: 'Definition of a new signal', options: [o('reset', 'Kushtet duhet të prishen dhe të plotësohen sërish', 'Conditions must reset and form again'), o('new_candle', 'Çdo candle i ri që i plotëson kushtet', 'Every new candle that meets the conditions')] },
    { id: 'entries_per_signal', step: 'entry', type: 'single', req: true, unk: true, sq: 'Sa entry lejohen për të njëjtin signal?', en: 'Entries allowed per signal', options: [o('1', 'Vetëm 1', 'Only one'), o('more', 'Më shumë se 1', 'More than one')] },
    { id: 'entries_n', step: 'entry', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa gjithsej?', en: 'Entries per signal', ph: '2', show: eq('entries_per_signal', 'more') },
    { id: 'cooldown', step: 'entry', type: 'single', req: true, unk: true, sq: 'Pas mbylljes së një trade, pret para re-entry?', en: 'Cooldown after a trade closes', options: [o('none', 'Jo', 'No cooldown'), o('candles', 'Po, disa candles', 'Yes, a number of candles'), o('minutes', 'Po, disa minuta', 'Yes, a number of minutes')] },
    { id: 'cooldown_n', step: 'entry', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', en: 'Cooldown candles', show: eq('cooldown', 'candles') },
    { id: 'cooldown_min', step: 'entry', type: 'number', req: true, num: 'int', unit: 'min', sq: 'Sa minuta?', en: 'Cooldown minutes', show: eq('cooldown', 'minutes') },
    { id: 'opposite', step: 'entry', type: 'single', req: true, unk: true, sq: 'Je në BUY dhe del signal SELL. Çfarë bën?', en: 'Opposite signal while a trade is open', show: eq('sides', 'both'), options: [o('ignore', 'E injoroj', 'Ignore it, trade runs to SL/TP'), o('close', 'E mbyll trade-in', 'Close the open trade only'), o('reverse', 'E mbyll dhe hap SELL', 'Close and open the opposite trade')] },
    { id: 'skip', step: 'entry', type: 'multi', req: true, unk: true, sq: 'A ka raste kur ka signal, por nuk bën entry?', en: 'Skip a valid signal when', options: [o('never', 'Jo, bëj entry gjithmonë', 'Never, always take valid signals'), o('far_ma', 'Çmimi shumë larg MA-së', 'Price too far from a MA'), o('big', 'Signal candle shumë i madh', 'Signal candle too big'), o('range', 'Ranging market', 'Market ranging'), o('level', 'Afër një key level', 'Too close to a strong level'), o('other', 'Tjetër', 'Other')] },
    { id: 'skip_far_ma_which', step: 'entry', type: 'text', req: true, sq: 'Cila MA?', en: 'Skip: which MA', ph: 'P.sh. EMA 50 në M15', show: has('skip', 'far_ma') },
    { id: 'skip_far_ma_usd', step: 'entry', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Nuk bën entry kur çmimi është më shumë se sa $ larg saj?', en: 'Skip: max distance from MA', ph: '8', show: has('skip', 'far_ma') },
    { id: 'skip_big_usd', step: 'entry', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Nuk bën entry kur candle (high minus low) kalon sa $?', en: 'Skip: max signal candle range', ph: '10', show: has('skip', 'big') },
    { id: 'skip_range', step: 'entry', type: 'text', req: true, sq: 'Si e dallon ranging market?', en: 'Skip: ranging market definition', ph: 'P.sh. EMA 50 dhe EMA 200 janë brenda 2$ nga njëra-tjetra', show: has('skip', 'range') },
    { id: 'skip_level', step: 'entry', type: 'text', req: true, sq: 'Cili level?', en: 'Skip: which strong level', ph: 'P.sh. high ose low i ditës së kaluar', show: has('skip', 'level') },
    { id: 'skip_level_usd', step: 'entry', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Nuk bën entry kur je brenda sa $ prej tij?', en: 'Skip: distance to strong level', ph: '3', show: has('skip', 'level') },
    { id: 'skip_other', step: 'entry', type: 'text', req: true, sq: 'Cili rast tjetër, me numra?', en: 'Skip: other case', show: has('skip', 'other') },

    // ---------- 5. Risku ----------
    { id: 'cap_group', step: 'risk', type: 'info', variant: 'section', sq: 'Kapitali dhe monedha', text: 'Me çfarë kapitali planifikon ta përdorësh robotin dhe në cilën monedhë është llogaria?' },
    { id: 'account_ccy', step: 'risk', type: 'single', req: true, unk: true, sq: 'Në cilën monedhë është llogaria?', en: 'Account currency', options: [o('USD', 'USD'), o('EUR', 'EUR'), o('other', 'Tjetër', 'Other')] },
    { id: 'account_ccy_other', step: 'risk', type: 'text', req: true, sq: 'Cila monedhë?', en: 'Account currency (other)', ph: 'P.sh. GBP', max: 10, show: eq('account_ccy', 'other') },
    { id: 'capital', step: 'risk', type: 'number', req: true, unk: true, num: 'pos', unit: 'ccy', sq: 'Me çfarë kapitali planifikon ta përdorësh robotin?', en: 'Planned trading capital', ph: '10000' },
    { id: 'size_method', step: 'risk', type: 'single', req: true, unk: true, sq: 'Si dëshiron ta përcaktojë roboti sasinë (lot size) që hap në çdo trade?', hint: 'Roboti përdor vetëm një nga këto mënyra. Limitet e tjera të risk-ut vlejnë në çdo mënyrë.', en: 'Position sizing method (only one active)', options: [
      o('fixed_lot', 'Lot fiks: e njëjta madhësi në çdo trade', 'Fixed lot: same volume on every trade'),
      o('risk_pct', 'Risk në përqindje: roboti llogarit lot-in sipas % që zgjedh dhe distancës së Stop Loss-it', 'Risk %: volume computed from the chosen % and the SL distance'),
      o('risk_money', 'Risk monetar fiks: roboti llogarit lot-in sipas shumës që do të rrezikosh deri te Stop Loss-i', 'Fixed money risk: volume computed from a fixed amount risked to the SL')] },
    { id: 'size_info_fixed', step: 'risk', type: 'info', sq: 'Kujdes', text: 'Lot fiks nuk do të thotë humbje fikse. Kur ndryshon distanca e Stop Loss-it, ndryshon edhe shuma që humbet. P.sh. me kontratë standarde, 0.10 lot humbet rreth 50$ me SL 5$, por rreth 100$ me SL 10$.', show: eq('size_method', 'fixed_lot') },
    { id: 'lot_fixed', step: 'risk', type: 'number', req: true, num: 'pos', unit: 'lot', sq: 'Sa lot për çdo trade?', en: 'Fixed lot per trade', ph: '0.10', show: eq('size_method', 'fixed_lot') },
    { id: 'risk_pct', step: 'risk', type: 'number', req: true, num: 'pct', unit: 'pct', fact: 'risk', def: '1', sq: 'Sa %?', hint: 'Sa % e llogarisë humbet nëse trade mbyllet në SL.', en: 'Risk per trade', show: eq('size_method', 'risk_pct') },
    { id: 'risk_base', step: 'risk', type: 'single', req: true, unk: true, sq: 'Nga balance apo equity?', en: 'Risk % calculated from', show: eq('size_method', 'risk_pct'), options: [o('balance', 'Balance: paratë në llogari, pa open trades', 'Balance'), o('equity', 'Equity: balance plus ose minus open trades', 'Equity')] },
    { id: 'risk_money', step: 'risk', type: 'number', req: true, num: 'pos', unit: 'ccy', sq: 'Sa para për çdo trade?', hint: 'Shuma që humbet nëse trade mbyllet në SL.', en: 'Fixed money risk per trade', ph: '100', show: eq('size_method', 'risk_money') },
    { id: 'lot_cap', step: 'risk', type: 'single', req: true, unk: true, sq: 'A dëshiron një kufi maksimal loti për çdo trade?', en: 'Maximum lot per trade', options: [o('no', 'Jo', 'No cap (broker maximum still applies)'), o('yes', 'Po', 'Yes')] },
    { id: 'lot_cap_value', step: 'risk', type: 'number', req: true, num: 'pos', unit: 'lot', sq: 'Maksimumi i lot-it për trade', en: 'Max lot per trade', ph: '0.50', show: eq('lot_cap', 'yes') },
    { id: 'size_conflict', step: 'risk', type: 'single', req: true, unk: true, sq: 'Nëse madhësia e kërkuar kalon një limit (max lot, limitet e risk-ut ose të brokerit), roboti:', hint: 'Roboti nuk e ndryshon madhësinë pa e regjistruar, dhe kurrë nuk e rrit mbi risk-un e lejuar.', en: 'When the requested size conflicts with a risk or broker limit', options: [o('skip', 'E anashkalon trade-in', 'Skip the trade'), o('reduce', 'E zvogëlon lot-in deri te limiti i lejuar', 'Reduce the volume down to the allowed limit')] },
    { id: 'max_trades', step: 'risk', type: 'number', req: true, num: 'int', unit: 'count', fact: 'maxtrades', def: '3', sq: 'Max trades në ditë', en: 'Max trades per day' },
    { id: 'max_open', step: 'risk', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa trades mund të jenë open njëkohësisht?', en: 'Max positions open at the same time', ph: '1' },
    { id: 'combined_risk', step: 'risk', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Max risk total i tyre', en: 'Max combined risk of open positions', show: { q: 'max_open', gt: 1 } },
    { id: 'count_partial', step: 'risk', type: 'single', req: true, unk: true, sq: 'Trade me partial close numërohet si:', en: 'Partially closed trade counts as', show: eq('mg_partial', 'yes'), options: [o('one', 'Një trade', 'One trade'), o('each', 'Çdo partial close si trade më vete', 'Each partial close counts as a trade')] },
    { id: 'after_win', step: 'risk', type: 'single', req: true, unk: true, sq: 'Nëse trade i parë i ditës del win, a vazhdon?', en: 'After a winning trade', options: [o('continue', 'Po, deri në max trades të ditës', 'Keep trading up to the daily max'), o('stop', 'Jo, ndalem për atë ditë', 'Stop for the day after a win')] },
    { id: 'loss_stop', step: 'risk', type: 'single', req: true, unk: true, sq: 'A ndalet pas disa losses, para se të arrijë max trades?', en: 'Stop after losses', options: [o('none', 'Jo', 'No'), o('consecutive', 'Po, pas disa losses radhazi', 'Yes, after consecutive losses'), o('total', 'Po, pas disa losses gjithsej në ditë', 'Yes, after total losses in the day')] },
    { id: 'loss_stop_n', step: 'risk', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Pas sa losses?', en: 'Losses before stopping', ph: '2', show: inn('loss_stop', ['consecutive', 'total']) },
    { id: 'be_counts', step: 'risk', type: 'single', req: true, unk: true, sq: 'Trade që mbyllet në break-even, për këtë rregull quhet:', en: 'Break-even close counts as', show: all(inn('loss_stop', ['consecutive', 'total']), eq('mg_be', 'yes')), options: [o('neutral', 'As win, as loss', 'Neither win nor loss'), o('loss', 'Loss', 'Loss'), o('win', 'Win', 'Win')] },
    { id: 'daily_loss', step: 'risk', type: 'single', req: true, unk: true, sq: 'A ka daily loss limit në %, përveç max trades?', en: 'Daily loss limit', options: [o('no', 'Jo', 'No'), o('yes', 'Po', 'Yes')] },
    { id: 'dl_pct', step: 'risk', type: 'number', req: true, num: 'pct', unit: 'pct', sq: 'Daily loss limit', en: 'Daily loss limit', ph: '2', show: eq('daily_loss', 'yes') },
    { id: 'dl_base', step: 'risk', type: 'single', req: true, unk: true, sq: 'Ky % llogaritet nga:', en: 'Daily limit base', show: eq('daily_loss', 'yes'), options: [o('balance_start', 'Balance në fillim të ditës', 'Balance at start of day'), o('equity_start', 'Equity në fillim të ditës', 'Equity at start of day')] },
    { id: 'dl_floating', step: 'risk', type: 'single', req: true, unk: true, sq: 'Përfshin floating loss të open trades?', en: 'Daily limit includes floating losses', show: eq('daily_loss', 'yes'), options: [o('yes', 'Po', 'Yes, includes open positions'), o('no', 'Jo, vetëm closed trades', 'No, closed trades only')] },
    { id: 'dl_scope', step: 'risk', type: 'single', req: true, unk: true, sq: 'Vlen për:', en: 'Daily limit scope', show: eq('daily_loss', 'yes'), options: [o('robot', 'Vetëm trades e robotit', 'This EA only'), o('account', 'Gjithë llogarinë', 'Whole account')] },
    { id: 'dl_action', step: 'risk', type: 'single', req: true, unk: true, sq: 'Kur arrihet limit-i, roboti:', en: 'Action when daily limit is hit', show: eq('daily_loss', 'yes'), options: [o('stop', 'Nuk hap trades të reja', 'Stops new entries'), o('stop_cancel', 'Nuk hap të reja dhe fshin pending orders', 'Stops entries and cancels pending orders'), o('stop_cancel_close', 'Edhe mbyll open trades', 'Stops entries, cancels pending orders and closes open positions')] },
    { id: 'day_reset', step: 'risk', type: 'single', req: true, unk: true, sq: 'Dita e re (numërimi i trades dhe limitet) fillon:', en: 'Daily reset time', options: [o('albania', 'Në mesnatë, ora e Shqipërisë', 'Midnight, Albania time (Europe/Tirane)'), o('server', 'Në mesnatë, ora e serverit të Tauro', 'Midnight, broker server time'), o('other', 'Në një orë tjetër', 'Other time')] },
    { id: 'day_reset_other', step: 'risk', type: 'text', req: true, sq: 'Në cilën orë dhe sipas cilës zonë kohore?', en: 'Daily reset (other)', ph: 'P.sh. 08:00 ora e Shqipërisë', show: eq('day_reset', 'other') },
    { id: 'account_kind', step: 'risk', type: 'single', req: true, unk: true, sq: 'Llogaria është:', en: 'Account kind', options: [o('personal', 'Personale', 'Personal'), o('prop', 'Prop firm (llogari e financuar)', 'Prop firm')] },
    { id: 'prop_name', step: 'risk', type: 'text', req: true, sq: 'Cila prop firm?', en: 'Prop firm', show: eq('account_kind', 'prop') },
    { id: 'prop_daily', step: 'risk', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Daily loss limit', en: 'Prop firm daily loss limit', show: eq('account_kind', 'prop'), row: 'prop' },
    { id: 'prop_maxdd', step: 'risk', type: 'number', req: true, unk: true, num: 'pct', unit: 'pct', sq: 'Max drawdown', en: 'Prop firm max drawdown', show: eq('account_kind', 'prop'), row: 'prop' },
    { id: 'prop_rules', step: 'risk', type: 'textarea', opt: true, sq: 'Rregulla të tjera të prop firm-ës', en: 'Other prop firm rules', ph: 'P.sh. pa trades gjatë news, pa positions gjatë fundjavës', show: eq('account_kind', 'prop') },
    { id: 'other_trading', step: 'risk', type: 'single', req: true, unk: true, sq: 'A bën trade dikush ose diçka tjetër në të njëjtën llogari?', en: 'Other trading on the same account', options: [o('none', 'Jo, vetëm roboti', 'No, only this EA'), o('manual', 'Po, unë manualisht', 'Yes, manual trades'), o('robots', 'Po, robotë të tjerë', 'Yes, other EAs'), o('both', 'Po, të dyja', 'Yes, manual trades and other EAs')] },

    // ---------- 6. SL, TP dhe menaxhimi ----------
    { id: 'sl_method', step: 'exits', type: 'single', req: true, unk: true, sq: 'Ku e vendos Stop Loss-in?', en: 'Stop loss placement', options: [o('swing', 'Përtej swing low/high të fundit', 'Beyond the last swing low/high'), o('signal_candle', 'Përtej signal candle', 'Beyond the signal candle low/high'), o('fixed', 'Distancë fikse', 'Fixed distance'), o('atr', 'Me ATR', 'ATR-based'), o('other', 'Tjetër', 'Other')] },
    { id: 'sl_sw_def', step: 'exits', type: 'single', req: true, unk: true, sq: 'Si e gjen swing low?', en: 'SL swing definition', show: eq('sl_method', 'swing'), options: [o('lowest_n', 'Low më i ulët i disa candles të fundit', 'Lowest low of the last N candles'), o('fractal', 'Swing low i konfirmuar me candles në të dy anët', 'Confirmed swing (fractal) with N candles each side')] },
    { id: 'sl_sw_n', step: 'exits', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Sa candles?', en: 'SL swing candles', ph: '10', show: inn('sl_sw_def', ['lowest_n', 'fractal']) },
    { id: 'sl_sw_buf', step: 'exits', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej swing low?', en: 'SL buffer beyond swing', ph: '1', show: eq('sl_method', 'swing') },
    { id: 'sl_sc_buf', step: 'exits', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej candle?', en: 'SL buffer beyond signal candle', ph: '0.5', show: eq('sl_method', 'signal_candle') },
    { id: 'sl_fixed', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ larg entry-t?', en: 'SL fixed distance', ph: '5', show: eq('sl_method', 'fixed') },
    { id: 'sl_atr_period', step: 'exits', type: 'number', req: true, num: 'int', unit: 'period', sq: 'Periudha e ATR', en: 'SL ATR period', ph: '14', show: eq('sl_method', 'atr'), row: 'slatr' },
    { id: 'sl_atr_mult', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'mult', sq: 'Multiplier', en: 'SL ATR multiplier', ph: '1.5', show: eq('sl_method', 'atr'), row: 'slatr' },
    { id: 'sl_atr_tf', step: 'exits', type: 'single', req: true, sq: 'Timeframe i ATR', en: 'SL ATR timeframe', show: eq('sl_method', 'atr'), options: TF_SAME },
    { id: 'sl_other', step: 'exits', type: 'text', req: true, sq: 'Si e vendos saktë?', en: 'SL (own words)', show: eq('sl_method', 'other') },
    { id: 'sl_max', step: 'exits', type: 'single', req: true, unk: true, sq: 'Nëse SL del shumë i madh, e anashkalon trade-in?', en: 'Skip trade if SL is too large', options: [o('no', 'Jo, bëj entry gjithmonë', 'No, always take the trade'), o('yes', 'Po', 'Yes')] },
    { id: 'sl_max_usd', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Nëse SL është më i madh se:', en: 'Max SL distance', ph: '15', show: eq('sl_max', 'yes') },
    { id: 'tp_method', step: 'exits', type: 'single', req: true, unk: true, sq: 'Si e vendos Take Profit-in?', en: 'Take profit method', options: [o('r', 'Si shumëfish i 1R', 'Multiple of the initial risk (R)'), o('level', 'Te një level', 'At a price level')] },
    { id: 'tp_r', step: 'exits', type: 'single', req: true, sq: 'Sa R?', en: 'Take profit multiple', show: eq('tp_method', 'r'), options: [o('2', '1:2 (2R)', '2R'), o('3', '1:3 (3R)', '3R'), o('custom', 'Tjetër', 'Custom'), o('depends', 'Varet', 'Depends on conditions')] },
    { id: 'tp_r_custom', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Sa R saktë?', en: 'Take profit multiple (custom)', ph: '2.5', show: eq('tp_r', 'custom') },
    { id: 'tp_depends', step: 'exits', type: 'text', req: true, unk: true, sq: 'Kur zgjedh cilin R, saktë?', en: 'Take profit selection rule', ph: 'P.sh. 3R kur çmimi është mbi EMA 200 në H4, përndryshe 2R', show: eq('tp_r', 'depends') },
    { id: 'tp_level', step: 'exits', type: 'text', req: true, sq: 'Cili level?', en: 'Take profit level', ph: 'P.sh. high i ditës së kaluar', show: eq('tp_method', 'level') },
    { id: 'mg_be', step: 'exits', type: 'single', req: true, unk: true, sq: 'E kalon SL-në në break-even?', en: 'Break-even', options: YESNO },
    { id: 'be_trigger', step: 'exits', type: 'single', req: true, sq: 'Kur?', en: 'Break-even trigger', show: eq('mg_be', 'yes'), options: [o('r', 'Kur profit-i arrin disa R', 'When profit reaches X R'), o('usd', 'Kur çmimi lëviz disa $ në profit', 'When price moves X USD in profit')] },
    { id: 'be_trigger_r', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Sa R?', en: 'Break-even trigger (R)', ph: '1', show: eq('be_trigger', 'r') },
    { id: 'be_trigger_usd', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $?', en: 'Break-even trigger (USD move)', ph: '5', show: eq('be_trigger', 'usd') },
    { id: 'be_level', step: 'exits', type: 'single', req: true, unk: true, sq: 'Ku shkon SL-ja e re?', en: 'New SL level at break-even', show: eq('mg_be', 'yes'), options: [o('entry', 'Saktë te entry', 'Exactly at entry'), o('entry_costs', 'Te entry plus kostot (spread, commission)', 'Entry plus costs (spread, commission)'), o('entry_plus', 'Te entry plus disa $', 'Entry plus a USD amount')] },
    { id: 'be_plus', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ mbi entry?', en: 'Break-even offset', ph: '0.5', show: eq('be_level', 'entry_plus') },
    { id: 'mg_partial', step: 'exits', type: 'single', req: true, unk: true, sq: 'Bën partial close para TP-së?', en: 'Partial close', options: YESNO },
    { id: 'pc1_r', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Partial close 1: te sa R?', en: 'Partial 1 at (R)', ph: '1', show: eq('mg_partial', 'yes'), row: 'pc1' },
    { id: 'pc1_pct', step: 'exits', type: 'number', req: true, num: 'pct', unit: 'pctv', sq: 'Sa %?', en: 'Partial 1 size', ph: '50', show: eq('mg_partial', 'yes'), row: 'pc1' },
    { id: 'pc2_r', step: 'exits', type: 'number', opt: true, num: 'pos', unit: 'r', sq: 'Partial close 2: te sa R?', en: 'Partial 2 at (R)', show: eq('mg_partial', 'yes'), row: 'pc2', pair: 'pc2_pct' },
    { id: 'pc2_pct', step: 'exits', type: 'number', opt: true, num: 'pct', unit: 'pctv', sq: 'Sa %?', en: 'Partial 2 size', show: eq('mg_partial', 'yes'), row: 'pc2', pair: 'pc2_r' },
    { id: 'pc_base', step: 'exits', type: 'single', req: true, unk: true, sq: 'Përqindja llogaritet nga:', en: 'Partial % based on', show: eq('mg_partial', 'yes'), options: [o('initial', 'Volume fillestar', 'Initial volume'), o('remaining', 'Volume që ka mbetur', 'Remaining volume')] },
    { id: 'pc_rest', step: 'exits', type: 'single', req: true, unk: true, sq: 'Pjesa që mbetet:', en: 'Remaining volume after partial', show: eq('mg_partial', 'yes'), options: [o('tp', 'Vazhdon deri te TP ose SL', 'Runs to TP or SL'), o('be', 'SL kalon në break-even', 'SL moves to break-even'), o('trail', 'Ndiqet me trailing stop', 'Managed by trailing stop')] },
    { id: 'mg_trail', step: 'exits', type: 'single', req: true, unk: true, sq: 'Përdor trailing stop?', en: 'Trailing stop', options: YESNO },
    { id: 'tr_method', step: 'exits', type: 'single', req: true, sq: 'Si e ndjek çmimin?', en: 'Trailing method', show: eq('mg_trail', 'yes'), options: [o('fixed', 'Me distancë fikse në $', 'Fixed USD distance'), o('atr', 'Me ATR', 'ATR-based'), o('swing', 'Pas swing low/high të fundit', 'Behind the last swing'), o('candle', 'Pas candle-it të mëparshëm', 'Behind the previous candle')] },
    { id: 'tr_dist', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $ prapa çmimit?', en: 'Trailing distance', ph: '5', show: eq('tr_method', 'fixed') },
    { id: 'tr_atr', step: 'exits', type: 'text', req: true, sq: 'Periudha dhe shumëzuesi i ATR', en: 'Trailing ATR settings', ph: 'P.sh. ATR 14 × 2', show: eq('tr_method', 'atr') },
    { id: 'tr_swing_n', step: 'exits', type: 'number', req: true, num: 'int', unit: 'candles', sq: 'Swing low konfirmohet me sa candles në secilën anë?', en: 'Trailing swing candles', ph: '3', show: eq('tr_method', 'swing') },
    { id: 'tr_buf', step: 'exits', type: 'number', req: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ përtej?', en: 'Trailing buffer', ph: '0.5', show: inn('tr_method', ['swing', 'candle']) },
    { id: 'tr_activate', step: 'exits', type: 'single', req: true, unk: true, sq: 'Kur aktivizohet?', en: 'Trailing activation', show: eq('mg_trail', 'yes'), options: [o('immediate', 'Menjëherë pas entry', 'Immediately'), o('r', 'Kur profit-i arrin disa R', 'At X R profit'), o('usd', 'Kur çmimi lëviz disa $ në profit', 'After X USD in profit')] },
    { id: 'tr_act_r', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'r', sq: 'Sa R?', en: 'Trailing activation (R)', ph: '1', show: eq('tr_activate', 'r') },
    { id: 'tr_act_usd', step: 'exits', type: 'number', req: true, num: 'pos', unit: 'usd', sq: 'Sa $?', en: 'Trailing activation (USD)', ph: '5', show: eq('tr_activate', 'usd') },
    { id: 'tr_step', step: 'exits', type: 'number', opt: true, num: 'nonneg', unit: 'usd', sq: 'Trailing step minimal', hint: 'Lëre bosh nëse SL lëviz me çdo përmirësim.', en: 'Trailing step', ph: '0.5', show: eq('mg_trail', 'yes') },
    { id: 'tr_freq', step: 'exits', type: 'single', req: true, unk: true, sq: 'Sa shpesh përditësohet?', en: 'Trailing update frequency', show: eq('mg_trail', 'yes'), options: [o('tick', 'Me çdo lëvizje të çmimit', 'Every tick'), o('candle', 'Në mbyllje të çdo candle', 'On each candle close')] },
    { id: 'mg_priority', step: 'exits', type: 'text', req: true, unk: true, sq: 'Nëse disa rregulla aktivizohen njëkohësisht, cili ka përparësi?', en: 'Priority between management rules', ph: 'P.sh. fillimisht partial close, pastaj break-even, pastaj trailing', show: { countYes: ['mg_be', 'mg_partial', 'mg_trail'], gt: 1 } },

    // ---------- 7. Oraret dhe lajmet ----------
    { id: 'days', step: 'time', type: 'multi', req: true, sq: 'Në cilat ditë bën trade?', en: 'Trading days', options: [o('mon', 'E hënë', 'Mon'), o('tue', 'E martë', 'Tue'), o('wed', 'E mërkurë', 'Wed'), o('thu', 'E enjte', 'Thu'), o('fri', 'E premte', 'Fri')] },
    { id: 't_from', step: 'time', type: 'time', req: true, unk: true, sq: 'Nga ora', en: 'Trading hours from', row: 'hours' },
    { id: 't_to', step: 'time', type: 'time', req: true, unk: true, sq: 'Deri në orën', en: 'Trading hours to', row: 'hours' },
    { id: 't_tz', step: 'time', type: 'single', req: true, unk: true, sq: 'Sipas cilës orë?', en: 'Timezone of trading hours', options: [o('albania', 'Ora e Shqipërisë', 'Albania time (Europe/Tirane)'), o('utc', 'UTC'), o('ny', 'Ora e New York-ut', 'New York time'), o('server', 'Ora e serverit të Tauro', 'Broker server time')] },
    { id: 't_dst', step: 'time', type: 'single', req: true, unk: true, sq: 'Kur ndërrohet ora verore/dimërore:', en: 'DST handling', show: { q: 't_tz', nin: ['utc', UNKNOWN] }, options: [o('follow', 'Oraret mbeten të njëjta sipas orës lokale', 'Hours follow local clock (DST-aware)'), o('fixed', 'Oraret mbeten fikse sipas UTC', 'Hours stay fixed in UTC all year')] },
    { id: 'end_positions', step: 'time', type: 'single', req: true, unk: true, sq: 'Kur mbarojnë trading hours, open trades:', en: 'Open positions at end of trading hours', options: [o('keep', 'I lë deri te SL ose TP', 'Keep until SL/TP'), o('close', 'I mbyll', 'Close them')] },
    { id: 'friday', step: 'time', type: 'single', req: true, unk: true, sq: 'Mbyll gjithçka para fundjavës?', en: 'Close before the weekend', options: YESNO },
    { id: 'friday_time', step: 'time', type: 'time', req: true, sq: 'Të premten në orën:', hint: 'Sipas zonës kohore të mësipërme.', en: 'Friday close time', show: eq('friday', 'yes') },
    { id: 'friday_pending', step: 'time', type: 'single', req: true, sq: 'Edhe pending orders?', en: 'Friday: pending orders', show: all(eq('friday', 'yes'), inn('exe', ['stop', 'limit'])), options: [o('cancel', 'Po, i fshin', 'Cancel them'), o('keep', 'Jo, i lë', 'Keep them')] },
    { id: 'news', step: 'time', type: 'single', req: true, unk: true, sq: 'I shmang high-impact news?', en: 'News filter', options: YESNO },
    { id: 'news_events', step: 'time', type: 'multi', req: true, sq: 'Cilat news?', en: 'News events avoided', show: eq('news', 'yes'), options: [o('nfp', 'NFP'), o('cpi', 'CPI'), o('fomc', 'FOMC / Fed rate decision', 'FOMC / Fed rate decision'), o('usd_high', 'Çdo high-impact news i USD', 'All high-impact USD news'), o('other', 'Tjetër', 'Other')] },
    { id: 'news_other', step: 'time', type: 'text', req: true, sq: 'Cilat të tjera?', en: 'Other news events', show: has('news_events', 'other') },
    { id: 'news_before', step: 'time', type: 'number', req: true, num: 'nonneg', unit: 'min', sq: 'Minuta para', en: 'Minutes before news', ph: '30', show: eq('news', 'yes'), row: 'news' },
    { id: 'news_after', step: 'time', type: 'number', req: true, num: 'nonneg', unit: 'min', sq: 'Minuta pas', en: 'Minutes after news', ph: '30', show: eq('news', 'yes'), row: 'news' },
    { id: 'news_open', step: 'time', type: 'single', req: true, unk: true, sq: 'Open trades para news:', en: 'Open positions before news', show: eq('news', 'yes'), options: [o('keep', 'I lë', 'Keep'), o('close', 'I mbyll', 'Close before the news'), o('be', 'I kaloj në break-even', 'Move SL to break-even')] },
    { id: 'push', step: 'time', type: 'single', req: true, sq: 'Push notifications në telefon kur hapet ose mbyllet trade?', en: 'Phone push notifications', options: YESNO },

    // ---------- 8. Backtest-i ----------
    { id: 'tv_feed', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Cilin grafik ari përdore në TradingView?', hint: 'Shkruhet lart majtas në grafik.', en: 'TradingView gold chart', options: [o('oanda', 'OANDA:XAUUSD'), o('fxcm', 'FXCM / FX:XAUUSD'), o('tvc', 'TVC:GOLD'), o('other', 'Tjetër', 'Other')] },
    { id: 'tv_feed_other', step: 'backtest', type: 'text', req: true, sq: 'Si quhet saktë?', en: 'TradingView chart (other)', ph: 'P.sh. PEPPERSTONE:XAUUSD', show: eq('tv_feed', 'other') },
    { id: 'tv_tz', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Në cilën orë e ke grafikun në TradingView?', hint: 'Poshtë djathtas në grafik.', en: 'TradingView chart timezone', options: [o('albania', 'Ora e Shqipërisë', 'Albania (Europe/Tirane)'), o('utc', 'UTC'), o('ny', 'New York')] },
    { id: 'candle_type', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Çfarë candles përdore?', en: 'Candle type in backtest', options: [o('standard', 'Candles standarde (Japanese candlesticks)', 'Standard candlesticks'), o('ha', 'Heikin Ashi'), o('other', 'Tjetër', 'Other')] },
    { id: 'candle_type_other', step: 'backtest', type: 'text', req: true, sq: 'Cilët?', en: 'Candle type (other)', show: eq('candle_type', 'other') },
    { id: 'bt_from', step: 'backtest', type: 'date', req: true, unk: true, sq: 'Backtest-i nga data', en: 'Backtest from', row: 'btdates' },
    { id: 'bt_to', step: 'backtest', type: 'date', req: true, unk: true, sq: 'deri më', en: 'Backtest to', row: 'btdates' },
    { id: 'bt_trades', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Sa trades dolën gjithsej?', en: 'Trades in backtest', options: [o('lt20', 'Nën 20', 'Under 20'), o('20_40', '20–40'), o('40_60', '40–60'), o('gt60', 'Mbi 60', 'Over 60'), o('exact', 'E di saktë', 'Exact number')] },
    { id: 'bt_trades_n', step: 'backtest', type: 'number', req: true, num: 'int', unit: 'count', sq: 'Sa saktë?', en: 'Trades in backtest (exact)', show: eq('bt_trades', 'exact') },
    { id: 'bt_winrate', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Sa ishte win rate?', en: 'Win rate in backtest', options: [o('lt45', 'Nën 45%', 'Under 45%'), o('45_50', '45–50%'), o('50_55', '50–55%'), o('55_60', '55–60%'), o('gt60', 'Mbi 60%', 'Over 60%'), o('exact', 'E di saktë', 'Exact value')] },
    { id: 'bt_winrate_n', step: 'backtest', type: 'number', req: true, num: 'pct', unit: 'pct', sq: 'Sa % saktë?', en: 'Win rate (exact)', show: eq('bt_winrate', 'exact') },
    { id: 'bt_same_candle', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Kur SL dhe TP preknin në të njëjtin candle, si e numërove?', en: 'SL and TP hit in the same candle (manual backtest)', options: [o('loss', 'Si loss', 'Counted as loss'), o('win', 'Si win', 'Counted as win'), o('lower_tf', 'E kontrollova në timeframe më të vogël', 'Checked on a lower timeframe'), o('never', 'Nuk ndodhi asnjëherë', 'Never happened')] },
    { id: 'bt_records', step: 'backtest', type: 'single', req: true, sq: 'A i ke shënuar trades?', en: 'Backtest trades recorded', options: [o('sheet', 'Po, në Excel/Sheets', 'Yes, in a spreadsheet (can be shared)'), o('chart', 'Po, në grafik', 'Yes, marked on TradingView'), o('none', 'Jo', 'Not recorded')] },
    { id: 'examples', step: 'backtest', type: 'examples', req: true, sq: 'Shembuj', en: 'Examples' },
    { id: 'acc_info', step: 'backtest', type: 'info', sq: 'Kontrolli i robotit', text: 'Me këto rregulla kontrollojmë që roboti zbaton saktë strategjinë tënde. Nuk premtojnë profit në të ardhmen.' },
    { id: 'acc_period', step: 'backtest', type: 'single', req: true, sq: 'Në cilën periudhë e krahasojmë robotin me backtest-in tënd?', en: 'Comparison period', options: [o('same', 'Në të njëjtën periudhë si backtest-i im', 'Same period as the trader backtest'), o('other', 'Në një periudhë tjetër', 'Other period')] },
    { id: 'acc_period_text', step: 'backtest', type: 'text', req: true, sq: 'Cila periudhë?', en: 'Comparison period (other)', show: eq('acc_period', 'other') },
    { id: 'acc_costs', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Krahasimi bëhet:', en: 'Costs in comparison', options: [o('real', 'Me spread-in dhe komisionin real të Tauro', 'With real Tauro spread and commission'), o('none', 'Pa kosto, si në TradingView', 'Without costs, as on TradingView')] },
    { id: 'acc_entry_tol', step: 'backtest', type: 'number', req: true, unk: true, num: 'nonneg', unit: 'usd', sq: 'Sa $ mund të ndryshojë entry price nga i yti?', hint: 'Grafiku i TradingView dhe i Tauro nuk kanë saktësisht të njëjtat çmime.', en: 'Accepted entry price deviation', ph: '0.5' },
    { id: 'acc_time_tol', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Entry i robotit duhet të jetë:', en: 'Accepted entry time deviation', options: [o('same_candle', 'Në të njëjtin candle si i yti', 'Same candle'), o('one_candle', 'Brenda 1 candle', 'Within 1 candle')] },
    { id: 'acc_match', step: 'backtest', type: 'single', req: true, unk: true, sq: 'Sa nga trades e tua duhet t\'i hapë edhe roboti?', en: 'Required trade match', options: [o('all', 'Të gjitha', 'All trades'), o('explained', 'Të gjitha, përveç dallimeve që shpjegohen nga çmimet ose kostot', 'All, except differences explained by price feed or costs')] },
    { id: 'notes', step: 'backtest', type: 'textarea', opt: true, sq: 'Diçka tjetër që duhet ta dimë?', en: 'Other notes' }
  ];

  // Fushat e një shembulli
  var EX = [
    { id: 'kind', type: 'single', req: true, sq: 'Lloji', en: 'Type', options: [o('buy', 'BUY'), o('sell', 'SELL'), o('noentry', 'Pa entry (roboti NUK duhet të hyjë)', 'Case where the EA must NOT enter')] },
    { id: 'result', type: 'single', req: true, sq: 'Rezultati', en: 'Result', show: { ex: 'kind', in: ['buy', 'sell'] }, options: [o('win', 'Win', 'Winner'), o('loss', 'Loss', 'Loser')] },
    { id: 'date', type: 'date', req: true, sq: 'Data', en: 'Date', row: 'dt' },
    { id: 'time', type: 'time', req: true, sq: 'Ora e candle-it', en: 'Candle time', row: 'dt' },
    { id: 'tf', type: 'single', req: true, sq: 'Timeframe', en: 'Timeframe', options: TF },
    { id: 'entry', type: 'number', req: true, num: 'pos', unit: 'price', sq: 'Entry', en: 'Entry price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'sl', type: 'number', req: true, num: 'pos', unit: 'price', sq: 'SL', en: 'Stop loss price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'tp', type: 'number', req: true, num: 'pos', unit: 'price', sq: 'TP', en: 'Take profit price', show: { ex: 'kind', in: ['buy', 'sell'] }, row: 'px' },
    { id: 'why', type: 'textarea', req: true, sq: 'Pse bëre entry, ose pse jo?', en: 'Explanation' }
  ];

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
    if (v === UNKNOWN) return lang === 'sq' ? 'Nuk e di — duhet sqaruar' : 'UNKNOWN — needs clarification';
    for (var i = 0; i < (q.options || []).length; i++) if (q.options[i].v === v) return q.options[i][lang];
    return String(v);
  }
  function display(q, state, lang) {
    var a = state.answers || {};
    var v = a[q.id];
    if (q.type !== 'single' && q.type !== 'multi' && a['?' + q.id]) return { text: lang === 'sq' ? 'Nuk e di — duhet sqaruar' : 'UNKNOWN — needs clarification', unknown: true };
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
      if (q.type === 'info' || q.type === 'facts' || q.type === 'examples') return;
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
    if (visSet.bt_from && visSet.bt_to && !a['?bt_from'] && !a['?bt_to'] && a.bt_from && a.bt_to && a.bt_from > a.bt_to) errors.push({ id: 'bt_to', step: 'backtest', msg: 'Data e mbarimit duhet të jetë pas datës së fillimit.' });
    if (visSet.mg_partial && a.mg_partial === 'yes' && a.pc_base === 'initial') {
      var sum = [parseNum(a.pc1_pct), parseNum(a.pc2_pct)].filter(function (n) { return !isNaN(n); }).reduce(function (s, n) { return s + n; }, 0);
      if (sum > 100) errors.push({ id: 'pc1_pct', step: 'exits', msg: 'Përqindjet e partial close nga volume fillestar kalojnë 100%.' });
    }
    // Shembujt
    var exs = state.examples || [];
    if (exs.length < MIN_EXAMPLES) errors.push({ id: 'examples', step: 'backtest', msg: 'Shto të paktën ' + MIN_EXAMPLES + ' shembuj.' });
    if (exs.length > MAX_EXAMPLES) errors.push({ id: 'examples', step: 'backtest', msg: 'Maksimumi ' + MAX_EXAMPLES + ' shembuj.' });
    exs.forEach(function (ex, i) {
      EX.forEach(function (f) {
        if (!exVisible(f, ex)) return;
        var v = ex[f.id];
        var key = 'ex:' + i + ':' + f.id;
        if (isEmpty(v)) { if (f.req) errors.push({ id: key, step: 'backtest', msg: 'Plotëso këtë fushë të shembullit ' + (i + 1) + '.' }); return; }
        var fe = lengthError(String(v).length, maxFor(f, true)) || validFormat(f, v);
        if (fe) errors.push({ id: key, step: 'backtest', msg: fe });
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
    function V(id) { return visSet[id] && !isUnknownVal(state, id) ? a[id] : undefined; }
    function N(id) { return parseNum(V(id)); }
    function add(list, sq, en, id) { list.push({ sq: sq, en: en, id: id || null }); }

    vis.forEach(function (id) {
      var q = byId[id];
      if (isUnknownVal(state, id)) add(unresolved, fill(q.sq, state) + ': nuk e di', q.en + ': UNKNOWN', id);
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
      if (results.indexOf('win') < 0) add(unresolved, 'Mungon një shembull win.', 'No winning example provided.');
      if (results.indexOf('loss') < 0) add(unresolved, 'Mungon një shembull loss.', 'No losing example provided.');
      if (kinds.indexOf('noentry') < 0) add(unresolved, 'Mungon një rast pa entry (ku roboti NUK duhet të hyjë).', 'No "must not enter" example provided.');
      if (a.sides === 'both' && (kinds.indexOf('buy') < 0 || kinds.indexOf('sell') < 0)) add(unresolved, 'Mungojnë shembuj për të dy drejtimet (BUY dhe SELL).', 'Examples do not cover both BUY and SELL.');
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
    return { errors: errors, unresolved: unresolved, contradictions: contradictions, assumptions: assumptions, ready: errors.length === 0 && unresolved.length === 0 && contradictions.length === 0 };
  }

  // ---------- Seksionet (për përmbledhjen, emailin dhe specifikimin) ----------
  function sections(state, lang) {
    var vis = visibleIds(state);
    var visSet = {};
    vis.forEach(function (id) { visSet[id] = true; });
    var out = [];
    STEPS.forEach(function (st) {
      if (st.id === 'done') return;
      var items = [];
      Q.forEach(function (q) {
        if (q.step !== st.id || !visSet[q.id]) return;
        if (q.type === 'info' || q.type === 'facts' || q.type === 'examples') return;
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

  // Emra të qëndrueshëm për fotot e shembujve (të njëjtë në faqe, email dhe specifikim)
  function photoNames(state) {
    var names = {};
    (state.examples || []).forEach(function (ex, i) {
      if (!ex.photoId) return;
      var tag = ex.kind === 'noentry' ? 'no-entry' : (ex.kind || 'shembull') + (ex.result ? '-' + ex.result : '');
      names[ex.photoId] = 'shembulli-' + (i + 1) + '-' + tag + '.jpg';
    });
    return names;
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
    L.push('== 4. UNRESOLVED ISSUES AND CONTRADICTIONS ==');
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
    if ([2, 3].indexOf(d.schemaVersion) < 0) return null;
    var A = Object.assign({}, d.answers || {});
    if (d.schemaVersion === 2) {
      ['day_reset', 't_tz', 'tv_tz'].forEach(function (k) { if (A[k] === 'kosovo') A[k] = 'albania'; });
      delete A.client_name; delete A.client_email;
    }
    // 3 -> 4: pyetjet e reja për madhësinë e trade-it mbeten bosh; klienti i plotëson vetë.
    return Object.assign({}, d, { schemaVersion: SCHEMA_VERSION, answers: A });
  }

  function emptyState() {
    var A = {};
    Q.forEach(function (q) { if (q.def !== undefined) A[q.id] = q.def; });
    return { schemaVersion: SCHEMA_VERSION, answers: A, examples: [], step: 0, legacyNotes: [], updatedAt: null };
  }

  // Pastron gjendjen që vjen nga jashtë (p.sh. në server): vetëm çelësa të njohur, tipe të sakta.
  function sanitizeState(input) {
    var s = emptyState();
    if (!input || typeof input !== 'object') return s;
    var A = input.answers && typeof input.answers === 'object' ? input.answers : {};
    s.answers = {};
    Q.forEach(function (q) {
      if (q.type === 'info' || q.type === 'facts' || q.type === 'examples') return;
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
    Object.keys(input).forEach(function (k) { if (['answers', 'examples', 'legacyNotes'].indexOf(k) < 0) bad(k, 'Fushë e panjohur.'); });
    var A = input.answers;
    if (!A || typeof A !== 'object' || Array.isArray(A)) { bad('answers', 'Mungojnë përgjigjet.'); return errs; }
    Object.keys(A).forEach(function (k) {
      var unk = k.charAt(0) === '?';
      var q = byId[unk ? k.slice(1) : k];
      var v = A[k];
      if (!q || q.type === 'info' || q.type === 'facts' || q.type === 'examples') return bad(k, 'Pyetje e panjohur.');
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
    var N = input.legacyNotes;
    if (N !== undefined && (!Array.isArray(N) || N.some(function (n) { return !n || typeof n.sq !== 'string' || typeof n.en !== 'string' || typeof n.text !== 'string' || n.text.length > 20000; }))) bad('legacyNotes', 'Format i pavlefshëm.');
    return errs;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, STORAGE_KEY: STORAGE_KEY, BACKUP_KEY: BACKUP_KEY, UNKNOWN: UNKNOWN,
    MAX_EXAMPLES: MAX_EXAMPLES, MIN_EXAMPLES: MIN_EXAMPLES, MAX_PHOTOS: MAX_PHOTOS,
    CONFIRMED_FACTS: CONFIRMED_FACTS, STEPS: STEPS, QUESTIONS: Q, EXAMPLE_FIELDS: EX, UNITS: UNITS, byId: byId,
    isVisible: function (id, state) { return isVisible(id, state, {}); }, visibleIds: visibleIds, exVisible: exVisible,
    isUnknown: isUnknownVal, parseNum: parseNum, fill: fill, side: side, unitLabel: unitLabel, currency: currency,
    validate: validate, analyze: analyze, sections: sections, exampleLines: exampleLines, buildSpec: buildSpec,
    developerRequirements: developerRequirements, photoNames: photoNames, emptyState: emptyState, sanitizeState: sanitizeState,
    migrateLegacy: migrateLegacy, migrateState: migrateState, strictCheck: strictCheck, MAX_LEN: MAX_LEN, PREV_STORAGE_KEYS: PREV_STORAGE_KEYS, LEGACY_V11_LENGTH: LEGACY_V11.length
  };
});
