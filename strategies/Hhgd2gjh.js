// پرچم برای لاگ یک بار در ابتدا
if (typeof customStrategy._logged === 'undefined') {
    customStrategy._logged = false;
}

function customStrategy(data, index, breakPointsParam) {
    const LOOKBACK = 500;  // ۵۰۰ کندل برای اطمینان از پوشش سیگنال‌ها
    if (index < LOOKBACK) return null;

    const startIdx = index - LOOKBACK;
    let hasBuy = false;
    let hasSell = false;

    // بررسی سیگنال‌های واگرایی
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        const signals = breakPointsParam.divergenceSignals;
        for (const s of signals) {
            if (s.startIndex >= startIdx && s.startIndex <= index) {
                if (s.signal === 'BUY') hasBuy = true;
                if (s.signal === 'SELL') hasSell = true;
            }
        }

        // لاگ فقط یک بار در اولین فراخوانی (کندل ۵۰۰)
        if (!customStrategy._logged && index === LOOKBACK) {
            customStrategy._logged = true;
            console.log(`\n========== واگرایی در کل داده ==========`);
            console.log(`کل سیگنال‌ها: ${signals.length}`);
            console.log(`خرید (BUY): ${signals.filter(s => s.signal === 'BUY').length}`);
            console.log(`فروش (SELL): ${signals.filter(s => s.signal === 'SELL').length}`);
            if (signals.length > 0) console.log(`نمونه:`, signals[0]);
            console.log(`بازه بررسی در هر کندل: ${LOOKBACK} کندل قبل`);
            console.log(`=========================================\n`);
        }
    } else {
        if (!customStrategy._logged && index === LOOKBACK) {
            customStrategy._logged = true;
            console.log(`❌ breakPointsParam.divergenceSignals وجود ندارد!`);
        }
    }

    const price = data[index].close;
    const common = {
        price: price,
        stopLoss: price * 0.995,
        takeProfit: price * 1.04,
        ichimoku: { tenkanPeriod:9, kijunPeriod:26, senkouBPeriod:52, useCloudFilter:true, useTKCross:true, useChikou:true },
        trendlines: { pivotPeriod:5, minTouchPoints:3, minCandleDistance:3, maxDeviationPercent:0.1 },
        divergence: { rsiPeriod:14, macdFastPeriod:12, macdSlowPeriod:26, macdSignalPeriod:9, macdUseHistogram:true },
        sharpTrends: { consecutiveCandles:5, minPercentChange:0.5, boxValidityHours:72 }
    };

    if (hasBuy) {
        console.log(`🟢 BUY at ${index} | price ${price.toFixed(4)}`);
        return { ...common, signal: 'BUY' };
    }
    if (hasSell) {
        console.log(`🔴 SELL at ${index} | price ${price.toFixed(4)}`);
        return { ...common, signal: 'SELL' };
    }

    return null;
}
