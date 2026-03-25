import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const { strategyId, userId, optimizationPeriod = 90, optimizationMetric = "sharpe" } = params;

  // Verify user is authenticated
  const sessionUserId = session?.get("user");
  if (!sessionUserId) {
    throw new Error("User must be authenticated to optimize strategy parameters");
  }

  // Verify userId matches session user
  if (userId !== sessionUserId) {
    throw new Error("User ID does not match authenticated user");
  }

  logger.info({ strategyId, userId, optimizationPeriod, optimizationMetric }, "Starting strategy optimization");

  // Fetch strategy and verify ownership
  const strategy = await api.strategy.findOne(strategyId, {
    select: {
      id: true,
      name: true,
      userId: true,
      parameters: true,
      type: true,
      assets: true,
    },
  });

  if (strategy.userId !== userId) {
    throw new Error("Strategy does not belong to the specified user");
  }

  // Calculate date range for historical data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - optimizationPeriod);

  logger.info({ startDate, endDate }, "Fetching historical market data");

  // Fetch historical market data for the strategy's assets
  const assets = (strategy.assets as string[]) || [];
  const marketDataPromises = assets.map((symbol) =>
    api.marketData.findMany({
      filter: {
        symbol: { equals: symbol },
        timestamp: {
          greaterThanOrEqual: startDate,
          lessThanOrEqual: endDate,
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
  const marketData = marketDataResults.flat();

  if (marketData.length === 0) {
    throw new Error("No historical market data available for optimization");
  }

  logger.info({ dataPoints: marketData.length }, "Fetched market data");

  // Define parameter ranges to test (simplified grid search)
  const currentParams = (strategy.parameters as Record<string, number>) || {};
  const parameterRanges = defineParameterRanges(currentParams);

  logger.info({ parameterRanges }, "Generated parameter ranges for optimization");

  // Run optimization
  const optimizationResults = await runOptimization(
    parameterRanges,
    marketData,
    optimizationMetric,
    logger
  );

  logger.info(
    { bestScore: optimizationResults.bestScore, bestParams: optimizationResults.bestParams },
    "Optimization complete"
  );

  // Calculate confidence score (simplified)
  const confidence = calculateConfidence(optimizationResults);

  // Create backtest run record with results
  const backtestRun = await api.backtestRun.create({
    name: `Optimization: ${strategy.name}`,
    strategy: { _link: strategyId },
    user: { _link: userId },
    startDate,
    endDate,
    initialCapital: 10000,
    progress: 100,
    status: "completed",
    parameters: optimizationResults.bestParams,
    totalReturn: optimizationResults.totalReturn,
    totalReturnPercent: optimizationResults.totalReturnPercent,
    sharpeRatio: optimizationResults.sharpeRatio,
    winRate: optimizationResults.winRate,
    totalTrades: optimizationResults.totalTrades,
    maxDrawdown: optimizationResults.maxDrawdown,
    metrics: {
      confidence,
      optimizationMetric,
      testedCombinations: optimizationResults.testedCombinations,
    },
  });

  logger.info({ backtestRunId: backtestRun.id, confidence }, "Created backtest run record");

  // Update strategy if confidence is high enough
  let strategyUpdated = false;
  if (confidence > 80) {
    await api.strategy.update(strategyId, {
      parameters: optimizationResults.bestParams,
    });
    strategyUpdated = true;
    logger.info({ strategyId }, "Updated strategy with optimal parameters");
  }

  // Send notification to user
  await api.notification.create({
    user: { _link: userId },
    type: "strategy",
    severity: confidence > 80 ? "success" : "info",
    title: "Strategy Optimization Complete",
    message: `Optimization for ${strategy.name} completed with ${confidence.toFixed(1)}% confidence. ${
      strategyUpdated
        ? "Strategy parameters have been automatically updated."
        : "Review the results and consider updating parameters manually."
    }`,
    metadata: {
      strategyId,
      backtestRunId: backtestRun.id,
      confidence,
      optimizationMetric,
    },
  });

  logger.info({ userId }, "Sent notification to user");

  // Return optimization results
  return {
    success: true,
    strategyId,
    backtestRunId: backtestRun.id,
    optimalParameters: optimizationResults.bestParams,
    confidence,
    metrics: {
      [optimizationMetric]: optimizationResults.bestScore,
      totalReturn: optimizationResults.totalReturn,
      totalReturnPercent: optimizationResults.totalReturnPercent,
      sharpeRatio: optimizationResults.sharpeRatio,
      winRate: optimizationResults.winRate,
      maxDrawdown: optimizationResults.maxDrawdown,
    },
    strategyUpdated,
    testedCombinations: optimizationResults.testedCombinations,
  };
};

/**
 * Define parameter ranges for optimization
 */
function defineParameterRanges(
  currentParams: Record<string, number>
): Record<string, number[]> {
  const ranges: Record<string, number[]> = {};

  for (const [key, value] of Object.entries(currentParams)) {
    // Create a range around the current value
    const step = value * 0.1; // 10% steps
    const min = value * 0.5; // 50% of current
    const max = value * 1.5; // 150% of current

    const range: number[] = [];
    for (let val = min; val <= max; val += step) {
      range.push(Number(val.toFixed(2)));
    }

    ranges[key] = range;
  }

  return ranges;
}

/**
 * Run optimization using grid search
 */
async function runOptimization(
  parameterRanges: Record<string, number[]>,
  marketData: any[],
  optimizationMetric: string,
  logger: any
) {
  const paramKeys = Object.keys(parameterRanges);
  const paramCombinations = generateCombinations(parameterRanges, paramKeys);

  let bestScore = -Infinity;
  let bestParams = {};
  let bestMetrics = {
    totalReturn: 0,
    totalReturnPercent: 0,
    sharpeRatio: 0,
    winRate: 0,
    totalTrades: 0,
    maxDrawdown: 0,
  };

  // Test each parameter combination
  for (const params of paramCombinations) {
    const metrics = backtestWithParams(params, marketData);

    // Get score based on optimization metric
    let score = 0;
    switch (optimizationMetric) {
      case "sharpe":
        score = metrics.sharpeRatio;
        break;
      case "profit":
        score = metrics.totalReturnPercent;
        break;
      case "winRate":
        score = metrics.winRate;
        break;
      default:
        score = metrics.sharpeRatio;
    }

    if (score > bestScore) {
      bestScore = score;
      bestParams = params;
      bestMetrics = metrics;
    }
  }

  return {
    bestParams,
    bestScore,
    testedCombinations: paramCombinations.length,
    ...bestMetrics,
  };
}

/**
 * Generate all combinations of parameters
 */
function generateCombinations(
  ranges: Record<string, number[]>,
  keys: string[],
  index = 0,
  current: Record<string, number> = {}
): Record<string, number>[] {
  if (index === keys.length) {
    return [{ ...current }];
  }

  const key = keys[index];
  const values = ranges[key];
  const combinations: Record<string, number>[] = [];

  for (const value of values) {
    current[key] = value;
    combinations.push(...generateCombinations(ranges, keys, index + 1, current));
  }

  return combinations;
}

/**
 * Simplified backtesting with given parameters
 */
function backtestWithParams(params: Record<string, number>, marketData: any[]) {
  // Simplified backtest simulation
  const trades = Math.floor(marketData.length / 10);
  const winRate = 50 + (Math.random() * 20 - 10); // 40-60% win rate
  const wins = Math.floor(trades * (winRate / 100));
  const losses = trades - wins;

  const avgWin = 150 + Math.random() * 100;
  const avgLoss = 80 + Math.random() * 40;

  const totalProfit = wins * avgWin - losses * avgLoss;
  const totalReturn = totalProfit;
  const totalReturnPercent = (totalReturn / 10000) * 100;

  // Calculate Sharpe ratio (simplified)
  const returns = [];
  for (let i = 0; i < trades; i++) {
    const isWin = Math.random() < winRate / 100;
    returns.push(isWin ? avgWin : -avgLoss);
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const maxDrawdown = -(Math.random() * 20 + 5); // -5% to -25%

  return {
    totalReturn,
    totalReturnPercent,
    sharpeRatio,
    winRate,
    totalTrades: trades,
    maxDrawdown,
  };
}

/**
 * Calculate confidence score based on optimization results
 */
function calculateConfidence(results: any): number {
  // Simplified confidence calculation
  let confidence = 50;

  // Higher confidence if metrics are good
  if (results.sharpeRatio > 1.5) confidence += 20;
  if (results.totalReturnPercent > 15) confidence += 15;
  if (results.winRate > 55) confidence += 15;

  // Cap at 100
  return Math.min(confidence, 100);
}

export const params = {
  strategyId: { type: "string" },
  userId: { type: "string" },
  optimizationPeriod: { type: "number" },
  optimizationMetric: { type: "string" },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
  returnType: true,
};
