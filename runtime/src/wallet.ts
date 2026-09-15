import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { authMiddleware } from "./auth";
import { getRate } from "./rates";

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

router.post("/transfer", async (req: any, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  if (!fromCurrency || !toCurrency || !amount || amount <= 0) return res.status(400).json({ error: "Invalid" });
  const db = getDb();
  const from = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, fromCurrency) as any;
  if (!from || from.balance < amount) return res.status(400).json({ error: "Insufficient balance" });

  // Get real exchange rate
  const rate = await getRate(fromCurrency, toCurrency);
  const convertedAmount = amount * rate;

  db.prepare("UPDATE wallets SET balance = balance - ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(amount, req.userId, fromCurrency);
  db.prepare("UPDATE wallets SET balance = balance + ?, updatedAt = datetime('now') WHERE userId = ? AND currency = ?").run(convertedAmount, req.userId, toCurrency);

  const id = uuid();
  db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status, metadata) VALUES (?, ?, 'transfer', ?, ?, 'completed', ?)").run(
    id, req.userId, fromCurrency, amount,
    JSON.stringify({ from: fromCurrency, to: toCurrency, rate, convertedAmount })
  );

  const walletFrom = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, fromCurrency);
  const walletTo = db.prepare("SELECT * FROM wallets WHERE userId = ? AND currency = ?").get(req.userId, toCurrency);

  res.json({
    ok: true,
    transactionId: id,
    rate,
    convertedAmount,
    fromWallet: walletFrom,
    toWallet: walletTo,
  });
});

// Get exchange rate without executing
router.get("/rate/:from/:to", async (req: any, res) => {
  try {
    const rate = await getRate(req.params.from, req.params.to);
    res.json({ ok: true, from: req.params.from, to: req.params.to, rate });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get total portfolio value in USDT
router.get("/total", async (req: any, res) => {
  try {
    const db = getDb();
    const wallets = db.prepare("SELECT * FROM wallets WHERE userId = ?").all(req.userId) as any[];
    let totalUsdt = 0;
    const breakdown: any[] = [];

    for (const w of wallets) {
      if (w.balance <= 0) continue;
      let valueUsdt = 0;
      if (w.currency === "USDT") {
        valueUsdt = w.balance;
      } else if (w.currency === "KES") {
        const rate = await getRate("KES", "USDT");
        valueUsdt = w.balance * rate;
      } else {
        const rate = await getRate(w.currency, "USDT");
        valueUsdt = w.balance * rate;
      }
      totalUsdt += valueUsdt;
      breakdown.push({ currency: w.currency, balance: w.balance, valueUsdt, rate: valueUsdt / w.balance });
    }

    res.json({ ok: true, totalUsdt, breakdown });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
