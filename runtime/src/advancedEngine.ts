/**
 * Advanced Trading Engine - Comprehensive HFT System
 * Connects every possible algorithm from api/lib into a unified ensemble trading engine.
 * Produces BUY/SELL/HOLD signals via weighted ensemble voting across 18 strategies.
 */

export interface Signal {
  timestamp: number;
  type: "BUY" | "SELL" | "HOLD";
  symbol: string;
  price: number;
}

export type EngineSignal = Signal;

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyVote {
  name: string;
  weight: number;
  signal: 1 | 0 | -1;
}

export type EngineStrategyParams = StrategyVote;

// ============================================================================
// Imports from api/lib
// ============================================================================

import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateADX,
  calculateOBV,
  calculateVWAP,
  calculateIchimoku,
  calculateStochastic,
  detectSupportResistance,
  detectPatterns,
  calculateSMA,
  calculateEMA,
} from "../../api/lib/calculations/technicalIndicators";

import {
  calculateMeanReversion,
  calculateMomentum,
  calculateTrendStrength,
  calculateHurstExponent,
  calculateVolatilityForecast,
  calculateMarketRegime,
  calculateOmegaRatio,
  calculateGrowthPotential,
} from "../../api/lib/calculations/quantitativeModels";

import {
  calculateRiskScore,
  calculateMaxDrawdown,
  calculateConditionalVaR,
  calculateTailRatio,
  calculateKellyCriterion,
  calculateExpectedValue,
} from "../../api/lib/calculations/riskMetrics";

import {
  normalizeData,
  standardizeData,
  detectAnomalies,
  generateTradingSignal,
} from "../../api/lib/calculations/machineLearning";

import {
  calculateOrderImbalance,
  calculateDelta as calcOrderDelta,
  calculateEntropy,
} from "../../api/lib/calculations/orderFlowAnalysis";

import {
  calculateSharpeRatio as calcPortfolioSharpe,
  calculateSortinoRatio,
  calculateVolatility,
  calculateReturns,
} from "../../api/lib/calculations/portfolioMetrics";

import { extractPrincipalComponents } from "../../api/lib/portfolio/factorModels";

import {
  calculateDiversificationRatio,
} from "../../api/lib/portfolio/modernPortfolioTheory";

import {
  coolingSchedule,
  quantumFluctuation,
} from "../../api/lib/quantum/quantumAnnealing";

import { diffusionOperator } from "../../api/lib/quantum/groverSearch";

import { quantumPathIntegral } from "../../api/lib/quantum/quantumMonteCarlo";

import {
  calculateDelta as calcBSDelta,
  calculateGamma,
  calculateVega,
} from "../../api/lib/risk/blackScholes";

import {
  calculateTrailingStopLoss,
  applyRiskLimits,
  calculateValueAtRisk,
} from "../../api/lib/risk/dynamicStopLoss";

import {
  calculateRiskMetrics,
} from "../../api/lib/risk/valueAtRisk";

// ============================================================================
// Constants
// ============================================================================

export const ENSEMBLE_THRESHOLD = 0.25;
const STOP_LOSS_ATR_MULT = 1.5;
const TAKE_PROFIT_ATR_MULT = 3;
const POSITION_SIZE_PCT = 0.03;
const MAX_CONCURRENT_POSITIONS = 10;
const TRAILING_STOP_PCT = 0.02;

const STRATEGY_NAMES = [
  "MeanReversion", "MomentumBreakout", "MACDCrossover", "TrendFollower",
  "VolumeProfile", "MultiTimeframe", "IchimokuCloud", "StochasticRSI",
  "HurstRegime", "QuantumEntropy", "OrderFlowDelta", "VolatilityBreakout",
  "ATRChannel", "ADXStrength", "PatternDetection", "ZScoreReversion",
  "MomentumDivergence", "RiskAdjustedEntry",
] as const;

type StrategyName = typeof STRATEGY_NAMES[number];

