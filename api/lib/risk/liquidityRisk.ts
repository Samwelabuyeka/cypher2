/**
 * Liquidity Risk Models and Analysis
 * Implements advanced models for measuring and managing liquidity risk
 */

// Type definitions
export interface MarketDepth {
  bidLevels: Array<{ price: number; volume: number }>;
  askLevels: Array<{ price: number; volume: number }>;
}

export interface OrderBookSnapshot {
  timestamp: number;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
}

export interface TradeData {
  price: number;
  volume: number;
  timestamp: number;
  side: 'buy' | 'sell';
}

export interface ExecutionSchedule {
  timeSlices: number;
  volumePerSlice: number[];
  expectedCost: number;
  expectedVariance: number;
}

export interface LiquidityMetricsResult {
  amihudRatio: number;
  rollMeasure: number;
  turnoverRatio: number;
  marketDepth: {
    bidDepth: number;
    askDepth: number;
    totalDepth: number;
  };
}

export interface SlippageEstimate {
  expectedSlippage: number;
  slippageBps: number;
  confidence: number;
}

export interface TradingCostBreakdown {
  spreadCost: number;
  impactCost: number;
  timingCost: number;
  totalCost: number;
  implementationShortfall: number;
}

/**
 * Market Impact Model
 * Models the price impact of trades on the market
 */
export class MarketImpactModel {
  /**
   * Calculate permanent price impact (information effect)
   * Based on Kyle (1985) model
   */
  calculatePermanentImpact(
    volume: number,
    marketDepth: number,
    volatility: number = 0.02
  ): number {
    if (marketDepth <= 0) return 0;
    
    // Permanent impact is proportional to square root of volume
    // and inversely proportional to market depth
    const lambda = volatility / Math.sqrt(marketDepth);
    return lambda * Math.sqrt(volume);
  }

  /**
   * Calculate temporary price impact (liquidity effect)
   * Dissipates after the trade
   */
  calculateTemporaryImpact(
    volume: number,
    executionSpeed: number,
    volatility: number = 0.02
  ): number {
    // Temporary impact is proportional to execution speed
    // Higher speed = higher temporary impact
    const eta = volatility * executionSpeed;
    return eta * volume;
  }

  /**
   * Almgren-Chriss model for optimal execution
   * Balances market impact vs. price risk
   */
  almgrenChrissModel(
    totalVolume: number,
    timeHorizon: number, // in seconds
    volatility: number,
    lambda: number = 0.01, // permanent impact parameter
    eta: number = 0.005, // temporary impact parameter
    riskAversion: number = 1e-6
  ): ExecutionSchedule {
    const n = Math.min(Math.floor(timeHorizon / 60), 100); // Max 100 slices
    const dt = timeHorizon / n;
    
    // Calculate optimal trajectory
    const kappa = Math.sqrt(lambda / eta);
    const tau = timeHorizon;
    
    // Exponential decay parameter
    const sinh_kappa_tau = Math.sinh(kappa * tau);
    const cosh_kappa_tau = Math.cosh(kappa * tau);
    
    const volumePerSlice: number[] = [];
    let remainingVolume = totalVolume;
    
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const factor = Math.sinh(kappa * (tau - t)) / sinh_kappa_tau;
      const tradeVolume = totalVolume * factor * kappa * dt / tau;
      
      volumePerSlice.push(Math.min(tradeVolume, remainingVolume));
      remainingVolume -= tradeVolume;
    }
    
    // Add any remaining volume to last slice
    if (remainingVolume > 0) {
      volumePerSlice[volumePerSlice.length - 1] += remainingVolume;
    }
    
    // Calculate expected cost and variance
    const expectedCost = this.calculateExpectedCost(
      totalVolume,
      volumePerSlice,
      lambda,
      eta
    );
    
    const expectedVariance = this.calculateExpectedVariance(
      volumePerSlice,
      volatility,
      dt
    );
    
