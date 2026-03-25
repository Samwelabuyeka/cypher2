import { ActionOptions } from "gadget-server";

interface SyncSummary {
  totalWalletsSynced: number;
  newTransactionsFound: number;
  portfolioValue: number;
  tokensDiscovered: number;
  errors: string[];
}

interface WalletBalance {
  currency: string;
  balance: number;
  usdValue: number;
}

export const run: ActionRun = async ({ params, logger, api }) => {
  const { userId, chain, forceRefresh } = params;
  
  logger.info({ userId, chain, forceRefresh }, "Starting blockchain wallet sync");
  
  const syncSummary: SyncSummary = {
    totalWalletsSynced: 0,
    newTransactionsFound: 0,
    portfolioValue: 0,
    tokensDiscovered: 0,
    errors: []
  };

  try {
    // Fetch user's wallets from database
    const userWallets = await api.wallet.findMany({
      filter: {
        user: { equals: userId },
        isActive: { equals: true },
        ...(chain && { network: { equals: chain } })
      },
      select: {
        id: true,
        address: true,
        currency: true,
        network: true,
        balance: true,
        lastTransactionAt: true
      }
    });

    if (userWallets.length === 0) {
      logger.warn({ userId, chain }, "No wallets found for user");
      return syncSummary;
    }

    logger.info({ walletCount: userWallets.length }, "Found wallets to sync");

    // Process each wallet
    for (const wallet of userWallets) {
      try {
        // Check if sync is needed
        const shouldSync = forceRefresh || 
          !wallet.lastTransactionAt || 
          (Date.now() - new Date(wallet.lastTransactionAt).getTime()) > 300000; // 5 minutes

        if (!shouldSync) {
          logger.debug({ walletId: wallet.id }, "Skipping wallet - recently synced");
          continue;
        }

        logger.info({ walletId: wallet.id, address: wallet.address }, "Syncing wallet");

        // Fetch blockchain data
        const balances = await fetchWalletBalances(wallet.address, wallet.network || 'ethereum');
        const transactions = await fetchTransactionHistory(wallet.address, wallet.network || 'ethereum');
        
        // Calculate total portfolio value
        let walletValue = 0;
        const previousBalance = wallet.balance || 0;

        // Update main wallet balance
        for (const balance of balances) {
          walletValue += balance.usdValue;
          
          // Check if this is a new token
          if (balance.currency !== wallet.currency) {
            const existingWallet = await api.wallet.findFirst({
              filter: {
                user: { equals: userId },
                currency: { equals: balance.currency },
                network: { equals: wallet.network }
              }
            });

            if (!existingWallet && balance.balance > 0) {
              // Create new wallet for discovered token
              await api.wallet.create({
                user: { _link: userId },
                currency: balance.currency,
                balance: balance.balance,
                availableBalance: balance.balance,
                lockedBalance: 0,
                network: wallet.network,
                isActive: true,
                lastTransactionAt: new Date()
              });
              
              syncSummary.tokensDiscovered++;
              logger.info({ currency: balance.currency }, "Discovered new token");
            }
          }
        }

        // Update wallet record
        await api.wallet.update(wallet.id, {
          balance: balances.find(b => b.currency === wallet.currency)?.balance || wallet.balance,
          availableBalance: balances.find(b => b.currency === wallet.currency)?.balance || wallet.balance,
          lastTransactionAt: new Date()
        });

        // Process transactions
        const newTransactions = await processTransactions(
          transactions,
          wallet.id,
          userId,
          api,
          logger
        );
        
        syncSummary.newTransactionsFound += newTransactions;
        syncSummary.totalWalletsSynced++;
        syncSummary.portfolioValue += walletValue;

        // Check for significant balance changes (>10%)
        const balanceChange = Math.abs(walletValue - previousBalance);
        const percentChange = previousBalance > 0 ? (balanceChange / previousBalance) * 100 : 0;

        if (percentChange > 10) {
          await api.notification.create({
            user: { _link: userId },
            type: "security",
            severity: "warning",
            title: "Large Balance Change Detected",
            message: `Your ${wallet.currency} wallet balance changed by ${percentChange.toFixed(2)}%`,
            metadata: {
              walletId: wallet.id,
              previousBalance,
              newBalance: walletValue,
              percentChange
            },
            isRead: false
          });
        }

        // Notify about new tokens
        if (syncSummary.tokensDiscovered > 0) {
          await api.notification.create({
            user: { _link: userId },
            type: "security",
            severity: "info",
            title: "New Tokens Discovered",
            message: `Found ${syncSummary.tokensDiscovered} new token(s) in your wallets`,
            metadata: {
              tokensCount: syncSummary.tokensDiscovered
            },
            isRead: false
          });
        }

        logger.info({ 
          walletId: wallet.id, 
          value: walletValue,
          newTxs: newTransactions 
        }, "Wallet sync completed");

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ 
          walletId: wallet.id, 
          error: errorMessage 
        }, "Failed to sync wallet");
        
        syncSummary.errors.push(`Wallet ${wallet.id}: ${errorMessage}`);
        // Continue with other wallets
      }
    }

    // Create summary notification if there were significant findings
    if (syncSummary.newTransactionsFound > 5) {
      await api.notification.create({
        user: { _link: userId },
        type: "security",
        severity: "info",
        title: "Wallet Sync Complete",
        message: `Synced ${syncSummary.totalWalletsSynced} wallets and found ${syncSummary.newTransactionsFound} new transactions`,
        metadata: syncSummary,
        isRead: false
      });
    }

    logger.info(syncSummary, "Blockchain wallet sync completed");
    return syncSummary;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, "Wallet sync failed");
    throw new Error(`Wallet sync failed: ${errorMessage}`);
  }
};

