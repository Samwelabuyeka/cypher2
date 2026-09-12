/**
 * Technical Analysis Indicators Library
 * Comprehensive collection of technical indicators for trading strategies
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const sma: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }
  
  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let previousEMA = sum / period;
  ema.push(previousEMA);
  
  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] - previousEMA) * multiplier + previousEMA;
    ema.push(currentEMA);
    previousEMA = currentEMA;
  }
  
  return ema;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

// ============================================================================
// Main Technical Indicators
// ============================================================================

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(prices: number[], period = 14): number[] {
  if (prices.length < period + 1) {
    return [];
  }

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  
  // Calculate RSI for first period
  if (avgGain === 0 && avgLoss === 0) {
    rsi.push(50);
  } else if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Calculate RSI for remaining periods using smoothed averages
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    if (avgGain === 0 && avgLoss === 0) {
      rsi.push(50);
    } else if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  prices: number[], 
  fastPeriod = 12, 
  slowPeriod = 26, 
  signalPeriod = 9
): { macd: number[], signal: number[], histogram: number[] } {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  if (fastEMA.length === 0 || slowEMA.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }
  
  // Calculate MACD line
  const offset = slowPeriod - fastPeriod;
  const macd: number[] = [];
  
  for (let i = 0; i < slowEMA.length; i++) {
    macd.push(fastEMA[i + offset] - slowEMA[i]);
  }
  
  // Calculate signal line (EMA of MACD)
  const signal = calculateEMA(macd, signalPeriod);
  
  // Calculate histogram
  const histogram: number[] = [];
  const signalOffset = macd.length - signal.length;
  
  for (let i = 0; i < signal.length; i++) {
    histogram.push(macd[i + signalOffset] - signal[i]);
  }
  
  return { macd, signal, histogram };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  prices: number[], 
  period = 20, 
  stdDev = 2
): { upper: number[], middle: number[], lower: number[] } {
  if (prices.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((sum, val) => sum + val, 0) / period;
    const std = calculateStdDev(slice);
    
    middle.push(sma);
    upper.push(sma + (stdDev * std));
    lower.push(sma - (stdDev * std));
  }
  
  return { upper, middle, lower };
}

/**
 * Calculate Stochastic Oscillator
 */
export function calculateStochastic(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  period = 14
): { k: number[], d: number[] } {
  if (highs.length < period || lows.length < period || closes.length < period) {
    return { k: [], d: [] };
  }

  const k: number[] = [];
  
  for (let i = period - 1; i < closes.length; i++) {
    const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
    const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
    const currentClose = closes[i];
    
    const kValue = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    k.push(kValue);
  }
  
  // Calculate %D (3-period SMA of %K)
  const d = calculateSMA(k, 3);
  
  return { k, d };
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  period = 14
): number[] {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return [];
  }

  const trueRanges: number[] = [];
  
  // Calculate true ranges
  for (let i = 1; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  // Calculate ATR using EMA of true ranges
  return calculateEMA(trueRanges, period);
}

/**
 * Calculate Average Directional Index (ADX)
 */
export function calculateADX(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  period = 14
): { adx: number[], plusDI: number[], minusDI: number[] } {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return { adx: [], plusDI: [], minusDI: [] };
  }

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];
  
  // Calculate directional movements and true ranges
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];
    
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  // Calculate smoothed values
  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);
  const smoothedTR = calculateEMA(trueRanges, period);
  
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];
  
  // Calculate directional indicators and DX
  for (let i = 0; i < smoothedTR.length; i++) {
    const pdi = smoothedTR[i] === 0 ? 0 : (smoothedPlusDM[i] / smoothedTR[i]) * 100;
    const mdi = smoothedTR[i] === 0 ? 0 : (smoothedMinusDM[i] / smoothedTR[i]) * 100;
    
    plusDI.push(pdi);
    minusDI.push(mdi);
    
    const dxValue = (pdi + mdi) === 0 ? 0 : (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
    dx.push(dxValue);
  }
  
  // Calculate ADX (smoothed average of DX)
  const adx = calculateEMA(dx, period);
  
  return { adx, plusDI, minusDI };
}