    return {
      timeSlices: n,
      volumePerSlice,
      expectedCost,
      expectedVariance
    };
  }

  /**
   * Estimate total trading cost
   */
  tradingCostEstimation(
    volume: number,
    averagePrice: number,
    marketDepth: number,
    volatility: number,
    executionSpeed: number
  ): number {
    const permanentImpact = this.calculatePermanentImpact(volume, marketDepth, volatility);
    const temporaryImpact = this.calculateTemporaryImpact(volume, executionSpeed, volatility);
    
    return averagePrice * (permanentImpact + temporaryImpact) * volume;
  }

  private calculateExpectedCost(
    totalVolume: number,
    volumePerSlice: number[],
    lambda: number,
    eta: number
  ): number {
    let cost = 0;
    
    for (const v of volumePerSlice) {
      cost += lambda * v * v + eta * v;
    }
    
    return cost;
  }

  private calculateExpectedVariance(
    volumePerSlice: number[],
    volatility: number,
    dt: number
  ): number {
    let variance = 0;
    
    for (const v of volumePerSlice) {
      variance += v * v * volatility * volatility * dt;
    }
    
    return variance;
  }
}

/**
 * Bid-Ask Spread Analyzer
 * Analyzes various spread measures
 */
export class BidAskSpreadAnalyzer {
  /**
   * Calculate effective spread
   * Measures actual transaction cost
   */
  calculateEffectiveSpread(
    transactionPrice: number,
    midpointPrice: number,
    side: 'buy' | 'sell'
  ): number {
    const multiplier = side === 'buy' ? 1 : -1;
    return 2 * multiplier * (transactionPrice - midpointPrice);
  }

  /**
   * Calculate realized spread
   * Effective spread minus price change
   */
  calculateRealizedSpread(
    transactionPrice: number,
    initialMidpoint: number,
    finalMidpoint: number,
    side: 'buy' | 'sell'
  ): number {
    const multiplier = side === 'buy' ? 1 : -1;
    return 2 * multiplier * (transactionPrice - finalMidpoint);
  }

  /**
   * Estimate adverse selection cost
   * Difference between effective and realized spread
   */
  estimateAdverseCost(
    effectiveSpread: number,
    realizedSpread: number
  ): number {
    return effectiveSpread - realizedSpread;
  }

  /**
   * Calculate quoted spread
   */
  calculateQuotedSpread(bestBid: number, bestAsk: number): number {
    return bestAsk - bestBid;
  }

  /**
   * Calculate proportional quoted spread
   */
  calculateProportionalSpread(bestBid: number, bestAsk: number): number {
    const midpoint = (bestBid + bestAsk) / 2;
    return (bestAsk - bestBid) / midpoint;
  }
}

/**
 * Liquidity Metrics Calculator
 */
export class LiquidityMetrics {
  /**
   * Calculate Amihud illiquidity ratio
   * Measures price impact per unit volume
   */
  calculateAmihudRatio(trades: TradeData[], period: number = 1): number {
    if (trades.length === 0) return 0;
    
    let sumIlliquidity = 0;
    
    for (let i = 1; i < trades.length; i++) {
      const priceChange = Math.abs(trades[i].price - trades[i - 1].price);
      const relativeChange = priceChange / trades[i - 1].price;
      const dollarVolume = trades[i].volume * trades[i].price;
      
      if (dollarVolume > 0) {
        sumIlliquidity += relativeChange / dollarVolume;
      }
    }
    
    return sumIlliquidity / trades.length;
  }

  /**
   * Calculate Roll measure of spread
   * Based on serial covariance of price changes
   */
  calculateRollMeasure(prices: number[]): number {
    if (prices.length < 3) return 0;
    
    const priceChanges: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      priceChanges.push(prices[i] - prices[i - 1]);
    }
    
    // Calculate autocovariance at lag 1
    const mean = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    let autocovariance = 0;
    
    for (let i = 1; i < priceChanges.length; i++) {
      autocovariance += (priceChanges[i] - mean) * (priceChanges[i - 1] - mean);
    }
    
    autocovariance /= (priceChanges.length - 1);
    
