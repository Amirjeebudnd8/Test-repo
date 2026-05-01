// ==================== تابع اصلی بکتست (بدون محاسبات اضافی) ====================

async function runBacktest(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            // تنظیمات ادامه‌دهی بین فایل‌ها (در صورت نیاز)
            const settings = {
                enableContinuation: options.enableContinuation !== false,
                maxContinuationFiles: options.maxContinuationFiles || 3,
                handleGaps: options.handleGaps !== false,
                useStagedStopLoss: options.useStagedStopLoss !== false,
                uploadedFiles: options.uploadedFiles || {},
                combinedFiles: options.combinedFiles || {},
                fileName: options.fileName || 'unknown'
            };

            // ==================== مراحل حد ضرر پلکانی ====================
            const stopLossStages = [
                { movePercent: 0.75, stopLossPercent: 0.10 },
                { movePercent: 1.5, stopLossPercent: 0.75 },
                { movePercent: 2.5, stopLossPercent: 1.5 },
                { movePercent: 3.5, stopLossPercent: 2.75 },
                { movePercent: 4.5, stopLossPercent: 3.75 }
            ];

            // حد ضرر پلکانی
            function stagedStopLoss(currentPrice, entryPrice, initialStopLoss, stages, positionType) {
                if (!stages || stages.length === 0) {
                    return initialStopLoss;
                }
                const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                if (profitPercent < stages[0].movePercent) {
                    return initialStopLoss;
                }
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

            // Gap Handling
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

            // پیدا کردن فایل بعدی بر اساس تاریخ
            function findNextFileByDate() {
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

            // ادامه معاملات با فایل بعدی
            function continueOpenTradesWithNextFile(openPositions, nextFileData, commission) {
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
                        if (!shouldExit && position.takeProfit && position.type === 'BUY' && candle.high >= position.takeProfit) {
                            shouldExit = true;
                            exitPrice = position.takeProfit;
                            exitReason = 'Take Profit (Continued)';
                        }
                        if (!shouldExit && position.useStagedStopLoss) {
                            const newStopLoss = stagedStopLoss(
                                candle.close, position.entryPrice, position.initialStopLoss,
                                position.stopLossStages || stopLossStages, position.type
                            );
                            if (position.type === 'BUY' && newStopLoss > position.stopLoss) {
                                position.stopLoss = newStopLoss;
                            }
                        }
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
                                continuedFile: 'next_file'
                            };
                            closedTrades.push(tradeData);
                            remainingPositions.splice(j, 1);
                        }
                    }
                    if (remainingPositions.length === 0) break;
                }
                return { trades: closedTrades, remainingPositions: remainingPositions };
            }

            // محاسبه trailing stop
            function trailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10) {
                if (currentPrice > entryPrice) {
                    const newStop = currentPrice * (1 - trailPercentage / 100);
                    const maxDistance = entryPrice * (maxDistancePercent / 100);
                    const minStop = currentPrice - maxDistance;
                    return Math.max(newStop, initialStopLoss, minStop);
                }
                return initialStopLoss;
            }

            // بررسی امکان باز کردن معامله جدید (جلوگیری از ورود همزمان در قیمت نزدیک)
            function canOpenNewPosition(positions, newEntryPrice) {
                const tolerance = 0.005;
                const positionsInZone = positions.filter(pos => {
                    const diff = Math.abs(pos.entryPrice - newEntryPrice) / pos.entryPrice;
                    return diff <= tolerance;
                });
                if (positionsInZone.length === 0) return true;
                return positionsInZone.every(pos => pos.stopLoss > pos.entryPrice);
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
            console.log(`🎯 سیستم Fixed Risk فعال - ریسک ثابت: $${(initialCapital * (riskPerTrade / 100)).toFixed(2)} هر معامله`);

            // تابع استراتژی (فقط با دو پارامتر data و index)
            const strategyFn = new Function('data', 'index', `
                ${code}
                return customStrategy(data, index);
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
                    const signal = strategyFn(marketData, i);

                    // مدیریت پوزیشن‌های فعال
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
                                const newStopLoss = stagedStopLoss(
                                    candle.close, position.entryPrice, position.initialStopLoss,
                                    position.stopLossStages, position.type
                                );
                                if ((position.type === 'BUY' && newStopLoss > position.stopLoss) ||
                                    (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                    position.stopLoss = newStopLoss;
                                }
                            } else if (position.trailingStop) {
                                const newStopLoss = trailingStop(
                                    candle.close, position.entryPrice, position.initialStopLoss,
                                    position.trailingPercent, 10
                                );
                                if ((position.type === 'BUY' && newStopLoss > position.stopLoss) ||
                                    (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                    position.stopLoss = newStopLoss;
                                }
                            }
                        }
                        if (shouldExit) {
                            const profit = position.type === 'BUY'
                                ? (exitPrice - position.entryPrice) * position.size
                                : (position.entryPrice - exitPrice) * position.size;
                            const commissionAmount = position.size * exitPrice * (commission / 100);
                            const netProfit = profit - commissionAmount;
                            const grossProfitPercent = position.type === 'BUY'
                                ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                                : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
                            const commissionPercent = (commissionAmount / (position.entryPrice * position.size)) * 100;
                            const netProfitPercent = grossProfitPercent - commissionPercent;

                            capital += netProfit;
                            const tradeData = {
                                type: position.type,
                                entryPrice: position.entryPrice,
                                exitPrice: exitPrice,
                                entryTime: position.entryTime,
                                exitTime: candle.timestamp,
                                profit: netProfit,
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
                                commission: commissionAmount,
                                entryIndex: position.entryIndex,
                                riskType: 'Fixed',
                                riskAmount: position.riskAmount || 0,
                                riskPercent: position.riskPercent || 0
                            };
                            trades.push(tradeData);
                            tradeCounter++;
                            if (profit < 0) dailyLoss += profit;
                            positions.splice(j, 1);
                        }
                    }

                    // باز کردن پوزیشن جدید
                    if (signal && signal.signal) {
                        if (!canOpenNewPosition(positions, signal.price)) {
                            continue;
                        }
                        const riskAmount = initialCapital * (riskPerTrade / 100);
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
                                useStagedStopLoss: signal.useStagedStopLoss || false,
                                stopLossStages: signal.stopLossStages || stopLossStages,
                                entryIndex: i,
                                riskAmount: riskAmount,
                                riskPercent: riskPerTrade
                            };
                            positions.push(newPosition);
                            capital -= requiredCapital;
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

            // سیستم ادامه‌دهی بین فایل‌ها
            if (positions.length > 0 && settings.enableContinuation) {
                const nextFile = findNextFileByDate();
                if (nextFile && nextFile.data && nextFile.data.length > 0) {
                    const continuationResult = continueOpenTradesWithNextFile(positions, nextFile.data, commission);
                    trades.push(...continuationResult.trades);
                    positions = continuationResult.remainingPositions;
                }
            }

            // بستن معاملات باقی‌مانده در پایان
            if (positions.length > 0) {
                const lastCandle = marketData[marketData.length - 1];
                positions.forEach((position, idx) => {
                    const exitPrice = lastCandle.close;
                    const profit = position.type === 'BUY'
                        ? (exitPrice - position.entryPrice) * position.size
                        : (position.entryPrice - exitPrice) * position.size;
                    const commissionAmount = position.size * exitPrice * (commission / 100);
                    const netProfit = profit - commissionAmount;
                    capital += netProfit;
                    const tradeData = {
                        type: position.type,
                        entryPrice: position.entryPrice,
                        exitPrice: exitPrice,
                        entryTime: position.entryTime,
                        exitTime: lastCandle.timestamp,
                        profit: netProfit,
                        size: position.size,
                        exitReason: 'End of backtest (No continuation)',
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
                });
                positions = [];
                equity = capital;
            }

            const closedTrades = trades;
            const profitableTrades = closedTrades.filter(t => t.profit > 0);
            const losingTrades = closedTrades.filter(t => t.profit < 0);
            const fixedRiskTrades = closedTrades.filter(t => t.riskType === 'Fixed');
            const fixedRiskProfitable = fixedRiskTrades.filter(t => t.profit > 0);
            const fixedRiskLosing = fixedRiskTrades.filter(t => t.profit < 0);
            const fixedRiskWinRate = fixedRiskTrades.length ? (fixedRiskProfitable.length / fixedRiskTrades.length) * 100 : 0;
            const fibonacciTrades = closedTrades.filter(t => t.useFibonacci);
            const fibonacciProfitable = fibonacciTrades.filter(t => t.profit > 0);
            const fibonacciLosing = fibonacciTrades.filter(t => t.profit < 0);
            const fibonacciWinRate = fibonacciTrades.length ? (fibonacciProfitable.length / fibonacciTrades.length) * 100 : 0;

            let maxDrawdown = 0;
            let currentDrawdown = 0;
            let currentDrawdownTrades = 0;
            let maxDrawdownTrades = 0;
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
            const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profit, 0);
            const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
            const profitFactor = totalLoss ? totalProfit / totalLoss : 0;
            const fixedRiskAmount = initialCapital * (riskPerTrade / 100);
            const totalRiskExposure = fixedRiskAmount * closedTrades.length;
            const actualAverageRisk = closedTrades.reduce((sum, t) => sum + (t.riskAmount || 0), 0) / closedTrades.length || 0;

            const result = {
                trades: trades,
                finalCapital: capital,
                initialCapital: initialCapital,
                equityData: equityData,
                statistics: {
                    riskType: 'Fixed Risk',
                    riskPerTrade: riskPerTrade,
                    fixedRiskAmount: fixedRiskAmount,
                    totalRiskExposure: totalRiskExposure,
                    actualAverageRisk: actualAverageRisk,
                    totalTrades: closedTrades.length,
                    winningTrades: profitableTrades.length,
                    losingTrades: losingTrades.length,
                    winRate: closedTrades.length ? (profitableTrades.length / closedTrades.length) * 100 : 0,
                    fixedRiskTrades: fixedRiskTrades.length,
                    fixedRiskWinning: fixedRiskProfitable.length,
                    fixedRiskLosing: fixedRiskLosing.length,
                    fixedRiskWinRate: fixedRiskWinRate,
                    fibonacciTrades: fibonacciTrades.length,
                    fibonacciWinning: fibonacciProfitable.length,
                    fibonacciLosing: fibonacciLosing.length,
                    fibonacciWinRate: fibonacciWinRate,
                    totalProfit: totalProfit - totalLoss,
                    grossProfit: totalProfit,
                    grossLoss: totalLoss,
                    maxDrawdown: maxDrawdown,
                    maxDrawdownTrades: maxDrawdownTrades,
                    profitFactor: profitFactor,
                    maxOpenPositions: Math.max(...equityData.map(e => e.openPositions || 0)),
                    avgOpenPositions: equityData.reduce((sum, e) => sum + (e.openPositions || 0), 0) / equityData.length,
                    continuedTrades: trades.filter(t => t.source === 'continued').length,
                    forcedCloses: trades.filter(t => t.source === 'forced_close').length,
                    gapTrades: trades.filter(t => t.exitReason && t.exitReason.includes('Gap')).length
                }
            };

            console.log("\n" + "=".repeat(60));
            console.log("📊 گزارش جامع بکتست - Fixed Risk");
            console.log("=".repeat(60));
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

module.exports = { runBacktest };
