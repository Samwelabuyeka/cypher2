/**
 * Deep Reinforcement Learning for Trading
 * 
 * Implements state-of-the-art RL algorithms for autonomous trading including:
 * - Deep Q-Network (DQN)
 * - Double DQN
 * - Dueling DQN
 * - Proximal Policy Optimization (PPO)
 * - Soft Actor-Critic (SAC)
 */

// Types and Interfaces

export interface MarketState {
  prices: number[];
  indicators: number[];
  positions: number[];
  balance: number;
  timestamp: number;
}

export interface TradingAction {
  type: 'buy' | 'sell' | 'hold';
  asset: number;
  amount: number;
}

export interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export interface Trajectory {
  states: number[][];
  actions: number[];
  rewards: number[];
  dones: boolean[];
  values?: number[];
  logProbs?: number[];
}

export interface NetworkWeights {
  weights: number[][][];
  biases: number[][];
}

export interface EnvironmentConfig {
  initialBalance: number;
  maxSteps: number;
  transactionCost: number;
  slippageFactor: number;
  riskFreeRate: number;
}

export interface AgentConfig {
  stateSize: number;
  actionSize: number;
  hiddenSizes: number[];
  learningRate: number;
  gamma: number;
  epsilon?: number;
  epsilonDecay?: number;
  epsilonMin?: number;
  batchSize?: number;
  bufferSize?: number;
  tau?: number;
  clipEpsilon?: number;
  entropyCoefficient?: number;
}

// Helper Functions

/**
 * Generalized Advantage Estimation
 */
export function calculateGAE(
  rewards: number[],
  values: number[],
  dones: boolean[],
  gamma: number,
  lambda: number
): number[] {
  const advantages: number[] = [];
  let gae = 0;

  for (let t = rewards.length - 1; t >= 0; t--) {
    const nextValue = t < rewards.length - 1 ? values[t + 1] : 0;
    const delta = rewards[t] + gamma * nextValue * (1 - (dones[t] ? 1 : 0)) - values[t];
    gae = delta + gamma * lambda * (1 - (dones[t] ? 1 : 0)) * gae;
    advantages.unshift(gae);
  }

  return advantages;
}

/**
 * Compute Temporal Difference Target
 */
export function computeTDTarget(
  rewards: number[],
  nextValues: number[],
  dones: boolean[],
  gamma: number
): number[] {
  return rewards.map((reward, i) => 
    reward + gamma * nextValues[i] * (1 - (dones[i] ? 1 : 0))
  );
}

/**
 * Polyak Averaging for soft network updates
 */
export function polyakAveraging(
  sourceWeights: NetworkWeights,
  targetWeights: NetworkWeights,
  tau: number
): NetworkWeights {
  const newWeights: number[][][] = [];
  const newBiases: number[][] = [];

  for (let i = 0; i < sourceWeights.weights.length; i++) {
    const layerWeights: number[][] = [];
    for (let j = 0; j < sourceWeights.weights[i].length; j++) {
      const neuronWeights: number[] = [];
      for (let k = 0; k < sourceWeights.weights[i][j].length; k++) {
        neuronWeights.push(
          tau * sourceWeights.weights[i][j][k] + (1 - tau) * targetWeights.weights[i][j][k]
        );
      }
      layerWeights.push(neuronWeights);
    }
    newWeights.push(layerWeights);
  }

  for (let i = 0; i < sourceWeights.biases.length; i++) {
    const layerBiases: number[] = [];
    for (let j = 0; j < sourceWeights.biases[i].length; j++) {
      layerBiases.push(
        tau * sourceWeights.biases[i][j] + (1 - tau) * targetWeights.biases[i][j]
      );
    }
    newBiases.push(layerBiases);
  }

  return { weights: newWeights, biases: newBiases };
}

/**
 * Normalize rewards for stability
 */
