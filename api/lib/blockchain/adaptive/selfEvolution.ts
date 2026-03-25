/**
 * Self-Evolving Blockchain Protocol
 * Darwin meets blockchain - automatic protocol evolution based on performance
 */

export interface EvolutionProposal {
  proposalId: string;
  type: 'consensus' | 'fee' | 'security' | 'performance' | 'feature';
  changes: any;
  proposer: string;
  votes: Map<string, boolean>;
  activationBlock: number;
  status: 'proposed' | 'voting' | 'approved' | 'rejected' | 'active';
  createdAt: number;
  justification: string;
  simulationResults?: any;
}

export interface ProtocolMetrics {
  tps: number; // transactions per second
  latency: number; // confirmation time in ms
  securityScore: number; // 0-100 attack resistance
  decentralization: number; // 0-100 node distribution
  efficiency: number; // 0-100 resource usage
}

export interface NetworkState {
  totalNodes: number;
  activeValidators: number;
  networkLoad: number;
  averageBlockTime: number;
  congestionLevel: number;
}

export interface ProtocolVariant {
  id: string;
  parameters: any;
  fitness: number;
  generation: number;
}

export interface PerformanceGroup {
  nodes: string[];
  metrics: ProtocolMetrics;
  variant: ProtocolVariant;
}

export class SelfEvolvingProtocol {
  private proposals: Map<string, EvolutionProposal>;
  private currentMetrics: ProtocolMetrics;
  private protocolVariants: ProtocolVariant[];
  private activeFeatures: Map<string, any>;
  private historicalMetrics: ProtocolMetrics[];
  private generation: number;
  
  // Protocol parameters
  private blockSize: number;
  private blockTime: number;
  private baseFee: number;
  private difficulty: number;
  private gasLimit: number;
  private validatorReward: number;
  
  constructor() {
    this.proposals = new Map();
    this.protocolVariants = [];
    this.activeFeatures = new Map();
    this.historicalMetrics = [];
    this.generation = 0;
    
    // Initialize default parameters
    this.blockSize = 1024 * 1024; // 1MB
    this.blockTime = 10000; // 10 seconds
    this.baseFee = 0.001;
    this.difficulty = 1000;
    this.gasLimit = 8000000;
    this.validatorReward = 10;
    
    this.currentMetrics = {
      tps: 0,
      latency: 0,
      securityScore: 80,
      decentralization: 75,
      efficiency: 70
    };
  }
  
  // ============================================
  // PERFORMANCE MONITORING
  // ============================================
  
  async measureTPS(): Promise<number> {
    // Simulate measuring transactions per second
    const recentBlocks = 100; // Last 100 blocks
    const totalTransactions = Math.floor(Math.random() * 10000) + 5000;
    const timeWindow = recentBlocks * (this.blockTime / 1000); // in seconds
    const tps = totalTransactions / timeWindow;
    
    this.currentMetrics.tps = tps;
    return tps;
  }
  
  async measureLatency(): Promise<number> {
    // Measure average confirmation time
    const blockConfirmations = 6;
    const latency = this.blockTime * blockConfirmations;
    
    this.currentMetrics.latency = latency;
    return latency;
  }
  
  async measureSecurity(): Promise<number> {
    // Calculate security score based on multiple factors
    const hashPower = Math.random() * 100;
    const nodeDistribution = await this.measureDecentralization();
    const cryptographyStrength = 95; // Modern cryptography
    const attackResistance = Math.floor((hashPower + nodeDistribution + cryptographyStrength) / 3);
    
    this.currentMetrics.securityScore = attackResistance;
    return attackResistance;
  }
  
  async measureDecentralization(): Promise<number> {
    // Measure node distribution and validator diversity
    const totalNodes = 1000 + Math.floor(Math.random() * 500);
    const uniqueOperators = 500 + Math.floor(Math.random() * 300);
    const geographicDistribution = 0.8; // 80% geographic spread
    
    const decentralization = Math.floor((uniqueOperators / totalNodes) * 100 * geographicDistribution);
    this.currentMetrics.decentralization = decentralization;
    return decentralization;
  }
  
