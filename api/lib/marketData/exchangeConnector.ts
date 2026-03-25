import crypto from "crypto";

/**
 * OHLCV candlestick data
 */
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Ticker data
 */
export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
}

/**
 * Order book data
 */
export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
}

/**
 * Balance data
 */
export interface Balance {
  currency: string;
  free: number;
  used: number;
  total: number;
}

/**
 * Order data
 */
export interface Order {
  id: string;
  symbol: string;
  type: string;
  side: string;
  price?: number;
  amount: number;
  filled: number;
  remaining: number;
  status: string;
  timestamp: number;
}

/**
 * Base class for exchange connectors
 * Provides a unified interface for interacting with crypto exchanges
 */
export abstract class ExchangeConnector {
  protected apiKey?: string;
  protected apiSecret?: string;
  protected baseUrl: string = "";
  protected rateLimit: number = 1000;
  private lastRequestTime: number = 0;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Get OHLCV candlestick data
   */
  abstract getOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number
  ): Promise<OHLCV[]>;

  /**
   * Get current ticker data
   */
  abstract getTicker(symbol: string): Promise<Ticker>;

  /**
   * Get order book data
   */
  abstract getOrderBook(symbol: string, limit?: number): Promise<OrderBook>;

  /**
   * Get account balance
   */
  abstract getBalance(): Promise<Balance[]>;

  /**
   * Create a new order
   */
  abstract createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<Order>;

  /**
   * Cancel an existing order
   */
  abstract cancelOrder(orderId: string, symbol: string): Promise<void>;

  /**
   * Get open orders
   */
  abstract getOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Get order status
   */
  abstract getOrderStatus(orderId: string, symbol: string): Promise<Order>;

  /**
   * Make HTTP request with retry logic and rate limiting
   */
  protected async request(
    endpoint: string,
    method: string = "GET",
    params?: Record<string, any>,
    headers?: Record<string, string>
  ): Promise<any> {
    await this.rateLimitCheck();

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const url = new URL(endpoint, this.baseUrl);
        
        if (method === "GET" && params) {
          Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, String(value));
          });
        }

        const options: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        };

        if (method !== "GET" && params) {
          options.body = JSON.stringify(params);
        }

        const response = await fetch(url.toString(), options);
        
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries - 1) {
          const backoffTime = Math.pow(2, attempt) * 1000;
          await this.sleep(backoffTime);
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Check and enforce rate limiting
   */
  private async rateLimitCheck(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimit) {
      await this.sleep(this.rateLimit - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Binance REST API connector
 * Rate limit: 1200 requests/minute
 */
export class BinanceConnector extends ExchangeConnector {
  constructor(apiKey?: string, apiSecret?: string) {
    super(apiKey, apiSecret);
    this.baseUrl = "https://api.binance.com";
    this.rateLimit = 50; // 1200/min = 50ms between requests
  }

  async getOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit: number = 500
  ): Promise<OHLCV[]> {
    const params: Record<string, any> = {
      symbol: symbol.replace("/", ""),
      interval: this.convertTimeframe(timeframe),
      limit,
    };

    if (since) {
      params.startTime = since;
    }

    const data = await this.request("/api/v3/klines", "GET", params);
    
    return data.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const params = { symbol: symbol.replace("/", "") };
    const data = await this.request("/api/v3/ticker/24hr", "GET", params);
    
    return {
      symbol,
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      last: parseFloat(data.lastPrice),
      volume: parseFloat(data.volume),
      timestamp: data.closeTime,
    };
  }

  async getOrderBook(symbol: string, limit: number = 100): Promise<OrderBook> {
    const params = {
      symbol: symbol.replace("/", ""),
      limit,
    };
    
    const data = await this.request("/api/v3/depth", "GET", params);
    
    return {
      bids: data.bids.map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])]),
      asks: data.asks.map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      timestamp: Date.now(),
    };
  }

  async getBalance(): Promise<Balance[]> {
    const timestamp = Date.now();
    const params = { timestamp };
    const signature = this.signRequest(params);
    
    const data = await this.request(
      "/api/v3/account",
      "GET",
      { ...params, signature },
      { "X-MBX-APIKEY": this.apiKey! }
    );
    
    return data.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((balance: any) => ({
        currency: balance.asset,
        free: parseFloat(balance.free),
        used: parseFloat(balance.locked),
        total: parseFloat(balance.free) + parseFloat(balance.locked),
      }));
  }

  async createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<Order> {
    const timestamp = Date.now();
    const params: Record<string, any> = {
      symbol: symbol.replace("/", ""),
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      quantity: amount,
      timestamp,
    };

    if (price) {
      params.price = price;
      params.timeInForce = "GTC";
    }

    const signature = this.signRequest(params);
    
    const data = await this.request(
      "/api/v3/order",
      "POST",
      { ...params, signature },
      { "X-MBX-APIKEY": this.apiKey! }
    );
    
    return this.parseOrder(data, symbol);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    const timestamp = Date.now();
    const params = {
      symbol: symbol.replace("/", ""),
      orderId,
      timestamp,
    };
    
    const signature = this.signRequest(params);
    
    await this.request(
      "/api/v3/order",
      "DELETE",
      { ...params, signature },
      { "X-MBX-APIKEY": this.apiKey! }
    );
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const timestamp = Date.now();
    const params: Record<string, any> = { timestamp };
    
    if (symbol) {
      params.symbol = symbol.replace("/", "");
    }
    
    const signature = this.signRequest(params);
    
    const data = await this.request(
      "/api/v3/openOrders",
      "GET",
      { ...params, signature },
      { "X-MBX-APIKEY": this.apiKey! }
    );
    
    return data.map((order: any) => this.parseOrder(order, symbol || order.symbol));
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<Order> {
    const timestamp = Date.now();
    const params = {
      symbol: symbol.replace("/", ""),
      orderId,
      timestamp,
    };
    
    const signature = this.signRequest(params);
    
    const data = await this.request(
      "/api/v3/order",
      "GET",
      { ...params, signature },
      { "X-MBX-APIKEY": this.apiKey! }
    );
    
    return this.parseOrder(data, symbol);
  }

  private signRequest(params: Record<string, any>): string {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    
    return crypto
      .createHmac("sha256", this.apiSecret!)
      .update(queryString)
      .digest("hex");
  }

  private parseOrder(data: any, symbol: string): Order {
    return {
      id: data.orderId.toString(),
      symbol,
      type: data.type.toLowerCase(),
      side: data.side.toLowerCase(),
      price: data.price ? parseFloat(data.price) : undefined,
      amount: parseFloat(data.origQty),
      filled: parseFloat(data.executedQty),
      remaining: parseFloat(data.origQty) - parseFloat(data.executedQty),
      status: data.status.toLowerCase(),
      timestamp: data.time || data.transactTime,
    };
  }

  private convertTimeframe(timeframe: string): string {
    const map: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
    };
    
    return map[timeframe] || "1h";
  }
}

