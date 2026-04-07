import { ActionOptions } from "gadget-server";
import { getLocalAIMarketBias } from "../lib/ai/localAiRouter";
import { buildUnifiedAlgorithmSnapshot } from "../lib/trading/unifiedAlgorithmSnapshot";

interface TradingSignal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  quantity: number;
  reason: string;
}

interface BotExecutionStats {
  botId: string;
  botName: string;
  success: boolean;
  tradesExecuted: number;
  error?: string;
}

// Helper function to calculate RSI
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Helper function to simulate AI analysis
async function analyzeMarketWithAI(
  symbol: string,
  marketData: any[],
  botConfig: any,
  logger: any
): Promise<TradingSignal> {
  try {
    // Extract prices for technical analysis
    const closePrices = marketData.map((d) => d.close);
    const currentPrice = closePrices[closePrices.length - 1];
    
    // Calculate technical indicators
    const rsi = calculateRSI(closePrices);
    
    // Simple moving averages
    const sma20 = closePrices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closePrices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closePrices.length);
    
    // Volume analysis
    const avgVolume = marketData.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20;
    const currentVolume = marketData[marketData.length - 1].volume;
    
    const unified = buildUnifiedAlgorithmSnapshot(
      symbol,
      marketData.map((d) => ({
        close: d.close,
        high: d.high,
        low: d.low,
        volume: d.volume,
        timestamp: d.timestamp,
      }))
    );
    const ftSignal = {
      action: unified.upstream.freqtradeAction,
      confidence: 70,
      reason: "unified_snapshot_freqtrade",
    };
    const hbQuote = {
      bidSpread: unified.upstream.hbBidSpread,
      askSpread: unified.upstream.hbAskSpread,
    };

    // Generate trading signal based on technical analysis
    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 50;
    let reason = 'Neutral market conditions';
    
    // Oversold condition (potential buy)
    if (rsi < 30 && currentPrice < sma20 && currentVolume > avgVolume * 1.2) {
      action = 'buy';
      confidence = 75 + (30 - rsi);
      reason = `Oversold: RSI ${rsi.toFixed(2)}, price below SMA20, high volume`;
    }
    // Overbought condition (potential sell)
    else if (rsi > 70 && currentPrice > sma20) {
      action = 'sell';
      confidence = 75 + (rsi - 70);
      reason = `Overbought: RSI ${rsi.toFixed(2)}, price above SMA20`;
    }
    // Bullish crossover
    else if (sma20 > sma50 && currentPrice > sma20 && rsi > 50 && rsi < 70) {
      action = 'buy';
      confidence = 65;
      reason = 'Bullish trend: SMA20 > SMA50, positive momentum';
    }
    // Bearish crossover
    else if (sma20 < sma50 && currentPrice < sma20 && rsi < 50 && rsi > 30) {
      action = 'sell';
      confidence = 65;
      reason = 'Bearish trend: SMA20 < SMA50, negative momentum';
    }
    
    // Blend in upstream strategy signal with bounded influence
    if (ftSignal.action !== "hold" && ftSignal.action === action) {
      confidence += 10;
      reason += ` | aligned:${ftSignal.reason}`;
    } else if (ftSignal.action !== "hold" && action === "hold") {
      action = ftSignal.action;
      confidence = Math.max(confidence, ftSignal.confidence * 0.85);
      reason = `Upstream activation:${ftSignal.reason}`;
    }

    // Optional local AI model (Ollama) overlay.
    const aiBias = await getLocalAIMarketBias({
      symbol,
      price: currentPrice,
      rsi,
      sma20,
      sma50,
      volumeRatio: currentVolume / Math.max(1, avgVolume),
      freqtradeAction: ftSignal.action,
      algorithmSnapshot: {
        strategyVotes: unified.strategyVotes,
        indicators: unified.indicators,
        upstream: unified.upstream,
        quantum: unified.quantum,
        projectCoverage: unified.projectCoverage,
      },
    });

    if (aiBias.action === action && aiBias.action !== "hold") {
      confidence += aiBias.confidence * 0.15;
      reason += ` | local_ai_align:${aiBias.reason}`;
    } else if (action === "hold" && aiBias.action !== "hold") {
      action = aiBias.action;
      confidence = Math.max(confidence, aiBias.confidence * 0.8);
      reason = `Local AI activation:${aiBias.reason}`;
    }

    // Risk adjustment based on bot's risk level
    const riskMultiplier = botConfig.riskLevel === 'conservative' ? 0.7 : 
                          botConfig.riskLevel === 'aggressive' ? 1.3 : 1.0;
    
    const adjustedConfidence = Math.min(100, confidence * riskMultiplier);
    
    // Calculate position size based on confidence and risk
    const baseQuantity = botConfig.maxPositionSize || 100;
    const quantity = (baseQuantity * adjustedConfidence) / 100;
    
    return {
      action,
      confidence: adjustedConfidence,
      price: currentPrice,
      quantity,
      reason: `${reason} | hb_bid_spread=${hbQuote.bidSpread.toFixed(6)} hb_ask_spread=${hbQuote.askSpread.toFixed(6)} q_var95=${unified.quantum.var95.toFixed(4)} q_sharpe=${unified.quantum.optimizedSharpe.toFixed(3)} ai=${aiBias.action}:${aiBias.confidence.toFixed(1)}`
    };
  } catch (error) {
    logger.error({ error, symbol }, 'Error analyzing market data');
    return {
      action: 'hold',
      confidence: 0,
      price: 0,
      quantity: 0,
      reason: 'Analysis error'
    };
  }
}

