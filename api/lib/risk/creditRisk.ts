/**
 * Comprehensive Credit Risk Models
 * Implements various credit risk measurement and management models including:
 * - Merton structural model
 * - CreditMetrics framework
 * - KMV model
 * - Copula models for portfolio credit risk
 * - CVA/DVA calculations
 * - Reduced-form models
 */

// Standard normal distribution functions
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function inverseNormalCDF(p: number): number {
  // Beasley-Springer-Moro algorithm for inverse normal CDF
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 
             0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];

  if (p <= 0 || p >= 1) {
    throw new Error("Probability must be between 0 and 1");
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
  
  return y < 0 ? -x : x;
}

// Merton Model Implementation
export interface MertonModelParams {
  assetValue: number;
  debtValue: number;
  volatility: number;
  timeToMaturity: number;
  riskFreeRate: number;
}

export interface MertonModelResult {
  probabilityOfDefault: number;
  distanceToDefault: number;
  creditSpread: number;
  equityValue: number;
  debtValue: number;
}

export function mertonModel(params: MertonModelParams): MertonModelResult {
  const { assetValue, debtValue, volatility, timeToMaturity, riskFreeRate } = params;
  
  // Calculate d1 and d2 for Black-Scholes-Merton model
  const d1 = (Math.log(assetValue / debtValue) + (riskFreeRate + 0.5 * volatility * volatility) * timeToMaturity) /
             (volatility * Math.sqrt(timeToMaturity));
  const d2 = d1 - volatility * Math.sqrt(timeToMaturity);
  
  // Distance to default
  const distanceToDefault = d2;
  
  // Probability of default (risk-neutral)
  const probabilityOfDefault = normalCDF(-d2);
  
  // Equity value as call option on assets
  const equityValue = assetValue * normalCDF(d1) - debtValue * Math.exp(-riskFreeRate * timeToMaturity) * normalCDF(d2);
  
  // Credit spread
  const riskNeutralPD = probabilityOfDefault;
  const creditSpread = -Math.log(1 - riskNeutralPD) / timeToMaturity;
  
  return {
    probabilityOfDefault,
    distanceToDefault,
    creditSpread,
    equityValue,
    debtValue: debtValue * Math.exp(-riskFreeRate * timeToMaturity) * normalCDF(d2)
  };
}

export function distanceToDefault(
  assetValue: number,
  debtValue: number,
  assetVolatility: number,
  expectedReturn: number,
  timeHorizon: number = 1
): number {
  const numerator = Math.log(assetValue / debtValue) + (expectedReturn - 0.5 * assetVolatility * assetVolatility) * timeHorizon;
  const denominator = assetVolatility * Math.sqrt(timeHorizon);
  return numerator / denominator;
}

export function creditSpreadFromPD(
  probabilityOfDefault: number,
  recoveryRate: number,
  timeToMaturity: number
): number {
  const lossGivenDefault = 1 - recoveryRate;
  return -(Math.log(1 - probabilityOfDefault * lossGivenDefault)) / timeToMaturity;
}

// CreditMetrics Implementation
export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'Default';

export interface TransitionMatrix {
  ratings: CreditRating[];
  matrix: number[][];
  timeHorizon: number;
}

export function calculateTransitionMatrix(
  historicalTransitions: Map<CreditRating, Map<CreditRating, number>>,
  ratings: CreditRating[]
): TransitionMatrix {
  const n = ratings.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  ratings.forEach((fromRating, i) => {
    const transitions = historicalTransitions.get(fromRating);
    if (!transitions) return;
    
    let total = 0;
    transitions.forEach((count) => {
      total += count;
    });
    
    ratings.forEach((toRating, j) => {
      const count = transitions.get(toRating) || 0;
      matrix[i][j] = total > 0 ? count / total : 0;
    });
  });
  
  return { ratings, matrix, timeHorizon: 1 };
}

export interface CreditVaRParams {
  exposures: number[];
  ratings: CreditRating[];
  transitionMatrix: TransitionMatrix;
  recoveryRates: Map<CreditRating, number>;
  confidenceLevel: number;
}