/**
 * Coinbase Pro REST API connector
 * Rate limit: 10 requests/second
 */
export class CoinbaseConnector extends ExchangeConnector {
  private apiPassphrase?: string;

  constructor(apiKey?: string, apiSecret?: string, apiPassphrase?: string) {
    super(apiKey, apiSecret);
    this.baseUrl = "https://api.exchange.coinbase.com";
    this.rateLimit = 100; // 10/sec = 100ms between requests
    this.apiPassphrase = apiPassphrase;
  }

  async getOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number
  ): Promise<OHLCV[]> {
    const params: Record<string, any> = {
      granularity: this.convertTimeframe(timeframe),
    };

    if (since) {
      params.start = new Date(since).toISOString();
    }

    const productId = symbol.replace("/", "-");
    const data = await this.request(`/products/${productId}/candles`, "GET", params);
    
    return data.map((candle: number[]) => ({
      timestamp: candle[0] * 1000,
      low: candle[1],
      high: candle[2],
      open: candle[3],
      close: candle[4],
      volume: candle[5],
    }));
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const productId = symbol.replace("/", "-");
    const data = await this.request(`/products/${productId}/ticker`, "GET");
    
    return {
      symbol,
      bid: parseFloat(data.bid),
      ask: parseFloat(data.ask),
      last: parseFloat(data.price),
      volume: parseFloat(data.volume),
      timestamp: new Date(data.time).getTime(),
    };
  }

  async getOrderBook(symbol: string, limit: number = 50): Promise<OrderBook> {
    const productId = symbol.replace("/", "-");
    const level = limit > 50 ? 2 : 1;
    const data = await this.request(`/products/${productId}/book?level=${level}`, "GET");
    
    return {
      bids: data.bids.slice(0, limit).map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])]),
      asks: data.asks.slice(0, limit).map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      timestamp: Date.now(),
    };
  }

  async getBalance(): Promise<Balance[]> {
    const data = await this.signedRequest("/accounts", "GET");
    
    return data.map((account: any) => ({
      currency: account.currency,
      free: parseFloat(account.available),
      used: parseFloat(account.hold),
      total: parseFloat(account.balance),
    }));
  }

  async createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<Order> {
    const productId = symbol.replace("/", "-");
    const params: Record<string, any> = {
      product_id: productId,
      side: side.toLowerCase(),
      type: type.toLowerCase(),
      size: amount.toString(),
    };

    if (price) {
      params.price = price.toString();
    }

    const data = await this.signedRequest("/orders", "POST", params);
    
    return this.parseOrder(data, symbol);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.signedRequest(`/orders/${orderId}`, "DELETE");
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params: Record<string, any> = {};
    
    if (symbol) {
      params.product_id = symbol.replace("/", "-");
    }
    
    const data = await this.signedRequest("/orders", "GET", params);
    
    return data.map((order: any) => this.parseOrder(order, order.product_id));
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<Order> {
    const data = await this.signedRequest(`/orders/${orderId}`, "GET");
    
    return this.parseOrder(data, symbol);
  }

  private async signedRequest(
    endpoint: string,
    method: string,
    params?: Record<string, any>
  ): Promise<any> {
    const timestamp = Date.now() / 1000;
    const body = params ? JSON.stringify(params) : "";
    const message = timestamp + method + endpoint + body;
    
    const signature = crypto
      .createHmac("sha256", Buffer.from(this.apiSecret!, "base64"))
      .update(message)
      .digest("base64");
    
    const headers = {
      "CB-ACCESS-KEY": this.apiKey!,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": timestamp.toString(),
      "CB-ACCESS-PASSPHRASE": this.apiPassphrase!,
    };
    
    return this.request(endpoint, method, params, headers);
  }

  private parseOrder(data: any, symbol: string): Order {
    return {
      id: data.id,
      symbol,
      type: data.type,
      side: data.side,
      price: data.price ? parseFloat(data.price) : undefined,
      amount: parseFloat(data.size),
      filled: parseFloat(data.filled_size || 0),
      remaining: parseFloat(data.size) - parseFloat(data.filled_size || 0),
      status: data.status,
      timestamp: new Date(data.created_at).getTime(),
    };
  }

  private convertTimeframe(timeframe: string): number {
    const map: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    };
    
    return map[timeframe] || 3600;
  }
}

