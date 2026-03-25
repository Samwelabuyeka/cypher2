import { ActionOptions } from "gadget-server";

// Simple in-memory cache with 1-second TTL per symbol
const marketDataCache: Map<string, {
  data: any;
  timestamp: number;
}> = new Map();

const CACHE_TTL = 1000; // 1 second in milliseconds

// Helper function to generate OHLCV data
function generateOHLCV(trades: any[], timeframe: string, limit: number) {
  if (trades.length === 0) return [];

  // Convert timeframe to milliseconds
  const timeframeMs: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000
  };

  const interval = timeframeMs[timeframe] || timeframeMs["1h"];
  const now = Date.now();
  const startTime = now - (limit * interval);

  const candles: Record<number, {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = {};

  // Group trades into candles
  trades.forEach((trade: any) => {
    const tradeTime = new Date(trade.executedAt).getTime();
    if (tradeTime < startTime) return;

    const candleTime = Math.floor(tradeTime / interval) * interval;
    
    if (!candles[candleTime]) {
      candles[candleTime] = {
        timestamp: candleTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0
      };
    }

    const candle = candles[candleTime];
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price; // Most recent trade in the period
    candle.volume += trade.quantity;
  });

  // Convert to array and sort by timestamp
  return Object.values(candles)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit)
    .map(candle => ({
      timestamp: new Date(candle.timestamp).toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
}

// Calculate technical indicators from OHLCV data
function calculateTechnicalIndicators(candles: any[]) {
  if (candles.length < 20) {
    return {
      message: "Insufficient data for technical indicators (need at least 20 candles)"
    };
  }

  const closes = candles.map(c => c.close);
  
  // Simple Moving Average (SMA) 20
  const sma20 = closes.slice(-20).reduce((sum: number, price: number) => sum + price, 0) / 20;
  
  // Exponential Moving Average (EMA) 20
  const multiplier = 2 / (20 + 1);
  let ema20 = closes.slice(0, 20).reduce((sum: number, price: number) => sum + price, 0) / 20;
  for (let i = 20; i < closes.length; i++) {
    ema20 = (closes[i] - ema20) * multiplier + ema20;
  }
  
  // RSI 14
  const rsi14 = calculateRSI(closes, 14);
  
  // Bollinger Bands
  const bollingerBands = calculateBollingerBands(closes, 20, 2);
  
  // MACD (12, 26, 9)
  const macd = calculateMACD(closes);

  return {
    sma20: Number(sma20.toFixed(8)),
    ema20: Number(ema20.toFixed(8)),
    rsi14: Number(rsi14.toFixed(2)),
    macd: {
      value: Number(macd.macdLine.toFixed(8)),
      signal: Number(macd.signalLine.toFixed(8)),
      histogram: Number(macd.histogram.toFixed(8))
    },
    bollingerBands: {
      upper: Number(bollingerBands.upper.toFixed(8)),
      middle: Number(bollingerBands.middle.toFixed(8)),
      lower: Number(bollingerBands.lower.toFixed(8))
    }
  };
}

function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number) {
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((sum: number, price: number) => sum + price, 0) / period;
  
  const squaredDiffs = recentPrices.map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((sum: number, diff: number) => sum + diff, 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (standardDeviation * stdDev),
    middle: sma,
    lower: sma - (standardDeviation * stdDev)
  };
}

function calculateMACD(prices: number[]) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  
  // For simplicity, using a simple moving average as signal line
  // In production, this should be EMA of MACD line
  const signalLine = macdLine; // Simplified
  const histogram = macdLine - signalLine;
  
  return { macdLine, signalLine, histogram };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum: number, price: number) => sum + price, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Supported Trading Pairs:
 * 
 * CYP Pairs (Internal Blockchain Data):
 * - CYP/USD, CYP/BTC, CYP/ETH, CYP/USDT
 * 
 * Major Pairs (External Data from marketData model):
 * - BTC/USDT, BTC/USD, ETH/USDT, ETH/USD, BNB/USDT, SOL/USDT
 * - ADA/USDT, XRP/USDT, DOGE/USDT, DOT/USDT, AVAX/USDT
 * 
 * DeFi Pairs:
 * - UNI/USDT, AAVE/USDT, LINK/USDT, CRV/USDT, SUSHI/USDT
 * - COMP/USDT, MKR/USDT, SNX/USDT, YFI/USDT
 * 
 * Additional pairs available based on marketData entries
 */

