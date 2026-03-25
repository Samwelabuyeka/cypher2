/**
 * Signal Generation Module
 * 
 * This module uses mathematical constants and algorithms to generate trading signals,
 * optimize position sizes, detect patterns, and assess risk in real-time.
 */

/**
 * Type definitions
 */

export interface PricePoint {
  time: Date;
  price: number;
  volume: number;
}

export interface Indicators {
  rsi?: number;
  macd?: {
    macd: number;
    signal: number;
  };
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
  };
}

export interface MarketDepth {
  bidVolume: number;
  askVolume: number;
}

export type StrategyType = 'momentum' | 'mean-reversion' | 'breakout' | 'trend-following';

export interface SignalParams {
  priceHistory: PricePoint[];
  indicators: Indicators;
  marketDepth?: MarketDepth;
  strategyType: StrategyType;
}

export type SignalAction = 'buy' | 'sell' | 'hold';

export interface TradingSignal {
  action: SignalAction;
  confidence: number;
  size: number;
  metadata: {
    entropy: number;
    volatility: number;
    trend: number;
    marketCondition: string;
    reasoning: string[];
  };
}

export interface PositionSizeParams {
  balance: number;
  risk: number;
  volatility: number;
  confidence: number;
  xi: number;
}

export interface Position {
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
}

export interface MarketConditions {
  volatility: number;
  liquidity: number;
  trend: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  riskScore: number;
  level: RiskLevel;
  recommendations: string[];
}

export interface Pattern {
  type: 'fractal' | 'support' | 'resistance' | 'channel' | 'triangle' | 'head-shoulders';
  confidence: number;
  priceLevel?: number;
  startIndex: number;
  endIndex: number;
  metadata: Record<string, unknown>;
}

/**
 * Mathematical Constants
 */

// Ψ (Psi): Dynamic scaling factor based on market regime
const PSI_BASE = 1.618; // Golden ratio as base
const PSI_VOLATILE = 2.414; // Increased scaling for volatile markets
const PSI_CALM = 1.272; // Reduced scaling for calm markets

// Ωₜ (Omega_t): Time-weighted decay factor
const OMEGA_T = 0.94; // Exponential decay weight for time series

// Λ (Lambda): Risk/aggression balance factor
const LAMBDA_CONSERVATIVE = 0.5;
const LAMBDA_MODERATE = 1.0;
const LAMBDA_AGGRESSIVE = 1.5;

// Ξ (Xi): Risk adjustment parameter
const XI_DEFAULT = 0.382; // Based on Fibonacci retracement

/**
 * Helper Functions
 */

/**
 * Calculate Ψ (Psi) based on current market conditions
 */
function calculatePsi(volatility: number): number {
  if (volatility > 0.03) {
    return PSI_VOLATILE;
  } else if (volatility < 0.01) {
    return PSI_CALM;
  }
  return PSI_BASE;
}

/**
 * Calculate time-weighted average using Ωₜ
 */
function calculateTimeWeightedAverage(values: number[]): number {
  if (values.length === 0) return 0;
  
  let weightedSum = 0;
  let weightSum = 0;
  
  for (let i = 0; i < values.length; i++) {
    const weight = Math.pow(OMEGA_T, values.length - 1 - i);
    weightedSum += values[i] * weight;
    weightSum += weight;
  }
  
  return weightedSum / weightSum;
}

/**
 * Calculate price volatility (standard deviation)
 */
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  return Math.sqrt(variance) / mean; // Normalized volatility
}

/**
 * Calculate price trend (-1 to 1, where -1 is strong downtrend, 1 is strong uptrend)
 */
function calculateTrend(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  // Linear regression slope
  const n = prices.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = prices.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgPrice = sumY / n;
  
  // Normalize slope to -1 to 1 range
  return Math.tanh(slope / avgPrice * 100);
}

/**
 * Main Exported Functions
 */

/**
 * Calculate market entropy from price data
 * 
 * Measures the randomness and unpredictability of price movements.
 * Higher values indicate more chaotic markets.
 * 
 * @param priceData - Array of prices
 * @returns Normalized entropy value (0-1)
 */
