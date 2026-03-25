/**
 * Factor-Based Portfolio Models
 * Implements various factor models for portfolio analysis and construction
 */

// Type definitions
export interface FactorReturns {
  market: number[];
  smb?: number[]; // Small Minus Big
  hml?: number[]; // High Minus Low
  rmw?: number[]; // Robust Minus Weak
  cma?: number[]; // Conservative Minus Aggressive
  umd?: number[]; // Up Minus Down (Momentum)
}

export interface ThreeFactorResult {
  alpha: number;
  marketBeta: number;
  smbBeta: number;
  hmlBeta: number;
  rSquared: number;
  residuals: number[];
}

export interface FiveFactorResult extends ThreeFactorResult {
  rmwBeta: number;
  cmaBeta: number;
}

export interface FourFactorResult extends ThreeFactorResult {
  umdBeta: number;
}

export interface FactorLoadings {
  [factor: string]: number;
}

export interface APTResult {
  expectedReturn: number;
  factorExposures: FactorLoadings;
  residualRisk: number;
  goodnessOfFit: number;
}

export interface PCAResult {
  principalComponents: number[][];
  eigenvalues: number[];
  explainedVariance: number[];
  cumulativeVariance: number[];
  loadings: number[][];
}

export interface StyleAnalysis {
  styleWeights: { [style: string]: number };
  rSquared: number;
  trackingError: number;
}

export interface PortfolioWeights {
  [asset: string]: number;
}

export interface PerformanceAttribution {
  totalReturn: number;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
}

export interface FactorAttribution {
  factorContributions: { [factor: string]: number };
  residualContribution: number;
  totalReturn: number;
}

// Helper functions for linear regression
function linearRegression(y: number[], x: number[][]): {
  coefficients: number[];
  rSquared: number;
  residuals: number[];
} {
  const n = y.length;
  const k = x[0].length;
  
  // Add intercept column
  const X = x.map(row => [1, ...row]);
  
  // Calculate (X'X)^-1 X'y using normal equations
  const XtX = multiplyMatrices(transposeMatrix(X), X);
  const XtXInv = invertMatrix(XtX);
  const Xty = multiplyMatrixVector(transposeMatrix(X), y);
  const coefficients = multiplyMatrixVector(XtXInv, Xty);
  
  // Calculate fitted values and residuals
  const fitted = X.map(row => row.reduce((sum, val, idx) => sum + val * coefficients[idx], 0));
  const residuals = y.map((val, idx) => val - fitted[idx]);
  
  // Calculate R-squared
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  const sst = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
  const sse = residuals.reduce((sum, val) => sum + Math.pow(val, 2), 0);
  const rSquared = 1 - (sse / sst);
  
  return { coefficients, rSquared, residuals };
}

function transposeMatrix(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  
  return result;
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const aRows = a.length;
  const aCols = a[0].length;
  const bCols = b[0].length;
  const result: number[][] = Array(aRows).fill(0).map(() => Array(bCols).fill(0));
  
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      for (let k = 0; k < aCols; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  
  return result;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => 
    row.reduce((sum, val, idx) => sum + val * vector[idx], 0)
  );
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const identity = Array(n).fill(0).map((_, i) => 
    Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
  );
  
  const augmented = matrix.map((row, i) => [...row, ...identity[i]]);
  
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Scale pivot row
    const pivot = augmented[i][i];
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }
    
    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }
  
  // Extract inverse from augmented matrix
  return augmented.map(row => row.slice(n));
}

function mean(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const avg = mean(values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function covariance(x: number[], y: number[]): number {
  const xMean = mean(x);
  const yMean = mean(y);
  return x.reduce((sum, val, idx) => sum + (val - xMean) * (y[idx] - yMean), 0) / x.length;
}

function covarianceMatrix(data: number[][]): number[][] {
  const n = data.length;
  const result: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result[i][j] = covariance(data[i], data[j]);
    }
  }
  
  return result;
}

// 1. Fama-French Models

/**
 * Calculate Fama-French Three-Factor Model
 * Rf = α + β1(Rm - Rf) + β2(SMB) + β3(HML) + ε
 */
