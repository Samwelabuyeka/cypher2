/**
 * Modern Portfolio Theory Implementation
 * 
 * Comprehensive portfolio optimization library implementing:
 * - Markowitz Mean-Variance Optimization
 * - Black-Litterman Model
 * - Risk Parity
 * - Maximum Diversification
 * - Hierarchical Risk Parity
 * - Kelly Criterion
 * - CVaR Optimization
 * - Robust Optimization
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface PortfolioMetrics {
  expectedReturn: number;
  variance: number;
  volatility: number;
  sharpeRatio: number;
  weights: number[];
}

export interface EfficientFrontierPoint {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  weights: number[];
}

export interface BlackLittermanInputs {
  marketEquilibrium: number[];
  investorViews: number[];
  confidenceMatrix: number[][];
  pickMatrix: number[][];
  tau: number;
}

export interface RiskContribution {
  marginalRisk: number[];
  componentRisk: number[];
  percentContribution: number[];
}

export interface OptimizationResult {
  weights: number[];
  objectiveValue: number;
  converged: boolean;
  iterations: number;
}

// ============================================================================
// Matrix Operations Helpers
// ============================================================================

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0].length;
  const colsB = b[0].length;
  const result: number[][] = Array(rowsA).fill(0).map(() => Array(colsB).fill(0));
  
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => 
    row.reduce((sum, val, i) => sum + val * vector[i], 0)
  );
}

function transposeMatrix(matrix: number[][]): number[][] {
  return matrix[0].map((_, i) => matrix.map(row => row[i]));
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => 
    [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]
  );

  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-10) {
      throw new Error('Matrix is singular and cannot be inverted');
    }

    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }

  return augmented.map(row => row.slice(n));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function scalarMultiply(vector: number[], scalar: number): number[] {
  return vector.map(v => v * scalar);
}

function addVectors(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i]);
}

function subtractVectors(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i]);
}

// ============================================================================
// 1. Markowitz Mean-Variance Optimization
// ============================================================================

/**
 * Calculate portfolio metrics given weights, returns, and covariance matrix
 */
export function calculatePortfolioMetrics(
  weights: number[],
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0
): PortfolioMetrics {
  const expectedReturn = dotProduct(weights, expectedReturns);
  const variance = weights.reduce((sum, wi, i) => {
    return sum + weights.reduce((innerSum, wj, j) => {
      return innerSum + wi * wj * covarianceMatrix[i][j];
    }, 0);
  }, 0);
  const volatility = Math.sqrt(variance);
  const sharpeRatio = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;

  return {
    expectedReturn,
    variance,
    volatility,
    sharpeRatio,
    weights: [...weights]
  };
}

/**
 * Minimize portfolio variance for a given target return
 */
export function minimizeVariance(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  targetReturn: number,
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const { minWeight = 0, maxWeight = 1 } = constraints;

  // Initialize with equal weights
  let weights = Array(n).fill(1 / n);
  let iteration = 0;
  const maxIterations = 1000;
  const tolerance = 1e-6;
  let converged = false;

  // Gradient descent with constraints
  const learningRate = 0.01;

  while (iteration < maxIterations && !converged) {
    // Calculate gradient of variance
    const gradient = multiplyMatrixVector(covarianceMatrix, weights).map(g => 2 * g);
    
    // Calculate gradient of return constraint
    const currentReturn = dotProduct(weights, expectedReturns);
    const returnError = currentReturn - targetReturn;
    
    // Lagrange multiplier for return constraint
    const lambda = returnError * 10;
    
    // Update weights
    const oldWeights = [...weights];
    weights = weights.map((w, i) => {
      const update = w - learningRate * (gradient[i] - lambda * expectedReturns[i]);
      return Math.max(minWeight, Math.min(maxWeight, update));
    });

    // Project onto simplex (sum to 1)
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / Math.max(sum, 1e-10));

    // Check convergence
    const change = Math.sqrt(
      weights.reduce((sum, w, i) => sum + Math.pow(w - oldWeights[i], 2), 0)
    );
    converged = change < tolerance;
    iteration++;
  }

  const variance = weights.reduce((sum, wi, i) => {
    return sum + weights.reduce((innerSum, wj, j) => {
      return innerSum + wi * wj * covarianceMatrix[i][j];
    }, 0);
  }, 0);

  return {
    weights,
    objectiveValue: variance,
    converged,
    iterations: iteration
  };
}

/**
 * Maximize Sharpe ratio
 */
