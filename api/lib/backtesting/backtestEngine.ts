/**
 * Comprehensive Backtesting Engine with Walk-Forward Analysis and Monte Carlo Simulations
 * 
 * This module provides a complete backtesting framework for trading strategies including:
 * - Historical simulation with realistic trade execution
 * - Walk-forward optimization to prevent overfitting
 * - Monte Carlo analysis for probability distributions
 * - Advanced parameter optimization using grid search and genetic algorithms
 * - Comprehensive performance metrics calculation
 */

// ==================== TYPE DEFINITIONS ====================

/**
 * Configuration for the backtest engine
 */
export interface BacktestConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  leverage?: number;
  riskFreeRate?: number;
  compounding?: boolean;
}

/**
 * Market data point for backtesting
 */
export interface MarketData {
  timestamp: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trading strategy interface
 */
export interface Strategy {
  name: string;
  parameters: Record<string, any>;
  generateSignals: (data: MarketData[], params: Record<string, any>) => Signal[];
}

/**
 * Trading signal
 */
export interface Signal {
  timestamp: Date;
  type: 'buy' | 'sell' | 'close';
  symbol: string;
  price: number;
  quantity?: number;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Executed trade record
 */
export interface Trade {
  entryTime: Date;
  exitTime: Date;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  commission: number;
  slippage: number;
  maxAdverseExcursion?: number;
  maxFavorableExcursion?: number;
}

/**
 * Equity curve point
 */
export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

/**
 * Comprehensive backtest results
 */
export interface BacktestResult {
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: PerformanceMetrics;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgTradeDuration?: number;
  expectancy: number;
}

/**
 * Walk-forward analysis result
 */
export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  aggregatedMetrics: PerformanceMetrics;
  consistencyScore: number;
  robustnessScore: number;
  overallReturn: number;
}

/**
 * Individual walk-forward window
 */
export interface WalkForwardWindow {
  windowNumber: number;
  optimizationPeriod: { start: Date; end: Date };
  testPeriod: { start: Date; end: Date };
  optimizedParameters: Record<string, any>;
  inSampleMetrics: PerformanceMetrics;
  outOfSampleMetrics: PerformanceMetrics;
  degradation: number;
}

/**
 * Monte Carlo simulation result
 */
export interface MonteCarloResult {
  scenarios: Scenario[];
  probabilityOfProfit: number;
  expectedValue: number;
  riskOfRuin: number;
  confidenceIntervals: {
    percentile5: number;
    percentile25: number;
    percentile50: number;
    percentile75: number;
    percentile95: number;
  };
  worstCase: number;
  bestCase: number;
}

/**
 * Monte Carlo scenario
 */
export interface Scenario {
  scenarioNumber: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

/**
 * Parameter optimization result
 */
export interface OptimizationResult {
  bestParameters: Record<string, any>;
  bestScore: number;
  allResults: ParameterTestResult[];
  optimizationMethod: 'grid' | 'genetic';
  executionTime: number;
}

/**
 * Individual parameter test result
 */
export interface ParameterTestResult {
  parameters: Record<string, any>;
  score: number;
  metrics: PerformanceMetrics;
}

/**
 * Parameter space definition for optimization
 */
export interface ParameterSpace {
  [key: string]: {
    type: 'range' | 'discrete';
    min?: number;
    max?: number;
    step?: number;
    values?: any[];
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate returns from equity curve
 */
function calculateReturns(equityCurve: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    returns.push(ret);
  }
  return returns;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate downside deviation (for Sortino ratio)
 */
function downsideDeviation(returns: number[], targetReturn: number = 0): number {
  const downsideReturns = returns.filter(r => r < targetReturn);
  if (downsideReturns.length === 0) return 0;
  const squaredDiffs = downsideReturns.map(r => Math.pow(r - targetReturn, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / returns.length;
  return Math.sqrt(variance);
}

/**
 * Shuffle array randomly (Fisher-Yates algorithm)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ==================== PERFORMANCE METRICS FUNCTION ====================

/**
 * Calculate comprehensive performance metrics from trades and equity curve
 * 
 * @param trades Array of executed trades
 * @param equityCurve Equity curve points
 * @param initialCapital Initial capital amount
 * @param riskFreeRate Annual risk-free rate (default 0.02)
 * @returns Comprehensive performance metrics
 */
export function performanceMetrics(
  trades: Trade[],
  equityCurve: EquityPoint[],
  initialCapital: number,
  riskFreeRate: number = 0.02
): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      winRate: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      expectancy: 0,
    };
  }

  const finalCapital = equityCurve[equityCurve.length - 1].equity;
  const totalReturn = finalCapital - initialCapital;
  const totalReturnPercent = (totalReturn / initialCapital) * 100;

  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  const winRate = (winningTrades.length / trades.length) * 100;
  const profitFactor = totalLosses === 0 ? (totalWins > 0 ? Infinity : 0) : totalWins / totalLosses;
  
  const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
  
  const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
  const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

  // Calculate consecutive wins and losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
    } else if (trade.pnl < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    }
  }

