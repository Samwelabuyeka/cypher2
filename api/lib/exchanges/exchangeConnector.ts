import ccxt from 'ccxt';
// @ts-ignore - ccxt package doesn't have proper type declarations

interface ExchangeConnection {
  status: 'connected' | 'failed';
  supportedFeatures: string[];
  error?: string;
}

interface PriceMap {
  [exchange: string]: number | null;
}

interface OrderBookData {
  bids: [number, number][];
  asks: [number, number][];
  marketDepth: {
    bidDepth: number;
    askDepth: number;
  };
}

interface OrderResult {
  orderId: string;
  executedPrice?: number;
  status: string;
  timestamp: number;
  error?: string;
}

interface Balance {
  free: { [currency: string]: number };
  used: { [currency: string]: number };
  total: { [currency: string]: number };
  usdValue?: number;
}

interface ExchangeInfo {
  tradingFees: {
    maker: number;
    taker: number;
  };
  withdrawalFees: { [currency: string]: number };
  depositWithdrawalStatus: {
    deposits: boolean;
    withdrawals: boolean;
  };
  rateLimits: {
    max: number;
    cost: number;
  }[];
}

class ExchangeConnector {
  private exchanges: Map<string, ccxt.Exchange>;
  private websockets: Map<string, any>;

  constructor() {
    this.exchanges = new Map();
    this.websockets = new Map();
    this.initializeExchanges();
  }

  private initializeExchanges(): void {
    const supportedExchanges = ['binance', 'coinbase', 'kraken', 'kucoin', 'bybit'];
    
    for (const exchangeName of supportedExchanges) {
      try {
        const apiKey = process.env[`${exchangeName.toUpperCase()}_API_KEY`];
        const secret = process.env[`${exchangeName.toUpperCase()}_API_SECRET`];
        
        if (apiKey && secret) {
          const ExchangeClass = ccxt[exchangeName as keyof typeof ccxt] as any;
          const exchange = new ExchangeClass({
            apiKey,
            secret,
            enableRateLimit: true,
            options: {
              defaultType: 'spot',
            },
          });
          
          this.exchanges.set(exchangeName, exchange);
          console.log(`Initialized ${exchangeName} exchange`);
        }
      } catch (error) {
        console.error(`Failed to initialize ${exchangeName}:`, error);
      }
    }
  }

  async connectExchange(
    exchangeName: string,
    apiKey: string,
    secret: string,
    passphrase?: string
  ): Promise<ExchangeConnection> {
    try {
      const ExchangeClass = ccxt[exchangeName as keyof typeof ccxt] as any;
      
      if (!ExchangeClass) {
        return {
          status: 'failed',
          supportedFeatures: [],
          error: `Exchange ${exchangeName} is not supported`,
        };
      }

      const config: any = {
        apiKey,
        secret,
        enableRateLimit: true,
      };

      if (passphrase) {
        config.password = passphrase;
      }

      const exchange = new ExchangeClass(config);

      const balance = await exchange.fetchBalance();
      
      this.exchanges.set(exchangeName, exchange);

      const supportedFeatures: string[] = [];
      if (exchange.has.fetchOHLCV) supportedFeatures.push('OHLCV');
      if (exchange.has.fetchTicker) supportedFeatures.push('Ticker');
      if (exchange.has.fetchOrderBook) supportedFeatures.push('OrderBook');
      if (exchange.has.createOrder) supportedFeatures.push('CreateOrder');
      if (exchange.has.fetchMyTrades) supportedFeatures.push('MyTrades');
      if (exchange.has.ws) supportedFeatures.push('WebSocket');

      return {
        status: 'connected',
        supportedFeatures,
      };
    } catch (error) {
      return {
        status: 'failed',
        supportedFeatures: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getAllExchangePrices(symbol: string): Promise<PriceMap> {
    const prices: PriceMap = {};
    
    await Promise.all(
      Array.from(this.exchanges.entries()).map(async ([name, exchange]) => {
        try {
          const ticker = await this.retryWithBackoff(() => 
            exchange.fetchTicker(symbol)
          );
          const typedTicker = ticker as any;
          prices[name] = typedTicker.last || typedTicker.close;
        } catch (error) {
          console.error(`Failed to fetch price from ${name} for ${symbol}:`, error);
          prices[name] = null;
        }
      })
    );

    return prices;
  }

  async getOrderBook(
    exchangeName: string,
    symbol: string,
    limit: number = 50
  ): Promise<OrderBookData> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} is not connected`);
    }

    const orderBook = await this.retryWithBackoff(() =>
      exchange.fetchOrderBook(symbol, limit)
    );

    const bidDepth = orderBook.bids.reduce((sum: number, [price, amount]: [number, number]) => sum + (price * amount), 0);
    const askDepth = orderBook.asks.reduce((sum: number, [price, amount]: [number, number]) => sum + (price * amount), 0);

    return {
      bids: orderBook.bids as [number, number][],
      asks: orderBook.asks as [number, number][],
      marketDepth: {
        bidDepth,
        askDepth,
      },
    };
  }

  async executeMarketOrder(
    exchangeName: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<OrderResult> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      return {
        orderId: '',
        status: 'failed',
        timestamp: Date.now(),
        error: `Exchange ${exchangeName} is not connected`,
      };
    }

    try {
      const order = await this.retryWithBackoff(() =>
        exchange.createMarketOrder(symbol, side, amount)
      );
      const typedOrder = order as any;

      return {
        orderId: typedOrder.id,
        executedPrice: typedOrder.average || typedOrder.price,
        status: typedOrder.status,
        timestamp: typedOrder.timestamp,
      };
    } catch (error) {
      return {
        orderId: '',
        status: 'failed',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async executeLimitOrder(
    exchangeName: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price: number
  ): Promise<OrderResult> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      return {
        orderId: '',
        status: 'failed',
        timestamp: Date.now(),
        error: `Exchange ${exchangeName} is not connected`,
      };
    }

    try {
      const order = await this.retryWithBackoff(() =>
        exchange.createLimitOrder(symbol, side, amount, price)
      );
      const typedOrder = order as any;

      return {
        orderId: typedOrder.id,
        executedPrice: typedOrder.price,
        status: typedOrder.status,
        timestamp: typedOrder.timestamp,
      };
    } catch (error) {
      return {
        orderId: '',
        status: 'failed',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getBalances(exchangeName: string): Promise<Balance> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} is not connected`);
    }

