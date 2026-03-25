/**
 * Evolutionary Strategy for Agent Optimization
 * Implements multiple evolutionary algorithms for trading strategy optimization
 */

// ============================================================================
// Interfaces and Types
// ============================================================================

export interface ParameterRange {
  min: number;
  max: number;
  type?: 'continuous' | 'discrete' | 'integer';
}

export interface ParameterRanges {
  [key: string]: ParameterRange;
}

export interface Genome {
  parameters: Record<string, number>;
  fitness: number;
  generation: number;
  id?: string;
}

export interface Particle {
  position: Record<string, number>;
  velocity: Record<string, number>;
  personalBest: {
    position: Record<string, number>;
    fitness: number;
  };
  fitness: number;
}

export interface MarketData {
  prices: number[];
  volumes: number[];
  timestamps: number[];
  indicators?: Record<string, number[]>;
}

export type SelectionMethod = 'tournament' | 'roulette' | 'rank';
export type CrossoverMethod = 'single-point' | 'multi-point' | 'uniform';
export type MutationMethod = 'gaussian' | 'uniform';
export type DifferentialEvolutionStrategy = 'rand/1' | 'best/1' | 'current-to-best';

// ============================================================================
// Utility Functions
// ============================================================================

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// Genetic Algorithm
// ============================================================================

export class GeneticAlgorithm {
  private parameterRanges: ParameterRanges;
  private population: Genome[] = [];
  private generation: number = 0;
  private mutationRate: number;
  private crossoverRate: number;
  private elitismCount: number;
  private adaptiveMutation: boolean;

  constructor(
    parameterRanges: ParameterRanges,
    config: {
      mutationRate?: number;
      crossoverRate?: number;
      elitismCount?: number;
      adaptiveMutation?: boolean;
    } = {}
  ) {
    this.parameterRanges = parameterRanges;
    this.mutationRate = config.mutationRate ?? 0.1;
    this.crossoverRate = config.crossoverRate ?? 0.8;
    this.elitismCount = config.elitismCount ?? 2;
    this.adaptiveMutation = config.adaptiveMutation ?? true;
  }

  initializePopulation(size: number): Genome[] {
    this.population = [];
    for (let i = 0; i < size; i++) {
      const parameters: Record<string, number> = {};
      for (const [key, range] of Object.entries(this.parameterRanges)) {
        let value = randomInRange(range.min, range.max);
        if (range.type === 'integer') {
          value = Math.round(value);
        }
        parameters[key] = value;
      }
      this.population.push({
        parameters,
        fitness: 0,
        generation: 0,
        id: generateId(),
      });
    }
    return this.population;
  }

  evaluateFitness(genome: Genome, marketData: MarketData): number {
    // This is a placeholder fitness function
    // In practice, this would run a backtest or simulation
    return this.calculateFitness(genome.parameters, marketData);
  }

  private calculateFitness(parameters: Record<string, number>, marketData: MarketData): number {
    // Example fitness calculation based on strategy parameters
    // This should be replaced with actual backtesting logic
    let score = 0;
    const priceChanges = marketData.prices.slice(1).map((p, i) => p - marketData.prices[i]);
    
    // Simple momentum-based fitness (placeholder)
    const momentum = parameters.momentum ?? 0.5;
    const threshold = parameters.threshold ?? 0.01;
    
    for (let i = 0; i < priceChanges.length - 1; i++) {
      const signal = priceChanges[i] * momentum;
      const nextChange = priceChanges[i + 1];
      if (Math.abs(signal) > threshold) {
        score += signal * nextChange;
      }
    }
    
    return score;
  }

  selection(method: SelectionMethod = 'tournament', tournamentSize: number = 3): Genome {
    if (method === 'tournament') {
      return this.tournamentSelection(tournamentSize);
    } else if (method === 'roulette') {
      return this.rouletteWheelSelection();
    } else {
      return this.rankSelection();
    }
  }

