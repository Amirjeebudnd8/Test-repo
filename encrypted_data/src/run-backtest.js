const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// ==================== آرگومان‌های ورودی ====================
const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

const strategyFile = getArg('--strategy-file');
const startChunk = parseInt(getArg('--start-index') || '0');
const endChunk   = parseInt(getArg('--end-index') || '24');
const dataDir    = getArg('--data-dir') || path.join(__dirname, 'data');

if (!strategyFile || !fs.existsSync(strategyFile)) {
  console.log('ℹ️  فایل استراتژی وجود ندارد.');
  process.exit(0);
}

const strategyName = path.basename(strategyFile, '.js');
const outputDir = path.join(__dirname, 'results', strategyName, `chunk_${startChunk}_${endChunk}`);
if (fs.existsSync(outputDir)) {
  console.log(`⏩ چانک ${startChunk} تا ${endChunk} قبلاً انجام شده. رد شد.`);
  process.exit(0);
}

// ==================== روند شارپ ====================
const SHARP = {
  minCandlesRequired: 5,
  consecutiveCandles: 5,
  minPercentChange: 0.5,
  maxLookback: 2500,
  enableOppositeCandleRule: true,
  boxValidityHours: 72,
  useFixedDuration: true,
  breakThresholdPercent: 10.0
};

function candleColor(c) { return c.close > c.open ? 'bullish' : 'bearish'; }

function detectSequenceFromPosition(startIdx, data, config) {
  if (startIdx >= data.length) return null;
  const s = data[startIdx];
  const trend = candleColor(s);
  let endIdx = startIdx, lastSame = startIdx, oppCnt = 0;
  const max = Math.min(startIdx + config.maxLookback * 2, data.length - 1);
  for (let i = startIdx + 1; i <= max; i++) {
    const c = data[i];
    if (candleColor(c) === trend) { endIdx = i; lastSame = i; }
    else {
      if (config.enableOppositeCandleRule) {
        const prev = data[lastSame];
        if (trend === 'bullish') {
          if (c.low >= prev.low) { oppCnt++; continue; }
        } else {
          if (c.high <= prev.high) { oppCnt++; continue; }
        }
      }
      break;
    }
  }
  const len = (endIdx - startIdx + 1) - oppCnt;
  if (len < config.minCandlesRequired) return null;
  const e = data[endIdx];
  const pct = ((e.close - s.open) / s.open) * 100;
  if (Math.abs(pct) < config.minPercentChange) return null;
  let hh = s.high, ll = s.low;
  for (let i = startIdx; i <= endIdx; i++) {
    if (candleColor(data[i]) === trend ||
        (config.enableOppositeCandleRule && i > startIdx && candleColor(data[i]) !== trend)) {
      hh = Math.max(hh, data[i].high);
      ll = Math.min(ll, data[i].low);
    }
  }
  const startTime = new Date(s.timestamp.getTime());
  const endTime  = new Date(startTime.getTime() + config.boxValidityHours * 3600000);
  return [
    { id: `s_${startIdx}`, candleIndex: startIdx, time1: startTime, time2: endTime, value1: s.open, value2: s.open,
      color: trend==='bullish'?'#ddff00':'#bf00ff', trendType: trend==='bullish'?'BULLISH_SHARP':'BEARISH_SHARP', pct },
    { id: `e_${endIdx}`, candleIndex: endIdx, time1: e.timestamp, time2: new Date(e.timestamp.getTime() + config.boxValidityHours*3600000),
      value1: e.close, value2: e.close, color: trend==='bullish'?'#ddff00':'#bf00ff', trendType: trend==='bullish'?'BULLISH_SHARP':'BEARISH_SHARP', pct }
  ];
}

function detectSharpTrends(marketData) {
  const cfg = SHARP;
  if (marketData.length < cfg.consecutiveCandles) return [];
  const boxes = [];
  for (let i = cfg.consecutiveCandles-1; i < marketData.length; i++) {
    const b = detectSequenceFromPosition(i, marketData, cfg);
    if (b) boxes.push(...b);
  }
  const trends = [];
  for (let i = 0; i < boxes.length; i += 2) {
    const s = boxes[i], e = boxes[i+1];
    if (s && e && s.trendType === e.trendType) {
      trends.push({
        id: `sharp_${s.candleIndex}_${e.candleIndex}`,
        startIndex: s.candleIndex, endIndex: e.candleIndex,
        startPrice: marketData[s.candleIndex].open, endPrice: marketData[e.candleIndex].close,
        trendType: s.trendType, percentChange: s.pct,
        validUntil: s.time2, consecutiveCandles: cfg.consecutiveCandles, boxValidityHours: cfg.boxValidityHours
      });
    }
  }
  return trends;
}

