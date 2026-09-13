import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "cypher-secret-" + uuid();
const router = Router();

export function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return res.status(409).json({ error: "Email already registered" });
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, email, passwordHash, fullName, phone) VALUES (?, ?, ?, ?, ?)").run(id, email, passwordHash, fullName || null, phone || null);
    // Create default wallets for major currencies
    const currencies = ["USDT", "BTC", "ETH", "BNB", "KES"];
    const insertWallet = db.prepare("INSERT INTO wallets (id, userId, currency, balance) VALUES (?, ?, ?, 0)");
    for (const c of currencies) insertWallet.run(uuid(), id, c);
    // Create default trading config
    db.prepare("INSERT INTO trading_config (userId) VALUES (?)").run(id);
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, token, user: { id, email, fullName } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, token, user: { id: user.id, email: user.email, fullName: user.fullName } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/me", authMiddleware, (req: any, res) => {
  const db = getDb();
  const user = db.prepare("SELECT id, email, fullName, phone, createdAt FROM users WHERE id = ?").get(req.userId);
  res.json({ ok: true, user });
});

export default router;