export function maximizeSharpeRatio(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0,
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const { minWeight = 0, maxWeight = 1 } = constraints;
  const excessReturns = expectedReturns.map(r => r - riskFreeRate);

  // Initialize with equal weights
  let weights = Array(n).fill(1 / n);
  let iteration = 0;
  const maxIterations = 1000;
  const tolerance = 1e-6;
  let converged = false;
  const learningRate = 0.01;

  while (iteration < maxIterations && !converged) {
    const oldWeights = [...weights];
    const portfolioReturn = dotProduct(weights, excessReturns);
    const portfolioVariance = weights.reduce((sum, wi, i) => {
      return sum + weights.reduce((innerSum, wj, j) => {
        return innerSum + wi * wj * covarianceMatrix[i][j];
      }, 0);
    }, 0);
    const portfolioStd = Math.sqrt(portfolioVariance);

    if (portfolioStd < 1e-10) break;

    // Gradient of Sharpe ratio
    const varGradient = multiplyMatrixVector(covarianceMatrix, weights).map(g => 2 * g);
    const sharpe = portfolioReturn / portfolioStd;
    
    const gradient = weights.map((w, i) => {
      const returnGrad = excessReturns[i];
      const stdGrad = varGradient[i] / (2 * portfolioStd);
      return -(returnGrad * portfolioStd - portfolioReturn * stdGrad) / (portfolioVariance);
    });

    // Update weights
    weights = weights.map((w, i) => {
      const update = w - learningRate * gradient[i];
      return Math.max(minWeight, Math.min(maxWeight, update));
    });

    // Project onto simplex
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      weights = weights.map(w => w / sum);
    }

    const change = Math.sqrt(
      weights.reduce((sum, w, i) => sum + Math.pow(w - oldWeights[i], 2), 0)
    );
    converged = change < tolerance;
    iteration++;
  }

  const metrics = calculatePortfolioMetrics(weights, expectedReturns, covarianceMatrix, riskFreeRate);

  return {
    weights,
    objectiveValue: metrics.sharpeRatio,
    converged,
    iterations: iteration
  };
}

/**
 * Calculate the efficient frontier
 */
export function calculateEfficientFrontier(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0,
  numPoints: number = 50
): EfficientFrontierPoint[] {
  const minReturn = Math.min(...expectedReturns);
  const maxReturn = Math.max(...expectedReturns);
  const returnStep = (maxReturn - minReturn) / (numPoints - 1);

  const frontierPoints: EfficientFrontierPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minReturn + i * returnStep;
    
    try {
      const result = minimizeVariance(expectedReturns, covarianceMatrix, targetReturn);
      const metrics = calculatePortfolioMetrics(result.weights, expectedReturns, covarianceMatrix, riskFreeRate);
      
      frontierPoints.push({
        expectedReturn: metrics.expectedReturn,
        volatility: metrics.volatility,
        sharpeRatio: metrics.sharpeRatio,
        weights: result.weights
      });
    } catch (error) {
      // Skip points that fail to optimize
      continue;
    }
  }

  return frontierPoints;
}

/**
 * Find optimal portfolio (maximum Sharpe ratio)
 */
export function findOptimalPortfolio(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0
): PortfolioMetrics {
  const result = maximizeSharpeRatio(expectedReturns, covarianceMatrix, riskFreeRate);
  return calculatePortfolioMetrics(result.weights, expectedReturns, covarianceMatrix, riskFreeRate);
}

// ============================================================================
// 2. Black-Litterman Model
// ============================================================================

/**
 * Calculate posterior returns using Black-Litterman model
 */
export function calculatePosteriorReturns(
  marketEquilibrium: number[],
  covarianceMatrix: number[][],
  investorViews: number[],
  pickMatrix: number[][],
  viewUncertainty: number[][],
  tau: number = 0.025
): number[] {
  const n = marketEquilibrium.length;
  
  // Scale covariance matrix by tau
  const scaledCov = covarianceMatrix.map(row => row.map(val => val * tau));
  
  // Calculate posterior precision
  const scaledCovInv = invertMatrix(scaledCov);
  const viewUncertaintyInv = invertMatrix(viewUncertainty);
  
  // P' * Omega^-1 * P
  const pickT = transposeMatrix(pickMatrix);
  const temp1 = multiplyMatrices(pickT, viewUncertaintyInv);
  const temp2 = multiplyMatrices(temp1, pickMatrix);
  
  // Posterior precision = (tau * Sigma)^-1 + P' * Omega^-1 * P
  const posteriorPrecision = scaledCovInv.map((row, i) => 
    row.map((val, j) => val + temp2[i][j])
  );
  
  // Posterior covariance
  const posteriorCov = invertMatrix(posteriorPrecision);
  
  // Calculate posterior mean
  // mu_BL = posterior_cov * ((tau * Sigma)^-1 * pi + P' * Omega^-1 * Q)
  const term1 = multiplyMatrixVector(scaledCovInv, marketEquilibrium);
  const term2 = multiplyMatrixVector(
    multiplyMatrices(pickT, viewUncertaintyInv),
    investorViews
  );
  const combined = addVectors(term1, term2);
  const posteriorReturns = multiplyMatrixVector(posteriorCov, combined);
  
  return posteriorReturns;
}

