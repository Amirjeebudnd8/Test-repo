/**
 * ===========================================================================
 * ماژول تشخیص واگرایی (Divergence Detector) - نسخه کامل با پشتیبانی RSI و MACD
 * ===========================================================================
 * این ماژول برای استفاده در Web Worker طراحی شده است.
 * وابستگی صفر به UI دارد.
 * 
 * @author Custom Strategy Team
 * @version 2.1.0 (RSI + MACD + Indicator Data Export)
 * ===========================================================================
 */

// ======================== بخش ۱: تنظیمات دستی (بدون نیاز به UI) ========================
// شما می‌توانید این مقادیر را مستقیماً اینجا تغییر دهید تا بهترین پارامترها را پیدا کنید.
const DIVERGENCE_CONFIG = {
    // ----- تنظیمات پیوت (مشترک) -----
    PIVOT_PERIOD: 3,                // دوره نگاه به عقب/جلو برای یافتن قله و دره (پیش‌فرض ۵)

    // ----- تنظیمات واگرایی (مشترک) -----
    MAX_DIVERGENCE_BARS: 100,        // حداکثر فاصله (به تعداد کندل) بین دو نقطه برای بررسی واگرایی
    MIN_SLOPE_DIFFERENCE: 0.01,      // حداقل اختلاف شیب خطوط برای معتبر بودن واگرایی (درصد/واحد)
    PIVOT_ALIGNMENT_TOLERANCE: 4,   // تلورانس فاصله ایندکس بین پیوت قیمت و پیوت اندیکاتور

    // ----- تنظیمات اختصاصی RSI -----
    RSI_PERIOD: 14,                 // دوره RSI

    // ----- تنظیمات اختصاصی MACD -----
    MACD_FAST_PERIOD: 12,           // دوره سریع MACD
    MACD_SLOW_PERIOD: 26,           // دوره کند MACD
    MACD_SIGNAL_PERIOD: 9,          // دوره خط سیگنال MACD
    MACD_USE_HISTOGRAM: true,       // استفاده از هیستوگرام برای واگرایی (true) یا خط MACD (false)

    // ----- تنظیمات لاگینگ (بسیار مهم برای دیباگ) -----
    VERBOSE_LOGGING: true,          // فعال بودن لاگ‌های مفصل مرحله به مرحله
    BREAK_ON_ERROR: false           // در صورت خطا، آیا اجرا متوقف شود یا خیر
};

// ======================== بخش ۲: تابع محاسبه RSI (داخلی) ========================
/**
 * محاسبه آرایه RSI برای کل داده‌ها
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @param {number} period - دوره RSI (پیش‌فرض از تنظیمات)
 * @returns {Array<number|null>} آرایه RSI (برای اولین period-1 مقدار null است)
 */
function calculateRSI(data, period = DIVERGENCE_CONFIG.RSI_PERIOD) {
    console.log(`[DIVERGENCE] 🧮 [RSI] شروع محاسبه برای ${data.length} کندل با دوره ${period}`);

    if (!data || data.length < period + 1) {
        console.error('[DIVERGENCE] ❌ [RSI] خطا: داده‌ها برای محاسبه RSI کافی نیستند.');
        return [];
    }

    const rsiValues = new Array(data.length).fill(null);
    let gains = 0;
    let losses = 0;

    // محاسبه اولین میانگین
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) {
        rsiValues[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsiValues[period] = 100 - (100 / (1 + rs));
    }

    // محاسبه برای باقی کندل‌ها با روش Smoothing
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        let gain = 0, loss = 0;
        if (change > 0) gain = change;
        else loss = -change;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        if (avgLoss === 0) {
            rsiValues[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsiValues[i] = 100 - (100 / (1 + rs));
        }
    }

    const validCount = rsiValues.filter(v => v !== null).length;
    console.log(`[DIVERGENCE] ✅ [RSI] محاسبه کامل شد. مقادیر معتبر: ${validCount}`);

    if (DIVERGENCE_CONFIG.VERBOSE_LOGGING) {
        const sample = rsiValues.slice(period, period + 5).map((v, i) => `[${period + i}]=${v?.toFixed(2) || 'null'}`).join(', ');
        console.log(`[DIVERGENCE] 📋 [RSI] نمونه مقادیر: ${sample}`);
    }

    return rsiValues;
}

// ======================== بخش ۳: تابع محاسبه MACD (داخلی) ========================
/**
 * محاسبه MACD کامل و بازگرداندن آبجکت شامل macdLine، signalLine و histogram
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @returns {Object|null} آبجکت شامل macdLine، signalLine و histogram (هر کدام آرایه عددی)
 */
