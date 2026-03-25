/**
 * Risk calculation library for trading and portfolio management
 */

interface Position {
  symbol: string;
  quantity: number;
  value: number;
}

interface PositionRiskResult {
  unrealizedPnL: number;
  percentageChange: number;
  riskAmount: number | null;
  riskRewardRatio: number | null;
}

interface PortfolioRiskResult {
  portfolioStdDev: number;
  valueAtRisk95: number;
  valueAtRisk99: number;
}

interface Trade {
  entryPrice: number;
  exitPrice: number;
  lowestPrice: number;
  highestPrice: number;
  side: 'long' | 'short';
}

interface ExcursionResult {
  averageMAE: number;
  maxMAE: number;
  averageMAEPercent: number;
}

interface MFEResult {
  averageMFE: number;
  maxMFE: number;
  averageMFEPercent: number;
}

/**
 * Calculate portfolio-wide risk metrics
 */
export function calculatePortfolioRisk(
  positions: Position[],
  correlationMatrix?: number[][]
): PortfolioRiskResult {
  if (positions.length === 0) {
    return {
      portfolioStdDev: 0,
      valueAtRisk95: 0,
      valueAtRisk99: 0,
    };
  }

  // Calculate total portfolio value
  const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);

  // Calculate position weights
  const weights = positions.map(pos => pos.value / totalValue);

  // For simplicity, assume individual asset volatilities (would need historical data in practice)
  // Using a placeholder volatility calculation based on position diversity
  let portfolioVariance: number;

  if (correlationMatrix && correlationMatrix.length === positions.length) {
    // Calculate portfolio variance using correlation matrix
    portfolioVariance = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        // Simplified: using weight-based variance estimation
        const correlation = correlationMatrix[i][j];
        portfolioVariance += weights[i] * weights[j] * correlation * 0.02 * 0.02; // 2% assumed individual volatility
      }
    }
  } else {
    // Assume no correlation (conservative estimate)
    portfolioVariance = weights.reduce((sum, weight) => sum + Math.pow(weight * 0.02, 2), 0);
  }

  const portfolioStdDev = Math.sqrt(portfolioVariance);

  // Calculate VaR using normal distribution approximation
  // 95% confidence: 1.645 standard deviations
  // 99% confidence: 2.326 standard deviations
  const valueAtRisk95 = totalValue * portfolioStdDev * 1.645;
  const valueAtRisk99 = totalValue * portfolioStdDev * 2.326;

  return {
    portfolioStdDev,
    valueAtRisk95,
    valueAtRisk99,
  };
}

/**
 * Calculate individual position risk metrics
 */
export function calculatePositionRisk(
  entryPrice: number,
  currentPrice: number,
  quantity: number,
  stopLoss?: number
): PositionRiskResult {
  const unrealizedPnL = (currentPrice - entryPrice) * quantity;
  const percentageChange = ((currentPrice - entryPrice) / entryPrice) * 100;

  let riskAmount: number | null = null;
  let riskRewardRatio: number | null = null;

  if (stopLoss !== undefined) {
    riskAmount = Math.abs((stopLoss - entryPrice) * quantity);
    
    // Calculate risk/reward ratio
    const currentProfit = Math.abs(unrealizedPnL);
    if (riskAmount > 0) {
      riskRewardRatio = currentProfit / riskAmount;
    }
  }

  return {
    unrealizedPnL,
    percentageChange,
    riskAmount,
    riskRewardRatio,
  };
}

/**
 * Calculate Kelly Criterion for optimal position sizing
 * Capped at 25% for safety (fractional Kelly)
 */
export function calculateKellyCriterion(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  if (avgWin <= 0 || avgLoss <= 0) {
    return 0;
  }

  const kellyPercent = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
  
  // Cap at 25% for safety (fractional Kelly of 0.25)
  return Math.max(0, Math.min(kellyPercent, 0.25));
}

/**
 * Calculate expected value per trade
 */
export function calculateExpectedValue(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  return (winRate * avgWin) - ((1 - winRate) * avgLoss);
}

/**
 * Calculate risk of ruin using gambler's ruin formula
 * Returns probability of account depletion (0 to 1)
 */
