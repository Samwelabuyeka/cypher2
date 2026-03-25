import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const minSpreadPercent = params.minSpreadPercent ?? 1;
  const maxPositionSize = params.maxPositionSize ?? 10000;
  const symbols = params.symbols ?? ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'];
  const userId = params.userId;

  if (!userId) {
    throw new Error("userId parameter is required");
  }

  logger.info({ minSpreadPercent, maxPositionSize, symbols, userId }, "Starting real arbitrage execution");

  const report = {
    opportunitiesDetected: 0,
    arbitragesExecuted: 0,
    totalProfit: 0,
    averageSpread: 0,
    executionSuccessRate: 0,
    details: [] as any[],
  };

  try {
    const tradingAccounts = await api.tradingAccount.findMany({
      filter: {
        userId: { equals: userId },
        isActive: { equals: true },
      },
      select: {
        id: true,
        accountName: true,
        exchange: {
          id: true,
          name: true,
          code: true,
        },
        balance: true,
      },
    });

    if (tradingAccounts.length < 2) {
      logger.warn("Need at least 2 active trading accounts for arbitrage");
      return report;
    }

    for (const symbol of symbols) {
      logger.info({ symbol }, "Analyzing arbitrage opportunities for symbol");

      const exchangePrices: Array<{
        exchangeId: string;
        exchangeName: string;
        accountId: string;
        buyPrice: number;
        sellPrice: number;
        volume: number;
      }> = [];

      for (const account of tradingAccounts) {
        try {
          const marketData = await api.marketData.findFirst({
            filter: {
              symbol: { equals: symbol },
              exchangeId: { equals: account.exchange.id },
            },
            sort: { timestamp: "Descending" },
            select: {
              bidPrice: true,
              askPrice: true,
              volume: true,
            },
          });

          if (marketData && marketData.bidPrice && marketData.askPrice) {
            exchangePrices.push({
              exchangeId: account.exchange.id,
              exchangeName: account.exchange.name,
              accountId: account.id,
              buyPrice: marketData.askPrice,
              sellPrice: marketData.bidPrice,
              volume: marketData.volume ?? 0,
            });
          }
        } catch (error) {
          logger.error({ error, accountId: account.id, symbol }, "Failed to fetch market data");
        }
      }

      if (exchangePrices.length < 2) {
        logger.info({ symbol }, "Insufficient price data for arbitrage");
        continue;
      }

      for (let i = 0; i < exchangePrices.length; i++) {
        for (let j = i + 1; j < exchangePrices.length; j++) {
          const buyExchange = exchangePrices[i];
          const sellExchange = exchangePrices[j];

          const spreadPercent1 = ((sellExchange.sellPrice - buyExchange.buyPrice) / buyExchange.buyPrice) * 100;
          const spreadPercent2 = ((buyExchange.sellPrice - sellExchange.buyPrice) / sellExchange.buyPrice) * 100;

          let opportunity = null;
          if (spreadPercent1 >= minSpreadPercent) {
            opportunity = {
              buyExchange,
              sellExchange,
              spreadPercent: spreadPercent1,
            };
          } else if (spreadPercent2 >= minSpreadPercent) {
            opportunity = {
              buyExchange: sellExchange,
              sellExchange: buyExchange,
              spreadPercent: spreadPercent2,
            };
          }

          if (opportunity) {
            report.opportunitiesDetected++;
            logger.info({
              symbol,
              buyExchange: opportunity.buyExchange.exchangeName,
              sellExchange: opportunity.sellExchange.exchangeName,
              spread: opportunity.spreadPercent,
            }, "Arbitrage opportunity detected");

            try {
              const tradeSize = Math.min(
                maxPositionSize / opportunity.buyExchange.buyPrice,
                opportunity.buyExchange.volume * 0.01,
                opportunity.sellExchange.volume * 0.01
              );

              const buyValue = tradeSize * opportunity.buyExchange.buyPrice;
              const sellValue = tradeSize * opportunity.sellExchange.sellPrice;
              const estimatedProfit = sellValue - buyValue;
              const estimatedFee = (buyValue + sellValue) * 0.001;
              const netProfit = estimatedProfit - estimatedFee;

              if (netProfit > 0) {
                const buyOrder = await api.order.create({
                  symbol,
                  side: "buy",
                  type: "limit",
                  quantity: tradeSize,
                  price: opportunity.buyExchange.buyPrice,
                  status: "open",
                  tradingAccount: { _link: opportunity.buyExchange.accountId },
                  user: { _link: userId },
                  timeInForce: "ioc",
                });

                const sellOrder = await api.order.create({
                  symbol,
                  side: "sell",
                  type: "limit",
                  quantity: tradeSize,
                  price: opportunity.sellExchange.sellPrice,
                  status: "open",
                  tradingAccount: { _link: opportunity.sellExchange.accountId },
                  user: { _link: userId },
                  timeInForce: "ioc",
                });

                const buyTrade = await api.trade.create({
                  symbol,
                  side: "buy",
                  quantity: tradeSize,
                  price: opportunity.buyExchange.buyPrice,
                  value: buyValue,
                  fee: buyValue * 0.001,
                  executedAt: new Date().toISOString(),
                  tradingAccount: { _link: opportunity.buyExchange.accountId },
                  order: { _link: buyOrder.id },
                  user: { _link: userId },
                  metadata: {
                    arbitrageId: `arb-${Date.now()}`,
                    type: "arbitrage-buy",
                  },
                });

                const sellTrade = await api.trade.create({
                  symbol,
                  side: "sell",
                  quantity: tradeSize,
                  price: opportunity.sellExchange.sellPrice,
                  value: sellValue,
                  fee: sellValue * 0.001,
                  executedAt: new Date().toISOString(),
                  tradingAccount: { _link: opportunity.sellExchange.accountId },
                  order: { _link: sellOrder.id },
                  user: { _link: userId },
                  metadata: {
                    arbitrageId: `arb-${Date.now()}`,
                    type: "arbitrage-sell",
                  },
                });

                report.arbitragesExecuted++;
                report.totalProfit += netProfit;
                report.details.push({
                  symbol,
                  buyExchange: opportunity.buyExchange.exchangeName,
                  sellExchange: opportunity.sellExchange.exchangeName,
                  spread: opportunity.spreadPercent,
                  profit: netProfit,
                  buyTradeId: buyTrade.id,
                  sellTradeId: sellTrade.id,
                });

                await api.notification.create({
                  user: { _link: userId },
                  type: "trade",
                  severity: "success",
                  title: "Arbitrage Executed",
                  message: `Successfully executed arbitrage on ${symbol}: ${opportunity.spreadPercent.toFixed(2)}% spread, $${netProfit.toFixed(2)} profit`,
                  metadata: {
                    symbol,
                    spread: opportunity.spreadPercent,
                    profit: netProfit,
                  },
                });

                logger.info({
                  symbol,
                  spread: opportunity.spreadPercent,
                  profit: netProfit,
                }, "Arbitrage executed successfully");
              } else {
                logger.info({
                  symbol,
                  netProfit,
                }, "Opportunity not profitable after fees");
              }
            } catch (error) {
              logger.error({ error, symbol }, "Failed to execute arbitrage");
            }
          }
        }
      }
    }

    if (report.arbitragesExecuted > 0) {
      report.averageSpread = report.details.reduce((sum, d) => sum + d.spread, 0) / report.arbitragesExecuted;
      report.executionSuccessRate = (report.arbitragesExecuted / report.opportunitiesDetected) * 100;
    }

    logger.info(report, "Arbitrage execution completed");
    return report;
  } catch (error) {
    logger.error({ error }, "Error in arbitrage execution");
    throw error;
  }
};

export const params = {
  userId: { type: "string" },
  minSpreadPercent: { type: "number" },
  maxPositionSize: { type: "number" },
  symbols: {
    type: "array",
    items: { type: "string" },
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};
