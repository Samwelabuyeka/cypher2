import { EventEmitter } from "events";
import WebSocket from "ws";
// @ts-ignore - ws package type declarations are loaded via @types/ws

// ==================== Interfaces ====================

export interface WebSocketConfig {
  url: string;
  reconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  heartbeatInterval: number;
  messageQueueSize: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  symbol: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  type: "limit" | "market" | "stop-loss" | "stop-limit";
  timestamp: number;
  filled: number;
  status: "pending" | "open" | "filled" | "cancelled" | "partial";
}

export interface Trade {
  price: number;
  size: number;
  side: "buy" | "sell";
  timestamp: number;
  tradeId: string;
  symbol: string;
}

export interface LatencyMetrics {
  sendTime: number;
  receiveTime: number;
  processingTime: number;
  totalLatency: number;
}

export interface LatencyStats {
  average: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
}

// ==================== OrderMatchingEngine ====================

class OrderMatchingEngine {
  private buyOrders: Order[] = [];
  private sellOrders: Order[] = [];
  private orderMap: Map<string, Order> = new Map();

  constructor() {}

  /**
   * Insert order using binary search for O(log n) insertion
   */
  insertOrder(order: Order): void {
    const orders = order.side === "buy" ? this.buyOrders : this.sellOrders;
    const index = this.binarySearchInsertPosition(orders, order);
    orders.splice(index, 0, order);
    this.orderMap.set(order.id, order);
  }

  /**
   * Binary search to find insertion position
   */
  private binarySearchInsertPosition(orders: Order[], newOrder: Order): number {
    let left = 0;
    let right = orders.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const comparison = this.compareOrders(orders[mid], newOrder, newOrder.side);

      if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Compare orders for price-time priority
   * Buy orders: higher price first, then earlier timestamp
   * Sell orders: lower price first, then earlier timestamp
   */
  private compareOrders(a: Order, b: Order, side: "buy" | "sell"): number {
    if (side === "buy") {
      if (a.price !== b.price) {
        return b.price - a.price; // Higher price first
      }
    } else {
      if (a.price !== b.price) {
        return a.price - b.price; // Lower price first
      }
    }
    return a.timestamp - b.timestamp; // Earlier timestamp first
  }

  /**
   * Cancel order with O(log n) removal
   */
  cancelOrder(orderId: string): boolean {
    const order = this.orderMap.get(orderId);
    if (!order) return false;

    const orders = order.side === "buy" ? this.buyOrders : this.sellOrders;
    const index = this.binarySearchOrder(orders, order);

    if (index !== -1) {
      orders.splice(index, 1);
      this.orderMap.delete(orderId);
      order.status = "cancelled";
      return true;
    }

    return false;
  }

  /**
   * Binary search to find order index
   */
  private binarySearchOrder(orders: Order[], target: Order): number {
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].id === target.id) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Match orders using price-time priority algorithm
   */
  matchOrders(): Trade[] {
    const trades: Trade[] = [];

    while (this.buyOrders.length > 0 && this.sellOrders.length > 0) {
      const bestBuy = this.buyOrders[0];
      const bestSell = this.sellOrders[0];

      // Check if orders can be matched
      if (bestBuy.price < bestSell.price) {
        break;
      }

      // Calculate matched quantity
      const matchedQuantity = Math.min(
        bestBuy.quantity - bestBuy.filled,
        bestSell.quantity - bestSell.filled
      );

      // Execution price (typically the resting order's price)
      const executionPrice = bestSell.timestamp < bestBuy.timestamp ? bestSell.price : bestBuy.price;

      // Create trade
      const trade: Trade = {
        price: executionPrice,
        size: matchedQuantity,
        side: "buy",
        timestamp: Date.now(),
        tradeId: `${bestBuy.id}-${bestSell.id}-${Date.now()}`,
        symbol: "BTC/USD", // Would be dynamic in production
      };

      trades.push(trade);

      // Update filled quantities
      bestBuy.filled += matchedQuantity;
      bestSell.filled += matchedQuantity;

      // Update order status
      if (bestBuy.filled === bestBuy.quantity) {
        bestBuy.status = "filled";
        this.buyOrders.shift();
        this.orderMap.delete(bestBuy.id);
      } else {
        bestBuy.status = "partial";
      }

      if (bestSell.filled === bestSell.quantity) {
        bestSell.status = "filled";
        this.sellOrders.shift();
        this.orderMap.delete(bestSell.id);
      } else {
        bestSell.status = "partial";
      }
    }

    return trades;
  }

  /**
   * Get current order book snapshot
   */
  getOrderBook(): OrderBookSnapshot {
    const bids: OrderBookLevel[] = this.buyOrders
      .slice(0, 20)
      .map((order) => ({
        price: order.price,
        quantity: order.quantity - order.filled,
      }));

    const asks: OrderBookLevel[] = this.sellOrders
      .slice(0, 20)
      .map((order) => ({
        price: order.price,
        quantity: order.quantity - order.filled,
      }));

    return {
      bids,
      asks,
      timestamp: Date.now(),
      symbol: "BTC/USD",
    };
  }
}

// ==================== TickerStream ====================

