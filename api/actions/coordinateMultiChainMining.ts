import { ActionOptions } from "gadget-server";

interface BlockchainConfig {
  name: string;
  algorithm: string;
  networkHashrate: number; // in H/s
  blockReward: number;
  blockTime: number; // in seconds
  priceUSD: number;
  poolFee: number; // percentage
  difficulty: number;
}

interface RigCompatibility {
  gpu: string[];
  asic: string[];
  cpu: string[];
  fpga: string[];
}

const BLOCKCHAIN_CONFIGS: Record<string, BlockchainConfig> = {
  CYP: {
    name: "CypherCoin",
    algorithm: "Quantum-Lattice-PoS",
    networkHashrate: 1e12, // 1 TH/s
    blockReward: 50,
    blockTime: 60, // 1 minute
    priceUSD: 10.5,
    poolFee: 0,
    difficulty: 1e9,
  },
  BTC: {
    name: "Bitcoin",
    algorithm: "SHA-256",
    networkHashrate: 6e20, // 600 EH/s
    blockReward: 6.25,
    blockTime: 600, // 10 minutes
    priceUSD: 43500,
    poolFee: 1.5,
    difficulty: 7e13,
  },
  ETC: {
    name: "Ethereum Classic",
    algorithm: "Ethash",
    networkHashrate: 1.8e14, // 180 TH/s
    blockReward: 2.56,
    blockTime: 13,
    priceUSD: 28,
    poolFee: 1,
    difficulty: 2e12,
  },
  LTC: {
    name: "Litecoin",
    algorithm: "Scrypt",
    networkHashrate: 8e14, // 800 TH/s
    blockReward: 12.5,
    blockTime: 150, // 2.5 minutes
    priceUSD: 72,
    poolFee: 1.5,
    difficulty: 2e7,
  },
  XMR: {
    name: "Monero",
    algorithm: "RandomX",
    networkHashrate: 2.8e9, // 2.8 GH/s
    blockReward: 0.6,
    blockTime: 120, // 2 minutes
    priceUSD: 168,
    poolFee: 1,
    difficulty: 3e11,
  },
  DOGE: {
    name: "Dogecoin",
    algorithm: "Scrypt",
    networkHashrate: 9e14, // 900 TH/s
    blockReward: 10000,
    blockTime: 60, // 1 minute
    priceUSD: 0.082,
    poolFee: 1.5,
    difficulty: 1e7,
  },
  RVN: {
    name: "Ravencoin",
    algorithm: "KawPow",
    networkHashrate: 8e12, // 8 TH/s
    blockReward: 2500,
    blockTime: 60, // 1 minute
    priceUSD: 0.024,
    poolFee: 1,
    difficulty: 8e4,
  },
};

const RIG_COMPATIBILITY: RigCompatibility = {
  gpu: ["Ethash", "KawPow", "Quantum-Lattice-PoS"],
  asic: ["SHA-256", "Scrypt"],
  cpu: ["RandomX", "Quantum-Lattice-PoS"],
  fpga: ["SHA-256", "Ethash", "KawPow"],
};

const ELECTRICITY_RATE_PER_KWH = 0.12; // $0.12 per kWh

function convertHashrate(hashrate: number, unit: string): number {
  const multipliers: Record<string, number> = {
    "H/s": 1,
    "KH/s": 1e3,
    "MH/s": 1e6,
    "GH/s": 1e9,
    "TH/s": 1e12,
    "PH/s": 1e15,
    "EH/s": 1e18,
  };
  return hashrate * (multipliers[unit] || 1);
}

function calculateProfitability(
  rigHashrate: number,
  rigPowerWatts: number,
  blockchain: BlockchainConfig
): { dailyRevenue: number; dailyCost: number; dailyProfit: number; coinsPerDay: number } {
  const blocksPerDay = (24 * 60 * 60) / blockchain.blockTime;
  const rigHashShare = rigHashrate / blockchain.networkHashrate;
  const coinsPerDay = rigHashShare * blocksPerDay * blockchain.blockReward;
  const grossRevenue = coinsPerDay * blockchain.priceUSD;
  const poolFeeAmount = grossRevenue * (blockchain.poolFee / 100);
  const dailyRevenue = grossRevenue - poolFeeAmount;
  const dailyCost = (rigPowerWatts / 1000) * 24 * ELECTRICITY_RATE_PER_KWH;
  const dailyProfit = dailyRevenue - dailyCost;

  return { dailyRevenue, dailyCost, dailyProfit, coinsPerDay };
}

