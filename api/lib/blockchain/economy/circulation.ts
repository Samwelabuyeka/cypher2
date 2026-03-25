import { logger } from "gadget-server";

/**
 * Metrics for tracking circulation health
 */
export interface CirculationMetrics {
  velocity: number; // how many times tokens circulate per day
  turnover: bigint; // total value transferred in period
  activeAddresses: number; // unique addresses in 24h
  dormantTokens: bigint; // tokens not moved in 90 days
  concentrationIndex: number; // 0-1, wealth distribution
  healthScore: number; // 0-100, overall economy health
}

/**
 * Distribution breakdown for rewards
 */
export interface RewardDistribution {
  miners: bigint; // mining rewards
  stakers: bigint; // staking rewards
  burned: bigint; // deflationary burn
  treasury: bigint; // development fund
}

/**
 * Transaction record for velocity tracking
 */
interface TransactionRecord {
  hash: string;
  from: string;
  to: string;
  amount: bigint;
  timestamp: number;
}

/**
 * Holder balance record
 */
interface HolderBalance {
  address: string;
  balance: bigint;
  lastActivity: number;
}

/**
 * Automatic circulation engine for CypherCoin self-regulation
 */
export class CirculationEngine {
  public metrics: CirculationMetrics;
  public rewardPool: bigint;
  public feePool: bigint;
  public treasury: bigint;
  public activityLog: Map<string, number>;
  public transactionLog: TransactionRecord[];
  
  private circulationInterval?: NodeJS.Timeout;
  private readonly OPTIMAL_VELOCITY_MIN = 2;
  private readonly OPTIMAL_VELOCITY_MAX = 5;
  private readonly DORMANCY_PERIOD = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
  private readonly ACTIVE_PERIOD = 24 * 60 * 60 * 1000; // 24 hours in ms

  constructor() {
    this.metrics = {
      velocity: 0,
      turnover: 0n,
      activeAddresses: 0,
      dormantTokens: 0n,
      concentrationIndex: 0,
      healthScore: 100,
    };
    this.rewardPool = 0n;
    this.feePool = 0n;
    this.treasury = 0n;
    this.activityLog = new Map();
    this.transactionLog = [];
  }

  // ========== Velocity Tracking Methods ==========

  /**
   * Calculate current velocity: (24h transaction volume) / (circulating supply)
   */
  calculateVelocity(circulatingSupply: bigint): number {
    const now = Date.now();
    const dayAgo = now - this.ACTIVE_PERIOD;
    
    const recentTxs = this.transactionLog.filter(tx => tx.timestamp >= dayAgo);
    const volume = recentTxs.reduce((sum, tx) => sum + tx.amount, 0n);
    
    if (circulatingSupply === 0n) return 0;
    
    // Convert to number for division, maintain precision
    const velocity = Number(volume * 1000n / circulatingSupply) / 1000;
    this.metrics.velocity = velocity;
    
    return velocity;
  }

  /**
   * Record transaction for velocity calculation
   */
  trackTransaction(tx: TransactionRecord): void {
    this.transactionLog.push(tx);
    this.metrics.turnover += tx.amount;
    
    // Track activity for both sender and receiver
    this.trackAddressActivity(tx.from);
    this.trackAddressActivity(tx.to);
    
    // Clean up old transactions (keep only last 7 days)
    const weekAgo = Date.now() - (7 * this.ACTIVE_PERIOD);
    this.transactionLog = this.transactionLog.filter(t => t.timestamp >= weekAgo);
    
    logger.debug({ txHash: tx.hash, amount: tx.amount.toString() }, "Transaction tracked");
  }

