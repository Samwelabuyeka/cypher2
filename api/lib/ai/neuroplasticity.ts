/**
 * Neuroplasticity Engine for Self-Reorganizing Neural Networks
 * 
 * Enables neural networks to rewire themselves like living cells through:
 * - Synaptic plasticity (Hebbian learning, STDP, homeostatic)
 * - Structural plasticity (pruning, growth, neurogenesis)
 * - Dynamic architecture (layer/neuron management)
 * - Meta-learning (adaptive learning rates, architecture search)
 */

// Type definitions
export interface Neuron {
  id: string;
  activation: number;
  bias: number;
  gradient: number;
  activityHistory: number[];
  isDead: boolean;
  firingRate: number;
}

export interface Connection {
  from: string;
  to: string;
  weight: number;
  gradient: number;
  activityHistory: number[];
  age: number;
  importance: number;
}

export interface Layer {
  id: string;
  neurons: Neuron[];
  type: 'input' | 'hidden' | 'output';
  activationFunction: string;
}

export interface NeuralNetwork {
  layers: Layer[];
  connections: Connection[];
  learningRate: number;
  metadata: {
    generation: number;
    performanceHistory: number[];
    structuralChanges: number;
  };
}

export interface SpikeTimings {
  neuronId: string;
  spikeTime: number;
  layer: string;
}

export interface ActivityMap {
  [layerId: string]: {
    [neuronId: string]: {
      activations: number[];
      gradients: number[];
      firingRate: number;
    };
  };
}

export interface ActivityStatistics {
  mean: number;
  std: number;
  max: number;
  min: number;
  deadNeurons: string[];
  highActivityNeurons: string[];
}

export interface PlasticityConfig {
  hebbianRate: number;
  stdpWindow: number;
  homeostaticTarget: number;
  pruningThreshold: number;
  growthProbability: number;
  neurogenesisThreshold: number;
}

/**
 * Tracks and analyzes network activity patterns
 */
export class ActivityTracker {
  private activationHistory: Map<string, number[]> = new Map();
  private gradientHistory: Map<string, number[]> = new Map();
  private connectionActivity: Map<string, number[]> = new Map();
  private historyLength: number;

  constructor(historyLength: number = 1000) {
    this.historyLength = historyLength;
  }

  /**
   * Record neuron activation
   */
  recordActivation(layer: string, neuronIndex: number, activation: number): void {
    const key = `${layer}_${neuronIndex}`;
    if (!this.activationHistory.has(key)) {
      this.activationHistory.set(key, []);
    }
    const history = this.activationHistory.get(key)!;
    history.push(activation);
    if (history.length > this.historyLength) {
      history.shift();
    }
  }

  /**
   * Record neuron gradient
   */
  recordGradient(layer: string, neuronIndex: number, gradient: number): void {
    const key = `${layer}_${neuronIndex}`;
    if (!this.gradientHistory.has(key)) {
      this.gradientHistory.set(key, []);
    }
    const history = this.gradientHistory.get(key)!;
    history.push(Math.abs(gradient));
    if (history.length > this.historyLength) {
      history.shift();
    }
  }

  /**
   * Get activity statistics for a layer
   */
  getActivityStatistics(layer: string): ActivityStatistics {
    const activations: number[] = [];
    const deadNeurons: string[] = [];
    const highActivityNeurons: string[] = [];

    for (const [key, history] of this.activationHistory.entries()) {
      if (key.startsWith(layer + '_')) {
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        activations.push(mean);
        
        if (mean < 0.01) {
          deadNeurons.push(key);
        } else if (mean > 0.95) {
          highActivityNeurons.push(key);
        }
      }
    }

    const mean = activations.reduce((a, b) => a + b, 0) / activations.length;
    const variance = activations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / activations.length;
    const std = Math.sqrt(variance);

    return {
      mean,
      std,
      max: Math.max(...activations),
      min: Math.min(...activations),
      deadNeurons,
      highActivityNeurons
    };
  }

