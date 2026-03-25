import { optimizePortfolioQuantum, quantumAnneal } from "../lib/quantum/quantumAnnealing";
import {
  calculateEfficientFrontier,
  findOptimalPortfolio,
  maximizeSharpeRatio,
  calculateRiskContributions,
} from "../lib/portfolio/modernPortfolioTheory";
import {
  optimizePortfolio,
  rebalanceStrategy,
  calculateEnhancedSharpe,
} from "../lib/mathEngine/portfolioOptimizer";
import { calculateVolatilityForecast } from "../lib/calculations/quantitativeModels";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting comprehensive quantum portfolio optimization");

  // Parse parameters with defaults
  const riskTolerance = params.riskTolerance || 0.5;
  const enableQuantum = params.enableQuantum !== false;
  const executeRebalancing = params.executeRebalancing === true;
  const minNetBenefit = params.minNetBenefit || 0.5;

  // Step 1: Get current portfolio state
  logger.info("Loading current portfolio positions");
  const positions = await api.position.findMany({
    first: 250,
    select: {
      id: true,
      asset: true,
      symbol: true,
      quantity: true,
      currentPrice: true,
      marketValue: true,
      unrealizedPnL: true,
      side: true,
    },
  });

  if (positions.length === 0) {
    logger.warn("No positions found in portfolio");
    return {
      error: "No positions to optimize",
      currentPortfolio: null,
    };
  }

  // Calculate current allocations
  const totalPortfolioValue = positions.reduce((sum, pos) => sum + (pos.marketValue || 0), 0);
  const currentWeights: Record<string, number> = {};
  const currentAssets: string[] = [];

  positions.forEach((pos) => {
    const weight = (pos.marketValue || 0) / totalPortfolioValue;
    currentWeights[pos.symbol] = weight;
    currentAssets.push(pos.symbol);
  });

  logger.info(`Portfolio value: $${totalPortfolioValue.toFixed(2)}, Assets: ${currentAssets.length}`);

  // Step 2: Gather market data
  logger.info("Gathering market data for portfolio optimization");
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  // Get all available market data
  const allMarketData = await api.marketData.findMany({
    first: 250,
    filter: {
      timestamp: {
        greaterThanOrEqual: startDate.toISOString(),
      },
    },
    sort: [{ timestamp: "Ascending" }],
    select: {
      symbol: true,
      timestamp: true,
      close: true,
      volume: true,
    },
  });

  // Group market data by symbol
  const marketDataBySymbol: Record<string, Array<{ timestamp: Date; close: number }>> = {};
  allMarketData.forEach((data) => {
    if (!marketDataBySymbol[data.symbol]) {
      marketDataBySymbol[data.symbol] = [];
    }
    marketDataBySymbol[data.symbol].push({
      timestamp: new Date(data.timestamp),
      close: data.close,
    });
  });

  // Get top 20 most liquid assets (by recent volume)
  const volumeBySymbol: Record<string, number> = {};
  allMarketData.forEach((data) => {
    volumeBySymbol[data.symbol] = (volumeBySymbol[data.symbol] || 0) + data.volume;
  });

  const topAssets = Object.entries(volumeBySymbol)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([symbol]) => symbol);

  // Combine current assets with top assets
  const allAssets = Array.from(new Set([...currentAssets, ...topAssets]));
  logger.info(`Analyzing ${allAssets.length} total assets for optimization`);

  // Calculate returns and statistics for each asset
  const assetStats: Record<string, { expectedReturn: number; volatility: number; prices: number[] }> = {};

  allAssets.forEach((symbol) => {
    const prices = marketDataBySymbol[symbol];
    if (!prices || prices.length < 30) {
      return; // Skip assets with insufficient data
    }

    // Calculate log returns
    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const logReturn = Math.log(prices[i].close / prices[i - 1].close);
      logReturns.push(logReturn);
    }

    // Calculate expected return (annualized)
    const meanReturn = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
    const expectedReturn = meanReturn * 252; // Annualized (252 trading days)

    // Calculate volatility (annualized)
    const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / logReturns.length;
    const volatility = Math.sqrt(variance * 252);

    assetStats[symbol] = {
      expectedReturn,
      volatility,
      prices: prices.map((p) => p.close),
    };
  });

  // Filter to assets with sufficient data
  const validAssets = allAssets.filter((symbol) => assetStats[symbol] !== undefined);
  logger.info(`${validAssets.length} assets have sufficient data for optimization`);

  if (validAssets.length < 2) {
    return {
      error: "Insufficient assets with market data for optimization",
      assetsAnalyzed: validAssets.length,
    };
  }

  // Build covariance matrix
  const n = validAssets.length;
  const covarianceMatrix: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const prices1 = assetStats[validAssets[i]].prices;
      const prices2 = assetStats[validAssets[j]].prices;
      const minLength = Math.min(prices1.length, prices2.length);

      const returns1: number[] = [];
      const returns2: number[] = [];

      for (let k = 1; k < minLength; k++) {
        returns1.push(Math.log(prices1[k] / prices1[k - 1]));
        returns2.push(Math.log(prices2[k] / prices2[k - 1]));
      }

      const mean1 = returns1.reduce((sum, r) => sum + r, 0) / returns1.length;
      const mean2 = returns2.reduce((sum, r) => sum + r, 0) / returns2.length;

      let covariance = 0;
      for (let k = 0; k < returns1.length; k++) {
        covariance += (returns1[k] - mean1) * (returns2[k] - mean2);
      }
      covariance = (covariance / returns1.length) * 252; // Annualized

      covarianceMatrix[i][j] = covariance;
    }
  }

  // Get AI predictions for expected returns
  const aiPredictions = await api.aiPrediction.findMany({
    first: 250,
    filter: {
      symbol: { in: validAssets },
      predictionType: { equals: "price" },
    },
    sort: [{ createdAt: "Descending" }],
    select: {
      symbol: true,
      predictedValue: true,
      currentValue: true,
      confidence: true,
    },
  });

  // Adjust expected returns with AI predictions
  aiPredictions.forEach((pred) => {
    if (assetStats[pred.symbol]) {
      const aiReturn = (pred.predictedValue - pred.currentValue) / pred.currentValue;
      const confidence = pred.confidence / 100;
      // Blend AI prediction with historical return
      assetStats[pred.symbol].expectedReturn =
        assetStats[pred.symbol].expectedReturn * (1 - confidence) + aiReturn * confidence;
    }
  });

  // Build expected returns array
  const expectedReturns = validAssets.map((symbol) => assetStats[symbol].expectedReturn);
  const volatilities = validAssets.map((symbol) => assetStats[symbol].volatility);

  // Calculate current portfolio metrics
  const currentReturn =
    validAssets.reduce((sum, symbol, i) => sum + (currentWeights[symbol] || 0) * expectedReturns[i], 0) || 0;

  let currentRisk = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const wi = currentWeights[validAssets[i]] || 0;
      const wj = currentWeights[validAssets[j]] || 0;
      currentRisk += wi * wj * covarianceMatrix[i][j];
    }
  }
  currentRisk = Math.sqrt(Math.max(0, currentRisk));

  const riskFreeRate = 0.03; // 3% annual risk-free rate
  const currentSharpe = currentRisk > 0 ? (currentReturn - riskFreeRate) / currentRisk : 0;

  logger.info(
    `Current portfolio - Return: ${(currentReturn * 100).toFixed(2)}%, Risk: ${(currentRisk * 100).toFixed(2)}%, Sharpe: ${currentSharpe.toFixed(3)}`
  );

  // Step 3: Calculate efficient frontier
  logger.info("Calculating efficient frontier");
  const efficientFrontier = calculateEfficientFrontier(expectedReturns, covarianceMatrix, 100);

  // Step 4: Find optimal portfolio (Classical MPT)
  logger.info("Finding classical optimal portfolio (maximize Sharpe ratio)");
  const classicalOptimal = maximizeSharpeRatio(expectedReturns, covarianceMatrix, riskFreeRate);

  const classicalReturn = classicalOptimal.expectedReturn;
  const classicalRisk = classicalOptimal.volatility;
  const classicalSharpe = classicalOptimal.sharpeRatio;

  logger.info(
    `Classical optimal - Return: ${(classicalReturn * 100).toFixed(2)}%, Risk: ${(classicalRisk * 100).toFixed(2)}%, Sharpe: ${classicalSharpe.toFixed(3)}`
  );

  // Step 5: Quantum portfolio optimization
  let quantumOptimal: any;
  let tunnelingEvents = 0;
  let quantumIterations = 0;

  if (enableQuantum) {
    logger.info("Starting quantum portfolio optimization");
    quantumOptimal = optimizePortfolioQuantum(expectedReturns, covarianceMatrix, riskFreeRate, {
      initialTemp: 100.0,
      coolingRate: 0.95,
      numIterations: 5000,
      quantumStrength: 0.7,
      minWeight: 0.0,
      maxWeight: 0.3, // Max 30% in any asset for diversification
    });

    tunnelingEvents = quantumOptimal.tunnelingEvents || 0;
    quantumIterations = quantumOptimal.iterations || 0;

    logger.info(
      `Quantum optimal - Return: ${(quantumOptimal.expectedReturn * 100).toFixed(2)}%, Risk: ${(quantumOptimal.volatility * 100).toFixed(2)}%, Sharpe: ${quantumOptimal.sharpeRatio.toFixed(3)}`
    );
    logger.info(`Quantum tunneling events: ${tunnelingEvents}, Iterations: ${quantumIterations}`);
  } else {
    quantumOptimal = classicalOptimal;
  }

  // Step 6: Compare classical vs quantum
  const sharpeImprovement = ((quantumOptimal.sharpeRatio - classicalSharpe) / classicalSharpe) * 100;
  logger.info(`Quantum Sharpe improvement: ${sharpeImprovement.toFixed(2)}%`);

  const optimalWeights = sharpeImprovement > 5 ? quantumOptimal.weights : classicalOptimal.weights;
  const optimalReturn = sharpeImprovement > 5 ? quantumOptimal.expectedReturn : classicalReturn;
  const optimalRisk = sharpeImprovement > 5 ? quantumOptimal.volatility : classicalRisk;
  const optimalSharpe = sharpeImprovement > 5 ? quantumOptimal.sharpeRatio : classicalSharpe;

  // Step 7: Risk parity check
  logger.info("Checking risk parity");
  const riskContributions = calculateRiskContributions(optimalWeights, covarianceMatrix);
  const maxRiskContribution = Math.max(...riskContributions);

  if (maxRiskContribution > 0.5) {
    logger.warn(`Asset dominates risk (${(maxRiskContribution * 100).toFixed(1)}%), applying risk parity adjustment`);
    // Find dominant asset
    const dominantIndex = riskContributions.indexOf(maxRiskContribution);
    // Reduce dominant asset weight by 20%
    optimalWeights[dominantIndex] *= 0.8;
    // Redistribute to other assets proportionally
    const redistributeAmount = 1 - optimalWeights.reduce((sum, w) => sum + w, 0);
    optimalWeights.forEach((w, i) => {
      if (i !== dominantIndex) {
        optimalWeights[i] += redistributeAmount * (w / (1 - optimalWeights[dominantIndex]));
      }
    });
  }

  // Step 8: Calculate rebalancing trades
  logger.info("Calculating rebalancing trades");
  const currentWeightsArray = validAssets.map((symbol) => currentWeights[symbol] || 0);

  const rebalancingResult = rebalanceStrategy(currentWeightsArray, optimalWeights, {
    maxTrades: 10,
    minTradeSize: 0.01, // 1% minimum
    slippageFactor: 0.001,
  });

  // Step 9: Estimate rebalancing impact
  const returnImprovement = optimalReturn - currentReturn;
  const riskReduction = currentRisk - optimalRisk;
  const sharpeIncrease = optimalSharpe - currentSharpe;

  const transactionCosts = rebalancingResult.totalCost * totalPortfolioValue;
  const expectedBenefit = returnImprovement * totalPortfolioValue;
  const netBenefit = expectedBenefit - transactionCosts;
  const netBenefitPercent = (netBenefit / totalPortfolioValue) * 100;

  logger.info(`Expected return improvement: ${(returnImprovement * 100).toFixed(2)}%`);
  logger.info(`Risk reduction: ${(riskReduction * 100).toFixed(2)}%`);
  logger.info(`Sharpe increase: ${sharpeIncrease.toFixed(3)}`);
  logger.info(`Transaction costs: $${transactionCosts.toFixed(2)}`);
  logger.info(`Net benefit: $${netBenefit.toFixed(2)} (${netBenefitPercent.toFixed(2)}%)`);

  // Step 10: Execute rebalancing (if approved)
  let executed = false;
  const trades: any[] = [];

  if (executeRebalancing && netBenefitPercent >= minNetBenefit) {
    logger.info("Net benefit exceeds threshold, executing rebalancing");

    for (const trade of rebalancingResult.trades) {
      const symbol = validAssets[trade.assetIndex];
      const position = positions.find((p) => p.symbol === symbol);

      if (!position) continue;

      const tradeValue = trade.amount * totalPortfolioValue;
      const tradeQuantity = tradeValue / (position.currentPrice || 1);

      // Create order
      try {
        const order = await api.order.create({
          symbol,
          side: trade.amount > 0 ? "buy" : "sell",
          quantity: Math.abs(tradeQuantity),
          type: "market",
          tradingAccount: { _link: position.tradingAccountId },
          user: { _link: position.userId },
        });

        trades.push({
          symbol,
          side: trade.amount > 0 ? "buy" : "sell",
          quantity: Math.abs(tradeQuantity),
          value: Math.abs(tradeValue),
          orderId: order.id,
        });

        logger.info(`Created order: ${trade.amount > 0 ? "BUY" : "SELL"} ${symbol} qty=${Math.abs(tradeQuantity).toFixed(4)}`);
      } catch (error: any) {
        logger.error(`Failed to create order for ${symbol}: ${error.message}`);
      }
    }

    executed = true;

    // Record rebalancing event
    await api.performanceMetric.create({
      metricType: "portfolio-performance",
      timeframe: "daily",
      periodStart: new Date(),
      periodEnd: new Date(),
      totalPnL: netBenefit,
      totalPnLPercent: netBenefitPercent,
      sharpeRatio: optimalSharpe,
      roi: returnImprovement * 100,
      metrics: {
        rebalancing: {
          oldWeights: currentWeights,
          newWeights: Object.fromEntries(validAssets.map((symbol, i) => [symbol, optimalWeights[i]])),
          improvement: sharpeIncrease,
          costs: transactionCosts,
        },
      },
      user: { _link: positions[0].userId },
    });
  } else {
    logger.info(`Not executing rebalancing: netBenefit=${netBenefitPercent.toFixed(2)}% < threshold=${minNetBenefit}%`);
  }

  // Step 11: Post-optimization analysis
  logger.info("Performing post-optimization analysis");

  // Calculate Lambda (diversification entropy)
  const lambda = -optimalWeights.reduce((sum, w) => (w > 0 ? sum + w * Math.log(w) : sum), 0);

  // Calculate enhanced Sharpe
  const enhancedSharpe = calculateEnhancedSharpe(optimalReturn, optimalRisk, riskFreeRate, lambda);

  // Estimate future volatility
  const futureVolatility = {
    oneDay: calculateVolatilityForecast(volatilities, 1),
    oneWeek: calculateVolatilityForecast(volatilities, 7),
    oneMonth: calculateVolatilityForecast(volatilities, 30),
  };

  // Step 12: Generate recommendations
  const recommendations: string[] = [];

  if (sharpeIncrease > 0.2) {
    recommendations.push("Significant Sharpe ratio improvement possible through rebalancing");
  }

  if (maxRiskContribution > 0.4) {
    recommendations.push("Portfolio risk is concentrated in a few assets, consider further diversification");
  }

  if (lambda < 1.5) {
    recommendations.push("Low diversification entropy, consider adding more uncorrelated assets");
  }

  if (enableQuantum && sharpeImprovement > 5) {
    recommendations.push(
      `Quantum optimization found ${sharpeImprovement.toFixed(1)}% better solution than classical MPT`
    );
  }

  if (netBenefitPercent < minNetBenefit) {
    recommendations.push("Current portfolio is already near-optimal, rebalancing costs exceed benefits");
  }

  // Step 13: Return comprehensive results
  return {
    currentPortfolio: {
      weights: currentWeights,
      expectedReturn: currentReturn,
      risk: currentRisk,
      sharpe: currentSharpe,
      value: totalPortfolioValue,
    },
    classicalOptimal: {
      weights: Object.fromEntries(validAssets.map((symbol, i) => [symbol, classicalOptimal.weights[i]])),
      expectedReturn: classicalReturn,
      risk: classicalRisk,
      sharpe: classicalSharpe,
    },
    quantumOptimal: enableQuantum
      ? {
          weights: Object.fromEntries(validAssets.map((symbol, i) => [symbol, quantumOptimal.weights[i]])),
          expectedReturn: quantumOptimal.expectedReturn,
          risk: quantumOptimal.volatility,
          sharpe: quantumOptimal.sharpeRatio,
          tunnelingEvents,
          iterations: quantumIterations,
        }
      : null,
    efficientFrontier: efficientFrontier.map((point) => ({
      return: point.expectedReturn,
      risk: point.volatility,
      sharpe: point.sharpeRatio,
    })),
    improvement: {
      sharpeIncrease,
      returnIncrease: returnImprovement,
      riskReduction,
    },
    rebalancingTrades: rebalancingResult.trades.map((trade) => ({
      symbol: validAssets[trade.assetIndex],
      currentWeight: currentWeightsArray[trade.assetIndex],
      targetWeight: optimalWeights[trade.assetIndex],
      changeAmount: trade.amount,
      priority: trade.priority,
    })),
    costs: {
      transactionCosts,
      slippage: rebalancingResult.totalCost * totalPortfolioValue * 0.5,
      total: transactionCosts,
    },
    netBenefit,
    netBenefitPercent,
    executed,
    executedTrades: trades,
    quantumMetrics: enableQuantum
      ? {
          iterations: quantumIterations,
          tunnelingEvents,
          convergence: quantumOptimal.convergence || 0,
          improvement: sharpeImprovement,
        }
      : null,
    riskMetrics: {
      lambda,
      enhancedSharpe,
      futureVolatility,
      riskContributions: Object.fromEntries(validAssets.map((symbol, i) => [symbol, riskContributions[i]])),
    },
    recommendations,
    timestamp: new Date().toISOString(),
  };
};

export const options = {
  triggers: {
    api: true,
    scheduler: [
      {
        every: "1 day",
        at: "22:00", // 10 PM daily at market close
      },
    ],
  },
};

export const params = {
  riskTolerance: { type: "number", default: 0.5 },
  enableQuantum: { type: "boolean", default: true },
  executeRebalancing: { type: "boolean", default: false },
  minNetBenefit: { type: "number", default: 0.5 },
};