const STRATEGY_WEIGHTS: Record<StrategyName, number> = {
  MeanReversion: 0.08, MomentumBreakout: 0.08, MACDCrossover: 0.07,
  TrendFollower: 0.07, VolumeProfile: 0.06, MultiTimeframe: 0.06,
  IchimokuCloud: 0.06, StochasticRSI: 0.05, HurstRegime: 0.05,
  QuantumEntropy: 0.05, OrderFlowDelta: 0.06, VolatilityBreakout: 0.05,
  ATRChannel: 0.05, ADXStrength: 0.05, PatternDetection: 0.05,
  ZScoreReversion: 0.05, MomentumDivergence: 0.04, RiskAdjustedEntry: 0.06,
};

// ============================================================================
// Helpers
// ============================================================================

function signalToVote(s: EngineSignal): 1 | 0 | -1 {
  if (s.type === "BUY") return 1;
  if (s.type === "SELL") return -1;
  return 0;
}

function h(ts: number, sym: string, price: number): EngineSignal {
  return { timestamp: ts, type: "HOLD", symbol: sym, price };
}
function b(ts: number, sym: string, price: number): EngineSignal {
  return { timestamp: ts, type: "BUY", symbol: sym, price };
}
function s(ts: number, sym: string, price: number): EngineSignal {
  return { timestamp: ts, type: "SELL", symbol: sym, price };
}

function computeSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

