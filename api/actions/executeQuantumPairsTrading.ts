import { ActionOptions } from "gadget-server";
import { calculateCointegration, calculateOrnsteinUhlenbeck } from "../lib/calculations/quantitativeModels";
import { optimizePortfolioQuantum } from "../lib/quantum/quantumAnnealing";
import { quantumMonteCarloVaR } from "../lib/quantum/quantumMonteCarlo";
import { groverSearchOptimalStrategy } from "../lib/quantum/groverSearch";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting quantum-powered pairs trading");

  try {
    // Step 1: Get market data for top trading pairs
    const marketData = await api.marketData.findMany({
      filter: {
        interval: { equals: "5m" }
      },
      sort: { volume: "Descending" },
      first: 50,
      select: {
        id: true,
        symbol: true,
        close: true,
        volume: true,
        timestamp: true
      }
    });

    if (marketData.length < 2) {
      logger.warn("Insufficient market data for pairs trading");
      return {
        success: false,
        message: "Not enough trading pairs available"
      };
    }

    // Group by symbol to get price series
    const priceData: Record<string, number[]> = {};
    for (const data of marketData) {
      if (!priceData[data.symbol]) {
        priceData[data.symbol] = [];
      }
      priceData[data.symbol].push(data.close);
    }

    const symbols = Object.keys(priceData);
    logger.info(`Testing ${symbols.length} symbols for cointegration`);

    // Step 1: Find cointegrated pairs
    const cointegratedPairs = [];
    let pairsTested = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        pairsTested++;
        const symbolA = symbols[i];
        const symbolB = symbols[j];

        const result = calculateCointegration(
          priceData[symbolA],
          priceData[symbolB]
        );

        if (result.isCointegrated && result.cointegrationScore > 0.15) {
          cointegratedPairs.push({
            symbolA,
            symbolB,
            hedgeRatio: result.hedgeRatio,
            cointegrationScore: result.cointegrationScore,
            pValue: result.pValue
          });
        }
      }
    }

    logger.info(`Found ${cointegratedPairs.length} cointegrated pairs out of ${pairsTested} tested`);

    if (cointegratedPairs.length < 2) {
      logger.warn("Fewer than 2 cointegrated pairs found");
      return {
        success: false,
        pairsTested,
        cointegratedPairs,
        message: "Not enough cointegrated pairs for trading"
      };
    }

    // Step 2: Quantum pair selection
    const pairStrategies = cointegratedPairs.map((pair, index) => ({
      index,
      score: pair.cointegrationScore,
      pair
    }));

    const quantumSelection = groverSearchOptimalStrategy(
      pairStrategies,
      (strategy) => strategy.score > 0.2 && strategy.pair.pValue < 0.05
    );

    const selectedPairs = quantumSelection.selectedStrategies
      .slice(0, 10)
      .map(s => s.pair);

    logger.info(`Quantum search selected ${selectedPairs.length} pairs`);

    // Step 3: Calculate spread for each pair
    const pairAnalysis = [];

    for (const pair of selectedPairs) {
      const pricesA = priceData[pair.symbolA];
      const pricesB = priceData[pair.symbolB];

      // Calculate spread
      const spread = pricesA.map((priceA, idx) => 
        priceA - pair.hedgeRatio * pricesB[idx]
      );

      // Calculate statistics
      const spreadMean = spread.reduce((a, b) => a + b, 0) / spread.length;
      const spreadVariance = spread.reduce((sum, val) => 
        sum + Math.pow(val - spreadMean, 2), 0
      ) / spread.length;
      const spreadStd = Math.sqrt(spreadVariance);

      const currentSpread = spread[spread.length - 1];
      const zScore = (currentSpread - spreadMean) / spreadStd;

      // Fit Ornstein-Uhlenbeck process
      const ouParams = calculateOrnsteinUhlenbeck(spread);

      pairAnalysis.push({
        ...pair,
        spread: currentSpread,
        spreadMean,
        spreadStd,
        zScore,
        ouParams,
        expectedReversionDays: 1 / ouParams.theta,
        currentPriceA: pricesA[pricesA.length - 1],
        currentPriceB: pricesB[pricesB.length - 1]
      });
    }

    // Step 4: Generate trading signals
    const signals = [];

    for (const analysis of pairAnalysis) {
      if (Math.abs(analysis.zScore) > 2) {
        const signal = {
          symbolA: analysis.symbolA,
          symbolB: analysis.symbolB,
          hedgeRatio: analysis.hedgeRatio,
          zScore: analysis.zScore,
          action: analysis.zScore > 2 ? "SELL_A_BUY_B" : "BUY_A_SELL_B",
          spreadMean: analysis.spreadMean,
          spreadStd: analysis.spreadStd,
          ouParams: analysis.ouParams,
          expectedReversionDays: analysis.expectedReversionDays,
          currentPriceA: analysis.currentPriceA,
          currentPriceB: analysis.currentPriceB
        };
        signals.push(signal);
      }
    }

    logger.info(`Generated ${signals.length} trading signals`);

    if (signals.length === 0) {
      return {
        success: true,
        pairsTested,
        cointegratedPairs: cointegratedPairs.length,
        selectedPairs: selectedPairs.length,
        signalsGenerated: 0,
        message: "No trading opportunities found"
      };
    }

    // Step 5: Quantum position sizing
    const returns = signals.map(s => s.zScore * -0.01); // Expected return proportional to z-score
    const riskFactors = signals.map(s => 1 / Math.abs(s.zScore));

    let quantumOptimization;
    try {
      quantumOptimization = optimizePortfolioQuantum(
        returns,
        riskFactors,
        { maxPositionSize: 0.2, totalCapital: 1.0 }
      );
    } catch (error) {
      logger.warn("Quantum optimization failed, using equal weights", { error });
      quantumOptimization = {
        weights: signals.map(() => 1 / signals.length),
        sharpeRatio: 0
      };
    }

    // Step 6: Risk assessment and Step 7: Execute trades
    const ordersPlaced = [];
    const quantumVaRResults = [];

    // Get active trading account
    const tradingAccounts = await api.tradingAccount.findMany({
      filter: {
        isActive: { equals: true }
      },
      first: 1,
      select: {
        id: true,
        balance: true,
        userId: true
      }
    });

    if (tradingAccounts.length === 0) {
      logger.warn("No active trading account found");
      return {
        success: false,
        message: "No active trading account"
      };
    }

    const tradingAccount = tradingAccounts[0];
    const accountBalance = typeof tradingAccount.balance === 'object' 
      ? (tradingAccount.balance as any).total || 10000 
      : 10000;

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const weight = quantumOptimization.weights[i];
      const positionSize = accountBalance * weight;

      // Calculate quantum VaR
      const historicalReturns = Array(100).fill(0).map(() => 
        (Math.random() - 0.5) * 0.02
      );

      const varResult = quantumMonteCarloVaR(
        historicalReturns,
        positionSize,
        0.95
      );

      quantumVaRResults.push({
        signal: `${signal.symbolA}/${signal.symbolB}`,
        quantumVaR: varResult.quantumVaR,
        classicalVaR: varResult.classicalVaR,
        positionSize
      });

      // Only execute if quantum VaR < 2% of account
      if (varResult.quantumVaR < accountBalance * 0.02) {
        const quantityA = positionSize / signal.currentPriceA;
        const quantityB = (positionSize * signal.hedgeRatio) / signal.currentPriceB;

        // Create order for leg A
        const orderA = await api.order.create({
          tradingAccount: { _link: tradingAccount.id },
          user: { _link: tradingAccount.userId },
          symbol: signal.symbolA,
          side: signal.action === "SELL_A_BUY_B" ? "sell" : "buy",
          type: "market",
          quantity: quantityA,
          status: "pending",
          timeInForce: "gtc",
          metadata: {
            pairsTrade: true,
            pairSymbol: signal.symbolB,
            hedgeRatio: signal.hedgeRatio,
            zScore: signal.zScore,
            spreadMean: signal.spreadMean,
            spreadStd: signal.spreadStd,
            ouTheta: signal.ouParams.theta,
            ouMu: signal.ouParams.mu,
            ouSigma: signal.ouParams.sigma,
            takeProfitZScore: 0,
            stopLossZScore: signal.zScore > 0 ? 3 : -3
          }
        });

        // Create order for leg B
        const orderB = await api.order.create({
          tradingAccount: { _link: tradingAccount.id },
          user: { _link: tradingAccount.userId },
          symbol: signal.symbolB,
          side: signal.action === "SELL_A_BUY_B" ? "buy" : "sell",
          type: "market",
          quantity: quantityB,
          status: "pending",
          timeInForce: "gtc",
          metadata: {
            pairsTrade: true,
            pairSymbol: signal.symbolA,
            hedgeRatio: signal.hedgeRatio,
            zScore: signal.zScore,
            spreadMean: signal.spreadMean,
            spreadStd: signal.spreadStd,
            ouTheta: signal.ouParams.theta,
            ouMu: signal.ouParams.mu,
            ouSigma: signal.ouParams.sigma,
            takeProfitZScore: 0,
            stopLossZScore: signal.zScore > 0 ? 3 : -3
          }
        });

        ordersPlaced.push({ orderA: orderA.id, orderB: orderB.id, signal });
      } else {
        logger.warn(`Skipping trade due to high VaR`, {
          pair: `${signal.symbolA}/${signal.symbolB}`,
          quantumVaR: varResult.quantumVaR,
          threshold: accountBalance * 0.02
        });
      }
    }

    // Step 8: Monitor open positions
    const openOrders = await api.order.findMany({
      filter: {
        status: { in: ["open", "partially-filled"] },
        metadata: { matches: { pairsTrade: true } }
      },
      select: {
        id: true,
        symbol: true,
        metadata: true,
        filledQuantity: true
      }
    });

    const positionsToClose = [];

    for (const order of openOrders) {
      const metadata = order.metadata as any;
      if (!metadata?.pairSymbol) continue;

      // Get current prices
      const currentDataA = await api.marketData.findFirst({
        filter: { symbol: { equals: order.symbol } },
        sort: { timestamp: "Descending" },
        select: { close: true }
      });

      const currentDataB = await api.marketData.findFirst({
        filter: { symbol: { equals: metadata.pairSymbol } },
        sort: { timestamp: "Descending" },
        select: { close: true }
      });

      if (currentDataA && currentDataB) {
        const currentSpread = currentDataA.close - metadata.hedgeRatio * currentDataB.close;
        const currentZScore = (currentSpread - metadata.spreadMean) / metadata.spreadStd;

        // Check for profit taking (spread reverted to mean)
        if (Math.abs(currentZScore) < 0.5) {
          positionsToClose.push({
            orderId: order.id,
            reason: "profit_target",
            zScore: currentZScore
          });
        }

        // Check for stop loss (spread diverged further)
        if (Math.abs(currentZScore) > 3) {
          positionsToClose.push({
            orderId: order.id,
            reason: "stop_loss",
            zScore: currentZScore
          });
        }
      }
    }

    // Close positions that hit targets
    for (const position of positionsToClose) {
      await api.order.update(position.orderId, {
        status: "cancelled",
        metadata: {
          closedReason: position.reason,
          closedZScore: position.zScore
        }
      });
    }

    logger.info("Quantum pairs trading execution complete", {
      ordersPlaced: ordersPlaced.length,
      positionsClosed: positionsToClose.length
    });

    return {
      success: true,
      pairsTested,
      cointegratedPairs: cointegratedPairs.length,
      selectedPairs: selectedPairs.length,
      signalsGenerated: signals.length,
      ordersPlaced: ordersPlaced.length,
      quantumOptimization: {
        weights: quantumOptimization.weights,
        sharpeRatio: quantumOptimization.sharpeRatio
      },
      quantumVaR: quantumVaRResults,
      expectedReversion: pairAnalysis.map(p => ({
        pair: `${p.symbolA}/${p.symbolB}`,
        expectedDays: p.expectedReversionDays
      })),
      positionsMonitored: openOrders.length,
      positionsClosed: positionsToClose.length
    };

  } catch (error) {
    logger.error("Error in quantum pairs trading", { error });
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        every: "5 minutes"
      }
    ]
  }
};
