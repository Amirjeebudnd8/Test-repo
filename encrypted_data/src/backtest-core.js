// ==================== ایچیموکو بدون آینده‌نگری ====================

function calculateIchimokuHistorical(data, currentIndex, options = {}) {
    const tenkanPeriod = options.tenkanPeriod || 9;
    const kijunPeriod = options.kijunPeriod || 26;
    const senkouBPeriod = options.senkouBPeriod || 52;

    // فقط از داده‌های تاریخی تا currentIndex استفاده کن
    const historicalData = data.slice(0, currentIndex + 1);

    if (historicalData.length < Math.max(tenkanPeriod, kijunPeriod, senkouBPeriod)) {
        return null;
    }

    const result = {
        tenkan: 0,
        kijun: 0,
        senkouA: 0,
        senkouB: 0,
        chikou: 0,
        kumoTop: 0,
        kumoBottom: 0,
        isPriceAboveCloud: false,
        isPriceBelowCloud: false,
        isTenkanAboveKijun: false,
        isChikouBullish: false,
        kumoThickness: 0
    };

    // محاسبه تنکان‌سن (میانگین بالاترین و پایین‌ترین ۹ دوره)
    if (currentIndex >= tenkanPeriod - 1) {
        let high9 = -Infinity;
        let low9 = Infinity;
        for (let i = currentIndex - tenkanPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high9) high9 = data[i].high;
            if (data[i].low < low9) low9 = data[i].low;
        }
        result.tenkan = (high9 + low9) / 2;
    }

    // محاسبه کیجون‌سن (میانگین بالاترین و پایین‌ترین ۲۶ دوره)
    if (currentIndex >= kijunPeriod - 1) {
        let high26 = -Infinity;
        let low26 = Infinity;
        for (let i = currentIndex - kijunPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high26) high26 = data[i].high;
            if (data[i].low < low26) low26 = data[i].low;
        }
        result.kijun = (high26 + low26) / 2;
    }

    // محاسبه سنکو اسپن B (میانگین بالاترین و پایین‌ترین ۵۲ دوره)
    if (currentIndex >= senkouBPeriod - 1) {
        let high52 = -Infinity;
        let low52 = Infinity;
        for (let i = currentIndex - senkouBPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high52) high52 = data[i].high;
            if (data[i].low < low52) low52 = data[i].low;
        }
        result.senkouB = (high52 + low52) / 2;
    }

    // محاسبه سنکو اسپن A (میانگین تنکان‌سن و کیجون‌سن)
    if (result.tenkan && result.kijun) {
        result.senkouA = (result.tenkan + result.kijun) / 2;
    }

    // محاسبه چیکو اسپن (قیمت بسته ۲۶ دوره قبل)
    if (currentIndex >= 26) {
        result.chikou = data[currentIndex - 25].close;
    }

    // محاسبه ابر کومو (بدون شیفت به جلو!)
    if (result.senkouA && result.senkouB) {
        result.kumoTop = Math.max(result.senkouA, result.senkouB);
        result.kumoBottom = Math.min(result.senkouA, result.senkouB);
        result.kumoThickness = result.kumoTop - result.kumoBottom;
    }

    // وضعیت فعلی قیمت نسبت به ابر
    const currentPrice = data[currentIndex].close;
    result.isPriceAboveCloud = currentPrice > result.kumoTop;
    result.isPriceBelowCloud = currentPrice < result.kumoBottom;

    // رابطه تنکان‌سن و کیجون‌سن
    if (result.tenkan && result.kijun) {
        result.isTenkanAboveKijun = result.tenkan > result.kijun;
    }

    // وضعیت چیکو اسپن
    if (currentIndex >= 52 && result.chikou) {
        const price26PeriodsAgo = data[currentIndex - 25].close;
        result.isChikouBullish = result.chikou > price26PeriodsAgo;
    }

    return result;
}

// ==================== توابع اصلی ====================

// State management برای پردازش افزایشی
let trendDetectionState = {
    processedData: [],
    pivots: [],
    pendingTrendLines: [],
    trendLines: {
        primaryUp: [],
        primaryDown: [],
        majorExternalUp: [],
        majorExternalDown: [],
        majorInternalUp: [],
        majorInternalDown: [],
        manualUp: [],
        manualDown: []
    }
};

// تابع پیشرفته برای شناسایی نقاط پیوت
function findPivotPoints(data, pivotPeriod = 5) {
    if (!data || data.length < pivotPeriod * 2 + 1) {
        return [];
    }

    const pivots = [];

    for (let i = pivotPeriod; i < data.length - pivotPeriod; i++) {
        const currentHigh = data[i].high;
        const currentLow = data[i].low;

        let isHighPivot = true;
        let isLowPivot = true;

        // بررسی برای پیوت سقف
        for (let j = 1; j <= pivotPeriod; j++) {
            if (currentHigh < data[i - j].high || currentHigh < data[i + j].high) {
                isHighPivot = false;
                break;
            }
        }

        // بررسی برای پیوت کف
        for (let j = 1; j <= pivotPeriod; j++) {
            if (currentLow > data[i - j].low || currentLow > data[i + j].low) {
                isLowPivot = false;
                break;
            }
        }

        if (isHighPivot) {
            pivots.push({
                index: i,
                price: currentHigh,
                type: 'high',
                timestamp: data[i].timestamp
            });
        }

        if (isLowPivot) {
            pivots.push({
                index: i,
                price: currentLow,
                type: 'low',
                timestamp: data[i].timestamp
            });
        }
    }

    return pivots;
}

// تابع اعتبارسنجی محدوده زمانی
function isValidDuration(line, minMinutes, maxMinutes) {
    const startTime = new Date(line.startTime * 1000);
    const endTime = new Date(line.endTime * 1000);
    const durationMinutes = (endTime - startTime) / (1000 * 60);

    return durationMinutes >= minMinutes && durationMinutes <= maxMinutes;
}

// تابع ایجاد خط روند
function createTrendLine(p1, p2, marketData, options, currentCandleIndex) {
    // 1. بررسی عدم استفاده از داده‌های آینده
    if (p2.index > currentCandleIndex) {
        return null;
    }

    // 2. تعریف تابع convertTimestamp
    function convertTimestamp(timestamp) {
        if (timestamp instanceof Date) {
            return Math.floor(timestamp.getTime() / 1000);
        } else if (typeof timestamp === 'number') {
            return timestamp > 1000000000000
                ? Math.floor(timestamp / 1000)
                : timestamp;
        } else if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            return Math.floor(date.getTime() / 1000);
        } else {
            const baseTime = marketData.length > 0 ?
                Math.floor(new Date(marketData[0].timestamp).getTime() / 1000) :
                Math.floor(Date.now() / 1000);
            return baseTime + (p1.index * 3600);
        }
    }

    // 3. پیدا کردن تمام نقاط پیوت
    const allPivots = findPivotPoints(marketData, options.pivotPeriod || 5);

    // 4. فیلتر کردن پیوت‌های هم‌نوع بین p1 و p2
    const linePivots = allPivots.filter(pivot =>
        pivot.index >= p1.index &&
        pivot.index <= p2.index &&
        pivot.type === p1.type
    ).sort((a, b) => a.index - b.index);

    // 5. شرط حداقل 3 پیوت
    if (linePivots.length < 3) {
        return null;
    }

    // 6. شرط فاصله بین پیوت‌های متوالی حداقل 3 کندل
    const minCandleDistance = options.minCandleDistance || 3;
    for (let i = 1; i < linePivots.length; i++) {
        const distance = linePivots[i].index - linePivots[i - 1].index;
        if (distance < minCandleDistance) {
            return null;
        }
    }

    // 7. محاسبه شیب و عرض از مبدا
    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    const intercept = p1.price - slope * p1.index;

    // 8. تعیین نوع خط
    const lineType = options.isManual ?
        (p1.type === 'low' && p2.type === 'low' ? 'manualUp' :
            p1.type === 'high' && p2.type === 'high' ? 'manualDown' : 'unknown') :
        (p1.type === 'low' && p2.type === 'low' ? 'primaryUp' :
            p1.type === 'high' && p2.type === 'high' ? 'primaryDown' : 'unknown');

    // 9. ساخت شیء خط
    const line = {
        startIndex: p1.index,
        startPrice: p1.price,
        endIndex: p2.index,
        endPrice: p2.price,
        startTime: convertTimestamp(p1.timestamp),
        endTime: convertTimestamp(p2.timestamp),
        slope: slope,
        intercept: intercept,
        pivot1: p1,
        pivot2: p2,
        pivots: linePivots,
        type: lineType,
        isManual: options.isManual || false,
        touchDetails: []
    };

    return line;
}

