import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { authMiddleware } from "./auth";

const router = Router();
router.use(authMiddleware);

router.get("/", (req: any, res) => {
  const db = getDb();
  const wallets = db.prepare("SELECT * FROM wallets WHERE userId = ?").all(req.userId);
  res.json({ ok: true, wallets });
});

router.get("/transactions", (req: any, res) => {
  const db = getDb();
  const txs = db.prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 50").all(req.userId);
  res.json({ ok: true, transactions: txs });
});

router.post("/deposit", (req: any, res) => {
  const { currency, amount } = req.body;
  if (!currency || !amount || amount <= 0) return res.status(400).json({ error: "Invalid" });
  const db = getDb();
  const id = uuid();
  db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status) VALUES (?, ?, 'deposit', ?, ?, 'completed')").run(id, req.userId, currency, amount);
  db.prepare("UPDATE wallets SET balance = balance + ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(amount, req.userId, currency);
  const wallet = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, currency);
  res.json({ ok: true, transactionId: id, wallet });
});

router.post("/withdraw", (req: any, res) => {
  const { currency, amount } = req.body;
  if (!currency || !amount || amount <= 0) return res.status(400).json({ error: "Invalid" });
  const db = getDb();
  const wallet = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, currency) as any;
  if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
  const id = uuid();
  db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status) VALUES (?, ?, 'withdrawal', ?, ?, 'completed')").run(id, req.userId, currency, amount);
  db.prepare("UPDATE wallets SET balance = balance - ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(amount, req.userId, currency);
  res.json({ ok: true, transactionId: id });
});

router.post("/transfer", (req: any, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  if (!fromCurrency || !toCurrency || !amount || amount <= 0) return res.status(400).json({ error: "Invalid" });
  const db = getDb();
  const from = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, fromCurrency) as any;
  if (!from || from.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
  // Simple 1:1 transfer (in real life, use exchange rates)
  db.prepare("UPDATE wallets SET balance = balance - ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(amount, req.userId, fromCurrency);
  db.prepare("UPDATE wallets SET balance = balance + ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(amount, req.userId, toCurrency);
  const id = uuid();
  db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status, metadata) VALUES (?, ?, 'transfer', ?, ?, 'completed', ?)").run(id, req.userId, fromCurrency, amount, JSON.stringify({ from: fromCurrency, to: toCurrency }));
  res.json({ ok: true, transactionId: id });
});

export default router;