class TickerStream extends EventEmitter {
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();

  constructor() {
    super();
  }

  /**
   * Subscribe to real-time price updates for a symbol
   */
  subscribe(symbol: string, callback: (data: any) => void): void {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(callback);
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribe(symbol: string, callback: (data: any) => void): void {
    const subscribers = this.subscriptions.get(symbol);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }
  }

  /**
   * Emit price change with timestamp
   */
  emitPriceUpdate(symbol: string, price: number, volume?: number): void {
    const data = {
      symbol,
      price,
      volume,
      timestamp: Date.now(),
    };

    const subscribers = this.subscriptions.get(symbol);
    if (subscribers) {
      subscribers.forEach((callback) => callback(data));
    }

    this.emit("price", data);
  }
}

// ==================== OrderExecutor ====================

class OrderExecutor {
  private matchingEngine: OrderMatchingEngine;

  constructor(matchingEngine: OrderMatchingEngine) {
    this.matchingEngine = matchingEngine;
  }

  /**
   * Execute limit order
   */
  executeLimitOrder(order: Omit<Order, "timestamp" | "filled" | "status">): Order {
    const fullOrder: Order = {
      ...order,
      timestamp: Date.now(),
      filled: 0,
      status: "open",
    };

    this.matchingEngine.insertOrder(fullOrder);
    return fullOrder;
  }

  /**
   * Execute market order
   */
  executeMarketOrder(order: Omit<Order, "price" | "timestamp" | "filled" | "status">): Order {
    const orderBook = this.matchingEngine.getOrderBook();
    const bestPrice =
      order.side === "buy"
        ? orderBook.asks[0]?.price || 0
        : orderBook.bids[0]?.price || 0;

    const fullOrder: Order = {
      ...order,
      price: bestPrice,
      timestamp: Date.now(),
      filled: 0,
      status: "open",
      type: "market",
    };

    this.matchingEngine.insertOrder(fullOrder);
    const trades = this.matchingEngine.matchOrders();

    return fullOrder;
  }

  /**
   * Execute stop-loss order
   */
  executeStopLoss(
    order: Omit<Order, "timestamp" | "filled" | "status">,
    stopPrice: number
  ): Order {
    const fullOrder: Order = {
      ...order,
      timestamp: Date.now(),
      filled: 0,
      status: "pending",
    };

    // In production, this would monitor price and activate when stop price is reached
    return fullOrder;
  }

  /**
   * Calculate slippage based on order book depth
   */
  calculateSlippage(side: "buy" | "sell", quantity: number): number {
    const orderBook = this.matchingEngine.getOrderBook();
    const levels = side === "buy" ? orderBook.asks : orderBook.bids;

    if (levels.length === 0) return Infinity;

    const bestPrice = levels[0].price;
    let remainingQuantity = quantity;
    let totalCost = 0;

    for (const level of levels) {
      const fillQuantity = Math.min(remainingQuantity, level.quantity);
      totalCost += fillQuantity * level.price;
      remainingQuantity -= fillQuantity;

      if (remainingQuantity <= 0) break;
    }

    if (remainingQuantity > 0) return Infinity;

    const averagePrice = totalCost / quantity;
    const slippageBps = ((averagePrice - bestPrice) / bestPrice) * 10000;

    return Math.abs(slippageBps);
  }

  /**
   * Handle partial fills
   */
  handlePartialFills(order: Order, filledQuantity: number): void {
    order.filled += filledQuantity;
    if (order.filled >= order.quantity) {
      order.status = "filled";
    } else {
      order.status = "partial";
    }
  }
}

// ==================== LatencyMonitor ====================

class LatencyMonitor {
  private latencies: number[] = [];
  private maxSamples: number = 10000;

  constructor(maxSamples: number = 10000) {
    this.maxSamples = maxSamples;
  }

  /**
   * Track execution time in microseconds
   */
  track(sendTime: number, receiveTime: number, processingTime: number): LatencyMetrics {
    const totalLatency = receiveTime - sendTime + processingTime;

    this.latencies.push(totalLatency);
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }

    return {
      sendTime,
      receiveTime,
      processingTime,
      totalLatency,
    };
  }

  /**
   * Calculate latency statistics
   */
  getStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      average: sorted.reduce((a, b) => a + b, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      min: sorted[0],
      max: sorted[count - 1],
      count,
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.latencies = [];
  }
}

// ==================== ConnectionPoolManager ====================

class ConnectionPoolManager extends EventEmitter {
  private connections: WebSocket[] = [];
  private activeConnections: Set<number> = new Set();
  private config: WebSocketConfig;
  private currentConnectionIndex: number = 0;

  constructor(config: WebSocketConfig, poolSize: number = 3) {
    super();
    this.config = config;

    for (let i = 0; i < poolSize; i++) {
      this.createConnection(i);
    }
  }

