import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type BacktestResult,
} from "../../api/lib/backtesting/backtestEngine";
import { buildParamGrid, createStrategy, type StrategyParams } from "./dataEngine";

export interface TrainResult {
  bestParams: StrategyParams;
  bestSharpe: number;
  bestReturn: number;
  trainMetrics: any;
  allResults: Array<{ params: StrategyParams; sharpe: number; totalReturn: number; maxDrawdown: number; winRate: number; trades: number }>;
}

export async function trainOnHistoricalData(
  trainData: MarketData[],
  initialCapital: number
): Promise<TrainResult> {
  console.log(`  [train] Optimizing on ${trainData.length} candles...`);

  const grid = buildParamGrid();
  console.log(`  [train] Testing ${grid.length} parameter combinations...`);

  let bestSharpe = -Infinity;
  let bestParams = grid[0];
  let bestReturn = -Infinity;
  let bestMetrics: any = null;
  const results: TrainResult["allResults"] = [];

  for (const params of grid) {
    const strategy = createStrategy(params);
    const config: BacktestConfig = {
      initialCapital,
      commission: 0.001,
      slippage: 0.001,
      leverage: 1,
      compounding: true,
    };
    const engine = new BacktestEngine(config);
    try {
      const result = await engine.run(strategy, trainData);
      const m = result.metrics;
      const entry = {
        params,
        sharpe: m.sharpeRatio ?? 0,
        totalReturn: result.totalReturnPercent,
        maxDrawdown: m.maxDrawdownPercent ?? 0,
        winRate: m.winRate ?? 0,
        trades: result.trades.length,
      };
      results.push(entry);

      if ((m.sharpeRatio ?? 0) > bestSharpe) {
        bestSharpe = m.sharpeRatio ?? 0;
        bestParams = params;
        bestReturn = result.totalReturnPercent;
        bestMetrics = m;
      }
    } catch {
      // no signals on this data
    }
  }

  results.sort((a, b) => b.sharpe - a.sharpe);

  console.log("  [train] Top 5:");
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i];
    console.log(
      `         #${i + 1} SMA(${r.params.fastSma}/${r.params.slowSma})${r.params.rsiFilter ? "+RSI" : ""}` +
      `  sharpe=${r.sharpe.toFixed(2)}  return=${r.totalReturn.toFixed(1)}%  dd=${r.maxDrawdown.toFixed(1)}%  trades=${r.trades}`
    );
  }

  return { bestParams, bestSharpe, bestReturn, trainMetrics: bestMetrics, allResults: results.slice(0, 20) };
}

export interface OutOfSampleResult {
  params: StrategyParams;
  result: BacktestResult;
  sharpe: number;
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
}

export async function testOutOfSample(
  testData: MarketData[],
  params: StrategyParams,
  initialCapital: number
): Promise<OutOfSampleResult> {
  console.log(`  [test] Running out-of-sample backtest on ${testData.length} candles...`);

  const strategy = createStrategy(params);
  const config: BacktestConfig = {
    initialCapital,
    commission: 0.001,
    slippage: 0.001,
    leverage: 1,
    compounding: true,
  };
  const engine = new BacktestEngine(config);
  const result = await engine.run(strategy, testData);

  console.log(`  [test] Trades: ${result.trades.length}`);
  console.log(`  [test] Total return: ${result.totalReturnPercent.toFixed(2)}%`);
  console.log(`  [test] Final capital: $${result.finalCapital.toFixed(2)}`);
  console.log(`  [test] Sharpe ratio: ${result.metrics.sharpeRatio?.toFixed(3)}`);
  console.log(`  [test] Max drawdown: ${result.metrics.maxDrawdownPercent?.toFixed(1)}%`);
  console.log(`  [test] Win rate: ${result.metrics.winRate?.toFixed(1)}%`);

  return {
    params,
    result,
    sharpe: result.metrics.sharpeRatio ?? 0,
    totalReturn: result.totalReturnPercent,
    maxDrawdown: result.metrics.maxDrawdownPercent ?? 0,
    winRate: result.metrics.winRate ?? 0,
    totalTrades: result.trades.length,
  };
}