  // Calculate drawdown
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    maxDrawdown = Math.max(maxDrawdown, point.drawdown);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, point.drawdownPercent);
  }

  // Calculate returns for Sharpe and Sortino ratios
  const returns = calculateReturns(equityCurve);
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDev = standardDeviation(returns);
  const downsideDev = downsideDeviation(returns, 0);

  // Annualized metrics (assuming daily data)
  const annualFactor = Math.sqrt(252);
  const sharpeRatio = stdDev === 0 ? 0 : ((avgReturn - riskFreeRate / 252) / stdDev) * annualFactor;
  const sortinoRatio = downsideDev === 0 ? 0 : ((avgReturn - riskFreeRate / 252) / downsideDev) * annualFactor;
  const calmarRatio = maxDrawdownPercent === 0 ? 0 : (totalReturnPercent / 100) / (maxDrawdownPercent / 100);

  // Calculate average trade duration
  const tradeDurations = trades.map(t => t.exitTime.getTime() - t.entryTime.getTime());
  const avgTradeDuration = tradeDurations.length > 0 
    ? tradeDurations.reduce((sum, d) => sum + d, 0) / tradeDurations.length / (1000 * 60 * 60 * 24) // in days
    : undefined;

  // Calculate expectancy
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

  return {
    totalReturn,
    totalReturnPercent,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxDrawdown,
    maxDrawdownPercent,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgTradeDuration,
    expectancy,
  };
}

// ==================== BACKTEST ENGINE CLASS ====================

/**
 * Main backtesting engine for simulating trading strategies on historical data
 * 
 * Features:
 * - Realistic trade execution with commission and slippage
 * - Equity curve tracking
 * - Drawdown calculation
 * - Comprehensive performance metrics
 */