  /**
   * Identify dead neurons below threshold
   */
  identifyDeadNeurons(threshold: number = 0.01): string[] {
    const deadNeurons: string[] = [];

    for (const [key, history] of this.activationHistory.entries()) {
      if (history.length > 0) {
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        if (mean < threshold) {
          deadNeurons.push(key);
        }
      }
    }

    return deadNeurons;
  }

  /**
   * Identify high activity neurons above threshold
   */
  identifyHighActivityNeurons(threshold: number = 0.95): string[] {
    const highActivityNeurons: string[] = [];

    for (const [key, history] of this.activationHistory.entries()) {
      if (history.length > 0) {
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        if (mean > threshold) {
          highActivityNeurons.push(key);
        }
      }
    }

    return highActivityNeurons;
  }

  /**
   * Get connection importance between layers
   */
  getConnectionImportance(fromLayer: string, toLayer: string): Map<string, number> {
    const importance = new Map<string, number>();

    for (const [key, history] of this.connectionActivity.entries()) {
      if (key.startsWith(`${fromLayer}_${toLayer}_`)) {
        const avgActivity = history.reduce((a, b) => a + b, 0) / history.length;
        importance.set(key, avgActivity);
      }
    }

    return importance;
  }

  /**
   * Record connection activity
   */
  recordConnectionActivity(from: string, to: string, activity: number): void {
    const key = `${from}_${to}`;
    if (!this.connectionActivity.has(key)) {
      this.connectionActivity.set(key, []);
    }
    const history = this.connectionActivity.get(key)!;
    history.push(activity);
    if (history.length > this.historyLength) {
      history.shift();
    }
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.activationHistory.clear();
    this.gradientHistory.clear();
    this.connectionActivity.clear();
  }
}

/**
 * Optimizes network structure through pruning, growth, and reorganization
 */
export class StructuralOptimizer {
  private activityTracker: ActivityTracker;

  constructor(activityTracker: ActivityTracker) {
    this.activityTracker = activityTracker;
  }

  /**
   * Prune weak connections from network
   */
  pruneNetwork(network: NeuralNetwork, pruningRate: number = 0.1): number {
    const connectionsByImportance = network.connections
      .map(conn => ({
        connection: conn,
        importance: conn.importance || Math.abs(conn.weight) * conn.activityHistory.reduce((a, b) => a + b, 0) / conn.activityHistory.length
      }))
      .sort((a, b) => a.importance - b.importance);

    const numToPrune = Math.floor(network.connections.length * pruningRate);
    const toPrune = connectionsByImportance.slice(0, numToPrune);

    network.connections = network.connections.filter(
      conn => !toPrune.some(p => p.connection === conn)
    );

    network.metadata.structuralChanges++;
    return numToPrune;
  }

  /**
   * Grow new connections based on activity patterns
   */
  growNetwork(network: NeuralNetwork, growthRate: number = 0.05): number {
    const newConnections: Connection[] = [];
    const numToGrow = Math.floor(network.connections.length * growthRate);

    for (let i = 0; i < numToGrow; i++) {
      // Find layers with high activity
      const fromLayer = network.layers[Math.floor(Math.random() * (network.layers.length - 1))];
      const toLayer = network.layers[Math.min(fromLayer.id ? parseInt(fromLayer.id) + 1 : 1, network.layers.length - 1)];

      // Select high-activity neurons
      const fromNeuron = fromLayer.neurons[Math.floor(Math.random() * fromLayer.neurons.length)];
      const toNeuron = toLayer.neurons[Math.floor(Math.random() * toLayer.neurons.length)];

      // Check if connection already exists
      const exists = network.connections.some(
        conn => conn.from === fromNeuron.id && conn.to === toNeuron.id
      );

      if (!exists) {
        newConnections.push({
          from: fromNeuron.id,
          to: toNeuron.id,
          weight: (Math.random() - 0.5) * 0.1, // Small random weight
          gradient: 0,
          activityHistory: [],
          age: 0,
          importance: 0
        });
      }
    }

    network.connections.push(...newConnections);
    network.metadata.structuralChanges++;
    return newConnections.length;
  }

