import { ActionOptions } from "gadget-server";

interface GasPrice {
  fast: number;
  average: number;
  slow: number;
  timestamp: Date;
}

interface GasPriceSource {
  name: string;
  fast: number;
  average: number;
  slow: number;
}

interface GasTrend {
  current: number;
  change24h: number;
  movingAverage: number;
  prediction: number;
}

interface TransactionCost {
  operation: string;
  gasLimit: number;
  costInGwei: number;
  costInETH: number;
  costInUSD: number;
}

export const run: ActionRun = async ({ params, logger, api }) => {
  const chain = params.chain || "ethereum";
  const targetGasPrice = params.targetGasPrice;
  const interval = params.interval || 60;

  logger.info({ chain, targetGasPrice, interval }, "Starting gas price monitoring");

  try {
    // 1. Fetch current gas prices from multiple sources
    const gasPrices = await fetchGasPricesFromMultipleSources(chain, logger);
    
    // 2. Calculate weighted average
    const weightedAverage = calculateWeightedAverage(gasPrices);
    
    // 3. Fetch and analyze historical data
    const historicalData = await fetchHistoricalGasPrices(api, chain);
    const trends = analyzeGasTrends(historicalData, weightedAverage);
    
    // 4. Generate recommendations
    const recommendations = generateRecommendations(weightedAverage, trends, targetGasPrice);
    
    // 5. Calculate transaction costs
    const costs = calculateTransactionCosts(weightedAverage, chain);
    
    // 6. Store current gas price data
    await storeGasPriceHistory(api, chain, weightedAverage);
    
    // 7. Create alerts if needed
    if (params.userId && targetGasPrice && weightedAverage.average <= targetGasPrice) {
      await createGasPriceAlert(api, params.userId, chain, weightedAverage.average, targetGasPrice);
    }
    
    // 8. Check for gas price spikes
    if (trends.change24h > 50) {
      logger.warn({ chain, change: trends.change24h }, "Gas price spike detected");
      if (params.userId) {
        await createGasSpikeAlert(api, params.userId, chain, weightedAverage.average, trends.change24h);
      }
    }
    
    // 9. Return comprehensive report
    return {
      success: true,
      chain,
      currentGasPrices: weightedAverage,
      sources: gasPrices,
      trends,
      recommendations,
      costs,
      historicalData: historicalData.slice(-24), // Last 24 data points
      nextCheckIn: interval,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error({ error, chain }, "Error monitoring gas prices");
    throw error;
  }
};

async function fetchGasPricesFromMultipleSources(chain: string, logger: any): Promise<GasPriceSource[]> {
  // In a real implementation, this would call actual APIs
  // For now, we'll simulate with reasonable values
  const sources: GasPriceSource[] = [
    {
      name: "Etherscan",
      fast: Math.random() * 20 + 40,
      average: Math.random() * 15 + 25,
      slow: Math.random() * 10 + 15
    },
    {
      name: "GasStation",
      fast: Math.random() * 20 + 38,
      average: Math.random() * 15 + 23,
      slow: Math.random() * 10 + 13
    },
    {
      name: "OnChain",
      fast: Math.random() * 20 + 42,
      average: Math.random() * 15 + 27,
      slow: Math.random() * 10 + 17
    }
  ];
  
  return sources;
}

function calculateWeightedAverage(sources: GasPriceSource[]): GasPrice {
  const weights = [0.4, 0.35, 0.25]; // Different weights for different sources
  
  let fast = 0;
  let average = 0;
  let slow = 0;
  
  sources.forEach((source, index) => {
    const weight = weights[index] || 0.33;
    fast += source.fast * weight;
    average += source.average * weight;
    slow += source.slow * weight;
  });
  
  return {
    fast: Math.round(fast * 100) / 100,
    average: Math.round(average * 100) / 100,
    slow: Math.round(slow * 100) / 100,
    timestamp: new Date()
  };
}

async function fetchHistoricalGasPrices(api: any, chain: string): Promise<number[]> {
  // Fetch from marketData or a dedicated gas price tracking model
  // For now, simulate historical data
  const historicalPrices: number[] = [];
  const basePrice = 25;
  
  for (let i = 0; i < 168; i++) { // 7 days of hourly data
    const variation = Math.sin(i / 6) * 10 + Math.random() * 5;
    historicalPrices.push(Math.max(10, basePrice + variation));
  }
  
  return historicalPrices;
}

function analyzeGasTrends(historical: number[], current: GasPrice): GasTrend {
  const currentPrice = current.average;
  const price24hAgo = historical[historical.length - 24] || currentPrice;
  const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
  
  // Calculate moving average (last 24 hours)
  const recent24 = historical.slice(-24);
  const movingAverage = recent24.reduce((sum, price) => sum + price, 0) / recent24.length;
  
  // Simple prediction based on trend
  const recentTrend = historical.slice(-6);
  const trendSlope = (recentTrend[recentTrend.length - 1] - recentTrend[0]) / recentTrend.length;
  const prediction = Math.max(10, currentPrice + trendSlope * 6);
  
  return {
    current: Math.round(currentPrice * 100) / 100,
    change24h: Math.round(change24h * 100) / 100,
    movingAverage: Math.round(movingAverage * 100) / 100,
    prediction: Math.round(prediction * 100) / 100
  };
}

function generateRecommendations(gasPrice: GasPrice, trends: GasTrend, targetGasPrice?: number): any {
  const recommendations: any = {
    bestTimeToExecute: null,
    gasSavingStrategies: [],
    shouldWait: false,
    estimatedWaitTime: null
  };
  
  // Determine best time based on trends
  if (trends.change24h < -10) {
    recommendations.bestTimeToExecute = "now";
    recommendations.gasSavingStrategies.push("Gas prices are declining, good time to execute");
  } else if (trends.change24h > 20) {
    recommendations.bestTimeToExecute = "wait";
    recommendations.shouldWait = true;
    recommendations.estimatedWaitTime = "2-4 hours";
    recommendations.gasSavingStrategies.push("Gas prices are spiking, consider waiting");
  } else {
    recommendations.bestTimeToExecute = "flexible";
    recommendations.gasSavingStrategies.push("Gas prices are stable");
  }
  
  // Check against target
  if (targetGasPrice) {
    if (gasPrice.average <= targetGasPrice) {
      recommendations.shouldWait = false;
      recommendations.gasSavingStrategies.push(`Target gas price (${targetGasPrice} gwei) reached`);
    } else {
      recommendations.shouldWait = true;
      const difference = gasPrice.average - targetGasPrice;
      recommendations.gasSavingStrategies.push(
        `Wait for gas to drop ${difference.toFixed(2)} gwei to reach target`
      );
    }
  }
  
  // Time-based recommendations
  const hour = new Date().getHours();
  if (hour >= 2 && hour <= 6) {
    recommendations.gasSavingStrategies.push("Off-peak hours - typically lower gas prices");
  } else if (hour >= 14 && hour <= 18) {
    recommendations.gasSavingStrategies.push("Peak hours - expect higher gas prices");
  }
  
  return recommendations;
}

function calculateTransactionCosts(gasPrice: GasPrice, chain: string): TransactionCost[] {
  // Typical gas limits for common operations
  const operations = [
    { operation: "ETH Transfer", gasLimit: 21000 },
    { operation: "ERC20 Transfer", gasLimit: 65000 },
    { operation: "Uniswap Swap", gasLimit: 150000 },
    { operation: "ERC20 Approve", gasLimit: 46000 },
    { operation: "NFT Mint", gasLimit: 100000 },
    { operation: "Complex DeFi", gasLimit: 300000 }
  ];
  
  // Approximate ETH price (in real implementation, fetch from API)
  const ethPriceUSD = 2000;
  
  return operations.map(op => {
    const costInGwei = op.gasLimit * gasPrice.average;
    const costInETH = costInGwei / 1e9;
    const costInUSD = costInETH * ethPriceUSD;
    
    return {
      operation: op.operation,
      gasLimit: op.gasLimit,
      costInGwei: Math.round(costInGwei),
      costInETH: Math.round(costInETH * 1e6) / 1e6,
      costInUSD: Math.round(costInUSD * 100) / 100
    };
  });
}

async function storeGasPriceHistory(api: any, chain: string, gasPrice: GasPrice): Promise<void> {
  // Store in marketData model with special handling for gas prices
  try {
    await api.marketData.create({
      symbol: `${chain.toUpperCase()}_GAS`,
      interval: "1h",
      open: gasPrice.slow,
      high: gasPrice.fast,
      low: gasPrice.slow,
      close: gasPrice.average,
      volume: 0,
      timestamp: gasPrice.timestamp,
      metadata: {
        type: "gas_price",
        chain,
        fast: gasPrice.fast,
        average: gasPrice.average,
        slow: gasPrice.slow
      }
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error("Error storing gas price history:", error);
  }
}

async function createGasPriceAlert(
  api: any,
  userId: string,
  chain: string,
  currentGas: number,
  targetGas: number
): Promise<void> {
  try {
    await api.alert.create({
      user: { _link: userId },
      type: "price-alert",
      severity: "info",
      title: `Gas Price Alert - ${chain}`,
      message: `Gas price on ${chain} has reached your target! Current: ${currentGas.toFixed(2)} gwei, Target: ${targetGas} gwei`,
      triggeredAt: new Date(),
      metadata: {
        chain,
        currentGasPrice: currentGas,
        targetGasPrice: targetGas,
        type: "gas_price_target_reached"
      }
    });
  } catch (error) {
    console.error("Error creating gas price alert:", error);
  }
}

async function createGasSpikeAlert(
  api: any,
  userId: string,
  chain: string,
  currentGas: number,
  changePercent: number
): Promise<void> {
  try {
    await api.alert.create({
      user: { _link: userId },
      type: "price-alert",
      severity: "warning",
      title: `Gas Price Spike - ${chain}`,
      message: `Gas prices on ${chain} have spiked by ${changePercent.toFixed(2)}%! Current: ${currentGas.toFixed(2)} gwei. Consider delaying transactions.`,
      triggeredAt: new Date(),
      metadata: {
        chain,
        currentGasPrice: currentGas,
        changePercent,
        type: "gas_price_spike"
      }
    });
  } catch (error) {
    console.error("Error creating gas spike alert:", error);
  }
}

export const params = {
  chain: {
    type: "string",
    default: "ethereum"
  },
  targetGasPrice: {
    type: "number",
    required: false
  },
  interval: {
    type: "number",
    default: 60
  },
  userId: {
    type: "string",
    required: false
  }
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        every: "5 minutes"
      }
    ]
  }
};
