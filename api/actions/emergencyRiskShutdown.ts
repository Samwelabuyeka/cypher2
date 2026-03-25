import type { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const { reason, severity = 'critical', affectedBots = [] } = params;

  logger.error({ reason, severity, affectedBots }, "Emergency risk shutdown initiated");

  const stats = {
    botsStopped: 0,
    ordersCancelled: 0,
    positionsClosed: 0,
    usersNotified: 0,
  };

  const affectedUserIds = new Set<string>();

  // Step 1: Find trading bots to stop
  let bots;
  if (affectedBots.length === 0) {
    // Get all active bots
    bots = await api.tradingBot.findMany({
      filter: {
        isActive: { equals: true },
      },
      select: {
        id: true,
        userId: true,
        name: true,
      },
    });
  } else {
    // Get specific bots
    bots = await api.tradingBot.findMany({
      filter: {
        id: { in: affectedBots },
        isActive: { equals: true },
      },
      select: {
        id: true,
        userId: true,
        name: true,
      },
    });
  }

  logger.info(`Found ${bots.length} active bots to stop`);

  // Step 2: Stop all affected bots
  const now = new Date();
  for (const bot of bots) {
    await api.tradingBot.update(bot.id, {
      isActive: false,
      status: "paused",
      stoppedAt: now,
      lastError: `Emergency shutdown: ${reason}`,
      lastErrorAt: now,
    });
    
    stats.botsStopped++;
    affectedUserIds.add(bot.userId);
    
    logger.info({ botId: bot.id, botName: bot.name }, "Bot stopped");
  }

  const botIds = bots.map(b => b.id);

  // Step 3: Cancel all pending orders for affected bots
  if (botIds.length > 0) {
    const pendingOrders = await api.order.findMany({
      filter: {
        strategy: {
          id: { in: botIds },
        },
        status: { equals: "pending" },
      },
      select: {
        id: true,
        symbol: true,
      },
    });

    logger.info(`Found ${pendingOrders.length} pending orders to cancel`);

    for (const order of pendingOrders) {
      await api.order.update(order.id, {
        status: "cancelled",
        cancelledAt: now,
        metadata: {
          cancelReason: 'emergency-shutdown',
          shutdownReason: reason,
          shutdownTime: now.toISOString(),
        },
      });
      
      stats.ordersCancelled++;
      logger.info({ orderId: order.id, symbol: order.symbol }, "Order cancelled");
    }
  }

  // Step 4: Close high-risk open positions
  if (botIds.length > 0) {
    const openPositions = await api.position.findMany({
      filter: {
        strategy: {
          id: { in: botIds },
        },
      },
      select: {
        id: true,
        symbol: true,
        side: true,
        quantity: true,
        currentPrice: true,
        averageEntryPrice: true,
        unrealizedPnLPercent: true,
        strategyId: true,
        tradingAccountId: true,
      },
    });

    logger.info(`Found ${openPositions.length} open positions to evaluate`);

    for (const position of openPositions) {
      // Calculate risk based on unrealized loss
      const risk = position.unrealizedPnLPercent ? Math.abs(position.unrealizedPnLPercent) : 0;
      
      if (risk > 80) {
        // Close position with market order
        const closeSide = position.side === "long" ? "sell" : "buy";
        
        try {
          await api.order.create({
            symbol: position.symbol,
            side: closeSide,
            type: "market",
            quantity: position.quantity,
            status: "pending",
            strategy: { _link: position.strategyId },
            tradingAccount: { _link: position.tradingAccountId },
            user: { _link: bots.find(b => b.id === position.strategyId)?.userId || "" },
            metadata: {
              emergencyClose: true,
              reason: 'emergency-risk-shutdown',
              originalPositionId: position.id,
              riskLevel: risk,
            },
          });
          
          stats.positionsClosed++;
          logger.warn(
            { 
              positionId: position.id, 
              symbol: position.symbol, 
              risk,
            }, 
            "High-risk position queued for liquidation"
          );
        } catch (error) {
          logger.error(
            { 
              error, 
              positionId: position.id,
            }, 
            "Failed to create liquidation order for position"
          );
        }
      }
    }
  }

  // Step 5: Create notifications for all affected users
  const userArray = Array.from(affectedUserIds);
  for (const userId of userArray) {
    try {
      await api.notification.create({
        user: { _link: userId },
        type: "system",
        severity: "critical",
        title: "Emergency Trading Shutdown",
        message: `All trading has been automatically stopped due to: ${reason}. Severity: ${severity}. Your bots have been paused and high-risk positions have been queued for closure. Please review your account immediately.`,
        metadata: {
          shutdownReason: reason,
          severity,
          timestamp: now.toISOString(),
          botsStopped: stats.botsStopped,
          ordersCancelled: stats.ordersCancelled,
          positionsClosed: stats.positionsClosed,
        },
      });
      
      stats.usersNotified++;
    } catch (error) {
      logger.error({ error, userId }, "Failed to create notification for user");
    }
  }

  logger.info(`Notified ${stats.usersNotified} users`);

  // Step 6: Create system-wide alert record
  if (userArray.length > 0) {
    try {
      await api.alert.create({
        user: { _link: userArray[0] }, // Use first user as owner for system alert
        type: "system-error",
        severity: "critical",
        title: "Emergency Risk Shutdown Executed",
        message: {
          markdown: `# Emergency Trading Shutdown\n\n**Reason:** ${reason}\n\n**Severity:** ${severity}\n\n**Impact:**\n- Bots stopped: ${stats.botsStopped}\n- Orders cancelled: ${stats.ordersCancelled}\n- Positions closed: ${stats.positionsClosed}\n- Users affected: ${stats.usersNotified}\n\n**Timestamp:** ${now.toISOString()}`,
        },
        triggeredAt: now,
        metadata: {
          type: 'emergency-shutdown',
          reason,
          severity,
          affectedUsers: stats.usersNotified,
          affectedBots: stats.botsStopped,
          stats,
        },
      });
    } catch (error) {
      logger.error({ error }, "Failed to create system alert");
    }
  }

  // Step 7: Return comprehensive shutdown report
  const report = {
    success: true,
    botsStopped: stats.botsStopped,
    ordersCancelled: stats.ordersCancelled,
    positionsClosed: stats.positionsClosed,
    usersNotified: stats.usersNotified,
    reason,
    severity,
    timestamp: now.toISOString(),
  };

  logger.error(report, "Emergency risk shutdown completed");

  return report;
};

export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};

export const params = {
  reason: {
    type: "string",
    required: true,
  },
  severity: {
    type: "string",
    enum: ["high", "critical"],
    default: "critical",
  },
  affectedBots: {
    type: "array",
    items: {
      type: "string",
    },
    default: [],
  },
};