export function calculateEntropy(priceData: number[]): number {
  if (priceData.length < 2) return 0;
  
  // Calculate price returns
  const returns: number[] = [];
  for (let i = 1; i < priceData.length; i++) {
    returns.push((priceData[i] - priceData[i - 1]) / priceData[i - 1]);
  }
  
  // Create histogram bins for returns
  const bins = 20;
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const binSize = (max - min) / bins;
  
  const histogram = new Array(bins).fill(0);
  
  for (const ret of returns) {
    const binIndex = Math.min(Math.floor((ret - min) / binSize), bins - 1);
    histogram[binIndex]++;
  }
  
  // Calculate Shannon entropy
  let entropy = 0;
  const total = returns.length;
  
  for (const count of histogram) {
    if (count > 0) {
      const probability = count / total;
      entropy -= probability * Math.log2(probability);
    }
  }
  
  // Normalize to 0-1 range (max entropy for uniform distribution is log2(bins))
  return Math.min(entropy / Math.log2(bins), 1);
}

/**
 * Generate trading signal based on market conditions and indicators
 * 
 * Uses mathematical constants Ψ, Ωₜ, and Λ to generate signals with
 * varying confidence levels based on market regime.
 * 
 * @param params - Signal generation parameters
 * @returns Trading signal with action, confidence, and size recommendations
 */
export function generateTradingSignal(params: SignalParams): TradingSignal {
  const { priceHistory, indicators, marketDepth, strategyType } = params;
  
  if (priceHistory.length < 10) {
    return {
      action: 'hold',
      confidence: 0,
      size: 0,
      metadata: {
        entropy: 0,
        volatility: 0,
        trend: 0,
        marketCondition: 'insufficient-data',
        reasoning: ['Not enough price history to generate signal']
      }
    };
  }
  
  // Extract price and volume data
  const prices = priceHistory.map(p => p.price);
  const volumes = priceHistory.map(p => p.volume);
  
  // Calculate market metrics
  const volatility = calculateVolatility(prices);
  const trend = calculateTrend(prices);
  const entropy = calculateEntropy(prices);
  const psi = calculatePsi(volatility);
  
  // Calculate volume trend
  const volumeTrend = calculateTrend(volumes);
  
  // Determine Lambda based on strategy type
  let lambda: number;
  switch (strategyType) {
    case 'momentum':
      lambda = LAMBDA_AGGRESSIVE;
      break;
    case 'mean-reversion':
      lambda = LAMBDA_CONSERVATIVE;
      break;
    case 'breakout':
      lambda = LAMBDA_AGGRESSIVE;
      break;
    case 'trend-following':
      lambda = LAMBDA_MODERATE;
      break;
    default:
      lambda = LAMBDA_MODERATE;
  }
  
  // Initialize signal components
  let signalStrength = 0;
  const reasoning: string[] = [];
  
  // Strategy-specific signal generation
  switch (strategyType) {
    case 'momentum':
      // Momentum strategy: trend + volume confirmation
      signalStrength = trend * psi;
      if (indicators.rsi) {
        if (indicators.rsi > 70) {
          signalStrength += 0.5 * lambda;
          reasoning.push('RSI indicates overbought momentum');
        } else if (indicators.rsi < 30) {
          signalStrength -= 0.5 * lambda;
          reasoning.push('RSI indicates oversold momentum');
        }
      }
      if (volumeTrend > 0.3 && trend > 0) {
        signalStrength += 0.3 * lambda;
        reasoning.push('Increasing volume confirms uptrend');
      }
      break;
      
    case 'mean-reversion':
      // Mean reversion: look for extremes
      if (indicators.bollingerBands) {
        const currentPrice = prices[prices.length - 1];
        const { upper, lower, middle } = indicators.bollingerBands;
        
        if (currentPrice > upper) {
          signalStrength = -lambda * psi;
          reasoning.push('Price above upper Bollinger Band - sell signal');
        } else if (currentPrice < lower) {
          signalStrength = lambda * psi;
          reasoning.push('Price below lower Bollinger Band - buy signal');
        }
        
        // Mean reversion works better in low entropy markets
        signalStrength *= (1 - entropy);
      }
      break;
      
    case 'breakout':
      // Breakout strategy: trend + volatility expansion
      if (volatility > 0.02) {
        signalStrength = trend * lambda * psi;
        reasoning.push('High volatility breakout detected');
        
        if (volumeTrend > 0.5) {
          signalStrength *= 1.3;
          reasoning.push('Strong volume confirms breakout');
        }
      }
      break;
      
    case 'trend-following':
      // Trend following: sustained directional movement
      const recentPrices = prices.slice(-20);
      const recentTrend = calculateTrend(recentPrices);
      signalStrength = recentTrend * lambda;
      
      if (indicators.macd) {
        const { macd, signal } = indicators.macd;
        if (macd > signal && recentTrend > 0) {
          signalStrength += 0.4 * lambda;
          reasoning.push('MACD confirms uptrend');
        } else if (macd < signal && recentTrend < 0) {
          signalStrength -= 0.4 * lambda;
          reasoning.push('MACD confirms downtrend');
        }
      }
      break;
  }
  
  // Apply market depth adjustment if available
  if (marketDepth) {
    const depthRatio = marketDepth.bidVolume / (marketDepth.bidVolume + marketDepth.askVolume);
    const depthSignal = (depthRatio - 0.5) * 2; // Normalize to -1 to 1
    signalStrength += depthSignal * 0.2 * lambda;
    reasoning.push(`Market depth ratio: ${depthRatio.toFixed(2)}`);
  }
  
  // Apply time-weighted adjustment for recent price action
  const recentPrices = prices.slice(-5);
  const recentAvg = calculateTimeWeightedAverage(recentPrices);
  const currentPrice = prices[prices.length - 1];
  const priceDeviation = (currentPrice - recentAvg) / recentAvg;
  signalStrength += priceDeviation * psi * 0.3;
  
  // Determine action and confidence
  let action: SignalAction;
  let confidence: number;
  
  if (signalStrength > 0.3) {
    action = 'buy';
    confidence = Math.min(Math.abs(signalStrength) / 2, 1);
  } else if (signalStrength < -0.3) {
    action = 'sell';
    confidence = Math.min(Math.abs(signalStrength) / 2, 1);
  } else {
    action = 'hold';
    confidence = 0.5;
  }
  
  // Reduce confidence in high entropy (uncertain) markets
  confidence *= (1 - entropy * 0.5);
  
  // Calculate recommended position size (0-1 as fraction of available capital)
  const size = confidence * lambda * 0.5; // Max 50% of capital in single position
  
  // Determine market condition
  let marketCondition = 'normal';
  if (volatility > 0.03) marketCondition = 'highly-volatile';
  else if (volatility < 0.01) marketCondition = 'low-volatility';
  if (entropy > 0.7) marketCondition += '-chaotic';
  
  return {
    action,
    confidence,
    size: Math.max(0, Math.min(size, 1)),
    metadata: {
      entropy,
      volatility,
      trend,
      marketCondition,
      reasoning
    }
  };
}

