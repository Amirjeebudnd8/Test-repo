### VERSION: 9 ###
/**
 * ===========================================================================
 * ماژول تشخیص خطوط روند (Trendline Detector) – نسخه ۹
 * ===========================================================================
 *
 * ورودی اجباری: marketData (آرایهٔ کندل‌ها), options (pivotPeriod,
 * minTouchPoints, minCandleDistance, maxDeviation)
 * خروجی: { trendLines: { primaryUp, primaryDown }, statistics, error }
 * ===========================================================================
 */

'use strict';

// ---------- اعتبارسنجی ----------
function validateMarketData(data) {
    if (!data) return { valid: false, error: 'marketData is null or undefined' };
    if (!Array.isArray(data)) return { valid: false, error: 'marketData must be an array' };
    if (data.length === 0) return { valid: false, error: 'marketData is empty' };
    const requiredFields = ['timestamp', 'open', 'high', 'low', 'close'];
    const firstCandle = data[0];
    if (!firstCandle || typeof firstCandle !== 'object') return { valid: false, error: 'First candle is not an object' };
    for (const field of requiredFields) {
        if (!(field in firstCandle)) return { valid: false, error: `Candle missing required field: "${field}"` };
    }
    return { valid: true, error: null };
}

function validateOptions(options) {
    if (!options || typeof options !== 'object') return { valid: false, error: 'options is required and must be an object' };
    const requiredNumbers = ['pivotPeriod', 'minTouchPoints', 'minCandleDistance', 'maxDeviation'];
    for (const key of requiredNumbers) {
        const val = options[key];
        if (val === undefined || val === null) return { valid: false, error: `Missing required option: "${key}"` };
        if (typeof val !== 'number' || !isFinite(val) || val <= 0) return { valid: false, error: `Option "${key}" must be a positive number, got: ${val}` };
    }
    return { valid: true, error: null };
}

// ---------- ابزارهای کمکی ----------
function indexToTimestamp(index, marketData) {
    if (index < 0 || index >= marketData.length) return 0;
    const candle = marketData[index];
    if (!candle || candle.timestamp === undefined || candle.timestamp === null) return 0;
    const ts = candle.timestamp;
    if (ts instanceof Date) return Math.floor(ts.getTime() / 1000);
    if (typeof ts === 'number') return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
    if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000); }
    return 0;
}

// ---------- یافتن نقاط پیوت ----------
function findPivotPoints(marketData, pivotPeriod) {
    const pivots = [];
    const len = marketData.length;
    if (len < pivotPeriod * 2 + 1) return pivots;

    for (let i = pivotPeriod; i < len - pivotPeriod; i++) {
        const currentHigh = marketData[i].high;
        const currentLow = marketData[i].low;
        let isHighPivot = true;
        let isLowPivot = true;

        for (let j = 1; j <= pivotPeriod; j++) {
            if (currentHigh < marketData[i - j].high || currentHigh < marketData[i + j].high) isHighPivot = false;
            if (currentLow > marketData[i - j].low || currentLow > marketData[i + j].low) isLowPivot = false;
        }

        if (isHighPivot) pivots.push({ index: i, price: currentHigh, type: 'high', timestamp: marketData[i].timestamp });
        if (isLowPivot) pivots.push({ index: i, price: currentLow, type: 'low', timestamp: marketData[i].timestamp });
    }
    return pivots;
}

// ---------- شمارش نقاط برخورد ----------
function countTouchPoints(line, marketData, currentCandleIndex, maxDeviation, minCandleDistance) {
    let touchCount = 0;
    let lastTouchIndex = null;
    const touchDetails = [];
    const endIndex = Math.min(currentCandleIndex, line.endIndex);

    for (let i = line.startIndex; i <= endIndex; i++) {
        if (i >= marketData.length) break;
        const candle = marketData[i];
        const expectedPrice = line.slope * i + line.intercept;
        if (expectedPrice === 0) continue;

        let checkPrice;
        if (line.type === 'primaryUp') checkPrice = candle.low;
        else if (line.type === 'primaryDown') checkPrice = candle.high;
        else continue;

        const deviation = Math.abs(checkPrice - expectedPrice) / Math.abs(expectedPrice);
        if (deviation <= maxDeviation) {
            if (lastTouchIndex === null || (i - lastTouchIndex) >= minCandleDistance) {
                touchCount++;
                touchDetails.push({ index: i, price: checkPrice, expectedPrice, deviation });
                lastTouchIndex = i;
            }
        }
    }
    return { count: touchCount, details: touchDetails };
}

// ---------- ایجاد یک خط روند بین دو نقطهٔ پیوت ----------
function createTrendLine(p1, p2, marketData, options, currentCandleIndex) {
    if (p2.index > currentCandleIndex) return null;
    if (p2.index - p1.index < options.minCandleDistance) return null;

    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    const intercept = p1.price - slope * p1.index;

    let lineType = null;
    if (p1.type === 'low' && p2.type === 'low') lineType = 'primaryUp';
    else if (p1.type === 'high' && p2.type === 'high') lineType = 'primaryDown';
    if (!lineType) return null;

    return {
        startIndex: p1.index,
        startPrice: p1.price,
        endIndex: p2.index,
        endPrice: p2.price,
        startTime: indexToTimestamp(p1.index, marketData),
        endTime: indexToTimestamp(p2.index, marketData),
        slope,
        intercept,
        pivot1: p1,
        pivot2: p2,
        type: lineType,
        isManual: false,
    };
}