  /**
   * Balance network capacity
   */
  balanceCapacity(network: NeuralNetwork): void {
    // Analyze layer capacity utilization
    for (const layer of network.layers) {
      if (layer.type === 'hidden') {
        const stats = this.activityTracker.getActivityStatistics(layer.id);
        
        // Remove dead neurons if too many
        if (stats.deadNeurons.length > layer.neurons.length * 0.3) {
          layer.neurons = layer.neurons.filter(
            neuron => !stats.deadNeurons.includes(`${layer.id}_${neuron.id}`)
          );
        }

        // Add neurons if layer is saturated
        if (stats.highActivityNeurons.length > layer.neurons.length * 0.7) {
          const numToAdd = Math.floor(layer.neurons.length * 0.1);
          for (let i = 0; i < numToAdd; i++) {
            layer.neurons.push({
              id: `${layer.id}_new_${Date.now()}_${i}`,
              activation: 0,
              bias: (Math.random() - 0.5) * 0.1,
              gradient: 0,
              activityHistory: [],
              isDead: false,
              firingRate: 0
            });
          }
        }
      }
    }

    network.metadata.structuralChanges++;
  }

  /**
   * Optimize network topology
   */
  optimizeTopology(network: NeuralNetwork): void {
    // Remove redundant layers
    const layersToRemove: string[] = [];
    for (let i = 1; i < network.layers.length - 1; i++) {
      const layer = network.layers[i];
      const stats = this.activityTracker.getActivityStatistics(layer.id);
      
      // Remove layer if mostly dead
      if (stats.deadNeurons.length > layer.neurons.length * 0.8) {
        layersToRemove.push(layer.id);
      }
    }

    network.layers = network.layers.filter(layer => !layersToRemove.includes(layer.id));

    // Add skip connections for gradient flow
    for (let i = 0; i < network.layers.length - 2; i++) {
      const fromLayer = network.layers[i];
      const toLayer = network.layers[i + 2];

      // Add sparse skip connections
      for (let j = 0; j < Math.min(fromLayer.neurons.length, toLayer.neurons.length); j++) {
        if (Math.random() < 0.1) { // 10% skip connection probability
          network.connections.push({
            from: fromLayer.neurons[j].id,
            to: toLayer.neurons[j].id,
            weight: (Math.random() - 0.5) * 0.05,
            gradient: 0,
            activityHistory: [],
            age: 0,
            importance: 0
          });
        }
      }
    }

    network.metadata.structuralChanges++;
  }
}

/**
 * Main neuroplasticity engine coordinating all plasticity mechanisms
 */
export class NeuroplasticityEngine {
  private activityTracker: ActivityTracker;
  private structuralOptimizer: StructuralOptimizer;
  private config: PlasticityConfig;

  constructor(config: Partial<PlasticityConfig> = {}) {
    this.config = {
      hebbianRate: 0.01,
      stdpWindow: 20,
      homeostaticTarget: 0.5,
      pruningThreshold: 0.001,
      growthProbability: 0.05,
      neurogenesisThreshold: 0.8,
      ...config
    };

    this.activityTracker = new ActivityTracker();
    this.structuralOptimizer = new StructuralOptimizer(this.activityTracker);
  }

  /**
   * Apply Hebbian learning: "Neurons that fire together, wire together"
   */
applyHebbianLearning(network: NeuralNetwork, activationHistory: ActivityMap): void {
    for (const connection of network.connections) {
      const fromActivity = activationHistory[connection.from];
      const toActivity = activationHistory[connection.to];

      if (fromActivity && toActivity) {
        // Calculate correlation
        const correlation = this.calculateCorrelation(
          (fromActivity as any)[connection.from as any]?.activations,
          (toActivity as any)[connection.to as any]?.activations
        );

        // Update weight based on correlation
        connection.weight += this.config.hebbianRate * correlation;
        
        // Normalize weights
        connection.weight = Math.max(-1, Math.min(1, connection.weight));
      }
    }
  }

