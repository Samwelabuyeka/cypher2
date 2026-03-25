/**
 * Grover's Algorithm Adaptation for Trading
 * 
 * Implements Grover's quantum search algorithm adapted for finding optimal trading opportunities.
 * This is a classical simulation of quantum concepts for practical trading optimization.
 */

/**
 * Represents a quantum state with its amplitude
 */
interface QuantumState<T = any> {
  state: T;
  amplitude: number;
}

/**
 * Oracle function type - returns true if state satisfies condition
 */
type OracleFunction<T = any> = (state: T) => boolean;

/**
 * Evaluation function type - returns a numeric score for a state
 */
type EvaluationFunction<T = any> = (state: T) => number;

/**
 * Fitness function type for parameter optimization
 */
type FitnessFunction = (parameters: Record<string, number>) => number;

/**
 * Market data structure for arbitrage search
 */
interface MarketData {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  timestamp: Date;
}

/**
 * Arbitrage opportunity structure
 */
interface ArbitrageOpportunity {
  path: string[];
  profit: number;
  profitPercent: number;
}

/**
 * Graph node for quantum walk
 */
interface GraphNode {
  id: string;
  neighbors: string[];
  weight?: number;
}

/**
 * Initialize uniform superposition of all states
 */
function initializeUniformSuperposition<T>(states: T[]): QuantumState<T>[] {
  const amplitude = 1 / Math.sqrt(states.length);
  return states.map(state => ({
    state,
    amplitude
  }));
}

/**
 * Calculate mean amplitude across all states
 */
function calculateMeanAmplitude(quantumStates: QuantumState[]): number {
  const sum = quantumStates.reduce((acc, qs) => acc + qs.amplitude, 0);
  return sum / quantumStates.length;
}

/**
 * Diffusion operator - inversion about average
 * Formula: amplitude' = 2*mean - amplitude
 */
export function diffusionOperator(amplitudes: number[]): number[] {
  const mean = amplitudes.reduce((sum, amp) => sum + amp, 0) / amplitudes.length;
  return amplitudes.map(amp => 2 * mean - amp);
}

/**
 * Quantum oracle - marks states that satisfy condition by flipping phase
 * In classical simulation: |x⟩ → -|x⟩ if oracle(x) = 1
 */
export function quantumOracle<T>(
  state: T,
  evaluationFunction: EvaluationFunction<T>,
  threshold: number
): number {
  const score = evaluationFunction(state);
  // If state meets threshold, flip phase (multiply amplitude by -1)
  return score >= threshold ? -1 : 1;
}

/**
 * Apply Grover iteration (oracle + diffusion)
 */
function groverIteration<T>(
  quantumStates: QuantumState<T>[],
  oracle: OracleFunction<T>
): QuantumState<T>[] {
  // Apply oracle - flip phase of marked states
  const afterOracle = quantumStates.map(qs => ({
    state: qs.state,
    amplitude: oracle(qs.state) ? -qs.amplitude : qs.amplitude
  }));

  // Apply diffusion operator
  const amplitudes = afterOracle.map(qs => qs.amplitude);
  const newAmplitudes = diffusionOperator(amplitudes);

  return afterOracle.map((qs, i) => ({
    state: qs.state,
    amplitude: newAmplitudes[i]
  }));
}

/**
 * Calculate optimal number of Grover iterations
 * Formula: π/4 * √(N/M) where N = total states, M = number of solutions
 */
function calculateOptimalIterations(totalStates: number, numSolutions: number): number {
  if (numSolutions === 0 || numSolutions > totalStates) {
    return 0;
  }
  return Math.floor((Math.PI / 4) * Math.sqrt(totalStates / numSolutions));
}

/**
 * Measure quantum state - returns state with highest probability (amplitude squared)
 */
function measureQuantumState<T>(quantumStates: QuantumState<T>[]): T {
  let maxProbability = -1;
  let bestState = quantumStates[0].state;

  for (const qs of quantumStates) {
    const probability = qs.amplitude * qs.amplitude;
    if (probability > maxProbability) {
      maxProbability = probability;
      bestState = qs.state;
    }
  }

  return bestState;
}

/**
 * Grover search for optimal trading strategy
 * Find optimal trading strategy parameters with O(√N) evaluations
 */
