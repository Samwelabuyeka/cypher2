/**
 * Market Microstructure Analysis Tools
 * 
 * Provides advanced market microstructure analysis including:
 * - Order flow analysis
 * - Spread analysis
 * - Market making models
 * - Tick data analysis
 * - High frequency indicators
 * - Orderbook imbalance
 * - Market impact models
 * - Liquidity scores
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface Trade {
  price: number;
  quantity: number;
  timestamp: number;
  side: "buy" | "sell";
  isBuyerInitiated?: boolean;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders?: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Quote {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: number;
}

export interface VolumeProfileBucket {
  priceLevel: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  trades: number;
}

export interface OrderFlowImbalance {
  imbalance: number;
  buyVolume: number;
  sellVolume: number;
  netFlow: number;
  ratio: number;
}

export interface SpreadMetrics {
  effectiveSpread: number;
  realizedSpread: number;
  priceImpact: number;
  quoteDepth: {
    bidDepth: number;
    askDepth: number;
    totalDepth: number;
  };
}

export interface AvellanedaStoikovParams {
  riskAversion: number;
  volatility: number;
  reservationPrice: number;
  inventory: number;
  targetInventory: number;
  timeHorizon: number;
}

export interface MarketImpactParams {
  volume: number;
  averageDailyVolume: number;
  volatility: number;
  timeHorizon?: number;
}

export interface LiquidityMetrics {
  score: number;
  depth: number;
  spread: number;
  resilience: number;
  turnover: number;
}

// ============================================================================
// 1. Order Flow Analysis
// ============================================================================

/**
 * Calculate order flow imbalance from trades
 */
export function calculateOrderFlowImbalance(
  trades: Trade[],
  windowSize?: number
): OrderFlowImbalance {
  const relevantTrades = windowSize
    ? trades.slice(-windowSize)
    : trades;

  let buyVolume = 0;
  let sellVolume = 0;

  for (const trade of relevantTrades) {
    if (trade.side === "buy" || trade.isBuyerInitiated) {
      buyVolume += trade.quantity * trade.price;
    } else {
      sellVolume += trade.quantity * trade.price;
    }
  }

  const totalVolume = buyVolume + sellVolume;
  const netFlow = buyVolume - sellVolume;
  const imbalance = totalVolume > 0 ? netFlow / totalVolume : 0;
  const ratio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? Infinity : 1;

  return {
    imbalance,
    buyVolume,
    sellVolume,
    netFlow,
    ratio,
  };
}

/**
 * Detect large orders (whale detection)
 */
export function detectLargeOrders(
  trades: Trade[],
  threshold: number = 2.0 // Standard deviations above mean
): Trade[] {
  if (trades.length === 0) return [];

  // Calculate mean and standard deviation of trade sizes
  const tradeSizes = trades.map(t => t.quantity * t.price);
  const mean = tradeSizes.reduce((sum, size) => sum + size, 0) / tradeSizes.length;
  const variance = tradeSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / tradeSizes.length;
  const stdDev = Math.sqrt(variance);

  const thresholdSize = mean + (threshold * stdDev);

  return trades.filter(trade => (trade.quantity * trade.price) >= thresholdSize);
}

/**
 * Calculate trade aggression (buyer vs seller initiated)
 */
export function calculateTradeAggression(
  trades: Trade[],
  quotes: Quote[]
): number {
  if (trades.length === 0 || quotes.length === 0) return 0;

  let aggressiveBuys = 0;
  let aggressiveSells = 0;

  for (const trade of trades) {
    // Find closest quote
    const quote = quotes.reduce((closest, q) =>
      Math.abs(q.timestamp - trade.timestamp) < Math.abs(closest.timestamp - trade.timestamp)
        ? q
        : closest
    );

    const midPrice = (quote.bidPrice + quote.askPrice) / 2;

    // Trade above mid is aggressive buy, below is aggressive sell
    if (trade.price > midPrice) {
      aggressiveBuys += trade.quantity;
    } else if (trade.price < midPrice) {
      aggressiveSells += trade.quantity;
    }
  }

  const totalVolume = aggressiveBuys + aggressiveSells;
  return totalVolume > 0 ? (aggressiveBuys - aggressiveSells) / totalVolume : 0;
}

