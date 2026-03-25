/**
 * Multi-Timeframe Trading Coordination System
 * 
 * Coordinates trading strategies across different time horizons to maximize opportunities
 * while preventing conflicting signals and managing capital allocation.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Market data structure for a single candlestick/bar
 */
export interface MarketData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trading signal with action, strength, and metadata
 */
export interface Signal {
  action: 'buy' | 'sell' | 'hold';
  strength: number; // 0-1, confidence in the signal
  timeframe: string;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Consolidated signal from multiple timeframes
 */
export interface ConsolidatedSignal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number; // 0-1, overall confidence
  allocation: number; // Total capital allocation percentage
  sources: string[]; // Which timeframes contributed to this signal
  perStrategyAllocation: Map<string, number>; // Capital per strategy
  metadata?: Record<string, unknown>;
}

/**
 * Strategy interface for trading bots
 */
export interface Strategy {
  timeframe: string;
  analyze: (data: MarketData[]) => Promise<Signal>;
  priority: number; // Higher priority = longer timeframe
  capitalAllocation: number; // Default allocation percentage
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate simple moving average
 */
function calculateSMA(data: MarketData[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(0);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    sma.push(sum / period);
  }
  return sma;
}

/**
 * Calculate exponential moving average
 */
function calculateEMA(data: MarketData[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[i].close);
    } else {
      ema.push((data[i].close - ema[i - 1]) * multiplier + ema[i - 1]);
    }
  }
  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(data: MarketData[], period: number = 14): number[] {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }

    const change = data[i].close - data[i - 1].close;
    
    if (i < period) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
      rsi.push(50);
      continue;
    }

    if (i === period) {
      gains /= period;
      losses /= period;
    } else {
      gains = (gains * (period - 1) + (change > 0 ? change : 0)) / period;
      losses = (losses * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    }

    const rs = losses === 0 ? 100 : gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
  }

  return rsi;
}

// ============================================================================
// ScalpingBot - 1-Minute Chart Trading
// ============================================================================

/**
 * ScalpingBot - High-frequency trading on 1-minute charts
 * 
 * Characteristics:
 * - Fast entry/exit
 * - Tight stops (0.1-0.3%)
 * - High frequency (50-100 trades/day)
 * - Target: 0.2-0.5% per trade
 */
export class ScalpingBot implements Strategy {
  public readonly timeframe = '1m';
  public readonly priority = 1; // Lowest priority
  public readonly capitalAllocation = 0.20; // 20% of capital

  /**
   * Analyze market data and generate trading signal
   * Uses EMA crossovers and volume spikes for quick scalps
   */
  async analyzeMarket(data: MarketData[]): Promise<Signal> {
    if (data.length < 20) {
      return { action: 'hold', strength: 0, timeframe: this.timeframe };
    }

    const closes = data.map(d => d.close);
    const currentPrice = closes[closes.length - 1];
    
    // Fast EMA crossover (5/10)
    const ema5 = calculateEMA(data, 5);
    const ema10 = calculateEMA(data, 10);
    const currentEma5 = ema5[ema5.length - 1];
    const currentEma10 = ema10[ema10.length - 1];
    const prevEma5 = ema5[ema5.length - 2];
    const prevEma10 = ema10[ema10.length - 2];

    // Volume analysis
    const avgVolume = data.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20;
    const currentVolume = data[data.length - 1].volume;
    const volumeSpike = currentVolume > avgVolume * 1.5;

    // RSI for momentum
    const rsi = calculateRSI(data, 14);
    const currentRsi = rsi[rsi.length - 1];

    let signal: Signal = { action: 'hold', strength: 0, timeframe: this.timeframe };

    // Bullish crossover
    if (prevEma5 <= prevEma10 && currentEma5 > currentEma10 && volumeSpike && currentRsi < 70) {
      const strength = volumeSpike ? 0.8 : 0.6;
      signal = {
        action: 'buy',
        strength,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 0.997, // 0.3% stop loss
        takeProfit: currentPrice * 1.005, // 0.5% take profit
      };
    }
    // Bearish crossover
    else if (prevEma5 >= prevEma10 && currentEma5 < currentEma10 && volumeSpike && currentRsi > 30) {
      const strength = volumeSpike ? 0.8 : 0.6;
      signal = {
        action: 'sell',
        strength,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 1.003, // 0.3% stop loss
        takeProfit: currentPrice * 0.995, // 0.5% take profit
      };
    }

    return signal;
  }
}