    const balance = await this.retryWithBackoff(() =>
      exchange.fetchBalance()
    );
    const typedBalance = balance as any;

    let usdValue = 0;
    
    try {
      for (const currency of Object.keys(typedBalance.total)) {
        if (typedBalance.total[currency] > 0 && currency !== 'USD' && currency !== 'USDT') {
          try {
            const ticker = await exchange.fetchTicker(`${currency}/USDT`);
            const typedTicker = ticker as any;
            usdValue += typedBalance.total[currency] * (typedTicker.last || typedTicker.close);
          } catch (e) {
            // Skip currencies that don't have USDT pair
          }
        } else if (currency === 'USD' || currency === 'USDT') {
          usdValue += typedBalance.total[currency];
        }
      }
    } catch (error) {
      console.error('Failed to calculate USD value:', error);
    }

    return {
      free: typedBalance.free,
      used: typedBalance.used,
      total: typedBalance.total,
      usdValue,
    };
  }

  async getExchangeInfo(exchangeName: string): Promise<ExchangeInfo> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} is not connected`);
    }

    await exchange.loadMarkets();

    const tradingFees = {
      maker: exchange.fees?.trading?.maker || 0,
      taker: exchange.fees?.trading?.taker || 0,
    };

    const withdrawalFees: { [currency: string]: number } = {};
    if (exchange.fees?.funding?.withdraw) {
      Object.assign(withdrawalFees, exchange.fees.funding.withdraw);
    }

    const depositWithdrawalStatus = {
      deposits: exchange.has.fetchDeposits || false,
      withdrawals: exchange.has.withdraw || false,
    };

    const rateLimits = exchange.rateLimit 
      ? [{ max: 1000, cost: exchange.rateLimit }]
      : [];

    return {
      tradingFees,
      withdrawalFees,
      depositWithdrawalStatus,
      rateLimits,
    };
  }

  async monitorWebSocket(
    exchangeName: string,
    symbols: string[],
    callback: (data: {
      exchange: string;
      symbol: string;
      price: number;
      bid: number;
      ask: number;
      volume: number;
      timestamp: number;
    }) => void
  ): Promise<void> {
    const exchange = this.exchanges.get(exchangeName);
    
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} is not connected`);
    }

    if (!exchange.has.ws) {
      throw new Error(`Exchange ${exchangeName} does not support WebSocket`);
    }

    const wsKey = `${exchangeName}_${symbols.join('_')}`;

    try {
      for (const symbol of symbols) {
        const watchTicker = async (): Promise<void> => {
          try {
            while (true) {
              const ticker = await exchange.watchTicker(symbol);
              const typedTicker = ticker as any;
              callback({
                exchange: exchangeName,
                symbol,
                price: typedTicker.last || typedTicker.close,
                bid: typedTicker.bid,
                ask: typedTicker.ask,
                volume: typedTicker.baseVolume,
                timestamp: typedTicker.timestamp,
              });
            }
          } catch (error) {
            console.error(`WebSocket error for ${exchangeName} ${symbol}:`, error);
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            watchTicker();
          }
        };

        watchTicker();
      }

      this.websockets.set(wsKey, { exchange: exchangeName, symbols });
    } catch (error) {
      console.error(`Failed to start WebSocket monitoring for ${exchangeName}:`, error);
      throw error;
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (error instanceof ccxt.RateLimitExceeded) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Rate limit exceeded, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (error instanceof ccxt.ExchangeNotAvailable) {
          const delay = Math.pow(2, attempt) * 2000;
          console.log(`Exchange not available, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (error instanceof ccxt.NetworkError) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }

  getConnectedExchanges(): string[] {
    return Array.from(this.exchanges.keys());
  }

  isExchangeConnected(exchangeName: string): boolean {
    return this.exchanges.has(exchangeName);
  }

  async closeWebSocket(exchangeName: string, symbols: string[]): Promise<void> {
    const wsKey = `${exchangeName}_${symbols.join('_')}`;
    
    if (this.websockets.has(wsKey)) {
      const exchange = this.exchanges.get(exchangeName);
      if (exchange && exchange.close) {
        await exchange.close();
      }
      this.websockets.delete(wsKey);
    }
  }
}

export const exchangeConnector = new ExchangeConnector();