/**
 * Analyze volume profile across price levels
 */
export function volumeProfileAnalysis(
  trades: Trade[],
  numBuckets: number = 20
): VolumeProfileBucket[] {
  if (trades.length === 0) return [];

  const prices = trades.map(t => t.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const bucketSize = (maxPrice - minPrice) / numBuckets;

  const buckets: VolumeProfileBucket[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const priceLevel = minPrice + (i * bucketSize) + (bucketSize / 2);
    const lowerBound = minPrice + (i * bucketSize);
    const upperBound = lowerBound + bucketSize;

    const bucketTrades = trades.filter(t => t.price >= lowerBound && t.price < upperBound);

    const volume = bucketTrades.reduce((sum, t) => sum + t.quantity, 0);
    const buyVolume = bucketTrades
      .filter(t => t.side === "buy" || t.isBuyerInitiated)
      .reduce((sum, t) => sum + t.quantity, 0);
    const sellVolume = volume - buyVolume;

    buckets.push({
      priceLevel,
      volume,
      buyVolume,
      sellVolume,
      trades: bucketTrades.length,
    });
  }

  return buckets;
}

// ============================================================================
// 2. Spread Analysis
// ============================================================================

/**
 * Calculate effective spread
 */
export function calculateEffectiveSpread(trade: Trade, quote: Quote): number {
  const midPrice = (quote.bidPrice + quote.askPrice) / 2;
  const side = trade.side === "buy" || trade.isBuyerInitiated ? 1 : -1;
  return 2 * side * (trade.price - midPrice);
}

/**
 * Calculate realized spread
 */
export function calculateRealizedSpread(
  trade: Trade,
  quoteAtTrade: Quote,
  quoteAfterTrade: Quote
): number {
  const midPriceAtTrade = (quoteAtTrade.bidPrice + quoteAtTrade.askPrice) / 2;
  const midPriceAfter = (quoteAfterTrade.bidPrice + quoteAfterTrade.askPrice) / 2;
  const side = trade.side === "buy" || trade.isBuyerInitiated ? 1 : -1;
  return 2 * side * (trade.price - midPriceAfter);
}

/**
 * Measure price impact
 */
export function measurePriceImpact(
  quoteBeforeTrade: Quote,
  quoteAfterTrade: Quote,
  trade: Trade
): number {
  const midBefore = (quoteBeforeTrade.bidPrice + quoteBeforeTrade.askPrice) / 2;
  const midAfter = (quoteAfterTrade.bidPrice + quoteAfterTrade.askPrice) / 2;
  const side = trade.side === "buy" || trade.isBuyerInitiated ? 1 : -1;
  return side * (midAfter - midBefore);
}

/**
 * Analyze quote depth
 */
export function analyzeQuoteDepth(orderBook: OrderBook, numLevels: number = 5): {
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
  avgBidPrice: number;
  avgAskPrice: number;
} {
  const bids = orderBook.bids.slice(0, numLevels);
  const asks = orderBook.asks.slice(0, numLevels);

  const bidDepth = bids.reduce((sum, level) => sum + level.quantity, 0);
  const askDepth = asks.reduce((sum, level) => sum + level.quantity, 0);

  const avgBidPrice = bids.reduce((sum, level) => sum + (level.price * level.quantity), 0) / (bidDepth || 1);
  const avgAskPrice = asks.reduce((sum, level) => sum + (level.price * level.quantity), 0) / (askDepth || 1);

  return {
    bidDepth,
    askDepth,
    totalDepth: bidDepth + askDepth,
    avgBidPrice,
    avgAskPrice,
  };
}

// ============================================================================
// 3. Market Making Models
// ============================================================================

/**
 * Avellaneda-Stoikov model for optimal quotes
 */
export function avellanedaStoikovModel(params: AvellanedaStoikovParams): {
  bidSpread: number;
  askSpread: number;
  reservationPrice: number;
} {
  const {
    riskAversion,
    volatility,
    reservationPrice,
    inventory,
    targetInventory,
    timeHorizon,
  } = params;

  // Optimal spread calculation
  const gamma = riskAversion;
  const sigma = volatility;
  const T = timeHorizon;
  const q = inventory - targetInventory;

  // Reservation price adjustment for inventory
  const reservationPriceAdjusted = reservationPrice - (q * gamma * sigma * sigma * T);

  // Optimal spread
  const optimalSpread = gamma * sigma * sigma * T + (2 / gamma) * Math.log(1 + (gamma / 2));

  return {
    bidSpread: optimalSpread / 2,
    askSpread: optimalSpread / 2,
    reservationPrice: reservationPriceAdjusted,
  };
}

/**
 * Inventory risk management
 */
export function inventoryRiskManagement(
  currentInventory: number,
  targetInventory: number,
  maxInventory: number,
  baseSpread: number
): {
  adjustedBidSpread: number;
  adjustedAskSpread: number;
  inventoryRisk: number;
} {
  const inventoryDeviation = currentInventory - targetInventory;
  const inventoryRatio = inventoryDeviation / maxInventory;
  const inventoryRisk = Math.abs(inventoryRatio);

  // Widen spreads when inventory is too high or too low
  const spreadAdjustment = Math.abs(inventoryRatio) * baseSpread;

  const adjustedBidSpread = inventoryDeviation > 0
    ? baseSpread + spreadAdjustment  // Widen bid when long
    : baseSpread - spreadAdjustment * 0.5;  // Tighten bid when short

  const adjustedAskSpread = inventoryDeviation < 0
    ? baseSpread + spreadAdjustment  // Widen ask when short
    : baseSpread - spreadAdjustment * 0.5;  // Tighten ask when long

  return {
    adjustedBidSpread: Math.max(0, adjustedBidSpread),
    adjustedAskSpread: Math.max(0, adjustedAskSpread),
    inventoryRisk,
  };
}

/**
 * Calculate optimal bid-ask spread
 */
export function calculateOptimalBidAskSpread(
  volatility: number,
  orderArrivalRate: number,
  tickSize: number,
  inventoryRisk: number = 0
): number {
  // Base spread based on volatility
  const baseSpread = 2 * volatility * Math.sqrt(1 / orderArrivalRate);

  // Adjust for inventory risk
  const inventoryAdjustment = 1 + inventoryRisk;

  // Round to tick size
  const optimalSpread = baseSpread * inventoryAdjustment;
  return Math.ceil(optimalSpread / tickSize) * tickSize;
}

// ============================================================================
// 4. Tick Data Analysis
// ============================================================================

/**
 * Calculate microprice (weighted mid-price)
 */
export function calculateMicroprice(quote: Quote): number {
  const bidWeight = quote.askSize / (quote.bidSize + quote.askSize);
  const askWeight = quote.bidSize / (quote.bidSize + quote.askSize);
  return (quote.bidPrice * bidWeight) + (quote.askPrice * askWeight);
}

/**
 * Lee-Ready algorithm for tick rule classification
 */
export function classifyTickRule(
  trade: Trade,
  previousTrade: Trade | null
): "buy" | "sell" | "unknown" {
  if (!previousTrade) return "unknown";

  if (trade.price > previousTrade.price) {
    return "buy";
  } else if (trade.price < previousTrade.price) {
    return "sell";
  } else {
    // Price unchanged - use previous classification or quote rule
    return "unknown";
  }
}

/**
 * Classify trade sign
 */
export function classifyTradeSign(trade: Trade, quote: Quote): "buy" | "sell" | "unknown" {
  const midPrice = (quote.bidPrice + quote.askPrice) / 2;

  if (trade.price > midPrice) {
    return "buy";
  } else if (trade.price < midPrice) {
    return "sell";
  } else if (trade.price === quote.askPrice) {
    return "buy";
  } else if (trade.price === quote.bidPrice) {
    return "sell";
  }

  return "unknown";
}

// ============================================================================
// 5. High Frequency Indicators
// ============================================================================

/**
 * Calculate VPIN (Volume-Synchronized Probability of Informed Trading)
 */
export function calculateVPIN(
  trades: Trade[],
  bucketSize: number = 50
): number {
  if (trades.length < bucketSize) return 0;

  const buckets: Array<{ buyVolume: number; sellVolume: number }> = [];
  let currentBucket = { buyVolume: 0, sellVolume: 0 };
  let bucketVolume = 0;

  for (const trade of trades) {
    const volume = trade.quantity;

    if (trade.side === "buy" || trade.isBuyerInitiated) {
      currentBucket.buyVolume += volume;
    } else {
      currentBucket.sellVolume += volume;
    }

    bucketVolume += volume;

    if (bucketVolume >= bucketSize) {
      buckets.push({ ...currentBucket });
      currentBucket = { buyVolume: 0, sellVolume: 0 };
      bucketVolume = 0;
    }
  }

  // Calculate VPIN
  const vpinSum = buckets.reduce((sum, bucket) => {
    const totalVolume = bucket.buyVolume + bucket.sellVolume;
    return sum + Math.abs(bucket.buyVolume - bucket.sellVolume) / totalVolume;
  }, 0);

  return buckets.length > 0 ? vpinSum / buckets.length : 0;
}

/**
 * Calculate Kyle's Lambda (price impact coefficient)
 */
export function calculateKylesLambda(
  trades: Trade[],
  quotes: Quote[]
): number {
  if (trades.length === 0 || quotes.length === 0) return 0;

  let sumPriceChange = 0;
  let sumSignedVolume = 0;

  for (let i = 1; i < trades.length; i++) {
    const trade = trades[i];
    const prevTrade = trades[i - 1];

    const priceChange = trade.price - prevTrade.price;
    const signedVolume = (trade.side === "buy" || trade.isBuyerInitiated ? 1 : -1) * trade.quantity;

    sumPriceChange += Math.abs(priceChange);
    sumSignedVolume += Math.abs(signedVolume);
  }

  return sumSignedVolume > 0 ? sumPriceChange / sumSignedVolume : 0;
}

/**
 * Calculate realized volatility from tick data
 */
export function calculateRealizedVolatility(
  trades: Trade[],
  samplingInterval: number = 1000 // milliseconds
): number {
  if (trades.length < 2) return 0;

  const returns: number[] = [];
  let lastPrice = trades[0].price;
  let lastTime = trades[0].timestamp;

  for (let i = 1; i < trades.length; i++) {
    const trade = trades[i];

    if (trade.timestamp - lastTime >= samplingInterval) {
      const returnValue = Math.log(trade.price / lastPrice);
      returns.push(returnValue);
      lastPrice = trade.price;
      lastTime = trade.timestamp;
    }
  }

  if (returns.length < 2) return 0;

  // Calculate variance
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);

  // Annualize (assuming milliseconds)
  const periodsPerYear = (365 * 24 * 60 * 60 * 1000) / samplingInterval;
  return Math.sqrt(variance * periodsPerYear);
}

