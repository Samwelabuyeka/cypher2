/**
 * Value at Risk (VaR) Models and Risk Management Tools
 * 
 * This module provides comprehensive VaR calculation methods including:
 * - Historical VaR
 * - Parametric VaR (Variance-Covariance)
 * - Monte Carlo VaR with variance reduction techniques
 * - Conditional VaR (CVaR/Expected Shortfall)
 * - Extreme Value Theory (EVT)
 * - Stress Testing
 * - VaR Backtesting
 */

// Type definitions
export interface VaRResult {
  var: number;
  confidenceLevel: number;
  method: string;
}

export interface CVaRResult extends VaRResult {
  cvar: number;
}

export interface MonteCarloVaROptions {
  simulations: number;
  timeHorizon: number;
  useAntitheticVariates?: boolean;
  useControlVariates?: boolean;
}

export interface PortfolioPosition {
  weight: number;
  expectedReturn: number;
  volatility: number;
}

export interface RiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxDrawdown: number;
  volatility: number;
  sharpeRatio: number;
}

export interface StressScenario {
  name: string;
  shocks: number[];
}

export interface BacktestResult {
  violations: number;
  expectedViolations: number;
  violationRate: number;
  kupiecStatistic: number;
  pValue: number;
  isValid: boolean;
}

// Helper functions

/**
 * Calculate percentile of an array
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(arr: number[], isSample: boolean = true): number {
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  const divisor = isSample ? arr.length - 1 : arr.length;
  return Math.sqrt((avgSquareDiff * arr.length) / divisor);
}

/**
 * Calculate covariance between two arrays
 */
function covariance(arr1: number[], arr2: number[]): number {
  const mean1 = mean(arr1);
  const mean2 = mean(arr2);
  const n = arr1.length;
  
  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (arr1[i] - mean1) * (arr2[i] - mean2);
  }
  
  return cov / (n - 1);
}

/**
 * Calculate correlation coefficient
 */
function correlation(arr1: number[], arr2: number[]): number {
  const cov = covariance(arr1, arr2);
  const std1 = standardDeviation(arr1);
  const std2 = standardDeviation(arr2);
  return cov / (std1 * std2);
}

/**
 * Cholesky decomposition for matrix
 */
function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      
      if (i === j) {
        for (let k = 0; k < j; k++) {
          sum += L[j][k] * L[j][k];
        }
        L[j][j] = Math.sqrt(matrix[j][j] - sum);
      } else {
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  
  return L;
}

/**
 * Generate standard normal random variable (Box-Muller transform)
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Inverse normal CDF (approximation)
 */
function inverseNormalCDF(p: number): number {
  // Beasley-Springer-Moro algorithm
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 
             0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  
  if (p <= 0 || p >= 1) {
    throw new Error('p must be between 0 and 1');
  }
  
  const y = p - 0.5;
  
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    let x = y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]);
    x /= ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
    return x;
  }
  
  let r = p;
  if (y > 0) r = 1 - p;
  r = Math.log(-Math.log(r));
  
  let x = c[0];
  for (let i = 1; i < c.length; i++) {
    x += c[i] * Math.pow(r, i);
  }
  
  if (y < 0) x = -x;
  return x;
}

/**
 * Chi-square CDF (approximation for Kupiec test)
 */
function chiSquareCDF(x: number, df: number): number {
  // Wilson-Hilferty approximation
  const k = df;
  const z = Math.pow(x / k, 1/3) - (1 - 2/(9*k));
  const stdZ = z / Math.sqrt(2/(9*k));
  return normalCDF(stdZ);
}

/**
 * Normal CDF
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

// Main VaR calculation functions

/**
 * Historical VaR
 * Uses historical returns to estimate VaR at a given confidence level
 */
