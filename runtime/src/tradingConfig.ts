import { Router } from "express";
import { getDb } from "./db";
import { authMiddleware } from "./auth";
import { analyzeAndDecide, executeDecisions, runAiCycle } from "./aiTrader";

const router = Router();
router.use(authMiddleware);

router.get("/", (req: any, res) => {
  const db = getDb();
  let config = db.prepare("SELECT * FROM trading_config WHERE userId = ?").get(req.userId) as any;
  if (!config) {
    db.prepare("INSERT INTO trading_config (userId) VALUES (?)").run(req.userId);
    config = db.prepare("SELECT * FROM trading_config WHERE userId = ?").get(req.userId);
  }
  res.json({ ok: true, config });
});

router.put("/", (req: any, res) => {
  const { enabled, maxDailySpend, riskLevel, preferredPairs, autoTrade } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM trading_config WHERE userId = ?").get(req.userId) as any;
  if (!existing) {
    db.prepare("INSERT INTO trading_config (userId) VALUES (?)").run(req.userId);
  }
  if (enabled !== undefined) db.prepare("UPDATE trading_config SET enabled = ? WHERE userId = ?").run(enabled ? 1 : 0, req.userId);
  if (maxDailySpend !== undefined) db.prepare("UPDATE trading_config SET maxDailySpend = ? WHERE userId = ?").run(maxDailySpend, req.userId);
  if (riskLevel !== undefined) db.prepare("UPDATE trading_config SET riskLevel = ? WHERE userId = ?").run(riskLevel, req.userId);
  if (preferredPairs !== undefined) db.prepare("UPDATE trading_config SET preferredPairs = ? WHERE userId = ?").run(JSON.stringify(preferredPairs), req.userId);
  if (autoTrade !== undefined) db.prepare("UPDATE trading_config SET autoTrade = ? WHERE userId = ?").run(autoTrade ? 1 : 0, req.userId);
  db.prepare("UPDATE trading_config SET updatedAt = datetime('now') WHERE userId = ?").run(req.userId);
  const config = db.prepare("SELECT * FROM trading_config WHERE userId = ?").get(req.userId);
  res.json({ ok: true, config });
});

router.get("/analyze", async (req: any, res) => {
  try {
    const decisions = await analyzeAndDecide(req.userId);
    res.json({ ok: true, decisions, count: decisions.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/execute", async (req: any, res) => {
  try {
    const decisions = await analyzeAndDecide(req.userId);
    if (decisions.length === 0) return res.json({ ok: true, message: "No decisions", results: [] });
    const results = await executeDecisions(req.userId, decisions);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/trades", (req: any, res) => {
  const db = getDb();
  const trades = db.prepare("SELECT * FROM trades WHERE userId = ? ORDER BY createdAt DESC LIMIT 50").all(req.userId);
  res.json({ ok: true, trades });
});

export default router;
