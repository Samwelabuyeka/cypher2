import { YieldOptimizer, LiquidityPoolOptimizer, StakingManager } from "../lib/defi/yieldOptimizer";
import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const { minCapital, riskProfile } = params;
  
  logger.info({ minCapital, riskProfile }, "Starting yield farming optimization");

  let walletsOptimized = 0;
  let totalDeployed = 0;
  const positions: Array<{ protocol: string; amount: number; apy: number }> = [];

  // 1. Scan all user wallets for idle capital
  const wallets = await api.wallet.findMany({
    filter: {
      isActive: { equals: true },
      availableBalance: { greaterThan: minCapital },
    },
    select: {
      id: true,
      currency: true,
      availableBalance: true,
      userId: true,
      user: { id: true },
    },
  });

  logger.info(`Found ${wallets.length} wallets with idle capital above ${minCapital}`);

  // Process each wallet
  for (const wallet of wallets) {
    const deployableCapital = wallet.availableBalance;
    
    if (!deployableCapital || deployableCapital < minCapital) {
      continue;
    }

    // 2. Find best yield opportunities
    const lendingOpportunities = await YieldOptimizer.findBestYield(wallet.currency, deployableCapital);
    const lpOpportunities = await LiquidityPoolOptimizer.findBestPool(wallet.currency, deployableCapital);
    const stakingOpportunities = await StakingManager.findBestStaking(wallet.currency, deployableCapital);

    // 3. Combine all opportunities
    const allOpportunities = [...lendingOpportunities, ...lpOpportunities, ...stakingOpportunities];
    
    // Sort by APY descending
    allOpportunities.sort((a, b) => b.apy - a.apy);

    // 4. Allocate based on risk profile
    let lendingPercent = 0.7;
    let stakingPercent = 0.2;
    let lpPercent = 0.1;

    if (riskProfile === 'moderate') {
      lendingPercent = 0.4;
      stakingPercent = 0.3;
      lpPercent = 0.3;
    } else if (riskProfile === 'aggressive') {
      lendingPercent = 0.2;
      stakingPercent = 0.2;
      lpPercent = 0.6;
    }

    const lendingAmount = deployableCapital * lendingPercent;
    const stakingAmount = deployableCapital * stakingPercent;
    const lpAmount = deployableCapital * lpPercent;

    // 5. Find best opportunities for each category
    const bestLending = lendingOpportunities.reduce((best, curr) => 
      curr.apy > best.apy ? curr : best, lendingOpportunities[0]);
    
    const bestStaking = stakingOpportunities.length > 0 
      ? stakingOpportunities.reduce((best, curr) => curr.apy > best.apy ? curr : best, stakingOpportunities[0])
      : null;
    
    const bestLP = lpOpportunities.reduce((best, curr) => 
      curr.apy > best.apy ? curr : best, lpOpportunities[0]);

    // 6. Calculate weighted APY
    let totalAPY = 0;
    let totalGasCost = 0;
    const deployments = [];

    // Deploy to lending
    if (bestLending && lendingAmount > 0) {
      totalAPY += bestLending.apy * lendingPercent;
      totalGasCost += bestLending.gasEstimate;
      deployments.push({
        protocol: bestLending.protocol,
        amount: lendingAmount,
        apy: bestLending.apy,
        type: 'lending' as const,
      });
    }

    // Deploy to staking
    if (bestStaking && stakingAmount > 0) {
      totalAPY += bestStaking.apy * stakingPercent;
      totalGasCost += bestStaking.gasEstimate;
      deployments.push({
        protocol: bestStaking.protocol,
        amount: stakingAmount,
        apy: bestStaking.apy,
        type: 'staking' as const,
      });
    }

    // Deploy to LP
    if (bestLP && lpAmount > 0) {
      totalAPY += bestLP.apy * lpPercent;
      totalGasCost += bestLP.gasEstimate;
      deployments.push({
        protocol: bestLP.protocol,
        amount: lpAmount,
        apy: bestLP.apy,
        type: 'liquidity' as const,
      });
    }

    // 7. Only deploy if net APY after gas > 5%
    const netAPY = totalAPY - (totalGasCost / deployableCapital * 100);
    
    if (netAPY <= 5) {
      logger.info({ walletId: wallet.id, netAPY }, "Skipping deployment - net APY too low");
      continue;
    }

    // 8. Execute deployments
    for (const deployment of deployments) {
      // Create wallet transaction record
      await api.walletTransaction.create({
        wallet: { _link: wallet.id },
        user: { _link: wallet.userId },
        type: "transfer",
        currency: wallet.currency,
        amount: deployment.amount,
        status: "completed",
        description: `Yield farming deployment to ${deployment.protocol} (${deployment.type})`,
        metadata: {
          protocol: deployment.protocol,
          apy: deployment.apy,
          type: deployment.type,
          optimizationRun: new Date().toISOString(),
        },
        completedAt: new Date(),
      });

      positions.push({
        protocol: deployment.protocol,
        amount: deployment.amount,
        apy: deployment.apy,
      });

      totalDeployed += deployment.amount;
    }

    // Update wallet balance
    await api.wallet.update(wallet.id, {
      availableBalance: wallet.availableBalance - deployableCapital,
      lockedBalance: (wallet.lockedBalance || 0) + deployableCapital,
    });

    // Create performance metric
    await api.performanceMetric.create({
      user: { _link: wallet.userId },
      metricType: "portfolio-performance",
      timeframe: "monthly",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      roi: netAPY,
      metrics: {
        deployments,
        totalAPY,
        netAPY,
        gasCosts: totalGasCost,
        riskProfile,
      },
    });

    // Send notification
    await api.notification.create({
      user: { _link: wallet.userId },
      type: "strategy",
      severity: "success",
      title: "Yield Farming Position Opened",
      message: `Deployed ${deployableCapital.toFixed(2)} ${wallet.currency} across ${deployments.length} protocols with ${netAPY.toFixed(2)}% net APY`,
      metadata: {
        deployments,
        totalAPY,
        netAPY,
      },
    });

    walletsOptimized++;
  }

  // 9. Calculate projected annual income
  const avgAPY = positions.length > 0 
    ? positions.reduce((sum, p) => sum + p.apy, 0) / positions.length 
    : 0;
  
  const projectedAnnualIncome = totalDeployed * (avgAPY / 100);

  logger.info({
    walletsOptimized,
    totalDeployed,
    avgAPY,
    projectedAnnualIncome,
    positionsCount: positions.length,
  }, "Yield farming optimization complete");

  return {
    walletsOptimized,
    totalDeployed,
    avgAPY,
    projectedAnnualIncome,
    positions,
  };
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: "0 */6 * * *",
      },
    ],
  },
};

export const params = {
  minCapital: {
    type: "number",
    default: 1000,
  },
  riskProfile: {
    type: "string",
    default: "moderate",
    validations: {
      in: ["conservative", "moderate", "aggressive"],
    },
  },
};