  /**
   * Get average velocity over specified days
   */
  getAverageVelocity(days: number): number {
    const now = Date.now();
    const periodStart = now - (days * this.ACTIVE_PERIOD);
    
    const periodTxs = this.transactionLog.filter(tx => tx.timestamp >= periodStart);
    
    if (periodTxs.length === 0) return 0;
    
    // Calculate daily averages
    const dailyVolumes: bigint[] = [];
    for (let i = 0; i < days; i++) {
      const dayStart = now - ((i + 1) * this.ACTIVE_PERIOD);
      const dayEnd = now - (i * this.ACTIVE_PERIOD);
      const dayTxs = periodTxs.filter(tx => tx.timestamp >= dayStart && tx.timestamp < dayEnd);
      const dayVolume = dayTxs.reduce((sum, tx) => sum + tx.amount, 0n);
      dailyVolumes.push(dayVolume);
    }
    
    const avgVolume = dailyVolumes.reduce((sum, v) => sum + v, 0n) / BigInt(days);
    return Number(avgVolume) / 1e18; // Assuming 18 decimals
  }

  /**
   * Check if velocity is in optimal range (2-5)
   */
  isHealthyVelocity(): boolean {
    return this.metrics.velocity >= this.OPTIMAL_VELOCITY_MIN && 
           this.metrics.velocity <= this.OPTIMAL_VELOCITY_MAX;
  }

  /**
   * Get velocity trend
   */
  getVelocityTrend(): "increasing" | "decreasing" | "stable" {
    const recent = this.getAverageVelocity(7);
    const older = this.getAverageVelocity(14);
    
    const diff = recent - older;
    const threshold = 0.1;
    
    if (diff > threshold) return "increasing";
    if (diff < -threshold) return "decreasing";
    return "stable";
  }

  // ========== Distribution Tracking Methods ==========

  /**
   * Update last activity timestamp for an address
   */
  trackAddressActivity(address: string): void {
    this.activityLog.set(address, Date.now());
  }

  /**
   * Count unique active addresses in given period
   */
  getActiveAddresses(periodMs: number = this.ACTIVE_PERIOD): number {
    const now = Date.now();
    const cutoff = now - periodMs;
    
    let count = 0;
    for (const [_, lastActivity] of this.activityLog.entries()) {
      if (lastActivity >= cutoff) {
        count++;
      }
    }
    
    this.metrics.activeAddresses = count;
    return count;
  }

  /**
   * Sum tokens not moved in 90 days
   */
  getDormantTokens(balances: Map<string, bigint>): bigint {
    const now = Date.now();
    const dormancyCutoff = now - this.DORMANCY_PERIOD;
    
    let dormant = 0n;
    for (const [address, balance] of balances.entries()) {
      const lastActivity = this.activityLog.get(address) || 0;
      if (lastActivity < dormancyCutoff) {
        dormant += balance;
      }
    }
    
    this.metrics.dormantTokens = dormant;
    return dormant;
  }

  /**
   * Calculate Gini coefficient (wealth inequality: 0=equal, 1=concentrated)
   */
  calculateGiniCoefficient(balances: Map<string, bigint>): number {
    const holders = Array.from(balances.values()).sort((a, b) => 
      a < b ? -1 : a > b ? 1 : 0
    );
    
    if (holders.length === 0) return 0;
    
    const n = holders.length;
    let sum = 0n;
    let weightedSum = 0n;
    
    for (let i = 0; i < n; i++) {
      sum += holders[i];
      weightedSum += holders[i] * BigInt(i + 1);
    }
    
    if (sum === 0n) return 0;
    
    const gini = Number((2n * weightedSum) / (BigInt(n) * sum) - BigInt(n + 1) / BigInt(n)) / 1e18;
    this.metrics.concentrationIndex = Math.max(0, Math.min(1, gini));
    
    return this.metrics.concentrationIndex;
  }

  /**
   * Get top holders
   */
  getTopHolders(balances: Map<string, bigint>, count: number): HolderBalance[] {
    const holders: HolderBalance[] = [];
    
    for (const [address, balance] of balances.entries()) {
      holders.push({
        address,
        balance,
        lastActivity: this.activityLog.get(address) || 0,
      });
    }
    
    return holders
      .sort((a, b) => (b.balance < a.balance ? -1 : b.balance > a.balance ? 1 : 0))
      .slice(0, count);
  }