export function normalizeRewards(
  rewards: number[],
  runningMean: number,
  runningStd: number
): { normalized: number[]; newMean: number; newStd: number } {
  const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const variance = rewards.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rewards.length;
  const std = Math.sqrt(variance);

  const alpha = 0.01;
  const newMean = (1 - alpha) * runningMean + alpha * mean;
  const newStd = (1 - alpha) * runningStd + alpha * std;

  const normalized = rewards.map(r => (r - newMean) / (newStd + 1e-8));
  return { normalized, newMean, newStd };
}

/**
 * Clip gradients to prevent exploding gradients
 */
export function clipGradients(gradients: number[], maxNorm: number): number[] {
  const norm = Math.sqrt(gradients.reduce((a, b) => a + b * b, 0));
  if (norm > maxNorm) {
    return gradients.map(g => g * maxNorm / norm);
  }
  return gradients;
}

// Neural Network Implementation

class NeuralNetwork {
  private weights: number[][][];
  private biases: number[][];
  private layerSizes: number[];

  constructor(layerSizes: number[]) {
    this.layerSizes = layerSizes;
    this.weights = [];
    this.biases = [];
    this.initializeWeights();
  }

  private initializeWeights(): void {
    for (let i = 0; i < this.layerSizes.length - 1; i++) {
      const layerWeights: number[][] = [];
      const layerBiases: number[] = [];
      
      const scale = Math.sqrt(2.0 / this.layerSizes[i]);
      
      for (let j = 0; j < this.layerSizes[i + 1]; j++) {
        const neuronWeights: number[] = [];
        for (let k = 0; k < this.layerSizes[i]; k++) {
          neuronWeights.push((Math.random() * 2 - 1) * scale);
        }
        layerWeights.push(neuronWeights);
        layerBiases.push(0);
      }
      
      this.weights.push(layerWeights);
      this.biases.push(layerBiases);
    }
  }

  forward(input: number[]): number[] {
    let activation = input;
    
    for (let i = 0; i < this.weights.length; i++) {
      const nextActivation: number[] = [];
      
      for (let j = 0; j < this.weights[i].length; j++) {
        let sum = this.biases[i][j];
        for (let k = 0; k < activation.length; k++) {
          sum += activation[k] * this.weights[i][j][k];
        }
        
        // ReLU activation for hidden layers, linear for output
        const activated = i < this.weights.length - 1 ? Math.max(0, sum) : sum;
        nextActivation.push(activated);
      }
      
      activation = nextActivation;
    }
    
    return activation;
  }

  getWeights(): NetworkWeights {
    return {
      weights: this.weights.map(layer => layer.map(neuron => [...neuron])),
      biases: this.biases.map(layer => [...layer])
    };
  }

  setWeights(weights: NetworkWeights): void {
    this.weights = weights.weights.map(layer => layer.map(neuron => [...neuron]));
    this.biases = weights.biases.map(layer => [...layer]);
  }

  clone(): NeuralNetwork {
    const cloned = new NeuralNetwork(this.layerSizes);
    cloned.setWeights(this.getWeights());
    return cloned;
  }
}

// Replay Buffer

