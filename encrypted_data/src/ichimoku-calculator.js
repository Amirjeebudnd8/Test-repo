### VERSION: FINAL ###
/**
 * ===========================================================================
 * ماژول محاسبهٔ ایچیموکو (Ichimoku Calculator) – نسخهٔ کامل بدون فشرده‌سازی
 * ===========================================================================
 *
 * این ماژول شامل تمام جزئیات لازم برای محاسبهٔ ایچیموکو بر اساس داده‌های تاریخی است.
 * هیچ تابعی حذف نشده و تمام مسیرهای ورودی پوشش داده شده‌اند.
 *
 * ورودی اجباری: marketData, options (tenkanPeriod, kijunPeriod, senkouBPeriod, chikouShift)
 * خروجی: { result: Array, error?: string }
 * ===========================================================================
 */

'use strict';

function validateMarketData(data) {
    if (!data) return { valid: false, error: 'marketData is null or undefined' };
    if (!Array.isArray(data)) return { valid: false, error: 'marketData must be an array' };
    if (data.length === 0) return { valid: false, error: 'marketData is empty' };
    const required = ['timestamp', 'open', 'high', 'low', 'close'];
    const first = data[0];
    if (!first || typeof first !== 'object') return { valid: false, error: 'First candle is not an object' };
    for (const f of required) if (!(f in first)) return { valid: false, error: `First candle missing field: "${f}"` };
    return { valid: true, error: null };
}

function validateOptions(options) {
    if (!options || typeof options !== 'object') return { valid: false, error: 'options is required and must be an object' };
    const required = ['tenkanPeriod', 'kijunPeriod', 'senkouBPeriod', 'chikouShift'];
    for (const key of required) {
        const val = options[key];
        if (val === undefined || val === null) return { valid: false, error: `Missing required option: "${key}"` };
        if (!Number.isInteger(val) || val <= 0) return { valid: false, error: `Option "${key}" must be a positive integer, got: ${val}` };
    }
    return { valid: true, error: null };
}

function averageHighLow(data, startIdx, endIdx) {
    let high = -Infinity, low = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
        const candle = data[i];
        if (!candle) continue;
        if (typeof candle.high === 'number' && candle.high > high) high = candle.high;
        if (typeof candle.low === 'number' && candle.low < low) low = candle.low;
    }
    return (high + low) / 2;
}

function calculateIchimoku(marketData, options) {
    const dataValidation = validateMarketData(marketData);
    if (!dataValidation.valid) return { result: [], error: dataValidation.error };

    const optValidation = validateOptions(options);
    if (!optValidation.valid) return { result: [], error: optValidation.error };

    const { tenkanPeriod, kijunPeriod, senkouBPeriod, chikouShift } = options;
    const total = marketData.length;
    const result = new Array(total);

    for (let i = 0; i < total; i++) {
        const maxPeriod = Math.max(tenkanPeriod, kijunPeriod, senkouBPeriod, chikouShift);
        if (i < maxPeriod - 1) { result[i] = null; continue; }

        const tenkan = averageHighLow(marketData, i - tenkanPeriod + 1, i);
        const kijun = averageHighLow(marketData, i - kijunPeriod + 1, i);
        const senkouB = averageHighLow(marketData, i - senkouBPeriod + 1, i);
        const senkouA = (tenkan + kijun) / 2;
        const kumoTop = Math.max(senkouA, senkouB);
        const kumoBottom = Math.min(senkouA, senkouB);
        const chikou = i >= chikouShift ? marketData[i - chikouShift].close : null;
        const currentPrice = marketData[i].close;

        result[i] = {
            tenkan: parseFloat(tenkan.toFixed(8)),
            kijun: parseFloat(kijun.toFixed(8)),
            senkouA: parseFloat(senkouA.toFixed(8)),
            senkouB: parseFloat(senkouB.toFixed(8)),
            kumoTop: parseFloat(kumoTop.toFixed(8)),
            kumoBottom: parseFloat(kumoBottom.toFixed(8)),
            kumoThickness: parseFloat((kumoTop - kumoBottom).toFixed(8)),
            chikou: chikou !== null ? parseFloat(chikou.toFixed(8)) : null,
            isPriceAboveCloud: currentPrice > kumoTop,
            isPriceBelowCloud: currentPrice < kumoBottom,
            isTenkanAboveKijun: tenkan > kijun,
            isChikouBullish: chikou !== null && i >= chikouShift ? chikou > marketData[i - chikouShift].close : false
        };
    }
    return { result };
}

function runSelfTest() {
    const data = Array.from({ length: 60 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 60000),
        open: 100, high: 105, low: 95, close: 102, volume: 1
    }));
    const res = calculateIchimoku(data, { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, chikouShift: 26 });
    if (res.error) { console.log(`❌ Self-test failed: ${res.error}`); return false; }
    console.log(`✅ Self-test passed: ${res.result.length} candles`);
    return true;
}

module.exports = { calculateIchimoku };
if (require.main === module) runSelfTest();