// ============================================================================
// 6. Orderbook Imbalance
// ============================================================================

/**
 * Calculate orderbook imbalance
 */
export function calculateOrderbookImbalance(
  orderBook: OrderBook,
  numLevels: number = 5
): number {
  const bids = orderBook.bids.slice(0, numLevels);
  const asks = orderBook.asks.slice(0, numLevels);

  const bidVolume = bids.reduce((sum, level) => sum + level.quantity, 0);
  const askVolume = asks.reduce((sum, level) => sum + level.quantity, 0);

  const totalVolume = bidVolume + askVolume;
  return totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0;
}

/**
 * Predict short-term price move from orderbook imbalance
 */
export function predictShortTermPriceMove(
  orderBook: OrderBook,
  numLevels: number = 5
): {
  imbalance: number;
  predictedDirection: "up" | "down" | "neutral";
  confidence: number;
} {
  const imbalance = calculateOrderbookImbalance(orderBook, numLevels);

  let predictedDirection: "up" | "down" | "neutral";
  const absImbalance = Math.abs(imbalance);

  if (imbalance > 0.1) {
    predictedDirection = "up";
  } else if (imbalance < -0.1) {
    predictedDirection = "down";
  } else {
    predictedDirection = "neutral";
  }

  // Confidence based on magnitude of imbalance
  const confidence = Math.min(absImbalance * 100, 100);

  return {
    imbalance,
    predictedDirection,
    confidence,
  };
}