function isValidTrendLine(line, marketData, options, currentCandleIndex) {
    const maxDeviation = options.precision || 0.000001;
    const minTouchPoints = options.minTouchPoints || 3;
    const minCandleDistance = options.minCandleDistance || 3;

    // شرط ۱: بررسی حداقل ۳ پیوت و فاصله بین پیوت‌های متوالی
    if (line.pivots && Array.isArray(line.pivots)) {
        if (line.pivots.length < 3) {
            return false;
        }

        const sortedPivots = [...line.pivots].sort((a, b) => a.index - b.index);
        for (let i = 1; i < sortedPivots.length; i++) {
            const distance = sortedPivots[i].index - sortedPivots[i - 1].index;
            if (distance < minCandleDistance) {
                return false;
            }
        }
    } else if (line.pivot1 && line.pivot2) {
        return false;
    } else {
        return false;
    }

    // شرط ۲: بررسی استفاده از داده‌های آینده
    if (line.endIndex > currentCandleIndex) {
        return false;
    }

    // شرط ۳: بررسی شیب برای خطوط صعودی/نزولی
    if (line.pivots && line.pivots.length >= 2) {
        const firstPivot = line.pivots[0];
        const lastPivot = line.pivots[line.pivots.length - 1];

        if (firstPivot.type === 'low' && lastPivot.type === 'low') {
            if (lastPivot.price <= firstPivot.price) {
                return false;
            }
        } else if (firstPivot.type === 'high' && lastPivot.type === 'high') {
            if (lastPivot.price >= firstPivot.price) {
                return false;
            }
        }
    }

    // شرط ۴: بررسی محدوده زمانی برای خطوط دستی
    if (options.isManual && options.manualMinDuration && options.manualMaxDuration) {
        if (!isValidDuration(line, options.manualMinDuration, options.manualMaxDuration)) {
            return false;
        }
    }

    // شرط ۵: بررسی حداقل ۳ نقطه برخورد با فاصله کندلی
    let touchPoints = 0;
    const touchPointIndices = [];
    let lastTouchIndex = null;

    for (let i = line.startIndex; i <= line.endIndex; i++) {
        if (i >= marketData.length) break;

        const expectedPrice = line.slope * i + line.intercept;
        const candle = marketData[i];

        let hasTouch = false;

        if (line.type.includes('Up') || line.type.includes('manualUp')) {
            if (Math.abs(candle.low - expectedPrice) / expectedPrice <= maxDeviation) {
                hasTouch = true;
            }
        } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
            if (Math.abs(candle.high - expectedPrice) / expectedPrice <= maxDeviation) {
                hasTouch = true;
            }
        }

        if (hasTouch) {
            if (lastTouchIndex === null) {
                touchPoints++;
                touchPointIndices.push(i);
                lastTouchIndex = i;
            } else {
                const distance = i - lastTouchIndex;
                if (distance >= minCandleDistance) {
                    touchPoints++;
                    touchPointIndices.push(i);
                    lastTouchIndex = i;
                }
            }
        }
    }

    if (touchPoints < minTouchPoints) {
        return false;
    }

    // شرط ۶: بررسی عدم شکست خط بین نقاط برخورد
    if (touchPointIndices.length >= 2) {
        const firstTouchIndex = touchPointIndices[0];
        const lastTouchIndex = touchPointIndices[touchPointIndices.length - 1];

        for (let i = firstTouchIndex + 1; i < lastTouchIndex; i++) {
            if (i >= marketData.length) break;

            const expectedPrice = line.slope * i + line.intercept;
            const candle = marketData[i];

            const candleSize = (candle.high - candle.low) / candle.low * 100;
            if (candleSize < 0.10) {
                continue;
            }

            if (line.type.includes('Up') || line.type.includes('manualUp')) {
                if (candle.low < expectedPrice) {
                    return false;
                }
            } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
                if (candle.high > expectedPrice) {
                    return false;
                }
            }
        }
    }

    // شرط ۷: بررسی اینکه نقاط برخورد حداقل ۳ نقطه متمایز باشند
    const uniqueTouchPoints = [...new Set(touchPointIndices)];
    if (uniqueTouchPoints.length < minTouchPoints) {
        return false;
    }

    return true;
}

function processTrendLineDataForMain(trendLines, marketData = []) {
    const result = {};
    let totalValidLines = 0;

    for (const [type, lines] of Object.entries(trendLines)) {
        if (!Array.isArray(lines)) {
            result[type] = [];
            continue;
        }

        const validLines = lines.map(line => {
            if (marketData && marketData.length > 0 && !line.touchDetails) {
                const currentCandleIndex = marketData.length - 1;
                const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
                line.touchDetails = touchInfo.details;
            }

            return line;
        }).filter(line => {
            const isValid = line &&
                line.startTime && !isNaN(line.startTime) &&
                line.endTime && !isNaN(line.endTime) &&
                line.startPrice && !isNaN(line.startPrice) &&
                line.endPrice && !isNaN(line.endPrice) &&
                line.startTime < line.endTime;

            return isValid;
        });

        result[type] = validLines;
        totalValidLines += validLines.length;
    }

    return result;
}

function detectTrendLinesFromPivots(pivots, marketData, options, currentCandleIndex) {
    if (!pivots || pivots.length < 2) {
        return {
            primaryUp: [],
            primaryDown: [],
            majorExternalUp: [],
            majorExternalDown: [],
            majorInternalUp: [],
            majorInternalDown: [],
            manualUp: [],
            manualDown: []
        };
    }

    const primaryUp = [];
    const primaryDown = [];
    const manualUp = [];
    const manualDown = [];

    const validPivots = pivots.filter(p => p.index <= currentCandleIndex);

    // شناسایی خطوط صعودی (کف به کف)
    const lowPivots = validPivots.filter(p => p.type === 'low').sort((a, b) => a.index - b.index);

    for (let i = 0; i < lowPivots.length - 1; i++) {
        for (let j = i + 1; j < lowPivots.length; j++) {
            const p1 = lowPivots[i];
            const p2 = lowPivots[j];

            const line = createTrendLine(p1, p2, marketData, options, currentCandleIndex);
            if (!line) continue;

            if (isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                const targetArray = options.isManual ? manualUp : primaryUp;
                const isDuplicate = targetArray.some(existingLine =>
                    existingLine.startIndex === line.startIndex &&
                    existingLine.endIndex === line.endIndex
                );

                if (!isDuplicate) {
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
                    line.touchDetails = touchInfo.details;
                    targetArray.push(line);
                }
            }
        }
    }

    // شناسایی خطوط نزولی (سقف به سقف)
    const highPivots = validPivots.filter(p => p.type === 'high').sort((a, b) => a.index - b.index);

    for (let i = 0; i < highPivots.length - 1; i++) {
        for (let j = i + 1; j < highPivots.length; j++) {
            const p1 = highPivots[i];
            const p2 = highPivots[j];

            const line = createTrendLine(p1, p2, marketData, options, currentCandleIndex);
            if (!line) continue;

            if (isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                const targetArray = options.isManual ? manualDown : primaryDown;
                const isDuplicate = targetArray.some(existingLine =>
                    existingLine.startIndex === line.startIndex &&
                    existingLine.endIndex === line.endIndex
                );

                if (!isDuplicate) {
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
                    line.touchDetails = touchInfo.details;
                    targetArray.push(line);
                }
            }
        }
    }

    return {
        primaryUp: primaryUp,
        primaryDown: primaryDown,
        manualUp: manualUp,
        manualDown: manualDown,
        majorExternalUp: [],
        majorExternalDown: [],
        majorInternalUp: [],
        majorInternalDown: []
    };
}

function detectTrendLinesAdvanced(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {

            options.precision = 0.001

            const currentCandleIndex = marketData.length - 1;
            const pivotPeriod = options.pivotPeriod || 5;
            const allPivots = findPivotPoints(marketData, pivotPeriod);

            if (allPivots.length < 2) {
                resolve({
                    trendLines: {
                        primaryUp: [],
                        primaryDown: [],
                        majorExternalUp: [],
                        majorExternalDown: [],
                        majorInternalUp: [],
                        majorInternalDown: [],
                        manualUp: [],
                        manualDown: []
                    },
                    statistics: {
                        totalLines: 0,
                        primaryUp: 0,
                        primaryDown: 0,
                        manualUp: 0,
                        manualDown: 0
                    }
                });
                return;
            }

            const trendLines = detectTrendLinesFromPivots(allPivots, marketData, options, currentCandleIndex);
            const processedTrendLines = processTrendLineDataForMain(trendLines, marketData);

            const result = {
                trendLines: processedTrendLines,
                statistics: {
                    totalLines: processedTrendLines.primaryUp.length + processedTrendLines.primaryDown.length +
                        processedTrendLines.manualUp.length + processedTrendLines.manualDown.length,
                    primaryUp: processedTrendLines.primaryUp.length,
                    primaryDown: processedTrendLines.primaryDown.length,
                    manualUp: processedTrendLines.manualUp.length,
                    manualDown: processedTrendLines.manualDown.length,
                    majorExternalUp: 0,
                    majorExternalDown: 0,
                    majorInternalUp: 0,
                    majorInternalDown: 0
                }
            };

            resolve(result);

        } catch (error) {
            console.error('❌ [ADVANCED_ERROR] خطا:', error);
            reject(error);
        }
    });
}

function detectTrendLinesIncremental(data, state, options) {
    if (!state || !state.processedData) {
        state = {
            processedData: [],
            pivots: [],
            pendingTrendLines: [],
            trendLines: {
                primaryUp: [],
                primaryDown: [],
                majorExternalUp: [],
                majorExternalDown: [],
                majorInternalUp: [],
                majorInternalDown: [],
                manualUp: [],
                manualDown: []
            }
        };
    }

    if (!Array.isArray(state.pendingTrendLines)) {
        state.pendingTrendLines = [];
    }

    const currentCandleIndex = data.length - 1;
    state.processedData = data;

    const allPivots = findPivotPoints(data, options.pivotPeriod || 5);
    state.pivots = allPivots;

    const newTrendLines = detectTrendLinesFromPivots(state.pivots, data, options, currentCandleIndex);
    addNewLinesToPending(state, newTrendLines, currentCandleIndex);
    validatePendingLines(state, data, options, currentCandleIndex);

    const processedTrendLines = processTrendLineDataForMain(state.trendLines, data);

    return {
        trendLines: processedTrendLines,
        state: state
    };
}

function addNewLinesToPending(state, newTrendLines, currentCandleIndex) {
    if (newTrendLines.primaryUp && Array.isArray(newTrendLines.primaryUp)) {
        newTrendLines.primaryUp.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.primaryUp && state.trendLines.primaryUp.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'primaryUp',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.primaryDown && Array.isArray(newTrendLines.primaryDown)) {
        newTrendLines.primaryDown.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.primaryDown && state.trendLines.primaryDown.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'primaryDown',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.manualUp && Array.isArray(newTrendLines.manualUp)) {
        newTrendLines.manualUp.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.manualUp && state.trendLines.manualUp.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'manualUp',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.manualDown && Array.isArray(newTrendLines.manualDown)) {
        newTrendLines.manualDown.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.manualDown && state.trendLines.manualDown.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'manualDown',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
                    createdAt: currentCandleIndex
                });
            }
        });
    }
}

