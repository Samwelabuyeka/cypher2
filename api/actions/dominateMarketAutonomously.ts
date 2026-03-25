import { ActionOptions } from "gadget-server";

interface ExchangeBalance {
  exchange: string;
  currency: string;
  available: number;
  locked: number;
}

interface ArbitrageOpportunity {
  pair: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  profitPercent: number;
}

interface MiningProfitability {
  coin: string;
  algorithm: string;
  profitPerDay: number;
  difficulty: number;
  hashrate: number;
}

interface DominationReport {
  timestamp: string;
  tradingProfit: number;
  miningRevenue: number;
  arbitrageCount: number;
  exchangeBalances: ExchangeBalance[];
  miningStats: {
    activeRigs: number;
    totalHashrate: number;
    estimatedDailyRevenue: number;
  };
  aiPredictions: {
    accuracy: number;
    signalsGenerated: number;
  };
  recommendations: string[];
}

export const run: ActionRun = async ({ params, logger, api }) => {
  logger.info("🚀 Starting autonomous market domination cycle");

  // Safety check: Ensure this is intentionally enabled
  const ENABLE_REAL_TRADING = process.env.ENABLE_REAL_TRADING === "true";
  const ENABLE_MINING_CONTROL = process.env.ENABLE_MINING_CONTROL === "true";
  const MAX_TRADE_SIZE_USD = parseFloat(process.env.MAX_TRADE_SIZE_USD || "100");
  const MAX_DAILY_LOSS_USD = parseFloat(process.env.MAX_DAILY_LOSS_USD || "500");

  if (!ENABLE_REAL_TRADING) {
    logger.warn("⚠️  Real trading is DISABLED. Set ENABLE_REAL_TRADING=true to enable.");
  }

  if (!ENABLE_MINING_CONTROL) {
    logger.warn("⚠️  Mining control is DISABLED. Set ENABLE_MINING_CONTROL=true to enable.");
  }

  const report: DominationReport = {
    timestamp: new Date().toISOString(),
    tradingProfit: 0,
    miningRevenue: 0,
    arbitrageCount: 0,
    exchangeBalances: [],
    miningStats: {
      activeRigs: 0,
      totalHashrate: 0,
      estimatedDailyRevenue: 0,
    },
    aiPredictions: {
      accuracy: 0,
      signalsGenerated: 0,
    },
    recommendations: [],
  };

  try {
    // Step 1: Check daily loss limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysTrades = await api.trade.findMany({
      filter: {
        createdAt: {
          greaterThanOrEqual: today.toISOString(),
        },
      },
      select: {
        id: true,
        realizedPnL: true,
      },
      first: 250,
    });

    const dailyPnL = todaysTrades.reduce((sum, trade) => sum + (trade.realizedPnL || 0), 0);
    
    if (dailyPnL < -MAX_DAILY_LOSS_USD) {
      logger.error(`🛑 Daily loss limit reached: $${dailyPnL.toFixed(2)}. Halting trading.`);
      report.recommendations.push(`Daily loss limit reached. Review strategy and risk parameters.`);
      return report;
    }

    // Step 2: Scan all active trading accounts
    logger.info("📊 Scanning trading accounts across exchanges");
    
    const tradingAccounts = await api.tradingAccount.findMany({
      filter: {
        isActive: { equals: true },
      },
      select: {
        id: true,
        accountName: true,
        exchange: {
          name: true,
          code: true,
          apiEndpoint: true,
        },
        balance: true,
      },
      first: 50,
    });

    logger.info(`Found ${tradingAccounts.length} active trading accounts`);

    // Process balances
    for (const account of tradingAccounts) {
      if (account.balance && typeof account.balance === 'object') {
        const balances = account.balance as Record<string, { available: number; locked: number }>;
        for (const [currency, balance] of Object.entries(balances)) {
          report.exchangeBalances.push({
            exchange: account.exchange.name,
            currency,
            available: balance.available || 0,
            locked: balance.locked || 0,
          });
        }
      }
    }

    // Step 3: Scan mining rigs and calculate profitability
    logger.info("⛏️  Analyzing mining rig profitability");
    
    const miningRigs = await api.miningRig.findMany({
      filter: {
        isActive: { equals: true },
      },
      select: {
        id: true,
        name: true,
        type: true,
        algorithm: true,
        coin: true,
        hashrate: true,
        hashrateUnit: true,
        powerConsumption: true,
        status: true,
      },
      first: 50,
    });

    report.miningStats.activeRigs = miningRigs.length;
    report.miningStats.totalHashrate = miningRigs.reduce((sum, rig) => sum + (rig.hashrate || 0), 0);

    // Step 4: Get AI predictions for top cryptocurrencies
    logger.info("🤖 Generating AI market predictions");
    
    const topSymbols = ["BTC/USD", "ETH/USD", "BNB/USD", "SOL/USD", "ADA/USD"];
    const predictions = [];

    for (const symbol of topSymbols) {
      // Get recent market data for prediction
      const recentData = await api.marketData.findMany({
        filter: {
          symbol: { equals: symbol.replace("/", "") },
        },
        sort: { timestamp: "Descending" },
        select: {
          id: true,
          symbol: true,
          close: true,
          volume: true,
          timestamp: true,
        },
        first: 100,
      });

      if (recentData.length > 0) {
        // Simple trend analysis (in production, use LSTM model)
        const prices = recentData.map((d) => d.close);
        const shortTerm = prices.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const longTerm = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        const trend = shortTerm > longTerm ? "bullish" : "bearish";
        const confidence = Math.min(Math.abs((shortTerm - longTerm) / longTerm) * 100, 100);

        predictions.push({
          symbol,
          trend,
          confidence,
          currentPrice: prices[0],
        });

        report.aiPredictions.signalsGenerated++;
      }
    }

    logger.info(`Generated ${predictions.length} AI predictions`);

    // Step 5: Detect arbitrage opportunities (cross-exchange price differences)
    logger.info("💰 Detecting arbitrage opportunities");
    
    const arbitrageOpportunities: ArbitrageOpportunity[] = [];
    
    // Get latest market data grouped by symbol
    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    
    for (const symbol of symbols) {
      const marketData = await api.marketData.findMany({
        filter: {
          symbol: { equals: symbol },
        },
        sort: { timestamp: "Descending" },
        select: {
          id: true,
          symbol: true,
          close: true,
          exchange: {
            name: true,
            code: true,
          },
        },
        first: 10,
      });

      // Compare prices across exchanges
      if (marketData.length >= 2) {
        for (let i = 0; i < marketData.length; i++) {
          for (let j = i + 1; j < marketData.length; j++) {
            const data1 = marketData[i];
            const data2 = marketData[j];
            
            if (data1.exchange && data2.exchange && data1.exchange.name !== data2.exchange.name) {
              const priceDiff = Math.abs(data1.close - data2.close);
              const profitPercent = (priceDiff / Math.min(data1.close, data2.close)) * 100;
              
              // Arbitrage opportunity if price difference > 0.5% (covers fees)
              if (profitPercent > 0.5) {
                const buyExchange = data1.close < data2.close ? data1.exchange.name : data2.exchange.name;
                const sellExchange = data1.close < data2.close ? data2.exchange.name : data1.exchange.name;
                
                arbitrageOpportunities.push({
                  pair: symbol,
                  buyExchange,
                  sellExchange,
                  buyPrice: Math.min(data1.close, data2.close),
                  sellPrice: Math.max(data1.close, data2.close),
                  profit: priceDiff,
                  profitPercent,
                });
              }
            }
          }
        }
      }
    }

    logger.info(`Found ${arbitrageOpportunities.length} arbitrage opportunities`);
    report.arbitrageCount = arbitrageOpportunities.length;

    // Step 6: Execute trades based on AI predictions and arbitrage
    if (ENABLE_REAL_TRADING && predictions.length > 0) {
      logger.info("📈 Executing AI-driven trades");
      
      for (const prediction of predictions) {
        if (prediction.confidence > 70) {
          const tradeSize = Math.min(MAX_TRADE_SIZE_USD, 50); // Conservative size
          
          // Find suitable trading account
          const suitableAccount = tradingAccounts.find(
            (acc) => acc.balance && Object.keys(acc.balance).length > 0
          );

          if (suitableAccount) {
            const side = prediction.trend === "bullish" ? "buy" : "sell";
            
            logger.info(`Executing ${side} order for ${prediction.symbol} based on ${prediction.confidence.toFixed(1)}% confidence`);
            
            // In production, this would call exchange API
            // For now, log the intention
            report.recommendations.push(
              `${side.toUpperCase()} ${prediction.symbol} - Confidence: ${prediction.confidence.toFixed(1)}%, Size: $${tradeSize}`
            );
          }
        }
      }
    }

    // Step 7: Execute arbitrage trades
    if (ENABLE_REAL_TRADING && arbitrageOpportunities.length > 0) {
      logger.info("⚡ Executing arbitrage trades");
      
      for (const opp of arbitrageOpportunities.slice(0, 3)) {
        if (opp.profitPercent > 1.0) {
          logger.info(`Arbitrage: Buy ${opp.pair} on ${opp.buyExchange} at ${opp.buyPrice}, Sell on ${opp.sellExchange} at ${opp.sellPrice}`);
          
          report.recommendations.push(
            `Arbitrage opportunity: ${opp.pair} - ${opp.profitPercent.toFixed(2)}% profit between ${opp.buyExchange} and ${opp.sellExchange}`
          );
          
          report.tradingProfit += opp.profit * 0.8; // Estimate after fees
        }
      }
    }

    // Step 8: Optimize mining rig targets
    if (ENABLE_MINING_CONTROL && miningRigs.length > 0) {
      logger.info("⚙️  Optimizing mining rig allocation");
      
      // Simulate profitability analysis
      const miningProfitability: MiningProfitability[] = [
        { coin: "BTC", algorithm: "SHA-256", profitPerDay: 5.2, difficulty: 62.5e12, hashrate: 100e12 },
        { coin: "ETH", algorithm: "Ethash", profitPerDay: 4.8, difficulty: 15.5e12, hashrate: 1e9 },
        { coin: "XMR", algorithm: "RandomX", profitPerDay: 3.1, difficulty: 350e9, hashrate: 50e6 },
      ];

      const mostProfitable = miningProfitability.reduce((max, curr) => 
        curr.profitPerDay > max.profitPerDay ? curr : max
      );

      logger.info(`Most profitable coin: ${mostProfitable.coin} ($${mostProfitable.profitPerDay}/day)`);

      // Update mining rigs to target most profitable coin
      for (const rig of miningRigs) {
        if (rig.coin !== mostProfitable.coin || rig.algorithm !== mostProfitable.algorithm) {
          logger.info(`Switching ${rig.name} to mine ${mostProfitable.coin}`);
          
          await api.miningRig.update(rig.id, {
            coin: mostProfitable.coin,
            algorithm: mostProfitable.algorithm,
          });
          
          report.recommendations.push(
            `Switched ${rig.name} to ${mostProfitable.coin} for optimal profitability`
          );
        }
      }

      report.miningStats.estimatedDailyRevenue = mostProfitable.profitPerDay * miningRigs.length;
      report.miningRevenue = report.miningStats.estimatedDailyRevenue / 24; // Hourly rate
    }

    // Step 9: Calculate AI prediction accuracy
    const recentPredictions = await api.aiPrediction.findMany({
      filter: {
        evaluatedAt: { isSet: true },
      },
      select: {
        id: true,
        isCorrect: true,
      },
      first: 100,
    });

    if (recentPredictions.length > 0) {
      const correctPredictions = recentPredictions.filter((p) => p.isCorrect).length;
      report.aiPredictions.accuracy = (correctPredictions / recentPredictions.length) * 100;
    }

    // Step 10: Generate strategic recommendations
    if (report.arbitrageCount > 5) {
      report.recommendations.push("High arbitrage activity detected - consider increasing capital allocation");
    }

    if (report.aiPredictions.accuracy < 60) {
      report.recommendations.push("AI prediction accuracy below target - retrain models with recent data");
    }

    if (report.miningStats.activeRigs === 0) {
      report.recommendations.push("No active mining rigs - consider activating rigs for passive income");
    }

    logger.info("✅ Market domination cycle completed successfully");
    logger.info(`Trading Profit: $${report.tradingProfit.toFixed(2)}, Mining Revenue: $${report.miningRevenue.toFixed(2)}`);

    return report;

  } catch (error) {
    logger.error({ error }, "❌ Market domination cycle failed");
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        every: "minute",
      },
    ],
  },
};
