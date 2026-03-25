import { ActionOptions } from "gadget-server";
import { TokenomicsEngine } from "../lib/blockchain/tokenomicsEngine";
import { CirculationEngine } from "../lib/blockchain/circulationEngine";
import { SupplyManager } from "../lib/blockchain/supplyManager";

export const run: ActionRun = async ({ params, logger, api }) => {
  try {
    logger.info("Starting automatic CypherCoin circulation cycle");

    const circulationEngine = new CirculationEngine(api, logger);
    const tokenomicsEngine = new TokenomicsEngine(api, logger);
    const supplyManager = new SupplyManager(api, logger);

    const currentMetrics = await tokenomicsEngine.getCurrentMetrics();
    logger.info({ metrics: currentMetrics }, "Current tokenomics metrics");

    const report: any = {
      timestamp: new Date().toISOString(),
      rewardsDistributed: 0,
      tokensBurned: 0,
      currentSupply: 0,
      inflationRate: 0,
      velocity: 0,
      healthScore: 0,
      actions: []
    };

    logger.info("Distributing pending staking rewards");
    const stakingRewards = await circulationEngine.calculateStakingRewards();
    if (stakingRewards.total > 0) {
      const mintedRewards = await supplyManager.mintForRewards(stakingRewards.total);
      await circulationEngine.distributeRewardsProportionally(stakingRewards.stakers);
      report.rewardsDistributed = stakingRewards.total;
      report.actions.push(`Distributed ${stakingRewards.total} CYP in staking rewards to ${stakingRewards.stakers.length} stakers`);
    }

    logger.info("Processing accumulated fees");
    const accumulatedFees = await circulationEngine.getAccumulatedFees();
    if (accumulatedFees > 0) {
      const burnAmount = accumulatedFees * 0.5;
      const stakingPoolAmount = accumulatedFees * 0.2;
      
      await supplyManager.burnTokens(burnAmount);
      await circulationEngine.addToStakingPool(stakingPoolAmount);
      
      report.tokensBurned = burnAmount;
      report.actions.push(`Burned ${burnAmount} CYP (50% of fees)`);
      report.actions.push(`Added ${stakingPoolAmount} CYP to staking pool (20% of fees)`);
    }

    logger.info("Rebalancing economic parameters");
    const networkCongestion = await tokenomicsEngine.getNetworkCongestion();
    if (networkCongestion > 0.8) {
      await tokenomicsEngine.adjustTransactionFees(1.1);
      report.actions.push("Increased transaction fees by 10% due to high congestion");
    } else if (networkCongestion < 0.2) {
      await tokenomicsEngine.adjustTransactionFees(0.9);
      report.actions.push("Decreased transaction fees by 10% due to low congestion");
    }

    const stakingParticipation = await tokenomicsEngine.getStakingParticipation();
    if (stakingParticipation < 0.3) {
      await tokenomicsEngine.increaseStakingAPY();
      report.actions.push("Increased staking APY to encourage participation");
    } else if (stakingParticipation > 0.7) {
      await tokenomicsEngine.decreaseStakingAPY();
      report.actions.push("Decreased staking APY slightly due to high participation");
    }

    logger.info("Calculating circulation metrics");
    const transactionVolume = await circulationEngine.getTransactionVolume24h();
    const totalSupply = await supplyManager.getTotalSupply();
    const velocity = totalSupply > 0 ? transactionVolume / totalSupply : 0;
    
    const activeAddresses = await circulationEngine.getActiveAddresses24h();
    const dormantTokens = await circulationEngine.getDormantTokens(90);
    const wealthConcentration = await circulationEngine.calculateGiniCoefficient();

    report.velocity = velocity;
    report.activeAddresses = activeAddresses;
    report.dormantTokens = dormantTokens;
    report.wealthConcentration = wealthConcentration;

    logger.info("Auto-compounding staking rewards for opted-in stakers");
    const compoundedCount = await circulationEngine.autoCompoundStakingRewards();
    if (compoundedCount > 0) {
      report.actions.push(`Auto-compounded rewards for ${compoundedCount} stakers`);
    }

    logger.info("Cleaning old data");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedTransactions = await api.cypherTransaction.findMany({
      filter: {
        createdAt: {
          lessThan: thirtyDaysAgo
        }
      },
      first: 250
    });

    if (deletedTransactions.length > 0) {
      const ids = deletedTransactions.map(tx => tx.id);
      await api.cypherTransaction.bulkDelete(ids);
      report.actions.push(`Cleaned ${deletedTransactions.length} old transaction logs`);
    }

    report.currentSupply = totalSupply;
    report.inflationRate = await tokenomicsEngine.getInflationRate();
    report.healthScore = await tokenomicsEngine.calculateHealthScore({
      velocity,
      stakingParticipation,
      networkCongestion,
      wealthConcentration
    });

    logger.info({ report }, "Circulation cycle completed successfully");
    
    return {
      success: true,
      report
    };

  } catch (error) {
    logger.error({ error }, "Error during circulation cycle");
    
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info({ attempt }, "Retrying circulation cycle");
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        
        return await run({ params, logger, api } as any);
      } catch (retryError) {
        logger.error({ retryError, attempt }, "Retry failed");
        if (attempt === maxRetries) {
          throw new Error(`Circulation cycle failed after ${maxRetries} attempts: ${error}`);
        }
      }
    }
    
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        cron: "*/10 * * * *"
      }
    ]
  }
};