export function historicalVaR(
  returns: number[],
  confidenceLevel: number = 95
): VaRResult {
  if (returns.length === 0) {
    throw new Error('Returns array cannot be empty');
  }
  
  // VaR is the negative of the percentile (loss convention)
  const var95 = -percentile(returns, 100 - confidenceLevel);
  
  return {
    var: var95,
    confidenceLevel,
    method: 'historical'
  };
}

/**
 * Calculate portfolio variance from covariance matrix
 */
function calculatePortfolioVariance(
  weights: number[],
  covarianceMatrix: number[][]
): number {
  let variance = 0;
  
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * covarianceMatrix[i][j];
    }
  }
  
  return variance;
}

/**
 * Calculate marginal VaR for each position
 */
function calculateMarginalVaR(
  weights: number[],
  covarianceMatrix: number[][],
  portfolioStdDev: number
): number[] {
  const marginalVaRs: number[] = [];
  
  for (let i = 0; i < weights.length; i++) {
    let contribution = 0;
    for (let j = 0; j < weights.length; j++) {
      contribution += weights[j] * covarianceMatrix[i][j];
    }
    marginalVaRs.push(contribution / portfolioStdDev);
  }
  
  return marginalVaRs;
}

/**
 * Parametric VaR (Variance-Covariance method)
 * Assumes normal distribution of returns
 */
export function parametricVaR(
  positions: PortfolioPosition[],
  covarianceMatrix: number[][],
  confidenceLevel: number = 95,
  portfolioValue: number = 1
): VaRResult & { marginalVaRs: number[] } {
  const weights = positions.map(p => p.weight);
  const variance = calculatePortfolioVariance(weights, covarianceMatrix);
  const stdDev = Math.sqrt(variance);
  
  // Z-score for confidence level
  const z = inverseNormalCDF(confidenceLevel / 100);
  
  // VaR = Z * sigma * portfolio value
  const var95 = z * stdDev * portfolioValue;
  
  const marginalVaRs = calculateMarginalVaR(weights, covarianceMatrix, stdDev);
  
  return {
    var: var95,
    confidenceLevel,
    method: 'parametric',
    marginalVaRs
  };
}

/**
 * Simulate Geometric Brownian Motion for a single asset
 */
function simulateGeometricBrownianMotion(
  S0: number,
  mu: number,
  sigma: number,
  dt: number,
  steps: number,
  numPaths: number
): number[][] {
  const paths: number[][] = [];
  
  for (let i = 0; i < numPaths; i++) {
    const path: number[] = [S0];
    let S = S0;
    
    for (let t = 1; t <= steps; t++) {
      const Z = randomNormal();
      S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * Z);
      path.push(S);
    }
    
    paths.push(path);
  }
  
  return paths;
}

/**
 * Simulate correlated assets using Cholesky decomposition
 */
function simulateCorrelatedAssets(
  returns: number[][],
  numSimulations: number,
  timeHorizon: number
): number[][] {
  const numAssets = returns.length;
  
  // Calculate correlation matrix
  const corrMatrix: number[][] = Array(numAssets).fill(0).map(() => Array(numAssets).fill(0));
  
  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      if (i === j) {
        corrMatrix[i][j] = 1;
      } else {
        corrMatrix[i][j] = correlation(returns[i], returns[j]);
      }
    }
  }
  
  // Cholesky decomposition
  const L = choleskyDecomposition(corrMatrix);
  
  // Generate correlated returns
  const simulatedReturns: number[][] = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    const independentNormals = Array(numAssets).fill(0).map(() => randomNormal());
    const correlatedReturns: number[] = Array(numAssets).fill(0);
    
    for (let i = 0; i < numAssets; i++) {
      for (let j = 0; j <= i; j++) {
        correlatedReturns[i] += L[i][j] * independentNormals[j];
      }
      correlatedReturns[i] *= Math.sqrt(timeHorizon);
    }
    
    simulatedReturns.push(correlatedReturns);
  }
  
  return simulatedReturns;
}

/**
 * Antithetic variates for variance reduction
 */