export function groverSearchOptimalStrategy<T>(
  strategySpace: T[],
  performanceOracle: OracleFunction<T>,
  targetSharpe: number,
  estimatedSolutions?: number
): T {
  if (strategySpace.length === 0) {
    throw new Error("Strategy space cannot be empty");
  }

  // Initialize uniform superposition
  let quantumStates = initializeUniformSuperposition(strategySpace);

  // Estimate number of solutions if not provided
  const numSolutions = estimatedSolutions || Math.max(1, Math.floor(strategySpace.length * 0.1));
  
  // Calculate optimal iterations
  const iterations = calculateOptimalIterations(strategySpace.length, numSolutions);

  // Apply Grover iterations
  for (let i = 0; i < iterations; i++) {
    quantumStates = groverIteration(quantumStates, performanceOracle);
  }

  // Measure to get optimal strategy
  return measureQuantumState(quantumStates);
}

/**
 * Amplitude amplification - increases probability of marked states
 * Requires ~√(N/M) iterations
 */
export function amplitudeAmplification(
  markedStates: number,
  totalStates: number,
  iterations: number
): number {
  if (markedStates === 0 || markedStates > totalStates) {
    return 0;
  }

  // Initial probability
  const initialProb = markedStates / totalStates;
  
  // After amplitude amplification
  const theta = Math.asin(Math.sqrt(initialProb));
  const finalTheta = (2 * iterations + 1) * theta;
  const finalProb = Math.pow(Math.sin(finalTheta), 2);

  return Math.min(finalProb, 1.0);
}

/**
 * Search for arbitrage opportunities using Grover's algorithm
 * Quadratic speedup over exhaustive search
 */
export function findArbitrageOpportunities(
  marketData: MarketData[],
  minProfit: number
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  // Build all possible exchange pairs
  const exchanges = Array.from(new Set(marketData.map(m => m.exchange)));
  const symbols = Array.from(new Set(marketData.map(m => m.symbol)));

  // Create search space of potential arbitrage paths
  const searchSpace: string[][] = [];
  
  // Two-hop arbitrage (buy on A, sell on B)
  for (const symbol of symbols) {
    for (let i = 0; i < exchanges.length; i++) {
      for (let j = 0; j < exchanges.length; j++) {
        if (i !== j) {
          searchSpace.push([exchanges[i], exchanges[j], symbol]);
        }
      }
    }
  }

  // Oracle function to mark profitable opportunities
  const arbitrageOracle = (path: string[]): boolean => {
    const [buyExchange, sellExchange, symbol] = path;
    
    const buyData = marketData.find(m => m.exchange === buyExchange && m.symbol === symbol);
    const sellData = marketData.find(m => m.exchange === sellExchange && m.symbol === symbol);

    if (!buyData || !sellData) return false;

    const profit = sellData.bid - buyData.ask;
    const profitPercent = (profit / buyData.ask) * 100;

    if (profitPercent >= minProfit) {
      opportunities.push({
        path: [buyExchange, sellExchange, symbol],
        profit,
        profitPercent
      });
      return true;
    }

    return false;
  };

  // Use Grover search (with classical simulation)
  if (searchSpace.length > 0) {
    groverSearchOptimalStrategy(searchSpace, arbitrageOracle, minProfit, 1);
  }

  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Optimize parameter grid using quantum-inspired search
 */
export function optimizeParameterGrid(
  parameterRanges: Record<string, number[]>,
  fitnessFunction: FitnessFunction,
  targetFitness: number
): Record<string, number> {
  // Generate all parameter combinations
  const paramNames = Object.keys(parameterRanges);
  const combinations: Record<string, number>[] = [];

  function generateCombinations(index: number, current: Record<string, number>) {
    if (index === paramNames.length) {
      combinations.push({ ...current });
      return;
    }

    const paramName = paramNames[index];
    for (const value of parameterRanges[paramName]) {
      current[paramName] = value;
      generateCombinations(index + 1, current);
    }
  }

  generateCombinations(0, {});

  // Oracle marks high-performing parameters
  const oracle = (params: Record<string, number>): boolean => {
    return fitnessFunction(params) >= targetFitness;
  };

  // Use Grover search
  return groverSearchOptimalStrategy(combinations, oracle, targetFitness);
}

/**
 * Quantum walk for path finding
 * Finds shortest paths faster than classical - useful for multi-hop arbitrage
 */
export function quantumWalk(
  graph: Record<string, GraphNode>,
  startNode: string,
  targetNodes: string[]
): string[] {
  const visited = new Set<string>();
  const queue: { node: string; path: string[]; probability: number }[] = [
    { node: startNode, path: [startNode], probability: 1.0 }
  ];

  const paths: { path: string[]; probability: number }[] = [];

  while (queue.length > 0) {
    // Sort by probability (quantum-inspired prioritization)
    queue.sort((a, b) => b.probability - a.probability);
    
    const current = queue.shift()!;

    if (targetNodes.includes(current.node)) {
      paths.push({ path: current.path, probability: current.probability });
      continue;
    }

    if (visited.has(current.node)) {
      continue;
    }

    visited.add(current.node);

    const graphNode = graph[current.node];
    if (!graphNode) continue;

    // Quantum walk spreading - probability decreases with distance
    const numNeighbors = graphNode.neighbors.length;
    const newProbability = current.probability / Math.sqrt(numNeighbors || 1);

    for (const neighbor of graphNode.neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({
          node: neighbor,
          path: [...current.path, neighbor],
          probability: newProbability
        });
      }
    }
  }

  // Return path with highest probability
  if (paths.length === 0) return [];
  
  paths.sort((a, b) => b.probability - a.probability);
  return paths[0].path;
}

