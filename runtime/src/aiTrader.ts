import { getDb } from "./db";
import { getExchangeForUser, placeOrder, getAllUserBalances } from "./exchangeManager";
import { fetchTenYearsDaily, candlesToMarketData } from "./dataEngine";
import {
  precomputeAllStrategySignals,
  combineSignalsWithWeights,
  NAMES as STRATEGY_NAMES,
  ENSEMBLE_THRESHOLD,
  type OHLCV,
} from "./advancedEngine";

const TOP_SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT",
  "MATIC/USDT", "UNI/USDT", "LTC/USDT", "ATOM/USDT", "NEAR/USDT",
];

interface TradingDecision {
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  confidence: number;
  reason: string;
  strategy: string;
  timeframe: string;
}

export async function analyzeAndDecide(userId: string): Promise<TradingDecision[]> {
  const db = getDb();
  const config = db.prepare("SELECT * FROM trading_config WHERE userId = ?").get(userId) as any;
  if (!config || !config.enabled) return [];

  const maxSpend = config.maxDailySpend || 1000;
  const riskLevel = config.riskLevel || "medium";
  const decisions: TradingDecision[] = [];

  const keys = db.prepare("SELECT DISTINCT exchange FROM api_keys WHERE userId = ?").all(userId) as any[];
  if (keys.length === 0) return [];

  const exchangeName = keys[0].exchange;

  for (const symbol of TOP_SYMBOLS) {
    try {
      const raw = await fetchTenYearsDaily(symbol.replace("/USDT", ""));
      if (raw.length < 200) continue;
      const allData = candlesToMarketData(raw, symbol);
      const recentData = allData.slice(-300);

      const ohlcv: OHLCV[] = recentData.map(d => ({
        timestamp: d.timestamp.getTime(),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));

      const allSignals = precomputeAllStrategySignals(ohlcv, symbol);
      const weights: Record<string, number> = {};
      for (const name of STRATEGY_NAMES) weights[name] = 1 / STRATEGY_NAMES.length;

      const combined = combineSignalsWithWeights(allSignals, ohlcv, symbol, weights, ENSEMBLE_THRESHOLD);

      const lastSignal = combined[combined.length - 1];
      const lastPrice = ohlcv[ohlcv.length - 1].close;
      const prevPrice = ohlcv[ohlcv.length - 2].close;
      const priceChange = (lastPrice - prevPrice) / prevPrice;

      const recent = combined.slice(-10);
      const buyCount = recent.filter(s => s.type === "BUY").length;
      const sellCount = recent.filter(s => s.type === "SELL").length;

      if (buyCount >= 3 && lastSignal.type !== "SELL") {
        const confidence = buyCount / 10;
        const riskMult = riskLevel === "high" ? 1.5 : riskLevel === "low" ? 0.5 : 1;
        const amount = Math.min(maxSpend * 0.1 * riskMult, maxSpend) / lastPrice;

        decisions.push({
          symbol,
          side: "buy",
          amount,
          confidence,
          reason: `Ensemble: ${buyCount}/10 recent BUY signals, price ${priceChange > 0 ? "rising" : "recovering"}`,
          strategy: "ensemble",
          timeframe: "1d",
        });
      } else if (sellCount >= 3) {
        decisions.push({
          symbol,
          side: "sell",
          amount: 0,
          confidence: sellCount / 10,
          reason: `Ensemble: ${sellCount}/10 recent SELL signals`,
          strategy: "ensemble",
          timeframe: "1d",
        });
      }
    } catch {}
  }

  decisions.sort((a, b) => b.confidence - a.confidence);
  let totalSpend = 0;
  const limited: TradingDecision[] = [];
  for (const d of decisions) {
    const cost = d.amount * (d.symbol.includes("BTC") ? 60000 : d.symbol.includes("ETH") ? 3000 : 100);
    if (totalSpend + cost <= maxSpend) {
      limited.push(d);
      totalSpend += cost;
    }
  }
  return limited;
}

export async function executeDecisions(userId: string, decisions: TradingDecision[]) {
  const results: any[] = [];
  const db = getDb();
  const keys = db.prepare("SELECT DISTINCT exchange FROM api_keys WHERE userId = ?").all(userId) as any[];
  if (keys.length === 0) return results;
  const exchangeName = keys[0].exchange;

  for (const d of decisions) {
    try {
      if (d.side === "buy" && d.amount > 0) {
        const result = await placeOrder(userId, exchangeName, d.symbol, "buy", d.amount);
        results.push({ ...d, status: "executed", orderId: result.order.id });
      }
    } catch (e: any) {
      results.push({ ...d, status: "failed", error: e.message });
    }
  }
  return results;
}

export async function runAiCycle(userId: string) {
  console.log(`[ai] Running analysis cycle for user ${userId}`);
  const decisions = await analyzeAndDecide(userId);
  if (decisions.length === 0) {
    console.log(`[ai] No actionable decisions`);
    return [];
  }
  console.log(`[ai] Found ${decisions.length} decisions`);
  const results = await executeDecisions(userId, decisions);
  return results;
}