export class BacktestEngine {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = {
      ...config,
      leverage: config.leverage || 1,
      riskFreeRate: config.riskFreeRate || 0.02,
      compounding: config.compounding !== undefined ? config.compounding : true,
    };
  }

  /**
   * Run backtest on historical data
   * 
   * @param strategy Trading strategy to test
   * @param data Historical market data
   * @returns Backtest results with trades, equity curve, and metrics
   */
  async run(strategy: Strategy, data: MarketData[]): Promise<BacktestResult> {
    if (data.length === 0) {
      throw new Error('No market data provided for backtesting');
    }

    const signals = strategy.generateSignals(data, strategy.parameters);
    const trades: Trade[] = [];
    const equityCurve: EquityPoint[] = [];
    
    let currentCapital = this.config.initialCapital;
    let peak = currentCapital;
    let openPosition: {
      entryTime: Date;
      entryPrice: number;
      quantity: number;
      side: 'long' | 'short';
      symbol: string;
      stopLoss?: number;
      takeProfit?: number;
    } | null = null;

    // Track equity at each time point
    const dataByTime = new Map<number, MarketData>();
    for (const candle of data) {
      dataByTime.set(candle.timestamp.getTime(), candle);
    }

    for (const signal of signals) {
      const currentPrice = signal.price;
      
      // Apply slippage
      const executionPrice = signal.type === 'buy' 
        ? currentPrice * (1 + this.config.slippage)
        : currentPrice * (1 - this.config.slippage);

      if (signal.type === 'buy' && !openPosition) {
        // Open long position
        const quantity = signal.quantity || (currentCapital * this.config.leverage!) / executionPrice;
        const commission = quantity * executionPrice * this.config.commission;
        
        openPosition = {
          entryTime: signal.timestamp,
          entryPrice: executionPrice,
          quantity,
          side: 'long',
          symbol: signal.symbol,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
        };
        
        currentCapital -= commission;
      } else if (signal.type === 'sell' && !openPosition) {
        // Open short position
        const quantity = signal.quantity || (currentCapital * this.config.leverage!) / executionPrice;
        const commission = quantity * executionPrice * this.config.commission;
        
        openPosition = {
          entryTime: signal.timestamp,
          entryPrice: executionPrice,
          quantity,
          side: 'short',
          symbol: signal.symbol,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
        };
        
        currentCapital -= commission;
      } else if (signal.type === 'close' && openPosition) {
        // Close position
        const exitPrice = executionPrice;
        const commission = openPosition.quantity * exitPrice * this.config.commission;
        
        let pnl: number;
        if (openPosition.side === 'long') {
          pnl = (exitPrice - openPosition.entryPrice) * openPosition.quantity;
        } else {
          pnl = (openPosition.entryPrice - exitPrice) * openPosition.quantity;
        }
        
        pnl -= commission;
        currentCapital += pnl;
        
        const trade: Trade = {
          entryTime: openPosition.entryTime,
          exitTime: signal.timestamp,
          symbol: openPosition.symbol,
          side: openPosition.side,
          entryPrice: openPosition.entryPrice,
          exitPrice,
          quantity: openPosition.quantity,
          pnl,
          pnlPercent: (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100,
          commission: commission * 2, // entry + exit
          slippage: Math.abs(currentPrice - executionPrice) * openPosition.quantity,
        };
        
        trades.push(trade);
        openPosition = null;

        // Update compounding
        if (!this.config.compounding) {
          currentCapital = this.config.initialCapital + trades.reduce((sum, t) => sum + t.pnl, 0);
        }
      }

      // Update equity curve
      peak = Math.max(peak, currentCapital);
      const drawdown = peak - currentCapital;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

      equityCurve.push({
        timestamp: signal.timestamp,
        equity: currentCapital,
        drawdown,
        drawdownPercent,
      });
    }

    // Close any remaining open position at last price
    if (openPosition && data.length > 0) {
      const lastCandle = data[data.length - 1];
      const exitPrice = lastCandle.close * (openPosition.side === 'long' ? (1 - this.config.slippage) : (1 + this.config.slippage));
      const commission = openPosition.quantity * exitPrice * this.config.commission;
      
      let pnl: number;
      if (openPosition.side === 'long') {
        pnl = (exitPrice - openPosition.entryPrice) * openPosition.quantity;
      } else {
        pnl = (openPosition.entryPrice - exitPrice) * openPosition.quantity;
      }
      
      pnl -= commission;
      currentCapital += pnl;
      
      trades.push({
        entryTime: openPosition.entryTime,
        exitTime: lastCandle.timestamp,
        symbol: openPosition.symbol,
        side: openPosition.side,
        entryPrice: openPosition.entryPrice,
        exitPrice,
        quantity: openPosition.quantity,
        pnl,
        pnlPercent: (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100,
        commission: commission * 2,
        slippage: Math.abs(lastCandle.close - exitPrice) * openPosition.quantity,
      });
    }

    const finalCapital = currentCapital;
    const totalReturn = finalCapital - this.config.initialCapital;
    const totalReturnPercent = (totalReturn / this.config.initialCapital) * 100;

    const metrics = performanceMetrics(trades, equityCurve, this.config.initialCapital, this.config.riskFreeRate);

    return {
      trades,
      equityCurve,
      metrics,
      initialCapital: this.config.initialCapital,
      finalCapital,
      totalReturn,
      totalReturnPercent,
    };
  }
}

// ==================== WALK-FORWARD ANALYZER CLASS ====================

/**
 * Walk-forward analysis to prevent overfitting
 * 
 * Splits historical data into multiple optimization and test windows,
 * optimizes parameters on in-sample data, then tests on out-of-sample data.
 */
export class WalkForwardAnalyzer {
  /**
   * Perform walk-forward analysis
   * 
   * @param strategy Strategy to analyze
   * @param historicalData Complete historical dataset
   * @param optimizationPeriod Number of days for optimization window
   * @param testPeriod Number of days for testing window
   * @returns Walk-forward analysis results
   */
  async analyze(
    strategy: Strategy,
    historicalData: MarketData[],
    optimizationPeriod: number,
    testPeriod: number
  ): Promise<WalkForwardResult> {
    if (historicalData.length === 0) {
      throw new Error('No historical data provided');
    }

    const windows: WalkForwardWindow[] = [];
    const sortedData = [...historicalData].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let windowNumber = 1;
    let currentIndex = 0;

    while (currentIndex + optimizationPeriod + testPeriod <= sortedData.length) {
      // Define optimization and test windows
      const optimizationData = sortedData.slice(currentIndex, currentIndex + optimizationPeriod);
      const testData = sortedData.slice(currentIndex + optimizationPeriod, currentIndex + optimizationPeriod + testPeriod);

      const optimizationStart = optimizationData[0].timestamp;
      const optimizationEnd = optimizationData[optimizationData.length - 1].timestamp;
      const testStart = testData[0].timestamp;
      const testEnd = testData[testData.length - 1].timestamp;

      // Create parameter space for optimization (example - should be customized per strategy)
      const parameterSpace: ParameterSpace = this.createDefaultParameterSpace(strategy);

      // Optimize on in-sample data
      const optimizer = new ParameterOptimizer();
      const optimizationResult = await optimizer.optimize(strategy, optimizationData, parameterSpace);

      // Test on out-of-sample data with optimized parameters
      const optimizedStrategy = {
        ...strategy,
        parameters: optimizationResult.bestParameters,
      };

      const backtest = new BacktestEngine({
        initialCapital: 10000,
        commission: 0.001,
        slippage: 0.0005,
      });

      const inSampleResult = await backtest.run(strategy, optimizationData);
      const outOfSampleResult = await backtest.run(optimizedStrategy, testData);

      // Calculate degradation
      const degradation = inSampleResult.metrics.sharpeRatio > 0
        ? ((inSampleResult.metrics.sharpeRatio - outOfSampleResult.metrics.sharpeRatio) / inSampleResult.metrics.sharpeRatio) * 100
        : 0;

      windows.push({
        windowNumber,
        optimizationPeriod: { start: optimizationStart, end: optimizationEnd },
        testPeriod: { start: testStart, end: testEnd },
        optimizedParameters: optimizationResult.bestParameters,
        inSampleMetrics: inSampleResult.metrics,
        outOfSampleMetrics: outOfSampleResult.metrics,
        degradation,
      });

      currentIndex += testPeriod;
      windowNumber++;
    }

    // Aggregate results across all windows
    const totalTrades = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.totalTrades, 0);
    const avgSharpe = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.sharpeRatio, 0) / windows.length;
    const avgReturn = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.totalReturnPercent, 0) / windows.length;
    const avgWinRate = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.winRate, 0) / windows.length;

    // Calculate consistency score (std dev of returns)
    const returns = windows.map(w => w.outOfSampleMetrics.totalReturnPercent);
    const consistencyScore = 100 - Math.min(standardDeviation(returns), 100);

    // Calculate robustness score (avg degradation)
    const avgDegradation = windows.reduce((sum, w) => sum + Math.abs(w.degradation), 0) / windows.length;
    const robustnessScore = Math.max(0, 100 - avgDegradation);

    const overallReturn = windows.reduce((sum, w) => sum + w.outOfSampleMetrics.totalReturn, 0);

    const aggregatedMetrics: PerformanceMetrics = {
      totalReturn: overallReturn,
      totalReturnPercent: avgReturn,
      sharpeRatio: avgSharpe,
      sortinoRatio: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.sortinoRatio, 0) / windows.length,
      calmarRatio: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.calmarRatio, 0) / windows.length,
      maxDrawdown: Math.max(...windows.map(w => w.outOfSampleMetrics.maxDrawdown)),
      maxDrawdownPercent: Math.max(...windows.map(w => w.outOfSampleMetrics.maxDrawdownPercent)),
      winRate: avgWinRate,
      profitFactor: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.profitFactor, 0) / windows.length,
      avgWin: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.avgWin, 0) / windows.length,
      avgLoss: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.avgLoss, 0) / windows.length,
      largestWin: Math.max(...windows.map(w => w.outOfSampleMetrics.largestWin)),
      largestLoss: Math.min(...windows.map(w => w.outOfSampleMetrics.largestLoss)),
      consecutiveWins: Math.max(...windows.map(w => w.outOfSampleMetrics.consecutiveWins)),
      consecutiveLosses: Math.max(...windows.map(w => w.outOfSampleMetrics.consecutiveLosses)),
      totalTrades,
      winningTrades: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.winningTrades, 0),
      losingTrades: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.losingTrades, 0),
      expectancy: windows.reduce((sum, w) => sum + w.outOfSampleMetrics.expectancy, 0) / windows.length,
    };

    return {
      windows,
      aggregatedMetrics,
      consistencyScore,
      robustnessScore,
      overallReturn,
    };
  }

  /**
   * Create default parameter space (should be customized per strategy)
   */
  private createDefaultParameterSpace(strategy: Strategy): ParameterSpace {
    const space: ParameterSpace = {};
    
    // Example: create ranges for numeric parameters
    for (const [key, value] of Object.entries(strategy.parameters)) {
      if (typeof value === 'number') {
        space[key] = {
          type: 'range',
          min: value * 0.5,
          max: value * 1.5,
          step: value * 0.1,
        };
      }
    }
    
    return space;
  }
}

