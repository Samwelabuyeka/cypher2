import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { authMiddleware } from "./auth";

const router = Router();
router.use(authMiddleware);

const DARAJA_BASE = process.env.MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const SHORTCODE = process.env.MPESA_SHORTCODE || "";
const PASSKEY = process.env.MPESA_PASSKEY || "";
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "";

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json() as any;
  return data.access_token;
}

function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

// Initiate STK Push (deposit via M-Pesa)
router.post("/deposit", async (req: any, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount || amount < 1) return res.status(400).json({ error: "Phone and amount required" });
    
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = generatePassword(SHORTCODE, PASSKEY, timestamp);
    
    const formattedPhone = phone.startsWith("254") ? phone : `254${phone.replace(/^0/, "")}`;
    
    const payload = {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: CALLBACK_URL,
      AccountReference: "CypherTrading",
      TransactionDesc: "Deposit to Cypher Wallet",
    };

    const response = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as any;
    
    // Record pending transaction
    const db = getDb();
    const txId = uuid();
    db.prepare("INSERT INTO transactions (id, userId, type, currency, amount, status, reference, metadata) VALUES (?, ?, 'mpesa_deposit', 'KES', ?, 'pending', ?, ?)").run(
      txId, req.userId, amount, result.CheckoutRequestID || "", JSON.stringify(result)
    );

    res.json({ ok: true, checkoutRequestId: result.CheckoutRequestID, message: result.ResponseDescription });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// M-Pesa callback (called by Safaricom)
router.post("/callback", (req, res) => {
  try {
    const { Body } = req.body;
    const db = getDb();
    if (Body?.stkCallback?.ResultCode === 0) {
      const meta = Body.stkCallback.CallbackMetadata?.Item || [];
      const amount = meta.find((i: any) => i.Name === "Amount")?.Value;
      const receipt = meta.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value;
      const phone = meta.find((i: any) => i.Name === "PhoneNumber")?.Value;
      
      // Update transaction and credit wallet
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

// Check transaction status
router.get("/status/:checkoutRequestId", async (req: any, res) => {
  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = generatePassword(SHORTCODE, PASSKEY, timestamp);
    
    const response = await fetch(`${DARAJA_BASE}/mpesa/transactionstatus/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Initiator: "cypher",
        SecurityCredential: password,
        CommandID: "TransactionStatusQuery",
        TransactionID: req.params.checkoutRequestId,
        OriginatorConversationID: uuid(),
        ResultURL: `${CALLBACK_URL}/result`,
        QueueTimeOutURL: `${CALLBACK_URL}/timeout`,
      }),
    });
    const result = await response.json();
    res.json({ ok: true, data: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
