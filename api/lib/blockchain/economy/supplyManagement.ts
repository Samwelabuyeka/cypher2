import { logger } from "gadget-server";

/**
 * Defines a halving era in the emission schedule
 */
interface SupplySchedule {
  era: number;
  startBlock: number;
  endBlock: number;
  blockReward: bigint;
  totalEmission: bigint;
}

/**
 * Tracks individual emission events
 */
interface EmissionEvent {
  block: number;
  type: 'mining' | 'staking' | 'genesis';
  amount: bigint;
  recipient: string;
  timestamp: number;
}

/**
 * Tracks burn events
 */
interface BurnEvent {
  amount: bigint;
  reason: string;
  timestamp: number;
  transactionHash?: string;
}

/**
 * Manages CypherCoin supply with Bitcoin-style emission schedule
 */
class SupplyManager {
  private readonly maxSupply: bigint;
  private currentSupply: bigint;
  private emissionSchedule: SupplySchedule[];
  private emissionHistory: EmissionEvent[];
  private burnHistory: BurnEvent[];
  private lockedSupply: bigint;

  // Constants
  private readonly BLOCKS_PER_ERA = 210000;
  private readonly INITIAL_REWARD = 50n;
  private readonly MIN_REWARD = 1n; // Minimum reward (0.00000001 CYP)
  private readonly DECIMALS = 8;
  private readonly SATOSHI = 10n ** 8n; // 100,000,000 satoshis = 1 CYP

  constructor() {
    this.maxSupply = 21_000_000n * this.SATOSHI;
    this.currentSupply = 0n;
    this.emissionSchedule = [];
    this.emissionHistory = [];
    this.burnHistory = [];
    this.lockedSupply = 0n;
    this.generateEmissionSchedule();
  }

  // ========== Supply Calculation Methods ==========

  /**
   * Get current total minted coins
   */
  getTotalSupply(): bigint {
    return this.currentSupply;
  }

  /**
   * Get circulating supply (total - locked - burned)
   */
  getCirculatingSupply(): bigint {
    const burned = this.getBurnedSupply();
    return this.currentSupply - this.lockedSupply - burned;
  }

  /**
   * Get remaining supply to be minted
   */
  getRemainingSupply(): bigint {
    return this.maxSupply - this.currentSupply;
  }

  /**
   * Get tokens in staking + vesting
   */
  getLockedSupply(): bigint {
    return this.lockedSupply;
  }

  /**
   * Get permanently destroyed tokens
   */
  getBurnedSupply(): bigint {
    return this.burnHistory.reduce((total, event) => total + event.amount, 0n);
  }

  /**
   * Update locked supply (for staking/vesting)
   */
  setLockedSupply(amount: bigint): void {
    this.lockedSupply = amount;
    logger.info({ lockedSupply: amount.toString() }, "Updated locked supply");
  }

  // ========== Emission Schedule Generation ==========

  /**
   * Generate full Bitcoin-style halving schedule
   */
  private generateEmissionSchedule(): void {
    this.emissionSchedule = [];
    let era = 0;
    let currentBlock = 0;
    let blockReward = this.INITIAL_REWARD * this.SATOSHI;
    let totalEmitted = 0n;

    // Continue until reward is less than minimum
    while (blockReward >= this.MIN_REWARD) {
      const startBlock = currentBlock;
      const endBlock = currentBlock + this.BLOCKS_PER_ERA - 1;
      const eraEmission = blockReward * BigInt(this.BLOCKS_PER_ERA);

      this.emissionSchedule.push({
        era,
        startBlock,
        endBlock,
        blockReward,
        totalEmission: eraEmission,
      });

      totalEmitted += eraEmission;
      currentBlock = endBlock + 1;
      blockReward = blockReward / 2n; // Halving
      era++;
    }

    logger.info(
      {
        totalEras: this.emissionSchedule.length,
        finalSupply: totalEmitted.toString(),
        maxSupply: this.maxSupply.toString(),
      },
      "Generated emission schedule"
    );
  }

  /**
   * Get the emission schedule
   */
  getEmissionSchedule(): SupplySchedule[] {
    return [...this.emissionSchedule];
  }

  // ========== Halving Mechanics Methods ==========

  /**
   * Determine which halving era for a given block height
   */
  getCurrentEra(blockHeight: number): number {
    const era = this.emissionSchedule.find(
      (schedule) => blockHeight >= schedule.startBlock && blockHeight <= schedule.endBlock
    );
    return era?.era ?? this.emissionSchedule.length - 1;
  }

  /**
   * Calculate reward for a specific block
   */
  getBlockReward(blockHeight: number): bigint {
    const schedule = this.emissionSchedule.find(
      (s) => blockHeight >= s.startBlock && blockHeight <= s.endBlock
    );
    return schedule?.blockReward ?? 0n;
  }