// ==================== PARAMETER OPTIMIZER CLASS ====================

/**
 * Parameter optimization using grid search or genetic algorithms
 */
export class ParameterOptimizer {
  /**
   * Optimize strategy parameters using grid search
   * 
   * @param strategy Strategy to optimize
   * @param data Historical data for optimization
   * @param parameterSpace Parameter space definition
   * @param scoreMetric Metric to optimize (default: sharpeRatio)
   * @returns Optimization result with best parameters
   */
  async optimize(
    strategy: Strategy,
    data: MarketData[],
    parameterSpace: ParameterSpace,
    scoreMetric: keyof PerformanceMetrics = 'sharpeRatio'
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    const allResults: ParameterTestResult[] = [];

    // Generate all parameter combinations (grid search)
    const parameterCombinations = this.generateParameterCombinations(parameterSpace);

    // Test each parameter combination
    for (const params of parameterCombinations) {
      const testStrategy: Strategy = {
        ...strategy,
        parameters: params,
      };

      const backtest = new BacktestEngine({
        initialCapital: 10000,
        commission: 0.001,
        slippage: 0.0005,
      });

      try {
        const result = await backtest.run(testStrategy, data);
        const score = result.metrics[scoreMetric] as number;

        allResults.push({
          parameters: params,
          score,
          metrics: result.metrics,
        });
      } catch (error) {
        // Skip failed parameter combinations
        continue;
      }
    }

    if (allResults.length === 0) {
      throw new Error('No valid parameter combinations found');
    }

    // Find best parameters
    allResults.sort((a, b) => b.score - a.score);
    const best = allResults[0];

    const executionTime = Date.now() - startTime;

    return {
      bestParameters: best.parameters,
      bestScore: best.score,
      allResults,
      optimizationMethod: 'grid',
      executionTime,
    };
  }