// ============================================================================
// DayTradingBot - 5-15 Minute Charts
// ============================================================================

/**
 * DayTradingBot - Intraday swing trading
 * 
 * Characteristics:
 * - Intraday swings
 * - Medium stops (0.5-1%)
 * - Moderate frequency (10-20 trades/day)
 * - Target: 1-3% per trade
 */
export class DayTradingBot implements Strategy {
  public readonly timeframe = '15m';
  public readonly priority = 2;
  public readonly capitalAllocation = 0.30; // 30% of capital

  /**
   * Analyze market for intraday swings
   * Uses trend following with RSI confirmation
   */
  async analyzeMarket(data: MarketData[]): Promise<Signal> {
    if (data.length < 50) {
      return { action: 'hold', strength: 0, timeframe: this.timeframe };
    }

    const closes = data.map(d => d.close);
    const currentPrice = closes[closes.length - 1];

    // Medium-term trend (20/50 EMA)
    const ema20 = calculateEMA(data, 20);
    const ema50 = calculateEMA(data, 50);
    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];

    // RSI for momentum
    const rsi = calculateRSI(data, 14);
    const currentRsi = rsi[rsi.length - 1];

    // MACD-like momentum
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    const macdLine = ema12.map((val, i) => val - ema26[i]);
    const currentMacd = macdLine[macdLine.length - 1];
    const prevMacd = macdLine[macdLine.length - 2];

    let signal: Signal = { action: 'hold', strength: 0, timeframe: this.timeframe };

    // Bullish: uptrend + oversold RSI + positive MACD momentum
    if (currentEma20 > currentEma50 && currentRsi < 40 && currentMacd > prevMacd) {
      signal = {
        action: 'buy',
        strength: 0.75,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 0.99, // 1% stop loss
        takeProfit: currentPrice * 1.03, // 3% take profit
      };
    }
    // Bearish: downtrend + overbought RSI + negative MACD momentum
    else if (currentEma20 < currentEma50 && currentRsi > 60 && currentMacd < prevMacd) {
      signal = {
        action: 'sell',
        strength: 0.75,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 1.01, // 1% stop loss
        takeProfit: currentPrice * 0.97, // 3% take profit
      };
    }

    return signal;
  }
}

// ============================================================================
// SwingTradingBot - 4-Hour and Daily Charts
// ============================================================================

/**
 * SwingTradingBot - Multi-day position trading
 * 
 * Characteristics:
 * - Multi-day positions
 * - Wider stops (2-5%)
 * - Low frequency (1-5 trades/week)
 * - Target: 5-15% per trade
 */
export class SwingTradingBot implements Strategy {
  public readonly timeframe = '4h';
  public readonly priority = 3;
  public readonly capitalAllocation = 0.40; // 40% of capital

  /**
   * Analyze market for swing trading opportunities
   * Uses longer-term trends and support/resistance
   */
  async analyzeMarket(data: MarketData[]): Promise<Signal> {
    if (data.length < 100) {
      return { action: 'hold', strength: 0, timeframe: this.timeframe };
    }

    const closes = data.map(d => d.close);
    const currentPrice = closes[closes.length - 1];

    // Long-term trend (50/200 SMA)
    const sma50 = calculateSMA(data, 50);
    const sma200 = calculateSMA(data, 100); // Using 100 instead of 200 for 4h chart
    const currentSma50 = sma50[sma50.length - 1];
    const currentSma200 = sma200[sma200.length - 1];

    // RSI for confirmation
    const rsi = calculateRSI(data, 14);
    const currentRsi = rsi[rsi.length - 1];

    // Price momentum
    const priceChange20 = (currentPrice - data[data.length - 20].close) / data[data.length - 20].close;

    // Support and resistance levels
    const recentHighs = data.slice(-50).map(d => d.high);
    const recentLows = data.slice(-50).map(d => d.low);
    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);