    // Roll measure is 2 * sqrt(-autocovariance)
    return autocovariance < 0 ? 2 * Math.sqrt(-autocovariance) : 0;
  }

  /**
   * Calculate turnover ratio
   */
  calculateTurnoverRatio(
    tradingVolume: number,
    outstandingShares: number
  ): number {
    return tradingVolume / outstandingShares;
  }

  /**
   * Calculate market depth at various price levels
   */
  calculateMarketDepth(orderBook: OrderBookSnapshot): {
    bidDepth: number;
    askDepth: number;
    totalDepth: number;
    depthProfile: Array<{ level: number; bidVolume: number; askVolume: number }>;
  } {
    const bidDepth = orderBook.bids.reduce((sum, level) => sum + level.volume, 0);
    const askDepth = orderBook.asks.reduce((sum, level) => sum + level.volume, 0);
    
    const depthProfile: Array<{ level: number; bidVolume: number; askVolume: number }> = [];
    const maxLevels = Math.max(orderBook.bids.length, orderBook.asks.length);
    
    for (let i = 0; i < maxLevels; i++) {
      depthProfile.push({
        level: i + 1,
        bidVolume: orderBook.bids[i]?.volume || 0,
        askVolume: orderBook.asks[i]?.volume || 0
      });
    }
    
    return {
      bidDepth,
      askDepth,
      totalDepth: bidDepth + askDepth,
      depthProfile
    };
  }

  /**
   * Comprehensive liquidity metrics
   */
  calculateComprehensiveMetrics(
    trades: TradeData[],
    orderBook: OrderBookSnapshot,
    outstandingShares: number
  ): LiquidityMetricsResult {
    const prices = trades.map(t => t.price);
    const totalVolume = trades.reduce((sum, t) => sum + t.volume, 0);
    
    return {
      amihudRatio: this.calculateAmihudRatio(trades),
      rollMeasure: this.calculateRollMeasure(prices),
      turnoverRatio: this.calculateTurnoverRatio(totalVolume, outstandingShares),
      marketDepth: this.calculateMarketDepth(orderBook)
    };
  }
}

/**
 * Optimal Execution Strategy
 */
export class OptimalExecutionStrategy {
  /**
   * VWAP (Volume Weighted Average Price) execution
   */
  VWAPExecution(
    totalVolume: number,
    historicalVolumes: number[],
    timeSlices: number
  ): number[] {
    const totalHistoricalVolume = historicalVolumes.reduce((a, b) => a + b, 0);
    const volumeWeights = historicalVolumes.map(v => v / totalHistoricalVolume);
    
    return volumeWeights.map(weight => totalVolume * weight);
  }

  /**
   * TWAP (Time Weighted Average Price) execution
   */
  TWAPExecution(totalVolume: number, timeSlices: number): number[] {
    const volumePerSlice = totalVolume / timeSlices;
    return new Array(timeSlices).fill(volumePerSlice);
  }

  /**
   * POV (Percentage of Volume) execution
   */
  POVExecution(
    totalVolume: number,
    marketVolumes: number[],
    participationRate: number = 0.1
  ): number[] {
    const executionVolumes: number[] = [];
    let remainingVolume = totalVolume;
    
    for (const marketVol of marketVolumes) {
      const targetVolume = Math.min(
        marketVol * participationRate,
        remainingVolume
      );
      executionVolumes.push(targetVolume);
      remainingVolume -= targetVolume;
      
      if (remainingVolume <= 0) break;
    }
    
    // Distribute any remaining volume
    if (remainingVolume > 0) {
      const extraPerSlice = remainingVolume / executionVolumes.length;
      for (let i = 0; i < executionVolumes.length; i++) {
        executionVolumes[i] += extraPerSlice;
      }
    }
    
    return executionVolumes;
  }

