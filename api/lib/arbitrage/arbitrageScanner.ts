import { api } from "gadget-server";

interface ExchangePair {
  exchange: string;
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  volume: number;
}

interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  rawSpread: number;
  netSpread: number;
  estimatedProfit: number;
  liquidityScore: number;
  transferTime: number;
  timestamp: Date;
  fees: {
    buyFee: number;
    sellFee: number;
    transferFee: number;
  };
}

interface RankedOpportunity extends ArbitrageOpportunity {
  score: number;
  rank: number;
}

interface TriangularArbitrageOpportunity {
  exchange: string;
  path: string[];
  profitPercent: number;
  estimatedProfit: number;
  timestamp: Date;
}

interface OpportunityRecord {
  opportunity: ArbitrageOpportunity;
  executed: boolean;
  result?: {
    actualProfit: number;
    executionTime: number;
    slippage: number;
  };
  timestamp: Date;
}

export class ArbitrageScanner {
  private opportunityHistory: OpportunityRecord[] = [];
  private readonly defaultFees = {
    trading: 0.001, // 0.1% trading fee
    withdrawal: 0.0005, // 0.05% withdrawal fee
  };

  /**
   * Scan all trading pairs across multiple exchanges for arbitrage opportunities
   */
  async scanAllPairs(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    try {
      // Get all active exchanges
      const exchanges = await api.exchange.findMany({
        filter: { isActive: { equals: true } },
        select: { id: true, code: true, name: true, feeStructure: true },
      });

      if (exchanges.length < 2) {
        return opportunities;
      }

      // Get all market data grouped by symbol
      const marketData = await api.marketData.findMany({
        filter: {
          timestamp: {
            greaterThan: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Last 5 minutes
          },
        },
        select: {
          symbol: true,
          close: true,
          bidPrice: true,
          askPrice: true,
          volume: true,
          exchange: { id: true, code: true },
        },
        first: 250,
      });

      // Group market data by symbol
      const symbolMap = new Map<string, typeof marketData>();
      for (const data of marketData) {
        if (!symbolMap.has(data.symbol)) {
          symbolMap.set(data.symbol, []);
        }
        symbolMap.get(data.symbol)!.push(data);
      }

      // For each symbol that appears on multiple exchanges, check for arbitrage
      for (const [symbol, dataPoints] of symbolMap.entries()) {
        if (dataPoints.length < 2) continue;

        // Compare all pairs of exchanges for this symbol
        for (let i = 0; i < dataPoints.length; i++) {
          for (let j = i + 1; j < dataPoints.length; j++) {
            const data1 = dataPoints[i];
            const data2 = dataPoints[j];

            if (!data1.exchange || !data2.exchange) continue;

            const buyPrice1 = data1.askPrice ?? data1.close;
            const sellPrice1 = data1.bidPrice ?? data1.close;
            const buyPrice2 = data2.askPrice ?? data2.close;
            const sellPrice2 = data2.bidPrice ?? data2.close;

            // Check arbitrage in both directions
            const spread1 = await this.calculateSpread(
              data1.exchange.code,
              data2.exchange.code,
              symbol,
              buyPrice1,
              sellPrice2
            );

            const spread2 = await this.calculateSpread(
              data2.exchange.code,
              data1.exchange.code,
              symbol,
              buyPrice2,
              sellPrice1
            );

            if (spread1.netSpread > 0) {
              opportunities.push({
                symbol,
                buyExchange: data1.exchange.code,
                sellExchange: data2.exchange.code,
                buyPrice: buyPrice1,
                sellPrice: sellPrice2,
                rawSpread: spread1.rawSpread,
                netSpread: spread1.netSpread,
                estimatedProfit: spread1.estimatedProfit,
                liquidityScore: 0,
                transferTime: 0,
                timestamp: new Date(),
                fees: spread1.fees,
              });
            }

            if (spread2.netSpread > 0) {
              opportunities.push({
                symbol,
                buyExchange: data2.exchange.code,
                sellExchange: data1.exchange.code,
                buyPrice: buyPrice2,
                sellPrice: sellPrice1,
                rawSpread: spread2.rawSpread,
                netSpread: spread2.netSpread,
                estimatedProfit: spread2.estimatedProfit,
                liquidityScore: 0,
                transferTime: 0,
                timestamp: new Date(),
                fees: spread2.fees,
              });
            }
          }
        }
      }

      // Sort by net spread descending
      opportunities.sort((a, b) => b.netSpread - a.netSpread);

      return opportunities;
    } catch (error) {
      console.error("Error scanning pairs:", error);
      return opportunities;
    }
  }