/**
 * Calculate On-Balance Volume (OBV)
 */
export function calculateOBV(closes: number[], volumes: number[]): number[] {
  if (closes.length !== volumes.length || closes.length < 2) {
    return [];
  }

  const obv: number[] = [volumes[0]];
  
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  
  return obv;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  volumes: number[]
): number[] {
  if (highs.length !== lows.length || 
      lows.length !== closes.length || 
      closes.length !== volumes.length) {
    return [];
  }

  const vwap: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const tpv = typicalPrice * volumes[i];
    
    cumulativeTPV += tpv;
    cumulativeVolume += volumes[i];
    
    vwap.push(cumulativeVolume === 0 ? typicalPrice : cumulativeTPV / cumulativeVolume);
  }
  
  return vwap;
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Detect support and resistance levels
 */
export function detectSupportResistance(
  prices: number[], 
  windowSize = 10
): { support: number[], resistance: number[] } {
  if (prices.length < windowSize * 2 + 1) {
    return { support: [], resistance: [] };
  }

  const support: number[] = [];
  const resistance: number[] = [];
  
  for (let i = windowSize; i < prices.length - windowSize; i++) {
    const window = prices.slice(i - windowSize, i + windowSize + 1);
    const current = prices[i];
    
    // Check if local minimum (support)
    const isLocalMin = window.every((price, idx) => {
      return idx === windowSize || price >= current;
    });
    
    if (isLocalMin) {
      support.push(current);
    }
    
    // Check if local maximum (resistance)
    const isLocalMax = window.every((price, idx) => {
      return idx === windowSize || price <= current;
    });
    
    if (isLocalMax) {
      resistance.push(current);
    }
  }
  
  return { support, resistance };
}

/**
 * Detect chart patterns
 */
