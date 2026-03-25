import crypto from "crypto";

/**
 * Validator interface representing a network validator
 */
export interface Validator {
  address: string;
  stake: bigint;
  totalRewards: bigint;
  blocksValidated: number;
  lastActiveBlock: number;
  reputation: number; // 0-100
  isActive: boolean;
}

/**
 * Stake interface representing a validator's stake
 */
export interface Stake {
  validator: string;
  amount: bigint;
  startBlock: number;
  lockPeriod: number;
  rewards: bigint;
}

/**
 * Block interface for consensus operations
 */
export interface Block {
  height: number;
  timestamp: number;
  previousHash: string;
  hash: string;
  nonce?: number;
  difficulty?: number;
  validator?: string;
  transactions: any[];
  fees: bigint;
}

/**
 * Slashing reason enum
 */
export enum SlashingReason {
  DOUBLE_SIGN = "DOUBLE_SIGN",
  DOWNTIME = "DOWNTIME",
  INVALID_BLOCK = "INVALID_BLOCK",
  MALICIOUS_BEHAVIOR = "MALICIOUS_BEHAVIOR",
}

/**
 * Hybrid Proof of Stake + Proof of Work Consensus Engine
 */
export class ConsensusEngine {
  private validators: Map<string, Validator>;
  private stakes: Map<string, Stake>;
  private bannedValidators: Map<string, number>; // validator -> unban block height
  private checkpoints: Map<number, string>; // block height -> block hash
  private minStake: bigint;
  private slashingPercentage: number;
  private epochLength: number;
  private currentEpoch: number;
  private currentBlockHeight: number;
  private baseBlockReward: bigint;
  private annualStakingRate: number; // percentage
  private targetBlockTime: number; // seconds
  private lastBlockTime: number;
  private checkpointInterval: number;

  constructor(config: {
    minStake?: bigint;
    slashingPercentage?: number;
    epochLength?: number;
    baseBlockReward?: bigint;
    annualStakingRate?: number;
    targetBlockTime?: number;
    checkpointInterval?: number;
  } = {}) {
    this.validators = new Map();
    this.stakes = new Map();
    this.bannedValidators = new Map();
    this.checkpoints = new Map();
    this.minStake = config.minStake ?? BigInt(10000);
    this.slashingPercentage = config.slashingPercentage ?? 10;
    this.epochLength = config.epochLength ?? 100;
    this.currentEpoch = 0;
    this.currentBlockHeight = 0;
    this.baseBlockReward = config.baseBlockReward ?? BigInt(50);
    this.annualStakingRate = config.annualStakingRate ?? 5; // 5% APY
    this.targetBlockTime = config.targetBlockTime ?? 10; // 10 seconds
    this.lastBlockTime = Date.now();
    this.checkpointInterval = config.checkpointInterval ?? 1000;
  }

  // ===== PROOF OF STAKE IMPLEMENTATION =====

  /**
   * Register a new validator with initial stake
   */
  registerValidator(address: string, initialStake: bigint): void {
    if (this.validators.has(address)) {
      throw new Error(`Validator ${address} already registered`);
    }

    if (initialStake < this.minStake) {
      throw new Error(`Stake must be at least ${this.minStake}`);
    }

    const validator: Validator = {
      address,
      stake: initialStake,
      totalRewards: BigInt(0),
      blocksValidated: 0,
      lastActiveBlock: this.currentBlockHeight,
      reputation: 50, // Start with neutral reputation
      isActive: true,
    };

    const stake: Stake = {
      validator: address,
      amount: initialStake,
      startBlock: this.currentBlockHeight,
      lockPeriod: this.epochLength * 2,
      rewards: BigInt(0),
    };

    this.validators.set(address, validator);
    this.stakes.set(address, stake);
  }

  /**
   * Add stake to a validator
   */
  stake(validatorAddress: string, amount: bigint): void {
    const validator = this.validators.get(validatorAddress);
    if (!validator) {
      throw new Error(`Validator ${validatorAddress} not found`);
    }

    const stake = this.stakes.get(validatorAddress);
    if (!stake) {
      throw new Error(`Stake for ${validatorAddress} not found`);
    }

    validator.stake += amount;
    stake.amount += amount;

    this.validators.set(validatorAddress, validator);
    this.stakes.set(validatorAddress, stake);
  }