export function calculateThreeFactorModel(
  returns: number[],
  factorReturns: FactorReturns
): ThreeFactorResult {
  const x = returns.map((_, idx) => [
    factorReturns.market[idx],
    factorReturns.smb![idx],
    factorReturns.hml![idx]
  ]);
  
  const regression = linearRegression(returns, x);
  
  return {
    alpha: regression.coefficients[0],
    marketBeta: regression.coefficients[1],
    smbBeta: regression.coefficients[2],
    hmlBeta: regression.coefficients[3],
    rSquared: regression.rSquared,
    residuals: regression.residuals
  };
}

/**
 * Calculate Fama-French Five-Factor Model
 * Adds RMW (profitability) and CMA (investment) factors
 */
export function calculateFiveFactorModel(
  returns: number[],
  factorReturns: FactorReturns
): FiveFactorResult {
  const x = returns.map((_, idx) => [
    factorReturns.market[idx],
    factorReturns.smb![idx],
    factorReturns.hml![idx],
    factorReturns.rmw![idx],
    factorReturns.cma![idx]
  ]);
  
  const regression = linearRegression(returns, x);
  
  return {
    alpha: regression.coefficients[0],
    marketBeta: regression.coefficients[1],
    smbBeta: regression.coefficients[2],
    hmlBeta: regression.coefficients[3],
    rmwBeta: regression.coefficients[4],
    cmaBeta: regression.coefficients[5],
    rSquared: regression.rSquared,
    residuals: regression.residuals
  };
}

/**
 * Calculate factor loadings (betas) for any set of factors
 */
export function calculateFactorLoadings(
  returns: number[],
  factors: number[][]
): FactorLoadings {
  const regression = linearRegression(returns, factors);
  const loadings: FactorLoadings = {
    alpha: regression.coefficients[0]
  };
  
  factors[0].forEach((_, idx) => {
    loadings[`factor${idx + 1}`] = regression.coefficients[idx + 1];
  });
  
  return loadings;
}

/**
 * Calculate factor returns from portfolio characteristics
 */
export function calculateFactorReturns(
  portfolioReturns: { [portfolio: string]: number[] },
  characteristics: { [portfolio: string]: { [char: string]: number } }
): FactorReturns {
  // Simplified factor construction - in practice would use more sophisticated methods
  const periods = Object.values(portfolioReturns)[0].length;
  const result: FactorReturns = {
    market: Array(periods).fill(0),
    smb: Array(periods).fill(0),
    hml: Array(periods).fill(0)
  };
  
  // Market factor (equal-weighted average of all portfolios)
  for (let t = 0; t < periods; t++) {
    const returns = Object.values(portfolioReturns).map(r => r[t]);
    result.market[t] = mean(returns);
  }
  
  return result;
}

// 2. Carhart Four-Factor Model

/**
 * Calculate Carhart Four-Factor Model (adds momentum to Fama-French)
 */
export function calculateFourFactorModel(
  returns: number[],
  factorReturns: FactorReturns
): FourFactorResult {
  const x = returns.map((_, idx) => [
    factorReturns.market[idx],
    factorReturns.smb![idx],
    factorReturns.hml![idx],
    factorReturns.umd![idx]
  ]);
  
  const regression = linearRegression(returns, x);
  
  return {
    alpha: regression.coefficients[0],
    marketBeta: regression.coefficients[1],
    smbBeta: regression.coefficients[2],
    hmlBeta: regression.coefficients[3],
    umdBeta: regression.coefficients[4],
    rSquared: regression.rSquared,
    residuals: regression.residuals
  };
}

/**
 * Calculate factor premiums (average factor returns)
 */
export function calculateFactorPremiums(factorReturns: FactorReturns): {
  [factor: string]: number;
} {
  const premiums: { [factor: string]: number } = {};
  
  for (const [factor, returns] of Object.entries(factorReturns)) {
    if (returns) {
      premiums[factor] = mean(returns);
    }
  }
  
  return premiums;
}

// 3. Arbitrage Pricing Theory (APT)

/**
 * Estimate factor exposures using APT
 */
export function estimateFactorExposures(
  returns: number[],
  factors: number[][]
): FactorLoadings {
  const regression = linearRegression(returns, factors);
  const exposures: FactorLoadings = {};
  
  factors[0].forEach((_, idx) => {
    exposures[`factor${idx + 1}`] = regression.coefficients[idx + 1];
  });
  
  return exposures;
}