/**
 * Optimize position size using Kelly Criterion with safety margin
 * 
 * Uses Ψ for dynamic sizing and Ξ for risk adjustment.
 * Implements a maximum 25% Kelly Criterion for safety.
 * 
 * @param params - Position sizing parameters
 * @returns Recommended position size in base currency
 */
export function optimizePositionSize(params: PositionSizeParams): number {
  const { balance, risk, volatility, confidence, xi } = params;
  
  if (balance <= 0 || confidence <= 0) return 0;
  
  // Calculate Psi based on volatility
  const psi = calculatePsi(volatility);
  
  // Kelly Criterion: f = (bp - q) / b
  // where b = odds, p = win probability, q = loss probability
  const winProbability = confidence;
  const lossProbability = 1 - confidence;
  
  // Assume risk/reward ratio based on risk parameter
  const riskRewardRatio = 2.0; // Target 2:1 reward:risk
  
  // Kelly fraction
  let kellyFraction = (winProbability * riskRewardRatio - lossProbability) / riskRewardRatio;
  
  // Apply safety margin (max 25% of Kelly)
  const safetyFactor = 0.25;
  kellyFraction = Math.max(0, kellyFraction * safetyFactor);
  
  // Apply Psi scaling (dynamic based on market conditions)
  kellyFraction *= psi / PSI_BASE;
  
  // Apply Xi (risk adjustment)
  const xiAdjusted = xi || XI_DEFAULT;
  kellyFraction *= (1 - xiAdjusted); // Xi reduces position size for risk management
  
  // Apply user risk tolerance
  kellyFraction *= risk;
  
  // Calculate position size
  let positionSize = balance * kellyFraction;
  
  // Additional volatility adjustment
  if (volatility > 0.03) {
    positionSize *= 0.7; // Reduce size in highly volatile markets
  }
  
  // Ensure position size is reasonable (max 25% of balance)
  positionSize = Math.min(positionSize, balance * 0.25);
  
  return Math.max(0, positionSize);
}

