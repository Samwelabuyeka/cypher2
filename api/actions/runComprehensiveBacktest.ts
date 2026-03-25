import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info({ params }, "Starting comprehensive backtest");

  const {
    strategyId,
    startDate,
    endDate,
    initialCapital,
    symbols,
    timeframe,
    slippageModel,
    commissionRate,
    benchmarkSymbol,
  } = params;

  // Fetch strategy configuration
  const strategy = await api.strategy.findOne(strategyId, {
    select: {
      id: true,
      name: true,
      type: true,
      parameters: true,
      assets: true,
      userId: true,
    },
  });

  if (!strategy) {
    throw new Error(`Strategy with id ${strategyId} not found`);
  }

  // Determine symbols to backtest
  const tradingSymbols = symbols && symbols.length > 0 ? symbols : (strategy.assets as string[]) || [];
  
  if (tradingSymbols.length === 0) {
    throw new Error("No trading symbols specified");
  }

  logger.info({ symbols: tradingSymbols, timeframe }, "Fetching historical market data");

  // Fetch historical market data for all symbols
  const marketDataPromises = tradingSymbols.map(symbol =>
    api.marketData.findMany({
      filter: {
        symbol: { equals: symbol },
        interval: { equals: timeframe },
        timestamp: {
          greaterThanOrEqual: new Date(startDate),
          lessThanOrEqual: new Date(endDate),
        },
      },
      sort: { timestamp: "Ascending" },
      first: 250,
      select: {
        id: true,
        symbol: true,
        timestamp: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
      },
    })
  );

  const marketDataResults = await Promise.all(marketDataPromises);
  const marketDataBySymbol = Object.fromEntries(
    tradingSymbols.map((symbol, idx) => [symbol, marketDataResults[idx]])
  );

  // Fetch benchmark data if specified
  let benchmarkData = null;
  if (benchmarkSymbol) {
    const benchmarkResult = await api.marketData.findMany({
      filter: {
        symbol: { equals: benchmarkSymbol },
        interval: { equals: timeframe },
        timestamp: {
          greaterThanOrEqual: new Date(startDate),
          lessThanOrEqual: new Date(endDate),
        },
      },
      sort: { timestamp: "Ascending" },
      first: 250,
      select: {
        timestamp: true,
        close: true,
      },
    });
    benchmarkData = benchmarkResult;
  }

  // Initialize backtesting state
  let portfolioValue = initialCapital;
  let cash = initialCapital;
  const positions: Record<string, { quantity: number; avgPrice: number }> = {};
  const equityCurve: Array<{ timestamp: Date; value: number }> = [];
  const trades: Array<any> = [];
  let maxPortfolioValue = initialCapital;
  let maxDrawdown = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  // Calculate slippage based on model
  const calculateSlippage = (price: number, volume: number): number => {
    switch (slippageModel) {
      case "fixed":
        return price * 0.0005; // 0.05% fixed slippage
      case "volumeBased":
        return price * Math.min(0.002, 1 / Math.sqrt(volume)); // Volume-dependent
      case "realistic":
        return price * (0.0003 + Math.random() * 0.0004); // 0.03-0.07% random
      default:
        return 0;
    }
  };

  // Get all unique timestamps across all symbols
  const allTimestamps = new Set<number>();
  Object.values(marketDataBySymbol).forEach(data => {
    data.forEach(candle => {
      allTimestamps.add(new Date(candle.timestamp).getTime());
    });
  });
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  logger.info({ timestampCount: sortedTimestamps.length }, "Running backtest simulation");

  // Iterate through time chronologically
  for (const timestamp of sortedTimestamps) {
    const currentDate = new Date(timestamp);
    const currentPrices: Record<string, number> = {};

    // Get current prices for all symbols
    for (const symbol of tradingSymbols) {
      const candle = marketDataBySymbol[symbol].find(
        c => new Date(c.timestamp).getTime() === timestamp
      );
      if (candle) {
        currentPrices[symbol] = candle.close;
      }
    }

    // Generate trading signals based on strategy type
    // This is a simplified signal generation - in production, this would use the actual strategy logic
    const signals: Record<string, "buy" | "sell" | "hold"> = {};
    
    for (const symbol of tradingSymbols) {
      if (!currentPrices[symbol]) continue;

      const historicalData = marketDataBySymbol[symbol].filter(
        c => new Date(c.timestamp).getTime() <= timestamp
      );

      if (historicalData.length < 20) {
        signals[symbol] = "hold";
        continue;
      }

      // Simple moving average crossover strategy as example
      const recentPrices = historicalData.slice(-20).map(c => c.close);
      const sma20 = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
      const sma10 = recentPrices.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const currentPrice = currentPrices[symbol];

      if (sma10 > sma20 && !positions[symbol]) {
        signals[symbol] = "buy";
      } else if (sma10 < sma20 && positions[symbol]) {
        signals[symbol] = "sell";
      } else {
        signals[symbol] = "hold";
      }
    }

    // Execute trades based on signals
    for (const [symbol, signal] of Object.entries(signals)) {
      const price = currentPrices[symbol];
      if (!price) continue;

      const candle = marketDataBySymbol[symbol].find(
        c => new Date(c.timestamp).getTime() === timestamp
      );
      const volume = candle?.volume || 1000000;
      const slippage = calculateSlippage(price, volume);

      if (signal === "buy" && cash > 0) {
        // Buy with 10% of available cash
        const investAmount = cash * 0.1;
        const executionPrice = price + slippage;
        const commission = investAmount * commissionRate;
        const quantity = (investAmount - commission) / executionPrice;

        if (quantity > 0) {
          cash -= investAmount;
          positions[symbol] = positions[symbol] || { quantity: 0, avgPrice: 0 };
          const totalQuantity = positions[symbol].quantity + quantity;
          positions[symbol].avgPrice =
            (positions[symbol].quantity * positions[symbol].avgPrice + quantity * executionPrice) /
            totalQuantity;
          positions[symbol].quantity = totalQuantity;

          trades.push({
            timestamp: currentDate,
            symbol,
            side: "buy",
            quantity,
            price: executionPrice,
            commission,
            slippage,
          });
        }
      } else if (signal === "sell" && positions[symbol]?.quantity > 0) {
        // Sell entire position
        const executionPrice = price - slippage;
        const quantity = positions[symbol].quantity;
        const saleValue = quantity * executionPrice;
        const commission = saleValue * commissionRate;
        const netProceeds = saleValue - commission;

        cash += netProceeds;

        const pnl = (executionPrice - positions[symbol].avgPrice) * quantity - commission;
        if (pnl > 0) {
          winningTrades++;
          totalProfit += pnl;
        } else {
          losingTrades++;
          totalLoss += Math.abs(pnl);
        }

        trades.push({
          timestamp: currentDate,
          symbol,
          side: "sell",
          quantity,
          price: executionPrice,
          commission,
          slippage,
          pnl,
        });

        delete positions[symbol];
      }
    }

    // Calculate current portfolio value
    let positionsValue = 0;
    for (const [symbol, position] of Object.entries(positions)) {
      if (currentPrices[symbol]) {
        positionsValue += position.quantity * currentPrices[symbol];
      }
    }
    portfolioValue = cash + positionsValue;

    // Track equity curve
    equityCurve.push({ timestamp: currentDate, value: portfolioValue });

    // Update max drawdown
    if (portfolioValue > maxPortfolioValue) {
      maxPortfolioValue = portfolioValue;
    }
    const drawdown = (maxPortfolioValue - portfolioValue) / maxPortfolioValue;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  logger.info({ trades: trades.length, finalValue: portfolioValue }, "Backtest simulation complete");

  // Calculate performance metrics
  const totalReturn = portfolioValue - initialCapital;
  const totalReturnPercent = (totalReturn / initialCapital) * 100;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
  const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;

  // Calculate time-based metrics
  const durationDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
  const annualizedReturn = totalReturnPercent * (365 / durationDays);

  // Calculate Sharpe ratio (simplified - using daily returns)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const dailyReturn = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value;
    dailyReturns.push(dailyReturn);
  }
  const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdDevDailyReturn = Math.sqrt(
    dailyReturns.reduce((a, b) => a + Math.pow(b - avgDailyReturn, 2), 0) / dailyReturns.length
  );
  const sharpeRatio = stdDevDailyReturn > 0 ? (avgDailyReturn * Math.sqrt(252)) / stdDevDailyReturn : 0;

  // Calculate Sortino ratio (downside deviation)
  const negativeReturns = dailyReturns.filter(r => r < 0);
  const downsideDeviation = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / negativeReturns.length)
    : 0.0001;
  const sortinoRatio = (avgDailyReturn * Math.sqrt(252)) / downsideDeviation;

  // Calculate benchmark metrics if available
  let alpha = 0;
  let beta = 0;
  if (benchmarkData && benchmarkData.length > 0) {
    const benchmarkReturns: number[] = [];
    for (let i = 1; i < benchmarkData.length; i++) {
      const ret = (benchmarkData[i].close - benchmarkData[i - 1].close) / benchmarkData[i - 1].close;
      benchmarkReturns.push(ret);
    }

    if (benchmarkReturns.length > 0 && dailyReturns.length === benchmarkReturns.length) {
      const avgBenchmarkReturn = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
      const covariance = dailyReturns.reduce((sum, ret, i) => 
        sum + (ret - avgDailyReturn) * (benchmarkReturns[i] - avgBenchmarkReturn), 0
      ) / dailyReturns.length;
      const benchmarkVariance = benchmarkReturns.reduce((sum, ret) => 
        sum + Math.pow(ret - avgBenchmarkReturn, 2), 0
      ) / benchmarkReturns.length;
      
      beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 0;
      alpha = (avgDailyReturn - avgBenchmarkReturn * beta) * 252;
    }
  }

  // Store backtest results
  const backtestRun = await api.backtestRun.create({
    name: `${strategy.name} - ${new Date().toISOString()}`,
    strategy: { _link: strategyId },
    user: { _link: strategy.userId },
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    initialCapital,
    symbols: tradingSymbols,
    parameters: {
      timeframe,
      slippageModel,
      commissionRate,
      benchmarkSymbol,
      strategyParameters: strategy.parameters,
    },
    status: "completed",
    startedAt: new Date(),
    completedAt: new Date(),
    progress: 100,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalReturn,
    totalReturnPercent,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
    avgWin,
    avgLoss,
    maxDrawdown: maxDrawdown * 100,
    maxDrawdownPercent: maxDrawdown * 100,
    equityCurve: equityCurve.map(point => ({
      timestamp: point.timestamp.toISOString(),
      value: point.value,
    })),
    trades: trades.map(trade => ({
      ...trade,
      timestamp: trade.timestamp.toISOString(),
    })),
    metrics: {
      annualizedReturn,
      alpha,
      beta,
      totalReturnPercent,
      durationDays,
      avgTradeSize: trades.length > 0 ? trades.reduce((sum, t) => sum + t.quantity * t.price, 0) / trades.length : 0,
      avgHoldingPeriod: 0, // Would need to calculate based on entry/exit pairs
      monthlyReturns: {}, // Could be calculated from equity curve
      yearlyReturns: {}, // Could be calculated from equity curve
    },
  });

  logger.info({ backtestRunId: backtestRun.id }, "Backtest results stored");

  return {
    backtestRunId: backtestRun.id,
    summary: {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      winRate,
      profitFactor,
      totalTrades,
      winningTrades,
      losingTrades,
      alpha,
      beta,
      initialCapital,
      finalValue: portfolioValue,
    },
    equityCurve,
    trades: trades.slice(0, 100), // Return first 100 trades to avoid huge response
  };
};

export const params = {
  strategyId: { type: "string", required: true },
  startDate: { type: "string", required: true },
  endDate: { type: "string", required: true },
  initialCapital: { type: "number", default: 100000 },
  symbols: { type: "array" },
  timeframe: { type: "string", default: "1d" },
  slippageModel: { type: "string", default: "realistic" },
  commissionRate: { type: "number", default: 0.001 },
  benchmarkSymbol: { type: "string", default: "BTC" },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
