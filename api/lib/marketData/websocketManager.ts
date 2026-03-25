import { EventEmitter } from "events";

/**
 * Event data for price updates
 */
export interface PriceUpdateEvent {
  exchange: string;
  exchangeId: string;
  symbol: string;
  price: number;
  volume: number;
  bidPrice: number;
  askPrice: number;
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
}

/**
 * Event data for order book updates
 */
export interface OrderBookUpdateEvent {
  exchange: string;
  exchangeId: string;
  symbol: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: number;
}

/**
 * Event data for trade updates
 */
export interface TradeUpdateEvent {
  exchange: string;
  exchangeId: string;
  symbol: string;
  price: number;
  volume: number;
  side: "buy" | "sell";
  tradeId: string;
  timestamp: number;
}

/**
 * Subscription information
 */
interface Subscription {
  exchange: string;
  symbol: string;
  channels: Set<string>;
}

/**
 * Connection information
 */
interface Connection {
  exchange: string;
  connected: boolean;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  heartbeatTimer?: NodeJS.Timeout;
  subscriptions: Map<string, Subscription>;
  simulationTimers: NodeJS.Timeout[];
}

/**
 * WebSocketManager - Manages WebSocket connections to multiple exchanges for real-time market data
 * 
 * This class provides a unified interface for connecting to and receiving real-time market data
 * from multiple cryptocurrency exchanges. It handles connection management, automatic reconnection,
 * and subscription management.
 * 
 * @example
 * ```typescript
 * const wsManager = new WebSocketManager();
 * 
 * wsManager.on('priceUpdate', (event: PriceUpdateEvent) => {
 *   console.log(`Price update for ${event.symbol}: ${event.price}`);
 * });
 * 
 * await wsManager.connect('binance');
 * await wsManager.subscribe('binance', 'BTC/USDT', ['ticker', 'trades']);
 * ```
 */
export class WebSocketManager extends EventEmitter {
  private connections: Map<string, Connection>;
  private readonly maxReconnectAttempts = 5;
  private readonly baseReconnectDelay = 1000; // 1 second
  private readonly heartbeatInterval = 30000; // 30 seconds

  constructor() {
    super();
    this.connections = new Map();
  }