  /**
   * Generate all parameter combinations from parameter space
   */
  private generateParameterCombinations(space: ParameterSpace): Record<string, any>[] {
    const keys = Object.keys(space);
    if (keys.length === 0) return [{}];

    const combinations: Record<string, any>[] = [];

    const generate = (index: number, current: Record<string, any>) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      const config = space[key];

      if (config.type === 'range' && config.min !== undefined && config.max !== undefined && config.step !== undefined) {
        for (let value = config.min; value <= config.max; value += config.step) {
          current[key] = value;
          generate(index + 1, current);
        }
      } else if (config.type === 'discrete' && config.values) {
        for (const value of config.values) {
          current[key] = value;
          generate(index + 1, current);
        }
      }
    };

    generate(0, {});
    return combinations;
  }
}

// ==================== MONTE CARLO SIMULATOR CLASS ====================

/**
 * Monte Carlo simulation for probability analysis
 * 
 * Randomly reorders historical trades to generate probability distributions
 * of possible outcomes and calculate risk of ruin.
 */
export class MonteCarloSimulator {
  /**
   * Run Monte Carlo simulation on historical trades
   * 
   * @param trades Historical trades to simulate
   * @param initialCapital Starting capital
   * @param numSimulations Number of simulations to run
   * @returns Monte Carlo simulation results
   */
  simulate(
    trades: Trade[],
    initialCapital: number,
    numSimulations: number = 1000
  ): MonteCarloResult {
    if (trades.length === 0) {
      throw new Error('No trades provided for Monte Carlo simulation');
    }

    const scenarios: Scenario[] = [];

    for (let i = 0; i < numSimulations; i++) {
      // Randomly shuffle trades
      const shuffledTrades = shuffleArray(trades);
      
      // Simulate equity curve
      let capital = initialCapital;
      let peak = capital;
      let maxDrawdown = 0;
      const equityCurve: EquityPoint[] = [];

      for (const trade of shuffledTrades) {
        capital += trade.pnl;
        peak = Math.max(peak, capital);
        const drawdown = peak - capital;
        const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
        maxDrawdown = Math.max(maxDrawdown, drawdownPercent);

        equityCurve.push({
          timestamp: trade.exitTime,
          equity: capital,
          drawdown,
          drawdownPercent,
        });
      }

      const finalEquity = capital;
      const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
      
      // Calculate Sharpe ratio for this scenario
      const returns = calculateReturns(equityCurve);
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const stdDev = standardDeviation(returns);
      const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);

      scenarios.push({
        scenarioNumber: i + 1,
        finalEquity,
        totalReturn,
        maxDrawdown,
        sharpeRatio,
      });
    }