/**
 * Calculate expected returns using APT
 */
export function calculateExpectedReturns(
  factorExposures: FactorLoadings,
  factorPremiums: { [factor: string]: number },
  riskFreeRate: number
): number {
  let expectedReturn = riskFreeRate;
  
  for (const [factor, exposure] of Object.entries(factorExposures)) {
    if (factorPremiums[factor]) {
      expectedReturn += exposure * factorPremiums[factor];
    }
  }
  
  return expectedReturn;
}

/**
 * Test APT model fit
 */
export function testAPTModel(
  returns: number[],
  factors: number[][]
): APTResult {
  const regression = linearRegression(returns, factors);
  const exposures: FactorLoadings = {};
  
  factors[0].forEach((_, idx) => {
    exposures[`factor${idx + 1}`] = regression.coefficients[idx + 1];
  });
  
  const residualRisk = standardDeviation(regression.residuals);
  
  return {
    expectedReturn: regression.coefficients[0],
    factorExposures: exposures,
    residualRisk,
    goodnessOfFit: regression.rSquared
  };
}

// 4. Principal Component Analysis

/**
 * Extract principal components from returns matrix
 */
export function extractPrincipalComponents(
  returns: number[][]
): PCAResult {
  const covMatrix = covarianceMatrix(returns);
  const { eigenvalues, eigenvectors } = eigenDecomposition(covMatrix);
  
  // Sort by eigenvalues in descending order
  const sorted = eigenvalues
    .map((val, idx) => ({ value: val, vector: eigenvectors[idx] }))
    .sort((a, b) => b.value - a.value);
  
  const sortedEigenvalues = sorted.map(s => s.value);
  const sortedEigenvectors = sorted.map(s => s.vector);
  
  const totalVariance = sortedEigenvalues.reduce((sum, val) => sum + val, 0);
  const explainedVariance = sortedEigenvalues.map(val => val / totalVariance);
  const cumulativeVariance = explainedVariance.reduce((acc: number[], val) => {
    acc.push((acc[acc.length - 1] || 0) + val);
    return acc;
  }, []);
  
  // Transform data to principal components
  const principalComponents = returns.map(row =>
    sortedEigenvectors.map(vec =>
      vec.reduce((sum, val, idx) => sum + val * row[idx], 0)
    )
  );
  
  return {
    principalComponents,
    eigenvalues: sortedEigenvalues,
    explainedVariance,
    cumulativeVariance,
    loadings: sortedEigenvectors
  };
}

/**
 * Calculate explained variance from PCA
 */
export function calculateExplainedVariance(eigenvalues: number[]): number[] {
  const total = eigenvalues.reduce((sum, val) => sum + val, 0);
  return eigenvalues.map(val => val / total);
}

/**
 * Varimax rotation for factor interpretation
 */
export function factorRotation(loadings: number[][]): number[][] {
  // Simplified Varimax rotation
  const maxIterations = 100;
  const tolerance = 1e-6;
  let rotated = loadings.map(row => [...row]);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldRotated = rotated.map(row => [...row]);
    
    // Perform rotation (simplified)
    const n = rotated.length;
    const p = rotated[0].length;
    
    for (let i = 0; i < p - 1; i++) {
      for (let j = i + 1; j < p; j++) {
        // Calculate rotation angle
        let a = 0, b = 0, c = 0, d = 0;
        for (let k = 0; k < n; k++) {
          const u = rotated[k][i];
          const v = rotated[k][j];
          a += u * u - v * v;
          b += 2 * u * v;
          c += u * u + v * v;
          d += (u * u - v * v) * (u * u - v * v) - 4 * u * u * v * v;
        }
        
        const theta = Math.atan2(b, a) / 4;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        
        // Apply rotation
        for (let k = 0; k < n; k++) {
          const newI = cos * rotated[k][i] + sin * rotated[k][j];
          const newJ = -sin * rotated[k][i] + cos * rotated[k][j];
          rotated[k][i] = newI;
          rotated[k][j] = newJ;
        }
      }
    }
    
    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        maxDiff = Math.max(maxDiff, Math.abs(rotated[i][j] - oldRotated[i][j]));
      }
    }
    
    if (maxDiff < tolerance) break;
  }
  
  return rotated;
}