function calculateFullMACD(data) {
    const fastPeriod = DIVERGENCE_CONFIG.MACD_FAST_PERIOD;
    const slowPeriod = DIVERGENCE_CONFIG.MACD_SLOW_PERIOD;
    const signalPeriod = DIVERGENCE_CONFIG.MACD_SIGNAL_PERIOD;

    console.log(`[DIVERGENCE] 🧮 [MACD] شروع محاسبه کامل (Fast=${fastPeriod}, Slow=${slowPeriod}, Signal=${signalPeriod})`);

    if (!data || data.length < slowPeriod + signalPeriod) {
        console.error('[DIVERGENCE] ❌ [MACD] خطا: داده‌ها برای محاسبه MACD کافی نیستند.');
        return null;
    }

    // محاسبه EMA
    function calculateEMA(values, period) {
        const ema = new Array(values.length).fill(null);
        const multiplier = 2 / (period + 1);

        // اولین مقدار SMA
        let sum = 0;
        for (let i = 0; i < period; i++) sum += values[i];
        ema[period - 1] = sum / period;

        // محاسبه EMA برای بقیه
        for (let i = period; i < values.length; i++) {
            ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
        }
        return ema;
    }

    const closePrices = data.map(c => c.close);

    // محاسبه EMA های سریع و کند
    const fastEMA = calculateEMA(closePrices, fastPeriod);
    const slowEMA = calculateEMA(closePrices, slowPeriod);

    // محاسبه خط MACD (تفاوت Fast و Slow)
    const macdLine = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            macdLine[i] = fastEMA[i] - slowEMA[i];
        }
    }

    // محاسبه خط سیگنال (EMA از MACD Line)
    const validMacdStart = macdLine.findIndex(v => v !== null);
    if (validMacdStart === -1) {
        console.error('[DIVERGENCE] ❌ [MACD] خطا: مقادیر MACD معتبر یافت نشد.');
        return null;
    }

    const validMacdValues = macdLine.slice(validMacdStart);
    const signalLineValues = calculateEMA(validMacdValues, signalPeriod);

    const signalLine = new Array(data.length).fill(null);
    for (let i = 0; i < signalLineValues.length; i++) {
        if (signalLineValues[i] !== null) {
            signalLine[validMacdStart + i] = signalLineValues[i];
        }
    }

    // محاسبه هیستوگرام (MACD - Signal)
    const histogram = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram[i] = macdLine[i] - signalLine[i];
        }
    }

    const validCount = macdLine.filter(v => v !== null).length;
    console.log(`[DIVERGENCE] ✅ [MACD] محاسبه کامل شد. مقادیر معتبر: ${validCount}`);

    return { macdLine, signalLine, histogram };
}

/**
 * محاسبه آرایه MACD (فقط برای تشخیص واگرایی - بر اساس تنظیمات MACD_USE_HISTOGRAM)
 * @param {Array} data - آرایه کندل‌ها (هر کندل شامل close)
 * @returns {Array<number|null>} آرایه MACD (بر اساس تنظیمات MACD_USE_HISTOGRAM)
 */
function calculateMACD(data) {
    const fullMACD = calculateFullMACD(data);
    if (!fullMACD) return [];

    const useHistogram = DIVERGENCE_CONFIG.MACD_USE_HISTOGRAM;
    const result = useHistogram ? fullMACD.histogram : fullMACD.macdLine;

    if (DIVERGENCE_CONFIG.VERBOSE_LOGGING) {
        const startIdx = result.findIndex(v => v !== null);
        const sample = result.slice(startIdx, startIdx + 5).map((v, i) => `[${startIdx + i}]=${v?.toFixed(6) || 'null'}`).join(', ');
        console.log(`[DIVERGENCE] 📋 [MACD] نمونه مقادیر (${useHistogram ? 'Histogram' : 'MACD Line'}): ${sample}`);
    }

    return result;
}

// ======================== بخش ۴: تابع یافتن نقاط پیوت ========================
/**
 * یافتن قله‌ها و دره‌های محلی در یک سری عددی
 * @param {Array<number>} values - آرایه مقادیر (مثلاً قیمت بسته یا RSI)
 * @returns {Array} آرایه پیوت‌ها [{ index, value, type }]
 */
