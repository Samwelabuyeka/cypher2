import { ActionOptions } from "gadget-server";
import {
  calculateFamaFrench3Factor,
  calculateFamaFrench5Factor,
  calculateCarhartMomentum,
  performPCA,
  analyzeStyle,
  predictFactorPremiums,
  calculateRiskParityWeights,
  performanceAttribution,
  buildFactorTiltedPortfolio,
} from "../lib/portfolio/factorModels";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting factor-based investing execution");

  try {
    // Step 1: Get current portfolio and market data
    const positions = await api.position.findMany({
      select: {
        id: true,
        symbol: true,
        quantity: true,
        averageEntryPrice: true,
        currentPrice: true,
        marketValue: true,
        user: { id: true },
      },
    });

    const symbols = [...new Set(positions.map((p) => p.symbol))];
    if (symbols.length === 0) {
      logger.warn("No positions found for factor analysis");
      return {
        success: false,
        message: "No positions to analyze",
      };
    }

    // Get historical market data for factor calculation
    const marketData = await api.marketData.findMany({
      filter: {
        symbol: { in: symbols },
        interval: { equals: "1d" },
      },
      sort: { timestamp: "Descending" },
      first: 250, // ~1 year of daily data
      select: {
        symbol: true,
        timestamp: true,
        close: true,
        volume: true,
        high: true,
        low: true,
      },
    });

    logger.info(`Analyzing ${symbols.length} assets with ${marketData.length} data points`);

    // Step 2: Calculate Fama-French 3-Factor Model
    logger.info("Calculating Fama-French 3-Factor model");
    const ff3Results = await calculateFamaFrench3Factor(marketData, positions);
    
    logger.info("FF3 Factors calculated", {
      marketRisk: ff3Results.RMRF,
      sizeEffect: ff3Results.SMB,
      valueEffect: ff3Results.HML,
      alphas: ff3Results.alphas,
    });

    // Step 3: Calculate Fama-French 5-Factor Model
    logger.info("Calculating Fama-French 5-Factor model");
    const ff5Results = await calculateFamaFrench5Factor(marketData, positions);
    
    logger.info("FF5 Factors calculated", {
      profitability: ff5Results.RMW,
      investment: ff5Results.CMA,
      premiumFactors: ff5Results.premiumFactors,
    });

    // Step 4: Calculate Carhart 4-Factor (with momentum)
    logger.info("Calculating Carhart 4-Factor with momentum");
    const carhartResults = await calculateCarhartMomentum(marketData, positions);
    
    logger.info("Momentum factor calculated", {
      UMD: carhartResults.UMD,
      momentumLeaders: carhartResults.momentumLeaders,
    });

    // Step 5: Principal Component Analysis
    logger.info("Performing Principal Component Analysis");
    const pcaResults = await performPCA(marketData, positions, 5);
    
    logger.info("PCA completed", {
      componentsCount: pcaResults.components.length,
      explainedVariance: pcaResults.explainedVariance,
      cumulativeVariance: pcaResults.cumulativeVariance,
    });

    // Step 6: Style Analysis
    logger.info("Analyzing investment style");
    const styleResults = await analyzeStyle(positions, marketData);
    
    logger.info("Style analysis completed", {
      growthVsValue: styleResults.growthValueScore,
      sizeExposure: styleResults.sizeExposure,
      styleDrift: styleResults.styleDrift,
    });

    // Step 7: Factor Timing - Predict which factors will outperform
    logger.info("Predicting factor premiums");
    const factorPredictions = await predictFactorPremiums({
      ff3: ff3Results,
      ff5: ff5Results,
      carhart: carhartResults,
      marketRegime: styleResults.marketRegime,
    });
    
    logger.info("Factor predictions", {
      expectedPremiums: factorPredictions.expectedPremiums,
      recommendedFactors: factorPredictions.recommendedFactors,
    });

    // Step 8: Build Factor-Tilted Portfolio
    logger.info("Building factor-tilted portfolio");
    const targetPortfolio = await buildFactorTiltedPortfolio({
      currentPositions: positions,
      ff5Results,
      carhartResults,
      pcaResults,
      factorPredictions,
      constraints: {
        maxPositionWeight: 0.15,
        minPositionWeight: 0.02,
        targetFactorExposures: factorPredictions.recommendedFactors,
      },
    });

    // Step 9: Calculate Risk Parity weights
    logger.info("Calculating risk parity weights by factor");
    const riskParityWeights = await calculateRiskParityWeights(
      targetPortfolio.weights,
      ff5Results.factorLoadings
    );

    // Adjust portfolio for risk parity
    const finalWeights = targetPortfolio.weights.map((w, i) => ({
      ...w,
      weight: riskParityWeights[i],
    }));

    // Step 10: Performance Attribution
    logger.info("Performing performance attribution");
    const attribution = await performanceAttribution({
      positions,
      factorLoadings: ff5Results.factorLoadings,
      factorReturns: ff5Results.factorReturns,
      benchmarkReturns: ff3Results.RMRF,
    });

    logger.info("Attribution analysis", {
      alpha: attribution.alpha,
      factorContributions: attribution.factorContributions,
      residual: attribution.residual,
    });

    // Step 11: Execute Rebalancing Trades
    logger.info("Executing rebalancing trades");
    const trades = [];
    const rebalanceThreshold = 0.05; // 5% drift threshold

    for (const targetWeight of finalWeights) {
      const currentPosition = positions.find((p) => p.symbol === targetWeight.symbol);
      const totalPortfolioValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
      
      const currentWeight = currentPosition
        ? (currentPosition.marketValue || 0) / totalPortfolioValue
        : 0;
      
      const weightDiff = Math.abs(targetWeight.weight - currentWeight);

      // Only rebalance if drift exceeds threshold
      if (weightDiff > rebalanceThreshold) {
        const targetValue = targetWeight.weight * totalPortfolioValue;
        const currentValue = currentWeight * totalPortfolioValue;
        const tradeDollarAmount = targetValue - currentValue;
        
        const side = tradeDollarAmount > 0 ? "buy" : "sell";
        const quantity = Math.abs(tradeDollarAmount / (currentPosition?.currentPrice || targetWeight.currentPrice || 1));

        if (quantity > 0) {
          try {
            // Find a trading account for this user
            const tradingAccounts = await api.tradingAccount.findMany({
              filter: {
                user: { equals: currentPosition?.user.id },
                isActive: { equals: true },
              },
              first: 1,
            });

            if (tradingAccounts.length > 0) {
              const order = await api.order.create({
                symbol: targetWeight.symbol,
                side,
                quantity,
                type: "market",
                tradingAccount: { _link: tradingAccounts[0].id },
                user: { _link: currentPosition?.user.id },
                metadata: {
                  strategy: "factor-investing",
                  factorTilt: targetWeight.factorTilts,
                  expectedAlpha: targetWeight.expectedAlpha,
                },
              });

              trades.push({
                symbol: targetWeight.symbol,
                side,
                quantity,
                orderId: order.id,
                reason: `Rebalance to factor target (${(targetWeight.weight * 100).toFixed(2)}%)`,
              });

              logger.info(`Executed ${side} order for ${targetWeight.symbol}`, {
                quantity,
                orderId: order.id,
              });
            }
          } catch (error) {
            logger.error(`Failed to execute trade for ${targetWeight.symbol}`, { error });
          }
        }
      }
    }

    // Step 12: Record Performance Metrics
    const performanceMetric = await api.performanceMetric.create({
      metricType: "portfolio-performance",
      timeframe: "daily",
      periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      metrics: {
        factorAnalysis: {
          ff3: ff3Results,
          ff5: ff5Results,
          carhart: carhartResults,
          pca: pcaResults,
          style: styleResults,
          factorPredictions,
        },
        attribution,
        targetWeights: finalWeights,
        tradesExecuted: trades.length,
      },
      user: { _link: positions[0]?.user.id },
    });

    logger.info("Factor investing execution completed", {
      metricsId: performanceMetric.id,
      tradesExecuted: trades.length,
      factorsAnalyzed: ["FF3", "FF5", "Carhart", "PCA", "Style"],
    });

    return {
      success: true,
      message: "Factor-based portfolio rebalancing completed",
      results: {
        factorAnalysis: {
          famaFrench3: {
            RMRF: ff3Results.RMRF,
            SMB: ff3Results.SMB,
            HML: ff3Results.HML,
            topAlphaAssets: ff3Results.alphas?.slice(0, 5),
          },
          famaFrench5: {
            RMW: ff5Results.RMW,
            CMA: ff5Results.CMA,
            premiumFactors: ff5Results.premiumFactors,
          },
          carhart: {
            momentum: carhartResults.UMD,
            momentumLeaders: carhartResults.momentumLeaders?.slice(0, 5),
          },
          pca: {
            components: pcaResults.components.length,
            explainedVariance: pcaResults.explainedVariance,
          },
          style: {
            growthValueScore: styleResults.growthValueScore,
            sizeExposure: styleResults.sizeExposure,
            styleDrift: styleResults.styleDrift,
          },
        },
        factorTiming: {
          expectedPremiums: factorPredictions.expectedPremiums,
          recommendedFactors: factorPredictions.recommendedFactors,
        },
        portfolio: {
          targetWeights: finalWeights.map((w) => ({
            symbol: w.symbol,
            weight: w.weight,
            factorTilts: w.factorTilts,
            expectedAlpha: w.expectedAlpha,
          })),
          riskParity: {
            achieved: true,
            equalRiskContribution: true,
          },
        },
        attribution: {
          alpha: attribution.alpha,
          factorContributions: attribution.factorContributions,
          selectionEffect: attribution.selectionEffect,
          allocationEffect: attribution.allocationEffect,
          residual: attribution.residual,
        },
        execution: {
          tradesExecuted: trades.length,
          trades: trades.map((t) => ({
            symbol: t.symbol,
            side: t.side,
            quantity: t.quantity,
            reason: t.reason,
          })),
        },
        performanceMetricId: performanceMetric.id,
      },
    };
  } catch (error) {
    logger.error("Error in factor investing execution", { error });
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        every: "1 day",
        at: "09:00",
      },
    ],
  },
};
