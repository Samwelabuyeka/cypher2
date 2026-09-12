/**
 * Advanced quantitative trading models and statistical calculations
 */

// Helper statistical functions
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(squareDiffs.reduce((s, v) => s + v, 0) / Math.max(1, values.length - 1));
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return squareDiffs.reduce((s, v) => s + v, 0) / Math.max(1, values.length - 1);
}

function covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const xMean = mean(x);
  const yMean = mean(y);
  return mean(x.map((xi, i) => (xi - xMean) * (y[i] - yMean)));
}

function correlation(x: number[], y: number[]): number {
  const cov = covariance(x, y);
  const xStd = stdDev(x);
  const yStd = stdDev(y);
  if (xStd === 0 || yStd === 0) return 0;
  return cov / (xStd * yStd);
}

/**
 * Calculate mean reversion signals using Z-score
 */
export function calculateMeanReversion(
  prices: number[],
  lookback = 20
): {
  zScore: number;
  signal: 'oversold' | 'overbought' | 'neutral';
  mean: number;
  stdDev: number;
} {
  if (prices.length < lookback) {
    throw new Error(`Insufficient data. Need at least ${lookback} prices.`);
  }

  const recentPrices = prices.slice(-lookback);
  const avg = mean(recentPrices);
  const std = stdDev(recentPrices);
  const currentPrice = prices[prices.length - 1];
  
  const zScore = std === 0 ? 0 : (currentPrice - avg) / std;
  
  let signal: 'oversold' | 'overbought' | 'neutral';
  if (zScore < -2) {
    signal = 'oversold';
  } else if (zScore > 2) {
    signal = 'overbought';
  } else {
    signal = 'neutral';
  }

  return {
    zScore,
    signal,
    mean: avg,
    stdDev: std
  };
}

/**
 * Calculate momentum indicator
 */
export function calculateMomentum(
  prices: number[],
  period = 10
): {
  momentum: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  rateOfChange: number;
} {
  if (prices.length < period + 1) {
    throw new Error(`Insufficient data. Need at least ${period + 1} prices.`);
  }

  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - 1 - period];
  
  const rateOfChange = ((currentPrice - pastPrice) / pastPrice) * 100;
  const momentum = currentPrice - pastPrice;
  
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (momentum > 0 && rateOfChange > 1) {
    signal = 'bullish';
  } else if (momentum < 0 && rateOfChange < -1) {
    signal = 'bearish';
  } else {
    signal = 'neutral';
  }

  return {
    momentum,
    signal,
    rateOfChange
  };
}

/**
 * Calculate trend strength using linear regression
 */
export function calculateTrendStrength(
  prices: number[],
  period = 20
): {
  slope: number;
  rSquared: number;
  strength: number;
  trend: 'uptrend' | 'downtrend' | 'sideways';
} {
  if (prices.length < period) {
    throw new Error(`Insufficient data. Need at least ${period} prices.`);
  }

  const recentPrices = prices.slice(-period);
  const n = recentPrices.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = recentPrices;

  const xMean = mean(x);
  const yMean = mean(y);

  let numerator = 0;
  let denominator = 0;
  let ssTotal = 0;
  let ssResidual = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
    ssTotal += Math.pow(y[i] - yMean, 2);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssResidual += Math.pow(y[i] - predicted, 2);
  }

  const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);
  const strength = Math.min(100, rSquared * 100);

  let trend: 'uptrend' | 'downtrend' | 'sideways';
  if (slope > 0 && rSquared > 0.5) {
    trend = 'uptrend';
  } else if (slope < 0 && rSquared > 0.5) {
    trend = 'downtrend';
  } else {
    trend = 'sideways';
  }

  return {
    slope,
    rSquared,
    strength,
    trend
  };
}

/**
 * Calculate Hurst exponent for trend persistence
 */
