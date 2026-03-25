/**
 * Comprehensive Technical Indicators Library
 * Provides trend, momentum, volatility, volume indicators and pattern recognition
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface OHLCVData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number | Date;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
}

export interface StochasticResult {
  k: number;
  d: number;
}

export interface IchimokuResult {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
}

export interface KeltnerChannelsResult {
  upper: number;
  middle: number;
  lower: number;
}

export interface DonchianChannelsResult {
  upper: number;
  middle: number;
  lower: number;
}

export interface PivotPointsResult {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface FibonacciLevels {
  level0: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  level1000: number;
}

export interface CandlestickPattern {
  name: string;
  bullish: boolean;
  strength: number; // 1-3
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateData(data: number[], minLength: number, name: string): void {
  if (!Array.isArray(data)) {
    throw new Error(`${name}: data must be an array`);
  }
  if (data.length < minLength) {
    throw new Error(`${name}: insufficient data (need at least ${minLength} points)`);
  }
  if (data.some((v) => typeof v !== "number" || isNaN(v))) {
    throw new Error(`${name}: data contains invalid values`);
  }
}

function validatePeriod(period: number, name: string): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(`${name}: period must be a positive integer`);
  }
}

function sum(arr: number[]): number {
  return arr.reduce((acc, val) => acc + val, 0);
}

function mean(arr: number[]): number {
  return sum(arr) / arr.length;
}

function standardDeviation(arr: number[], meanValue?: number): number {
  const avg = meanValue ?? mean(arr);
  const squareDiffs = arr.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

// ============================================================================
// Trend Indicators
// ============================================================================

/**
 * Simple Moving Average
 */
export function SMA(data: number[], period: number): number[] {
  validateData(data, period, "SMA");
  validatePeriod(period, "SMA");

  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    result.push(mean(slice));
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function EMA(data: number[], period: number): number[] {
  validateData(data, period, "EMA");
  validatePeriod(period, "EMA");

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // Start with SMA for first value
  let ema = mean(data.slice(0, period));
  result.push(ema);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }

  return result;
}

/**
 * Weighted Moving Average
 */
export function WMA(data: number[], period: number): number[] {
  validateData(data, period, "WMA");
  validatePeriod(period, "WMA");

  const result: number[] = [];
  const divisor = (period * (period + 1)) / 2;

  for (let i = period - 1; i < data.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += data[i - period + 1 + j] * (j + 1);
    }
    result.push(weightedSum / divisor);
  }

  return result;
}

/**
 * Double Exponential Moving Average
 */
export function DEMA(data: number[], period: number): number[] {
  validateData(data, period * 2, "DEMA");
  validatePeriod(period, "DEMA");

  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1, period);

  return ema1.slice(ema1.length - ema2.length).map((val, i) => 2 * val - ema2[i]);
}

/**
 * Triple Exponential Moving Average
 */
export function TEMA(data: number[], period: number): number[] {
  validateData(data, period * 3, "TEMA");
  validatePeriod(period, "TEMA");

  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1, period);
  const ema3 = EMA(ema2, period);

  const minLength = Math.min(ema1.length, ema2.length, ema3.length);
  return Array.from({ length: minLength }, (_, i) => {
    const idx1 = ema1.length - minLength + i;
    const idx2 = ema2.length - minLength + i;
    const idx3 = ema3.length - minLength + i;
    return 3 * ema1[idx1] - 3 * ema2[idx2] + ema3[idx3];
  });
}

/**
 * Moving Average Convergence Divergence
 */
export function MACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult[] {
  validateData(data, slowPeriod, "MACD");
  validatePeriod(fastPeriod, "MACD fastPeriod");
  validatePeriod(slowPeriod, "MACD slowPeriod");
  validatePeriod(signalPeriod, "MACD signalPeriod");

  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);

  const offset = fastEMA.length - slowEMA.length;
  const macdLine = slowEMA.map((val, i) => fastEMA[i + offset] - val);
  const signalLine = EMA(macdLine, signalPeriod);

  const signalOffset = macdLine.length - signalLine.length;
  return signalLine.map((signal, i) => ({
    macd: macdLine[i + signalOffset],
    signal,
    histogram: macdLine[i + signalOffset] - signal,
  }));
}

/**
 * Parabolic SAR
 */
