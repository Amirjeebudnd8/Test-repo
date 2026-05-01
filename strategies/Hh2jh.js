/**
 * استراتژی واگرایی - بازه ۲۰۰ کندل آخر
 * 
 * اگر در ۲۰۰ کندل قبل از کندل فعلی:
 * - حداقل یک واگرایی صعودی (BUY) وجود داشته باشد → سیگنال BUY
 * - حداقل یک واگرایی نزولی (SELL) وجود داشته باشد → سیگنال SELL
 */

// پرچم برای لاگ یک بار
if (typeof customStrategy._logged === 'undefined') {
    customStrategy._logged = false;
}

function customStrategy(data, index, breakPointsParam) {
    const LOOKBACK = 200;  // ۲۰۰ کندل
    if (index < LOOKBACK) return null;

    const startIdx = index - LOOKBACK;

    let hasBullish = false;
    let hasBearish = false;

    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        for (const sig of breakPointsParam.divergenceSignals) {
            if (sig.startIndex >= startIdx && sig.startIndex <= index) {
                if (sig.signal === 'BUY') hasBullish = true;
                if (sig.signal === 'SELL') hasBearish = true;
            }
        }
    }

    // لاگ یک بار در ابتدا
    if (!customStrategy._logged && index < LOOKBACK + 10) {
        customStrategy._logged = true;
        const total = breakPointsParam?.divergenceSignals?.length || 0;
        console.log(`[Divergence200] total signals: ${total}, BUY: ${breakPointsParam?.divergenceSignals?.filter(s=>s.signal==='BUY').length || 0}, SELL: ${breakPointsParam?.divergenceSignals?.filter(s=>s.signal==='SELL').length || 0}`);
    }

    const price = data[index].close;

    // پارامترهای مشترک برای BUY و SELL
    const base = {
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
        console.log(`🟢 BUY at ${index} | price=${price.toFixed(4)}`);
        return { ...base, signal: 'BUY' };
    }
    if (hasBearish) {
        console.log(`🔴 SELL at ${index} | price=${price.toFixed(4)}`);
        return { ...base, signal: 'SELL' };
    }

    return null;
}
