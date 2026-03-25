import { ActionOptions } from "gadget-server";
import { detectPatterns, optimize } from "../lib/calculations/machineLearning";
import { calculateSharpeRatio, calculateMaxDrawdown } from "../lib/calculations/riskMetrics";
import { calculatePortfolioMetrics } from "../lib/calculations/portfolioMetrics";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting learning cycle optimization");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  let strategiesOptimized = 0;
  let totalImprovement = 0;
  let patternsDiscovered = 0;
  let botsAdjusted = 0;

  // 1. Data Collection Phase
  logger.info("Phase 1: Collecting data from last 30 days");
  const [trades, predictions, strategies, marketDataPoints] = await Promise.all([
    api.trade.findMany({
      filter: { executedAt: { greaterThanOrEqual: thirtyDaysAgo.toISOString() } },
      first: 250,
      select: {
        id: true,
        symbol: true,
        side: true,
        price: true,
        quantity: true,
        fee: true,
        realizedPnL: true,
        executedAt: true,
        strategyId: true,
        strategy: { id: true, name: true }
      }
    }),
    api.aiPrediction.findMany({
      filter: { createdAt: { greaterThanOrEqual: thirtyDaysAgo.toISOString() } },
      first: 250,
      select: {
        id: true,
        symbol: true,
        predictedValue: true,
        actualValue: true,
        confidence: true,
        isCorrect: true,
        accuracy: true,
        predictionType: true,
        tradingBotId: true
      }
    }),
    api.strategy.findMany({
      filter: { isActive: { equals: true } },
      first: 250,
      select: {
        id: true,
        name: true,
        type: true,
        parameters: true,
        riskLevel: true,
        maxPositionSize: true
      }
    }),
    api.marketData.findMany({
      filter: { timestamp: { greaterThanOrEqual: thirtyDaysAgo.toISOString() } },
      first: 250,
      select: {
        id: true,
        symbol: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        timestamp: true,
        interval: true
      }
    })
  ]);

  logger.info(`Collected ${trades.length} trades, ${predictions.length} predictions, ${strategies.length} strategies`);

  // 2. Performance Analysis
  logger.info("Phase 2: Analyzing strategy performance");
  const strategyPerformance = new Map();

  for (const strategy of strategies) {
    const strategyTrades = trades.filter(t => t.strategyId === strategy.id);
    
    if (strategyTrades.length === 0) continue;

    const winningTrades = strategyTrades.filter(t => (t.realizedPnL || 0) > 0);
    const losingTrades = strategyTrades.filter(t => (t.realizedPnL || 0) < 0);
    const winRate = (winningTrades.length / strategyTrades.length) * 100;
    
    const totalPnL = strategyTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const avgProfit = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) / winningTrades.length 
      : 0;
    
    const returns = strategyTrades.map(t => (t.realizedPnL || 0) / (t.price * t.quantity));
    const sharpeRatio = calculateSharpeRatio(returns);
    const maxDrawdown = calculateMaxDrawdown(strategyTrades.map(t => t.realizedPnL || 0));

    strategyPerformance.set(strategy.id, {
      strategy,
      winRate,
      avgProfit,
      totalPnL,
      sharpeRatio,
      maxDrawdown,
      tradeCount: strategyTrades.length
    });
  }

  // Calculate prediction accuracy by symbol
  const symbolAccuracy = new Map();
  for (const prediction of predictions) {
    if (prediction.actualValue !== null && prediction.actualValue !== undefined) {
      if (!symbolAccuracy.has(prediction.symbol)) {
        symbolAccuracy.set(prediction.symbol, { correct: 0, total: 0 });
      }
      const stats = symbolAccuracy.get(prediction.symbol)!;
      stats.total++;
      if (prediction.isCorrect) stats.correct++;
    }
  }

  // 3. Pattern Learning
  logger.info("Phase 3: Learning patterns from historical data");
  const symbolPatterns = new Map();
  
  for (const symbol of new Set(marketDataPoints.map(m => m.symbol))) {
    const symbolData = marketDataPoints
      .filter(m => m.symbol === symbol)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (symbolData.length >= 20) {
      const prices = symbolData.map(m => m.close);
      const patterns = detectPatterns(prices);
      
      if (patterns && patterns.length > 0) {
        symbolPatterns.set(symbol, patterns);
        patternsDiscovered += patterns.length;
      }
    }
  }

  logger.info(`Discovered ${patternsDiscovered} patterns across symbols`);

  // 4. Parameter Optimization
  logger.info("Phase 4: Optimizing strategy parameters");
  
  for (const [strategyId, perf] of strategyPerformance) {
    const strategy = perf.strategy;
    
    // Get historical data for backtesting
    const strategyTrades = trades.filter(t => t.strategyId === strategyId);
    
    if (strategyTrades.length < 10) continue;

    try {
      // Prepare data for optimization
      const historicalData = strategyTrades.map(t => ({
        price: t.price,
        quantity: t.quantity,
        pnl: t.realizedPnL || 0,
        timestamp: t.executedAt
      }));

      // Run optimization
      const optimizationResult = optimize(historicalData, strategy.parameters as any);
      
      if (optimizationResult && optimizationResult.improvement > 15) {
        // Update strategy with new parameters
        await api.strategy.update(strategyId, {
          parameters: optimizationResult.parameters
        });

        // Create backtest run record
        await api.backtestRun.create({
          name: `Auto-optimization ${strategy.name} ${now.toISOString()}`,
          strategy: { _link: strategyId },
          startDate: ninetyDaysAgo.toISOString(),
          endDate: now.toISOString(),
          initialCapital: 10000,
          parameters: optimizationResult.parameters,
          status: "completed",
          totalReturn: optimizationResult.improvement,
          totalReturnPercent: optimizationResult.improvement,
          sharpeRatio: perf.sharpeRatio,
          maxDrawdown: perf.maxDrawdown,
          totalTrades: strategyTrades.length,
          winRate: perf.winRate,
          progress: 100,
          completedAt: now.toISOString()
        });

        strategiesOptimized++;
        totalImprovement += optimizationResult.improvement;
        
        logger.info(`Optimized strategy ${strategy.name}: ${optimizationResult.improvement.toFixed(2)}% improvement`);
      }
    } catch (error) {
      logger.error({ error, strategyId }, "Error optimizing strategy");
    }
  }

  // 5. Risk Model Calibration
  logger.info("Phase 5: Calibrating risk models");
  
  const actualDrawdowns = Array.from(strategyPerformance.values()).map(p => p.maxDrawdown);
  const avgDrawdown = actualDrawdowns.reduce((sum, d) => sum + d, 0) / actualDrawdowns.length;
  
  // Calculate entropy balance (Λ) and stability (Ξ) based on market behavior
  const volatility = marketDataPoints.length > 0 
    ? marketDataPoints.reduce((sum, m) => sum + Math.abs(m.high - m.low) / m.close, 0) / marketDataPoints.length
    : 0;
  
  const lambdaAdjustment = Math.min(1.5, Math.max(0.5, volatility * 10));
  const xiAdjustment = Math.min(1.0, Math.max(0.3, 1 - volatility * 5));

  logger.info(`Risk calibration - Λ adjustment: ${lambdaAdjustment.toFixed(3)}, Ξ adjustment: ${xiAdjustment.toFixed(3)}`);

  // 6. Signal Quality Assessment
  logger.info("Phase 6: Assessing signal quality");
  
  const signalQuality = new Map();
  
  for (const [symbol, stats] of symbolAccuracy) {
    const accuracy = (stats.correct / stats.total) * 100;
    const weight = accuracy < 55 ? 0.5 : accuracy > 70 ? 1.5 : 1.0;
    signalQuality.set(symbol, { accuracy, weight, total: stats.total });
  }

  // 7. Bot Performance Ranking
  logger.info("Phase 7: Ranking bot performance");
  
  const bots = await api.tradingBot.findMany({
    first: 250,
    select: {
      id: true,
      name: true,
      totalProfit: true,
      totalTrades: true,
      winningTrades: true,
      isActive: true,
      riskLevel: true
    }
  });

  const botRankings = bots
    .filter(b => b.totalTrades > 0)
    .map(bot => ({
      bot,
      riskAdjustedReturn: (bot.totalProfit / Math.max(1, bot.totalTrades)) * (bot.winningTrades / Math.max(1, bot.totalTrades))
    }))
    .sort((a, b) => b.riskAdjustedReturn - a.riskAdjustedReturn);

  const top20Percent = Math.ceil(botRankings.length * 0.2);
  const bottom20Percent = Math.floor(botRankings.length * 0.8);

  for (let i = 0; i < botRankings.length; i++) {
    const { bot } = botRankings[i];
    
    if (i < top20Percent) {
      // Top performers - potentially increase risk level
      if (bot.riskLevel === "conservative") {
        await api.tradingBot.update(bot.id, { riskLevel: "moderate" });
        botsAdjusted++;
      } else if (bot.riskLevel === "moderate") {
        await api.tradingBot.update(bot.id, { riskLevel: "aggressive" });
        botsAdjusted++;
      }
    } else if (i >= bottom20Percent) {
      // Bottom performers - reduce risk or pause
      if (bot.riskLevel === "aggressive") {
        await api.tradingBot.update(bot.id, { riskLevel: "moderate" });
        botsAdjusted++;
      } else if (bot.riskLevel === "moderate") {
        await api.tradingBot.update(bot.id, { riskLevel: "conservative" });
        botsAdjusted++;
      } else if (botRankings[i].riskAdjustedReturn < 0) {
        await api.tradingBot.update(bot.id, { isActive: false, status: "paused" });
        botsAdjusted++;
      }
    }
  }

  // 8. Market Regime Detection
  logger.info("Phase 8: Detecting market regime");
  
  const recentPrices = marketDataPoints
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 100)
    .map(m => m.close);
  
  const priceChange = recentPrices.length >= 2 
    ? ((recentPrices[0] - recentPrices[recentPrices.length - 1]) / recentPrices[recentPrices.length - 1]) * 100
    : 0;
  
  const recentVolatility = volatility;
  
  let marketRegime = "neutral";
  if (priceChange > 5 && recentVolatility < 0.02) {
    marketRegime = "bull-low-vol";
  } else if (priceChange > 5 && recentVolatility >= 0.02) {
    marketRegime = "bull-high-vol";
  } else if (priceChange < -5 && recentVolatility < 0.02) {
    marketRegime = "bear-low-vol";
  } else if (priceChange < -5 && recentVolatility >= 0.02) {
    marketRegime = "bear-high-vol";
  } else if (recentVolatility >= 0.03) {
    marketRegime = "high-volatility";
  }

  logger.info(`Market regime detected: ${marketRegime}`);

  // 9. Create Learning Report
  logger.info("Phase 9: Creating learning report");
  
  const averageImprovement = strategiesOptimized > 0 ? totalImprovement / strategiesOptimized : 0;
  
  const reportSummary = {
    timestamp: now.toISOString(),
    strategiesOptimized,
    averageImprovement: Number(averageImprovement.toFixed(2)),
    patternsDiscovered,
    botsAdjusted,
    marketRegime,
    riskCalibration: {
      lambda: Number(lambdaAdjustment.toFixed(3)),
      xi: Number(xiAdjustment.toFixed(3)),
      avgDrawdown: Number(avgDrawdown.toFixed(2))
    },
    signalQuality: Array.from(signalQuality.entries()).map(([symbol, data]) => ({
      symbol,
      accuracy: Number(data.accuracy.toFixed(2)),
      weight: data.weight,
      signals: data.total
    })),
    topStrategies: Array.from(strategyPerformance.values())
      .sort((a, b) => b.sharpeRatio - a.sharpeRatio)
      .slice(0, 5)
      .map(p => ({
        name: p.strategy.name,
        winRate: Number(p.winRate.toFixed(2)),
        sharpeRatio: Number(p.sharpeRatio.toFixed(2)),
        totalPnL: Number(p.totalPnL.toFixed(2))
      }))
  };

  // 10. Notify Users
  logger.info("Phase 10: Notifying users");
  
  const users = await api.user.findMany({
    filter: { roles: { contains: "signed-in" } },
    first: 250,
    select: { id: true, email: true }
  });

  for (const user of users) {
    try {
      await api.notification.create({
        user: { _link: user.id },
        type: "system",
        severity: "info",
        title: "Learning Cycle Optimization Complete",
        message: `Optimization completed: ${strategiesOptimized} strategies optimized with avg ${averageImprovement.toFixed(1)}% improvement. ${patternsDiscovered} new patterns discovered. ${botsAdjusted} bots adjusted. Market regime: ${marketRegime}.`,
        metadata: reportSummary,
        isRead: false
      });
    } catch (error) {
      logger.error({ error, userId: user.id }, "Error creating notification");
    }
  }

  logger.info("Learning cycle optimization completed successfully");

  const nextOptimization = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  nextOptimization.setUTCHours(2, 0, 0, 0);

  return {
    strategiesOptimized,
    averageImprovement: Number(averageImprovement.toFixed(2)),
    patternsDiscovered,
    botsAdjusted,
    nextOptimization
  };
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: "0 2 * * *"
      }
    ]
  }
};
