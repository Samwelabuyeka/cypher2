/**
 * Performance Attribution Analysis
 * Provides comprehensive attribution analysis for portfolio returns
 */

// Type definitions
export interface Position {
  symbol: string;
  weight: number;
  returns?: number;
}

export interface FactorExposure {
  name: string;
  exposure: number;
  returns: number;
}

export interface BrinsonAttribution {
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  totalEffect: number;
}

export interface FactorAttribution {
  factorName: string;
  contribution: number;
  exposure: number;
}

export interface StrategyAttribution {
  strategyName: string;
  contribution: number;
  weight: number;
}

export interface AlphaDecomposition {
  totalAlpha: number;
  factorTimingAlpha: number;
  stockSelectionAlpha: number;
  interactionEffect: number;
}

export interface RiskContribution {
  symbol: string;
  marginalContribution: number;
  componentVaR: number;
  percentOfTotalRisk: number;
}

export interface RollingMetric {
  timestamp: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  alpha: number;
  beta: number;
}

export interface AttributionResult {
  brinson: BrinsonAttribution;
  factorAttributions: FactorAttribution[];
  strategyAttributions: StrategyAttribution[];
  alphaDecomposition: AlphaDecomposition;
  totalReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
}

/**
 * Calculates Brinson attribution (allocation and selection effects)
 */
function calculateBrinsonAttribution(
  portfolioWeights: Record<string, number>,
  benchmarkWeights: Record<string, number>,
  portfolioReturns: Record<string, number>,
  benchmarkReturns: Record<string, number>
): BrinsonAttribution {
  let allocationEffect = 0;
  let selectionEffect = 0;
  let interactionEffect = 0;

  const allAssets = new Set([
    ...Object.keys(portfolioWeights),
    ...Object.keys(benchmarkWeights),
  ]);

  for (const asset of allAssets) {
    const wp = portfolioWeights[asset] || 0;
    const wb = benchmarkWeights[asset] || 0;
    const rp = portfolioReturns[asset] || 0;
    const rb = benchmarkReturns[asset] || 0;

    // Allocation effect: (wp - wb) * (rb - benchmark total return)
    allocationEffect += (wp - wb) * rb;

    // Selection effect: wb * (rp - rb)
    selectionEffect += wb * (rp - rb);

    // Interaction effect: (wp - wb) * (rp - rb)
    interactionEffect += (wp - wb) * (rp - rb);
  }

  const totalEffect = allocationEffect + selectionEffect + interactionEffect;

  return {
    allocationEffect,
    selectionEffect,
    interactionEffect,
    totalEffect,
  };
}

/**
 * Calculates factor-based attribution
 */
function calculateFactorAttribution(
  portfolioReturns: number[],
  factorReturns: Record<string, number[]>
): FactorAttribution[] {
  const attributions: FactorAttribution[] = [];

  for (const [factorName, returns] of Object.entries(factorReturns)) {
    if (returns.length !== portfolioReturns.length) {
      throw new Error(`Factor ${factorName} returns length mismatch`);
    }

    // Calculate factor exposure (beta)
    const exposure = calculateBeta(portfolioReturns, returns);

    // Calculate contribution (exposure * factor return)
    const avgFactorReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const contribution = exposure * avgFactorReturn;

    attributions.push({
      factorName,
      contribution,
      exposure,
    });
  }

  return attributions;
}

/**
 * Main attribution function
 */
