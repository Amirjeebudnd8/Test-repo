/**
 * استراتژی خودکفا (بدون وابستگی) – فقط شکست خط نزولی + ایچیموکو
 * منطق دقیقاً مشابه کد اصلی شما (1.json) اما بدون getTrendLines و ichimokuParam
 */

function customStrategy(data, index) {
    // ========== تنظیمات (قابل تغییر برای داده‌های مختلف) ==========
    const PIVOT_PERIOD = 3;               // دوره پیوت برای یافتن قله‌ها (کاهش یافته)
    const MIN_TOUCH_POINTS = 3;           // حداقل تعداد پیوت روی خط
    const MIN_CANDLE_DISTANCE = 1;        // حداقل فاصله کندلی بین پیوت‌ها (کاهش یافته)
    const MAX_DEVIATION_PERCENT = 0.5;    // حداکثر انحراف پیوت از خط (درصد – افزایش یافته)
    const MIN_DISTANCE = 0.05;            // حداقل فاصله low از خط (درصد)
    const MAX_DISTANCE = 0.20;            // حداکثر فاصله high از خط (درصد)
    const TENKAN = 9;
    const KIJUN = 26;
    const SENKOUB = 52;

    if (index < SENKOUB) return null;

    // ---------- 1. پیدا کردن پیوت‌های قله (high) ----------
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
                    idx: i,
                    price: data[i].high,
                    time: data[i].timestamp
                });
            }
        }
        return pivots;
    }

    // ---------- 2. پیدا کردن خطوط روند نزولی معتبر ----------
    function findDownTrendlines(pivots, currentIdx) {
        const lines = [];
        if (pivots.length < 3) return lines;

        for (let i = 0; i < pivots.length - 2; i++) {
            for (let j = i + 2; j < pivots.length; j++) {
                const p1 = pivots[i];
                const p2 = pivots[j];
                if (p2.idx > currentIdx) continue;
                if (p2.price >= p1.price) continue; // شیب نزولی نیست

                const slope = (p2.price - p1.price) / (p2.idx - p1.idx);
                const intercept = p1.price - slope * p1.idx;

                // پیوت‌های بین p1 و p2 که روی خط قرار می‌گیرند (با تلورانس)
                const onLine = [];
                for (let k = i; k <= j; k++) {
                    const p = pivots[k];
                    const lineVal = slope * p.idx + intercept;
                    const dev = Math.abs(p.price - lineVal) / lineVal * 100;
                    if (dev <= MAX_DEVIATION_PERCENT) {
                        onLine.push(p);
                    }
                }
                if (onLine.length < MIN_TOUCH_POINTS) continue;

                // بررسی فاصله کندلی بین پیوت‌های متوالی روی خط
                let validDist = true;
                for (let k = 1; k < onLine.length; k++) {
                    if (onLine[k].idx - onLine[k-1].idx < MIN_CANDLE_DISTANCE) {
                        validDist = false;
                        break;
                    }
                }
                if (!validDist) continue;

                lines.push({
                    startIdx: p1.idx,
                    startPrice: p1.price,
                    endIdx: p2.idx,
                    endPrice: p2.price,
                    slope: slope,
                    intercept: intercept,
                    onLinePivots: onLine
                });
            }
        }
        // حذف خطوط تکراری (بر اساس شروع و پایان)
        const unique = [];
        for (const l of lines) {
            if (!unique.some(u => u.startIdx === l.startIdx && u.endIdx === l.endIdx)) {
                unique.push(l);
            }
        }
        return unique;
    }

    // ---------- 3. محاسبه ایچیموکو ----------
    function ichimokuAt(idx) {
        if (idx < SENKOUB - 1) return null;
        let high9 = -Infinity, low9 = Infinity;
        for (let i = idx - TENKAN + 1; i <= idx; i++) {
            high9 = Math.max(high9, data[i].high);
            low9 = Math.min(low9, data[i].low);
        }
        const tenkan = (high9 + low9) / 2;

        let high26 = -Infinity, low26 = Infinity;
        for (let i = idx - KIJUN + 1; i <= idx; i++) {
            high26 = Math.max(high26, data[i].high);
            low26 = Math.min(low26, data[i].low);
        }
        const kijun = (high26 + low26) / 2;

        let high52 = -Infinity, low52 = Infinity;
        for (let i = idx - SENKOUB + 1; i <= idx; i++) {
            high52 = Math.max(high52, data[i].high);
            low52 = Math.min(low52, data[i].low);
        }
        const senkouB = (high52 + low52) / 2;
        const senkouA = (tenkan + kijun) / 2;
        const kumoTop = Math.max(senkouA, senkouB);

        return { tenkan, kijun, kumoTop };
    }

    // ---------- 4. بررسی شکست قبلی ----------
    function hasPreviousBreak(line, currIdx) {
        for (let j = line.endIdx + 1; j < currIdx; j++) {
            const lineVal = line.slope * j + line.intercept;
            const lowDist = ((data[j].low - lineVal) / lineVal) * 100;
            const highDist = ((data[j].high - lineVal) / lineVal) * 100;
            if (lowDist <= MAX_DISTANCE && highDist >= MIN_DISTANCE) {
                return true;
            }
        }
        return false;
    }

    // ---------- اجرای اصلی ----------
    const pivots = findHighPivots(data, PIVOT_PERIOD);
    const downLines = findDownTrendlines(pivots, index);
    if (downLines.length === 0) return null;

    const ichi = ichimokuAt(index);
    const hasIchi = (ichi !== null);

    let bestSignal = null;
    let bestDiff = Infinity;

    for (const line of downLines) {
        if (line.endIdx > index) continue;
        const lineVal = line.slope * index + line.intercept;
        const { high, low, close, timestamp } = data[index];

        const lowDist = ((low - lineVal) / lineVal) * 100;
        const highDist = ((high - lineVal) / lineVal) * 100;

        const inRange = (lowDist <= MAX_DISTANCE && highDist >= MIN_DISTANCE);
        if (!inRange) continue;

        if (hasIchi) {
            if (!(close > ichi.kumoTop && ichi.tenkan > ichi.kijun)) continue;
        }

        if (hasPreviousBreak(line, index)) continue;

        const target = (MIN_DISTANCE + MAX_DISTANCE) / 2;
        const diff = Math.abs(((high - lineVal) / lineVal) * 100 - target);
        if (diff < bestDiff) {
            bestDiff = diff;
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
                reason: `شکست خط نزولی | lowDist=${lowDist.toFixed(2)}% highDist=${highDist.toFixed(2)}%`,
                lineId: `line_${line.startIdx}_${line.endIdx}`,
                breakoutDetails: {
                    lineValue: lineVal,
                    distanceLow: lowDist,
                    distanceHigh: highDist,
                    candleIndex: index,
                    timestamp: timestamp,
                    candleLow: low,
                    candleHigh: high,
                    candleClose: close
                }
            };
        }
    }

    if (bestSignal) {
        const date = new Date(bestSignal.breakoutDetails.timestamp).toLocaleString('fa-IR');
        console.log(`🎯 سیگنال خرید | تاریخ: ${date} | کندل: ${index} | LowDist=${bestSignal.breakoutDetails.distanceLow.toFixed(3)}% HighDist=${bestSignal.breakoutDetails.distanceHigh.toFixed(3)}% | قیمت=${bestSignal.price.toFixed(4)}`);
    }

    return bestSignal;
}