// Helper for eigenvalue decomposition (power iteration method)
function eigenDecomposition(matrix: number[][]): {
  eigenvalues: number[];
  eigenvectors: number[][];
} {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  const eigenvectors: number[][] = [];
  
  // Simplified: use power iteration for dominant eigenvalue/vector
  for (let i = 0; i < Math.min(n, 5); i++) {
    let vector = Array(n).fill(0).map(() => Math.random());
    let eigenvalue = 0;
    
    for (let iter = 0; iter < 100; iter++) {
      const newVector = multiplyMatrixVector(matrix, vector);
      eigenvalue = Math.sqrt(newVector.reduce((sum, val) => sum + val * val, 0));
      vector = newVector.map(val => val / eigenvalue);
    }
    
    eigenvalues.push(eigenvalue);
    eigenvectors.push(vector);
    
    // Deflate matrix for next eigenvalue
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        matrix[j][k] -= eigenvalue * vector[j] * vector[k];
      }
    }
  }
  
  return { eigenvalues, eigenvectors };
}

// 5. Risk Factor Decomposition

/**
 * Decompose portfolio risk into factor contributions
 */
export function decomposePortfolioRisk(
  returns: number[],
  factors: number[][],
  factorNames: string[]
): { [factor: string]: number } {
  const regression = linearRegression(returns, factors);
  const portfolioVariance = Math.pow(standardDeviation(returns), 2);
  const contributions: { [factor: string]: number } = {};
  
  // Calculate factor variance contributions
  const factorVariances = factors.map(f => Math.pow(standardDeviation(f), 2));
  
  factorNames.forEach((name, idx) => {
    const beta = regression.coefficients[idx + 1];
    contributions[name] = (beta * beta * factorVariances[idx]) / portfolioVariance;
  });
  
  // Residual contribution
  const residualVar = Math.pow(standardDeviation(regression.residuals), 2);
  contributions['residual'] = residualVar / portfolioVariance;
  
  return contributions;
}

/**
 * Calculate factor contribution to variance
 */
export function calculateFactorContribution(
  factorLoadings: FactorLoadings,
  factorCovariance: number[][]
): { [factor: string]: number } {
  const contributions: { [factor: string]: number } = {};
  const factors = Object.keys(factorLoadings).filter(k => k !== 'alpha');
  
  factors.forEach((factor, i) => {
    const loading = factorLoadings[factor];
    let contribution = 0;
    
    factors.forEach((otherFactor, j) => {
      contribution += loading * factorLoadings[otherFactor] * factorCovariance[i][j];
    });
    
    contributions[factor] = contribution;
  });
  
  return contributions;
}

/**
 * Calculate marginal factor contribution
 */
export function marginalFactorContribution(
  weights: number[],
  factorLoadings: number[][],
  factorCovariance: number[][]
): number[] {
  const portfolioLoadings = weights.map((w, i) =>
    factorLoadings[i].reduce((sum, loading, j) => sum + w * loading, 0)
  );
  
  return weights.map((_, i) =>
    factorLoadings[i].reduce((sum, loading, j) =>
      sum + loading * portfolioLoadings[j] * factorCovariance[i][j], 0
    )
  );
}

// 6. Style Analysis

/**
 * Return-based style analysis (Sharpe)
 */
export function returnBasedStyleAnalysis(
  fundReturns: number[],
  styleReturns: { [style: string]: number[] }
): StyleAnalysis {
  const styles = Object.keys(styleReturns);
  const factors = styles.map(style => styleReturns[style]);
  const transposed = factors[0].map((_, idx) => factors.map(f => f[idx]));
  
  const regression = linearRegression(fundReturns, transposed);
  
  // Constrained to sum to 1 and non-negative (simplified)
  let weights = regression.coefficients.slice(1).map(w => Math.max(0, w));
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  weights = weights.map(w => w / sumWeights);
  
  const styleWeights: { [style: string]: number } = {};
  styles.forEach((style, idx) => {
    styleWeights[style] = weights[idx];
  });
  
  // Calculate tracking error
  const fitted = fundReturns.map((_, idx) =>
    styles.reduce((sum, style, i) => sum + styleWeights[style] * styleReturns[style][idx], 0)
  );
  const trackingErrors = fundReturns.map((ret, idx) => ret - fitted[idx]);
  const trackingError = standardDeviation(trackingErrors);
  
  return {
    styleWeights,
    rSquared: regression.rSquared,
    trackingError
  };
}

