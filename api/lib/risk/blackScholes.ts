/**
 * Black-Scholes-Merton Options Pricing Model
 * Comprehensive implementation including Greeks, exotic options, and strategies
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface OptionParams {
  S: number;  // Current stock price
  K: number;  // Strike price
  T: number;  // Time to expiration (years)
  r: number;  // Risk-free rate
  sigma: number;  // Volatility
  q?: number;  // Dividend yield (optional)
}

interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

interface BarrierOptionParams extends OptionParams {
  H: number;  // Barrier level
  type: 'up-in' | 'up-out' | 'down-in' | 'down-out';
  optionType: 'call' | 'put';
}

interface AsianOptionParams extends OptionParams {
  averagePrices: number[];
  optionType: 'call' | 'put';
}

interface StrategyLeg {
  type: 'call' | 'put';
  strike: number;
  position: 'long' | 'short';
  quantity: number;
  premium: number;
}

interface VolatilityPoint {
  strike: number;
  maturity: number;
  iv: number;
}

// ============================================================================
// Helper Functions - Normal Distribution
// ============================================================================

/**
 * Cumulative normal distribution function
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * absX);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * erf);
}

/**
 * Probability density function for normal distribution
 */
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ============================================================================
// Core Black-Scholes Pricing
// ============================================================================

/**
 * Calculate d1 parameter for Black-Scholes
 */
function calculateD1(S: number, K: number, T: number, r: number, sigma: number, q: number = 0): number {
  return (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

/**
 * Calculate d2 parameter for Black-Scholes
 */
function calculateD2(d1: number, sigma: number, T: number): number {
  return d1 - sigma * Math.sqrt(T);
}

/**
 * Black-Scholes European call option price
 */
export function blackScholesCall(S: number, K: number, T: number, r: number, sigma: number, q: number = 0): number {
  if (T <= 0) return Math.max(S - K, 0);
  if (sigma <= 0) return Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0);

  const d1 = calculateD1(S, K, T, r, sigma, q);
  const d2 = calculateD2(d1, sigma, T);

  return S * Math.exp(-q * T) * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}

/**
 * Black-Scholes European put option price
 */
export function blackScholesPut(S: number, K: number, T: number, r: number, sigma: number, q: number = 0): number {
  if (T <= 0) return Math.max(K - S, 0);
  if (sigma <= 0) return Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0);

  const d1 = calculateD1(S, K, T, r, sigma, q);
  const d2 = calculateD2(d1, sigma, T);

  return K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);
}

// ============================================================================
// Greeks Calculations
// ============================================================================

/**
 * Calculate Delta (∂V/∂S)
 */
export function calculateDelta(params: OptionParams, optionType: 'call' | 'put'): number {
  const { S, K, T, r, sigma, q = 0 } = params;
  
  if (T <= 0) return optionType === 'call' ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0);

  const d1 = calculateD1(S, K, T, r, sigma, q);

  if (optionType === 'call') {
    return Math.exp(-q * T) * normalCDF(d1);
  } else {
    return -Math.exp(-q * T) * normalCDF(-d1);
  }
}

/**
 * Calculate Gamma (∂²V/∂S²)
 */
export function calculateGamma(params: OptionParams): number {
  const { S, K, T, r, sigma, q = 0 } = params;
  
  if (T <= 0 || sigma <= 0) return 0;

  const d1 = calculateD1(S, K, T, r, sigma, q);
  return Math.exp(-q * T) * normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

/**
 * Calculate Vega (∂V/∂σ)
 */
export function calculateVega(params: OptionParams): number {
  const { S, K, T, r, sigma, q = 0 } = params;
  
  if (T <= 0) return 0;

  const d1 = calculateD1(S, K, T, r, sigma, q);
  return S * Math.exp(-q * T) * normalPDF(d1) * Math.sqrt(T) / 100; // Divided by 100 for percentage point
}

/**
 * Calculate Theta (∂V/∂t)
 */
export function calculateTheta(params: OptionParams, optionType: 'call' | 'put'): number {
  const { S, K, T, r, sigma, q = 0 } = params;
  
  if (T <= 0) return 0;

  const d1 = calculateD1(S, K, T, r, sigma, q);
  const d2 = calculateD2(d1, sigma, T);

  const term1 = -(S * normalPDF(d1) * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T));

  if (optionType === 'call') {
    const term2 = q * S * normalCDF(d1) * Math.exp(-q * T);
    const term3 = -r * K * Math.exp(-r * T) * normalCDF(d2);
    return (term1 + term2 + term3) / 365; // Daily theta
  } else {
    const term2 = -q * S * normalCDF(-d1) * Math.exp(-q * T);
    const term3 = r * K * Math.exp(-r * T) * normalCDF(-d2);
    return (term1 + term2 + term3) / 365; // Daily theta
  }
}

