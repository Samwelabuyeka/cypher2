/**
 * Calculate the nth Fibonacci number
 * @param n - The position in the Fibonacci sequence (0-indexed)
 * @returns The nth Fibonacci number
 */
export const fibonacci = (n: number): number => {
  if (n < 0) throw new Error("Fibonacci is not defined for negative numbers");
  if (n === 0) return 0;
  if (n === 1) return 1;
  
  let a = 0;
  let b = 1;
  
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  
  return b;
};

/**
 * Calculate Fibonacci retracement levels
 * @param high - The high price point
 * @param low - The low price point
 * @returns Object containing retracement levels
 */
export const fibonacciRetracement = (high: number, low: number) => {
  const diff = high - low;
  
  return {
    "0%": low,
    "23.6%": low + diff * 0.236,
    "38.2%": low + diff * 0.382,
    "50%": low + diff * 0.5,
    "61.8%": low + diff * 0.618,
    "78.6%": low + diff * 0.786,
    "100%": high,
  };
};

/**
 * Calculate Fibonacci extension levels
 * @param high - The swing high
 * @param low - The swing low
 * @param retracement - The retracement point
 * @returns Object containing extension levels
 */
export const fibonacciExtension = (high: number, low: number, retracement: number) => {
  const diff = high - low;
  const direction = high > low ? 1 : -1;
  
  return {
    "127.2%": retracement + direction * diff * 1.272,
    "161.8%": retracement + direction * diff * 1.618,
    "200%": retracement + direction * diff * 2.0,
    "261.8%": retracement + direction * diff * 2.618,
  };
};

/**
 * Round a number to a specified number of decimal places
 * @param value - The number to round
 * @param decimals - The number of decimal places
 * @returns The rounded number
 */
export const round = (value: number, decimals: number): number => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
};

/**
 * Clamp a value between a minimum and maximum
 * @param value - The value to clamp
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns The clamped value
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Linear interpolation between two values
 * @param start - The start value
 * @param end - The end value
 * @param t - The interpolation factor (0-1)
 * @returns The interpolated value
 */
export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

/**
 * Inverse linear interpolation - find the t value for a given interpolated value
 * @param start - The start value
 * @param end - The end value
 * @param value - The interpolated value
 * @returns The t value (0-1)
 */
export const inverseLerp = (start: number, end: number, value: number): number => {
  if (start === end) return 0;
  return (value - start) / (end - start);
};

/**
 * Remap a value from one range to another
 * @param value - The value to remap
 * @param inMin - Input range minimum
 * @param inMax - Input range maximum
 * @param outMin - Output range minimum
 * @param outMax - Output range maximum
 * @returns The remapped value
 */
export const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
};

/**
 * Calculate the percentile of a dataset
 * @param values - Array of numbers
 * @param p - Percentile to calculate (0-100)
 * @returns The value at the given percentile
 */
export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) throw new Error("Cannot calculate percentile of empty array");
  if (p < 0 || p > 100) throw new Error("Percentile must be between 0 and 100");
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

/**
 * Calculate the median of a dataset
 * @param values - Array of numbers
 * @returns The median value
 */
export const median = (values: number[]): number => {
  if (values.length === 0) throw new Error("Cannot calculate median of empty array");
  
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  
  return sorted[middle];
};

/**
 * Calculate the mode (most frequent value) of a dataset
 * @param values - Array of numbers
 * @returns The mode value
 */
export const mode = (values: number[]): number => {
  if (values.length === 0) throw new Error("Cannot calculate mode of empty array");
  
  const frequency = new Map<number, number>();
  let maxFreq = 0;
  let modeValue = values[0];
  
  for (const value of values) {
    const freq = (frequency.get(value) || 0) + 1;
    frequency.set(value, freq);
    
    if (freq > maxFreq) {
      maxFreq = freq;
      modeValue = value;
    }
  }
  
  return modeValue;
};

/**
 * Calculate the geometric mean of a dataset
 * @param values - Array of numbers
 * @returns The geometric mean
 */
export const geometricMean = (values: number[]): number => {
  if (values.length === 0) throw new Error("Cannot calculate geometric mean of empty array");
  if (values.some(v => v <= 0)) throw new Error("Geometric mean requires all positive values");
  
  const product = values.reduce((acc, val) => acc * val, 1);
  return Math.pow(product, 1 / values.length);
};

/**
 * Calculate the harmonic mean of a dataset
 * @param values - Array of numbers
 * @returns The harmonic mean
 */
