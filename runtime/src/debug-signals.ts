import { precomputeAllStrategySignals, combineSignalsWithWeights, NAMES, ENSEMBLE_THRESHOLD } from "./advancedEngine";
import { fetchTenYearsDaily, candlesToMarketData } from "./dataEngine";
import { BacktestEngine, type Strategy, type Signal as BTSignal } from "../../api/lib/backtesting/backtestEngine";

async function main() {
  const raw = await fetchTenYearsDaily("BTC");
  const data = candlesToMarketData(raw);
  const cutoff = new Date("2024-01-01").getTime();
  const test = data.filter(d => d.timestamp.getTime() >= cutoff);
  const ohlcv = test.map(d => ({
    timestamp: d.timestamp.getTime(), open: d.open, high: d.high,
    low: d.low, close: d.close, volume: d.volume
  }));

  const defaultW: Record<string, number> = {};
  for (const n of NAMES) defaultW[n] = 1 / NAMES.length;
  const allSignals = precomputeAllStrategySignals(ohlcv, "BTC/USDT");

  console.log("=== Signal counts per strategy on 2024-2025 BTC (BULL MARKET) ===");
  console.log("BTC went from $42k to $100k+ — we should see MORE BUYs than SELLs\n");
  for (let i = 0; i < NAMES.length; i++) {
    const buys = allSignals[i].filter(s => s.type === "BUY").length;
    const sells = allSignals[i].filter(s => s.type === "SELL").length;
    const ratio = sells > 0 ? (buys / sells).toFixed(1) : "INF";
    console.log(`${NAMES[i].padEnd(22)} BUY: ${String(buys).padStart(3)}  SELL: ${String(sells).padStart(3)}  B/S: ${ratio}`);
  }

  const combined = combineSignalsWithWeights(allSignals, ohlcv, "BTC/USDT", defaultW, ENSEMBLE_THRESHOLD);
  const totalBuys = combined.filter(s => s.type === "BUY").length;
  const totalSells = combined.filter(s => s.type === "SELL").length;
  console.log(`\nEnsemble BUY: ${totalBuys}  SELL: ${totalSells}  Ratio: ${(totalBuys/totalSells).toFixed(1)}`);

  // Now test: what happens with a simple buy-and-hold?
  const startPrice = ohlcv[0].close;
  const endPrice = ohlcv[ohlcv.length - 1].close;
  const bnhReturn = ((endPrice - startPrice) / startPrice * 100);
  console.log(`\nBuy-and-hold return: ${bnhReturn.toFixed(1)}% ($${startPrice.toFixed(0)} -> $${endPrice.toFixed(0)})`);

  // Test with ONLY buy signals (no sells) to see if BUYs are at least at good times
  const buyOnlyStrategy: Strategy = {
    name: "Buy-only",
    parameters: {},
    generateSignals: () => combined.map(s => ({
      timestamp: new Date(s.timestamp),
      type: (s.type === "SELL" ? "close" : s.type === "BUY" ? "buy" : "close") as "buy" | "sell" | "close",
      symbol: "BTC/USDT",
      price: s.price,
    })),
  };

  const btSignals = combined.map(s => ({
    timestamp: new Date(s.timestamp),
    type: (s.type === "BUY" ? "buy" : s.type === "SELL" ? "sell" : "close") as "buy" | "sell" | "close",
    symbol: "BTC/USDT",
    price: s.price,
  }));
  
  // Show first 20 signals
  console.log("\n=== First 20 ensemble signals ===");
  for (const s of combined.slice(0, 20)) {
    const date = new Date(s.timestamp).toISOString().slice(0,10);
    console.log(`${date} ${s.type.padEnd(5)} $${s.price.toFixed(0)}`);
  }

  // Show last 20 signals
  console.log("\n=== Last 20 ensemble signals ===");
  for (const s of combined.slice(-20)) {
    const date = new Date(s.timestamp).toISOString().slice(0,10);
    console.log(`${date} ${s.type.padEnd(5)} $${s.price.toFixed(0)}`);
  }
}

main().catch(e => console.error(e));