export function attributeReturns(
  portfolioReturns: Record<string, number> | number[],
  benchmarkReturns: Record<string, number> | number[],
  factorReturns?: Record<string, number[]>
): AttributionResult {
  let totalReturn = 0;
  let benchmarkReturn = 0;
  let brinson: BrinsonAttribution;
  let factorAttributions: FactorAttribution[] = [];

  // Handle array-based returns
  if (Array.isArray(portfolioReturns) && Array.isArray(benchmarkReturns)) {
    totalReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    benchmarkReturn = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;

    brinson = {
      allocationEffect: 0,
      selectionEffect: totalReturn - benchmarkReturn,
      interactionEffect: 0,
      totalEffect: totalReturn - benchmarkReturn,
    };

    if (factorReturns) {
      factorAttributions = calculateFactorAttribution(portfolioReturns, factorReturns);
    }
  } else {
    // Handle object-based returns (asset-level)
    const portfolioWeights: Record<string, number> = {};
    const benchmarkWeights: Record<string, number> = {};

    // Assume equal weights if not provided
    const portfolioAssets = Object.keys(portfolioReturns);
    const benchmarkAssets = Object.keys(benchmarkReturns);

    portfolioAssets.forEach((asset) => {
      portfolioWeights[asset] = 1 / portfolioAssets.length;
      totalReturn += (portfolioReturns[asset] || 0) / portfolioAssets.length;
    });

    benchmarkAssets.forEach((asset) => {
      benchmarkWeights[asset] = 1 / benchmarkAssets.length;
      benchmarkReturn += (benchmarkReturns[asset] || 0) / benchmarkAssets.length;
    });

    brinson = calculateBrinsonAttribution(
      portfolioWeights,
      benchmarkWeights,
      portfolioReturns as Record<string, number>,
      benchmarkReturns as Record<string, number>
    );
  }

  const activeReturn = totalReturn - benchmarkReturn;

  // Strategy attributions (simplified - assumes single strategy)
  const strategyAttributions: StrategyAttribution[] = [
    {
      strategyName: "Primary Strategy",
      contribution: activeReturn,
      weight: 1.0,
    },
  ];

  // Alpha decomposition
  const alphaDecomposition: AlphaDecomposition = {
    totalAlpha: activeReturn,
    factorTimingAlpha: brinson.allocationEffect,
    stockSelectionAlpha: brinson.selectionEffect,
    interactionEffect: brinson.interactionEffect,
  };

  return {
    brinson,
    factorAttributions,
    strategyAttributions,
    alphaDecomposition,
    totalReturn,
    benchmarkReturn,
    activeReturn,
  };
}

/**
 * Calculates Information Ratio
 */
export function calculateInformationRatio(
  activeReturns: number[],
  trackingError?: number
): number {
  if (activeReturns.length === 0) return 0;

  const avgActiveReturn = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;

  let calculatedTrackingError = trackingError;
  if (!calculatedTrackingError) {
    // Calculate tracking error as standard deviation of active returns
    const variance =
      activeReturns.reduce((sum, r) => sum + Math.pow(r - avgActiveReturn, 2), 0) /
      activeReturns.length;
    calculatedTrackingError = Math.sqrt(variance);
  }

  if (calculatedTrackingError === 0) return 0;

  return avgActiveReturn / calculatedTrackingError;
}

/**
 * Calculates Active Share
 */
export function calculateActiveShare(
  portfolioWeights: Record<string, number>,
  benchmarkWeights: Record<string, number>
): number {
  const allAssets = new Set([
    ...Object.keys(portfolioWeights),
    ...Object.keys(benchmarkWeights),
  ]);

  let activeShare = 0;

  for (const asset of allAssets) {
    const wp = portfolioWeights[asset] || 0;
    const wb = benchmarkWeights[asset] || 0;
    activeShare += Math.abs(wp - wb);
  }

  return activeShare / 2; // Divide by 2 because sum of absolute differences counts each difference twice
}

/**
 * Helper function to calculate beta
 */
