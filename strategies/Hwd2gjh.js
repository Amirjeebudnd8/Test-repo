function customStrategy(data, index, breakPointsParam) {
    // حداقل کندل
    if (index < 100) return null;

    let hasBuy = false;
    let hasSell = false;
    let bestBuy = null;
    let bestSell = null;

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

    // لاگ یک بار
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

    // خروجی - شامل تمام فیلدهای اجباری
    if (hasBuy) {
        console.log(`🟢 BUY در کندل ${index} | قیمت ${price.toFixed(4)}`);
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.995,
            takeProfit: price * 1.04,
            trailingStop: false,
            useFibonacci: false,
            ichimoku: {
                tenkanPeriod: 9,
                kijunPeriod: 26,
                senkouBPeriod: 52,
                useCloudFilter: true,
                useTKCross: true,
                useChikou: true
            },
            trendlines: {
                pivotPeriod: 5,
                minTouchPoints: 3,
                minCandleDistance: 3,
                maxDeviationPercent: 0.1
            },
            divergence: {
                rsiPeriod: 14,
                macdFastPeriod: 12,
                macdSlowPeriod: 26,
                macdSignalPeriod: 9,
                macdUseHistogram: true
            },
            sharpTrends: {
                consecutiveCandles: 5,
                minPercentChange: 0.5,
                boxValidityHours: 72
            }
        };
    }
    if (hasSell) {
        console.log(`🔴 SELL در کندل ${index} | قیمت ${price.toFixed(4)}`);
        return {
            signal: 'SELL',
            price: price,
            stopLoss: price * 1.005,
            takeProfit: price * 0.96,
            trailingStop: false,
            useFibonacci: false,
            ichimoku: {
                tenkanPeriod: 9,
                kijunPeriod: 26,
                senkouBPeriod: 52,
                useCloudFilter: true,
                useTKCross: true,
                useChikou: true
            },
            trendlines: {
                pivotPeriod: 5,
                minTouchPoints: 3,
                minCandleDistance: 3,
                maxDeviationPercent: 0.1
            },
            divergence: {
                rsiPeriod: 14,
                macdFastPeriod: 12,
                macdSlowPeriod: 26,
                macdSignalPeriod: 9,
                macdUseHistogram: true
            },
            sharpTrends: {
                consecutiveCandles: 5,
                minPercentChange: 0.5,
                boxValidityHours: 72
            }
        };
    }

    return null;
}