export const harmonicMean = (values: number[]): number => {
  if (values.length === 0) throw new Error("Cannot calculate harmonic mean of empty array");
  if (values.some(v => v === 0)) throw new Error("Harmonic mean is undefined for zero values");
  
  const sumReciprocals = values.reduce((acc, val) => acc + 1 / val, 0);
  return values.length / sumReciprocals;
};

/**
 * Calculate the weighted average of a dataset
 * @param values - Array of numbers
 * @param weights - Array of weights corresponding to values
 * @returns The weighted average
 */
export const weightedAverage = (values: number[], weights: number[]): number => {
  if (values.length === 0) throw new Error("Cannot calculate weighted average of empty array");
  if (values.length !== weights.length) throw new Error("Values and weights arrays must have the same length");
  
  const sumWeightedValues = values.reduce((acc, val, i) => acc + val * weights[i], 0);
  const sumWeights = weights.reduce((acc, weight) => acc + weight, 0);
  
  if (sumWeights === 0) throw new Error("Sum of weights cannot be zero");
  
  return sumWeightedValues / sumWeights;
};

/**
 * Calculate compound interest
 * @param principal - The initial principal amount
 * @param rate - The interest rate per period (as a decimal, e.g., 0.05 for 5%)
 * @param periods - The number of compounding periods
 * @returns The final amount after compound interest
 */
export const compound = (principal: number, rate: number, periods: number): number => {
  return principal * Math.pow(1 + rate, periods);
};

/**
 * Calculate present value
 * @param futureValue - The future value
 * @param rate - The discount rate per period (as a decimal)
 * @param periods - The number of periods
 * @returns The present value
 */
export const presentValue = (futureValue: number, rate: number, periods: number): number => {
  return futureValue / Math.pow(1 + rate, periods);
};

/**
 * Calculate future value
 * @param presentValue - The present value
 * @param rate - The interest rate per period (as a decimal)
 * @param periods - The number of periods
 * @returns The future value
 */
export const futureValue = (presentValue: number, rate: number, periods: number): number => {
  return presentValue * Math.pow(1 + rate, periods);
};

/**
 * Calculate the golden ratio (phi)
 * @returns The golden ratio constant (≈ 1.618)
 */
export const calculatePhi = (): number => {
  return (1 + Math.sqrt(5)) / 2;
};

/**
 * Calculate a psi value (custom trading metric based on price momentum)
 * @param values - Array of price values
 * @returns Psi metric value
 */
export const calculatePsi = (values: number[]): number => {
  if (values.length < 2) throw new Error("Psi requires at least 2 values");
  
  let momentum = 0;
  for (let i = 1; i < values.length; i++) {
    momentum += (values[i] - values[i - 1]) / values[i - 1];
  }
  
  return momentum / (values.length - 1);
};

/**
 * Calculate omega ratio (gain/loss ratio)
 * @param returns - Array of return values
 * @param threshold - Threshold return (default 0)
 * @returns Omega ratio
 */
export const calculateOmega = (returns: number[], threshold: number = 0): number => {
  if (returns.length === 0) throw new Error("Omega requires at least one return value");
  
  let gains = 0;
  let losses = 0;
  
  for (const ret of returns) {
    const excess = ret - threshold;
    if (excess > 0) {
      gains += excess;
    } else {
      losses += Math.abs(excess);
    }
  }
  
  return losses === 0 ? Infinity : gains / losses;
};

/**
 * Calculate lambda (exponential decay factor)
 * @param halfLife - Half-life period
 * @returns Lambda decay constant
 */
export const calculateLambda = (halfLife: number): number => {
  if (halfLife <= 0) throw new Error("Half-life must be positive");
  return Math.log(2) / halfLife;
};

/**
 * Calculate xi (correlation coefficient between two datasets)
 * @param x - First dataset
 * @param y - Second dataset
 * @returns Correlation coefficient
 */
export const calculateXi = (x: number[], y: number[]): number => {
  if (x.length !== y.length) throw new Error("Datasets must have equal length");
  if (x.length === 0) throw new Error("Datasets cannot be empty");
  
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let sumXSq = 0;
  let sumYSq = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumXSq += dx * dx;
    sumYSq += dy * dy;
  }
  
  const denominator = Math.sqrt(sumXSq * sumYSq);
  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Calculate market entropy (Shannon entropy)
 * @param probabilities - Array of probability values (should sum to 1)
 * @returns Entropy value
 */
export const calculateMarketEntropy = (probabilities: number[]): number => {
  if (probabilities.length === 0) throw new Error("Probabilities array cannot be empty");
  
  const sum = probabilities.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error("Probabilities must sum to 1");
  }
  
  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  
  return entropy;
};