function antitheticVariates(simulations: number[][]): number[][] {
  const antitheticSims: number[][] = [];
  
  for (const sim of simulations) {
    antitheticSims.push(sim.map(x => -x));
  }
  
  return [...simulations, ...antitheticSims];
}

/**
 * Control variates technique
 */
function controlVariates(
  simulations: number[],
  controlVariable: number[]
): number[] {
  const beta = covariance(simulations, controlVariable) / (standardDeviation(controlVariable) ** 2);
  const expectedControl = mean(controlVariable);
  
  return simulations.map((sim, i) => sim - beta * (controlVariable[i] - expectedControl));
}

/**
 * Monte Carlo VaR with variance reduction techniques
 */
export function monteCarloVaR(
  positions: PortfolioPosition[],
  historicalReturns: number[][],
  options: MonteCarloVaROptions,
  confidenceLevel: number = 95,
  portfolioValue: number = 1
): VaRResult {
  const { simulations, timeHorizon, useAntitheticVariates, useControlVariates } = options;
  
  let simulatedReturns = simulateCorrelatedAssets(
    historicalReturns,
    simulations,
    timeHorizon
  );
  
  // Apply antithetic variates if requested
  if (useAntitheticVariates) {
    simulatedReturns = antitheticVariates(simulatedReturns);
  }
  
  // Calculate portfolio returns for each simulation
  let portfolioReturns = simulatedReturns.map(returns => {
    return positions.reduce((sum, position, i) => {
      return sum + position.weight * returns[i];
    }, 0);
  });
  
  // Apply control variates if requested
  if (useControlVariates && historicalReturns.length > 0) {
    const avgHistoricalReturn = historicalReturns.map(returns => mean(returns));
    const controlVar = simulatedReturns.map(returns => mean(returns));
    portfolioReturns = controlVariates(portfolioReturns, controlVar);
  }
  
  // Calculate portfolio value changes
  const portfolioChanges = portfolioReturns.map(r => portfolioValue * r);
  
  // VaR is the negative of the percentile
  const var95 = -percentile(portfolioChanges, 100 - confidenceLevel);
  
  return {
    var: var95,
    confidenceLevel,
    method: 'monte-carlo'
  };
}

/**
 * Conditional VaR (CVaR / Expected Shortfall)
 * More risk-coherent measure than VaR
 */
export function conditionalVaR(
  returns: number[],
  confidenceLevel: number = 95
): CVaRResult {
  const varResult = historicalVaR(returns, confidenceLevel);
  const varThreshold = -varResult.var;
  
  // Calculate average of returns beyond VaR threshold
  const exceedances = returns.filter(r => r <= varThreshold);
  const cvar = exceedances.length > 0 ? -mean(exceedances) : varResult.var;
  
  return {
    var: varResult.var,
    cvar,
    confidenceLevel,
    method: 'conditional'
  };
}

// Extreme Value Theory

/**
 * Peaks Over Threshold (POT) method
 */
function peaksOverThreshold(returns: number[], threshold: number): number[] {
  return returns.filter(r => r < threshold).map(r => threshold - r);
}

/**
 * Fit Generalized Pareto Distribution
 * Using method of moments
 */
function fitGeneralizedParetoDistribution(exceedances: number[]): { xi: number; beta: number } {
  const n = exceedances.length;
  const m = mean(exceedances);
  const variance = exceedances.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / n;
  
  // Method of moments estimators
  const xi = 0.5 * (1 - (m * m) / variance);
  const beta = 0.5 * m * (1 + (m * m) / variance);
  
  return { xi, beta };
}

/**
 * Estimate extreme quantile using EVT
 */
function estimateExtremeQuantile(
  xi: number,
  beta: number,
  threshold: number,
  nu: number,
  n: number,
  p: number
): number {
  const q = threshold + (beta / xi) * (Math.pow(n / (nu * (1 - p)), xi) - 1);
  return q;
}

