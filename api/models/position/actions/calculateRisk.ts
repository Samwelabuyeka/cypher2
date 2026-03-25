import { save, ActionOptions, assert } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { calculateEntropy } from "../../../lib/calculations/mathUtils";
import { calculateRiskScore } from "../../../lib/calculations/riskMetrics";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  // Load the position record with relationships
  const position = await api.position.findOne(params.id, {
    select: {
      id: true,
      asset: true,
      symbol: true,
      quantity: true,
      averageEntryPrice: true,
      currentPrice: true,
      side: true,
      leverage: true,
      marginUsed: true,
      liquidationPrice: true,
      unrealizedPnL: true,
      unrealizedPnLPercent: true,
      userId: true,
      user: {
        id: true,
      },
      tradingAccountId: true,
      tradingAccount: {
        id: true,
        accountName: true,
      },
      strategyId: true,
      strategy: {
        id: true,
        name: true,
        riskLevel: true,
      },
    },
  });

  assert(position, "Position not found");

  // Verify user owns this position
  await preventCrossUserDataAccess(params, position);

  // Get current market price
  let currentPrice = params.marketData?.currentPrice;
  
  if (!currentPrice) {
    // Fetch latest market data for this symbol
    const latestMarketData = await api.marketData.findFirst({
      filter: {
        symbol: { equals: position.symbol },
      },
      sort: {
        timestamp: "Descending",
      },
      select: {
        close: true,
      },
    });

    currentPrice = latestMarketData?.close || position.currentPrice || position.averageEntryPrice;
  }

  // Calculate unrealizedPnL
  let unrealizedPnL: number;
  if (position.side === "long") {
    unrealizedPnL = (currentPrice - position.averageEntryPrice) * position.quantity;
  } else {
    // short position
    unrealizedPnL = (position.averageEntryPrice - currentPrice) * position.quantity;
  }

  // Calculate unrealizedPnLPercent
  const positionValue = position.averageEntryPrice * position.quantity;
  const unrealizedPnLPercent = (unrealizedPnL / positionValue) * 100;

  // Calculate volatility for entropy
  const volatility = params.marketData?.volatility || 0.02; // Default 2% if not provided
  
  // Calculate position entropy based on price volatility
  const priceData = [position.averageEntryPrice, currentPrice];
  const entropy = calculateEntropy(priceData);

  // Calculate Λₙ (entropy balance) for this position
  const lambda = entropy * Math.abs(unrealizedPnLPercent) / 100;

  // Calculate Ψ (psychological factor) - based on P&L percentage
  const psi = 1 - Math.exp(-Math.abs(unrealizedPnLPercent) / 50);

  // Calculate Ω (market chaos) - based on volatility
  const omega = volatility * 10; // Scale volatility to 0-1 range

  // Calculate Ξₙ (stability coefficient) using Ψ, Ω, Λ
  const xi = (psi + omega + lambda) / 3;

  // Calculate liquidation risk if leveraged position
  let liquidationDistance = 0;
  let liquidationPrice = position.liquidationPrice;

  if (position.leverage && position.leverage > 1) {
    // Calculate liquidation price if not already set
    if (!liquidationPrice) {
      const marginRatio = 1 / position.leverage;
      if (position.side === "long") {
        liquidationPrice = position.averageEntryPrice * (1 - marginRatio);
      } else {
        liquidationPrice = position.averageEntryPrice * (1 + marginRatio);
      }
    }

    // Calculate distance to liquidation as percentage
    liquidationDistance = Math.abs((currentPrice - liquidationPrice) / currentPrice) * 100;
  }

  // Use calculateRiskScore to get comprehensive risk assessment
  const riskAssessment = calculateRiskScore({
    position: {
      side: position.side,
      quantity: position.quantity,
      averageEntryPrice: position.averageEntryPrice,
      currentPrice,
      leverage: position.leverage || 1,
      unrealizedPnL,
      unrealizedPnLPercent,
    },
    marketConditions: {
      volatility,
      orderBookDepth: params.marketData?.orderBookDepth,
    },
    metrics: {
      entropy,
      lambda,
      xi,
      liquidationDistance,
    },
  });

  const riskScore = riskAssessment.score;

  // Determine risk level
  let riskLevel: string;
  if (riskScore < 30) {
    riskLevel = "low";
  } else if (riskScore < 60) {
    riskLevel = "medium";
  } else if (riskScore < 80) {
    riskLevel = "high";
  } else {
    riskLevel = "critical";
  }

  // Create alert if risk > 70
  if (riskScore > 70) {
    await api.alert.create({
      user: { _link: position.userId },
      type: "position-liquidation-warning",
      severity: "critical",
      title: "High Risk Position Alert",
      message: {
        markdown: `Position **${position.symbol}** (${position.side}) has a critical risk score of **${riskScore.toFixed(2)}**.

**Details:**
- Current Price: $${currentPrice.toFixed(8)}
- Entry Price: $${position.averageEntryPrice.toFixed(8)}
- Unrealized P&L: $${unrealizedPnL.toFixed(2)} (${unrealizedPnLPercent.toFixed(2)}%)
- Leverage: ${position.leverage}x
- Risk Level: ${riskLevel}
- Stability Coefficient (Ξ): ${xi.toFixed(4)}

${liquidationDistance > 0 ? `**Warning:** Position is ${liquidationDistance.toFixed(2)}% away from liquidation at $${liquidationPrice?.toFixed(8)}` : ''}

**Recommended Action:** ${riskAssessment.recommendedAction}`,
      },
      triggeredAt: new Date(),
      relatedModel: "position",
      relatedId: position.id,
    });
  }

  // Update position record
  record.currentPrice = currentPrice;
  record.unrealizedPnL = unrealizedPnL;
  record.unrealizedPnLPercent = unrealizedPnLPercent;
  record.lastUpdatedAt = new Date();

  if (liquidationPrice && !position.liquidationPrice) {
    record.liquidationPrice = liquidationPrice;
  }

  await save(record);

  // Return comprehensive risk assessment
  return {
    riskScore,
    riskLevel,
    recommendedAction: riskAssessment.recommendedAction,
    unrealizedPnL,
    unrealizedPnLPercent,
    metadata: {
      lambda,
      xi,
      entropy,
      volatility,
      liquidationDistance,
      currentPrice,
    },
  };
};

export const params = {
  marketData: {
    type: "object" as const,
    properties: {
      currentPrice: { type: "number" as const },
      volatility: { type: "number" as const },
      orderBookDepth: {
        type: "object" as const,
        properties: {
          bidVolume: { type: "number" as const },
          askVolume: { type: "number" as const },
        },
      },
    },
  },
};

export const options: ActionOptions = {
  actionType: "custom",
  triggers: {
    api: true,
  },
};