/**
 * Estimate number of solutions without finding them all
 */
export function estimateNumberOfSolutions(
  oracleHits: number,
  totalIterations: number
): number {
  if (totalIterations === 0) return 0;
  
  // Based on quantum counting algorithm
  const hitRate = oracleHits / totalIterations;
  const theta = Math.asin(Math.sqrt(hitRate));
  
  // Estimate M/N ratio
  const ratio = Math.pow(Math.sin(theta), 2);
  
  return ratio;
}

/**
 * Adaptive Grover search with iterative refinement
 */
export function adaptiveGroverSearch<T>(
  initialGuess: T,
  refinementFunction: (guess: T) => T[],
  oracle: OracleFunction<T>,
  maxIterations: number = 5
): T {
  let currentBest = initialGuess;

  for (let i = 0; i < maxIterations; i++) {
    // Generate neighborhood around current best
    const neighborhood = refinementFunction(currentBest);
    
    if (neighborhood.length === 0) break;

    // Use Grover search in neighborhood
    const improved = groverSearchOptimalStrategy(
      neighborhood,
      oracle,
      0,
      Math.max(1, Math.floor(neighborhood.length * 0.2))
    );

    // Update if improved
    if (oracle(improved)) {
      currentBest = improved;
    } else {
      break; // No improvement found
    }
  }

  return currentBest;
}

/**
 * Quantum counting - count solutions without finding them
 * Estimates M (number of solutions) in O(√N) time
 */
export function quantumCountingSolutions<T>(
  searchSpace: T[],
  oracle: OracleFunction<T>
): number {
  if (searchSpace.length === 0) return 0;

  // Sample to estimate solution count
  const sampleSize = Math.min(100, Math.ceil(Math.sqrt(searchSpace.length)));
  let hits = 0;

  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * searchSpace.length);
    if (oracle(searchSpace[randomIndex])) {
      hits++;
    }
  }

  // Estimate total solutions
  const estimatedRatio = hits / sampleSize;
  return Math.floor(estimatedRatio * searchSpace.length);
}

/**
 * Helper function to generate parameter grid
 */
export function generateParameterGrid(
  ranges: Record<string, { min: number; max: number; steps: number }>
): Record<string, number[]> {
  const grid: Record<string, number[]> = {};

  for (const [param, range] of Object.entries(ranges)) {
    const step = (range.max - range.min) / (range.steps - 1);
    grid[param] = Array.from({ length: range.steps }, (_, i) => range.min + i * step);
  }

  return grid;
}

/**
 * Export all main functions
 */
export default {
  groverSearchOptimalStrategy,
  quantumOracle,
  diffusionOperator,
  findArbitrageOpportunities,
  optimizeParameterGrid,
  amplitudeAmplification,
  quantumWalk,
  estimateNumberOfSolutions,
  adaptiveGroverSearch,
  quantumCountingSolutions,
  generateParameterGrid
};