  /**
   * Calculate the spread between two exchanges for a symbol
   */
  async calculateSpread(
    buyExchange: string,
    sellExchange: string,
    symbol: string,
    buyPrice?: number,
    sellPrice?: number
  ): Promise<{
    rawSpread: number;
    netSpread: number;
    estimatedProfit: number;
    fees: { buyFee: number; sellFee: number; transferFee: number };
  }> {
    try {
      // If prices not provided, fetch them
      if (!buyPrice || !sellPrice) {
        const [buyData, sellData] = await Promise.all([
          api.marketData.findFirst({
            filter: {
              symbol: { equals: symbol },
              exchange: { code: { equals: buyExchange } },
            },
            sort: { timestamp: "Descending" },
            select: { askPrice: true, close: true },
          }),
          api.marketData.findFirst({
            filter: {
              symbol: { equals: symbol },
              exchange: { code: { equals: sellExchange } },
            },
            sort: { timestamp: "Descending" },
            select: { bidPrice: true, close: true },
          }),
        ]);

        buyPrice = buyData?.askPrice ?? buyData?.close ?? 0;
        sellPrice = sellData?.bidPrice ?? sellData?.close ?? 0;
      }

      if (buyPrice === 0 || sellPrice === 0) {
        return {
          rawSpread: 0,
          netSpread: 0,
          estimatedProfit: 0,
          fees: { buyFee: 0, sellFee: 0, transferFee: 0 },
        };
      }

      // Calculate raw spread
      const rawSpread = ((sellPrice - buyPrice) / buyPrice) * 100;

      // Get exchange fee structures
      const exchanges = await api.exchange.findMany({
        filter: {
          code: { in: [buyExchange, sellExchange] },
        },
        select: { code: true, feeStructure: true },
      });

      const buyExchangeData = exchanges.find((e) => e.code === buyExchange);
      const sellExchangeData = exchanges.find((e) => e.code === sellExchange);

      // Extract fees or use defaults
      const buyFee =
        (buyExchangeData?.feeStructure as any)?.maker ?? this.defaultFees.trading;
      const sellFee =
        (sellExchangeData?.feeStructure as any)?.taker ?? this.defaultFees.trading;
      const transferFee = this.defaultFees.withdrawal;

      // Calculate net spread after fees
      const totalFeePercent = (buyFee + sellFee + transferFee) * 100;
      const netSpread = rawSpread - totalFeePercent;

      // Estimate profit on $1000 trade
      const tradeAmount = 1000;
      const estimatedProfit = (tradeAmount * netSpread) / 100;

      return {
        rawSpread,
        netSpread,
        estimatedProfit,
        fees: {
          buyFee: buyFee * 100,
          sellFee: sellFee * 100,
          transferFee: transferFee * 100,
        },
      };
    } catch (error) {
      console.error("Error calculating spread:", error);
      return {
        rawSpread: 0,
        netSpread: 0,
        estimatedProfit: 0,
        fees: { buyFee: 0, sellFee: 0, transferFee: 0 },
      };
    }
  }