  /**
   * Calculate optimal execution schedule using Almgren-Chriss
   */
  calculateOptimalSchedule(
    totalVolume: number,
    timeHorizon: number,
    volatility: number,
    riskAversion: number = 1e-6,
    lambda: number = 0.01,
    eta: number = 0.005
  ): ExecutionSchedule {
    const model = new MarketImpactModel();
    return model.almgrenChrissModel(
      totalVolume,
      timeHorizon,
      volatility,
      lambda,
      eta,
      riskAversion
    );
  }
}

/**
 * Slippage Estimator
 */
export class SlippageEstimator {
  /**
   * Predict slippage based on order size and market conditions
   */
  predictSlippage(
    orderVolume: number,
    averageDailyVolume: number,
    volatility: number,
    orderBook: OrderBookSnapshot
  ): SlippageEstimate {
    // Calculate volume ratio
    const volumeRatio = orderVolume / averageDailyVolume;
    
    // Calculate market depth
    const metrics = new LiquidityMetrics();
    const depth = metrics.calculateMarketDepth(orderBook);
    
    // Base slippage from volume ratio
    let slippageBps = 0;
    
    if (volumeRatio < 0.01) {
      slippageBps = volatility * 100 * 0.5; // Low impact
    } else if (volumeRatio < 0.05) {
      slippageBps = volatility * 100 * 1.5;
    } else if (volumeRatio < 0.1) {
      slippageBps = volatility * 100 * 3;
    } else {
      slippageBps = volatility * 100 * 5; // High impact
    }
    
    // Adjust for market depth
    const depthRatio = orderVolume / depth.totalDepth;
    slippageBps *= (1 + depthRatio);
    
    const confidence = Math.max(0.5, 1 - volumeRatio * 2);
    
    return {
      expectedSlippage: slippageBps / 10000,
      slippageBps,
      confidence
    };
  }

  /**
   * Analyze historical slippage patterns
   */
  historicalSlippageAnalysis(
    executedTrades: Array<{
      expectedPrice: number;
      executedPrice: number;
      volume: number;
      side: 'buy' | 'sell';
    }>
  ): {
    averageSlippage: number;
    medianSlippage: number;
    slippageStdDev: number;
    slippageByVolume: Array<{ volumeBucket: string; avgSlippage: number }>;
  } {
    const slippages = executedTrades.map(trade => {
      const multiplier = trade.side === 'buy' ? 1 : -1;
      return multiplier * (trade.executedPrice - trade.expectedPrice) / trade.expectedPrice;
    });
    
    const sortedSlippages = [...slippages].sort((a, b) => a - b);
    const averageSlippage = slippages.reduce((a, b) => a + b, 0) / slippages.length;
    const medianSlippage = sortedSlippages[Math.floor(sortedSlippages.length / 2)];
    
    const variance = slippages.reduce((sum, s) => sum + Math.pow(s - averageSlippage, 2), 0) / slippages.length;
    const slippageStdDev = Math.sqrt(variance);
    
    // Group by volume buckets
    const volumeBuckets = [
      { min: 0, max: 1000, label: '0-1K' },
      { min: 1000, max: 10000, label: '1K-10K' },
      { min: 10000, max: 100000, label: '10K-100K' },
      { min: 100000, max: Infinity, label: '100K+' }
    ];
    
    const slippageByVolume = volumeBuckets.map(bucket => {
      const tradesInBucket = executedTrades.filter(
        t => t.volume >= bucket.min && t.volume < bucket.max
      );
      
      const avgSlippage = tradesInBucket.length > 0
        ? tradesInBucket.reduce((sum, t) => {
            const multiplier = t.side === 'buy' ? 1 : -1;
            return sum + multiplier * (t.executedPrice - t.expectedPrice) / t.expectedPrice;
          }, 0) / tradesInBucket.length
        : 0;
      
      return {
        volumeBucket: bucket.label,
        avgSlippage
      };
    });
    
    return {
      averageSlippage,
      medianSlippage,
      slippageStdDev,
      slippageByVolume
    };
  }
}

/**
 * Liquidity Cost Model
 */
export class LiquidityCostModel {
  private spreadAnalyzer: BidAskSpreadAnalyzer;
  private impactModel: MarketImpactModel;

