import { logger } from "gadget-server";

/**
 * Configuration for CypherCoin currency
 */
export interface CurrencyConfig {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: bigint;
  initialSupply: bigint;
  halvingInterval: number;
  baseBlockReward: bigint;
  transactionFeePercentage: number;
  stakingRewardRate: number;
  burnPercentage: number;
  blockTime: number;
}

/**
 * Current statistics about the token
 */
export interface TokenStats {
  totalSupply: bigint;
  circulatingSupply: bigint;
  burned: bigint;
  locked: bigint;
  holders: number;
  transactions24h: number;
  volume24h: bigint;
  inflationRate: number;
  currentEra: number;
  nextHalvingBlock: number;
}

/**
 * Transaction record for history tracking
 */
interface TransactionRecord {
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  timestamp: number;
  type: 'transfer' | 'mining_reward' | 'staking_reward' | 'burn';
}

/**
 * Staking information
 */
interface StakingInfo {
  amount: bigint;
  startTime: number;
  lastRewardTime: number;
}

/**
 * Fee distribution breakdown
 */
interface FeeRecipients {
  burn: bigint;
  miner: bigint;
  stakers: bigint;
}

/**
 * Halving event information
 */
interface HalvingEvent {
  era: number;
  blockHeight: number;
  reward: bigint;
  timestamp: number;
}

/**
 * CypherCoin Tokenomics Engine
 * Manages all economic aspects of the CYP token
 */
export class TokenomicsEngine {
  private config: CurrencyConfig;
  private currentSupply: bigint = 0n;
  private burnedTokens: bigint = 0n;
  private stakedTokens: Map<string, StakingInfo> = new Map();
  private blockHeight: number = 0;
  private holders: Map<string, bigint> = new Map();
  private transactionHistory: TransactionRecord[] = [];
  private stakingRewards: Map<string, bigint> = new Map();
  private lastRewardDistribution: number = Date.now();
  private accumulatedFees: bigint = 0n;
  private totalMinted: bigint = 0n;

  constructor(config?: Partial<CurrencyConfig>) {
    this.config = {
      name: 'CypherCoin',
      symbol: 'CYP',
      decimals: 18,
      maxSupply: 21000000n,
      initialSupply: 0n,
      halvingInterval: 210000,
      baseBlockReward: 50n,
      transactionFeePercentage: 0.1,
      stakingRewardRate: 5,
      burnPercentage: 50,
      blockTime: 600000, // 10 minutes
      ...config
    };

    this.currentSupply = this.config.initialSupply;
    this.totalMinted = this.config.initialSupply;
  }

  // Supply Management Methods

  getCurrentSupply(): bigint {
    return this.currentSupply - this.burnedTokens - this.getTotalStaked();
  }

  getTotalSupply(): bigint {
    return this.totalMinted;
  }

  getRemainingSupply(): bigint {
    return this.config.maxSupply - this.totalMinted;
  }

  getInflationRate(): number {
    if (this.totalMinted === 0n) return 0;
    const annualBlocks = Math.floor(31536000000 / this.config.blockTime); // blocks per year
    const currentReward = this.calculateBlockReward(this.blockHeight);
    const annualEmission = BigInt(annualBlocks) * currentReward;
    return Number((annualEmission * 10000n) / this.totalMinted) / 100;
  }

  getHalvingCountdown(): number {
    const currentEra = this.getCurrentEra(this.blockHeight);
    const nextHalvingBlock = (currentEra + 1) * this.config.halvingInterval;
    return nextHalvingBlock - this.blockHeight;
  }

  calculateBlockReward(blockHeight: number): bigint {
    const era = this.getCurrentEra(blockHeight);
    const reward = this.config.baseBlockReward >> BigInt(era);
    return reward;
  }

  // Mining Reward Methods

  calculateMiningReward(blockHeight: number): bigint {
    return this.calculateBlockReward(blockHeight);
  }

  distributeMiningReward(minerAddress: string, blockHeight: number): bigint {
    const reward = this.calculateMiningReward(blockHeight);
    
    if (this.totalMinted + reward > this.config.maxSupply) {
      logger.warn('Cannot mint: would exceed max supply');
      return 0n;
    }

    this.autoMint(reward, minerAddress, 'mining_reward');
    
    const transaction: TransactionRecord = {
      from: 'SYSTEM',
      to: minerAddress,
      amount: reward,
      fee: 0n,
      timestamp: Date.now(),
      type: 'mining_reward'
    };
    this.transactionHistory.push(transaction);

    logger.info(`Distributed mining reward: ${reward} CYP to ${minerAddress} at block ${blockHeight}`);
    return reward;
  }

