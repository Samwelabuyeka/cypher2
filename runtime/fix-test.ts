import { fetchTenYearsDaily, candlesToMarketData } from "./src/dataEngine";
import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type BacktestResult,
  type Signal as BTSignal,
} from "../api/lib/backtesting/backtestEngine";
import { buildEnsembleSignals, toMarketData, STRATEGY_WEIGHTS, NAMES } from "./src/strategyEngine";
import { OHLCV } from "./src/strategyEngine";

(async () => {
  const raw = await fetchTenYearsDaily("BTC");
  const candles = raw.map((c) => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  })) as OHLCV[];
  const testCandles = candles.slice(-500);

  console.log("=== Strategy Engine Test (cached 10yr BTC data) ===");
  console.log("Testing with", testCandles.length, "candles");

  const btSignals: BTSignal[] = buildEnsembleSignals(testCandles, "BTC").map((s) => ({
    timestamp: new Date(s.timestamp),
    type: s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : "close",
    symbol: "BTC",
    price: s.price,
  }));

  console.log("Total signals:", btSignals.length);
  const bu = btSignals.filter((s) => s.type === "buy").length;
  const se = btSignals.filter((s) => s.type === "sell").length;
  const cl = btSignals.filter((s) => s.type === "close").length;
  console.log("Buy:", bu, "Sell:", se, "Close:", cl);

  const strategy = {
    name: "Multi-Strategy Ensemble",
    parameters: {
      strategyNames: NAMES,
      weights: STRATEGY_WEIGHTS,
      ensembleThreshold: 0.6,
    },
    generateSignals: (_data: MarketData[], _params: any) => btSignals,
  } satisfies any;

  const config: BacktestConfig = {
    initialCapital: 10_000,
    commission: 0.001,
    slippage: 0.001,
  };
  const engine = new BacktestEngine(config);
  const data = toMarketData(testCandles);
  const result = await engine.run(strategy, data);

  console.log("");
  console.log("Strategy:", strategy.name);
  console.log("Return:", result.totalReturnPercent.toFixed(2) + "%");
  console.log("Sharpe:", (result.metrics.sharpeRatio ?? 0).toFixed(3));
  console.log("MaxDD:", (result.metrics.maxDrawdownPercent ?? 0).toFixed(1) + "%");
  console.log("Trades:", result.trades.length);
  console.log("WinRate:", (result.metrics.winRate ?? 0).toFixed(1) + "%");
  console.log("Final:", result.finalCapital.toFixed(2));
  console.log("");
  if (result.trades.length > 0 && (result.metrics.sharpeRatio ?? 0) >= 0) {
    console.log("SUCCESS: Backtest produced meaningful results");
  } else {
    console.log("WARNING: No trades or invalid metrics");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  console.error(e.stack);
});