// ---------- اعتبارسنجی یک خط روند ----------
function isValidTrendLine(line, marketData, options, currentCandleIndex) {
    if (!line) return false;
    if (line.endIndex > currentCandleIndex) return false;
    if (line.type === 'primaryUp' && line.endPrice <= line.startPrice) return false;
    if (line.type === 'primaryDown' && line.endPrice >= line.startPrice) return false;

    const touch = countTouchPoints(line, marketData, currentCandleIndex, options.maxDeviation, options.minCandleDistance);
    line.touchDetails = touch.details;
    return touch.count >= options.minTouchPoints;
}

// ---------- تشخیص خطوط از تمام پیوت‌ها ----------
function detectTrendLinesFromPivots(pivots, marketData, options, currentCandleIndex) {
    const primaryUp = [];
    const primaryDown = [];

    if (!pivots || pivots.length < 2) return { primaryUp, primaryDown };

    const validPivots = pivots.filter(p => p.index <= currentCandleIndex);
    const lowPivots = validPivots.filter(p => p.type === 'low').sort((a, b) => a.index - b.index);
    const highPivots = validPivots.filter(p => p.type === 'high').sort((a, b) => a.index - b.index);

    for (let i = 0; i < lowPivots.length - 1; i++) {
        for (let j = i + 1; j < lowPivots.length; j++) {
            const line = createTrendLine(lowPivots[i], lowPivots[j], marketData, options, currentCandleIndex);
            if (line && isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                if (!primaryUp.some(l => l.startIndex === line.startIndex && l.endIndex === line.endIndex)) primaryUp.push(line);
            }
        }
    }

    for (let i = 0; i < highPivots.length - 1; i++) {
        for (let j = i + 1; j < highPivots.length; j++) {
            const line = createTrendLine(highPivots[i], highPivots[j], marketData, options, currentCandleIndex);
            if (line && isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                if (!primaryDown.some(l => l.startIndex === line.startIndex && l.endIndex === line.endIndex)) primaryDown.push(line);
            }
        }
    }

    return { primaryUp, primaryDown };
}

// ---------- تابع اصلی ----------
function detectTrendLinesAdvanced(marketData, options) {
    const dataValidation = validateMarketData(marketData);
    if (!dataValidation.valid) return { trendLines: { primaryUp: [], primaryDown: [] }, statistics: { totalLines: 0, primaryUp: 0, primaryDown: 0 }, error: dataValidation.error };

    const optValidation = validateOptions(options);
    if (!optValidation.valid) return { trendLines: { primaryUp: [], primaryDown: [] }, statistics: { totalLines: 0, primaryUp: 0, primaryDown: 0 }, error: optValidation.error };

    const currentCandleIndex = marketData.length - 1;
    const allPivots = findPivotPoints(marketData, options.pivotPeriod);

    if (allPivots.length < 2) {
        return { trendLines: { primaryUp: [], primaryDown: [] }, statistics: { totalLines: 0, primaryUp: 0, primaryDown: 0, pivotsFound: allPivots.length } };
    }

    const lines = detectTrendLinesFromPivots(allPivots, marketData, options, currentCandleIndex);

    return {
        trendLines: {
            primaryUp: lines.primaryUp.map(l => ({
                startIndex: l.startIndex, endIndex: l.endIndex, startPrice: l.startPrice, endPrice: l.endPrice,
                startTime: l.startTime, endTime: l.endTime, slope: l.slope, intercept: l.intercept,
                touchCount: Array.isArray(l.touchDetails) ? l.touchDetails.length : 0
            })),
            primaryDown: lines.primaryDown.map(l => ({
                startIndex: l.startIndex, endIndex: l.endIndex, startPrice: l.startPrice, endPrice: l.endPrice,
                startTime: l.startTime, endTime: l.endTime, slope: l.slope, intercept: l.intercept,
                touchCount: Array.isArray(l.touchDetails) ? l.touchDetails.length : 0
            }))
        },
        statistics: {
            totalLines: lines.primaryUp.length + lines.primaryDown.length,
            primaryUp: lines.primaryUp.length,
            primaryDown: lines.primaryDown.length,
            pivotsFound: allPivots.length
        }
    };
}

// ---------- تست داخلی ----------
function runSelfTest() {
    const data = Array.from({ length: 200 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 60000),
        open: 100 + Math.sin(i / 10) * 5,
        high: 105 + Math.sin(i / 10) * 5,
        low: 95 + Math.sin(i / 10) * 5,
        close: 102 + Math.sin(i / 10) * 5,
        volume: 1000
    }));
    const opt = { pivotPeriod: 3, minTouchPoints: 3, minCandleDistance: 3, maxDeviation: 0.001 };
    const r = detectTrendLinesAdvanced(data, opt);
    console.log(r.error ? `❌ Self-test failed: ${r.error}` : `✅ Self-test passed: ${r.statistics.totalLines} trend lines found`);
    return !r.error;
}

module.exports = { detectTrendLinesAdvanced };
if (require.main === module) runSelfTest();