// Helper function to check risk limits
async function checkRiskLimits(
  bot: any,
  signal: TradingSignal,
  userId: string,
  api: any,
  logger: any
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check if signal confidence meets threshold
    const minConfidence = bot.riskLevel === 'conservative' ? 80 : 
                         bot.riskLevel === 'moderate' ? 70 : 60;
    
    if (signal.confidence < minConfidence) {
      return { allowed: false, reason: `Confidence ${signal.confidence.toFixed(2)}% below threshold ${minConfidence}%` };
    }
    
    // Check daily loss limit (simplified - would need to check today's trades)
    if (bot.maxDailyLoss && bot.totalProfit < -bot.maxDailyLoss) {
      return { allowed: false, reason: 'Daily loss limit exceeded' };
    }
    
    // Check position size
    if (signal.quantity > bot.maxPositionSize) {
      return { allowed: false, reason: 'Position size exceeds limit' };
    }
    
    // Check wallet balance (if buy signal)
    if (signal.action === 'buy') {
      // Extract base currency from trading pair (simplified)
      const currency = 'USDT'; // Default to USDT for demo
      
      const wallet = await api.wallet.findFirst({
        filter: {
          userId: { equals: userId },
          currency: { equals: currency }
        }
      });
      
      if (!wallet) {
        return { allowed: false, reason: `No ${currency} wallet found` };
      }
      
      const requiredBalance = signal.quantity * signal.price;
      if (wallet.availableBalance < requiredBalance) {
        return { allowed: false, reason: `Insufficient balance: ${wallet.availableBalance} < ${requiredBalance}` };
      }
    }
    
    return { allowed: true };
  } catch (error) {
    logger.error({ error, botId: bot.id }, 'Error checking risk limits');
    return { allowed: false, reason: 'Risk check error' };
  }
}

