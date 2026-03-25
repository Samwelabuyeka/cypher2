import { calculateReturns, calculateCovarianceMatrix, calculateExpectedReturns } from "../lib/calculations/portfolioMetrics";
import { 
  meanVarianceOptimization, 
  riskParityOptimization, 
  maxSharpeOptimization,
  minVarianceOptimization,
  maxDiversificationOptimization,
  hierarchicalRiskParityOptimization,
  blackLittermanOptimization
} from "../lib/portfolio/modernPortfolioTheory";
import { assert } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const { 
    userId, 
    symbols, 
    optimizationMethod, 
    constraints = {}, 
    riskFreeRate = 0.02,
    targetReturn,
    rebalanceFrequency = "monthly"
  } = params;

  assert(userId, "userId is required");
  assert(symbols && symbols.length > 0, "symbols array is required and must not be empty");
  assert(optimizationMethod, "optimizationMethod is required");

  logger.info({ userId, symbols, optimizationMethod }, "Starting portfolio optimization");

  try {
    // 1. Fetch historical price data for all symbols
    const historicalData = await fetchHistoricalData(api, symbols);
    
    if (historicalData.length === 0) {
      throw new Error("No historical data available for the provided symbols");
    }

    // 2. Calculate returns time series
    const returns = calculateReturns(historicalData);
    
    // 3. Calculate covariance matrix and expected returns
    const covarianceMatrix = calculateCovarianceMatrix(returns);
    const expectedReturns = calculateExpectedReturns(returns);
    
    logger.info({ expectedReturns }, "Calculated expected returns");

    // 4. Apply constraints
    const minWeight = constraints.minWeight || 0;
    const maxWeight = constraints.maxWeight || 1;
    
    // 5. Run optimization using specified method
    let optimalWeights: number[];
    
    switch (optimizationMethod) {
      case "meanVariance":
        assert(targetReturn !== undefined, "targetReturn is required for mean-variance optimization");
        optimalWeights = meanVarianceOptimization(
          expectedReturns,
          covarianceMatrix,
          targetReturn,
          { minWeight, maxWeight }
        );
        break;
        
      case "riskParity":
        optimalWeights = riskParityOptimization(covarianceMatrix, { minWeight, maxWeight });
        break;
        
      case "maxSharpe":
        optimalWeights = maxSharpeOptimization(
          expectedReturns,
          covarianceMatrix,
          riskFreeRate,
          { minWeight, maxWeight }
        );
        break;
        
      case "minVariance":
        optimalWeights = minVarianceOptimization(covarianceMatrix, { minWeight, maxWeight });
        break;
        
      case "maxDiversification":
        optimalWeights = maxDiversificationOptimization(
          covarianceMatrix,
          { minWeight, maxWeight }
        );
        break;
        
      case "HRP":
        optimalWeights = hierarchicalRiskParityOptimization(covarianceMatrix, returns);
        break;
        
      case "blackLitterman":
        optimalWeights = blackLittermanOptimization(
          expectedReturns,
          covarianceMatrix,
          params.views || [],
          { minWeight, maxWeight }
        );
        break;
        
      default:
        throw new Error(`Unknown optimization method: ${optimizationMethod}`);
    }

    // 6. Calculate optimized portfolio metrics
    const portfolioMetrics = calculatePortfolioMetrics(
      optimalWeights,
      expectedReturns,
      covarianceMatrix,
      riskFreeRate
    );

    // 7. Generate rebalancing recommendations
    const currentHoldings = await fetchCurrentHoldings(api, userId, symbols);
    const rebalancingRecommendations = generateRebalancingRecommendations(
      symbols,
      currentHoldings,
      optimalWeights,
      params.estimatedTransactionCost || 0.001
    );

    // 8. Store optimization results
    const optimizationResult = {
      userId,
      symbols,
      method: optimizationMethod,
      weights: optimalWeights.reduce((acc, weight, idx) => {
        acc[symbols[idx]] = weight;
        return acc;
      }, {} as Record<string, number>),
      metrics: portfolioMetrics,
      rebalancing: rebalancingRecommendations,
      constraints,
      riskFreeRate,
      rebalanceFrequency,
      timestamp: new Date().toISOString()
    };

    logger.info({ optimizationResult }, "Portfolio optimization completed");

    // 9. Return optimal weights and detailed metrics
    return {
      success: true,
      optimalWeights: optimizationResult.weights,
      metrics: portfolioMetrics,
      rebalancing: rebalancingRecommendations,
      optimizationResult
    };

  } catch (error) {
    logger.error({ error, userId, symbols }, "Portfolio optimization failed");
    throw error;
  }
};

