### VERSION: 9 ###
/**
 * ===========================================================================
 * ماژول تولید نقاط شکست خطوط روند (Breakpoint Generator) – نسخه ۹
 * ===========================================================================
 *
 * ورودی اجباری: marketData, trendLines, options (minBreakPercent,
 * useClosePrice, requireConfirmation)
 * خروجی: { breakPoints: Object, error?: string }
 * ===========================================================================
 */

'use strict';

function validateMarketData(data) {
    if (!data) return { valid: false, error: 'marketData is null or undefined' };
    if (!Array.isArray(data)) return { valid: false, error: 'marketData must be an array' };
    if (data.length === 0) return { valid: false, error: 'marketData is empty' };
    const first = data[0];
    if (!first || typeof first !== 'object') return { valid: false, error: 'First candle is not an object' };
    const required = ['timestamp', 'open', 'high', 'low', 'close'];
    for (const f of required) if (!(f in first)) return { valid: false, error: `First candle missing field: "${f}"` };
    return { valid: true, error: null };
}

function validateTrendLines(trendLines) {
    if (!trendLines || typeof trendLines !== 'object') return { valid: false, error: 'trendLines must be an object with primaryUp/primaryDown arrays' };
    if (!Array.isArray(trendLines.primaryUp) || !Array.isArray(trendLines.primaryDown)) return { valid: false, error: 'trendLines.primaryUp and trendLines.primaryDown must be arrays' };
    const all = [...trendLines.primaryUp, ...trendLines.primaryDown];
    for (let i = 0; i < all.length; i++) {
        const line = all[i];
        if (!line || typeof line !== 'object') return { valid: false, error: `Line at index ${i} is not an object` };
        const req = ['startIndex', 'endIndex', 'startPrice', 'endPrice'];
        for (const f of req) {
            if (typeof line[f] !== 'number' || !isFinite(line[f])) return { valid: false, error: `Line at index ${i} missing/invalid field "${f}"` };
        }
        if (line.startIndex >= line.endIndex) return { valid: false, error: `Line at index ${i} has startIndex >= endIndex` };
    }
    return { valid: true, error: null };
}

function validateOptions(options) {
    if (!options || typeof options !== 'object') return { valid: false, error: 'options is required' };
    if (typeof options.minBreakPercent !== 'number' || !isFinite(options.minBreakPercent) || options.minBreakPercent <= 0) return { valid: false, error: 'minBreakPercent must be a positive number' };
    if (typeof options.useClosePrice !== 'boolean') return { valid: false, error: 'useClosePrice must be a boolean' };
    if (!Number.isInteger(options.requireConfirmation) || options.requireConfirmation < 0) return { valid: false, error: 'requireConfirmation must be a non-negative integer' };
    return { valid: true, error: null };
}

function candleTimestampToSeconds(candle) {
    if (!candle || candle.timestamp === undefined || candle.timestamp === null) return 0;
    const ts = candle.timestamp;
    if (ts instanceof Date) return Math.floor(ts.getTime() / 1000);
    if (typeof ts === 'number') return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
    if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000); }
    return 0;
}

function getExtendedPrice(line, index) {
    if (line.endIndex === line.startIndex) return line.startPrice;
    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    return line.startPrice + slope * (index - line.startIndex);
}