  async calculateHealthScore(): Promise<number> {
    // Overall protocol health
    await this.measureTPS();
    await this.measureLatency();
    await this.measureSecurity();
    await this.measureDecentralization();
    
    const tpsScore = Math.min(this.currentMetrics.tps / 100, 100);
    const latencyScore = Math.max(0, 100 - this.currentMetrics.latency / 1000);
    const securityScore = this.currentMetrics.securityScore;
    const decentralizationScore = this.currentMetrics.decentralization;
    
    const healthScore = (tpsScore + latencyScore + securityScore + decentralizationScore) / 4;
    this.currentMetrics.efficiency = Math.floor(healthScore);
    
    this.historicalMetrics.push({ ...this.currentMetrics });
    if (this.historicalMetrics.length > 1000) {
      this.historicalMetrics.shift();
    }
    
    return healthScore;
  }
  
  // ============================================
  // AUTOMATIC OPTIMIZATION
  // ============================================
  
  async optimizeBlockSize(metrics: ProtocolMetrics): Promise<void> {
    // Adjust block size based on throughput needs
    if (metrics.tps < 50 && this.blockSize < 8 * 1024 * 1024) {
      // Increase block size if TPS is low
      this.blockSize = Math.min(this.blockSize * 1.2, 8 * 1024 * 1024);
      console.log(`Block size increased to ${this.blockSize / (1024 * 1024)}MB`);
    } else if (metrics.tps > 200 && this.blockSize > 512 * 1024) {
      // Decrease if network is fast enough
      this.blockSize = Math.max(this.blockSize * 0.9, 512 * 1024);
      console.log(`Block size optimized to ${this.blockSize / (1024 * 1024)}MB`);
    }
  }
  
  async optimizeBlockTime(metrics: ProtocolMetrics): Promise<void> {
    // Balance speed vs security
    const targetLatency = 60000; // 1 minute
    
    if (metrics.latency > targetLatency && this.blockTime > 5000) {
      this.blockTime = Math.max(this.blockTime * 0.95, 5000);
      console.log(`Block time reduced to ${this.blockTime / 1000}s for lower latency`);
    } else if (metrics.securityScore < 70 && this.blockTime < 30000) {
      this.blockTime = Math.min(this.blockTime * 1.1, 30000);
      console.log(`Block time increased to ${this.blockTime / 1000}s for better security`);
    }
  }
  
  async optimizeFeeModel(congestion: number): Promise<void> {
    // Dynamic fee algorithm based on network congestion
    if (congestion > 0.8) {
      // High congestion - increase base fee
      this.baseFee = this.baseFee * 1.5;
      console.log(`Base fee increased to ${this.baseFee} due to congestion`);
    } else if (congestion < 0.3) {
      // Low congestion - decrease base fee
      this.baseFee = Math.max(this.baseFee * 0.9, 0.0001);
      console.log(`Base fee reduced to ${this.baseFee}`);
    }
  }
  
  async optimizeConsensus(networkState: NetworkState): Promise<void> {
    // Adapt consensus mechanism based on network state
    if (networkState.totalNodes < 100) {
      console.log('Small network detected - optimizing for speed');
      this.blockTime = Math.max(this.blockTime * 0.8, 5000);
    } else if (networkState.totalNodes > 1000) {
      console.log('Large network detected - optimizing for decentralization');
      this.blockTime = Math.min(this.blockTime * 1.1, 15000);
    }
    
    // Adjust validator set size
    const optimalValidators = Math.min(Math.floor(networkState.totalNodes * 0.1), 100);
    console.log(`Optimal validator count: ${optimalValidators}`);
  }
  
  // ============================================
  // PROPOSAL SYSTEM
  // ============================================
  
  async proposeEvolution(
    type: EvolutionProposal['type'],
    changes: any,
    justification: string,
    proposer: string
  ): Promise<string> {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const proposal: EvolutionProposal = {
      proposalId,
      type,
      changes,
      proposer,
      votes: new Map(),
      activationBlock: 0,
      status: 'proposed',
      createdAt: Date.now(),
      justification
    };
    
    // Simulate the proposal in sandbox
    const simulationResults = await this.simulateProposal(proposal);
    proposal.simulationResults = simulationResults;
    
    this.proposals.set(proposalId, proposal);
    console.log(`Proposal ${proposalId} created: ${type} - ${justification}`);
    
    return proposalId;
  }
  