async function fetchHistoricalData(api: any, symbols: string[]) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1); // 1 year of data

  const dataPromises = symbols.map(async (symbol) => {
    const data = await api.marketData.findMany({
      filter: {
        symbol: { equals: symbol },
        timestamp: {
          greaterThanOrEqual: startDate.toISOString(),
          lessThanOrEqual: endDate.toISOString()
        },
        interval: { equals: "1d" }
      },
      sort: { timestamp: "Ascending" },
      first: 250,
      select: {
        symbol: true,
        timestamp: true,
        close: true
      }
    });
    return data;
  });

  const allData = await Promise.all(dataPromises);
  return allData.flat();
}

async function fetchCurrentHoldings(api: any, userId: string, symbols: string[]) {
  const positions = await api.position.findMany({
    filter: {
      userId: { equals: userId },
      asset: { in: symbols }
    },
    select: {
      asset: true,
      quantity: true,
      currentPrice: true
    }
  });

  const holdings: Record<string, number> = {};
  let totalValue = 0;

  positions.forEach((pos: any) => {
    const value = pos.quantity * pos.currentPrice;
    holdings[pos.asset] = value;
    totalValue += value;
  });

  // Convert to weights
  const weights: Record<string, number> = {};
  if (totalValue > 0) {
    Object.keys(holdings).forEach((asset) => {
      weights[asset] = holdings[asset] / totalValue;
    });
  }

  return weights;
}

function calculatePortfolioMetrics(
  weights: number[],
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number
) {
  // Expected portfolio return
  const expectedReturn = weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);

  // Portfolio variance
  let portfolioVariance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
    }
  }
  const portfolioVolatility = Math.sqrt(portfolioVariance);

  // Sharpe ratio
  const sharpeRatio = (expectedReturn - riskFreeRate) / portfolioVolatility;

  // Risk contributions
  const riskContributions = weights.map((w, i) => {
    let marginalContribution = 0;
    for (let j = 0; j < weights.length; j++) {
      marginalContribution += weights[j] * covarianceMatrix[i][j];
    }
    return (w * marginalContribution) / portfolioVariance;
  });

  // Diversification ratio
  const weightedVolatilities = weights.reduce((sum, w, i) => {
    const assetVolatility = Math.sqrt(covarianceMatrix[i][i]);
    return sum + w * assetVolatility;
  }, 0);
  const diversificationRatio = weightedVolatilities / portfolioVolatility;

  return {
    expectedReturn: Number((expectedReturn * 100).toFixed(2)), // Annualized %
    volatility: Number((portfolioVolatility * 100).toFixed(2)), // Annualized %
    sharpeRatio: Number(sharpeRatio.toFixed(4)),
    riskContributions: riskContributions.map(rc => Number((rc * 100).toFixed(2))),
    diversificationRatio: Number(diversificationRatio.toFixed(4))
  };
}

function generateRebalancingRecommendations(
  symbols: string[],
  currentWeights: Record<string, number>,
  optimalWeights: number[],
  transactionCost: number
) {
  const recommendations = symbols.map((symbol, idx) => {
    const currentWeight = currentWeights[symbol] || 0;
    const targetWeight = optimalWeights[idx];
    const difference = targetWeight - currentWeight;
    
    return {
      symbol,
      currentWeight: Number((currentWeight * 100).toFixed(2)),
      targetWeight: Number((targetWeight * 100).toFixed(2)),
      difference: Number((difference * 100).toFixed(2)),
      action: Math.abs(difference) < 0.01 ? "hold" : difference > 0 ? "buy" : "sell",
      percentageChange: Number(((difference / (currentWeight || 0.01)) * 100).toFixed(2))
    };
  });

  const totalTurnover = recommendations.reduce((sum, rec) => sum + Math.abs(rec.difference), 0);
  const estimatedCost = Number((totalTurnover * transactionCost * 100).toFixed(4));

  return {
    recommendations,
    totalTurnover: Number((totalTurnover * 100).toFixed(2)),
    estimatedTransactionCost: estimatedCost,
    worthRebalancing: totalTurnover > transactionCost * 2
  };
}

export const options: ActionOptions = {
  triggers: {
    api: true
  }
};

export const params = {
  userId: { type: "string", required: true },
  symbols: { type: "string", list: true, required: true },
  optimizationMethod: {
    type: "string",
    required: true,
    validations: {
      in: ["meanVariance", "riskParity", "maxSharpe", "minVariance", "maxDiversification", "HRP", "blackLitterman"]
    }
  },
  constraints: { type: "json" },
  riskFreeRate: { type: "number", default: 0.02 },
  targetReturn: { type: "number" },
  rebalanceFrequency: {
    type: "string",
    default: "monthly",
    validations: {
      in: ["daily", "weekly", "monthly"]
    }
  },
  views: { type: "json" },
  estimatedTransactionCost: { type: "number", default: 0.001 }
};