function calculateBeta(returns: number[], benchmarkReturns: number[]): number {
  if (returns.length !== benchmarkReturns.length || returns.length === 0) {
    return 0;
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const avgBenchmark = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;

  let covariance = 0;
  let benchmarkVariance = 0;

  for (let i = 0; i < returns.length; i++) {
    covariance += (returns[i] - avgReturn) * (benchmarkReturns[i] - avgBenchmark);
    benchmarkVariance += Math.pow(benchmarkReturns[i] - avgBenchmark, 2);
  }

  covariance /= returns.length;
  benchmarkVariance /= returns.length;

  return benchmarkVariance === 0 ? 0 : covariance / benchmarkVariance;
}

/**
 * Decomposes alpha into components
 */
export function decomposeAlpha(
  returns: number[],
  factors: Record<string, number[]>
): AlphaDecomposition {
  if (returns.length === 0) {
    return {
      totalAlpha: 0,
      factorTimingAlpha: 0,
      stockSelectionAlpha: 0,
      interactionEffect: 0,
    };
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  // Calculate factor contributions
  let factorTimingAlpha = 0;
  let stockSelectionAlpha = avgReturn; // Start with total return

  for (const [factorName, factorReturns] of Object.entries(factors)) {
    if (factorReturns.length !== returns.length) continue;

    const beta = calculateBeta(returns, factorReturns);
    const avgFactorReturn = factorReturns.reduce((a, b) => a + b, 0) / factorReturns.length;

    // Factor timing contribution
    factorTimingAlpha += beta * avgFactorReturn;
  }

  // Stock selection is the residual after accounting for factor timing
  stockSelectionAlpha -= factorTimingAlpha;

  // Interaction effect (simplified)
  const interactionEffect = 0;

  const totalAlpha = factorTimingAlpha + stockSelectionAlpha + interactionEffect;

  return {
    totalAlpha,
    factorTimingAlpha,
    stockSelectionAlpha,
    interactionEffect,
  };
}

/**
 * Calculates contribution to risk for each position
 */
export function calculateContributionToRisk(
  positions: Position[],
  correlations: number[][]
): RiskContribution[] {
  if (positions.length === 0) return [];

  const n = positions.length;
  const weights = positions.map((p) => p.weight);

  // Calculate portfolio variance
  let portfolioVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const correlation = correlations[i]?.[j] ?? (i === j ? 1 : 0);
      portfolioVariance += weights[i] * weights[j] * correlation;
    }
  }

  const portfolioStdDev = Math.sqrt(Math.max(0, portfolioVariance));

  const contributions: RiskContribution[] = [];

  for (let i = 0; i < n; i++) {
    // Calculate marginal contribution to risk
    let marginalContribution = 0;
    for (let j = 0; j < n; j++) {
      const correlation = correlations[i]?.[j] ?? (i === j ? 1 : 0);
      marginalContribution += weights[j] * correlation;
    }

    if (portfolioStdDev > 0) {
      marginalContribution /= portfolioStdDev;
    }

    // Component VaR (contribution to total risk)
    const componentVaR = weights[i] * marginalContribution;

    // Percent of total risk
    const percentOfTotalRisk =
      portfolioVariance > 0 ? (componentVaR / portfolioStdDev) * 100 : 0;

    contributions.push({
      symbol: positions[i].symbol,
      marginalContribution,
      componentVaR,
      percentOfTotalRisk,
    });
  }

  return contributions;
}

/**
 * Calculates rolling metrics over a time window
 */
export function calculateRollingMetrics(
  returns: number[],
  window: number,
  benchmarkReturns?: number[]
): RollingMetric[] {
  if (returns.length < window) return [];

  const metrics: RollingMetric[] = [];
  const riskFreeRate = 0.02 / 252; // Assume 2% annual risk-free rate, daily

  for (let i = window - 1; i < returns.length; i++) {
    const windowReturns = returns.slice(i - window + 1, i + 1);
    const windowBenchmark = benchmarkReturns
      ? benchmarkReturns.slice(i - window + 1, i + 1)
      : null;

    // Calculate average return
    const avgReturn = windowReturns.reduce((a, b) => a + b, 0) / window;

    // Calculate standard deviation
    const variance =
      windowReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / window;
    const stdDev = Math.sqrt(variance);

    // Calculate Sharpe ratio
    const sharpe = stdDev > 0 ? (avgReturn - riskFreeRate) / stdDev : 0;

    // Calculate Sortino ratio (downside deviation)
    const downsideReturns = windowReturns.filter((r) => r < riskFreeRate);
    const downsideVariance =
      downsideReturns.length > 0
        ? downsideReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) /
          downsideReturns.length
        : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortino = downsideDeviation > 0 ? (avgReturn - riskFreeRate) / downsideDeviation : 0;

    // Calculate max drawdown
    let peak = windowReturns[0];
    let maxDrawdown = 0;
    let cumReturn = 1;

    for (const r of windowReturns) {
      cumReturn *= 1 + r;
      peak = Math.max(peak, cumReturn);
      const drawdown = (peak - cumReturn) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Calculate alpha and beta
    let alpha = avgReturn;
    let beta = 1;

    if (windowBenchmark && windowBenchmark.length === window) {
      beta = calculateBeta(windowReturns, windowBenchmark);
      const avgBenchmark = windowBenchmark.reduce((a, b) => a + b, 0) / window;
      alpha = avgReturn - beta * avgBenchmark;
    }

    metrics.push({
      timestamp: i,
      sharpe,
      sortino,
      maxDrawdown,
      alpha,
      beta,
    });
  }

  return metrics;
}