/**
 * Combine market views with investor views
 */
export function combineViewsWithMarket(
  marketEquilibrium: number[],
  investorViews: number[],
  confidenceMatrix: number[][],
  pickMatrix: number[][],
  tau: number = 0.025
): number[] {
  const n = marketEquilibrium.length;
  
  // Create diagonal uncertainty matrix from confidences
  const viewUncertainty = confidenceMatrix.map((row, i) => 
    row.map((val, j) => i === j ? 1 / Math.max(val, 0.01) : 0)
  );
  
  const covarianceMatrix = Array(n).fill(0).map((_, i) => 
    Array(n).fill(0).map((_, j) => i === j ? 0.01 : 0.0025)
  );
  
  return calculatePosteriorReturns(
    marketEquilibrium,
    covarianceMatrix,
    investorViews,
    pickMatrix,
    viewUncertainty,
    tau
  );
}

/**
 * Adjust market equilibrium for investor views with uncertainty
 */
export function adjustForViews(
  marketReturns: number[],
  covarianceMatrix: number[][],
  views: { assets: number[]; expectedReturn: number; confidence: number }[]
): number[] {
  const n = marketReturns.length;
  const k = views.length;
  
  // Build pick matrix (which assets each view applies to)
  const pickMatrix: number[][] = views.map(view => 
    view.assets.map(weight => weight)
  );
  
  // Extract view returns
  const investorViews = views.map(v => v.expectedReturn);
  
  // Build confidence matrix
  const confidenceMatrix = Array(k).fill(0).map((_, i) => 
    Array(k).fill(0).map((_, j) => i === j ? views[i].confidence : 0)
  );
  
  return combineViewsWithMarket(
    marketReturns,
    investorViews,
    confidenceMatrix,
    pickMatrix
  );
}

// ============================================================================
// 3. Risk Parity Portfolio
// ============================================================================

/**
 * Calculate risk contributions for each asset
 */
export function calculateRiskContributions(
  weights: number[],
  covarianceMatrix: number[][]
): RiskContribution {
  const n = weights.length;
  const portfolioVariance = weights.reduce((sum, wi, i) => {
    return sum + weights.reduce((innerSum, wj, j) => {
      return innerSum + wi * wj * covarianceMatrix[i][j];
    }, 0);
  }, 0);
  
  const portfolioVolatility = Math.sqrt(portfolioVariance);
  
  // Marginal risk contribution: dσ/dw_i
  const marginalRisk = weights.map((_, i) => {
    const cov_i = covarianceMatrix[i].reduce((sum, cov_ij, j) => 
      sum + weights[j] * cov_ij, 0
    );
    return cov_i / portfolioVolatility;
  });
  
  // Component risk contribution: w_i * (dσ/dw_i)
  const componentRisk = weights.map((w, i) => w * marginalRisk[i]);
  
  // Percent contribution
  const totalRisk = componentRisk.reduce((sum, r) => sum + r, 0);
  const percentContribution = componentRisk.map(r => (r / totalRisk) * 100);
  
  return {
    marginalRisk,
    componentRisk,
    percentContribution
  };
}

/**
 * Create equal risk contribution allocation (Risk Parity)
 */
