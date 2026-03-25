import { ActionOptions } from "gadget-server";
import { TokenomicsEngine } from "../lib/blockchain/customChain/tokenomics";
import { SupplyManager } from "../lib/blockchain/customChain/supplyManager";
import { CirculationEngine } from "../lib/blockchain/customChain/circulationEngine";
import { Blockchain } from "../lib/blockchain/customChain/blockchain";

export const run: ActionRun = async ({ params, logger, api }) => {
  logger.info("Starting CypherCoin (CYP) currency initialization");

  // Initialize TokenomicsEngine with configuration
  const tokenomicsConfig = {
    name: "CypherCoin",
    symbol: "CYP",
    decimals: 18,
    maxSupply: 21000000,
    baseBlockReward: 50,
    halvingInterval: 210000,
    transactionFeePercentage: 0.1,
    stakingRewardRate: 5,
    burnPercentage: 50,
  };

  logger.info("Initializing TokenomicsEngine", { config: tokenomicsConfig });
  const tokenomicsEngine = new TokenomicsEngine(tokenomicsConfig);

  // Initialize SupplyManager
  logger.info("Initializing SupplyManager");
  const supplyManager = new SupplyManager(tokenomicsEngine);

  // Generate emission schedule for all halving events
  logger.info("Generating emission schedule");
  const emissionSchedule = supplyManager.generateEmissionSchedule();
  logger.info("Emission schedule generated", {
    totalHalvingEvents: emissionSchedule.length,
  });

  // Initialize CirculationEngine
  logger.info("Initializing CirculationEngine");
  const circulationEngine = new CirculationEngine(supplyManager);

  // Create Blockchain instance with genesis block
  logger.info("Creating blockchain with genesis block");
  const blockchain = new Blockchain();
  const genesisBlock = blockchain.createGenesisBlock();
  logger.info("Genesis block created", { hash: genesisBlock.hash });

  // Set up genesis allocation
  const genesisAllocation = {
    developmentFund: {
      amount: 100000,
      lockPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
      purpose: "Development fund locked for 1 year",
    },
    initialLiquidity: {
      amount: 50000,
      purpose: "Initial liquidity for exchanges",
    },
  };

  logger.info("Genesis allocation configured", {
    developmentFund: genesisAllocation.developmentFund.amount,
    initialLiquidity: genesisAllocation.initialLiquidity.amount,
  });

  // Calculate initial supply
  const initialSupply =
    genesisAllocation.developmentFund.amount +
    genesisAllocation.initialLiquidity.amount;

  // Log comprehensive initialization details
  logger.info("CypherCoin initialization completed successfully", {
    currency: {
      name: tokenomicsConfig.name,
      symbol: tokenomicsConfig.symbol,
      decimals: tokenomicsConfig.decimals,
    },
    supply: {
      maxSupply: tokenomicsConfig.maxSupply,
      initialSupply,
      remainingSupply: tokenomicsConfig.maxSupply - initialSupply,
    },
    economics: {
      baseBlockReward: tokenomicsConfig.baseBlockReward,
      halvingInterval: tokenomicsConfig.halvingInterval,
      transactionFeePercentage: tokenomicsConfig.transactionFeePercentage,
      stakingRewardRate: tokenomicsConfig.stakingRewardRate,
      burnPercentage: tokenomicsConfig.burnPercentage,
    },
    blockchain: {
      genesisBlockHash: genesisBlock.hash,
      genesisBlockTimestamp: genesisBlock.timestamp,
    },
  });

  // Return initialization result
  return {
    success: true,
    currency: {
      name: tokenomicsConfig.name,
      symbol: tokenomicsConfig.symbol,
      decimals: tokenomicsConfig.decimals,
    },
    supply: {
      maxSupply: tokenomicsConfig.maxSupply,
      initialSupply,
      circulatingSupply: initialSupply,
    },
    halvingSchedule: emissionSchedule,
    economicParameters: {
      baseBlockReward: tokenomicsConfig.baseBlockReward,
      halvingInterval: tokenomicsConfig.halvingInterval,
      transactionFeePercentage: tokenomicsConfig.transactionFeePercentage,
      stakingRewardRate: tokenomicsConfig.stakingRewardRate,
      burnPercentage: tokenomicsConfig.burnPercentage,
    },
    genesisBlock: {
      hash: genesisBlock.hash,
      timestamp: genesisBlock.timestamp,
    },
    genesisAllocation,
    initializedAt: new Date().toISOString(),
  };
};

export const options: ActionOptions = {
  returnType: true,
};
