/**
 * Order Flow and Market Microstructure Analysis
 * 
 * This module provides functions for analyzing order flow, market depth,
 * and microstructure metrics used in algorithmic trading.
 */

export interface SpreadMetrics {
  absoluteSpread: number;
  percentageSpread: number;
  relativeSpread: number;
  midPrice: number;
}

export interface OrderImbalance {
  imbalanceRatio: number;
  signalDirection: 'bullish' | 'bearish' | 'neutral';
  bidVolume: number;
  askVolume: number;
}

export interface VolumeProfileBin {
  priceLevel: number;
  volume: number;
  percentage: number;
}

export interface VolumeProfile {
  profile: VolumeProfileBin[];
  pointOfControl: {
    priceLevel: number;
    volume: number;
  };
  valueArea: {
    high: number;
    low: number;
    volume: number;
  };
}

export interface DeltaMetrics {
  netDelta: number;
  cumulativeDelta: number;
  buyPressure: number;
  sellPressure: number;
}

export interface LargeTrade {
  price: number;
  volume: number;
  timestamp: Date;
  percentageOfThreshold: number;
}

export interface LargeTradesAnalysis {
  largeTrades: LargeTrade[];
  statistics: {
    count: number;
    totalVolume: number;
    averageSize: number;
    largestTrade: number;
  };
}

export interface MarketDepthMetrics {
  totalBidVolume: number;
  totalAskVolume: number;
  depthImbalance: number;
  liquidityScore: number;
  bidLevels: number;
  askLevels: number;
}

export interface TimeAndSalesMetrics {
  aggressiveBuys: number;
  aggressiveSells: number;
  buyVolumeRatio: number;
  sellVolumeRatio: number;
  velocity: {
    tradesPerMinute: number;
    volumePerMinute: number;
  };
  netFlow: number;
}

export interface VPINMetrics {
  vpin: number;
  toxicity: 'low' | 'medium' | 'high' | 'critical';
  buckets: number;
  averageImbalance: number;
}

/**
 * Calculate bid-ask spread metrics
 * 
 * @param bidPrice - Current bid price
 * @param askPrice - Current ask price
 * @param midPrice - Optional mid price (calculated if not provided)
 * @returns Spread metrics including absolute, percentage, and relative spread
 */
export function calculateBidAskSpread(
  bidPrice: number,
  askPrice: number,
  midPrice?: number
): SpreadMetrics {
  const calculatedMidPrice = midPrice ?? (bidPrice + askPrice) / 2;
  const absoluteSpread = askPrice - bidPrice;
  const percentageSpread = (absoluteSpread / calculatedMidPrice) * 100;
  const relativeSpread = absoluteSpread / calculatedMidPrice;

  return {
    absoluteSpread,
    percentageSpread,
    relativeSpread,
    midPrice: calculatedMidPrice,
  };
}

/**
 * Calculate order book imbalance
 * 
 * @param bidVolume - Total volume on bid side
 * @param askVolume - Total volume on ask side
 * @returns Imbalance ratio and signal direction
 */
export function calculateOrderImbalance(
  bidVolume: number,
  askVolume: number
): OrderImbalance {
  const totalVolume = bidVolume + askVolume;
  const imbalanceRatio = totalVolume > 0 
    ? (bidVolume - askVolume) / totalVolume 
    : 0;

  let signalDirection: 'bullish' | 'bearish' | 'neutral';
  if (imbalanceRatio > 0.1) {
    signalDirection = 'bullish';
  } else if (imbalanceRatio < -0.1) {
    signalDirection = 'bearish';
  } else {
    signalDirection = 'neutral';
  }

  return {
    imbalanceRatio,
    signalDirection,
    bidVolume,
    askVolume,
  };
}

/**
 * Calculate volume profile by price level
 * 
 * @param prices - Array of price levels
 * @param volumes - Array of volumes corresponding to prices
 * @param bins - Number of price bins to create (default: 20)
 * @returns Volume profile with POC and value area
 */
