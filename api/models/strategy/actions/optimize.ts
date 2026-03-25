import { save, ActionOptions, ActionRun } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { assert } from "gadget-server";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record);
  
  // Load the strategy with user relationship
  const strategy = await api.strategy.findOne(record.id, {
    select: {
      id: true,
      name: true,
      userId: true,
      parameters: true,
      assets: true,
      type: true,
      user: {
        id: true,
        email: true
      }
    }
  });
  
  assert(strategy, "Strategy not found");
  assert(strategy.userId === params.userId, "Unauthorized: strategy does not belong to user");
  
  logger.info({ strategyId: strategy.id, goal: params.optimizationGoal }, "Starting strategy optimization");
  
  // Extract current parameters
  const currentParams = strategy.parameters as Record<string, any> || {};
  const backtestPeriod = params.backtestPeriod as { startDate: string; endDate: string };
  const optimizationGoal = (params.optimizationGoal as string) || 'balanced';
  const constraints = params.constraints as { maxDrawdown?: number; minWinRate?: number } || {};
  
  // Fetch historical market data for the backtest period
  const assets = strategy.assets as string[] || [];
  const marketDataPromises = assets.map(async (symbol) => {
    return await api.marketData.findMany({
      filter: {
        symbol: { equals: symbol },
        timestamp: {
          greaterThanOrEqual: backtestPeriod.startDate,
          lessThanOrEqual: backtestPeriod.endDate
        }
      },
      sort: { timestamp: "Ascending" },
      first: 250,
      select: {
        symbol: true,
        timestamp: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true
      }
    });
  });
  
  const marketDataResults = await Promise.all(marketDataPromises);
  const marketData = marketDataResults.flat();
  
  if (marketData.length === 0) {
    logger.warn("No market data found for optimization period");
  }
  
  // Initialize parameter search space (vary each param ±20%)
  const parameterSpace: Record<string, any>[] = [];
  const paramKeys = Object.keys(currentParams);
  const numCombinations = Math.min(50, Math.pow(3, paramKeys.length)); // 3 values per param, max 50
  
  // Generate parameter combinations
  for (let i = 0; i < numCombinations; i++) {
    const combination: Record<string, any> = {};
    paramKeys.forEach((key, index) => {
      const currentValue = currentParams[key];
      if (typeof currentValue === 'number') {
        const variation = i % 3; // 0: -20%, 1: 0%, 2: +20%
        const multiplier = variation === 0 ? 0.8 : variation === 1 ? 1.0 : 1.2;
        combination[key] = currentValue * multiplier;
      } else {
        combination[key] = currentValue;
      }
    });
    parameterSpace.push(combination);
  }
  
  // Evaluate each parameter combination
  const results: Array<{
    parameters: Record<string, any>;
    returns: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    score: number;
  }> = [];
  
  for (const testParams of parameterSpace) {
    // Calculate Ψₙ (Psi) based on market volatility
    const volatility = calculateVolatility(marketData);
    const psi = Math.exp(-volatility / 0.1); // Dampening factor based on volatility
    
    // Calculate Λₙ (Lambda) for risk balance
    const riskLevel = testParams.riskLevel || 1.0;
    const lambda = 1 / (1 + Math.exp(-riskLevel)); // Sigmoid function for risk balance
    
    // Run simulated backtest
    const backtestResult = runSimulatedBacktest(marketData, testParams);
    
    // Calculate Ξ (Xi) for stability
    const xi = 1 - (backtestResult.maxDrawdown / 100); // Higher stability = lower drawdown
    
    // Calculate Φ (Phi) for potential
    const phi = backtestResult.returns * backtestResult.sharpeRatio / 100;
    
    // Combined score with weighting based on optimization goal
    let score = 0;
    switch (optimizationGoal) {
      case 'max-return':
        score = backtestResult.returns * psi;
        break;
      case 'max-sharpe':
        score = backtestResult.sharpeRatio * lambda;
        break;
      case 'min-drawdown':
        score = xi * 100;
        break;
      case 'balanced':
      default:
        score = (phi * 0.4 + xi * 0.3 + backtestResult.sharpeRatio * 0.3) * psi * lambda;
        break;
    }
    
    // Check constraints
    const meetsConstraints = 
      (!constraints.maxDrawdown || backtestResult.maxDrawdown <= constraints.maxDrawdown) &&
      (!constraints.minWinRate || backtestResult.winRate >= constraints.minWinRate);
    
    if (meetsConstraints) {
      results.push({
        parameters: testParams,
        returns: backtestResult.returns,
        sharpeRatio: backtestResult.sharpeRatio,
        maxDrawdown: backtestResult.maxDrawdown,
        winRate: backtestResult.winRate,
        score
      });
    }
  }
  
  // Find optimal parameters
  results.sort((a, b) => b.score - a.score);
  const optimal = results[0];
  
  if (!optimal) {
    throw new Error("No parameter combination met the specified constraints");
  }
  
  // Update strategy parameters
  record.parameters = optimal.parameters;
  await save(record);
  
  // Create backtest run record
  await api.backtestRun.create({
    name: `Optimization - ${strategy.name} - ${new Date().toISOString()}`,
    strategy: { _link: strategy.id },
    user: { _link: strategy.userId },
    startDate: backtestPeriod.startDate,
    endDate: backtestPeriod.endDate,
    parameters: optimal.parameters,
    status: "completed",
    totalReturn: optimal.returns,
    totalReturnPercent: optimal.returns,
    sharpeRatio: optimal.sharpeRatio,
    maxDrawdown: optimal.maxDrawdown,
    winRate: optimal.winRate,
    initialCapital: 10000,
    progress: 100,
    completedAt: new Date().toISOString()
  });
  
  // Send notification to user
  await api.notification.create({
    user: { _link: strategy.userId },
    type: "strategy",
    severity: "success",
    title: "Strategy Optimization Complete",
    message: `Your strategy "${strategy.name}" has been optimized. Expected return: ${optimal.returns.toFixed(2)}%, Sharpe ratio: ${optimal.sharpeRatio.toFixed(2)}`,
    metadata: {
      strategyId: strategy.id,
      optimizationGoal,
      optimizedReturns: optimal.returns
    }
  });
  
  logger.info({ 
    strategyId: strategy.id, 
    returns: optimal.returns,
    sharpe: optimal.sharpeRatio,
    drawdown: optimal.maxDrawdown 
  }, "Optimization completed successfully");
  
  // Return optimization results
  return {
    success: true,
    optimizedParameters: optimal.parameters,
    metrics: {
      expectedReturn: optimal.returns,
      sharpeRatio: optimal.sharpeRatio,
      maxDrawdown: optimal.maxDrawdown,
      confidence: optimal.score / 100
    }
  };
};

