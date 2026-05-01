/**
 * استراتژی خودکفا برای شکست خط روند نزولی با فیلتر ایچیموکو
 * - بدون وابستگی به getTrendLines() یا ichimokuParam
 * - محاسبه خطوط روند نزولی با استفاده از پیوت‌های High
 * - محاسبه ایچیموکو با دوره‌های ۹,۲۶,۵۲
 * - منطق شکست خط مشابه کد اصلی شما
 */

function customStrategy(data, index) {
    // ========== تنظیمات ثابت ==========
    const PIVOT_PERIOD = 5;
    const MIN_TOUCH_POINTS = 3;
    const MIN_CANDLE_DISTANCE = 3;
    const MAX_DEVIATION_PERCENT = 0.1;
    const MIN_DISTANCE = 0.09;   // حداقل فاصله low از خط (درصد)
    const MAX_DISTANCE = 0.15;    // حداکثر فاصله high از خط (درصد)
    const TENKAN_PERIOD = 9;
    const KIJUN_PERIOD = 26;
    const SENKOU_B_PERIOD = 52;

    if (index < SENKOU_B_PERIOD) return null;

    // ========== 1. پیدا کردن پیوت‌های قله (high) ==========
    function findHighPivots(data, period) {
        const pivots = [];
        for (let i = period; i < data.length - period; i++) {
            let isHigh = true;
            for (let j = 1; j <= period; j++) {
                if (data[i].high <= data[i - j].high || data[i].high <= data[i + j].high) {
                    isHigh = false;
                    break;
                }
            }
            if (isHigh) {
                pivots.push({
                    index: i,
                    price: data[i].high,
                    type: 'high',
                    timestamp: data[i].timestamp
                });
            }
        }
        return pivots;
    }

    // ========== 2. پیدا کردن خطوط روند نزولی (با حداقل 3 پیوت) ==========
    function findDownTrendLines(data, pivots, currentIndex) {
        const lines = [];
        if (pivots.length < 3) return lines;

        for (let i = 0; i < pivots.length - 2; i++) {
            for (let j = i + 2; j < pivots.length; j++) {
                const p1 = pivots[i];
                const p2 = pivots[j];
                if (p2.index > currentIndex) continue;
                if (p2.price >= p1.price) continue;

                const slope = (p2.price - p1.price) / (p2.index - p1.index);
                const intercept = p1.price - slope * p1.index;
                
                const linePivots = pivots.filter(p => 
                    p.index >= p1.index && p.index <= p2.index && p.type === 'high'
                ).sort((a,b) => a.index - b.index);
                
                if (linePivots.length < MIN_TOUCH_POINTS) continue;
                
                let validDistance = true;
                for (let k = 1; k < linePivots.length; k++) {
                    if (linePivots[k].index - linePivots[k-1].index < MIN_CANDLE_DISTANCE) {
                        validDistance = false;
                        break;
                    }
                }
                if (!validDistance) continue;
                
                let allOnLine = true;
                for (const p of linePivots) {
                    const lineVal = slope * p.index + intercept;
                    const deviation = Math.abs(p.price - lineVal) / lineVal;
                    if (deviation > MAX_DEVIATION_PERCENT / 100) {
                        allOnLine = false;
                        break;
                    }
                }
                if (!allOnLine) continue;
                
                lines.push({
                    startIndex: p1.index,
                    startPrice: p1.price,
                    endIndex: p2.index,
                    endPrice: p2.price,
                    slope: slope,
                    intercept: intercept,
                    pivots: linePivots
                });
            }
        }
        return lines;
    }

    // ========== 3. محاسبه ایچیموکو برای کندل جاری ==========
    function calculateIchimoku(data, currentIdx) {
        if (currentIdx < SENKOU_B_PERIOD - 1) return null;
        
        let high9 = -Infinity, low9 = Infinity;
        for (let i = currentIdx - TENKAN_PERIOD + 1; i <= currentIdx; i++) {
            if (data[i].high > high9) high9 = data[i].high;
            if (data[i].low < low9) low9 = data[i].low;
        }
        const tenkan = (high9 + low9) / 2;
        
        let high26 = -Infinity, low26 = Infinity;
        for (let i = currentIdx - KIJUN_PERIOD + 1; i <= currentIdx; i++) {
            if (data[i].high > high26) high26 = data[i].high;
            if (data[i].low < low26) low26 = data[i].low;
        }
        const kijun = (high26 + low26) / 2;
        
        let high52 = -Infinity, low52 = Infinity;
        for (let i = currentIdx - SENKOU_B_PERIOD + 1; i <= currentIdx; i++) {
            if (data[i].high > high52) high52 = data[i].high;
            if (data[i].low < low52) low52 = data[i].low;
        }
        const senkouB = (high52 + low52) / 2;
        const senkouA = (tenkan + kijun) / 2;
        const kumoTop = Math.max(senkouA, senkouB);
        
        return {
            tenkan: tenkan,
            kijun: kijun,
            kumoTop: kumoTop,
            isPriceAboveCloud: data[currentIdx].close > kumoTop,
            isTenkanAboveKijun: tenkan > kijun
        };
    }

    // ========== اجرای اصلی ==========
    const highPivots = findHighPivots(data, PIVOT_PERIOD);
    const downTrendLines = findDownTrendLines(data, highPivots, index);
    
    if (downTrendLines.length === 0) return null;
    
    const ichimoku = calculateIchimoku(data, index);
    const hasIchimoku = (ichimoku !== null);
    
    let bestSignal = null;
    let closestToTarget = Infinity;
    
    for (let i = 0; i < downTrendLines.length; i++) {
        const line = downTrendLines[i];
        if (line.endIndex > index) continue;
        if (line.startPrice <= line.endPrice) continue;
        
        const lineValue = line.slope * index + line.intercept;
        const currentCandle = data[index];
        const { high, low, close, timestamp } = currentCandle;
        
        const distanceLow = ((low - lineValue) / lineValue) * 100;
        const distanceHigh = ((high - lineValue) / lineValue) * 100;
        
        const overlapsTolerance = (distanceLow <= MAX_DISTANCE && distanceHigh >= MIN_DISTANCE);
        if (!overlapsTolerance) continue;
        
        if (hasIchimoku) {
            if (!(close > ichimoku.kumoTop && ichimoku.tenkan > ichimoku.kijun)) continue;
        }
        
        let hasPreviousBreak = false;
        for (let j = line.endIndex + 1; j < index; j++) {
            const pastCandle = data[j];
            const checkLineValue = line.slope * j + line.intercept;
            const dLow = ((pastCandle.low - checkLineValue) / checkLineValue) * 100;
            const dHigh = ((pastCandle.high - checkLineValue) / checkLineValue) * 100;
            if (dLow <= MAX_DISTANCE && dHigh >= MIN_DISTANCE) {
                hasPreviousBreak = true;
                break;
            }
        }
        if (hasPreviousBreak) continue;
        
        const targetMiddle = (MIN_DISTANCE + MAX_DISTANCE) / 2;
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
                reason: `شکست خط نزولی با بازه کندل (low=${distanceLow.toFixed(2)}%, high=${distanceHigh.toFixed(2)}%)`,
                lineId: `trendline_${line.startIndex}_${line.endIndex}_${i}`,
                breakoutDetails: {
                    lineValue: lineValue,
                    distanceLow: distanceLow,
                    distanceHigh: distanceHigh,
                    candleIndex: index,
                    timestamp: timestamp,
                    candleLow: low,
                    candleHigh: high,
                    candleClose: close
                },
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
        }
    }
    
    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`🎯 سیگنال خرید | تاریخ: ${date} | کندل: ${index} | فاصله Low=${bestSignal.breakoutDetails.distanceLow.toFixed(3)}% | High=${bestSignal.breakoutDetails.distanceHigh.toFixed(3)}% | قیمت ورود (close): ${bestSignal.price.toFixed(4)}`);
    }
    
    return bestSignal;
}
