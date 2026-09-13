import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { authMiddleware } from "./auth";
import { SUPPORTED_EXCHANGES, getExchange } from "./exchangeManager";

const router = Router();
router.use(authMiddleware);

// List user's API keys (masked)
router.get("/", (req: any, res) => {
  const db = getDb();
  const keys = db.prepare("SELECT id, exchange, apiKey, isTestnet, createdAt FROM api_keys WHERE userId = ?").all(req.userId);
  const masked = keys.map((k: any) => ({
    ...k,
    apiKey: k.apiKey.slice(0, 6) + "..." + k.apiKey.slice(-4),
    apiSecret: "••••••••",
  }));
  res.json({ ok: true, keys: masked, supported: SUPPORTED_EXCHANGES });
});

// Add API key
router.post("/", (req: any, res) => {
  try {
    const { exchange, apiKey, apiSecret, passphrase, isTestnet } = req.body;
    if (!exchange || !apiKey || !apiSecret) return res.status(400).json({ error: "exchange, apiKey, apiSecret required" });
    if (!SUPPORTED_EXCHANGES.includes(exchange.toLowerCase())) {
      return res.status(400).json({ error: `Unsupported exchange. Available: ${SUPPORTED_EXCHANGES.join(", ")}` });
    }
    const db = getDb();
    const id = uuid();
    db.prepare("INSERT INTO api_keys (id, userId, exchange, apiKey, apiSecret, passphrase, isTestnet) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, req.userId, exchange.toLowerCase(), apiKey, apiSecret, passphrase || null, isTestnet ? 1 : 0
    );
    res.json({ ok: true, keyId: id, exchange });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Test API key connection
router.post("/test", async (req: any, res) => {
  try {
    const { exchange, apiKey, apiSecret, passphrase, isTestnet } = req.body;
    const ex = getExchange(exchange, { exchange, apiKey, apiSecret, passphrase, isTestnet });
    const balance = await ex.fetchBalance();
    const totalUsd = Object.entries(balance.total)
      .filter(([_, v]) => (v as number) > 0)
      .reduce((sum, [k, v]) => {
        if (k === "USDT" || k === "USD" || k === "USDC") return sum + (v as number);
        return sum;
      }, 0);
    res.json({ ok: true, connected: true, balance: totalUsd });
  } catch (e: any) {
    res.json({ ok: false, connected: false, error: e.message });
  }
});

// Delete API key
router.delete("/:id", (req: any, res) => {
  const db = getDb();
  db.prepare("DELETE FROM api_keys WHERE id = ? AND userId = ?").run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
