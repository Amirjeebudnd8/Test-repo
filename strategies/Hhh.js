/**
 * استراتژی فقط واگرایی (بدون روند شارپ، بدون خطوط روند، بدون ایچیموکو)
 * 
 * شرط: اگر در 500 کندل گذشته حداقل یک سیگنال واگرایی صعودی (BUY) وجود داشته باشد
 *       در کندل فعلی (هر کندل) → سیگنال BUX بده.
 * 
 * پارامترهای واگرایی (ارسال به run-backtest.js):
 * - RSI دوره: 14
 * - MACD: سریع=12, کند=26, سیگنال=9
 * - استفاده از هیستوگرام MACD: true
 */

function customStrategy(data, index, breakPointsParam) {
    // حداقل کندل مورد نیاز برای محاسبات
    if (index < 50) return null;

    const LOOKBACK = 500;
    const startIdx = Math.max(0, index - LOOKBACK);

    let hasBullishDivergence = false;
    let bestDivergence = null;

    // بررسی واگرایی از breakPointsParam
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        for (const sig of breakPointsParam.divergenceSignals) {
            if (sig.startIndex >= startIdx && sig.startIndex <= index && sig.signal === 'BUY') {
                hasBullishDivergence = true;
                if (!bestDivergence || sig.startIndex > bestDivergence.startIndex) {
                    bestDivergence = sig;
                }
            }
        }
    }

    // اگر واگرایی صعودی یافت شد → سیگنال BUY
    if (hasBullishDivergence) {
        const price = data[index].close;
        // لاگ ساده (در خروجی workflow دیده می‌شود)
        console.log(`✅ واگرایی صعودی در کندل ${index} | قیمت ${price.toFixed(4)} | نوع: ${bestDivergence.type} | اندیکاتور: ${bestDivergence.indicatorType}`);
        
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.995,
            takeProfit: price * 1.04,
            trailingStop: false,
            useFibonacci: false,
            
            // پارامترهای اجباری که run-backtest.js انتظار دارد
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
    }

    return null;
}
