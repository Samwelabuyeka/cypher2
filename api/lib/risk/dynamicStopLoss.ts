/**
 * Dynamic stop-loss and risk management system with Ψ-based trailing stops
 * 
 * This module provides advanced risk management functions including:
 * - Dynamic trailing stop-loss adjusted by market volatility
 * - Graduated position exit strategies
 * - Portfolio hedging calculations
 * - Options-based portfolio insurance
 * - Real-time risk limit enforcement
 * - Value at Risk (VaR) calculations
 */

import { GOLDEN_RATIO, PHI } from "../mathEngine/constants";

/**
 * Side of a trading position
 */
export type PositionSide = 'long' | 'short';

/**
 * Risk level for trading strategies
 */
export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

/**
 * Risk action to take
 */
export type RiskAction = 'allow' | 'warn' | 'block' | 'reduce';

/**
 * Parameters for calculating trailing stop-loss
 */
export interface TrailingStopLossParams {
  entryPrice: number;
  currentPrice: number;
  side: PositionSide;
  volatility: number;
  psi: number;
  atr: number;
}

/**
 * Result of trailing stop-loss calculation
 */
export interface TrailingStopLossResult {
  stopPrice: number;
  distance: number;
  distancePercent: number;
}

/**
 * Parameters for calculating partial exit levels
 */
export interface PartialExitParams {
  entryPrice: number;
  targetProfit: number;
  riskLevel: RiskLevel;
}

/**
 * A single exit level in a graduated exit strategy
 */
export interface ExitLevel {
  percent: number;
  priceLevel: number;
  reason: string;
}

/**
 * Trading position information
 */
export interface Position {
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
}

/**
 * Parameters for hedging a position
 */
export interface HedgePositionParams {
  position: Position;
  hedgeRatio: number;
  correlatedAssets: string[];
}

/**
 * Result of hedge position calculation
 */
export interface HedgeResult {
  hedgeSymbol: string;
  hedgeSide: PositionSide;
  hedgeSize: number;
  correlation: number;
}

/**
 * Parameters for portfolio insurance calculation
 */
export interface PortfolioInsuranceParams {
  portfolioValue: number;
  maxDrawdown: number;
  insuranceDuration: number;
}

/**
 * Result of portfolio insurance calculation
 */
export interface PortfolioInsuranceResult {
  premium: number;
  strikePrice: number;
  protectionLevel: number;
}

/**
 * Parameters for risk limit enforcement
 */
