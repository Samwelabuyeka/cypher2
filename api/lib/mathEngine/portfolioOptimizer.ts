/**
 * Portfolio Optimization Module
 * 
 * Implements advanced portfolio optimization using mathematical framework:
 * - Λ (Lambda): Entropy-based diversification measure
 * - Φ (Phi): Growth potential indicator
 * - Ψ (Psi): Cost minimization function
 * - Ωₜ (Omega_t): Time-dependent risk measure
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Position in a portfolio
 */
export interface Position {
  symbol: string;
  quantity: number;
  value: number;
  allocation: number;
}

/**
 * Portfolio optimization parameters
 */
export interface OptimizePortfolioParams {
  positions: Position[];
  correlationMatrix?: number[][];
  expectedReturns: Record<string, number>;
  riskTolerance: number; // 0-1 scale
}

/**
 * Portfolio optimization result
 */
export interface OptimizationResult {
  allocations: Record<string, number>;
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
}

/**
 * Rebalancing constraints
 */
export interface RebalanceConstraints {
  maxTrades: number;
  minTradeSize: number;
  slippageFactor: number;
}

/**
 * Trade action for rebalancing
 */
export interface TradeAction {
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  priority: number;
}

/**
 * Multi-layer risk analysis input
 */
export interface PortfolioRiskInput {
  positions: any[];
  marketData: any[];
  timeHorizons: string[];
}

/**
 * Risk analysis result
 */
export interface RiskAnalysisResult {
  overall: number;
  daily: number;
  weekly: number;
  monthly: number;
  breakdown: {
    volatility: number;
    correlation: number;
    entropy: number;
    tailRisk: number;
  };
}

/**
 * Market data for opportunity detection
 */
export interface MarketDataPoint {
  symbol: string;
  prices: number[];
  volumes: number[];
  indicators: Record<string, number>;
}

/**
 * Detected opportunity
 */
export interface Opportunity {
  symbol: string;
  opportunity: string;
  confidence: number;
  expectedReturn: number;
  risk: number;
}

// ============================================================================
// Mathematical Helper Functions
// ============================================================================

/**
 * Calculate Lambda (Λ) - Entropy-based diversification measure
 * Higher values indicate better diversification
 */
function calculateLambda(allocations: number[]): number {
  const n = allocations.length;
  if (n === 0) return 0;
  
  // Normalize allocations
  const sum = allocations.reduce((a, b) => a + b, 0);
  const normalized = allocations.map(a => a / sum);
  
  // Shannon entropy calculation
  let entropy = 0;
  for (const p of normalized) {
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }
  
  // Normalize by maximum possible entropy (log(n))
  const maxEntropy = Math.log(n);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Calculate Phi (Φ) - Growth potential indicator
 * Uses momentum and trend strength
 */
function calculatePhi(prices: number[], volumes?: number[]): number {
  if (prices.length < 2) return 0;
  
  // Calculate momentum (rate of change)
  const momentum = (prices[prices.length - 1] - prices[0]) / prices[0];
  
  // Calculate trend strength (R-squared of linear regression)
  const n = prices.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = prices.reduce((a, b) => a + b, 0) / n;
  
  let ssxx = 0;
  let ssyy = 0;
  let ssxy = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = prices[i] - meanY;
    ssxx += dx * dx;
    ssyy += dy * dy;
    ssxy += dx * dy;
  }
  
  const rSquared = ssxx > 0 && ssyy > 0 ? (ssxy * ssxy) / (ssxx * ssyy) : 0;
  
  // Volume confirmation if available
  let volumeConfirmation = 1;
  if (volumes && volumes.length === prices.length) {
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const historicalVolume = volumes.slice(0, -5).reduce((a, b) => a + b, 0) / (volumes.length - 5);
    volumeConfirmation = historicalVolume > 0 ? Math.min(2, recentVolume / historicalVolume) : 1;
  }
  
  // Combine momentum, trend strength, and volume
  return momentum * rSquared * volumeConfirmation;
}

/**
 * Calculate Psi (Ψ) - Cost minimization function
 * Considers transaction costs and market impact
 */
function calculatePsi(tradeSize: number, totalValue: number, slippageFactor: number): number {
  const relativeSize = tradeSize / totalValue;
  
  // Base transaction cost (fixed + variable)
  const fixedCost = 0.001; // 0.1%
  const variableCost = 0.0005 * relativeSize; // Scales with trade size
  
  // Market impact (quadratic in relative size)
  const marketImpact = slippageFactor * relativeSize * relativeSize;
  
  return fixedCost + variableCost + marketImpact;
}