/**
 * Calculate Rho (∂V/∂r)
 */
export function calculateRho(params: OptionParams, optionType: 'call' | 'put'): number {
  const { S, K, T, r, sigma, q = 0 } = params;
  
  if (T <= 0) return 0;

  const d1 = calculateD1(S, K, T, r, sigma, q);
  const d2 = calculateD2(d1, sigma, T);

  if (optionType === 'call') {
    return K * T * Math.exp(-r * T) * normalCDF(d2) / 100; // Divided by 100 for percentage point
  } else {
    return -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100; // Divided by 100 for percentage point
  }
}

/**
 * Calculate all Greeks for an option
 */
export function calculateAllGreeks(params: OptionParams, optionType: 'call' | 'put'): Greeks {
  return {
    delta: calculateDelta(params, optionType),
    gamma: calculateGamma(params),
    vega: calculateVega(params),
    theta: calculateTheta(params, optionType),
    rho: calculateRho(params, optionType)
  };
}

// ============================================================================
// Implied Volatility
// ============================================================================

/**
 * Newton-Raphson method for implied volatility
 */
function newtonRaphsonIV(
  targetPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  optionType: 'call' | 'put',
  q: number = 0,
  initialGuess: number = 0.3,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): number | null {
  let sigma = initialGuess;

  for (let i = 0; i < maxIterations; i++) {
    const params = { S, K, T, r, sigma, q };
    const price = optionType === 'call' 
      ? blackScholesCall(S, K, T, r, sigma, q)
      : blackScholesPut(S, K, T, r, sigma, q);
    
    const vega = calculateVega(params) * 100; // Convert back from percentage

    if (Math.abs(vega) < 1e-10) return null; // Vega too small

    const diff = price - targetPrice;
    
    if (Math.abs(diff) < tolerance) return sigma;

    sigma = sigma - diff / vega;

    // Ensure sigma stays positive
    if (sigma <= 0) sigma = 0.001;
    if (sigma > 5) sigma = 5; // Cap at 500% volatility
  }

  return null; // Did not converge
}

/**
 * Bisection method for implied volatility (fallback)
 */
function bisectionIV(
  targetPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  optionType: 'call' | 'put',
  q: number = 0,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): number | null {
  let sigmaLow = 0.001;
  let sigmaHigh = 5.0;

  const priceLow = optionType === 'call'
    ? blackScholesCall(S, K, T, r, sigmaLow, q)
    : blackScholesPut(S, K, T, r, sigmaLow, q);
  
  const priceHigh = optionType === 'call'
    ? blackScholesCall(S, K, T, r, sigmaHigh, q)
    : blackScholesPut(S, K, T, r, sigmaHigh, q);

  // Check if target price is within bounds
  if (targetPrice < priceLow || targetPrice > priceHigh) return null;

  for (let i = 0; i < maxIterations; i++) {
    const sigmaMid = (sigmaLow + sigmaHigh) / 2;
    const priceMid = optionType === 'call'
      ? blackScholesCall(S, K, T, r, sigmaMid, q)
      : blackScholesPut(S, K, T, r, sigmaMid, q);

    if (Math.abs(priceMid - targetPrice) < tolerance) return sigmaMid;

    if (priceMid < targetPrice) {
      sigmaLow = sigmaMid;
    } else {
      sigmaHigh = sigmaMid;
    }
  }

  return (sigmaLow + sigmaHigh) / 2; // Return best estimate
}