  constructor() {
    this.spreadAnalyzer = new BidAskSpreadAnalyzer();
    this.impactModel = new MarketImpactModel();
  }

  /**
   * Calculate total trading cost
   */
  totalTradingCost(
    volume: number,
    averagePrice: number,
    bidPrice: number,
    askPrice: number,
    marketDepth: number,
    volatility: number,
    executionSpeed: number,
    side: 'buy' | 'sell'
  ): TradingCostBreakdown {
    // 1. Spread cost
    const midpoint = (bidPrice + askPrice) / 2;
    const effectivePrice = side === 'buy' ? askPrice : bidPrice;
    const spreadCost = Math.abs(effectivePrice - midpoint) * volume;
    
    // 2. Impact cost
    const permanentImpact = this.impactModel.calculatePermanentImpact(
      volume,
      marketDepth,
      volatility
    );
    const temporaryImpact = this.impactModel.calculateTemporaryImpact(
      volume,
      executionSpeed,
      volatility
    );
    const impactCost = averagePrice * (permanentImpact + temporaryImpact) * volume;
    
    // 3. Timing cost (opportunity cost)
    // Simplified as volatility-based cost
    const timingCost = volatility * averagePrice * volume * executionSpeed / 100;
    
    const totalCost = spreadCost + impactCost + timingCost;
    
    return {
      spreadCost,
      impactCost,
      timingCost,
      totalCost,
      implementationShortfall: totalCost / (averagePrice * volume)
    };
  }

  /**
   * Calculate implementation shortfall
   */
  implementationShortfall(
    decisionPrice: number,
    averageExecutionPrice: number,
    volume: number,
    side: 'buy' | 'sell'
  ): number {
    const multiplier = side === 'buy' ? 1 : -1;
    const shortfall = multiplier * (averageExecutionPrice - decisionPrice) * volume;
    return shortfall / (decisionPrice * volume);
  }
}

/**
 * Order Book Depth Analyzer
 */
export class OrderBookDepthAnalyzer {
  /**
   * Analyze order book depth at multiple price levels
   */
  analyzeDepth(
    orderBook: OrderBookSnapshot,
    levels: number = 10
  ): {
    cumulativeBidDepth: number[];
    cumulativeAskDepth: number[];
    depthImbalance: number[];
    vwaBid: number;
    vwaAsk: number;
  } {
    const cumulativeBidDepth: number[] = [];
    const cumulativeAskDepth: number[] = [];
    const depthImbalance: number[] = [];
    
    let bidSum = 0;
    let askSum = 0;
    let bidValueSum = 0;
    let askValueSum = 0;
    
    for (let i = 0; i < levels && i < Math.max(orderBook.bids.length, orderBook.asks.length); i++) {
      const bidVol = orderBook.bids[i]?.volume || 0;
      const askVol = orderBook.asks[i]?.volume || 0;
      
      bidSum += bidVol;
      askSum += askVol;
      
      cumulativeBidDepth.push(bidSum);
      cumulativeAskDepth.push(askSum);
      
      const imbalance = bidSum - askSum;
      depthImbalance.push(imbalance);
      
      if (orderBook.bids[i]) {
        bidValueSum += orderBook.bids[i].price * bidVol;
      }
      if (orderBook.asks[i]) {
        askValueSum += orderBook.asks[i].price * askVol;
      }
    }
    
    const vwaBid = bidSum > 0 ? bidValueSum / bidSum : 0;
    const vwaAsk = askSum > 0 ? askValueSum / askSum : 0;
    
    return {
      cumulativeBidDepth,
      cumulativeAskDepth,
      depthImbalance,
      vwaBid,
      vwaAsk
    };
  }

