import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { MarketDataService, type Candle } from "./exchangeService";
import { runFullPipeline } from "./pipeline";
import { getDb } from "./db";
import authRouter from "./auth";
import walletRouter from "./wallet";
import mpesaRouter from "./mpesa";
import apiKeysRouter from "./apiKeys";
import tradingConfigRouter from "./tradingConfig";
import { runAiCycle } from "./aiTrader";
import { SUPPORTED_EXCHANGES } from "./exchangeManager";

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

// ── Auth & User Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/mpesa", mpesaRouter);
app.use("/api/keys", apiKeysRouter);
app.use("/api/trading", tradingConfigRouter);

// ── Supported exchanges ───────────────────────────────────────────────────
app.get("/api/exchanges", (_req, res) => {
  res.json({ ok: true, exchanges: SUPPORTED_EXCHANGES });
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "cypher-runtime",
    version: "2.0.0",
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
    res.json({ ok: true, source: "live-binance", count: candles.length, data: candles });
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

// ── Portfolio scan ──────────────────────────────────────────────────────────
app.get("/api/portfolio/scan", async (_req, res) => {
  try {
    const results: any[] = [];
    for (let i = 0; i < TOP_50_SYMBOLS.length; i += 5) {
      const batch = TOP_50_SYMBOLS.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const candles = await market.fetchOHLCV(symbol, "1d", 60);
            if (candles.length < 30) return { symbol, error: "insufficient data" };
            const closes = candles.map((c) => c.close);
            const currentPrice = closes[closes.length - 1];
            const sma10 = sma(closes, 10);
            const sma30 = sma(closes, 30);
            const rsi14 = rsi(closes, 14);
            const lastRsi = rsi14[rsi14.length - 1];
            const lastSma10 = sma10[sma10.length - 1];
            const lastSma30 = sma30[sma30.length - 1];
            const priceChange7d = ((currentPrice - closes[Math.max(0, closes.length - 8)]) / closes[Math.max(0, closes.length - 8)]) * 100;
            const signal = lastSma10 > lastSma30 && lastRsi < 70 ? "BUY" : lastSma10 < lastSma30 && lastRsi > 30 ? "SELL" : "HOLD";
            return { symbol, price: currentPrice, change7d: Math.round(priceChange7d * 100) / 100, rsi: Math.round((lastRsi ?? 50) * 10) / 10, signal, sma10: lastSma10, sma30: lastSma30 };
          } catch { return { symbol, error: "fetch failed" }; }
        })
      );
      results.push(...batchResults);
      if (i + 5 < TOP_50_SYMBOLS.length) await new Promise((r) => setTimeout(r, 500));
    }
    const buys = results.filter((r) => r.signal === "BUY");
    const sells = results.filter((r) => r.signal === "SELL");
    res.json({ ok: true, timestamp: new Date().toISOString(), summary: { total: results.length, buys: buys.length, sells: sells.length, holds: results.length - buys.length - sells.length }, opportunities: buys.sort((a: any, b: any) => (b.change7d ?? 0) - (a.change7d ?? 0)), data: results });
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

// ── AI Trading ──────────────────────────────────────────────────────────────
app.get("/api/ai/analyze", async (req: any, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Auth required" });
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || "cypher-secret") as { userId: string };
    const { analyzeAndDecide } = await import("./aiTrader");
    const decisions = await analyzeAndDecide(decoded.userId);
    res.json({ ok: true, decisions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
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

// AI trading cycle (every 15 minutes)
let aiRunning = false;
setInterval(async () => {
  if (aiRunning) return;
  aiRunning = true;
  try {
    const db = getDb();
    const users = db.prepare("SELECT userId FROM trading_config WHERE enabled = 1 AND autoTrade = 1").all() as any[];
    for (const u of users) {
      try { await runAiCycle(u.userId); } catch {}
    }
  } catch {}
  aiRunning = false;
}, 15 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ┌──────────────────────────────────────────────────┐`);
  console.log(`  │  cypher-runtime  v2.0.0                          │`);
  console.log(`  │  Source: LIVE BINANCE  |  Currencies: ${TOP_50_SYMBOLS.length}         │`);
  console.log(`  │  Port: ${String(PORT).padEnd(43)}│`);
  console.log(`  ├──────────────────────────────────────────────────┤`);
  console.log(`  │  Auth:   /api/auth/{register,login,me}           │`);
  console.log(`  │  Wallet: /api/wallet/{deposit,withdraw,transfer} │`);
  console.log(`  │  M-Pesa: /api/mpesa/deposit                     │`);
  console.log(`  │  Keys:   /api/keys/{add,test,delete}             │`);
  console.log(`  │  Trade:  /api/trading/{config,analyze,execute}   │`);
  console.log(`  │  Market: /api/{ticker,tickers,ohlcv,portfolio}   │`);
  console.log(`  │  AI:     /api/ai/analyze                        │`);
  console.log(`  │  WS:     /ws                    ← live BTC feed │`);
  console.log(`  └──────────────────────────────────────────────────┘\n`);
});