export const run: ActionRun = async ({ params, logger, api }) => {
  logger.info("Starting multi-chain mining coordination...");

  const startTime = new Date();
  let rigsProcessed = 0;
  let rigsSwitched = 0;
  const chainAllocation: Record<string, { rigs: number; hashrate: number; expectedDailyRevenue: number }> = {};
  const blocksMinedThisCycle: Record<string, number> = {};
  let totalHashrate = 0;
  let totalDailyRevenue = 0;
  const recommendations: string[] = [];

  // Initialize chain allocation
  for (const chain of Object.keys(BLOCKCHAIN_CONFIGS)) {
    chainAllocation[chain] = { rigs: 0, hashrate: 0, expectedDailyRevenue: 0 };
    blocksMinedThisCycle[chain] = 0;
  }

  // Fetch all active mining rigs
  const rigs = await api.miningRig.findMany({
    filter: { isActive: { equals: true } },
    select: {
      id: true,
      name: true,
      type: true,
      algorithm: true,
      hashrate: true,
      hashrateUnit: true,
      powerConsumption: true,
      coin: true,
      userId: true,
      status: true,
      temperature: true,
    },
  });

  logger.info(`Found ${rigs.length} active mining rigs`);

  // Process each rig
  for (const rig of rigs) {
    rigsProcessed++;

    // Determine compatible algorithms based on rig type
    const compatibleAlgorithms = RIG_COMPATIBILITY[rig.type] || [];
    const compatibleChains = Object.entries(BLOCKCHAIN_CONFIGS).filter(([_, config]) =>
      compatibleAlgorithms.includes(config.algorithm)
    );

    if (compatibleChains.length === 0) {
      logger.warn(`Rig ${rig.name} (${rig.type}) has no compatible chains`);
      continue;
    }

    // Convert rig hashrate to standard units
    const rigHashrateStandard = convertHashrate(rig.hashrate || 0, rig.hashrateUnit || "H/s");
    const rigPower = rig.powerConsumption || 1000; // Default 1000W if not set

    // Calculate profitability for each compatible chain
    let bestChain = rig.coin || compatibleChains[0][0];
    let bestProfit = -Infinity;
    const profitabilityResults: Record<string, any> = {};

    for (const [chainSymbol, chainConfig] of compatibleChains) {
      const profitability = calculateProfitability(rigHashrateStandard, rigPower, chainConfig);
      profitabilityResults[chainSymbol] = profitability;

      if (profitability.dailyProfit > bestProfit) {
        bestProfit = profitability.dailyProfit;
        bestChain = chainSymbol;
      }
    }

    // Check if we should switch chains (>10% profit difference)
    const currentChain = rig.coin || bestChain;
    const currentProfit = profitabilityResults[currentChain]?.dailyProfit || 0;
    const profitDifference = ((bestProfit - currentProfit) / Math.abs(currentProfit)) * 100;

    if (currentChain !== bestChain && profitDifference > 10) {
      logger.info(`Switching rig ${rig.name} from ${currentChain} to ${bestChain} (+${profitDifference.toFixed(1)}% profit)`);

      // End current mining session
      const currentSessions = await api.miningSession.findMany({
        filter: {
          AND: [{ miningRigId: { equals: rig.id } }, { endedAt: { isSet: false } }],
        },
        first: 1,
      });

      if (currentSessions.length > 0) {
        await api.miningSession.update(currentSessions[0].id, {
          endedAt: new Date(),
        });
      }

      // Update rig to new target
      await api.miningRig.update(rig.id, {
        coin: bestChain,
        algorithm: BLOCKCHAIN_CONFIGS[bestChain].algorithm,
      });

      // Create new mining session
      await api.miningSession.create({
        miningRig: { _link: rig.id },
        user: { _link: rig.userId },
        coin: bestChain,
        algorithm: BLOCKCHAIN_CONFIGS[bestChain].algorithm,
        startedAt: new Date(),
      });

      rigsSwitched++;
    }

    // Mine CypherCoin blocks if this rig is mining CYP
    if ((rig.coin === "CYP" || bestChain === "CYP") && rig.status !== "error") {
      try {
        const result = await api.mineBlock({
          minerAddress: `cypher-miner-${rig.id}`,
        });

        if (result.success) {
          logger.info(`CYP block mined by rig ${rig.name}`, {
            blockHash: result.blockHash,
            reward: result.miningReward,
          });

          blocksMinedThisCycle.CYP = (blocksMinedThisCycle.CYP || 0) + 1;

          // Update mining session with reward
          const activeSessions = await api.miningSession.findMany({
            filter: {
              AND: [{ miningRigId: { equals: rig.id } }, { endedAt: { isSet: false } }],
            },
            first: 1,
          });

          if (activeSessions.length > 0) {
            const session = activeSessions[0];
            await api.miningSession.update(session.id, {
              sharesAccepted: (session.sharesAccepted || 0) + 1,
              coinsEarned: (session.coinsEarned || 0) + (result.miningReward || 0),
              revenue: (session.revenue || 0) + (result.miningReward || 0) * BLOCKCHAIN_CONFIGS.CYP.priceUSD,
            });
          }
        }
      } catch (error: any) {
        logger.error(`CYP mining failed for rig ${rig.name}`, { error: error.message });
      }
    }

    // Health monitoring
    if (rig.temperature && rig.temperature > 80) {
      await api.notification.create({
        user: { _link: rig.userId },
        type: "mining",
        severity: "warning",
        title: `Mining Rig Overheating`,
        message: `Rig ${rig.name} temperature: ${rig.temperature}°C`,
        isRead: false,
        metadata: { rigId: rig.id, temperature: rig.temperature },
      });

      recommendations.push(`Rig ${rig.name} is overheating (${rig.temperature}°C). Consider improving cooling.`);
    }

    if (rig.hashrate === 0 || rig.status === "error") {
      await api.notification.create({
        user: { _link: rig.userId },
        type: "mining",
        severity: "critical",
        title: `Mining Rig Down`,
        message: `Rig ${rig.name} has stopped hashing`,
        isRead: false,
        metadata: { rigId: rig.id },
      });

      await api.miningRig.update(rig.id, { status: "error" });
      recommendations.push(`Rig ${rig.name} is down. Check hardware and restart.`);
    }

    // Update chain allocation stats
    const targetChain = rig.coin || bestChain;
    chainAllocation[targetChain].rigs += 1;
    chainAllocation[targetChain].hashrate += rigHashrateStandard;
    chainAllocation[targetChain].expectedDailyRevenue += profitabilityResults[targetChain]?.dailyRevenue || 0;

    totalHashrate += rigHashrateStandard;
    totalDailyRevenue += profitabilityResults[targetChain]?.dailyRevenue || 0;
  }

  // Determine most and least profitable chains
  let mostProfitableChain = "";
  let mostProfitableRevenue = 0;
  let leastProfitableChain = "";
  let leastProfitableRevenue = Infinity;

  for (const [chain, allocation] of Object.entries(chainAllocation)) {
    if (allocation.rigs > 0) {
      if (allocation.expectedDailyRevenue > mostProfitableRevenue) {
        mostProfitableRevenue = allocation.expectedDailyRevenue;
        mostProfitableChain = chain;
      }
      if (allocation.expectedDailyRevenue < leastProfitableRevenue) {
        leastProfitableRevenue = allocation.expectedDailyRevenue;
        leastProfitableChain = chain;
      }
    }
  }

  // Add strategic recommendations
  if (rigsSwitched > 0) {
    recommendations.push(`${rigsSwitched} rigs were rebalanced to more profitable chains.`);
  }

  if (mostProfitableChain && chainAllocation[mostProfitableChain].rigs < rigs.length * 0.3) {
    recommendations.push(
      `Consider adding more ${mostProfitableChain}-compatible rigs. Currently most profitable.`
    );
  }

  const endTime = new Date();
  const executionTimeMs = endTime.getTime() - startTime.getTime();

  logger.info("Multi-chain mining coordination completed", {
    rigsProcessed,
    rigsSwitched,
    executionTimeMs,
    totalDailyRevenue,
  });

  return {
    timestamp: endTime,
    executionTimeMs,
    rigsProcessed,
    rigsSwitched,
    chainAllocation,
    totalHashrate,
    totalDailyRevenue,
    blocksMinedThisCycle,
    mostProfitableChain: mostProfitableChain || "N/A",
    leastProfitableChain: leastProfitableChain || "N/A",
    recommendations,
  };
};

export const options: ActionOptions = {
  timeoutMS: 300000, // 5 minutes
  returnType: true,
  triggers: {
    api: true,
    scheduler: [
      {
        every: "hour",
        at: "15 mins",
      },
    ],
  },
};