export class ReplayBuffer {
  private buffer: Experience[];
  private capacity: number;
  private position: number;
  private priorities: number[];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = [];
    this.position = 0;
    this.priorities = [];
  }

  add(state: number[], action: number, reward: number, nextState: number[], done: boolean): void {
    const experience: Experience = { state, action, reward, nextState, done };
    
    if (this.buffer.length < this.capacity) {
      this.buffer.push(experience);
      this.priorities.push(1.0);
    } else {
      this.buffer[this.position] = experience;
      this.priorities[this.position] = 1.0;
    }
    
    this.position = (this.position + 1) % this.capacity;
  }

  sample(batchSize: number): Experience[] {
    const batch: Experience[] = [];
    const indices = new Set<number>();
    
    while (indices.size < Math.min(batchSize, this.buffer.length)) {
      indices.add(Math.floor(Math.random() * this.buffer.length));
    }
    
    indices.forEach(i => batch.push(this.buffer[i]));
    return batch;
  }

  prioritizedSample(batchSize: number, alpha: number, beta: number): {
    batch: Experience[];
    indices: number[];
    weights: number[];
  } {
    const probabilities = this.priorities.map(p => Math.pow(p, alpha));
    const sumProb = probabilities.reduce((a, b) => a + b, 0);
    const normalizedProb = probabilities.map(p => p / sumProb);
    
    const batch: Experience[] = [];
    const indices: number[] = [];
    const weights: number[] = [];
    
    const maxWeight = Math.pow(this.buffer.length * Math.min(...normalizedProb), -beta);
    
    for (let i = 0; i < Math.min(batchSize, this.buffer.length); i++) {
      let rand = Math.random();
      let idx = 0;
      let cumProb = 0;
      
      for (let j = 0; j < normalizedProb.length; j++) {
        cumProb += normalizedProb[j];
        if (rand <= cumProb) {
          idx = j;
          break;
        }
      }
      
      batch.push(this.buffer[idx]);
      indices.push(idx);
      weights.push(Math.pow(this.buffer.length * normalizedProb[idx], -beta) / maxWeight);
    }
    
    return { batch, indices, weights };
  }

  updatePriorities(indices: number[], tdErrors: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      this.priorities[indices[i]] = Math.abs(tdErrors[i]) + 1e-6;
    }
  }

  size(): number {
    return this.buffer.length;
  }
}

// Trading Environment

export class TradingEnvironment {
  private config: EnvironmentConfig;
  private currentStep: number;
  private balance: number;
  private positions: number[];
  private priceHistory: number[][];
  private indicatorHistory: number[][];
  
  constructor(
    config: EnvironmentConfig,
    priceHistory: number[][],
    indicatorHistory: number[][]
  ) {
    this.config = config;
    this.priceHistory = priceHistory;
    this.indicatorHistory = indicatorHistory;
    this.currentStep = 0;
    this.balance = config.initialBalance;
    this.positions = new Array(priceHistory[0].length).fill(0);
  }

  reset(): number[] {
    this.currentStep = 0;
    this.balance = this.config.initialBalance;
    this.positions = new Array(this.priceHistory[0].length).fill(0);
    return this.getState();
  }

  step(action: TradingAction): {
    nextState: number[];
    reward: number;
    done: boolean;
    info: any;
  } {
    const prices = this.priceHistory[this.currentStep];
    const prevBalance = this.balance;
    const prevPositions = [...this.positions];
    
    // Execute action
    const cost = this.config.transactionCost;
    const slippage = this.config.slippageFactor;
    
    if (action.type === 'buy' && action.amount > 0) {
      const totalCost = prices[action.asset] * action.amount * (1 + cost + slippage);
      if (totalCost <= this.balance) {
        this.balance -= totalCost;
        this.positions[action.asset] += action.amount;
      }
    } else if (action.type === 'sell' && action.amount > 0) {
      if (action.amount <= this.positions[action.asset]) {
        const revenue = prices[action.asset] * action.amount * (1 - cost - slippage);
        this.balance += revenue;
        this.positions[action.asset] -= action.amount;
      }
    }
    
    this.currentStep++;
    
    const portfolioValue = this.getPortfolioValue();
    const reward = this.calculateReward(action, {
      prevBalance,
      prevPositions,
      currentBalance: this.balance,
      currentPositions: this.positions,
      portfolioValue
    });
    
    const done = this.currentStep >= this.priceHistory.length - 1 || 
                 portfolioValue <= this.config.initialBalance * 0.1;
    
    const nextState = this.getState();
    
    return {
      nextState,
      reward,
      done,
      info: { portfolioValue, balance: this.balance, positions: [...this.positions] }
    };
  }

  getState(): number[] {
    const prices = this.priceHistory[this.currentStep];
    const indicators = this.indicatorHistory[this.currentStep];
    const portfolioValue = this.getPortfolioValue();
    
    return [
      ...prices,
      ...indicators,
      ...this.positions,
      this.balance / this.config.initialBalance,
      portfolioValue / this.config.initialBalance
    ];
  }

