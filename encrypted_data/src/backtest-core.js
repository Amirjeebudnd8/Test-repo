// ==================== backtest-core.js (نسخه کامل برای گیت‌هاب) ====================
// شامل:
// - موتور اصلی بکتست (runBacktest)
// - منطق جلوگیری از معاملات همزمان در محدوده قیمتی (canOpenNewPosition)
// - تریلینگ استاپ پیشرفته با فیبوناچی و زاویه خط روند (trailingStop, calculateLineAngle)
// - مدیریت حد ضرر پلکانی (stagedStopLoss)
// - مدیریت Gap (handleGapExit)
// - ادامه معاملات بین فایل‌ها (findNextFileByDate, continueOpenTradesWithNextFile)
// - توابع کمکی ایچیموکو (در صورت استفاده استراتژی‌های قدیمی)

// ==================== تابع محاسبه زاویه خط روند ====================
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
        let angleDeg = angleRad * (180 / Math.PI);
        if (angleDeg < 0) angleDeg += 360;
        return angleDeg;
    }
    if (line.startIndex !== undefined && line.endIndex !== undefined) {
        const deltaY = line.endPrice - line.startPrice;
        const deltaX = line.endIndex - line.startIndex;
        if (deltaX === 0) return 90;
        const slope = deltaY / deltaX;
        const angleRad = Math.atan(slope);
        let angleDeg = angleRad * (180 / Math.PI);
        if (angleDeg < 0) angleDeg += 360;
        return angleDeg;
    }
    return 0;
}

// ==================== محاسبه حد ضرر از مراحل پلکانی ====================
function calculateStopLossFromStages(entryPrice, currentPrice, stages) {
    if (!stages || stages.length === 0) return entryPrice;
    if (currentPrice <= entryPrice) {
        return entryPrice * (1 + stages[0].stopLossPercent / 100);
    }
    const priceMovePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    let selectedStage = stages[0];
    for (const stage of stages) {
        if (priceMovePercent >= stage.movePercent) selectedStage = stage;
        else break;
    }
    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
}

