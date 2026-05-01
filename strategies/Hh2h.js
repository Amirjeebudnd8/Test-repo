// پرچم سراسری برای لاگ یک بار

if (typeof customStrategy._divergenceLogged === 'undefined') {
    customStrategy._divergenceLogged = false;
}

function customStrategy(data, index, breakPointsParam) {
    // لاگ یک بار در اولین فراخوانی (index کوچک)
    if (!customStrategy._divergenceLogged && index < 100) {
        customStrategy._divergenceLogged = true;
        if (breakPointsParam && breakPointsParam.divergenceSignals) {
            const count = breakPointsParam.divergenceSignals.length;
            console.log(`[DIVERGENCE CHECK] divergenceSignals found, count = ${count}`);
            if (count > 0) {
                console.log(`[DIVERGENCE CHECK] Sample:`, breakPointsParam.divergenceSignals[0]);
            } else {
                console.log(`[DIVERGENCE CHECK] divergenceSignals array is EMPTY.`);
            }
        } else {
            console.log(`[DIVERGENCE CHECK] breakPointsParam.divergenceSignals is MISSING or undefined.`);
        }
    }

    // ادامه منطق قبلی (بررسی واگرایی در ۵۰۰ کندل گذشته)
    if (index < 50) return null;

    const LOOKBACK = 500;
    const startIdx = Math.max(0, index - LOOKBACK);

    let hasBullishDivergence = false;
    let bestDivergence = null;

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

    if (hasBullishDivergence) {
        const price = data[index].close;
        console.log(`✅ واگرایی صعودی در کندل ${index} | قیمت ${price.toFixed(4)} | نوع: ${bestDivergence.type} | اندیکاتور: ${bestDivergence.indicatorType}`);
        return {
            signal: 'BUY',
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
    }

    return null;
}
