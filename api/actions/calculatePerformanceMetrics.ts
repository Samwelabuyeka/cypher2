import { ActionOptions } from "gadget-server";

interface UserMetrics {
  userId: string;
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  volatility: number;
  numberOfTrades: number;
  totalPnL: number;
  riskScore: number;
}

interface SummaryStats {
  totalUsersProcessed: number;
  totalMetricsCreated: number;
  totalErrors: number;
  processingTimeMs: number;
  averageReturn: number;
  averageSharpeRatio: number;
}

export const run: ActionRun = async ({ params, logger, api }) => {
  const startTime = Date.now();
  logger.info("Starting performance metrics calculation");
  
  const summary: SummaryStats = {
    totalUsersProcessed: 0,
    totalMetricsCreated: 0,
    totalErrors: 0,
    processingTimeMs: 0,
    averageReturn: 0,
    averageSharpeRatio: 0,
  };

  try {
    // Get all users
    const users = await api.user.findMany({
      select: { id: true, email: true },
    });

    logger.info(`Found ${users.length} users to process`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let totalReturns = 0;
    let totalSharpeRatios = 0;
    let usersWithMetrics = 0;

    // Process each user
    for (const user of users) {
      try {
        logger.info(`Processing metrics for user ${user.id}`);

        // Fetch user's trades from last 30 days
        const trades = await api.trade.findMany({
          filter: {
            userId: { equals: user.id },
            executedAt: { greaterThan: thirtyDaysAgo.toISOString() },
          },
          select: {
            id: true,
            side: true,
            quantity: true,
            price: true,
            value: true,
            fee: true,
            realizedPnL: true,
            executedAt: true,
          },
        });

        // Fetch user's positions
        const positions = await api.position.findMany({
          filter: {
            userId: { equals: user.id },
          },
          select: {
            id: true,
            unrealizedPnL: true,
            quantity: true,
            averageEntryPrice: true,
            currentPrice: true,
            marketValue: true,
          },
        });

        // Fetch user's wallets
        const wallets = await api.wallet.findMany({
          filter: {
            userId: { equals: user.id },
          },
          select: {
            id: true,
            currency: true,
            balance: true,
            availableBalance: true,
            lockedBalance: true,
          },
        });

        // Skip users with no trading activity
        if (trades.length === 0 && positions.length === 0) {
          logger.info(`Skipping user ${user.id} - no trading activity`);
          continue;
        }

        // Calculate metrics
        const metrics = calculateUserMetrics(trades, positions, wallets);

        // Create performance metric record
        await api.performanceMetric.create({
          user: { _link: user.id },
          metricType: "account-performance",
          timeframe: "monthly",
          periodStart: thirtyDaysAgo.toISOString(),
          periodEnd: new Date().toISOString(),
          totalPnL: metrics.totalPnL,
          totalPnLPercent: metrics.totalReturnPercent,
          roi: metrics.totalReturnPercent,
          sharpeRatio: metrics.sharpeRatio,
          maxDrawdown: metrics.maxDrawdown,
          winRate: metrics.winRate,
          numberOfTrades: metrics.numberOfTrades,
          volume: trades.reduce((sum, t) => sum + t.value, 0),
          metrics: {
            avgWin: metrics.avgWin,
            avgLoss: metrics.avgLoss,
            profitFactor: metrics.profitFactor,
            volatility: metrics.volatility,
            riskScore: metrics.riskScore,
          },
        });

        summary.totalMetricsCreated++;
        totalReturns += metrics.totalReturnPercent;
        totalSharpeRatios += metrics.sharpeRatio;
        usersWithMetrics++;

        // Check for significant changes and send notifications
        await detectAnomaliesAndNotify(api, user.id, metrics, logger);

        summary.totalUsersProcessed++;
      } catch (error) {
        logger.error({ error, userId: user.id }, `Error processing user ${user.id}`);
        summary.totalErrors++;
      }
    }

    // Calculate averages
    if (usersWithMetrics > 0) {
      summary.averageReturn = totalReturns / usersWithMetrics;
      summary.averageSharpeRatio = totalSharpeRatios / usersWithMetrics;
    }

    summary.processingTimeMs = Date.now() - startTime;
    
    logger.info({ summary }, "Performance metrics calculation completed");
    
    return summary;
  } catch (error) {
    logger.error({ error }, "Failed to calculate performance metrics");
    throw error;
  }
};

function calculateUserMetrics(trades: any[], positions: any[], wallets: any[]): UserMetrics {
  // Calculate total P&L from trades
  const realizedPnL = trades.reduce((sum, trade) => {
    return sum + (trade.realizedPnL || 0);
  }, 0);

  // Calculate unrealized P&L from positions
  const unrealizedPnL = positions.reduce((sum, position) => {
    return sum + (position.unrealizedPnL || 0);
  }, 0);

  const totalPnL = realizedPnL + unrealizedPnL;

  // Calculate total portfolio value
  const portfolioValue = wallets.reduce((sum, wallet) => {
    return sum + wallet.balance;
  }, 0);

  const totalReturnPercent = portfolioValue > 0 ? (totalPnL / portfolioValue) * 100 : 0;

  // Calculate win rate
  const winningTrades = trades.filter(t => (t.realizedPnL || 0) > 0);
  const losingTrades = trades.filter(t => (t.realizedPnL || 0) < 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  // Calculate average win and loss
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0) / winningTrades.length
    : 0;
  
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnL, 0) / losingTrades.length)
    : 0;

  // Calculate profit factor
  const totalWins = winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnL, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

  // Calculate max drawdown
  let maxDrawdown = 0;
  let peak = 0;
  let runningPnL = 0;

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
  );

  for (const trade of sortedTrades) {
    runningPnL += trade.realizedPnL || 0;
    if (runningPnL > peak) {
      peak = runningPnL;
    }
    const drawdown = peak - runningPnL;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Calculate volatility (standard deviation of returns)
  const returns = trades.map(t => (t.realizedPnL || 0));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
  const variance = squaredDiffs.length > 0 ? squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length : 0;
  const volatility = Math.sqrt(variance);

  // Calculate Sharpe ratio (assuming risk-free rate of 0 for simplicity)
  const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

  // Calculate risk score (Lambda Λ) - higher is riskier
  // Combines volatility, max drawdown, and leverage
  const avgLeverage = positions.length > 0
    ? positions.reduce((sum, p) => sum + (p.leverage || 1), 0) / positions.length
    : 1;
  
  const normalizedVolatility = Math.min(volatility / 1000, 1); // Normalize to 0-1
  const normalizedDrawdown = portfolioValue > 0 ? Math.min(maxDrawdown / portfolioValue, 1) : 0;
  const normalizedLeverage = Math.min(avgLeverage / 10, 1); // Normalize to 0-1
  
  const riskScore = (normalizedVolatility * 0.4 + normalizedDrawdown * 0.4 + normalizedLeverage * 0.2) * 100;

  return {
    userId: "", // Will be set by caller
    totalReturn: totalPnL,
    totalReturnPercent,
    sharpeRatio,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    volatility,
    numberOfTrades: trades.length,
    totalPnL,
    riskScore,
  };
}