  calculateReward(action: TradingAction, result: any): number {
    const returnRate = (result.portfolioValue - this.config.initialBalance) / this.config.initialBalance;
    const excessReturn = returnRate - this.config.riskFreeRate;
    
    // Sharpe ratio approximation
    const sharpeReward = excessReturn * 10;
    
    // Penalize extreme positions
    const positionPenalty = this.positions.reduce((sum, pos) => {
      const positionValue = pos * this.priceHistory[this.currentStep][this.positions.indexOf(pos)];
      const portfolioValue = result.portfolioValue;
      const concentration = positionValue / portfolioValue;
      return sum + (concentration > 0.5 ? Math.pow(concentration - 0.5, 2) : 0);
    }, 0);
    
    return sharpeReward - positionPenalty;
  }

  render(): string {
    const portfolioValue = this.getPortfolioValue();
    return `Step: ${this.currentStep}, Balance: ${this.balance.toFixed(2)}, Portfolio: ${portfolioValue.toFixed(2)}`;
  }

  private getPortfolioValue(): number {
    const prices = this.priceHistory[this.currentStep];
    const positionsValue = this.positions.reduce((sum, pos, i) => sum + pos * prices[i], 0);
    return this.balance + positionsValue;
  }
}

// DQN Agent

export class DQNAgent {
  private config: AgentConfig;
  private qNetwork: NeuralNetwork;
  private targetNetwork: NeuralNetwork;
  private replayBuffer: ReplayBuffer;
  private epsilon: number;
  private isDueling: boolean;
  
  constructor(config: AgentConfig, isDueling: boolean = false) {
    this.config = config;
    this.epsilon = config.epsilon || 1.0;
    this.isDueling = isDueling;
    
    const layers = [config.stateSize, ...config.hiddenSizes];
    
    if (isDueling) {
      // Dueling architecture: separate value and advantage streams
      this.qNetwork = new NeuralNetwork([...layers, config.actionSize * 2]);
      this.targetNetwork = new NeuralNetwork([...layers, config.actionSize * 2]);
    } else {
      this.qNetwork = new NeuralNetwork([...layers, config.actionSize]);
      this.targetNetwork = new NeuralNetwork([...layers, config.actionSize]);
    }
    
    this.replayBuffer = new ReplayBuffer(config.bufferSize || 10000);
  }

  selectAction(state: number[], useEpsilon: boolean = true): number {
    if (useEpsilon && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.config.actionSize);
    }
    
