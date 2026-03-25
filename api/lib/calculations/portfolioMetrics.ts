function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return mean(squareDiffs);
}

export function covariance(x: number[], y: number[]): number {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  const meanX = mean(x);
  const meanY = mean(y);
  const products = x.map((xi, i) => (xi - meanX) * (y[i] - meanY));
  return mean(products);
}

export function correlation(x: number[], y: number[]): number {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  const cov = covariance(x, y);
  const stdX = stdDev(x);
  const stdY = stdDev(y);
  if (stdX === 0 || stdY === 0) return 0;
  return cov / (stdX * stdY);
}

export function calculateTotalReturn(initialValue: number, currentValue: number) {
  const absolute = currentValue - initialValue;
  const percentage = initialValue !== 0 ? (absolute / initialValue) * 100 : 0;
  return { absolute, percentage };
}

export function calculateMaxDrawdown(values: number[]) {
  if (values.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, peakIndex: -1, troughIndex: -1 };
  }

  let peak = values[0];
  let peakIndex = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let maxPeakIndex = 0;
  let maxTroughIndex = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIndex = i;
    }

    const drawdown = peak - values[i];
    const drawdownPercent = peak !== 0 ? (drawdown / peak) * 100 : 0;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
      maxPeakIndex = peakIndex;
      maxTroughIndex = i;
    }
  }

  return {
    maxDrawdown,
    maxDrawdownPercent,
    peakIndex: maxPeakIndex,
    troughIndex: maxTroughIndex
  };
}

export function calculateVolatility(returns: number[], annualized: boolean = true): number {
  if (returns.length === 0) return 0;
  const vol = stdDev(returns);
  return annualized ? vol * Math.sqrt(252) : vol;
}

export function calculateValueAtRisk(returns: number[], confidenceLevel: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sorted.length);
  return sorted[index] || 0;
}

export function calculateBeta(assetReturns: number[], marketReturns: number[]): number {
  if (assetReturns.length === 0 || marketReturns.length === 0 || assetReturns.length !== marketReturns.length) {
    return 0;
  }
  const cov = covariance(assetReturns, marketReturns);
  const marketVar = variance(marketReturns);
  if (marketVar === 0) return 0;
  return cov / marketVar;
}

export function calculateAlpha(portfolioReturn: number, riskFreeRate: number, beta: number, marketReturn: number): number {
  return portfolioReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
}

export function calculateCAGR(initialValue: number, finalValue: number, years: number): number {
  if (initialValue <= 0 || finalValue <= 0 || years <= 0) return 0;
  return (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
}

export function calculateCalmarRatio(totalReturn: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return 0;
  return totalReturn / Math.abs(maxDrawdown);
}

export function calculateSortinoRatio(returns: number[], targetReturn: number = 0): number {
  if (returns.length === 0) return 0;
  const avgReturn = mean(returns);
  const downside = returns.filter(r => r < targetReturn);
  if (downside.length === 0) return 0;
  const downsideDeviation = Math.sqrt(mean(downside.map(r => Math.pow(r - targetReturn, 2))));
  if (downsideDeviation === 0) return 0;
  return (avgReturn - targetReturn) / downsideDeviation;
}

export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) return 0;
  const avgReturn = mean(returns);
  const std = stdDev(returns);
  if (std === 0) return 0;
  return (avgReturn - riskFreeRate) / std;
}

export function calculateWinRate(trades: Array<{pnl: number}>) {
  if (trades.length === 0) return { winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 };
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  
  const winRate = (wins.length / trades.length) * 100;
  const avgWin = wins.length > 0 ? mean(wins.map(t => t.pnl)) : 0;
  const avgLoss = losses.length > 0 ? Math.abs(mean(losses.map(t => t.pnl))) : 0;
  const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLosses !== 0 ? totalWins / totalLosses : 0;
  
  return { winRate, avgWin, avgLoss, profitFactor };
}

export function calculateReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    } else {
      returns.push(0);
    }
  }
  return returns;
}

export function calculateCovarianceMatrix(returnsSeries: number[][]): number[][] {
  if (returnsSeries.length === 0) return [];
  const n = returnsSeries.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = covariance(returnsSeries[i], returnsSeries[j]);
    }
  }
  
  return matrix;
}

export function calculateExpectedReturns(returns: number[]): number {
  if (returns.length === 0) return 0;
  return mean(returns);
}

export function optimizePositionSize(
  accountBalance: number,
  riskPercentage: number,
  stopLossDistance: number,
  price: number
): number {
  if (accountBalance <= 0 || stopLossDistance <= 0 || price <= 0) return 0;
  
  const riskAmount = accountBalance * (riskPercentage / 100);
  const positionSize = riskAmount / stopLossDistance;
  
  return Math.floor(positionSize / price);
}

export function calculatePortfolioMetrics(
  values: number[],
  returns: number[],
  riskFreeRate: number = 0,
  trades?: Array<{pnl: number}>
) {
  if (values.length === 0 || returns.length === 0) {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      volatility: 0,
      calmarRatio: 0,
      sortinoRatio: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0
    };
  }

  const totalReturn = calculateTotalReturn(values[0], values[values.length - 1]);
  const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(values);
  const sharpeRatio = calculateSharpeRatio(returns, riskFreeRate);
  const volatility = calculateVolatility(returns);
  const calmarRatio = calculateCalmarRatio(totalReturn.percentage, maxDrawdownPercent);
  const sortinoRatio = calculateSortinoRatio(returns, riskFreeRate);
  
  let winMetrics = { winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 };
  if (trades && trades.length > 0) {
    winMetrics = calculateWinRate(trades);
  }

  return {
    totalReturn: totalReturn.absolute,
    totalReturnPercent: totalReturn.percentage,
    sharpeRatio,
    maxDrawdown,
    maxDrawdownPercent,
    volatility,
    calmarRatio,
    sortinoRatio,
    ...winMetrics
  };
}