export function calculateRiskOfRuin(
  winRate: number,
  riskPerTrade: number,
  accountSize: number
): number {
  if (winRate >= 1 || winRate <= 0 || riskPerTrade <= 0 || riskPerTrade >= 1) {
    return 0;
  }

  const lossRate = 1 - winRate;
  
  // Gambler's ruin formula
  // ROR = ((1-W)/W)^(A/R) where A is account size in units, R is risk per trade
  const units = 1 / riskPerTrade; // Number of losing trades to ruin
  
  if (winRate === 0.5) {
    // Special case: 50/50 win rate
    return 1 / (1 + units);
  }
  
  const ratio = lossRate / winRate;
  const riskOfRuin = Math.pow(ratio, units);
  
  return Math.min(1, riskOfRuin);
}

/**
 * Calculate position size based on account risk parameters
 */
export function calculatePositionSize(
  accountSize: number,
  riskPercentage: number,
  entryPrice: number,
  stopLoss: number
): number {
  if (accountSize <= 0 || riskPercentage <= 0 || entryPrice === stopLoss) {
    return 0;
  }

  const riskAmount = accountSize * (riskPercentage / 100);
  const priceRisk = Math.abs(entryPrice - stopLoss);
  
  if (priceRisk === 0) {
    return 0;
  }

  const positionSize = riskAmount / priceRisk;
  
  return Math.max(0, positionSize);
}

/**
 * Calculate Maximum Adverse Excursion (MAE)
 * Measures the worst unrealized loss during a trade
 */
export function calculateMaximumAdverseExcursion(trades: Trade[]): ExcursionResult {
  if (trades.length === 0) {
    return {
      averageMAE: 0,
      maxMAE: 0,
      averageMAEPercent: 0,
    };
  }

  const maes = trades.map(trade => {
    if (trade.side === 'long') {
      // For long positions, MAE is entry - lowest price
      const mae = trade.entryPrice - trade.lowestPrice;
      const maePercent = (mae / trade.entryPrice) * 100;
      return { mae, maePercent };
    } else {
      // For short positions, MAE is highest price - entry
      const mae = trade.highestPrice - trade.entryPrice;
      const maePercent = (mae / trade.entryPrice) * 100;
      return { mae, maePercent };
    }
  });

  const averageMAE = maes.reduce((sum, m) => sum + m.mae, 0) / maes.length;
  const maxMAE = Math.max(...maes.map(m => m.mae));
  const averageMAEPercent = maes.reduce((sum, m) => sum + m.maePercent, 0) / maes.length;

  return {
    averageMAE,
    maxMAE,
    averageMAEPercent,
  };
}

/**
 * Calculate Maximum Favorable Excursion (MFE)
 * Measures the best unrealized profit during a trade
 */
export function calculateMaximumFavorableExcursion(trades: Trade[]): MFEResult {
  if (trades.length === 0) {
    return {
      averageMFE: 0,
      maxMFE: 0,
      averageMFEPercent: 0,
    };
  }

  const mfes = trades.map(trade => {
    if (trade.side === 'long') {
      // For long positions, MFE is highest price - entry
      const mfe = trade.highestPrice - trade.entryPrice;
      const mfePercent = (mfe / trade.entryPrice) * 100;
      return { mfe, mfePercent };
    } else {
      // For short positions, MFE is entry - lowest price
      const mfe = trade.entryPrice - trade.lowestPrice;
      const mfePercent = (mfe / trade.entryPrice) * 100;
      return { mfe, mfePercent };
    }
  });

  const averageMFE = mfes.reduce((sum, m) => sum + m.mfe, 0) / mfes.length;
  const maxMFE = Math.max(...mfes.map(m => m.mfe));
  const averageMFEPercent = mfes.reduce((sum, m) => sum + m.mfePercent, 0) / mfes.length;

  return {
    averageMFE,
    maxMFE,
    averageMFEPercent,
  };
}

/**
 * Calculate Conditional Value at Risk (CVaR) / Expected Shortfall
 * Average of losses beyond the VaR threshold
 */
export function calculateConditionalVaR(
  returns: number[],
  confidenceLevel: number = 0.95
): number {
  if (returns.length === 0) {
    return 0;
  }

  // Sort returns in ascending order
  const sortedReturns = [...returns].sort((a, b) => a - b);
  
  // Calculate VaR threshold index
  const varIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);
  
  if (varIndex === 0) {
    return sortedReturns[0];
  }

  // Calculate average of all returns below VaR threshold
  const tailReturns = sortedReturns.slice(0, varIndex);
  const cvar = tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length;

  return cvar;
}

/**
 * Calculate Tail Ratio
 * Ratio of right tail (95th percentile) to left tail (5th percentile)
 * Measures asymmetry in returns distribution
 */
