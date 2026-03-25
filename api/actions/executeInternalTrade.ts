import { preventCrossUserDataAccess } from "gadget-server/auth";
import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user");
  if (!userId) {
    throw new Error("User must be authenticated to execute trades");
  }

  logger.info({ params, userId }, "Executing internal trade");

  // Validate inputs
  if (!params.symbol) {
    throw new Error("Symbol is required");
  }

  if (!params.quantity || params.quantity <= 0) {
    throw new Error("Quantity must be positive");
  }

  if (!params.orderType) {
    throw new Error("Order type is required");
  }

  if (!params.side) {
    throw new Error("Side is required");
  }

  if (params.orderType === "limit" && (!params.price || params.price <= 0)) {
    throw new Error("Limit orders must have a positive price");
  }

  if (params.orderType === "market" && params.price) {
    throw new Error("Market orders should not specify a price");
  }

  // Determine currencies based on trading pair (assuming symbol format like "CYP/USD")
  const [baseCurrency, quoteCurrency] = params.symbol.split("/");
  if (!baseCurrency || !quoteCurrency) {
    throw new Error("Invalid symbol format. Expected format: BASE/QUOTE (e.g., CYP/USD)");
  }

  // Get user's wallets
  const wallets = await api.wallet.findMany({
    filter: {
      userId: { equals: userId },
      currency: { in: [baseCurrency, quoteCurrency] }
    },
    select: {
      id: true,
      currency: true,
      balance: true,
      availableBalance: true,
      lockedBalance: true
    }
  });

  const baseWallet = wallets.find(w => w.currency === baseCurrency);
  const quoteWallet = wallets.find(w => w.currency === quoteCurrency);

  if (!baseWallet || !quoteWallet) {
    throw new Error(`User must have both ${baseCurrency} and ${quoteCurrency} wallets`);
  }

  // Check sufficient balance
  if (params.side === "sell") {
    if (baseWallet.availableBalance < params.quantity) {
      throw new Error(`Insufficient ${baseCurrency} balance`);
    }
  } else {
    const requiredQuote = params.orderType === "limit" && params.price
      ? params.quantity * params.price 
      : params.quantity * 999999; // For market buy, we'll validate during matching
    
    if (params.orderType === "limit" && params.price && quoteWallet.availableBalance < requiredQuote) {
      throw new Error(`Insufficient ${quoteCurrency} balance`);
    }
  }

  let totalFilledQuantity = 0;
  let totalFilledValue = 0;
  const trades: any[] = [];
  let orderStatus = "pending";

  // Create the main order record
  const createdOrder = await api.order.create({
    symbol: params.symbol,
    side: params.side,
    type: params.orderType,
    quantity: params.quantity,
    price: params.price,
    status: "pending",
    filledQuantity: 0,
    user: { _link: userId }
  });

  try {
    if (params.orderType === "market") {
      // Market order: match against best available prices
      const oppositeSide = params.side === "buy" ? "sell" : "buy";
      const sortDirection = params.side === "buy" ? "Ascending" : "Descending";

      const matchingOrders = await api.internalOrderBook.findMany({
        filter: {
          symbol: { equals: params.symbol },
          side: { equals: oppositeSide },
          status: { equals: "open" },
          remainingQuantity: { greaterThan: 0 }
        },
        sort: { price: sortDirection },
        first: 50,
        select: {
          id: true,
          price: true,
          quantity: true,
          remainingQuantity: true,
          userId: true,
          side: true
        }
      });

      let remainingQuantity = params.quantity;

      for (const matchOrder of matchingOrders) {
        if (remainingQuantity <= 0) break;

        const fillQuantity = Math.min(remainingQuantity, matchOrder.remainingQuantity);
        const fillPrice = matchOrder.price;
        const fillValue = fillQuantity * fillPrice;

        // Check balance for market buy orders
        if (params.side === "buy" && quoteWallet.availableBalance < fillValue) {
          logger.warn({ fillValue, available: quoteWallet.availableBalance }, "Insufficient balance for market buy");
          break;
        }

        // Update wallets
        if (params.side === "buy") {
          // Buyer: deduct quote currency, add base currency
          await api.wallet.update(quoteWallet.id, {
            balance: quoteWallet.balance - fillValue,
            availableBalance: quoteWallet.availableBalance - fillValue
          });
          await api.wallet.update(baseWallet.id, {
            balance: baseWallet.balance + fillQuantity,
            availableBalance: baseWallet.availableBalance + fillQuantity
          });

          // Seller: deduct base currency, add quote currency
          const sellerWallets = await api.wallet.findMany({
            filter: {
              userId: { equals: matchOrder.userId },
              currency: { in: [baseCurrency, quoteCurrency] }
            },
            select: { id: true, currency: true, balance: true, availableBalance: true }
          });

          const sellerBaseWallet = sellerWallets.find(w => w.currency === baseCurrency);
          const sellerQuoteWallet = sellerWallets.find(w => w.currency === quoteCurrency);

          if (sellerBaseWallet && sellerQuoteWallet) {
            await api.wallet.update(sellerBaseWallet.id, {
              balance: sellerBaseWallet.balance - fillQuantity,
              availableBalance: sellerBaseWallet.availableBalance - fillQuantity
            });
            await api.wallet.update(sellerQuoteWallet.id, {
              balance: sellerQuoteWallet.balance + fillValue,
              availableBalance: sellerQuoteWallet.availableBalance + fillValue
            });
          }
        } else {
          // Seller: deduct base currency, add quote currency
          await api.wallet.update(baseWallet.id, {
            balance: baseWallet.balance - fillQuantity,
            availableBalance: baseWallet.availableBalance - fillQuantity
          });
          await api.wallet.update(quoteWallet.id, {
            balance: quoteWallet.balance + fillValue,
            availableBalance: quoteWallet.availableBalance + fillValue
          });

          // Buyer: deduct quote currency, add base currency
          const buyerWallets = await api.wallet.findMany({
            filter: {
              userId: { equals: matchOrder.userId },
              currency: { in: [baseCurrency, quoteCurrency] }
            },
            select: { id: true, currency: true, balance: true, availableBalance: true }
          });

          const buyerBaseWallet = buyerWallets.find(w => w.currency === baseCurrency);
          const buyerQuoteWallet = buyerWallets.find(w => w.currency === quoteCurrency);

          if (buyerBaseWallet && buyerQuoteWallet) {
            await api.wallet.update(buyerQuoteWallet.id, {
              balance: buyerQuoteWallet.balance - fillValue,
              availableBalance: buyerQuoteWallet.availableBalance - fillValue
            });
            await api.wallet.update(buyerBaseWallet.id, {
              balance: buyerBaseWallet.balance + fillQuantity,
              availableBalance: buyerBaseWallet.availableBalance + fillQuantity
            });
          }
        }

        // Create trade records
        // Note: tradingAccount is required but not available for internal trades
        // This will need to be addressed by either making it optional or providing a default account
        const trade = await api.trade.create({
          symbol: params.symbol,
          side: params.side,
          price: fillPrice,
          quantity: fillQuantity,
          value: fillValue,
          fee: 0,
          executedAt: new Date(),
          user: { _link: userId },
          order: { _link: createdOrder.id },
          tradingAccount: { _link: "internal-trading-account" } // Placeholder - needs proper implementation
        });

        trades.push(trade);

        // Update matching order
        const newRemainingQuantity = matchOrder.remainingQuantity - fillQuantity;
        const newStatus = newRemainingQuantity === 0 ? "filled" : "partially-filled";

        await api.internalOrderBook.update(matchOrder.id, {
          remainingQuantity: newRemainingQuantity,
          status: newStatus
        });

        remainingQuantity -= fillQuantity;
        totalFilledQuantity += fillQuantity;
        totalFilledValue += fillValue;

        // Update wallet references for next iteration
        if (params.side === "buy") {
          quoteWallet.balance -= fillValue;
          quoteWallet.availableBalance -= fillValue;
          baseWallet.balance += fillQuantity;
          baseWallet.availableBalance += fillQuantity;
        } else {
          baseWallet.balance -= fillQuantity;
          baseWallet.availableBalance -= fillQuantity;
          quoteWallet.balance += fillValue;
          quoteWallet.availableBalance += fillValue;
        }
      }

      orderStatus = totalFilledQuantity === params.quantity ? "filled" : 
                   totalFilledQuantity > 0 ? "partially-filled" : "cancelled";

    } else {
      // Limit order: create order book entry and try to match
      if (!params.price) {
        throw new Error("Price is required for limit orders");
      }

      const bookOrder = await api.internalOrderBook.create({
        symbol: params.symbol,
        side: params.side,
        orderType: params.orderType,
        price: params.price,
        quantity: params.quantity,
        remainingQuantity: params.quantity,
        status: "open",
        user: { _link: userId }
      });

      // Try to match immediately
      const oppositeSide = params.side === "buy" ? "sell" : "buy";
      const priceFilter = params.side === "buy" 
        ? { lessThanOrEqual: params.price }
        : { greaterThanOrEqual: params.price };

      const matchingOrders = await api.internalOrderBook.findMany({
        filter: {
          symbol: { equals: params.symbol },
          side: { equals: oppositeSide },
          status: { in: ["open", "partially-filled"] },
          remainingQuantity: { greaterThan: 0 },
          price: priceFilter
        },
        sort: { price: params.side === "buy" ? "Ascending" : "Descending" },
        first: 50,
        select: {
          id: true,
          price: true,
          quantity: true,
          remainingQuantity: true,
          userId: true
        }
      });

      let remainingQuantity = params.quantity;

      for (const matchOrder of matchingOrders) {
        if (remainingQuantity <= 0) break;

        const fillQuantity = Math.min(remainingQuantity, matchOrder.remainingQuantity);
        const fillPrice = matchOrder.price;
        const fillValue = fillQuantity * fillPrice;

        // Update wallets
        if (params.side === "buy") {
          await api.wallet.update(quoteWallet.id, {
            balance: quoteWallet.balance - fillValue,
            availableBalance: quoteWallet.availableBalance - fillValue
          });
          await api.wallet.update(baseWallet.id, {
            balance: baseWallet.balance + fillQuantity,
            availableBalance: baseWallet.availableBalance + fillQuantity
          });

          const sellerWallets = await api.wallet.findMany({
            filter: {
              userId: { equals: matchOrder.userId },
              currency: { in: [baseCurrency, quoteCurrency] }
            },
            select: { id: true, currency: true, balance: true, availableBalance: true }
          });

          const sellerBaseWallet = sellerWallets.find(w => w.currency === baseCurrency);
          const sellerQuoteWallet = sellerWallets.find(w => w.currency === quoteCurrency);

          if (sellerBaseWallet && sellerQuoteWallet) {
            await api.wallet.update(sellerBaseWallet.id, {
              balance: sellerBaseWallet.balance - fillQuantity,
              availableBalance: sellerBaseWallet.availableBalance - fillQuantity
            });
            await api.wallet.update(sellerQuoteWallet.id, {
              balance: sellerQuoteWallet.balance + fillValue,
              availableBalance: sellerQuoteWallet.availableBalance + fillValue
            });
          }
        } else {
          await api.wallet.update(baseWallet.id, {
            balance: baseWallet.balance - fillQuantity,
            availableBalance: baseWallet.availableBalance - fillQuantity
          });
          await api.wallet.update(quoteWallet.id, {
            balance: quoteWallet.balance + fillValue,
            availableBalance: quoteWallet.availableBalance + fillValue
          });

          const buyerWallets = await api.wallet.findMany({
            filter: {
              userId: { equals: matchOrder.userId },
              currency: { in: [baseCurrency, quoteCurrency] }
            },
            select: { id: true, currency: true, balance: true, availableBalance: true }
          });

          const buyerBaseWallet = buyerWallets.find(w => w.currency === baseCurrency);
          const buyerQuoteWallet = buyerWallets.find(w => w.currency === quoteCurrency);

          if (buyerBaseWallet && buyerQuoteWallet) {
            await api.wallet.update(buyerQuoteWallet.id, {
              balance: buyerQuoteWallet.balance - fillValue,
              availableBalance: buyerQuoteWallet.availableBalance - fillValue
            });
            await api.wallet.update(buyerBaseWallet.id, {
              balance: buyerBaseWallet.balance + fillQuantity,
              availableBalance: buyerBaseWallet.availableBalance + fillQuantity
            });
          }
        }

        // Create trade records
        // Note: tradingAccount is required but not available for internal trades
        // This will need to be addressed by either making it optional or providing a default account
        const trade = await api.trade.create({
          symbol: params.symbol,
          side: params.side,
          price: fillPrice,
          quantity: fillQuantity,
          value: fillValue,
          fee: 0,
          executedAt: new Date(),
          user: { _link: userId },
          order: { _link: createdOrder.id },
          tradingAccount: { _link: "internal-trading-account" } // Placeholder - needs proper implementation
        });

        trades.push(trade);

        // Update matching order
        const newMatchRemainingQuantity = matchOrder.remainingQuantity - fillQuantity;
        const newMatchStatus = newMatchRemainingQuantity === 0 ? "filled" : "partially-filled";

        await api.internalOrderBook.update(matchOrder.id, {
          remainingQuantity: newMatchRemainingQuantity,
          status: newMatchStatus
        });

        remainingQuantity -= fillQuantity;
        totalFilledQuantity += fillQuantity;
        totalFilledValue += fillValue;
      }

      // Update our order book entry
      const newBookStatus = remainingQuantity === 0 ? "filled" : 
                          totalFilledQuantity > 0 ? "partially-filled" : "open";

      await api.internalOrderBook.update(bookOrder.id, {
        remainingQuantity,
        status: newBookStatus
      });

      orderStatus = newBookStatus === "filled" ? "filled" :
                   newBookStatus === "partially-filled" ? "partially-filled" : "open";
    }

    // Update main order record
    await api.order.update(createdOrder.id, {
      status: orderStatus,
      filledQuantity: totalFilledQuantity,
      averageFillPrice: totalFilledQuantity > 0 ? totalFilledValue / totalFilledQuantity : undefined
    });

    const averagePrice = totalFilledQuantity > 0 ? totalFilledValue / totalFilledQuantity : 0;

    logger.info({
      orderId: createdOrder.id,
      filledQuantity: totalFilledQuantity,
      averagePrice,
      status: orderStatus
    }, "Trade execution completed");

    return {
      success: true,
      order: {
        id: createdOrder.id,
        status: orderStatus,
        filledQuantity: totalFilledQuantity,
        averagePrice,
        totalValue: totalFilledValue
      },
      trades,
      message: totalFilledQuantity > 0 
        ? `Order ${orderStatus}. Filled ${totalFilledQuantity} @ avg price ${averagePrice.toFixed(8)}`
        : "Order placed but not filled"
    };

  } catch (error) {
    // Rollback: update order to failed status
    await api.order.update(createdOrder.id, {
      status: "rejected"
    });

    logger.error({ error, params }, "Trade execution failed");
    throw error;
  }
};

export const params = {
  symbol: { type: "string", required: true },
  side: { type: "string", required: true, validations: { in: ["buy", "sell"] } },
  orderType: { type: "string", required: true, validations: { in: ["limit", "market"] } },
  quantity: { type: "number", required: true },
  price: { type: "number", required: false }
};

export const options: ActionOptions = {
  triggers: {
    api: true
  }
};
