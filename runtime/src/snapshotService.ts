import { buildUnifiedAlgorithmSnapshot } from "../../api/lib/trading/unifiedAlgorithmSnapshot";
import { MarketDataService, type Candle } from "./exchangeService";

const market = new MarketDataService();

export async function runAnalysisSnapshot(symbol: string, timeframe = "1h", limit = 120) {
  const candles: Candle[] = await market.fetchOHLCV(symbol, timeframe, limit);
  const marketData = candles.map((c) => ({
    close: c.close,
    high: c.high,
    low: c.low,
    volume: c.volume,
    timestamp: new Date(c.timestamp),
  }));

  const snapshot = buildUnifiedAlgorithmSnapshot(symbol.toUpperCase(), marketData);

  const last = candles[candles.length - 1];

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    source: "live-binance",
    lastPrice: last?.close ?? 0,
    lastTimestamp: last ? new Date(last.timestamp).toISOString() : null,
    analysis: snapshot,
    disclaimer:
      "AI/quant outputs are computed from real market data with the project's algorithms. They are estimates for research, not financial advice.",
  };
}