    let signal: Signal = { action: 'hold', strength: 0, timeframe: this.timeframe };

    // Bullish: golden cross + momentum + near support
    if (currentSma50 > currentSma200 && priceChange20 > 0 && currentPrice < support * 1.05 && currentRsi < 45) {
      signal = {
        action: 'buy',
        strength: 0.85,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 0.95, // 5% stop loss
        takeProfit: currentPrice * 1.15, // 15% take profit
      };
    }
    // Bearish: death cross + negative momentum + near resistance
    else if (currentSma50 < currentSma200 && priceChange20 < 0 && currentPrice > resistance * 0.95 && currentRsi > 55) {
      signal = {
        action: 'sell',
        strength: 0.85,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 1.05, // 5% stop loss
        takeProfit: currentPrice * 0.85, // 15% take profit
      };
    }

    return signal;
  }
}

// ============================================================================
// PositionTradingBot - Weekly Charts
// ============================================================================

/**
 * PositionTradingBot - Long-term trend trading
 * 
 * Characteristics:
 * - Long-term trends
 * - Very wide stops (5-10%)
 * - Very low frequency (1-2 trades/month)
 * - Target: 20-50% per trade
 */
export class PositionTradingBot implements Strategy {
  public readonly timeframe = '1w';
  public readonly priority = 4; // Highest priority
  public readonly capitalAllocation = 0.10; // 10% of capital

  /**
   * Analyze market for long-term position trades
   * Uses macro trends and fundamental momentum
   */
  async analyzeMarket(data: MarketData[]): Promise<Signal> {
    if (data.length < 52) { // At least 1 year of weekly data
      return { action: 'hold', strength: 0, timeframe: this.timeframe };
    }

    const closes = data.map(d => d.close);
    const currentPrice = closes[closes.length - 1];

    // Very long-term trend (26/52 week SMAs)
    const sma26 = calculateSMA(data, 26);
    const sma52 = calculateSMA(data, 52);
    const currentSma26 = sma26[sma26.length - 1];
    const currentSma52 = sma52[sma52.length - 1];
    const prevSma26 = sma26[sma26.length - 2];
    const prevSma52 = sma52[sma52.length - 2];

    // Long-term momentum (13-week rate of change)
    const roc13 = ((currentPrice - data[data.length - 13].close) / data[data.length - 13].close) * 100;

    // Volume trend (26-week average)
    const avgVolume26 = data.slice(-26).reduce((sum, d) => sum + d.volume, 0) / 26;
    const avgVolume52 = data.slice(-52).reduce((sum, d) => sum + d.volume, 0) / 52;
    const volumeIncreasing = avgVolume26 > avgVolume52 * 1.1;

    // Price action - higher highs and higher lows
    const last26Highs = data.slice(-26).map(d => d.high);
    const last52Highs = data.slice(-52, -26).map(d => d.high);
    const higherHighs = Math.max(...last26Highs) > Math.max(...last52Highs);

    let signal: Signal = { action: 'hold', strength: 0, timeframe: this.timeframe };

    // Bullish: long-term uptrend + strong momentum + volume confirmation
    if (
      prevSma26 < prevSma52 && currentSma26 > currentSma52 && // Golden cross
      roc13 > 10 && // Strong positive momentum
      volumeIncreasing &&
      higherHighs
    ) {
      signal = {
        action: 'buy',
        strength: 0.95,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 0.90, // 10% stop loss
        takeProfit: currentPrice * 1.50, // 50% take profit
        metadata: { roc13, volumeTrend: 'increasing' }
      };
    }
    // Bearish: long-term downtrend + negative momentum
    else if (
      prevSma26 > prevSma52 && currentSma26 < currentSma52 && // Death cross
      roc13 < -10 && // Strong negative momentum
      !higherHighs
    ) {
      signal = {
        action: 'sell',
        strength: 0.95,
        timeframe: this.timeframe,
        stopLoss: currentPrice * 1.10, // 10% stop loss
        takeProfit: currentPrice * 0.50, // 50% take profit
        metadata: { roc13, volumeTrend: volumeIncreasing ? 'increasing' : 'decreasing' }
      };
    }

    return signal;
  }
}