/**
 * Calculate Omega_t (Ωₜ) - Time-dependent risk measure
 * Incorporates volatility decay and autocorrelation
 */
function calculateOmega(returns: number[], timeHorizon: number): number {
  if (returns.length === 0) return 0;
  
  // Calculate volatility
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);
  
  // Calculate autocorrelation at lag 1
  let autocorr = 0;
  if (returns.length > 1) {
    const n = returns.length - 1;
    for (let i = 0; i < n; i++) {
      autocorr += (returns[i] - mean) * (returns[i + 1] - mean);
    }
    autocorr = autocorr / (n * variance);
  }
  
  // Time scaling factor (volatility scales with sqrt(time) in random walk)
  const timeScale = Math.sqrt(timeHorizon);
  
  // Adjust for autocorrelation (mean reversion reduces long-term risk)
  const autocorrAdjustment = 1 - Math.abs(autocorr) * 0.5;
  
  return volatility * timeScale * autocorrAdjustment;
}

/**
 * Calculate correlation matrix from returns
 */
function calculateCorrelationMatrix(returnsData: Record<string, number[]>): number[][] {
  const symbols = Object.keys(returnsData);
  const n = symbols.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        const returns1 = returnsData[symbols[i]];
        const returns2 = returnsData[symbols[j]];
        matrix[i][j] = calculateCorrelation(returns1, returns2);
      }
    }
  }
  
  return matrix;
}

/**
 * Calculate correlation between two return series
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  
  let covXY = 0;
  let varX = 0;
  let varY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  
  const denominator = Math.sqrt(varX * varY);
  return denominator > 0 ? covXY / denominator : 0;
}

// ============================================================================
// Main Exported Functions
// ============================================================================

/**
 * Optimize portfolio allocation using Modern Portfolio Theory enhanced with
 * mathematical framework (Λ, Φ)
 * 
 * @param params - Portfolio optimization parameters
 * @returns Optimized allocations and performance metrics
 */
export function optimizePortfolio(params: OptimizePortfolioParams): OptimizationResult {
  const { positions, correlationMatrix, expectedReturns, riskTolerance } = params;
  
  if (positions.length === 0) {
    return {
      allocations: {},
      expectedReturn: 0,
      expectedRisk: 0,
      sharpeRatio: 0,
    };
  }
  
  const symbols = positions.map(p => p.symbol);
  const n = symbols.length;
  
  // Initialize with equal weights
  let weights = Array(n).fill(1 / n);
  
  // Calculate Lambda (diversification) for current allocation
  const currentLambda = calculateLambda(weights);
  
  // Calculate Phi (growth potential) for each asset
  const phiScores = symbols.map(symbol => {
    const expectedReturn = expectedReturns[symbol] || 0;
    return Math.max(0, expectedReturn); // Use expected return as proxy for Phi
  });
  
  // Optimization iterations using gradient descent
  const learningRate = 0.01;
  const iterations = 100;
  
  for (let iter = 0; iter < iterations; iter++) {
    // Calculate expected portfolio return
    const portfolioReturn = weights.reduce((sum, w, i) => sum + w * (expectedReturns[symbols[i]] || 0), 0);
    
    // Calculate portfolio variance
    let portfolioVariance = 0;
    if (correlationMatrix && correlationMatrix.length === n) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const vol_i = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2; // Assume 20% vol relative to return
          const vol_j = Math.abs(expectedReturns[symbols[j]] || 0) * 0.2;
          portfolioVariance += weights[i] * weights[j] * correlationMatrix[i][j] * vol_i * vol_j;
        }
      }
    } else {
      // Simple variance without correlation
      portfolioVariance = weights.reduce((sum, w, i) => {
        const vol = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2;
        return sum + w * w * vol * vol;
      }, 0);
    }
    
    const portfolioRisk = Math.sqrt(portfolioVariance);
    
    // Gradient calculation
    const gradient = weights.map((w, i) => {
      // Return component (maximize)
      const returnGrad = expectedReturns[symbols[i]] || 0;
      
      // Risk component (minimize, scaled by risk tolerance)
      let riskGrad = 0;
      if (correlationMatrix && correlationMatrix.length === n) {
        for (let j = 0; j < n; j++) {
          const vol_i = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2;
          const vol_j = Math.abs(expectedReturns[symbols[j]] || 0) * 0.2;
          riskGrad += weights[j] * correlationMatrix[i][j] * vol_i * vol_j;
        }
      } else {
        const vol = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2;
        riskGrad = w * vol * vol;
      }
      riskGrad = riskGrad / (portfolioRisk + 1e-10);
      
      // Diversification component (Lambda-based)
      const diversificationGrad = -Math.log(w + 1e-10) / n; // Encourages equal weights
      
      // Growth potential component (Phi-based)
      const phiGrad = phiScores[i];
      
      // Combine gradients
      return returnGrad + phiGrad * 0.5 - riskGrad * (1 - riskTolerance) + diversificationGrad * currentLambda;
    });
    
    // Update weights
    weights = weights.map((w, i) => Math.max(0, w + learningRate * gradient[i]));
    
    // Normalize to sum to 1
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / sum);
  }
  
  // Calculate final metrics
  const allocations: Record<string, number> = {};
  symbols.forEach((symbol, i) => {
    allocations[symbol] = weights[i];
  });
  
  const expectedReturn = weights.reduce((sum, w, i) => sum + w * (expectedReturns[symbols[i]] || 0), 0);
  
  let expectedVariance = 0;
  if (correlationMatrix && correlationMatrix.length === n) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const vol_i = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2;
        const vol_j = Math.abs(expectedReturns[symbols[j]] || 0) * 0.2;
        expectedVariance += weights[i] * weights[j] * correlationMatrix[i][j] * vol_i * vol_j;
      }
    }
  } else {
    expectedVariance = weights.reduce((sum, w, i) => {
      const vol = Math.abs(expectedReturns[symbols[i]] || 0) * 0.2;
      return sum + w * w * vol * vol;
    }, 0);
  }
  
  const expectedRisk = Math.sqrt(expectedVariance);
  const sharpeRatio = expectedRisk > 0 ? expectedReturn / expectedRisk : 0;
  
  return {
    allocations,
    expectedReturn,
    expectedRisk,
    sharpeRatio,
  };
}