// ==================== تریلینگ استاپ پیشرفته (با فیبوناچی و زاویه) ====================
function advancedTrailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10, useFibonacci = false, highestPivot = null, trendLineAngle = null, allTrendLines = {}, stopLossStages = null) {
    if (currentPrice > entryPrice) {
        let minStop = initialStopLoss;
        if (stopLossStages && stopLossStages.length > 0) {
            const stageStopLoss = calculateStopLossFromStages(entryPrice, currentPrice, stopLossStages);
            minStop = Math.max(initialStopLoss, stageStopLoss);
        }
        if (useFibonacci && highestPivot && trendLineAngle !== null) {
            if (trendLineAngle >= 270 && trendLineAngle <= 350) {
                const distanceToPivot = highestPivot - entryPrice;
                let currentFibLevel = minStop;
                const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
                for (const level of fibLevels) {
                    const fibPrice = entryPrice + distanceToPivot * level;
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
                        if (Array.isArray(lines)) trendLinesArray.push(...lines);
                    });
                    const suitablePreviousLines = trendLinesArray.filter(line => {
                        const angle = calculateLineAngle(line);
                        return angle >= 270 && angle <= 350;
                    });
                    if (suitablePreviousLines.length > 0) {
                        const previousLine = suitablePreviousLines[suitablePreviousLines.length - 1];
                        const previousPivot = previousLine.pivots && previousLine.pivots[0] ? previousLine.pivots[0].price : (previousLine.startPrice > previousLine.endPrice ? previousLine.startPrice : previousLine.endPrice);
                        if (previousPivot) {
                            const distanceToPreviousPivot = previousPivot - entryPrice;
                            let currentFibLevel = minStop;
                            const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
                            for (const level of fibLevels) {
                                const fibPrice = entryPrice + distanceToPreviousPivot * level;
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
        const newStop = currentPrice * (1 - trailPercentage / 100);
        const maxDistance = entryPrice * (maxDistancePercent / 100);
        const minStop2 = currentPrice - maxDistance;
        return Math.max(newStop, minStop, minStop2, initialStopLoss);
    }
    return initialStopLoss;
}

// ==================== تابع جلوگیری از ورود همزمان در محدوده قیمتی ====================
function canOpenNewPosition(positions, newEntryPrice) {
    const tolerance = 0.005; // 0.5%
    const positionsInZone = positions.filter(pos => {
        const diff = Math.abs(pos.entryPrice - newEntryPrice) / pos.entryPrice;
        return diff <= tolerance;
    });
    if (positionsInZone.length === 0) return true;
    // فقط اگر همه معاملات در این محدوده در سود باشند (stopLoss > entryPrice برای BUY، stopLoss < entryPrice برای SELL)
    return positionsInZone.every(pos => {
        if (pos.type === 'BUY') return pos.stopLoss > pos.entryPrice;
        else return pos.stopLoss < pos.entryPrice;
    });
}

// ==================== توابع Gap Handling و ادامه معاملات بین فایل‌ها ====================
function handleGapExit(position, candle, exitType) {
    let shouldExit = false;
    let exitPrice = 0;
    let exitReason = '';
    if (position.type === 'BUY') {
        if (exitType === 'stopLoss' && candle.open <= position.stopLoss) {
            shouldExit = true;
            exitPrice = candle.open;
            exitReason = 'Stop Loss (Gap)';
        } else if (exitType === 'takeProfit' && candle.open >= position.takeProfit) {
            shouldExit = true;
            exitPrice = candle.open;
            exitReason = 'Take Profit (Gap)';
        }
    } else {
        if (exitType === 'stopLoss' && candle.open >= position.stopLoss) {
            shouldExit = true;
            exitPrice = candle.open;
            exitReason = 'Stop Loss (Gap)';
        } else if (exitType === 'takeProfit' && candle.open <= position.takeProfit) {
            shouldExit = true;
            exitPrice = candle.open;
            exitReason = 'Take Profit (Gap)';
        }
    }
    return { shouldExit, exitPrice, exitReason };
}

function findNextFileByDate(marketData, settings) {
    if (!marketData || marketData.length === 0) return null;
    const lastCandle = marketData[marketData.length - 1];
    const lastDate = new Date(lastCandle.timestamp);
    const allFiles = { ...settings.uploadedFiles, ...settings.combinedFiles };
    let nextFile = null;
    let smallestGap = Infinity;
    Object.values(allFiles).forEach(fileInfo => {
        if (!fileInfo.data || fileInfo.data.length === 0) return;
        const firstDate = new Date(fileInfo.data[0].timestamp);
        const timeGap = firstDate - lastDate;
        if (timeGap > 0 && timeGap < smallestGap) {
            const maxGap = 2 * 24 * 60 * 60 * 1000;
            if (timeGap <= maxGap) {
                smallestGap = timeGap;
                nextFile = fileInfo;
            }
        }
    });
    return nextFile;
}

function continueOpenTradesWithNextFile(openPositions, nextFileData, commission, settings, stopLossStages) {
    if (!openPositions || openPositions.length === 0) return { trades: [], remainingPositions: [] };
    if (!nextFileData || nextFileData.length === 0) return { trades: [], remainingPositions: openPositions };
    const closedTrades = [];
    const remainingPositions = [...openPositions];
    for (let i = 0; i < nextFileData.length; i++) {
        const candle = nextFileData[i];
        for (let j = remainingPositions.length - 1; j >= 0; j--) {
            const position = remainingPositions[j];
            let shouldExit = false;
            let exitPrice = 0;
            let exitReason = '';
            if (settings.handleGaps) {
                const gapCheck = handleGapExit(position, candle, 'stopLoss');
                if (gapCheck.shouldExit) {
                    shouldExit = true;
                    exitPrice = gapCheck.exitPrice;
                    exitReason = gapCheck.exitReason;
                }
            }
            if (!shouldExit && position.type === 'BUY' && candle.low <= position.stopLoss) {
                shouldExit = true;
                exitPrice = position.stopLoss;
                exitReason = 'Stop Loss (Continued)';
            }
            if (!shouldExit && position.type === 'SELL' && candle.high >= position.stopLoss) {
                shouldExit = true;
                exitPrice = position.stopLoss;
                exitReason = 'Stop Loss (Continued)';
            }
            if (!shouldExit && position.takeProfit && position.type === 'BUY' && candle.high >= position.takeProfit) {
                shouldExit = true;
                exitPrice = position.takeProfit;
                exitReason = 'Take Profit (Continued)';
            }
            if (!shouldExit && position.takeProfit && position.type === 'SELL' && candle.low <= position.takeProfit) {
                shouldExit = true;
                exitPrice = position.takeProfit;
                exitReason = 'Take Profit (Continued)';
            }
            if (!shouldExit && position.useStagedStopLoss && position.stopLossStages && position.stopLossStages.length > 0) {
                const newStopLoss = stagedStopLoss(candle.close, position.entryPrice, position.initialStopLoss, position.stopLossStages, position.type);
                if (position.type === 'BUY' && newStopLoss > position.stopLoss) position.stopLoss = newStopLoss;
                if (position.type === 'SELL' && newStopLoss < position.stopLoss) position.stopLoss = newStopLoss;
            }
            if (shouldExit) {
                const profit = position.type === 'BUY' ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
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
            }
        }
        if (remainingPositions.length === 0) break;
    }
    return { trades: closedTrades, remainingPositions: remainingPositions };
}

// ==================== موتور اصلی بکتست (runBacktest) ====================
async function runBacktest(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            // تنظیمات ادامه‌دهی
            const settings = {
                enableContinuation: options.enableContinuation !== false,
                maxContinuationFiles: options.maxContinuationFiles || 3,
                handleGaps: options.handleGaps !== false,
                useStagedStopLoss: options.useStagedStopLoss !== false,
                uploadedFiles: options.uploadedFiles || {},
                combinedFiles: options.combinedFiles || {},
                fileName: options.fileName || 'unknown'
            };

            // مراحل حد ضرر پلکانی
            const stopLossStages = [
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
            ];

            function stagedStopLoss(currentPrice, entryPrice, initialStopLoss, stages, positionType) {
                if (!stages || stages.length === 0) return initialStopLoss;
                const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                if (profitPercent < stages[0].movePercent) return initialStopLoss;
                let selectedStage = stages[0];
                for (let i = stages.length - 1; i >= 0; i--) {
                    if (profitPercent >= stages[i].movePercent) {
                        selectedStage = stages[i];
                        break;
                    }
                }
                let newStopLoss;
                if (positionType === 'BUY') {
                    newStopLoss = entryPrice * (1 + selectedStage.stopLossPercent / 100);
                    newStopLoss = Math.min(newStopLoss, currentPrice * 0.999);
                    newStopLoss = Math.max(newStopLoss, initialStopLoss);
                } else {
                    newStopLoss = entryPrice * (1 - selectedStage.stopLossPercent / 100);
                    newStopLoss = Math.max(newStopLoss, currentPrice * 1.001);
                    newStopLoss = Math.min(newStopLoss, initialStopLoss);
                }
                return newStopLoss;
            }

            // تابع ساده تریلینگ (برای زمانی که فیبوناچی فعال نباشد)
            function simpleTrailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10) {
                if (currentPrice > entryPrice) {
                    const newStop = currentPrice * (1 - trailPercentage / 100);
                    const maxDistance = entryPrice * (maxDistancePercent / 100);
                    const minStop = currentPrice - maxDistance;
                    return Math.max(newStop, initialStopLoss, minStop);
                }
                return initialStopLoss;
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
            console.log(`📊 سرمایه اولیه: ${initialCapital}, ریسک هر معامله: ${riskPerTrade}%, کارمزد: ${commission}%`);
            console.log(`📈 تعداد کندل‌ها: ${marketData.length}`);
            console.log(`🎯 سیستم مدیریت ریسک فعال - ریسک ثابت: $${(initialCapital * (riskPerTrade / 100)).toFixed(2)} هر معامله`);

            // تابع استراتژی (با پشتیبانی از پارامترهای اضافی)
            const strategyFn = new Function('data', 'index', 'breakPointsParam', 'ichimokuParam', 'sharpTrendsParam', `
                ${code}
                return customStrategy(data, index, breakPointsParam, ichimokuParam, sharpTrendsParam);
            `);

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

                try {
                    const breakPointsData = options.breakPoints || {};
                    const ichimokuParam = options.ichimoku || null;
                    const sharpTrendsParam = options.sharpTrends || [];
                    const signal = strategyFn(marketData, i, breakPointsData, ichimokuParam, sharpTrendsParam);

                    // مدیریت پوزیشن‌های فعال (خروج)
                    for (let j = positions.length - 1; j >= 0; j--) {
                        let position = positions[j];
                        let shouldExit = false;
                        let exitPrice = 0;
                        let exitReason = '';

                        if (settings.handleGaps) {
                            const gapCheck = handleGapExit(position, candle, 'stopLoss');
                            if (gapCheck.shouldExit) {
                                shouldExit = true;
                                exitPrice = gapCheck.exitPrice;
                                exitReason = gapCheck.exitReason;
                            }
                        }
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
                        if (!shouldExit) {
                            if (position.useStagedStopLoss && position.stopLossStages && position.stopLossStages.length > 0) {
                                const newStopLoss = stagedStopLoss(candle.close, position.entryPrice, position.initialStopLoss, position.stopLossStages, position.type);
                                if ((position.type === 'BUY' && newStopLoss > position.stopLoss) || (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                    position.stopLoss = newStopLoss;
                                }
                            } else if (position.trailingStop) {
                                let newStopLoss;
                                if (position.useFibonacci && position.highestPivot !== null && position.trendLineAngle !== null) {
                                    newStopLoss = advancedTrailingStop(
                                        candle.close, position.entryPrice, position.initialStopLoss,
                                        position.trailingPercent, 10, true, position.highestPivot,
                                        position.trendLineAngle, options.trendLines || {}, position.stopLossStages || stopLossStages
                                    );
                                } else {
                                    newStopLoss = simpleTrailingStop(candle.close, position.entryPrice, position.initialStopLoss, position.trailingPercent, 10);
                                }
                                if ((position.type === 'BUY' && newStopLoss > position.stopLoss) || (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                    position.stopLoss = newStopLoss;
                                }
                            }
                        }
                        if (shouldExit) {
                            const profit = position.type === 'BUY' ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
                            const commissionAmount = position.size * exitPrice * (commission / 100);
                            const netProfit = profit - commissionAmount;
                            const grossProfitPercent = position.type === 'BUY' ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100 : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
                            const commissionPercent = (commissionAmount / (position.entryPrice * position.size)) * 100;
                            const netProfitPercent = grossProfitPercent - commissionPercent;
                            capital += netProfit;
                            const tradeData = {
                                type: position.type, entryPrice: position.entryPrice, exitPrice: exitPrice,
                                entryTime: position.entryTime, exitTime: candle.timestamp, profit: netProfit,
                                grossProfit: profit, profitPercent: netProfitPercent, grossProfitPercent: grossProfitPercent,
                                commissionPercent: commissionPercent, size: position.size, exitReason: exitReason,
                                stopLoss: position.stopLoss, initialStopLoss: position.initialStopLoss,
                                takeProfit: position.takeProfit, trailingStop: position.trailingStop,
                                useFibonacci: position.useFibonacci || false, highestPivot: position.highestPivot || null,
                                trendLineAngle: position.trendLineAngle || null, commission: commissionAmount,
                                entryIndex: position.entryIndex, riskType: 'Fixed',
                                riskAmount: position.riskAmount || 0, riskPercent: position.riskPercent || 0
                            };
                            trades.push(tradeData);
                            tradeCounter++;
                            if (profit < 0) dailyLoss += profit;
                            positions.splice(j, 1);
                        }
                    }

                    // باز کردن پوزیشن جدید با استفاده از منطق canOpenNewPosition
                    if (signal && signal.signal) {
                        if (!canOpenNewPosition(positions, signal.price)) {
                            console.log(`⚠️ ورود جدید در قیمت ${signal.price.toFixed(4)} ممنوع است (معامله باز دیگر در همین محدوده در ضرر است)`);
                            continue;
                        }
                        const riskAmount = initialCapital * (riskPerTrade / 100);
                        const positionSize = riskAmount / Math.abs(signal.price - signal.stopLoss);
                        const requiredCapital = positionSize * signal.price * (commission / 100);
                        if (capital >= requiredCapital) {
                            const newPosition = {
                                type: signal.signal, entryPrice: signal.price, entryTime: candle.timestamp,
                                stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, size: positionSize,
                                initialStopLoss: signal.stopLoss, trailingStop: signal.trailingStop || false,
                                trailingPercent: signal.trailingPercent || 2, useFibonacci: signal.useFibonacci || false,
                                highestPivot: signal.highestPivot || null, trendLineAngle: signal.trendLineAngle || null,
                                entryIndex: i, useStagedStopLoss: signal.useStagedStopLoss || false,
                                stopLossStages: signal.stopLossStages || stopLossStages, riskAmount: riskAmount,
                                riskPercent: riskPerTrade
                            };
                            positions.push(newPosition);
                            capital -= requiredCapital;
                            console.log(`🆕 پوزیشن ${signal.signal} در قیمت ${signal.price.toFixed(4)} با حد ضرر ${signal.stopLoss.toFixed(4)}`);
                        }
                    }
                } catch (error) {
                    console.error('Error executing strategy at index', i, ':', error);
                }

                // محاسبه equity
                let totalPositionValue = 0;
                positions.forEach(position => {
                    const currentValue = position.type === 'BUY' ? (candle.close - position.entryPrice) * position.size : (position.entryPrice - candle.close) * position.size;
                    totalPositionValue += currentValue;
                });
                equity = capital + totalPositionValue;
                equityData.push({ time: candle.timestamp, equity: equity, openPositions: positions.length, capital: capital, riskType: 'Fixed' });
                if (onProgress && i % Math.floor(marketData.length / 100) === 0) onProgress((i / marketData.length) * 100);
            }

            // ادامه معاملات بین فایل‌ها
            if (positions.length > 0 && settings.enableContinuation) {
                const nextFile = findNextFileByDate(marketData, settings);
                if (nextFile && nextFile.data && nextFile.data.length > 0) {
                    const continuationResult = continueOpenTradesWithNextFile(positions, nextFile.data, commission, settings, stopLossStages);
                    trades.push(...continuationResult.trades);
                    positions = continuationResult.remainingPositions;
                }
            }

            // بستن معاملات باقی‌مانده در پایان
            if (positions.length > 0) {
                const lastCandle = marketData[marketData.length - 1];
                positions.forEach(position => {
                    const exitPrice = lastCandle.close;
                    const profit = position.type === 'BUY' ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
                    const commissionAmount = position.size * exitPrice * (commission / 100);
                    const netProfit = profit - commissionAmount;
                    capital += netProfit;
                    const tradeData = {
                        type: position.type, entryPrice: position.entryPrice, exitPrice: exitPrice,
                        entryTime: position.entryTime, exitTime: lastCandle.timestamp, profit: netProfit,
                        size: position.size, exitReason: 'End of backtest (No continuation)',
                        stopLoss: position.stopLoss, takeProfit: position.takeProfit, source: 'forced_close',
                        isForced: true, profitPercent: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
                        commission: commissionAmount, riskType: 'Fixed', riskAmount: position.riskAmount || 0,
                        riskPercent: position.riskPercent || 0
                    };
                    trades.push(tradeData);
                    tradeCounter++;
                });
                positions = [];
                equity = capital;
            }

            // آمار ساده (بقیه آمار در run-backtest.js محاسبه می‌شود)
            const result = {
                trades: trades,
                finalCapital: capital,
                initialCapital: initialCapital,
                equityData: equityData,
                statistics: { totalTrades: trades.length, winningTrades: trades.filter(t => t.profit > 0).length, losingTrades: trades.filter(t => t.profit < 0).length }
            };
            resolve(result);
        } catch (error) {
            console.error('❌ [BACKTEST_ERROR] خطا در اجرای بکتست:', error);
            reject(error);
        }
    });
}

// ==================== اکسپورت ماژول‌ها ====================
module.exports = { runBacktest };