  /**
   * Apply Spike-Timing-Dependent Plasticity
   */
  applySTDP(network: NeuralNetwork, spikeTimings: SpikeTimings[]): void {
    const spikesMap = new Map<string, number>();
    for (const spike of spikeTimings) {
      spikesMap.set(spike.neuronId, spike.spikeTime);
    }

    for (const connection of network.connections) {
      const preTime = spikesMap.get(connection.from);
      const postTime = spikesMap.get(connection.to);

      if (preTime !== undefined && postTime !== undefined) {
        const timeDiff = postTime - preTime;

        if (Math.abs(timeDiff) < this.config.stdpWindow) {
          // Pre-before-post: strengthen
          if (timeDiff > 0) {
            const strengthening = Math.exp(-timeDiff / this.config.stdpWindow) * this.config.hebbianRate;
            connection.weight += strengthening;
          }
          // Post-before-pre: weaken
          else {
            const weakening = Math.exp(timeDiff / this.config.stdpWindow) * this.config.hebbianRate;
            connection.weight -= weakening;
          }

          connection.weight = Math.max(-1, Math.min(1, connection.weight));
        }
      }
    }
  }

  /**
   * Apply homeostatic plasticity to maintain network stability
   */
  applyHomeostaticPlasticity(network: NeuralNetwork): void {
    for (const layer of network.layers) {
      const stats = this.activityTracker.getActivityStatistics(layer.id);
      const deviation = stats.mean - this.config.homeostaticTarget;

      // Adjust biases to bring activity toward target
      for (const neuron of layer.neurons) {
        neuron.bias -= deviation * 0.01; // Small adjustment
        neuron.bias = Math.max(-1, Math.min(1, neuron.bias));
      }
    }
  }

  /**
   * Prune weak connections below threshold
   */
  pruneWeakConnections(network: NeuralNetwork, threshold?: number): number {
    const pruningThreshold = threshold || this.config.pruningThreshold;
    
    const initialCount = network.connections.length;
    network.connections = network.connections.filter(conn => {
      const importance = Math.abs(conn.weight) * (conn.activityHistory.length > 0
        ? conn.activityHistory.reduce((a, b) => a + b, 0) / conn.activityHistory.length
        : 0);
      return importance > pruningThreshold;
    });

    return initialCount - network.connections.length;
  }

  /**
   * Grow new connections based on activity patterns
   */
  growNewConnections(network: NeuralNetwork, activityMap: ActivityMap): number {
    const newConnections: Connection[] = [];

    // Identify high-activity neuron pairs
    const highActivityPairs: Array<[string, string]> = [];
    const neuronIds = Object.keys(activityMap);

    for (let i = 0; i < neuronIds.length; i++) {
      for (let j = i + 1; j < neuronIds.length; j++) {
        const f1 = (activityMap[neuronIds[i]] as any).firingRate;
        const f2 = (activityMap[neuronIds[j]] as any).firingRate;

        if (f1 > 0.7 && f2 > 0.7) {
          if (Math.random() < this.config.growthProbability) {
            highActivityPairs.push([neuronIds[i], neuronIds[j]]);
          }
        }
      }
    }

    // Create new connections
    for (const [from, to] of highActivityPairs) {
      const exists = network.connections.some(
        conn => (conn.from === from && conn.to === to) || (conn.from === to && conn.to === from)
      );

      if (!exists) {
        newConnections.push({
          from,
          to,
          weight: (Math.random() - 0.5) * 0.1,
          gradient: 0,
          activityHistory: [],
          age: 0,
          importance: 0
        });
      }
    }

    network.connections.push(...newConnections);
    return newConnections.length;
  }

