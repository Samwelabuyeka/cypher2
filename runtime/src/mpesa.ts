import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { authMiddleware } from "./auth";

const router = Router();
router.use(authMiddleware);

// ── M-Pesa Config (credentials) ──────────────────────────────────────────
router.get("/config", (req: any, res) => {
  const db = getDb();
  let config = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId) as any;
  if (!config) {
    db.prepare("INSERT INTO mpesa_config (userId) VALUES (?)").run(req.userId);
    config = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId);
  }
  // Mask secrets
  const masked = {
    ...config,
    consumerKey: config.consumerKey ? config.consumerKey.slice(0, 8) + "..." : "",
    consumerSecret: config.consumerSecret ? "••••••••" : "",
    passkey: config.passkey ? "••••••••" : "",
  };
  res.json({ ok: true, config: masked, hasCredentials: !!(config.consumerKey && config.consumerSecret && config.shortcode && config.passkey) });
});

router.put("/config", (req: any, res) => {
  const { consumerKey, consumerSecret, shortcode, passkey, callbackUrl, env } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId) as any;
  if (!existing) {
    db.prepare("INSERT INTO mpesa_config (userId) VALUES (?)").run(req.userId);
  }
  if (consumerKey !== undefined) db.prepare("UPDATE mpesa_config SET consumerKey = ? WHERE userId = ?").run(consumerKey, req.userId);
  if (consumerSecret !== undefined) db.prepare("UPDATE mpesa_config SET consumerSecret = ? WHERE userId = ?").run(consumerSecret, req.userId);
  if (shortcode !== undefined) db.prepare("UPDATE mpesa_config SET shortcode = ? WHERE userId = ?").run(shortcode, req.userId);
  if (passkey !== undefined) db.prepare("UPDATE mpesa_config SET passkey = ? WHERE userId = ?").run(passkey, req.userId);
  if (callbackUrl !== undefined) db.prepare("UPDATE mpesa_config SET callbackUrl = ? WHERE userId = ?").run(callbackUrl, req.userId);
  if (env !== undefined) db.prepare("UPDATE mpesa_config SET env = ? WHERE userId = ?").run(env, req.userId);
  db.prepare("UPDATE mpesa_config SET updatedAt = datetime('now') WHERE userId = ?").run(req.userId);
  res.json({ ok: true });
});

router.post("/test", async (req: any, res) => {
  try {
    const db = getDb();
    const config = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId) as any;
    if (!config || !config.consumerKey || !config.consumerSecret) {
      return res.status(400).json({ error: "M-Pesa credentials not configured" });
    }
    const base = config.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await response.json() as any;
    if (data.access_token) {
      res.json({ ok: true, message: "M-Pesa connection successful", env: config.env });
    } else {
      res.status(400).json({ error: data.errorMessage || "Authentication failed", details: data });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── M-Pesa STK Push (deposit) ────────────────────────────────────────────
router.post("/deposit", async (req: any, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount || amount < 1) return res.status(400).json({ error: "Phone and amount required" });

    const db = getDb();
    const config = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId) as any;
    if (!config || !config.consumerKey || !config.consumerSecret || !config.shortcode || !config.passkey) {
      return res.status(400).json({ error: "M-Pesa credentials not configured. Go to Settings → M-Pesa to add them." });
    }

    const base = config.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const tokenData = await tokenRes.json() as any;
    const token = tokenData.access_token;
    if (!token) return res.status(500).json({ error: "Failed to get M-Pesa access token" });

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");
    const formattedPhone = phone.startsWith("254") ? phone : `254${phone.replace(/^0/, "")}`;

    const payload = {
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: config.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: config.callbackUrl || `${req.protocol}://${req.get("host")}/api/mpesa/callback`,
      AccountReference: "CypherTrading",
      TransactionDesc: "Deposit to Cypher Wallet",
    };

    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as any;

    const txId = uuid();
    db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status, reference, metadata) VALUES (?, ?, 'mpesa_deposit', 'KES', ?, 'pending', ?, ?)").run(
      txId, req.userId, amount, result.CheckoutRequestID || "", JSON.stringify(result)
    );

    res.json({ ok: true, checkoutRequestId: result.CheckoutRequestID, message: result.ResponseDescription || "STK push sent" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── M-Pesa callback (Safaricom calls this) ───────────────────────────────
router.post("/callback", (req, res) => {
  try {
    const { Body } = req.body;
    const db = getDb();
    if (Body?.stkCallback?.ResultCode === 0) {
      const meta = Body.stkCallback.CallbackMetadata?.Item || [];
      const receipt = meta.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value;

      if (receipt) {
        const tx = db.prepare("SELECT * FROM transactions WHERE reference = ?").get(receipt) as any;
        if (tx) {
          db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(tx.id);
          db.prepare("UPDATE wallets SET balance = balance + ?, updatedAt = datetime('now') WHERE userId = ? AND currency = 'KES'").run(tx.amount, tx.userId);
        }
      }
    }
    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch {
    res.json({ ResultCode: 0, ResultDesc: "Success" });
  }
});

// ── Check STK push status ────────────────────────────────────────────────
router.get("/status/:checkoutRequestId", async (req: any, res) => {
  try {
    const db = getDb();
    const config = db.prepare("SELECT * FROM mpesa_config WHERE userId = ?").get(req.userId) as any;
    if (!config || !config.consumerKey) return res.status(400).json({ error: "M-Pesa not configured" });

    const base = config.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const tokenData = await tokenRes.json() as any;
    const token = tokenData.access_token;

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");

    const response = await fetch(`${base}/mpesa/transactionstatus/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        Initiator: "cypher",
        SecurityCredential: password,
        CommandID: "TransactionStatusQuery",
        TransactionID: req.params.checkoutRequestId,
        OriginatorConversationID: uuid(),
        ResultURL: `${config.callbackUrl || ""}/result`,
        QueueTimeOutURL: `${config.callbackUrl || ""}/timeout`,
      }),
    });
    const result = await response.json();
    res.json({ ok: true, data: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
