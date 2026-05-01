const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Papa = require('papaparse');

// ==================== گزارشگر سراسری ====================
let globalStats = {
    activeModules: {},
    params: {},
    counts: {}
};

// ==================== آرگومان‌های ورودی ====================
const argv = process.argv.slice(2);
const getArg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
};

const strategyFile = getArg('--strategy-file');
const startIndex = parseInt(getArg('--start-index') || '0');
const endIndex   = parseInt(getArg('--end-index') || '0');
const dataDir    = getArg('--data-dir') || path.join(__dirname, 'data');

if (!strategyFile || !fs.existsSync(strategyFile)) {
    console.log('ℹ️  فایل استراتژی وجود ندارد.');
    process.exit(0);
}

const strategyName = path.basename(strategyFile, '.js');
const strategyCode = fs.readFileSync(strategyFile, 'utf8');

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

// ==================== بارگذاری ماژول‌های اصلی ====================
const corePath = path.join(__dirname, 'backtest-core.js');
const divPath = path.join(__dirname, 'divergence-detector.js');
if (!fs.existsSync(corePath)) { console.error('backtest-core.js پیدا نشد.'); process.exit(1); }
const backtestCore = require(corePath);
let divergenceDetector = null;
if (fs.existsSync(divPath)) divergenceDetector = require(divPath);

// ==================== تنظیمات پیش‌فرض روند شارپ (در صورت نیاز) ====================
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

function candleColor(c) {
    return c.close > c.open ? 'bullish' : 'bearish';
}