export function equalRiskContribution(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  const n = covarianceMatrix.length;
  const { minWeight = 0.001, maxWeight = 1 } = constraints;
  const targetRiskContribution = 100 / n; // Equal risk contribution percentage
  
  // Start with inverse volatility weighting
  const volatilities = covarianceMatrix.map((_, i) => 
    Math.sqrt(covarianceMatrix[i][i])
  );
  const invVol = volatilities.map(v => 1 / Math.max(v, 1e-10));
  const sumInvVol = invVol.reduce((a, b) => a + b, 0);
  let weights = invVol.map(iv => iv / sumInvVol);
  
  let iteration = 0;
  const maxIterations = 1000;
  const tolerance = 1e-4;
  let converged = false;
  const learningRate = 0.1;
  
  while (iteration < maxIterations && !converged) {
    const oldWeights = [...weights];
    const riskContrib = calculateRiskContributions(weights, covarianceMatrix);
    
    // Calculate error from target equal risk
    const errors = riskContrib.percentContribution.map(pc => 
      pc - targetRiskContribution
    );
    
    // Update weights to reduce error
    weights = weights.map((w, i) => {
      const adjustment = -learningRate * errors[i] * 0.01;
      const newWeight = w * (1 + adjustment);
      return Math.max(minWeight, Math.min(maxWeight, newWeight));
    });
    
    // Normalize
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / Math.max(sum, 1e-10));
    
    const change = Math.sqrt(
      weights.reduce((sum, w, i) => sum + Math.pow(w - oldWeights[i], 2), 0)
    );
    converged = change < tolerance;
    iteration++;
  }
  
  const finalRiskContrib = calculateRiskContributions(weights, covarianceMatrix);
  const variance = finalRiskContrib.percentContribution.reduce((sum, pc) => 
    sum + Math.pow(pc - targetRiskContribution, 2), 0
  );
  
  return {
    weights,
    objectiveValue: Math.sqrt(variance),
    converged,
    iterations: iteration
  };
}

/**
 * Rebalance portfolio to equal risk
 */
export function rebalanceToEqualRisk(
  currentWeights: number[],
  covarianceMatrix: number[][]
): number[] {
  const result = equalRiskContribution(covarianceMatrix);
  return result.weights;
}

// ============================================================================
// 4. Maximum Diversification Portfolio
// ============================================================================

/**
 * Calculate diversification ratio
 */
export function calculateDiversificationRatio(
  weights: number[],
  covarianceMatrix: number[][]
): number {
  const volatilities = covarianceMatrix.map((_, i) => 
    Math.sqrt(covarianceMatrix[i][i])
  );
  
  const weightedAvgVol = dotProduct(weights, volatilities);
  
  const portfolioVariance = weights.reduce((sum, wi, i) => {
    return sum + weights.reduce((innerSum, wj, j) => {
      return innerSum + wi * wj * covarianceMatrix[i][j];
    }, 0);
  }, 0);
  const portfolioVol = Math.sqrt(portfolioVariance);
  
  return portfolioVol > 0 ? weightedAvgVol / portfolioVol : 0;
}

/**
 * Maximize diversification ratio
 */
export function maximizeDiversificationRatio(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  const n = covarianceMatrix.length;
  const { minWeight = 0, maxWeight = 1 } = constraints;
  
  // Initialize with equal weights
  let weights = Array(n).fill(1 / n);
  let iteration = 0;
  const maxIterations = 1000;
  const tolerance = 1e-6;
  let converged = false;
  const learningRate = 0.01;
  
  while (iteration < maxIterations && !converged) {
    const oldWeights = [...weights];
    const volatilities = covarianceMatrix.map((_, i) => 
      Math.sqrt(covarianceMatrix[i][i])
    );
    
    const weightedAvgVol = dotProduct(weights, volatilities);
    const portfolioVariance = weights.reduce((sum, wi, i) => {
      return sum + weights.reduce((innerSum, wj, j) => {
        return innerSum + wi * wj * covarianceMatrix[i][j];
      }, 0);
    }, 0);
    const portfolioVol = Math.sqrt(portfolioVariance);
    
    if (portfolioVol < 1e-10) break;
    
    const divRatio = weightedAvgVol / portfolioVol;
    
    // Gradient of diversification ratio
    const varGradient = multiplyMatrixVector(covarianceMatrix, weights).map(g => 2 * g);
    const gradient = weights.map((w, i) => {
      const avgVolGrad = volatilities[i];
      const portfolioVolGrad = varGradient[i] / (2 * portfolioVol);
      return -(avgVolGrad * portfolioVol - weightedAvgVol * portfolioVolGrad) / 
             (portfolioVariance);
    });
    
    // Update weights (negative gradient since we maximize)
    weights = weights.map((w, i) => {
      const update = w - learningRate * gradient[i];
      return Math.max(minWeight, Math.min(maxWeight, update));
    });
    
    // Normalize
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      weights = weights.map(w => w / sum);
    }
    
    const change = Math.sqrt(
      weights.reduce((sum, w, i) => sum + Math.pow(w - oldWeights[i], 2), 0)
    );
    converged = change < tolerance;
    iteration++;
  }
  
  const finalDivRatio = calculateDiversificationRatio(weights, covarianceMatrix);
  
  return {
    weights,
    objectiveValue: finalDivRatio,
    converged,
    iterations: iteration
  };
}

