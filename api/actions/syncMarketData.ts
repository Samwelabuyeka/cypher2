import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const symbols = [
    { crypto: "bitcoin", symbol: "BTC/USD", id: "bitcoin" },
    { crypto: "ethereum", symbol: "ETH/USD", id: "ethereum" },
    { crypto: "binancecoin", symbol: "BNB/USD", id: "binancecoin" },
    { crypto: "cardano", symbol: "ADA/USD", id: "cardano" },
    { crypto: "solana", symbol: "SOL/USD", id: "solana" }
  ];

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
    processed: 0
  };

  let exchange = await api.exchange.findFirst({
    filter: { code: { equals: "coingecko" } }
  });

  if (!exchange) {
    exchange = await api.exchange.create({
      code: "coingecko",
      name: "CoinGecko",
      apiEndpoint: "https://api.coingecko.com/api/v3",
      isActive: true
    });
    logger.info({ exchangeId: exchange.id }, "Created CoinGecko exchange record");
  }

  for (const { crypto, symbol, id } of symbols) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const coinData = data[id];

      if (!coinData) {
        throw new Error(`No data returned for ${symbol}`);
      }

      const price = coinData.usd;
      const volume24h = coinData.usd_24h_vol || 0;
      const marketCap = coinData.usd_market_cap || 0;
      const change24h = coinData.usd_24h_change || 0;

      const timestamp = new Date();

      const spread = volume24h > 0 ? price * 0.001 : 0;

      await api.marketData.create({
        symbol,
        exchange: { _link: exchange.id },
        timestamp,
        interval: "1m",
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume24h,
        volumeUsd: volume24h,
        marketCap,
        bidPrice: price - spread / 2,
        askPrice: price + spread / 2,
        spread,
        metadata: {
          change24h,
          source: "coingecko",
          fetchedAt: timestamp.toISOString()
        }
      });

      results.success++;
      results.processed++;
      
      logger.info(
        { symbol, price, volume24h, marketCap },
        `Successfully synced market data for ${symbol}`
      );
    } catch (error) {
      results.failed++;
      results.processed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`${symbol}: ${errorMessage}`);
      
      logger.error(
        { symbol, error: errorMessage },
        `Failed to sync market data for ${symbol}`
      );
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldRecords = await api.marketData.findMany({
      filter: {
        timestamp: {
          lessThan: thirtyDaysAgo
        }
      },
      first: 250
    });

    if (oldRecords.length > 0) {
      await api.marketData.bulkDelete(oldRecords.map(r => r.id));
      logger.info(
        { count: oldRecords.length },
        `Cleaned up ${oldRecords.length} old market data records`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Failed to clean up old data");
  }

  const summary = {
    totalProcessed: results.processed,
    successful: results.success,
    failed: results.failed,
    errors: results.errors,
    timestamp: new Date().toISOString()
  };

  logger.info(summary, "Market data sync completed");

  return summary;
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: "* * * * *"
      }
    ]
  }
};