  // ========== Automatic Distribution Methods ==========

  /**
   * Pay mining reward to block miner
   */
  distributeBlockRewards(minerAddress: string, blockReward: bigint): bigint {
    logger.info({ miner: minerAddress, reward: blockReward.toString() }, "Distributing block reward");
    this.trackAddressActivity(minerAddress);
    return blockReward;
  }

  /**
   * Pay all stakers proportionally
   */
  distributeStakingRewards(stakers: Map<string, bigint>, totalReward: bigint): Map<string, bigint> {
    const rewards = new Map<string, bigint>();
    
    const totalStaked = Array.from(stakers.values()).reduce((sum, stake) => sum + stake, 0n);
    
    if (totalStaked === 0n) {
      logger.warn("No stakers to distribute rewards to");
      return rewards;
    }
    
    for (const [address, stake] of stakers.entries()) {
      const reward = (totalReward * stake) / totalStaked;
      rewards.set(address, reward);
      this.trackAddressActivity(address);
    }
    
    logger.info({ totalReward: totalReward.toString(), stakerCount: stakers.size }, "Distributed staking rewards");
    return rewards;
  }

  /**
   * Split fees: 50% burn, 30% miner, 20% stakers
   */
  distributeFees(fees: bigint, minerAddress: string): RewardDistribution {
    const burned = (fees * 50n) / 100n;
    const minerReward = (fees * 30n) / 100n;
    const stakerReward = (fees * 20n) / 100n;
    
    this.feePool += stakerReward;
    
    logger.info({
      total: fees.toString(),
      burned: burned.toString(),
      miner: minerReward.toString(),
      stakers: stakerReward.toString(),
    }, "Distributed transaction fees");
    
    return {
      miners: minerReward,
      stakers: stakerReward,
      burned,
      treasury: 0n,
    };
  }

  /**
   * Fund development wallet
   */
  fillTreasury(amount: bigint): void {
    this.treasury += amount;
    logger.info({ amount: amount.toString(), newBalance: this.treasury.toString() }, "Treasury funded");
  }

  // ========== Economic Incentive Methods ==========

  /**
   * Reward active participants
   */
  incentivizeActivity(balances: Map<string, bigint>, rewardPool: bigint): Map<string, bigint> {
    const rewards = new Map<string, bigint>();
    const now = Date.now();
    const activeThreshold = now - this.ACTIVE_PERIOD;
    
    const activeAddresses: string[] = [];
    for (const [address, _] of balances.entries()) {
      const lastActivity = this.activityLog.get(address) || 0;
      if (lastActivity >= activeThreshold) {
        activeAddresses.push(address);
      }
    }
    
    if (activeAddresses.length === 0) return rewards;
    
    const rewardPerAddress = rewardPool / BigInt(activeAddresses.length);
    
    for (const address of activeAddresses) {
      rewards.set(address, rewardPerAddress);
    }
    
    logger.info({ count: activeAddresses.length, rewardPerAddress: rewardPerAddress.toString() }, 
                "Distributed activity incentives");
    return rewards;
  }

  /**
   * Optional tax on inactive wallets
   */
  penalizeDormancy(balances: Map<string, bigint>, taxRate: number = 0.01): Map<string, bigint> {
    const penalties = new Map<string, bigint>();
    const now = Date.now();
    const dormancyCutoff = now - this.DORMANCY_PERIOD;
    
    for (const [address, balance] of balances.entries()) {
      const lastActivity = this.activityLog.get(address) || 0;
      if (lastActivity < dormancyCutoff && balance > 0n) {
        const penalty = BigInt(Math.floor(Number(balance) * taxRate));
        penalties.set(address, penalty);
      }
    }
    
    logger.info({ count: penalties.size }, "Applied dormancy penalties");
    return penalties;
  }

