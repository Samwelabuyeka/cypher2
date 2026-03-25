/**
 * Mathematical constants and recursive formulas for trading optimization
 * Implements dynamic resource allocation, temporal folding, and entropy balance
 */

/**
 * Mathematical constants
 */
export const PHI = 1.618033988749895; // Golden ratio
export const E = 2.718281828459045; // Euler's number
export const DEFAULT_DECAY_RATE = 0.1;
export const DEFAULT_MAX_RECURSION_DEPTH = 5;

/**
 * Event type for temporal folding calculations
 */
export interface Event {
  time: number;
  impact: number;
}

/**
 * Calculate factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial of n
 */
function factorial(n: number): number {
  if (n < 0) {
    throw new Error("Factorial is not defined for negative numbers");
  }
  if (n === 0 || n === 1) {
    return 1;
  }
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Calculate Psi (Ψ) - Harmonic Asymmetry
 * Calculates dynamic resource allocation coefficient
 * 
 * Formula: Ψₙ(t) = φⁿ × (1 + α(t)/n!)
 * 
 * @param n - Recursion depth (strategy layer/hierarchy)
 * @param alpha - Growth factor (volatility, market stress)
 * @param t - Time parameter
 * @returns Scaling factor for position sizing
 */
export function calculatePsi(n: number, alpha: number, t: number): number {
  if (n < 0) {
    throw new Error("Recursion depth must be non-negative");
  }
  
  const phiPowerN = Math.pow(PHI, n);
  const alphaComponent = alpha * t / factorial(n);
  
  return phiPowerN * (1 + alphaComponent);
}

/**
 * Calculate Omega (Ω) - Temporal Folding
 * Weights early impactful events using exponential decay
 * 
 * Formula: Ωₜᵐ = Σ(weight × impact × e^(-decay × time))
 * 
 * @param m - Layer/domain index
 * @param events - Array of historical events with timestamps and impact scores
 * @param decayRate - Optional decay rate (default: 0.1)
 * @returns Temporal importance score
 */
export function calculateOmega(
  m: number,
  events: Event[],
  decayRate: number = DEFAULT_DECAY_RATE
): number {
  if (events.length === 0) {
    return 0;
  }
  
  // Calculate weighted sum with exponential decay
  const sum = events.reduce((acc, event) => {
    const weight = Math.pow(E, -decayRate * event.time);
    const contribution = weight * event.impact * Math.pow(E, -decayRate * event.time);
    return acc + contribution;
  }, 0);
  
  // Apply layer/domain factor
  return sum * Math.pow(PHI, m);
}

/**
 * Calculate Lambda (Λ) - Entropy Balance
 * Balances exploration vs exploitation in trading strategies
 * 
 * Formula: Λₙ,ₐ = (1/d) × Σ(φⁿ/(1 + entropy × n))
 * 
 * @param d - Number of dimensions/markets
 * @param n - Recursion level
 * @param entropy - Current system entropy (0-1)
 * @returns Exploration/exploitation balance ratio
 */
export function calculateLambda(d: number, n: number, entropy: number): number {
  if (d <= 0) {
    throw new Error("Number of dimensions must be positive");
  }
  if (n < 0) {
    throw new Error("Recursion level must be non-negative");
  }
  if (entropy < 0 || entropy > 1) {
    throw new Error("Entropy must be between 0 and 1");
  }
  
  // Sum over recursion levels from 1 to n
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const numerator = Math.pow(PHI, i);
    const denominator = 1 + entropy * i;
    sum += numerator / denominator;
  }
  
  return sum / d;
}

/**
 * Calculate Xi (Ξ) - Meta-constant for Stability
 * Combines Psi, Omega, and Lambda for system stability assessment
 * 
 * Formula: Ξₙ = (Ψₙ × Ωₜⁿ) / Λₙ
 * 
 * @param psi - Harmonic asymmetry value
 * @param omega - Temporal folding value
 * @param lambda - Entropy balance value
 * @returns System stability coefficient
 */
export function calculateXi(psi: number, omega: number, lambda: number): number {
  if (lambda === 0) {
    throw new Error("Lambda cannot be zero for Xi calculation");
  }
  
  return (psi * omega) / lambda;
}

/**
 * Calculate Phi (Φ) - Meta-constant for Potential
 * Measures growth potential based on Psi and Lambda
 * 
 * Formula: Φₙ = Ψₙ² × (1 - Λₙ)
 * 
 * @param n - Recursion level (used for context, though not directly in formula)
 * @param psi - Harmonic asymmetry value
 * @param lambda - Entropy balance value
 * @returns Growth potential coefficient
 */
export function calculatePhi(n: number, psi: number, lambda: number): number {
  const psiSquared = Math.pow(psi, 2);
  const lambdaFactor = 1 - lambda;
  
  return psiSquared * lambdaFactor;
}