export function detectPatterns(prices: number[]): Array<{
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}> {
  const patterns: Array<{
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  // Minimum data points needed for pattern detection
  if (prices.length < 20) {
    return patterns;
  }
  
  // Detect Head and Shoulders
  const headAndShoulders = detectHeadAndShoulders(prices);
  patterns.push(...headAndShoulders);
  
  // Detect Double Top/Bottom
  const doubleTops = detectDoubleTop(prices);
  patterns.push(...doubleTops);
  
  const doubleBottoms = detectDoubleBottom(prices);
  patterns.push(...doubleBottoms);
  
  // Detect Triangles
  const triangles = detectTriangles(prices);
  patterns.push(...triangles);
  
  return patterns;
}

/**
 * Detect Head and Shoulders pattern
 */
function detectHeadAndShoulders(prices: number[]): Array<{
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}> {
  const patterns: Array<{
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  const { support, resistance } = detectSupportResistance(prices, 5);
  
  if (resistance.length >= 3) {
    for (let i = 0; i < resistance.length - 2; i++) {
      const leftShoulder = resistance[i];
      const head = resistance[i + 1];
      const rightShoulder = resistance[i + 2];
      
      // Check if middle peak is higher (head)
      if (head > leftShoulder && head > rightShoulder) {
        // Check if shoulders are roughly equal
        const shoulderDiff = Math.abs(leftShoulder - rightShoulder);
        const avgShoulder = (leftShoulder + rightShoulder) / 2;
        const shoulderTolerance = avgShoulder * 0.02; // 2% tolerance
        
        if (shoulderDiff <= shoulderTolerance) {
          const confidence = Math.max(0, 100 - (shoulderDiff / avgShoulder) * 100);
          let startIdx = prices.indexOf(leftShoulder);
          let endIdx = prices.indexOf(rightShoulder, startIdx + 1);
          if (endIdx === -1) endIdx = prices.indexOf(rightShoulder);
          patterns.push({
            type: 'head-and-shoulders',
            confidence: Math.min(confidence, 100),
            startIndex: startIdx,
            endIndex: endIdx
          });
        }
      }
    }
  }
  
  return patterns;
}

/**
 * Detect Double Top pattern
 */
function detectDoubleTop(prices: number[]): Array<{
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}> {
  const patterns: Array<{
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  const { resistance } = detectSupportResistance(prices, 5);
  
  if (resistance.length >= 2) {
    for (let i = 0; i < resistance.length - 1; i++) {
      const firstPeak = resistance[i];
      const secondPeak = resistance[i + 1];
      
      // Check if peaks are roughly equal
      const peakDiff = Math.abs(firstPeak - secondPeak);
      const avgPeak = (firstPeak + secondPeak) / 2;
      const tolerance = avgPeak * 0.015; // 1.5% tolerance
      
      if (peakDiff <= tolerance) {
        const confidence = Math.max(0, 100 - (peakDiff / avgPeak) * 100);
        let startIdx = prices.indexOf(firstPeak);
        let endIdx = prices.indexOf(secondPeak, startIdx + 1);
        if (endIdx === -1) endIdx = prices.indexOf(secondPeak);
        patterns.push({
          type: 'double-top',
          confidence: Math.min(confidence, 100),
          startIndex: startIdx,
          endIndex: endIdx
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Detect Double Bottom pattern
 */
function detectDoubleBottom(prices: number[]): Array<{
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}> {
  const patterns: Array<{
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  const { support } = detectSupportResistance(prices, 5);
  
  if (support.length >= 2) {
    for (let i = 0; i < support.length - 1; i++) {
      const firstBottom = support[i];
      const secondBottom = support[i + 1];
      
      // Check if bottoms are roughly equal
      const bottomDiff = Math.abs(firstBottom - secondBottom);
      const avgBottom = (firstBottom + secondBottom) / 2;
      const tolerance = avgBottom * 0.015; // 1.5% tolerance
      
      if (bottomDiff <= tolerance) {
        const confidence = Math.max(0, 100 - (bottomDiff / avgBottom) * 100);
        let startIdx = prices.indexOf(firstBottom);
        let endIdx = prices.indexOf(secondBottom, startIdx + 1);
        if (endIdx === -1) endIdx = prices.indexOf(secondBottom);
        patterns.push({
          type: 'double-bottom',
          confidence: Math.min(confidence, 100),
          startIndex: startIdx,
          endIndex: endIdx
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Detect Triangle patterns
 */
function detectTriangles(prices: number[]): Array<{
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}> {
  const patterns: Array<{
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  if (prices.length < 30) {
    return patterns;
  }
  
  // Analyze price ranges in segments
  const segmentSize = 10;
  const segments = Math.floor(prices.length / segmentSize);
  
  if (segments < 3) {
    return patterns;
  }
  
  for (let i = 0; i < segments - 2; i++) {
    const segment1 = prices.slice(i * segmentSize, (i + 1) * segmentSize);
    const segment2 = prices.slice((i + 1) * segmentSize, (i + 2) * segmentSize);
    const segment3 = prices.slice((i + 2) * segmentSize, (i + 3) * segmentSize);
    
    const range1 = Math.max(...segment1) - Math.min(...segment1);
    const range2 = Math.max(...segment2) - Math.min(...segment2);
    const range3 = Math.max(...segment3) - Math.min(...segment3);
    
    // Converging ranges indicate triangle
    if (range1 > range2 && range2 > range3) {
      const convergence = ((range1 - range3) / range1) * 100;
      patterns.push({
        type: 'triangle',
        confidence: Math.min(convergence, 100),
        startIndex: i * segmentSize,
        endIndex: (i + 3) * segmentSize
      });
    }
  }
  
  return patterns;
}

// ============================================================================
// Ichimoku Cloud
// ============================================================================

/**
 * Calculate Ichimoku Cloud indicator
 */
export function calculateIchimoku(
  highs: number[],
  lows: number[],
  closes: number[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52
): {
  tenkanSen: number[];
  kijunSen: number[];
  senkouSpanA: number[];
  senkouSpanB: number[];
  chikouSpan: number[];
} {
  if (highs.length < senkouBPeriod || lows.length < senkouBPeriod || closes.length < senkouBPeriod) {
    return {
      tenkanSen: [],
      kijunSen: [],
      senkouSpanA: [],
      senkouSpanB: [],
      chikouSpan: []
    };
  }

  const tenkanSen: number[] = [];
  const kijunSen: number[] = [];
  const senkouSpanA: number[] = [];
  const senkouSpanB: number[] = [];
  const chikouSpan: number[] = [];

  // Calculate Tenkan-sen (Conversion Line)
  for (let i = tenkanPeriod - 1; i < highs.length; i++) {
    const periodHighs = highs.slice(i - tenkanPeriod + 1, i + 1);
    const periodLows = lows.slice(i - tenkanPeriod + 1, i + 1);
    const highest = Math.max(...periodHighs);
    const lowest = Math.min(...periodLows);
    tenkanSen.push((highest + lowest) / 2);
  }

  // Calculate Kijun-sen (Base Line)
  for (let i = kijunPeriod - 1; i < highs.length; i++) {
    const periodHighs = highs.slice(i - kijunPeriod + 1, i + 1);
    const periodLows = lows.slice(i - kijunPeriod + 1, i + 1);
    const highest = Math.max(...periodHighs);
    const lowest = Math.min(...periodLows);
    kijunSen.push((highest + lowest) / 2);
  }

  // Calculate Senkou Span A (Leading Span A)
  const spanAOffset = kijunPeriod - tenkanPeriod;
  for (let i = 0; i < kijunSen.length; i++) {
    if (i + spanAOffset < tenkanSen.length) {
      senkouSpanA.push((tenkanSen[i + spanAOffset] + kijunSen[i]) / 2);
    }
  }

  // Calculate Senkou Span B (Leading Span B)
  for (let i = senkouBPeriod - 1; i < highs.length; i++) {
    const periodHighs = highs.slice(i - senkouBPeriod + 1, i + 1);
    const periodLows = lows.slice(i - senkouBPeriod + 1, i + 1);
    const highest = Math.max(...periodHighs);
    const lowest = Math.min(...periodLows);
    senkouSpanB.push((highest + lowest) / 2);
  }

  // Calculate Chikou Span (Lagging Span)
  // Chikou Span is the current closing price plotted 26 periods back
  for (let i = 0; i < closes.length - kijunPeriod; i++) {
    chikouSpan.push(closes[i + kijunPeriod]);
  }

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan
  };
}

// ============================================================================
// Comprehensive Indicator Calculator
// ============================================================================

/**
 * Calculate multiple technical indicators at once
 */
export function calculateTechnicalIndicators(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): {
  sma: number[];
  ema: number[];
  rsi: number[];
  macd: { macd: number[], signal: number[], histogram: number[] };
  bollingerBands: { upper: number[], middle: number[], lower: number[] };
  stochastic: { k: number[], d: number[] };
  atr: number[];
  adx: { adx: number[], plusDI: number[], minusDI: number[] };
  obv: number[];
  vwap: number[];
  ichimoku: {
    tenkanSen: number[];
    kijunSen: number[];
    senkouSpanA: number[];
    senkouSpanB: number[];
    chikouSpan: number[];
  };
  supportResistance: { support: number[], resistance: number[] };
} {
  return {
    sma: calculateSMA(closes, 20),
    ema: calculateEMA(closes, 20),
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes, 12, 26, 9),
    bollingerBands: calculateBollingerBands(closes, 20, 2),
    stochastic: calculateStochastic(highs, lows, closes, 14),
    atr: calculateATR(highs, lows, closes, 14),
    adx: calculateADX(highs, lows, closes, 14),
    obv: calculateOBV(closes, volumes),
    vwap: calculateVWAP(highs, lows, closes, volumes),
    ichimoku: calculateIchimoku(highs, lows, closes, 9, 26, 52),
    supportResistance: detectSupportResistance(closes, 10)
  };
}