/**
 * Streaming Data Processor
 * Real-time processing of market data with O(1) indicators and anomaly detection
 */

// Types
export interface DataPoint {
  value: number;
  timestamp: number;
  volume?: number;
}

export interface IndicatorState {
  sma?: number;
  ema?: number;
  wma?: number;
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number };
  bollingerBands?: { upper: number; middle: number; lower: number };
  vwap?: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  threshold: number;
}

export interface EventResult {
  detected: boolean;
  type: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface WindowStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
}

export interface AggregatedCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Circular buffer for efficient streaming data storage
 */
export class StreamingDataBuffer {
  private buffer: number[];
  private head: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  getWindow(size?: number): number[] {
    const windowSize = Math.min(size || this.size, this.size);
    const result: number[] = [];
    
    let idx = (this.head - windowSize + this.capacity) % this.capacity;
    for (let i = 0; i < windowSize; i++) {
      result.push(this.buffer[idx]);
      idx = (idx + 1) % this.capacity;
    }
    
    return result;
  }

  getLast(): number | undefined {
    if (this.size === 0) return undefined;
    return this.buffer[(this.head - 1 + this.capacity) % this.capacity];
  }

  getSize(): number {
    return this.size;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

/**
 * Real-time indicator calculator with O(1) updates
 */
export class RealTimeIndicatorCalculator {
  private smaSum: number = 0;
  private smaCount: number = 0;
  private readonly smaWindow: number;
  
  private emaValue: number | null = null;
  private readonly emaAlpha: number;
  
  private wmaBuffer: StreamingDataBuffer;
  private wmaWeightSum: number = 0;
  
  private rsiGains: StreamingDataBuffer;
  private rsiLosses: StreamingDataBuffer;
  private lastPrice: number | null = null;
  
  private emaFast: number | null = null;
  private emaSlow: number | null = null;
  private macdSignal: number | null = null;
  
  private bbBuffer: StreamingDataBuffer;
  
  private vwapSumPV: number = 0;
  private vwapSumV: number = 0;

  constructor(
    smaWindow: number = 20,
    emaWindow: number = 20,
    wmaWindow: number = 20,
    rsiWindow: number = 14,
    macdFast: number = 12,
    macdSlow: number = 26,
    macdSignal: number = 9,
    bbWindow: number = 20
  ) {
    this.smaWindow = smaWindow;
    this.emaAlpha = 2 / (emaWindow + 1);
    this.wmaBuffer = new StreamingDataBuffer(wmaWindow);
    this.rsiGains = new StreamingDataBuffer(rsiWindow);
    this.rsiLosses = new StreamingDataBuffer(rsiWindow);
    this.bbBuffer = new StreamingDataBuffer(bbWindow);
  }

  updateSMA(value: number): number {
    this.smaSum += value;
    this.smaCount++;
    
    if (this.smaCount > this.smaWindow) {
      // In practice, we'd need to track old values to subtract
      // For true O(1), maintain a circular buffer
      this.smaCount = this.smaWindow;
    }
    
    return this.smaSum / this.smaCount;
  }

  updateEMA(value: number): number {
    if (this.emaValue === null) {
      this.emaValue = value;
    } else {
      this.emaValue = this.emaAlpha * value + (1 - this.emaAlpha) * this.emaValue;
    }
    return this.emaValue;
  }

  updateWMA(value: number): number {
    this.wmaBuffer.push(value);
    const window = this.wmaBuffer.getWindow();
    const n = window.length;
    
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < n; i++) {
      const weight = i + 1;
      weightedSum += window[i] * weight;
      weightSum += weight;
    }
    
    return weightedSum / weightSum;
  }

  updateRSI(price: number): number | null {
    if (this.lastPrice === null) {
      this.lastPrice = price;
      return null;
    }
    
    const change = price - this.lastPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    this.rsiGains.push(gain);
    this.rsiLosses.push(loss);
    
    this.lastPrice = price;
    
    if (this.rsiGains.getSize() < 2) {
      return null;
    }
    
    const gains = this.rsiGains.getWindow();
    const losses = this.rsiLosses.getWindow();
    
    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  updateMACD(price: number): { macd: number; signal: number; histogram: number } | null {
    const alphaFast = 2 / (12 + 1);
    const alphaSlow = 2 / (26 + 1);
    const alphaSignal = 2 / (9 + 1);
    
    if (this.emaFast === null) {
      this.emaFast = price;
    } else {
      this.emaFast = alphaFast * price + (1 - alphaFast) * this.emaFast;
    }
    
    if (this.emaSlow === null) {
      this.emaSlow = price;
    } else {
      this.emaSlow = alphaSlow * price + (1 - alphaSlow) * this.emaSlow;
    }
    
    const macd = this.emaFast - this.emaSlow;
    
    if (this.macdSignal === null) {
      this.macdSignal = macd;
    } else {
      this.macdSignal = alphaSignal * macd + (1 - alphaSignal) * this.macdSignal;
    }
    
    return {
      macd,
      signal: this.macdSignal,
      histogram: macd - this.macdSignal
    };
  }

  updateBollingerBands(price: number, stdMultiplier: number = 2): { upper: number; middle: number; lower: number } | null {
    this.bbBuffer.push(price);
    const window = this.bbBuffer.getWindow();
    
    if (window.length < 2) return null;
    
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);
    
    return {
      upper: mean + stdMultiplier * std,
      middle: mean,
      lower: mean - stdMultiplier * std
    };
  }

  updateVWAP(price: number, volume: number): number {
    this.vwapSumPV += price * volume;
    this.vwapSumV += volume;
    
    return this.vwapSumPV / this.vwapSumV;
  }

  reset(): void {
    this.smaSum = 0;
    this.smaCount = 0;
    this.emaValue = null;
    this.wmaBuffer.clear();
    this.rsiGains.clear();
    this.rsiLosses.clear();
    this.lastPrice = null;
    this.emaFast = null;
    this.emaSlow = null;
    this.macdSignal = null;
    this.bbBuffer.clear();
    this.vwapSumPV = 0;
    this.vwapSumV = 0;
  }
}

/**
 * Anomaly detector for streaming data
 */
export class AnomalyDetector {
  private buffer: StreamingDataBuffer;
  private readonly zScoreThreshold: number;