function findPivots(values) {
    const period = DIVERGENCE_CONFIG.PIVOT_PERIOD;
    if (values.length < period * 2 + 1) {
        console.warn(`[DIVERGENCE] ⚠️ طول آرایه (${values.length}) برای دوره پیوت ${period} کافی نیست.`);
        return [];
    }

    const pivots = [];
    console.log(`[DIVERGENCE] 🔍 شروع جستجوی پیوت‌ها در ${values.length} نقطه با دوره ${period}...`);

    for (let i = period; i < values.length - period; i++) {
        const current = values[i];
        if (current === null || current === undefined) continue;

        let isHigh = true;
        let isLow = true;

        for (let j = 1; j <= period; j++) {
            const leftVal = values[i - j];
            const rightVal = values[i + j];

            if (leftVal === null || rightVal === null) {
                isHigh = isLow = false;
                break;
            }

            if (leftVal >= current || rightVal >= current) isHigh = false;
            if (leftVal <= current || rightVal <= current) isLow = false;
        }

        if (isHigh) {
            pivots.push({ index: i, value: current, type: 'high' });
        }
        if (isLow) {
            pivots.push({ index: i, value: current, type: 'low' });
        }
    }

    const highCount = pivots.filter(p => p.type === 'high').length;
    const lowCount = pivots.filter(p => p.type === 'low').length;
    console.log(`[DIVERGENCE] ✅ ${pivots.length} پیوت یافت شد. (High: ${highCount}, Low: ${lowCount})`);

    if (DIVERGENCE_CONFIG.VERBOSE_LOGGING && pivots.length > 0) {
        console.log('[DIVERGENCE] 📋 نمونه پیوت‌ها:', pivots.slice(0, 5).map(p =>
            `[${p.index}] ${p.type}=${p.value.toFixed(4)}`
        ));
    }

    return pivots;
}

// ======================== بخش ۵: تابع اصلی تشخیص واگرایی ========================
/**
 * تشخیص واگرایی بین سری قیمت و سری اندیکاتور
 * @param {Array} priceData - آرایه کندل‌ها (هر کندل شامل close)
 * @param {Array<number>} indicatorValues - آرایه مقادیر اندیکاتور (باید هم‌طول priceData باشد)
 * @param {string} indicatorType - نوع اندیکاتور ('RSI' یا 'MACD') برای لاگینگ
 * @returns {Array} سیگنال‌های واگرایی یافت شده
 */
