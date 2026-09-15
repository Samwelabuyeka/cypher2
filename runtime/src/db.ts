import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "cypher.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      fullName TEXT,
      phone TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      exchange TEXT NOT NULL,
      apiKey TEXT NOT NULL,
      apiSecret TEXT NOT NULL,
      passphrase TEXT,
      isTestnet INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL DEFAULT 0,
      locked REAL DEFAULT 0,
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id),
      UNIQUE(userId, currency)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      reference TEXT,
      metadata TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      amount REAL NOT NULL,
      price REAL,
      cost REAL,
      fee REAL,
      status TEXT DEFAULT 'pending',
      orderId TEXT,
      pnl REAL,
      metadata TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS trading_config (
      userId TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      maxDailySpend REAL DEFAULT 1000,
      riskLevel TEXT DEFAULT 'medium',
      preferredPairs TEXT DEFAULT '[]',
      autoTrade INTEGER DEFAULT 1,
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS mpesa_config (
      userId TEXT PRIMARY KEY,
      consumerKey TEXT DEFAULT '',
      consumerSecret TEXT DEFAULT '',
      shortcode TEXT DEFAULT '',
      passkey TEXT DEFAULT '',
      callbackUrl TEXT DEFAULT '',
      env TEXT DEFAULT 'sandbox',
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);
}

export default getDb;