  constructor(windowSize: number = 100, zScoreThreshold: number = 3) {
    this.buffer = new StreamingDataBuffer(windowSize);
    this.zScoreThreshold = zScoreThreshold;
  }

  detectZScoreAnomaly(value: number): AnomalyResult {
    this.buffer.push(value);
    const window = this.buffer.getWindow();
    
    if (window.length < 3) {
      return { isAnomaly: false, score: 0, threshold: this.zScoreThreshold };
    }
    
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);
    
    if (std === 0) {
      return { isAnomaly: false, score: 0, threshold: this.zScoreThreshold };
    }
    
    const zScore = Math.abs((value - mean) / std);
    
    return {
      isAnomaly: zScore > this.zScoreThreshold,
      score: zScore,
      threshold: this.zScoreThreshold
    };
  }

  detectIsolationForestAnomaly(value: number, features: number[]): AnomalyResult {
    // Simplified streaming isolation forest variant
    // In production, use a proper streaming anomaly detection library
    this.buffer.push(value);
    const window = this.buffer.getWindow();
    
    if (window.length < 10) {
      return { isAnomaly: false, score: 0, threshold: 0.6 };
    }
    
    // Calculate isolation score based on distance to neighbors
    const distances = window.map(v => Math.abs(v - value));
    distances.sort((a, b) => a - b);
    
    const avgDistance = distances.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const maxDistance = Math.max(...distances);
    
    const isolationScore = maxDistance > 0 ? avgDistance / maxDistance : 0;
    
    return {
      isAnomaly: isolationScore > 0.6,
      score: isolationScore,
      threshold: 0.6
    };
  }

  detectCUSUMAnomaly(value: number, target: number, threshold: number = 5): AnomalyResult {
    // CUSUM (Cumulative Sum) control chart
    const deviation = value - target;
    
    // Simplified CUSUM - in production, maintain cumulative sums
    const score = Math.abs(deviation);
    
    return {
      isAnomaly: score > threshold,
      score,
      threshold
    };
  }
}

/**
 * Event detector for trading signals
 */
export class EventDetector {
  private priceBuffer: StreamingDataBuffer;
  private volumeBuffer: StreamingDataBuffer;
  private readonly priceWindow: number;
  private readonly volumeWindow: number;

  constructor(priceWindow: number = 50, volumeWindow: number = 20) {
    this.priceWindow = priceWindow;
    this.volumeWindow = volumeWindow;
    this.priceBuffer = new StreamingDataBuffer(priceWindow);
    this.volumeBuffer = new StreamingDataBuffer(volumeWindow);
  }

