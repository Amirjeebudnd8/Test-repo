/**
 * استراتژی واگرایی کامل (خرید و فروش)
 * 
 * شرط:
 * - اگر در 500 کندل گذشته حداقل یک واگرایی صعودی (BUY) وجود داشته باشد → سیگنال BUY
 * - اگر در 500 کندل گذشته حداقل یک واگرایی نزولی (SELL) وجود داشته باشد → سیگنال SELL
 * 
 * پارامترهای واگرایی به run-backtest.js ارسال می‌شوند.
 */

// پرچم برای لاگ یک بار
if (typeof customStrategy._divergenceLogged === 'undefined') {
    customStrategy._divergenceLogged = false;
}

function customStrategy(data, index, breakPointsParam) {
    // لاگ یک بار در ابتدا
    if (!customStrategy._divergenceLogged && index < 100) {
        customStrategy._divergenceLogged = true;
        if (breakPointsParam && breakPointsParam.divergenceSignals) {
            const total = breakPointsParam.divergenceSignals.length;
            const buyCount = breakPointsParam.divergenceSignals.filter(s => s.signal === 'BUY').length;
            const sellCount = breakPointsParam.divergenceSignals.filter(s => s.signal === 'SELL').length;
            console.log(`[DIVERGENCE] total signals: ${total}, BUY: ${buyCount}, SELL: ${sellCount}`);
            if (total > 0) console.log(`[DIVERGENCE] sample:`, breakPointsParam.divergenceSignals[0]);
        } else {
            console.log(`[DIVERGENCE] No divergenceSignals found in breakPointsParam`);
        }
    }

    if (index < 50) return null;

    const LOOKBACK = 500;
    const startIdx = Math.max(0, index - LOOKBACK);

    let hasBullish = false;
    let hasBearish = false;
    let bestBullish = null;
    let bestBearish = null;

    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        for (const sig of breakPointsParam.divergenceSignals) {
            if (sig.startIndex >= startIdx && sig.startIndex <= index) {
                if (sig.signal === 'BUY') {
                    hasBullish = true;
                    if (!bestBullish || sig.startIndex > bestBullish.startIndex) bestBullish = sig;
                }
                if (sig.signal === 'SELL') {
                    hasBearish = true;
                    if (!bestBearish || sig.startIndex > bestBearish.startIndex) bestBearish = sig;
                }
            }
        }
    }

    const price = data[index].close;
    const baseReturn = {
        price: price,
        stopLoss: price * 0.995,
        takeProfit: price * 1.04,
        trailingStop: false,
        useFibonacci: false,
        ichimoku: {
            tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52,
            useCloudFilter: true, useTKCross: true, useChikou: true
        },
        trendlines: {
            pivotPeriod: 5, minTouchPoints: 3, minCandleDistance: 3, maxDeviationPercent: 0.1
        },
        divergence: {
            rsiPeriod: 14, macdFastPeriod: 12, macdSlowPeriod: 26,
            macdSignalPeriod: 9, macdUseHistogram: true
        },
        sharpTrends: {
            consecutiveCandles: 5, minPercentChange: 0.5, boxValidityHours: 72
        }
    };

    if (hasBullish) {
        console.log(`🟢 سیگنال BUY در کندل ${index} | قیمت ${price.toFixed(4)} | واگرایی: ${bestBullish.type} (${bestBullish.indicatorType})`);
        return { ...baseReturn, signal: 'BUY' };
    }

    if (hasBearish) {
        console.log(`🔴 سیگنال SELL در کندل ${index} | قیمت ${price.toFixed(4)} | واگرایی: ${bestBearish.type} (${bestBearish.indicatorType})`);
        return { ...baseReturn, signal: 'SELL' };
    }

    return null;
}
