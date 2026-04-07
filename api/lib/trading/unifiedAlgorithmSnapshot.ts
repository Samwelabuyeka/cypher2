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
    algorithmNames: string[];
  };
}

function scanProjectAlgorithms(): { totalAlgorithmExports: number; totalLibFilesScanned: number; algorithmNames: string[] } {
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
  const names: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const matches = src.match(/export function\s+(\w+)/g);
    exportCount += matches ? matches.length : 0;
    if (matches) {
      for (const m of matches) {
        const name = m.replace("export function", "").trim();
        names.push(name);
      }
    }
  }

  return {
    totalAlgorithmExports: exportCount,
    totalLibFilesScanned: files.length,
    algorithmNames: names.sort(),
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

  const qVar = quantumMonteCarloVaR(
    {
      positions: [
        { symbol, quantity: 1, currentPrice: currentPrice || 1 },
        { symbol: `${symbol}:hedge1`, quantity: 0.7, currentPrice: (currentPrice || 1) * 0.98 },
        { symbol: `${symbol}:hedge2`, quantity: 0.5, currentPrice: (currentPrice || 1) * 1.02 },
      ],
    },
    0.95,
    300
  );

  const optimized = optimizePortfolioQuantum(
    ["core", "hedge1", "hedge2"],
    [0.12, 0.08, 0.1],
    [
      [0.04, 0.01, 0.015],
      [0.01, 0.03, 0.01],
      [0.015, 0.01, 0.035],
    ],
    {
      budget: 1,
      min_position: 0,
      max_position: 1,
      diversification_penalty: 10,
    },
    { num_iterations: 120 }
  );

  const arbs = findArbitrageOpportunities(
    [
      { exchange: "exchangeA", symbol, bid: currentPrice * 0.999, ask: currentPrice * 1.001, timestamp: new Date() },
      { exchange: "exchangeB", symbol, bid: currentPrice * 1.001, ask: currentPrice * 1.003, timestamp: new Date() },
      { exchange: "exchangeC", symbol, bid: currentPrice * 0.997, ask: currentPrice * 1.0, timestamp: new Date() },
    ],
    0.0005
  );
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / Math.max(1e-9, closes[i]));
  const histVaR = returns.length ? historicalVaR(returns, 95) : { var: 0 };
  const pVaR = parametricVaR(
    [
      { weight: 0.5, expectedReturn: 0.12, volatility: 0.2 },
      { weight: 0.3, expectedReturn: 0.08, volatility: 0.16 },
      { weight: 0.2, expectedReturn: 0.1, volatility: 0.18 },
    ],
    [
      [0.04, 0.01, 0.015],
      [0.01, 0.03, 0.01],
      [0.015, 0.01, 0.035],
    ],
    95,
    1
  );
  const mcVaR = monteCarloVaR(
    [
      { weight: 0.5, expectedReturn: 0.12, volatility: 0.2 },
      { weight: 0.3, expectedReturn: 0.08, volatility: 0.16 },
      { weight: 0.2, expectedReturn: 0.1, volatility: 0.18 },
    ],
    [returns, returns.map((r) => r * 0.8), returns.map((r) => r * 1.1)],
    { simulations: 300, timeHorizon: 1, useAntitheticVariates: true, useControlVariates: true },
    95,
    1
  );
  const sharpeOpt = maximizeSharpeRatio(
    [0.12, 0.08, 0.1],
    [
      [0.04, 0.01, 0.015],
      [0.01, 0.03, 0.01],
      [0.015, 0.01, 0.035],
    ],
    0.02
  );
  const momentum = returns.length ? calculateMomentum(closes, Math.min(10, closes.length - 1)) : { rateOfChange: 0 };
  const riskScore = calculateRiskScore({
    volatility: Math.abs(atr[atr.length - 1] ?? 0) / Math.max(1, currentPrice),
    maxDrawdown: Math.abs(histVaR.var) * 100,
    leverage: 1,
    positionSize: 1,
    accountSize: 10,
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
