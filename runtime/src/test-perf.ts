import { precomputeAllStrategySignals, combineSignalsWithWeights, NAMES, ENSEMBLE_THRESHOLD } from "./advancedEngine";
import { BacktestEngine, type MarketData } from "../../api/lib/backtesting/backtestEngine";
import { fetchTenYearsDaily, candlesToMarketData } from "./dataEngine";

async function main() {
  const raw = await fetchTenYearsDaily("BTC");
  const data = candlesToMarketData(raw);
  const cutoff = new Date("2024-01-01").getTime();
  const train = data.filter(d => d.timestamp.getTime() < cutoff);

  const ohlcv = train.map(d => ({
    timestamp: d.timestamp.getTime(), open: d.open, high: d.high,
    low: d.low, close: d.close, volume: d.volume
  }));

  const defaultWeights: Record<string, number> = {};
  for (const n of NAMES) defaultWeights[n] = 1 / NAMES.length;

  console.log(`Precomputing on ${ohlcv.length} candles...`);
  console.time("precompute");
  const allSignals = precomputeAllStrategySignals(ohlcv, "BTC/USDT");
  console.timeEnd("precompute");
  console.log(`Got ${allSignals.length} signal arrays, ${allSignals[0]?.length} candles each`);

  console.time("combine");
  const combined = combineSignalsWithWeights(allSignals, ohlcv, "BTC/USDT", defaultWeights, ENSEMBLE_THRESHOLD);
  console.timeEnd("combine");

  const buyCount = combined.filter(s => s.type === "BUY").length;
  const sellCount = combined.filter(s => s.type === "SELL").length;
  console.log(`BUY: ${buyCount}, SELL: ${sellCount}, HOLD: ${combined.length - buyCount - sellCount}`);

  const btSignals = combined.map(s => ({
    timestamp: new Date(s.timestamp),
    type: s.type === "BUY" ? "buy" as const : s.type === "SELL" ? "sell" as const : "close" as const,
    symbol: "BTC/USDT", price: s.price
  }));

  const strategy = { name: "ensemble", parameters: {}, generateSignals: () => btSignals };
  console.time("backtest");
  const engine = new BacktestEngine({ initialCapital: 10000, commission: 0.001, slippage: 0.001, leverage: 1, compounding: true });
  const result = await engine.run(strategy, train);
  console.timeEnd("backtest");
  console.log(`Sharpe: ${result.metrics.sharpeRatio}, Return: ${result.totalReturnPercent}%, Trades: ${result.trades.length}, MaxDD: ${result.metrics.maxDrawdownPercent}%`);
}

main().catch(e => console.error(e));
