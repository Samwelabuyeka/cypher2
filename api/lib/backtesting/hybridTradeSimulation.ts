import { BacktestEngine, MonteCarloSimulator, type MarketData, type Strategy, type Signal } from "./backtestEngine";
import { freqtradeInspiredSignal, hummingbotInspiredQuote } from "../trading/upstreamStrategyBridge";
import { generateTradingSignal, type StrategyType } from "../mathEngine/signalGenerator";
import { buildUnifiedAlgorithmSnapshot } from "../trading/unifiedAlgorithmSnapshot";
import { getLocalAIMarketBias } from "../ai/localAiRouter";
import { readdirSync } from "fs";
import { join } from "path";

export interface HybridSimulationReport {
  trades: number;
  winRate: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  probabilityOfProfit: number;
  riskOfRuin: number;
  actionsCovered: number;
  algorithmsUsed: string[];
}

export interface HeavySimulationReport {
  iterations: number;
  symbols: string[];
  totalBacktests: number;
  avgReturnPercent: number;
  medianReturnPercent: number;
  bestReturnPercent: number;
  worstReturnPercent: number;
  avgWinRate: number;
  avgSharpeRatio: number;
  profitableRunsPercent: number;
  avgMaxDrawdownPercent: number;
  aiPositiveBiasPercent: number;
  scannedAlgorithmExports: number;
  scannedLibFiles: number;
}