export function calculateHurstExponent(prices: number[]): {
  hurst: number;
  interpretation: 'mean-reverting' | 'random-walk' | 'trending';
} {
  if (prices.length < 100) {
    throw new Error('Insufficient data. Need at least 100 prices for Hurst exponent.');
  }

  const logReturns = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const lags = [2, 4, 8, 16, 32, 64];
  const rsValues: number[] = [];

  for (const lag of lags) {
    if (lag >= logReturns.length) continue;

    const chunks = Math.floor(logReturns.length / lag);
    const rsChunks: number[] = [];

    for (let i = 0; i < chunks; i++) {
      const chunk = logReturns.slice(i * lag, (i + 1) * lag);
      const chunkMean = mean(chunk);
      
      let cumulativeDeviation = 0;
      const deviations: number[] = [];
      
      for (const value of chunk) {
        cumulativeDeviation += value - chunkMean;
        deviations.push(cumulativeDeviation);
      }

      const range = Math.max(...deviations) - Math.min(...deviations);
      const std = stdDev(chunk);
      
      if (std > 0) {
        rsChunks.push(range / std);
      }
    }

    if (rsChunks.length > 0) {
      rsValues.push(mean(rsChunks));
    }
  }

  if (rsValues.length < 2) {
    return {
      hurst: 0.5,
      interpretation: 'random-walk'
    };
  }

  const logLags = lags.slice(0, rsValues.length).map(l => Math.log(l));
  const logRS = rsValues.map(rs => Math.log(rs));

  const logLagsMean = mean(logLags);
  const logRSMean = mean(logRS);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < logLags.length; i++) {
    numerator += (logLags[i] - logLagsMean) * (logRS[i] - logRSMean);
    denominator += Math.pow(logLags[i] - logLagsMean, 2);
  }

  const hurst = denominator === 0 ? 0.5 : numerator / denominator;

  let interpretation: 'mean-reverting' | 'random-walk' | 'trending';
  if (hurst < 0.45) {
    interpretation = 'mean-reverting';
  } else if (hurst > 0.55) {
    interpretation = 'trending';
  } else {
    interpretation = 'random-walk';
  }

  return {
    hurst: Math.max(0, Math.min(1, hurst)),
    interpretation
  };
}

/**
 * Calculate Ornstein-Uhlenbeck process parameters
 */
export function calculateOrnsteinUhlenbeck(prices: number[]): {
  theta: number;
  mu: number;
  sigma: number;
} {
  if (prices.length < 30) {
    throw new Error('Insufficient data. Need at least 30 prices.');
  }

  const logPrices = prices.map(p => Math.log(p));
  const changes = [];
  
  for (let i = 1; i < logPrices.length; i++) {
    changes.push(logPrices[i] - logPrices[i - 1]);
  }

  const mu = mean(logPrices);
  const deviations = logPrices.map(p => p - mu);
  
  let sumProduct = 0;
  let sumSquared = 0;

  for (let i = 1; i < deviations.length; i++) {
    sumProduct += deviations[i - 1] * changes[i - 1];
    sumSquared += deviations[i - 1] * deviations[i - 1];
  }

  const theta = sumSquared === 0 ? 0.1 : -sumProduct / sumSquared;
  const sigma = stdDev(changes);

  return {
    theta: Math.max(0, theta),
    mu: Math.exp(mu),
    sigma
  };
}

/**
 * Calculate cointegration for pairs trading
 */
export function calculateCointegration(
  seriesA: number[],
  seriesB: number[]
): {
  isCointegrated: boolean;
  spread: number[];
  cointegrationScore: number;
  hedgeRatio: number;
} {
  if (seriesA.length !== seriesB.length || seriesA.length < 30) {
    throw new Error('Series must have equal length and at least 30 observations.');
  }

  const n = seriesA.length;
  const aMean = mean(seriesA);
  const bMean = mean(seriesB);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (seriesA[i] - aMean) * (seriesB[i] - bMean);
    denominator += Math.pow(seriesB[i] - bMean, 2);
  }

  const hedgeRatio = denominator === 0 ? 1 : numerator / denominator;
  
  const spread = seriesA.map((a, i) => a - hedgeRatio * seriesB[i]);
  const spreadMean = mean(spread);
  
  const spreadChanges = [];
  for (let i = 1; i < spread.length; i++) {
    spreadChanges.push(spread[i] - spread[i - 1]);
  }

  const spreadDeviations = spread.map(s => s - spreadMean);
  
  const depVar = spreadChanges;
  const laggedSpread = spread.slice(0, spreadChanges.length);
  const m = depVar.length;

  if (m < 3) {
    return { isCointegrated: false, spread, cointegrationScore: 0, hedgeRatio };
  }

  const depMean = mean(depVar);
  const lagMean = mean(laggedSpread);

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;

  for (let i = 0; i < m; i++) {
    ssXY += (laggedSpread[i] - lagMean) * (depVar[i] - depMean);
    ssXX += (laggedSpread[i] - lagMean) * (laggedSpread[i] - lagMean);
    ssYY += (depVar[i] - depMean) * (depVar[i] - depMean);
  }

  const adfCoef = ssXX === 0 ? 0 : ssXY / ssXX;
  const ssRes = ssYY - adfCoef * ssXY;
  const mse = m > 2 ? ssRes / (m - 2) : 0;
  const seCoef = ssXX > 0 && mse > 0 ? Math.sqrt(mse / ssXX) : Infinity;
  const adfStat = seCoef === 0 ? 0 : adfCoef / seCoef;

  const cointegrationScore = Math.abs(adfStat);
  const isCointegrated = adfStat < -2.86;

  return {
    isCointegrated,
    spread,
    cointegrationScore,
    hedgeRatio
  };
}

