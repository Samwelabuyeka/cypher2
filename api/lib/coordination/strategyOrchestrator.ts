import { api } from "gadget-server";

/**
 * Signal from an individual strategy
 */
export interface Signal {
  strategyName: string;
  symbol: string;
  side: "buy" | "sell";
  confidence: number; // 0-1
  expectedReturn: number; // percentage
  weight: number; // strategy weight
  reasoning: string;
  timeframe: string;
  metadata?: Record<string, any>;
}

/**
 * Trading opportunity identified by multiple strategies
 */
export interface Opportunity {
  symbol: string;
  side: "buy" | "sell";
  signals: Signal[];
  consensusScore: number; // 0-1
  metaScore: number; // 0-100
  expectedReturn: number;
  riskScore: number;
  recommendedSize: number;
  metadata: {
    mathFrameworkScore?: number;
    factorLoading?: number;
    mlConfidence?: number;
    rlQValue?: number;
    technicalConfluence?: number;
    sentimentAlignment?: number;
    quantumWeight?: number;
    microstructureFavorability?: number;
  };
}

/**
 * Result from executing a strategy
 */
export interface StrategyResult {
  strategyName: string;
  signals: Signal[];
  executionTime: number;
  success: boolean;
  error?: string;
  metrics?: {
    opportunitiesFound: number;
    averageConfidence: number;
    totalExpectedReturn: number;
  };
}

/**
 * Validated trade ready for execution
 */
export interface ValidatedTrade {
  approved: boolean;
  opportunity: Opportunity;
  adjustedSize: number;
  rejectionReason?: string;
  riskMetrics: {
    var95: number;
    positionRisk: number;
    liquidityScore: number;
    portfolioImpact: number;
  };
}

/**
 * Performance attribution by strategy
 */
export interface PerformanceAttribution {
  strategyName: string;
  trades: number;
  totalPnL: number;
  winRate: number;
  sharpeRatio: number;
  averageReturn: number;
  contribution: number; // percentage of total portfolio PnL
  consistency: number; // 0-1 score
  metadata?: Record<string, any>;
}

/**
 * Coordinates all trading strategies and aggregates their signals
 */
export async function coordinateStrategies(): Promise<{
  opportunities: Opportunity[];
  results: StrategyResult[];
  executionSummary: {
    totalStrategies: number;
    successfulStrategies: number;
    totalSignals: number;
    topOpportunities: number;
  };
}> {
  const results: StrategyResult[] = [];
  const startTime = Date.now();

  // Execute all strategy actions in parallel
  const strategyPromises = [
    executeStrategy("arbitrage", async () => {
      const result = await api.detectArbitrageOpportunities();
      return result;
    }),
    executeStrategy("marketAnalysis", async () => {
      const result = await api.analyzeMarket({ symbols: ["BTC/USD", "ETH/USD"] });
      return result;
    }),
    executeStrategy("quantumOptimization", async () => {
      const result = await api.optimizePortfolioWithQuantum();
      return result;
    }),
    executeStrategy("highFrequency", async () => {
      const result = await api.executeHighFrequencyTrades();
      return result;
    }),
    executeStrategy("multiCurrency", async () => {
      const result = await api.executeMultiCurrencyStrategy();
      return result;
    }),
    executeStrategy("yieldOptimization", async () => {
      const result = await api.optimizeYieldFarming();
      return result;
    }),
  ];

  // Wait for all strategies to complete
  const strategyResults = await Promise.allSettled(strategyPromises);

  // Process results
  for (const result of strategyResults) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      results.push({
        strategyName: "unknown",
        signals: [],
        executionTime: 0,
        success: false,
        error: result.reason?.message || "Unknown error",
      });
    }
  }

  // Aggregate all signals
  const allSignals: Signal[] = results.flatMap((r) => r.signals || []);

  // Combine signals into opportunities
  const opportunities = combineSignals(allSignals);

  // Calculate meta scores for each opportunity
  opportunities.forEach((opp) => {
    opp.metaScore = calculateMetaScore(opp);
  });

  // Sort by meta score
  opportunities.sort((a, b) => b.metaScore - a.metaScore);

  const executionSummary = {
    totalStrategies: results.length,
    successfulStrategies: results.filter((r) => r.success).length,
    totalSignals: allSignals.length,
    topOpportunities: opportunities.slice(0, 10).length,
  };

  return {
    opportunities,
    results,
    executionSummary,
  };
}

