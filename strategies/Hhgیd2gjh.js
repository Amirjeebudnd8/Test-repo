/**
 * استراتژی واگرایی با بررسی کل داده‌ها (از کندل 0 تا کندل جاری)
 * - اگر در کل تاریخچه تا کندل فعلی، حداقل یک واگرایی صعودی (BUY) وجود داشته باشد → سیگنال BUY
 * - اگر حداقل یک واگرایی نزولی (SELL) وجود داشته باشد → سیگنال SELL
 * - (در صورت وجود هر دو، اولویت با BUY است)
 * 
 * تمام پارامترهای اجباری مورد نیاز run-backtest.js در خروجی ارائه می‌شوند.
 */

function customStrategy(data, index, breakPointsParam) {
    // حداقل کندل مورد نیاز برای اطمینان از وجود داده کافی (مثلاً ۱۰۰ کندل اول را نادیده می‌گیریم)
    if (index < 100) return null;

    let hasBuy = false;
    let hasSell = false;
    let bestBuySignal = null;
    let bestSellSignal = null;

    // بررسی کل داده‌ها از ابتدا تا کندل جاری
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        const signals = breakPointsParam.divergenceSignals;
        for (const sig of signals) {
            if (sig.startIndex <= index) {  // شرط: سیگنال در محدوده داده‌ها تا کندل فعلی باشد
                if (sig.signal === 'BUY') {
                    hasBuy = true;
                    if (!bestBuySignal || sig.startIndex > bestBuySignal.startIndex) bestBuySignal = sig;
                }
                if (sig.signal === 'SELL') {
                    hasSell = true;
                    if (!bestSellSignal || sig.startIndex > bestSellSignal.startIndex) bestSellSignal = sig;
                }
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
        ichimoku: {
            tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52,
            useCloudFilter: true, useTKCross: true, useChikou: true
        },
        trendlines: {
            pivotPeriod: 5, minTouchPoints: 3, minCandleDistance: 3,
            maxDeviationPercent: 0.1
        },
        divergence: {
            rsiPeriod: 14, macdFastPeriod: 12, macdSlowPeriod: 26,
            macdSignalPeriod: 9, macdUseHistogram: true
        },
        sharpTrends: {
            consecutiveCandles: 5, minPercentChange: 0.5, boxValidityHours: 72
        }
    };

    // لاگ فقط یک بار در اولین کندل معتبر (برای اطلاع از وجود سیگنال‌ها)
    if (index === 100) {
        const totalSignals = breakPointsParam?.divergenceSignals?.length || 0;
        const buyCount = breakPointsParam?.divergenceSignals?.filter(s => s.signal === 'BUY').length || 0;
        const sellCount = breakPointsParam?.divergenceSignals?.filter(s => s.signal === 'SELL').length || 0;
        console.log(`\n========== استراتژی واگرایی (کل داده) ==========`);
        console.log(`کل سیگنال‌های واگرایی در کل داده: ${totalSignals}`);
        console.log(`صعودی (BUY): ${buyCount}`);
        console.log(`نزولی (SELL): ${sellCount}`);
        if (totalSignals === 0) {
            console.log(`⚠️ هیچ سیگنال واگرایی در کل داده یافت نشد.`);
        }
        console.log(`===============================================\n`);
    }

    // خروجی سیگنال (اولویت با BUY)
    if (hasBuy) {
        console.log(`🟢 BUY در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی صعودی: ${bestBuySignal?.type || 'unknown'} در کندل ${bestBuySignal?.startIndex}`);
        return { ...common, signal: 'BUY' };
    }
    if (hasSell) {
        console.log(`🔴 SELL در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی نزولی: ${bestSellSignal?.type || 'unknown'} در کندل ${bestSellSignal?.startIndex}`);
        return { ...common, signal: 'SELL' };
    }

    return null;
}