function validatePendingLines(state, marketData, options, currentCandleIndex) {
    const minTouchPoints = 3;
    const stillPending = [];

    if (!state.trendLines.primaryUp) state.trendLines.primaryUp = [];
    if (!state.trendLines.primaryDown) state.trendLines.primaryDown = [];
    if (!state.trendLines.manualUp) state.trendLines.manualUp = [];
    if (!state.trendLines.manualDown) state.trendLines.manualDown = [];

    state.pendingTrendLines.forEach(pendingLine => {
        const currentTouchPoints = countTouchPoints(pendingLine, marketData, currentCandleIndex);

        if (currentTouchPoints >= minTouchPoints) {
            if (pendingLine.type === 'primaryUp') {
                state.trendLines.primaryUp.push(pendingLine);
            } else if (pendingLine.type === 'primaryDown') {
                state.trendLines.primaryDown.push(pendingLine);
            } else if (pendingLine.type === 'manualUp') {
                state.trendLines.manualUp.push(pendingLine);
            } else if (pendingLine.type === 'manualDown') {
                state.trendLines.manualDown.push(pendingLine);
            }
        } else {
            stillPending.push({
                ...pendingLine,
                touchPoints: currentTouchPoints
            });
        }
    });

    state.pendingTrendLines = stillPending;
}

function countTouchPoints(line, marketData, currentCandleIndex) {
    const maxDeviation = 0.000001;
    const minCandleDistance = 3;
    let touchPoints = 0;
    let touchDetails = [];
    let lastTouchIndex = null;

    const validationEndIndex = currentCandleIndex;

    for (let i = line.startIndex; i <= validationEndIndex; i++) {
        if (i >= marketData.length) break;

        const expectedPrice = line.slope * i + line.intercept;
        const candle = marketData[i];

        let priceToCheck;
        if (line.type.includes('Up')) {
            priceToCheck = candle.low;
        } else if (line.type.includes('Down')) {
            priceToCheck = candle.high;
        } else {
            priceToCheck = candle.close;
        }

        const deviation = Math.abs(priceToCheck - expectedPrice) / expectedPrice;

        if (deviation <= maxDeviation) {
            if (lastTouchIndex === null) {
                touchPoints++;

                let direction;
                if (line.type.includes('Up')) {
                    direction = candle.low <= expectedPrice ? 'fromBelow' : 'fromAbove';
                } else if (line.type.includes('Down')) {
                    direction = candle.high >= expectedPrice ? 'fromAbove' : 'fromBelow';
                } else {
                    direction = 'unknown';
                }

                touchDetails.push({
                    index: i,
                    price: priceToCheck,
                    time: candle.timestamp,
                    direction: direction,
                    expectedPrice: expectedPrice,
                    deviation: deviation
                });

                lastTouchIndex = i;

            } else {
                const distance = i - lastTouchIndex;

                if (distance >= minCandleDistance) {
                    touchPoints++;

                    let direction;
                    if (line.type.includes('Up')) {
                        direction = candle.low <= expectedPrice ? 'fromBelow' : 'fromAbove';
                    } else if (line.type.includes('Down')) {
                        direction = candle.high >= expectedPrice ? 'fromAbove' : 'fromBelow';
                    } else {
                        direction = 'unknown';
                    }

                    touchDetails.push({
                        index: i,
                        price: priceToCheck,
                        time: candle.timestamp,
                        direction: direction,
                        expectedPrice: expectedPrice,
                        deviation: deviation
                    });

                    lastTouchIndex = i;
                }
            }

            if (touchDetails.length >= 15) {
                break;
            }
        }
    }

    line.touchDetails = touchDetails;

    return {
        count: touchPoints,
        details: touchDetails
    };
}

// ==================== تابع اصلی بکتست با 4 مشکل اصلاح شده ====================