export function calculateCreditVaR(params: CreditVaRParams): number {
  const { exposures, ratings, transitionMatrix, recoveryRates, confidenceLevel } = params;
  
  const losses: number[] = [];
  const numSimulations = 10000;
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let totalLoss = 0;
    
    exposures.forEach((exposure, i) => {
      const currentRating = ratings[i];
      const ratingIndex = transitionMatrix.ratings.indexOf(currentRating);
      
      // Simulate rating migration
      const rand = Math.random();
      let cumProb = 0;
      let newRatingIndex = ratingIndex;
      
      for (let j = 0; j < transitionMatrix.ratings.length; j++) {
        cumProb += transitionMatrix.matrix[ratingIndex][j];
        if (rand <= cumProb) {
          newRatingIndex = j;
          break;
        }
      }
      
      const newRating = transitionMatrix.ratings[newRatingIndex];
      
      // Calculate loss if rating deteriorates
      if (newRating === 'Default') {
        const recoveryRate = recoveryRates.get(currentRating) || 0.4;
        totalLoss += exposure * (1 - recoveryRate);
      }
    });
    
    losses.push(totalLoss);
  }
  
  // Sort losses and find VaR
  losses.sort((a, b) => a - b);
  const varIndex = Math.floor(losses.length * confidenceLevel);
  return losses[varIndex];
}

export function calculateExpectedLoss(
  exposure: number,
  probabilityOfDefault: number,
  lossGivenDefault: number
): number {
  return exposure * probabilityOfDefault * lossGivenDefault;
}

// KMV Model Implementation
export interface KMVModelParams {
  equityValue: number;
  debtValue: number;
  equityVolatility: number;
  riskFreeRate: number;
  timeHorizon: number;
}

export interface KMVModelResult {
  assetValue: number;
  assetVolatility: number;
  distanceToDefault: number;
  expectedDefaultFrequency: number;
}

export function estimateAssetVolatility(
  equityValue: number,
  equityVolatility: number,
  debtValue: number,
  assetValue: number,
  riskFreeRate: number,
  timeHorizon: number
): number {
  const d1 = (Math.log(assetValue / debtValue) + (riskFreeRate + 0.5 * equityVolatility * equityVolatility) * timeHorizon) /
             (equityVolatility * Math.sqrt(timeHorizon));
  
  // Asset volatility from equity volatility using Merton model
  return (equityValue / assetValue) * normalCDF(d1) * equityVolatility;
}

export function kmvModel(params: KMVModelParams): KMVModelResult {
  const { equityValue, debtValue, equityVolatility, riskFreeRate, timeHorizon } = params;
  
  // Iteratively solve for asset value and volatility
  let assetValue = equityValue + debtValue;
  let assetVolatility = equityVolatility * (equityValue / assetValue);
  
  // Newton-Raphson iteration
  for (let i = 0; i < 100; i++) {
    const d1 = (Math.log(assetValue / debtValue) + (riskFreeRate + 0.5 * assetVolatility * assetVolatility) * timeHorizon) /
               (assetVolatility * Math.sqrt(timeHorizon));
    const d2 = d1 - assetVolatility * Math.sqrt(timeHorizon);
    
    const equityValueEst = assetValue * normalCDF(d1) - debtValue * Math.exp(-riskFreeRate * timeHorizon) * normalCDF(d2);
    const vega = assetValue * normalPDF(d1) * Math.sqrt(timeHorizon);
    
    const error = equityValueEst - equityValue;
    if (Math.abs(error) < 1e-6) break;
    
    assetValue -= error / (normalCDF(d1) + assetValue * normalPDF(d1) * Math.sqrt(timeHorizon) / assetVolatility);
    assetVolatility = estimateAssetVolatility(equityValue, equityVolatility, debtValue, assetValue, riskFreeRate, timeHorizon);
  }
  
  const dd = distanceToDefault(assetValue, debtValue, assetVolatility, riskFreeRate, timeHorizon);
  const edf = normalCDF(-dd);
  
  return {
    assetValue,
    assetVolatility,
    distanceToDefault: dd,
    expectedDefaultFrequency: edf
  };
}

