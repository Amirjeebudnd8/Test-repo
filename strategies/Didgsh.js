/**
 * استراتژی واگرایی خودکفا (بدون نیاز به ماژول خارجی)
 * - محاسبه RSI با دوره 14
 * - تشخیص واگرایی معمولی و مخفی بین قیمت و RSI
 * - بازه بررسی: کل داده (از کندل 0 تا index)
 * - سیگنال BUY در صورت وجود واگرایی صعودی، SELL در صورت وجود واگرایی نزولی
 */

function customStrategy(data, index) {
    // نیاز به داده کافی برای محاسبه RSI و پیوت‌ها
    if (index < 60) return null;

    // ==================== 1. محاسبه RSI ====================
    function calculateRSI(closePrices, period) {
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
        else {
            const rs = avgGain / avgLoss;
            rsi[period] = 100 - (100 / (1 + rs));
        }
        for (let i = period + 1; i < closePrices.length; i++) {
            const diff = closePrices[i] - closePrices[i-1];
            let gain = 0, loss = 0;
            if (diff > 0) gain = diff;
            else loss = -diff;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            if (avgLoss === 0) rsi[i] = 100;
            else {
                const rs = avgGain / avgLoss;
                rsi[i] = 100 - (100 / (1 + rs));
            }
        }
        return rsi;
    }

    // استخراج قیمت‌های بسته
    const closePrices = data.slice(0, index + 1).map(c => c.close);
    const rsiValues = calculateRSI(closePrices, 14);
    if (rsiValues.length === 0) return null;

    // ==================== 2. یافتن پیوت‌ها (قله و دره) ====================
    function findPivots(values, period = 5) {
        const pivots = [];
        for (let i = period; i < values.length - period; i++) {
            const v = values[i];
            if (v === null) continue;
            let isHigh = true, isLow = true;
            for (let j = 1; j <= period; j++) {
                const left = values[i - j];
                const right = values[i + j];
                if (left === null || right === null) { isHigh = isLow = false; break; }
                if (left >= v || right >= v) isHigh = false;
                if (left <= v || right <= v) isLow = false;
            }
            if (isHigh) pivots.push({ index: i, value: v, type: 'high' });
            if (isLow) pivots.push({ index: i, value: v, type: 'low' });
        }
        return pivots;
    }

    const pricePivots = findPivots(closePrices, 5);
    const rsiPivots = findPivots(rsiValues, 5);
    if (pricePivots.length < 2 || rsiPivots.length < 2) return null;

    // ==================== 3. تشخیص واگرایی در کل داده ====================
    let hasBullish = false, hasBearish = false;
    let lastBullishIndex = -1, lastBearishIndex = -1;

    for (let i = 0; i < pricePivots.length - 1; i++) {
        const p1 = pricePivots[i];
        const p2 = pricePivots[i + 1];
        if (p2.index - p1.index > 200) continue; // حداکثر فاصله 200 کندل

        // پیدا کردن پیوت‌های متناظر در RSI (تلورانس 4 کندل)
        const r1 = rsiPivots.find(p => p.type === p1.type && Math.abs(p.index - p1.index) <= 4);
        const r2 = rsiPivots.find(p => p.type === p2.type && Math.abs(p.index - p2.index) <= 4);
        if (!r1 || !r2) continue;

        const priceSlope = (p2.value - p1.value) / (p2.index - p1.index);
        const rsiSlope = (r2.value - r1.value) / (r2.index - r1.index);
        const minDiff = 0.01;

        if (p1.type === 'low') {
            if (priceSlope < -minDiff && rsiSlope > minDiff) {
                hasBullish = true;
                lastBullishIndex = p2.index;
            } else if (priceSlope > minDiff && rsiSlope < -minDiff) {
                hasBullish = true; // hidden bullish
                lastBullishIndex = p2.index;
            }
        } else if (p1.type === 'high') {
            if (priceSlope > minDiff && rsiSlope < -minDiff) {
                hasBearish = true;
                lastBearishIndex = p2.index;
            } else if (priceSlope < -minDiff && rsiSlope > minDiff) {
                hasBearish = true; // hidden bearish
                lastBearishIndex = p2.index;
            }
        }
    }

    const price = data[index].close;
    const common = {
        price: price,
        stopLoss: price * 0.995,
        takeProfit: price * 1.04,
        trailingStop: false,
        useFibonacci: false,
        ichimoku: { tenkanPeriod:9, kijunPeriod:26, senkouBPeriod:52, useCloudFilter:true, useTKCross:true, useChikou:true },
        trendlines: { pivotPeriod:5, minTouchPoints:3, minCandleDistance:3, maxDeviationPercent:0.1 },
        divergence: { rsiPeriod:14, macdFastPeriod:12, macdSlowPeriod:26, macdSignalPeriod:9, macdUseHistogram:true },
        sharpTrends: { consecutiveCandles:5, minPercentChange:0.5, boxValidityHours:72 }
    };

    if (hasBullish) {
        console.log(`🟢 BUY در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی صعودی در کندل ${lastBullishIndex}`);
        return { ...common, signal: 'BUY' };
    }
    if (hasBearish) {
        console.log(`🔴 SELL در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی نزولی در کندل ${lastBearishIndex}`);
        return { ...common, signal: 'SELL' };
    }

    return null;
}