  /**
   * Calculate price impact for a given order size
   */
  calculatePriceImpact(
    orderSize: number,
    side: 'buy' | 'sell',
    orderBook: OrderBookSnapshot
  ): number {
    const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
    
    let remainingSize = orderSize;
    let totalCost = 0;
    
    for (const level of levels) {
      if (remainingSize <= 0) break;
      
      const volumeAtLevel = Math.min(level.volume, remainingSize);
      totalCost += volumeAtLevel * level.price;
      remainingSize -= volumeAtLevel;
    }
    
    if (remainingSize > 0) {
      // Not enough liquidity in the order book
      return Infinity;
    }
    
    const averagePrice = totalCost / orderSize;
    const referencePrice = side === 'buy' ? orderBook.asks[0].price : orderBook.bids[0].price;
    
    return (averagePrice - referencePrice) / referencePrice;
  }
}

/**
 * Liquidity Resilience Analyzer
 */
export class LiquidityResilienceAnalyzer {
  /**
   * Measure how quickly liquidity recovers after a large trade
   */
  measureResilienceRate(
    orderBookSnapshots: OrderBookSnapshot[],
    tradeTimestamp: number
  ): {
    recoveryTime: number; // milliseconds
    recoveryRate: number; // depth per second
    halfLifeTime: number;
  } {
    if (orderBookSnapshots.length < 2) {
      return { recoveryTime: 0, recoveryRate: 0, halfLifeTime: 0 };
    }
    
    // Find snapshot right after trade
    const tradeIndex = orderBookSnapshots.findIndex(s => s.timestamp >= tradeTimestamp);
    if (tradeIndex === -1 || tradeIndex >= orderBookSnapshots.length - 1) {
      return { recoveryTime: 0, recoveryRate: 0, halfLifeTime: 0 };
    }
    
    const metrics = new LiquidityMetrics();
    const initialDepth = metrics.calculateMarketDepth(orderBookSnapshots[tradeIndex]);
    
    // Find when depth recovers to pre-trade levels
    const preTradeDepth = tradeIndex > 0 
      ? metrics.calculateMarketDepth(orderBookSnapshots[tradeIndex - 1]).totalDepth
      : initialDepth.totalDepth;
    
    let recoveryIndex = tradeIndex;
    for (let i = tradeIndex + 1; i < orderBookSnapshots.length; i++) {
      const currentDepth = metrics.calculateMarketDepth(orderBookSnapshots[i]).totalDepth;
      if (currentDepth >= preTradeDepth * 0.95) { // 95% recovery
        recoveryIndex = i;
        break;
      }
    }
    
    const recoveryTime = orderBookSnapshots[recoveryIndex].timestamp - tradeTimestamp;
    const depthChange = metrics.calculateMarketDepth(orderBookSnapshots[recoveryIndex]).totalDepth - initialDepth.totalDepth;
    const recoveryRate = recoveryTime > 0 ? (depthChange / recoveryTime) * 1000 : 0;
    
    // Calculate half-life (time to recover 50% of depth)
    let halfLifeTime = 0;
    const targetDepth = (initialDepth.totalDepth + preTradeDepth) / 2;
    for (let i = tradeIndex + 1; i < orderBookSnapshots.length; i++) {
      const currentDepth = metrics.calculateMarketDepth(orderBookSnapshots[i]).totalDepth;
      if (currentDepth >= targetDepth) {
        halfLifeTime = orderBookSnapshots[i].timestamp - tradeTimestamp;
        break;
      }
    }
    
    return {
      recoveryTime,
      recoveryRate,
      halfLifeTime
    };
  }

  /**
   * Calculate liquidity resilience score (0-100)
   */
  calculateResilienceScore(
    recoveryTime: number,
    marketVolatility: number
  ): number {
    // Lower recovery time and volatility = higher resilience
    const timeScore = Math.max(0, 100 - recoveryTime / 1000); // 1 second = 1 point deduction
    const volatilityScore = Math.max(0, 100 - marketVolatility * 10000);
    
    return (timeScore + volatilityScore) / 2;
  }
}

/**
 * Intraday Liquidity Pattern Analyzer
 */
