/**
 * استراتژی نهایی واگرایی (BUY و SELL) با بازه ۱۰۰ کندل
 * - دیباگ کامل در کنسول
 * - هم واگرایی صعودی و هم نزولی را بررسی می‌کند
 * - پارامترهای اجباری به run-backtest.js ارسال می‌شوند
 */

if (typeof customStrategy._firstRun === 'undefined') {
    customStrategy._firstRun = true;
    customStrategy._totalSignals = { BUY: 0, SELL: 0 };
    customStrategy._tradeCount = 0;
}

function customStrategy(data, index, breakPointsParam) {
    const LOOKBACK = 100; // ۱۰۰ کندل آخر (می‌توانید به ۵۰ یا ۲۰۰ تغییر دهید)
    if (index < LOOKBACK) return null;

    const startIdx = index - LOOKBACK;

    let hasBullish = false;
    let hasBearish = false;

    // بررسی سیگنال‌های واگرایی از breakPointsParam
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        const signals = breakPointsParam.divergenceSignals;
        for (const sig of signals) {
            if (sig.startIndex >= startIdx && sig.startIndex <= index) {
                if (sig.signal === 'BUY') hasBullish = true;
                if (sig.signal === 'SELL') hasBearish = true;
            }
        }
        // دیباگ فقط در اولین کندل معتبر (مثلاً کندل ۱۰۰)
        if (customStrategy._firstRun && index === LOOKBACK) {
            const total = signals.length;
            const buys = signals.filter(s => s.signal === 'BUY').length;
            const sells = signals.filter(s => s.signal === 'SELL').length;
            console.log(`\n========== وضعیت واگرایی در کل داده ==========`);
            console.log(`کل سیگنال‌های واگرایی: ${total}`);
            console.log(`صعودی (BUY): ${buys}`);
            console.log(`نزولی (SELL): ${sells}`);
            if (total > 0) {
                console.log(`نمونه اولین سیگنال:`, signals[0]);
            } else {
                console.log(`⚠️ هیچ سیگنال واگرایی در breakPointsParam یافت نشد.`);
                console.log(`بررسی کنید که divergence-detector.js به درستی کار می‌کند.`);
            }
            console.log(`=============================================\n`);
            customStrategy._firstRun = false;
        }
    } else {
        if (customStrategy._firstRun && index === LOOKBACK) {
            console.log(`❌ breakPointsParam یا breakPointsParam.divergenceSignals وجود ندارد.`);
            customStrategy._firstRun = false;
        }
    }

    const price = data[index].close;

    // پارامترهای مشترک برای خروجی
    const baseOutput = {
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
            consecutiveCandles: 5, minPercentChange: 0.5,
            boxValidityHours: 72
        }
    };

    // اولویت با BUY است (در صورت وجود هر دو)
    if (hasBullish) {
        customStrategy._tradeCount++;
        console.log(`✅ [${customStrategy._tradeCount}] سیگنال BUY در کندل ${index} | قیمت ${price.toFixed(4)}`);
        return { ...baseOutput, signal: 'BUY' };
    }
    if (hasBearish) {
        customStrategy._tradeCount++;
        console.log(`✅ [${customStrategy._tradeCount}] سیگنال SELL در کندل ${index} | قیمت ${price.toFixed(4)}`);
        return { ...baseOutput, signal: 'SELL' };
    }

    return null;
}
