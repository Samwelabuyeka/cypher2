import { ActionOptions } from "gadget-server";

export const params = {
  accountId: { type: "string" },
  symbol: { type: "string" },
  side: { type: "string", enum: ["buy", "sell"] },
  amount: { type: "number" },
  price: { type: "number" },
  stopPrice: { type: "number" },
  orderType: { type: "string", enum: ["market", "limit", "stop-loss", "take-profit"] }
};

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  if (!params.accountId) {
    throw new Error("Account ID required");
  }
  if (!params.symbol) {
    throw new Error("Symbol required");
  }
  if (!params.side) {
    throw new Error("Side required (buy or sell)");
  }
  if (!params.amount) {
    throw new Error("Amount required");
  }

  const { accountId, symbol, side, amount, price, stopPrice, orderType = "market" } = params;

  logger.info({ accountId, symbol, side, amount, price, orderType }, "Starting trade execution");

  try {
    // 1. Validate and parse trading pair
    if (!symbol.includes('/')) {
      throw new Error('Invalid symbol format. Expected format: BASE/QUOTE (e.g., BTC/USDT, CYP/ETH)');
    }

    const [baseCurrency, quoteCurrency] = symbol.split('/');
    logger.info({ baseCurrency, quoteCurrency }, "Parsed trading pair");

    // 2. Verify account exists and is active
    const account = await api.tradingAccount.findOne(accountId, {
      select: {
        id: true,
        isActive: true,
        userId: true,
        balance: true,
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    if (!account.isActive) {
      throw new Error(`Trading account ${accountId} is not active`);
    }

    // 3. Get or create wallets for both currencies
    let baseWallet = await api.wallet.maybeFindFirst({
      filter: {
        userId: { equals: account.userId },
        currency: { equals: baseCurrency },
        isActive: { equals: true },
      },
      select: {
        id: true,
        currency: true,
        balance: true,
        availableBalance: true,
        lockedBalance: true,
        address: true,
      },
    });

    if (!baseWallet) {
      logger.info({ currency: baseCurrency }, "Creating new wallet");
      baseWallet = await api.wallet.create({
        user: { _link: account.userId },
        currency: baseCurrency,
        balance: 0,
        availableBalance: 0,
        lockedBalance: 0,
        isActive: true,
      });
    }

    let quoteWallet = await api.wallet.maybeFindFirst({
      filter: {
        userId: { equals: account.userId },
        currency: { equals: quoteCurrency },
        isActive: { equals: true },
      },
      select: {
        id: true,
        currency: true,
        balance: true,
        availableBalance: true,
        lockedBalance: true,
        address: true,
      },
    });

    if (!quoteWallet) {
      logger.info({ currency: quoteCurrency }, "Creating new wallet");
      quoteWallet = await api.wallet.create({
        user: { _link: account.userId },
        currency: quoteCurrency,
        balance: 0,
        availableBalance: 0,
        lockedBalance: 0,
        isActive: true,
      });
    }

    // 4. Get current market price for the symbol
    let currentPrice: number;
    let executionPrice: number;

    if (orderType === "market") {
      // Try to get market data from API first
      try {
        const marketDataResult = await api.getMarketData({ symbol, timeframe: "1h", limit: 1 });
        if (marketDataResult && marketDataResult.result && typeof marketDataResult.result === 'object' && 'price' in marketDataResult.result) {
          currentPrice = (marketDataResult.result as any).price;
        } else {
          // Fallback to database market data
          const marketData = await api.marketData.maybeFindFirst({
            filter: {
              symbol: { equals: symbol },
            },
            sort: {
              timestamp: "Descending",
            },
            select: {
              close: true,
              timestamp: true,
            },
          });

          if (!marketData) {
            throw new Error(`Unable to determine current price for ${symbol}`);
          }

          currentPrice = marketData.close;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ error: errorMessage }, "Failed to get market data, using fallback");
        const marketData = await api.marketData.maybeFindFirst({
          filter: {
            symbol: { equals: symbol },
          },
          sort: {
            timestamp: "Descending",
          },
          select: {
            close: true,
            timestamp: true,
          },
        });

        if (!marketData) {
          throw new Error(`Unable to determine current price for ${symbol}`);
        }

        currentPrice = marketData.close;
      }

      // Apply 0.1% slippage tolerance for market orders
      executionPrice = side === "buy" ? currentPrice * 1.001 : currentPrice * 0.999;
      logger.info({ currentPrice, executionPrice }, "Using market price with slippage");
    } else if (orderType === "limit") {
      if (!price || price <= 0) {
        throw new Error("Valid price required for limit orders");
      }
      executionPrice = price;
      
      // For limit orders, we don't execute immediately - create pending order
      const limitOrder = await api.order.create({
        user: { _link: account.userId },
        tradingAccount: { _link: accountId },
        symbol,
        type: orderType,
        side,
        quantity: amount,
        price: executionPrice,
        status: "open",
        timeInForce: "gtc",
        placedAt: new Date(),
      });

      logger.info({ orderId: limitOrder.id, price: executionPrice }, "Limit order created");
      
      return {
        success: true,
        orderId: limitOrder.id,
        status: "pending",
        orderType,
        side,
        symbol,
        amount,
        limitPrice: executionPrice,
        timestamp: new Date().toISOString(),
      };
    } else if (orderType === "stop-loss" || orderType === "take-profit") {
      if (!stopPrice || stopPrice <= 0) {
        throw new Error(`Valid stopPrice required for ${orderType} orders`);
      }

      const stopOrder = await api.order.create({
        user: { _link: account.userId },
        tradingAccount: { _link: accountId },
        symbol,
        type: orderType,
        side,
        quantity: amount,
        stopPrice,
        status: "open",
        timeInForce: "gtc",
        placedAt: new Date(),
      });

      logger.info({ orderId: stopOrder.id, stopPrice }, `${orderType} order created`);
      
      return {
        success: true,
        orderId: stopOrder.id,
        status: "pending",
        orderType,
        side,
        symbol,
        amount,
        stopPrice,
        timestamp: new Date().toISOString(),
      };
    } else {
      throw new Error(`Unsupported order type: ${orderType}`);
    }

    // 5. Calculate fees based on pair type
    let tradingFeeRate: number;
    const isCypPair = baseCurrency === "CYP" || quoteCurrency === "CYP";
    const majorPairs = ["BTC/USDT", "ETH/USDT", "BTC/USD", "ETH/USD", "BNB/USDT"];
    const isMajorPair = majorPairs.includes(symbol);

    if (isCypPair) {
      tradingFeeRate = 0.0005; // 0.05% for CYP pairs
    } else if (isMajorPair) {
      tradingFeeRate = 0.001; // 0.1% for major pairs
    } else {
      tradingFeeRate = 0.002; // 0.2% for exotic pairs
    }

    const tradeValue = amount * executionPrice;
    const tradingFee = tradeValue * tradingFeeRate;
    const networkFee = isCypPair ? 0.5 : 0; // Network fee only for CYP trades
    const totalFees = tradingFee + networkFee;

    logger.info({ tradingFeeRate, tradingFee, networkFee, totalFees }, "Calculated fees");

    // 6. Execute trade based on side
    let totalCost: number;
    let totalProceeds: number;
    let newBaseBalance: number;
    let newQuoteBalance: number;
    const baseBalanceBefore = baseWallet.balance;
    const quoteBalanceBefore = quoteWallet.balance;

    if (side === "buy") {
      // BUY: User pays quote currency, receives base currency
      totalCost = tradeValue + tradingFee;

      // Check sufficient quote balance
      if (quoteWallet.availableBalance < totalCost) {
        throw new Error(
          `Insufficient ${quoteCurrency} balance. Required: ${totalCost.toFixed(8)}, Available: ${quoteWallet.availableBalance.toFixed(8)}`
        );
      }

      // Calculate new balances
      newQuoteBalance = quoteWallet.balance - totalCost;
      newBaseBalance = baseWallet.balance + amount;

      logger.info({ totalCost, newQuoteBalance, newBaseBalance }, "Executing BUY order");

      // Update wallets
      await api.wallet.update(quoteWallet.id, {
        balance: newQuoteBalance,
        availableBalance: newQuoteBalance,
        lastTransactionAt: new Date(),
      });

      await api.wallet.update(baseWallet.id, {
        balance: newBaseBalance,
        availableBalance: newBaseBalance,
        lastTransactionAt: new Date(),
      });

      // Create wallet transactions
      await api.walletTransaction.create({
        wallet: { _link: quoteWallet.id },
        user: { _link: account.userId },
        type: "trade",
        amount: -totalCost,
        currency: quoteCurrency,
        status: "completed",
        description: `Buy ${amount} ${baseCurrency} at ${executionPrice} ${quoteCurrency}/${baseCurrency}`,
        fee: tradingFee,
        completedAt: new Date(),
        initiatedAt: new Date(),
      });

      await api.walletTransaction.create({
        wallet: { _link: baseWallet.id },
        user: { _link: account.userId },
        type: "trade",
        amount: amount,
        currency: baseCurrency,
        status: "completed",
        description: `Receive ${amount} ${baseCurrency} from buy order`,
        fee: 0,
        completedAt: new Date(),
        initiatedAt: new Date(),
      });
    } else if (side === "sell") {
      // SELL: User pays base currency, receives quote currency
      totalProceeds = tradeValue - tradingFee;

      // Check sufficient base balance
      if (baseWallet.availableBalance < amount) {
        throw new Error(
          `Insufficient ${baseCurrency} balance. Required: ${amount.toFixed(8)}, Available: ${baseWallet.availableBalance.toFixed(8)}`
        );
      }

      // Calculate new balances
      newBaseBalance = baseWallet.balance - amount;
      newQuoteBalance = quoteWallet.balance + totalProceeds;

      logger.info({ totalProceeds, newQuoteBalance, newBaseBalance }, "Executing SELL order");

      // Update wallets
      await api.wallet.update(baseWallet.id, {
        balance: newBaseBalance,
        availableBalance: newBaseBalance,
        lastTransactionAt: new Date(),
      });

      await api.wallet.update(quoteWallet.id, {
        balance: newQuoteBalance,
        availableBalance: newQuoteBalance,
        lastTransactionAt: new Date(),
      });

      // Create wallet transactions
      await api.walletTransaction.create({
        wallet: { _link: baseWallet.id },
        user: { _link: account.userId },
        type: "trade",
        amount: -amount,
        currency: baseCurrency,
        status: "completed",
        description: `Sell ${amount} ${baseCurrency} at ${executionPrice} ${quoteCurrency}/${baseCurrency}`,
        fee: 0,
        completedAt: new Date(),
        initiatedAt: new Date(),
      });

      await api.walletTransaction.create({
        wallet: { _link: quoteWallet.id },
        user: { _link: account.userId },
        type: "trade",
        amount: totalProceeds,
        currency: quoteCurrency,
        status: "completed",
        description: `Receive ${totalProceeds.toFixed(8)} ${quoteCurrency} from sell order`,
        fee: tradingFee,
        completedAt: new Date(),
        initiatedAt: new Date(),
      });
    } else {
      throw new Error(`Invalid side: ${side}. Must be 'buy' or 'sell'`);
    }

    // 7. Create order record
    const order = await api.order.create({
      user: { _link: account.userId },
      tradingAccount: { _link: accountId },
      symbol,
      type: orderType,
      side,
      quantity: amount,
      price: executionPrice,
      filledQuantity: amount,
      averageFillPrice: executionPrice,
      fees: totalFees,
      feeCurrency: quoteCurrency,
      status: "filled",
      timeInForce: "gtc",
      placedAt: new Date(),
      filledAt: new Date(),
    });

    // 8. Create trade record
    const trade = await api.trade.create({
      user: { _link: account.userId },
      tradingAccount: { _link: accountId },
      order: { _link: order.id },
      symbol,
      side,
      quantity: amount,
      price: executionPrice,
      value: tradeValue,
      fee: totalFees,
      feeCurrency: quoteCurrency,
      executedAt: new Date(),
    });

    // 9. Create blockchain transaction record (only for CYP trades)
    let cypherTxId: string | undefined;
    if (isCypPair) {
      const txHash = `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`;
      const cypherTx = await api.cypherTransaction.create({
        user: { _link: account.userId },
        hash: txHash,
        fromAddress: side === "sell" && baseCurrency === "CYP" ? baseWallet.address || "user" : "exchange",
        toAddress: side === "buy" && baseCurrency === "CYP" ? baseWallet.address || "user" : "exchange",
        amount: baseCurrency === "CYP" ? amount : tradeValue,
        fee: networkFee,
        transactionType: "transfer",
        status: "confirmed",
        confirmations: 1,
        metadata: {
          tradeId: trade.id,
          orderId: order.id,
          symbol,
          side,
          executionPrice,
        },
      });
      cypherTxId = cypherTx.id;
      logger.info({ txHash, cypherTxId }, "Created CYP blockchain transaction");
    }

    // 10. Update or create position
    let existingPosition = await api.position.maybeFindFirst({
      filter: {
        userId: { equals: account.userId },
        symbol: { equals: symbol },
        tradingAccountId: { equals: accountId },
      },
      select: {
        id: true,
        quantity: true,
        averageEntryPrice: true,
        side: true,
      },
    });

    let positionId: string = "";
    let positionQuantity: number;
    let averageEntryPrice: number;
    let realizedPnL = 0;

    if (existingPosition) {
      // Update existing position
      const positionSide = side === "buy" ? "long" : "short";
      if (existingPosition.side.toString() === positionSide) {
        // Adding to position
        const totalQuantity = existingPosition.quantity + amount;
        const existingAvgPrice = existingPosition.averageEntryPrice ?? executionPrice;
        averageEntryPrice = ((existingAvgPrice * existingPosition.quantity) + (executionPrice * amount)) / totalQuantity;
        positionQuantity = totalQuantity;
      } else {
        // Reducing or closing position
        if (amount >= existingPosition.quantity) {
          // Closing and possibly reversing
          const existingAvgPrice = existingPosition.averageEntryPrice ?? executionPrice;
          realizedPnL = (executionPrice - existingAvgPrice) * existingPosition.quantity * (existingPosition.side === "long" ? 1 : -1);
          positionQuantity = amount - existingPosition.quantity;
          averageEntryPrice = executionPrice;
          
          if (positionQuantity === 0) {
            // Close position
            await api.position.delete(existingPosition.id);
            positionId = existingPosition.id;
          } else {
            // Reverse position
            await api.position.update(existingPosition.id, {
              quantity: positionQuantity,
              averageEntryPrice,
              side,
              currentPrice: executionPrice,
              lastUpdatedAt: new Date(),
            });
            positionId = existingPosition.id;
          }
        } else {
          // Reducing position
          const existingAvgPrice = existingPosition.averageEntryPrice ?? executionPrice;
          realizedPnL = (executionPrice - existingAvgPrice) * amount * (existingPosition.side === "long" ? 1 : -1);
          positionQuantity = existingPosition.quantity - amount;
          averageEntryPrice = existingAvgPrice;

          await api.position.update(existingPosition.id, {
            quantity: positionQuantity,
            currentPrice: executionPrice,
            lastUpdatedAt: new Date(),
          });
          positionId = existingPosition.id;
        }
      }
    } else {
      // Create new position
      const newPosition = await api.position.create({
        user: { _link: account.userId },
        tradingAccount: { _link: accountId },
        symbol,
        asset: baseCurrency,
        side: side === "buy" ? "long" : "short",
        quantity: amount,
        averageEntryPrice: executionPrice,
        currentPrice: executionPrice,
        lastUpdatedAt: new Date(),
      });
      positionId = newPosition.id;
      positionQuantity = amount;
      averageEntryPrice = executionPrice;
    }

    logger.info(
      {
        orderId: order.id,
        tradeId: trade.id,
        positionId,
        realizedPnL,
        cypherTxId,
      },
      "Trade executed successfully"
    );

    return {
      success: true,
      orderId: order.id,
      tradeId: trade.id,
      positionId,
      side,
      symbol,
      amount,
      executionPrice,
      totalFees,
      tradingFeeRate,
      networkFee,
      baseBalanceBefore,
      quoteBalanceBefore,
      baseBalanceAfter: side === "buy" ? newBaseBalance! : newBaseBalance!,
      quoteBalanceAfter: side === "buy" ? newQuoteBalance! : newQuoteBalance!,
      realizedPnL,
      cypherTxId,
      positionQuantity: positionQuantity!,
      positionAverageEntryPrice: averageEntryPrice!,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage, accountId, symbol, side, amount }, "Trade execution failed");
    throw error;
  }
};

export const options: ActionOptions = {
  timeoutMS: 30000,
};