export class IntradayLiquidityAnalyzer {
  /**
   * Analyze liquidity patterns throughout the trading day
   */
  analyzeDailyPattern(
    orderBookSnapshots: OrderBookSnapshot[]
  ): {
    hourlyLiquidity: Array<{ hour: number; avgDepth: number; avgSpread: number }>;
    peakLiquidityHour: number;
    lowestLiquidityHour: number;
    liquidityVariance: number;
  } {
    const hourlyData = new Map<number, { depths: number[]; spreads: number[] }>();
    
    const metrics = new LiquidityMetrics();
    
    for (const snapshot of orderBookSnapshots) {
      const date = new Date(snapshot.timestamp);
      const hour = date.getHours();
      
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, { depths: [], spreads: [] });
      }
      
      const depth = metrics.calculateMarketDepth(snapshot).totalDepth;
      const spread = snapshot.asks[0] && snapshot.bids[0]
        ? snapshot.asks[0].price - snapshot.bids[0].price
        : 0;
      
      hourlyData.get(hour)!.depths.push(depth);
      hourlyData.get(hour)!.spreads.push(spread);
    }
    
    // Calculate hourly averages
    const hourlyLiquidity: Array<{ hour: number; avgDepth: number; avgSpread: number }> = [];
    let maxDepth = 0;
    let minDepth = Infinity;
    let peakLiquidityHour = 0;
    let lowestLiquidityHour = 0;
    const allDepths: number[] = [];
    
    for (const [hour, data] of hourlyData.entries()) {
      const avgDepth = data.depths.reduce((a, b) => a + b, 0) / data.depths.length;
      const avgSpread = data.spreads.reduce((a, b) => a + b, 0) / data.spreads.length;
      
      hourlyLiquidity.push({ hour, avgDepth, avgSpread });
      allDepths.push(avgDepth);
      
      if (avgDepth > maxDepth) {
        maxDepth = avgDepth;
        peakLiquidityHour = hour;
      }
      
      if (avgDepth < minDepth) {
        minDepth = avgDepth;
        lowestLiquidityHour = hour;
      }
    }
    
    // Calculate variance
    const meanDepth = allDepths.reduce((a, b) => a + b, 0) / allDepths.length;
    const liquidityVariance = allDepths.reduce((sum, depth) => {
      return sum + Math.pow(depth - meanDepth, 2);
    }, 0) / allDepths.length;
    
    return {
      hourlyLiquidity: hourlyLiquidity.sort((a, b) => a.hour - b.hour),
      peakLiquidityHour,
      lowestLiquidityHour,
      liquidityVariance
    };
  }
}

/**
 * Comprehensive liquidity risk assessment
 */
export interface LiquidityRiskAssessment {
  riskScore: number; // 0-100, higher = more risk
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  marketDepth: {
    bidDepth: number;
    askDepth: number;
    totalDepth: number;
  };
  slippageEstimate: SlippageEstimate;
  tradingCost: TradingCostBreakdown;
  liquidityMetrics: LiquidityMetricsResult;
  warnings: string[];
  recommendations: string[];
}

/**
 * Assess overall liquidity risk for a planned trade
 */
