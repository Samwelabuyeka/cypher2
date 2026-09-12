import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { MarketDataService, type Candle } from "./exchangeService";
import { runRealBacktest, type RunBacktestParams } from "./backtestService";
import { runAnalysisSnapshot } from "./snapshotService";
import { runFullPipeline } from "./pipeline";
import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy,
} from "../../api/lib/backtesting/backtestEngine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const PORT = parseInt(process.env.PORT ?? "4000", 10);

const market = new MarketDataService(
  true,
  process.env.BINANCE_API_KEY,
  process.env.BINANCE_API_SECRET
);

// Top 50 Binance USDT pairs for simultaneous trading
const TOP_50_SYMBOLS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK",
  "MATIC", "UNI", "SHIB", "LTC", "BCH", "ATOM", "FIL", "APT", "ARB", "OP",
  "NEAR", "INJ", "SUI", "SEI", "TIA", "RUNE", "FTM", "ALGO", "SAND", "MANA",
  "AAVE", "MKR", "CRV", "SNX", "COMP", "ENS", "GRT", "IMX", "MANTA", "WLD",
  "PEPE", "FLOKI", "BONK", "WIF", "ORDI", "STX", "MNT", "JUP", "PYTH", "ONDO",
];

// ── Inline technical indicators ───────────────────────────────────────────
function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
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

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "cypher-runtime",
    version: "1.0.0",
    mode: "real",
    source: "live-binance",
    currencies: TOP_50_SYMBOLS.length,
    timestamp: new Date().toISOString(),
  });
});