  private tournamentSelection(tournamentSize: number): Genome {
    let best: Genome | null = null;
    for (let i = 0; i < tournamentSize; i++) {
      const candidate = this.population[Math.floor(Math.random() * this.population.length)];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best!;
  }

  private rouletteWheelSelection(): Genome {
    const totalFitness = this.population.reduce((sum, g) => sum + Math.max(0, g.fitness), 0);
    let random = Math.random() * totalFitness;
    for (const genome of this.population) {
      random -= Math.max(0, genome.fitness);
      if (random <= 0) {
        return genome;
      }
    }
    return this.population[this.population.length - 1];
  }

  private rankSelection(): Genome {
    const sorted = [...this.population].sort((a, b) => b.fitness - a.fitness);
    const totalRank = (sorted.length * (sorted.length + 1)) / 2;
    let random = Math.random() * totalRank;
    for (let i = 0; i < sorted.length; i++) {
      random -= sorted.length - i;
      if (random <= 0) {
        return sorted[i];
      }
    }
    return sorted[sorted.length - 1];
  }

  crossover(parent1: Genome, parent2: Genome, method: CrossoverMethod = 'uniform'): Genome[] {
    if (Math.random() > this.crossoverRate) {
      return [parent1, parent2];
    }

    if (method === 'single-point') {
      return this.singlePointCrossover(parent1, parent2);
    } else if (method === 'multi-point') {
      return this.multiPointCrossover(parent1, parent2);
    } else {
      return this.uniformCrossover(parent1, parent2);
    }
  }

  private singlePointCrossover(parent1: Genome, parent2: Genome): Genome[] {
    const keys = Object.keys(parent1.parameters);
    const crossoverPoint = Math.floor(Math.random() * keys.length);
    
    const child1Parameters: Record<string, number> = {};
    const child2Parameters: Record<string, number> = {};
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i < crossoverPoint) {
        child1Parameters[key] = parent1.parameters[key];
        child2Parameters[key] = parent2.parameters[key];
      } else {
        child1Parameters[key] = parent2.parameters[key];
        child2Parameters[key] = parent1.parameters[key];
      }
    }
    