export function calculateTailRatio(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  // Sort returns
  const sortedReturns = [...returns].sort((a, b) => a - b);
  
  // Calculate percentile indices
  const p5Index = Math.floor(0.05 * sortedReturns.length);
  const p95Index = Math.floor(0.95 * sortedReturns.length);
  
  const p5 = sortedReturns[p5Index];
  const p95 = sortedReturns[p95Index];
  
  // Tail ratio = absolute value of (95th percentile) / absolute value of (5th percentile)
  // Higher ratio indicates positive skew (good for traders)
  if (p5 === 0) {
    return p95 > 0 ? Infinity : 0;
  }

  const tailRatio = Math.abs(p95) / Math.abs(p5);
  
  return tailRatio;
}

/**
 * Calculate Sharpe Ratio
 * Measures risk-adjusted returns
 * @param returns Array of returns
 * @param riskFreeRate Risk-free rate (default 0)
 * @returns Sharpe ratio
 */
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0
): number {
  if (returns.length === 0) {
    return 0;
  }

  // Calculate average return
  const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  
  // Calculate standard deviation
  const variance = returns.reduce((sum, ret) => {
    const diff = ret - avgReturn;
    return sum + diff * diff;
  }, 0) / returns.length;
  
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) {
    return 0;
  }

  // Sharpe ratio = (average return - risk-free rate) / standard deviation
  const sharpeRatio = (avgReturn - riskFreeRate) / stdDev;
  
  return sharpeRatio;
}

/**
 * Calculate Maximum Drawdown
 * Measures the largest peak-to-trough decline in equity curve
 * @param equityCurve Array of equity values over time
 * @returns Object containing max drawdown and max drawdown percentage
 */
export function calculateMaxDrawdown(equityCurve: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
} {
  if (equityCurve.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
    };
  }

  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let peak = equityCurve[0];

  for (const value of equityCurve) {
    // Update peak if we've reached a new high
    if (value > peak) {
      peak = value;
    }

    // Calculate drawdown from peak
    const drawdown = peak - value;
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

    // Update max drawdown if current is larger
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }

  return {
    maxDrawdown,
    maxDrawdownPercent,
  };
}

/**
 * Calculate overall risk score for a position or portfolio
 * Score ranges from 0 (low risk) to 100 (high risk)
 * @param params Risk parameters
 * @returns Risk score from 0-100
 */
export function calculateRiskScore(params: {
  volatility?: number;
  maxDrawdown?: number;
  leverage?: number;
  positionSize?: number;
  accountSize?: number;
}): number {
  let score = 0;
  let factors = 0;

  // Volatility component (0-25 points)
  if (params.volatility !== undefined) {
    const volScore = Math.min(params.volatility * 100, 25);
    score += volScore;
    factors++;
  }

  // Drawdown component (0-25 points)
  if (params.maxDrawdown !== undefined) {
    const ddScore = Math.min(Math.abs(params.maxDrawdown), 25);
    score += ddScore;
    factors++;
  }

  // Leverage component (0-25 points)
  if (params.leverage !== undefined) {
    const levScore = Math.min((params.leverage / 10) * 25, 25);
    score += levScore;
    factors++;
  }

  // Position size component (0-25 points)
  if (params.positionSize !== undefined && params.accountSize !== undefined && params.accountSize > 0) {
    const sizePercent = (params.positionSize / params.accountSize) * 100;
    const sizeScore = Math.min(sizePercent / 2, 25);
    score += sizeScore;
    factors++;
  }

  // Return normalized score
  if (factors === 0) {
    return 0;
  }

  return Math.min((score / factors) * (100 / 25), 100);
}

interface MultiLayerRiskResult {
  overallRiskScore: number;
  positionRisk: {
    score: number;
    volatility: number;
    concentration: number;
  };
  portfolioRisk: {
    score: number;
    diversification: number;
    correlation: number;
  };
  marketRisk: {
    score: number;
    beta: number;
    systemicRisk: number;
  };
  recommendations: string[];
}

/**
 * Perform comprehensive multi-layer risk analysis
 * Analyzes risk at position, portfolio, and market levels
 */
