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
  };
  if (config.passphrase) opts.password = config.passphrase;
  if (config.isTestnet) {
    if (name === "binance") opts.options = { defaultType: "spot", sandboxMode: true };
    else if (name === "bybit") opts.options = { defaultType: "spot" };
  }

  const ex = new ExchangeClass(opts);
  if (config.isTestnet && ex.urls?.test) {
    ex.urls.api = ex.urls.test;
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

export const SUPPORTED_EXCHANGES = Object.keys(EXCHANGE_MAP);