export function ParabolicSAR(
  data: OHLCVData[],
  accelerationFactor: number = 0.02,
  maxAcceleration: number = 0.2
): number[] {
  validateData(
    data.map((d) => d.close),
    2,
    "ParabolicSAR"
  );

  const result: number[] = [];
  let isUptrend = true;
  let sar = data[0].low;
  let ep = data[0].high; // Extreme point
  let af = accelerationFactor;

  for (let i = 1; i < data.length; i++) {
    const { high, low } = data[i];

    // Update SAR
    sar = sar + af * (ep - sar);

    // Check for trend reversal
    if (isUptrend) {
      if (low < sar) {
        isUptrend = false;
        sar = ep;
        ep = low;
        af = accelerationFactor;
      } else {
        if (high > ep) {
          ep = high;
          af = Math.min(af + accelerationFactor, maxAcceleration);
        }
        sar = Math.min(sar, data[i - 1].low, i > 1 ? data[i - 2].low : data[i - 1].low);
      }
    } else {
      if (high > sar) {
        isUptrend = true;
        sar = ep;
        ep = high;
        af = accelerationFactor;
      } else {
        if (low < ep) {
          ep = low;
          af = Math.min(af + accelerationFactor, maxAcceleration);
        }
        sar = Math.max(sar, data[i - 1].high, i > 1 ? data[i - 2].high : data[i - 1].high);
      }
    }

    result.push(sar);
  }

  return result;
}

/**
 * Average Directional Index
 */
export function ADX(data: OHLCVData[], period: number = 14): number[] {
  validateData(
    data.map((d) => d.close),
    period * 2,
    "ADX"
  );
  validatePeriod(period, "ADX");

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevHigh = data[i - 1].high;
    const prevLow = data[i - 1].low;
    const prevClose = data[i - 1].close;

    // True Range
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    tr.push(Math.max(tr1, tr2, tr3));

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const atr = EMA(tr, period);
  const plusDI = EMA(plusDM, period).map((val, i) => (val / atr[i]) * 100);
  const minusDI = EMA(minusDM, period).map((val, i) => (val / atr[i]) * 100);

  const dx = plusDI.map((val, i) => (Math.abs(val - minusDI[i]) / (val + minusDI[i])) * 100);
  return EMA(dx, period);
}

/**
 * Ichimoku Cloud
 */
export function IchimokuCloud(
  data: OHLCVData[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52
): IchimokuResult[] {
  validateData(
    data.map((d) => d.close),
    senkouBPeriod,
    "IchimokuCloud"
  );

  const result: IchimokuResult[] = [];

  for (let i = Math.max(tenkanPeriod, kijunPeriod, senkouBPeriod) - 1; i < data.length; i++) {
    // Tenkan-sen (Conversion Line)
    const tenkanHigh = Math.max(...data.slice(i - tenkanPeriod + 1, i + 1).map((d) => d.high));
    const tenkanLow = Math.min(...data.slice(i - tenkanPeriod + 1, i + 1).map((d) => d.low));
    const tenkanSen = (tenkanHigh + tenkanLow) / 2;

    // Kijun-sen (Base Line)
    const kijunHigh = Math.max(...data.slice(i - kijunPeriod + 1, i + 1).map((d) => d.high));
    const kijunLow = Math.min(...data.slice(i - kijunPeriod + 1, i + 1).map((d) => d.low));
    const kijunSen = (kijunHigh + kijunLow) / 2;

    // Senkou Span A (Leading Span A)
    const senkouSpanA = (tenkanSen + kijunSen) / 2;

    // Senkou Span B (Leading Span B)
    const senkouBHigh = Math.max(...data.slice(i - senkouBPeriod + 1, i + 1).map((d) => d.high));
    const senkouBLow = Math.min(...data.slice(i - senkouBPeriod + 1, i + 1).map((d) => d.low));
    const senkouSpanB = (senkouBHigh + senkouBLow) / 2;

    // Chikou Span (Lagging Span)
    const chikouSpan = data[i].close;

    result.push({
      tenkanSen,
      kijunSen,
      senkouSpanA,
      senkouSpanB,
      chikouSpan,
    });
  }

  return result;
}

/**
 * SuperTrend
 */
export function SuperTrend(data: OHLCVData[], period: number = 10, multiplier: number = 3): number[] {
  validateData(
    data.map((d) => d.close),
    period,
    "SuperTrend"
  );

  const atr = ATR(data, period);
  const result: number[] = [];
  let upperBand: number;
  let lowerBand: number;
  let superTrend = 0;
  let isUptrend = true;

  for (let i = 0; i < atr.length; i++) {
    const idx = i + period - 1;
    const hl2 = (data[idx].high + data[idx].low) / 2;

    upperBand = hl2 + multiplier * atr[i];
    lowerBand = hl2 - multiplier * atr[i];

    if (i > 0) {
      if (upperBand < result[i - 1] || data[idx - 1].close > result[i - 1]) {
        upperBand = Math.min(upperBand, result[i - 1]);
      }
      if (lowerBand > result[i - 1] || data[idx - 1].close < result[i - 1]) {
        lowerBand = Math.max(lowerBand, result[i - 1]);
      }
    }

    if (data[idx].close <= upperBand) {
      superTrend = upperBand;
      isUptrend = false;
    } else {
      superTrend = lowerBand;
      isUptrend = true;
    }

    result.push(superTrend);
  }

  return result;
}

// ============================================================================
// Momentum Indicators
// ============================================================================

/**
 * Relative Strength Index
 */
export function RSI(data: number[], period: number = 14): number[] {
  validateData(data, period + 1, "RSI");
  validatePeriod(period, "RSI");

  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }

  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

  const avgGains = EMA(gains, period);
  const avgLosses = EMA(losses, period);

  return avgGains.map((gain, i) => {
    const loss = avgLosses[i];
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  });
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(
  data: OHLCVData[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smooth: number = 3
): StochasticResult[] {
  validateData(
    data.map((d) => d.close),
    kPeriod,
    "Stochastic"
  );

  const kValues: number[] = [];

  for (let i = kPeriod - 1; i < data.length; i++) {
    const period = data.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...period.map((d) => d.high));
    const lowest = Math.min(...period.map((d) => d.low));
    const close = data[i].close;

    const k = ((close - lowest) / (highest - lowest)) * 100;
    kValues.push(k);
  }

  const smoothedK = SMA(kValues, smooth);
  const dValues = SMA(smoothedK, dPeriod);

  const offset = smoothedK.length - dValues.length;
  return dValues.map((d, i) => ({
    k: smoothedK[i + offset],
    d,
  }));
}

/**
 * Williams %R
 */
export function WilliamsR(data: OHLCVData[], period: number = 14): number[] {
  validateData(
    data.map((d) => d.close),
    period,
    "WilliamsR"
  );

  const result: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const periodData = data.slice(i - period + 1, i + 1);
    const highest = Math.max(...periodData.map((d) => d.high));
    const lowest = Math.min(...periodData.map((d) => d.low));
    const close = data[i].close;

    result.push(((highest - close) / (highest - lowest)) * -100);
  }

  return result;
}