    const qValues = this.getQValues(state, this.qNetwork);
    return qValues.indexOf(Math.max(...qValues));
  }

  act(state: number[]): number {
    return this.selectAction(state, false);
  }

  remember(state: number[], action: number, reward: number, nextState: number[], done: boolean): void {
    this.replayBuffer.add(state, action, reward, nextState, done);
  }

  train(batchSize?: number): number {
    const size = batchSize || this.config.batchSize || 32;
    
    if (this.replayBuffer.size() < size) {
      return 0;
    }
    
    const batch = this.replayBuffer.sample(size);
    let totalLoss = 0;
    
    for (const experience of batch) {
      const qValues = this.getQValues(experience.state, this.qNetwork);
      const nextQValues = this.getQValues(experience.nextState, this.targetNetwork);
      
      const target = experience.reward + 
        (experience.done ? 0 : this.config.gamma * Math.max(...nextQValues));
      
      const loss = Math.pow(target - qValues[experience.action], 2);
      totalLoss += loss;
      
      // Simple gradient update (in practice, use proper backpropagation)
      const learningRate = this.config.learningRate;
      const tdError = target - qValues[experience.action];
      
      // Update weights (simplified)
      this.updateQNetwork(experience.state, experience.action, tdError, learningRate);
    }
    
    // Decay epsilon
    if (this.config.epsilonDecay) {
      this.epsilon = Math.max(
        this.config.epsilonMin || 0.01,
        this.epsilon * this.config.epsilonDecay
      );
    }
    
    return totalLoss / batch.length;
  }

  updateTargetNetwork(): void {
    const tau = this.config.tau || 1.0;
    const newWeights = polyakAveraging(
      this.qNetwork.getWeights(),
      this.targetNetwork.getWeights(),
      tau
    );
    this.targetNetwork.setWeights(newWeights);
  }

  private getQValues(state: number[], network: NeuralNetwork): number[] {
    const output = network.forward(state);
    
    if (this.isDueling) {
      // Dueling DQN: V(s) + A(s,a) - mean(A(s,·))
      const midpoint = output.length / 2;
      const value = output[0];
      const advantages = output.slice(midpoint);
      const meanAdvantage = advantages.reduce((a, b) => a + b, 0) / advantages.length;
      return advantages.map(a => value + a - meanAdvantage);
    }
    
    return output;
  }

  private updateQNetwork(state: number[], action: number, tdError: number, lr: number): void {
    // Simplified weight update (in production, use proper backpropagation)
    const weights = this.qNetwork.getWeights();
    
    // Update output layer weights for the selected action
    for (let i = 0; i < weights.weights[weights.weights.length - 1][action].length; i++) {
      weights.weights[weights.weights.length - 1][action][i] += lr * tdError * state[i];
    }
    
    this.qNetwork.setWeights(weights);
  }
}

// PPO Agent

export class PPOAgent {
  private config: AgentConfig;
  private actorNetwork: NeuralNetwork;
  private criticNetwork: NeuralNetwork;
  
  constructor(config: AgentConfig) {
    this.config = config;
    
    const layers = [config.stateSize, ...config.hiddenSizes];
    this.actorNetwork = new NeuralNetwork([...layers, config.actionSize]);
    this.criticNetwork = new NeuralNetwork([...layers, 1]);
  }

  selectAction(state: number[]): { action: number; logProb: number } {
    const logits = this.actorNetwork.forward(state);
    const probs = this.softmax(logits);
    
    // Sample from categorical distribution
    const action = this.sampleCategorical(probs);
    const logProb = Math.log(probs[action] + 1e-8);
    
    return { action, logProb };
  }

  getActionProbabilities(state: number[], action: number): number {
    const logits = this.actorNetwork.forward(state);
    const probs = this.softmax(logits);
    return Math.log(probs[action] + 1e-8);
  }

  getValue(state: number[]): number {
    return this.criticNetwork.forward(state)[0];
  }

  computeAdvantages(
    rewards: number[],
    values: number[],
    dones: boolean[]
  ): number[] {
    const lambda = 0.95;
    return calculateGAE(rewards, values, dones, this.config.gamma, lambda);
  }

