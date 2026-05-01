/**
 * استراتژی واگرایی با بررسی کل داده‌ها (از کندل 0 تا کندل جاری)
 * - اگر در کل تاریخچه تا کندل فعلی، حداقل یک واگرایی صعودی (BUY) وجود داشته باشد → سیگنال BUY
 * - اگر حداقل یک واگرایی نزولی (SELL) وجود داشته باشد → سیگنال SELL
 * - (در صورت وجود هر دو، اولویت با BUY است)
 * 
 * تمام پارامترهای اجباری مورد نیاز run-backtest.js در خروجی ارائه می‌شوند.
 */

function customStrategy(data, index, breakPointsParam) {
    // حداقل کندل مورد نیاز (مثلاً ۱۰۰ کندل اول را نادیده می‌گیریم)
    if (index < 100) return null;

    let hasBuy = false;
    let hasSell = false;
    let bestBuy = null;
    let bestSell = null;

    // بررسی کل داده‌ها از ابتدا تا کندل جاری
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        const signals = breakPointsParam.divergenceSignals;
        for (const sig of signals) {
            if (sig.startIndex <= index) {
                if (sig.signal === 'BUY') {
                    hasBuy = true;
                    if (!bestBuy || sig.startIndex > bestBuy.startIndex) bestBuy = sig;
                }
                if (sig.signal === 'SELL') {
                    hasSell = true;
                    if (!bestSell || sig.startIndex > bestSell.startIndex) bestSell = sig;
                }
            }
        }
    }

    // لاگ اولیه (فقط یک بار) برای اطلاع از وجود واگرایی
    if (index === 100) {
        const total = breakPointsParam?.divergenceSignals?.length || 0;
        const buyCount = breakPointsParam?.divergenceSignals?.filter(s => s.signal === 'BUY').length || 0;
        const sellCount = breakPointsParam?.divergenceSignals?.filter(s => s.signal === 'SELL').length || 0;
        console.log(`\n========== واگرایی کل داده ==========`);
        console.log(`کل سیگنال‌ها: ${total}`);
        console.log(`BUY: ${buyCount}, SELL: ${sellCount}`);
        console.log(`====================================\n`);
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

    // خروجی سیگنال (اولویت با BUY)
    if (hasBuy) {
        console.log(`🟢 BUY در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی صعودی: ${bestBuy?.type || 'unknown'} در کندل ${bestBuy?.startIndex}`);
        return { ...common, signal: 'BUY' };
    }
    if (hasSell) {
        console.log(`🔴 SELL در کندل ${index} | قیمت ${price.toFixed(4)} | آخرین واگرایی نزولی: ${bestSell?.type || 'unknown'} در کندل ${bestSell?.startIndex}`);
        return { ...common, signal: 'SELL' };
    }

    return null;
}
