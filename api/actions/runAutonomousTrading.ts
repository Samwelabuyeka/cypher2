import { ActionOptions } from "gadget-server";
import { multiLayerRiskAnalysis } from "../lib/calculations/riskMetrics";
import { optimizePositionSize } from "../lib/calculations/portfolioMetrics";
import { calculateGrowthPotential } from "../lib/calculations/quantitativeModels";

interface TradingReport {
  botsProcessed: number;
  signalsGenerated: number;
  ordersExecuted: number;
  positionsManaged: number;
  totalProfit: number;
  riskScore: number;
  errors: string[];
}

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  const report: TradingReport = {
    botsProcessed: 0,
    signalsGenerated: 0,
    ordersExecuted: 0,
    positionsManaged: 0,
    totalProfit: 0,
    riskScore: 0,
    errors: []
  };

  try {
    logger.info("Starting autonomous trading cycle");

    // Phase 1: Market Analysis
    logger.info("Phase 1: Market Analysis");
    let marketAnalysis;
    try {
      const marketDataRecords = await api.marketData.findMany({
        first: 100,
        sort: { timestamp: "Descending" },
        select: {
          id: true,
          symbol: true,
          close: true,
          volume: true,
          timestamp: true,
          high: true,
          low: true,
          open: true
        }
      });

      marketAnalysis = {
        opportunities: marketDataRecords.slice(0, 10),
        riskWarnings: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Market analysis failed");
      report.errors.push(`Market analysis: ${errorMessage}`);
    }

    // Phase 2: Bot Selection
    logger.info("Phase 2: Bot Selection");
    const activeBots = await api.tradingBot.findMany({
      filter: {
        AND: [
          { isActive: { equals: true } },
          { status: { equals: "running" } }
        ]
      },
      select: {
        id: true,
        name: true,
        riskLevel: true,
        tradingPairs: true,
        totalProfit: true,
        totalTrades: true,
        winningTrades: true,
        maxDailyLoss: true,
        maxPositionSize: true,
        strategyId: true,
        userId: true
      }
    });

    logger.info(`Found ${activeBots.length} active bots`);

    // Process each bot
    for (const bot of activeBots) {
      try {
        report.botsProcessed++;
        logger.info(`Processing bot: ${bot.name} (${bot.id})`);

        // Phase 3: Signal Generation
        const tradingPairs = Array.isArray(bot.tradingPairs) ? bot.tradingPairs : [];
        const signals = [];

        for (const pair of tradingPairs) {
          try {
            const marketData = await api.marketData.findMany({
              first: 50,
              filter: { symbol: { equals: pair as any } },
              sort: { timestamp: "Descending" },
              select: {
                id: true,
                close: true,
                volume: true,
                high: true,
                low: true,
                timestamp: true
              }
            });

            if (marketData.length > 0) {
              const latestPrice = marketData[0].close;
              const confidence = calculateGrowthPotential(marketData.map(d => d.close));
              
              // Confidence thresholds based on risk level
              const thresholds = {
                conservative: 0.75,
                moderate: 0.65,
                aggressive: 0.55,
                extreme: 0.45
              };

              const threshold = thresholds[bot.riskLevel] || 0.65;

              if (confidence > threshold) {
                signals.push({
                  symbol: pair,
                  confidence,
                  currentPrice: latestPrice,
                  action: confidence > 0.8 ? 'buy' : 'hold'
                });
                report.signalsGenerated++;
              }
            }
          } catch (error) {
            logger.warn({ error, pair }, "Signal generation failed for pair");
          }
        }

        // Phase 4: Risk Management
        const positions = await api.position.findMany({
          filter: {
            AND: [
              { userId: { equals: bot.userId } },
              { strategyId: { equals: bot.strategyId } }
            ]
          },
          select: {
            id: true,
            symbol: true,
            quantity: true,
            averageEntryPrice: true,
            currentPrice: true,
            unrealizedPnL: true,
            side: true,
            userId: true
          }
        });

        const riskAnalysis = multiLayerRiskAnalysis({
          positions,
          maxDailyLoss: bot.maxDailyLoss,
          totalProfit: bot.totalProfit
        });

        report.riskScore = Math.max(report.riskScore, riskAnalysis.overallRisk);

        // Phase 5: Position Management
        for (const position of positions) {
          try {
            const unrealizedPnL = position.unrealizedPnL || 0;
            const unrealizedPnLPercent = position.averageEntryPrice 
              ? (unrealizedPnL / (position.averageEntryPrice * position.quantity)) * 100 
              : 0;

            if (unrealizedPnLPercent < -10) {
              logger.warn(`Position ${position.id} has high loss: ${unrealizedPnLPercent.toFixed(2)}%`);
              
              // Close position if loss exceeds threshold
              if (unrealizedPnLPercent < -15) {
                await api.order.create({
                  userId: bot.userId,
                  tradingAccountId: position.tradingAccountId,
                  symbol: position.symbol,
                  side: position.side === "long" ? "sell" : "buy",
                  type: "market",
                  quantity: position.quantity,
                  status: "pending",
                  timeInForce: "gtc"
                });
                
                report.positionsManaged++;
                logger.info(`Created close order for position ${position.id}`);
              }
            }
          } catch (error) {
            logger.error({ error, positionId: position.id }, "Position management failed");
          }
        }

        // Phase 6: Order Execution
        for (const signal of signals) {
          try {
            if (signal.action === 'buy' && riskAnalysis.availableRiskBudget > 0) {
              const positionSize = optimizePositionSize({
                availableCapital: riskAnalysis.availableRiskBudget,
                maxPositionSize: bot.maxPositionSize,
                confidence: signal.confidence,
                currentPrice: signal.currentPrice
              });

              if (positionSize > 0) {
                // Find trading account for this bot's user
                const tradingAccounts = await api.tradingAccount.findMany({
                  first: 1,
                  filter: {
                    AND: [
                      { userId: { equals: bot.userId } },
                      { isActive: { equals: true } }
                    ]
                  },
                  select: { id: true }
                });

                if (tradingAccounts.length > 0) {
                  await api.order.create({
                    userId: bot.userId,
                    tradingAccountId: tradingAccounts[0].id,
                    symbol: signal.symbol,
                    side: "buy",
                    type: "limit",
                    quantity: positionSize,
                    price: signal.currentPrice,
                    status: "pending",
                    timeInForce: "gtc",
                    strategyId: bot.strategyId
                  });

                  report.ordersExecuted++;
                  logger.info(`Created order for ${signal.symbol} with size ${positionSize}`);
                }
              }
            }
          } catch (error) {
            logger.error({ error, signal }, "Order execution failed");
          }
        }

        // Phase 7: Learning Phase
        const recentTrades = await api.trade.findMany({
          first: 50,
          filter: {
            AND: [
              { userId: { equals: bot.userId } },
              { strategyId: { equals: bot.strategyId } }
            ]
          },
          sort: { executedAt: "Descending" },
          select: {
            id: true,
            realizedPnL: true,
            symbol: true,
            executedAt: true
          }
        });

        if (recentTrades.length > 0) {
          const totalPnL = recentTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
          report.totalProfit += totalPnL;

          const winningTradesCount = recentTrades.filter(t => (t.realizedPnL || 0) > 0).length;
          const accuracy = winningTradesCount / recentTrades.length;

          // Update bot stats
          await api.tradingBot.update(bot.id, {
            totalProfit: (bot.totalProfit || 0) + totalPnL,
            totalTrades: (bot.totalTrades || 0) + recentTrades.length,
            winningTrades: (bot.winningTrades || 0) + winningTradesCount,
            lastTradeAt: recentTrades[0].executedAt
          });

          logger.info(`Bot ${bot.name} accuracy: ${(accuracy * 100).toFixed(2)}%`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error, botId: bot.id, botName: bot.name }, "Bot processing failed");
        report.errors.push(`Bot ${bot.name}: ${errorMessage}`);
      }
    }

    // Phase 8: Reporting
    logger.info("Phase 8: Creating performance metrics");
    try {
      await api.performanceMetric.create({
        metricType: "account-performance",
        timeframe: "hourly",
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(),
        totalPnL: report.totalProfit,
        numberOfTrades: report.ordersExecuted,
        metrics: {
          botsProcessed: report.botsProcessed,
          signalsGenerated: report.signalsGenerated,
          positionsManaged: report.positionsManaged,
          riskScore: report.riskScore
        }
      });
    } catch (error) {
      logger.warn({ error }, "Failed to create performance metric");
    }

    // Send critical notifications
    if (report.riskScore > 0.8) {
      logger.warn("High risk score detected", { riskScore: report.riskScore });
    }

    logger.info("Autonomous trading cycle completed", report);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, "Autonomous trading cycle failed");
    report.errors.push(`Main cycle: ${errorMessage}`);
  }

  return report;
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "*/15 * * * *" }]
  }
};
