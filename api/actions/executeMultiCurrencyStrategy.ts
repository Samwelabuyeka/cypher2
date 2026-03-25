import { ActionOptions } from "gadget-server";
import { 
  calculateHurstExponent, 
  calculateOrnsteinUhlenbeck, 
  calculateCointegration, 
  calculateMarketRegime, 
  calculateVolatilityForecast 
} from "../lib/calculations/quantitativeModels";
import { optimizePortfolioQuantum } from "../lib/quantum/quantumAnnealing";
import { calculateRiskContributions, maximizeSharpeRatio } from "../lib/portfolio/modernPortfolioTheory";

// Technical indicator calculations
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i - 1] - prices[i];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[0];
  
  const k = 2 / (period + 1);
  let ema = prices.slice(-period).reduce((a, b) => a + b) / period;
  
  for (let i = prices.length - period - 1; i >= 0; i--) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  const macdLine = [macd];
  const signal = calculateEMA(macdLine, 9);
  
  return {
    macd,
    signal,
    histogram: macd - signal
  };
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number): { upper: number; middle: number; lower: number } {
  const sma = prices.slice(0, period).reduce((a, b) => a + b) / period;
  
  const squaredDiffs = prices.slice(0, period).map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (standardDeviation * stdDev),
    middle: sma,
    lower: sma - (standardDeviation * stdDev)
  };
}

