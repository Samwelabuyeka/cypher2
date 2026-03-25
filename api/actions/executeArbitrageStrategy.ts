import { ActionOptions } from "gadget-server";

interface ArbitrageParams {
  userId: string;
  tokenPair: string;
  exchanges: string[];
  minProfitPercent: number;
  maxInvestment: number;
  dryRun: boolean;
}

export const run: ActionRun = async ({ params, logger, api }) => {
  logger.info("Starting arbitrage strategy execution", { params });

  const {
    userId,
    tokenPair,
    exchanges,
    minProfitPercent,
    maxInvestment,
    dryRun,
  } = params as ArbitrageParams;

  try {
    // Step 1: Validate user and get trading accounts
    const user = await api.user.findOne(userId, {
      select: { id: true, email: true },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Step 2: Fetch exchanges by code first
    const exchangeRecords = await api.exchange.findMany({
      filter: {
        code: { in: exchanges },
        isActive: { equals: true },
      },
      select: {
        id: true,
        code: true,
        name: true,
        apiEndpoint: true,
        feeStructure: true,
      },
    });

    const exchangeIds = exchangeRecords.map((ex) => ex.id);

    if (exchangeIds.length < 2) {
      throw new Error(
        `Need at least 2 active exchanges. Found: ${exchangeIds.length}`
      );
    }

    // Fetch trading accounts for specified exchanges
    const tradingAccounts = await api.tradingAccount.findMany({
      filter: {
        userId: { equals: userId },
        exchangeId: { in: exchangeIds },
        isActive: { equals: true },
      },
      select: {
        id: true,
        accountName: true,
        balance: true,
        exchangeId: true,
        exchange: {
          id: true,
          code: true,
          name: true,
          apiEndpoint: true,
          feeStructure: true,
        },
      },
    });

    if (tradingAccounts.length < 2) {
      throw new Error(
        `Need at least 2 active trading accounts on different exchanges. Found: ${tradingAccounts.length}`
      );
    }

    logger.info(`Found ${tradingAccounts.length} trading accounts`);

    // Step 3: Fetch current prices from all exchanges
    const priceData: Array<{
      exchange: string;
      exchangeId: string;
      accountId: string;
      price: number;
      fee: number;
      timestamp: Date;
    }> = [];

    for (const account of tradingAccounts) {
      try {
        if (!account.exchange) {
          logger.warn(`No exchange data for account ${account.id}`);
          continue;
        }

        // Query market data for this exchange and token pair
        const marketData = await api.marketData.findFirst({
          filter: {
            symbol: { equals: tokenPair },
            exchangeId: { equals: account.exchangeId },
          },
          sort: { timestamp: "Descending" },
          select: {
            close: true,
            timestamp: true,
            bidPrice: true,
            askPrice: true,
          },
        });

        if (!marketData) {
          logger.warn(
            `No market data found for ${tokenPair} on ${account.exchange.code}`
          );
          continue;
        }

        if (!marketData.timestamp) {
          throw new Error('Invalid timestamp in market data');
        }

        // Extract fee from exchange fee structure
        const feeStructure = account.exchange.feeStructure as any;
        const tradingFee =
          feeStructure?.trading?.taker || feeStructure?.maker || 0.001; // Default 0.1%

        priceData.push({
          exchange: account.exchange.code,
          exchangeId: account.exchange.id,
          accountId: account.id,
          price: marketData.close,
          fee: tradingFee,
          timestamp: marketData.timestamp,
        });
      } catch (error) {
        logger.error(
          `Error fetching price from ${account.exchange.code}: ${error}`
        );
      }
    }

    if (priceData.length < 2) {
      throw new Error(
        `Need price data from at least 2 exchanges. Found: ${priceData.length}`
      );
    }

    // Step 4: Identify arbitrage opportunities
    let bestOpportunity: {
      buyExchange: string;
      sellExchange: string;
      buyPrice: number;
      sellPrice: number;
      profitPercent: number;
      netProfitPercent: number;
      buyAccountId: string;
      sellAccountId: string;
    } | null = null;

    for (let i = 0; i < priceData.length; i++) {
      for (let j = i + 1; j < priceData.length; j++) {
        const exchange1 = priceData[i];
        const exchange2 = priceData[j];

        // Calculate profit both directions
        const scenarios = [
          {
            buy: exchange1,
            sell: exchange2,
          },
          {
            buy: exchange2,
            sell: exchange1,
          },
        ];

        for (const scenario of scenarios) {
          const buyPrice = scenario.buy.price;
          const sellPrice = scenario.sell.price;
          const buyFee = scenario.buy.fee;
          const sellFee = scenario.sell.fee;

          const grossProfitPercent =
            ((sellPrice - buyPrice) / buyPrice) * 100;
          const totalFeePercent = (buyFee + sellFee) * 100;
          const netProfitPercent = grossProfitPercent - totalFeePercent;

          if (
            netProfitPercent > minProfitPercent &&
            (!bestOpportunity ||
              netProfitPercent > bestOpportunity.netProfitPercent)
          ) {
            bestOpportunity = {
              buyExchange: scenario.buy.exchange,
              sellExchange: scenario.sell.exchange,
              buyPrice,
              sellPrice,
              profitPercent: grossProfitPercent,
              netProfitPercent,
              buyAccountId: scenario.buy.accountId,
              sellAccountId: scenario.sell.accountId,
            };
          }
        }
      }
    }

    if (!bestOpportunity) {
      logger.info("No profitable arbitrage opportunity found");
      return {
        success: false,
        message: "No arbitrage opportunity found meeting minimum profit criteria",
        opportunities: priceData.map((p) => ({
          exchange: p.exchange,
          price: p.price,
          fee: p.fee,
        })),
        minProfitRequired: minProfitPercent,
      };
    }

    logger.info("Found arbitrage opportunity", {
      opportunity: bestOpportunity,
    });

    // Step 5: Check liquidity and user balance
    const buyAccount = tradingAccounts.find(
      (a) => a.id === bestOpportunity!.buyAccountId
    );
    const sellAccount = tradingAccounts.find(
      (a) => a.id === bestOpportunity!.sellAccountId
    );

    if (!buyAccount || !sellAccount) {
      throw new Error("Trading accounts not found");
    }

    // Get user's wallet for the token
    const [baseToken] = tokenPair.split("/");
    const userWallet = await api.wallet.findFirst({
      filter: {
        userId: { equals: userId },
        currency: { equals: baseToken },
      },
      select: {
        availableBalance: true,
      },
    });

    // Step 6: Calculate optimal trade size
    const accountBalance = buyAccount.balance as any;
    const availableCapital =
      accountBalance?.available || accountBalance?.total || 0;

    const maxTradeAmount = Math.min(
      availableCapital * 0.9, // Use max 90% of available balance
      maxInvestment
    );

    const estimatedQuantity = maxTradeAmount / bestOpportunity.buyPrice;
    const estimatedProfit =
      estimatedQuantity *
      (bestOpportunity.sellPrice - bestOpportunity.buyPrice) *
      (1 - bestOpportunity.netProfitPercent / 100);

    logger.info("Calculated trade parameters", {
      maxTradeAmount,
      estimatedQuantity,
      estimatedProfit,
    });

    // Step 7: Execute arbitrage (if not dryRun)
    let executionResult = {
      executed: false,
      buyOrderId: null as string | null,
      sellOrderId: null as string | null,
      buyTradeId: null as string | null,
      sellTradeId: null as string | null,
      actualProfit: 0,
      executionTime: 0,
    };

    if (!dryRun && maxTradeAmount > 0) {
      const startTime = Date.now();

      try {
        // Risk management check
        if (estimatedQuantity * bestOpportunity.buyPrice > maxInvestment) {
          throw new Error(
            `Trade size exceeds maximum investment limit: ${maxInvestment}`
          );
        }

        // Create buy order
        const buyOrder = await api.order.create({
          user: { _link: userId },
          tradingAccount: { _link: bestOpportunity.buyAccountId },
          symbol: tokenPair,
          side: "buy",
          type: "market",
          quantity: estimatedQuantity,
          price: bestOpportunity.buyPrice,
          status: "pending",
          timeInForce: "ioc", // Immediate or cancel for arbitrage
        });

        logger.info("Created buy order", { orderId: buyOrder.id });

        // Create sell order
        const sellOrder = await api.order.create({
          user: { _link: userId },
          tradingAccount: { _link: bestOpportunity.sellAccountId },
          symbol: tokenPair,
          side: "sell",
          type: "market",
          quantity: estimatedQuantity,
          price: bestOpportunity.sellPrice,
          status: "pending",
          timeInForce: "ioc",
        });

        logger.info("Created sell order", { orderId: sellOrder.id });

        // Record trades
        const buyTrade = await api.trade.create({
          user: { _link: userId },
          tradingAccount: { _link: bestOpportunity.buyAccountId },
          order: { _link: buyOrder.id },
          symbol: tokenPair,
          side: "buy",
          quantity: estimatedQuantity,
          price: bestOpportunity.buyPrice,
          value: estimatedQuantity * bestOpportunity.buyPrice,
          fee: estimatedQuantity * bestOpportunity.buyPrice * 0.001,
          executedAt: new Date(),
        });

        const sellTrade = await api.trade.create({
          user: { _link: userId },
          tradingAccount: { _link: bestOpportunity.sellAccountId },
          order: { _link: sellOrder.id },
          symbol: tokenPair,
          side: "sell",
          quantity: estimatedQuantity,
          price: bestOpportunity.sellPrice,
          value: estimatedQuantity * bestOpportunity.sellPrice,
          fee: estimatedQuantity * bestOpportunity.sellPrice * 0.001,
          executedAt: new Date(),
        });

        const actualProfit =
          estimatedQuantity * (bestOpportunity.sellPrice - bestOpportunity.buyPrice) -
          (buyTrade.fee + sellTrade.fee);

        executionResult = {
          executed: true,
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          buyTradeId: buyTrade.id,
          sellTradeId: sellTrade.id,
          actualProfit,
          executionTime: Date.now() - startTime,
        };

        logger.info("Arbitrage executed successfully", { executionResult });

        // Create notification
        await api.notification.create({
          user: { _link: userId },
          type: "trade",
          title: "Arbitrage Trade Executed",
          message: `Successfully executed arbitrage trade for ${tokenPair}. Profit: $${actualProfit.toFixed(2)}`,
          severity: "success",
        });
      } catch (error) {
        logger.error("Error executing arbitrage", { error });

        // Create alert for failed execution
        await api.alert.create({
          user: { _link: userId },
          type: "system-error",
          severity: "warning",
          title: "Arbitrage Execution Failed",
          message: `Failed to execute arbitrage for ${tokenPair}: ${error}`,
          triggeredAt: new Date(),
        });

        throw error;
      }
    }

    // Step 9: Return detailed results
    return {
      success: true,
      opportunity: bestOpportunity,
      tradeParameters: {
        tokenPair,
        maxTradeAmount,
        estimatedQuantity,
        estimatedProfit,
      },
      execution: executionResult,
      dryRun,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Arbitrage strategy failed", { error });
    throw error;
  }
};

export const params = {
  userId: {
    type: "string",
  },
  tokenPair: {
    type: "string",
  },
  exchanges: {
    type: "array",
    items: { type: "string" },
  },
  minProfitPercent: {
    type: "number",
  },
  maxInvestment: {
    type: "number",
  },
  dryRun: {
    type: "boolean",
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
