const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Papa = require('papaparse');

// ==================== آرگومان‌های ورودی ====================
const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

const strategyFile = getArg('--strategy-file');
const singleFile  = getArg('--single-file');   // نام فایل CSV
const dataDir     = getArg('--data-dir') || path.join(__dirname, 'data');

if (!strategyFile || !fs.existsSync(strategyFile)) {
  console.log('ℹ️  فایل استراتژی وجود ندارد.');
  process.exit(0);
}

if (!singleFile) {
  console.error('❌ نام فایل CSV مشخص نشده است.');
  process.exit(1);
}

const strategyName = path.basename(strategyFile, '.js');

// مسیر خروجی جدید: results/<strategy>/<csv-filename>/
const outputDir = path.join(__dirname, 'results', strategyName, singleFile);

// اگر results.enc از قبل وجود داشت، رد شو
if (fs.existsSync(path.join(outputDir, 'results.enc'))) {
  console.log(`⏩ ${singleFile} قبلاً انجام شده. رد شد.`);
  process.exit(0);
}

// ==================== بخش روند شارپ (همان script.js) ====================
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
    if (candleColor(c) === trend) {
      endIdx = i; lastSame = i;
    } else {
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

// ==================== خواندن یک فایل ====================
function loadSingleFile(dataDir, fileName) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ فایل ${fileName} یافت نشد.`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const allData = [];
  for (const row of parsed.data) {
    if (row.timestamp && row.open && row.high && row.low && row.close) {
      allData.push({
        timestamp: new Date(row.timestamp),
        open: +row.open, high: +row.high, low: +row.low, close: +row.close,
        volume: row.volume ? +row.volume : 0
      });
    }
  }
  console.log(`  ✔ ${fileName} (${allData.length} کندل)`);
  return allData;
}

const marketData = loadSingleFile(dataDir, singleFile);
if (marketData.length === 0) {
  console.log('داده‌ای برای این فایل وجود نداشت.');
  process.exit(0);
}

// ==================== بارگذاری ماژول‌های اصلی ====================
const corePath = path.join(__dirname, 'backtest-core.js');
const divPath = path.join(__dirname, 'divergence-detector.js');
if (!fs.existsSync(corePath)) { console.error('backtest-core.js پیدا نشد.'); process.exit(1); }
const backtestCore = require(corePath);
let divergenceDetector = null;
if (fs.existsSync(divPath)) divergenceDetector = require(divPath);

// ==================== تابع رمزنگاری نتایج (اصلاح‌شده) ====================
function encryptResults(outputDir, password) {
  const tarPath = outputDir + '.tar.gz';
  const encPath = path.join(outputDir, 'results.enc');
  const { execSync } = require('child_process');
  execSync(`tar -czf "${tarPath}" -C "${path.dirname(outputDir)}" "${path.basename(outputDir)}"`);
  
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const input = fs.readFileSync(tarPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  fs.writeFileSync(encPath, Buffer.concat([iv, encrypted]));

  // حذف فایل موقت tar
  fs.unlinkSync(tarPath);

  // حذف فایل‌های JSON میانی (نگه داشتن پوشه و results.enc)
  const files = fs.readdirSync(outputDir);
  for (const file of files) {
    if (file !== 'results.enc') {
      const filePath = path.join(outputDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  }
}

// تابع کمکی برای ایمن‌سازی toFixed
const safeToFixed = (value, digits = 2) => {
  try {
    if (value === null || value === undefined) return '0'.padStart(digits + 1, '0');
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return '0'.padStart(digits + 1, '0');
    return num.toFixed(digits);
  } catch { return '0'.padStart(digits + 1, '0'); }
};

const safeParseFloat = (value, defaultValue = 0) => {
  try {
    if (value === null || value === undefined) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  } catch { return defaultValue; }
};

// ==================== اجرای اصلی ====================
(async () => {
  const strategyCode = fs.readFileSync(strategyFile, 'utf8');
  const resultsPassword = process.env.RESULTS_PASSWORD || 'Amir1362Amir';

  const trendRes = await backtestCore.detectTrendLinesAdvanced(marketData, { pivotPeriod: 5, precision: 0.001, minTouchPoints: 3 });
  const trendLines = trendRes.trendLines;

  let divergenceSignals = [];
  if (divergenceDetector) {
    const rsi = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'RSI', sendMessage: () => {} });
    const macd = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'MACD', sendMessage: () => {} });
    divergenceSignals = [...rsi, ...macd];
  }

  const sharpTrends = detectSharpTrends(marketData);

  const result = await backtestCore.runBacktest(marketData, {
    code: strategyCode,
    initialCapital: 10000,
    riskPerTrade: 2,
    maxDailyLoss: 5,
    commission: 0.05,
    ichimoku: { enabled: true, useCloudFilter: true, useTKCross: true, useChikou: true, tenkanPeriod: 14, kijunPeriod: 30, senkouBPeriod: 57 },
    trendLines, breakPoints: {}, divergenceSignals, sharpTrends
  });

  // ساخت پوشه خروجی
  fs.mkdirSync(outputDir, { recursive: true });

  // ==================== گزارش کامل (مثل script.js) ====================
  const trades = result.trades || [];
  const finalCapital = safeParseFloat(result.finalCapital, 0);
  const initialCapital = 10000;
  const totalReturn = initialCapital > 0 ? ((finalCapital - initialCapital) / initialCapital) * 100 : 0;

  const profitableTrades = trades.filter(t => t.profit > 0);
  const losingTrades = trades.filter(t => t.profit < 0);
  const winningTradesCount = profitableTrades.length;
  const winRate = trades.length > 0 ? (winningTradesCount / trades.length) * 100 : 0;

  let bestTrade = null, worstTrade = null;
  if (trades.length > 0) {
    const sorted = [...trades].sort((a, b) => (b.profitPercent || 0) - (a.profitPercent || 0));
    bestTrade = sorted[0];
    worstTrade = sorted[sorted.length - 1];
  }

  const avgProfitLoss = trades.length > 0
    ? trades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0) / trades.length
    : 0;

  // توزیع دقیق سود/ضرر
  const distMap = {};
  trades.forEach(t => {
    const p = safeParseFloat(t.profitPercent);
    const k = p >= 0 ? `+${p.toFixed(4)}%` : `${p.toFixed(4)}%`;
    distMap[k] = (distMap[k] || 0) + 1;
  });
  const distribution = Object.entries(distMap)
    .map(([k, v]) => ({ "درصد_دقیق": k, "تعداد_معاملات": v }))
    .sort((a, b) => b.تعداد_معاملات - a.تعداد_معاملات);

  // توزیع نوع خروج
  const takeProfitTrades = trades.filter(t => t.exitReason?.includes('Take Profit'));
  const trailingStopTrades = trades.filter(t => t.exitReason?.includes('Trailing') || t.isTrailingStop);
  const stopLossTrades = trades.filter(t => t.exitReason?.includes('Stop Loss') && !t.isTrailingStop);
  const endOfBacktestTrades = trades.filter(t => t.exitReason?.includes('End of backtest'));

  const avgTakeProfit = takeProfitTrades.length > 0
    ? takeProfitTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0) / takeProfitTrades.length : 0;
  const totalTakeProfitSum = takeProfitTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0);

  const profitableTrailingStops = trailingStopTrades.filter(t => t.profit > 0);
  const avgTrailingProfit = profitableTrailingStops.length > 0
    ? profitableTrailingStops.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0) / profitableTrailingStops.length : 0;
  const totalTrailingStopSum = trailingStopTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0);

  const losingRegularStops = stopLossTrades.filter(t => t.profit < 0);
  const avgStopLoss = losingRegularStops.length > 0
    ? losingRegularStops.reduce((sum, t) => sum + Math.abs(safeParseFloat(t.profitPercent)), 0) / losingRegularStops.length : 0;
  const totalStopLossSum = stopLossTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0);

  // آمار ریسک
  let maxDrawdown = 0;
  if (result.equityData && result.equityData.length) {
    let peak = result.equityData[0].equity;
    for (const d of result.equityData) {
      if (d.equity > peak) peak = d.equity;
      const dd = ((peak - d.equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  let maxConsecutiveLosses = 0, curLoss = 0;
  trades.forEach(t => {
    if (t.profit < 0) { curLoss++; if (curLoss > maxConsecutiveLosses) maxConsecutiveLosses = curLoss; }
    else curLoss = 0;
  });

  const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profit, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;

  const avgWin = profitableTrades.length > 0
    ? profitableTrades.reduce((sum, t) => sum + Math.abs(safeParseFloat(t.profitPercent)), 0) / profitableTrades.length : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + Math.abs(safeParseFloat(t.profitPercent)), 0) / losingTrades.length : 0;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  const returns = trades.map(t => safeParseFloat(t.profitPercent));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? mean / stdDev : 0;

  // مقایسه فیبوناچی
  const fibTrades = trades.filter(t => t.useFibonacci);
  const regularTrades = trades.filter(t => !t.useFibonacci);
  const fibWins = fibTrades.filter(t => t.profit > 0);
  const fibLosses = fibTrades.filter(t => t.profit < 0);
  const fibWinRate = fibTrades.length > 0 ? (fibWins.length / fibTrades.length) * 100 : 0;
  const fibAvgProfit = fibWins.length > 0
    ? fibWins.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0) / fibWins.length : 0;
  const fibTotalProfit = fibTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0);

  const regWins = regularTrades.filter(t => t.profit > 0);
  const regLosses = regularTrades.filter(t => t.profit < 0);
  const regWinRate = regularTrades.length > 0 ? (regWins.length / regularTrades.length) * 100 : 0;
  const regAvgProfit = regWins.length > 0
    ? regWins.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0) / regWins.length : 0;
  const regTotalProfit = regularTrades.reduce((sum, t) => sum + safeParseFloat(t.profitPercent), 0);

  // ==================== ذخیره خروجی‌ها ====================
  const detailed = {
    "اطلاعات_فایل": {
      "نام_فایل": singleFile,
      "نماد": "BTCUSDT",
      "تایم_فریم": "5m",
      "تاریخ_پردازش": new Date().toLocaleString('fa-IR'),
      "تعداد_کندل": marketData.length,
      "سرمایه_اولیه": initialCapital,
      "سرمایه_نهایی": finalCapital,
      "بازدهی_کل": safeToFixed(totalReturn, 2) + "%"
    },
    "آمار_کلی_معاملات": {
      "تعداد_کل_معاملات": trades.length,
      "معاملات_سودده": winningTradesCount,
      "معاملات_زیانده": losingTrades.length,
      "نرخ_برد": safeToFixed(winRate, 2) + "%",
      "بیشترین_سود": bestTrade ? safeToFixed(bestTrade.profitPercent, 4) + "%" : "0%",
      "بیشترین_ضرر": worstTrade ? safeToFixed(worstTrade.profitPercent, 4) + "%" : "0%",
      "میانگین_سود_ضرر": safeToFixed(avgProfitLoss, 4) + "%"
    },
    "توزیع_دقیق_سود_ضرر": distribution,
    "توزیع_نوع_خروج": {
      "حد_سود": {
        "تعداد": takeProfitTrades.length,
        "درصد": trades.length > 0 ? safeToFixed((takeProfitTrades.length / trades.length) * 100, 2) + "%" : "0%",
        "میانگین_سود": safeToFixed(avgTakeProfit, 4) + "%",
        "مجموع_سود": safeToFixed(totalTakeProfitSum, 4) + "%"
      },
      "تریلینگ_استاپ": {
        "تعداد": trailingStopTrades.length,
        "درصد": trades.length > 0 ? safeToFixed((trailingStopTrades.length / trades.length) * 100, 2) + "%" : "0%",
        "سودده": profitableTrailingStops.length,
        "ضررده": trailingStopTrades.length - profitableTrailingStops.length,
        "میانگین_سود": safeToFixed(avgTrailingProfit, 4) + "%",
        "مجموع_سود": safeToFixed(totalTrailingStopSum, 4) + "%"
      },
      "استاپ_لاس": {
        "تعداد": stopLossTrades.length,
        "درصد": trades.length > 0 ? safeToFixed((stopLossTrades.length / trades.length) * 100, 2) + "%" : "0%",
        "میانگین_ضرر": safeToFixed(avgStopLoss, 4) + "%",
        "مجموع_ضرر": safeToFixed(totalStopLossSum, 4) + "%"
      },
      "پایان_بکتست": {
        "تعداد": endOfBacktestTrades.length,
        "درصد": trades.length > 0 ? safeToFixed((endOfBacktestTrades.length / trades.length) * 100, 2) + "%" : "0%"
      }
    },
    "آنالیز_ریسک": {
      "حداکثر_افت_سرمایه": safeToFixed(maxDrawdown, 2) + "%",
      "بیشترین_ضرر_متوالی": maxConsecutiveLosses,
      "ریسک_به_بازده": safeToFixed(riskRewardRatio, 2),
      "نسبت_سود_به_ضرر": safeToFixed(profitFactor, 2),
      "نسبت_شارپ": safeToFixed(sharpeRatio, 2)
    },
    "مقایسه_استراتژی‌ها": {
      "معاملات_فیبوناچی": {
        "تعداد": fibTrades.length,
        "سودده": fibWins.length,
        "ضررده": fibLosses.length,
        "نرخ_برد": safeToFixed(fibWinRate, 2) + "%",
        "میانگین_سود": safeToFixed(fibAvgProfit, 4) + "%",
        "مجموع_سود": safeToFixed(fibTotalProfit, 4) + "%"
      },
      "معاملات_معمولی": {
        "تعداد": regularTrades.length,
        "سودده": regWins.length,
        "ضررده": regLosses.length,
        "نرخ_برد": safeToFixed(regWinRate, 2) + "%",
        "میانگین_سود": safeToFixed(regAvgProfit, 4) + "%",
        "مجموع_سود": safeToFixed(regTotalProfit, 4) + "%"
      },
      "تفاوت_عملکرد": {
        "اختلاف_نرخ_برد": safeToFixed(fibWinRate - regWinRate, 2) + "%",
        "اختلاف_میانگین_سود": safeToFixed(fibAvgProfit - regAvgProfit, 4) + "%"
      }
    },
    "خلاصه": [
      `تعداد ${trades.length} معامله با نرخ برد ${safeToFixed(winRate, 2)}%`,
      `بازدهی کل: ${totalReturn >= 0 ? '+' : ''}${safeToFixed(totalReturn, 2)}%`,
      `سود خالص: ${trades.reduce((sum, t) => sum + t.profit, 0).toFixed(2)}`
    ]
  };

  fs.writeFileSync(path.join(outputDir, 'detailed_results.json'), JSON.stringify(detailed, null, 2));

  const summary = {
    fileInfo: { name: singleFile, symbol: "BTCUSDT", timeframe: "5m", processedAt: new Date().toISOString() },
    trades: trades.map(t => ({ type: t.type, entryTime: t.entryTime, exitTime: t.exitTime, profitPercent: t.profitPercent }))
  };
  fs.writeFileSync(path.join(outputDir, 'trades_summary.json'), JSON.stringify(summary, null, 2));

  // ذخیره 1.json در سطح استراتژی (نه در پوشه فایل)
  const strategyResultsDir = path.join(__dirname, 'results', strategyName);
  fs.mkdirSync(strategyResultsDir, { recursive: true });
  fs.writeFileSync(path.join(strategyResultsDir, '1.json'), strategyCode, 'utf8');

  // رمزنگاری نتایج (پوشه حفظ می‌شود)
  encryptResults(outputDir, resultsPassword);
  console.log(`✅ results.enc ذخیره شد.`);
})().catch(err => { console.error(err); process.exit(1); });