  /**
   * Connect to an exchange's WebSocket API
   * 
   * @param exchange - The exchange code (e.g., 'binance', 'coinbase', 'kraken')
   * @returns Promise that resolves to true if connection successful
   * 
   * @example
   * ```typescript
   * const connected = await wsManager.connect('binance');
   * if (connected) {
   *   console.log('Connected to Binance');
   * }
   * ```
   */
  async connect(exchange: string): Promise<boolean> {
    try {
      // Check if already connected
      const existing = this.connections.get(exchange);
      if (existing?.connected) {
        return true;
      }

      // Create new connection
      const connection: Connection = {
        exchange,
        connected: false,
        reconnectAttempts: 0,
        subscriptions: new Map(),
        simulationTimers: [],
      };

      this.connections.set(exchange, connection);

      // Simulate connection establishment
      await this.establishConnection(connection);

      return connection.connected;
    } catch (error) {
      this.emit("error", {
        exchange,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Disconnect from an exchange's WebSocket API
   * 
   * @param exchange - The exchange code
   * 
   * @example
   * ```typescript
   * await wsManager.disconnect('binance');
   * ```
   */
  async disconnect(exchange: string): Promise<void> {
    const connection = this.connections.get(exchange);
    if (!connection) {
      return;
    }

    // Clear all timers
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }
    connection.simulationTimers.forEach((timer) => clearInterval(timer));
    connection.simulationTimers = [];

    // Mark as disconnected
    connection.connected = false;

    // Clear subscriptions
    connection.subscriptions.clear();

    // Remove connection
    this.connections.delete(exchange);

    this.emit("disconnect", {
      exchange,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to market data channels for a symbol
   * 
   * @param exchange - The exchange code
   * @param symbol - Trading pair symbol (e.g., 'BTC/USDT')
   * @param channels - Array of channels to subscribe to: ['ticker', 'depth', 'trades', 'kline']
   * 
   * @example
   * ```typescript
   * await wsManager.subscribe('binance', 'BTC/USDT', ['ticker', 'trades']);
   * ```
   */
  async subscribe(
    exchange: string,
    symbol: string,
    channels: string[]
  ): Promise<void> {
    const connection = this.connections.get(exchange);
    if (!connection || !connection.connected) {
      throw new Error(`Not connected to exchange: ${exchange}`);
    }

    // Get or create subscription
    let subscription = connection.subscriptions.get(symbol);
    if (!subscription) {
      subscription = {
        exchange,
        symbol,
        channels: new Set(),
      };
      connection.subscriptions.set(symbol, subscription);
    }

    // Add channels
    channels.forEach((channel) => {
      if (!subscription!.channels.has(channel)) {
        subscription!.channels.add(channel);
        this.startChannelSimulation(connection, symbol, channel);
      }
    });
  }

  /**
   * Unsubscribe from market data channels for a symbol
   * 
   * @param exchange - The exchange code
   * @param symbol - Trading pair symbol
   * @param channels - Array of channels to unsubscribe from
   * 
   * @example
   * ```typescript
   * await wsManager.unsubscribe('binance', 'BTC/USDT', ['trades']);
   * ```
   */
  async unsubscribe(
    exchange: string,
    symbol: string,
    channels: string[]
  ): Promise<void> {
    const connection = this.connections.get(exchange);
    if (!connection) {
      return;
    }

    const subscription = connection.subscriptions.get(symbol);
    if (!subscription) {
      return;
    }

    // Remove channels
    channels.forEach((channel) => {
      subscription.channels.delete(channel);
    });

    // Remove subscription if no channels left
    if (subscription.channels.size === 0) {
      connection.subscriptions.delete(symbol);
    }
  }

  /**
   * Establish connection to exchange (simulated)
   */
  private async establishConnection(connection: Connection): Promise<void> {
    return new Promise((resolve, reject) => {
      // Simulate connection delay
      setTimeout(() => {
        try {
          connection.connected = true;
          connection.reconnectAttempts = 0;

          // Start heartbeat
          this.startHeartbeat(connection);

          resolve();
        } catch (error) {
          reject(error);
        }
      }, 100);
    });
  }

  /**
   * Start heartbeat timer to keep connection alive
   */
  private startHeartbeat(connection: Connection): void {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }

    connection.heartbeatTimer = setInterval(() => {
      if (!connection.connected) {
        if (connection.heartbeatTimer) {
          clearInterval(connection.heartbeatTimer);
        }
        return;
      }

      // Simulate random disconnection (1% chance)
      if (Math.random() < 0.01) {
        this.handleDisconnection(connection);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Handle connection disconnection and attempt reconnection
   */
  private handleDisconnection(connection: Connection): void {
    connection.connected = false;

    this.emit("disconnect", {
      exchange: connection.exchange,
      timestamp: Date.now(),
    });

    // Clear heartbeat
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }

    // Clear simulation timers
    connection.simulationTimers.forEach((timer) => clearInterval(timer));
    connection.simulationTimers = [];

    // Attempt reconnection
    this.attemptReconnection(connection);
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnection(connection: Connection): void {
    if (connection.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("error", {
        exchange: connection.exchange,
        error: "Max reconnection attempts reached",
        timestamp: Date.now(),
      });
      return;
    }

    const delay =
      this.baseReconnectDelay * Math.pow(2, connection.reconnectAttempts);
    connection.reconnectAttempts++;

    connection.reconnectTimer = setTimeout(async () => {
      try {
        await this.establishConnection(connection);

        // Resubscribe to all channels
        for (const [symbol, subscription] of connection.subscriptions) {
          for (const channel of subscription.channels) {
            this.startChannelSimulation(connection, symbol, channel);
          }
        }
      } catch (error) {
        this.handleDisconnection(connection);
      }
    }, delay);
  }

  /**
   * Start simulating data for a channel
   */
  private startChannelSimulation(
    connection: Connection,
    symbol: string,
    channel: string
  ): void {
    const exchangeId = this.generateExchangeId(connection.exchange);

    switch (channel) {
      case "ticker":
        this.simulatePriceUpdates(connection, exchangeId, symbol);
        break;
      case "depth":
        this.simulateOrderBookUpdates(connection, exchangeId, symbol);
        break;
      case "trades":
        this.simulateTradeUpdates(connection, exchangeId, symbol);
        break;
      case "kline":
        this.simulateKlineUpdates(connection, exchangeId, symbol);
        break;
    }
  }

  /**
   * Simulate price updates (ticker channel)
   */
  private simulatePriceUpdates(
    connection: Connection,
    exchangeId: string,
    symbol: string
  ): void {
    let basePrice = this.getBasePrice(symbol);

    const timer = setInterval(() => {
      if (!connection.connected) {
        clearInterval(timer);
        return;
      }

      // Simulate price movement
      const change = (Math.random() - 0.5) * 0.02; // ±1% change
      basePrice = basePrice * (1 + change);

      const spread = basePrice * 0.001; // 0.1% spread
      const bidPrice = basePrice - spread / 2;
      const askPrice = basePrice + spread / 2;

      const event: PriceUpdateEvent = {
        exchange: connection.exchange,
        exchangeId,
        symbol,
        price: basePrice,
        volume: Math.random() * 1000,
        bidPrice,
        askPrice,
        timestamp: Date.now(),
        open: basePrice * (1 + (Math.random() - 0.5) * 0.05),
        high: basePrice * (1 + Math.random() * 0.02),
        low: basePrice * (1 - Math.random() * 0.02),
      };

      this.emit("priceUpdate", event);
    }, 1000); // Update every second

    connection.simulationTimers.push(timer);
  }

  /**
   * Simulate order book updates (depth channel)
   */
  private simulateOrderBookUpdates(
    connection: Connection,
    exchangeId: string,
    symbol: string
  ): void {
    const basePrice = this.getBasePrice(symbol);

    const timer = setInterval(() => {
      if (!connection.connected) {
        clearInterval(timer);
        return;
      }

      const bids: Array<{ price: number; quantity: number }> = [];
      const asks: Array<{ price: number; quantity: number }> = [];

      // Generate 10 levels for each side
      for (let i = 0; i < 10; i++) {
        bids.push({
          price: basePrice - (i + 1) * basePrice * 0.0001,
          quantity: Math.random() * 10,
        });
        asks.push({
          price: basePrice + (i + 1) * basePrice * 0.0001,
          quantity: Math.random() * 10,
        });
      }

      const event: OrderBookUpdateEvent = {
        exchange: connection.exchange,
        exchangeId,
        symbol,
        bids,
        asks,
        timestamp: Date.now(),
      };

      this.emit("orderBookUpdate", event);
    }, 500); // Update every 500ms

    connection.simulationTimers.push(timer);
  }

  /**
   * Simulate trade updates (trades channel)
   */
  private simulateTradeUpdates(
    connection: Connection,
    exchangeId: string,
    symbol: string
  ): void {
    const basePrice = this.getBasePrice(symbol);

    const timer = setInterval(() => {
      if (!connection.connected) {
        clearInterval(timer);
        return;
      }

      const price = basePrice * (1 + (Math.random() - 0.5) * 0.001);
      const volume = Math.random() * 5;
      const side = Math.random() > 0.5 ? "buy" : "sell";

      const event: TradeUpdateEvent = {
        exchange: connection.exchange,
        exchangeId,
        symbol,
        price,
        volume,
        side,
        tradeId: this.generateTradeId(),
        timestamp: Date.now(),
      };

      this.emit("tradeUpdate", event);
    }, 2000 + Math.random() * 3000); // Random interval 2-5 seconds

    connection.simulationTimers.push(timer);
  }

  /**
   * Simulate kline updates (candlestick data)
   */
  private simulateKlineUpdates(
    connection: Connection,
    exchangeId: string,
    symbol: string
  ): void {
    const basePrice = this.getBasePrice(symbol);

    const timer = setInterval(() => {
      if (!connection.connected) {
        clearInterval(timer);
        return;
      }

      const open = basePrice * (1 + (Math.random() - 0.5) * 0.02);
      const close = open * (1 + (Math.random() - 0.5) * 0.02);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);

      const event: PriceUpdateEvent = {
        exchange: connection.exchange,
        exchangeId,
        symbol,
        price: close,
        volume: Math.random() * 1000,
        bidPrice: close * 0.999,
        askPrice: close * 1.001,
        timestamp: Date.now(),
        open,
        high,
        low,
      };

      this.emit("priceUpdate", event);
    }, 60000); // Update every minute

    connection.simulationTimers.push(timer);
  }

  /**
   * Get base price for a symbol
   */
  private getBasePrice(symbol: string): number {
    const prices: Record<string, number> = {
      "BTC/USDT": 45000,
      "ETH/USDT": 2500,
      "BNB/USDT": 300,
      "SOL/USDT": 100,
      "ADA/USDT": 0.5,
      "XRP/USDT": 0.6,
      "DOT/USDT": 7,
      "DOGE/USDT": 0.08,
      "AVAX/USDT": 35,
      "MATIC/USDT": 0.8,
    };

    return prices[symbol] || 100;
  }

  /**
   * Generate exchange-specific ID
   */
  private generateExchangeId(exchange: string): string {
    return `${exchange}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique trade ID
   */
  private generateTradeId(): string {
    return `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}