  /**
   * Add new neurons to a layer
   */
  addNeurons(network: NeuralNetwork, layerId: string, count: number): void {
    const layer = network.layers.find(l => l.id === layerId);
    if (!layer) return;

    for (let i = 0; i < count; i++) {
      const newNeuron: Neuron = {
        id: `${layerId}_new_${Date.now()}_${i}`,
        activation: 0,
        bias: (Math.random() - 0.5) * 0.1,
        gradient: 0,
        activityHistory: [],
        isDead: false,
        firingRate: 0
      };

      layer.neurons.push(newNeuron);

      // Add connections to/from new neuron
      const prevLayer = network.layers[Math.max(0, network.layers.indexOf(layer) - 1)];
      const nextLayer = network.layers[Math.min(network.layers.length - 1, network.layers.indexOf(layer) + 1)];

      // Incoming connections
      for (const neuron of prevLayer.neurons) {
        network.connections.push({
          from: neuron.id,
          to: newNeuron.id,
          weight: (Math.random() - 0.5) * 0.1,
          gradient: 0,
          activityHistory: [],
          age: 0,
          importance: 0
        });
      }

      // Outgoing connections
      for (const neuron of nextLayer.neurons) {
        network.connections.push({
          from: newNeuron.id,
          to: neuron.id,
          weight: (Math.random() - 0.5) * 0.1,
          gradient: 0,
          activityHistory: [],
          age: 0,
          importance: 0
        });
      }
    }

    network.metadata.structuralChanges++;
  }

  /**
   * Remove dead neurons with no activity
   */
  removeDeadNeurons(network: NeuralNetwork): number {
    const deadNeurons = this.activityTracker.identifyDeadNeurons();
    let removedCount = 0;

    for (const layer of network.layers) {
      if (layer.type !== 'input' && layer.type !== 'output') {
        const initialCount = layer.neurons.length;
        layer.neurons = layer.neurons.filter(
          neuron => !deadNeurons.includes(`${layer.id}_${neuron.id}`)
        );
        removedCount += initialCount - layer.neurons.length;

        // Remove connections to/from dead neurons
        network.connections = network.connections.filter(
          conn => !deadNeurons.includes(conn.from) && !deadNeurons.includes(conn.to)
        );
      }
    }

    if (removedCount > 0) {
      network.metadata.structuralChanges++;
    }

    return removedCount;
  }

  /**
   * Optimize network architecture based on performance
   */
  optimizeArchitecture(network: NeuralNetwork, performanceHistory: number[]): void {
    const recentPerformance = performanceHistory.slice(-10);
    const avgPerformance = recentPerformance.reduce((a, b) => a + b, 0) / recentPerformance.length;

    // If performance is stagnating, try structural changes
    if (performanceHistory.length > 20) {
      const oldPerformance = performanceHistory.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
      const improvement = (avgPerformance - oldPerformance) / oldPerformance;

      if (improvement < 0.01) { // Less than 1% improvement
        // Try adding complexity
        const midLayer = network.layers[Math.floor(network.layers.length / 2)];
        this.addNeurons(network, midLayer.id, Math.floor(midLayer.neurons.length * 0.1));
        this.structuralOptimizer.growNetwork(network, 0.1);
      } else if (improvement < 0) { // Performance degrading
        // Try simplifying
        this.structuralOptimizer.pruneNetwork(network, 0.2);
        this.removeDeadNeurons(network);
      }
    }

    // Periodic cleanup and optimization
    if (performanceHistory.length % 50 === 0) {
      this.structuralOptimizer.balanceCapacity(network);
      this.structuralOptimizer.optimizeTopology(network);
    }
  }

  /**
   * Track network activity during forward pass
   */
  trackActivity(network: NeuralNetwork, inputs: number[], outputs: number[]): void {
    // Track input layer
    for (let i = 0; i < network.layers[0].neurons.length; i++) {
      this.activityTracker.recordActivation(network.layers[0].id, i, inputs[i] || 0);
    }

    // Track output layer
    const outputLayer = network.layers[network.layers.length - 1];
    for (let i = 0; i < outputLayer.neurons.length; i++) {
      this.activityTracker.recordActivation(outputLayer.id, i, outputs[i] || 0);
    }

    // Update connection activity
    for (const connection of network.connections) {
      const activity = Math.abs(connection.weight * connection.gradient);
      connection.activityHistory.push(activity);
      if (connection.activityHistory.length > 100) {
        connection.activityHistory.shift();
      }
      connection.age++;
    }
  }

