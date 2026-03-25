import { ActionOptions } from "gadget-server";
// @ts-ignore
import ccxt from "ccxt";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const { tradingAccountId } = params;

  if (!tradingAccountId) {
    throw new Error("tradingAccountId is required");
  }

  const userId = session?.get("user");
  if (!userId) {
    throw new Error("You must be signed in to sync a trading account");
  }

  try {
    // Fetch the trading account with all necessary data
    const tradingAccount = await api.tradingAccount.findOne(tradingAccountId, {
      select: {
        id: true,
        userId: true,
        apiKey: true,
        apiSecret: true,
        apiPassphrase: true,
        balance: true,
        lastSyncedAt: true,
        exchange: {
          id: true,
          code: true,
          name: true,
          apiEndpoint: true,
        },
      },
    });

    if (!tradingAccount) {
      throw new Error(`Trading account with ID ${tradingAccountId} not found`);
    }

    // Authorization check: only the account owner can sync
    if (tradingAccount.userId !== userId) {
      throw new Error("You are not authorized to sync this trading account");
    }

    if (!tradingAccount.exchange) {
      throw new Error("Trading account is not connected to an exchange");
    }

    if (!tradingAccount.apiKey || !tradingAccount.apiSecret) {
      throw new Error("Trading account is missing API credentials");
    }

    logger.info(`Syncing balance for trading account ${tradingAccountId} on ${tradingAccount.exchange.name}`);

    // Initialize CCXT exchange
    const exchangeCode = tradingAccount.exchange.code.toLowerCase();
    
    if (!ccxt.exchanges.includes(exchangeCode)) {
      throw new Error(`Exchange ${exchangeCode} is not supported by CCXT`);
    }

    const ExchangeClass = ccxt[exchangeCode as keyof typeof ccxt] as any;
    if (!ExchangeClass) {
      throw new Error(`Could not find exchange class for ${exchangeCode}`);
    }

    const exchangeConfig: any = {
      apiKey: tradingAccount.apiKey,
      secret: tradingAccount.apiSecret,
      enableRateLimit: true,
    };

    // Add passphrase if provided (required for some exchanges like Coinbase Pro)
    if (tradingAccount.apiPassphrase) {
      exchangeConfig.password = tradingAccount.apiPassphrase;
    }

    // Add custom API endpoint if provided
    if (tradingAccount.exchange.apiEndpoint) {
      exchangeConfig.urls = {
        api: tradingAccount.exchange.apiEndpoint,
      };
    }

    const exchange = new ExchangeClass(exchangeConfig);

    // Fetch balance from exchange
    let fetchedBalance;
    try {
      fetchedBalance = await exchange.fetchBalance();
    } catch (error: any) {
      logger.error({ error, exchangeCode }, "Failed to fetch balance from exchange");
      throw new Error(`Failed to fetch balance from ${tradingAccount.exchange.name}: ${error.message}`);
    }

    // Update the trading account with fresh balance and timestamp
    const updatedAccount = await api.tradingAccount.update(tradingAccountId, {
      balance: fetchedBalance,
      lastSyncedAt: new Date(),
    });

    logger.info(`Successfully synced balance for trading account ${tradingAccountId}`);

    return {
      success: true,
      tradingAccountId: tradingAccountId,
      balance: fetchedBalance,
      lastSyncedAt: updatedAccount.lastSyncedAt,
    };
  } catch (error: any) {
    logger.error({ error, tradingAccountId }, "Error syncing trading account balance");
    throw error;
  }
};

export const params = {
  tradingAccountId: {
    type: "string" as const,
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