/**
 * Calculate depth-weighted price level
 */
export function calculateDepthWeightedPrice(
  orderBook: OrderBook,
  numLevels: number = 5
): {
  bidWeightedPrice: number;
  askWeightedPrice: number;
  midWeightedPrice: number;
} {
  const bids = orderBook.bids.slice(0, numLevels);
  const asks = orderBook.asks.slice(0, numLevels);

  const totalBidVolume = bids.reduce((sum, level) => sum + level.quantity, 0);
  const totalAskVolume = asks.reduce((sum, level) => sum + level.quantity, 0);

  const bidWeightedPrice = totalBidVolume > 0
    ? bids.reduce((sum, level) => sum + (level.price * level.quantity), 0) / totalBidVolume
    : 0;

  const askWeightedPrice = totalAskVolume > 0
    ? asks.reduce((sum, level) => sum + (level.price * level.quantity), 0) / totalAskVolume
    : 0;

  const midWeightedPrice = (bidWeightedPrice + askWeightedPrice) / 2;

  return {
    bidWeightedPrice,
    askWeightedPrice,
    midWeightedPrice,
  };
}

// ============================================================================
// 7. Market Impact Models
// ============================================================================

/**
 * Estimate temporary market impact (square root model)
 */
export function estimateTemporaryImpact(params: MarketImpactParams): number {
  const { volume, averageDailyVolume, volatility } = params;

  // Temporary impact ~ volatility * sqrt(volume / ADV)
  const volumeFraction = volume / averageDailyVolume;
  return volatility * Math.sqrt(volumeFraction);
}

