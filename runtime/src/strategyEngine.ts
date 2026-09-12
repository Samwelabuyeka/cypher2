import { MarketDataService } from "./exchangeService";
import {
  StrategyEngine as AdvancedStrategyEngine,
  buildEnsembleSignals,
  toMarketData,
  computeSMAHelper as computeSMA,
  getRiskManagement,
  ENSEMBLE_THRESHOLD,
  NAMES,
  type Signal,
  type EngineSignal,
  type EngineStrategyParams,
  type OHLCV,
} from "./advancedEngine";

import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy as BTStrategy,
  type Strategy,
  type BacktestResult,
  type Signal as BTSignal,
} from "../../api/lib/backtesting/backtestEngine";

function computeEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      ema = sum / period;
      result.push(ema);
    } else {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
  }
  return result;
}

const STRATEGY_WEIGHTS_OLD: Record<string, number> = {
  MeanReversion: 0.15, MomentumBreakout: 0.15, MACDCrossover: 0.12,
  TrendFollower: 0.12, VolumeProfile: 0.12, MultiTimeframe: 0.12,
  IchimokuCloud: 0.12, StochasticRSI: 0.10,
};

const STRATEGY_NAMES_OLD = [
  "MeanReversion", "MomentumBreakout", "MACDCrossover", "TrendFollower",
  "VolumeProfile", "MultiTimeframe", "IchimokuCloud", "StochasticRSI",
] as const;

const STOP_LOSS_ATR_MULT = 1.5;
const TAKE_PROFIT_ATR_MULT = 3;
const POSITION_SIZE_PCT = 0.03;
const MAX_CONCURRENT_POSITIONS = 10;
const TRAILING_STOP_PCT = 0.02;

function toMarketDataLocal(candles: OHLCV[]): MarketData[] {
  return candles.map((c) => ({
    timestamp: new Date(c.timestamp), symbol: "BTC/USDT",
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
}

function buildStrategy(symbol: string, candles: OHLCV[]): BTStrategy {
  const ensembleSignals = buildEnsembleSignals(candles, symbol);
  const btSignals: BTSignal[] = ensembleSignals.map((s) => ({
    timestamp: new Date(s.timestamp),
    type: s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : "close",
    symbol, price: s.price,
  }));
  return {
    name: "Multi-Strategy Ensemble",
    parameters: { strategyNames: STRATEGY_NAMES_OLD, weights: STRATEGY_WEIGHTS_OLD, ensembleThreshold: ENSEMBLE_THRESHOLD },
    generateSignals: () => btSignals,
  };
}

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
  getStrategy(): Strategy {
    return buildStrategy(this.symbol, this.candles);
  }
  getRiskManagement() {
    const rm = getRiskManagement();
    return {
      stopLossMultiplier: rm.stopLossMultiplier,
      takeProfitMultiplier: rm.takeProfitMultiplier,
      positionSizePct: rm.positionSizePct,
      maxConcurrentPositions: rm.maxConcurrentPositions,
      trailingStopPct: rm.trailingStopPct,
    };
  }
}

export async function runAdvancedBacktest(
  symbol: string, timeframe: string, limit: number, capital: number
): Promise<{ result: BacktestResult; strategy: string; symbol: string; timeframe: string; source: string }> {
  const service = new MarketDataService();
  const ohlcv: OHLCV[] = await service.fetchOHLCV(symbol, timeframe, limit);
  const ensembleSignals = buildEnsembleSignals(ohlcv, symbol);
  const btSignals: BTSignal[] = ensembleSignals.map((s) => ({
    timestamp: new Date(s.timestamp),
    type: s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : "close",
    symbol, price: s.price,
  }));
  const strategy: BTStrategy = {
    name: "Multi-Strategy Ensemble",
    parameters: { strategyNames: STRATEGY_NAMES_OLD, weights: STRATEGY_WEIGHTS_OLD, ensembleThreshold: ENSEMBLE_THRESHOLD },
    generateSignals: () => btSignals,
  };
  const config: BacktestConfig = { initialCapital: capital, commission: 0.001, slippage: 0.001 };
  const engine = new BacktestEngine(config);
  const data = toMarketDataLocal(ohlcv);
  const result = await engine.run(strategy, data);
  return { result, strategy: strategy.name, symbol, timeframe, source: "MarketDataService" };
}

export type { Signal, EngineSignal, EngineStrategyParams, OHLCV };
export { NAMES, STRATEGY_WEIGHTS_OLD as STRATEGY_WEIGHTS, ENSEMBLE_THRESHOLD, STOP_LOSS_ATR_MULT, TAKE_PROFIT_ATR_MULT, POSITION_SIZE_PCT, MAX_CONCURRENT_POSITIONS };
export { buildEnsembleSignals, toMarketData, computeSMA, computeEMA };
export { AdvancedStrategyEngine as AdvancedStrategyEngineReExport };