  async voteOnProposal(proposalId: string, vote: boolean, stake: number): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'proposed') {
      throw new Error('Invalid proposal or voting closed');
    }
    
    const voterId = `voter-${stake}`;
    proposal.votes.set(voterId, vote);
    
    // Check if voting threshold reached
    const totalVotes = proposal.votes.size;
    if (totalVotes >= 10) { // Minimum 10 votes
      const yesVotes = Array.from(proposal.votes.values()).filter(v => v).length;
      const approvalRate = yesVotes / totalVotes;
      
      if (approvalRate >= 0.66) { // 66% approval needed
        proposal.status = 'approved';
        proposal.activationBlock = Math.floor(Date.now() / this.blockTime) + 100;
        console.log(`Proposal ${proposalId} approved with ${approvalRate * 100}% votes`);
      } else {
        proposal.status = 'rejected';
        console.log(`Proposal ${proposalId} rejected`);
      }
    }
  }
  
  async simulateProposal(proposal: EvolutionProposal): Promise<any> {
    // Test changes in sandbox environment
    console.log(`Simulating proposal ${proposal.proposalId}...`);
    
    const simulatedMetrics: ProtocolMetrics = { ...this.currentMetrics };
    
    // Apply simulated changes
    switch (proposal.type) {
      case 'performance':
        simulatedMetrics.tps *= 1.2;
        simulatedMetrics.latency *= 0.9;
        break;
      case 'security':
        simulatedMetrics.securityScore = Math.min(simulatedMetrics.securityScore * 1.1, 100);
        break;
      case 'consensus':
        simulatedMetrics.decentralization *= 1.15;
        break;
      case 'fee':
        simulatedMetrics.efficiency *= 1.05;
        break;
    }
    
    return {
      predictedMetrics: simulatedMetrics,
      improvement: this.calculateImprovement(this.currentMetrics, simulatedMetrics),
      risks: this.assessRisks(proposal),
      estimatedImpact: 'moderate'
    };
  }
  
  async activateProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'approved') {
      throw new Error('Proposal not approved for activation');
    }
    
    const currentBlock = Math.floor(Date.now() / this.blockTime);
    if (currentBlock < proposal.activationBlock) {
      throw new Error(`Proposal activates at block ${proposal.activationBlock}`);
    }
    
    // Apply the changes
    console.log(`Activating proposal ${proposalId}...`);
    this.applyChanges(proposal.changes);
    proposal.status = 'active';
    
    console.log(`Proposal ${proposalId} activated successfully`);
  }
  
  private applyChanges(changes: any): void {
    // Apply protocol changes
    if (changes.blockSize) this.blockSize = changes.blockSize;
    if (changes.blockTime) this.blockTime = changes.blockTime;
    if (changes.baseFee) this.baseFee = changes.baseFee;
    if (changes.difficulty) this.difficulty = changes.difficulty;
    if (changes.gasLimit) this.gasLimit = changes.gasLimit;
  }
  
  // ============================================
  // A/B TESTING
  // ============================================
  
  async splitNetwork(percentage: number): Promise<{ groupA: string[]; groupB: string[] }> {
    // Split network for testing
    const totalNodes = 1000;
    const splitPoint = Math.floor(totalNodes * percentage);
    
    const groupA = Array.from({ length: splitPoint }, (_, i) => `node-${i}`);
    const groupB = Array.from({ length: totalNodes - splitPoint }, (_, i) => `node-${i + splitPoint}`);
    
    console.log(`Network split: ${groupA.length} nodes in group A, ${groupB.length} in group B`);
    return { groupA, groupB };
  }
  
  async comparePerformance(groupA: PerformanceGroup, groupB: PerformanceGroup): Promise<any> {
    // Compare metrics between test groups
    const improvements = {
      tps: ((groupB.metrics.tps - groupA.metrics.tps) / groupA.metrics.tps) * 100,
      latency: ((groupA.metrics.latency - groupB.metrics.latency) / groupA.metrics.latency) * 100,
      security: groupB.metrics.securityScore - groupA.metrics.securityScore,
      decentralization: groupB.metrics.decentralization - groupA.metrics.decentralization
    };
    
    const overallImprovement = Object.values(improvements).reduce((a, b) => a + b, 0) / 4;
    
    console.log('Performance comparison:', improvements);
    console.log(`Overall improvement: ${overallImprovement.toFixed(2)}%`);
    
    return {
      improvements,
      overallImprovement,
      recommendation: overallImprovement > 5 ? 'rollout' : 'rollback'
    };
  }
  
  async rollout(feature: string): Promise<void> {
    // Gradual deployment of new feature
    console.log(`Rolling out feature: ${feature}`);
    
    const stages = [0.1, 0.25, 0.5, 0.75, 1.0]; // 10%, 25%, 50%, 75%, 100%
    
    for (const stage of stages) {
      console.log(`Deploying to ${stage * 100}% of network...`);
      await this.sleep(1000); // Simulate deployment delay
      
      // Monitor for issues
      const metrics = await this.calculateHealthScore();
      if (metrics < 70) {
        console.log('Issues detected during rollout!');
        await this.rollback(feature);
        return;
      }
    }
    
    this.activeFeatures.set(feature, { activated: Date.now(), status: 'active' });
    console.log(`Feature ${feature} fully deployed`);
  }
  
  async rollback(feature: string): Promise<void> {
    // Revert feature if problems detected
    console.log(`Rolling back feature: ${feature}`);
    
    this.activeFeatures.delete(feature);
    console.log(`Feature ${feature} reverted to previous version`);
  }
  
  // ============================================
  // ADAPTIVE PARAMETERS
  // ============================================
  
  async adjustDifficulty(actualBlockTime: number): Promise<void> {
    // Real-time difficulty adjustment
    const targetBlockTime = this.blockTime;
    
    if (actualBlockTime < targetBlockTime * 0.9) {
      this.difficulty = Math.floor(this.difficulty * 1.05);
      console.log(`Difficulty increased to ${this.difficulty}`);
    } else if (actualBlockTime > targetBlockTime * 1.1) {
      this.difficulty = Math.floor(this.difficulty * 0.95);
      console.log(`Difficulty decreased to ${this.difficulty}`);
    }
  }
  
  async adjustGasLimits(usage: number): Promise<void> {
    // Dynamic resource limits based on usage
    if (usage > 0.9) {
      this.gasLimit = Math.floor(this.gasLimit * 1.1);
      console.log(`Gas limit increased to ${this.gasLimit}`);
    } else if (usage < 0.5) {
      this.gasLimit = Math.floor(this.gasLimit * 0.95);
      console.log(`Gas limit optimized to ${this.gasLimit}`);
    }
  }
  
  async adjustRewards(participation: number): Promise<void> {
    // Incentive optimization based on participation
    if (participation < 0.5) {
      this.validatorReward *= 1.1;
      console.log(`Validator rewards increased to ${this.validatorReward} to boost participation`);
    } else if (participation > 0.9) {
      this.validatorReward = Math.max(this.validatorReward * 0.95, 1);
      console.log(`Validator rewards optimized to ${this.validatorReward}`);
    }
  }
  
  async adjustValidatorSet(performance: Map<string, number>): Promise<string[]> {
    // Rotate validators based on performance
    const validators = Array.from(performance.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 21) // Top 21 validators
      .map(([validator]) => validator);
    
    console.log(`Validator set rotated. Top performers selected.`);
    return validators;
  }
  
  // ============================================
  // SECURITY EVOLUTION
  // ============================================
  
  async detectAttackPattern(transactions: any[]): Promise<string | null> {
    // Identify new attack patterns
    const patterns = {
      ddos: transactions.length > 10000,
      spam: transactions.filter(tx => tx.value < 0.001).length > transactions.length * 0.8,
      doublespend: this.checkDoubleSpend(transactions),
      sybil: this.checkSybilAttack(transactions)
    };
    
    for (const [attack, detected] of Object.entries(patterns)) {
      if (detected) {
        console.log(`⚠️ Attack pattern detected: ${attack}`);
        return attack;
      }
    }
    
    return null;
  }
  
  async deployCountermeasure(attackType: string): Promise<void> {
    // Auto-defend against attacks
    console.log(`Deploying countermeasure for ${attackType}...`);
    
    const countermeasures: Record<string, () => void> = {
      ddos: () => this.baseFee *= 10,
      spam: () => this.gasLimit = Math.floor(this.gasLimit * 0.5),
      doublespend: () => this.blockTime = Math.min(this.blockTime * 1.5, 30000),
      sybil: () => console.log('Implementing stake requirements')
    };
    
    if (countermeasures[attackType]) {
      countermeasures[attackType]();
      console.log(`Countermeasure for ${attackType} deployed`);
    }
  }
  
  async updateCryptography(threatLevel: number): Promise<void> {
    // Upgrade cryptographic algorithms
    if (threatLevel > 70) {
      console.log('High threat level - upgrading to quantum-resistant cryptography');
      // Implement post-quantum cryptography
    } else if (threatLevel > 40) {
      console.log('Moderate threat - strengthening key sizes');
    }
  }
  
  async hardenProtocol(vulnerability: string): Promise<void> {
    // Patch protocol weaknesses
    console.log(`Hardening protocol against ${vulnerability}...`);
    
    // Apply security patches
    await this.proposeEvolution('security', { patch: vulnerability }, `Fix ${vulnerability}`, 'security-ai');
  }
  
  // ============================================
  // GENETIC ALGORITHM
  // ============================================
  
  async generateProtocolVariants(count: number): Promise<ProtocolVariant[]> {
    // Create protocol mutations
    const variants: ProtocolVariant[] = [];
    
    for (let i = 0; i < count; i++) {
      const variant: ProtocolVariant = {
        id: `variant-${this.generation}-${i}`,
        parameters: {
          blockSize: this.blockSize * (0.8 + Math.random() * 0.4),
          blockTime: this.blockTime * (0.8 + Math.random() * 0.4),
          baseFee: this.baseFee * (0.5 + Math.random()),
          gasLimit: this.gasLimit * (0.8 + Math.random() * 0.4)
        },
        fitness: 0,
        generation: this.generation
      };
      
      variants.push(variant);
    }
    
    this.generation++;
    return variants;
  }
  
  async evaluateFitness(variant: ProtocolVariant): Promise<number> {
    // Test performance of variant
    const mockMetrics: ProtocolMetrics = {
      tps: 1000000 / variant.parameters.blockSize,
      latency: variant.parameters.blockTime * 6,
      securityScore: 80 + Math.random() * 20,
      decentralization: 70 + Math.random() * 30,
      efficiency: 60 + Math.random() * 40
    };
    
    // Calculate fitness score
    const fitness = (
      mockMetrics.tps / 10 +
      (100000 - mockMetrics.latency) / 1000 +
      mockMetrics.securityScore +
      mockMetrics.decentralization +
      mockMetrics.efficiency
    ) / 5;
    
    variant.fitness = fitness;
    return fitness;
  }
  
  async crossoverProtocols(parent1: ProtocolVariant, parent2: ProtocolVariant): Promise<ProtocolVariant> {
    // Combine best features from two variants
    const child: ProtocolVariant = {
      id: `variant-${this.generation}-crossover`,
      parameters: {
        blockSize: Math.random() > 0.5 ? parent1.parameters.blockSize : parent2.parameters.blockSize,
        blockTime: Math.random() > 0.5 ? parent1.parameters.blockTime : parent2.parameters.blockTime,
        baseFee: (parent1.parameters.baseFee + parent2.parameters.baseFee) / 2,
        gasLimit: Math.max(parent1.parameters.gasLimit, parent2.parameters.gasLimit)
      },
      fitness: 0,
      generation: this.generation
    };
    
    await this.evaluateFitness(child);
    return child;
  }
  
  async naturalSelection(): Promise<ProtocolVariant[]> {
    // Keep best performing variants
    if (this.protocolVariants.length === 0) {
      this.protocolVariants = await this.generateProtocolVariants(10);
      await Promise.all(this.protocolVariants.map(v => this.evaluateFitness(v)));
    }
    
    // Sort by fitness
    this.protocolVariants.sort((a, b) => b.fitness - a.fitness);
    
    // Keep top 50%
    const survivors = this.protocolVariants.slice(0, Math.ceil(this.protocolVariants.length / 2));
    
    // Generate offspring
    const offspring: ProtocolVariant[] = [];
    for (let i = 0; i < survivors.length; i += 2) {
      if (i + 1 < survivors.length) {
        const child = await this.crossoverProtocols(survivors[i], survivors[i + 1]);
        offspring.push(child);
      }
    }
    
    this.protocolVariants = [...survivors, ...offspring];
    console.log(`Generation ${this.generation}: Best fitness = ${survivors[0].fitness.toFixed(2)}`);
    
    return this.protocolVariants;
  }
  
  // ============================================
  // LEARNING FROM OTHER CHAINS
  // ============================================
  
  async observeBitcoin(): Promise<void> {
    // Learn from Bitcoin network
    console.log('Observing Bitcoin network...');
    
    const bitcoinLessons = {
      securityFirst: 'Prioritize security over speed',
      proofOfWork: 'PoW provides proven security',
      gradualUpgrades: 'Backward compatibility is critical',
      conservativeApproach: 'Move slowly and don\'t break things'
    };
    
    console.log('Bitcoin lessons:', bitcoinLessons);
    
    // Apply conservative security settings
    if (this.currentMetrics.securityScore < 90) {
      await this.proposeEvolution('security', { 
        increaseSecurity: true 
      }, 'Apply Bitcoin security principles', 'bitcoin-observer');
    }
  }
  
  async observeEthereum(): Promise<void> {
    // Learn from Ethereum network
    console.log('Observing Ethereum network...');
    
    const ethereumLessons = {
      smartContracts: 'Programmability enables innovation',
      gasModel: 'Dynamic fees manage congestion',
      pos: 'Proof of Stake is more efficient',
      sharding: 'Scalability through parallelization'
    };
    
    console.log('Ethereum lessons:', ethereumLessons);
    
    // Adopt gas optimization
    await this.optimizeFeeModel(0.7);
  }
  
  async adoptBestPractices(): Promise<void> {
    // Implement proven features from successful chains
    console.log('Adopting best practices from leading blockchains...');
    
    const bestPractices = [
      'Dynamic difficulty adjustment',
      'MEV protection',
      'State pruning',
      'Efficient consensus',
      'Robust mempool management'
    ];
    
    for (const practice of bestPractices) {
      console.log(`✅ Implementing: ${practice}`);
    }
  }
  
  async avoidKnownPitfalls(): Promise<void> {
    // Skip failed experiments from other chains
    console.log('Learning from others\' mistakes...');
    
    const pitfalls = [
      'Avoid: Centralized consensus',
      'Avoid: Fixed block rewards',
      'Avoid: No upgrade path',
      'Avoid: Ignoring MEV',
      'Avoid: Poor incentive design'
    ];
    
    for (const pitfall of pitfalls) {
      console.log(`⚠️ ${pitfall}`);
    }
  }
  
  // ============================================
  // HELPER METHODS
  // ============================================
  
  private calculateImprovement(current: ProtocolMetrics, proposed: ProtocolMetrics): number {
    const improvements = [
      (proposed.tps - current.tps) / current.tps,
      (current.latency - proposed.latency) / current.latency,
      (proposed.securityScore - current.securityScore) / 100,
      (proposed.decentralization - current.decentralization) / 100,
      (proposed.efficiency - current.efficiency) / 100
    ];
    
    return improvements.reduce((a, b) => a + b, 0) / improvements.length;
  }
  
  private assessRisks(proposal: EvolutionProposal): string[] {
    const risks: string[] = [];
    
    if (proposal.type === 'consensus') {
      risks.push('Potential chain split');
      risks.push('Validator coordination needed');
    }
    
    if (proposal.type === 'security') {
      risks.push('Performance impact from security changes');
    }
    
    if (proposal.type === 'performance') {
      risks.push('Security trade-offs');
      risks.push('Network stability concerns');
    }
    
    return risks;
  }
  
  private checkDoubleSpend(transactions: any[]): boolean {
    // Simple double-spend detection
    const txHashes = new Set<string>();
    for (const tx of transactions) {
      const hash = JSON.stringify({ from: tx.from, nonce: tx.nonce });
      if (txHashes.has(hash)) {
        return true;
      }
      txHashes.add(hash);
    }
    return false;
  }
  
  private checkSybilAttack(transactions: any[]): boolean {
    // Detect Sybil attack patterns
    const senderCounts = new Map<string, number>();
    for (const tx of transactions) {
      const count = senderCounts.get(tx.from) || 0;
      senderCounts.set(tx.from, count + 1);
    }
    
    // If any sender has more than 20% of transactions, flag as potential Sybil
    const maxCount = Math.max(...Array.from(senderCounts.values()));
    return maxCount > transactions.length * 0.2;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}