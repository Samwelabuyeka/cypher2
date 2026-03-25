import { logger } from "gadget-server";

/**
 * Represents an AI node in the decentralized network
 */
export interface AINode {
  nodeId: string;
  modelWeights: Float32Array;
  reputation: number;
  contributions: number;
  stake: bigint;
  isOnline: boolean;
}

/**
 * Represents the global federated model
 */
export interface FederatedModel {
  globalWeights: Float32Array;
  version: number;
  participants: string[];
  accuracy: number;
  lastUpdate: number;
}

/**
 * Model update proposal for democratic upgrades
 */
interface ModelProposal {
  proposalId: string;
  nodeId: string;
  newWeights: Float32Array;
  votes: Map<string, boolean>;
  createdAt: number;
}

/**
 * Transaction structure for validation
 */
interface Transaction {
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  timestamp: number;
  signature?: string;
}

/**
 * Network state for predictions
 */
interface NetworkState {
  activeNodes: number;
  pendingTransactions: number;
  averageFee: bigint;
  blockTime: number;
}

/**
 * AI prediction result
 */
interface PredictionResult {
  prediction: any;
  confidence: number;
  nodeId: string;
}

/**
 * Decentralized AI consensus system with federated learning
 * NO centralized control - fully community-driven
 */
export class DistributedAI {
  private nodes: Map<string, AINode> = new Map();
  private globalModel: FederatedModel;
  private quarantinedNodes: Set<string> = new Set();
  private proposals: Map<string, ModelProposal> = new Map();
  private modelHistory: FederatedModel[] = [];
  private readonly minReputationForVoting = 0.5;
  private readonly byzantineThreshold = 0.33; // Max 33% malicious nodes tolerated

  constructor() {
    // Initialize with empty global model
    this.globalModel = {
      globalWeights: new Float32Array(0),
      version: 0,
      participants: [],
      accuracy: 0,
      lastUpdate: Date.now(),
    };
  }

  // ========== FEDERATED LEARNING METHODS ==========

  /**
   * Train local model on node's private data
   */
  async trainLocal(
    node: AINode,
    data: Float32Array[],
    labels: Float32Array[]
  ): Promise<Float32Array> {
    if (!node.isOnline) {
      throw new Error(`Node ${node.nodeId} is offline`);
    }

    if (this.quarantinedNodes.has(node.nodeId)) {
      throw new Error(`Node ${node.nodeId} is quarantined`);
    }

    // Simple gradient descent training (can be replaced with more sophisticated algorithms)
    const learningRate = 0.01;
    const weights = new Float32Array(node.modelWeights);

    for (let epoch = 0; epoch < 10; epoch++) {
      for (let i = 0; i < data.length; i++) {
        const input = data[i];
        const target = labels[i];

        // Forward pass
        let prediction = 0;
        for (let j = 0; j < weights.length; j++) {
          prediction += input[j] * weights[j];
        }

        // Calculate error
        const error = target[0] - prediction;

        // Update weights
        for (let j = 0; j < weights.length; j++) {
          weights[j] += learningRate * error * input[j];
        }
      }
    }

    node.modelWeights = weights;
    node.contributions++;

    logger.info({ nodeId: node.nodeId, contributions: node.contributions }, "Node completed local training");

    return weights;
  }

  /**
   * Aggregate model updates using FedAvg algorithm
   */
  aggregateModels(nodeModels: Map<string, Float32Array>): Float32Array {
    if (nodeModels.size === 0) {
      throw new Error("No models to aggregate");
    }

    // Calculate weighted average based on reputation
    const totalReputation = Array.from(nodeModels.keys())
      .map((nodeId) => this.nodes.get(nodeId)?.reputation || 0)
      .reduce((sum, rep) => sum + rep, 0);

    const firstModel = Array.from(nodeModels.values())[0];
    const aggregated = new Float32Array(firstModel.length);

    for (const [nodeId, weights] of nodeModels.entries()) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const nodeWeight = node.reputation / totalReputation;

      for (let i = 0; i < weights.length; i++) {
        aggregated[i] += weights[i] * nodeWeight;
      }
    }