export const run: ActionRun = async ({ params, logger, api }) => {
  const executionStart = Date.now();
  const stats: BotExecutionStats[] = [];
  
  logger.info('Starting autonomous trading execution');
  
  try {
    // Find all active trading bots
    const activeBots = await api.tradingBot.findMany({
      filter: {
        AND: [
          { isActive: { equals: true } },
          { status: { equals: 'running' } }
        ]
      },
      select: {
        id: true,
        name: true,
        userId: true,
        strategyId: true,
        tradingPairs: true,
        maxPositionSize: true,
        maxDailyLoss: true,
        riskLevel: true,
        config: true,
        totalTrades: true,
        totalProfit: true,
        winningTrades: true
      }
    });
    
    logger.info({ count: activeBots.length }, 'Found active trading bots');
    
    // Process each bot
    for (const bot of activeBots) {
      const botStats: BotExecutionStats = {
        botId: bot.id,
        botName: bot.name,
        success: false,
        tradesExecuted: 0
      };
      
      try {
        logger.info({ botId: bot.id, botName: bot.name }, 'Processing bot');
        
        // Get trading pairs from bot config
        const tradingPairs = bot.tradingPairs as string[] || [];
        
        if (tradingPairs.length === 0) {
          botStats.error = 'No trading pairs configured';
          stats.push(botStats);
          continue;
        }
        
        // Process each trading pair
        for (const symbol of tradingPairs) {
          try {
            // Fetch latest market data (last 50 candles for analysis)
            const marketData = await api.marketData.findMany({
              filter: {
                symbol: { equals: symbol }
              },
              sort: { timestamp: 'Descending' },
              first: 50
            });
            
            if (marketData.length < 20) {
              logger.warn({ symbol, botId: bot.id }, 'Insufficient market data');
              continue;
            }
            
            // Reverse to get chronological order
            marketData.reverse();
            
            // Analyze market and generate signal
            const signal = await analyzeMarketWithAI(
              symbol,
              marketData,
              bot,
              logger
            );
            
            logger.info({ 
              botId: bot.id, 
              symbol, 
              signal 
            }, 'Generated trading signal');
            
            // Create AI prediction record
            await api.aiPrediction.create({
              symbol,
              tradingBot: { _link: bot.id },
              predictionType: 'direction',
              currentValue: signal.price,
              predictedValue: signal.price * (signal.action === 'buy' ? 1.02 : 0.98),
              confidence: signal.confidence,
              targetDate: new Date(Date.now() + 3600000), // 1 hour from now
              modelVersion: 'autonomous-v1',
            });
            
            // Skip if signal is hold
            if (signal.action === 'hold') {
              continue;
            }
            
            // Check risk limits
            const riskCheck = await checkRiskLimits(
              bot,
              signal,
              bot.userId,
              api,
              logger
            );
            
            if (!riskCheck.allowed) {
              logger.warn({ 
                botId: bot.id, 
                symbol, 
                reason: riskCheck.reason 
              }, 'Trade blocked by risk limits');
              continue;
            }
            
            // Execute trade by creating an order
            const order = await api.order.create({
              user: { _link: bot.userId },
              strategy: { _link: bot.strategyId },
              symbol,
              side: signal.action === 'buy' ? 'buy' : 'sell',
              type: 'market',
              quantity: signal.quantity,
              metadata: {
                botId: bot.id,
                confidence: signal.confidence,
                reason: signal.reason,
                automated: true
              }
            });
            
            logger.info({ 
              botId: bot.id, 
              orderId: order.id, 
              symbol, 
              side: signal.action 
            }, 'Order created');
            
            botStats.tradesExecuted++;
            
          } catch (error) {
            logger.error({ 
              error, 
              botId: bot.id, 
              symbol 
            }, 'Error processing trading pair');
          }
        }
        
        // Update bot statistics
        await api.tradingBot.update(bot.id, {
          totalTrades: (bot.totalTrades || 0) + botStats.tradesExecuted,
          lastTradeAt: botStats.tradesExecuted > 0 ? new Date() : undefined
        });
        
        botStats.success = true;
        
      } catch (error: any) {
        logger.error({ error, botId: bot.id }, 'Error processing bot');
        botStats.error = error.message || 'Unknown error';
        
        // Update bot with error status
        await api.tradingBot.update(bot.id, {
          status: 'error',
          lastError: error.message,
          lastErrorAt: new Date()
        });
      }
      
      stats.push(botStats);
    }
    
    const executionTime = Date.now() - executionStart;
    const successfulBots = stats.filter(s => s.success).length;
    const totalTrades = stats.reduce((sum, s) => sum + s.tradesExecuted, 0);
    
    logger.info({ 
      executionTime, 
      botsProcessed: stats.length,
      successfulBots,
      totalTrades,
      stats 
    }, 'Autonomous trading execution completed');
    
    return {
      success: true,
      executionTimeMs: executionTime,
      botsProcessed: stats.length,
      successfulBots,
      totalTradesExecuted: totalTrades,
      botStats: stats
    };
    
  } catch (error) {
    logger.error({ error }, 'Fatal error in autonomous trading execution');
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: '*/5 * * * *' }]
  }
};