/**
 * Estimate permanent market impact (linear model)
 */
export function estimatePermanentImpact(params: MarketImpactParams): number {
  const { volume, averageDailyVolume, volatility } = params;

  // Permanent impact ~ volatility * (volume / ADV)
  const volumeFraction = volume / averageDailyVolume;
  return volatility * volumeFraction;
}

/**
 * Almgren-Chriss market impact model
 */
export function calculateAlmgrenChrissImpact(
  params: MarketImpactParams & {
    permanentImpactCoeff?: number;
    temporaryImpactCoeff?: number;
  }
): {
  permanentImpact: number;
  temporaryImpact: number;
  totalImpact: number;
} {
  const {
    volume,
    averageDailyVolume,
    volatility,
    timeHorizon = 1,
    permanentImpactCoeff = 0.1,
    temporaryImpactCoeff = 0.01,
  } = params;

  const volumeFraction = volume / averageDailyVolume;

  // Permanent impact (linear in volume)
  const permanentImpact = permanentImpactCoeff * volatility * volumeFraction;

  // Temporary impact (depends on trading rate)
  const tradingRate = volume / timeHorizon;
  const temporaryImpact = temporaryImpactCoeff * volatility * (tradingRate / averageDailyVolume);

  return {
    permanentImpact,
    temporaryImpact,
    totalImpact: permanentImpact + temporaryImpact,
  };
}

// ============================================================================
// 8. Liquidity Scores
// ============================================================================

/**
 * Calculate composite liquidity score
 */
