import { generateTradingSignal, type StrategyType } from "../mathEngine/signalGenerator";
import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateATR,
  calculateADX,
  calculateOBV,
  calculateVWAP,
} from "../calculations/technicalIndicators";
import { freqtradeInspiredSignal, hummingbotInspiredQuote } from "./upstreamStrategyBridge";
import { quantumMonteCarloVaR } from "../quantum/quantumMonteCarlo";
import { optimizePortfolioQuantum } from "../quantum/quantumAnnealing";
import { findArbitrageOpportunities } from "../quantum/groverSearch";
import { historicalVaR, parametricVaR, monteCarloVaR } from "../risk/valueAtRisk";
import { maximizeSharpeRatio } from "../portfolio/modernPortfolioTheory";
import { calculateRiskScore } from "../calculations/riskMetrics";
import { calculateMomentum } from "../calculations/quantitativeModels";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface UnifiedAlgorithmSnapshot {
  strategyVotes: Record<string, "buy" | "sell" | "hold">;
  indicators: Record<string, number>;
  upstream: {
    freqtradeAction: "buy" | "sell" | "hold";
    hbBidSpread: number;
    hbAskSpread: number;
  };
  quantum: {
    var95: number;
    expectedShortfall95: number;
    optimizedSharpe: number;
    arbitrageCount: number;
  };
  projectCoverage: {
    totalAlgorithmExports: number;
    totalLibFilesScanned: number;
  };
}

function scanProjectAlgorithms(): { totalAlgorithmExports: number; totalLibFilesScanned: number } {
  const base = join(process.cwd(), "api", "lib");
  const stack = [base];
  const files: string[] = [];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && p.endsWith(".ts")) files.push(p);
    }
  }

  let exportCount = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const matches = src.match(/export function\s+\w+/g);
    exportCount += matches ? matches.length : 0;
  }

  return {
    totalAlgorithmExports: exportCount,
    totalLibFilesScanned: files.length,
  };
}