  /**
   * Bonus for long-term holders
   */
  rewardLoyalty(address: string, holdingPeriodDays: number, baseReward: bigint): bigint {
    const multiplier = Math.min(2.0, 1.0 + (holdingPeriodDays / 365));
    const reward = BigInt(Math.floor(Number(baseReward) * multiplier));
    
    this.trackAddressActivity(address);
    logger.info({ address, holdingPeriodDays, reward: reward.toString() }, "Distributed loyalty reward");
    
    return reward;
  }

  /**
   * Incentivize providing liquidity
   */
  boostLiquidity(liquidityProviders: Map<string, bigint>, boostPool: bigint): Map<string, bigint> {
    const rewards = new Map<string, bigint>();
    
    const totalLiquidity = Array.from(liquidityProviders.values()).reduce((sum, liq) => sum + liq, 0n);
    
    if (totalLiquidity === 0n) return rewards;
    
    for (const [address, liquidity] of liquidityProviders.entries()) {
      const reward = (boostPool * liquidity) / totalLiquidity;
      rewards.set(address, reward);
      this.trackAddressActivity(address);
    }
    
    logger.info({ providerCount: liquidityProviders.size, totalBoost: boostPool.toString() }, 
                "Distributed liquidity boosts");
    return rewards;
  }

  // ========== Health Monitoring Methods ==========

  /**
   * Check all metrics are in healthy ranges
   */
  isEconomyHealthy(): boolean {
    const velocityHealthy = this.isHealthyVelocity();
    const concentrationHealthy = this.metrics.concentrationIndex < 0.7;
    const activityHealthy = this.metrics.activeAddresses > 100;
    const dormancyHealthy = this.metrics.dormantTokens < (this.metrics.turnover / 2n);
    
    return velocityHealthy && concentrationHealthy && activityHealthy && dormancyHealthy;
  }

  /**
   * Calculate 0-100 health score based on metrics
   */
  getHealthScore(): number {
    let score = 100;
    
    // Velocity score (20 points)
    if (!this.isHealthyVelocity()) {
      const velocityDiff = Math.min(
        Math.abs(this.metrics.velocity - this.OPTIMAL_VELOCITY_MIN),
        Math.abs(this.metrics.velocity - this.OPTIMAL_VELOCITY_MAX)
      );
      score -= Math.min(20, velocityDiff * 5);
    }
    
    // Concentration score (30 points)
    if (this.metrics.concentrationIndex > 0.5) {
      score -= (this.metrics.concentrationIndex - 0.5) * 60;
    }
    
    // Activity score (25 points)
    if (this.metrics.activeAddresses < 1000) {
      score -= (1000 - this.metrics.activeAddresses) / 40;
    }
    
    // Dormancy score (25 points)
    const dormancyRatio = this.metrics.turnover > 0n 
      ? Number(this.metrics.dormantTokens * 100n / this.metrics.turnover) / 100
      : 0;
    if (dormancyRatio > 0.5) {
      score -= (dormancyRatio - 0.5) * 50;
    }
    
    this.metrics.healthScore = Math.max(0, Math.min(100, score));
    return this.metrics.healthScore;
  }

  /**
   * Get current economic issues
   */
  getWarnings(): string[] {
    const warnings: string[] = [];
    
    if (!this.isHealthyVelocity()) {
      warnings.push(`Velocity ${this.metrics.velocity.toFixed(2)} outside optimal range (${this.OPTIMAL_VELOCITY_MIN}-${this.OPTIMAL_VELOCITY_MAX})`);
    }
    
    if (this.metrics.concentrationIndex > 0.7) {
      warnings.push(`High wealth concentration: ${(this.metrics.concentrationIndex * 100).toFixed(1)}%`);
    }
    
    if (this.metrics.activeAddresses < 100) {
      warnings.push(`Low activity: only ${this.metrics.activeAddresses} active addresses`);
    }
    
    const dormancyRatio = this.metrics.turnover > 0n 
      ? Number(this.metrics.dormantTokens * 100n / this.metrics.turnover) / 100
      : 0;
    if (dormancyRatio > 0.5) {
      warnings.push(`High dormancy: ${(dormancyRatio * 100).toFixed(1)}% of tokens inactive`);
    }
    
    return warnings;
  }

