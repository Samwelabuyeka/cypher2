import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const electricityCostPerKwh = params.electricityCostPerKwh ?? 0.10;
  const autoSwitch = params.autoSwitch ?? true;
  const minProfitabilityDiff = params.minProfitabilityDiff ?? 10;

  logger.info("Starting multi-currency mining management", {
    electricityCostPerKwh,
    autoSwitch,
    minProfitabilityDiff,
  });

  const report = {
    totalHashrate: 0,
    rigsManaged: 0,
    rigsSwitched: 0,
    currentTargets: {} as Record<string, string>,
    expectedDailyRevenue: 0,
    profitabilityData: [] as Array<{
      coin: string;
      algorithm: string;
      profitPerDay: number;
      networkDifficulty: number;
      price: number;
    }>,
    rigDetails: [] as Array<{
      rigId: string;
      rigName: string;
      currentCoin: string;
      newCoin?: string;
      switched: boolean;
      expectedProfit: number;
      hashrate: number;
    }>,
    errors: [] as string[],
  };

  try {
    const profitabilityData = await fetchProfitabilityData(logger);
    report.profitabilityData = profitabilityData;

    const activeRigs = await api.miningRig.findMany({
      filter: {
        isActive: { equals: true },
      },
      select: {
        id: true,
        name: true,
        type: true,
        algorithm: true,
        coin: true,
        hashrate: true,
        powerConsumption: true,
        hashrateUnit: true,
        userId: true,
      },
    });

    logger.info(`Found ${activeRigs.length} active mining rigs`);
    report.rigsManaged = activeRigs.length;

    for (const rig of activeRigs) {
      try {
        const rigHashrate = rig.hashrate ?? 0;
        report.totalHashrate += rigHashrate;

        const compatibleCoins = profitabilityData.filter(
          (coin) => coin.algorithm === rig.algorithm
        );

        if (compatibleCoins.length === 0) {
          report.errors.push(`No compatible coins found for rig ${rig.name} with algorithm ${rig.algorithm}`);
          continue;
        }

        const powerCostPerDay = ((rig.powerConsumption ?? 0) / 1000) * 24 * electricityCostPerKwh;

        const profitAnalysis = compatibleCoins.map((coin) => {
          const grossProfitPerDay = (rigHashrate / 1000000) * coin.profitPerDay;
          const netProfitPerDay = grossProfitPerDay - powerCostPerDay;
          return {
            coin: coin.coin,
            netProfit: netProfitPerDay,
            grossProfit: grossProfitPerDay,
          };
        });

        profitAnalysis.sort((a, b) => b.netProfit - a.netProfit);
        const mostProfitable = profitAnalysis[0];

        const currentCoinProfit = profitAnalysis.find((p) => p.coin === rig.coin)?.netProfit ?? 0;
        const profitDiff = ((mostProfitable.netProfit - currentCoinProfit) / currentCoinProfit) * 100;

        const shouldSwitch = autoSwitch && mostProfitable.coin !== rig.coin && profitDiff >= minProfitabilityDiff;

        const rigDetail = {
          rigId: rig.id,
          rigName: rig.name,
          currentCoin: rig.coin ?? "unknown",
          newCoin: shouldSwitch ? mostProfitable.coin : undefined,
          switched: shouldSwitch,
          expectedProfit: mostProfitable.netProfit,
          hashrate: rigHashrate,
        };

        report.rigDetails.push(rigDetail);
        report.expectedDailyRevenue += mostProfitable.netProfit;

        if (shouldSwitch) {
          logger.info(`Switching rig ${rig.name} from ${rig.coin} to ${mostProfitable.coin}`, {
            profitDiff: `${profitDiff.toFixed(2)}%`,
            oldProfit: currentCoinProfit.toFixed(4),
            newProfit: mostProfitable.netProfit.toFixed(4),
          });

          const now = new Date();

          if (rig.coin) {
            const existingSession = await api.miningSession.findMany({
              filter: {
                miningRigId: { equals: rig.id },
                coin: { equals: rig.coin },
                endedAt: { isSet: false },
              },
              first: 1,
            });

            if (existingSession.length > 0) {
              await api.miningSession.update(existingSession[0].id, {
                endedAt: now,
              });
            }
          }

          await api.miningRig.update(rig.id, {
            coin: mostProfitable.coin,
            lastSeenAt: now,
          });

          await api.miningSession.create({
            miningRig: { _link: rig.id },
            user: { _link: rig.userId },
            coin: mostProfitable.coin,
            algorithm: rig.algorithm ?? "unknown",
            startedAt: now,
          });

          report.rigsSwitched++;
          report.currentTargets[rig.id] = mostProfitable.coin;
        } else {
          report.currentTargets[rig.id] = rig.coin ?? "current";
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error processing rig ${rig.name}`, { error: errorMessage });
        report.errors.push(`Rig ${rig.name}: ${errorMessage}`);
      }
    }

    logger.info("Multi-mining management completed", {
      rigsManaged: report.rigsManaged,
      rigsSwitched: report.rigsSwitched,
      totalHashrate: report.totalHashrate,
      expectedDailyRevenue: report.expectedDailyRevenue.toFixed(4),
    });

    return report;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Fatal error in multi-mining management", { error: errorMessage });
    report.errors.push(`Fatal error: ${errorMessage}`);
    return report;
  }
};

async function fetchProfitabilityData(logger: any) {
  logger.info("Fetching profitability data");

  return [
    {
      coin: "Bitcoin",
      algorithm: "SHA-256",
      profitPerDay: 0.000045,
      networkDifficulty: 70000000000000,
      price: 45000,
    },
    {
      coin: "Litecoin",
      algorithm: "Scrypt",
      profitPerDay: 0.012,
      networkDifficulty: 25000000,
      price: 85,
    },
    {
      coin: "Ethereum Classic",
      algorithm: "Ethash",
      profitPerDay: 0.025,
      networkDifficulty: 3500000000000000,
      price: 28,
    },
    {
      coin: "Monero",
      algorithm: "RandomX",
      profitPerDay: 0.0085,
      networkDifficulty: 350000000000,
      price: 165,
    },
    {
      coin: "Ravencoin",
      algorithm: "KawPow",
      profitPerDay: 15.5,
      networkDifficulty: 85000000000,
      price: 0.045,
    },
  ];
}

export const params = {
  electricityCostPerKwh: {
    type: "number",
  },
  autoSwitch: {
    type: "boolean",
  },
  minProfitabilityDiff: {
    type: "number",
  },
};

export const options: ActionOptions = {
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