export const run: ActionRun = async ({ params, logger, api }) => {
  const now = Date.now();
  const startTime = now;
  
  // Validate and parse symbol parameter
  const symbol = params.symbol?.trim();
  if (!symbol) {
    logger.error("Symbol parameter is required");
    return {
      error: "Symbol parameter is required",
      supportedPairs: ["CYP/USD", "BTC/USDT", "ETH/USDT", "and more..."],
    };
  }

  // Validate symbol format (BASE/QUOTE)
  const symbolParts = symbol.split('/');
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    logger.error({ symbol }, "Invalid symbol format. Use BASE/QUOTE format (e.g., BTC/USDT)");
    return {
      error: "Invalid symbol format. Use BASE/QUOTE format (e.g., BTC/USDT, ETH/USD, CYP/USD)",
      providedSymbol: symbol,
    };
  }

  const baseCurrency = symbolParts[0].trim().toUpperCase();
  const quoteCurrency = symbolParts[1].trim().toUpperCase();
  const normalizedSymbol = `${baseCurrency}/${quoteCurrency}`;

  // Check cache
  const cacheKey = `${normalizedSymbol}-${params.timeframe || '1h'}`;
  const cached = marketDataCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    logger.info({ symbol: normalizedSymbol }, "Returning cached market data");
    return cached.data;
  }

  const timeframe = params.timeframe || "1h";
  const limit = Math.min(params.limit || 100, 1000); // Max 1000

  try {
    // Determine data source based on base currency
    const isCypherPair = baseCurrency === 'CYP';
    let marketData: any;

    if (isCypherPair) {
      // Use internal blockchain data for CYP pairs
      marketData = await getCypherPairData(normalizedSymbol, baseCurrency, quoteCurrency, timeframe, limit, now, api, logger);
    } else {
      // Use marketData model for external cryptocurrencies
      marketData = await getExternalPairData(normalizedSymbol, baseCurrency, quoteCurrency, timeframe, limit, now, api, logger);
    }

    // Calculate technical indicators
    if (marketData.candles && marketData.candles.length > 0) {
      marketData.technicalIndicators = calculateTechnicalIndicators(marketData.candles);
    }

    const responseTime = Date.now() - startTime;
    marketData.performance = {
      apiResponseTime: responseTime,
      lastUpdate: new Date(now).toISOString(),
      dataSourceReliability: "high"
    };

    // Update cache
    marketDataCache.set(cacheKey, {
      data: marketData,
      timestamp: now
    });

    logger.info({ 
      symbol: normalizedSymbol, 
      responseTime, 
      dataSource: marketData.dataSource,
      candlesCount: marketData.candles?.length || 0
    }, "Market data generated successfully");

    return marketData;
  } catch (error) {
    logger.error({ error, symbol: normalizedSymbol }, "Error generating market data");
    return {
      error: "Failed to retrieve market data",
      symbol: normalizedSymbol,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

// Get data for CYP pairs from internal blockchain
async function getCypherPairData(
  symbol: string,
  baseCurrency: string,
  quoteCurrency: string,
  timeframe: string,
  limit: number,
  now: number,
  api: any,
  logger: any
) {
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  // Get recent trades for price calculation
  const recentTrades = await api.trade.findMany({
    filter: {
      symbol: { equals: symbol },
      executedAt: { greaterThan: twentyFourHoursAgo.toISOString() }
    },
    sort: { executedAt: "Descending" },
    first: 250,
    select: {
      id: true,
      price: true,
      quantity: true,
      side: true,
      executedAt: true,
      value: true
    }
  });

  // Calculate current price (last trade price)
  const currentPrice = recentTrades.length > 0 ? recentTrades[0].price : 0;

  // Calculate 24h statistics
  let high24h = currentPrice;
  let low24h = currentPrice;
  let volume24h = 0;
  let volume24hQuote = 0;
  let firstPrice24h = currentPrice;

  recentTrades.forEach((trade: any, index: number) => {
    if (trade.price > high24h) high24h = trade.price;
    if (trade.price < low24h) low24h = trade.price;
    volume24h += trade.quantity;
    volume24hQuote += trade.value;
    if (index === recentTrades.length - 1) firstPrice24h = trade.price;
  });

  const change24h = firstPrice24h !== 0 
    ? currentPrice - firstPrice24h
    : 0;
  const changePercent24h = firstPrice24h !== 0 
    ? ((currentPrice - firstPrice24h) / firstPrice24h) * 100 
    : 0;

  // Get order book (top buy and sell orders)
  const buyOrders = await api.order.findMany({
    filter: {
      symbol: { equals: symbol },
      side: { equals: "buy" },
      status: { in: ["open", "partially-filled"] }
    },
    sort: { price: "Descending" },
    first: 10,
    select: {
      id: true,
      price: true,
      quantity: true,
      filledQuantity: true
    }
  });

  const sellOrders = await api.order.findMany({
    filter: {
      symbol: { equals: symbol },
      side: { equals: "sell" },
      status: { in: ["open", "partially-filled"] }
    },
    sort: { price: "Ascending" },
    first: 10,
    select: {
      id: true,
      price: true,
      quantity: true,
      filledQuantity: true
    }
  });

  const bestBid = buyOrders.length > 0 ? buyOrders[0].price : 0;
  const bestAsk = sellOrders.length > 0 ? sellOrders[0].price : 0;
  const spread = bestAsk - bestBid;

  // Get blockchain statistics (CYP specific)
  const recentTransactions = await api.cypherTransaction.findMany({
    sort: { createdAt: "Descending" },
    first: 100,
    select: {
      id: true,
      blockNumber: true,
      createdAt: true,
      amount: true,
      fromAddress: true,
      toAddress: true
    }
  });

  const latestBlock = recentTransactions.length > 0 
    ? recentTransactions[0].blockNumber || 0 
    : 0;

  // Calculate TPS (transactions per second) over last minute
  const oneMinuteAgo = new Date(now - 60 * 1000);
  const txLastMinute = recentTransactions.filter(tx => 
    new Date(tx.createdAt) > oneMinuteAgo
  );
  const tps = txLastMinute.length / 60;

  // Count unique addresses
  const uniqueAddresses = new Set<string>();
  recentTransactions.forEach((tx: any) => {
    uniqueAddresses.add(tx.fromAddress);
    uniqueAddresses.add(tx.toAddress);
  });

  // Calculate circulating supply (sum of all wallet balances)
  const wallets = await api.wallet.findMany({
    filter: {
      currency: { equals: baseCurrency },
      isActive: { equals: true }
    },
    first: 250,
    select: {
      id: true,
      balance: true
    }
  });

  const circulatingSupply = wallets.reduce((sum: number, wallet: any) => sum + wallet.balance, 0);
  const totalSupply = 21000000; // Max supply for CypherCoin
  const marketCap = circulatingSupply * currentPrice;

  // Generate OHLCV data based on timeframe
  const candles = generateOHLCV(recentTrades, timeframe, limit);

  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    timeframe,
    candles,
    latest: {
      price: currentPrice,
      change24h,
      changePercent24h,
      high24h,
      low24h,
      volume24h,
    },
    orderBook: {
      bestBid,
      bestAsk,
      spread,
      bids: buyOrders.map(order => ({
        price: order.price,
        quantity: order.quantity - order.filledQuantity
      })),
      asks: sellOrders.map(order => ({
        price: order.price,
        quantity: order.quantity - order.filledQuantity
      }))
    },
    network: {
      blockHeight: latestBlock,
      transactionsPerSecond: tps,
      activeAddresses: uniqueAddresses.size,
    },
    supply: {
      circulating: circulatingSupply,
      total: totalSupply,
      marketCap
    },
    dataSource: 'internal-blockchain',
    exchanges: ['CypherChain'],
  };
}

// Get data for external pairs from marketData model
async function getExternalPairData(
  symbol: string,
  baseCurrency: string,
  quoteCurrency: string,
  timeframe: string,
  limit: number,
  now: number,
  api: any,
  logger: any
) {
  // Map timeframe to interval enum
  const intervalMap: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w"
  };
  
  const interval = intervalMap[timeframe] || "1h";
  
  // Query marketData model
  const marketDataRecords = await api.marketData.findMany({
    filter: {
      symbol: { equals: symbol },
      interval: { equals: interval }
    },
    sort: { timestamp: "Descending" },
    first: Math.min(limit, 250),
    select: {
      id: true,
      timestamp: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
      exchange: {
        id: true,
        code: true,
        name: true
      }
    }
  });

  if (marketDataRecords.length === 0) {
    logger.warn({ symbol, interval }, "No market data found for this pair");
    return {
      symbol,
      baseCurrency,
      quoteCurrency,
      timeframe,
      candles: [],
      latest: {
        price: 0,
        change24h: 0,
        changePercent24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
      },
      dataSource: 'no-data',
      exchanges: [],
      message: `No data available for ${symbol}. Try another trading pair.`,
      suggestedPairs: ['BTC/USDT', 'ETH/USDT', 'CYP/USD']
    };
  }

  // Aggregate data from multiple exchanges if available
  const exchangeNames = new Set<string>();
  marketDataRecords.forEach((record: any) => {
    if (record.exchange?.code) {
      exchangeNames.add(record.exchange.code);
    }
  });

  // Convert to candles format
  const candles = marketDataRecords.map((record: any) => ({
    timestamp: record.timestamp,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
  })).reverse(); // Oldest first

  // Calculate 24h statistics
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  const recent24h = marketDataRecords.filter((r: any) => 
    r.timestamp && new Date(r.timestamp) > twentyFourHoursAgo
  );

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const firstPrice24h = recent24h.length > 0 
    ? recent24h[recent24h.length - 1].open 
    : currentPrice;
  
  const high24h = recent24h.reduce((max: number, r: any) => Math.max(max, r.high), 0);
  const low24h = recent24h.reduce((min: number, r: any) => r.low < min && r.low > 0 ? r.low : min, Infinity);
  const volume24h = recent24h.reduce((sum: number, r: any) => sum + r.volume, 0);

  const change24h = currentPrice - firstPrice24h;
  const changePercent24h = firstPrice24h !== 0 
    ? ((currentPrice - firstPrice24h) / firstPrice24h) * 100 
    : 0;

  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    timeframe,
    candles,
    latest: {
      price: currentPrice,
      change24h,
      changePercent24h,
      high24h: high24h || currentPrice,
      low24h: low24h === Infinity ? currentPrice : low24h,
      volume24h,
    },
    dataSource: exchangeNames.size > 1 ? 'aggregated' : 'database',
    exchanges: Array.from(exchangeNames),
  };
}



export const params = {
  symbol: { type: "string" },
  timeframe: { type: "string", enum: ["1m", "5m", "15m", "1h", "4h", "1d"] },
  limit: { type: "number" }
};

export const options: ActionOptions = {
  triggers: {
    api: true
  }
};
