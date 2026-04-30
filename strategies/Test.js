
function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    const trendLines = getTrendLines();
    const downTrendLines = trendLines.primaryDown || [];
    if (downTrendLines.length === 0) return null;

    const hasIchimoku = ichimokuParam && typeof ichimokuParam === 'object';

    let bestSignal = null;
    let closestToTarget = Infinity;
    const minDistance = 0.09;
    const maxDistance = 0.15;

    for (let i = 0; i < downTrendLines.length; i++) {
        const line = downTrendLines[i];
        if (line.endIndex > index) continue;
        if (line.startPrice <= line.endPrice) continue;

        const slope = (line.endIndex !== line.startIndex)
            ? (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex)
            : 0;
        const intercept = line.startPrice - slope * line.startIndex;
        const lineValue = slope * index + intercept;

        const currentCandle = data[index];
        const { high, low, close, timestamp } = currentCandle;

        // فاصله low و high نسبت به خط
        const distanceLow = ((low - lineValue) / lineValue) * 100;
        const distanceHigh = ((high - lineValue) / lineValue) * 100;

        // شرط شکست: اگر بازه‌ی کندل تلورانس را قطع کند
        const overlapsTolerance = distanceLow <= maxDistance && distanceHigh >= minDistance;
        if (!overlapsTolerance) continue;

        // فیلتر ایچیموکو
        if (hasIchimoku) {
            const { kumoTop, tenkan, kijun } = ichimokuParam;
            if (!(close > kumoTop && tenkan > kijun)) continue;
        }

        // بررسی شکست قبلی
        let hasPreviousBreak = false;
        for (let j = line.endIndex + 1; j < index; j++) {
            const pastCandle = data[j];
            const checkLineValue = slope * j + intercept;
            const dLow = ((pastCandle.low - checkLineValue) / checkLineValue) * 100;
            const dHigh = ((pastCandle.high - checkLineValue) / checkLineValue) * 100;
            if (dLow <= maxDistance && dHigh >= minDistance) {
                hasPreviousBreak = true;
                break;
            }
        }
        if (hasPreviousBreak) continue;

        // انتخاب بهترین سیگنال
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
          
                reason: `شکست خط نزولی با بازه‌ی کندل (low=${distanceLow.toFixed(2)}%, high=${distanceHigh.toFixed(2)}%)`,
                lineId: `trendline_${line.startIndex}_${line.endIndex}_${i}`,
                breakoutDetails: {
                    lineValue,
                    distanceLow,
                    distanceHigh,
                    candleIndex: index,
                    timestamp,
                    candleLow: low,
                    candleHigh: high,
                    candleClose: close
                }
            };
        }
    }

    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`🎯 سیگنال خرید | تاریخ: ${date} | کندل: ${index} | فاصله Low=${bestSignal.breakoutDetails.distanceLow.toFixed(3)}% | High=${bestSignal.breakoutDetails.distanceHigh.toFixed(3)}% | قیمت ورود (close): ${bestSignal.price.toFixed(4)}`);
    }

    return bestSignal;
}