function detectSequenceFromPosition(startIdx, data, config) {
    if (startIdx >= data.length) return null;
    const s = data[startIdx];
    const trend = candleColor(s);
    let endIdx = startIdx, lastSame = startIdx, oppCnt = 0;
    const max = Math.min(startIdx + config.maxLookback * 2, data.length - 1);
    for (let i = startIdx + 1; i <= max; i++) {
        const c = data[i];
        if (candleColor(c) === trend) {
            endIdx = i;
            lastSame = i;
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
        {
            id: `s_${startIdx}`,
            candleIndex: startIdx,
            time1: startTime,
            time2: endTime,
            value1: s.open,
            value2: s.open,
            color: trend === 'bullish' ? '#ddff00' : '#bf00ff',
            trendType: trend === 'bullish' ? 'BULLISH_SHARP' : 'BEARISH_SHARP',
            pct
        },
        {
            id: `e_${endIdx}`,
            candleIndex: endIdx,
            time1: e.timestamp,
            time2: new Date(e.timestamp.getTime() + config.boxValidityHours * 3600000),
            value1: e.close,
            value2: e.close,
            color: trend === 'bullish' ? '#ddff00' : '#bf00ff',
            trendType: trend === 'bullish' ? 'BULLISH_SHARP' : 'BEARISH_SHARP',
            pct
        }
    ];
}

function detectSharpTrends(marketData) {
    const cfg = SHARP;
    if (marketData.length < cfg.consecutiveCandles) return [];
    const boxes = [];
    for (let i = cfg.consecutiveCandles - 1; i < marketData.length; i++) {
        const b = detectSequenceFromPosition(i, marketData, cfg);
        if (b) boxes.push(...b);
    }
    const trends = [];
    for (let i = 0; i < boxes.length; i += 2) {
        const s = boxes[i], e = boxes[i+1];
        if (s && e && s.trendType === e.trendType) {
            trends.push({
                id: `sharp_${s.candleIndex}_${e.candleIndex}`,
                startIndex: s.candleIndex,
                endIndex: e.candleIndex,
                startPrice: marketData[s.candleIndex].open,
                endPrice: marketData[e.candleIndex].close,
                trendType: s.trendType,
                percentChange: s.pct,
                validUntil: s.time2,
                consecutiveCandles: cfg.consecutiveCandles,
                boxValidityHours: cfg.boxValidityHours
            });
        }
    }
    return trends;
}

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

    // 1. استخراج تنظیمات استراتژی (بدون محاسبه چیزی)
    let strategySettings = {};
    try {
        const tempFn = new Function('data', 'index', 'breakPointsParam', 'ichimokuParam', `
            ${strategyCode}
            return customStrategy(data, index, breakPointsParam, ichimokuParam);
        `);
        const sampleCandles = Math.min(100, marketData.length);
        const sampleData = marketData.slice(0, sampleCandles);
        const sampleResult = tempFn(sampleData, sampleCandles - 1, {}, null);
        if (sampleResult && typeof sampleResult === 'object') {
            strategySettings = sampleResult;
        }
    } catch(e) {
        console.warn('Could not extract strategy settings, using defaults');
    }

    // فعال بودن ماژول‌ها بر اساس خروجی استراتژی
    const modules = {
        ichimoku: !!strategySettings.ichimoku,
        trendlines: !!strategySettings.trendlines,
        divergence: !!strategySettings.divergence,
        sharpTrends: !!strategySettings.sharpTrends
    };
    globalStats.activeModules = modules;

    // ذخیره پارامترهای درخواستی
    if (modules.ichimoku && strategySettings.ichimoku) {
        globalStats.params.ichimoku = strategySettings.ichimoku;
    }
    if (modules.trendlines && strategySettings.trendlines) {
        globalStats.params.trendlines = strategySettings.trendlines;
    }
    if (modules.divergence && strategySettings.divergence) {
        globalStats.params.divergence = strategySettings.divergence;
    }
    if (modules.sharpTrends && strategySettings.sharpTrends) {
        globalStats.params.sharpTrends = strategySettings.sharpTrends;
    }

    console.log('\n========== گزارش اولیه ==========');
    console.log('ماژول‌های فعال بر اساس استراتژی:');
    for (const [mod, active] of Object.entries(modules)) {
        console.log(`  ${mod}: ${active ? '✅ فعال' : '❌ غیرفعال'}`);
        if (active && globalStats.params[mod]) {
            console.log(`     پارامترها: ${JSON.stringify(globalStats.params[mod])}`);
        }
    }

    // ==================== محاسبه فقط ماژول‌های فعال ====================
    let trendLines = {};
    let divergenceSignals = [];
    let sharpTrends = [];
    let ichimokuSettingsForCore = null;

    if (modules.trendlines) {
        const tp = strategySettings.trendlines.pivotPeriod || 5;
        const mtp = strategySettings.trendlines.minTouchPoints || 3;
        const mcd = strategySettings.trendlines.minCandleDistance || 3;
        const md = strategySettings.trendlines.maxDeviationPercent || 0.1;
        console.log(`\n🔍 محاسبه خطوط روند با پارامترهای: pivotPeriod=${tp}, minTouchPoints=${mtp}, minCandleDistance=${mcd}, maxDeviationPercent=${md}%`);
        const trendRes = await backtestCore.detectTrendLinesAdvanced(marketData, {
            pivotPeriod: tp,
            minTouchPoints: mtp,
            minCandleDistance: mcd,
            precision: md / 100
        });
        trendLines = trendRes.trendLines;
        const upCount = trendLines.primaryUp?.length || 0;
        const downCount = trendLines.primaryDown?.length || 0;
        globalStats.counts.trendlines = { up: upCount, down: downCount, total: upCount + downCount };
        console.log(`✅ خطوط روند: ${upCount} صعودی, ${downCount} نزولی`);
    }

    if (modules.divergence && divergenceDetector) {
        const divParams = strategySettings.divergence || {};
        const rsiPeriod = divParams.rsiPeriod || 14;
        const macdFast = divParams.macdFastPeriod || 12;
        const macdSlow = divParams.macdSlowPeriod || 26;
        const macdSignal = divParams.macdSignalPeriod || 9;
        console.log(`\n🔍 محاسبه واگرایی با پارامترهای: RSI=${rsiPeriod}, MACD(${macdFast},${macdSlow},${macdSignal})`);
        // توجه: ماژول divergence-detector هنوز پارامتر را از اینجا نمی‌گیرد، برای سادگی از پیش‌فرض استفاده می‌شود
        const rsiSig = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'RSI', sendMessage: ()=>{} });
        const macdSig = divergenceDetector.runDivergenceDetection({ marketData, indicator: 'MACD', sendMessage: ()=>{} });
        divergenceSignals = [...rsiSig, ...macdSig];
        const buyCount = divergenceSignals.filter(s => s.signal === 'BUY').length;
        const sellCount = divergenceSignals.filter(s => s.signal === 'SELL').length;
        globalStats.counts.divergence = { buy: buyCount, sell: sellCount, total: divergenceSignals.length };
        console.log(`✅ واگرایی: ${buyCount} صعودی, ${sellCount} نزولی`);
    } else if (modules.divergence && !divergenceDetector) {
        console.log('⚠️ ماژول divergence-detector در دسترس نیست، واگرایی محاسبه نخواهد شد.');
    }

    if (modules.sharpTrends) {
        const stParams = strategySettings.sharpTrends || {};
        SHARP.consecutiveCandles = stParams.consecutiveCandles || 5;
        SHARP.minPercentChange = stParams.minPercentChange || 0.5;
        SHARP.boxValidityHours = stParams.boxValidityHours || 72;
        console.log(`\n🔍 محاسبه روندهای شارپ با پارامترهای: consecutiveCandles=${SHARP.consecutiveCandles}, minPercentChange=${SHARP.minPercentChange}%, boxValidityHours=${SHARP.boxValidityHours}`);
        sharpTrends = detectSharpTrends(marketData);
        const bullishCount = sharpTrends.filter(t => t.trendType === 'BULLISH_SHARP').length;
        const bearishCount = sharpTrends.filter(t => t.trendType === 'BEARISH_SHARP').length;
        globalStats.counts.sharpTrends = { bullish: bullishCount, bearish: bearishCount, total: sharpTrends.length };
        console.log(`✅ روندهای شارپ: ${bullishCount} صعودی, ${bearishCount} نزولی`);
    }

    if (modules.ichimoku) {
        ichimokuSettingsForCore = {
            enabled: true,
            useCloudFilter: strategySettings.ichimoku.useCloudFilter !== false,
            useTKCross: strategySettings.ichimoku.useTKCross !== false,
            useChikou: strategySettings.ichimoku.useChikou !== false,
            tenkanPeriod: strategySettings.ichimoku.tenkanPeriod || 9,
            kijunPeriod: strategySettings.ichimoku.kijunPeriod || 26,
            senkouBPeriod: strategySettings.ichimoku.senkouBPeriod || 52
        };
        console.log(`\n🔍 محاسبه ایچیموکو با پارامترهای: tenkan=${ichimokuSettingsForCore.tenkanPeriod}, kijun=${ichimokuSettingsForCore.kijunPeriod}, senkouB=${ichimokuSettingsForCore.senkouBPeriod}`);
        globalStats.params.ichimoku = ichimokuSettingsForCore;
    }

    // ==================== آماده‌سازی options و اجرای بکتست ====================
    const backtestOptions = {
        code: strategyCode,
        initialCapital: 10000,
        riskPerTrade: 2,
        maxDailyLoss: 5,
        commission: 0.05,
        trendLines: trendLines,
        ichimoku: ichimokuSettingsForCore,
        divergenceSignals: divergenceSignals,
        sharpTrends: sharpTrends,
        breakPoints: {}
    };

    console.log('\n⚙️ شروع اجرای بکتست...');
    const result = await backtestCore.runBacktest(marketData, backtestOptions);
    console.log(`🏁 بکتست به پایان رسید. تعداد معاملات: ${result.trades?.length || 0}`);

    // ==================== ذخیره نتایج ====================
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

    // ==================== گزارش نهایی ====================
    console.log('\n========== گزارش نهایی (خلاصه عملکرد ماژول‌ها) ==========');
    for (const [mod, active] of Object.entries(modules)) {
        console.log(`${mod}: ${active ? 'فعال' : 'غیرفعال'}`);
        if (active && globalStats.counts[mod]) {
            if (mod === 'trendlines') console.log(`   => تعداد خطوط: ${globalStats.counts[mod].total} (${globalStats.counts[mod].up} صعودی, ${globalStats.counts[mod].down} نزولی)`);
            else if (mod === 'divergence') console.log(`   => تعداد سیگنال‌ها: ${globalStats.counts[mod].total} (${globalStats.counts[mod].buy} خرید, ${globalStats.counts[mod].sell} فروش)`);
            else if (mod === 'sharpTrends') console.log(`   => تعداد روندها: ${globalStats.counts[mod].total} (${globalStats.counts[mod].bullish} صعودی, ${globalStats.counts[mod].bearish} نزولی)`);
            else console.log(`   => پارامترها: ${JSON.stringify(globalStats.params[mod])}`);
        } else if (active) {
            console.log(`   => ماژول اجرا شد اما داده‌ای یافت نشد (تعداد 0)`);
        }
    }
    console.log(`تعداد کل معاملات ثبت شده: ${trades.length}`);
    console.log('====================================================\n');
})().catch(err => { console.error(err); process.exit(1); });
