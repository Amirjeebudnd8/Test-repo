/**
 * استراتژی تست کامل - بازه ۲۵۰۰ کندل گذشته + گزارش دیباگ
 * 
 * در لاگ اجرا، تعداد دفعات وقوع هر مؤلفه (صعودی و نزولی) چاپ می‌شود.
 * سیگنال فقط زمانی صادر می‌شود که هر پنج مؤلفه (خط روند، شارپ، واگرایی، ایچیموکو، نقطه شکست)
 * حداقل یک بار در بازه ۲۵۰۰ کندل گذشته اتفاق افتاده باشند.
 */

function customStrategy(data, index, breakPointsParam, ichimokuParam) {
    // =====================================================
    // 1. داده کافی
    // =====================================================
    if (index < 100) return null;
    
    // بازه ۲۵۰۰ کندل (یا از ابتدا اگر کمتر باشد)
    const lookback = Math.min(2500, index);
    const startIdx = index - lookback;
    
    // =====================================================
    // 2. دریافت داده‌های کمکی
    // =====================================================
    const trendLines = getTrendLines();        // خطوط روند اصلی
    const sharpTrends = getSharpTrends();      // روندهای شارپ
    
    // =====================================================
    // 3. آمارگیری (برای دیباگ)
    // =====================================================
    let bullishTrendlineCount = 0;
    let bearishTrendlineCount = 0;
    let bullishSharpCount = 0;
    let bearishSharpCount = 0;
    let bullishDivergenceCount = 0;
    let bearishDivergenceCount = 0;
    let bullishIchimokuCount = 0;
    let bearishIchimokuCount = 0;
    let bullishBreakPointCount = 0;
    let bearishBreakPointCount = 0;
    
    // =====================================================
    // 3.1 بررسی نقاط شکست (breakPointsParam) و واگرایی‌ها
    // =====================================================
    if (breakPointsParam && typeof breakPointsParam === 'object') {
        for (let i = startIdx; i <= index; i++) {
            const points = breakPointsParam[i];
            if (points && points.length > 0) {
                for (const p of points) {
                    if (p.direction === 'up') {
                        bullishTrendlineCount++;
                        bullishBreakPointCount++;
                    }
                    if (p.direction === 'down') {
                        bearishTrendlineCount++;
                        bearishBreakPointCount++;
                    }
                }
            }
        }
    }
    
    // واگرایی‌ها از divergenceSignals
    if (breakPointsParam && breakPointsParam.divergenceSignals) {
        const divSignals = breakPointsParam.divergenceSignals;
        for (const sig of divSignals) {
            if (sig.index >= startIdx && sig.index <= index) {
                if (sig.signal === 'BUY') bullishDivergenceCount++;
                if (sig.signal === 'SELL') bearishDivergenceCount++;
            }
        }
    }
    
    // =====================================================
    // 3.2 بررسی روندهای شارپ
    // =====================================================
    if (sharpTrends && sharpTrends.length > 0) {
        for (const trend of sharpTrends) {
            if (trend.startIndex >= startIdx && trend.startIndex <= index) {
                if (trend.trendType === 'BULLISH_SHARP') bullishSharpCount++;
                if (trend.trendType === 'BEARISH_SHARP') bearishSharpCount++;
            }
        }
    }
    
    // =====================================================
    // 3.3 بررسی خطوط روند اصلی (از getTrendLines)
    // وجود خط صعودی/نزولی در بازه را به عنوان یک رویداد محاسبه می‌کنیم
    // =====================================================
    if (trendLines) {
        if (trendLines.primaryUp && trendLines.primaryUp.length > 0) {
            for (const line of trendLines.primaryUp) {
                if (line.startIndex >= startIdx || line.endIndex >= startIdx) {
                    bullishTrendlineCount++;
                    bullishBreakPointCount++;
                }
            }
        }
        if (trendLines.primaryDown && trendLines.primaryDown.length > 0) {
            for (const line of trendLines.primaryDown) {
                if (line.startIndex >= startIdx || line.endIndex >= startIdx) {
                    bearishTrendlineCount++;
                    bearishBreakPointCount++;
                }
            }
        }
    }
    
    // =====================================================
    // 3.4 بررسی ایچیموکو در بازه
    // چون ایچیموکو فقط برای کندل فعلی در دسترس است،
    // برای سادگی وضعیت فعلی را به عنوان نماینده می‌گیریم
    // =====================================================
    if (ichimokuParam) {
        if (ichimokuParam.isPriceAboveCloud && ichimokuParam.isTenkanAboveKijun) {
            bullishIchimokuCount = 1;   // حداقل یک بار
        }
        if (ichimokuParam.isPriceBelowCloud && !ichimokuParam.isTenkanAboveKijun) {
            bearishIchimokuCount = 1;
        }
    }
    
    // =====================================================
    // 4. گزارش دیباگ (در لاگ اجرا دیده می‌شود)
    // =====================================================
    if (index % 100 === 0 || index === data.length - 1) {
        console.log(`\n========== دیباگ استراتژی در کندل ${index} ==========`);
        console.log(`بازه بررسی: از کندل ${startIdx} تا ${index} (${lookback} کندل)`);
        console.log(`--- رویدادهای صعودی (BUY) ---`);
        console.log(`شکست/خط روند صعودی: ${bullishTrendlineCount}`);
        console.log(`روند شارپ صعودی: ${bullishSharpCount}`);
        console.log(`واگرایی صعودی: ${bullishDivergenceCount}`);
        console.log(`ایچیموکو صعودی (فعلی): ${bullishIchimokuCount}`);
        console.log(`نقطه شکست صعودی: ${bullishBreakPointCount}`);
        console.log(`--- رویدادهای نزولی (SELL) ---`);
        console.log(`شکست/خط روند نزولی: ${bearishTrendlineCount}`);
        console.log(`روند شارپ نزولی: ${bearishSharpCount}`);
        console.log(`واگرایی نزولی: ${bearishDivergenceCount}`);
        console.log(`ایچیموکو نزولی (فعلی): ${bearishIchimokuCount}`);
        console.log(`نقطه شکست نزولی: ${bearishBreakPointCount}`);
    }
    
    // =====================================================
    // 5. شرط AND - همه پنج مؤلفه باید حداقل ۱ باشند
    // =====================================================
    const allBullish = (bullishTrendlineCount > 0) && (bullishSharpCount > 0) && 
                       (bullishDivergenceCount > 0) && (bullishIchimokuCount > 0) && 
                       (bullishBreakPointCount > 0);
    
    const allBearish = (bearishTrendlineCount > 0) && (bearishSharpCount > 0) && 
                       (bearishDivergenceCount > 0) && (bearishIchimokuCount > 0) && 
                       (bearishBreakPointCount > 0);
    
    const currentCandle = data[index];
    const price = currentCandle.close;
    
    // =====================================================
    // 6. خروجی
    // =====================================================
    if (allBullish) {
        console.log(`✅ سیگنال BUY در کندل ${index} - همه پنج شرط صعودی برقرار است.`);
        return {
            signal: 'BUY',
            price: price,
            stopLoss: price * 0.98,
            takeProfit: price * 1.04,
            trailingStop: false,
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
    
    if (allBearish) {
        console.log(`✅ سیگنال SELL در کندل ${index} - همه پنج شرط نزولی برقرار است.`);
        return {
            signal: 'SELL',
            price: price,
            stopLoss: price * 1.02,
            takeProfit: price * 0.96,
            trailingStop: false,
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
    
    // اگر هیچکدام از شرایط AND برقرار نبود، null برگردان
    return null;
}

function calculateTrendLineValue(line, index) {
    if (!line) return null;
    const slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
    return line.startPrice + slope * (index - line.startIndex);
}