  /**
   * Get the block number when next halving occurs
   */
  getNextHalvingBlock(currentBlock: number): number {
    const currentEra = this.getCurrentEra(currentBlock);
    const nextEra = this.emissionSchedule[currentEra + 1];
    return nextEra?.startBlock ?? -1;
  }

  /**
   * Get countdown to next halving
   */
  getBlocksUntilHalving(currentBlock: number): number {
    const nextHalving = this.getNextHalvingBlock(currentBlock);
    if (nextHalving === -1) return 0;
    return Math.max(0, nextHalving - currentBlock);
  }

  /**
   * Estimate calendar date of next halving
   */
  estimateHalvingDate(currentBlock: number, avgBlockTime: number): Date {
    const blocksUntilHalving = this.getBlocksUntilHalving(currentBlock);
    const secondsUntilHalving = blocksUntilHalving * avgBlockTime;
    return new Date(Date.now() + secondsUntilHalving * 1000);
  }

  // ========== Emission Tracking Methods ==========

  /**
   * Record a new emission event
   */
  recordEmission(event: EmissionEvent): void {
    this.emissionHistory.push(event);
    this.currentSupply += event.amount;
    
    logger.info(
      {
        block: event.block,
        type: event.type,
        amount: event.amount.toString(),
        currentSupply: this.currentSupply.toString(),
      },
      "Recorded emission event"
    );
  }

  /**
   * Get coins created per day
   */
  getEmissionRate(avgBlockTime: number = 600): bigint {
    const currentBlock = this.emissionHistory.length > 0 
      ? this.emissionHistory[this.emissionHistory.length - 1].block 
      : 0;
    const currentReward = this.getBlockReward(currentBlock);
    const blocksPerDay = Math.floor(86400 / avgBlockTime);
    return currentReward * BigInt(blocksPerDay);
  }

  /**
   * Get annual inflation percentage
   */
  getInflationRate(): number {
    if (this.currentSupply === 0n) return 0;
    const dailyEmission = this.getEmissionRate();
    const annualEmission = dailyEmission * 365n;
    return Number((annualEmission * 10000n) / this.currentSupply) / 100;
  }

  /**
   * Get emission history for a specific period
   */
  getEmissionHistory(startTimestamp?: number, endTimestamp?: number): EmissionEvent[] {
    if (!startTimestamp && !endTimestamp) {
      return [...this.emissionHistory];
    }

    return this.emissionHistory.filter((event) => {
      if (startTimestamp && event.timestamp < startTimestamp) return false;
      if (endTimestamp && event.timestamp > endTimestamp) return false;
      return true;
    });
  }

  // ========== Burn Tracking Methods ==========

  /**
   * Record coins destroyed
   */
  recordBurn(amount: bigint, reason: string, transactionHash?: string): void {
    const burnEvent: BurnEvent = {
      amount,
      reason,
      timestamp: Date.now(),
      transactionHash,
    };
    
    this.burnHistory.push(burnEvent);
    
    logger.info(
      {
        amount: amount.toString(),
        reason,
        totalBurned: this.getBurnedSupply().toString(),
      },
      "Recorded burn event"
    );
  }

  /**
   * Get all-time burned amount
   */
  getTotalBurned(): bigint {
    return this.getBurnedSupply();
  }

  /**
   * Get coins burned per day (average over last 30 days)
   */
  getBurnRate(): bigint {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentBurns = this.burnHistory.filter((burn) => burn.timestamp >= thirtyDaysAgo);
    const totalBurned = recentBurns.reduce((sum, burn) => sum + burn.amount, 0n);
    return totalBurned / 30n;
  }

  /**
   * Get net emission (emission - burn)
   */
  getNetEmission(avgBlockTime: number = 600): bigint {
    const dailyEmission = this.getEmissionRate(avgBlockTime);
    const dailyBurn = this.getBurnRate();
    return dailyEmission - dailyBurn;
  }

  /**
   * Get burn history
   */
  getBurnHistory(): BurnEvent[] {
    return [...this.burnHistory];
  }

  // ========== Supply Forecasting Methods ==========

  /**
   * Predict future supply after N blocks
   */
  forecastSupply(blocks: number, currentBlock: number = 0): bigint {
    let forecast = this.currentSupply;
    let block = currentBlock;
    
    for (let i = 0; i < blocks; i++) {
      forecast += this.getBlockReward(block);
      block++;
    }
    
    return forecast;
  }

  /**
   * Estimate when 21M cap will be reached
   */
  estimateMaxSupplyDate(avgBlockTime: number = 600): Date {
    const totalBlocks = this.emissionSchedule.reduce(
      (sum, schedule) => sum + (schedule.endBlock - schedule.startBlock + 1),
      0
    );
    const totalSeconds = totalBlocks * avgBlockTime;
    return new Date(Date.now() + totalSeconds * 1000);
  }

