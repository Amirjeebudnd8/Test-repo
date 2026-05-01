/**
 * استراتژی نمونه کامل برای تست:
 * - ایچیموکو (پارامترهای اجباری)
 * - خطوط روند (پارامترهای اجباری)
 * - واگرایی RSI و MACD (پارامترهای اجباری)
 * - روند شارپ (پارامترهای اجباری)
 * - استفاده از توابع کمکی: getTrendLines(), getSharpTrends(), getSharpTrendsAtCandle()
 */

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // =====================================================
    // 1. بررسی داده کافی
    // =====================================================
    if (index < 60) return null;

    const currentCandle = data[index];
    const price = currentCandle.close;

    // =====================================================
    // 2. دریافت خطوط روند شناسایی شده
    // =====================================================
    const trendLines = getTrendLines();
    let isBreakPrimaryUp = false;
    let isBreakPrimaryDown = false;

    // بررسی شکست خطوط روند اصلی صعودی (از پایین به بالا)
    if (trendLines.primaryUp && trendLines.primaryUp.length > 0) {
        for (const line of trendLines.primaryUp) {
            const lineValue = calculateTrendLineValue(line, index);
            if (lineValue !== null && currentCandle.close > lineValue && data[index-1].close <= lineValue) {
                isBreakPrimaryUp = true;
                break;
            }
        }
    }

    // بررسی شکست خطوط روند اصلی نزولی (از بالا به پایین)
    if (trendLines.primaryDown && trendLines.primaryDown.length > 0) {
        for (const line of trendLines.primaryDown) {
            const lineValue = calculateTrendLineValue(line, index);
            if (lineValue !== null && currentCandle.close < lineValue && data[index-1].close >= lineValue) {
                isBreakPrimaryDown = true;
                break;
            }
        }
    }

    // =====================================================
    // 3. دریافت روندهای شارپ
    // =====================================================
    const sharpTrends = getSharpTrends();
    const currentSharpTrends = getSharpTrendsAtCandle(index);
    let hasBullishSharpTrend = false;
    let hasBearishSharpTrend = false;

    if (currentSharpTrends && currentSharpTrends.length > 0) {
        for (const trend of currentSharpTrends) {
            if (trend.trendType === 'BULLISH_SHARP') hasBullishSharpTrend = true;
            if (trend.trendType === 'BEARISH_SHARP') hasBearishSharpTrend = true;
        }
    }

    // =====================================================
    // 4. دریافت نقاط شکست خطوط روند (از breakPointsParam)
    // =====================================================
    const breakPoints = (breakPointsParam && breakPointsParam[index]) ? breakPointsParam[index] : [];
    const hasBreakPoint = breakPoints.length > 0;

    // =====================================================
    // 5. دریافت ایچیموکو (از ورودی تابع)
    // =====================================================
    const ichimoku = ichimokuParam;

    // =====================================================
    // 6. محاسبه اندیکاتورهای ساده (SMA)
    // =====================================================
    function calculateSMA(data, endIndex, period) {
        if (endIndex < period - 1) return null;
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[endIndex - i].close;
        }
        return sum / period;
    }

    const sma20 = calculateSMA(data, index, 20);
    const sma50 = calculateSMA(data, index, 50);
    const prevSma20 = calculateSMA(data, index - 1, 20);
    const prevSma50 = calculateSMA(data, index - 1, 50);

    // =====================================================
    // 7. منطق تولید سیگنال BUY
    // =====================================================
    let buySignal = false;
    let sellSignal = false;

    // سیگنال BUY: 
    // - SMA20 > SMA50 (روند صعودی)
    // - شکست خط روند صعودی یا وجود روند شارپ صعودی
    // - ایچیموکو: قیمت بالای ابر، تنکان بالای کیجون (در صورت وجود)
    if (sma20 !== null && sma50 !== null && sma20 > sma50) {
        if (isBreakPrimaryUp || hasBullishSharpTrend || hasBreakPoint) {
            let ichimokuCondition = true;
            if (ichimoku) {
                ichimokuCondition = ichimoku.isPriceAboveCloud && ichimoku.isTenkanAboveKijun;
            }
            if (ichimokuCondition) {
                buySignal = true;
            }
        }
    }

    // سیگنال SELL:
    // - SMA20 < SMA50 (روند نزولی)
    // - شکست خط روند نزولی یا وجود روند شارپ نزولی
    // - ایچیموکو: قیمت پایین ابر، تنکان پایین کیجون
    if (sma20 !== null && sma50 !== null && sma20 < sma50) {
        if (isBreakPrimaryDown || hasBearishSharpTrend || hasBreakPoint) {
            let ichimokuCondition = true;
            if (ichimoku) {
                ichimokuCondition = ichimoku.isPriceBelowCloud && !ichimoku.isTenkanAboveKijun;
            }
            if (ichimokuCondition) {
                sellSignal = true;
            }
        }
    }

    // =====================================================
    // 8. خروجی استراتژی با کلیه پارامترهای اجباری
    // =====================================================
    if (buySignal) {
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.98,      // 2% stop loss
            takeProfit: price * 1.04,     // 4% take profit
            trailingStop: true,
            trailingPercent: 1.5,
            useFibonacci: false,
            
            // پارامترهای اجباری ایچیموکو
            ichimoku: {
                tenkanPeriod: 9,
                kijunPeriod: 26,
                senkouBPeriod: 52,
                useCloudFilter: true,
                useTKCross: true,
                useChikou: true
            },
            
            // پارامترهای اجباری خطوط روند
            trendlines: {
                pivotPeriod: 5,
                minTouchPoints: 3,
                minCandleDistance: 3,
                maxDeviationPercent: 0.1
            },
            
            // پارامترهای اجباری واگرایی (RSI و MACD)
            divergence: {
                rsiPeriod: 14,
                macdFastPeriod: 12,
                macdSlowPeriod: 26,
                macdSignalPeriod: 9,
                macdUseHistogram: true
            },
            
            // پارامترهای اجباری روند شارپ
            sharpTrends: {
                consecutiveCandles: 5,
                minPercentChange: 0.5,
                boxValidityHours: 72
            }
        };
    }
    
    if (sellSignal) {
        return {
            signal: 'SELL',
            price: price,
            stopLoss: price * 1.02,      // 2% stop loss
            takeProfit: price * 0.96,     // 4% take profit
            trailingStop: true,
            trailingPercent: 1.5,
            useFibonacci: false,
            
            ichimoku: {
                tenkanPeriod: 9,
                kijunPeriod: 26,
                senkouBPeriod: 52,
                useCloudFilter: true,
                useTKCross: true,
                useChikou: true
            },
            
            trendlines: {
                pivotPeriod: 5,
                minTouchPoints: 3,
                minCandleDistance: 3,
                maxDeviationPercent: 0.1
            },
            
            divergence: {
                rsiPeriod: 14,
                macdFastPeriod: 12,
                macdSlowPeriod: 26,
                macdSignalPeriod: 9,
                macdUseHistogram: true
            },
            
            sharpTrends: {
                consecutiveCandles: 5,
                minPercentChange: 0.5,
                boxValidityHours: 72
            }
        };
    }

    return null;
}

// =====================================================
// توابع کمکی مورد نیاز در استراتژی
// =====================================================

function calculateTrendLineValue(line, index) {
    if (!line) return null;
    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    return line.startPrice + slope * (index - line.startIndex);
}