  /**
   * Recommended parameter changes
   */
  suggestAdjustments(): string[] {
    const suggestions: string[] = [];
    
    if (this.metrics.velocity < this.OPTIMAL_VELOCITY_MIN) {
      suggestions.push("Reduce transaction fees to encourage more circulation");
      suggestions.push("Increase staking rewards to incentivize participation");
    } else if (this.metrics.velocity > this.OPTIMAL_VELOCITY_MAX) {
      suggestions.push("Increase transaction fees to moderate speculation");
      suggestions.push("Implement cooldown periods for large transfers");
    }
    
    if (this.metrics.concentrationIndex > 0.7) {
      suggestions.push("Implement progressive fees on large holders");
      suggestions.push("Increase distribution to active small holders");
    }
    
    if (this.metrics.activeAddresses < 100) {
      suggestions.push("Launch activity campaigns and airdrops");
      suggestions.push("Reduce minimum transaction amounts");
    }
    
    const dormancyRatio = this.metrics.turnover > 0n 
      ? Number(this.metrics.dormantTokens * 100n / this.metrics.turnover) / 100
      : 0;
    if (dormancyRatio > 0.5) {
      suggestions.push("Implement dormancy penalties after 90 days");
      suggestions.push("Send reactivation incentives to dormant addresses");
    }
    
    return suggestions;
  }

  // ========== Automated Rebalancing Methods ==========

  /**
   * Increase fees if network congested
   */
  autoAdjustFees(congestion: number, baseFee: bigint): bigint {
    let multiplier = 1.0;
    
    if (congestion > 80) {
      multiplier = 2.0;
    } else if (congestion > 60) {
      multiplier = 1.5;
    } else if (congestion > 40) {
      multiplier = 1.2;
    }
    
    const adjustedFee = BigInt(Math.floor(Number(baseFee) * multiplier));
    
    if (multiplier > 1.0) {
      logger.info({ congestion, multiplier, newFee: adjustedFee.toString() }, "Auto-adjusted fees due to congestion");
    }
    
    return adjustedFee;
  }

  /**
   * Optimize staking incentives based on participation
   */
  autoAdjustRewards(participationRate: number, baseReward: bigint): bigint {
    let multiplier = 1.0;
    
    if (participationRate < 20) {
      multiplier = 1.5; // Increase rewards to attract stakers
    } else if (participationRate < 40) {
      multiplier = 1.2;
    } else if (participationRate > 80) {
      multiplier = 0.8; // Reduce rewards if over-subscribed
    }
    
    const adjustedReward = BigInt(Math.floor(Number(baseReward) * multiplier));
    
    if (multiplier !== 1.0) {
      logger.info({ participationRate, multiplier, newReward: adjustedReward.toString() }, 
                  "Auto-adjusted staking rewards");
    }
    
    return adjustedReward;
  }

  /**
   * Control supply growth through burning
   */
  autoAdjustBurn(inflationRate: number, currentBurnRate: number): number {
    let targetBurnRate = currentBurnRate;
    
    if (inflationRate > 5) {
      targetBurnRate = Math.min(0.8, currentBurnRate + 0.1); // Increase burn
    } else if (inflationRate < 2) {
      targetBurnRate = Math.max(0.2, currentBurnRate - 0.1); // Decrease burn
    }
    
    if (targetBurnRate !== currentBurnRate) {
      logger.info({ inflationRate, oldBurn: currentBurnRate, newBurn: targetBurnRate }, 
                  "Auto-adjusted burn rate");
    }
    
    return targetBurnRate;
  }