  getHalvingSchedule(): HalvingEvent[] {
    const schedule: HalvingEvent[] = [];
    let era = 0;
    let reward = this.config.baseBlockReward;

    while (reward > 0n) {
      schedule.push({
        era,
        blockHeight: era * this.config.halvingInterval,
        reward,
        timestamp: era * this.config.halvingInterval * this.config.blockTime
      });
      reward = reward >> 1n;
      era++;
    }

    return schedule;
  }

  estimateNextHalving(currentBlock: number): number {
    const currentEra = this.getCurrentEra(currentBlock);
    const nextHalvingBlock = (currentEra + 1) * this.config.halvingInterval;
    return nextHalvingBlock;
  }

  getCurrentEra(blockHeight: number): number {
    return Math.floor(blockHeight / this.config.halvingInterval);
  }

  // Transaction Fee Methods

  calculateTransactionFee(amount: bigint): bigint {
    const feePercentage = BigInt(Math.floor(this.config.transactionFeePercentage * 1000));
    return (amount * feePercentage) / 100000n;
  }

  collectFee(from: string, amount: bigint): bigint {
    const fee = this.calculateTransactionFee(amount);
    const balance = this.holders.get(from) || 0n;
    
    if (balance < fee) {
      logger.error(`Insufficient balance for fee: ${from}`);
      return 0n;
    }

    this.holders.set(from, balance - fee);
    this.accumulatedFees += fee;
    
    return fee;
  }

  distributeFees(totalFees: bigint): FeeRecipients {
    const burnAmount = (totalFees * BigInt(this.config.burnPercentage)) / 100n;
    const minerAmount = (totalFees * 30n) / 100n;
    const stakersAmount = totalFees - burnAmount - minerAmount;

    this.autoBurn(burnAmount);

    return {
      burn: burnAmount,
      miner: minerAmount,
      stakers: stakersAmount
    };
  }

  getFeeRecipients(): { burn: number; miner: number; stakers: number } {
    return {
      burn: this.config.burnPercentage,
      miner: 30,
      stakers: 20
    };
  }

  getAccumulatedFees(): bigint {
    return this.accumulatedFees;
  }

  // Burning Mechanism Methods

  burnTokens(amount: bigint, reason: string): void {
    if (amount <= 0n) {
      logger.warn('Cannot burn zero or negative amount');
      return;
    }

    this.burnedTokens += amount;
    this.currentSupply -= amount;

    const transaction: TransactionRecord = {
      from: 'BURN',
      to: 'BURN',
      amount,
      fee: 0n,
      timestamp: Date.now(),
      type: 'burn'
    };
    this.transactionHistory.push(transaction);

    logger.info(`Burned ${amount} CYP. Reason: ${reason}`);
  }

  getBurnedTotal(): bigint {
    return this.burnedTokens;
  }

  getBurnRate(): number {
    const oneDayAgo = Date.now() - 86400000;
    const recentBurns = this.transactionHistory
      .filter(tx => tx.type === 'burn' && tx.timestamp >= oneDayAgo)
      .reduce((sum, tx) => sum + tx.amount, 0n);
    
    return Number(recentBurns);
  }

  isDeflationary(): boolean {
    const burnRate = this.getBurnRate();
    const annualBlocks = Math.floor(31536000000 / this.config.blockTime);
    const dailyBlocks = Math.floor(annualBlocks / 365);
    const currentReward = this.calculateBlockReward(this.blockHeight);
    const dailyEmission = BigInt(dailyBlocks) * currentReward;
    
    return burnRate > Number(dailyEmission);
  }

  autoBurn(fees: bigint): void {
    const burnAmount = (fees * BigInt(this.config.burnPercentage)) / 100n;
    this.burnTokens(burnAmount, 'automatic fee burn');
  }

  // Staking Reward Methods

  stake(address: string, amount: bigint): void {
    if (amount <= 0n) {
      logger.warn('Cannot stake zero or negative amount');
      return;
    }

    const balance = this.holders.get(address) || 0n;
    if (balance < amount) {
      logger.error(`Insufficient balance for staking: ${address}`);
      return;
    }

    const existingStake = this.stakedTokens.get(address);
    const now = Date.now();

    if (existingStake) {
      this.stakedTokens.set(address, {
        amount: existingStake.amount + amount,
        startTime: existingStake.startTime,
        lastRewardTime: now
      });
    } else {
      this.stakedTokens.set(address, {
        amount,
        startTime: now,
        lastRewardTime: now
      });
    }

    this.holders.set(address, balance - amount);
    logger.info(`Staked ${amount} CYP for ${address}`);
  }