export function multiLayerRiskAnalysis(params: {
  positions?: Position[];
  returns?: number[];
  marketReturns?: number[];
  correlationMatrix?: number[][];
}): MultiLayerRiskResult {
  const recommendations: string[] = [];
  
  // Position-level risk
  const positionRisk = {
    score: 0,
    volatility: 0,
    concentration: 0,
  };

  if (params.positions && params.positions.length > 0) {
    const totalValue = params.positions.reduce((sum, pos) => sum + pos.value, 0);
    const maxPosition = Math.max(...params.positions.map(pos => pos.value));
    positionRisk.concentration = totalValue > 0 ? (maxPosition / totalValue) * 100 : 0;
    
    if (positionRisk.concentration > 30) {
      recommendations.push('High position concentration detected. Consider diversifying.');
      positionRisk.score += 30;
    } else if (positionRisk.concentration > 20) {
      positionRisk.score += 20;
    } else {
      positionRisk.score += 10;
    }
  }

  if (params.returns && params.returns.length > 0) {
    const avgReturn = params.returns.reduce((sum, ret) => sum + ret, 0) / params.returns.length;
    const variance = params.returns.reduce((sum, ret) => Math.pow(ret - avgReturn, 2) + sum, 0) / params.returns.length;
    positionRisk.volatility = Math.sqrt(variance);
    
    if (positionRisk.volatility > 0.05) {
      recommendations.push('High volatility detected. Consider reducing position sizes.');
      positionRisk.score += 30;
    } else if (positionRisk.volatility > 0.03) {
      positionRisk.score += 20;
    } else {
      positionRisk.score += 10;
    }
  }

  // Portfolio-level risk
  const portfolioRisk = {
    score: 0,
    diversification: 0,
    correlation: 0,
  };

  if (params.positions && params.positions.length > 0) {
    portfolioRisk.diversification = params.positions.length;
    
    if (portfolioRisk.diversification < 5) {
      recommendations.push('Low diversification. Consider adding more positions.');
      portfolioRisk.score += 30;
    } else if (portfolioRisk.diversification < 10) {
      portfolioRisk.score += 20;
    } else {
      portfolioRisk.score += 10;
    }
  }

  if (params.correlationMatrix && params.correlationMatrix.length > 1) {
    let totalCorr = 0;
    let count = 0;
    for (let i = 0; i < params.correlationMatrix.length; i++) {
      for (let j = i + 1; j < params.correlationMatrix.length; j++) {
        totalCorr += Math.abs(params.correlationMatrix[i][j]);
        count++;
      }
    }
    portfolioRisk.correlation = count > 0 ? totalCorr / count : 0;
    
    if (portfolioRisk.correlation > 0.7) {
      recommendations.push('High correlation between positions. Diversify across asset classes.');
      portfolioRisk.score += 30;
    } else if (portfolioRisk.correlation > 0.5) {
      portfolioRisk.score += 20;
    } else {
      portfolioRisk.score += 10;
    }
  }

  // Market-level risk
  const marketRisk = {
    score: 0,
    beta: 1,
    systemicRisk: 0,
  };

  if (params.returns && params.marketReturns && params.returns.length === params.marketReturns.length && params.returns.length > 0) {
    // Calculate beta
    const avgReturn = params.returns.reduce((sum, ret) => sum + ret, 0) / params.returns.length;
    const avgMarketReturn = params.marketReturns.reduce((sum, ret) => sum + ret, 0) / params.marketReturns.length;
    
    let covariance = 0;
    let marketVariance = 0;
    
    for (let i = 0; i < params.returns.length; i++) {
      covariance += (params.returns[i] - avgReturn) * (params.marketReturns[i] - avgMarketReturn);
      marketVariance += Math.pow(params.marketReturns[i] - avgMarketReturn, 2);
    }
    
    covariance /= params.returns.length;
    marketVariance /= params.marketReturns.length;
    
    marketRisk.beta = marketVariance > 0 ? covariance / marketVariance : 1;
    marketRisk.systemicRisk = Math.abs(marketRisk.beta);
    
    if (Math.abs(marketRisk.beta) > 1.5) {
      recommendations.push('High market sensitivity. Portfolio is highly leveraged to market movements.');
      marketRisk.score += 30;
    } else if (Math.abs(marketRisk.beta) > 1.2) {
      marketRisk.score += 20;
    } else {
      marketRisk.score += 10;
    }
  }

  // Calculate overall risk score
  const scores = [positionRisk.score, portfolioRisk.score, marketRisk.score].filter(s => s > 0);
  const overallRiskScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

  return {
    overallRiskScore,
    positionRisk,
    portfolioRisk,
    marketRisk,
    recommendations,
  };
}