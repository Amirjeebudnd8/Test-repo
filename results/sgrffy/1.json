const ANALYSIS_CONFIG = {
    trendLines: {
        pivotPeriod: 5,
        minTouchPoints: 3,
        minCandleDistance: 3,
        maxDeviation: 0.001
    },
    ichimoku: {
        enabled: true,
        useCloudFilter: true,
        useTKCross: true,
        useChikou: true,
        tenkanPeriod: 14,
        kijunPeriod: 30,
        senkouBPeriod: 57
    }
};

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // 🔧 رفع خطای sharpTrendsParam
    var sharpTrendsParam = sharpTrendsParam || [];

    const trendLines = getTrendLines();
    const downTrendLines = trendLines.primaryDown || [];
    if (downTrendLines.length === 0) return null;

    const hasIchimoku = ichimokuParam && typeof ichimokuParam === 'object';
    const divergenceSignals = window?.divergenceSignals || [];

    const minDistance = 0.09;
    const maxDistance = 0.15;
    let bestSignal = null;
    let closestToTarget = Infinity;

    for (let i = 0; i < downTrendLines.length; i++) {
        const line = downTrendLines[i];
        if (line.endIndex > index) continue;
        if (line.startPrice <= line.endPrice) continue;

        const slope = (line.endIndex !== line.startIndex)
            ? (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex)
            : 0;
        const intercept = line.startPrice - slope * line.startIndex;
        const lineValue = slope * index + intercept;

        const candle = data[index];
        const { high, low, close, timestamp } = candle;

        const distanceLow = ((low - lineValue) / lineValue) * 100;
        const distanceHigh = ((high - lineValue) / lineValue) * 100;
        const overlapsTolerance = distanceLow <= maxDistance && distanceHigh >= minDistance;
        if (!overlapsTolerance) continue;

        // فیلتر ایچیموکو
        if (hasIchimoku) {
            const { kumoTop, tenkan, kijun } = ichimokuParam;
            if (!(close > kumoTop && tenkan > kijun)) continue;
        } else {
            continue;
        }

        // واگرایی صعودی در ۱۰۰ کندل اخیر
        const recentDiv = divergenceSignals.filter(d =>
            (d.type === 'RegularBullish' || d.type === 'HiddenBullish') &&
            d.endIndex >= index - 100 &&
            d.startIndex <= index
        );
        if (recentDiv.length === 0) continue;

        // بررسی عدم شکست قبلی
        let hasPreviousBreak = false;
        for (let j = line.endIndex + 1; j < index; j++) {
            const pastCandle = data[j];
            const pastLineValue = slope * j + intercept;
            const dLow = ((pastCandle.low - pastLineValue) / pastLineValue) * 100;
            const dHigh = ((pastCandle.high - pastLineValue) / pastLineValue) * 100;
            if (dLow <= maxDistance && dHigh >= minDistance) {
                hasPreviousBreak = true;
                break;
            }
        }
        if (hasPreviousBreak) continue;

        const targetMiddle = (minDistance + maxDistance) / 2;
        const diffFromMiddle = Math.abs(((high - lineValue) / lineValue) * 100 - targetMiddle);

        if (diffFromMiddle < closestToTarget) {
            closestToTarget = diffFromMiddle;
            bestSignal = {
                signal: 'BUY',
                price: close,
                stopLoss: close * 0.995,
                useStagedStopLoss: true,
                stopLossStages: [
                    { movePercent: 0.4, stopLossPercent: 0.4 },
                    { movePercent: 0.8, stopLossPercent: 0.7 },
                    { movePercent: 1.1, stopLossPercent: 0.9 },
                    { movePercent: 1.3, stopLossPercent: 1.1 },
                    { movePercent: 1.5, stopLossPercent: 1.3 },
                    { movePercent: 1.7, stopLossPercent: 1.5 },
                    { movePercent: 2, stopLossPercent: 1.7 },
                    { movePercent: 2.3, stopLossPercent: 2 },
                    { movePercent: 2.5, stopLossPercent: 2.3 },
                    { movePercent: 3, stopLossPercent: 2.8 },
                    { movePercent: 4, stopLossPercent: 3.5 },
                    { movePercent: 5, stopLossPercent: 4.5 },
                    { movePercent: 6, stopLossPercent: 5.5 },
                    { movePercent: 7, stopLossPercent: 6.5 },
                    { movePercent: 8, stopLossPercent: 7.5 }
                ],
                reason: `واگرایی=${recentDiv.length}, ایچیموکو✅, خط نزولی شکسته`,
                lineId: `trend_${line.startIndex}_${line.endIndex}`,
                breakoutDetails: { lineValue, distanceLow, distanceHigh, candleIndex: index, timestamp }
            };
        }
    }

    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`🎯 سیگنال | ${date} | کندل ${index} | Low=${bestSignal.breakoutDetails.distanceLow.toFixed(3)}% | High=${bestSignal.breakoutDetails.distanceHigh.toFixed(3)}%`);
    }

    return bestSignal;
}
