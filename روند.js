/**
 * استراتژی تست خطوط روند
 * پارامترهای اجباری در خروجی:
 * - period: 5 (دوره پیوت)
 * - minTouchPoints: 3
 * - minCandleDistance: 3
 * - maxDeviationPercent: 0.1
 */

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    if (index < 50) return null;

    let hasUpBreak = false;
    if (breakPointsParam && typeof breakPointsParam === 'object') {
        const start = Math.max(0, index - 500);
        for (let i = start; i <= index; i++) {
            const pts = breakPointsParam[i];
            if (pts && pts.some(p => p.direction === 'up')) hasUpBreak = true;
        }
    }

    const price = data[index].close;
    if (hasUpBreak) {
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.98,
            takeProfit: price * 1.04,
            ichimoku: { tenkanPeriod:9, kijunPeriod:26, senkouBPeriod:52, useCloudFilter:true, useTKCross:true, useChikou:true },
            trendlines: { pivotPeriod:5, minTouchPoints:3, minCandleDistance:3, maxDeviationPercent:0.1 },
            divergence: { rsiPeriod:14, macdFastPeriod:12, macdSlowPeriod:26, macdSignalPeriod:9, macdUseHistogram:true },
            sharpTrends: { consecutiveCandles:5, minPercentChange:0.5, boxValidityHours:72 }
        };
    }
    return null;
}
