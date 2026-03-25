/**
 * Quantum-Inspired Annealing Optimizer
 * 
 * Implements quantum annealing algorithm for portfolio optimization
 * inspired by D-Wave quantum computers.
 */

// Type definitions
export interface QuantumAnnealParams {
  initial_temp: number;
  cooling_rate: number;
  num_iterations: number;
  quantum_strength: number;
  quantum_coherence_initial?: number;
  quantum_frequency?: number;
}

export interface PortfolioConstraints {
  budget: number;
  min_position?: number;
  max_position?: number;
  min_assets?: number;
  max_assets?: number;
  diversification_penalty?: number;
}

export interface QuantumState {
  weights: number[];
  energy: number;
  iteration: number;
}

export interface QuantumPath {
  states: QuantumState[];
  energies: number[];
  tunneling_events: number[];
  temperatures: number[];
  acceptance_rate: number;
}

export type CoolingScheduleType = 'exponential' | 'linear' | 'logarithmic' | 'adaptive';

export type ObjectiveFunction = (state: number[]) => number;
export type ConstraintFunction = (state: number[]) => number;

/**
 * Cooling schedule for simulated annealing
 * Implements multiple cooling strategies
 */
export function coolingSchedule(
  iteration: number,
  max_iterations: number,
  initial_temp: number,
  schedule_type: CoolingScheduleType = 'exponential',
  acceptance_rate?: number
): number {
  const t = iteration / max_iterations;

  switch (schedule_type) {
    case 'exponential':
      // T = T0 * exp(-kt)
      const k = 5; // cooling constant
      return initial_temp * Math.exp(-k * t);

    case 'linear':
      // T = T0 * (1 - t/tmax)
      return initial_temp * (1 - t);

    case 'logarithmic':
      // T = T0 / log(1 + t)
      return initial_temp / Math.log(1 + iteration + 1);

    case 'adaptive':
      // Adjust based on acceptance rate
      if (acceptance_rate !== undefined) {
        // If acceptance rate is too high, cool faster
        // If too low, cool slower
        const target_rate = 0.3;
        const rate_factor = acceptance_rate > target_rate ? 1.2 : 0.8;
        return initial_temp * Math.exp(-k * t * rate_factor);
      }
      // Fallback to exponential
      return initial_temp * Math.exp(-5 * t);

    default:
      return initial_temp * Math.exp(-5 * t);
  }
}

/**
 * Calculate Hamiltonian energy function
 * Energy = risk_term + return_term + constraint_penalties
 */
export function calculateHamiltonian(
  state: number[],
  objective: ObjectiveFunction,
  constraints: ConstraintFunction[]
): number {
  // Base objective (risk/return)
  const objective_energy = objective(state);

  // Constraint penalties
  const constraint_energy = constraints.reduce((sum, constraint) => {
    const penalty = constraint(state);
    return sum + penalty;
  }, 0);

  return objective_energy + constraint_energy;
}

/**
 * Quantum tunneling probability
 * Allows transitions through energy barriers
 */
export function quantumTunnel(
  current_state: number[],
  next_state: number[],
  temperature: number,
  quantum_factor: number
): boolean {
  // Calculate barrier width (Euclidean distance between states)
  const barrier_width = Math.sqrt(
    current_state.reduce((sum, val, i) => {
      const diff = val - next_state[i];
      return sum + diff * diff;
    }, 0)
  );

  // Quantum tunneling probability increases with quantum_factor
  // and decreases with barrier width
  const tunneling_prob = quantum_factor * Math.exp(-barrier_width / (temperature + 1e-10));

  return Math.random() < tunneling_prob;
}

/**
 * Quantum fluctuation for state transitions
 * Adds quantum noise to escape local minima
 */
export function quantumFluctuation(
  temperature: number,
  quantum_strength: number
): number {
  // Quantum noise scaled by temperature and quantum strength
  const noise_scale = temperature * quantum_strength;
  
  // Box-Muller transform for Gaussian noise
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  return gaussian * noise_scale;
}

/**
 * Modified Metropolis acceptance with quantum effects
 */
export function quantumMetropolisStep(
  current_energy: number,
  new_energy: number,
  temperature: number,
  quantum_coherence: number
): boolean {
  const delta_energy = new_energy - current_energy;

  // Always accept better solutions
  if (delta_energy <= 0) {
    return true;
  }

  // Classical Metropolis probability
  const classical_prob = Math.exp(-delta_energy / (temperature + 1e-10));

  // Quantum modification - coherence allows additional acceptance
  const quantum_prob = classical_prob * (1 + quantum_coherence * 0.5);

  return Math.random() < quantum_prob;
}