/**
 * Calculate optimal rebalancing strategy to minimize transaction costs
 * using Psi (Ψ) cost function
 * 
 * @param current - Current portfolio allocations (as percentages)
 * @param target - Target portfolio allocations (as percentages)
 * @param constraints - Rebalancing constraints
 * @returns Array of trade actions with priorities
 */
export function rebalanceStrategy(
  current: Record<string, number>,
  target: Record<string, number>,
  constraints: RebalanceConstraints
): TradeAction[] {
  const { maxTrades, minTradeSize, slippageFactor } = constraints;
  
  // Calculate total portfolio value (normalized to 1)
  const totalValue = 1;
  
  // Calculate differences
  const allSymbols = new Set([...Object.keys(current), ...Object.keys(target)]);
  const differences: Array<{ symbol: string; diff: number; cost: number }> = [];
  
  for (const symbol of allSymbols) {
    const currentAlloc = current[symbol] || 0;
    const targetAlloc = target[symbol] || 0;
    const diff = targetAlloc - currentAlloc;
    
    if (Math.abs(diff) >= minTradeSize) {
      const tradeSize = Math.abs(diff) * totalValue;
      const cost = calculatePsi(tradeSize, totalValue, slippageFactor);
      differences.push({ symbol, diff, cost });
    }
  }
  
  // Sort by cost-benefit ratio (absolute difference / cost)
  differences.sort((a, b) => {
    const ratioA = Math.abs(a.diff) / a.cost;
    const ratioB = Math.abs(b.diff) / b.cost;
    return ratioB - ratioA; // Higher ratio = higher priority
  });
  
  // Select top trades up to maxTrades
  const selectedTrades = differences.slice(0, maxTrades);
  
  // Create trade actions with priorities
  const actions: TradeAction[] = selectedTrades.map((trade, index) => ({
    symbol: trade.symbol,
    action: trade.diff > 0 ? 'buy' : 'sell',
    amount: Math.abs(trade.diff),
    priority: selectedTrades.length - index, // Higher number = higher priority
  }));
  
  return actions;
}

