/**
 * استراتژی ترکیبی پنج مؤلفه (خودکفا) – بدون وابستگی به ماژول‌های خارجی
 * مؤلفه‌ها:
 * 1. خط روند نزولی معتبر (با حداقل 3 تماس)
 * 2. روند شارپ صعودی (5 کندل متوالی با تغییر ≥ 0.5%)
 * 3. واگرایی صعودی بین قیمت و RSI
 * 4. ایچیموکو صعودی (قیمت بالای ابر و تنکان بالای کیجون)
 * 5. شکست خط روند نزولی (اولین شکست پس از تشکیل خط)
 * 
 * شرط: هر پنج رویداد در 500 کندل گذشته رخ داده باشند → سیگنال BUY
 */

function customStrategy(data, index) {
    // ========== تنظیمات ==========
    const LOOKBACK = 500;
    const MIN_PIVOT_DIST = 5;      // فاصله پیوت‌ها برای خط روند
    const MIN_TOUCH = 3;           // حداقل تماس با خط روند
    const SHARP_MIN_CANDLES = 5;
    const SHARP_MIN_PCT = 0.5;
    const RSI_PERIOD = 14;
    const ICHI_TENKAN = 9;
    const ICHI_KIJUN = 26;
    const ICHI_SENKOUB = 52;
    const BREAK_TOLERANCE = 0.001; // 0.1%

    if (index < LOOKBACK) return null;

    const startIdx = index - LOOKBACK;

    // ========== 1. محاسبه RSI برای واگرایی ==========
    function calcRSI(closePrices, period) {
        if (closePrices.length < period + 1) return [];
        const rsi = new Array(closePrices.length).fill(null);
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closePrices[i] - closePrices[i-1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        if (avgLoss === 0) rsi[period] = 100;
        else rsi[period] = 100 - 100 / (1 + avgGain/avgLoss);
        for (let i = period+1; i < closePrices.length; i++) {
            const diff = closePrices[i] - closePrices[i-1];
            let gain = diff > 0 ? diff : 0;
            let loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain*(period-1) + gain)/period;
            avgLoss = (avgLoss*(period-1) + loss)/period;
            if (avgLoss === 0) rsi[i] = 100;
            else rsi[i] = 100 - 100 / (1 + avgGain/avgLoss);
        }
        return rsi;
    }

    const closePrices = data.slice(0, index+1).map(c => c.close);
    const rsiVals = calcRSI(closePrices, RSI_PERIOD);
    if (rsiVals.length === 0) return null;

    // ========== 2. توابع کمکی ==========
    function findPivots(values, period=5) {
        const pivots = [];
        for (let i=period; i<values.length-period; i++) {
            const v = values[i];
            if (v===null) continue;
            let isHigh=true, isLow=true;
            for (let j=1; j<=period; j++) {
                const left = values[i-j];
                const right = values[i+j];
                if (left===null || right===null) { isHigh=isLow=false; break; }
                if (left>=v || right>=v) isHigh=false;
                if (left<=v || right<=v) isLow=false;
            }
            if (isHigh) pivots.push({idx:i, val:v, type:'high'});
            if (isLow) pivots.push({idx:i, val:v, type:'low'});
        }
        return pivots;
    }

    // ========== 3. تشخیص رویدادها در پنجره LOOKBACK ==========
    let hasTrendline = false;      // خط روند نزولی معتبر
    let hasSharp = false;          // روند شارپ صعودی
    let hasDivergence = false;     // واگرایی صعودی
    let hasIchimoku = false;       // ایچیموکو صعودی
    let hasBreak = false;          // شکست خط روند نزولی

    // ---- 3.1 خط روند نزولی (با شناسایی پیوت‌های High) ----
    const priceHighs = data.map(c => c.high);
    const highPivots = findPivots(priceHighs, MIN_PIVOT_DIST);
    // جستجوی خط نزولی با حداقل 3 پیوت
    for (let i=0; i<highPivots.length-2; i++) {
        const p1 = highPivots[i];
        const p2 = highPivots[i+2];
        if (p2.idx - p1.idx > LOOKBACK) continue;
        if (p2.val >= p1.val) continue; // باید نزولی باشد
        // بررسی اینکه آیا حداقل 3 پیوت روی خط افتاده‌اند
        const slope = (p2.val - p1.val) / (p2.idx - p1.idx);
        const intercept = p1.val - slope * p1.idx;
        let touchCount = 0;
        for (let k=0; k<highPivots.length; k++) {
            const p = highPivots[k];
            const lineVal = slope * p.idx + intercept;
            if (Math.abs(p.val - lineVal) / lineVal < 0.001) touchCount++;
        }
        if (touchCount >= MIN_TOUCH) {
            hasTrendline = true;
            break;
        }
    }

    // ---- 3.2 روند شارپ صعودی (۵ کندل متوالی صعودی + تغییر ≥ 0.5%) ----
    for (let i=startIdx; i<=index-SHARP_MIN_CANDLES+1; i++) {
        let allBullish = true;
        for (let j=0; j<SHARP_MIN_CANDLES; j++) {
            if (data[i+j].close <= data[i+j].open) { allBullish=false; break; }
        }
        if (!allBullish) continue;
        const pctChange = (data[i+SHARP_MIN_CANDLES-1].close - data[i].open) / data[i].open * 100;
        if (pctChange >= SHARP_MIN_PCT) {
            hasSharp = true;
            break;
        }
    }

    // ---- 3.3 واگرایی صعودی (قیمت: دره پایین‌تر، RSI: دره بالاتر) ----
    const pricePivots = findPivots(closePrices, 5);
    const rsiPivots = findPivots(rsiVals, 5);
    for (let i=0; i<pricePivots.length-1; i++) {
        const p1 = pricePivots[i];
        const p2 = pricePivots[i+1];
        if (p1.type!=='low' || p2.type!=='low') continue;
        if (p2.idx - p1.idx > LOOKBACK) continue;
        const r1 = rsiPivots.find(p => p.type==='low' && Math.abs(p.idx-p1.idx)<=4);
        const r2 = rsiPivots.find(p => p.type==='low' && Math.abs(p.idx-p2.idx)<=4);
        if (!r1 || !r2) continue;
        if (p2.val < p1.val && r2.val > r1.val) { hasDivergence = true; break; }
    }

    // ---- 3.4 ایچیموکو صعودی (قیمت بالای ابر در هر کندل) ----
    for (let i=startIdx; i<=index; i++) {
        if (i < ICHI_SENKOUB) continue;
        // محاسبه ایچیموکو برای کندل i
        const tenkan = (Math.max(...data.slice(i-ICHI_TENKAN+1, i+1).map(c=>c.high)) +
                        Math.min(...data.slice(i-ICHI_TENKAN+1, i+1).map(c=>c.low))) / 2;
        const kijun = (Math.max(...data.slice(i-ICHI_KIJUN+1, i+1).map(c=>c.high)) +
                       Math.min(...data.slice(i-ICHI_KIJUN+1, i+1).map(c=>c.low))) / 2;
        const senkouB = (Math.max(...data.slice(i-ICHI_SENKOUB+1, i+1).map(c=>c.high)) +
                         Math.min(...data.slice(i-ICHI_SENKOUB+1, i+1).map(c=>c.low))) / 2;
        const senkouA = (tenkan + kijun) / 2;
        const kumoTop = Math.max(senkouA, senkouB);
        const isAboveCloud = data[i].close > kumoTop;
        const isTenkanAboveKijun = tenkan > kijun;
        if (isAboveCloud && isTenkanAboveKijun) {
            hasIchimoku = true;
            break;
        }
    }

    // ---- 3.5 شکست خط روند نزولی (اولین شکست پس از تشکیل) ----
    // ساده‌سازی: از خطوط یافت شده در بخش 3.1 استفاده می‌کنیم
    if (hasTrendline) {
        // دوباره همان خط اول را پیدا می‌کنیم (برای شکست)
        for (let i=0; i<highPivots.length-2; i++) {
            const p1 = highPivots[i];
            const p2 = highPivots[i+2];
            if (p2.idx - p1.idx > LOOKBACK) continue;
            if (p2.val >= p1.val) continue;
            const slope = (p2.val - p1.val) / (p2.idx - p1.idx);
            const intercept = p1.val - slope * p1.idx;
            let touchCount = 0;
            for (let k=0; k<highPivots.length; k++) {
                const p = highPivots[k];
                const lineVal = slope * p.idx + intercept;
                if (Math.abs(p.val - lineVal) / lineVal < 0.001) touchCount++;
            }
            if (touchCount >= MIN_TOUCH) {
                // بررسی شکست: قیمت close بالاتر از خط
                for (let j=Math.max(p2.idx, startIdx); j<=index; j++) {
                    const lineVal = slope * j + intercept;
                    if (data[j].close > lineVal * (1 + BREAK_TOLERANCE)) {
                        hasBreak = true;
                        break;
                    }
                }
                if (hasBreak) break;
            }
        }
    }

    // ========== 4. تصمیم‌گیری ==========
    if (hasTrendline && hasSharp && hasDivergence && hasIchimoku && hasBreak) {
        const price = data[index].close;
        console.log(`✅ سیگنال BUY در کندل ${index} | قیمت ${price.toFixed(4)} | همه ۵ شرط در ۵۰۰ کندل گذشته برقرار است.`);
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.995,
            takeProfit: price * 1.04,
            // پارامترهای اجباری (برای run-backtest.js)
            ichimoku: { tenkanPeriod:9, kijunPeriod:26, senkouBPeriod:52, useCloudFilter:true, useTKCross:true, useChikou:true },
            trendlines: { pivotPeriod:5, minTouchPoints:3, minCandleDistance:3, maxDeviationPercent:0.1 },
            divergence: { rsiPeriod:14, macdFastPeriod:12, macdSlowPeriod:26, macdSignalPeriod:9, macdUseHistogram:true },
            sharpTrends: { consecutiveCandles:5, minPercentChange:0.5, boxValidityHours:72 }
        };
    }
    return null;
}