/**
 * Kraken REST API connector
 * Rate limit: tiered based on verification level
 */
export class KrakenConnector extends ExchangeConnector {
  constructor(apiKey?: string, apiSecret?: string) {
    super(apiKey, apiSecret);
    this.baseUrl = "https://api.kraken.com";
    this.rateLimit = 334; // Conservative estimate (3 requests/sec)
  }

  async getOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number
  ): Promise<OHLCV[]> {
    const params: Record<string, any> = {
      pair: this.convertSymbol(symbol),
      interval: this.convertTimeframe(timeframe),
    };

    if (since) {
      params.since = Math.floor(since / 1000);
    }

    const data = await this.request("/0/public/OHLC", "GET", params);
    const pairKey = Object.keys(data.result).find((key) => key !== "last");
    
    if (!pairKey) {
      throw new Error("Invalid response from Kraken");
    }
    
    return data.result[pairKey].map((candle: any[]) => ({
      timestamp: candle[0] * 1000,
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[6]),
    }));
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const params = { pair: this.convertSymbol(symbol) };
    const data = await this.request("/0/public/Ticker", "GET", params);
    const pairKey = Object.keys(data.result)[0];
    const ticker = data.result[pairKey];
    
    return {
      symbol,
      bid: parseFloat(ticker.b[0]),
      ask: parseFloat(ticker.a[0]),
      last: parseFloat(ticker.c[0]),
      volume: parseFloat(ticker.v[1]),
      timestamp: Date.now(),
    };
  }

  async getOrderBook(symbol: string, limit: number = 100): Promise<OrderBook> {
    const params = {
      pair: this.convertSymbol(symbol),
      count: limit,
    };
    
    const data = await this.request("/0/public/Depth", "GET", params);
    const pairKey = Object.keys(data.result)[0];
    const book = data.result[pairKey];
    
    return {
      bids: book.bids.map((bid: any[]) => [parseFloat(bid[0]), parseFloat(bid[1])]),
      asks: book.asks.map((ask: any[]) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      timestamp: Date.now(),
    };
  }

  async getBalance(): Promise<Balance[]> {
    const data = await this.signedRequest("/0/private/Balance", {});
    
    return Object.entries(data.result).map(([currency, balance]) => ({
      currency,
      free: parseFloat(balance as string),
      used: 0,
      total: parseFloat(balance as string),
    }));
  }

  async createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<Order> {
    const params: Record<string, any> = {
      pair: this.convertSymbol(symbol),
      type: side.toLowerCase(),
      ordertype: type.toLowerCase(),
      volume: amount.toString(),
    };

    if (price) {
      params.price = price.toString();
    }

    const data = await this.signedRequest("/0/private/AddOrder", params);
    
    return {
      id: data.result.txid[0],
      symbol,
      type,
      side,
      price,
      amount,
      filled: 0,
      remaining: amount,
      status: "open",
      timestamp: Date.now(),
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.signedRequest("/0/private/CancelOrder", { txid: orderId });
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const data = await this.signedRequest("/0/private/OpenOrders", {});
    
    return Object.entries(data.result.open).map(([id, order]: [string, any]) => ({
      id,
      symbol: this.unconvertSymbol(order.descr.pair),
      type: order.descr.ordertype,
      side: order.descr.type,
      price: parseFloat(order.descr.price),
      amount: parseFloat(order.vol),
      filled: parseFloat(order.vol_exec),
      remaining: parseFloat(order.vol) - parseFloat(order.vol_exec),
      status: order.status,
      timestamp: order.opentm * 1000,
    }));
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<Order> {
    const data = await this.signedRequest("/0/private/QueryOrders", {
      txid: orderId,
    });
    
    const order = data.result[orderId];
    
    return {
      id: orderId,
      symbol,
      type: order.descr.ordertype,
      side: order.descr.type,
      price: parseFloat(order.descr.price),
      amount: parseFloat(order.vol),
      filled: parseFloat(order.vol_exec),
      remaining: parseFloat(order.vol) - parseFloat(order.vol_exec),
      status: order.status,
      timestamp: order.opentm * 1000,
    };
  }

  private async signedRequest(
    endpoint: string,
    params: Record<string, any>
  ): Promise<any> {
    const nonce = Date.now() * 1000;
    const postData = new URLSearchParams({
      nonce: nonce.toString(),
      ...params,
    }).toString();
    
    const message = endpoint + crypto
      .createHash("sha256")
      .update(nonce + postData)
      .digest();
    
    const signature = crypto
      .createHmac("sha512", Buffer.from(this.apiSecret!, "base64"))
      .update(message)
      .digest("base64");
    
    const headers = {
      "API-Key": this.apiKey!,
      "API-Sign": signature,
    };
    
    return this.request(endpoint, "POST", params, headers);
  }

  private convertSymbol(symbol: string): string {
    return symbol.replace("/", "");
  }

  private unconvertSymbol(symbol: string): string {
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }
    return symbol;
  }

  private convertTimeframe(timeframe: string): number {
    const map: Record<string, number> = {
      "1m": 1,
      "5m": 5,
      "15m": 15,
      "1h": 60,
      "4h": 240,
      "1d": 1440,
      "1w": 10080,
    };
    
    return map[timeframe] || 60;
  }
}

/**
 * Connector cache
 */
const connectorCache = new Map<string, ExchangeConnector>();

/**
 * Factory function to get exchange connector
 * Caches connectors to reuse instances
 * 
 * @param exchange - Exchange name (binance, coinbase, kraken)
 * @param apiKey - API key (optional)
 * @param apiSecret - API secret (optional)
 * @param apiPassphrase - API passphrase (Coinbase only, optional)
 * @returns Exchange connector instance
 */
export function getExchangeConnector(
  exchange: string,
  apiKey?: string,
  apiSecret?: string,
  apiPassphrase?: string
): ExchangeConnector {
  const cacheKey = `${exchange}:${apiKey}`;
  
  if (connectorCache.has(cacheKey)) {
    return connectorCache.get(cacheKey)!;
  }
  
  let connector: ExchangeConnector;
  
  switch (exchange.toLowerCase()) {
    case "binance":
      connector = new BinanceConnector(apiKey, apiSecret);
      break;
    case "coinbase":
      connector = new CoinbaseConnector(apiKey, apiSecret, apiPassphrase);
      break;
    case "kraken":
      connector = new KrakenConnector(apiKey, apiSecret);
      break;
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
  
  connectorCache.set(cacheKey, connector);
  
  return connector;
}