function calculatePositionSize(
  confidence: number,
  accountBalance: number,
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  if (avgLoss === 0 || winRate === 0) return accountBalance * 0.02;
  
  const winProb = winRate / 100;
  const lossProb = 1 - winProb;
  const odds = avgWin / avgLoss;
  
  const kellyPercent = (odds * winProb - lossProb) / odds;
  const fractionalKelly = kellyPercent * 0.5;
  
  const maxPosition = accountBalance * 0.1;
  const kellyPosition = accountBalance * Math.max(0, fractionalKelly);
  
  return Math.min(kellyPosition, maxPosition);
}

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user");
  if (!userId) {
    logger.error("No user session found");
    return {
      success: false,
      error: "User not authenticated"
    };
  }

  logger.info("Starting multi-currency trading strategy execution");

  const tradingPairs = [
    // Major Pairs (10)
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", 
    "SOL/USDT", "DOT/USDT", "MATIC/USDT", "LTC/USDT", "AVAX/USDT",
    // DeFi Tokens (10)
    "UNI/USDT", "AAVE/USDT", "SUSHI/USDT", "LINK/USDT", "CRV/USDT",
    "COMP/USDT", "MKR/USDT", "SNX/USDT", "YFI/USDT", "1INCH/USDT",
    // Layer 1 Chains (10)
    "ATOM/USDT", "ALGO/USDT", "NEAR/USDT", "FTM/USDT", "ONE/USDT",
    "EGLD/USDT", "FLOW/USDT", "ROSE/USDT", "KAVA/USDT", "HBAR/USDT",
    // Meme Coins (5)
    "DOGE/USDT", "SHIB/USDT", "PEPE/USDT", "FLOKI/USDT", "BONK/USDT",
    // Privacy Coins (3)
    "XMR/USDT", "ZEC/USDT", "DASH/USDT",
    // Exchange Tokens (5)
    "OKB/USDT", "HT/USDT", "KCS/USDT", "GT/USDT", "LEO/USDT",
    // Gaming/Metaverse (5)
    "AXS/USDT", "SAND/USDT", "MANA/USDT", "GALA/USDT", "ENJ/USDT",
    // Others (2)
    "CYP/USDT", "USDC/USDT"
  ];

  const signals: Array<{
    pair: string;
    action: string;
    confidence: number;
    price: number;
    indicators: any;
    hurstExponent?: number;
    selectedStrategy?: string;
    volatilityForecast?: number;
  }> = [];

  const pairAnalysis: Record<string, {
    prices: number[];
    hurstExponent: number;
    selectedStrategy: string;
    volatilityForecast: number;
    expectedReturn: number;
  }> = {};

  let ordersPlaced = 0;
  let buyOrders = 0;
  let sellOrders = 0;
  let stopLossOrders = 0;
  let takeProfitOrders = 0;
  
  // Detect overall market regime
  const btcCandles = await api.marketData.findMany({
    filter: {
      symbol: { equals: "BTC/USDT" },
      interval: { equals: "1h" }
    },
    sort: { timestamp: "Descending" },
    first: 100,
    select: {
      close: true,
      high: true,
      low: true,
      volume: true
    }
  });

  let marketRegime = "normal";
  let regimeAdjustments = {
    positionSizeMultiplier: 1.0,
    stopLossMultiplier: 1.0,
    longBias: 0.5,
    shortBias: 0.5
  };

  if (btcCandles.length >= 50) {
    const btcPrices = btcCandles.map(c => c.close);
    const btcReturns = [];
    for (let i = 1; i < btcPrices.length; i++) {
      btcReturns.push((btcPrices[i - 1] - btcPrices[i]) / btcPrices[i]);
    }
    
    marketRegime = calculateMarketRegime(btcReturns);
    
    if (marketRegime === "high-volatility") {
      regimeAdjustments.positionSizeMultiplier = 0.5;
      regimeAdjustments.stopLossMultiplier = 1.5;
    } else if (marketRegime === "low-volatility") {
      regimeAdjustments.positionSizeMultiplier = 1.3;
      regimeAdjustments.stopLossMultiplier = 0.7;
    } else if (marketRegime === "bull") {
      regimeAdjustments.longBias = 0.7;
      regimeAdjustments.shortBias = 0.3;
      regimeAdjustments.positionSizeMultiplier = 1.2;
    } else if (marketRegime === "bear") {
      regimeAdjustments.longBias = 0.3;
      regimeAdjustments.shortBias = 0.7;
      regimeAdjustments.positionSizeMultiplier = 0.8;
    }
  }

  logger.info(`Market regime detected: ${marketRegime}`, regimeAdjustments);

  // Get active trading account
  const account = await api.tradingAccount.findFirst({
    filter: {
      userId: { equals: userId },
      isActive: { equals: true }
    },
    select: {
      id: true,
      balance: true,
      accountName: true
    }
  });

  if (!account) {
    logger.warn("No active trading account found");
    return {
      success: false,
      error: "No active trading account"
    };
  }

  // Get bot statistics for Kelly Criterion
  const botStats = await api.tradingBot.findFirst({
    filter: {
      userId: { equals: userId },
      isActive: { equals: true }
    },
    select: {
      totalProfit: true,
      totalTrades: true,
      winningTrades: true
    }
  });

  const winRate = botStats ? (botStats.winningTrades / Math.max(botStats.totalTrades, 1)) * 100 : 50;
  const avgWin = 0.05;
  const avgLoss = 0.03;

  // Analyze each trading pair
  for (const pair of tradingPairs) {
    logger.info(`Analyzing ${pair}`);

    const candles = await api.marketData.findMany({
      filter: {
        symbol: { equals: pair },
        interval: { equals: "1h" }
      },
      sort: { timestamp: "Descending" },
      first: 100,
      select: {
        close: true,
        high: true,
        low: true,
        volume: true,
        timestamp: true,
        open: true
      }
    });

    if (candles.length < 50) {
      logger.warn(`Insufficient data for ${pair}`);
      continue;
    }

    const prices = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const currentPrice = prices[0];

    // Calculate Hurst exponent for adaptive strategy selection
    const hurstExponent = calculateHurstExponent(prices.slice(0, 50));
    
    // Determine strategy based on Hurst exponent
    let selectedStrategy = "random-walk";
    if (hurstExponent < 0.45) {
      selectedStrategy = "mean-reversion";
    } else if (hurstExponent > 0.55) {
      selectedStrategy = "momentum";
    }

    // Calculate volatility forecast
    const returns = [];
    for (let i = 1; i < Math.min(prices.length, 50); i++) {
      returns.push((prices[i - 1] - prices[i]) / prices[i]);
    }
    const volatilityForecast = calculateVolatilityForecast(returns);
    const annualizedVolatility = volatilityForecast * Math.sqrt(252 * 24); // hourly to annual

    // Store pair analysis for later optimization
    const expectedReturn = returns.slice(0, 20).reduce((sum, r) => sum + r, 0) / 20;
    pairAnalysis[pair] = {
      prices,
      hurstExponent,
      selectedStrategy,
      volatilityForecast: annualizedVolatility,
      expectedReturn: expectedReturn * 252 * 24 // annualized
    };

    // Calculate technical indicators
    const rsi = calculateRSI(prices, 14);
    const macd = calculateMACD(prices);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const bb = calculateBollingerBands(prices, 20, 2);

    // Get AI prediction
    const prediction = await api.aiPrediction.findFirst({
      filter: {
        symbol: { equals: pair },
        targetDate: { greaterThan: new Date() }
      },
      sort: { createdAt: "Descending" },
      select: {
        confidence: true,
        predictedValue: true,
        predictionType: true
      }
    });

    let signal = "hold";
    let confidence = 0;
    const indicators: any = {
      rsi,
      macd: macd.macd,
      ema20,
      ema50,
      bb,
      hurstExponent,
      volatilityForecast: annualizedVolatility
    };

    // Adaptive strategy selection based on Hurst exponent
    if (selectedStrategy === "mean-reversion") {
      // Mean reversion strategy
      if (rsi < 30 || currentPrice < bb.lower) {
        signal = "buy";
        confidence = Math.max((100 - rsi) * 0.8, ((bb.lower - currentPrice) / bb.lower) * 100);
      } else if (rsi > 70 || currentPrice > bb.upper) {
        signal = "sell";
        confidence = Math.max(rsi * 0.8, ((currentPrice - bb.upper) / bb.upper) * 100);
      }
    } else if (selectedStrategy === "momentum") {
      // Momentum/trend following strategy
      if (ema20 > ema50 && macd.histogram > 0 && rsi > 50) {
        signal = "buy";
        confidence = Math.min(((ema20 - ema50) / ema50) * 1000, 90);
        if (prediction && prediction.confidence > 70) {
          confidence = (confidence + prediction.confidence) / 2;
        }
      } else if (ema20 < ema50 && macd.histogram < 0 && rsi < 50) {
        signal = "sell";
        confidence = Math.min(((ema50 - ema20) / ema20) * 1000, 90);
      }
      
      // Breakout confirmation
      const resistance = Math.max(...highs.slice(0, 20));
      const support = Math.min(...lows.slice(0, 20));
      if (currentPrice > resistance * 1.02) {
        signal = "buy";
        confidence = Math.max(confidence, 85);
      } else if (currentPrice < support * 0.98) {
        signal = "sell";
        confidence = Math.max(confidence, 85);
      }
    } else {
      // Random walk strategy - reduce position sizing
      if (rsi < 25 && prediction && prediction.confidence > 80) {
        signal = "buy";
        confidence = 50; // Lower confidence for random walk
      } else if (rsi > 75 && prediction && prediction.confidence < 20) {
        signal = "sell";
        confidence = 50;
      }
    }

    // Volume confirmation
    const avgVolume = volumes.slice(0, 20).reduce((sum, v) => sum + v, 0) / 20;
    const currentVolume = volumes[0];
    if (currentVolume > avgVolume * 2 && signal === "buy") {
      confidence *= 1.15;
    }

    // Apply market regime bias
    if (signal === "buy") {
      confidence *= regimeAdjustments.longBias / 0.5;
    } else if (signal === "sell") {
      confidence *= regimeAdjustments.shortBias / 0.5;
    }

    // Adjust confidence based on volatility forecast
    if (annualizedVolatility > 100) {
      confidence *= 0.6; // Reduce confidence in high volatility
    } else if (annualizedVolatility < 30) {
      confidence *= 1.2; // Increase confidence in low volatility
    }

    if (confidence > 60 && signal !== "hold") {
      signals.push({
        pair,
        action: signal,
        confidence,
        price: currentPrice,
        indicators,
        hurstExponent,
        selectedStrategy,
        volatilityForecast: annualizedVolatility
      });
    }
  }

  logger.info(`Generated ${signals.length} trading signals`);

  // Find cointegrated pairs for pairs trading
  const cointegratedPairs: Array<{
    pair1: string;
    pair2: string;
    hedgeRatio: number;
    spread: number;
  }> = [];

  const analyzedPairs = Object.keys(pairAnalysis);
  for (let i = 0; i < analyzedPairs.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 5, analyzedPairs.length); j++) {
      const pair1 = analyzedPairs[i];
      const pair2 = analyzedPairs[j];
      
      const prices1 = pairAnalysis[pair1].prices.slice(0, 50);
      const prices2 = pairAnalysis[pair2].prices.slice(0, 50);
      
      if (prices1.length === prices2.length && prices1.length >= 30) {
        const cointegrationResult = calculateCointegration(prices1, prices2);
        
        if (cointegrationResult.isCointegrated) {
          const spread = prices1[0] - cointegrationResult.hedgeRatio * prices2[0];
          const spreadMean = cointegrationResult.spread.reduce((a, b) => a + b, 0) / cointegrationResult.spread.length;
          const spreadStd = Math.sqrt(
            cointegrationResult.spread.reduce((sum, val) => sum + Math.pow(val - spreadMean, 2), 0) / cointegrationResult.spread.length
          );
          
          // Trade if spread > 2 standard deviations
          if (Math.abs(spread - spreadMean) > 2 * spreadStd) {
            cointegratedPairs.push({
              pair1,
              pair2,
              hedgeRatio: cointegrationResult.hedgeRatio,
              spread: spread - spreadMean
            });
          }
        }
      }
    }
  }

  logger.info(`Found ${cointegratedPairs.length} cointegrated pairs with tradeable spreads`);

  // Quantum portfolio optimization
  const accountBalance = (account.balance as any)?.USDT || 10000;
  
  let quantumOptimization: any = null;
  let optimalWeights: Record<string, number> = {};
  
  if (signals.length > 0) {
    const assets = signals.map(s => s.pair);
    const expectedReturns = signals.map(s => pairAnalysis[s.pair]?.expectedReturn || 0);
    
    // Build covariance matrix
    const returns: number[][] = [];
    for (const sig of signals) {
      const prices = pairAnalysis[sig.pair]?.prices || [];
      const assetReturns = [];
      for (let i = 1; i < Math.min(prices.length, 50); i++) {
        assetReturns.push((prices[i - 1] - prices[i]) / prices[i]);
      }
      returns.push(assetReturns);
    }
    
    const covarianceMatrix: number[][] = [];
    for (let i = 0; i < returns.length; i++) {
      covarianceMatrix[i] = [];
      for (let j = 0; j < returns.length; j++) {
        const mean1 = returns[i].reduce((a, b) => a + b, 0) / returns[i].length;
        const mean2 = returns[j].reduce((a, b) => a + b, 0) / returns[j].length;
        let covariance = 0;
        for (let k = 0; k < Math.min(returns[i].length, returns[j].length); k++) {
          covariance += (returns[i][k] - mean1) * (returns[j][k] - mean2);
        }
        covarianceMatrix[i][j] = covariance / Math.min(returns[i].length, returns[j].length);
      }
    }
    
    try {
      quantumOptimization = optimizePortfolioQuantum(
        expectedReturns,
        covarianceMatrix,
        accountBalance,
        0.01, // min position size
        0.25  // max position size as fraction of portfolio
      );
      
      // Map weights back to pairs
      for (let i = 0; i < assets.length; i++) {
        optimalWeights[assets[i]] = quantumOptimization.weights[i];
      }
      
      logger.info(`Quantum optimization completed: ${quantumOptimization.iterations} iterations, ${quantumOptimization.tunnelingEvents} tunneling events`);
    } catch (error) {
      logger.warn(`Quantum optimization failed: ${error}. Using equal weights.`);
      // Fallback to equal weights
      for (const asset of assets) {
        optimalWeights[asset] = 1.0 / assets.length;
      }
    }
  }

  // Calculate risk parity contributions
  let riskParityAdjustments: Record<string, number> = {};
  if (signals.length > 1 && Object.keys(optimalWeights).length > 0) {
    const weights = signals.map(s => optimalWeights[s.pair] || 0);
    const returns: number[][] = [];
    
    for (const sig of signals) {
      const prices = pairAnalysis[sig.pair]?.prices || [];
      const assetReturns = [];
      for (let i = 1; i < Math.min(prices.length, 50); i++) {
        assetReturns.push((prices[i - 1] - prices[i]) / prices[i]);
      }
      returns.push(assetReturns);
    }
    
    const covarianceMatrix: number[][] = [];
    for (let i = 0; i < returns.length; i++) {
      covarianceMatrix[i] = [];
      for (let j = 0; j < returns.length; j++) {
        const mean1 = returns[i].reduce((a, b) => a + b, 0) / returns[i].length;
        const mean2 = returns[j].reduce((a, b) => a + b, 0) / returns[j].length;
        let covariance = 0;
        for (let k = 0; k < Math.min(returns[i].length, returns[j].length); k++) {
          covariance += (returns[i][k] - mean1) * (returns[j][k] - mean2);
        }
        covarianceMatrix[i][j] = covariance / Math.min(returns[i].length, returns[j].length);
      }
    }
    
    const riskContributions = calculateRiskContributions(weights, covarianceMatrix);
    
    // If any asset contributes > 40% of risk, reduce its weight
    for (let i = 0; i < signals.length; i++) {
      const pair = signals[i].pair;
      if (riskContributions[i] > 0.4) {
        riskParityAdjustments[pair] = 0.6; // Reduce to 60% of original
        logger.info(`Reducing ${pair} weight due to high risk contribution: ${(riskContributions[i] * 100).toFixed(1)}%`);
      } else {
        riskParityAdjustments[pair] = 1.0;
      }
    }
  }

  for (const sig of signals.slice(0, 20)) {
    if (sig.action === "buy" || sig.action === "sell") {
      let basePositionSize = calculatePositionSize(
        sig.confidence,
        accountBalance,
        winRate,
        avgWin,
        avgLoss
      );

      // Apply regime adjustments
      basePositionSize *= regimeAdjustments.positionSizeMultiplier;

      // Apply volatility adjustments
      const volForecast = sig.volatilityForecast || 50;
      if (volForecast > 100) {
        basePositionSize *= 0.25;
      } else if (volForecast < 30) {
        basePositionSize *= 1.5;
      }

      // Apply quantum optimization weights
      const quantumWeight = optimalWeights[sig.pair] || (1.0 / signals.length);
      basePositionSize *= quantumWeight * signals.length; // Normalize

      // Apply risk parity adjustments
      const riskAdjustment = riskParityAdjustments[sig.pair] || 1.0;
      const positionSize = basePositionSize * riskAdjustment;

      // Adjust for random walk strategy
      const finalPositionSize = sig.selectedStrategy === "random-walk" 
        ? positionSize * 0.5 
        : positionSize;

      const limitPrice = sig.action === "buy" ? sig.price * 0.999 : sig.price * 1.001;
      const quantity = finalPositionSize / limitPrice;

      const order = await api.order.create({
        symbol: sig.pair,
        side: sig.action === "buy" ? "buy" : "sell",
        type: "limit",
        quantity,
        price: limitPrice,
        tradingAccount: { _link: account.id },
        user: { _link: userId },
        timeInForce: "gtc",
        status: "pending",
        metadata: {
          strategy: "multi-currency",
          confidence: sig.confidence,
          indicators: sig.indicators,
          hurstExponent: sig.hurstExponent,
          selectedStrategy: sig.selectedStrategy,
          marketRegime,
          quantumOptimized: true,
          quantumWeight,
          riskParityAdjustment: riskAdjustment,
          volatilityForecast: sig.volatilityForecast
        }
      });

      ordersPlaced++;
      if (sig.action === "buy") {
        buyOrders++;
      } else {
        sellOrders++;
      }

      // Stop loss with regime adjustments
      const stopLossDistance = 0.05 * regimeAdjustments.stopLossMultiplier;
      const stopPrice = sig.action === "buy" 
        ? limitPrice * (1 - stopLossDistance)
        : limitPrice * (1 + stopLossDistance);
        
      await api.order.create({
        symbol: sig.pair,
        side: sig.action === "buy" ? "sell" : "buy",
        type: "stop-loss",
        quantity,
        stopPrice,
        tradingAccount: { _link: account.id },
        user: { _link: userId },
        timeInForce: "gtc",
        status: "pending"
      });

      stopLossOrders++;

      const takeProfitPrice = sig.action === "buy"
        ? limitPrice * 1.10
        : limitPrice * 0.90;
        
      await api.order.create({
        symbol: sig.pair,
        side: sig.action === "buy" ? "sell" : "buy",
        type: "limit",
        quantity,
        price: takeProfitPrice,
        tradingAccount: { _link: account.id },
        user: { _link: userId },
        timeInForce: "gtc",
        status: "pending"
      });

      takeProfitOrders++;
    }
  }

  // Execute cointegrated pairs trades
  for (const cointPair of cointegratedPairs.slice(0, 5)) {
    const positionSize = accountBalance * 0.02; // 2% per pair trade
    
    // If spread is positive, short pair1 and long pair2
    const side1 = cointPair.spread > 0 ? "sell" : "buy";
    const side2 = cointPair.spread > 0 ? "buy" : "sell";
    
    const price1 = pairAnalysis[cointPair.pair1].prices[0];
    const price2 = pairAnalysis[cointPair.pair2].prices[0];
    
    const quantity1 = positionSize / price1;
    const quantity2 = (positionSize * cointPair.hedgeRatio) / price2;
    
    // Place both legs
    await api.order.create({
      symbol: cointPair.pair1,
      side: side1,
      type: "market",
      quantity: quantity1,
      tradingAccount: { _link: account.id },
      user: { _link: userId },
      timeInForce: "gtc",
      status: "pending",
      metadata: {
        strategy: "pairs-trading",
        cointegrated: true,
        pairLeg: 1,
        hedgeRatio: cointPair.hedgeRatio
      }
    });
    
    await api.order.create({
      symbol: cointPair.pair2,
      side: side2,
      type: "market",
      quantity: quantity2,
      tradingAccount: { _link: account.id },
      user: { _link: userId },
      timeInForce: "gtc",
      status: "pending",
      metadata: {
        strategy: "pairs-trading",
        cointegrated: true,
        pairLeg: 2,
        hedgeRatio: cointPair.hedgeRatio
      }
    });
    
    ordersPlaced += 2;
    if (side1 === "buy") buyOrders++;
    else sellOrders++;
    if (side2 === "buy") buyOrders++;
    else sellOrders++;
  }

  logger.info(`Placed ${ordersPlaced} orders`);

  return {
    success: true,
    pairsAnalyzed: tradingPairs.length,
    signalsGenerated: signals.length,
    ordersPlaced,
    breakdown: {
      buyOrders,
      sellOrders,
      stopLossOrders,
      takeProfitOrders
    },
    portfolio: {
      totalValueUSD: accountBalance,
      allocation: {},
      rebalancingNeeded: false
    },
    performance: {
      totalPnL: botStats?.totalProfit || 0,
      winRate,
      sharpeRatio: 0,
      maxDrawdown: 0
    },
    topSignals: signals.slice(0, 10).map(s => ({
      pair: s.pair,
      action: s.action,
      confidence: s.confidence,
      indicators: s.indicators
    }))
  };
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
  timeoutMS: 180000,
};