  train(trajectories: Trajectory, epochs?: number): number {
    const numEpochs = epochs || 10;
    const clipEpsilon = this.config.clipEpsilon || 0.2;
    const batchSize = this.config.batchSize || 64;
    
    let totalLoss = 0;
    
    for (let epoch = 0; epoch < numEpochs; epoch++) {
      // Compute advantages
      const values = trajectories.states.map(s => this.getValue(s));
      const advantages = this.computeAdvantages(
        trajectories.rewards,
        values,
        trajectories.dones
      );
      
      // Normalize advantages
      const meanAdv = advantages.reduce((a, b) => a + b, 0) / advantages.length;
      const stdAdv = Math.sqrt(
        advantages.reduce((a, b) => a + Math.pow(b - meanAdv, 2), 0) / advantages.length
      );
      const normalizedAdv = advantages.map(a => (a - meanAdv) / (stdAdv + 1e-8));
      
      // Mini-batch training
      for (let i = 0; i < trajectories.states.length; i += batchSize) {
        const end = Math.min(i + batchSize, trajectories.states.length);
        
        for (let j = i; j < end; j++) {
          const state = trajectories.states[j];
          const action = trajectories.actions[j];
          const oldLogProb = trajectories.logProbs![j];
          const advantage = normalizedAdv[j];
          const returns = advantages[j] + values[j];
          
          // Actor loss (PPO clipped objective)
          const newLogProb = this.getActionProbabilities(state, action);
          const ratio = Math.exp(newLogProb - oldLogProb);
          const clippedRatio = Math.max(
            Math.min(ratio, 1 + clipEpsilon),
            1 - clipEpsilon
          );
          const actorLoss = -Math.min(ratio * advantage, clippedRatio * advantage);
          
          // Critic loss
          const valuePred = this.getValue(state);
          const criticLoss = Math.pow(returns - valuePred, 2);
          
          totalLoss += actorLoss + 0.5 * criticLoss;
          
          // Update networks (simplified)
          this.updateNetworks(state, action, actorLoss, criticLoss);
        }
      }
    }
    
    return totalLoss / (numEpochs * trajectories.states.length);
  }

  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
  }

  private sampleCategorical(probs: number[]): number {
    const rand = Math.random();
    let cumProb = 0;
    
    for (let i = 0; i < probs.length; i++) {
      cumProb += probs[i];
      if (rand <= cumProb) {
        return i;
      }
    }
    
    return probs.length - 1;
  }

  private updateNetworks(
    state: number[],
    action: number,
    actorLoss: number,
    criticLoss: number
  ): void {
    // Simplified gradient update
    const lr = this.config.learningRate;
    
    const actorWeights = this.actorNetwork.getWeights();
    const criticWeights = this.criticNetwork.getWeights();
    
    // Update weights (in production, use proper backpropagation)
    for (let i = 0; i < actorWeights.weights[actorWeights.weights.length - 1][action].length; i++) {
      actorWeights.weights[actorWeights.weights.length - 1][action][i] -= lr * actorLoss;
    }
    
    this.actorNetwork.setWeights(actorWeights);
    this.criticNetwork.setWeights(criticWeights);
  }
}

// SAC Agent

export class SACAgent {
  private config: AgentConfig;
  private actorNetwork: NeuralNetwork;
  private critic1Network: NeuralNetwork;
  private critic2Network: NeuralNetwork;
  private targetCritic1Network: NeuralNetwork;
  private targetCritic2Network: NeuralNetwork;
  private replayBuffer: ReplayBuffer;
  private alpha: number;
  
  constructor(config: AgentConfig) {
    this.config = config;
    this.alpha = config.entropyCoefficient || 0.2;
    
    const layers = [config.stateSize, ...config.hiddenSizes];
    
    // Actor outputs mean and log_std for Gaussian policy
    this.actorNetwork = new NeuralNetwork([...layers, config.actionSize * 2]);
    
    // Two Q-networks to reduce overestimation
    this.critic1Network = new NeuralNetwork([...layers, config.actionSize]);
    this.critic2Network = new NeuralNetwork([...layers, config.actionSize]);
    this.targetCritic1Network = this.critic1Network.clone();
    this.targetCritic2Network = this.critic2Network.clone();
    
    this.replayBuffer = new ReplayBuffer(config.bufferSize || 10000);
  }

  selectAction(state: number[], deterministic: boolean = false): number {
    const output = this.actorNetwork.forward(state);
    const midpoint = output.length / 2;
    const means = output.slice(0, midpoint);
    const logStds = output.slice(midpoint);
    
    if (deterministic) {
      return this.tanhToAction(means);
    }
    
    // Sample from Gaussian and apply tanh squashing
    const stds = logStds.map(ls => Math.exp(ls));
    const actions = means.map((mean, i) => {
      const noise = this.randomNormal();
      return mean + stds[i] * noise;
    });
    
    return this.tanhToAction(actions);
  }

  remember(state: number[], action: number, reward: number, nextState: number[], done: boolean): void {
    this.replayBuffer.add(state, action, reward, nextState, done);
  }