export interface RiskLimitsParams {
  dailyPnL: number;
  maxDailyLoss: number;
  openPositions: number;
  maxPositions: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

/**
 * Result of risk limits check
 */
export interface RiskLimitsResult {
  allowed: boolean;
  reason?: string;
  action: RiskAction;
}

/**
 * Position information for VaR calculation
 */
export interface VarPosition {
  value: number;
  volatility: number;
}

/**
 * Parameters for Value at Risk calculation
 */
export interface ValueAtRiskParams {
  positions: VarPosition[];
  confidence: number;
  timeHorizon: number;
}

/**
 * Result of VaR calculation
 */
export interface ValueAtRiskResult {
  var: number;
  cvar: number;
}

/**
 * Calculate dynamic trailing stop-loss using Ψ-based adjustments
 * 
 * This function adjusts stop-loss distance based on market volatility and the Ψ constant.
 * - In calm markets (low Ψ), stops are tighter to lock in profits
 * - In volatile markets (high Ψ), stops are wider to avoid premature exits
 * 
 * @param params - Parameters for trailing stop calculation
 * @returns Stop price, distance, and distance percentage
 * 
 * @example
 * ```typescript
 * const result = calculateTrailingStopLoss({
 *   entryPrice: 50000,
 *   currentPrice: 52000,
 *   side: 'long',
 *   volatility: 0.03,
 *   psi: 1.618,
 *   atr: 500
 * });
 * console.log(result.stopPrice); // e.g., 51200
 * ```
 */
export function calculateTrailingStopLoss(params: TrailingStopLossParams): TrailingStopLossResult {
  const { entryPrice, currentPrice, side, volatility, psi, atr } = params;
  
  // Normalize Ψ to a 0-1 range for easier calculations
  // Ψ typically ranges from 1 to 2, so we normalize it
  const normalizedPsi = (psi - 1) / 1; // 0 to 1 range
  
  // Base stop distance is ATR scaled by volatility
  const baseDistance = atr * (1 + volatility);
  
  // Apply Ψ-based adjustment
  // Lower Ψ = tighter stops (multiply by smaller factor)
  // Higher Ψ = wider stops (multiply by larger factor)
  const psiAdjustment = 0.5 + (normalizedPsi * 0.5); // 0.5 to 1.0 range
  const adjustedDistance = baseDistance * psiAdjustment;
  
  // Calculate stop price based on position side
  let stopPrice: number;
  if (side === 'long') {
    // For long positions, stop is below current price
    stopPrice = currentPrice - adjustedDistance;
    // Ensure stop doesn't go below entry for breakeven protection
    stopPrice = Math.max(stopPrice, entryPrice);
  } else {
    // For short positions, stop is above current price
    stopPrice = currentPrice + adjustedDistance;
    // Ensure stop doesn't go above entry for breakeven protection
    stopPrice = Math.min(stopPrice, entryPrice);
  }
  
  const distance = Math.abs(currentPrice - stopPrice);
  const distancePercent = (distance / currentPrice) * 100;
  
  return {
    stopPrice: parseFloat(stopPrice.toFixed(8)),
    distance: parseFloat(distance.toFixed(8)),
    distancePercent: parseFloat(distancePercent.toFixed(4))
  };
}

/**
 * Calculate graduated position exit levels based on risk profile
 * 
 * This function creates a structured exit strategy with multiple price levels,
 * allowing partial profit-taking while maintaining upside exposure.
 * 
 * @param params - Parameters for partial exit calculation
 * @returns Array of exit levels with percentages and price targets
 * 
 * @example
 * ```typescript
 * const exitLevels = calculatePartialExitLevels({
 *   entryPrice: 50000,
 *   targetProfit: 10,
 *   riskLevel: 'moderate'
 * });
 * // Returns: [
 * //   { percent: 25, priceLevel: 51000, reason: 'Early profit lock' },
 * //   { percent: 25, priceLevel: 52500, reason: 'Mid-range target' },
 * //   { percent: 50, priceLevel: 55000, reason: 'Final target' }
 * // ]
 * ```
 */
export function calculatePartialExitLevels(params: PartialExitParams): ExitLevel[] {
  const { entryPrice, targetProfit, riskLevel } = params;
  
  const exitLevels: ExitLevel[] = [];
  
  // Define exit strategies based on risk level
  switch (riskLevel) {
    case 'conservative':
      // Conservative: Take profits early and incrementally
      exitLevels.push({
        percent: 30,
        priceLevel: entryPrice * (1 + (targetProfit * 0.15) / 100),
        reason: 'Conservative early profit lock'
      });
      exitLevels.push({
        percent: 40,
        priceLevel: entryPrice * (1 + (targetProfit * 0.40) / 100),
        reason: 'Conservative mid-range target'
      });
      exitLevels.push({
        percent: 30,
        priceLevel: entryPrice * (1 + (targetProfit * 0.70) / 100),
        reason: 'Conservative final target'
      });
      break;
      
    case 'moderate':
      // Moderate: Balanced approach using golden ratio
      exitLevels.push({
        percent: 25,
        priceLevel: entryPrice * (1 + (targetProfit * 0.20) / 100),
        reason: 'Early profit lock'
      });
      exitLevels.push({
        percent: 25,
        priceLevel: entryPrice * (1 + (targetProfit * 0.50) / 100),
        reason: 'Mid-range target'
      });
      exitLevels.push({
        percent: 50,
        priceLevel: entryPrice * (1 + targetProfit / 100),
        reason: 'Final target'
      });
      break;
      
    case 'aggressive':
      // Aggressive: Let winners run, use Ψ-based scaling
      exitLevels.push({
        percent: 15,
        priceLevel: entryPrice * (1 + (targetProfit * 0.30) / 100),
        reason: 'Minimal early exit'
      });
      exitLevels.push({
        percent: 20,
        priceLevel: entryPrice * (1 + (targetProfit * 0.62) / 100),
        reason: 'Ψ-scaled mid target'
      });
      exitLevels.push({
        percent: 65,
        priceLevel: entryPrice * (1 + (targetProfit * 1.2) / 100),
        reason: 'Extended final target'
      });
      break;
  }
  
  // Round price levels to 8 decimal places
  return exitLevels.map(level => ({
    ...level,
    priceLevel: parseFloat(level.priceLevel.toFixed(8))
  }));
}

/**
 * Calculate optimal hedge position for risk reduction
 * 
 * Creates a hedging strategy using correlated assets to reduce portfolio risk.
 * The hedge ratio determines what percentage of the position to hedge.
 * 
 * @param params - Position and hedging parameters
 * @returns Hedge position details including symbol, side, and size
 * 
 * @example
 * ```typescript
 * const hedge = hedgePosition({
 *   position: {
 *     symbol: 'BTC',
 *     side: 'long',
 *     size: 1.0,
 *     entryPrice: 50000
 *   },
 *   hedgeRatio: 0.5,
 *   correlatedAssets: ['ETH', 'BNB']
 * });
 * ```
 */
export function hedgePosition(params: HedgePositionParams): HedgeResult {
  const { position, hedgeRatio, correlatedAssets } = params;
  
  // Ensure hedge ratio is within valid range
  const validHedgeRatio = Math.max(0, Math.min(1, hedgeRatio));
  
  // Select best correlated asset (in real implementation, would use historical correlation)
  // For now, use first available asset
  const hedgeSymbol = correlatedAssets.length > 0 ? correlatedAssets[0] : position.symbol;
  
  // Assumed correlation coefficient (in production, calculate from historical data)
  // Using golden ratio as a sophisticated correlation estimate
  const correlation = 1 / GOLDEN_RATIO; // ~0.618
  
  // Calculate hedge size
  // Hedge size = position size * hedge ratio * correlation
  const hedgeSize = position.size * validHedgeRatio * correlation;
  
  // Hedge side is opposite to the position side
  const hedgeSide: PositionSide = position.side === 'long' ? 'short' : 'long';
  
  return {
    hedgeSymbol,
    hedgeSide,
    hedgeSize: parseFloat(hedgeSize.toFixed(8)),
    correlation: parseFloat(correlation.toFixed(4))
  };
}

/**
 * Calculate portfolio insurance using options-like protection
 * 
 * Simulates a put options strategy to protect portfolio value from drawdowns.
 * The premium represents the cost of insurance.
 * 
 * @param params - Portfolio value and protection parameters
 * @returns Insurance premium, strike price, and protection level
 * 
 * @example
 * ```typescript
 * const insurance = calculatePortfolioInsurance({
 *   portfolioValue: 100000,
 *   maxDrawdown: 10,
 *   insuranceDuration: 30
 * });
 * console.log(insurance.premium); // Cost of protection
 * ```
 */
export function calculatePortfolioInsurance(params: PortfolioInsuranceParams): PortfolioInsuranceResult {
  const { portfolioValue, maxDrawdown, insuranceDuration } = params;
  
  // Calculate strike price (protection level)
  const protectionLevel = portfolioValue * (1 - maxDrawdown / 100);
  const strikePrice = protectionLevel;
  
  // Calculate implied premium using simplified Black-Scholes approximation
  // Premium is based on:
  // 1. Distance from current price to strike (out-of-the-money amount)
  // 2. Time to expiration
  // 3. Implied volatility
  
  const distanceToStrike = (portfolioValue - strikePrice) / portfolioValue;
  const timeDecay = Math.sqrt(insuranceDuration / 365); // Square root of time
  
  // Base premium as percentage of portfolio
  // Higher drawdown protection = higher premium
  // Longer duration = higher premium
  const basePremiumPercent = maxDrawdown * 0.15 * timeDecay;
  
  // Apply Ψ-based adjustment for more sophisticated pricing
  const psiAdjustment = 1 / GOLDEN_RATIO; // ~0.618
  const adjustedPremiumPercent = basePremiumPercent * psiAdjustment;
  
  const premium = portfolioValue * (adjustedPremiumPercent / 100);
  
  return {
    premium: parseFloat(premium.toFixed(2)),
    strikePrice: parseFloat(strikePrice.toFixed(2)),
    protectionLevel: parseFloat(protectionLevel.toFixed(2))
  };
}

/**
 * Apply real-time risk limits and determine if trading should continue
 * 
 * Enforces multiple risk parameters to prevent excessive losses:
 * - Daily P&L limits
 * - Maximum number of open positions
 * - Portfolio drawdown limits
 * 
 * @param params - Current risk metrics and limits
 * @returns Whether trading is allowed and what action to take
 * 
 * @example
 * ```typescript
 * const riskCheck = applyRiskLimits({
 *   dailyPnL: -5000,
 *   maxDailyLoss: 10000,
 *   openPositions: 8,
 *   maxPositions: 10,
 *   currentDrawdown: 8,
 *   maxDrawdown: 15
 * });
 * if (riskCheck.action === 'block') {
 *   console.log('Stop trading:', riskCheck.reason);
 * }
 * ```
 */
export function applyRiskLimits(params: RiskLimitsParams): RiskLimitsResult {
  const {
    dailyPnL,
    maxDailyLoss,
    openPositions,
    maxPositions,
    currentDrawdown,
    maxDrawdown
  } = params;
  
  // Check daily loss limit
  if (dailyPnL <= -Math.abs(maxDailyLoss)) {
    return {
      allowed: false,
      reason: 'Daily loss limit exceeded',
      action: 'block'
    };
  }
  
  // Check if approaching daily loss limit (80% threshold)
  const lossThreshold = Math.abs(maxDailyLoss) * 0.8;
  if (dailyPnL <= -lossThreshold) {
    return {
      allowed: true,
      reason: 'Approaching daily loss limit (80%)',
      action: 'warn'
    };
  }
  
  // Check maximum positions
  if (openPositions >= maxPositions) {
    return {
      allowed: false,
      reason: 'Maximum number of positions reached',
      action: 'block'
    };
  }
  
  // Check if approaching max positions (90% threshold)
  const positionThreshold = Math.floor(maxPositions * 0.9);
  if (openPositions >= positionThreshold) {
    return {
      allowed: true,
      reason: 'Approaching maximum positions (90%)',
      action: 'warn'
    };
  }
  
  // Check maximum drawdown
  if (currentDrawdown >= maxDrawdown) {
    return {
      allowed: false,
      reason: 'Maximum drawdown exceeded',
      action: 'block'
    };
  }
  
  // Check if approaching max drawdown (75% threshold)
  const drawdownThreshold = maxDrawdown * 0.75;
  if (currentDrawdown >= drawdownThreshold) {
    return {
      allowed: true,
      reason: 'High drawdown - consider reducing positions',
      action: 'reduce'
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    action: 'allow'
  };
}

/**
 * Calculate Value at Risk (VaR) and Conditional VaR for portfolio
 * 
 * VaR represents the maximum expected loss over a time horizon at a given confidence level.
 * CVaR (Expected Shortfall) represents the average loss beyond the VaR threshold.
 * 
 * Uses the variance-covariance method for calculation.
 * 
 * @param params - Portfolio positions and VaR parameters
 * @returns VaR and CVaR values
 * 
 * @example
 * ```typescript
 * const risk = calculateValueAtRisk({
 *   positions: [
 *     { value: 50000, volatility: 0.03 },
 *     { value: 30000, volatility: 0.05 },
 *     { value: 20000, volatility: 0.04 }
 *   ],
 *   confidence: 0.95,
 *   timeHorizon: 1
 * });
 * console.log(`95% VaR: $${risk.var}`);
 * console.log(`Expected loss if VaR is breached: $${risk.cvar}`);
 * ```
 */
export function calculateValueAtRisk(params: ValueAtRiskParams): ValueAtRiskResult {
  const { positions, confidence, timeHorizon } = params;
  
  // Calculate total portfolio value
  const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
  
  // Calculate weighted average volatility
  const weightedVolatility = positions.reduce((sum, pos) => {
    const weight = pos.value / totalValue;
    return sum + (weight * pos.volatility);
  }, 0);
  
  // Calculate portfolio variance (simplified, assuming no correlation)
  const portfolioVariance = positions.reduce((sum, pos) => {
    const weight = pos.value / totalValue;
    return sum + (weight * weight * pos.volatility * pos.volatility);
  }, 0);
  
  const portfolioStdDev = Math.sqrt(portfolioVariance);
  
  // Scale by time horizon (square root of time rule)
  const scaledStdDev = portfolioStdDev * Math.sqrt(timeHorizon);
  
  // Z-score for given confidence level
  // 95% = 1.645, 99% = 2.326
  const zScore = getZScore(confidence);
  
  // Calculate VaR
  const var_ = totalValue * scaledStdDev * zScore;
  
  // Calculate CVaR (Conditional VaR / Expected Shortfall)
  // For normal distribution: CVaR = VaR * phi(z) / (1 - confidence)
  // where phi is the standard normal PDF
  const phi = normalPDF(zScore);
  const cvar = var_ * (phi / (1 - confidence));
  
  return {
    var: parseFloat(var_.toFixed(2)),
    cvar: parseFloat(cvar.toFixed(2))
  };
}

/**
 * Get Z-score for a given confidence level
 * 
 * @param confidence - Confidence level (e.g., 0.95 for 95%)
 * @returns Z-score from standard normal distribution
 */
function getZScore(confidence: number): number {
  // Common confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.282,
    0.95: 1.645,
    0.975: 1.96,
    0.99: 2.326,
    0.995: 2.576,
    0.999: 3.090
  };
  
  // Return exact match or approximate
  if (zScores[confidence]) {
    return zScores[confidence];
  }
  
  // Default to 95% confidence if not found
  return 1.645;
}

/**
 * Standard normal probability density function
 * 
 * @param x - Value to evaluate
 * @returns PDF value at x
 */
function normalPDF(x: number): number {
  const coefficient = 1 / Math.sqrt(2 * Math.PI);
  const exponent = -(x * x) / 2;
  return coefficient * Math.exp(exponent);
}