function generateBreakPoints(marketData, trendLines, options) {
    const dataValidation = validateMarketData(marketData);
    if (!dataValidation.valid) return { breakPoints: {}, error: dataValidation.error };

    const trendValidation = validateTrendLines(trendLines);
    if (!trendValidation.valid) return { breakPoints: {}, error: trendValidation.error };

    const optValidation = validateOptions(options);
    if (!optValidation.valid) return { breakPoints: {}, error: optValidation.error };

    const allLines = [];
    let idCounter = 0;
    for (const line of trendLines.primaryUp) allLines.push({ ...line, lineId: `primaryUp_${idCounter++}`, lineType: 'primaryUp' });
    for (const line of trendLines.primaryDown) allLines.push({ ...line, lineId: `primaryDown_${idCounter++}`, lineType: 'primaryDown' });

    const breakPointsMap = {};
    const totalCandles = marketData.length;

    for (const line of allLines) {
        let found = false;

        for (let i = line.endIndex + 1; i < totalCandles; i++) {
            const candle = marketData[i];
            if (!candle) continue;
            const linePrice = getExtendedPrice(line, i);
            const checkPrice = options.useClosePrice ? candle.close : (line.lineType === 'primaryUp' ? candle.low : candle.high);
            if (checkPrice === undefined || checkPrice === null) continue;

            let isBreak = false;
            let direction = '';
            if (line.lineType === 'primaryUp') {
                if (checkPrice < linePrice * (1 - options.minBreakPercent / 100)) { isBreak = true; direction = 'down'; }
            } else {
                if (checkPrice > linePrice * (1 + options.minBreakPercent / 100)) { isBreak = true; direction = 'up'; }
            }

            if (isBreak) {
                if (options.requireConfirmation > 0) {
                    let confirmed = true;
                    for (let j = 1; j <= options.requireConfirmation; j++) {
                        if (i + j >= totalCandles) { confirmed = false; break; }
                        const nextCandle = marketData[i + j];
                        if (!nextCandle) { confirmed = false; break; }
                        const nextLinePrice = getExtendedPrice(line, i + j);
                        const nextCheck = options.useClosePrice ? nextCandle.close : (line.lineType === 'primaryUp' ? nextCandle.low : nextCandle.high);
                        if (nextCheck === undefined || nextCheck === null) { confirmed = false; break; }
                        if (line.lineType === 'primaryUp' && nextCheck >= nextLinePrice * (1 - options.minBreakPercent / 100)) { confirmed = false; break; }
                        if (line.lineType === 'primaryDown' && nextCheck <= nextLinePrice * (1 + options.minBreakPercent / 100)) { confirmed = false; break; }
                    }
                    if (!confirmed) continue;
                }
                if (!breakPointsMap[i]) breakPointsMap[i] = [];
                breakPointsMap[i].push({
                    lineId: line.lineId,
                    lineType: line.lineType,
                    direction,
                    price: checkPrice,
                    time: candleTimestampToSeconds(candle),
                    isBreakPoint: true,
                    isEndOfData: false
                });
                found = true;
                break;
            }
        }

        if (!found) {
            const lastIdx = totalCandles - 1;
            if (!breakPointsMap[lastIdx]) breakPointsMap[lastIdx] = [];
            breakPointsMap[lastIdx].push({
                lineId: line.lineId,
                lineType: line.lineType,
                direction: line.lineType === 'primaryUp' ? 'down' : 'up',
                price: getExtendedPrice(line, lastIdx),
                time: candleTimestampToSeconds(marketData[lastIdx]),
                isBreakPoint: true,
                isEndOfData: true
            });
        }
    }

    return { breakPoints: breakPointsMap };
}

function runSelfTest() {
    const data = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 60000),
        open: 100, high: 105, low: 95, close: 102, volume: 1
    }));
    const tl = {
        primaryUp: [{ startIndex: 10, endIndex: 30, startPrice: 96, endPrice: 105, slope: (105-96)/20, intercept: 96 - ((105-96)/20)*10 }],
        primaryDown: [],
    };
    const res = generateBreakPoints(data, tl, { minBreakPercent: 1, useClosePrice: true, requireConfirmation: 0 });
    if (res.error) { console.log(`❌ Self-test failed: ${res.error}`); return false; }
    console.log(`✅ Self-test passed: ${Object.keys(res.breakPoints).length} candles with breakpoints`);
    return true;
}

module.exports = { generateBreakPoints };
if (require.main === module) runSelfTest();