async function runBacktest(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            // ==================== تنظیمات سیستم ادامه‌دهی ====================
            const settings = {
                enableContinuation: options.enableContinuation !== false,
                maxContinuationFiles: options.maxContinuationFiles || 3,
                handleGaps: options.handleGaps !== false,
                useStagedStopLoss: options.useStagedStopLoss !== false,
                uploadedFiles: options.uploadedFiles || {},
                combinedFiles: options.combinedFiles || {},
                fileName: options.fileName || 'unknown'
            };

            // ==================== مراحل حد ضرر پلکانی (اصلاح شده) ====================
            const stopLossStages = [
                { movePercent: 0.75, stopLossPercent: 0.10 },
                { movePercent: 1.5, stopLossPercent: 0.75 },
                { movePercent: 2.5, stopLossPercent: 1.5 },
                { movePercent: 3.5, stopLossPercent: 2.75 },
                { movePercent: 4.5, stopLossPercent: 3.75 },
            ];

            // ==================== تابع حد ضرر پلکانی (اصلاح شده) ====================
            function stagedStopLoss(currentPrice, entryPrice, initialStopLoss, stages, positionType) {
                if (!stages || stages.length === 0) {
                    return initialStopLoss;
                }

                // محاسبه درصد سود/ضرر
                const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

                // اگر در ضرر هستیم یا به حداقل سود نرسیده‌ایم
                if (profitPercent < stages[0].movePercent) {
                    console.log(`ℹ️ حد ضرر پلکانی: سود ${profitPercent.toFixed(2)}%، نیاز به ${stages[0].movePercent}%`);
                    return initialStopLoss;
                }

                // پیدا کردن مناسب‌ترین مرحله (از آخر به اول)
                let selectedStage = stages[0];
                for (let i = stages.length - 1; i >= 0; i--) {
                    if (profitPercent >= stages[i].movePercent) {
                        selectedStage = stages[i];
                        break;
                    }
                }

                // محاسبه حد ضرر جدید
                let newStopLoss;
                if (positionType === 'BUY') {
                    newStopLoss = entryPrice * (1 + selectedStage.stopLossPercent / 100);
                    // حد ضرر جدید نباید از قیمت فعلی بالاتر باشد
                    newStopLoss = Math.min(newStopLoss, currentPrice * 0.999);
                    // حد ضرر جدید نباید بدتر از حد اولیه باشد
                    newStopLoss = Math.max(newStopLoss, initialStopLoss);
                } else if (positionType === 'SELL') {
                    newStopLoss = entryPrice * (1 - selectedStage.stopLossPercent / 100);
                    newStopLoss = Math.max(newStopLoss, currentPrice * 1.001);
                    newStopLoss = Math.min(newStopLoss, initialStopLoss);
                }

                console.log(`✅ حد ضرر پلکانی: سود ${profitPercent.toFixed(2)}% → مرحله ${selectedStage.movePercent}% → SL=${newStopLoss.toFixed(4)}`);

                return newStopLoss;
            }

            // ==================== تابع Gap Handling ====================
            function handleGapExit(position, candle, exitType) {
                let shouldExit = false;
                let exitPrice = 0;
                let exitReason = '';

                if (position.type === 'BUY') {
                    if (exitType === 'stopLoss' && candle.open <= position.stopLoss) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Stop Loss (Gap)';
                        console.log(`⚡ Gap Stop Loss: Open=${candle.open.toFixed(4)} <= SL=${position.stopLoss.toFixed(4)}`);
                    } else if (exitType === 'takeProfit' && candle.open >= position.takeProfit) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Take Profit (Gap)';
                        console.log(`⚡ Gap Take Profit: Open=${candle.open.toFixed(4)} >= TP=${position.takeProfit.toFixed(4)}`);
                    }
                } else if (position.type === 'SELL') {
                    if (exitType === 'stopLoss' && candle.open >= position.stopLoss) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Stop Loss (Gap)';
                        console.log(`⚡ Gap Stop Loss: Open=${candle.open.toFixed(4)} >= SL=${position.stopLoss.toFixed(4)}`);
                    } else if (exitType === 'takeProfit' && candle.open <= position.takeProfit) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Take Profit (Gap)';
                        console.log(`⚡ Gap Take Profit: Open=${candle.open.toFixed(4)} <= TP=${position.takeProfit.toFixed(4)}`);
                    }
                }

                return { shouldExit, exitPrice, exitReason };
            }

            // ==================== تابع پیدا کردن فایل بعدی (بر اساس تاریخ) ====================
            function findNextFileByDate() {
                if (!marketData || marketData.length === 0) {
                    console.log('⚠️ داده فایل جاری خالی است');
                    return null;
                }

                // پیدا کردن آخرین تاریخ فایل جاری
                const lastCandle = marketData[marketData.length - 1];
                const lastTimestamp = lastCandle.timestamp;
                const lastDate = new Date(lastTimestamp);

                console.log(`📅 جستجوی فایل بعدی از تاریخ: ${lastDate.toISOString()}`);

                // بررسی همه فایل‌ها
                const allFiles = { ...settings.uploadedFiles, ...settings.combinedFiles };
                let nextFile = null;
                let smallestGap = Infinity;

                Object.values(allFiles).forEach(fileInfo => {
                    if (!fileInfo.data || fileInfo.data.length === 0) return;

                    const firstCandle = fileInfo.data[0];
                    const firstDate = new Date(firstCandle.timestamp);

                    // فاصله زمانی (به میلی‌ثانیه)
                    const timeGap = firstDate - lastDate;

                    // اگر فایل بعدی است (بعد از تاریخ آخرین کندل) و نزدیک‌ترین است
                    if (timeGap > 0 && timeGap < smallestGap) {
                        // بررسی شکاف زمانی منطقی (حداکثر ۲ روز)
                        const maxGap = 2 * 24 * 60 * 60 * 1000; // ۲ روز
                        if (timeGap <= maxGap) {
                            smallestGap = timeGap;
                            nextFile = fileInfo;
                        }
                    }
                });

                if (nextFile) {
                    const gapHours = smallestGap / (1000 * 60 * 60);
                    console.log(`✅ فایل بعدی یافت شد: ${nextFile.fileName} (${gapHours.toFixed(1)} ساعت فاصله)`);
                } else {
                    console.log('❌ فایل بعدی یافت نشد');
                }

                return nextFile;
            }

            // ==================== تابع ادامه معاملات باز ====================
            function continueOpenTradesWithNextFile(openPositions, nextFileData, commission) {
                if (!openPositions || openPositions.length === 0) {
                    console.log('ℹ️ هیچ معامله باز برای ادامه وجود ندارد');
                    return { trades: [], remainingPositions: [] };
                }

                if (!nextFileData || nextFileData.length === 0) {
                    console.log('⚠️ داده فایل بعدی خالی است');
                    return { trades: [], remainingPositions: openPositions };
                }

                console.log(`🔄 ادامه ${openPositions.length} معامله با ${nextFileData.length} کندل جدید`);

                const closedTrades = [];
                const remainingPositions = [...openPositions];

                // پردازش هر کندل از فایل جدید
                for (let i = 0; i < nextFileData.length; i++) {
                    const candle = nextFileData[i];

                    for (let j = remainingPositions.length - 1; j >= 0; j--) {
                        const position = remainingPositions[j];
                        let shouldExit = false;
                        let exitPrice = 0;
                        let exitReason = '';

                        // 1. بررسی Gap در Open
                        if (settings.handleGaps) {
                            const gapCheck = handleGapExit(position, candle, 'stopLoss');
                            if (gapCheck.shouldExit) {
                                shouldExit = true;
                                exitPrice = gapCheck.exitPrice;
                                exitReason = gapCheck.exitReason;
                            }
                        }

                        // 2. بررسی Stop Loss عادی
                        if (!shouldExit && position.type === 'BUY' && candle.low <= position.stopLoss) {
                            shouldExit = true;
                            exitPrice = position.stopLoss;
                            exitReason = 'Stop Loss (Continued)';
                        }

                        // 3. بررسی Take Profit
                        if (!shouldExit && position.takeProfit && position.type === 'BUY' && candle.high >= position.takeProfit) {
                            shouldExit = true;
                            exitPrice = position.takeProfit;
                            exitReason = 'Take Profit (Continued)';
                        }

                        // 4. به‌روزرسانی حد ضرر پلکانی
                        if (!shouldExit && position.useStagedStopLoss) {
                            const newStopLoss = stagedStopLoss(
                                candle.close,
                                position.entryPrice,
                                position.initialStopLoss,
                                position.stopLossStages || stopLossStages,
                                position.type
                            );

                            if (position.type === 'BUY' && newStopLoss > position.stopLoss) {
                                position.stopLoss = newStopLoss;
                                console.log(`🔼 حد ضرر آپدیت شد: ${newStopLoss.toFixed(4)}`);
                            }
                        }

                        // بستن معامله
                        if (shouldExit) {
                            const profit = position.type === 'BUY'
                                ? (exitPrice - position.entryPrice) * position.size
                                : (position.entryPrice - exitPrice) * position.size;

                            const commissionAmount = position.size * exitPrice * (commission / 100);

                            const tradeData = {
                                type: position.type,
                                entryPrice: position.entryPrice,
                                exitPrice: exitPrice,
                                entryTime: position.entryTime,
                                exitTime: candle.timestamp,
                                profit: profit - commissionAmount,
                                size: position.size,
                                exitReason: exitReason,
                                stopLoss: position.stopLoss,
                                takeProfit: position.takeProfit,
                                source: 'continued',
                                originalFile: settings.fileName,
                                continuedFile: 'next_file',
                                candleIndex: i
                            };

                            closedTrades.push(tradeData);
                            remainingPositions.splice(j, 1);

                            console.log(`📊 معامله ادامه‌یافته بسته شد: ${exitReason} در ${exitPrice.toFixed(4)}`);
                        }
                    }

                    // اگر همه معاملات بسته شدند، ادامه نده
                    if (remainingPositions.length === 0) {
                        console.log('✅ همه معاملات در فایل بعدی بسته شدند');
                        break;
                    }
                }

                console.log(`📈 ${closedTrades.length} معامله بسته شد، ${remainingPositions.length} معامله هنوز باز است`);

                return {
                    trades: closedTrades,
                    remainingPositions: remainingPositions
                };
            }

            // 🆕 تنظیمات ایچیموکو
            const ichimokuSettings = options.ichimoku || {
                enabled: true,
                useCloudFilter: true,
                useTKCross: true,
                useChikou: true,
                tenkanPeriod: 14,
                kijunPeriod: 30,
                senkouBPeriod: 57
            };

            // تابع محاسبه زاویه خط
            function calculateLineAngle(line) {
                if (!line) return 0;

                if (line.pivots && line.pivots.length >= 2) {
                    const firstPivot = line.pivots[0];
                    const lastPivot = line.pivots[line.pivots.length - 1];

                    const deltaY = lastPivot.price - firstPivot.price;
                    const deltaX = lastPivot.index - firstPivot.index;

                    if (deltaX === 0) return 90;

                    const slope = deltaY / deltaX;
                    const angleRad = Math.atan(slope);
                    const angleDeg = angleRad * (180 / Math.PI);

                    let normalizedAngle = angleDeg;
                    if (normalizedAngle < 0) normalizedAngle += 360;

                    return normalizedAngle;
                }

                if (line.startIndex !== undefined && line.endIndex !== undefined) {
                    const deltaY = line.endPrice - line.startPrice;
                    const deltaX = line.endIndex - line.startIndex;

                    if (deltaX === 0) return 90;

                    const slope = deltaY / deltaX;
                    const angleRad = Math.atan(slope);
                    const angleDeg = angleRad * (180 / Math.PI);

                    let normalizedAngle = angleDeg;
                    if (normalizedAngle < 0) normalizedAngle += 360;

                    return normalizedAngle;
                }

                return 0;
            }

            // تابع حد ضرر پلکانی
            function stagedStopLossOld(currentPrice, entryPrice, initialStopLoss, stages) {
                if (!stages || stages.length === 0) {
                    return initialStopLoss;
                }

                if (currentPrice <= entryPrice) {
                    return initialStopLoss;
                }

                const priceMovePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                let selectedStage = stages[0];

                for (const stage of stages) {
                    if (priceMovePercent >= stage.movePercent) {
                        selectedStage = stage;
                    } else {
                        break;
                    }
                }

                const stopLossPrice = entryPrice * (1 + selectedStage.stopLossPercent / 100);
                return Math.max(stopLossPrice, initialStopLoss);
            }

            // تابع trailingStop پیشرفته
            function trailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10, useFibonacci = false, highestPivot = null, trendLineAngle = null, allTrendLines = {}) {
                if (currentPrice > entryPrice) {

                    if (!useFibonacci) {
                        const newStop = currentPrice * (1 - trailPercentage / 100);
                        const maxDistance = entryPrice * (maxDistancePercent / 100);
                        const minStop = currentPrice - maxDistance;

                        return Math.max(newStop, initialStopLoss, minStop);
                    }

                    // محاسبه حدضرر بر اساس مراحل
                    let stageStopLoss = calculateStopLossFromStages(entryPrice, currentPrice, stopLossStages);
                    let minStop = Math.max(initialStopLoss, stageStopLoss);

                    // حالت فیبوناچی
                    if (useFibonacci && highestPivot) {
                        if (trendLineAngle >= 270 && trendLineAngle <= 350) {
                            const distanceToPivot = highestPivot - entryPrice;
                            let currentFibLevel = minStop;

                            const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];

                            for (const level of fibLevels) {
                                const fibPrice = entryPrice + (distanceToPivot * level);
                                if (currentPrice >= fibPrice) {
                                    currentFibLevel = Math.max(currentFibLevel, fibPrice * 0.99);
                                }
                            }

                            return Math.max(currentFibLevel, minStop);
                        }
                        else if (trendLineAngle > 350 || trendLineAngle < 10) {
                            if (allTrendLines && Object.keys(allTrendLines).length > 0) {
                                let trendLinesArray = [];
                                Object.values(allTrendLines).forEach(lines => {
                                    if (Array.isArray(lines)) {
                                        trendLinesArray = trendLinesArray.concat(lines);
                                    }
                                });

                                const suitablePreviousLines = trendLinesArray.filter(line => {
                                    const angle = calculateLineAngle(line);
                                    return angle >= 270 && angle <= 350;
                                });

                                if (suitablePreviousLines.length > 0) {
                                    const previousLine = suitablePreviousLines[suitablePreviousLines.length - 1];
                                    const previousPivot = previousLine.pivots && previousLine.pivots[0] ?
                                        previousLine.pivots[0].price :
                                        (previousLine.startPrice > previousLine.endPrice ?
                                            previousLine.startPrice : previousLine.endPrice);

                                    if (previousPivot) {
                                        const distanceToPreviousPivot = previousPivot - entryPrice;
                                        let currentFibLevel = minStop;

                                        const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];

                                        for (const level of fibLevels) {
                                            const fibPrice = entryPrice + (distanceToPreviousPivot * level);
                                            if (currentPrice >= fibPrice) {
                                                currentFibLevel = Math.max(currentFibLevel, fibPrice * 0.99);
                                            }
                                        }

                                        return Math.max(currentFibLevel, minStop);
                                    }
                                }
                            }
                        }
                    }

                    // تردینگ معمولی
                    const newStop = currentPrice * (1 - trailPercentage / 100);
                    const maxDistance = entryPrice * (maxDistancePercent / 100);
                    const minStop2 = currentPrice - maxDistance;

                    return Math.max(newStop, minStop, minStop2, initialStopLoss);
                }
                return initialStopLoss;
            }

            // تابع محاسبه حدضرر بر اساس مراحل
            function calculateStopLossFromStages(entryPrice, currentPrice, stages) {
                if (stages.length === 0) {
                    return entryPrice;
                }

                if (currentPrice <= entryPrice) {
                    return entryPrice * (1 + stages[0].stopLossPercent / 100);
                }

                const priceMovePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                let selectedStage = stages[0];

                for (const stage of stages) {
                    if (priceMovePercent >= stage.movePercent) {
                        selectedStage = stage;
                    } else {
                        break;
                    }
                }

                if (selectedStage.stopLossPercent >= 0) {
                    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
                } else {
                    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
                }
            }

            // بررسی امکان باز کردن معامله جدید
            function canOpenNewPosition(positions, newEntryPrice) {
                const tolerance = 0.005;
                const positionsInZone = positions.filter(pos => {
                    const diff = Math.abs(pos.entryPrice - newEntryPrice) / pos.entryPrice;
                    return diff <= tolerance;
                });

                if (positionsInZone.length === 0) {
                    return true;
                }

                const allInProfit = positionsInZone.every(pos => pos.stopLoss > pos.entryPrice);
                return allInProfit;
            }

            // سیستم تشخیص اولین شکست خطوط روند
            const trendLineBreaks = {};
            const processedTrendLines = [];

            // تابع محاسبه مقدار خط روند
            function calculateTrendLineValue(line, candleIndex) {
                if (!line || typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                    if (line.startIndex !== undefined && line.endIndex !== undefined &&
                        line.startPrice !== undefined && line.endPrice !== undefined) {
                        line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                        line.intercept = line.startPrice - line.slope * line.startIndex;
                        return line.slope * candleIndex + line.intercept;
                    }
                    return null;
                }
                return line.slope * candleIndex + line.intercept;
            }

            // تابع تشخیص اولین شکست خط روند
            function detectTrendLineFirstBreak(line, candleIndex, candle) {
                if (trendLineBreaks[line.id]) return null;
                if (candleIndex < line.startIndex) return null;

                const lineValue = calculateTrendLineValue(line, candleIndex);
                if (lineValue === null) return null;

                let isBreak = false;
                let breakInfo = null;

                if (line.type.includes('Up') || line.type.includes('manualUp')) {
                    const tolerance = lineValue * 0.001;
                    if (candle.low < lineValue - tolerance) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: candle.low,
                            breakTime: candle.timestamp,
                            direction: 'down',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
                    const tolerance = lineValue * 0.001;
                    if (candle.high > lineValue + tolerance) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: candle.high,
                            breakTime: candle.timestamp,
                            direction: 'up',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                }

                if (isBreak) {
                    trendLineBreaks[line.id] = breakInfo;
                    console.log(`⚡ اولین شکست خط روند ${line.id} (${line.type}) در کندل ${candleIndex}، قیمت: ${breakInfo.breakPrice.toFixed(4)}`);
                    return breakInfo;
                }

                return null;
            }

            // آماده‌سازی خطوط روند
            function prepareTrendLines(trendLinesData) {
                if (!trendLinesData || typeof trendLinesData !== 'object') {
                    console.log('❌ trendLinesData خالی یا نامعتبر است');
                    return;
                }

                console.log('🔵 شروع آماده‌سازی خطوط روند');

                Object.entries(trendLinesData).forEach(([type, lines]) => {
                    if (Array.isArray(lines)) {
                        console.log(`📊 پردازش ${lines.length} خط از نوع ${type}`);

                        lines.forEach((line, index) => {
                            if (line) {
                                if (!line.id) {
                                    line.id = `${type}_${line.startIndex}_${line.endIndex}_${index}`;
                                }

                                if (!line.type) {
                                    line.type = type;
                                }

                                if (typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                                    if (line.startIndex !== undefined && line.endIndex !== undefined &&
                                        line.startPrice !== undefined && line.endPrice !== undefined) {
                                        line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                                        line.intercept = line.startPrice - line.slope * line.startIndex;
                                    }
                                }

                                processedTrendLines.push(line);
                            }
                        });
                    }
                });

                console.log(`✅ ${processedTrendLines.length} خط روند برای امتداد و تشخیص شکست آماده شد`);
            }

            const initialCapital = options.initialCapital || 10000;
            const riskPerTrade = options.riskPerTrade || 2;
            const commission = options.commission || 0.05;

            let capital = initialCapital;
            let equity = initialCapital;
            let positions = [];
            const trades = [];
            const equityData = [];
            let dailyLoss = 0;
            let currentDay = null;
            let tradeCounter = 0;

            console.log("🚀 ===== شروع بکتست =====");
            console.log(`📊 پارامترها: سرمایه اولیه: ${initialCapital}, ریسک هر معامله: ${riskPerTrade}%, کارمزد: ${commission}%`);
            console.log(`📈 تعداد کندل‌ها: ${marketData.length}`);
            console.log(`🎯 تنظیمات ایچیموکو: ${JSON.stringify(ichimokuSettings)}`);
            console.log(`🎯 سیستم Fixed Risk فعال - ریسک ثابت: $${(initialCapital * (riskPerTrade / 100)).toFixed(2)} هر معامله`);

            // آماده‌سازی خطوط روند
            prepareTrendLines(options.trendLines || {});

            for (let i = 20; i < marketData.length; i++) {
                const candle = marketData[i];
                const currentDate = new Date(candle.timestamp).toDateString();

                if (currentDay !== currentDate) {
                    dailyLoss = 0;
                    currentDay = currentDate;
                }

                if (dailyLoss <= -(options.maxDailyLoss || 5) / 100 * capital) {
                    continue;
                }

                // 🆕 محاسبه ایچیموکو برای کندل جاری
                const ichimoku = ichimokuSettings.enabled ?
                    calculateIchimokuHistorical(marketData, i, {
                        tenkanPeriod: ichimokuSettings.tenkanPeriod,
                        kijunPeriod: ichimokuSettings.kijunPeriod,
                        senkouBPeriod: ichimokuSettings.senkouBPeriod
                    }) : null;

                // بررسی شکست خطوط روند
                if (processedTrendLines.length > 0) {
                    processedTrendLines.forEach(line => {
                        detectTrendLineFirstBreak(line, i, candle);
                    });
                }

                try {
                    // 🆕 دریافت نقاط شکست از options (فقط یکبار قبل از حلقه)
                    const breakPointsData = options.breakPoints || {};

                    console.log(`🔵 [WORKER] نقاط شکست دریافت شد: ${Object.keys(breakPointsData).length} کندل`);

                    // 🆕 استراتژی با پشتیبانی از ایچیموکو و نقاط شکست
                    const strategyFn = new Function('data', 'index', 'breakPointsParam', 'ichimokuParam', `
            function calculateSMA(data, endIndex, period) {
                let sum = 0;
                for (let i = 0; i < period; i++) {
                    if (endIndex - i < 0) return null;
                    sum += data[endIndex - i].close;
                }
                return sum / period;
            }
            
            function getTrendLines() {
                return ${JSON.stringify(options.trendLines || {})};
            }
            
            // 🆕 تابع دریافت نقاط شکست برای کندل خاص
            function getBreakPointsAtCandle(candleIndex) {
                return breakPointsParam[candleIndex] || [];
            }
            
            // 🆕 تابع محاسبه مقدار خط روند در کندل فعلی
            function calculateTrendLineValue(line, candleIndex) {
                if (!line || typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                    if (line.startIndex !== undefined && line.endIndex !== undefined && 
                        line.startPrice !== undefined && line.endPrice !== undefined) {
                        line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                        line.intercept = line.startPrice - line.slope * line.startIndex;
                        return line.slope * candleIndex + line.intercept;
                    }
                    return null;
                }
                return line.slope * candleIndex + line.intercept;
            }
            
            // 🆕 تابع بررسی شکست خط در کندل جاری
            function isTrendLineBroken(line, candleIndex) {
                const breakPoints = getBreakPointsAtCandle(candleIndex);
                return breakPoints.some(bp => bp.lineId === line.id);
            }
            
            // 🆕 تابع دریافت همه خطوط شکسته شده در کندل جاری
            function getCurrentBreakLines(candleIndex) {
                return getBreakPointsAtCandle(candleIndex);
            }
            
            // 🆕 تابع بررسی شکست واقعی با ایچیموکو
            function isRealBreakoutWithIchimoku(breakInfo, ichimokuData, currentPrice) {
                if (!ichimokuData) return true;
                
                if (breakInfo.direction === 'up') {
                    const conditions = {
                        priceAboveCloud: currentPrice > ichimokuData.kumoTop,
                        tenkanAboveKijun: ichimokuData.tenkan > ichimokuData.kijun,
                        chikouBullish: ichimokuData.chikou > (data[index - 26] ? data[index - 26].close : 0),
                        kumoThick: (ichimokuData.kumoTop - ichimokuData.kumoBottom) > 0
                    };
                    
                    const useCloudFilter = ${ichimokuSettings.useCloudFilter || false};
                    const useTKCross = ${ichimokuSettings.useTKCross || false};
                    const useChikou = ${ichimokuSettings.useChikou || false};
                    
                    let isValid = true;
                    
                    if (useCloudFilter) {
                        isValid = isValid && conditions.priceAboveCloud;
                    }
                    
                    if (useTKCross) {
                        isValid = isValid && conditions.tenkanAboveKijun;
                    }
                    
                    if (useChikou) {
                        isValid = isValid && conditions.chikouBullish;
                    }
                    
                    return isValid;
                } else {
                    const conditions = {
                        priceBelowCloud: currentPrice < ichimokuData.kumoBottom,
                        tenkanBelowKijun: ichimokuData.tenkan < ichimokuData.kijun,
                        chikouBearish: ichimokuData.chikou < (data[index - 26] ? data[index - 26].close : 0)
                    };
                    
                    const useCloudFilter = ${ichimokuSettings.useCloudFilter || false};
                    const useTKCross = ${ichimokuSettings.useTKCross || false};
                    const useChikou = ${ichimokuSettings.useChikou || false};
                    
                    let isValid = true;
                    
                    if (useCloudFilter) {
                        isValid = isValid && conditions.priceBelowCloud;
                    }
                    
                    if (useTKCross) {
                        isValid = isValid && conditions.tenkanBelowKijun;
                    }
                    
                    if (useChikou) {
                        isValid = isValid && conditions.chikouBearish;
                    }
                    
                    return isValid;
                }
            }
            
// 🆕 تابع دریافت روندهای شارپ
function getSharpTrends() {
    return sharpTrendsParam || [];
}

// 🆕 تابع دریافت روندهای شارپ برای کندل خاص
function getSharpTrendsAtCandle(candleIndex) {
    const sharpTrends = sharpTrendsParam || [];
    return sharpTrends.filter(trend => 
        trend.startIndex <= candleIndex && trend.endIndex >= candleIndex
    );
}

            // 🆕 مراحل حدضرر پلکانی
            const stopLossStages = ${JSON.stringify(stopLossStages)};
            
            // 🆕 تابع محاسبه حدضرر بر اساس مراحل
            function calculateStopLossFromStages(entryPrice, currentPrice, stages) {
                if (stages.length === 0) {
                    return entryPrice;
                }
                
                if (currentPrice <= entryPrice) {
                    return entryPrice * (1 + stages[0].stopLossPercent / 100);
                }
                
                const priceMovePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                let selectedStage = stages[0];
                
                for (const stage of stages) {
                    if (priceMovePercent >= stage.movePercent) {
                        selectedStage = stage;
                    } else {
                        break;
                    }
                }
                
                if (selectedStage.stopLossPercent >= 0) {
                    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
                } else {
                    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
                }
            }
            
            // 🆕 تابع trailingStop برای استفاده در استراتژی
            function trailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10, useFibonacci = false, highestPivot = null, trendLineAngle = null) {
                if (currentPrice > entryPrice) {
                    let stageStopLoss = calculateStopLossFromStages(entryPrice, currentPrice, stopLossStages);
                    let minStop = Math.max(initialStopLoss, stageStopLoss);

                    if (useFibonacci && highestPivot && trendLineAngle) {
                        if (trendLineAngle >= 270 && trendLineAngle <= 350) {
                            const distanceToPivot = highestPivot - entryPrice;
                            let currentFibLevel = minStop;
                            
                            const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
                            
                            for (const level of fibLevels) {
                                const fibPrice = entryPrice + (distanceToPivot * level);
                                if (currentPrice >= fibPrice) {
                                    currentFibLevel = Math.max(currentFibLevel, fibPrice * 0.99);
                                }
                            }
                            
                            return Math.max(currentFibLevel, minStop);
                        }
                    }
                    
                    const newStop = currentPrice * (1 - trailPercentage / 100);
                    const maxDistance = entryPrice * (maxDistancePercent / 100);
                    const minStop2 = currentPrice - maxDistance;
                    
                    return Math.max(newStop, minStop, minStop2, initialStopLoss);
                }
                return initialStopLoss;
            }
            
            // 🆕 تابع محاسبه زاویه خط برای استراتژی
            function calculateLineAngle(line) {
                if (!line || !line.pivots || line.pivots.length < 2) return 0;
                
                const firstPivot = line.pivots[0];
                const lastPivot = line.pivots[line.pivots.length - 1];
                
                const deltaY = lastPivot.price - firstPivot.price;
                const deltaX = lastPivot.index - firstPivot.index;
                
                if (deltaX === 0) return 90;
                
                const slope = deltaY / deltaX;
                const angleRad = Math.atan(slope);
                const angleDeg = angleRad * (180 / Math.PI);
                
                let normalizedAngle = angleDeg;
                if (normalizedAngle < 0) normalizedAngle += 360;
                
                return normalizedAngle;
            }
            
            ${code}
           return customStrategy(data, index, breakPointsParam, ichimokuParam);
        `);


                    // ترکیب breakPoints اصلی با divergenceSignals
                    const combinedBreakParams = {
                        ...options.breakPoints,
                        divergenceSignals: options.divergenceSignals || []
                    };

                    const signal = strategyFn(marketData, i, combinedBreakParams, ichimoku);

                    // 🔴 هر سیگنال معتبر را ثبت کن، حتی اگر معامله‌ای باز نشود
                    if (signal && signal.lineId) {
                        trendLineBreaks[signal.lineId] = {
                            breakIndex: i,
                            breakPrice: signal.price,
                            breakDistance: signal.breakoutDetails.breakoutDistance,
                            timestamp: marketData[i].timestamp,
                            wasTraded: false // اول فرض کن معامله نشده
                        };
                        console.log(`📝 خط ${signal.lineId} در کندل ${i} ثبت شد`);

                        // حالا اگر معامله باز بود، سیگنال را نادیده بگیر
                        // اما خط همچنان در تاریخچه ثبت شده است
                    }

                    // بعد از این، کد قبلی ادامه دارد...

                    // پردازش پوزیشن‌های فعال
                    for (let j = positions.length - 1; j >= 0; j--) {
                        let position = positions[j];
                        let shouldExit = false;
                        let exitPrice = 0;
                        let exitReason = '';

                        // 1. ابتدا Gap Handling
                        if (settings.handleGaps) {
                            const gapCheck = handleGapExit(position, candle, 'stopLoss');
                            if (gapCheck.shouldExit) {
                                shouldExit = true;
                                exitPrice = gapCheck.exitPrice;
                                exitReason = gapCheck.exitReason;
                            }
                        }

                        // 2. بررسی Stop Loss عادی
                        if (!shouldExit) {
                            if (position.type === 'BUY' && candle.low <= position.stopLoss) {
                                shouldExit = true;
                                exitPrice = position.stopLoss;
                                exitReason = 'Stop Loss';
                            } else if (position.type === 'SELL' && candle.high >= position.stopLoss) {
                                shouldExit = true;
                                exitPrice = position.stopLoss;
                                exitReason = 'Stop Loss';
                            }
                        }

                        // 3. بررسی Take Profit
                        if (!shouldExit && position.takeProfit) {
                            if (position.type === 'BUY' && candle.high >= position.takeProfit) {
                                shouldExit = true;
                                exitPrice = position.takeProfit;
                                exitReason = 'Take Profit';
                            } else if (position.type === 'SELL' && candle.low <= position.takeProfit) {
                                shouldExit = true;
                                exitPrice = position.takeProfit;
                                exitReason = 'Take Profit';
                            }
                        }

                        // 4. به‌روزرسانی حد ضرر پلکانی (فقط اگر معامله نبسته شود)
                        if (!shouldExit) {
                            let newStopLoss = position.stopLoss;
                            let stopLossUpdated = false;

                            // حالت حد ضرر پلکانی
                            if (position.useStagedStopLoss && position.stopLossStages && position.stopLossStages.length > 0) {
                                newStopLoss = stagedStopLoss(
                                    candle.close,
                                    position.entryPrice,
                                    position.initialStopLoss,
                                    position.stopLossStages,
                                    position.type
                                );
                                stopLossUpdated = true;
                            }
                            // حالت تردینگ استاپ
                            else if (position.trailingStop) {
                                newStopLoss = trailingStop(
                                    candle.close,
                                    position.entryPrice,
                                    position.initialStopLoss,
                                    position.trailingPercent,
                                    10,
                                    position.useFibonacci || false,
                                    position.highestPivot || null,
                                    position.trendLineAngle || null,
                                    options.trendLines || {}
                                );
                                stopLossUpdated = true;
                            }

                            if (stopLossUpdated) {
                                if ((position.type === 'BUY' && newStopLoss > position.stopLoss) ||
                                    (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                    position.stopLoss = newStopLoss;
                                    console.log(`🔼 حد ضرر آپدیت شد: ${newStopLoss.toFixed(4)}`);
                                }
                            }
                        }

                        // بستن پوزیشن
                        if (shouldExit) {
                            const profit = position.type === 'BUY'
                                ? (exitPrice - position.entryPrice) * position.size
                                : (position.entryPrice - exitPrice) * position.size;

                            const commissionAmount = position.size * exitPrice * (commission / 100);

                            const grossProfitPercent = position.type === 'BUY'
                                ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                                : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

                            const commissionPercent = (commissionAmount / (position.entryPrice * position.size)) * 100;
                            const netProfitPercent = grossProfitPercent - commissionPercent;

                            capital += profit - commissionAmount;

                            const tradeData = {
                                type: position.type,
                                entryPrice: position.entryPrice,
                                exitPrice: exitPrice,
                                entryTime: position.entryTime,
                                exitTime: candle.timestamp,
                                profit: profit - commissionAmount,
                                grossProfit: profit,
                                profitPercent: netProfitPercent,
                                grossProfitPercent: grossProfitPercent,
                                commissionPercent: commissionPercent,
                                size: position.size,
                                exitReason: exitReason,
                                stopLoss: position.stopLoss,
                                initialStopLoss: position.initialStopLoss,
                                takeProfit: position.takeProfit,
                                trailingStop: position.trailingStop,
                                useFibonacci: position.useFibonacci || false,
                                highestPivot: position.highestPivot || null,
                                trendLineAngle: position.trendLineAngle || null,
                                commission: commissionAmount,
                                entryIndex: position.entryIndex,
                                // 🆕 اطلاعات ایچیموکو
                                ichimoku: position.ichimoku || null,
                                // 🆕 اطلاعات Fixed Risk
                                riskType: 'Fixed',
                                riskAmount: position.riskAmount || 0,
                                riskPercent: position.riskPercent || 0
                            };

                            trades.push(tradeData);
                            tradeCounter++;
                            console.log(`\n📊 معامله ${tradeCounter} (Fixed Risk):`);
                            console.log(`   نوع: ${position.type}`);
                            console.log(`   قیمت ورود: ${position.entryPrice.toFixed(4)}`);
                            console.log(`   قیمت خروج: ${exitPrice.toFixed(4)}`);
                            console.log(`   سود ناخالص: ${grossProfitPercent.toFixed(2)}%`);
                            console.log(`   کارمزد: ${commissionPercent.toFixed(2)}%`);
                            console.log(`   سود خالص: ${netProfitPercent.toFixed(2)}%`);
                            console.log(`   دلیل خروج: ${exitReason}`);
                            console.log(`   ریسک ثابت: $${(position.riskAmount || 0).toFixed(2)} (${position.riskPercent || 0}%)`);

                            if (profit < 0) {
                                dailyLoss += profit;
                            }

                            positions.splice(j, 1);
                        }
                    }

                    // باز کردن پوزیشن جدید با Fixed Risk
                    if (signal && signal.signal) {
                        if (!canOpenNewPosition(positions, signal.price)) {
                            console.log(`⚠️ ورود جدید در قیمت ${signal.price.toFixed(4)} ممنوع است`);
                            continue;
                        }

                        // 🎯 محاسبه Fixed Risk (تغییر اصلی)
                        const riskAmount = initialCapital * (riskPerTrade / 100); // Fixed Risk
                        const positionSize = riskAmount / Math.abs(signal.price - signal.stopLoss);
                        const requiredCapital = positionSize * signal.price * (commission / 100);

                        if (capital >= requiredCapital) {
                            const newPosition = {
                                type: signal.signal,
                                entryPrice: signal.price,
                                entryTime: candle.timestamp,
                                stopLoss: signal.stopLoss,
                                takeProfit: signal.takeProfit,
                                size: positionSize,
                                initialStopLoss: signal.stopLoss,
                                trailingStop: signal.trailingStop || false,
                                trailingPercent: signal.trailingPercent || 2,
                                useFibonacci: signal.useFibonacci || false,
                                highestPivot: signal.highestPivot || null,
                                trendLineAngle: signal.trendLineAngle || null,
                                entryIndex: i,
                                useStagedStopLoss: signal.useStagedStopLoss || false,
                                stopLossStages: signal.stopLossStages || stopLossStages,
                                // 🆕 ذخیره اطلاعات ایچیموکو
                                ichimoku: ichimoku,
                                // 🆕 اطلاعات Fixed Risk
                                riskAmount: riskAmount,
                                riskPercent: riskPerTrade
                            };

                            positions.push(newPosition);
                            capital -= requiredCapital;

                            console.log(`🆕 پوزیشن Fixed Risk:`);
                            console.log(`   نوع: ${signal.signal} | قیمت: ${signal.price.toFixed(4)}`);
                            console.log(`   حجم: ${positionSize.toFixed(6)} | ریسک: $${riskAmount.toFixed(2)} (${riskPerTrade}%)`);
                            console.log(`   فاصله ریسک: ${Math.abs(signal.price - signal.stopLoss).toFixed(4)}`);

                            // لاگ اطلاعات پوزیشن جدید
                            if (signal.useFibonacci) {
                                console.log(`   فیبوناچی: پیوت=${signal.highestPivot}, زاویه=${signal.trendLineAngle}°`);
                            }
                        }
                    }

                } catch (error) {
                    console.error('Error executing strategy at index', i, ':', error);
                }

                // محاسبه equity
                let totalPositionValue = 0;
                positions.forEach(position => {
                    const currentValue = position.type === 'BUY'
                        ? (candle.close - position.entryPrice) * position.size
                        : (position.entryPrice - candle.close) * position.size;
                    totalPositionValue += currentValue;
                });

                equity = capital + totalPositionValue;

                equityData.push({
                    time: candle.timestamp,
                    equity: equity,
                    openPositions: positions.length,
                    capital: capital,
                    riskType: 'Fixed'
                });

                if (onProgress && i % Math.floor(marketData.length / 100) === 0) {
                    onProgress((i / marketData.length) * 100);
                }
            }

            // ==================== سیستم ادامه‌دهی بین فایل‌ها ====================
            if (positions.length > 0 && settings.enableContinuation) {
                console.log('🔄 بررسی فایل‌های بعدی برای ادامه معاملات...');

                // پیدا کردن فایل بعدی
                const nextFile = findNextFileByDate();

                if (nextFile && nextFile.data && nextFile.data.length > 0) {
                    console.log(`📂 ادامه با فایل: ${nextFile.fileName} (${nextFile.data.length} کندل)`);

                    // ادامه معاملات با فایل بعدی
                    const continuationResult = continueOpenTradesWithNextFile(
                        positions,
                        nextFile.data,
                        commission
                    );

                    // اضافه کردن معاملات بسته شده
                    trades.push(...continuationResult.trades);

                    // به‌روزرسانی positions
                    positions = continuationResult.remainingPositions;

                    console.log(`✅ ${continuationResult.trades.length} معامله در فایل بعدی بسته شدند`);
                }
            }

            // ==================== بستن معاملات باقی‌مانده (بدون trailingStop) ====================
            if (positions.length > 0) {
                const lastCandle = marketData[marketData.length - 1];

                console.log(`🔚 بستن ${positions.length} معامله باقی‌مانده در پایان بکتست`);

                positions.forEach((position, index) => {
                    // ❌ هیچ‌گاه از trailingStop یا stagedStopLoss استفاده نکن!
                    // ✅ فقط قیمت واقعی بازار (Close)
                    const exitPrice = lastCandle.close;

                    // محاسبه سود/ضرر واقعی
                    const profit = position.type === 'BUY'
                        ? (exitPrice - position.entryPrice) * position.size
                        : (position.entryPrice - exitPrice) * position.size;

                    const commissionAmount = position.size * exitPrice * (commission / 100);
                    const netProfit = profit - commissionAmount;

                    // دلیل خروج واقعی
                    const exitReason = 'End of backtest (No continuation)';

                    capital += netProfit;

                    const tradeData = {
                        type: position.type,
                        entryPrice: position.entryPrice,
                        exitPrice: exitPrice,
                        entryTime: position.entryTime,
                        exitTime: lastCandle.timestamp,
                        profit: netProfit,
                        size: position.size,
                        exitReason: exitReason,
                        stopLoss: position.stopLoss,
                        takeProfit: position.takeProfit,
                        source: 'forced_close',
                        isForced: true,
                        profitPercent: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
                        commission: commissionAmount,
                        riskType: 'Fixed',
                        riskAmount: position.riskAmount || 0,
                        riskPercent: position.riskPercent || 0
                    };

                    trades.push(tradeData);
                    tradeCounter++;

                    console.log(`   معامله ${index + 1}: ${position.type} ${exitPrice.toFixed(4)} (${tradeData.profitPercent.toFixed(2)}%)`);
                });

                positions = [];
                equity = capital;
            }

            // ==================== گزارش جامع ====================

            const closedTrades = trades;
            const profitableTrades = closedTrades.filter(t => t.profit > 0);
            const losingTrades = closedTrades.filter(t => t.profit < 0);

            // آمار Fixed Risk
            const fixedRiskTrades = closedTrades.filter(t => t.riskType === 'Fixed');
            const fixedRiskProfitable = fixedRiskTrades.filter(t => t.profit > 0);
            const fixedRiskLosing = fixedRiskTrades.filter(t => t.profit < 0);
            const fixedRiskWinRate = fixedRiskTrades.length > 0 ?
                (fixedRiskProfitable.length / fixedRiskTrades.length) * 100 : 0;

            // آمار فیبوناچی
            const fibonacciTrades = closedTrades.filter(t => t.useFibonacci);
            const fibonacciProfitable = fibonacciTrades.filter(t => t.profit > 0);
            const fibonacciLosing = fibonacciTrades.filter(t => t.profit < 0);
            const fibonacciWinRate = fibonacciTrades.length > 0 ?
                (fibonacciProfitable.length / fibonacciTrades.length) * 100 : 0;

            // 🆕 آمار ایچیموکو
            const ichimokuTrades = closedTrades.filter(t => t.ichimoku);
            const ichimokuProfitable = ichimokuTrades.filter(t => t.profit > 0);
            const ichimokuLosing = ichimokuTrades.filter(t => t.profit < 0);
            const ichimokuWinRate = ichimokuTrades.length > 0 ?
                (ichimokuProfitable.length / ichimokuTrades.length) * 100 : 0;

            // محاسبه drawdown
            let maxDrawdown = 0;
            let maxDrawdownTrades = 0;
            let currentDrawdown = 0;
            let currentDrawdownTrades = 0;

            closedTrades.forEach(trade => {
                if (trade.profit < 0) {
                    currentDrawdownTrades++;
                    currentDrawdown += Math.abs(trade.profitPercent);
                } else {
                    if (currentDrawdown > maxDrawdown) {
                        maxDrawdown = currentDrawdown;
                        maxDrawdownTrades = currentDrawdownTrades;
                    }
                    currentDrawdown = 0;
                    currentDrawdownTrades = 0;
                }
            });

            // محاسبه Profit Factor
            const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profit, 0);
            const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
            const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;

            // محاسبه ریسک ثابت
            const fixedRiskAmount = initialCapital * (riskPerTrade / 100);
            const totalRiskExposure = fixedRiskAmount * closedTrades.length;
            const actualAverageRisk = closedTrades.reduce((sum, t) => sum + (t.riskAmount || 0), 0) / closedTrades.length || 0;

            const result = {
                trades: trades,
                finalCapital: capital,
                initialCapital: initialCapital,
                equityData: equityData,
                trendLineBreaks: trendLineBreaks,
                ichimokuSettings: ichimokuSettings,
                statistics: {
                    // 🆕 اطلاعات Fixed Risk
                    riskType: 'Fixed Risk',
                    riskPerTrade: riskPerTrade,
                    fixedRiskAmount: fixedRiskAmount,
                    totalRiskExposure: totalRiskExposure,
                    actualAverageRisk: actualAverageRisk,

                    // آمار کلی
                    totalTrades: closedTrades.length,
                    winningTrades: profitableTrades.length,
                    losingTrades: losingTrades.length,
                    winRate: closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0,

                    // آمار Fixed Risk
                    fixedRiskTrades: fixedRiskTrades.length,
                    fixedRiskWinning: fixedRiskProfitable.length,
                    fixedRiskLosing: fixedRiskLosing.length,
                    fixedRiskWinRate: fixedRiskWinRate,

                    // آمار فیبوناچی
                    fibonacciTrades: fibonacciTrades.length,
                    fibonacciWinning: fibonacciProfitable.length,
                    fibonacciLosing: fibonacciLosing.length,
                    fibonacciWinRate: fibonacciWinRate,

                    // 🆕 آمار ایچیموکو
                    ichimokuTrades: ichimokuTrades.length,
                    ichimokuWinning: ichimokuProfitable.length,
                    ichimokuLosing: ichimokuLosing.length,
                    ichimokuWinRate: ichimokuWinRate,

                    // سود/ضرر
                    totalProfit: totalProfit - totalLoss,
                    grossProfit: totalProfit,
                    grossLoss: totalLoss,

                    // آمار ریسک
                    maxDrawdown: maxDrawdown,
                    maxDrawdownTrades: maxDrawdownTrades,
                    profitFactor: profitFactor,

                    // آمار پوزیشن
                    maxOpenPositions: Math.max(...equityData.map(e => e.openPositions || 0)),
                    avgOpenPositions: equityData.reduce((sum, e) => sum + (e.openPositions || 0), 0) / equityData.length,

                    // 🆕 آمار شکست خطوط روند
                    trendLineBreakCount: Object.keys(trendLineBreaks).length,
                    trendLinesTotal: processedTrendLines.length,

                    // 🆕 آمار سیستم ادامه‌دهی
                    continuedTrades: trades.filter(t => t.source === 'continued').length,
                    forcedCloses: trades.filter(t => t.source === 'forced_close').length,
                    gapTrades: trades.filter(t => t.exitReason && t.exitReason.includes('Gap')).length
                }
            };

            // گزارش جامع در کنسول
            console.log("\n" + "=".repeat(60));
            console.log("📊 گزارش جامع بکتست - Fixed Risk");
            console.log("=".repeat(60));

            console.log("\n🎯 سیستم Fixed Risk:");
            console.log(`├─ ریسک هر معامله: ${riskPerTrade}% سرمایه اولیه`);
            console.log(`├─ مقدار ریسک ثابت: $${fixedRiskAmount.toFixed(2)}`);
            console.log(`├─ مجموع ریسک: $${totalRiskExposure.toFixed(2)} (${closedTrades.length} معامله)`);
            console.log(`└─ میانگین ریسک واقعی: $${actualAverageRisk.toFixed(2)}`);

            console.log("\n📈 آمار معاملات:");
            console.log(`├─ تعداد کل: ${result.statistics.totalTrades}`);
            console.log(`├─ سودده: ${result.statistics.winningTrades} (${result.statistics.winRate.toFixed(2)}%)`);
            console.log(`├─ ضررده: ${result.statistics.losingTrades} (${(100 - result.statistics.winRate).toFixed(2)}%)`);

            console.log("\n⚡ آمار شکست خطوط روند:");
            console.log(`├─ تعداد کل خطوط: ${result.statistics.trendLinesTotal}`);
            console.log(`├─ تعداد شکسته شده: ${result.statistics.trendLineBreakCount}`);
            console.log(`└─ درصد شکست: ${result.statistics.trendLinesTotal > 0 ? (result.statistics.trendLineBreakCount / result.statistics.trendLinesTotal * 100).toFixed(2) : 0}%`);

            console.log("\n🔄 آمار سیستم ادامه‌دهی:");
            console.log(`├─ معاملات ادامه‌یافته: ${result.statistics.continuedTrades}`);
            console.log(`├─ معاملات اجباری: ${result.statistics.forcedCloses}`);
            console.log(`├─ معاملات Gap: ${result.statistics.gapTrades}`);
            console.log(`└─ صرفه‌جویی در بسته شدن: ${result.statistics.continuedTrades > 0 ? '✅' : '❌'}`);

            console.log("\n⚠️ آنالیز ریسک:");
            console.log(`├─ حداکثر افت سرمایه: ${maxDrawdown.toFixed(2)}%`);
            console.log(`├─ بیشترین ضرر متوالی: ${maxDrawdownTrades} معامله`);
            console.log(`├─ Profit Factor: ${profitFactor.toFixed(2)}`);

            console.log("\n" + "=".repeat(60));
            console.log(`💰 سرمایه اولیه: ${initialCapital.toFixed(2)}`);
            console.log(`💰 سرمایه نهایی: ${capital.toFixed(2)}`);
            console.log(`📊 بازدهی کل: ${((capital - initialCapital) / initialCapital * 100).toFixed(2)}%`);
            console.log("=".repeat(60) + "\n");

            resolve(result);

        } catch (error) {
            console.error('❌ [BACKTEST_ERROR] خطا در اجرای بکتست:', error);
            reject(error);
        }
    });
}