  /**
   * Validate if there's sufficient liquidity for the trade
   */
  async validateLiquidity(
    exchange: string,
    symbol: string,
    amount: number,
    side: "buy" | "sell"
  ): Promise<{
    sufficient: boolean;
    availableAmount: number;
    estimatedSlippage: number;
  }> {
    try {
      // Get recent market data for the symbol on this exchange
      const marketData = await api.marketData.findFirst({
        filter: {
          symbol: { equals: symbol },
          exchange: { code: { equals: exchange } },
        },
        sort: { timestamp: "Descending" },
        select: { volume: true, close: true, high: true, low: true },
      });

      if (!marketData) {
        return { sufficient: false, availableAmount: 0, estimatedSlippage: 0 };
      }

      // Estimate available liquidity as a percentage of 24h volume
      const estimatedOrderBookDepth = marketData.volume * 0.1; // Assume 10% of volume available
      const availableAmount = Math.min(estimatedOrderBookDepth, amount);

      // Estimate slippage based on price volatility
      const priceRange = marketData.high - marketData.low;
      const estimatedSlippage = (priceRange / marketData.close) * 100;

      const sufficient = availableAmount >= amount * 0.9; // Need at least 90% of amount

      return {
        sufficient,
        availableAmount,
        estimatedSlippage,
      };
    } catch (error) {
      console.error("Error validating liquidity:", error);
      return { sufficient: false, availableAmount: 0, estimatedSlippage: 0 };
    }
  }

  /**
   * Check if user has sufficient balances on both exchanges
   */
  async checkBalances(
    userId: string,
    buyExchange: string,
    sellExchange: string,
    symbol: string,
    amount: number
  ): Promise<{
    adequate: boolean;
    buyExchangeBalance: number;
    sellExchangeBalance: number;
  }> {
    try {
      // Get user's trading accounts for both exchanges
      const [buyExchangeData, sellExchangeData] = await Promise.all([
        api.exchange.findFirst({
          filter: { code: { equals: buyExchange } },
          select: { id: true },
        }),
        api.exchange.findFirst({
          filter: { code: { equals: sellExchange } },
          select: { id: true },
        }),
      ]);

      if (!buyExchangeData || !sellExchangeData) {
        return { adequate: false, buyExchangeBalance: 0, sellExchangeBalance: 0 };
      }

      const [buyAccount, sellAccount] = await Promise.all([
        api.tradingAccount.findFirst({
          filter: {
            user: { id: { equals: userId } },
            exchange: { id: { equals: buyExchangeData.id } },
            isActive: { equals: true },
          },
          select: { balance: true },
        }),
        api.tradingAccount.findFirst({
          filter: {
            user: { id: { equals: userId } },
            exchange: { id: { equals: sellExchangeData.id } },
            isActive: { equals: true },
          },
          select: { balance: true },
        }),
      ]);

      // Extract balances from JSON field
      const buyBalance = (buyAccount?.balance as any)?.USDT ?? 0;
      const [baseCurrency] = symbol.split("/");
      const sellBalance = (sellAccount?.balance as any)?.[baseCurrency] ?? 0;

      const adequate = buyBalance >= amount && sellBalance >= amount / 1000; // Rough estimate

      return {
        adequate,
        buyExchangeBalance: buyBalance,
        sellExchangeBalance: sellBalance,
      };
    } catch (error) {
      console.error("Error checking balances:", error);
      return { adequate: false, buyExchangeBalance: 0, sellExchangeBalance: 0 };
    }
  }

  /**
   * Rank opportunities by multiple factors
   */
  rankOpportunities(opportunities: ArbitrageOpportunity[]): RankedOpportunity[] {
    const rankedOpportunities: RankedOpportunity[] = opportunities.map((opp) => {
      // Calculate scores for different factors
      const profitScore = Math.min(opp.netSpread * 10, 100); // Cap at 100
      const liquidityScore = opp.liquidityScore;
      const transferScore = Math.max(0, 100 - opp.transferTime); // Lower time = higher score
      const certaintyScore = opp.netSpread > 0.5 ? 100 : opp.netSpread * 200;

      // Weighted average
      const score =
        profitScore * 0.4 +
        liquidityScore * 0.2 +
        transferScore * 0.2 +
        certaintyScore * 0.2;

      return {
        ...opp,
        score,
        rank: 0, // Will be set after sorting
      };
    });

    // Sort by score descending
    rankedOpportunities.sort((a, b) => b.score - a.score);

    // Assign ranks
    rankedOpportunities.forEach((opp, index) => {
      opp.rank = index + 1;
    });

    return rankedOpportunities;
  }