export function assessLiquidityRisk(params: {
  orderVolume: number;
  orderSide: 'buy' | 'sell';
  currentPrice: number;
  orderBook: OrderBookSnapshot;
  recentTrades: TradeData[];
  averageDailyVolume: number;
  volatility: number;
  outstandingShares: number;
  executionSpeed?: number;
}): LiquidityRiskAssessment {
  const {
    orderVolume,
    orderSide,
    currentPrice,
    orderBook,
    recentTrades,
    averageDailyVolume,
    volatility,
    outstandingShares,
    executionSpeed = 1.0
  } = params;

  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Initialize analyzers
  const liquidityMetrics = new LiquidityMetrics();
  const slippageEstimator = new SlippageEstimator();
  const liquidityCostModel = new LiquidityCostModel();
  const spreadAnalyzer = new BidAskSpreadAnalyzer();

  // Calculate market depth
  const marketDepth = liquidityMetrics.calculateMarketDepth(orderBook);

  // Calculate comprehensive liquidity metrics
  const metrics = liquidityMetrics.calculateComprehensiveMetrics(
    recentTrades,
    orderBook,
    outstandingShares
  );

  // Estimate slippage
  const slippageEstimate = slippageEstimator.predictSlippage(
    orderVolume,
    averageDailyVolume,
    volatility,
    orderBook
  );

  // Calculate trading costs
  const bestBid = orderBook.bids[0]?.price || currentPrice;
  const bestAsk = orderBook.asks[0]?.price || currentPrice;
  const tradingCost = liquidityCostModel.totalTradingCost(
    orderVolume,
    currentPrice,
    bestBid,
    bestAsk,
    marketDepth.totalDepth,
    volatility,
    executionSpeed,
    orderSide
  );

  // Calculate risk score (0-100)
  let riskScore = 0;

  // Factor 1: Volume ratio (0-30 points)
  const volumeRatio = orderVolume / averageDailyVolume;
  if (volumeRatio > 0.1) {
    riskScore += 30;
    warnings.push(`Order size is ${(volumeRatio * 100).toFixed(1)}% of average daily volume`);
    recommendations.push('Consider splitting the order using VWAP or TWAP execution');
  } else if (volumeRatio > 0.05) {
    riskScore += 20;
    warnings.push('Order size is significant relative to daily volume');
  } else if (volumeRatio > 0.01) {
    riskScore += 10;
  }

  // Factor 2: Market depth (0-25 points)
  const depthRatio = orderVolume / marketDepth.totalDepth;
  if (depthRatio > 0.5) {
    riskScore += 25;
    warnings.push('Insufficient market depth for order size');
    recommendations.push('Wait for deeper market conditions or reduce order size');
  } else if (depthRatio > 0.3) {
    riskScore += 18;
    warnings.push('Limited market depth');
  } else if (depthRatio > 0.1) {
    riskScore += 10;
  }

  // Factor 3: Slippage estimate (0-25 points)
  if (slippageEstimate.slippageBps > 50) {
    riskScore += 25;
    warnings.push(`High expected slippage: ${slippageEstimate.slippageBps.toFixed(2)} bps`);
  } else if (slippageEstimate.slippageBps > 20) {
    riskScore += 18;
    warnings.push(`Moderate slippage expected: ${slippageEstimate.slippageBps.toFixed(2)} bps`);
  } else if (slippageEstimate.slippageBps > 5) {
    riskScore += 10;
  }

  // Factor 4: Spread cost (0-20 points)
  const quotedSpread = spreadAnalyzer.calculateQuotedSpread(bestBid, bestAsk);
  const proportionalSpread = spreadAnalyzer.calculateProportionalSpread(bestBid, bestAsk);
  if (proportionalSpread > 0.005) {
    riskScore += 20;
    warnings.push(`Wide bid-ask spread: ${(proportionalSpread * 100).toFixed(3)}%`);
  } else if (proportionalSpread > 0.002) {
    riskScore += 12;
  } else if (proportionalSpread > 0.001) {
    riskScore += 5;
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 75) {
    riskLevel = 'critical';
    recommendations.push('Strongly consider postponing or canceling this trade');
  } else if (riskScore >= 50) {
    riskLevel = 'high';
    recommendations.push('Use limit orders and execute in smaller chunks');
  } else if (riskScore >= 25) {
    riskLevel = 'medium';
    recommendations.push('Monitor execution carefully and consider algorithmic strategies');
  } else {
    riskLevel = 'low';
    recommendations.push('Favorable liquidity conditions for execution');
  }

  // Additional recommendations based on metrics
  if (metrics.amihudRatio > 0.0001) {
    recommendations.push('High Amihud ratio suggests low liquidity - consider longer execution horizon');
  }

  if (tradingCost.implementationShortfall > 0.01) {
    recommendations.push('High implementation shortfall expected - optimize execution timing');
  }

  return {
    riskScore,
    riskLevel,
    marketDepth,
    slippageEstimate,
    tradingCost,
    liquidityMetrics: metrics,
    warnings,
    recommendations
  };
}