  unstake(address: string, amount: bigint): void {
    const stakeInfo = this.stakedTokens.get(address);
    
    if (!stakeInfo || stakeInfo.amount < amount) {
      logger.error(`Insufficient staked amount for ${address}`);
      return;
    }

    const reward = this.calculateStakingReward(address);
    const newStakeAmount = stakeInfo.amount - amount;

    if (newStakeAmount === 0n) {
      this.stakedTokens.delete(address);
    } else {
      this.stakedTokens.set(address, {
        ...stakeInfo,
        amount: newStakeAmount,
        lastRewardTime: Date.now()
      });
    }

    const currentBalance = this.holders.get(address) || 0n;
    this.holders.set(address, currentBalance + amount + reward);

    logger.info(`Unstaked ${amount} CYP for ${address}, reward: ${reward}`);
  }

  calculateStakingReward(address: string): bigint {
    const stakeInfo = this.stakedTokens.get(address);
    if (!stakeInfo) return 0n;

    const now = Date.now();
    const timeStaked = now - stakeInfo.lastRewardTime;
    const yearInMs = 31536000000;
    const timeRatio = timeStaked / yearInMs;
    
    const annualRewardRate = BigInt(Math.floor(this.config.stakingRewardRate * 1000));
    const reward = (stakeInfo.amount * annualRewardRate * BigInt(Math.floor(timeRatio * 1000000))) / 100000000000n;
    
    return reward;
  }

  distributeStakingRewards(): void {
    const rewards: Map<string, bigint> = new Map();

    for (const [address, stakeInfo] of this.stakedTokens.entries()) {
      const reward = this.calculateStakingReward(address);
      if (reward > 0n) {
        rewards.set(address, reward);
        this.stakedTokens.set(address, {
          ...stakeInfo,
          lastRewardTime: Date.now()
        });
      }
    }

    for (const [address, reward] of rewards.entries()) {
      this.autoMint(reward, address, 'staking_reward');
      const transaction: TransactionRecord = {
        from: 'SYSTEM',
        to: address,
        amount: reward,
        fee: 0n,
        timestamp: Date.now(),
        type: 'staking_reward'
      };
      this.transactionHistory.push(transaction);
    }

    this.lastRewardDistribution = Date.now();
    logger.info(`Distributed staking rewards to ${rewards.size} stakers`);
  }

  getStakingAPY(): number {
    return this.config.stakingRewardRate;
  }

  getTotalStaked(): bigint {
    let total = 0n;
    for (const stakeInfo of this.stakedTokens.values()) {
      total += stakeInfo.amount;
    }
    return total;
  }

  // Circulation Mechanics Methods

  circulateRewards(): void {
    this.distributeStakingRewards();
    logger.info('Circulated all pending rewards');
  }

  rebalanceEconomy(): void {
    const isDeflationary = this.isDeflationary();
    
    if (isDeflationary && this.config.burnPercentage > 10) {
      this.config.burnPercentage -= 5;
      logger.info('Reduced burn percentage to maintain supply balance');
    } else if (!isDeflationary && this.config.burnPercentage < 90) {
      this.config.burnPercentage += 5;
      logger.info('Increased burn percentage to control inflation');
    }
  }

  getVelocity(): number {
    const volume24h = this.getVolume24h();
    const supply = this.getCurrentSupply();
    
    if (supply === 0n) return 0;
    return Number((volume24h * 100n) / supply) / 100;
  }

  getDistribution(): number {
    const balances: bigint[] = [];
    for (const balance of this.holders.values()) {
      if (balance > 0n) {
        balances.push(balance);
      }
    }

    if (balances.length === 0) return 0;

    balances.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    
    let sumOfDifferences = 0n;
    const n = BigInt(balances.length);
    const totalSupply = balances.reduce((sum, b) => sum + b, 0n);

    for (let i = 0; i < balances.length; i++) {
      const rank = BigInt(i + 1);
      sumOfDifferences += (2n * rank - n - 1n) * balances[i];
    }

    const gini = Number((sumOfDifferences * 1000n) / (n * totalSupply)) / 1000;
    return gini;
  }

  getConcentration(): number {
    const balances: Array<{ address: string; balance: bigint }> = [];
    
    for (const [address, balance] of this.holders.entries()) {
      if (balance > 0n) {
        balances.push({ address, balance });
      }
    }

    balances.sort((a, b) => (a.balance > b.balance ? -1 : 1));
    
    const top10Count = Math.ceil(balances.length * 0.1);
    const top10Balances = balances.slice(0, top10Count);
    const top10Total = top10Balances.reduce((sum, item) => sum + item.balance, 0n);
    const totalSupply = balances.reduce((sum, item) => sum + item.balance, 0n);

    if (totalSupply === 0n) return 0;
    return Number((top10Total * 10000n) / totalSupply) / 100;
  }

