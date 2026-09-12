import ccxt, { type Exchange } from "ccxt";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  baseVolume: number;
  quoteVolume: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
}

/**
 * Real market data service backed by the live Binance public API via ccxt.
 * Public market data (OHLCV, tickers, order books) requires no API keys.
 *
 * Private endpoints (balances, orders) only activate if BINANCE_API_KEY /
 * BINANCE_API_SECRET are present in the environment.
 */
export class MarketDataService {
  private exchange: Exchange;

  constructor(enableRateLimit = true, apiKey?: string, apiSecret?: string) {
    this.exchange = new ccxt.binance({
      enableRateLimit,
      options: { defaultType: "spot" },
      ...(apiKey && apiSecret ? { apiKey, secret: apiSecret } : {}),
    } as any);
  }

  hasCredentials(): boolean {
    return Boolean(
      process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET
    );
  }

  private toCcxtSymbol(symbol: string): string {
    return symbol.toUpperCase().includes("/") ? symbol.toUpperCase() : `${symbol.toUpperCase()}/USDT`;
  }

  async fetchOHLCV(symbol: string, timeframe = "1h", limit = 200): Promise<Candle[]> {
    const tf = this.mapTimeframe(timeframe);
    const raw = await this.exchange.fetchOHLCV(
      this.toCcxtSymbol(symbol),
      tf,
      undefined,
      Math.min(limit, 1000)
    );
    return raw.map(([ts, open, high, low, close, volume]) => ({
      timestamp: ts as number,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: volume as number,
    }));
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const t = await this.exchange.fetchTicker(this.toCcxtSymbol(symbol));
    return {
      symbol: t.symbol,
      bid: t.bid ?? 0,
      ask: t.ask ?? 0,
      last: t.last ?? 0,
      baseVolume: t.baseVolume ?? 0,
      quoteVolume: t.quoteVolume ?? 0,
      timestamp: t.timestamp ?? Date.now(),
    };
  }

  async fetchOrderBook(symbol: string, limit = 20): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
    const book = await this.exchange.fetchOrderBook(this.toCcxtSymbol(symbol), limit);
    return {
      bids: book.bids.map(([price, amount]) => ({ price, amount })),
      asks: book.asks.map(([price, amount]) => ({ price, amount })),
    };
  }

  async fetchBalance(): Promise<Array<{ currency: string; free: number; used: number; total: number }>> {
    if (!this.hasCredentials()) {
      throw new Error(
        "BINANCE_API_KEY and BINANCE_API_SECRET are required to fetch account balances"
      );
    }
    const bal = await this.exchange.fetchBalance();
    return Object.entries(bal.total ?? {})
      .filter(([, total]) => (total as number) > 0)
      .map(([currency, total]) => ({
        currency,
        free: (bal.free as any)?.[currency] ?? 0,
        used: (bal.used as any)?.[currency] ?? 0,
        total: total as number,
      }));
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
    };
    const lowered = tf.toLowerCase();
    return map[lowered] ?? "1h";
  }
}