function detectDivergence(priceData, indicatorValues, indicatorType = 'UNKNOWN') {
    console.log(`[DIVERGENCE] 🚀 [${indicatorType}] شروع فرآیند تشخیص واگرایی...`);
    console.log(`[DIVERGENCE] 📊 [${indicatorType}] طول داده قیمت: ${priceData.length}, طول داده اندیکاتور: ${indicatorValues.length}`);

    // ----- اعتبارسنجی اولیه -----
    if (!priceData || !indicatorValues) {
        console.error(`[DIVERGENCE] ❌ [${indicatorType}] داده‌های ورودی نامعتبر هستند.`);
        return [];
    }

    if (priceData.length !== indicatorValues.length) {
        console.error(`[DIVERGENCE] ❌ [${indicatorType}] عدم تطابق طول داده‌ها: قیمت ${priceData.length}, اندیکاتور ${indicatorValues.length}`);
        return [];
    }

    // ----- استخراج قیمت‌های بسته -----
    const closePrices = priceData.map(c => c.close);

    // ----- یافتن پیوت‌ها -----
    const pricePivots = findPivots(closePrices);
    const indicatorPivots = findPivots(indicatorValues);

    if (pricePivots.length < 2 || indicatorPivots.length < 2) {
        console.warn(`[DIVERGENCE] ⚠️ [${indicatorType}] تعداد پیوت‌ها برای تحلیل واگرایی کافی نیست.`);
        return [];
    }

    const signals = [];
    const maxBars = DIVERGENCE_CONFIG.MAX_DIVERGENCE_BARS;
    const tolerance = DIVERGENCE_CONFIG.PIVOT_ALIGNMENT_TOLERANCE;

    console.log(`[DIVERGENCE] 🔗 [${indicatorType}] شروع تطبیق پیوت‌ها با تلورانس ${tolerance} و حداکثر فاصله ${maxBars}...`);

    // ----- جستجوی واگرایی برای هر جفت پیوت هم‌نوع در قیمت -----
    for (let i = 0; i < pricePivots.length - 1; i++) {
        const p1 = pricePivots[i];
        const p2 = pricePivots[i + 1];

        // ۱. بررسی فاصله
        if (p2.index - p1.index > maxBars) {
            if (DIVERGENCE_CONFIG.VERBOSE_LOGGING) {
                console.log(`[DIVERGENCE] ⏭️ [${indicatorType}] رد پیوت قیمت ${p1.index}-${p2.index}: فاصله ${p2.index - p1.index} > ${maxBars}`);
            }
            continue;
        }

        // ۲. یافتن پیوت‌های متناظر در اندیکاتور
        const i1 = indicatorPivots.find(p =>
            p.type === p1.type && Math.abs(p.index - p1.index) <= tolerance
        );
        const i2 = indicatorPivots.find(p =>
            p.type === p2.type && Math.abs(p.index - p2.index) <= tolerance
        );

        if (!i1 || !i2) {
            if (DIVERGENCE_CONFIG.VERBOSE_LOGGING) {
                console.log(`[DIVERGENCE] ⏭️ [${indicatorType}] رد جفت ${p1.index}-${p2.index}: پیوت متناظر در اندیکاتور یافت نشد.`);
            }
            continue;
        }

        // ۳. محاسبه شیب خطوط
        const priceSlope = (p2.value - p1.value) / (p2.index - p1.index);
        const indSlope = (i2.value - i1.value) / (i2.index - i1.index);
        const minDiff = DIVERGENCE_CONFIG.MIN_SLOPE_DIFFERENCE;

        if (DIVERGENCE_CONFIG.VERBOSE_LOGGING) {
            console.log(`[DIVERGENCE] 🔎 [${indicatorType}] تحلیل جفت ${p1.type} [${p1.index} (${p1.value.toFixed(4)}) -> ${p2.index} (${p2.value.toFixed(4)})]`);
            console.log(`   شیب قیمت: ${priceSlope.toFixed(6)} | شیب اندیکاتور: ${indSlope.toFixed(6)}`);
        }

        // ۴. تشخیص نوع واگرایی
        let divergenceType = null;

        if (p1.type === 'low') {
            const priceRising = priceSlope > minDiff;
            const priceFalling = priceSlope < -minDiff;
            const indRising = indSlope > minDiff;
            const indFalling = indSlope < -minDiff;

            if (priceFalling && indRising) {
                divergenceType = 'RegularBullish';
                console.log(`[DIVERGENCE] 🟢 [${indicatorType}] واگرایی معمولی صعودی (Buy) یافت شد!`);
            } else if (priceRising && indFalling) {
                divergenceType = 'HiddenBullish';
                console.log(`[DIVERGENCE] 🟢 [${indicatorType}] واگرایی مخفی صعودی (Buy) یافت شد!`);
            }
        } else if (p1.type === 'high') {
            const priceRising = priceSlope > minDiff;
            const priceFalling = priceSlope < -minDiff;
            const indRising = indSlope > minDiff;
            const indFalling = indSlope < -minDiff;

            if (priceRising && indFalling) {
                divergenceType = 'RegularBearish';
                console.log(`[DIVERGENCE] 🔴 [${indicatorType}] واگرایی معمولی نزولی (Sell) یافت شد!`);
            } else if (priceFalling && indRising) {
                divergenceType = 'HiddenBearish';
                console.log(`[DIVERGENCE] 🔴 [${indicatorType}] واگرایی مخفی نزولی (Sell) یافت شد!`);
            }
        }

        if (divergenceType) {
            const signal = {
                type: divergenceType,
                signal: divergenceType.includes('Bullish') ? 'BUY' : 'SELL',
                pricePoints: [p1, p2],
                indicatorPoints: [i1, i2],
                startIndex: p1.index,
                endIndex: p2.index,
                priceSlope,
                indicatorSlope: indSlope,  // ✅ اصلاح شده
                indicatorType: indicatorType
            };
            signals.push(signal);
            console.log(`[DIVERGENCE] 📌 [${indicatorType}] سیگنال ثبت شد. شروع: ${p1.index}, پایان: ${p2.index}`);
        }
    }

    console.log(`[DIVERGENCE] 🏁 [${indicatorType}] تشخیص واگرایی به پایان رسید. ${signals.length} سیگنال یافت شد.`);
    return signals;
}

// ======================== بخش ۶: اتصال به Worker و ارسال نتایج ========================
/**
 * تابع اصلی که باید در Worker صدا زده شود.
 * این تابع هم محاسبات را انجام می‌دهد و هم نتایج را به صورت خودکار به Main Thread ارسال می‌کند.
 * 
 * @param {Object} params - پارامترهای ورودی
 * @param {Array} params.marketData - آرایه کندل‌های بازار
 * @param {string} params.indicator - نوع اندیکاتور ('RSI' یا 'MACD')
 * @param {Function} params.sendMessage - تابع ارسال پیام به Main Thread (مثلاً self.postMessage)
 */
