const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Papa = require('papaparse');

// ==================== زمان‌سنج داخلی (۵ ساعت و نیم) ====================
const START_TIME = Date.now();
const MAX_DURATION_MS = 330 * 60 * 1000; // ۵ ساعت و نیم (۳۳۰ دقیقه)
let timerExpired = false;

setTimeout(() => {
  timerExpired = true;
  console.log(`⏰ زمان (${MAX_DURATION_MS / 1000 / 60} دقیقه) به پایان رسید. در حال خاموش کردن و ذخیره وضعیت...`);
}, MAX_DURATION_MS);

// ==================== فایل وضعیت (progress.json) در ریشه مخزن ====================
const PROGRESS_FILE = path.join(__dirname, 'progress.json');

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('خطا در خواندن فایل وضعیت:', e);
      return {};
    }
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

function updateCompletedChunk(strategyName, chunkIndex, progress) {
  if (!progress[strategyName]) {
    progress[strategyName] = [];
  }
  if (!progress[strategyName].includes(chunkIndex)) {
    progress[strategyName].push(chunkIndex);
    progress[strategyName].sort((a, b) => a - b);
  }
  saveProgress(progress);
  const { execSync } = require('child_process');
  try {
    execSync(`git add ${PROGRESS_FILE}`);
    execSync(`git commit -m "به‌روزرسانی وضعیت: ${strategyName} چانک ${chunkIndex} کامل شد" || true`);
    execSync(`git pull --rebase`);
    execSync(`git push`);
  } catch (e) {
    console.warn('خطا در ثبت فایل وضعیت در گیت:', e);
  }
}

function isChunkCompleted(strategyName, chunkIndex, progress) {
  return progress[strategyName] && progress[strategyName].includes(chunkIndex);
}

// ==================== آرگومان‌های ورودی ====================
console.log('[1] ========== START run-backtest.js ==========');

const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

const strategyFile = getArg('--strategy-file');
const startIndex = parseInt(getArg('--start-index') || '0');
const endIndex   = parseInt(getArg('--end-index') || '0');
const dataDir    = getArg('--data-dir') || path.join(__dirname, 'data');

console.log('[2] strategyFile=' + strategyFile + ' startIndex=' + startIndex + ' endIndex=' + endIndex);

if (!strategyFile || !fs.existsSync(strategyFile)) {
  console.log('ℹ️  فایل استراتژی وجود ندارد.');
  process.exit(0);
}

const strategyName = path.basename(strategyFile, '.js');
const strategyCode = fs.readFileSync(strategyFile, 'utf8');
console.log('[3] strategyName=' + strategyName + ' codeLength=' + strategyCode.length);

// --- انتخاب یک فایل بر اساس ایندکس ---
function getFileNameByIndex(dataDir, index) {
  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
  const dated = allFiles.map(f => {
    const m = f.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$/);
    return { file: f, date: m ? m[1] : null };
  }).filter(x => x.date !== null);
  dated.sort((a, b) => a.date.localeCompare(b.date));
  if (index >= dated.length) {
    console.error(`ایندکس ${index} خارج از محدوده است. تعداد فایل‌ها: ${dated.length}`);
    process.exit(1);
  }
  return dated[index].file;
}

const fileName = getFileNameByIndex(dataDir, startIndex);
const outputDir = path.join(__dirname, 'results', strategyName, fileName);
if (fs.existsSync(path.join(outputDir, 'results.enc'))) {
  console.log(`⏩ ${fileName} قبلاً انجام شده. رد شد.`);
  process.exit(0);
}

// --- خواندن یک فایل ---
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

const marketData = loadSingleFile(dataDir, fileName);
if (marketData.length === 0) process.exit(0);
console.log('[4] marketData.length=' + marketData.length);

// ==================== بارگذاری ماژول بکتست ====================
const corePath = path.join(__dirname, 'backtest-core.js');
if (!fs.existsSync(corePath)) { console.error('backtest-core.js پیدا نشد.'); process.exit(1); }
const backtestCore = require(corePath);

// ==================== تابع رمزنگاری نتایج ====================
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
  fs.unlinkSync(tarPath);
  const files = fs.readdirSync(outputDir);
  for (const file of files) {
    if (file !== 'results.enc') {
      const fp = path.join(outputDir, file);
      fs.statSync(fp).isDirectory() ? fs.rmSync(fp, { recursive: true, force: true }) : fs.unlinkSync(fp);
    }
  }
}

const safeToFixed = (v, d=2) => {
  try { const n = Number(v); return isNaN(n)||!isFinite(n) ? '0'.padStart(d+1,'0') : n.toFixed(d); }
  catch { return '0'.padStart(d+1,'0'); }
};
const safeParse = (v, def=0) => {
  try { const n = parseFloat(v); return isNaN(n) ? def : n; } catch { return def; }
};