/**
 * Detect chart patterns using recursive formulas
 * 
 * Uses multi-layer Ψ recursion for pattern matching at different timeframes.
 * 
 * @param priceHistory - Array of price points
 * @returns Array of detected patterns with confidence scores
 */
export function detectPatterns(priceHistory: PricePoint[]): Pattern[] {
  if (priceHistory.length < 10) return [];
  
  const patterns: Pattern[] = [];
  const prices = priceHistory.map(p => p.price);
  const volatility = calculateVolatility(prices);
  const psi = calculatePsi(volatility);
  
  // Detect fractals (local peaks and troughs)
  for (let i = 2; i < prices.length - 2; i++) {
    const isFractalUp = 
      prices[i] > prices[i - 1] && 
      prices[i] > prices[i - 2] && 
      prices[i] > prices[i + 1] && 
      prices[i] > prices[i + 2];
      
    const isFractalDown = 
      prices[i] < prices[i - 1] && 
      prices[i] < prices[i - 2] && 
      prices[i] < prices[i + 1] && 
      prices[i] < prices[i + 2];
    
    if (isFractalUp || isFractalDown) {
      patterns.push({
        type: 'fractal',
        confidence: 0.7 * psi / PSI_BASE,
        priceLevel: prices[i],
        startIndex: i - 2,
        endIndex: i + 2,
        metadata: {
          direction: isFractalUp ? 'up' : 'down',
          timestamp: priceHistory[i].time
        }
      });
    }
  }
  
  // Detect support and resistance levels
  const window = Math.min(20, Math.floor(prices.length / 2));
  const supportResistanceLevels = new Map<number, number>(); // price -> count
  
  for (let i = 0; i < prices.length; i++) {
    const price = Math.round(prices[i] * 100) / 100; // Round to 2 decimals
    supportResistanceLevels.set(price, (supportResistanceLevels.get(price) || 0) + 1);
  }
  
  // Find significant levels (touched multiple times)
  for (const [priceLevel, count] of supportResistanceLevels.entries()) {
    if (count >= 3) {
      const currentPrice = prices[prices.length - 1];
      const isSupport = priceLevel < currentPrice;
      
      patterns.push({
        type: isSupport ? 'support' : 'resistance',
        confidence: Math.min(count / 5 * psi / PSI_BASE, 1),
        priceLevel,
        startIndex: 0,
        endIndex: prices.length - 1,
        metadata: {
          touches: count,
          distance: Math.abs(currentPrice - priceLevel) / currentPrice
        }
      });
    }
  }
  
  // Detect trend channels (using multi-layer Ψ recursion)
  if (prices.length >= 20) {
    const layers = [5, 10, 20]; // Different timeframe windows
    
    for (const layer of layers) {
      if (layer > prices.length) continue;
      
      const recentPrices = prices.slice(-layer);
      const trend = calculateTrend(recentPrices);
      const layerPsi = Math.pow(psi, 1 / layers.length); // Recursive Psi application
      
      if (Math.abs(trend) > 0.5) {
        const highs = recentPrices.map((_, i) => 
          Math.max(...recentPrices.slice(Math.max(0, i - 2), i + 3))
        );
        const lows = recentPrices.map((_, i) => 
          Math.min(...recentPrices.slice(Math.max(0, i - 2), i + 3))
        );
        
        const channelWidth = calculateVolatility(highs.concat(lows));
        
        patterns.push({
          type: 'channel',
          confidence: Math.abs(trend) * layerPsi,
          startIndex: prices.length - layer,
          endIndex: prices.length - 1,
          metadata: {
            direction: trend > 0 ? 'up' : 'down',
            width: channelWidth,
            timeframe: layer
          }
        });
      }
    }
  }
  
  // Detect triangle patterns (converging highs and lows)
  if (prices.length >= 30) {
    const recentPrices = prices.slice(-30);
    const highs: number[] = [];
    const lows: number[] = [];
    
    for (let i = 2; i < recentPrices.length - 2; i++) {
      if (recentPrices[i] > recentPrices[i-1] && recentPrices[i] > recentPrices[i+1]) {
        highs.push(recentPrices[i]);
      }
      if (recentPrices[i] < recentPrices[i-1] && recentPrices[i] < recentPrices[i+1]) {
        lows.push(recentPrices[i]);
      }
    }
    
    if (highs.length >= 2 && lows.length >= 2) {
      const highTrend = calculateTrend(highs);
      const lowTrend = calculateTrend(lows);
      
      // Converging if highs declining and lows rising, or vice versa
      if ((highTrend < -0.2 && lowTrend > 0.2) || (highTrend > 0.2 && lowTrend < -0.2)) {
        patterns.push({
          type: 'triangle',
          confidence: 0.6 * psi / PSI_BASE,
          startIndex: prices.length - 30,
          endIndex: prices.length - 1,
          metadata: {
            convergence: Math.abs(highTrend - lowTrend),
            type: highTrend < 0 ? 'descending' : 'ascending'
          }
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Calculate real-time risk score for a position
 * 
 * Uses Λ to balance position risk and considers leverage, liquidation price,
 * and market volatility.
 * 
 * @param position - Current position details
 * @param marketConditions - Current market conditions
 * @returns Risk assessment with score, level, and recommendations
 */
export function calculateRiskScore(
  position: Position,
  marketConditions: MarketConditions
): RiskAssessment {
  const { entryPrice, currentPrice, size, leverage } = position;
  const { volatility, liquidity, trend } = marketConditions;
  
  const recommendations: string[] = [];
  let riskScore = 0;
  
  // 1. Unrealized P&L risk
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const leveragedPnl = pnlPercent * leverage;
  
  if (leveragedPnl < -10) {
    riskScore += 30;
    recommendations.push('Position is down more than 10% (leveraged) - consider reducing exposure');
  } else if (leveragedPnl < -5) {
    riskScore += 15;
    recommendations.push('Position is showing significant loss');
  }
  
  // 2. Liquidation risk
  const liquidationDistance = leverage > 1 ? (100 / leverage) * 0.8 : 100; // 80% of theoretical liquidation
  const currentDrawdown = Math.abs(Math.min(pnlPercent, 0));
  const liquidationRisk = (currentDrawdown / liquidationDistance) * 100;
  
  if (liquidationRisk > 70) {
    riskScore += 40;
    recommendations.push('CRITICAL: Position near liquidation - reduce leverage or close position');
  } else if (liquidationRisk > 50) {
    riskScore += 25;
    recommendations.push('HIGH: Position approaching liquidation threshold');
  } else if (liquidationRisk > 30) {
    riskScore += 10;
    recommendations.push('Moderate liquidation risk - monitor closely');
  }
  
  // 3. Leverage risk (using Lambda for balance)
  const lambda = leverage > 5 ? LAMBDA_AGGRESSIVE : 
                 leverage > 2 ? LAMBDA_MODERATE : 
                 LAMBDA_CONSERVATIVE;
  
  const leverageRisk = (leverage / 10) * 20 * (lambda / LAMBDA_MODERATE);
  riskScore += leverageRisk;
  
  if (leverage > 5) {
    recommendations.push('High leverage detected - consider reducing to minimize risk');
  }
  
  // 4. Volatility risk
  if (volatility > 0.03) {
    riskScore += 20;
    recommendations.push('High market volatility increases position risk');
  } else if (volatility > 0.02) {
    riskScore += 10;
  }
  
  // 5. Liquidity risk
  if (liquidity < 0.3) {
    riskScore += 15;
    recommendations.push('Low market liquidity - may be difficult to exit position');
  } else if (liquidity < 0.5) {
    riskScore += 5;
  }
  
  // 6. Trend alignment risk
  const isLong = currentPrice >= entryPrice;
  const trendAligned = (isLong && trend > 0) || (!isLong && trend < 0);
  
  if (!trendAligned) {
    riskScore += 15;
    recommendations.push('Position against current market trend');
  }
  
  // 7. Position size risk (apply Lambda balance)
  const positionRisk = (size / 1000000) * 10 * (lambda / LAMBDA_MODERATE); // Assuming $1M as large position
  riskScore += positionRisk;
  
  if (size > 500000) {
    recommendations.push('Large position size - consider scaling out');
  }
  
  // Cap risk score at 100
  riskScore = Math.min(riskScore, 100);
  
  // Determine risk level
  let level: RiskLevel;
  if (riskScore >= 70) {
    level = 'critical';
    recommendations.push('IMMEDIATE ACTION REQUIRED');
  } else if (riskScore >= 50) {
    level = 'high';
    recommendations.push('Reduce position size or tighten stop loss');
  } else if (riskScore >= 30) {
    level = 'medium';
    recommendations.push('Monitor position closely');
  } else {
    level = 'low';
    if (recommendations.length === 0) {
      recommendations.push('Position risk is within acceptable parameters');
    }
  }
  
  return {
    riskScore,
    level,
    recommendations
  };
}