    return aggregated;
  }

  /**
   * Update the global model with aggregated weights
   */
  updateGlobalModel(aggregated: Float32Array): void {
    // Save current model to history
    this.modelHistory.push({ ...this.globalModel });

    // Update global model
    this.globalModel.globalWeights = aggregated;
    this.globalModel.version++;
    this.globalModel.lastUpdate = Date.now();

    logger.info(
      { version: this.globalModel.version, participants: this.globalModel.participants.length },
      "Global model updated"
    );
  }

  /**
   * Validate model update to prevent poisoning attacks
   */
  validateUpdate(nodeId: string, update: Float32Array): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Check if node is quarantined
    if (this.quarantinedNodes.has(nodeId)) {
      return false;
    }

    // Check for NaN or Infinity values
    for (let i = 0; i < update.length; i++) {
      if (!isFinite(update[i])) {
        logger.warn({ nodeId }, "Invalid update detected - NaN or Infinity");
        return false;
      }
    }

    // Check for abnormally large updates (potential poisoning)
    const maxChange = 10.0;
    if (this.globalModel.globalWeights.length === update.length) {
      for (let i = 0; i < update.length; i++) {
        const change = Math.abs(update[i] - this.globalModel.globalWeights[i]);
        if (change > maxChange) {
          logger.warn({ nodeId, change }, "Abnormally large update detected");
          return false;
        }
      }
    }

    return true;
  }

  // ========== CONSENSUS PREDICTION METHODS ==========

  /**
   * AI-based transaction validation using consensus
   */
  async predictTransactionValidity(tx: Transaction): Promise<boolean> {
    const predictions = await this.requireMultiplePredictions(tx);

    // Use weighted voting based on reputation
    return this.weightedVoting(predictions, (pred) => pred.prediction as boolean);
  }

  /**
   * Predict optimal transaction fee based on network state
   */
  async predictOptimalFee(networkState: NetworkState): Promise<bigint> {
    const activeNodes = this.getActiveNodes();
    const predictions: PredictionResult[] = [];

    for (const node of activeNodes) {
      // Simple fee prediction based on network congestion
      const congestionFactor = networkState.pendingTransactions / networkState.activeNodes;
      const baseFee = networkState.averageFee;
      const predictedFee = baseFee * BigInt(Math.ceil(1 + congestionFactor * 0.1));

      predictions.push({
        prediction: predictedFee,
        confidence: node.reputation,
        nodeId: node.nodeId,
      });
    }

    return this.weightedVoting(predictions, (pred) => pred.prediction as bigint);
  }

  /**
   * Predict network congestion based on historical data
   */
  async predictNetworkCongestion(history: NetworkState[]): Promise<number> {
    if (history.length < 2) return 0;

    // Calculate trend in pending transactions
    const recent = history.slice(-10);
    const avgPending = recent.reduce((sum, state) => sum + state.pendingTransactions, 0) / recent.length;

    const trend =
      (recent[recent.length - 1].pendingTransactions - recent[0].pendingTransactions) / recent.length;

    // Predict congestion level (0-1)
    const congestion = Math.min(1, avgPending / 1000 + trend / 100);

    return congestion;
  }

  /**
   * Detect anomalies in transaction patterns
   */
  detectAnomalies(pattern: Transaction[]): boolean {
    if (pattern.length < 10) return false;

    // Calculate statistics
    const amounts = pattern.map((tx) => Number(tx.amount));
    const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Check for outliers (3 sigma rule)
    for (const tx of pattern) {
      const amount = Number(tx.amount);
      if (Math.abs(amount - mean) > 3 * stdDev) {
        logger.warn({ from: tx.from, amount }, "Anomaly detected");
        return true;
      }
    }

    return false;
  }

  // ========== REPUTATION SYSTEM ==========

  /**
   * Calculate node reputation based on prediction accuracy
   */
  calculateNodeReputation(nodeId: string): number {
    const node = this.nodes.get(nodeId);
    if (!node) return 0;

    // Base reputation from stake (economic security)
    const stakeReputation = Math.min(Number(node.stake) / 1000000, 0.3);

    // Contribution reputation
    const contributionReputation = Math.min(node.contributions / 100, 0.3);

    // Current reputation (historical performance)
    const performanceReputation = node.reputation * 0.4;

    return stakeReputation + contributionReputation + performanceReputation;
  }

  /**
   * Reward node for accurate predictions
   */
  rewardAccuratePredictions(nodeId: string, reward: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.reputation = Math.min(1.0, node.reputation + reward);

    logger.info({ nodeId, reputation: node.reputation }, "Node rewarded for accurate prediction");
  }

  /**
   * Penalize node for bad predictions
   */
  penalizeBadPredictions(nodeId: string, penalty: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.reputation = Math.max(0, node.reputation - penalty);

    // Quarantine if reputation drops too low
    if (node.reputation < 0.1) {
      this.quarantineNode(nodeId);
    }

    logger.warn({ nodeId, reputation: node.reputation }, "Node penalized for bad prediction");
  }

  /**
   * Get top performing nodes
   */
  getTopNodes(count: number): AINode[] {
    return Array.from(this.nodes.values())
      .filter((node) => node.isOnline && !this.quarantinedNodes.has(node.nodeId))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, count);
  }

  // ========== BYZANTINE FAULT TOLERANCE ==========

  /**
   * Detect malicious nodes based on update patterns
   */
  detectMaliciousNodes(updates: Map<string, Float32Array>): string[] {
    const malicious: string[] = [];

    // Calculate median update for each weight
    const weightCount = Array.from(updates.values())[0]?.length || 0;
    const medians = new Float32Array(weightCount);

    for (let i = 0; i < weightCount; i++) {
      const values = Array.from(updates.values()).map((weights) => weights[i]);
      values.sort((a, b) => a - b);
      medians[i] = values[Math.floor(values.length / 2)];
    }

    // Find nodes with updates far from median
    for (const [nodeId, weights] of updates.entries()) {
      let deviationCount = 0;

      for (let i = 0; i < weights.length; i++) {
        const deviation = Math.abs(weights[i] - medians[i]);
        if (deviation > 5.0) {
          deviationCount++;
        }
      }

      // If more than 50% of weights deviate significantly
      if (deviationCount > weights.length * 0.5) {
        malicious.push(nodeId);
      }
    }

    return malicious;
  }

  /**
   * Quarantine malicious node
   */
  quarantineNode(nodeId: string): void {
    this.quarantinedNodes.add(nodeId);
    logger.warn({ nodeId }, "Node quarantined");
  }

  /**
   * Require multiple predictions for consensus
   */
  async requireMultiplePredictions(tx: Transaction): Promise<PredictionResult[]> {
    const activeNodes = this.getActiveNodes();
    const predictions: PredictionResult[] = [];

    for (const node of activeNodes) {
      // Simple validity check (can be replaced with ML model)
      const isValid = tx.amount > 0n && tx.fee > 0n && tx.from !== tx.to;

      predictions.push({
        prediction: isValid,
        confidence: node.reputation,
        nodeId: node.nodeId,
      });
    }

    return predictions;
  }

  /**
   * Weighted voting based on node reputations
   */
  weightedVoting<T>(predictions: PredictionResult[], getValue: (pred: PredictionResult) => T): T {
    if (predictions.length === 0) {
      throw new Error("No predictions available");
    }

    // For boolean predictions, count weighted votes
    if (typeof getValue(predictions[0]) === "boolean") {
      let trueWeight = 0;
      let falseWeight = 0;

      for (const pred of predictions) {
        const value = getValue(pred) as unknown as boolean;
        if (value) {
          trueWeight += pred.confidence;
        } else {
          falseWeight += pred.confidence;
        }
      }

      return (trueWeight > falseWeight) as unknown as T;
    }

    // For numeric predictions, calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;

    for (const pred of predictions) {
      const value = getValue(pred);
      if (typeof value === "bigint") {
        weightedSum += Number(value) * pred.confidence;
      } else if (typeof value === "number") {
        weightedSum += value * pred.confidence;
      }
      totalWeight += pred.confidence;
    }

    const result = weightedSum / totalWeight;
    const firstValue = getValue(predictions[0]);

    if (typeof firstValue === "bigint") {
      return BigInt(Math.round(result)) as unknown as T;
    }

    return result as unknown as T;
  }

  // ========== MODEL VERSIONING ==========

  /**
   * Propose a model update
   */
  proposeModelUpdate(nodeId: string, newWeights: Float32Array): string {
    const node = this.nodes.get(nodeId);
    if (!node || node.reputation < this.minReputationForVoting) {
      throw new Error("Node not authorized to propose updates");
    }

    const proposalId = `proposal-${Date.now()}-${nodeId}`;
    const proposal: ModelProposal = {
      proposalId,
      nodeId,
      newWeights,
      votes: new Map(),
      createdAt: Date.now(),
    };

    this.proposals.set(proposalId, proposal);

    logger.info({ proposalId, nodeId }, "Model update proposed");

    return proposalId;
  }

  /**
   * Vote on a model update proposal
   */
  voteOnModelUpdate(nodeId: string, proposalId: string, vote: boolean): void {
    const node = this.nodes.get(nodeId);
    const proposal = this.proposals.get(proposalId);

    if (!node || !proposal) {
      throw new Error("Invalid vote");
    }

    if (node.reputation < this.minReputationForVoting) {
      throw new Error("Node reputation too low to vote");
    }

    proposal.votes.set(nodeId, vote);

    // Check if proposal should be deployed
    this.checkProposalStatus(proposalId);
  }

  /**
   * Deploy new model if approved
   */
  deployNewModel(weights: Float32Array): void {
    this.updateGlobalModel(weights);

    logger.info({ version: this.globalModel.version }, "New model deployed");
  }

  /**
   * Rollback to previous model version
   */
  rollbackModel(version: number): void {
    const targetModel = this.modelHistory.find((m) => m.version === version);

    if (!targetModel) {
      throw new Error(`Model version ${version} not found`);
    }

    this.globalModel = { ...targetModel };

    logger.warn({ version }, "Model rolled back");
  }

  // ========== PRIVACY-PRESERVING TRAINING ==========

  /**
   * Apply differential privacy to protect user data
   */
  differentialPrivacy(data: Float32Array, epsilon: number): Float32Array {
    const noisyData = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
      // Add Laplace noise
      const u = Math.random() - 0.5;
      const noise = -(1 / epsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
      noisyData[i] = data[i] + noise;
    }

    return noisyData;
  }

  /**
   * Secure aggregation with encryption (simplified)
   */
  secureAggregation(updates: Map<string, Float32Array>): Float32Array {
    // In production, this would use actual encryption
    // For now, we aggregate directly but could add pairwise masking
    return this.aggregateModels(updates);
  }

  /**
   * Homomorphic computation on encrypted data (simplified)
   */
  homomorphicComputation(encrypted: Float32Array): Float32Array {
    // Placeholder for homomorphic encryption operations
    // In production, would use libraries like SEAL or HElib
    return encrypted;
  }

  // ========== ECONOMIC INCENTIVES ==========

  /**
   * Reward node for training contribution
   */
  rewardTraining(nodeId: string, contribution: number): bigint {
    const node = this.nodes.get(nodeId);
    if (!node) return 0n;

    const baseReward = 100n;
    const reputationBonus = BigInt(Math.floor(node.reputation * 50));
    const contributionBonus = BigInt(contribution);

    const totalReward = baseReward + reputationBonus + contributionBonus;

    logger.info({ nodeId, reward: totalReward.toString() }, "Training reward calculated");

    return totalReward;
  }

  /**
   * Slash stake of malicious AI node
   */
  slashMaliciousAI(nodeId: string, amount: bigint): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.stake = node.stake > amount ? node.stake - amount : 0n;

    logger.warn({ nodeId, slashed: amount.toString(), remaining: node.stake.toString() }, "Node slashed");
  }

  /**
   * Calculate dynamic training reward
   */
  calculateTrainingReward(accuracy: number, stake: bigint): bigint {
    const accuracyReward = BigInt(Math.floor(accuracy * 1000));
    const stakeBonus = stake / 1000n;

    return accuracyReward + stakeBonus;
  }

  // ========== SELF-IMPROVEMENT ==========

  /**
   * Analyze AI performance metrics
   */
  analyzePerformance(): { accuracy: number; avgReputation: number; participation: number } {
    const activeNodes = this.getActiveNodes();

    const avgReputation =
      activeNodes.reduce((sum, node) => sum + node.reputation, 0) / activeNodes.length;

    const participation = activeNodes.length / this.nodes.size;

    return {
      accuracy: this.globalModel.accuracy,
      avgReputation,
      participation,
    };
  }

  /**
   * Suggest architecture improvements
   */
  suggestArchitectureChanges(): string[] {
    const suggestions: string[] = [];
    const performance = this.analyzePerformance();

    if (performance.accuracy < 0.7) {
      suggestions.push("Increase model capacity");
      suggestions.push("Add more training epochs");
    }

    if (performance.avgReputation < 0.5) {
      suggestions.push("Implement better validation mechanisms");
      suggestions.push("Increase reputation requirements");
    }

    if (performance.participation < 0.5) {
      suggestions.push("Increase training incentives");
      suggestions.push("Reduce computational requirements");
    }

    return suggestions;
  }

  /**
   * Auto-tune hyperparameters based on performance
   */
  autoTuneHyperparameters(): { learningRate: number; batchSize: number; epochs: number } {
    const performance = this.analyzePerformance();

    let learningRate = 0.01;
    let epochs = 10;
    let batchSize = 32;

    if (performance.accuracy < 0.6) {
      learningRate = 0.001; // Reduce learning rate for better convergence
      epochs = 20; // More training
    } else if (performance.accuracy > 0.9) {
      learningRate = 0.05; // Can afford higher learning rate
      epochs = 5; // Less training needed
    }

    logger.info({ learningRate, epochs, batchSize }, "Hyperparameters auto-tuned");

    return { learningRate, batchSize, epochs };
  }

  // ========== UTILITY METHODS ==========

  /**
   * Register a new AI node
   */
  registerNode(node: AINode): void {
    this.nodes.set(node.nodeId, node);
    logger.info({ nodeId: node.nodeId }, "Node registered");
  }

  /**
   * Get active nodes
   */
  private getActiveNodes(): AINode[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.isOnline && !this.quarantinedNodes.has(node.nodeId)
    );
  }

  /**
   * Check proposal voting status
   */
  private checkProposalStatus(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return;

    let yesVotes = 0;
    let noVotes = 0;

    for (const [nodeId, vote] of proposal.votes.entries()) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      if (vote) {
        yesVotes += node.reputation;
      } else {
        noVotes += node.reputation;
      }
    }

    const totalVotes = yesVotes + noVotes;
    const quorum = 0.51; // 51% quorum required

    if (totalVotes >= quorum) {
      if (yesVotes > noVotes) {
        this.deployNewModel(proposal.newWeights);
        this.proposals.delete(proposalId);
      }
    }
  }

  /**
   * Get current global model
   */
  getGlobalModel(): FederatedModel {
    return { ...this.globalModel };
  }

  /**
   * Get node information
   */
  getNode(nodeId: string): AINode | undefined {
    return this.nodes.get(nodeId);
  }
}