function runDivergenceDetection(params) {
    console.log('[DIVERGENCE] 📬 درخواست اجرای واگرایی دریافت شد.');
    console.log('[DIVERGENCE] 📋 پارامترها:', {
        dataLength: params.marketData?.length,
        indicator: params.indicator
    });

    try {
        const { marketData, indicator } = params;

        if (!marketData || marketData.length === 0) {
            throw new Error('marketData خالی یا نامعتبر است.');
        }

        // ۱. محاسبه اندیکاتور و آماده‌سازی داده‌های خروجی
        let indicatorValues;
        let indicatorData = null;

        if (indicator === 'RSI') {
            indicatorValues = calculateRSI(marketData);
            indicatorData = indicatorValues;
        } else if (indicator === 'MACD') {
            const fullMACD = calculateFullMACD(marketData);
            if (fullMACD) {
                indicatorValues = DIVERGENCE_CONFIG.MACD_USE_HISTOGRAM ? fullMACD.histogram : fullMACD.macdLine;
                indicatorData = {
                    macdLine: fullMACD.macdLine,
                    signalLine: fullMACD.signalLine,
                    histogram: fullMACD.histogram
                };
            } else {
                throw new Error('محاسبه MACD با شکست مواجه شد.');
            }
        } else {
            throw new Error(`اندیکاتور "${indicator}" پشتیبانی نمی‌شود. لطفاً از RSI یا MACD استفاده کنید.`);
        }

        // ۲. تشخیص واگرایی
        const signals = detectDivergence(marketData, indicatorValues, indicator);

        // ۳. آماده‌سازی سیگنال‌ها برای ارسال
        const serializableSignals = signals.map(s => ({
            type: s.type,
            signal: s.signal,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            priceStart: s.pricePoints[0].value,
            priceEnd: s.pricePoints[1].value,
            indStart: s.indicatorPoints[0].value,
            indEnd: s.indicatorPoints[1].value,
            startTime: marketData[s.startIndex].timestamp,
            endTime: marketData[s.endIndex].timestamp,
            indicatorType: s.indicatorType
        }));

        console.log(`[DIVERGENCE] ✅ عملیات موفق. ارسال ${serializableSignals.length} سیگنال و داده‌های اندیکاتور به Main Thread.`);

        // ۴. ارسال پیام موفقیت
        if (params.sendMessage) {
            params.sendMessage({
                type: 'DIVERGENCE_RESULT',
                payload: {
                    success: true,
                    signals: serializableSignals,
                    indicatorData: indicatorData,
                    indicatorUsed: indicator,
                    config: DIVERGENCE_CONFIG,
                    stats: {
                        totalSignals: signals.length,
                        bullish: signals.filter(s => s.signal === 'BUY').length,
                        bearish: signals.filter(s => s.signal === 'SELL').length,
                        regularBullish: signals.filter(s => s.type === 'RegularBullish').length,
                        hiddenBullish: signals.filter(s => s.type === 'HiddenBullish').length,
                        regularBearish: signals.filter(s => s.type === 'RegularBearish').length,
                        hiddenBearish: signals.filter(s => s.type === 'HiddenBearish').length
                    }
                }
            });
        }

        // ✅ فقط در صورت خطا پیام DIVERGENCE_ERROR ارسال می‌شود
        return signals;

    } catch (error) {
        console.error('[DIVERGENCE] 💥 خطای بحرانی در اجرای واگرایی:', error);

        // ارسال خطا به Main Thread فقط در صورت بروز خطا
        if (params.sendMessage) {
            params.sendMessage({
                type: 'DIVERGENCE_ERROR',
                payload: {
                    success: false,
                    error: error.message,
                    stack: error.stack
                }
            });
        }

        return [];
    }
}

// ======================== بخش ۷: اکسپورت برای محیط Worker ========================
if (typeof self !== 'undefined') {
    self.DivergenceDetector = {
        run: runDivergenceDetection,
        config: DIVERGENCE_CONFIG,
        utils: {
            calculateRSI,
            calculateMACD,
            calculateFullMACD,
            findPivots
        }
    };
    console.log('[DIVERGENCE] 📦 ماژول در self (Worker) بارگذاری شد. (پشتیبانی از RSI و MACD)');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runDivergenceDetection,
        calculateRSI,
        calculateMACD,
        calculateFullMACD,
        findPivots,
        DIVERGENCE_CONFIG
    };
    console.log('[DIVERGENCE] 📦 ماژول در module.exports (Node.js) بارگذاری شد. (پشتیبانی از RSI و MACD)');
}