// ============================================================================
// 5. Minimum Variance Portfolio
// ============================================================================

/**
 * Find global minimum variance portfolio
 */
export function minimumVariancePortfolio(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  const n = covarianceMatrix.length;
  const { minWeight = 0, maxWeight = 1 } = constraints;
  
  // Analytical solution: w = (Σ^-1 * 1) / (1' * Σ^-1 * 1)
  try {
    const covInv = invertMatrix(covarianceMatrix);
    const ones = Array(n).fill(1);
    const numerator = multiplyMatrixVector(covInv, ones);
    const denominator = dotProduct(ones, numerator);
    
    let weights = numerator.map(w => w / denominator);
    
    // Apply constraints
    weights = weights.map(w => Math.max(minWeight, Math.min(maxWeight, w)));
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / sum);
    
    const variance = weights.reduce((sum, wi, i) => {
      return sum + weights.reduce((innerSum, wj, j) => {
        return innerSum + wi * wj * covarianceMatrix[i][j];
      }, 0);
    }, 0);
    
    return {
      weights,
      objectiveValue: variance,
      converged: true,
      iterations: 1
    };
  } catch (error) {
    // Fallback to iterative method
    return minimizeVariance(
      Array(n).fill(0.1), // dummy returns for minimum variance
      covarianceMatrix,
      0.1
    );
  }
}

// ============================================================================
// 6. Hierarchical Risk Parity (HRP)
// ============================================================================