/**
 * Commodity Channel Index
 */
export function CCI(data: OHLCVData[], period: number = 20): number[] {
  validateData(
    data.map((d) => d.close),
    period,
    "CCI"
  );

  const typicalPrices = data.map((d) => (d.high + d.low + d.close) / 3);
  const sma = SMA(typicalPrices, period);
  const result: number[] = [];

  for (let i = 0; i < sma.length; i++) {
    const idx = i + period - 1;
    const slice = typicalPrices.slice(idx - period + 1, idx + 1);
    const meanDeviation = mean(slice.map((val) => Math.abs(val - sma[i])));

    result.push((typicalPrices[idx] - sma[i]) / (0.015 * meanDeviation));
  }

  return result;
}

/**
 * Rate of Change
 */
export function ROC(data: number[], period: number = 12): number[] {
  validateData(data, period + 1, "ROC");
  validatePeriod(period, "ROC");

  const result: number[] = [];

  for (let i = period; i < data.length; i++) {
    result.push(((data[i] - data[i - period]) / data[i - period]) * 100);
  }

  return result;
}

/**
 * Money Flow Index
 */
export function MFI(data: OHLCVData[], period: number = 14): number[] {
  validateData(
    data.map((d) => d.close),
    period + 1,
    "MFI"
  );

  const typicalPrices = data.map((d) => (d.high + d.low + d.close) / 3);
  const moneyFlows = typicalPrices.map((tp, i) => tp * data[i].volume);

  const result: number[] = [];

  for (let i = period; i < data.length; i++) {
    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrices[j] > typicalPrices[j - 1]) {
        positiveFlow += moneyFlows[j];
      } else {
        negativeFlow += moneyFlows[j];
      }
    }

    const moneyRatio = positiveFlow / (negativeFlow || 1);
    const mfi = 100 - 100 / (1 + moneyRatio);
    result.push(mfi);
  }

  return result;
}

// ============================================================================
// Volatility Indicators
// ============================================================================

/**
 * Bollinger Bands
 */