  /**
   * Run all auto-adjustments
   */
  rebalanceEconomy(params: {
    congestion: number;
    baseFee: bigint;
    participationRate: number;
    baseReward: bigint;
    inflationRate: number;
    burnRate: number;
  }): {
    adjustedFee: bigint;
    adjustedReward: bigint;
    adjustedBurnRate: number;
  } {
    logger.info("Running economy rebalancing");
    
    const adjustedFee = this.autoAdjustFees(params.congestion, params.baseFee);
    const adjustedReward = this.autoAdjustRewards(params.participationRate, params.baseReward);
    const adjustedBurnRate = this.autoAdjustBurn(params.inflationRate, params.burnRate);
    
    return {
      adjustedFee,
      adjustedReward,
      adjustedBurnRate,
    };
  }

  // ========== Circulation Automation ==========

  /**
   * Execute full circulation cycle
   */
  runCirculationCycle(params: {
    circulatingSupply: bigint;
    balances: Map<string, bigint>;
    stakers: Map<string, bigint>;
    minerAddress: string;
    blockReward: bigint;
  }): void {
    logger.info("Starting circulation cycle");
    
    // Update velocity
    this.calculateVelocity(params.circulatingSupply);
    
    // Update distribution metrics
    this.getActiveAddresses();
    this.getDormantTokens(params.balances);
    this.calculateGiniCoefficient(params.balances);
    
    // Calculate health score
    this.getHealthScore();
    
    // Distribute rewards
    this.distributeBlockRewards(params.minerAddress, params.blockReward);
    
    if (this.feePool > 0n) {
      this.distributeStakingRewards(params.stakers, this.feePool);
      this.feePool = 0n;
    }
    
    // Log warnings if any
    const warnings = this.getWarnings();
    if (warnings.length > 0) {
      logger.warn({ warnings }, "Economy health warnings");
    }
    
    logger.info({
      velocity: this.metrics.velocity,
      healthScore: this.metrics.healthScore,
      activeAddresses: this.metrics.activeAddresses,
    }, "Circulation cycle completed");
  }

  /**
   * Set up automatic circulation every 10 minutes
   */
  scheduleCirculation(
    getCirculationParams: () => {
      circulatingSupply: bigint;
      balances: Map<string, bigint>;
      stakers: Map<string, bigint>;
      minerAddress: string;
      blockReward: bigint;
    }
  ): void {
    if (this.circulationInterval) {
      clearInterval(this.circulationInterval);
    }
    
    this.circulationInterval = setInterval(() => {
      try {
        const params = getCirculationParams();
        this.runCirculationCycle(params);
      } catch (error) {
        logger.error({ error }, "Error in circulation cycle");
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    logger.info("Scheduled automatic circulation every 10 minutes");
  }

  /**
   * Get current state of circulation
   */
  getCirculationStatus(): {
    metrics: CirculationMetrics;
    pools: {
      reward: string;
      fee: string;
      treasury: string;
    };
    health: {
      isHealthy: boolean;
      score: number;
      warnings: string[];
      suggestions: string[];
    };
    activity: {
      recentTransactions: number;
      trackedAddresses: number;
    };
  } {
    return {
      metrics: { ...this.metrics },
      pools: {
        reward: this.rewardPool.toString(),
        fee: this.feePool.toString(),
        treasury: this.treasury.toString(),
      },
      health: {
        isHealthy: this.isEconomyHealthy(),
        score: this.getHealthScore(),
        warnings: this.getWarnings(),
        suggestions: this.suggestAdjustments(),
      },
      activity: {
        recentTransactions: this.transactionLog.length,
        trackedAddresses: this.activityLog.size,
      },
    };
  }

  /**
   * Stop scheduled circulation
   */
  stopCirculation(): void {
    if (this.circulationInterval) {
      clearInterval(this.circulationInterval);
      this.circulationInterval = undefined;
      logger.info("Stopped automatic circulation");
    }
  }
}

// Export singleton instance
export const circulationEngine = new CirculationEngine();