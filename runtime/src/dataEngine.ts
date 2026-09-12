import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy,
  type BacktestResult,
} from "../../api/lib/backtesting/backtestEngine";
import { MarketDataService, type Candle } from "./exchangeService";

const DATA_DIR = join(process.cwd(), "runtime", "data");
const CACHE_FILE = join(DATA_DIR, "btc-usdt-1d-10yr.json");

export const market = new MarketDataService(
  true,
  process.env.BINANCE_API_KEY,
  process.env.BINANCE_API_SECRET
);

const MS_PER_DAY = 86_400_000;

export async function fetchTenYearsDaily(symbol: string): Promise<Candle[]> {
  if (existsSync(CACHE_FILE)) {
    console.log("  [data] Loading cached 10yr daily data");
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  }
  console.log(`  [data] Fetching 10 years of daily ${symbol}/USDT from Binance...`);
  const now = Date.now();
  const start = now - 10 * 365 * MS_PER_DAY;
  const all: Candle[] = [];
  let cursor = start;

  while (cursor < now) {
    const raw: any = await (market as any).exchange.fetchOHLCV(
      `${symbol.toUpperCase()}/USDT`, "1d", cursor, 1000
    );
    for (const [ts, open, high, low, close, vol] of raw) {
      all.push({ timestamp: ts, open, high, low, close, volume: vol });
    }
    cursor += 1000 * MS_PER_DAY;
    await new Promise((r) => setTimeout(r, 300));
  }

  const seen = new Set<number>();
  const deduped = all
    .filter((c) => { if (seen.has(c.timestamp)) return false; seen.add(c.timestamp); return true; })
    .sort((a, b) => a.timestamp - b.timestamp);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(deduped));
  console.log(`  [data] Saved ${deduped.length} candles`);
  return deduped;
}

export function candlesToMarketData(candles: Candle[], symbol = "BTC/USDT"): MarketData[] {
  return candles
    .filter((c) => c.close > 0 && c.volume > 0)
    .map((c) => ({
      timestamp: new Date(c.timestamp),
      symbol,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
}

// ── Technical indicators ─────────────────────────────────────────────────────
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface StrategyParams {
  fastSma: number;
  slowSma: number;
  rsiFilter: boolean;
  rsiOversold: number;
  rsiOverbought: number;
}

export function createStrategy(p: StrategyParams): Strategy {
  return {
    name: `SMA(${p.fastSma}/${p.slowSma})${p.rsiFilter ? "+RSI" : ""}`,
    parameters: p,
    generateSignals: (data, params) => {
      const pp = params as unknown as StrategyParams;
      const closes = data.map((d) => d.close);
      const fast = sma(closes, pp.fastSma);
      const slow = sma(closes, pp.slowSma);
      const rsiVals = pp.rsiFilter ? rsi(closes, 14) : null;
      const signals = [];
      for (let i = 1; i < data.length; i++) {
        if ([fast[i], slow[i], fast[i - 1], slow[i - 1]].some(isNaN)) continue;
        const gc = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
        const dc = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
        if (gc) {
          if (pp.rsiFilter && rsiVals && !isNaN(rsiVals[i]) && rsiVals[i] > pp.rsiOverbought) continue;
          signals.push({ timestamp: data[i].timestamp, type: "buy" as const, symbol: data[i].symbol, price: data[i].close });
        } else if (dc) {
          if (pp.rsiFilter && rsiVals && !isNaN(rsiVals[i]) && rsiVals[i] < pp.rsiOversold) continue;
          signals.push({ timestamp: data[i].timestamp, type: "close" as const, symbol: data[i].symbol, price: data[i].close });
        }
      }
      return signals;
    },
  };
}

export function buildParamGrid(): StrategyParams[] {
  const grid: StrategyParams[] = [];
  for (const fast of [5, 8, 10, 15, 20]) {
    for (const slow of [20, 30, 40, 50, 60]) {
      if (fast >= slow) continue;
      for (const rsiF of [false, true]) {
        grid.push({ fastSma: fast, slowSma: slow, rsiFilter: rsiF, rsiOversold: 30, rsiOverbought: 70 });
      }
    }
  }
  return grid;
}