export function BollingerBands(data: number[], period: number = 20, stdDev: number = 2): BollingerBandsResult[] {
  validateData(data, period, "BollingerBands");
  validatePeriod(period, "BollingerBands");

  const sma = SMA(data, period);
  const result: BollingerBandsResult[] = [];

  for (let i = 0; i < sma.length; i++) {
    const idx = i + period - 1;
    const slice = data.slice(idx - period + 1, idx + 1);
    const std = standardDeviation(slice, sma[i]);

    result.push({
      upper: sma[i] + stdDev * std,
      middle: sma[i],
      lower: sma[i] - stdDev * std,
    });
  }

  return result;
}

/**
 * Average True Range
 */
export function ATR(data: OHLCVData[], period: number = 14): number[] {
  validateData(
    data.map((d) => d.close),
    period + 1,
    "ATR"
  );
  validatePeriod(period, "ATR");

  const trueRanges: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  return EMA(trueRanges, period);
}

/**
 * Keltner Channels
 */
export function KeltnerChannels(
  data: OHLCVData[],
  period: number = 20,
  atrPeriod: number = 10,
  multiplier: number = 2
): KeltnerChannelsResult[] {
  validateData(
    data.map((d) => d.close),
    Math.max(period, atrPeriod + 1),
    "KeltnerChannels"
  );

  const typicalPrices = data.map((d) => (d.high + d.low + d.close) / 3);
  const ema = EMA(typicalPrices, period);
  const atr = ATR(data, atrPeriod);

  const offset = Math.max(ema.length, atr.length) - Math.min(ema.length, atr.length);
  const minLength = Math.min(ema.length, atr.length);

  return Array.from({ length: minLength }, (_, i) => {
    const emaIdx = ema.length > atr.length ? i + offset : i;
    const atrIdx = atr.length > ema.length ? i + offset : i;

    return {
      upper: ema[emaIdx] + multiplier * atr[atrIdx],
      middle: ema[emaIdx],
      lower: ema[emaIdx] - multiplier * atr[atrIdx],
    };
  });
}

/**
 * Donchian Channels
 */
export function DonchianChannels(data: OHLCVData[], period: number = 20): DonchianChannelsResult[] {
  validateData(
    data.map((d) => d.close),
    period,
    "DonchianChannels"
  );

  const result: DonchianChannelsResult[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const upper = Math.max(...slice.map((d) => d.high));
    const lower = Math.min(...slice.map((d) => d.low));

    result.push({
      upper,
      middle: (upper + lower) / 2,
      lower,
    });
  }

  return result;
}

/**
 * Standard Deviation Bands
 */
export function StandardDeviationBands(
  data: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsResult[] {
  // Same as Bollinger Bands
  return BollingerBands(data, period, stdDevMultiplier);
}

// ============================================================================
// Volume Indicators
// ============================================================================

/**
 * On Balance Volume
 */
export function OBV(data: OHLCVData[]): number[] {
  validateData(
    data.map((d) => d.close),
    2,
    "OBV"
  );

  const result: number[] = [0];

  for (let i = 1; i < data.length; i++) {
    const change = data[i].close > data[i - 1].close ? data[i].volume : data[i].close < data[i - 1].close ? -data[i].volume : 0;

    result.push(result[i - 1] + change);
  }

  return result;
}

/**
 * Accumulation/Distribution
 */
export function AccumulationDistribution(data: OHLCVData[]): number[] {
  validateData(
    data.map((d) => d.close),
    1,
    "AccumulationDistribution"
  );

  const result: number[] = [];
  let ad = 0;

  for (let i = 0; i < data.length; i++) {
    const { high, low, close, volume } = data[i];
    const clv = high !== low ? ((close - low - (high - close)) / (high - low)) * volume : 0;
    ad += clv;
    result.push(ad);
  }

  return result;
}

/**
 * Chaikin Money Flow
 */
export function ChaikinMoneyFlow(data: OHLCVData[], period: number = 20): number[] {
  validateData(
    data.map((d) => d.close),
    period,
    "ChaikinMoneyFlow"
  );

  const result: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    let mfvSum = 0;
    let volumeSum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const { high, low, close, volume } = data[j];
      const mfm = high !== low ? ((close - low - (high - close)) / (high - low)) : 0;
      mfvSum += mfm * volume;
      volumeSum += volume;
    }

    result.push(volumeSum !== 0 ? mfvSum / volumeSum : 0);
  }

  return result;
}

/**
 * Volume Weighted Average Price
 */
export function VWAP(data: OHLCVData[]): number[] {
  validateData(
    data.map((d) => d.close),
    1,
    "VWAP"
  );

  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < data.length; i++) {
    const { high, low, close, volume } = data[i];
    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
    result.push(cumulativeVolume !== 0 ? cumulativeTPV / cumulativeVolume : 0);
  }

  return result;
}
    