/**
 * Extreme Value Theory VaR
 */
export function extremeValueTheoryVaR(
  returns: number[],
  confidenceLevel: number = 95,
  thresholdPercentile: number = 90
): VaRResult & { xi: number; beta: number } {
  const threshold = percentile(returns, thresholdPercentile);
  const exceedances = peaksOverThreshold(returns, threshold);
  
  if (exceedances.length === 0) {
    throw new Error('No exceedances found above threshold');
  }
  
  const { xi, beta } = fitGeneralizedParetoDistribution(exceedances);
  const nu = exceedances.length;
  const n = returns.length;
  const p = confidenceLevel / 100;
  
  const extremeVar = -estimateExtremeQuantile(xi, beta, threshold, nu, n, p);
  
  return {
    var: extremeVar,
    confidenceLevel,
    method: 'extreme-value-theory',
    xi,
    beta
  };
}

// Stress Testing

export class StressTestingEngine {
  private positions: PortfolioPosition[];
  
  constructor(positions: PortfolioPosition[]) {
    this.positions = positions;
  }
  
  /**
   * Run historical scenario (e.g., 2008 crisis, COVID crash)
   */
  runHistoricalScenario(scenario: StressScenario, portfolioValue: number = 1): number {
    const { shocks } = scenario;
    
    let portfolioReturn = 0;
    this.positions.forEach((position, i) => {
      if (i < shocks.length) {
        portfolioReturn += position.weight * shocks[i];
      }
    });
    
    return portfolioValue * portfolioReturn;
  }
  
  /**
   * Run hypothetical scenario
   */
  runHypotheticalScenario(shocks: number[], portfolioValue: number = 1): number {
    return this.runHistoricalScenario({ name: 'hypothetical', shocks }, portfolioValue);
  }
  
  /**
   * Calculate sensitivity to market moves
   */
  calculateSensitivity(marketMove: number, assetIndex: number, portfolioValue: number = 1): number {
    const position = this.positions[assetIndex];
    if (!position) {
      throw new Error(`Invalid asset index: ${assetIndex}`);
    }
    
    return portfolioValue * position.weight * marketMove;
  }
  
  /**
   * Run multiple scenarios
   */
  runMultipleScenarios(scenarios: StressScenario[], portfolioValue: number = 1): Map<string, number> {
    const results = new Map<string, number>();
    
    scenarios.forEach(scenario => {
      const loss = this.runHistoricalScenario(scenario, portfolioValue);
      results.set(scenario.name, loss);
    });
    
    return results;
  }
}

// Common historical scenarios
export const HISTORICAL_SCENARIOS: StressScenario[] = [
  {
    name: '2008 Financial Crisis',
    shocks: [-0.38, -0.35, -0.42, -0.40] // Example shocks for different asset classes
  },
  {
    name: 'COVID-19 Crash (March 2020)',
    shocks: [-0.34, -0.25, -0.20, -0.15]
  },
  {
    name: 'Dot-com Bubble (2000)',
    shocks: [-0.45, -0.30, -0.20, -0.10]
  },
  {
    name: 'Black Monday (1987)',
    shocks: [-0.22, -0.25, -0.18, -0.20]
  }
];

// Backtesting

/**
 * Backtest VaR using Kupiec test
 */