// Copula Models for Portfolio Credit Risk
export function gaussianCopula(
  uniformVariates: number[],
  correlationMatrix: number[][]
): number[] {
  const n = uniformVariates.length;
  
  // Convert uniform to normal
  const normalVariates = uniformVariates.map(u => inverseNormalCDF(u));
  
  // Cholesky decomposition of correlation matrix
  const L = choleskyDecomposition(correlationMatrix);
  
  // Transform using correlation structure
  const correlated: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      correlated[i] += L[i][j] * normalVariates[j];
    }
  }
  
  // Convert back to uniform
  return correlated.map(x => normalCDF(x));
}

export function tCopula(
  uniformVariates: number[],
  correlationMatrix: number[][],
  degreesOfFreedom: number
): number[] {
  const n = uniformVariates.length;
  
  // Convert uniform to t-distribution
  const tVariates = uniformVariates.map(u => inverseTCDF(u, degreesOfFreedom));
  
  // Cholesky decomposition
  const L = choleskyDecomposition(correlationMatrix);
  
  // Transform using correlation structure
  const correlated: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      correlated[i] += L[i][j] * tVariates[j];
    }
  }
  
  // Convert back to uniform using t-CDF
  return correlated.map(x => tCDF(x, degreesOfFreedom));
}

function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      
      if (i === j) {
        L[i][j] = Math.sqrt(matrix[i][i] - sum);
      } else {
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  
  return L;
}

function tCDF(x: number, df: number): number {
  // Approximation of Student's t CDF
  const normalApprox = x / Math.sqrt(df / (df - 2));
  return normalCDF(normalApprox);
}

function inverseTCDF(p: number, df: number): number {
  // Approximation of inverse t CDF
  const z = inverseNormalCDF(p);
  return z * Math.sqrt(df / (df - 2));
}

// Credit Risk Engine
export interface CounterpartyRiskParams {
  exposure: number;
  counterpartyRating: CreditRating;
  timeToMaturity: number;
  recoveryRate: number;
  correlations?: number[];
}

export interface CVAParams {
  exposureProfile: number[];
  timePoints: number[];
  survivalProbabilities: number[];
  recoveryRate: number;
  discountFactors: number[];
}

export class CreditRiskEngine {
  private ratingPDs: Map<CreditRating, number>;
  private recoveryRates: Map<CreditRating, number>;
  
  constructor() {
    // Default PDs and recovery rates
    this.ratingPDs = new Map([
      ['AAA', 0.0001],
      ['AA', 0.0005],
      ['A', 0.001],
      ['BBB', 0.005],
      ['BB', 0.02],
      ['B', 0.05],
      ['CCC', 0.15],
      ['Default', 1.0]
    ]);
    
    this.recoveryRates = new Map([
      ['AAA', 0.6],
      ['AA', 0.6],
      ['A', 0.5],
      ['BBB', 0.5],
      ['BB', 0.4],
      ['B', 0.3],
      ['CCC', 0.2],
      ['Default', 0.0]
    ]);
  }
  
  assessCounterpartyRisk(params: CounterpartyRiskParams): {
    expectedLoss: number;
    unexpectedLoss: number;
    creditVaR99: number;
  } {
    const { exposure, counterpartyRating, timeToMaturity, recoveryRate } = params;
    
    const pd = (this.ratingPDs.get(counterpartyRating) || 0.01) * timeToMaturity;
    const lgd = 1 - recoveryRate;
    
    const expectedLoss = exposure * pd * lgd;
    const unexpectedLoss = exposure * lgd * Math.sqrt(pd * (1 - pd));
    
    // VaR at 99% confidence using normal approximation
    const creditVaR99 = expectedLoss + 2.33 * unexpectedLoss;
    
    return { expectedLoss, unexpectedLoss, creditVaR99 };
  }
  
  calculateCVA(params: CVAParams): number {
    const { exposureProfile, timePoints, survivalProbabilities, recoveryRate, discountFactors } = params;
    
    let cva = 0;
    const lgd = 1 - recoveryRate;
    
    for (let i = 1; i < timePoints.length; i++) {
      const dt = timePoints[i] - timePoints[i - 1];
      const pd = survivalProbabilities[i - 1] - survivalProbabilities[i];
      const expectedExposure = (exposureProfile[i] + exposureProfile[i - 1]) / 2;
      const df = (discountFactors[i] + discountFactors[i - 1]) / 2;
      
      cva += lgd * pd * expectedExposure * df;
    }
    
    return cva;
  }
  