  /**
   * Remove stake from a validator (with lock period check)
   */
  unstake(validatorAddress: string, amount: bigint): void {
    const validator = this.validators.get(validatorAddress);
    if (!validator) {
      throw new Error(`Validator ${validatorAddress} not found`);
    }

    const stake = this.stakes.get(validatorAddress);
    if (!stake) {
      throw new Error(`Stake for ${validatorAddress} not found`);
    }

    // Check lock period
    const blocksSinceStake = this.currentBlockHeight - stake.startBlock;
    if (blocksSinceStake < stake.lockPeriod) {
      throw new Error(
        `Stake is locked for ${stake.lockPeriod - blocksSinceStake} more blocks`
      );
    }

    if (amount > stake.amount) {
      throw new Error(`Insufficient stake balance`);
    }

    validator.stake -= amount;
    stake.amount -= amount;

    // Deactivate validator if stake falls below minimum
    if (validator.stake < this.minStake) {
      validator.isActive = false;
    }

    this.validators.set(validatorAddress, validator);
    this.stakes.set(validatorAddress, stake);
  }

  /**
   * Select a validator based on stake weight
   */
  selectValidator(blockHeight: number): string | null {
    const activeValidators = Array.from(this.validators.values()).filter(
      (v) =>
        v.isActive &&
        !this.bannedValidators.has(v.address) &&
        v.stake >= this.minStake
    );

    if (activeValidators.length === 0) {
      return null;
    }

    // Calculate total weight
    let totalWeight = BigInt(0);
    const weights = new Map<string, bigint>();

    for (const validator of activeValidators) {
      const weight = this.calculateStakeWeight(validator);
      weights.set(validator.address, weight);
      totalWeight += weight;
    }

    // Random selection weighted by stake
    const seed = blockHeight;
    const randomValue = BigInt(
      "0x" +
        crypto
          .createHash("sha256")
          .update(seed.toString())
          .digest("hex")
          .slice(0, 16)
    );
    let selection = randomValue % totalWeight;

    for (const [address, weight] of weights.entries()) {
      if (selection < weight) {
        return address;
      }
      selection -= weight;
    }

    return activeValidators[0].address;
  }

  /**
   * Calculate stake weight including reputation
   */
  calculateStakeWeight(validator: Validator): bigint {
    // Weight = stake * (1 + reputation/100)
    const reputationMultiplier = BigInt(100 + validator.reputation);
    return (validator.stake * reputationMultiplier) / BigInt(100);
  }

  /**
   * Rotate validators at the end of each epoch
   */
  rotateValidators(): void {
    this.currentEpoch++;

    // Update reputation for inactive validators
    for (const [address, validator] of this.validators.entries()) {
      const blocksSinceActive = this.currentBlockHeight - validator.lastActiveBlock;

      if (blocksSinceActive > this.epochLength) {
        // Decrease reputation for inactivity
        validator.reputation = Math.max(0, validator.reputation - 5);
      } else {
        // Increase reputation for active validators
        validator.reputation = Math.min(100, validator.reputation + 2);
      }

      this.validators.set(address, validator);
    }

    // Unban validators whose ban period has expired
    for (const [address, unbanHeight] of this.bannedValidators.entries()) {
      if (this.currentBlockHeight >= unbanHeight) {
        this.bannedValidators.delete(address);
      }
    }
  }

  // ===== PROOF OF WORK IMPLEMENTATION =====

  /**
   * Mine a block using Proof of Work
   */
  mine(block: Block, difficulty: number): Block {
    let nonce = 0;
    const target = "0".repeat(difficulty);

    while (true) {
      const hash = this.calculateHash(block, nonce);
      if (hash.startsWith(target)) {
        block.nonce = nonce;
        block.hash = hash;
        block.difficulty = difficulty;
        return block;
      }
      nonce++;
    }
  }

  /**
   * Verify Proof of Work solution
   */
  verifyPoW(block: Block): boolean {
    if (!block.nonce || !block.difficulty || !block.hash) {
      return false;
    }

    const hash = this.calculateHash(block, block.nonce);
    const target = "0".repeat(block.difficulty);

    return hash === block.hash && hash.startsWith(target);
  }

