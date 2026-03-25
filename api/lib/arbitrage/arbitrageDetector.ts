/**
 * Arbitrage Detection Engine
 * 
 * This module provides functions for detecting and analyzing arbitrage opportunities
 * across cryptocurrency exchanges, including both simple and triangular arbitrage.
 */

// ============================================================================
// Types
// ============================================================================

export interface SimpleArbitrageOpportunity {
  type: 'simple';
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  estimatedProfit: number;
}

export interface TriangularArbitrageOpportunity {
  type: 'triangular';
  path: string[];
  prices: number[];
  profitPercent: number;
  estimatedProfit: number;
}

export type ArbitrageOpportunity = SimpleArbitrageOpportunity | TriangularArbitrageOpportunity;

export interface ExecutionStep {
  action: 'buy' | 'sell';
  symbol: string;
  exchange: string;
  price: number;
  quantity: number;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  totalFees: number;
  netProfit: number;
  risk: number;
  executionTime: number;
}

export interface FeeStructure {
  makerFee: number;
  takerFee: number;
  withdrawalFee: number;
  depositFee: number;
  gasFee: number;
}

export interface FeasibilityResult {
  feasible: boolean;
  reasons: string[];
  requiredCapital: number;
}

export interface LiquidityInfo {
  symbol: string;
  exchange: string;
  bidDepth: number;
  askDepth: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FEE_STRUCTURE: FeeStructure = {
  makerFee: 0.001, // 0.1%
  takerFee: 0.002, // 0.2%
  withdrawalFee: 0.0005, // 0.05%
  depositFee: 0.0001, // 0.01%
  gasFee: 0.0002, // 0.02%
};

const DEFAULT_EXECUTION_TIME = 5000; // 5 seconds in milliseconds
const MIN_LIQUIDITY_RATIO = 0.1; // Minimum liquidity as ratio of order size
const MAX_RISK_SCORE = 100;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find all possible triangular arbitrage paths from a list of symbols
 * @param symbols - Array of trading pair symbols (e.g., ['BTC/USDT', 'ETH/USDT', 'ETH/BTC'])
 * @returns Array of triangular paths
 */
export function findTriangularPaths(symbols: string[]): string[][] {
  const paths: string[][] = [];
  const symbolSet = new Set(symbols);
  
  // Parse symbols into base/quote pairs
  const pairs = symbols.map(s => {
    const [base, quote] = s.split('/');
    return { symbol: s, base, quote };
  });

  // Find triangular paths
  for (const pair1 of pairs) {
    for (const pair2 of pairs) {
      if (pair1.symbol === pair2.symbol) continue;
      
      // Check if pair1.quote === pair2.base (can chain them)
      if (pair1.quote === pair2.base) {
        for (const pair3 of pairs) {
          if (pair3.symbol === pair1.symbol || pair3.symbol === pair2.symbol) continue;
          
          // Check if pair2.quote === pair3.base and pair3.quote === pair1.base (completes the cycle)
          if (pair2.quote === pair3.base && pair3.quote === pair1.base) {
            paths.push([pair1.symbol, pair2.symbol, pair3.symbol]);
          }
        }
      }
    }
  }

  return paths;
}

/**
 * Calculate profit for a triangular arbitrage path
 * @param path - Array of symbols forming the triangular path
 * @param prices - Map of symbol to price
 * @returns Profit percentage
 */
export function calculateTriangularProfit(path: string[], prices: Map<string, number>): number {
  if (path.length !== 3) {
    throw new Error('Triangular path must have exactly 3 legs');
  }

  let amount = 1.0;

  for (let i = 0; i < path.length; i++) {
    const symbol = path[i];
    const price = prices.get(symbol);

    if (!price) {
      return 0;
    }

    // Determine if we're buying or selling based on position in path
    if (i === 0) {
      // First leg: buy
      amount = amount / price;
    } else if (i === 1) {
      // Second leg: buy
      amount = amount / price;
    } else {
      // Third leg: sell (back to original)
      amount = amount * price;
    }
  }

  // Calculate profit percentage
  const profitPercent = (amount - 1.0) * 100;
  return profitPercent;
}

/**
 * Optimize order size based on opportunity and available liquidity
 * @param opportunity - Arbitrage opportunity
 * @param liquidity - Liquidity information
 * @returns Optimized order size
 */
export function optimizeOrderSize(
  opportunity: ArbitrageOpportunity,
  liquidity: LiquidityInfo[]
): number {
  // Start with a base order size
  let optimalSize = 10000; // $10,000 USD equivalent

  if (opportunity.type === 'simple') {
    // Find liquidity for buy and sell exchanges
    const buyLiquidity = liquidity.find(
      l => l.exchange === opportunity.buyExchange && l.symbol === opportunity.symbol
    );
    const sellLiquidity = liquidity.find(
      l => l.exchange === opportunity.sellExchange && l.symbol === opportunity.symbol
    );

    if (buyLiquidity && sellLiquidity) {
      // Limit order size to available liquidity
      const maxBuySize = buyLiquidity.askDepth * MIN_LIQUIDITY_RATIO;
      const maxSellSize = sellLiquidity.bidDepth * MIN_LIQUIDITY_RATIO;
      optimalSize = Math.min(optimalSize, maxBuySize, maxSellSize);
    }
  } else {
    // For triangular arbitrage, use minimum liquidity across all legs
    const minLiquidity = liquidity.reduce((min, l) => {
      const avgDepth = (l.bidDepth + l.askDepth) / 2;
      return Math.min(min, avgDepth * MIN_LIQUIDITY_RATIO);
    }, optimalSize);
    
    optimalSize = minLiquidity;
  }

  return Math.max(optimalSize, 100); // Minimum $100
}

/**
 * Calculate risk score for an arbitrage opportunity
 * @param opportunity - Arbitrage opportunity
 * @param executionTime - Estimated execution time in milliseconds
 * @returns Risk score (0-100, higher is riskier)
 */
function calculateRiskScore(opportunity: ArbitrageOpportunity, executionTime: number): number {
  let riskScore = 0;

  // Time risk: longer execution = higher risk
  const timeRisk = Math.min((executionTime / 10000) * 30, 30); // Max 30 points
  riskScore += timeRisk;

  // Profit margin risk: lower margin = higher risk
  const marginRisk = Math.max(30 - (opportunity.profitPercent * 2), 0); // Max 30 points
  riskScore += marginRisk;

  // Complexity risk
  if (opportunity.type === 'triangular') {
    riskScore += 20; // Triangular is inherently riskier
  } else {
    riskScore += 10; // Simple arbitrage has some risk
  }

  // Market volatility risk (simplified)
  riskScore += 10;

  return Math.min(riskScore, MAX_RISK_SCORE);
}

// ============================================================================
// Main Export Functions
// ============================================================================

/**
 * Detect simple arbitrage opportunities between exchanges
 * @param pricesMap - Map where key is 'exchange-symbol' and value is price
 * @param minProfitPercent - Minimum profit threshold percentage
 * @returns Array of simple arbitrage opportunities
 */
export function detectSimpleArbitrage(
  pricesMap: Map<string, number>,
  minProfitPercent: number = 0.5
): SimpleArbitrageOpportunity[] {
  const opportunities: SimpleArbitrageOpportunity[] = [];
  const symbolPrices = new Map<string, Map<string, number>>();

  // Group prices by symbol
  for (const [key, price] of pricesMap.entries()) {
    const parts = key.split('-');
    if (parts.length !== 2) continue;

    const [exchange, symbol] = parts;
    
    if (!symbolPrices.has(symbol)) {
      symbolPrices.set(symbol, new Map());
    }
    
    symbolPrices.get(symbol)!.set(exchange, price);
  }

  // Find arbitrage opportunities for each symbol
  for (const [symbol, exchangePrices] of symbolPrices.entries()) {
    const exchanges = Array.from(exchangePrices.keys());
    
    // Compare all exchange pairs
    for (let i = 0; i < exchanges.length; i++) {
      for (let j = i + 1; j < exchanges.length; j++) {
        const exchange1 = exchanges[i];
        const exchange2 = exchanges[j];
        const price1 = exchangePrices.get(exchange1)!;
        const price2 = exchangePrices.get(exchange2)!;

        // Calculate profit percentage
        const profitPercent1 = ((price2 - price1) / price1) * 100;
        const profitPercent2 = ((price1 - price2) / price2) * 100;

        // Check if opportunity exists (buy on exchange1, sell on exchange2)
        if (profitPercent1 >= minProfitPercent) {
          opportunities.push({
            type: 'simple',
            symbol,
            buyExchange: exchange1,
            sellExchange: exchange2,
            buyPrice: price1,
            sellPrice: price2,
            profitPercent: profitPercent1,
            estimatedProfit: profitPercent1 * 100, // Assuming $10,000 base
          });
        }

        // Check reverse opportunity
        if (profitPercent2 >= minProfitPercent) {
          opportunities.push({
            type: 'simple',
            symbol,
            buyExchange: exchange2,
            sellExchange: exchange1,
            buyPrice: price2,
            sellPrice: price1,
            profitPercent: profitPercent2,
            estimatedProfit: profitPercent2 * 100,
          });
        }
      }
    }
  }

  // Sort by profit percentage (descending)
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Detect triangular arbitrage opportunities on a single exchange
 * @param exchangePrices - Map of symbol to price on the exchange
 * @param minProfitPercent - Minimum profit threshold percentage
 * @returns Array of triangular arbitrage opportunities
 */
export function detectTriangularArbitrage(
  exchangePrices: Map<string, number>,
  minProfitPercent: number = 0.3
): TriangularArbitrageOpportunity[] {
  const opportunities: TriangularArbitrageOpportunity[] = [];
  const symbols = Array.from(exchangePrices.keys());

  // Find all possible triangular paths
  const paths = findTriangularPaths(symbols);

  // Calculate profit for each path
  for (const path of paths) {
    const profitPercent = calculateTriangularProfit(path, exchangePrices);

    if (profitPercent >= minProfitPercent) {
      const prices = path.map(symbol => exchangePrices.get(symbol) || 0);
      
      opportunities.push({
        type: 'triangular',
        path,
        prices,
        profitPercent,
        estimatedProfit: profitPercent * 100, // Assuming $10,000 base
      });
    }
  }

  // Sort by profit percentage (descending)
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Calculate execution plan for an arbitrage opportunity
 * @param opportunity - Simple or triangular arbitrage opportunity
 * @returns Execution plan with steps, fees, and risk assessment
 */
export function calculateArbitragePath(
  opportunity: ArbitrageOpportunity
): ExecutionPlan {
  const steps: ExecutionStep[] = [];
  const baseAmount = 10000; // $10,000 base amount
  
  if (opportunity.type === 'simple') {
    // Step 1: Buy on cheaper exchange
    steps.push({
      action: 'buy',
      symbol: opportunity.symbol,
      exchange: opportunity.buyExchange,
      price: opportunity.buyPrice,
      quantity: baseAmount / opportunity.buyPrice,
    });

    // Step 2: Transfer (implicit - included in fees)
    
    // Step 3: Sell on expensive exchange
    steps.push({
      action: 'sell',
      symbol: opportunity.symbol,
      exchange: opportunity.sellExchange,
      price: opportunity.sellPrice,
      quantity: baseAmount / opportunity.buyPrice,
    });
  } else {
    // Triangular arbitrage
    let currentAmount = baseAmount;
    
    for (let i = 0; i < opportunity.path.length; i++) {
      const symbol = opportunity.path[i];
      const price = opportunity.prices[i];
      
      if (i === 0 || i === 1) {
        // First two legs: buying
        steps.push({
          action: 'buy',
          symbol,
          exchange: 'exchange', // Same exchange for triangular
          price,
          quantity: currentAmount / price,
        });
        currentAmount = currentAmount / price;
      } else {
        // Last leg: selling back to original currency
        steps.push({
          action: 'sell',
          symbol,
          exchange: 'exchange',
          price,
          quantity: currentAmount,
        });
        currentAmount = currentAmount * price;
      }
    }
  }

  // Calculate total fees
  const totalFees = estimateArbitrageFees(opportunity, DEFAULT_FEE_STRUCTURE);
  
  // Calculate net profit
  const grossProfit = opportunity.estimatedProfit;
  const netProfit = grossProfit - totalFees;

  // Calculate risk score
  const executionTime = opportunity.type === 'simple' 
    ? DEFAULT_EXECUTION_TIME * 2 // Transfer time for simple arbitrage
    : DEFAULT_EXECUTION_TIME; // Same exchange for triangular
  
  const risk = calculateRiskScore(opportunity, executionTime);

  return {
    steps,
    totalFees,
    netProfit,
    risk,
    executionTime,
  };
}

/**
 * Estimate total fees for executing an arbitrage opportunity
 * @param opportunity - Arbitrage opportunity
 * @param feeStructure - Fee structure to use
 * @returns Total estimated fees in base currency
 */
export function estimateArbitrageFees(
  opportunity: ArbitrageOpportunity,
  feeStructure: FeeStructure = DEFAULT_FEE_STRUCTURE
): number {
  let totalFees = 0;
  const baseAmount = 10000;

  if (opportunity.type === 'simple') {
    // Buy trade fee (taker)
    totalFees += baseAmount * feeStructure.takerFee;
    
    // Withdrawal fee
    totalFees += baseAmount * feeStructure.withdrawalFee;
    
    // Deposit fee
    totalFees += baseAmount * feeStructure.depositFee;
    
    // Gas fee (for blockchain transfer)
    totalFees += baseAmount * feeStructure.gasFee;
    
    // Sell trade fee (taker)
    totalFees += baseAmount * feeStructure.takerFee;
  } else {
    // Triangular arbitrage (all on same exchange)
    // Three trades, assume maker fees for at least one
    totalFees += baseAmount * feeStructure.takerFee; // First trade
    totalFees += baseAmount * feeStructure.makerFee; // Second trade
    totalFees += baseAmount * feeStructure.takerFee; // Third trade
  }

  return totalFees;
}

/**
 * Check if an arbitrage opportunity is feasible to execute
 * @param opportunity - Arbitrage opportunity
 * @param capitalAvailable - Available capital in USD
 * @returns Feasibility result with reasons and required capital
 */
export function checkArbitrageFeasibility(
  opportunity: ArbitrageOpportunity,
  capitalAvailable: number
): FeasibilityResult {
  const reasons: string[] = [];
  const baseAmount = 10000;
  let requiredCapital = baseAmount;

  // Check minimum capital requirement
  if (capitalAvailable < baseAmount) {
    reasons.push(`Insufficient capital. Required: $${baseAmount}, Available: $${capitalAvailable}`);
  }

  // Check profit after fees
  const fees = estimateArbitrageFees(opportunity, DEFAULT_FEE_STRUCTURE);
  const netProfit = opportunity.estimatedProfit - fees;
  
  if (netProfit <= 0) {
    reasons.push('Net profit is negative after fees');
  }

  // Check execution risk
  const plan = calculateArbitragePath(opportunity);
  if (plan.risk > 70) {
    reasons.push(`High execution risk: ${plan.risk.toFixed(0)}/100`);
  }

  // Type-specific checks
  if (opportunity.type === 'simple') {
    // Check exchange limits (mock values)
    const maxOrderSize = 50000; // $50,000 max per exchange
    if (baseAmount > maxOrderSize) {
      reasons.push(`Order size exceeds exchange limit: $${maxOrderSize}`);
    }

    // Check withdrawal limits
    const dailyWithdrawalLimit = 100000;
    if (baseAmount > dailyWithdrawalLimit) {
      reasons.push(`Withdrawal amount exceeds daily limit: $${dailyWithdrawalLimit}`);
    }

    // Account for transfer time risk
    if (plan.executionTime > 30000) { // 30 seconds
      reasons.push('Execution time too long, price may change');
    }
  } else {
    // Triangular arbitrage checks
    // Check if all pairs have sufficient liquidity (mock)
    const minLiquidity = 100000;
    if (baseAmount > minLiquidity * 0.1) {
      reasons.push('Order size may impact market price due to low liquidity');
    }
  }

  // Calculate required capital including buffer for fees and slippage
  const slippageBuffer = 1.02; // 2% buffer
  requiredCapital = baseAmount * slippageBuffer;

  const feasible = reasons.length === 0;

  return {
    feasible,
    reasons,
    requiredCapital,
  };
}