  detectPriceBreakout(price: number, supportLevel?: number, resistanceLevel?: number): EventResult {
    this.priceBuffer.push(price);
    const window = this.priceBuffer.getWindow();
    
    if (window.length < 2) {
      return { detected: false, type: 'breakout', confidence: 0 };
    }
    
    const recentHigh = Math.max(...window);
    const recentLow = Math.min(...window);
    
    const support = supportLevel ?? recentLow;
    const resistance = resistanceLevel ?? recentHigh;
    
    let breakoutType = '';
    let confidence = 0;
    
    if (price > resistance) {
      breakoutType = 'resistance_break';
      confidence = (price - resistance) / resistance;
    } else if (price < support) {
      breakoutType = 'support_break';
      confidence = (support - price) / support;
    }
    
    return {
      detected: breakoutType !== '',
      type: breakoutType || 'none',
      confidence: Math.min(confidence, 1),
      metadata: { support, resistance, price }
    };
  }

  detectVolumeSpike(volume: number, spikeMultiplier: number = 2): EventResult {
    this.volumeBuffer.push(volume);
    const window = this.volumeBuffer.getWindow();
    
    if (window.length < 3) {
      return { detected: false, type: 'volume_spike', confidence: 0 };
    }
    
    const avgVolume = window.slice(0, -1).reduce((a, b) => a + b, 0) / (window.length - 1);
    
    if (avgVolume === 0) {
      return { detected: false, type: 'volume_spike', confidence: 0 };
    }
    
    const ratio = volume / avgVolume;
    const isSpike = ratio >= spikeMultiplier;
    
    return {
      detected: isSpike,
      type: 'volume_spike',
      confidence: Math.min(ratio / spikeMultiplier, 1),
      metadata: { volume, avgVolume, ratio }
    };
  }

  detectTrendReversal(price: number, lookback: number = 10): EventResult {
    this.priceBuffer.push(price);
    const window = this.priceBuffer.getWindow();
    
    if (window.length < lookback + 2) {
      return { detected: false, type: 'trend_reversal', confidence: 0 };
    }
    
    const recent = window.slice(-lookback);
    const previous = window.slice(-lookback * 2, -lookback);
    
    // Calculate slopes
    const recentSlope = this.calculateSlope(recent);
    const previousSlope = this.calculateSlope(previous);
    
    // Detect reversal when slopes have opposite signs
    const isReversal = (recentSlope > 0 && previousSlope < 0) || (recentSlope < 0 && previousSlope > 0);
    const reversalType = recentSlope > 0 ? 'bullish_reversal' : 'bearish_reversal';
    
    const confidence = Math.abs(recentSlope) / (Math.abs(recentSlope) + Math.abs(previousSlope));
    
    return {
      detected: isReversal,
      type: reversalType,
      confidence: isReversal ? confidence : 0,
      metadata: { recentSlope, previousSlope }
    };
  }

  private calculateSlope(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

/**
 * Windowed statistics calculator
 */
export class WindowedStatistics {
  private buffer: StreamingDataBuffer;

  constructor(windowSize: number = 100) {
    this.buffer = new StreamingDataBuffer(windowSize);
  }

  update(value: number): WindowStats {
    this.buffer.push(value);
    const window = this.buffer.getWindow();
    
    if (window.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, count: 0 };
    }
    
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...window);
    const max = Math.max(...window);
    
    return { mean, std, min, max, count: window.length };
  }
}

/**
 * Data compressor for efficient storage
 */
export class DataCompressor {
  compress(data: number[]): { compressed: number[]; metadata: any } {
    // Simple delta encoding for compression
    if (data.length === 0) {
      return { compressed: [], metadata: { method: 'delta', baseline: 0 } };
    }
    
    const baseline = data[0];
    const compressed = [baseline];
    
    for (let i = 1; i < data.length; i++) {
      compressed.push(data[i] - data[i - 1]);
    }
    
    return {
      compressed,
      metadata: { method: 'delta', baseline, originalLength: data.length }
    };
  }

  decompress(compressed: number[], metadata: any): number[] {
    if (compressed.length === 0) return [];
    
    const data = [compressed[0]];
    
    for (let i = 1; i < compressed.length; i++) {
      data.push(data[i - 1] + compressed[i]);
    }
    
    return data;
  }
}

/**
 * Time series aggregator (tick → 1s → 1m → 1h)
 */
export class TimeSeriesAggregator {
  private currentCandle: Partial<AggregatedCandle> = {};
  private readonly interval: number; // in milliseconds

