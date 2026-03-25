import { ActionOptions } from "gadget-server";
import { Blockchain } from "../lib/blockchain/customChain/blockchain";
import { ConsensusEngine } from "../lib/blockchain/customChain/consensus";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const { minerAddress } = params;

  if (!minerAddress) {
    throw new Error("Miner address is required");
  }

  logger.info({ minerAddress }, "Starting block mining");

  // Get blockchain instance
  const blockchain = new Blockchain({ name: 'Cypher', symbol: 'CYP' });
  const consensus = new ConsensusEngine();

  // Get current block height before mining
  const currentHeight = blockchain.getLatestBlock().index;
  
  // Calculate mining reward with halving
  const halvingInterval = 210000; // blocks between halvings
  const initialReward = 50; // initial CYP per block
  const halvingCount = Math.floor(currentHeight / halvingInterval);
  const miningReward = initialReward / Math.pow(2, halvingCount);

  logger.info({ currentHeight, miningReward, halvingCount }, "Calculated mining reward");

  // Mine pending transactions into new block
  const newBlock = await blockchain.minePendingTransactions(minerAddress);
  
  if (!newBlock) {
    throw new Error("Failed to mine block - no pending transactions");
  }

  // Calculate total transaction fees from the block
  let totalFees = 0;
  for (const tx of newBlock.transactions) {
    if (tx.fee) {
      totalFees += tx.fee;
    }
  }

  logger.info({ totalFees, transactionCount: newBlock.transactions.length }, "Calculated transaction fees");

  // Distribute rewards
  const feesBurned = totalFees * 0.5; // 50% burned (deflationary)
  const feesToMiner = totalFees * 0.3; // 30% to miner
  const feesToStaking = totalFees * 0.2; // 20% to staking reward pool

  // Get current user for recording transactions
  const userId = session?.get("user");

  // Create mining reward transaction
  await api.cypherTransaction.create({
    amount: miningReward,
    fee: 0,
    fromAddress: "0x0", // Mining rewards come from coinbase
    toAddress: minerAddress,
    hash: `mining-reward-${newBlock.hash}`,
    status: "confirmed",
    transactionType: "mining_reward",
    blockHash: newBlock.hash,
    blockNumber: newBlock.index,
    confirmations: 1,
    user: userId ? { _link: userId } : undefined,
  });

  // Record miner fees
  if (feesToMiner > 0) {
    await api.cypherTransaction.create({
      amount: feesToMiner,
      fee: 0,
      fromAddress: "0x0",
      toAddress: minerAddress,
      hash: `miner-fees-${newBlock.hash}`,
      status: "confirmed",
      transactionType: "fee_collection",
      blockHash: newBlock.hash,
      blockNumber: newBlock.index,
      confirmations: 1,
      user: userId ? { _link: userId } : undefined,
    });
  }

  // Record burned fees
  if (feesBurned > 0) {
    await api.cypherTransaction.create({
      amount: feesBurned,
      fee: 0,
      fromAddress: "0x0",
      toAddress: "0x0", // Burn address
      hash: `burn-${newBlock.hash}`,
      status: "confirmed",
      transactionType: "burn",
      blockHash: newBlock.hash,
      blockNumber: newBlock.index,
      confirmations: 1,
      user: userId ? { _link: userId } : undefined,
    });
  }

  // Record staking pool allocation
  if (feesToStaking > 0) {
    await api.cypherTransaction.create({
      amount: feesToStaking,
      fee: 0,
      fromAddress: "0x0",
      toAddress: "staking-pool",
      hash: `staking-${newBlock.hash}`,
      status: "confirmed",
      transactionType: "staking_reward",
      blockHash: newBlock.hash,
      blockNumber: newBlock.index,
      confirmations: 1,
      user: userId ? { _link: userId } : undefined,
    });
  }

  // Calculate total supply (simplified - would need to query all minting/burning)
  const totalMinted = miningReward;
  const totalBurned = feesBurned;
  const netSupplyChange = totalMinted - totalBurned;

  // Check for halving event
  const nextHalving = (halvingCount + 1) * halvingInterval;
  const blocksUntilHalving = nextHalving - newBlock.index;
  
  if (newBlock.index % halvingInterval === 0 && newBlock.index > 0) {
    logger.info({ blockHeight: newBlock.index, newReward: miningReward }, "Halving event occurred!");
  }

  logger.info({
    blockHash: newBlock.hash,
    blockHeight: newBlock.index,
    miningReward,
    transactionCount: newBlock.transactions.length,
    totalFees,
    feesBurned,
    feesToMiner,
    feesToStaking,
  }, "Block mined successfully");

  return {
    blockHash: newBlock.hash,
    blockHeight: newBlock.index,
    miningReward,
    transactionCount: newBlock.transactions.length,
    feesCollected: totalFees,
    feesBurned,
    feesToMiner,
    feesToStaking,
    netSupplyChange,
    totalSupply: blockchain.getTotalSupply?.() || 0,
    nextHalvingInBlocks: blocksUntilHalving,
    timestamp: newBlock.timestamp,
  };
};

export const params = {
  minerAddress: {
    type: "string",
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
