import ccxt, { type Exchange } from "ccxt";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";

export interface ExchangeConfig {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  isTestnet?: boolean;
}

const EXCHANGE_MAP: Record<string, any> = {
  binance: ccxt.binance,
  coinbase: ccxt.coinbase,
  kraken: ccxt.kraken,
  kucoin: ccxt.kucoin,
  bybit: ccxt.bybit,
  okx: ccxt.okx,
  gate: ccxt.gate,
  mxc: ccxt.mexc,
};

export function getExchange(name: string, config: ExchangeConfig): Exchange {
  const ExchangeClass = EXCHANGE_MAP[name.toLowerCase()];
  if (!ExchangeClass) throw new Error(`Exchange ${name} not supported. Available: ${Object.keys(EXCHANGE_MAP).join(", ")}`);

  const opts: any = {
    enableRateLimit: true,
    timeout: 30000,
    apiKey: config.apiKey,
    secret: config.apiSecret,
    options: {
      defaultType: "spot",
      fetchMarkets: ["spot"],
    },
  };
  if (config.passphrase) opts.password = config.passphrase;

  const ex = new ExchangeClass(opts);

  // Binance testnet: use testnet.binance.vision
  if (config.isTestnet && name.toLowerCase() === "binance") {
    ex.urls.api = {
      public: "https://testnet.binance.vision/api/v3",
      private: "https://testnet.binance.vision/api/v3",
      v1Public: "https://testnet.binance.vision/api/v1",
      v1Private: "https://testnet.binance.vision/api/v1",
    };
    ex.urls.test = ex.urls.api;
  }

  // Bybit testnet
  if (config.isTestnet && name.toLowerCase() === "bybit") {
    ex.urls.api = {
      public: "https://api-testnet.bybit.com",
      private: "https://api-testnet.bybit.com",
    };
  }

  // OKX testnet
  if (config.isTestnet && name.toLowerCase() === "okx") {
    ex.setSandboxMode(true);
  }

  return ex;
}

export function getExchangeForUser(userId: string, exchangeName: string): Exchange {
  const db = getDb();
  const key = db.prepare("SELECT * FROM api_keys WHERE userId = ? AND exchange = ?").get(userId, exchangeName) as any;
  if (!key) throw new Error(`No API keys configured for ${exchangeName}`);
  return getExchange(exchangeName, {
    exchange: exchangeName,
    apiKey: key.apiKey,
    apiSecret: key.apiSecret,
    passphrase: key.passphrase,
    isTestnet: !!key.isTestnet,
  });
}

export async function getAllUserBalances(userId: string): Promise<Record<string, Record<string, number>>> {
  const db = getDb();
  const keys = db.prepare("SELECT DISTINCT exchange FROM api_keys WHERE userId = ?").all(userId) as any[];
  const balances: Record<string, Record<string, number>> = {};

  for (const row of keys) {
    try {
      const ex = getExchangeForUser(userId, row.exchange);
      const bal = await ex.fetchBalance();
      balances[row.exchange] = {};
      for (const [currency, info] of Object.entries(bal.total)) {
        if ((info as number) > 0) {
          balances[row.exchange][currency] = info as number;
        }
      }
    } catch (e: any) {
      balances[row.exchange] = { _error: e.message };
    }
  }
  return balances;
}

export async function placeOrder(userId: string, exchangeName: string, symbol: string, side: "buy" | "sell", amount: number, price?: number) {
  const ex = getExchangeForUser(userId, exchangeName);
  const order = price
    ? await ex.createLimitOrder(symbol, side, amount, price)
    : await ex.createMarketOrder(symbol, side, amount);

  const db = getDb();
  const id = uuid();
  db.prepare("INSERT INTO trades (id, userId, exchange, symbol, side, amount, price, cost, status, orderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)").run(
    id, userId, exchangeName, symbol, side, amount, order.price, order.cost, order.id
  );
  return { tradeId: id, order };
}

// Fetch live exchange rates (KES/USDT, etc.)
export async function fetchExchangeRate(from: string, to: string): Promise<number> {
  const RATES: Record<string, number> = {
    "KES/USDT": 0.0077,
    "USDT/KES": 130,
    "BTC/USDT": 77000,
    "ETH/USDT": 2500,
    "BNB/USDT": 720,
    "SOL/USDT": 100,
    "XRP/USDT": 1.4,
    "DOGE/USDT": 0.0002,
    "ADA/USDT": 0.0007,
    "AVAX/USDT": 35,
    "DOT/USDT": 1,
    "LINK/USDT": 15,
    "MATIC/USDT": 0.5,
    "UNI/USDT": 12,
    "LTC/USDT": 55,
    "ATOM/USDT": 1.6,
    "FIL/USDT": 0.9,
    "APT/USDT": 0.6,
    "ARB/USDT": 0.5,
    "OP/USDT": 0.5,
    "NEAR/USDT": 2.4,
    "INJ/USDT": 6,
    "SUI/USDT": 0.6,
    "SEI/USDT": 0.15,
    "TIA/USDT": 1.5,
    "RUNE/USDT": 0.5,
    "FTM/USDT": 0.3,
    "ALGO/USDT": 0.05,
    "SHIB/USDT": 0.00001,
    "BCH/USDT": 350,
    "USDT/BTC": 0.000013,
    "USDT/ETH": 0.0004,
    "USDT/BNB": 0.0014,
    "USDT/SOL": 0.01,
    "USDT/XRP": 0.71,
    "USDT/DOGE": 5000,
    "USDT/ADA": 1428,
    "KES/BTC": 130 / 77000,
    "BTC/KES": 77000 / 130,
  };

  const key = `${from.toUpperCase()}/${to.toUpperCase()}`;
  if (RATES[key]) return RATES[key];

  // Try Binance for unknown pairs (fast fail)
  try {
    const market = new (ccxt.binance)({
      enableRateLimit: true,
      timeout: 3000,
      options: { defaultType: "spot", fetchMarkets: ["spot"] },
    });
    const ticker = await market.fetchTicker(key);
    return ticker.last;
  } catch {}

  return 1;
}

export const SUPPORTED_EXCHANGES = Object.keys(EXCHANGE_MAP);