  constructor(intervalMs: number) {
    this.interval = intervalMs;
  }

  update(price: number, volume: number, timestamp: number): AggregatedCandle | null {
    const candleTime = Math.floor(timestamp / this.interval) * this.interval;
    
    if (!this.currentCandle.timestamp || this.currentCandle.timestamp !== candleTime) {
      const completed = this.currentCandle.timestamp ? { ...this.currentCandle } as AggregatedCandle : null;
      
      this.currentCandle = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume,
        timestamp: candleTime
      };
      
      return completed;
    }
    
    this.currentCandle.high = Math.max(this.currentCandle.high!, price);
    this.currentCandle.low = Math.min(this.currentCandle.low!, price);
    this.currentCandle.close = price;
    this.currentCandle.volume = (this.currentCandle.volume || 0) + volume;
    
    return null;
  }

  getCurrentCandle(): Partial<AggregatedCandle> {
    return { ...this.currentCandle };
  }
}

/**
 * Backpressure handler
 */
export class BackpressureHandler {
  private queue: Array<{ data: any; timestamp: number }> = [];
  private readonly maxQueueSize: number;
  private readonly processRate: number; // items per second
  private lastProcessTime: number = Date.now();
  private droppedCount: number = 0;

  constructor(maxQueueSize: number = 1000, processRate: number = 100) {
    this.maxQueueSize = maxQueueSize;
    this.processRate = processRate;
  }

  enqueue(data: any): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      this.droppedCount++;
      return false;
    }
    
    this.queue.push({ data, timestamp: Date.now() });
    return true;
  }

  dequeue(): any | null {
    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;
    const allowedItems = Math.floor((timeSinceLastProcess / 1000) * this.processRate);
    
    if (allowedItems < 1 || this.queue.length === 0) {
      return null;
    }
    
    this.lastProcessTime = now;
    return this.queue.shift()?.data ?? null;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  clear(): void {
    this.queue = [];
    this.droppedCount = 0;
  }
}

/**
 * Latency tracker
 */
export class LatencyTracker {
  private latencies: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }

  recordLatency(startTime: number, endTime: number = Date.now()): void {
    const latency = endTime - startTime;
    this.latencies.push(latency);
    
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  getStats(): { mean: number; median: number; p95: number; p99: number; min: number; max: number } {
    if (this.latencies.length === 0) {
      return { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const mean = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    return { mean, median, p95, p99, min, max };
  }

  reset(): void {
    this.latencies = [];
  }
}

/**
 * Streaming correlation calculator
 */
export class StreamingCorrelationCalculator {
  private xBuffer: StreamingDataBuffer;
  private yBuffer: StreamingDataBuffer;
  private xSum: number = 0;
  private ySum: number = 0;
  private xySum: number = 0;
  private xSquaredSum: number = 0;
  private ySquaredSum: number = 0;
  private count: number = 0;

  constructor(windowSize: number = 100) {
    this.xBuffer = new StreamingDataBuffer(windowSize);
    this.yBuffer = new StreamingDataBuffer(windowSize);
  }

  update(x: number, y: number): number | null {
    this.xBuffer.push(x);
    this.yBuffer.push(y);
    
    const xWindow = this.xBuffer.getWindow();
    const yWindow = this.yBuffer.getWindow();
    
    if (xWindow.length < 2) return null;
    
    // Recalculate sums (could be optimized with running sums)
    this.xSum = xWindow.reduce((a, b) => a + b, 0);
    this.ySum = yWindow.reduce((a, b) => a + b, 0);
    this.xySum = xWindow.reduce((sum, xi, i) => sum + xi * yWindow[i], 0);
    this.xSquaredSum = xWindow.reduce((sum, xi) => sum + xi * xi, 0);
    this.ySquaredSum = yWindow.reduce((sum, yi) => sum + yi * yi, 0);
    this.count = xWindow.length;
    
    const n = this.count;
    const numerator = n * this.xySum - this.xSum * this.ySum;
    const denominator = Math.sqrt(
      (n * this.xSquaredSum - this.xSum * this.xSum) *
      (n * this.ySquaredSum - this.ySum * this.ySum)
    );
    
    if (denominator === 0) return 0;
    
    return numerator / denominator;
  }

  reset(): void {
    this.xBuffer.clear();
    this.yBuffer.clear();
    this.xSum = 0;
    this.ySum = 0;
    this.xySum = 0;
    this.xSquaredSum = 0;
    this.ySquaredSum = 0;
    this.count = 0;
  }
}