// ============================================================================
// MultiTimeframeCoordinator - Main Coordination System
// ============================================================================

/**
 * MultiTimeframeCoordinator - Coordinates trading strategies across multiple timeframes
 * 
 * Features:
 * - Prevents conflicting signals between timeframes
 * - Prioritizes longer timeframe signals
 * - Manages position sizing and capital allocation
 * - Synchronizes entries across strategies
 */
export class MultiTimeframeCoordinator {
  private strategies: Map<string, Strategy> = new Map();

  constructor() {
    // Initialize with empty strategy map
  }

  /**
   * Add a strategy to the coordinator
   */
  async addStrategy(strategy: Strategy, timeframe: string): Promise<void> {
    this.strategies.set(timeframe, strategy);
  }

  /**
   * Coordinate signals from all strategies
   * Returns a consolidated signal with capital allocation
   */
  async coordinateSignals(): Promise<ConsolidatedSignal> {
    // Collect signals from all strategies
    const signals: Signal[] = [];
    const strategyMap = new Map<string, Signal>();

    for (const [timeframe, strategy] of this.strategies.entries()) {
      // In a real implementation, this would fetch actual market data
      // For now, we'll assume the strategy has been called separately
      strategyMap.set(timeframe, { 
        action: 'hold', 
        strength: 0, 
        timeframe 
      });
    }

    // Get all signals
    for (const [timeframe, signal] of strategyMap.entries()) {
      if (signal.action !== 'hold') {
        signals.push(signal);
      }
    }

    // If no signals, return hold
    if (signals.length === 0) {
      return {
        action: 'hold',
        confidence: 0,
        allocation: 0,
        sources: [],
        perStrategyAllocation: new Map(),
      };
    }

    // Resolve conflicts
    const resolvedAction = this.resolveConflicts(signals);

    // Calculate confidence
    const confidence = this.calculateConfidence(signals, resolvedAction);

    // Get sources
    const sources = signals
      .filter(s => s.action === resolvedAction)
      .map(s => s.timeframe);

    // Allocate capital
    const allocation = this.allocateCapital(signals, resolvedAction);

    return {
      action: resolvedAction,
      confidence,
      allocation: allocation.total,
      sources,
      perStrategyAllocation: allocation.perStrategy,
    };
  }

  /**
   * Resolve conflicts between timeframe signals
   * Longer timeframes take priority
   */
  private resolveConflicts(signals: Signal[]): 'buy' | 'sell' | 'hold' {
    if (signals.length === 0) return 'hold';

    // Get the highest priority signal (longest timeframe)
    const sortedByPriority = [...signals].sort((a, b) => {
      const priorityA = this.getTimeframePriority(a.timeframe);
      const priorityB = this.getTimeframePriority(b.timeframe);
      return priorityB - priorityA;
    });

    const highestPrioritySignal = sortedByPriority[0];

    // Check if all signals agree
    const allAgree = signals.every(s => s.action === highestPrioritySignal.action);

    if (allAgree) {
      return highestPrioritySignal.action;
    }

    // Check for strong disagreement (buy vs sell)
    const hasBuy = signals.some(s => s.action === 'buy');
    const hasSell = signals.some(s => s.action === 'sell');

    if (hasBuy && hasSell) {
      // Conflicting signals - prioritize longer timeframe
      return highestPrioritySignal.action;
    }

    // If majority agree with highest priority, use it
    const majorityAction = this.getMajorityAction(signals);
    if (majorityAction === highestPrioritySignal.action) {
      return highestPrioritySignal.action;
    }

    // Default to highest priority signal
    return highestPrioritySignal.action;
  }

