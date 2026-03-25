import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const symbols = params.symbols || ['BTC/USDT', 'ETH/USDT'];
  const strategy = params.strategy || 'market-making';
  const maxPositionSize = params.maxPositionSize || 1000;
  const targetProfitBps = params.targetProfitBps || 10;

  logger.info({ symbols, strategy, maxPositionSize, targetProfitBps }, "Starting HFT execution");

  const MAX_OPEN_POSITIONS = 10;
  const STOP_LOSS_PERCENT = 0.1;
  const DAILY_LOSS_LIMIT_PERCENT = 5;
  const MAX_LATENCY_MS = 500;
  const TARGET_LATENCY_MS = 100;

  let tradesExecuted = 0;
  let totalLatency = 0;
  let totalProfit = 0;
  let winningTrades = 0;
  const executedTrades = [];

  try {
    // Import HFT components
    const { OrderExecutor } = await import("../lib/hft/orderExecutor");
    
    // Initialize HFT components
    const orderExecutor = new OrderExecutor();
    
    // Check current open positions
    const openPositions = await api.position.findMany({
      filter: {
        quantity: { greaterThan: 0 }
      },
      select: { id: true }
    });

    if (openPositions.length >= MAX_OPEN_POSITIONS) {
      logger.warn({ count: openPositions.length }, "Maximum open positions reached");
      return {
        tradesExecuted: 0,
        avgLatency: 0,
        totalProfit: 0,
        winRate: 0,
        status: 'paused'
      };
    }

    // Process each symbol
    for (const symbol of symbols) {
      const startTime = Date.now();
      
      // Measure latency to exchanges
      const latency = Math.random() * 150 + 50; // Simulated latency 50-200ms
      totalLatency += latency;

      if (latency > MAX_LATENCY_MS) {
        logger.warn({ symbol, latency }, "High latency detected, skipping symbol");
        continue;
      }

      // Fetch market data
      const marketData = await api.marketData.findMany({
        filter: {
          symbol: { equals: symbol }
        },
        sort: { timestamp: "Descending" },
        first: 10,
        select: {
          id: true,
          symbol: true,
          close: true,
          volume: true,
          timestamp: true,
          high: true,
          low: true
        }
      });

      if (marketData.length === 0) {
        logger.warn({ symbol }, "No market data found");
        continue;
      }

      const currentPrice = marketData[0].close;
      let tradeDecision = null;

      // Strategy-specific logic
      switch (strategy) {
        case 'market-making':
          // Place simultaneous buy and sell orders around current price
          const spread = currentPrice * 0.001; // 0.1% spread
          const buyPrice = currentPrice - spread / 2;
          const sellPrice = currentPrice + spread / 2;
          
          tradeDecision = {
            side: Math.random() > 0.5 ? 'buy' : 'sell',
            price: Math.random() > 0.5 ? buyPrice : sellPrice,
            quantity: maxPositionSize / currentPrice,
            orderType: 'limit'
          };
          break;

        case 'momentum':
          // Detect rapid price movements
          if (marketData.length >= 3) {
            const recentChange = (marketData[0].close - marketData[2].close) / marketData[2].close;
            if (Math.abs(recentChange) > 0.005) { // 0.5% movement
              tradeDecision = {
                side: recentChange > 0 ? 'buy' : 'sell',
                price: currentPrice,
                quantity: maxPositionSize / currentPrice,
                orderType: 'market'
              };
            }
          }
          break;

        case 'mean-reversion':
          // Calculate mean and deviation
          if (marketData.length >= 5) {
            const prices = marketData.slice(0, 5).map(d => d.close);
            const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
            const deviation = (currentPrice - mean) / mean;
            
            if (Math.abs(deviation) > 0.01) { // 1% deviation
              tradeDecision = {
                side: deviation > 0 ? 'sell' : 'buy', // Trade against the move
                price: currentPrice,
                quantity: maxPositionSize / currentPrice,
                orderType: 'market'
              };
            }
          }
          break;

        case 'statistical-arbitrage':
          // Simplified stat arb - look for volatility spikes
          if (marketData.length >= 5) {
            const volatility = marketData[0].high - marketData[0].low;
            const avgVolatility = marketData.slice(0, 5).reduce((sum, d) => sum + (d.high - d.low), 0) / 5;
            
            if (volatility > avgVolatility * 1.5) {
              tradeDecision = {
                side: Math.random() > 0.5 ? 'buy' : 'sell',
                price: currentPrice,
                quantity: maxPositionSize / currentPrice,
                orderType: 'limit'
              };
            }
          }
          break;
      }

      // Execute trade if decision made
      if (tradeDecision) {
        // Get or create trading account
        const tradingAccounts = await api.tradingAccount.findMany({
          filter: { isActive: { equals: true } },
          first: 1,
          select: { id: true }
        });

        if (tradingAccounts.length === 0) {
          logger.warn("No active trading account found");
          continue;
        }

        const tradingAccountId = tradingAccounts[0].id;
        
        // Simulate trade execution
        const executionPrice = tradeDecision.price * (1 + (Math.random() - 0.5) * 0.0001); // Slippage
        const fee = executionPrice * tradeDecision.quantity * 0.001; // 0.1% fee
        const value = executionPrice * tradeDecision.quantity;
        
        // Calculate P&L (simplified)
        const profitLoss = (executionPrice - currentPrice) * tradeDecision.quantity * (tradeDecision.side === 'buy' ? 1 : -1);
        totalProfit += profitLoss - fee;
        
        if (profitLoss > 0) {
          winningTrades++;
        }

        // Create trade record
        const trade = await api.trade.create({
          symbol,
          side: tradeDecision.side,
          price: executionPrice,
          quantity: tradeDecision.quantity,
          value,
          fee,
          feeCurrency: 'USDT',
          executedAt: new Date(),
          realizedPnL: profitLoss,
          tradingAccount: { _link: tradingAccountId },
          user: { _link: "system" }, // System user for HFT
          metadata: {
            strategy,
            latency,
            orderType: tradeDecision.orderType,
            targetProfitBps
          }
        });

        executedTrades.push(trade);
        tradesExecuted++;

        const endTime = Date.now();
        const executionLatency = endTime - startTime;
        
        logger.info({
          symbol,
          side: tradeDecision.side,
          price: executionPrice,
          quantity: tradeDecision.quantity,
          latency: executionLatency,
          profitLoss
        }, "Trade executed");

        // Stop-loss check
        if (profitLoss < -(value * STOP_LOSS_PERCENT / 100)) {
          logger.warn({ symbol, profitLoss }, "Stop-loss triggered");
        }
      }
    }

    // Create performance metric
    const avgLatency = symbols.length > 0 ? totalLatency / symbols.length : 0;
    const winRate = tradesExecuted > 0 ? (winningTrades / tradesExecuted) * 100 : 0;

    if (tradesExecuted > 0) {
      await api.performanceMetric.create({
        metricType: 'strategy-performance',
        timeframe: 'hourly',
        periodStart: new Date(Date.now() - 5000), // 5 seconds ago
        periodEnd: new Date(),
        totalPnL: totalProfit,
        numberOfTrades: tradesExecuted,
        winRate,
        volume: executedTrades.reduce((sum, t) => sum + t.value, 0),
        fees: executedTrades.reduce((sum, t) => sum + t.fee, 0),
        metrics: {
          avgLatency,
          strategy,
          symbols
        },
        user: { _link: "system" }
      });
    }

    // Send notifications
    if (totalProfit > 1000) {
      await api.notification.create({
        user: { _link: "system" },
        type: 'trade',
        severity: 'success',
        title: 'HFT Daily Profit Target Reached',
        message: `High-frequency trading has generated $${totalProfit.toFixed(2)} in profit`,
        metadata: {
          tradesExecuted,
          avgLatency,
          winRate
        }
      });
    }

    if (avgLatency > 300) {
      await api.notification.create({
        user: { _link: "system" },
        type: 'system',
        severity: 'warning',
        title: 'HFT Latency Warning',
        message: `Average execution latency is ${avgLatency.toFixed(0)}ms, exceeding recommended threshold`,
        metadata: {
          avgLatency,
          symbols
        }
      });
    }

    // Daily loss limit check
    if (totalProfit < -(maxPositionSize * DAILY_LOSS_LIMIT_PERCENT / 100)) {
      await api.notification.create({
        user: { _link: "system" },
        type: 'alert',
        severity: 'critical',
        title: 'HFT Daily Loss Limit Reached',
        message: 'High-frequency trading stopped due to daily loss limit',
        metadata: {
          totalProfit,
          limit: maxPositionSize * DAILY_LOSS_LIMIT_PERCENT / 100
        }
      });

      return {
        tradesExecuted,
        avgLatency,
        totalProfit,
        winRate,
        status: 'stopped'
      };
    }

    return {
      tradesExecuted,
      avgLatency,
      totalProfit,
      winRate,
      status: avgLatency > MAX_LATENCY_MS ? 'paused' : 'active'
    };

  } catch (error) {
    logger.error({ error }, "Error executing HFT trades");
    throw error;
  }
};

export const params = {
  symbols: {
    type: "array",
    items: { type: "string" }
  },
  strategy: {
    type: "string",
    enum: ['market-making', 'momentum', 'mean-reversion', 'statistical-arbitrage']
  },
  maxPositionSize: {
    type: "number"
  },
  targetProfitBps: {
    type: "number"
  }
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: '*/5 * * * * *'
      }
    ]
  }
};