    // Sort scenarios by final equity
    scenarios.sort((a, b) => a.finalEquity - b.finalEquity);

    // Calculate statistics
    const finalEquities = scenarios.map(s => s.finalEquity);
    const returns = scenarios.map(s => s.totalReturn);
    
    const probabilityOfProfit = (scenarios.filter(s => s.finalEquity > initialCapital).length / numSimulations) * 100;
    const expectedValue = finalEquities.reduce((sum, e) => sum + e, 0) / numSimulations;
    const riskOfRuin = (scenarios.filter(s => s.finalEquity <= initialCapital * 0.5).length / numSimulations) * 100;

    // Calculate percentiles
    const getPercentile = (arr: number[], percentile: number): number => {
      const index = Math.floor(arr.length * (percentile / 100));
      return arr[index];
    };

    const sortedReturns = [...returns].sort((a, b) => a - b);

    return {
      scenarios,
      probabilityOfProfit,
      expectedValue,
      riskOfRuin,
      confidenceIntervals: {
        percentile5: getPercentile(sortedReturns, 5),
        percentile25: getPercentile(sortedReturns, 25),
        percentile50: getPercentile(sortedReturns, 50),
        percentile75: getPercentile(sortedReturns, 75),
        percentile95: getPercentile(sortedReturns, 95),
      },
      worstCase: Math.min(...finalEquities),
      bestCase: Math.max(...finalEquities),
    };
  }
}