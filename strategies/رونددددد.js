/**
 * استراتژی ترکیبی روند شارپ + واگرایی (برای گیت‌هاب)
 * - محاسبه روند شارپ به صورت داخلی (خودکفا)
 * - استفاده از breakPointsParam.divergenceSignals برای واگرایی
 * - شرط: وجود حداقل یک روند شارپ صعودی و یک واگرایی صعودی در ۲۵۰۰ کندل گذشته
 * - پارامترهای خروجی مطابق با نیاز run-backtest.js (ایچیموکو، خطوط روند، واگرایی، روند شارپ)
 */

function customStrategy(data, index, breakPointsParam) {
    const LOOKBACK = 2500;
    if (index < LOOKBACK) return null;
    const startIdx = index - LOOKBACK;

    // ==================== پارامترهای روند شارپ (همانند لپ‌تاپ) ====================
    const SHARP_CONFIG = {
        minCandlesRequired: 5,
        minPercentChange: 0.5,
        enableOppositeCandleRule: true,
        maxLookback: 2500
    };

    function candleColor(c) {
        return c.close > c.open ? 'bullish' : 'bearish';
    }

    function detectSharpTrend(startIndex) {
        if (startIndex >= data.length) return null;
        const startCandle = data[startIndex];
        const trend = candleColor(startCandle);
        let endIdx = startIndex, lastSame = startIndex, oppCnt = 0;
        const maxIdx = Math.min(startIndex + SHARP_CONFIG.maxLookback * 2, data.length - 1);
        for (let i = startIndex + 1; i <= maxIdx; i++) {
            const cur = data[i];
            const curColor = candleColor(cur);
            if (curColor === trend) {
                endIdx = i;
                lastSame = i;
            } else {
                if (SHARP_CONFIG.enableOppositeCandleRule) {
                    const prev = data[lastSame];
                    if (trend === 'bullish') {
                        if (cur.low >= prev.low) { oppCnt++; continue; }
                    } else {
                        if (cur.high <= prev.high) { oppCnt++; continue; }
                    }
                }
                break;
            }
        }
        const seqLen = (endIdx - startIndex + 1) - oppCnt;
        if (seqLen < SHARP_CONFIG.minCandlesRequired) return null;
        const endCandle = data[endIdx];
        const pct = ((endCandle.close - startCandle.open) / startCandle.open) * 100;
        if (Math.abs(pct) < SHARP_CONFIG.minPercentChange) return null;
        return {
            startIndex, endIndex: endIdx,
            trendType: trend === 'bullish' ? 'BULLISH_SHARP' : 'BEARISH_SHARP',
            percentChange: pct
        };
    }

    // ==================== 1. بررسی روند شارپ صعودی در بازه ====================
    let hasBullishSharp = false;
    let bestSharp = null;
    for (let s = startIdx; s <= index; s++) {
        const t = detectSharpTrend(s);
        if (t && t.trendType === 'BULLISH_SHARP' && t.endIndex <= index) {
            hasBullishSharp = true;
            if (!bestSharp || Math.abs(t.percentChange) > Math.abs(bestSharp.percentChange)) bestSharp = t;
        }
    }
    if (!hasBullishSharp) return null;

    // ==================== 2. بررسی واگرایی صعودی ====================
    let hasBullishDiv = false;
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        for (const sig of breakPointsParam.divergenceSignals) {
            if (sig.startIndex >= startIdx && sig.startIndex <= index && sig.signal === 'BUY') {
                hasBullishDiv = true;
                break;
            }
        }
    }
    if (!hasBullishDiv) return null;

    // ==================== 3. هر دو شرط برقرار → سیگنال BUY ====================
    const price = data[index].close;
    return {
        signal: 'BUY',
        price: price,
        stopLoss: price * 0.995,
        takeProfit: price * 1.04,
        // پارامترهای اجباری (مقادیر پیش‌فرض هماهنگ با لپ‌تاپ)
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