export function calculateCompositeLiquidityScore(
  orderBook: OrderBook,
  trades: Trade[],
  timeWindow: number = 3600000 // 1 hour in milliseconds
): LiquidityMetrics {
  // 1. Depth score (order book depth)
  const depth = analyzeQuoteDepth(orderBook, 10);
  const depthScore = Math.log1p(depth.totalDepth);

  // 2. Spread score (tightness)
  const bestBid = orderBook.bids[0]?.price || 0;
  const bestAsk = orderBook.asks[0]?.price || 0;
  const spread = bestAsk > 0 && bestBid > 0 ? (bestAsk - bestBid) / bestBid : 0;
  const spreadScore = Math.max(0, 1 - (spread * 100)); // Lower spread = higher score

  // 3. Resilience (order book recovery)
  const imbalance = calculateOrderbookImbalance(orderBook, 10);
  const resilienceScore = Math.max(0, 1 - Math.abs(imbalance));

  // 4. Turnover (trading activity)
  const recentTrades = trades.filter(t =>
    t.timestamp > (Date.now() - timeWindow)
  );
  const turnover = recentTrades.reduce((sum, t) => sum + (t.quantity * t.price), 0);
  const turnoverScore = Math.log1p(turnover);

  // Composite score (weighted average)
  const weights = {
    depth: 0.3,
    spread: 0.3,
    resilience: 0.2,
    turnover: 0.2,
  };

  const compositeScore =
    (depthScore * weights.depth) +
    (spreadScore * weights.spread) +
    (resilienceScore * weights.resilience) +
    (turnoverScore * weights.turnover);

  return {
    score: compositeScore,
    depth: depthScore,
    spread: spreadScore,
    resilience: resilienceScore,
    turnover: turnoverScore,
  };
}

/**
 * Calculate resilience metrics
 */
export function calculateResilienceMetrics(
  orderBookSnapshots: OrderBook[],
  trades: Trade[]
): {
  recoveryTime: number;
  depthRecovery: number;
  spreadRecovery: number;
  resilience: number;
} {
  if (orderBookSnapshots.length < 2) {
    return {
      recoveryTime: 0,
      depthRecovery: 0,
      spreadRecovery: 0,
      resilience: 0,
    };
  }

  const initialBook = orderBookSnapshots[0];
  const finalBook = orderBookSnapshots[orderBookSnapshots.length - 1];

  // Calculate initial and final metrics
  const initialDepth = analyzeQuoteDepth(initialBook);
  const finalDepth = analyzeQuoteDepth(finalBook);

  const initialSpread = (initialBook.asks[0]?.price || 0) - (initialBook.bids[0]?.price || 0);
  const finalSpread = (finalBook.asks[0]?.price || 0) - (finalBook.bids[0]?.price || 0);

  // Recovery metrics
  const depthRecovery = initialDepth.totalDepth > 0
    ? finalDepth.totalDepth / initialDepth.totalDepth
    : 0;

  const spreadRecovery = initialSpread > 0
    ? 1 - Math.abs((finalSpread - initialSpread) / initialSpread)
    : 0;

  // Recovery time (time between first and last snapshot)
  const recoveryTime = finalBook.timestamp - initialBook.timestamp;

  // Overall resilience score
  const resilience = (depthRecovery + spreadRecovery) / 2;

  return {
    recoveryTime,
    depthRecovery,
    spreadRecovery,
    resilience,
  };
}

// ============================================================================
// Export Aliases for Compatibility
// ============================================================================

// Alias exports for different naming conventions
export const analyzeBidAskPressure = calculateOrderbookImbalance;
export const detectAggressiveTrading = calculateTradeAggression;
export const measureFlowToxicity = calculateVPIN;
export const calculateMarketImpact = estimateTemporaryImpact;
export const estimateImpactComponents = calculateAlmgrenChrissImpact;
export const detectSpoofing = detectLargeOrders;
export const detectLayering = predictShortTermPriceMove;
export const measureEffectiveSpread = calculateEffectiveSpread;
export const analyzeDepthOfBook = analyzeQuoteDepth;
export const calculateVWAP = calculateDepthWeightedPrice;
export const calculateTWAP = calculateMicroprice;
export const classifyTrade = classifyTradeSign;
export const measureInformedTrading = calculateVPIN;
export const identifyPriceDiscovery = volumeProfileAnalysis;
export const measureSlippage = measurePriceImpact;
export const calculateImplementationShortfall = calculateAlmgrenChrissImpact;
export const detectHFTActivity = calculateKylesLambda;
export const identifyQuoteFading = calculateRealizedSpread;
export const analyzeOrderFlow = calculateOrderFlowImbalance;
export const measureEffectiveSpreads = calculateEffectiveSpread;