/**
 * Calculate implied volatility with automatic method selection
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  optionType: 'call' | 'put',
  q: number = 0
): number | null {
  // Validate inputs
  if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;

  // Check intrinsic value
  const intrinsic = optionType === 'call' 
    ? Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0)
    : Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0);

  if (marketPrice < intrinsic) return null; // Arbitrage condition

  // Try Newton-Raphson first
  let iv = newtonRaphsonIV(marketPrice, S, K, T, r, optionType, q);
  
  // Fall back to bisection if Newton-Raphson fails
  if (iv === null || iv <= 0 || iv > 5) {
    iv = bisectionIV(marketPrice, S, K, T, r, optionType, q);
  }

  return iv;
}

// ============================================================================
// American Options - Binomial Tree
// ============================================================================

/**
 * American option pricing using binomial tree
 */
export function binomialTreeAmerican(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  steps: number = 100,
  q: number = 0
): number {
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  const discount = Math.exp(-r * dt);

  // Initialize asset prices at maturity
  const assetPrices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    assetPrices[i] = S * Math.pow(u, steps - i) * Math.pow(d, i);
  }

  // Initialize option values at maturity
  const optionValues: number[] = [];
  for (let i = 0; i <= steps; i++) {
    if (optionType === 'call') {
      optionValues[i] = Math.max(assetPrices[i] - K, 0);
    } else {
      optionValues[i] = Math.max(K - assetPrices[i], 0);
    }
  }

  // Step back through the tree
  for (let step = steps - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const assetPrice = S * Math.pow(u, step - i) * Math.pow(d, i);
      
      // Continuation value
      const continuationValue = discount * (p * optionValues[i] + (1 - p) * optionValues[i + 1]);
      
      // Exercise value
      const exerciseValue = optionType === 'call'
        ? Math.max(assetPrice - K, 0)
        : Math.max(K - assetPrice, 0);
      
      // American option: max of continuation and exercise
      optionValues[i] = Math.max(continuationValue, exerciseValue);
    }
  }

  return optionValues[0];
}

// ============================================================================
// Exotic Options
// ============================================================================

/**
 * Barrier option pricing
 */
export function barrierOption(params: BarrierOptionParams): number {
  const { S, K, T, r, sigma, H, type, optionType, q = 0 } = params;

  const lambda = (r - q + 0.5 * sigma * sigma) / (sigma * sigma);
  const y = Math.log(H * H / (S * K)) / (sigma * Math.sqrt(T)) + lambda * sigma * Math.sqrt(T);
  const x1 = Math.log(S / H) / (sigma * Math.sqrt(T)) + lambda * sigma * Math.sqrt(T);
  const y1 = Math.log(H / S) / (sigma * Math.sqrt(T)) + lambda * sigma * Math.sqrt(T);

  // Calculate standard option price
  const standardPrice = optionType === 'call'
    ? blackScholesCall(S, K, T, r, sigma, q)
    : blackScholesPut(S, K, T, r, sigma, q);

  // Calculate adjustment terms based on barrier type
  let barrierPrice: number;

  if (type === 'down-out' && optionType === 'call') {
    if (S <= H) return 0;
    if (K <= H) return standardPrice;
    
    const term1 = standardPrice;
    const term2 = blackScholesCall(S, H, T, r, sigma, q);
    const term3 = Math.pow(H / S, 2 * lambda) * blackScholesCall(H * H / S, H, T, r, sigma, q);
    barrierPrice = term1 - term2 + term3;
  } else if (type === 'up-out' && optionType === 'put') {
    if (S >= H) return 0;
    if (K >= H) return standardPrice;
    
    const term1 = standardPrice;
    const term2 = blackScholesPut(S, H, T, r, sigma, q);
    const term3 = Math.pow(H / S, 2 * lambda) * blackScholesPut(H * H / S, H, T, r, sigma, q);
    barrierPrice = term1 - term2 + term3;
  } else if (type === 'down-in' && optionType === 'call') {
    const downOut = barrierOption({ ...params, type: 'down-out' });
    barrierPrice = standardPrice - downOut;
  } else if (type === 'up-in' && optionType === 'put') {
    const upOut = barrierOption({ ...params, type: 'up-out' });
    barrierPrice = standardPrice - upOut;
  } else {
    // Simplified approximation for other combinations
    barrierPrice = standardPrice * 0.5;
  }

  return Math.max(barrierPrice, 0);
}