async function fetchWalletBalances(
  address: string,
  network: string
): Promise<WalletBalance[]> {
  // In a real implementation, this would use Web3 or similar blockchain client
  // For now, return mock data structure
  // TODO: Implement actual blockchain API calls (e.g., using ethers.js, web3.js, or Alchemy/Infura)
  
  return [
    {
      currency: network === 'ethereum' ? 'ETH' : 'BNB',
      balance: 0,
      usdValue: 0
    }
  ];
}

async function fetchTransactionHistory(
  address: string,
  network: string,
  limit: number = 100
): Promise<any[]> {
  // In a real implementation, this would fetch from blockchain explorers or node APIs
  // TODO: Implement actual transaction fetching
  
  return [];
}

async function processTransactions(
  transactions: any[],
  walletId: string,
  userId: string,
  api: any,
  logger: any
): Promise<number> {
  let newTransactionCount = 0;

  for (const tx of transactions) {
    try {
      // Check if transaction already exists
      const existingTx = await api.walletTransaction.findFirst({
        filter: {
          blockchainTxHash: { equals: tx.hash }
        }
      });

      if (!existingTx) {
        // Determine transaction type
        const txType = tx.value > 0 ? 'deposit' : 'withdrawal';
        
        await api.walletTransaction.create({
          user: { _link: userId },
          wallet: { _link: walletId },
          type: txType,
          amount: Math.abs(tx.value || 0),
          currency: tx.currency || 'ETH',
          status: tx.status === 'success' ? 'completed' : 'failed',
          blockchainTxHash: tx.hash,
          fromAddress: tx.from,
          toAddress: tx.to,
          fee: tx.fee || 0,
          initiatedAt: new Date(tx.timestamp),
          completedAt: tx.status === 'success' ? new Date(tx.timestamp) : undefined,
          metadata: {
            blockNumber: tx.blockNumber,
            gasUsed: tx.gasUsed,
            network: tx.network
          }
        });

        newTransactionCount++;
        
        // Create notification for large transactions
        if (Math.abs(tx.value || 0) > 1000) {
          await api.notification.create({
            user: { _link: userId },
            type: 'security',
            severity: 'warning',
            title: `Large ${txType} Detected`,
            message: `${txType} of ${Math.abs(tx.value || 0).toFixed(4)} ${tx.currency || 'ETH'}`,
            metadata: {
              transactionHash: tx.hash,
              amount: tx.value,
              type: txType
            },
            isRead: false
          });
        }
      }
    } catch (error) {
      logger.error({ txHash: tx.hash, error }, "Failed to process transaction");
    }
  }

  return newTransactionCount;
}

export const params = {
  userId: { type: "string", required: true },
  chain: { 
    type: "string", 
    required: false,
    enum: ["ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche", "fantom"]
  },
  forceRefresh: { type: "boolean", required: false, default: false }
};

export const options: ActionOptions = {
  triggers: {
    api: true
  }
};