/**
 * Calculate enhanced Sharpe ratio with Lambda (Λ) entropy adjustment
 * 
 * @param returns - Array of returns
 * @param riskFreeRate - Risk-free rate for Sharpe calculation
 * @param lambda - Lambda (diversification/entropy) parameter
 * @returns Enhanced Sharpe ratio
 */
export function calculateEnhancedSharpe(
  returns: number[],
  riskFreeRate: number,
  lambda: number
): number {
  if (returns.length === 0) return 0;
  
  // Calculate mean excess return
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = meanReturn - riskFreeRate;
  
  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Standard Sharpe ratio
  const standardSharpe = stdDev > 0 ? excessReturn / stdDev : 0;
  
  // Lambda adjustment (higher entropy/diversification improves Sharpe)
  // Lambda ranges from 0 to 1, where 1 is perfectly diversified
  const lambdaAdjustment = 1 + lambda * 0.5; // Up to 50% bonus for perfect diversification
  
  return standardSharpe * lambdaAdjustment;
}

/**
 * Multi-layer hierarchical risk analysis using recursive Psi (Ψ), Omega (Ωₜ), and Lambda (Λ)
 * across multiple time horizons
 * 
 * @param portfolio - Portfolio data with positions, market data, and time horizons
 * @returns Comprehensive risk analysis across time scales
 */
export function multiLayerRiskAnalysis(portfolio: PortfolioRiskInput): RiskAnalysisResult {
  const { positions, marketData, timeHorizons } = portfolio;
  
  if (positions.length === 0) {
    return {
      overall: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      breakdown: {
        volatility: 0,
        correlation: 0,
        entropy: 0,
        tailRisk: 0,
      },
    };
  }
  
  // Time horizon mappings
  const horizonDays: Record<string, number> = {
    'daily': 1,
    'weekly': 5,
    'monthly': 21,
  };
  
  // Extract returns from market data (simplified - assuming marketData has returns)
  const returnsData: Record<string, number[]> = {};
  for (const data of marketData) {
    if (data.symbol && data.prices && data.prices.length > 1) {
      const returns = [];
      for (let i = 1; i < data.prices.length; i++) {
        returns.push((data.prices[i] - data.prices[i - 1]) / data.prices[i - 1]);
      }
      returnsData[data.symbol] = returns;
    }
  }
  
  // Calculate risk for each time horizon using Omega
  const riskByHorizon: Record<string, number> = {};
  
  for (const horizon of timeHorizons) {
    const days = horizonDays[horizon] || 1;
    let totalRisk = 0;
    let count = 0;
    
    for (const symbol in returnsData) {
      const returns = returnsData[symbol];
      const omega = calculateOmega(returns, days);
      totalRisk += omega;
      count++;
    }
    
    riskByHorizon[horizon] = count > 0 ? totalRisk / count : 0;
  }
  
  // Calculate portfolio-level metrics
  const allocations = positions.map(p => p.allocation || p.value);
  const lambda = calculateLambda(allocations);
  
  // Calculate correlation risk
  const symbols = Object.keys(returnsData);
  let avgCorrelation = 0;
  let correlationCount = 0;
  
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const corr = calculateCorrelation(returnsData[symbols[i]], returnsData[symbols[j]]);
      avgCorrelation += Math.abs(corr);
      correlationCount++;
    }
  }
  avgCorrelation = correlationCount > 0 ? avgCorrelation / correlationCount : 0;
  
  // Calculate tail risk (using 95th percentile of losses)
  const allReturns: number[] = [];
  for (const symbol in returnsData) {
    allReturns.push(...returnsData[symbol]);
  }
  allReturns.sort((a, b) => a - b);
  const tailIndex = Math.floor(allReturns.length * 0.05);
  const tailRisk = tailIndex >= 0 ? Math.abs(allReturns[tailIndex]) : 0;
  
  // Overall risk combines all horizons with weights
  const overall = (
    (riskByHorizon['daily'] || 0) * 0.5 +
    (riskByHorizon['weekly'] || 0) * 0.3 +
    (riskByHorizon['monthly'] || 0) * 0.2
  ) * (1 - lambda * 0.3); // Lambda reduces overall risk through diversification
  
  return {
    overall,
    daily: riskByHorizon['daily'] || 0,
    weekly: riskByHorizon['weekly'] || 0,
    monthly: riskByHorizon['monthly'] || 0,
    breakdown: {
      volatility: (riskByHorizon['daily'] || 0),
      correlation: avgCorrelation,
      entropy: lambda,
      tailRisk,
    },
  };
}