  calculateDVA(params: CVAParams): number {
    // DVA is similar to CVA but for the counterparty's perspective
    return this.calculateCVA(params);
  }
  
  calculateExposureAtDefault(
    currentExposure: number,
    potentialFutureExposure: number,
    confidenceLevel: number = 0.95
  ): number {
    // EAD combines current exposure and potential future exposure
    const alpha = inverseNormalCDF(confidenceLevel);
    return currentExposure + alpha * potentialFutureExposure;
  }
  
  calculateLossGivenDefault(
    exposureAtDefault: number,
    recoveryRate: number,
    collateralValue: number = 0
  ): number {
    const unsecuredExposure = Math.max(0, exposureAtDefault - collateralValue);
    return unsecuredExposure * (1 - recoveryRate);
  }
  
  setProbabilityOfDefault(rating: CreditRating, pd: number): void {
    this.ratingPDs.set(rating, pd);
  }
  
  setRecoveryRate(rating: CreditRating, rr: number): void {
    this.recoveryRates.set(rating, rr);
  }
}

// Structural Credit Models
export interface StructuralModelParams {
  assetValue: number;
  assetVolatility: number;
  debtValue: number;
  couponRate: number;
  maturity: number;
  riskFreeRate: number;
}

export function firstPassageTimeModel(params: StructuralModelParams): {
  probabilityOfDefault: number;
  defaultBarrier: number;
} {
  const { assetValue, assetVolatility, debtValue, maturity, riskFreeRate } = params;
  
  // Black-Cox model with default barrier
  const defaultBarrier = debtValue * 0.5; // Typical barrier
  
  const mu = riskFreeRate - 0.5 * assetVolatility * assetVolatility;
  const lambda = Math.sqrt(mu * mu + 2 * riskFreeRate * assetVolatility * assetVolatility);
  
  const h1 = (Math.log(assetValue / defaultBarrier) + lambda * maturity) / (assetVolatility * Math.sqrt(maturity));
  const h2 = (Math.log(assetValue / defaultBarrier) - lambda * maturity) / (assetVolatility * Math.sqrt(maturity));
  
  const pd = normalCDF(-h1) + Math.pow(defaultBarrier / assetValue, 2 * lambda / (assetVolatility * assetVolatility)) * normalCDF(-h2);
  
  return {
    probabilityOfDefault: pd,
    defaultBarrier
  };
}

// Reduced-Form Models (Hazard Rate Models)
export interface HazardRateParams {
  initialHazardRate: number;
  meanReversionSpeed: number;
  longTermMean: number;
  volatility: number;
  timeHorizon: number;
  timeSteps: number;
}

export function coxProcessModel(params: HazardRateParams): {
  survivalProbability: number;
  defaultProbability: number;
  hazardRates: number[];
} {
  const { initialHazardRate, meanReversionSpeed, longTermMean, volatility, timeHorizon, timeSteps } = params;
  
  const dt = timeHorizon / timeSteps;
  const hazardRates: number[] = [initialHazardRate];
  let cumulativeHazard = 0;
  
  // Simulate CIR process for hazard rate
  for (let i = 1; i <= timeSteps; i++) {
    const currentRate = hazardRates[i - 1];
    const drift = meanReversionSpeed * (longTermMean - currentRate) * dt;
    const diffusion = volatility * Math.sqrt(Math.max(0, currentRate) * dt) * (Math.random() * 2 - 1);
    
    const newRate = Math.max(0, currentRate + drift + diffusion);
    hazardRates.push(newRate);
    cumulativeHazard += newRate * dt;
  }
  
  const survivalProbability = Math.exp(-cumulativeHazard);
  
  return {
    survivalProbability,
    defaultProbability: 1 - survivalProbability,
    hazardRates
  };
}

export function reducedFormPD(
  hazardRate: number,
  timeHorizon: number
): number {
  return 1 - Math.exp(-hazardRate * timeHorizon);
}

/**
 * Calculate probability of default using distance to default approach
 * This is a general-purpose function for calculating default probability
 * based on structural credit risk models
 */
export function calculateDefaultProbability(
  assetValue: number,
  debtValue: number,
  assetVolatility: number,
  expectedReturn: number,
  timeHorizon: number = 1
): number {
  const dd = distanceToDefault(assetValue, debtValue, assetVolatility, expectedReturn, timeHorizon);
  return normalCDF(-dd);
}