    return [
      { parameters: child1Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
      { parameters: child2Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
    ];
  }

  private multiPointCrossover(parent1: Genome, parent2: Genome, points: number = 2): Genome[] {
    const keys = Object.keys(parent1.parameters);
    const crossoverPoints = Array.from({ length: points }, () => Math.floor(Math.random() * keys.length)).sort((a, b) => a - b);
    
    const child1Parameters: Record<string, number> = {};
    const child2Parameters: Record<string, number> = {};
    
    let useParent1 = true;
    let pointIndex = 0;
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (pointIndex < crossoverPoints.length && i >= crossoverPoints[pointIndex]) {
        useParent1 = !useParent1;
        pointIndex++;
      }
      
      if (useParent1) {
        child1Parameters[key] = parent1.parameters[key];
        child2Parameters[key] = parent2.parameters[key];
      } else {
        child1Parameters[key] = parent2.parameters[key];
        child2Parameters[key] = parent1.parameters[key];
      }
    }
    
    return [
      { parameters: child1Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
      { parameters: child2Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
    ];
  }

  private uniformCrossover(parent1: Genome, parent2: Genome): Genome[] {
    const child1Parameters: Record<string, number> = {};
    const child2Parameters: Record<string, number> = {};
    
    for (const key of Object.keys(parent1.parameters)) {
      if (Math.random() < 0.5) {
        child1Parameters[key] = parent1.parameters[key];
        child2Parameters[key] = parent2.parameters[key];
      } else {
        child1Parameters[key] = parent2.parameters[key];
        child2Parameters[key] = parent1.parameters[key];
      }
    }
    
    return [
      { parameters: child1Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
      { parameters: child2Parameters, fitness: 0, generation: this.generation + 1, id: generateId() },
    ];
  }

  mutate(genome: Genome, method: MutationMethod = 'gaussian'): Genome {
    const mutationRate = this.adaptiveMutation ? this.getAdaptiveMutationRate() : this.mutationRate;
    const mutatedParameters: Record<string, number> = { ...genome.parameters };
    
    for (const [key, value] of Object.entries(mutatedParameters)) {
      if (Math.random() < mutationRate) {
        const range = this.parameterRanges[key];
        if (method === 'gaussian') {
          const stdDev = (range.max - range.min) * 0.1;
          const mutation = this.gaussianRandom(0, stdDev);
          mutatedParameters[key] = clampToRange(value + mutation, range.min, range.max);
        } else {
          mutatedParameters[key] = randomInRange(range.min, range.max);
        }
        
        if (range.type === 'integer') {
          mutatedParameters[key] = Math.round(mutatedParameters[key]);
        }
      }
    }
    
    return {
      parameters: mutatedParameters,
      fitness: 0,
      generation: this.generation + 1,
      id: generateId(),
    };
  }

  private gaussianRandom(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
  }

  private getAdaptiveMutationRate(): number {
    // Adaptive mutation based on population diversity
    const avgFitness = this.population.reduce((sum, g) => sum + g.fitness, 0) / this.population.length;
    const fitnessVariance = this.population.reduce((sum, g) => sum + Math.pow(g.fitness - avgFitness, 2), 0) / this.population.length;
    
    // Lower mutation rate when diversity is high, higher when it's low
    const diversityFactor = Math.max(0.01, Math.min(0.5, 1 / (1 + fitnessVariance)));
    return this.mutationRate * (0.5 + diversityFactor);
  }

  evolveGeneration(
    selectionMethod: SelectionMethod = 'tournament',
    crossoverMethod: CrossoverMethod = 'uniform',
    mutationMethod: MutationMethod = 'gaussian'
  ): Genome[] {
    // Sort population by fitness
    this.population.sort((a, b) => b.fitness - a.fitness);
    
    // Preserve elite
    const newPopulation: Genome[] = this.population.slice(0, this.elitismCount).map(g => ({
      ...g,
      generation: this.generation + 1,
    }));
    
    // Generate offspring
    while (newPopulation.length < this.population.length) {
      const parent1 = this.selection(selectionMethod);
      const parent2 = this.selection(selectionMethod);
      
      const [child1, child2] = this.crossover(parent1, parent2, crossoverMethod);
      
      const mutatedChild1 = this.mutate(child1, mutationMethod);
      newPopulation.push(mutatedChild1);
      
      if (newPopulation.length < this.population.length) {
        const mutatedChild2 = this.mutate(child2, mutationMethod);
        newPopulation.push(mutatedChild2);
      }
    }
    
    this.population = newPopulation;
    this.generation++;
    
    return this.population;
  }

  getPopulation(): Genome[] {
    return this.population;
  }

  getBestGenome(): Genome | null {
    if (this.population.length === 0) return null;
    return this.population.reduce((best, current) => current.fitness > best.fitness ? current : best);
  }

  getGeneration(): number {
    return this.generation;
  }
}

// ============================================================================
// Strategy Evolver
// ============================================================================

export class StrategyEvolver {
  private ga: GeneticAlgorithm;
  private bestGenomes: Genome[] = [];
  private maxBestGenomes: number;
  private marketRegime: string = 'normal';

  constructor(
    parameterRanges: ParameterRanges,
    config: {
      populationSize?: number;
      mutationRate?: number;
      crossoverRate?: number;
      elitismCount?: number;
      maxBestGenomes?: number;
    } = {}
  ) {
    this.ga = new GeneticAlgorithm(parameterRanges, {
      mutationRate: config.mutationRate,
      crossoverRate: config.crossoverRate,
      elitismCount: config.elitismCount,
    });
    this.maxBestGenomes = config.maxBestGenomes ?? 10;
    
    const populationSize = config.populationSize ?? 50;
    this.ga.initializePopulation(populationSize);
  }

  async evolveStrategy(
    marketData: MarketData,
    generations: number,
    onGenerationComplete?: (generation: number, best: Genome) => void
  ): Promise<Genome> {
    for (let gen = 0; gen < generations; gen++) {
      // Evaluate fitness for all genomes
      const population = this.ga.getPopulation();
      for (const genome of population) {
        genome.fitness = this.ga.evaluateFitness(genome, marketData);
      }
      
      // Track best genome
      const best = this.ga.getBestGenome();
      if (best) {
        this.trackBestGenome(best);
        if (onGenerationComplete) {
          onGenerationComplete(gen, best);
        }
      }
      
      // Evolve to next generation
      this.ga.evolveGeneration();
    }
    
    return this.ga.getBestGenome()!;
  }

  trackBestGenome(genome: Genome): void {
    this.bestGenomes.push({ ...genome });
    this.bestGenomes.sort((a, b) => b.fitness - a.fitness);
    if (this.bestGenomes.length > this.maxBestGenomes) {
      this.bestGenomes = this.bestGenomes.slice(0, this.maxBestGenomes);
    }
  }

  getBestGenomes(): Genome[] {
    return this.bestGenomes;
  }

  adaptToMarketRegime(regime: string, marketData: MarketData): void {
    this.marketRegime = regime;
    
    // Adjust mutation and crossover rates based on regime
    // This is a simplified example
    if (regime === 'volatile') {
      // Increase mutation in volatile markets
      (this.ga as any).mutationRate = 0.2;
      (this.ga as any).crossoverRate = 0.7;
    } else if (regime === 'trending') {
      // Decrease mutation in trending markets
      (this.ga as any).mutationRate = 0.05;
      (this.ga as any).crossoverRate = 0.9;
    } else {
      // Normal rates
      (this.ga as any).mutationRate = 0.1;
      (this.ga as any).crossoverRate = 0.8;
    }
  }

  getMarketRegime(): string {
    return this.marketRegime;
  }
}

// ============================================================================
// Particle Swarm Optimization
// ============================================================================

export class ParticleSwarmOptimization {
  private particles: Particle[] = [];
  private globalBest: {
    position: Record<string, number>;
    fitness: number;
  } | null = null;
  private parameterRanges: ParameterRanges;
  private inertiaWeight: number;
  private cognitiveWeight: number;
  private socialWeight: number;

  constructor(
    parameterRanges: ParameterRanges,
    config: {
      swarmSize?: number;
      inertiaWeight?: number;
      cognitiveWeight?: number;
      socialWeight?: number;
    } = {}
  ) {
    this.parameterRanges = parameterRanges;
    this.inertiaWeight = config.inertiaWeight ?? 0.7;
    this.cognitiveWeight = config.cognitiveWeight ?? 1.5;
    this.socialWeight = config.socialWeight ?? 1.5;
    
    const swarmSize = config.swarmSize ?? 30;
    this.initializeSwarm(swarmSize);
  }

  private initializeSwarm(size: number): void {
    for (let i = 0; i < size; i++) {
      const position: Record<string, number> = {};
      const velocity: Record<string, number> = {};
      
      for (const [key, range] of Object.entries(this.parameterRanges)) {
        position[key] = randomInRange(range.min, range.max);
        velocity[key] = randomInRange(-(range.max - range.min) * 0.1, (range.max - range.min) * 0.1);
      }
      
      this.particles.push({
        position,
        velocity,
        personalBest: {
          position: { ...position },
          fitness: -Infinity,
        },
        fitness: -Infinity,
      });
    }
  }

  evaluateFitness(particle: Particle, fitnessFunction: (params: Record<string, number>) => number): void {
    particle.fitness = fitnessFunction(particle.position);
    
    if (particle.fitness > particle.personalBest.fitness) {
      particle.personalBest = {
        position: { ...particle.position },
        fitness: particle.fitness,
      };
    }
    
    if (!this.globalBest || particle.fitness > this.globalBest.fitness) {
      this.globalBest = {
        position: { ...particle.position },
        fitness: particle.fitness,
      };
    }
  }

  updateVelocity(particle: Particle): void {
    if (!this.globalBest) return;
    
    for (const key of Object.keys(particle.position)) {
      const r1 = Math.random();
      const r2 = Math.random();
      
      const cognitive = this.cognitiveWeight * r1 * (particle.personalBest.position[key] - particle.position[key]);
      const social = this.socialWeight * r2 * (this.globalBest.position[key] - particle.position[key]);
      
      particle.velocity[key] = this.inertiaWeight * particle.velocity[key] + cognitive + social;
      
      // Limit velocity
      const range = this.parameterRanges[key];
      const maxVelocity = (range.max - range.min) * 0.2;
      particle.velocity[key] = clampToRange(particle.velocity[key], -maxVelocity, maxVelocity);
    }
  }

  updatePosition(particle: Particle): void {
    for (const [key, range] of Object.entries(this.parameterRanges)) {
      particle.position[key] += particle.velocity[key];
      particle.position[key] = clampToRange(particle.position[key], range.min, range.max);
      
      if (range.type === 'integer') {
        particle.position[key] = Math.round(particle.position[key]);
      }
    }
  }

  optimize(
    fitnessFunction: (params: Record<string, number>) => number,
    iterations: number,
    onIterationComplete?: (iteration: number, globalBest: { position: Record<string, number>; fitness: number }) => void
  ): Record<string, number> {
    for (let iter = 0; iter < iterations; iter++) {
      for (const particle of this.particles) {
        this.evaluateFitness(particle, fitnessFunction);
        this.updateVelocity(particle);
        this.updatePosition(particle);
      }
      
      if (onIterationComplete && this.globalBest) {
        onIterationComplete(iter, this.globalBest);
      }
    }
    
    return this.globalBest!.position;
  }

  getGlobalBest(): { position: Record<string, number>; fitness: number } | null {
    return this.globalBest;
  }

  getParticles(): Particle[] {
    return this.particles;
  }
}

// ============================================================================
// Differential Evolution
// ============================================================================

export class DifferentialEvolution {
  private population: Genome[] = [];
  private parameterRanges: ParameterRanges;
  private mutationFactor: number;
  private crossoverProbability: number;
  private strategy: DifferentialEvolutionStrategy;

  constructor(
    parameterRanges: ParameterRanges,
    config: {
      populationSize?: number;
      mutationFactor?: number;
      crossoverProbability?: number;
      strategy?: DifferentialEvolutionStrategy;
    } = {}
  ) {
    this.parameterRanges = parameterRanges;
    this.mutationFactor = config.mutationFactor ?? 0.8;
    this.crossoverProbability = config.crossoverProbability ?? 0.9;
    this.strategy = config.strategy ?? 'rand/1';
    
    const populationSize = config.populationSize ?? 50;
    this.initializePopulation(populationSize);
  }

  private initializePopulation(size: number): void {
    for (let i = 0; i < size; i++) {
      const parameters: Record<string, number> = {};
      for (const [key, range] of Object.entries(this.parameterRanges)) {
        parameters[key] = randomInRange(range.min, range.max);
        if (range.type === 'integer') {
          parameters[key] = Math.round(parameters[key]);
        }
      }
      this.population.push({
        parameters,
        fitness: 0,
        generation: 0,
        id: generateId(),
      });
    }
  }

  private selectRandomIndices(exclude: number, count: number): number[] {
    const indices: number[] = [];
    while (indices.length < count) {
      const idx = Math.floor(Math.random() * this.population.length);
      if (idx !== exclude && !indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices;
  }

  private mutate(targetIndex: number): Record<string, number> {
    const mutant: Record<string, number> = {};
    
    if (this.strategy === 'rand/1') {
      const [r1, r2, r3] = this.selectRandomIndices(targetIndex, 3);
      for (const key of Object.keys(this.parameterRanges)) {
        mutant[key] = this.population[r1].parameters[key] +
          this.mutationFactor * (this.population[r2].parameters[key] - this.population[r3].parameters[key]);
      }
    } else if (this.strategy === 'best/1') {
      const best = this.population.reduce((b, g) => g.fitness > b.fitness ? g : b);
      const [r1, r2] = this.selectRandomIndices(targetIndex, 2);
      for (const key of Object.keys(this.parameterRanges)) {
        mutant[key] = best.parameters[key] +
          this.mutationFactor * (this.population[r1].parameters[key] - this.population[r2].parameters[key]);
      }
    } else { // current-to-best
      const best = this.population.reduce((b, g) => g.fitness > b.fitness ? g : b);
      const [r1, r2] = this.selectRandomIndices(targetIndex, 2);
      const current = this.population[targetIndex].parameters;
      for (const key of Object.keys(this.parameterRanges)) {
        mutant[key] = current[key] +
          this.mutationFactor * (best.parameters[key] - current[key]) +
          this.mutationFactor * (this.population[r1].parameters[key] - this.population[r2].parameters[key]);
      }
    }
    
    // Ensure bounds
    for (const [key, range] of Object.entries(this.parameterRanges)) {
      mutant[key] = clampToRange(mutant[key], range.min, range.max);
      if (range.type === 'integer') {
        mutant[key] = Math.round(mutant[key]);
      }
    }
    
    return mutant;
  }

  private crossover(target: Record<string, number>, mutant: Record<string, number>): Record<string, number> {
    const trial: Record<string, number> = {};
    const keys = Object.keys(target);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    
    for (const key of keys) {
      if (Math.random() < this.crossoverProbability || key === randomKey) {
        trial[key] = mutant[key];
      } else {
        trial[key] = target[key];
      }
    }
    
    return trial;
  }

  optimizeParameters(
    fitnessFunction: (params: Record<string, number>) => number,
    generations: number,
    onGenerationComplete?: (generation: number, best: Genome) => void
  ): Genome {
    for (let gen = 0; gen < generations; gen++) {
      // Evaluate current population
      for (const genome of this.population) {
        genome.fitness = fitnessFunction(genome.parameters);
      }
      
      // Create new population
      const newPopulation: Genome[] = [];
      
      for (let i = 0; i < this.population.length; i++) {
        const target = this.population[i];
        const mutant = this.mutate(i);
        const trial = this.crossover(target.parameters, mutant);
        const trialFitness = fitnessFunction(trial);
        
        if (trialFitness > target.fitness) {
          newPopulation.push({
            parameters: trial,
            fitness: trialFitness,
            generation: gen + 1,
            id: generateId(),
          });
        } else {
          newPopulation.push({
            ...target,
            generation: gen + 1,
          });
        }
      }
      
      this.population = newPopulation;
      
      const best = this.population.reduce((b, g) => g.fitness > b.fitness ? g : b);
      if (onGenerationComplete) {
        onGenerationComplete(gen, best);
      }
    }
    
    return this.population.reduce((b, g) => g.fitness > b.fitness ? g : b);
  }

  getPopulation(): Genome[] {
    return this.population;
  }
}

// ============================================================================
// Covariance Matrix Adaptation Evolution Strategy (CMA-ES)
// ============================================================================

export class CovarianceMatrixAdaptation {
  // Placeholder for future implementation
}