// ==================== خواندن فایل‌ها با نام اصلی ====================
function loadMarketDataByChunk(dataDir, start, end) {
  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
  const dated = allFiles.map(f => {
    const m = f.match(/(\d{4}-\d{2})\.csv$/);
    return { file: f, date: m ? m[1] : null };
  }).filter(x => x.date !== null);
  dated.sort((a, b) => a.date.localeCompare(b.date));
  const selected = dated.slice(start, end + 1);
  if (selected.length === 0) {
    console.log('هیچ فایلی در این چانک پیدا نشد.');
    return [];
  }
  const allData = [];
  for (const entry of selected) {
    const filePath = path.join(dataDir, entry.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
    for (const row of parsed.data) {
      if (row.timestamp && row.open && row.high && row.low && row.close) {
        allData.push({
          timestamp: new Date(row.timestamp),
          open: +row.open, high: +row.high, low: +row.low, close: +row.close,
          volume: row.volume ? +row.volume : 0
        });
      }
    }
    console.log(`  ✔ ${entry.file} (${parsed.data.length} کندل)`);
  }
  allData.sort((a, b) => a.timestamp - b.timestamp);
  const unique = [];
  const seen = new Set();
  for (const d of allData) {
    const t = d.timestamp.getTime();
    if (!seen.has(t)) { seen.add(t); unique.push(d); }
  }
  return unique;
}

const marketData = loadMarketDataByChunk(dataDir, startChunk, endChunk);
if (marketData.length === 0) {
  console.log('داده‌ای برای این چانک وجود نداشت.');
  process.exit(0);
}

// ==================== بارگذاری ماژول‌های اصلی ====================
const corePath = path.join(__dirname, 'decrypted_backtest-core.js');
const divPath = path.join(__dirname, 'decrypted_divergence-detector.js');
if (!fs.existsSync(corePath)) { console.error('backtest-core.js پیدا نشد.'); process.exit(1); }
const backtestCore = require(corePath);
let divergenceDetector = null;
if (fs.existsSync(divPath)) divergenceDetector = require(divPath);

// ==================== اجرای اصلی ====================
(async () => {
  const strategyCode = fs.readFileSync(strategyFile, 'utf8');

  const trendRes = await backtestCore.detectTrendLinesAdvanced(marketData, { pivotPeriod: 5, precision: 0.001, minTouchPoints: 3 });
  const trendLines = trendRes.trendLines;

  let divergenceSignals = [];
  if (divergenceDetector) {
    const rsi = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'RSI', sendMessage: ()=>{} });
    const macd = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'MACD', sendMessage: ()=>{} });
    divergenceSignals = [...rsi, ...macd];
    console.log(`${divergenceSignals.length} سیگنال واگرایی`);
  }

  const sharpTrends = detectSharpTrends(marketData);
  console.log(`${sharpTrends.length} روند شارپ`);

  const result = await backtestCore.runBacktest(marketData, {
    code: strategyCode,
    initialCapital: 10000,
    riskPerTrade: 2,
    maxDailyLoss: 5,
    commission: 0.05,
    ichimoku: { enabled: true, useCloudFilter: true, useTKCross: true, useChikou: true, tenkanPeriod: 14, kijunPeriod: 30, senkouBPeriod: 57 },
    trendLines,
    breakPoints: {},
    divergenceSignals,
    sharpTrends
  });

  fs.mkdirSync(outputDir, { recursive: true });

  const trades = result.trades;
  const win = trades.filter(t => t.profit > 0);
  const winRate = trades.length ? (win.length / trades.length) * 100 : 0;
  const dist = {};
  trades.forEach(t => {
    const p = parseFloat(t.profitPercent) || 0;
    const k = p >= 0 ? `+${p.toFixed(4)}%` : `${p.toFixed(4)}%`;
    dist[k] = (dist[k] || 0) + 1;
  });
  const distribution = Object.entries(dist).map(([k, v]) => ({ "درصد_دقیق": k, "تعداد_معاملات": v }))
    .sort((a, b) => b.تعداد_معاملات - a.تعداد_معاملات);

  const detailed = {
    "اطلاعات_فایل": {
      "نام_فایل": `chunk_${startChunk}_${endChunk}`,
      "نماد": "BTCUSDT",
      "تایم_فریم": "5m",
      "تاریخ_پردازش": new Date().toLocaleString('fa-IR'),
      "تعداد_کندل": marketData.length,
      "سرمایه_اولیه": 10000,
      "سرمایه_نهایی": result.finalCapital,
      "بازدهی_کل": (((result.finalCapital - 10000) / 10000) * 100).toFixed(2) + "%"
    },
    "آمار_کلی_معاملات": {
      "تعداد_کل_معاملات": trades.length,
      "معاملات_سودده": win.length,
      "معاملات_زیانده": trades.length - win.length,
      "نرخ_برد": winRate.toFixed(2) + "%"
    },
    "توزیع_دقیق_سود_ضرر": distribution,
    "خلاصه": [`تعداد ${trades.length} معامله با نرخ برد ${winRate.toFixed(2)}%`]
  };
  fs.writeFileSync(path.join(outputDir, 'detailed_results.json'), JSON.stringify(detailed, null, 2));

  const summary = {
    fileInfo: { name: `chunk_${startChunk}_${endChunk}`, symbol: "BTCUSDT", timeframe: "5m", processedAt: new Date().toISOString() },
    trades: trades.map(t => ({ type: t.type, entryTime: t.entryTime, exitTime: t.exitTime, profitPercent: t.profitPercent }))
  };
  fs.writeFileSync(path.join(outputDir, 'trades_summary.json'), JSON.stringify(summary, null, 2));

  // ✅ فایل جدید: 1.json حاوی کد استراتژی
  fs.writeFileSync(path.join(outputDir, '1.json'), strategyCode, 'utf8');
  console.log('📝 1.json (کد استراتژی) ذخیره شد.');

  console.log(`✅ نتایج در ${outputDir} ذخیره شد.`);
})().catch(err => { console.error(err); process.exit(1); });