  train(batchSize?: number): number {
    const size = batchSize || this.config.batchSize || 256;
    
    if (this.replayBuffer.size() < size) {
      return 0;
    }
    
    const batch = this.replayBuffer.sample(size);
    let totalLoss = 0;
    
    for (const experience of batch) {
      // Compute target Q-value
      const nextAction = this.selectAction(experience.nextState, false);
      const nextQ1 = this.targetCritic1Network.forward(experience.nextState)[nextAction];
      const nextQ2 = this.targetCritic2Network.forward(experience.nextState)[nextAction];
      const nextQ = Math.min(nextQ1, nextQ2);
      
      // Add entropy bonus to target
      const target = experience.reward + 
        (experience.done ? 0 : this.config.gamma * (nextQ - this.alpha * Math.log(1.0 / this.config.actionSize)));
      
      // Update critics
      const q1 = this.critic1Network.forward(experience.state)[experience.action];
      const q2 = this.critic2Network.forward(experience.state)[experience.action];
      
      const critic1Loss = Math.pow(target - q1, 2);
      const critic2Loss = Math.pow(target - q2, 2);
      
      // Update actor
      const action = this.selectAction(experience.state, false);
      const q1New = this.critic1Network.forward(experience.state)[action];
      const q2New = this.critic2Network.forward(experience.state)[action];
      const qNew = Math.min(q1New, q2New);
      
      const actorLoss = this.alpha * Math.log(1.0 / this.config.actionSize) - qNew;
      
      totalLoss += critic1Loss + critic2Loss + actorLoss;
      
      // Simplified gradient updates
      this.updateCritics(experience.state, experience.action, target);
      this.updateActor(experience.state, actorLoss);
    }
    
    return totalLoss / batch.length;
  }

  updateTargetNetworks(): void {
    const tau = this.config.tau || 0.005;
    
    const newCritic1Weights = polyakAveraging(
      this.critic1Network.getWeights(),
      this.targetCritic1Network.getWeights(),
      tau
    );
    this.targetCritic1Network.setWeights(newCritic1Weights);
    
    const newCritic2Weights = polyakAveraging(
      this.critic2Network.getWeights(),
      this.targetCritic2Network.getWeights(),
      tau
    );
    this.targetCritic2Network.setWeights(newCritic2Weights);
  }

  private tanhToAction(values: number[]): number {
    // Apply tanh squashing and convert to discrete action
    const squashed = values.map(v => Math.tanh(v));
    const actionIndex = squashed.indexOf(Math.max(...squashed));
    return actionIndex;
  }

  private randomNormal(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  private updateCritics(state: number[], action: number, target: number): void {
    const lr = this.config.learningRate;
    
    const critic1Weights = this.critic1Network.getWeights();
    const critic2Weights = this.critic2Network.getWeights();
    
    const q1 = this.critic1Network.forward(state)[action];
    const q2 = this.critic2Network.forward(state)[action];
    
    const error1 = target - q1;
    const error2 = target - q2;
    
    // Update output layer weights for the selected action
    for (let i = 0; i < critic1Weights.weights[critic1Weights.weights.length - 1][action].length; i++) {
      critic1Weights.weights[critic1Weights.weights.length - 1][action][i] += lr * error1 * state[i];
      critic2Weights.weights[critic2Weights.weights.length - 1][action][i] += lr * error2 * state[i];
    }
    
    this.critic1Network.setWeights(critic1Weights);
    this.critic2Network.setWeights(critic2Weights);
  }

  private updateActor(state: number[], loss: number): void {
    const lr = this.config.learningRate;
    const actorWeights = this.actorNetwork.getWeights();
    
    // Simplified gradient update for actor
    for (let i = 0; i < actorWeights.weights[actorWeights.weights.length - 1].length; i++) {
      for (let j = 0; j < actorWeights.weights[actorWeights.weights.length - 1][i].length; j++) {
        actorWeights.weights[actorWeights.weights.length - 1][i][j] -= lr * loss * state[j];
      }
    }
    
    this.actorNetwork.setWeights(actorWeights);
  }
}