  /**
   * Validate opportunity before execution
   */
  async validateBeforeExecution(
    opportunity: ArbitrageOpportunity,
    userId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    updatedOpportunity?: ArbitrageOpportunity;
  }> {
    try {
      // Re-check current prices
      const spread = await this.calculateSpread(
        opportunity.buyExchange,
        opportunity.sellExchange,
        opportunity.symbol
      );

      // Verify spread still exists (with 80% threshold to account for minor changes)
      if (spread.netSpread < opportunity.netSpread * 0.8) {
        return {
          valid: false,
          reason: "Spread has narrowed significantly since detection",
        };
      }

      // Check balances
      const balances = await this.checkBalances(
        userId,
        opportunity.buyExchange,
        opportunity.sellExchange,
        opportunity.symbol,
        opportunity.estimatedProfit
      );

      if (!balances.adequate) {
        return {
          valid: false,
          reason: "Insufficient balances on one or both exchanges",
        };
      }

      // Verify both exchanges are operational
      const exchanges = await api.exchange.findMany({
        filter: {
          code: { in: [opportunity.buyExchange, opportunity.sellExchange] },
          isActive: { equals: true },
        },
        select: { code: true },
      });

      if (exchanges.length < 2) {
        return {
          valid: false,
          reason: "One or both exchanges are not operational",
        };
      }

      // Update opportunity with current data
      const updatedOpportunity: ArbitrageOpportunity = {
        ...opportunity,
        rawSpread: spread.rawSpread,
        netSpread: spread.netSpread,
        estimatedProfit: spread.estimatedProfit,
        timestamp: new Date(),
      };

      return {
        valid: true,
        updatedOpportunity,
      };
    } catch (error) {
      console.error("Error validating opportunity:", error);
      return {
        valid: false,
        reason: "Validation error occurred",
      };
    }
  }