  /**
   * Get the priority of a timeframe (higher = longer term)
   */
  private getTimeframePriority(timeframe: string): number {
    const priorities: Record<string, number> = {
      '1m': 1,
      '5m': 2,
      '15m': 2,
      '1h': 3,
      '4h': 3,
      '1d': 4,
      '1w': 4,
    };
    return priorities[timeframe] || 0;
  }

  /**
   * Get the majority action from signals
   */
  private getMajorityAction(signals: Signal[]): 'buy' | 'sell' | 'hold' {
    const counts = signals.reduce((acc, s) => {
      acc[s.action] = (acc[s.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedActions = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sortedActions[0][0] as 'buy' | 'sell' | 'hold';
  }

  /**
   * Calculate overall confidence based on signal agreement
   */
  private calculateConfidence(signals: Signal[], action: 'buy' | 'sell' | 'hold'): number {
    if (signals.length === 0) return 0;

    // Filter signals matching the action
    const matchingSignals = signals.filter(s => s.action === action);

    if (matchingSignals.length === 0) return 0;

    // Average strength of matching signals
    const avgStrength = matchingSignals.reduce((sum, s) => sum + s.strength, 0) / matchingSignals.length;

    // Bonus for agreement (more timeframes agreeing = higher confidence)
    const agreementBonus = (matchingSignals.length / signals.length) * 0.2;

    return Math.min(1, avgStrength + agreementBonus);
  }

  /**
   * Allocate capital across strategies
   * Returns total allocation and per-strategy breakdown
   */
  private allocateCapital(
    signals: Signal[], 
    action: 'buy' | 'sell' | 'hold'
  ): { total: number; perStrategy: Map<string, number> } {
    const perStrategy = new Map<string, number>();
    let total = 0;

    // Base allocations by timeframe
    const baseAllocations: Record<string, number> = {
      '1m': 0.20,   // 20% for scalping
      '15m': 0.30,  // 30% for day trading
      '4h': 0.40,   // 40% for swing trading
      '1w': 0.10,   // 10% for position trading
    };

    // Filter signals that match the action
    const activeSignals = signals.filter(s => s.action === action);

    if (activeSignals.length === 0) {
      return { total: 0, perStrategy };
    }

    // Allocate to active strategies only
    for (const signal of activeSignals) {
      const baseAllocation = baseAllocations[signal.timeframe] || 0.25;
      const adjustedAllocation = baseAllocation * signal.strength;
      perStrategy.set(signal.timeframe, adjustedAllocation);
      total += adjustedAllocation;
    }

    // Normalize if total exceeds 1.0
    if (total > 1.0) {
      for (const [timeframe, allocation] of perStrategy.entries()) {
        perStrategy.set(timeframe, allocation / total);
      }
      total = 1.0;
    }

    return { total, perStrategy };
  }

  /**
   * Check if signals are synchronized for entry
   * Returns true if 2+ timeframes agree
   */
  synchronizeEntries(signals: Signal[]): boolean {
    if (signals.length < 2) return false;

    // Group by action
    const actions = signals.reduce((acc, s) => {
      acc[s.action] = (acc[s.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Check if at least 2 timeframes agree on buy or sell
    return (actions['buy'] || 0) >= 2 || (actions['sell'] || 0) >= 2;
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): Map<string, Strategy> {
    return this.strategies;
  }

  /**
   * Remove a strategy
   */
  removeStrategy(timeframe: string): void {
    this.strategies.delete(timeframe);
  }

  /**
   * Clear all strategies
   */
  clearStrategies(): void {
    this.strategies.clear();
  }
}