/**
 * Calculate volatility forecast using GARCH-like approach
 */
export function calculateVolatilityForecast(
  returns: number[],
  horizon = 5
): {
  forecast: number;
  currentVolatility: number;
  annualizedForecast: number;
} {
  if (returns.length < 20) {
    throw new Error('Insufficient data. Need at least 20 returns.');
  }

  const alpha = 0.94;
  const beta = 0.04;
  const omega = 0.02;

  const squaredReturns = returns.map(r => r * r);
  
  let currentVariance = variance(returns);
  
  for (let i = 0; i < squaredReturns.length; i++) {
    currentVariance = omega + alpha * currentVariance + beta * squaredReturns[i];
  }

  let forecastVariance = currentVariance;
  for (let i = 0; i < horizon; i++) {
    forecastVariance = omega + (alpha + beta) * forecastVariance;
  }

  const currentVolatility = Math.sqrt(currentVariance);
  const forecast = Math.sqrt(forecastVariance);
  const annualizedForecast = forecast * Math.sqrt(252);

  return {
    forecast,
    currentVolatility,
    annualizedForecast
  };
}

/**
 * Detect market regime
 */
export function calculateMarketRegime(
  returns: number[],
  volatility: number[]
): {
  regime: 'bull' | 'bear' | 'high-volatility' | 'low-volatility';
  confidence: number;
  metrics: {
    avgReturn: number;
    avgVolatility: number;
  };
} {
  if (returns.length !== volatility.length || returns.length < 20) {
    throw new Error('Returns and volatility must have equal length and at least 20 observations.');
  }

  const avgReturn = mean(returns);
  const avgVolatility = mean(volatility);
  const recentReturns = returns.slice(-10);
  const recentVol = volatility.slice(-10);
  
  const recentAvgReturn = mean(recentReturns);
  const recentAvgVol = mean(recentVol);
  
  const returnThreshold = stdDev(returns) * 0.5;
  const volThreshold = stdDev(volatility) * 0.5;

  let regime: 'bull' | 'bear' | 'high-volatility' | 'low-volatility';
  let confidence: number;

  if (recentAvgVol > avgVolatility + volThreshold) {
    regime = 'high-volatility';
    confidence = Math.min(1, (recentAvgVol - avgVolatility) / volThreshold);
  } else if (recentAvgVol < avgVolatility - volThreshold) {
    regime = 'low-volatility';
    confidence = Math.min(1, (avgVolatility - recentAvgVol) / volThreshold);
  } else if (recentAvgReturn > returnThreshold) {
    regime = 'bull';
    confidence = Math.min(1, recentAvgReturn / returnThreshold);
  } else if (recentAvgReturn < -returnThreshold) {
    regime = 'bear';
    confidence = Math.min(1, Math.abs(recentAvgReturn) / returnThreshold);
  } else {
    regime = recentAvgReturn > 0 ? 'bull' : 'bear';
    confidence = 0.5;
  }

  return {
    regime,
    confidence: Math.max(0, Math.min(1, confidence)),
    metrics: {
      avgReturn: recentAvgReturn,
      avgVolatility: recentAvgVol
    }
  };
}

/**
 * Calculate Information Ratio
 */