// تابع آنالیز استراتژی
async function analyzeStrategy(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            let signalCount = 0;
            let hasStopLoss = false;
            let hasTakeProfit = false;
            let hasTrailingStop = false;
            let hasIchimoku = false;
            const indicators = new Set();

            const indicatorPatterns = [
                /calculateSMA/g,
                /calculateEMA/g,
                /calculateRSI/g,
                /calculateMACD/g,
                /calculateBB/g,
                /getTrendLines/g,
                /trailingStop/g,
                /ichimoku/g,
                /isRealBreakoutWithIchimoku/g
            ];

            indicatorPatterns.forEach(pattern => {
                if (pattern.test(code)) {
                    const indicatorName = pattern.toString().match(/calculate(\w+)|get(\w+)|(\w+Stop)|ichimoku|isRealBreakoutWithIchimoku/)[1] ||
                        pattern.toString().match(/calculate(\w+)|get(\w+)|(\w+Stop)|ichimoku|isRealBreakoutWithIchimoku/)[2] ||
                        pattern.toString().match(/calculate(\w+)|get(\w+)|(\w+Stop)|ichimoku|isRealBreakoutWithIchimoku/)[3];
                    if (indicatorName) {
                        indicators.add(indicatorName);
                        if (indicatorName.includes('ichimoku')) {
                            hasIchimoku = true;
                        }
                    }
                }
            });

            const sampleSize = Math.min(100, marketData.length);
            for (let i = 20; i < sampleSize; i++) {
                try {
                    const ichimoku = options.ichimoku?.enabled ?
                        calculateIchimokuHistorical(marketData, i, options.ichimoku) : null;

                    const strategyFn = new Function('data', 'index', 'ichimokuParam', `
                        function calculateSMA(data, endIndex, period) {
                            let sum = 0;
                            for (let i = 0; i < period; i++) {
                                if (endIndex - i < 0) return null;
                                sum += data[endIndex - i].close;
                            }
                            return sum / period;
                        }
                        
                        function getTrendLines() {
                            return ${JSON.stringify(options.trendLines || {})};
                        }

                        function getSharpTrends() {
    return sharpTrendsParam || [];
}
                        
                        ${code}
                       return customStrategy(data, index, null, ichimokuParam, sharpTrendsParam);
                    `);

                    const signal = strategyFn(marketData, i, ichimoku);

                    if (signal) {
                        signalCount++;
                        if (signal.stopLoss) hasStopLoss = true;
                        if (signal.takeProfit) hasTakeProfit = true;
                        if (signal.trailingStop) hasTrailingStop = true;
                        if (signal.ichimoku) hasIchimoku = true;
                    }

                } catch (error) {
                    // ادامه دادن به آنالیز
                }
            }

            const result = {
                signalCount: signalCount,
                hasStopLoss: hasStopLoss,
                hasTakeProfit: hasTakeProfit,
                hasTrailingStop: hasTrailingStop,
                hasIchimoku: hasIchimoku,
                indicators: Array.from(indicators)
            };

            resolve(result);

        } catch (error) {
            console.error('❌ [ANALYZE_ERROR] خطا در آنالیز استراتژی:', error);
            reject(error);
        }
    });
}

// تابع دیباگ خطوط روند
async function debugTrendLines(marketData, options) {
    return new Promise((resolve) => {
        const debugInfo = {
            marketDataLength: marketData.length,
            options: options,
            pivotPoints: [],
            trendLines: [],
            ichimoku: null
        };

        const pivots = findPivotPoints(marketData, options.pivotPeriod);
        debugInfo.pivotPoints = pivots;

        if (pivots.length >= 2) {
            const currentCandleIndex = marketData.length - 1;
            const sampleLine = createTrendLine(pivots[0], pivots[1], marketData, options, currentCandleIndex);
            if (sampleLine) {
                debugInfo.trendLines.push(sampleLine);
            }
        }

        // 🆕 محاسبه ایچیموکو برای دیباگ
        if (marketData.length > 52) {
            debugInfo.ichimoku = calculateIchimokuHistorical(marketData, marketData.length - 1, options.ichimoku);
        }

        resolve(debugInfo);
    });
}

// ==================== اکسپورت ماژول‌ها ====================
module.exports = {
    runBacktest,
    detectTrendLinesAdvanced,
    analyzeStrategy,
    debugTrendLines
};