// Helper function to calculate volatility from market data
function calculateVolatility(marketData: any[]): number {
  if (marketData.length < 2) return 0.5;
  
  const returns = [];
  for (let i = 1; i < Math.min(marketData.length, 100); i++) {
    const prevClose = marketData[i - 1].close || 1;
    const currentClose = marketData[i].close || 1;
    returns.push((currentClose - prevClose) / prevClose);
  }
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

// Helper function to run simulated backtest
function runSimulatedBacktest(marketData: any[], parameters: Record<string, any>): {
  returns: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
} {
  if (marketData.length === 0) {
    return {
      returns: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 50
    };
  }
  
  // Simplified backtest simulation
  let equity = 10000;
  const equityCurve = [equity];
  let wins = 0;
  let totalTrades = 0;
  let peak = equity;
  let maxDrawdown = 0;
  
  const riskPerTrade = parameters.riskPerTrade || 0.02;
  const stopLoss = parameters.stopLoss || 0.05;
  const takeProfit = parameters.takeProfit || 0.10;
  
  for (let i = 1; i < Math.min(marketData.length, 100); i++) {
    const prevClose = marketData[i - 1].close || 1;
    const currentClose = marketData[i].close || 1;
    const priceChange = (currentClose - prevClose) / prevClose;
    
    // Simulate trade
    if (Math.abs(priceChange) > 0.001) {
      totalTrades++;
      const tradeDirection = priceChange > 0 ? 1 : -1;
      const tradeResult = tradeDirection * Math.abs(priceChange) * riskPerTrade * equity;
      
      // Apply stop loss and take profit
      const cappedResult = Math.max(-stopLoss * equity, Math.min(takeProfit * equity, tradeResult));
      
      if (cappedResult > 0) wins++;
      equity += cappedResult;
      equityCurve.push(equity);
      
      // Track drawdown
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }
  
  const totalReturn = ((equity - 10000) / 10000) * 100;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 50;
  
  // Calculate Sharpe ratio (simplified)
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / Math.max(returns.length, 1);
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(returns.length, 1)
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  return {
    returns: totalReturn,
    sharpeRatio,
    maxDrawdown: maxDrawdown * 100,
    winRate
  };
}

export const params = {
  backtestPeriod: {
    type: "object",
    properties: {
      startDate: { type: "string" },
      endDate: { type: "string" }
    },
    required: ["startDate", "endDate"]
  },
  optimizationGoal: {
    type: "string",
    enum: ["max-return", "max-sharpe", "min-drawdown", "balanced"],
    default: "balanced"
  },
  constraints: {
    type: "object",
    properties: {
      maxDrawdown: { type: "number" },
      minWinRate: { type: "number" }
    }
  }
};

export const options: ActionOptions = {
  actionType: "custom",
  returnType: true,
  timeoutMS: 300000, // 5 minutes
  triggers: {
    api: true
  }
};