  /**
   * Create a WebSocket connection
   */
  private createConnection(index: number): void {
    const ws = new WebSocket(this.config.url);

    ws.on("open", () => {
      this.activeConnections.add(index);
      this.emit("connection-open", index);
    });

    ws.on("close", () => {
      this.activeConnections.delete(index);
      this.emit("connection-close", index);

      if (this.config.reconnect) {
        this.reconnectWithBackoff(index, 0);
      }
    });

    ws.on("error", (error: Error) => {
      this.emit("error", { index, error });
    });

    ws.on("message", (data: Buffer) => {
      this.emit("message", { index, data });
    });

    this.connections[index] = ws;
  }

  /**
   * Reconnect with exponential backoff
   */
  private reconnectWithBackoff(index: number, attempt: number): void {
    if (attempt >= this.config.reconnectMaxAttempts) {
      this.emit("reconnect-failed", index);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);

    setTimeout(() => {
      this.createConnection(index);
      this.emit("reconnecting", { index, attempt });
    }, delay);
  }

  /**
   * Get next available connection using round-robin load balancing
   */
  getConnection(): WebSocket | null {
    if (this.activeConnections.size === 0) {
      return null;
    }

    let attempts = 0;
    while (attempts < this.connections.length) {
      const index = this.currentConnectionIndex % this.connections.length;
      this.currentConnectionIndex++;

      if (this.activeConnections.has(index)) {
        const ws = this.connections[index];
        if (ws.readyState === WebSocket.OPEN) {
          return ws;
        }
      }

      attempts++;
    }

    return null;
  }

  /**
   * Send message through load-balanced connection
   */
  send(data: any): boolean {
    const ws = this.getConnection();
    if (!ws) return false;

    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      this.emit("send-error", error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.activeConnections.clear();
  }
}

// ==================== WebSocketTradingEngine ====================

class WebSocketTradingEngine extends EventEmitter {
  private config: WebSocketConfig;
  private connectionPool: ConnectionPoolManager;
  private matchingEngine: OrderMatchingEngine;
  private orderExecutor: OrderExecutor;
  private tickerStream: TickerStream;
  private latencyMonitor: LatencyMonitor;
  private messageQueue: any[] = [];
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config: Partial<WebSocketConfig> = {}) {
    super();

    this.config = {
      url: config.url || "wss://example.com",
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval || 5000,
      reconnectMaxAttempts: config.reconnectMaxAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
      messageQueueSize: config.messageQueueSize || 1000,
    };

    this.connectionPool = new ConnectionPoolManager(this.config);
    this.matchingEngine = new OrderMatchingEngine();
    this.orderExecutor = new OrderExecutor(this.matchingEngine);
    this.tickerStream = new TickerStream();
    this.latencyMonitor = new LatencyMonitor();

    this.setupEventHandlers();
    this.startHeartbeat();
  }

  /**
   * Setup event handlers for connection pool
   */
  private setupEventHandlers(): void {
    this.connectionPool.on("message", ({ index, data }) => {
      const sendTime = Date.now();
      this.handleMessage(data);
      const processingTime = Date.now() - sendTime;
      this.latencyMonitor.track(sendTime, Date.now(), processingTime);
    });

    this.connectionPool.on("error", ({ index, error }) => {
      this.emit("error", { index, error });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Apply backpressure if queue is full
      if (this.messageQueue.length >= this.config.messageQueueSize) {
        this.messageQueue.shift();
        this.emit("backpressure", this.messageQueue.length);
      }

      this.messageQueue.push(message);
      this.processMessage(message);
    } catch (error) {
      this.emit("parse-error", error);
    }
  }

  /**
   * Process message from queue
   */
  private processMessage(message: any): void {
    const messageIndex = this.messageQueue.indexOf(message);
    if (messageIndex !== -1) {
      this.messageQueue.splice(messageIndex, 1);
    }

    this.emit("message", message);
  }

  /**
   * Start heartbeat/ping-pong mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.connectionPool.send({ type: "ping", timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  /**
   * Place limit order
   */
  placeLimitOrder(order: Omit<Order, "timestamp" | "filled" | "status">): Order {
    return this.orderExecutor.executeLimitOrder(order);
  }

  /**
   * Place market order
   */
  placeMarketOrder(order: Omit<Order, "price" | "timestamp" | "filled" | "status">): Order {
    return this.orderExecutor.executeMarketOrder(order);
  }

  /**
   * Cancel order
   */
  cancelOrder(orderId: string): boolean {
    return this.matchingEngine.cancelOrder(orderId);
  }

  /**
   * Get order book
   */
  getOrderBook(): OrderBookSnapshot {
    return this.matchingEngine.getOrderBook();
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(): LatencyStats {
    return this.latencyMonitor.getStats();
  }

  /**
   * Subscribe to ticker stream
   */
  subscribeTicker(symbol: string, callback: (data: any) => void): void {
    this.tickerStream.subscribe(symbol, callback);
  }

  /**
   * Send message through connection pool
   */
  send(data: any): boolean {
    return this.connectionPool.send(data);
  }

  /**
   * Shutdown engine
   */
  shutdown(): void {
    this.stopHeartbeat();
    this.connectionPool.closeAll();
    this.removeAllListeners();
  }
}

// Export all components
export {
  WebSocketTradingEngine,
  OrderMatchingEngine,
  OrderExecutor,
  TickerStream,
  LatencyMonitor,
  ConnectionPoolManager,
};