  /**
   * Find triangular arbitrage opportunities on a single exchange
   */
  async findTriangularArbitrage(
    exchange: string
  ): Promise<TriangularArbitrageOpportunity[]> {
    const opportunities: TriangularArbitrageOpportunity[] = [];

    try {
      // Get all market data for this exchange
      const marketData = await api.marketData.findMany({
        filter: {
          exchange: { code: { equals: exchange } },
          timestamp: {
            greaterThan: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        },
        select: { symbol: true, close: true, bidPrice: true, askPrice: true },
        first: 250,
      });

      // Build price map
      const priceMap = new Map<string, { bid: number; ask: number }>();
      for (const data of marketData) {
        priceMap.set(data.symbol, {
          bid: data.bidPrice ?? data.close,
          ask: data.askPrice ?? data.close,
        });
      }

      // Common triangular paths
      const triangularPaths = [
        ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
        ["BTC/USDT", "BNB/BTC", "BNB/USDT"],
        ["ETH/USDT", "BNB/ETH", "BNB/USDT"],
        ["BTC/USDT", "LTC/BTC", "LTC/USDT"],
        ["ETH/USDT", "LTC/ETH", "LTC/USDT"],
      ];

      for (const path of triangularPaths) {
        // Check if all pairs exist
        if (!path.every((pair) => priceMap.has(pair))) continue;

        const [pair1, pair2, pair3] = path;
        const price1 = priceMap.get(pair1)!;
        const price2 = priceMap.get(pair2)!;
        const price3 = priceMap.get(pair3)!;

        // Calculate profit for completing the cycle
        // Start with 1 unit, trade through the cycle
        let amount = 1;

        // Trade 1: Buy pair1
        amount = amount / price1.ask;

        // Trade 2: Buy pair2
        amount = amount / price2.ask;

        // Trade 3: Sell pair3
        amount = amount * price3.bid;

        // Calculate profit percentage
        const profitPercent = (amount - 1) * 100;

        // Subtract fees (assume 0.1% per trade = 0.3% total)
        const netProfitPercent = profitPercent - 0.3;

        if (netProfitPercent > 0) {
          opportunities.push({
            exchange,
            path,
            profitPercent: netProfitPercent,
            estimatedProfit: netProfitPercent * 10, // On $1000
            timestamp: new Date(),
          });
        }
      }

      // Sort by profit descending
      opportunities.sort((a, b) => b.profitPercent - a.profitPercent);

      return opportunities;
    } catch (error) {
      console.error("Error finding triangular arbitrage:", error);
      return opportunities;
    }
  }

  /**
   * Track an opportunity and its outcome for historical analysis
   */
  trackOpportunity(
    opportunity: ArbitrageOpportunity,
    executed: boolean,
    result?: {
      actualProfit: number;
      executionTime: number;
      slippage: number;
    }
  ): void {
    const record: OpportunityRecord = {
      opportunity,
      executed,
      result,
      timestamp: new Date(),
    };

    this.opportunityHistory.push(record);

    // Keep only last 1000 records to prevent memory issues
    if (this.opportunityHistory.length > 1000) {
      this.opportunityHistory = this.opportunityHistory.slice(-1000);
    }
  }

  /**
   * Get statistics from historical opportunities
   */
  getHistoricalStats(): {
    totalOpportunities: number;
    executedCount: number;
    successRate: number;
    averageProfit: number;
    bestOpportunity: OpportunityRecord | null;
    bySymbol: Map<string, { count: number; avgProfit: number }>;
    byExchangePair: Map<string, { count: number; avgProfit: number }>;
  } {
    const executed = this.opportunityHistory.filter((r) => r.executed);
    const successful = executed.filter((r) => r.result && r.result.actualProfit > 0);

    const avgProfit =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + (r.result?.actualProfit ?? 0), 0) /
          successful.length
        : 0;

    const bestOpportunity =
      successful.length > 0
        ? successful.reduce((best, current) =>
            (current.result?.actualProfit ?? 0) > (best.result?.actualProfit ?? 0)
              ? current
              : best
          )
        : null;

    // Group by symbol
    const bySymbol = new Map<string, { count: number; avgProfit: number }>();
    for (const record of this.opportunityHistory) {
      const symbol = record.opportunity.symbol;
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, { count: 0, avgProfit: 0 });
      }
      const stats = bySymbol.get(symbol)!;
      stats.count++;
      if (record.result) {
        stats.avgProfit =
          (stats.avgProfit * (stats.count - 1) + record.result.actualProfit) /
          stats.count;
      }
    }

    // Group by exchange pair
    const byExchangePair = new Map<string, { count: number; avgProfit: number }>();
    for (const record of this.opportunityHistory) {
      const pair = `${record.opportunity.buyExchange}-${record.opportunity.sellExchange}`;
      if (!byExchangePair.has(pair)) {
        byExchangePair.set(pair, { count: 0, avgProfit: 0 });
      }
      const stats = byExchangePair.get(pair)!;
      stats.count++;
      if (record.result) {
        stats.avgProfit =
          (stats.avgProfit * (stats.count - 1) + record.result.actualProfit) /
          stats.count;
      }
    }

    return {
      totalOpportunities: this.opportunityHistory.length,
      executedCount: executed.length,
      successRate: executed.length > 0 ? (successful.length / executed.length) * 100 : 0,
      averageProfit: avgProfit,
      bestOpportunity,
      bySymbol,
      byExchangePair,
    };
  }

  /**
   * Clear historical data
   */
  clearHistory(): void {
    this.opportunityHistory = [];
  }
}

// Export singleton instance
export const arbitrageScanner = new ArbitrageScanner();