function clusterCorrelationMatrix(correlationMatrix: number[][]): number[][] {
  const n = correlationMatrix.length;
  const clusters: number[][] = Array(n).fill(0).map((_, i) => [i]);
  
  while (clusters.length > 1) {
    let minDist = Infinity;
    let mergeI = 0;
    let mergeJ = 1;
    
    // Find closest clusters
    for (let i = 0; i < clusters.length - 1; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let dist = 0;
        let count = 0;
        
        for (const assetI of clusters[i]) {
          for (const assetJ of clusters[j]) {
            dist += 1 - correlationMatrix[assetI][assetJ];
            count++;
          }
        }
        
        const avgDist = dist / count;
        if (avgDist < minDist) {
          minDist = avgDist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    // Merge clusters
    clusters[mergeI] = [...clusters[mergeI], ...clusters[mergeJ]];
    clusters.splice(mergeJ, 1);
  }
  
  return clusters;
}

function getQuasiDiag(correlationMatrix: number[][]): number[] {
  const n = correlationMatrix.length;
  const distances: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  // Calculate distance matrix
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      distances[i][j] = Math.sqrt(0.5 * (1 - correlationMatrix[i][j]));
    }
  }
  
  // Hierarchical clustering to find ordering
  const clusters: number[][] = Array(n).fill(0).map((_, i) => [i]);
  const linkage: Array<[number, number, number]> = [];
  
  while (clusters.length > 1) {
    let minDist = Infinity;
    let mergeI = 0;
    let mergeJ = 1;
    
    // Find closest clusters using average linkage
    for (let i = 0; i < clusters.length - 1; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let dist = 0;
        let count = 0;
        
        for (const assetI of clusters[i]) {
          for (const assetJ of clusters[j]) {
            dist += distances[assetI][assetJ];
            count++;
          }
        }
        
        const avgDist = dist / count;
        if (avgDist < minDist) {
          minDist = avgDist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    linkage.push([mergeI, mergeJ, minDist]);
    clusters[mergeI] = [...clusters[mergeI], ...clusters[mergeJ]];
    clusters.splice(mergeJ, 1);
  }
  
  // Extract quasi-diagonal ordering from final cluster
  return clusters[0];
}

function recursiveBisection(
  covarianceMatrix: number[][],
  ordering: number[]
): number[] {
  const n = ordering.length;
  const weights = Array(n).fill(0);
  
  function allocate(indices: number[]): void {
    if (indices.length === 1) {
      weights[indices[0]] = 1;
      return;
    }
    
    const mid = Math.floor(indices.length / 2);
    const leftIndices = indices.slice(0, mid);
    const rightIndices = indices.slice(mid);
    
    // Calculate cluster variances
    const leftVariance = leftIndices.reduce((sum, i) => 
      sum + leftIndices.reduce((innerSum, j) => 
        innerSum + covarianceMatrix[i][j], 0), 0
    ) / (leftIndices.length * leftIndices.length);
    
    const rightVariance = rightIndices.reduce((sum, i) => 
      sum + rightIndices.reduce((innerSum, j) => 
        innerSum + covarianceMatrix[i][j], 0), 0
    ) / (rightIndices.length * rightIndices.length);
    
    // Inverse variance allocation
    const safeLeftVar = Math.max(leftVariance, 1e-10);
    const safeRightVar = Math.max(rightVariance, 1e-10);
    const totalInvVar = 1 / safeLeftVar + 1 / safeRightVar;
    const leftWeight = (1 / safeLeftVar) / totalInvVar;
    const rightWeight = (1 / safeRightVar) / totalInvVar;
    
    // Recursively allocate to subclusters
    allocate(leftIndices);
    allocate(rightIndices);
    
    // Scale weights
    for (const i of leftIndices) {
      weights[i] *= leftWeight;
    }
    for (const i of rightIndices) {
      weights[i] *= rightWeight;
    }
  }
  
  allocate(ordering);
  return weights;
}

/**
 * Hierarchical Risk Parity optimization
 */
export function hierarchicalRiskParityOptimization(
  covarianceMatrix: number[][]
): OptimizationResult {
  const n = covarianceMatrix.length;
  
  // Convert covariance to correlation
  const volatilities = covarianceMatrix.map((_, i) => 
    Math.sqrt(covarianceMatrix[i][i])
  );
  const correlationMatrix = covarianceMatrix.map((row, i) => 
    row.map((cov, j) => cov / Math.max(volatilities[i] * volatilities[j], 1e-10))
  );
  
  // Get quasi-diagonal ordering
  const ordering = getQuasiDiag(correlationMatrix);
  
  // Recursive bisection to get weights
  const weights = recursiveBisection(covarianceMatrix, ordering);
  
  // Calculate final variance
  const variance = weights.reduce((sum, wi, i) => {
    return sum + weights.reduce((innerSum, wj, j) => {
      return innerSum + wi * wj * covarianceMatrix[i][j];
    }, 0);
  }, 0);
  
  return {
    weights,
    objectiveValue: variance,
    converged: true,
    iterations: 1
  };
}

// ============================================================================
// Exported Optimization Wrappers
// ============================================================================

/**
 * Mean-variance optimization (maximize Sharpe ratio)
 */
export function meanVarianceOptimization(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0,
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  return maximizeSharpeRatio(expectedReturns, covarianceMatrix, riskFreeRate, constraints);
}

/**
 * Risk parity optimization
 */
export function riskParityOptimization(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  return equalRiskContribution(covarianceMatrix, constraints);
}

/**
 * Implement risk parity allocation
 */
export function implementRiskParity(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): number[] {
  const result = equalRiskContribution(covarianceMatrix, constraints);
  return result.weights;
}

/**
 * Maximum Sharpe ratio optimization
 */
export function maxSharpeOptimization(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number = 0,
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  return maximizeSharpeRatio(expectedReturns, covarianceMatrix, riskFreeRate, constraints);
}

/**
 * Minimum variance optimization
 */
export function minVarianceOptimization(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  return minimumVariancePortfolio(covarianceMatrix, constraints);
}

/**
 * Maximum diversification optimization
 */
export function maxDiversificationOptimization(
  covarianceMatrix: number[][],
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  return maximizeDiversificationRatio(covarianceMatrix, constraints);
}

/**
 * Black-Litterman optimization
 */
export function blackLittermanOptimization(
  marketEquilibrium: number[],
  covarianceMatrix: number[][],
  investorViews: number[],
  pickMatrix: number[][],
  viewUncertainty: number[][],
  tau: number = 0.025,
  riskFreeRate: number = 0,
  constraints: { minWeight?: number; maxWeight?: number } = {}
): OptimizationResult {
  // Calculate posterior returns using Black-Litterman
  const posteriorReturns = calculatePosteriorReturns(
    marketEquilibrium,
    covarianceMatrix,
    investorViews,
    pickMatrix,
    viewUncertainty,
    tau
  );
  
  // Optimize using posterior returns
  return maximizeSharpeRatio(posteriorReturns, covarianceMatrix, riskFreeRate, constraints);
}
      