// ==================== اجرای اصلی ====================
(async () => {
  const resultsPassword = process.env.RESULTS_PASSWORD || 'Amir1362Amir';
  console.log('[5] Starting main execution...');

  // بررسی چانک قبلاً کامل شده است؟
  const progress = loadProgress();
  const currentChunk = startIndex;
  if (isChunkCompleted(strategyName, currentChunk, progress)) {
    console.log(`ℹ️ چانک ${currentChunk} برای استراتژی ${strategyName} قبلاً کامل شده است. رد می‌شود.`);
    process.exit(0);
  }

  // فقط موتور بکتست را با داده و کد استراتژی فراخوانی می‌کنیم
  const result = await backtestCore.runBacktest(marketData, {
    code: strategyCode,
    initialCapital: 10000,
    riskPerTrade: 2,
    maxDailyLoss: 5,
    commission: 0.05,
    fileName: fileName
  });

  console.log('[6] Backtest finished. Trades count = ' + (result.trades?.length || 0));

  if (timerExpired) {
    console.log(`⚠️ زمان به پایان رسیده و چانک ${currentChunk} کامل نشده است. لغو می‌شود.`);
    process.exit(0);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const trades = result.trades || [];
  const finalCapital = safeParse(result.finalCapital, 0);
  const initialCapital = 10000;
  const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
  const profitable = trades.filter(t => t.profit > 0);
  const losing = trades.filter(t => t.profit < 0);
  const winRate = trades.length ? (profitable.length / trades.length) * 100 : 0;
  let best = null, worst = null;
  if (trades.length) {
    const sorted = [...trades].sort((a,b) => (b.profitPercent||0) - (a.profitPercent||0));
    best = sorted[0];
    worst = sorted[sorted.length-1];
  }
  const avgProfitLoss = trades.length ? trades.reduce((s,t) => s + safeParse(t.profitPercent), 0) / trades.length : 0;
  const distMap = {};
  trades.forEach(t => { const p = safeParse(t.profitPercent); const k = p>=0 ? `+${p.toFixed(4)}%` : `${p.toFixed(4)}%`; distMap[k] = (distMap[k]||0)+1; });
  const distribution = Object.entries(distMap).map(([k,v]) => ({ "درصد_دقیق": k, "تعداد_معاملات": v })).sort((a,b) => b.تعداد_معاملات - a.تعداد_معاملات);
  const tpTrades = trades.filter(t => t.exitReason?.includes('Take Profit'));
  const trailTrades = trades.filter(t => t.exitReason?.includes('Trailing') || t.isTrailingStop);
  const slTrades = trades.filter(t => t.exitReason?.includes('Stop Loss') && !t.isTrailingStop);
  const eobTrades = trades.filter(t => t.exitReason?.includes('End of backtest'));
  const avgTP = tpTrades.length ? tpTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0) / tpTrades.length : 0;
  const totalTP = tpTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
  const profTrail = trailTrades.filter(t => t.profit > 0);
  const avgTrail = profTrail.length ? profTrail.reduce((s,t) => s + safeParse(t.profitPercent), 0) / profTrail.length : 0;
  const totalTrail = trailTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
  const losingSl = slTrades.filter(t => t.profit < 0);
  const avgSl = losingSl.length ? losingSl.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / losingSl.length : 0;
  const totalSl = slTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
  let maxDrawdown = 0;
  if (result.equityData?.length) {
    let peak = result.equityData[0].equity;
    for (const d of result.equityData) {
      if (d.equity > peak) peak = d.equity;
      const dd = ((peak - d.equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }
  let maxConsec=0, cur=0;
  trades.forEach(t => { if (t.profit < 0) { cur++; if (cur>maxConsec) maxConsec=cur; } else cur=0; });
  const totalProfit = profitable.reduce((s,t) => s + t.profit, 0);
  const totalLoss = Math.abs(losing.reduce((s,t) => s + t.profit, 0));
  const profitFactor = totalLoss ? totalProfit / totalLoss : 0;
  const avgWin = profitable.length ? profitable.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / profitable.length : 0;
  const avgLoss = losing.length ? losing.reduce((s,t) => s + Math.abs(safeParse(t.profitPercent)), 0) / losing.length : 0;
  const riskReward = avgLoss ? avgWin / avgLoss : 0;
  const returnsArr = trades.map(t => safeParse(t.profitPercent));
  const mean = returnsArr.reduce((a,b)=>a+b,0)/returnsArr.length;
  const variance = returnsArr.reduce((a,b)=>a+Math.pow(b-mean,2),0)/returnsArr.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev ? mean / stdDev : 0;
  const fibTrades = trades.filter(t => t.useFibonacci);
  const regTrades = trades.filter(t => !t.useFibonacci);
  const fibWins = fibTrades.filter(t => t.profit > 0);
  const fibLoss = fibTrades.filter(t => t.profit < 0);
  const fibWinRate = fibTrades.length ? (fibWins.length / fibTrades.length) * 100 : 0;
  const fibAvgProfit = fibWins.length ? fibWins.reduce((s,t) => s + safeParse(t.profitPercent), 0) / fibWins.length : 0;
  const fibTotal = fibTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);
  const regWins = regTrades.filter(t => t.profit > 0);
  const regLoss = regTrades.filter(t => t.profit < 0);
  const regWinRate = regTrades.length ? (regWins.length / regTrades.length) * 100 : 0;
  const regAvgProfit = regWins.length ? regWins.reduce((s,t) => s + safeParse(t.profitPercent), 0) / regWins.length : 0;
  const regTotal = regTrades.reduce((s,t) => s + safeParse(t.profitPercent), 0);

  const detailed = {
    "اطلاعات_فایل": {
      "نام_فایل": fileName,
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
      "معاملات_سودده": profitable.length,
      "معاملات_زیانده": losing.length,
      "نرخ_برد": safeToFixed(winRate, 2) + "%",
      "بیشترین_سود": best ? safeToFixed(best.profitPercent, 4) + "%" : "0%",
      "بیشترین_ضرر": worst ? safeToFixed(worst.profitPercent, 4) + "%" : "0%",
      "میانگین_سود_ضرر": safeToFixed(avgProfitLoss, 4) + "%"
    },
    "توزیع_دقیق_سود_ضرر": distribution,
    "توزیع_نوع_خروج": {
      "حد_سود": { "تعداد": tpTrades.length, "درصد": trades.length ? safeToFixed((tpTrades.length/trades.length)*100,2)+"%" : "0%", "میانگین_سود": safeToFixed(avgTP,4)+"%", "مجموع_سود": safeToFixed(totalTP,4)+"%" },
      "تریلینگ_استاپ": { "تعداد": trailTrades.length, "درصد": trades.length ? safeToFixed((trailTrades.length/trades.length)*100,2)+"%" : "0%", "سودده": profTrail.length, "ضررده": trailTrades.length - profTrail.length, "میانگین_سود": safeToFixed(avgTrail,4)+"%", "مجموع_سود": safeToFixed(totalTrail,4)+"%" },
      "استاپ_لاس": { "تعداد": slTrades.length, "درصد": trades.length ? safeToFixed((slTrades.length/trades.length)*100,2)+"%" : "0%", "میانگین_ضرر": safeToFixed(avgSl,4)+"%", "مجموع_ضرر": safeToFixed(totalSl,4)+"%" },
      "پایان_بکتست": { "تعداد": eobTrades.length, "درصد": trades.length ? safeToFixed((eobTrades.length/trades.length)*100,2)+"%" : "0%" }
    },
    "آنالیز_ریسک": {
      "حداکثر_افت_سرمایه": safeToFixed(maxDrawdown,2)+"%",
      "بیشترین_ضرر_متوالی": maxConsec,
      "ریسک_به_بازده": safeToFixed(riskReward,2),
      "نسبت_سود_به_ضرر": safeToFixed(profitFactor,2),
      "نسبت_شارپ": safeToFixed(sharpe,2)
    },
    "مقایسه_استراتژی‌ها": {
      "معاملات_فیبوناچی": { "تعداد": fibTrades.length, "سودده": fibWins.length, "ضررده": fibLoss.length, "نرخ_برد": safeToFixed(fibWinRate,2)+"%", "میانگین_سود": safeToFixed(fibAvgProfit,4)+"%", "مجموع_سود": safeToFixed(fibTotal,4)+"%" },
      "معاملات_معمولی": { "تعداد": regTrades.length, "سودده": regWins.length, "ضررده": regLoss.length, "نرخ_برد": safeToFixed(regWinRate,2)+"%", "میانگین_سود": safeToFixed(regAvgProfit,4)+"%", "مجموع_سود": safeToFixed(regTotal,4)+"%" },
      "تفاوت_عملکرد": { "اختلاف_نرخ_برد": safeToFixed(fibWinRate - regWinRate,2)+"%", "اختلاف_میانگین_سود": safeToFixed(fibAvgProfit - regAvgProfit,4)+"%" }
    },
    "خلاصه": [
      `تعداد ${trades.length} معامله با نرخ برد ${safeToFixed(winRate,2)}%`,
      `بازدهی کل: ${totalReturn >= 0 ? '+' : ''}${safeToFixed(totalReturn,2)}%`,
      `سود خالص: ${trades.reduce((s,t) => s + t.profit, 0).toFixed(2)}`
    ]
  };

  fs.writeFileSync(path.join(outputDir, 'detailed_results.json'), JSON.stringify(detailed, null, 2));

  const summary = {
    fileInfo: { name: fileName, symbol: "BTCUSDT", timeframe: "5m", processedAt: new Date().toISOString() },
    trades: trades.map(t => ({ type: t.type, entryTime: t.entryTime, exitTime: t.exitTime, profitPercent: t.profitPercent }))
  };
  fs.writeFileSync(path.join(outputDir, 'trades_summary.json'), JSON.stringify(summary, null, 2));

  const stratDir = path.join(__dirname, 'results', strategyName);
  fs.mkdirSync(stratDir, { recursive: true });
  fs.writeFileSync(path.join(stratDir, '1.json'), strategyCode, 'utf8');

  encryptResults(outputDir, resultsPassword);
  console.log(`✅ results.enc ذخیره شد.`);

  const updatedProgress = loadProgress();
  updateCompletedChunk(strategyName, currentChunk, updatedProgress);

  console.log('[7] ========== END run-backtest.js ==========');
})().catch(err => { console.error(err); process.exit(1); });