async function detectAnomaliesAndNotify(
  api: any,
  userId: string,
  metrics: UserMetrics,
  logger: any
): Promise<void> {
  try {
    // Get previous metrics for comparison
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const previousMetrics = await api.performanceMetric.findMany({
      filter: {
        userId: { equals: userId },
        metricType: { equals: "account-performance" },
        periodEnd: { lessThan: thirtyDaysAgo.toISOString() },
      },
      sort: { periodEnd: "Descending" },
      first: 1,
      select: {
        id: true,
        totalPnLPercent: true,
        sharpeRatio: true,
        maxDrawdown: true,
        winRate: true,
      },
    });

    if (previousMetrics.length === 0) {
      return; // No previous data to compare
    }

    const previous = previousMetrics[0];
    
    // Detect significant changes
    const returnChange = Math.abs(metrics.totalReturnPercent - (previous.totalPnLPercent || 0));
    const sharpeChange = Math.abs(metrics.sharpeRatio - (previous.sharpeRatio || 0));
    const drawdownChange = Math.abs(metrics.maxDrawdown - (previous.maxDrawdown || 0));
    const winRateChange = Math.abs(metrics.winRate - (previous.winRate || 0));

    const notifications = [];

    // Large drawdown detected
    if (metrics.maxDrawdown > 1000 || drawdownChange > 500) {
      notifications.push({
        type: "alert",
        severity: "critical",
        title: "Large Drawdown Detected",
        message: `Your portfolio has experienced a drawdown of ${metrics.maxDrawdown.toFixed(2)}`,
      });
    }

    // Significant return change
    if (returnChange > 10) {
      const direction = metrics.totalReturnPercent > (previous.totalPnLPercent || 0) ? "increased" : "decreased";
      notifications.push({
        type: "alert",
        severity: "warning",
        title: "Significant Return Change",
        message: `Your portfolio return has ${direction} by ${returnChange.toFixed(2)}%`,
      });
    }

    // Win rate drop
    if (winRateChange > 20 && metrics.winRate < (previous.winRate || 0)) {
      notifications.push({
        type: "strategy",
        severity: "warning",
        title: "Win Rate Decline",
        message: `Your win rate has dropped to ${metrics.winRate.toFixed(2)}%`,
      });
    }

    // Create notifications
    for (const notification of notifications) {
      await api.notification.create({
        user: { _link: userId },
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        isRead: false,
      });
    }

    if (notifications.length > 0) {
      logger.info({ userId, notificationCount: notifications.length }, "Created anomaly notifications");
    }
  } catch (error) {
    logger.error({ error, userId }, "Error detecting anomalies");
  }
}

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [
      {
        cron: "0 1 * * *",
      },
    ],
  },
};