/**
 * Helper to execute a strategy with error handling
 */
async function executeStrategy(
  strategyName: string,
  executor: () => Promise<any>
): Promise<StrategyResult> {
  const startTime = Date.now();
  try {
    const result = await executor();
    const signals = extractSignalsFromResult(strategyName, result);

    return {
      strategyName,
      signals,
      executionTime: Date.now() - startTime,
      success: true,
      metrics: {
        opportunitiesFound: signals.length,
        averageConfidence: signals.reduce((sum, s) => sum + s.confidence, 0) / (signals.length || 1),
        totalExpectedReturn: signals.reduce((sum, s) => sum + s.expectedReturn, 0),
      },
    };
  } catch (error: any) {
    return {
      strategyName,
      signals: [],
      executionTime: Date.now() - startTime,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Extract signals from strategy result
 */
function extractSignalsFromResult(strategyName: string, result: any): Signal[] {
  const signals: Signal[] = [];

  // Handle different result formats
  if (Array.isArray(result?.opportunities)) {
    for (const opp of result.opportunities) {
      signals.push({
        strategyName,
        symbol: opp.symbol || "UNKNOWN",
        side: opp.side || "buy",
        confidence: opp.confidence || 0.5,
        expectedReturn: opp.expectedReturn || 0,
        weight: 1.0,
        reasoning: opp.reasoning || `Signal from ${strategyName}`,
        timeframe: opp.timeframe || "1h",
        metadata: opp,
      });
    }
  } else if (result?.signal) {
    signals.push({
      strategyName,
      symbol: result.symbol || "UNKNOWN",
      side: result.signal,
      confidence: result.confidence || 0.5,
      expectedReturn: result.expectedReturn || 0,
      weight: 1.0,
      reasoning: result.reasoning || `Signal from ${strategyName}`,
      timeframe: result.timeframe || "1h",
      metadata: result,
    });
  }

  return signals;
}

/**
 * Combines signals from multiple strategies using weighted voting
 */
export function combineSignals(signals: Signal[]): Opportunity[] {
  // Group signals by symbol
  const symbolGroups = new Map<string, Signal[]>();

  for (const signal of signals) {
    const existing = symbolGroups.get(signal.symbol) || [];
    existing.push(signal);
    symbolGroups.set(signal.symbol, existing);
  }

  const opportunities: Opportunity[] = [];

  // Process each symbol
  for (const [symbol, symbolSignals] of symbolGroups.entries()) {
    // Group by side
    const buySignals = symbolSignals.filter((s) => s.side === "buy");
    const sellSignals = symbolSignals.filter((s) => s.side === "sell");

    // Process buy opportunities
    if (buySignals.length > 0) {
      const buyOpp = createOpportunity(symbol, "buy", buySignals, symbolSignals);
      if (buyOpp.consensusScore > 0.3) {
        opportunities.push(buyOpp);
      }
    }

    // Process sell opportunities
    if (sellSignals.length > 0) {
      const sellOpp = createOpportunity(symbol, "sell", sellSignals, symbolSignals);
      if (sellOpp.consensusScore > 0.3) {
        opportunities.push(sellOpp);
      }
    }
  }

  return opportunities;
}

/**
 * Create an opportunity from signals
 */
function createOpportunity(
  symbol: string,
  side: "buy" | "sell",
  sideSignals: Signal[],
  allSignals: Signal[]
): Opportunity {
  // Calculate weighted consensus
  const totalWeight = sideSignals.reduce((sum, s) => sum + s.weight * s.confidence, 0);
  const maxWeight = sideSignals.reduce((sum, s) => sum + s.weight, 0);
  const consensusScore = maxWeight > 0 ? totalWeight / maxWeight : 0;

  // Calculate expected return
  const expectedReturn =
    sideSignals.reduce((sum, s) => sum + s.expectedReturn * s.confidence, 0) /
    (sideSignals.reduce((sum, s) => sum + s.confidence, 0) || 1);

  // Calculate risk score based on disagreement
  const disagreementPenalty = (allSignals.length - sideSignals.length) / allSignals.length;
  const riskScore = Math.max(0, 1 - consensusScore + disagreementPenalty * 0.3);

  // Recommended size based on consensus
  const recommendedSize = consensusScore * 100; // base percentage

  return {
    symbol,
    side,
    signals: sideSignals,
    consensusScore,
    metaScore: 0, // Will be calculated later
    expectedReturn,
    riskScore,
    recommendedSize,
    metadata: {},
  };
}

/**
 * Calculates a comprehensive meta score combining all factors
 */
export function calculateMetaScore(opportunity: Opportunity): number {
  const weights = {
    consensus: 0.20,
    expectedReturn: 0.15,
    mathFramework: 0.10,
    factorLoading: 0.10,
    mlConfidence: 0.10,
    rlQValue: 0.08,
    technicalConfluence: 0.10,
    sentimentAlignment: 0.07,
    quantumWeight: 0.05,
    microstructure: 0.05,
  };

  // Normalize consensus score (0-1 to 0-100)
  const consensusContribution = opportunity.consensusScore * 100 * weights.consensus;

  // Normalize expected return (assume -10% to +10% range to 0-100)
  const returnNormalized = Math.max(0, Math.min(100, (opportunity.expectedReturn + 10) * 5));
  const returnContribution = returnNormalized * weights.expectedReturn;

  // Get metadata scores (default to 50 if not present)
  const mathScore = (opportunity.metadata.mathFrameworkScore || 50) * weights.mathFramework;
  const factorScore = (opportunity.metadata.factorLoading || 50) * weights.factorLoading;
  const mlScore = (opportunity.metadata.mlConfidence || 50) * weights.mlConfidence;
  const rlScore = (opportunity.metadata.rlQValue || 50) * weights.rlQValue;
  const technicalScore = (opportunity.metadata.technicalConfluence || 50) * weights.technicalConfluence;
  const sentimentScore = (opportunity.metadata.sentimentAlignment || 50) * weights.sentimentAlignment;
  const quantumScore = (opportunity.metadata.quantumWeight || 50) * weights.quantumWeight;
  const microScore = (opportunity.metadata.microstructureFavorability || 50) * weights.microstructure;

  // Calculate total meta score
  const metaScore =
    consensusContribution +
    returnContribution +
    mathScore +
    factorScore +
    mlScore +
    rlScore +
    technicalScore +
    sentimentScore +
    quantumScore +
    microScore;

  // Apply risk penalty
  const riskPenalty = opportunity.riskScore * 10; // max 10 point penalty
  const finalScore = Math.max(0, Math.min(100, metaScore - riskPenalty));

  return Math.round(finalScore * 100) / 100;
}

/**
 * Validates a trade opportunity against risk limits
 */
export function validateTradeOpportunity(opportunity: Opportunity): ValidatedTrade {
  const maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS_USD || "1000");
  const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE_USD || "100");

  // Calculate risk metrics
  const var95 = calculateVar95(opportunity);
  const positionRisk = opportunity.recommendedSize * opportunity.riskScore;
  const liquidityScore = estimateLiquidity(opportunity.symbol);
  const portfolioImpact = estimatePortfolioImpact(opportunity.recommendedSize);

  const riskMetrics = {
    var95,
    positionRisk,
    liquidityScore,
    portfolioImpact,
  };

  // Check if VaR exceeds daily loss limit
  if (var95 > maxDailyLoss) {
    return {
      approved: false,
      opportunity,
      adjustedSize: 0,
      rejectionReason: `VaR (${var95}) exceeds max daily loss limit (${maxDailyLoss})`,
      riskMetrics,
    };
  }

  // Check if trade size is within limits
  if (opportunity.recommendedSize > maxTradeSize) {
    // Adjust size to max
    return {
      approved: true,
      opportunity,
      adjustedSize: maxTradeSize,
      riskMetrics,
    };
  }

  // Check liquidity
  if (liquidityScore < 0.3) {
    return {
      approved: false,
      opportunity,
      adjustedSize: 0,
      rejectionReason: "Insufficient liquidity",
      riskMetrics,
    };
  }

  // Check portfolio impact
  if (portfolioImpact > 0.2) {
    // Reduce size to limit impact
    const adjustedSize = opportunity.recommendedSize * 0.5;
    return {
      approved: true,
      opportunity,
      adjustedSize,
      riskMetrics,
    };
  }

  // Check consensus threshold
  if (opportunity.consensusScore < 0.5) {
    return {
      approved: false,
      opportunity,
      adjustedSize: 0,
      rejectionReason: "Consensus score too low",
      riskMetrics,
    };
  }

  // All checks passed
  return {
    approved: true,
    opportunity,
    adjustedSize: opportunity.recommendedSize,
    riskMetrics,
  };
}

/**
 * Calculate 95% Value at Risk
 */
function calculateVar95(opportunity: Opportunity): number {
  // Simplified VaR calculation
  // VaR = Position Size × Volatility × Z-score (1.645 for 95%)
  const volatility = opportunity.riskScore * 0.02; // Assume 2% base volatility scaled by risk
  const zScore = 1.645;
  return opportunity.recommendedSize * volatility * zScore;
}

/**
 * Estimate liquidity for a symbol
 */
function estimateLiquidity(symbol: string): number {
  // Simplified liquidity estimation
  // In production, this would query actual order book depth
  const majorPairs = ["BTC/USD", "ETH/USD", "BTC/USDT", "ETH/USDT"];
  if (majorPairs.includes(symbol)) {
    return 0.9;
  }
  return 0.5;
}

/**
 * Estimate impact on portfolio
 */
function estimatePortfolioImpact(tradeSize: number): number {
  // Simplified portfolio impact
  // In production, this would calculate actual portfolio value
  const estimatedPortfolioValue = 10000; // $10k
  return tradeSize / estimatedPortfolioValue;
}

/**
 * Attributes performance to each strategy component
 */
export function attributePerformance(trades: any[]): PerformanceAttribution[] {
  // Group trades by strategy
  const strategyGroups = new Map<string, any[]>();

  for (const trade of trades) {
    const strategyName = trade.strategy?.name || trade.metadata?.strategyName || "unknown";
    const existing = strategyGroups.get(strategyName) || [];
    existing.push(trade);
    strategyGroups.set(strategyName, existing);
  }

  const attributions: PerformanceAttribution[] = [];
  const totalPnL = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  for (const [strategyName, strategyTrades] of strategyGroups.entries()) {
    const strategyPnL = strategyTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const winningTrades = strategyTrades.filter((t) => (t.realizedPnL || 0) > 0);
    const winRate = strategyTrades.length > 0 ? winningTrades.length / strategyTrades.length : 0;

    // Calculate returns for Sharpe ratio
    const returns = strategyTrades.map((t) => (t.realizedPnL || 0) / (t.value || 1));
    const averageReturn = returns.reduce((sum, r) => sum + r, 0) / (returns.length || 1);
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - averageReturn, 2), 0) / (returns.length || 1);
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? averageReturn / stdDev : 0;

    // Calculate consistency (how often returns are positive)
    const positiveReturns = returns.filter((r) => r > 0).length;
    const consistency = returns.length > 0 ? positiveReturns / returns.length : 0;

    attributions.push({
      strategyName,
      trades: strategyTrades.length,
      totalPnL: strategyPnL,
      winRate,
      sharpeRatio,
      averageReturn,
      contribution: totalPnL !== 0 ? (strategyPnL / totalPnL) * 100 : 0,
      consistency,
      metadata: {
        winningTrades: winningTrades.length,
        losingTrades: strategyTrades.length - winningTrades.length,
      },
    });
  }

  // Sort by contribution
  attributions.sort((a, b) => b.contribution - a.contribution);

  return attributions;
}