export function calculateVolumeProfile(
  prices: number[],
  volumes: number[],
  bins: number = 20
): VolumeProfile {
  if (prices.length !== volumes.length || prices.length === 0) {
    throw new Error('Prices and volumes arrays must have the same non-zero length');
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const binSize = (maxPrice - minPrice) / bins;

  // Initialize bins
  const volumeBins: Map<number, number> = new Map();
  for (let i = 0; i < bins; i++) {
    const binPrice = minPrice + (i + 0.5) * binSize;
    volumeBins.set(binPrice, 0);
  }

  // Aggregate volume into bins
  for (let i = 0; i < prices.length; i++) {
    const binIndex = Math.min(
      Math.floor((prices[i] - minPrice) / binSize),
      bins - 1
    );
    const binPrice = minPrice + (binIndex + 0.5) * binSize;
    const currentVolume = volumeBins.get(binPrice) || 0;
    volumeBins.set(binPrice, currentVolume + volumes[i]);
  }

  // Calculate total volume and create profile
  const totalVolume = Array.from(volumeBins.values()).reduce((a, b) => a + b, 0);
  const profile: VolumeProfileBin[] = Array.from(volumeBins.entries())
    .map(([priceLevel, volume]) => ({
      priceLevel,
      volume,
      percentage: (volume / totalVolume) * 100,
    }))
    .sort((a, b) => a.priceLevel - b.priceLevel);

  // Find Point of Control (highest volume)
  const poc = profile.reduce((max, bin) =>
    bin.volume > max.volume ? bin : max
  );

  // Calculate Value Area (70% of volume around POC)
  const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
  let valueAreaVolume = 0;
  const valueAreaThreshold = totalVolume * 0.7;
  const valueAreaBins: VolumeProfileBin[] = [];

  for (const bin of sortedByVolume) {
    if (valueAreaVolume >= valueAreaThreshold) break;
    valueAreaBins.push(bin);
    valueAreaVolume += bin.volume;
  }

  const valueAreaPrices = valueAreaBins.map(b => b.priceLevel).sort((a, b) => a - b);

  return {
    profile,
    pointOfControl: {
      priceLevel: poc.priceLevel,
      volume: poc.volume,
    },
    valueArea: {
      high: valueAreaPrices[valueAreaPrices.length - 1] || poc.priceLevel,
      low: valueAreaPrices[0] || poc.priceLevel,
      volume: valueAreaVolume,
    },
  };
}

/**
 * Calculate delta (buy vs sell pressure)
 * 
 * @param buyVolume - Volume of buy orders
 * @param sellVolume - Volume of sell orders
 * @returns Delta metrics including net and cumulative delta
 */
export function calculateDelta(
  buyVolume: number,
  sellVolume: number
): DeltaMetrics {
  const netDelta = buyVolume - sellVolume;
  const totalVolume = buyVolume + sellVolume;
  const buyPressure = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 0;
  const sellPressure = totalVolume > 0 ? (sellVolume / totalVolume) * 100 : 0;

  return {
    netDelta,
    cumulativeDelta: netDelta, // For single calculation, same as net
    buyPressure,
    sellPressure,
  };
}

/**
 * Detect large trades (block trades)
 * 
 * @param trades - Array of trade objects
 * @param threshold - Volume threshold to classify as large trade
 * @returns Large trades and statistics
 */
export function detectLargeTrades(
  trades: Array<{ price: number; volume: number; timestamp: Date }>,
  threshold: number
): LargeTradesAnalysis {
  const largeTrades: LargeTrade[] = trades
    .filter(trade => trade.volume >= threshold)
    .map(trade => ({
      price: trade.price,
      volume: trade.volume,
      timestamp: trade.timestamp,
      percentageOfThreshold: (trade.volume / threshold) * 100,
    }))
    .sort((a, b) => b.volume - a.volume);

  const totalVolume = largeTrades.reduce((sum, trade) => sum + trade.volume, 0);
  const averageSize = largeTrades.length > 0 ? totalVolume / largeTrades.length : 0;
  const largestTrade = largeTrades.length > 0 ? largeTrades[0].volume : 0;

  return {
    largeTrades,
    statistics: {
      count: largeTrades.length,
      totalVolume,
      averageSize,
      largestTrade,
    },
  };
}

/**
 * Calculate market depth metrics
 * 
 * @param bidLevels - Array of bid levels with price and volume
 * @param askLevels - Array of ask levels with price and volume
 * @returns Market depth metrics
 */
export function calculateMarketDepth(
  bidLevels: Array<{ price: number; volume: number }>,
  askLevels: Array<{ price: number; volume: number }>
): MarketDepthMetrics {
  const totalBidVolume = bidLevels.reduce((sum, level) => sum + level.volume, 0);
  const totalAskVolume = askLevels.reduce((sum, level) => sum + level.volume, 0);
  
  const totalVolume = totalBidVolume + totalAskVolume;
  const depthImbalance = totalVolume > 0
    ? (totalBidVolume - totalAskVolume) / totalVolume
    : 0;

  // Liquidity score: combination of total volume and number of levels
  const avgLevels = (bidLevels.length + askLevels.length) / 2;
  const liquidityScore = totalVolume * (1 + Math.log(1 + avgLevels));

  return {
    totalBidVolume,
    totalAskVolume,
    depthImbalance,
    liquidityScore,
    bidLevels: bidLevels.length,
    askLevels: askLevels.length,
  };
}

/**
 * Calculate time and sales metrics (tape reading)
 * 
 * @param trades - Array of trades with price, volume, timestamp, and side
 * @returns Time and sales metrics
 */
export function calculateTimeAndSales(
  trades: Array<{ price: number; volume: number; timestamp: Date; side: 'buy' | 'sell' }>
): TimeAndSalesMetrics {
  let aggressiveBuys = 0;
  let aggressiveSells = 0;
  let buyVolume = 0;
  let sellVolume = 0;

  for (const trade of trades) {
    if (trade.side === 'buy') {
      aggressiveBuys++;
      buyVolume += trade.volume;
    } else {
      aggressiveSells++;
      sellVolume += trade.volume;
    }
  }

  const totalVolume = buyVolume + sellVolume;
  const buyVolumeRatio = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 0;
  const sellVolumeRatio = totalVolume > 0 ? (sellVolume / totalVolume) * 100 : 0;
  const netFlow = buyVolume - sellVolume;

  // Calculate velocity
  let tradesPerMinute = 0;
  let volumePerMinute = 0;

  if (trades.length > 1) {
    const firstTimestamp = new Date(trades[0].timestamp).getTime();
    const lastTimestamp = new Date(trades[trades.length - 1].timestamp).getTime();
    const durationMinutes = (lastTimestamp - firstTimestamp) / (1000 * 60);

    if (durationMinutes > 0) {
      tradesPerMinute = trades.length / durationMinutes;
      volumePerMinute = totalVolume / durationMinutes;
    }
  }

  return {
    aggressiveBuys,
    aggressiveSells,
    buyVolumeRatio,
    sellVolumeRatio,
    velocity: {
      tradesPerMinute,
      volumePerMinute,
    },
    netFlow,
  };
}

/**
 * Calculate Shannon entropy for order flow distribution
 * 
 * @param distribution - Array of probability values
 * @returns Entropy value (higher = more random/less predictable)
 */
export function calculateEntropy(distribution: number[]): number {
  if (distribution.length === 0) {
    return 0;
  }

  // Normalize distribution to probabilities
  const total = distribution.reduce((sum, val) => sum + Math.abs(val), 0);
  if (total === 0) {
    return 0;
  }

  const probabilities = distribution.map(val => Math.abs(val) / total);
  
  // Calculate Shannon entropy: -Σ(p * log2(p))
  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

export interface TradingSignal {
  signal: 'buy' | 'sell' | 'hold';
  strength: number; // 0-100
  confidence: number; // 0-100
  reasons: string[];
}

/**
 * Generate trading signal based on order flow metrics
 * 
 * @param metrics - Object containing various order flow metrics
 * @returns Trading signal with strength and confidence
 */
export function generateTradingSignal(metrics: {
  orderImbalance?: OrderImbalance;
  delta?: DeltaMetrics;
  vpin?: VPINMetrics;
  depth?: MarketDepthMetrics;
  timeAndSales?: TimeAndSalesMetrics;
}): TradingSignal {
  const reasons: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;

  // Analyze order imbalance
  if (metrics.orderImbalance) {
    const weight = 20;
    totalWeight += weight;
    if (metrics.orderImbalance.signalDirection === 'bullish') {
      bullishScore += weight;
      reasons.push('Bullish order imbalance detected');
    } else if (metrics.orderImbalance.signalDirection === 'bearish') {
      bearishScore += weight;
      reasons.push('Bearish order imbalance detected');
    }
  }

  // Analyze delta
  if (metrics.delta) {
    const weight = 25;
    totalWeight += weight;
    if (metrics.delta.buyPressure > 60) {
      bullishScore += weight;
      reasons.push('Strong buy pressure in delta');
    } else if (metrics.delta.sellPressure > 60) {
      bearishScore += weight;
      reasons.push('Strong sell pressure in delta');
    }
  }

  // Analyze VPIN
  if (metrics.vpin) {
    const weight = 15;
    totalWeight += weight;
    if (metrics.vpin.toxicity === 'high' || metrics.vpin.toxicity === 'critical') {
      bearishScore += weight * 0.5;
      bullishScore += weight * 0.5;
      reasons.push('High market toxicity - caution advised');
    }
  }

  // Analyze market depth
  if (metrics.depth) {
    const weight = 20;
    totalWeight += weight;
    if (metrics.depth.depthImbalance > 0.2) {
      bullishScore += weight;
      reasons.push('Strong bid support in depth');
    } else if (metrics.depth.depthImbalance < -0.2) {
      bearishScore += weight;
      reasons.push('Strong ask resistance in depth');
    }
  }

  // Analyze time and sales
  if (metrics.timeAndSales) {
    const weight = 20;
    totalWeight += weight;
    if (metrics.timeAndSales.buyVolumeRatio > 60) {
      bullishScore += weight;
      reasons.push('Aggressive buying in tape');
    } else if (metrics.timeAndSales.sellVolumeRatio > 60) {
      bearishScore += weight;
      reasons.push('Aggressive selling in tape');
    }
  }

  // Calculate final signal
  let signal: 'buy' | 'sell' | 'hold' = 'hold';
  let strength = 0;
  let confidence = 0;

  if (totalWeight > 0) {
    const netScore = bullishScore - bearishScore;
    const normalizedScore = (netScore / totalWeight) * 100;
    
    confidence = Math.min(100, (Math.abs(normalizedScore) / 100) * 100);
    strength = Math.abs(normalizedScore);

    if (normalizedScore > 20) {
      signal = 'buy';
    } else if (normalizedScore < -20) {
      signal = 'sell';
    }
  }

  if (signal === 'hold') {
    reasons.push('Insufficient directional conviction');
  }

  return {
    signal,
    strength: Math.min(100, strength),
    confidence: Math.min(100, confidence),
    reasons,
  };
}

/**
 * Calculate VPIN (Volume-Synchronized Probability of Informed Trading)
 * 
 * @param trades - Array of trades with volume and side information
 * @param buckets - Number of volume buckets (default: 50)
 * @returns VPIN metrics and toxicity level
 */
export function calculateVPIN(
  trades: Array<{ volume: number; side?: 'buy' | 'sell'; price?: number }>,
  buckets: number = 50
): VPINMetrics {
  if (trades.length === 0) {
    return {
      vpin: 0,
      toxicity: 'low',
      buckets: 0,
      averageImbalance: 0,
    };
  }

  // Calculate total volume
  const totalVolume = trades.reduce((sum, trade) => sum + trade.volume, 0);
  const volumePerBucket = totalVolume / buckets;

  // Create volume buckets and calculate buy/sell imbalance
  const imbalances: number[] = [];
  let currentBucketVolume = 0;
  let currentBuyVolume = 0;
  let currentSellVolume = 0;

  for (const trade of trades) {
    const tradeVolume = trade.volume;
    
    // Classify as buy or sell if not specified
    const isBuy = trade.side === 'buy' || (!trade.side && Math.random() > 0.5);
    
    currentBucketVolume += tradeVolume;
    
    if (isBuy) {
      currentBuyVolume += tradeVolume;
    } else {
      currentSellVolume += tradeVolume;
    }

    // When bucket is full, calculate imbalance
    if (currentBucketVolume >= volumePerBucket) {
      const bucketTotal = currentBuyVolume + currentSellVolume;
      const imbalance = bucketTotal > 0 
        ? Math.abs(currentBuyVolume - currentSellVolume) / bucketTotal 
        : 0;
      
      imbalances.push(imbalance);
      
      // Reset for next bucket
      currentBucketVolume = 0;
      currentBuyVolume = 0;
      currentSellVolume = 0;
    }
  }

  // Calculate VPIN as average of absolute imbalances
  const averageImbalance = imbalances.length > 0
    ? imbalances.reduce((sum, imb) => sum + imb, 0) / imbalances.length
    : 0;

  const vpin = averageImbalance;

  // Determine toxicity level
  let toxicity: 'low' | 'medium' | 'high' | 'critical';
  if (vpin < 0.3) {
    toxicity = 'low';
  } else if (vpin < 0.5) {
    toxicity = 'medium';
  } else if (vpin < 0.7) {
    toxicity = 'high';
  } else {
    toxicity = 'critical';
  }

  return {
    vpin,
    toxicity,
    buckets: imbalances.length,
    averageImbalance,
  };
}