/**
 * Holdings-based style analysis
 */
export function holdingsBasedStyleAnalysis(
  holdings: { [asset: string]: number },
  assetCharacteristics: { [asset: string]: { [char: string]: number } }
): { [char: string]: number } {
  const characteristics: { [char: string]: number } = {};
  const charNames = Object.keys(Object.values(assetCharacteristics)[0]);
  
  charNames.forEach(char => {
    characteristics[char] = Object.entries(holdings).reduce(
      (sum, [asset, weight]) =>
        sum + weight * (assetCharacteristics[asset]?.[char] || 0),
      0
    );
  });
  
  return characteristics;
}

/**
 * Classify investment style based on characteristics
 */
export function classifyInvestmentStyle(
  characteristics: { [char: string]: number }
): string {
  const { size, value, growth, momentum } = characteristics;
  
  if (size < 0) {
    if (value > 0) return 'Small Value';
    if (growth > 0) return 'Small Growth';
    return 'Small Blend';
  } else {
    if (value > 0) return 'Large Value';
    if (growth > 0) return 'Large Growth';
    return 'Large Blend';
  }
}

// 7. Smart Beta Strategies

/**
 * Value-weighted portfolio construction
 */
export function valueWeightedPortfolio(
  assets: string[],
  valuations: { [asset: string]: number }
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const totalValue = Object.values(valuations).reduce((sum, val) => sum + val, 0);
  
  assets.forEach(asset => {
    weights[asset] = valuations[asset] / totalValue;
  });
  
  return weights;
}

/**
 * Momentum-weighted portfolio construction
 */
export function momentumWeightedPortfolio(
  assets: string[],
  returns: { [asset: string]: number[] },
  lookbackPeriod: number = 12
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const momentumScores: { [asset: string]: number } = {};
  
  assets.forEach(asset => {
    const assetReturns = returns[asset].slice(-lookbackPeriod);
    momentumScores[asset] = assetReturns.reduce((prod, ret) => prod * (1 + ret), 1) - 1;
  });
  
  const totalMomentum = Object.values(momentumScores)
    .filter(m => m > 0)
    .reduce((sum, m) => sum + m, 0);
  
  assets.forEach(asset => {
    weights[asset] = Math.max(0, momentumScores[asset]) / totalMomentum;
  });
  
  return weights;
}

/**
 * Quality-weighted portfolio construction
 */
export function qualityWeightedPortfolio(
  assets: string[],
  qualityScores: { [asset: string]: number }
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const totalQuality = Object.values(qualityScores).reduce((sum, q) => sum + q, 0);
  
  assets.forEach(asset => {
    weights[asset] = qualityScores[asset] / totalQuality;
  });
  
  return weights;
}

/**
 * Low volatility portfolio construction
 */
export function lowVolatilityPortfolio(
  assets: string[],
  returns: { [asset: string]: number[] }
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const volatilities: { [asset: string]: number } = {};
  
  assets.forEach(asset => {
    volatilities[asset] = standardDeviation(returns[asset]);
  });
  
  // Inverse volatility weighting
  const inverseVols = Object.entries(volatilities).map(([asset, vol]) => ({
    asset,
    inverseVol: 1 / vol
  }));
  
  const totalInverseVol = inverseVols.reduce((sum, { inverseVol }) => sum + inverseVol, 0);
  
  inverseVols.forEach(({ asset, inverseVol }) => {
    weights[asset] = inverseVol / totalInverseVol;
  });
  
  return weights;
}

/**
 * Multi-factor portfolio combining multiple factors
 */