export function calculateInformationRatio(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): {
  informationRatio: number;
  excessReturn: number;
  trackingError: number;
} {
  if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 20) {
    throw new Error('Returns must have equal length and at least 20 observations.');
  }

  const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  const excessReturn = mean(excessReturns);
  const trackingError = stdDev(excessReturns);

  const informationRatio = trackingError === 0 ? 0 : excessReturn / trackingError;

  return {
    informationRatio,
    excessReturn,
    trackingError
  };
}

/**
 * Calculate Omega Ratio
 */
export function calculateOmegaRatio(
  returns: number[],
  threshold = 0
): {
  omegaRatio: number;
  probabilityOfGain: number;
  avgGain: number;
  avgLoss: number;
} {
  if (returns.length < 10) {
    throw new Error('Insufficient data. Need at least 10 returns.');
  }

  const gains = returns.filter(r => r > threshold).map(r => r - threshold);
  const losses = returns.filter(r => r <= threshold).map(r => threshold - r);

  const sumGains = gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) : 0;
  const sumLosses = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) : 0;

  const omegaRatio = sumLosses === 0 ? (sumGains > 0 ? Infinity : 1) : sumGains / sumLosses;
  const probabilityOfGain = gains.length / returns.length;
  const avgGain = gains.length > 0 ? mean(gains) : 0;
  const avgLoss = losses.length > 0 ? mean(losses) : 0;

  return {
    omegaRatio: omegaRatio,
    probabilityOfGain,
    avgGain,
    avgLoss
  };
}

/**
 * Calculate growth potential based on trend and momentum
 */
export function calculateGrowthPotential(
  prices: number[],
  lookback = 30
): {
  growthScore: number;
  potential: 'high' | 'moderate' | 'low';
  trendStrength: number;
  momentumScore: number;
} {
  if (prices.length < lookback) {
    throw new Error(`Insufficient data. Need at least ${lookback} prices.`);
  }

  const trend = calculateTrendStrength(prices, lookback);
  const momentum = calculateMomentum(prices, Math.floor(lookback / 3));
  
  let trendScore = trend.rSquared * 100;
  if (trend.trend === 'downtrend') {
    trendScore = -trendScore;
  }
  
  const momentumScore = Math.min(100, Math.max(-100, momentum.rateOfChange * 10));
  
  const growthScore = (trendScore * 0.6 + momentumScore * 0.4);
  
  let potential: 'high' | 'moderate' | 'low';
  if (growthScore > 50) {
    potential = 'high';
  } else if (growthScore > 0) {
    potential = 'moderate';
  } else {
    potential = 'low';
  }

  return {
    growthScore: Math.max(-100, Math.min(100, growthScore)),
    potential,
    trendStrength: trend.strength,
    momentumScore
  };
}

/**
 * Optimize position size based on Kelly Criterion and risk parameters
 */
export function optimizePositionSize(
  accountBalance: number,
  winRate: number,
  avgWin: number,
  avgLoss: number,
  maxRiskPerTrade = 0.02,
  volatility?: number
): {
  optimalSize: number;
  kellyFraction: number;
  adjustedSize: number;
  riskAmount: number;
} {
  if (accountBalance <= 0) {
    throw new Error('Account balance must be positive.');
  }
  
  if (winRate < 0 || winRate > 1) {
    throw new Error('Win rate must be between 0 and 1.');
  }

  const lossRate = 1 - winRate;
  
  let kellyFraction = 0;
  if (avgLoss > 0) {
    const winLossRatio = avgWin / avgLoss;
    kellyFraction = (winRate * winLossRatio - lossRate) / winLossRatio;
  }
  
  kellyFraction = Math.max(0, Math.min(1, kellyFraction));
  
  const halfKelly = kellyFraction * 0.5;
  
  let adjustedFraction = halfKelly;
  if (volatility && volatility > 0.3) {
    adjustedFraction *= (0.3 / volatility);
  }
  
  adjustedFraction = Math.min(adjustedFraction, maxRiskPerTrade);
  
  const riskAmount = accountBalance * adjustedFraction;
  const optimalSize = accountBalance * kellyFraction;
  const adjustedSize = accountBalance * adjustedFraction;

  return {
    optimalSize: Math.max(0, optimalSize),
    kellyFraction: Math.max(0, Math.min(1, kellyFraction)),
    adjustedSize: Math.max(0, adjustedSize),
    riskAmount: Math.max(0, riskAmount)
  };
}