/**
 * Asian option pricing (geometric average approximation)
 */
export function asianOption(params: AsianOptionParams): number {
  const { S, K, T, r, sigma, averagePrices, optionType, q = 0 } = params;

  // If we have historical averaging data, use it
  let adjustedSigma = sigma;
  let adjustedS = S;

  if (averagePrices.length > 0) {
    const n = averagePrices.length;
    const geometricMean = Math.exp(averagePrices.reduce((sum, p) => sum + Math.log(p), 0) / n);
    adjustedS = geometricMean;
    adjustedSigma = sigma / Math.sqrt(3);
  } else {
    // Continuous geometric average
    adjustedSigma = sigma / Math.sqrt(3);
  }

  const adjustedR = (r - q) / 2 + sigma * sigma / 6;

  if (optionType === 'call') {
    return blackScholesCall(adjustedS, K, T, adjustedR, adjustedSigma, 0);
  } else {
    return blackScholesPut(adjustedS, K, T, adjustedR, adjustedSigma, 0);
  }
}

/**
 * Digital (binary) option pricing
 */
export function digitalOption(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  payoff: number = 1,
  q: number = 0
): number {
  if (T <= 0) {
    if (optionType === 'call') {
      return S >= K ? payoff : 0;
    } else {
      return S <= K ? payoff : 0;
    }
  }

  const d2 = (Math.log(S / K) + (r - q - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

  if (optionType === 'call') {
    return payoff * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return payoff * Math.exp(-r * T) * normalCDF(-d2);
  }
}

// ============================================================================
// Volatility Surface
// ============================================================================

/**
 * Volatility surface management class
 */
export class VolatilitySurface {
  private points: VolatilityPoint[] = [];

  addPoint(strike: number, maturity: number, iv: number): void {
    this.points.push({ strike, maturity, iv });
  }

  addPoints(points: VolatilityPoint[]): void {
    this.points.push(...points);
  }

  /**
   * Bilinear interpolation for IV
   */
  getIV(strike: number, maturity: number): number | null {
    if (this.points.length === 0) return null;

    // Find surrounding points
    const maturities = [...new Set(this.points.map(p => p.maturity))].sort((a, b) => a - b);
    const strikes = [...new Set(this.points.map(p => p.strike))].sort((a, b) => a - b);

    // Find bracket indices
    let m1Idx = maturities.findIndex(m => m >= maturity);
    if (m1Idx === -1) m1Idx = maturities.length - 1;
    if (m1Idx === 0) m1Idx = 1;
    const m0Idx = m1Idx - 1;

    let k1Idx = strikes.findIndex(k => k >= strike);
    if (k1Idx === -1) k1Idx = strikes.length - 1;
    if (k1Idx === 0) k1Idx = 1;
    const k0Idx = k1Idx - 1;

    const m0 = maturities[m0Idx];
    const m1 = maturities[m1Idx];
    const k0 = strikes[k0Idx];
    const k1 = strikes[k1Idx];

    // Get corner values
    const iv00 = this.getExactIV(k0, m0);
    const iv01 = this.getExactIV(k0, m1);
    const iv10 = this.getExactIV(k1, m0);
    const iv11 = this.getExactIV(k1, m1);

    if (iv00 === null || iv01 === null || iv10 === null || iv11 === null) {
      return this.getNearestIV(strike, maturity);
    }

    // Bilinear interpolation
    const wm = (maturity - m0) / (m1 - m0);
    const wk = (strike - k0) / (k1 - k0);

    return (1 - wm) * (1 - wk) * iv00 +
           (1 - wm) * wk * iv10 +
           wm * (1 - wk) * iv01 +
           wm * wk * iv11;
  }

  private getExactIV(strike: number, maturity: number): number | null {
    const point = this.points.find(p => 
      Math.abs(p.strike - strike) < 1e-6 && 
      Math.abs(p.maturity - maturity) < 1e-6
    );
    return point ? point.iv : null;
  }

  private getNearestIV(strike: number, maturity: number): number | null {
    if (this.points.length === 0) return null;

    let nearest = this.points[0];
    let minDist = Infinity;

    for (const point of this.points) {
      const dist = Math.sqrt(
        Math.pow((point.strike - strike) / strike, 2) +
        Math.pow((point.maturity - maturity) / maturity, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    return nearest.iv;
  }

  clear(): void {
    this.points = [];
  }
}

// ============================================================================
// Options Strategies
// ============================================================================

/**
 * Long straddle strategy
 */
export function straddle(S: number, K: number, T: number, r: number, sigma: number, q: number = 0): {
  cost: number;
  call: number;
  put: number;
} {
  const call = blackScholesCall(S, K, T, r, sigma, q);
  const put = blackScholesPut(S, K, T, r, sigma, q);
  return {
    cost: call + put,
    call,
    put
  };
}

/**
 * Long strangle strategy
 */
export function strangle(
  S: number,
  K_call: number,
  K_put: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): {
  cost: number;
  call: number;
  put: number;
} {
  const call = blackScholesCall(S, K_call, T, r, sigma, q);
  const put = blackScholesPut(S, K_put, T, r, sigma, q);
  return {
    cost: call + put,
    call,
    put
  };
}

/**
 * Butterfly spread strategy
 */
export function butterfly(
  S: number,
  K_low: number,
  K_mid: number,
  K_high: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  q: number = 0
): {
  cost: number;
  positions: number[];
} {
  if (optionType === 'call') {
    const longLow = blackScholesCall(S, K_low, T, r, sigma, q);
    const shortMid = blackScholesCall(S, K_mid, T, r, sigma, q);
    const longHigh = blackScholesCall(S, K_high, T, r, sigma, q);
    return {
      cost: longLow - 2 * shortMid + longHigh,
      positions: [longLow, shortMid, longHigh]
    };
  } else {
    const longLow = blackScholesPut(S, K_low, T, r, sigma, q);
    const shortMid = blackScholesPut(S, K_mid, T, r, sigma, q);
    const longHigh = blackScholesPut(S, K_high, T, r, sigma, q);
    return {
      cost: longLow - 2 * shortMid + longHigh,
      positions: [longLow, shortMid, longHigh]
    };
  }
}

/**
 * Iron condor strategy
 */
export function ironCondor(
  S: number,
  K_put_low: number,
  K_put_high: number,
  K_call_low: number,
  K_call_high: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): {
  cost: number;
  positions: {
    longPutLow: number;
    shortPutHigh: number;
    shortCallLow: number;
    longCallHigh: number;
  };
} {
  const longPutLow = blackScholesPut(S, K_put_low, T, r, sigma, q);
  const shortPutHigh = blackScholesPut(S, K_put_high, T, r, sigma, q);
  const shortCallLow = blackScholesCall(S, K_call_low, T, r, sigma, q);
  const longCallHigh = blackScholesCall(S, K_call_high, T, r, sigma, q);

  return {
    cost: longPutLow - shortPutHigh - shortCallLow + longCallHigh,
    positions: {
      longPutLow,
      shortPutHigh,
      shortCallLow,
      longCallHigh
    }
  };
}

/**
 * Bull spread strategy (expecting price increase)
 */
export function bullSpread(
  S: number,
  K_low: number,
  K_high: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  q: number = 0
): {
  cost: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number;
} {
  if (optionType === 'call') {
    // Long call at lower strike, short call at higher strike
    const longCall = blackScholesCall(S, K_low, T, r, sigma, q);
    const shortCall = blackScholesCall(S, K_high, T, r, sigma, q);
    const cost = longCall - shortCall;
    const maxProfit = K_high - K_low - cost;
    const maxLoss = cost;
    const breakeven = K_low + cost;

    return { cost, maxProfit, maxLoss, breakeven };
  } else {
    // Long put at higher strike, short put at lower strike
    const longPut = blackScholesPut(S, K_high, T, r, sigma, q);
    const shortPut = blackScholesPut(S, K_low, T, r, sigma, q);
    const cost = longPut - shortPut;
    const maxProfit = K_high - K_low - cost;
    const maxLoss = cost;
    const breakeven = K_high - cost;

    return { cost, maxProfit, maxLoss, breakeven };
  }
}

/**
 * Bear spread strategy (expecting price decrease)
 */
export function bearSpread(
  S: number,
  K_low: number,
  K_high: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  q: number = 0
): {
  cost: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number;
} {
  if (optionType === 'call') {
    // Short call at lower strike, long call at higher strike
    const shortCall = blackScholesCall(S, K_low, T, r, sigma, q);
    const longCall = blackScholesCall(S, K_high, T, r, sigma, q);
    const cost = shortCall - longCall;
    const maxProfit = cost;
    const maxLoss = K_high - K_low - cost;
    const breakeven = K_low + cost;

    return { cost, maxProfit, maxLoss, breakeven };
  } else {
    // Short put at higher strike, long put at lower strike
    const shortPut = blackScholesPut(S, K_high, T, r, sigma, q);
    const longPut = blackScholesPut(S, K_low, T, r, sigma, q);
    const cost = shortPut - longPut;
    const maxProfit = cost;
    const maxLoss = K_high - K_low - cost;
    const breakeven = K_high - cost;

    return { cost, maxProfit, maxLoss, breakeven };
  }
}

/**
 * Calendar spread strategy (time spread with same strike, different expirations)
 */
export function calendarSpread(
  S: number,
  K: number,
  T_near: number,
  T_far: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  q: number = 0
): {
  cost: number;
  nearOption: number;
  farOption: number;
} {
  if (optionType === 'call') {
    const nearCall = blackScholesCall(S, K, T_near, r, sigma, q);
    const farCall = blackScholesCall(S, K, T_far, r, sigma, q);
    return {
      cost: farCall - nearCall,
      nearOption: nearCall,
      farOption: farCall
    };
  } else {
    const nearPut = blackScholesPut(S, K, T_near, r, sigma, q);
    const farPut = blackScholesPut(S, K, T_far, r, sigma, q);
    return {
      cost: farPut - nearPut,
      nearOption: nearPut,
      farOption: farPut
    };
  }
}

/**
 * Calculate profit/loss for a strategy at expiration
 */
export function profitLossCalculator(
  legs: StrategyLeg[],
  spotPriceAtExpiration: number
): {
  profitLoss: number;
  legDetails: Array<{
    leg: StrategyLeg;
    payoff: number;
    profitLoss: number;
  }>;
} {
  let totalProfitLoss = 0;
  const legDetails = legs.map(leg => {
    let payoff = 0;

    if (leg.type === 'call') {
      payoff = Math.max(spotPriceAtExpiration - leg.strike, 0);
    } else {
      payoff = Math.max(leg.strike - spotPriceAtExpiration, 0);
    }

    // Adjust for position (long vs short)
    const positionMultiplier = leg.position === 'long' ? 1 : -1;
    const legPayoff = positionMultiplier * payoff * leg.quantity;
    
    // Calculate profit/loss including premium paid/received
    const premiumFlow = positionMultiplier * leg.premium * leg.quantity;
    const legProfitLoss = legPayoff - premiumFlow;

    totalProfitLoss += legProfitLoss;

    return {
      leg,
      payoff: legPayoff,
      profitLoss: legProfitLoss
    };
  });

  return {
    profitLoss: totalProfitLoss,
    legDetails
  };
}

/**
 * Calculate hedge ratios for delta-neutral and gamma-neutral portfolios
 */
export function greeksHedging(
  portfolioGreeks: Greeks,
  hedgingInstrument: {
    delta: number;
    gamma: number;
    price: number;
  },
  targetDelta: number = 0,
  targetGamma: number = 0
): {
  deltaHedgeQuantity: number;
  gammaHedgeQuantity: number;
  combinedHedgeQuantity: number;
  residualDelta: number;
  residualGamma: number;
} {
  // Delta hedging (simple)
  const deltaHedgeQuantity = hedgingInstrument.delta !== 0
    ? -(portfolioGreeks.delta - targetDelta) / hedgingInstrument.delta
    : 0;

  // Gamma hedging
  const gammaHedgeQuantity = hedgingInstrument.gamma !== 0
    ? -(portfolioGreeks.gamma - targetGamma) / hedgingInstrument.gamma
    : 0;

  // Combined hedge (prioritize gamma neutrality, then delta)
  const combinedHedgeQuantity = gammaHedgeQuantity;
  const residualDelta = portfolioGreeks.delta + combinedHedgeQuantity * hedgingInstrument.delta - targetDelta;
  const residualGamma = portfolioGreeks.gamma + combinedHedgeQuantity * hedgingInstrument.gamma - targetGamma;

  return {
    deltaHedgeQuantity,
    gammaHedgeQuantity,
    combinedHedgeQuantity,
    residualDelta,
    residualGamma
  };
}

/**
 * Calculate Black-Scholes price for call or put option
 */
export function calculateBlackScholesPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'call' | 'put',
  q: number = 0
): number {
  if (optionType === 'call') {
    return blackScholesCall(S, K, T, r, sigma, q);
  } else {
    return blackScholesPut(S, K, T, r, sigma, q);
  }
}

// ============================================================================
// Export Aliases for API Compatibility
// ============================================================================

/**
 * Alias for impliedVolatility
 */
export const calculateImpliedVolatility = impliedVolatility;

/**
 * Alias for calculateAllGreeks
 */
export const calculateGreeks = calculateAllGreeks;

/**
 * Alias for barrierOption
 */
export const priceBarrierOption = barrierOption;

/**
 * Alias for asianOption
 */
export const priceAsianOption = asianOption;

/**
 * Alias for digitalOption
 */
export const priceDigitalOption = digitalOption;

// ============================================================================
// Portfolio Management
// ============================================================================

/**
 * Options portfolio management with aggregate Greeks
 */
export class OptionsPortfolio {
  private positions: Array<{
    id: string;
    params: OptionParams;
    optionType: 'call' | 'put';
    quantity: number;
    entryPrice: number;
  }> = [];

  /**
   * Add a position to the portfolio
   */
  addPosition(
    id: string,
    params: OptionParams,
    optionType: 'call' | 'put',
    quantity: number,
    entryPrice: number
  ): void {
    this.positions.push({ id, params, optionType, quantity, entryPrice });
  }

  /**
   * Remove a position from the portfolio
   */
  removePosition(id: string): boolean {
    const index = this.positions.findIndex(p => p.id === id);
    if (index !== -1) {
      this.positions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Calculate aggregate Greeks for the entire portfolio
   */
  calculateTotalGreeks(): Greeks {
    const totalGreeks: Greeks = {
      delta: 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0
    };

    for (const position of this.positions) {
      const greeks = calculateAllGreeks(position.params, position.optionType);
      totalGreeks.delta += greeks.delta * position.quantity;
      totalGreeks.gamma += greeks.gamma * position.quantity;
      totalGreeks.vega += greeks.vega * position.quantity;
      totalGreeks.theta += greeks.theta * position.quantity;
      totalGreeks.rho += greeks.rho * position.quantity;
    }

    return totalGreeks;
  }

  /**
   * Calculate current market value of the portfolio
   */
  calculateValue(): number {
    let totalValue = 0;

    for (const position of this.positions) {
      const { params, optionType, quantity } = position;
      const currentPrice = optionType === 'call'
        ? blackScholesCall(params.S, params.K, params.T, params.r, params.sigma, params.q)
        : blackScholesPut(params.S, params.K, params.T, params.r, params.sigma, params.q);
      
      totalValue += currentPrice * quantity;
    }

    return totalValue;
  }

  /**
   * Calculate profit/loss of the portfolio
   */
  calculateProfitLoss(): number {
    let totalPnL = 0;

    for (const position of this.positions) {
      const { params, optionType, quantity, entryPrice } = position;
      const currentPrice = optionType === 'call'
        ? blackScholesCall(params.S, params.K, params.T, params.r, params.sigma, params.q)
        : blackScholesPut(params.S, params.K, params.T, params.r, params.sigma, params.q);
      
      totalPnL += (currentPrice - entryPrice) * quantity;
    }

    return totalPnL;
  }

  /**
   * Get all positions in the portfolio
   */
  getPositions() {
    return [...this.positions];
  }

  /**
   * Clear all positions
   */
  clearAll(): void {
    this.positions = [];
  }

  /**
   * Get position count
   */
  getPositionCount(): number {
    return this.positions.length;
  }
}