// Credit Portfolio Optimizer
export interface PortfolioPosition {
  exposure: number;
  rating: CreditRating;
  expectedReturn: number;
  spread: number;
}

export interface PortfolioOptimizationParams {
  positions: PortfolioPosition[];
  targetReturn?: number;
  maxVaR?: number;
  correlationMatrix: number[][];
  confidenceLevel: number;
}

export class CreditPortfolioOptimizer {
  private engine: CreditRiskEngine;
  
  constructor() {
    this.engine = new CreditRiskEngine();
  }
  
  optimizePortfolio(params: PortfolioOptimizationParams): {
    weights: number[];
    portfolioReturn: number;
    portfolioVaR: number;
    diversificationBenefit: number;
  } {
    const { positions, targetReturn, maxVaR, correlationMatrix, confidenceLevel } = params;
    const n = positions.length;
    
    // Simple mean-variance optimization with credit constraints
    // Start with equal weights
    const weights = Array(n).fill(1 / n);
    
    // Calculate portfolio metrics
    let portfolioReturn = 0;
    let portfolioVariance = 0;
    
    for (let i = 0; i < n; i++) {
      portfolioReturn += weights[i] * positions[i].expectedReturn;
      
      for (let j = 0; j < n; j++) {
        const vol_i = positions[i].spread;
        const vol_j = positions[j].spread;
        portfolioVariance += weights[i] * weights[j] * vol_i * vol_j * correlationMatrix[i][j];
      }
    }
    
    const portfolioStdDev = Math.sqrt(portfolioVariance);
    const portfolioVaR = portfolioStdDev * inverseNormalCDF(confidenceLevel);
    
    // Calculate diversification benefit
    const undiversifiedVaR = positions.reduce((sum, pos, i) => 
      sum + weights[i] * pos.spread * inverseNormalCDF(confidenceLevel), 0);
    const diversificationBenefit = undiversifiedVaR - portfolioVaR;
    
    return {
      weights,
      portfolioReturn,
      portfolioVaR,
      diversificationBenefit
    };
  }
  
  calculatePortfolioCreditVaR(
    positions: PortfolioPosition[],
    weights: number[],
    correlationMatrix: number[][],
    confidenceLevel: number
  ): number {
    const n = positions.length;
    let portfolioVariance = 0;
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const params_i = this.engine.assessCounterpartyRisk({
          exposure: positions[i].exposure,
          counterpartyRating: positions[i].rating,
          timeToMaturity: 1,
          recoveryRate: 0.4
        });
        
        const params_j = this.engine.assessCounterpartyRisk({
          exposure: positions[j].exposure,
          counterpartyRating: positions[j].rating,
          timeToMaturity: 1,
          recoveryRate: 0.4
        });
        
        portfolioVariance += weights[i] * weights[j] * 
                           params_i.unexpectedLoss * params_j.unexpectedLoss * 
                           correlationMatrix[i][j];
      }
    }
    
    return Math.sqrt(portfolioVariance) * inverseNormalCDF(confidenceLevel);
  }
  
  optimizeWithCreditConstraints(params: PortfolioOptimizationParams): {
    weights: number[];
    metrics: {
      return: number;
      var: number;
      expectedLoss: number;
      concentrationRisk: number;
    };
  } {
    const optimized = this.optimizePortfolio(params);
    
    // Calculate additional credit metrics
    let expectedLoss = 0;
    for (let i = 0; i < params.positions.length; i++) {
      const risk = this.engine.assessCounterpartyRisk({
        exposure: params.positions[i].exposure,
        counterpartyRating: params.positions[i].rating,
        timeToMaturity: 1,
        recoveryRate: 0.4
      });
      expectedLoss += optimized.weights[i] * risk.expectedLoss;
    }
    
    // Herfindahl concentration index
    const concentrationRisk = optimized.weights.reduce((sum, w) => sum + w * w, 0);
    
    return {
      weights: optimized.weights,
      metrics: {
        return: optimized.portfolioReturn,
        var: optimized.portfolioVaR,
        expectedLoss,
        concentrationRisk
      }
    };
  }
}