export function multiFactorPortfolio(
  assets: string[],
  factorScores: { [asset: string]: { [factor: string]: number } },
  factorWeights: { [factor: string]: number }
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const compositeScores: { [asset: string]: number } = {};
  
  assets.forEach(asset => {
    compositeScores[asset] = Object.entries(factorWeights).reduce(
      (sum, [factor, weight]) =>
        sum + weight * (factorScores[asset]?.[factor] || 0),
      0
    );
  });
  
  const totalScore = Object.values(compositeScores)
    .filter(s => s > 0)
    .reduce((sum, s) => sum + s, 0);
  
  assets.forEach(asset => {
    weights[asset] = Math.max(0, compositeScores[asset]) / totalScore;
  });
  
  return weights;
}

// 8. Factor Timing

/**
 * Predict factor returns using historical patterns
 */
export function predictFactorReturns(
  factorData: number[][],
  horizon: number = 12
): number[] {
  // Simple implementation using historical averages
  const numFactors = factorData[0].length;
  const predictions: number[] = [];
  
  for (let i = 0; i < numFactors; i++) {
    const factorValues = factorData.map(row => row[i]);
    const avg = factorValues.reduce((sum, val) => sum + val, 0) / factorValues.length;
    predictions.push(avg);
  }
  
  return predictions;
}

// Export aliases for consistency with imports
export const calculateFamaFrench3Factor = calculateThreeFactorModel;
export const calculateFamaFrench5Factor = calculateFiveFactorModel;
export const calculateCarhartMomentum = calculateFourFactorModel;
export const performPCA = extractPrincipalComponents;
export const analyzeStyle = returnBasedStyleAnalysis;
export const predictFactorPremiums = predictFactorReturns;
export const styleAnalysis = returnBasedStyleAnalysis;

// 9. Risk Parity

/**
 * Calculate risk parity portfolio weights
 */
export function calculateRiskParityWeights(
  assets: string[],
  covarianceMatrix: number[][]
): PortfolioWeights {
  const n = assets.length;
  const weights: PortfolioWeights = {};
  
  // Initialize with equal weights
  let w = Array(n).fill(1 / n);
  
  // Iterative optimization to equalize risk contributions
  const maxIterations = 100;
  const tolerance = 1e-6;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldWeights = [...w];
    
    // Calculate marginal risk contributions
    const portfolioRisk = Math.sqrt(
      w.reduce((sum, wi, i) =>
        sum + w.reduce((s, wj, j) => s + wi * wj * covarianceMatrix[i][j], 0),
        0
      )
    );
    
    const marginalRisks = w.map((_, i) =>
      w.reduce((sum, wj, j) => sum + wj * covarianceMatrix[i][j], 0) / portfolioRisk
    );
    
    // Update weights to equalize risk contributions
    const targetRisk = portfolioRisk / n;
    w = w.map((wi, i) => wi * targetRisk / (wi * marginalRisks[i]));
    
    // Normalize
    const sumW = w.reduce((sum, wi) => sum + wi, 0);
    w = w.map(wi => wi / sumW);
    
    // Check convergence
    const maxChange = Math.max(...w.map((wi, i) => Math.abs(wi - oldWeights[i])));
    if (maxChange < tolerance) break;
  }
  
  assets.forEach((asset, i) => {
    weights[asset] = w[i];
  });
  
  return weights;
}

// 10. Performance Attribution

/**
 * Calculate performance attribution
 */
export function performanceAttribution(
  portfolioWeights: PortfolioWeights,
  benchmarkWeights: PortfolioWeights,
  portfolioReturns: { [asset: string]: number },
  benchmarkReturns: { [asset: string]: number }
): PerformanceAttribution {
  const assets = Object.keys(portfolioWeights);
  
  let allocationEffect = 0;
  let selectionEffect = 0;
  let interactionEffect = 0;
  
  assets.forEach(asset => {
    const pw = portfolioWeights[asset] || 0;
    const bw = benchmarkWeights[asset] || 0;
    const pr = portfolioReturns[asset] || 0;
    const br = benchmarkReturns[asset] || 0;
    
    // Allocation effect: (portfolio weight - benchmark weight) * benchmark return
    allocationEffect += (pw - bw) * br;
    
    // Selection effect: benchmark weight * (portfolio return - benchmark return)
    selectionEffect += bw * (pr - br);
    
    // Interaction effect: (portfolio weight - benchmark weight) * (portfolio return - benchmark return)
    interactionEffect += (pw - bw) * (pr - br);
  });
  
  const totalReturn = allocationEffect + selectionEffect + interactionEffect;
  
  return {
    totalReturn,
    allocationEffect,
    selectionEffect,
    interactionEffect
  };
}