  /**
   * Adjust difficulty based on block time
   */
  adjustDifficulty(actualBlockTime: number): number {
    const currentTime = Date.now();
    const timeDiff = (currentTime - this.lastBlockTime) / 1000;
    this.lastBlockTime = currentTime;

    // If blocks are coming too fast, increase difficulty
    if (timeDiff < this.targetBlockTime * 0.8) {
      return Math.min(10, (actualBlockTime || 4) + 1);
    }

    // If blocks are coming too slow, decrease difficulty
    if (timeDiff > this.targetBlockTime * 1.2) {
      return Math.max(1, (actualBlockTime || 4) - 1);
    }

    return actualBlockTime || 4;
  }

  /**
   * Calculate hash for a block
   */
  private calculateHash(block: Block, nonce: number): string {
    const data = `${block.height}${block.timestamp}${block.previousHash}${nonce}${JSON.stringify(
      block.transactions
    )}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  // ===== HYBRID CONSENSUS LOGIC =====

  /**
   * Determine if Proof of Stake should be used for this block
   */
  shouldUsePoS(blockHeight: number): boolean {
    // Use PoS for even blocks, PoW for odd blocks (simple alternating)
    // In production, this could be based on network conditions
    return blockHeight % 2 === 0;
  }

  /**
   * Determine if Proof of Work should be used for this block
   */
  shouldUsePoW(blockHeight: number): boolean {
    return !this.shouldUsePoS(blockHeight);
  }

  /**
   * Validate a block using both PoS and PoW checks
   */
  validateBlock(block: Block, validatorAddress?: string): boolean {
    this.currentBlockHeight = block.height;

    if (this.shouldUsePoS(block.height)) {
      // Validate PoS block
      if (!validatorAddress) {
        return false;
      }

      const validator = this.validators.get(validatorAddress);
      if (!validator || !validator.isActive) {
        return false;
      }

      if (this.bannedValidators.has(validatorAddress)) {
        return false;
      }

      if (validator.stake < this.minStake) {
        return false;
      }

      // Update validator stats
      validator.blocksValidated++;
      validator.lastActiveBlock = block.height;
      this.validators.set(validatorAddress, validator);

      return true;
    } else {
      // Validate PoW block
      return this.verifyPoW(block);
    }
  }

  // ===== REWARD DISTRIBUTION =====

  /**
   * Calculate total block reward (base + fees)
   */
  calculateBlockReward(block: Block): bigint {
    return this.baseBlockReward + block.fees;
  }

  /**
   * Distribute rewards to miner/validator
   */
  distributeRewards(block: Block, validatorAddress: string): void {
    const validator = this.validators.get(validatorAddress);
    if (!validator) {
      throw new Error(`Validator ${validatorAddress} not found`);
    }

    const reward = this.calculateBlockReward(block);
    validator.totalRewards += reward;

    const stake = this.stakes.get(validatorAddress);
    if (stake) {
      stake.rewards += reward;
      this.stakes.set(validatorAddress, stake);
    }

    this.validators.set(validatorAddress, validator);
  }

  /**
   * Calculate staking rewards based on annual percentage
   */
  calculateStakingRewards(validatorAddress: string): bigint {
    const stake = this.stakes.get(validatorAddress);
    if (!stake) {
      return BigInt(0);
    }

    const blocksSinceStake = this.currentBlockHeight - stake.startBlock;
    const yearInBlocks = (365 * 24 * 60 * 60) / this.targetBlockTime;
    const timeRatio = blocksSinceStake / yearInBlocks;

    // Annual rewards = stake * (annualStakingRate / 100) * timeRatio
    const annualReward =
      (stake.amount * BigInt(this.annualStakingRate)) / BigInt(100);
    return (annualReward * BigInt(Math.floor(timeRatio * 1000))) / BigInt(1000);
  }

  /**
   * Claim accumulated rewards
   */
  claimRewards(validatorAddress: string): bigint {
    const stake = this.stakes.get(validatorAddress);
    if (!stake) {
      throw new Error(`Stake for ${validatorAddress} not found`);
    }

    const stakingRewards = this.calculateStakingRewards(validatorAddress);
    const totalRewards = stake.rewards + stakingRewards;

    // Reset rewards
    stake.rewards = BigInt(0);
    stake.startBlock = this.currentBlockHeight;
    this.stakes.set(validatorAddress, stake);

    return totalRewards;
  }

  // ===== SLASHING & PENALTIES =====

  /**
   * Slash a validator for bad behavior
   */
  slashValidator(validatorAddress: string, reason: SlashingReason): void {
    const validator = this.validators.get(validatorAddress);
    if (!validator) {
      throw new Error(`Validator ${validatorAddress} not found`);
    }

    const stake = this.stakes.get(validatorAddress);
    if (!stake) {
      throw new Error(`Stake for ${validatorAddress} not found`);
    }

    // Calculate slashing amount
    const slashAmount =
      (validator.stake * BigInt(this.slashingPercentage)) / BigInt(100);

    // Reduce stake
    validator.stake -= slashAmount;
    stake.amount -= slashAmount;

    // Reduce reputation
    validator.reputation = Math.max(0, validator.reputation - 20);

    // Deactivate if stake falls below minimum
    if (validator.stake < this.minStake) {
      validator.isActive = false;
    }

    this.validators.set(validatorAddress, validator);
    this.stakes.set(validatorAddress, stake);

    console.log(
      `Validator ${validatorAddress} slashed ${slashAmount} for ${reason}`
    );
  }

  /**
   * Detect double signing (validator signing two different blocks at same height)
   */
  detectDoubleSign(block1: Block, block2: Block): boolean {
    if (
      block1.height === block2.height &&
      block1.validator === block2.validator &&
      block1.hash !== block2.hash
    ) {
      return true;
    }
    return false;
  }

  /**
   * Ban a validator for a duration
   */
  banValidator(validatorAddress: string, durationInBlocks: number): void {
    const validator = this.validators.get(validatorAddress);
    if (!validator) {
      throw new Error(`Validator ${validatorAddress} not found`);
    }

    validator.isActive = false;
    this.bannedValidators.set(
      validatorAddress,
      this.currentBlockHeight + durationInBlocks
    );
    this.validators.set(validatorAddress, validator);

    console.log(
      `Validator ${validatorAddress} banned for ${durationInBlocks} blocks`
    );
  }

  // ===== FINALITY MECHANISM =====

  /**
   * Create a finality checkpoint at a block height
   */
  checkpoint(blockHeight: number, blockHash: string): void {
    this.checkpoints.set(blockHeight, blockHash);
    console.log(`Checkpoint created at block ${blockHeight}: ${blockHash}`);
  }

  /**
   * Check if a block is finalized
   */
  isFinalized(block: Block): boolean {
    // Block is finalized if it's before the last checkpoint
    const lastCheckpointHeight = Math.max(...Array.from(this.checkpoints.keys()), 0);

    if (block.height <= lastCheckpointHeight - this.checkpointInterval) {
      return true;
    }

    // Also check if there's a direct checkpoint for this block
    return this.checkpoints.has(block.height);
  }

  /**
   * Get the last finalized block height and hash
   */
  getLastFinalizedBlock(): { height: number; hash: string } | null {
    if (this.checkpoints.size === 0) {
      return null;
    }

    const heights = Array.from(this.checkpoints.keys()).sort((a, b) => b - a);
    const lastHeight = heights[0];
    const lastHash = this.checkpoints.get(lastHeight);

    if (!lastHash) {
      return null;
    }

    return { height: lastHeight, hash: lastHash };
  }

  // ===== UTILITY METHODS =====

  /**
   * Get validator information
   */
  getValidator(address: string): Validator | undefined {
    return this.validators.get(address);
  }

  /**
   * Get stake information
   */
  getStake(address: string): Stake | undefined {
    return this.stakes.get(address);
  }

  /**
   * Get all active validators
   */
  getActiveValidators(): Validator[] {
    return Array.from(this.validators.values()).filter(
      (v) => v.isActive && !this.bannedValidators.has(v.address)
    );
  }

  /**
   * Get current epoch
   */
  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Set current block height
   */
  setBlockHeight(height: number): void {
    this.currentBlockHeight = height;

    // Check if we need to rotate validators
    if (height % this.epochLength === 0) {
      this.rotateValidators();
    }

    // Auto-checkpoint at intervals
    if (height % this.checkpointInterval === 0) {
      // In production, this would checkpoint the actual block hash
      this.checkpoint(height, `checkpoint-${height}`);
    }
  }
}

/**
 * Instant Finality Consensus mechanism
 */
export class InstantFinalityConsensus {
  private config: any;
  
  constructor(config?: any) {
    this.config = config || {};
  }
  
  rotateValidators() {
    // Stub for validator rotation
    return [];
  }
}

// Export factory function for easy initialization
export function createConsensusEngine(config?: ConstructorParameters<typeof ConsensusEngine>[0]): ConsensusEngine {
  return new ConsensusEngine(config);
}