  /**
   * Project inflation rates for future years
   */
  projectInflation(years: number, avgBlockTime: number = 600): Array<{ year: number; rate: number }> {
    const projections: Array<{ year: number; rate: number }> = [];
    const blocksPerYear = Math.floor((365 * 24 * 60 * 60) / avgBlockTime);
    let currentBlock = this.emissionHistory.length > 0 
      ? this.emissionHistory[this.emissionHistory.length - 1].block 
      : 0;
    let supply = this.currentSupply;

    for (let year = 1; year <= years; year++) {
      let yearlyEmission = 0n;
      
      for (let i = 0; i < blocksPerYear; i++) {
        yearlyEmission += this.getBlockReward(currentBlock + i);
      }
      
      const inflationRate = supply > 0n 
        ? Number((yearlyEmission * 10000n) / supply) / 100 
        : 0;
      
      projections.push({ year, rate: inflationRate });
      
      supply += yearlyEmission;
      currentBlock += blocksPerYear;
    }

    return projections;
  }

  /**
   * Get projected supply in a specific year
   */
  getSupplyInYear(year: number, avgBlockTime: number = 600): bigint {
    const blocksPerYear = Math.floor((365 * 24 * 60 * 60) / avgBlockTime);
    const totalBlocks = year * blocksPerYear;
    return this.forecastSupply(totalBlocks);
  }

  // ========== Supply Health Checks ==========

  /**
   * Verify supply is following schedule
   */
  isSupplyHealthy(): boolean {
    if (this.currentSupply > this.maxSupply) {
      logger.error("Supply exceeds maximum!");
      return false;
    }

    const deviation = this.getSupplyDeviation();
    const deviationPercent = Number((deviation * 10000n) / this.maxSupply) / 100;
    
    // Allow up to 0.01% deviation
    if (Math.abs(deviationPercent) > 0.01) {
      logger.warn({ deviation: deviationPercent }, "Supply deviation detected");
      return false;
    }

    return true;
  }

  /**
   * Get difference from expected supply
   */
  getSupplyDeviation(): bigint {
    if (this.emissionHistory.length === 0) return 0n;

    const lastEvent = this.emissionHistory[this.emissionHistory.length - 1];
    const expectedSupply = this.calculateExpectedSupply(lastEvent.block);
    
    return this.currentSupply - expectedSupply;
  }

  /**
   * Calculate expected supply at a given block
   */
  private calculateExpectedSupply(blockHeight: number): bigint {
    let expected = 0n;
    
    for (const schedule of this.emissionSchedule) {
      if (blockHeight < schedule.startBlock) break;
      
      if (blockHeight >= schedule.endBlock) {
        expected += schedule.totalEmission;
      } else {
        const blocksInEra = blockHeight - schedule.startBlock + 1;
        expected += schedule.blockReward * BigInt(blocksInEra);
        break;
      }
    }
    
    return expected;
  }

  /**
   * Alert on unexpected supply changes
   */
  alertSupplyAnomaly(): void {
    const isHealthy = this.isSupplyHealthy();
    
    if (!isHealthy) {
      const deviation = this.getSupplyDeviation();
      logger.error(
        {
          currentSupply: this.currentSupply.toString(),
          deviation: deviation.toString(),
          maxSupply: this.maxSupply.toString(),
        },
        "SUPPLY ANOMALY DETECTED"
      );
    }
  }

  // ========== Utility Methods ==========

  /**
   * Get supply statistics
   */
  getSupplyStats(avgBlockTime: number = 600) {
    return {
      maxSupply: this.maxSupply.toString(),
      currentSupply: this.currentSupply.toString(),
      circulatingSupply: this.getCirculatingSupply().toString(),
      lockedSupply: this.lockedSupply.toString(),
      burnedSupply: this.getBurnedSupply().toString(),
      remainingSupply: this.getRemainingSupply().toString(),
      inflationRate: this.getInflationRate(),
      emissionRate: this.getEmissionRate(avgBlockTime).toString(),
      burnRate: this.getBurnRate().toString(),
      netEmission: this.getNetEmission(avgBlockTime).toString(),
    };
  }

  /**
   * Convert satoshis to CYP
   */
  toCYP(satoshis: bigint): number {
    return Number(satoshis) / Number(this.SATOSHI);
  }

  /**
   * Convert CYP to satoshis
   */
  toSatoshis(cyp: number): bigint {
    return BigInt(Math.floor(cyp * Number(this.SATOSHI)));
  }
}

// Export singleton instance
export const supplyManager = new SupplyManager();