  // Automated Process Methods

  autoMint(amount: bigint, recipient: string, reason: string): void {
    if (this.totalMinted + amount > this.config.maxSupply) {
      logger.warn(`Cannot mint ${amount}: would exceed max supply`);
      return;
    }

    this.totalMinted += amount;
    this.currentSupply += amount;
    
    const currentBalance = this.holders.get(recipient) || 0n;
    this.holders.set(recipient, currentBalance + amount);

    logger.info(`Minted ${amount} CYP to ${recipient}. Reason: ${reason}`);
  }

  autoBurnAccumulated(): void {
    if (this.accumulatedFees > 0n) {
      const distribution = this.distributeFees(this.accumulatedFees);
      this.accumulatedFees = 0n;
      logger.info(`Auto-burned ${distribution.burn} CYP from accumulated fees`);
    }
  }

  autoDistribute(): void {
    this.distributeStakingRewards();
  }

  autoRebalance(): void {
    this.rebalanceEconomy();
  }

  // Economic Metrics Methods

  getMarketCap(): bigint {
    // This would integrate with a price oracle in production
    const price = this.getPrice();
    return this.totalMinted * BigInt(Math.floor(price * 100)) / 100n;
  }

  getPrice(): number {
    // Placeholder - would integrate with price oracle
    return 1.0;
  }

  getLiquidity(): bigint {
    return this.getCurrentSupply();
  }

  getVolume24h(): bigint {
    const oneDayAgo = Date.now() - 86400000;
    return this.transactionHistory
      .filter(tx => tx.timestamp >= oneDayAgo && tx.type === 'transfer')
      .reduce((sum, tx) => sum + tx.amount, 0n);
  }

  getHolderCount(): number {
    let count = 0;
    for (const balance of this.holders.values()) {
      if (balance > 0n) count++;
    }
    return count;
  }

  getActiveAddresses24h(): number {
    const oneDayAgo = Date.now() - 86400000;
    const activeAddresses = new Set<string>();
    
    for (const tx of this.transactionHistory) {
      if (tx.timestamp >= oneDayAgo) {
        activeAddresses.add(tx.from);
        activeAddresses.add(tx.to);
      }
    }

    return activeAddresses.size;
  }

  // Helper Methods

  toBaseUnit(amount: number): bigint {
    const multiplier = 10n ** BigInt(this.config.decimals);
    return BigInt(Math.floor(amount * Number(multiplier))) / 1n;
  }

  fromBaseUnit(amount: bigint): number {
    const divisor = 10n ** BigInt(this.config.decimals);
    return Number(amount) / Number(divisor);
  }

  validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  getStats(): TokenStats {
    return {
      totalSupply: this.totalMinted,
      circulatingSupply: this.getCurrentSupply(),
      burned: this.burnedTokens,
      locked: this.getTotalStaked(),
      holders: this.getHolderCount(),
      transactions24h: this.transactionHistory.filter(
        tx => tx.timestamp >= Date.now() - 86400000
      ).length,
      volume24h: this.getVolume24h(),
      inflationRate: this.getInflationRate(),
      currentEra: this.getCurrentEra(this.blockHeight),
      nextHalvingBlock: this.estimateNextHalving(this.blockHeight)
    };
  }

  // Block advancement for testing/simulation
  advanceBlock(): void {
    this.blockHeight++;
  }

  setBlockHeight(height: number): void {
    this.blockHeight = height;
  }
}

// Singleton instance
let tokenomicsInstance: TokenomicsEngine | null = null;

/**
 * Get or create the singleton tokenomics instance
 */
export function getTokenomics(config?: Partial<CurrencyConfig>): TokenomicsEngine {
  if (!tokenomicsInstance) {
    tokenomicsInstance = new TokenomicsEngine(config);
  }
  return tokenomicsInstance;
}

/**
 * Create a new tokenomics instance (for testing or multiple currencies)
 */
export function createTokenomics(config?: Partial<CurrencyConfig>): TokenomicsEngine {
  return new TokenomicsEngine(config);
}

// Simple Tokenomics class for basic usage
export class Tokenomics {
  private config: any;
  
  constructor(config: any) {
    this.config = config;
  }
  
  getTotalSupply() {
    return this.config.initialSupply || 1000000;
  }
}

// Export default instance
export const tokenomics = new Tokenomics({ initialSupply: 1000000 });