// 11. Factor-Based Portfolio Construction

/**
 * Build factor-tilted portfolio
 */
export function buildFactorTiltedPortfolio(
  assets: string[],
  factorExposures: { [asset: string]: FactorLoadings },
  targetFactorTilts: { [factor: string]: number },
  constraints?: { minWeight?: number; maxWeight?: number }
): PortfolioWeights {
  const weights: PortfolioWeights = {};
  const scores: { [asset: string]: number } = {};
  
  // Calculate composite scores based on factor tilts
  assets.forEach(asset => {
    scores[asset] = Object.entries(targetFactorTilts).reduce(
      (sum, [factor, tilt]) => {
        const exposure = factorExposures[asset]?.[factor] || 0;
        return sum + tilt * exposure;
      },
      0
    );
  });
  
  // Apply constraints
  const minWeight = constraints?.minWeight || 0;
  const maxWeight = constraints?.maxWeight || 1;
  
  // Normalize positive scores
  const positiveScores = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .map(([asset, score]) => ({ asset, score }));
  
  const totalScore = positiveScores.reduce((sum, { score }) => sum + score, 0);
  
  if (totalScore > 0) {
    positiveScores.forEach(({ asset, score }) => {
      weights[asset] = Math.max(minWeight, Math.min(maxWeight, score / totalScore));
    });
    
    // Renormalize after applying constraints
    const sumWeights = Object.values(weights).reduce((sum, w) => sum + w, 0);
    Object.keys(weights).forEach(asset => {
      weights[asset] /= sumWeights;
    });
  } else {
    // Equal weight if no positive scores
    const equalWeight = 1 / assets.length;
    assets.forEach(asset => {
      weights[asset] = equalWeight;
    });
  }
  
  return weights;
}

/**
 * Build portfolio optimized for Fama-French 3-Factor model
 */
export function buildFamaFrench3Factor(
  assets: string[],
  factorExposures: { [asset: string]: { market: number; smb: number; hml: number } },
  targetExposures: { market: number; smb: number; hml: number }
): PortfolioWeights {
  const factorLoadings: { [asset: string]: FactorLoadings } = {};
  
  assets.forEach(asset => {
    factorLoadings[asset] = {
      market: factorExposures[asset].market,
      smb: factorExposures[asset].smb,
      hml: factorExposures[asset].hml
    };
  });
  
  return buildFactorTiltedPortfolio(assets, factorLoadings, targetExposures);
}

/**
 * Build portfolio optimized for Fama-French 5-Factor model
 */
export function buildFamaFrench5Factor(
  assets: string[],
  factorExposures: { [asset: string]: { market: number; smb: number; hml: number; rmw: number; cma: number } },
  targetExposures: { market: number; smb: number; hml: number; rmw: number; cma: number }
): PortfolioWeights {
  const factorLoadings: { [asset: string]: FactorLoadings } = {};
  
  assets.forEach(asset => {
    factorLoadings[asset] = {
      market: factorExposures[asset].market,
      smb: factorExposures[asset].smb,
      hml: factorExposures[asset].hml,
      rmw: factorExposures[asset].rmw,
      cma: factorExposures[asset].cma
    };
  });
  
  return buildFactorTiltedPortfolio(assets, factorLoadings, targetExposures);
}

/**
 * Build portfolio optimized for Carhart 4-Factor model
 */
export function buildCarhart4Factor(
  assets: string[],
  factorExposures: { [asset: string]: { market: number; smb: number; hml: number; umd: number } },
  targetExposures: { market: number; smb: number; hml: number; umd: number }
): PortfolioWeights {
  const factorLoadings: { [asset: string]: FactorLoadings } = {};
  
  assets.forEach(asset => {
    factorLoadings[asset] = {
      market: factorExposures[asset].market,
      smb: factorExposures[asset].smb,
      hml: factorExposures[asset].hml,
      umd: factorExposures[asset].umd
    };
  });
  
  return buildFactorTiltedPortfolio(assets, factorLoadings, targetExposures);
}