/**
 * Generate neighboring state with quantum fluctuations
 */
function generateNeighborState(
  current_state: number[],
  temperature: number,
  quantum_strength: number,
  constraints: PortfolioConstraints
): number[] {
  const new_state = [...current_state];
  const n = new_state.length;

  // Randomly select assets to modify
  const num_changes = Math.max(1, Math.floor(Math.random() * Math.min(3, n)));

  for (let i = 0; i < num_changes; i++) {
    const idx = Math.floor(Math.random() * n);
    const fluctuation = quantumFluctuation(temperature, quantum_strength);
    new_state[idx] += fluctuation;
  }

  // Normalize to satisfy budget constraint
  const sum = new_state.reduce((a, b) => a + Math.abs(b), 0);
  if (sum > 0) {
    for (let i = 0; i < n; i++) {
      new_state[i] = (new_state[i] / sum) * constraints.budget;
    }
  }

  // Enforce position limits
  const min_pos = constraints.min_position ?? 0;
  const max_pos = constraints.max_position ?? constraints.budget;

  for (let i = 0; i < n; i++) {
    new_state[i] = Math.max(min_pos, Math.min(max_pos, new_state[i]));
  }

  return new_state;
}

/**
 * Main quantum annealing optimizer
 */
export function quantumAnneal(
  objective: ObjectiveFunction,
  constraints: ConstraintFunction[],
  params: QuantumAnnealParams,
  initial_state?: number[]
): QuantumPath {
  const {
    initial_temp,
    cooling_rate,
    num_iterations,
    quantum_strength,
    quantum_coherence_initial = 1.0,
    quantum_frequency = 0.1
  } = params;

  // Initialize state
  let current_state = initial_state ?? Array(10).fill(0).map(() => Math.random());
  let current_energy = calculateHamiltonian(current_state, objective, constraints);

  let best_state = [...current_state];
  let best_energy = current_energy;

  // Track optimization path
  const path: QuantumPath = {
    states: [{ weights: [...current_state], energy: current_energy, iteration: 0 }],
    energies: [current_energy],
    tunneling_events: [],
    temperatures: [],
    acceptance_rate: 0
  };

  let accepted_moves = 0;
  let total_moves = 0;

  // Annealing loop
  for (let iter = 0; iter < num_iterations; iter++) {
    // Update temperature
    const current_acceptance_rate = total_moves > 0 ? accepted_moves / total_moves : 0.5;
    const temperature = coolingSchedule(
      iter,
      num_iterations,
      initial_temp,
      'adaptive',
      current_acceptance_rate
    );

    // Quantum coherence oscillates over time
    const quantum_coherence = quantum_coherence_initial * Math.cos(quantum_frequency * iter);

    // Generate neighbor state (portfolio weights don't need constraints here)
    const neighbor_state = current_state.map((weight, i) => {
      const fluctuation = quantumFluctuation(temperature, quantum_strength);
      return weight + fluctuation;
    });

    // Normalize state
    const sum = neighbor_state.reduce((a, b) => a + Math.abs(b), 0);
    if (sum > 0) {
      for (let i = 0; i < neighbor_state.length; i++) {
        neighbor_state[i] = neighbor_state[i] / sum;
      }
    }

    const neighbor_energy = calculateHamiltonian(neighbor_state, objective, constraints);
    total_moves++;

    // Decide acceptance
    let accepted = false;

    // Try quantum tunneling first
    if (neighbor_energy > current_energy) {
      if (quantumTunnel(current_state, neighbor_state, temperature, quantum_strength)) {
        accepted = true;
        path.tunneling_events.push(iter);
      }
    }

    // If not tunneled, try Metropolis
    if (!accepted) {
      accepted = quantumMetropolisStep(
        current_energy,
        neighbor_energy,
        temperature,
        quantum_coherence
      );
    }

    if (accepted) {
      current_state = neighbor_state;
      current_energy = neighbor_energy;
      accepted_moves++;

      // Update best solution
      if (current_energy < best_energy) {
        best_state = [...current_state];
        best_energy = current_energy;
      }
    }

    // Track path every 10 iterations
    if (iter % 10 === 0) {
      path.states.push({
        weights: [...current_state],
        energy: current_energy,
        iteration: iter
      });
      path.energies.push(current_energy);
      path.temperatures.push(temperature);
    }
  }

  path.acceptance_rate = total_moves > 0 ? accepted_moves / total_moves : 0;

  // Add final best state
  path.states.push({
    weights: best_state,
    energy: best_energy,
    iteration: num_iterations
  });

  return path;
}