/**
 * Detect emergent opportunities using stochastic Phi (Φₙ) to identify
 * hidden patterns across multiple timeframes and indicators
 * 
 * @param marketData - Array of market data with prices, volumes, and indicators
 * @returns Array of detected opportunities with confidence scores
 */
export function emergentOpportunityDetector(marketData: MarketDataPoint[]): Opportunity[] {
  const opportunities: Opportunity[] = [];
  
  for (const data of marketData) {
    const { symbol, prices, volumes, indicators } = data;
    
    if (prices.length < 10) continue; // Need sufficient data
    
    // Calculate Phi for different timeframes
    const shortTermPhi = calculatePhi(prices.slice(-10), volumes?.slice(-10));
    const mediumTermPhi = calculatePhi(prices.slice(-30), volumes?.slice(-30));
    const longTermPhi = calculatePhi(prices, volumes);
    
    // Stochastic component: check for regime changes
    const recentVolatility = calculateOmega(
      prices.slice(-20).map((p, i) => i > 0 ? (p - prices.slice(-20)[i - 1]) / prices.slice(-20)[i - 1] : 0),
      1
    );
    
    const historicalVolatility = calculateOmega(
      prices.slice(0, -20).map((p, i) => i > 0 ? (p - prices.slice(0, -20)[i - 1]) / prices.slice(0, -20)[i - 1] : 0),
      1
    );
    
    const volatilityRatio = historicalVolatility > 0 ? recentVolatility / historicalVolatility : 1;
    
    // Combine indicators
    const indicatorScore = Object.values(indicators).reduce((sum, val) => sum + (val || 0), 0) / Math.max(1, Object.keys(indicators).length);
    
    // Detect patterns
    const patterns: Array<{ type: string; confidence: number; expectedReturn: number; risk: number }> = [];
    
    // Pattern 1: Strong uptrend with increasing Phi
    if (shortTermPhi > 0.1 && mediumTermPhi > 0.05 && shortTermPhi > mediumTermPhi * 1.2) {
      patterns.push({
        type: 'Accelerating Uptrend',
        confidence: Math.min(0.95, shortTermPhi * 5),
        expectedReturn: shortTermPhi * 10,
        risk: recentVolatility * 2,
      });
    }
    
    // Pattern 2: Mean reversion opportunity (high volatility with negative Phi)
    if (shortTermPhi < -0.05 && volatilityRatio > 1.5 && longTermPhi > 0) {
      patterns.push({
        type: 'Mean Reversion',
        confidence: Math.min(0.85, volatilityRatio * 0.4),
        expectedReturn: Math.abs(shortTermPhi) * 5,
        risk: recentVolatility * 1.5,
      });
    }
    
    // Pattern 3: Breakout pattern (low volatility followed by Phi increase)
    if (volatilityRatio < 0.7 && shortTermPhi > 0.05 && indicatorScore > 0.5) {
      patterns.push({
        type: 'Breakout',
        confidence: Math.min(0.90, (1 - volatilityRatio) * indicatorScore),
        expectedReturn: shortTermPhi * 8,
        risk: recentVolatility * 2.5,
      });
    }
    
    // Pattern 4: Divergence opportunity (indicators disagree with price)
    if (Math.abs(indicatorScore - shortTermPhi) > 0.3 && mediumTermPhi > 0) {
      patterns.push({
        type: 'Indicator Divergence',
        confidence: Math.min(0.75, Math.abs(indicatorScore - shortTermPhi) * 2),
        expectedReturn: indicatorScore * 6,
        risk: recentVolatility * 1.8,
      });
    }
    
    // Add best pattern for this symbol to opportunities
    if (patterns.length > 0) {
      patterns.sort((a, b) => b.confidence - a.confidence);
      const best = patterns[0];
      
      opportunities.push({
        symbol,
        opportunity: best.type,
        confidence: best.confidence,
        expectedReturn: best.expectedReturn,
        risk: best.risk,
      });
    }
  }
  
  // Sort by confidence * expected return / risk (risk-adjusted opportunity score)
  opportunities.sort((a, b) => {
    const scoreA = (a.confidence * a.expectedReturn) / (a.risk + 0.01);
    const scoreB = (b.confidence * b.expectedReturn) / (b.risk + 0.01);
    return scoreB - scoreA;
  });
  
  return opportunities;
}