function generateSyntheticMarketData(points: number = 400, symbol: string = "ETH/USDT"): MarketData[] {
  const data: MarketData[] = [];
  let price = 1800;
  let drift = 0.0012;

  for (let i = 0; i < points; i++) {
    if (i % 120 === 0 && i > 0) drift *= -1;

    const noise = (Math.random() - 0.5) * 0.018;
    const change = drift + noise;
    const open = price;
    price = Math.max(100, price * (1 + change));
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 1000 + Math.random() * 600;

    data.push({
      timestamp: new Date(Date.now() + i * 60_000),
      symbol,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return data;
}

function buildHybridStrategy(): Strategy {
  return {
    name: "upstream-hybrid-eth",
    parameters: {
      stopLossPct: 0.012,
      takeProfitPct: 0.022,
    },
    generateSignals(data: MarketData[], params: Record<string, any>): Signal[] {
      const signals: Signal[] = [];
      let position: "flat" | "long" | "short" = "flat";

      for (let i = 60; i < data.length; i++) {
        const window = data.slice(0, i + 1);
        const candles = window.map((d) => ({
          close: d.close,
          high: d.high,
          low: d.low,
          volume: d.volume,
        }));

        const ft = freqtradeInspiredSignal(candles);
        const priceHistory = window.map((w) => ({
          time: w.timestamp,
          price: w.close,
          volume: w.volume,
        }));

        const strategyTypes: StrategyType[] = [
          "momentum",
          "mean-reversion",
          "breakout",
          "trend-following",
        ];
        const quantSignals = strategyTypes.map((strategyType) =>
          generateTradingSignal({
            priceHistory,
            strategyType,
            indicators: {},
          })
        );
        const quantBuyVotes = quantSignals.filter((s) => s.action === "buy").length;
        const quantSellVotes = quantSignals.filter((s) => s.action === "sell").length;

        const current = data[i];
        const prev = data[i - 1];
        const volatility = Math.abs(current.close - prev.close) / Math.max(1, prev.close);
        const quote = hummingbotInspiredQuote(current.close, 0, volatility);
        const buyBias = ft.action === "buy" || quantBuyVotes >= 3;
        const sellBias = ft.action === "sell" || quantSellVotes >= 3;

        if (position === "flat" && buyBias && !sellBias) {
          position = "long";
          signals.push({
            timestamp: current.timestamp,
            type: "buy",
            symbol: current.symbol,
            price: quote.reservationPrice * (1 + quote.bidSpread),
            stopLoss: current.close * (1 - params.stopLossPct),
            takeProfit: current.close * (1 + params.takeProfitPct),
          });
          continue;
        }

        if (position === "flat" && sellBias && !buyBias) {
          position = "short";
          signals.push({
            timestamp: current.timestamp,
            type: "sell",
            symbol: current.symbol,
            price: quote.reservationPrice * (1 - quote.askSpread),
            stopLoss: current.close * (1 + params.stopLossPct),
            takeProfit: current.close * (1 - params.takeProfitPct),
          });
          continue;
        }

        if (position === "long" && sellBias) {
          position = "flat";
          signals.push({
            timestamp: current.timestamp,
            type: "close",
            symbol: current.symbol,
            price: quote.reservationPrice * (1 - quote.askSpread),
          });
          continue;
        }

        if (position === "short" && buyBias) {
          position = "flat";
          signals.push({
            timestamp: current.timestamp,
            type: "close",
            symbol: current.symbol,
            price: quote.reservationPrice * (1 + quote.bidSpread),
          });
        }
      }

      return signals;
    },
  };
}

function discoverGlobalActions(): string[] {
  const actionsDir = join(process.cwd(), "api", "actions");
  const files = readdirSync(actionsDir).filter((f) => f.endsWith(".ts"));
  return files.map((file) => file.replace(/\\.ts$/, ""));
}

export async function runHybridEthSimulation(): Promise<HybridSimulationReport> {
  const marketData = generateSyntheticMarketData(500, "ETH/USDT");
  const strategy = buildHybridStrategy();

  const engine = new BacktestEngine({
    initialCapital: 10_000,
    commission: 0.001,
    slippage: 0.0005,
    leverage: 1,
  });

  const result = await engine.run(strategy, marketData);

  const monteCarlo = new MonteCarloSimulator();
  const mc = monteCarlo.simulate(result.trades, 10_000, 200);
  const actions = discoverGlobalActions();

  return {
    trades: result.metrics.totalTrades,
    winRate: result.metrics.winRate,
    totalReturnPercent: result.totalReturnPercent,
    sharpeRatio: result.metrics.sharpeRatio,
    maxDrawdownPercent: result.metrics.maxDrawdownPercent,
    probabilityOfProfit: mc.probabilityOfProfit,
    riskOfRuin: mc.riskOfRuin,
    actionsCovered: actions.length,
    algorithmsUsed: [
      "freqtrade-inspired-ema-rsi",
      "hummingbot-inspired-quote-skew",
      "signalGenerator:momentum",
      "signalGenerator:mean-reversion",
      "signalGenerator:breakout",
      "signalGenerator:trend-following",
    ],
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export async function runHeavyPortfolioSimulation(
  iterations: number = 20,
  symbols: string[] = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT"]
): Promise<HeavySimulationReport> {
  const strategy = buildHybridStrategy();
  const engine = new BacktestEngine({
    initialCapital: 10_000,
    commission: 0.001,
    slippage: 0.0005,
    leverage: 1,
  });

  const returns: number[] = [];
  const winRates: number[] = [];
  const sharpes: number[] = [];
  const drawdowns: number[] = [];
  let profitableRuns = 0;
  let aiPositive = 0;
  let scannedAlgorithmExports = 0;
  let scannedLibFiles = 0;

  for (let i = 0; i < iterations; i++) {
    for (const symbol of symbols) {
      const candles = 700 + (i % 5) * 100;
      const marketData = generateSyntheticMarketData(candles, symbol);
      const result = await engine.run(strategy, marketData);
      const unified = buildUnifiedAlgorithmSnapshot(symbol, marketData);
      scannedAlgorithmExports = Math.max(
        scannedAlgorithmExports,
        unified.projectCoverage.totalAlgorithmExports
      );
      scannedLibFiles = Math.max(scannedLibFiles, unified.projectCoverage.totalLibFilesScanned);
      const ai = await getLocalAIMarketBias({
        symbol,
        price: marketData[marketData.length - 1].close,
        rsi: unified.indicators.rsi ?? 50,
        sma20: unified.indicators.vwap ?? marketData[marketData.length - 1].close,
        sma50: unified.indicators.vwap ?? marketData[marketData.length - 1].close,
        volumeRatio: 1,
        freqtradeAction: unified.upstream.freqtradeAction,
        algorithmSnapshot: {
          strategyVotes: unified.strategyVotes,
          indicators: unified.indicators,
          upstream: unified.upstream,
          quantum: unified.quantum,
          projectCoverage: unified.projectCoverage,
          backtest: {
            totalReturnPercent: result.totalReturnPercent,
            sharpeRatio: result.metrics.sharpeRatio,
            winRate: result.metrics.winRate,
          },
        },
      });

      returns.push(result.totalReturnPercent);
      winRates.push(result.metrics.winRate);
      sharpes.push(result.metrics.sharpeRatio);
      drawdowns.push(result.metrics.maxDrawdownPercent);

      if (result.totalReturnPercent > 0) profitableRuns += 1;
      if (ai.action === "buy" || ai.action === "hold") aiPositive += 1;
    }
  }

  const totalRuns = iterations * symbols.length;
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  return {
    iterations,
    symbols,
    totalBacktests: totalRuns,
    avgReturnPercent: avg(returns),
    medianReturnPercent: median(returns),
    bestReturnPercent: Math.max(...returns),
    worstReturnPercent: Math.min(...returns),
    avgWinRate: avg(winRates),
    avgSharpeRatio: avg(sharpes),
    profitableRunsPercent: (profitableRuns / totalRuns) * 100,
    avgMaxDrawdownPercent: avg(drawdowns),
    aiPositiveBiasPercent: (aiPositive / totalRuns) * 100,
    scannedAlgorithmExports,
    scannedLibFiles,
  };
}