export function backtestVaR(
  actualReturns: number[],
  varEstimates: number[],
  confidenceLevel: number = 95
): BacktestResult {
  if (actualReturns.length !== varEstimates.length) {
    throw new Error('actualReturns and varEstimates must have the same length');
  }
  
  const n = actualReturns.length;
  const expectedViolationRate = (100 - confidenceLevel) / 100;
  
  // Count VaR violations (when loss exceeds VaR)
  let violations = 0;
  for (let i = 0; i < n; i++) {
    if (-actualReturns[i] > varEstimates[i]) {
      violations++;
    }
  }
  
  const violationRate = violations / n;
  const expectedViolations = n * expectedViolationRate;
  
  // Kupiec's Proportion of Failures (POF) test
  // LR = -2 * ln[(1-p)^(n-x) * p^x / (1-x/n)^(n-x) * (x/n)^x]
  const p = expectedViolationRate;
  const x = violations;
  
  let kupiecStatistic = 0;
  if (x > 0 && x < n) {
    const likelihood1 = Math.pow(1 - p, n - x) * Math.pow(p, x);
    const likelihood2 = Math.pow(1 - x/n, n - x) * Math.pow(x/n, x);
    kupiecStatistic = -2 * Math.log(likelihood1 / likelihood2);
  }
  
  // p-value from chi-square distribution with 1 degree of freedom
  const pValue = 1 - chiSquareCDF(kupiecStatistic, 1);
  
  // Typically reject null hypothesis if p-value < 0.05
  const isValid = pValue >= 0.05;
  
  return {
    violations,
    expectedViolations,
    violationRate,
    kupiecStatistic,
    pValue,
    isValid
  };
}

/**
 * Calculate comprehensive risk metrics for daily reports
 */
export function calculateRiskMetrics(
  returns: number[],
  portfolioValue: number = 1
): RiskMetrics {
  const var95Result = historicalVaR(returns, 95);
  const var99Result = historicalVaR(returns, 99);
  const cvar95Result = conditionalVaR(returns, 95);
  const cvar99Result = conditionalVaR(returns, 99);
  
  // Calculate max drawdown
  const cumulativeReturns: number[] = [1];
  for (let i = 0; i < returns.length; i++) {
    cumulativeReturns.push(cumulativeReturns[i] * (1 + returns[i]));
  }
  
  let maxDrawdown = 0;
  let peak = cumulativeReturns[0];
  
  for (const value of cumulativeReturns) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  const volatility = standardDeviation(returns);
  const avgReturn = mean(returns);
  const sharpeRatio = avgReturn / (volatility || 1); // Annualize as needed
  
  return {
    var95: var95Result.var * portfolioValue,
    var99: var99Result.var * portfolioValue,
    cvar95: cvar95Result.cvar * portfolioValue,
    cvar99: cvar99Result.cvar * portfolioValue,
    maxDrawdown,
    volatility,
    sharpeRatio
  };
}

/**
 * Portfolio risk decomposition
 * Breaks down total risk by position contributions
 */
export function portfolioRiskDecomposition(
  positions: PortfolioPosition[],
  covarianceMatrix: number[][],
  portfolioValue: number = 1
): {
  totalRisk: number;
  componentVaRs: number[];
  percentageContributions: number[];
  marginalVaRs: number[];
} {
  const weights = positions.map(p => p.weight);
  const variance = calculatePortfolioVariance(weights, covarianceMatrix);
  const stdDev = Math.sqrt(variance);
  
  const marginalVaRs = calculateMarginalVaR(weights, covarianceMatrix, stdDev);
  
  // Component VaR = weight * marginal VaR
  const componentVaRs = weights.map((w, i) => w * marginalVaRs[i] * portfolioValue);
  
  const totalComponentVaR = componentVaRs.reduce((sum, cv) => sum + cv, 0);
  const percentageContributions = componentVaRs.map(cv => (cv / totalComponentVaR) * 100);
  
  return {
    totalRisk: stdDev * portfolioValue,
    componentVaRs,
    percentageContributions,
    marginalVaRs: marginalVaRs.map(mv => mv * portfolioValue)
  };
}

// Export all functions and types
export {
  // Helper functions (if needed externally)
  percentile,
  mean,
  standardDeviation,
  covariance,
  correlation,
  // Alias exports for compatibility with other modules
  historicalVaR as calculateHistoricalVaR,
  parametricVaR as calculateParametricVaR,
  monteCarloVaR as calculateMonteCarloVaR,
  conditionalVaR as calculateConditionalVaR
};