// ── Live market data ────────────────────────────────────────────────────────
app.get("/api/ticker/:symbol", async (req, res) => {
  try {
    const ticker = await market.fetchTicker(req.params.symbol);
    res.json({ ok: true, source: "live-binance", data: ticker });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/tickers", async (_req, res) => {
  try {
    const tickers = await Promise.all(
      TOP_50_SYMBOLS.slice(0, 20).map((s) =>
        market.fetchTicker(s).catch(() => null)
      )
    );
    res.json({
      ok: true,
      source: "live-binance",
      count: tickers.filter(Boolean).length,
      data: tickers.filter(Boolean),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/top50", (_req, res) => {
  res.json({ ok: true, count: TOP_50_SYMBOLS.length, symbols: TOP_50_SYMBOLS });
});

app.get("/api/ohlcv/:symbol/:timeframe/:limit?", async (req, res) => {
  try {
    const limit = parseInt(req.params.limit ?? "200", 10);
    const candles = await market.fetchOHLCV(
      req.params.symbol,
      req.params.timeframe,
      limit
    );
    res.json({
      ok: true,
      source: "live-binance",
      count: candles.length,
      data: candles,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/orderbook/:symbol/:limit?", async (req, res) => {
  try {
    const limit = parseInt(req.params.limit ?? "20", 10);
    const book = await market.fetchOrderBook(req.params.symbol, limit);
    res.json({ ok: true, source: "live-binance", data: book });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Multi-symbol analysis ──────────────────────────────────────────────────
app.get("/api/analysis/:symbol/:timeframe?", async (req, res) => {
  try {
    const snapshot = await runAnalysisSnapshot(
      req.params.symbol,
      req.params.timeframe ?? "1h",
      120
    );
    res.json({ ok: true, data: snapshot });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/analysis/batch/:symbols/:timeframe?", async (req, res) => {
  try {
    const symbols = req.params.symbols.split(",");
    const tf = req.params.timeframe ?? "1h";
    const results = await Promise.all(
      symbols.map((s) =>
        runAnalysisSnapshot(s, tf, 120).catch((e) => ({
          symbol: s,
          error: e.message,
        }))
      )
    );
    res.json({ ok: true, count: results.length, data: results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Backtest ────────────────────────────────────────────────────────────────
app.post("/api/backtest", async (req, res) => {
  try {
    const params: RunBacktestParams = {
      symbol: req.body.symbol ?? "BTC",
      timeframe: req.body.timeframe ?? "1d",
      limit: req.body.limit ?? 500,
      initialCapital: req.body.initialCapital ?? 10_000,
      short: req.body.short ?? 10,
      long: req.body.long ?? 30,
      commission: req.body.commission ?? 0.001,
      slippage: req.body.slippage ?? 0.001,
    };
    const result = await runRealBacktest(params);
    res.json({ ok: true, data: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Full pipeline ──────────────────────────────────────────────────────────
app.post("/api/pipeline", async (req, res) => {
  try {
    const result = await runFullPipeline(req.body.symbol ?? "BTC");
    res.json({ ok: true, data: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Live portfolio scan: analyze all 50 currencies ─────────────────────────
app.get("/api/portfolio/scan", async (_req, res) => {
  try {
    console.log("[portfolio] Scanning all 50 currencies...");
    const results: any[] = [];
    for (let i = 0; i < TOP_50_SYMBOLS.length; i += 5) {
      const batch = TOP_50_SYMBOLS.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const candles = await market.fetchOHLCV(symbol, "1d", 60);
            if (candles.length < 30) return { symbol, error: "insufficient data" };
            const closes = candles.map((c) => c.close);
            const volumes = candles.map((c) => c.volume);
            const currentPrice = closes[closes.length - 1];
            const sma10 = sma(closes, 10);
            const sma30 = sma(closes, 30);
            const rsi14 = rsi(closes, 14);
            const lastRsi = rsi14[rsi14.length - 1];
            const lastSma10 = sma10[sma10.length - 1];
            const lastSma30 = sma30[sma30.length - 1];
            const priceChange7d =
              ((currentPrice - closes[Math.max(0, closes.length - 8)]) /
                closes[Math.max(0, closes.length - 8)]) *
              100;
            const avgVolume =
              volumes.slice(-7).reduce((a, b) => a + b, 0) / 7;
            const signal =
              lastSma10 > lastSma30 && lastRsi < 70
                ? "BUY"
                : lastSma10 < lastSma30 && lastRsi > 30
                  ? "SELL"
                  : "HOLD";
            return {
              symbol,
              price: currentPrice,
              change7d: Math.round(priceChange7d * 100) / 100,
              rsi: Math.round((lastRsi ?? 50) * 10) / 10,
              signal,
              sma10: lastSma10,
              sma30: lastSma30,
              avgVolume7d: avgVolume,
            };
          } catch {
            return { symbol, error: "fetch failed" };
          }
        })
      );
      results.push(...batchResults);
      if (i + 5 < TOP_50_SYMBOLS.length) await new Promise((r) => setTimeout(r, 500));
    }
    const buys = results.filter((r) => r.signal === "BUY");
    const sells = results.filter((r) => r.signal === "SELL");
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      summary: { total: results.length, buys: buys.length, sells: sells.length, holds: results.length - buys.length - sells.length },
      opportunities: buys.sort((a, b) => (b.change7d ?? 0) - (a.change7d ?? 0)),
      data: results,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Start server ───────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("[ws] Client connected");
  const interval = setInterval(async () => {
    try {
      const ticker = await market.fetchTicker("BTC");
      ws.send(JSON.stringify({ type: "ticker", data: ticker }));
    } catch {}
  }, 5000);
  ws.on("close", () => clearInterval(interval));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ┌──────────────────────────────────────────────────┐`);
  console.log(`  │  cypher-runtime  v1.0.0                          │`);
  console.log(`  │  Source: LIVE BINANCE  |  Currencies: ${TOP_50_SYMBOLS.length}         │`);
  console.log(`  │  Port: ${String(PORT).padEnd(43)}│`);
  console.log(`  ├──────────────────────────────────────────────────┤`);
  console.log(`  │  GET  /health                                    │`);
  console.log(`  │  GET  /api/ticker/:symbol                        │`);
  console.log(`  │  GET  /api/tickers            ← top 20 live      │`);
  console.log(`  │  GET  /api/top50              ← 50 symbols       │`);
  console.log(`  │  GET  /api/ohlcv/:symbol/:tf/:limit              │`);
  console.log(`  │  GET  /api/orderbook/:symbol                     │`);
  console.log(`  │  GET  /api/analysis/:symbol                      │`);
  console.log(`  │  GET  /api/analysis/batch/:s1,s2,s3              │`);
  console.log(`  │  GET  /api/portfolio/scan     ← scan all 50      │`);
  console.log(`  │  POST /api/backtest                              │`);
  console.log(`  │  POST /api/pipeline            ← train+test      │`);
  console.log(`  │  WS   /ws                      ← live BTC feed   │`);
  console.log(`  └──────────────────────────────────────────────────┘\n`);
});