  /**
   * Reorganize network based on strategy
   */
  reorganize(network: NeuralNetwork, strategy: 'aggressive' | 'conservative' | 'balanced' = 'balanced'): void {
    switch (strategy) {
      case 'aggressive':
        this.structuralOptimizer.pruneNetwork(network, 0.3);
        this.structuralOptimizer.growNetwork(network, 0.2);
        this.removeDeadNeurons(network);
        this.structuralOptimizer.optimizeTopology(network);
        break;

      case 'conservative':
        this.structuralOptimizer.pruneNetwork(network, 0.05);
        this.structuralOptimizer.growNetwork(network, 0.02);
        this.applyHomeostaticPlasticity(network);
        break;

      case 'balanced':
      default:
        this.structuralOptimizer.pruneNetwork(network, 0.15);
        this.structuralOptimizer.growNetwork(network, 0.1);
        this.removeDeadNeurons(network);
        this.applyHomeostaticPlasticity(network);
        this.structuralOptimizer.balanceCapacity(network);
        break;
    }

    network.metadata.generation++;
  }

  /**
   * Calculate correlation between two activity sequences
   */
  private calculateCorrelation(seq1: number[], seq2: number[]): number {
    const n = Math.min(seq1.length, seq2.length);
    if (n === 0) return 0;

    const mean1 = seq1.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const mean2 = seq2.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = seq1[i] - mean1;
      const diff2 = seq2[i] - mean2;
      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(denom1 * denom2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Get activity tracker instance
   */
  getActivityTracker(): ActivityTracker {
    return this.activityTracker;
  }

  /**
   * Get structural optimizer instance
   */
  getStructuralOptimizer(): StructuralOptimizer {
    return this.structuralOptimizer;
  }
}

/**
 * Helper function to create a default neuroplasticity configuration
 */
export function createDefaultConfig(): PlasticityConfig {
  return {
    hebbianRate: 0.01,
    stdpWindow: 20,
    homeostaticTarget: 0.5,
    pruningThreshold: 0.001,
    growthProbability: 0.05,
    neurogenesisThreshold: 0.8
  };
}

/**
 * Helper function to initialize a basic neural network structure
 */
export function createBasicNetwork(
  inputSize: number,
  hiddenSizes: number[],
  outputSize: number
): NeuralNetwork {
  const layers: Layer[] = [];
  
  // Input layer
  layers.push({
    id: '0',
    type: 'input',
    activationFunction: 'linear',
    neurons: Array.from({ length: inputSize }, (_, i) => ({
      id: `0_${i}`,
      activation: 0,
      bias: 0,
      gradient: 0,
      activityHistory: [],
      isDead: false,
      firingRate: 0
    }))
  });

  // Hidden layers
  hiddenSizes.forEach((size, idx) => {
    layers.push({
      id: `${idx + 1}`,
      type: 'hidden',
      activationFunction: 'relu',
      neurons: Array.from({ length: size }, (_, i) => ({
        id: `${idx + 1}_${i}`,
        activation: 0,
        bias: (Math.random() - 0.5) * 0.1,
        gradient: 0,
        activityHistory: [],
        isDead: false,
        firingRate: 0
      }))
    });
  });

  // Output layer
  layers.push({
    id: `${hiddenSizes.length + 1}`,
    type: 'output',
    activationFunction: 'sigmoid',
    neurons: Array.from({ length: outputSize }, (_, i) => ({
      id: `${hiddenSizes.length + 1}_${i}`,
      activation: 0,
      bias: (Math.random() - 0.5) * 0.1,
      gradient: 0,
      activityHistory: [],
      isDead: false,
      firingRate: 0
    }))
  });

  // Create connections between adjacent layers
  const connections: Connection[] = [];
  for (let i = 0; i < layers.length - 1; i++) {
    const fromLayer = layers[i];
    const toLayer = layers[i + 1];
    
    for (const fromNeuron of fromLayer.neurons) {
      for (const toNeuron of toLayer.neurons) {
        connections.push({
          from: fromNeuron.id,
          to: toNeuron.id,
          weight: (Math.random() - 0.5) * 0.2,
          gradient: 0,
          activityHistory: [],
          age: 0,
          importance: 0
        });
      }
    }
  }

  return {
    layers,
    connections,
    learningRate: 0.001,
    metadata: {
      generation: 0,
      performanceHistory: [],
      structuralChanges: 0
    }
  };
}
    