// ============================================================================
// Strategy 1: Mean Reversion (RSI + Bollinger)
// ============================================================================
function strategyMeanReversion(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const bb = calculateBollingerBands(closes, 20, 2);
  const sma50 = calculateSMA(closes, 50);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    const bi = i - (closes.length - bb.upper.length);
    const si = i - (closes.length - sma50.length);
    if (ri < 0 || bi < 0 || si < 0) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const r = rsi[ri], lower = bb.lower[bi], upper = bb.upper[bi], sma = sma50[si];
    if (r === undefined || lower === undefined || upper === undefined || sma === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const uptrend = closes[i] > sma;
    if (closes[i] <= lower && r < 25) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if ((closes[i] >= upper || r > 75) && !uptrend) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else if (closes[i] >= upper && r > 80) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 2: Momentum Breakout (ADX + Volume)
// ============================================================================
function strategyMomentumBreakout(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const adxResult = calculateADX(highs, lows, closes, 14);
  const adx = adxResult.adx;
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ai = i - (closes.length - adx.length);
    let maxHigh = -Infinity;
    for (let j = Math.max(0, i - 20); j < i; j++) if (highs[j] > maxHigh) maxHigh = highs[j];
    let minLow = Infinity;
    for (let j = Math.max(0, i - 10); j < i; j++) if (lows[j] < minLow) minLow = lows[j];
    let avgVol = 0;
    const vc = Math.min(20, i);
    for (let j = i - vc; j < i; j++) avgVol += volumes[j];
    avgVol /= Math.max(vc, 1);
    const adxVal = ai >= 0 && ai < adx.length ? adx[ai] : null;
    if (closes[i] > maxHigh && volumes[i] > 1.3 * avgVol && adxVal !== null && adxVal > 20)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (closes[i] < minLow && adxVal !== null && adxVal > 20)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 3: MACD Crossover
// ============================================================================
function strategyMACDCrossover(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const macdResult = calculateMACD(closes, 12, 26, 9);
  const macdLine = macdResult.macd;
  const signalLine = macdResult.signal;
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ci = i - (closes.length - macdLine.length);
    const pi = ci - 1;
    if (ci < 1 || ci >= macdLine.length || pi < 0 || pi >= signalLine.length) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const curr = macdLine[ci], prev = macdLine[pi];
    const currSig = signalLine[ci], prevSig = signalLine[pi];
    if (prev <= prevSig && curr > currSig) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (prev >= prevSig && curr < currSig) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 4: Trend Follower (SMA cross + RSI + ADX + DI)
// ============================================================================
function strategyTrendFollower(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const rsi = calculateRSI(closes, 14);
  const adxResult = calculateADX(highs, lows, closes, 14);
  const { adx, plusDI, minusDI } = adxResult;
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    const ai = i - (closes.length - adx.length);
    if (i < 50 || ri < 0 || ai < 0 || ri >= rsi.length || ai >= adx.length) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const r = rsi[ri], a = adx[ai], pdi = plusDI[ai], mdi = minusDI[ai];
    if (r === undefined || a === undefined || pdi === undefined || mdi === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    let sma20 = 0, sma50 = 0;
    for (let j = i - 19; j <= i; j++) sma20 += closes[j];
    sma20 /= 20;
    for (let j = i - 49; j <= i; j++) sma50 += closes[j];
    sma50 /= 50;
    if (sma20 > sma50 && r > 50 && a > 18 && pdi > mdi)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (sma20 < sma50 && r < 50 && a > 18 && mdi > pdi)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 5: Volume Profile (OBV + VWAP + RSI)
// ============================================================================
function strategyVolumeProfile(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const rsi = calculateRSI(closes, 14);
  const obv = calculateOBV(closes, volumes);
  const vwap = calculateVWAP(candles.map(c => c.high), candles.map(c => c.low), closes, volumes);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    if (ri < 0 || i >= vwap.length || i >= obv.length) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const r = rsi[ri], v = vwap[i];
    if (r === undefined || v === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const obvRising = i >= 2 && obv[i] > obv[i - 1] && obv[i - 1] > obv[i - 2];
    if (obvRising && closes[i] > v && r > 35 && r < 70)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (closes[i] < v && r > 70)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 6: Multi-Timeframe (Trend + MACD confluence)
// ============================================================================
function strategyMultiTimeframe(candles: OHLCV[], symbol: string): EngineSignal[] {
  const trendSignals = strategyTrendFollower(candles, symbol);
  const macdSignals = strategyMACDCrossover(candles, symbol);
  return candles.map((c, i) => {
    const t = trendSignals[i], m = macdSignals[i];
    if (!t || !m) return h(c.timestamp, symbol, c.close);
    if (t.type === "BUY" && m.type === "BUY") return b(c.timestamp, symbol, c.close);
    if (t.type === "SELL" && m.type === "SELL") return s(c.timestamp, symbol, c.close);
    return h(c.timestamp, symbol, c.close);
  });
}

// ============================================================================
// Strategy 7: Ichimoku Cloud
// ============================================================================
function strategyIchimokuCloud(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const ichimoku = calculateIchimoku(highs, lows, closes, 9, 26, 52);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const tenkan = ichimoku.tenkanSen[i], kijun = ichimoku.kijunSen[i];
    const senkouA = ichimoku.senkouSpanA[i], senkouB = ichimoku.senkouSpanB[i];
    if (tenkan === undefined || kijun === undefined || senkouA === undefined || senkouB === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBottom = Math.min(senkouA, senkouB);
    if (tenkan > kijun && closes[i] > cloudTop && i > 0 && closes[i - 1] <= cloudTop)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (tenkan < kijun && closes[i] < cloudBottom && i > 0 && closes[i - 1] >= cloudBottom)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 8: Stochastic + RSI Confluence
// ============================================================================
function strategyStochasticRSI(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const stoch = calculateStochastic(candles.map(c => c.high), candles.map(c => c.low), closes, 14);
  const sma50 = calculateSMA(closes, 50);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    const si = i - (closes.length - stoch.k.length);
    const s50i = i - (closes.length - sma50.length);
    if (ri < 0 || si < 0 || s50i < 0) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const rsiVal = rsi[ri], stochK = stoch.k[si], stochD = stoch.d[si], sma = sma50[s50i];
    if (rsiVal === undefined || stochK === undefined || stochD === undefined || sma === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const uptrend = closes[i] > sma;
    if (stochK < 20 && stochK > stochD && rsiVal < 40)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (stochK > 80 && stochK < stochD && rsiVal > 60 && !uptrend)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else if (stochK > 80 && stochK < stochD && rsiVal > 75)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 9: Hurst Exponent Regime
// ============================================================================
function strategyHurstRegime(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const signals: EngineSignal[] = [];
  let lastHurst = "random";
  let lastMom = 0;
  const STEP = 5;
  for (let i = 0; i < candles.length; i++) {
    if (i < 100) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    if (i % STEP === 0) {
      try {
        const window = closes.slice(i - 100, i + 1);
        const hurst = calculateHurstExponent(window);
        const mom = calculateMomentum(window, 10);
        lastHurst = hurst.interpretation;
        lastMom = mom.momentum;
      } catch {}
    }
    if (lastHurst === "mean-reverting" && lastMom < 0)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (lastHurst === "trending" && lastMom > 0)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (lastHurst === "trending" && lastMom < 0)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 10: Quantum Entropy (Shannon entropy)
// ============================================================================
function strategyQuantumEntropy(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const signals: EngineSignal[] = [];
  const lb = 20;
  let lastPiSignal = 1;
  let lastEntropy = 1.0;
  const STEP = 10;
  for (let i = 0; i < candles.length; i++) {
    if (i < lb + 1) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    if (i % STEP === 0) {
      const changes: number[] = [];
      for (let j = i - lb + 1; j <= i; j++) {
        changes.push(closes[j] - closes[j - 1]);
      }
      const amplitudes = diffusionOperator(changes.map(c => Math.abs(c)));
      lastEntropy = calculateEntropy(amplitudes);
      const initState = { amplitude: changes.map(c => Math.abs(c)), phase: changes.map(() => 0) };
      const finalState = { amplitude: changes.map(c => Math.abs(c) * 0.9), phase: changes.map(() => Math.PI / 4) };
      const pathIntegral = quantumPathIntegral(initState, finalState, 10);
      const piScore = pathIntegral.probability * (pathIntegral.action > 0 ? 1 : -1);
      lastPiSignal = piScore > 0 ? 1 : -1;
    }
    if (lastEntropy < 1.5 && closes[i] > closes[i - 1] && lastPiSignal > 0)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (lastEntropy < 1.5 && closes[i] < closes[i - 1] && lastPiSignal < 0)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 11: Order Flow Delta
// ============================================================================
function strategyOrderFlowDelta(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < 2) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const buyVol = closes[i] > closes[i - 1] ? volumes[i] * 0.7 : volumes[i] * 0.3;
    const sellVol = volumes[i] - buyVol;
    const delta = calcOrderDelta(buyVol, sellVol);
    const imb = calculateOrderImbalance(buyVol, sellVol);
    if (delta.netDelta > 0 && imb.signalDirection === "bullish")
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (delta.netDelta < 0 && imb.signalDirection === "bearish")
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 12: Volatility Breakout (ATR-based)
// ============================================================================
function strategyVolatilityBreakout(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const atr = calculateATR(highs, lows, closes, 14);
  const signals: EngineSignal[] = [];
  const offset = closes.length - atr.length - 1;
  for (let i = 0; i < candles.length; i++) {
    const ai = i - offset;
    if (ai < 0 || ai >= atr.length || i < 1) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const range = closes[i] - closes[i - 1];
    if (range > atr[ai] * 1.5) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (range < -atr[ai] * 1.5) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 13: ATR Channel Breakout
// ============================================================================
function strategyATRChannel(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const atr = calculateATR(highs, lows, closes, 14);
  const signals: EngineSignal[] = [];
  const offset = closes.length - atr.length - 1;
  for (let i = 0; i < candles.length; i++) {
    const ai = i - offset;
    if (ai < 0 || ai >= atr.length || i < 20) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    let sma20 = 0;
    for (let j = i - 19; j <= i; j++) sma20 += closes[j];
    sma20 /= 20;
    const upper = sma20 + atr[ai] * 2;
    const lower = sma20 - atr[ai] * 2;
    if (closes[i] > upper) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (closes[i] < lower) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 14: ADX Strength + DI Direction
// ============================================================================
function strategyADXStrength(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const adxResult = calculateADX(highs, lows, closes, 14);
  const { adx, plusDI, minusDI } = adxResult;
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ai = i - (closes.length - adx.length);
    if (ai < 0 || ai >= adx.length) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const a = adx[ai], pdi = plusDI[ai], mdi = minusDI[ai];
    if (a === undefined || pdi === undefined || mdi === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    if (a > 25 && pdi > mdi) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (a > 25 && mdi > pdi) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 15: Pattern Detection (Head & Shoulders, Double Top/Bottom)
// ============================================================================
function strategyPatternDetection(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const patterns = detectPatterns(closes);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const activePatterns = patterns.filter(p => i >= p.startIndex && i <= p.endIndex);
    const hasBearish = activePatterns.some(p => p.type === "head-and-shoulders" || p.type === "double-top");
    const hasBullish = activePatterns.some(p => p.type === "double-bottom" || p.type === "triangle");
    if (hasBullish) signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (hasBearish) signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 16: Z-Score Reversion (quantitative)
// ============================================================================
function strategyZScoreReversion(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const sma50 = calculateSMA(closes, 50);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < 20) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const si = i - (closes.length - sma50.length);
    const sma = si >= 0 ? sma50[si] : undefined;
    const uptrend = sma !== undefined && closes[i] > sma;
    try {
      const window = closes.slice(i - 20, i + 1);
      const mr = calculateMeanReversion(window);
      if (mr.signal === "oversold") signals.push(b(candles[i].timestamp, symbol, closes[i]));
      else if (mr.signal === "overbought" && !uptrend) signals.push(s(candles[i].timestamp, symbol, closes[i]));
      else signals.push(h(candles[i].timestamp, symbol, closes[i]));
    } catch { signals.push(h(candles[i].timestamp, symbol, closes[i])); }
  }
  return signals;
}

// ============================================================================
// Strategy 17: Momentum Divergence (RSI vs Price)
// ============================================================================
function strategyMomentumDivergence(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const sma50 = calculateSMA(closes, 50);
  const signals: EngineSignal[] = [];
  for (let i = 14; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    const si = i - (closes.length - sma50.length);
    if (ri < 5 || ri >= rsi.length || si < 0) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const sma = sma50[si];
    if (sma === undefined) { signals.push(h(candles[i].timestamp, symbol, closes[i])); continue; }
    const uptrend = closes[i] > sma;
    const priceHigher = closes[i] > closes[i - 5];
    const rsiHigher = rsi[ri] > rsi[ri - 5];
    if (priceHigher && !rsiHigher && rsi[ri] > 60 && !uptrend)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else if (!priceHigher && rsiHigher && rsi[ri] < 40)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (uptrend && !priceHigher && rsiHigher && rsi[ri] < 50)
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Strategy 18: Risk-Adjusted Entry (Kelly + Volatility)
// ============================================================================
function strategyRiskAdjustedEntry(candles: OHLCV[], symbol: string): EngineSignal[] {
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const sma50 = calculateSMA(closes, 50);
  const sma20 = calculateSMA(closes, 20);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const signals: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ri = i - (closes.length - rsi.length);
    const s50i = i - (closes.length - sma50.length);
    const s20i = i - (closes.length - sma20.length);
    if (ri < 0 || s50i < 0 || s20i < 0 || i < 20) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const r = rsi[ri], sma50v = sma50[s50i], sma20v = sma20[s20i];
    if (r === undefined || sma50v === undefined || sma20v === undefined) {
      signals.push(h(candles[i].timestamp, symbol, closes[i])); continue;
    }
    const uptrend = closes[i] > sma50v && sma20v > sma50v;
    const downtrend = closes[i] < sma50v && sma20v < sma50v;
    const recentReturns = returns.slice(Math.max(0, i - 20), i);
    const wins = recentReturns.filter(x => x > 0);
    const losses = recentReturns.filter(x => x < 0);
    const winRate = wins.length / Math.max(recentReturns.length, 1);
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
    const kelly = calculateKellyCriterion(winRate, avgWin, avgLoss);
    if (kelly > 0.1 && (r < 35 || (r < 50 && uptrend)))
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else if (kelly > 0.1 && r > 70 && downtrend)
      signals.push(s(candles[i].timestamp, symbol, closes[i]));
    else if (uptrend && r < 50 && rsi[Math.max(0, ri - 1)] !== undefined && rsi[ri - 1] !== undefined && r > (rsi[ri - 1] ?? 50))
      signals.push(b(candles[i].timestamp, symbol, closes[i]));
    else signals.push(h(candles[i].timestamp, symbol, closes[i]));
  }
  return signals;
}

// ============================================================================
// Ensemble Builder
// ============================================================================

export function precomputeAllStrategySignals(candles: OHLCV[], symbol: string): EngineSignal[][] {
  return [
    strategyMeanReversion(candles, symbol),
    strategyMomentumBreakout(candles, symbol),
    strategyMACDCrossover(candles, symbol),
    strategyTrendFollower(candles, symbol),
    strategyVolumeProfile(candles, symbol),
    strategyMultiTimeframe(candles, symbol),
    strategyIchimokuCloud(candles, symbol),
    strategyStochasticRSI(candles, symbol),
    strategyHurstRegime(candles, symbol),
    strategyQuantumEntropy(candles, symbol),
    strategyOrderFlowDelta(candles, symbol),
    strategyVolatilityBreakout(candles, symbol),
    strategyATRChannel(candles, symbol),
    strategyADXStrength(candles, symbol),
    strategyPatternDetection(candles, symbol),
    strategyZScoreReversion(candles, symbol),
    strategyMomentumDivergence(candles, symbol),
    strategyRiskAdjustedEntry(candles, symbol),
  ];
}

export function combineSignalsWithWeights(
  allSignals: EngineSignal[][],
  candles: OHLCV[],
  symbol: string,
  weights: Record<string, number>,
  threshold: number
): EngineSignal[] {
  const totalWeight = STRATEGY_NAMES.reduce((s, n) => s + (weights[n] || STRATEGY_WEIGHTS[n]), 0);
  const combined: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    let score = 0;
    for (let idx = 0; idx < STRATEGY_NAMES.length; idx++) {
      const sig = allSignals[idx][i];
      const vote = sig ? signalToVote(sig) : 0;
      score += vote * (weights[STRATEGY_NAMES[idx]] || STRATEGY_WEIGHTS[STRATEGY_NAMES[idx]]);
    }
    if (totalWeight > 0) score /= totalWeight;
    let type: EngineSignal["type"] = "HOLD";
    if (score > threshold) type = "BUY";
    else if (score < -threshold) type = "SELL";
    combined.push({ timestamp: candles[i].timestamp, type, symbol, price: candles[i].close });
  }
  return combined;
}

export function buildEnsembleSignals(candles: OHLCV[], symbol: string): EngineSignal[] {
  const allSignals: EngineSignal[][] = [
    strategyMeanReversion(candles, symbol),
    strategyMomentumBreakout(candles, symbol),
    strategyMACDCrossover(candles, symbol),
    strategyTrendFollower(candles, symbol),
    strategyVolumeProfile(candles, symbol),
    strategyMultiTimeframe(candles, symbol),
    strategyIchimokuCloud(candles, symbol),
    strategyStochasticRSI(candles, symbol),
    strategyHurstRegime(candles, symbol),
    strategyQuantumEntropy(candles, symbol),
    strategyOrderFlowDelta(candles, symbol),
    strategyVolatilityBreakout(candles, symbol),
    strategyATRChannel(candles, symbol),
    strategyADXStrength(candles, symbol),
    strategyPatternDetection(candles, symbol),
    strategyZScoreReversion(candles, symbol),
    strategyMomentumDivergence(candles, symbol),
    strategyRiskAdjustedEntry(candles, symbol),
  ];
  const totalWeight = STRATEGY_NAMES.reduce((s, n) => s + STRATEGY_WEIGHTS[n], 0);
  const combined: EngineSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    let score = 0;
    for (let idx = 0; idx < STRATEGY_NAMES.length; idx++) {
      const sig = allSignals[idx][i];
      const vote = sig ? signalToVote(sig) : 0;
      score += vote * STRATEGY_WEIGHTS[STRATEGY_NAMES[idx]];
    }
    score /= totalWeight;
    let type: EngineSignal["type"] = "HOLD";
    if (score > ENSEMBLE_THRESHOLD) type = "BUY";
    else if (score < -ENSEMBLE_THRESHOLD) type = "SELL";
    combined.push({ timestamp: candles[i].timestamp, type, symbol, price: candles[i].close });
  }
  return combined;
}

// ============================================================================
// Utility helpers
// ============================================================================

export function toMarketData(candles: OHLCV[]): Array<{ timestamp: Date; symbol: string; open: number; high: number; low: number; close: number; volume: number }> {
  return candles.map(c => ({
    timestamp: new Date(c.timestamp), symbol: "BTC/USDT",
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
}

export function computeSMAHelper(data: number[], period: number): (number | null)[] {
  return computeSMA(data, period);
}

// ============================================================================
// Risk Management Helpers
// ============================================================================

export function getRiskManagement() {
  return {
    stopLossMultiplier: STOP_LOSS_ATR_MULT,
    takeProfitMultiplier: TAKE_PROFIT_ATR_MULT,
    positionSizePct: POSITION_SIZE_PCT,
    maxConcurrentPositions: MAX_CONCURRENT_POSITIONS,
    trailingStopPct: TRAILING_STOP_PCT,
    ensembleThreshold: ENSEMBLE_THRESHOLD,
  };
}

// ============================================================================
// StrategyEngine class (compatible with original)
// ============================================================================

export type { BacktestConfig, MarketData, Strategy, BacktestResult, Signal as BTSignal } from "../../api/lib/backtesting/backtestEngine";
import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy as BTStrategy,
  type Signal as BTSignal,
} from "../../api/lib/backtesting/backtestEngine";

export class StrategyEngine {
  private symbol: string;
  private timeframe: string;
  private candles: OHLCV[];
  constructor(symbol: string, timeframe: string, candles: OHLCV[]) {
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.candles = candles;
  }
  getSignals(): EngineSignal[] {
    return buildEnsembleSignals(this.candles, this.symbol);
  }
  getStrategy(): BTStrategy {
    const ensembleSignals = buildEnsembleSignals(this.candles, this.symbol);
    const btSignals: BTSignal[] = ensembleSignals.map(s => ({
      timestamp: new Date(s.timestamp),
      type: s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : "close",
      symbol: this.symbol,
      price: s.price,
    }));
    return {
      name: "Advanced Multi-Strategy Ensemble",
      parameters: { strategyNames: STRATEGY_NAMES, weights: STRATEGY_WEIGHTS, ensembleThreshold: ENSEMBLE_THRESHOLD },
      generateSignals: () => btSignals,
    };
  }
  getRiskManagement() { return getRiskManagement(); }
}

// ============================================================================
// Re-exports for compatibility
// ============================================================================

export const NAMES = STRATEGY_NAMES;
export const STOP_LOSS_ATR_MULT_EXP = STOP_LOSS_ATR_MULT;
export const TAKE_PROFIT_ATR_MULT_EXP = TAKE_PROFIT_ATR_MULT;
export const POSITION_SIZE_PCT_EXP = POSITION_SIZE_PCT;
export const MAX_CONCURRENT_POSITIONS_EXP = MAX_CONCURRENT_POSITIONS;