export function buildUnifiedAlgorithmSnapshot(
  symbol: string,
  marketData: Array<{ close: number; high: number; low: number; volume: number; timestamp?: Date | string }>
): UnifiedAlgorithmSnapshot {
  const closes = marketData.map((d) => d.close);
  const highs = marketData.map((d) => d.high);
  const lows = marketData.map((d) => d.low);
  const volumes = marketData.map((d) => d.volume);

  const candles = marketData.map((d) => ({ close: d.close, high: d.high, low: d.low, volume: d.volume }));
  const ft = freqtradeInspiredSignal(candles);

  const currentPrice = closes[closes.length - 1] ?? 0;
  const prevPrice = closes[closes.length - 2] ?? currentPrice;
  const volatility = Math.abs(currentPrice - prevPrice) / Math.max(1, prevPrice);
  const hb = hummingbotInspiredQuote(currentPrice, 0, volatility);

  const priceHistory = marketData.map((d, i) => ({
    time: d.timestamp ? new Date(d.timestamp) : new Date(Date.now() + i * 60_000),
    price: d.close,
    volume: d.volume,
  }));

  const strategyTypes: StrategyType[] = ["momentum", "mean-reversion", "breakout", "trend-following"];
  const strategyVotes: Record<string, "buy" | "sell" | "hold"> = {};

  for (const strategyType of strategyTypes) {
    strategyVotes[strategyType] = generateTradingSignal({
      priceHistory,
      indicators: {},
      strategyType,
    }).action;
  }

  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes, 12, 26, 9);
  const bb = calculateBollingerBands(closes, 20, 2);
  const stoch = calculateStochastic(highs, lows, closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);
  const adx = calculateADX(highs, lows, closes, 14);
  const obv = calculateOBV(closes, volumes);
  const vwap = calculateVWAP(highs, lows, closes, volumes);

  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / Math.max(1e-9, closes[i]));
  const actualMeanReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const actualVariance = returns.length ? returns.reduce((s, r) => s + (r - actualMeanReturn) ** 2, 0) / returns.length : 0.0001;
  const actualVol = Math.sqrt(actualVariance);

  const qVar = quantumMonteCarloVaR(
    {
      positions: [{ symbol, quantity: 1, currentPrice: currentPrice || 1 }],
      correlationMatrix: [[1]],
    },
    0.95,
    300
  );

  const optimized = optimizePortfolioQuantum(
    [symbol],
    [actualMeanReturn],
    [[actualVariance]],
    {
      budget: 1,
      min_position: 0,
      max_position: 1,
      diversification_penalty: 10,
    },
    { num_iterations: 120 }
  );

  const spread = highs.length > 0 && lows.length > 0
    ? (highs[highs.length - 1] - lows[lows.length - 1]) / Math.max(1, currentPrice)
    : 0.001;
  const arbs = findArbitrageOpportunities(
    [
      { exchange: "primary", symbol, bid: currentPrice * (1 - spread / 2), ask: currentPrice * (1 + spread / 2), timestamp: new Date() },
    ],
    0.0005
  );
  const histVaR = returns.length ? historicalVaR(returns, 95) : { var: 0 };
  const pVaR = parametricVaR(
    [{ weight: 1, expectedReturn: actualMeanReturn, volatility: actualVol }],
    [[actualVariance]],
    95,
    1
  );
  const mcVaR = monteCarloVaR(
    [{ weight: 1, expectedReturn: actualMeanReturn, volatility: actualVol }],
    [returns],
    { simulations: 300, timeHorizon: 1, useAntitheticVariates: true, useControlVariates: true },
    95,
    1
  );
  const sharpeOpt = maximizeSharpeRatio(
    [actualMeanReturn],
    [[actualVariance]],
    0.02
  );
  const momentum = returns.length ? calculateMomentum(closes, Math.min(10, closes.length - 1)) : { rateOfChange: 0 };
  const positionSize = currentPrice > 0 ? Math.round(10000 * 0.01) : 0;
  const riskScore = calculateRiskScore({
    volatility: Math.abs(atr[atr.length - 1] ?? 0) / Math.max(1, currentPrice),
    maxDrawdown: Math.abs(histVaR.var) * 100,
    leverage: 1,
    positionSize,
    accountSize: 10000,
  });
  const coverage = scanProjectAlgorithms();

  return {
    strategyVotes,
    indicators: {
      rsi: rsi[rsi.length - 1] ?? 50,
      macd: macd.macd[macd.macd.length - 1] ?? 0,
      macdSignal: macd.signal[macd.signal.length - 1] ?? 0,
      bbUpper: bb.upper[bb.upper.length - 1] ?? currentPrice,
      bbLower: bb.lower[bb.lower.length - 1] ?? currentPrice,
      stochasticK: stoch.k[stoch.k.length - 1] ?? 50,
      stochasticD: stoch.d[stoch.d.length - 1] ?? 50,
      atr: atr[atr.length - 1] ?? 0,
      adx: adx.adx[adx.adx.length - 1] ?? 0,
      obv: obv[obv.length - 1] ?? 0,
      vwap: vwap[vwap.length - 1] ?? currentPrice,
      histVaR95: histVaR.var,
      paramVaR95: pVaR.var,
      mcVaR95: mcVaR.var,
      optimizedSharpeMPT: sharpeOpt.objectiveValue,
      momentumRoc: momentum.rateOfChange,
      riskScore,
    },
    upstream: {
      freqtradeAction: ft.action,
      hbBidSpread: hb.bidSpread,
      hbAskSpread: hb.askSpread,
    },
    quantum: {
      var95: qVar.valueAtRisk,
      expectedShortfall95: qVar.expectedShortfall,
      optimizedSharpe: optimized.sharpe,
      arbitrageCount: arbs.length,
    },
    projectCoverage: coverage,
  };
}
