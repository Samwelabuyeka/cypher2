import { WebSocketManager } from "../lib/marketData/websocketManager";
import { ActionOptions } from "gadget-server";

// Module-level WebSocketManager instance to persist across invocations
let wsManager: WebSocketManager | null = null;

// Track data points collected
let dataPointsCollected = 0;

export const run: ActionRun = async ({ params, logger, api }) => {
  const exchanges = params.exchanges || ['binance', 'coinbase', 'kraken'];
  const symbols = params.symbols || ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'];
  
  logger.info({ exchanges, symbols }, "Starting real-time market data sync");

  try {
    // Create WebSocketManager instance if not exists
    if (!wsManager) {
      logger.info("Initializing WebSocketManager");
      wsManager = new WebSocketManager();
    }

    // Connect to each exchange and subscribe to channels
    for (const exchange of exchanges) {
      try {
        logger.info({ exchange }, "Connecting to exchange");
        
        // Connect to WebSocket if not already connected
        const isConnected = await wsManager.connect(exchange);
        
        if (isConnected) {
          // Subscribe to ticker, depth, and trade channels for all symbols
          for (const symbol of symbols) {
            await wsManager.subscribe(exchange, symbol, ['ticker', 'depth', 'trades']);
          }
          logger.info({ exchange, symbols }, "Subscribed to channels");
        }
      } catch (exchangeError) {
        logger.error({ exchange, error: exchangeError }, "Failed to connect to exchange");
        // Continue with other exchanges
        continue;
      }
    }

    // Set up event listeners for market data updates
    
    // Listen for price updates
    wsManager.on('priceUpdate', async (data) => {
      try {
        await api.marketData.create({
          symbol: data.symbol,
          exchange: { _link: data.exchangeId },
          close: data.price,
          volume: data.volume,
          bidPrice: data.bidPrice,
          askPrice: data.askPrice,
          timestamp: new Date(data.timestamp),
          interval: '1m',
          open: data.open || data.price,
          high: data.high || data.price,
          low: data.low || data.price,
          spread: data.askPrice && data.bidPrice ? data.askPrice - data.bidPrice : undefined,
        });
        dataPointsCollected++;
      } catch (error) {
        logger.error({ error, data }, "Failed to store price update");
      }
    });

    // Listen for order book updates
    wsManager.on('orderBookUpdate', async (data) => {
      try {
        logger.debug({ 
          symbol: data.symbol, 
          exchange: data.exchange,
          bids: data.bids?.length || 0,
          asks: data.asks?.length || 0
        }, "Order book update received");
        
        // Store aggregated order book data
        if (data.bids && data.asks && data.bids.length > 0 && data.asks.length > 0) {
          await api.marketData.create({
            symbol: data.symbol,
            exchange: { _link: data.exchangeId },
            bidPrice: data.bids[0].price,
            askPrice: data.asks[0].price,
            close: (data.bids[0].price + data.asks[0].price) / 2,
            timestamp: new Date(data.timestamp),
            interval: '1m',
            open: (data.bids[0].price + data.asks[0].price) / 2,
            high: data.asks[0].price,
            low: data.bids[0].price,
            spread: data.asks[0].price - data.bids[0].price,
            metadata: {
              orderBook: {
                bidDepth: data.bids.slice(0, 10),
                askDepth: data.asks.slice(0, 10),
              }
            }
          });
          dataPointsCollected++;
        }
      } catch (error) {
        logger.error({ error, data }, "Failed to process order book update");
      }
    });

    // Listen for trade updates
    wsManager.on('tradeUpdate', async (data) => {
      try {
        logger.debug({
          symbol: data.symbol,
          exchange: data.exchange,
          price: data.price,
          volume: data.volume,
          side: data.side,
        }, "Trade update received");

        // Store recent trade data
        await api.marketData.create({
          symbol: data.symbol,
          exchange: { _link: data.exchangeId },
          close: data.price,
          volume: data.volume,
          timestamp: new Date(data.timestamp),
          interval: '1m',
          open: data.price,
          high: data.price,
          low: data.price,
          metadata: {
            trade: {
              side: data.side,
              tradeId: data.tradeId,
            }
          }
        });
        dataPointsCollected++;
      } catch (error) {
        logger.error({ error, data }, "Failed to store trade update");
      }
    });

    // Calculate and store derived metrics (candlesticks)
    const intervals = ['1m', '5m', '15m', '1h', '4h'];
    for (const exchange of exchanges) {
      for (const symbol of symbols) {
        try {
          // Fetch recent data to calculate candlesticks
          const recentData = await api.marketData.findMany({
            filter: {
              symbol: { equals: symbol },
              timestamp: {
                greaterThan: new Date(Date.now() - 4 * 60 * 60 * 1000) // Last 4 hours
              }
            },
            sort: { timestamp: "Descending" },
            first: 250,
            select: {
              close: true,
              volume: true,
              timestamp: true,
              open: true,
              high: true,
              low: true,
            }
          });

          if (recentData.length > 0) {
            for (const interval of intervals) {
              const intervalMs = parseInterval(interval);
              const now = Date.now();
              const intervalStart = now - (now % intervalMs);
              
              // Filter data for this interval
              const intervalData = recentData.filter(d => 
                d.timestamp && new Date(d.timestamp).getTime() >= intervalStart
              );

              if (intervalData.length > 0) {
                const open = intervalData[intervalData.length - 1].open || intervalData[intervalData.length - 1].close;
                const close = intervalData[0].close;
                const high = Math.max(...intervalData.map(d => d.high || d.close));
                const low = Math.min(...intervalData.map(d => d.low || d.close));
                const volume = intervalData.reduce((sum, d) => sum + (d.volume || 0), 0);
                const vwap = intervalData.reduce((sum, d) => sum + (d.close * (d.volume || 0)), 0) / volume;

                // Store aggregated candlestick
                await api.marketData.create({
                  symbol: symbol,
                  exchange: { _link: exchange },
                  interval: interval,
                  timestamp: new Date(intervalStart),
                  open: open,
                  high: high,
                  low: low,
                  close: close,
                  volume: volume,
                  metadata: {
                    vwap: vwap,
                    dataPoints: intervalData.length,
                  }
                });
              }
            }
          }
        } catch (error) {
          logger.error({ error, exchange, symbol }, "Failed to calculate candlesticks");
        }
      }
    }

    // Handle WebSocket disconnections with auto-reconnect
    wsManager.on('disconnect', async (exchangeName) => {
      logger.warn({ exchange: exchangeName }, "WebSocket disconnected, attempting reconnect");
      try {
        await wsManager.connect(exchangeName);
        for (const symbol of symbols) {
          await wsManager.subscribe(exchangeName, symbol, ['ticker', 'depth', 'trades']);
        }
        logger.info({ exchange: exchangeName }, "Successfully reconnected");
      } catch (error) {
        logger.error({ exchange: exchangeName, error }, "Failed to reconnect");
      }
    });

    logger.info({
      exchanges: exchanges.length,
      symbols: symbols.length,
      dataPoints: dataPointsCollected,
    }, "Market data sync completed");

    return {
      exchanges: exchanges.length,
      symbols: symbols.length,
      dataPoints: dataPointsCollected,
      status: 'running'
    };

  } catch (error) {
    logger.error({ error }, "Market data sync failed");
    throw error;
  }
};

// Helper function to parse interval string to milliseconds
function parseInterval(interval: string): number {
  const units: Record<string, number> = {
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
    'w': 7 * 24 * 60 * 60 * 1000,
  };
  
  const match = interval.match(/^(\d+)([mhdw])$/);
  if (!match) return 60 * 1000; // Default to 1 minute
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  return value * (units[unit] || 60 * 1000);
}

export const params = {
  exchanges: {
    type: "string",
    array: true,
    default: ['binance', 'coinbase', 'kraken'],
  },
  symbols: {
    type: "string",
    array: true,
    default: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'],
  },
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        type: "scheduled",
        schedule: {
          cron: "* * * * *", // Every 1 minute
        },
      },
    ],
  },
};