/**
 * Optimize portfolio using quantum annealing
 */
export function optimizePortfolioQuantum(
  assets: string[],
  expected_returns: number[],
  covariance_matrix: number[][],
  constraints: PortfolioConstraints,
  params?: Partial<QuantumAnnealParams>
): { weights: number[]; risk: number; return: number; sharpe: number } {
  const n = assets.length;

  // Default parameters
  const anneal_params: QuantumAnnealParams = {
    initial_temp: 10.0,
    cooling_rate: 0.95,
    num_iterations: 1000,
    quantum_strength: 0.5,
    quantum_coherence_initial: 1.0,
    quantum_frequency: 0.1,
    ...params
  };

  // Objective function: minimize risk, maximize return
  const lambda = 0.5; // risk aversion parameter
  const mu = 1.0; // return preference parameter

  const objective: ObjectiveFunction = (weights: number[]) => {
    // Calculate portfolio variance (risk)
    let variance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * covariance_matrix[i][j];
      }
    }

    // Calculate expected return
    const portfolio_return = weights.reduce((sum, w, i) => sum + w * expected_returns[i], 0);

    // Energy = risk_term - return_term
    return lambda * variance - mu * portfolio_return;
  };

  // Constraint functions
  const constraint_functions: ConstraintFunction[] = [];

  // Budget constraint penalty
  constraint_functions.push((weights: number[]) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    const penalty = Math.abs(sum - constraints.budget);
    return penalty * 1000; // High penalty for budget violation
  });

  // Position limits
  if (constraints.min_position !== undefined || constraints.max_position !== undefined) {
    constraint_functions.push((weights: number[]) => {
      const min_pos = constraints.min_position ?? 0;
      const max_pos = constraints.max_position ?? Infinity;
      let penalty = 0;
      for (const w of weights) {
        if (w < min_pos) penalty += (min_pos - w) * 100;
        if (w > max_pos) penalty += (w - max_pos) * 100;
      }
      return penalty;
    });
  }

  // Diversification constraint
  if (constraints.diversification_penalty !== undefined) {
    constraint_functions.push((weights: number[]) => {
      // Penalize concentration (Herfindahl index)
      const herfindahl = weights.reduce((sum, w) => sum + w * w, 0);
      return herfindahl * constraints.diversification_penalty!;
    });
  }

  // Initialize with equal weights
  const initial_state = Array(n).fill(constraints.budget / n);

  // Run quantum annealing
  const result = quantumAnneal(objective, constraint_functions, anneal_params, initial_state);

  // Get best solution
  const best_state = result.states[result.states.length - 1];
  const weights = best_state.weights;

  // Calculate metrics
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covariance_matrix[i][j];
    }
  }
  const risk = Math.sqrt(variance);

  const portfolio_return = weights.reduce((sum, w, i) => sum + w * expected_returns[i], 0);

  const sharpe = risk > 0 ? portfolio_return / risk : 0;

  return {
    weights,
    risk,
    return: portfolio_return,
    sharpe
  };
}

/**
 * Track and visualize quantum optimization path
 */
export function trackQuantumPath(
  states: QuantumState[],
  energies: number[],
  tunneling_events: number[]
): {
  convergence_data: { iteration: number; energy: number }[];
  tunneling_ratio: number;
  energy_reduction: number;
  path_summary: string;
} {
  const convergence_data = states.map((state, i) => ({
    iteration: state.iteration,
    energy: state.energy
  }));

  const total_iterations = states.length > 0 ? states[states.length - 1].iteration : 0;
  const tunneling_ratio = total_iterations > 0 ? tunneling_events.length / total_iterations : 0;

  const initial_energy = energies.length > 0 ? energies[0] : 0;
  const final_energy = energies.length > 0 ? energies[energies.length - 1] : 0;
  const energy_reduction = initial_energy - final_energy;

  const path_summary = `
Quantum Annealing Optimization Summary:
- Total iterations: ${total_iterations}
- Tunneling events: ${tunneling_events.length}
- Tunneling ratio: ${(tunneling_ratio * 100).toFixed(2)}%
- Initial energy: ${initial_energy.toFixed(4)}
- Final energy: ${final_energy.toFixed(4)}
- Energy reduction: ${energy_reduction.toFixed(4)}
- Improvement: ${((energy_reduction / Math.abs(initial_energy)) * 100).toFixed(2)}%
  `.trim();

  return {
    convergence_data,
    tunneling_ratio,
    energy_reduction,
    path_summary
  };
}