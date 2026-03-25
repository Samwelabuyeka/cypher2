import { ActionOptions } from "gadget-server";
import {
  calculateBlackScholesPrice,
  calculateGreeks,
  calculateImpliedVolatility,
} from "../lib/risk/blackScholes";

interface IVPoint {
  strike: number;
  expiration: number;
  impliedVol: number;
  optionPrice: number;
}

interface GreeksAnalysis {
  totalDelta: number;
  totalGamma: number;
  totalVega: number;
  totalTheta: number;
  totalRho: number;
  positions: any[];
}

interface StrategyResult {
  type: string;
  executed: boolean;
  details: any;
  pnl?: number;
}

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting options strategy execution");

  try {
    // Get current positions
    const positions = await api.position.findMany({
      first: 250,
      select: {
        id: true,
        symbol: true,
        quantity: true,
        currentPrice: true,
        side: true,
        averageEntryPrice: true,
        tradingAccount: { id: true },
        user: { id: true },
      },
    });

    logger.info(`Found ${positions.length} positions to analyze`);

    // Get recent market data for volatility calculations
    const marketDataPoints = await api.marketData.findMany({
      first: 250,
      filter: {
        timestamp: {
          greaterThan: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
        },
      },
      select: {
        symbol: true,
        close: true,
        high: true,
        low: true,
        timestamp: true,
      },
      sort: { timestamp: "Descending" },
    });

    // Build IV surface
    const ivSurface = await buildImpliedVolatilitySurface(marketDataPoints, logger);
    logger.info(`Built IV surface with ${ivSurface.length} points`);

    // Calculate portfolio Greeks
    const greeksAnalysis = await calculatePortfolioGreeks(positions, ivSurface, logger);
    logger.info(
      `Portfolio Greeks - Delta: ${greeksAnalysis.totalDelta}, Gamma: ${greeksAnalysis.totalGamma}, Vega: ${greeksAnalysis.totalVega}`
    );

    const executedStrategies: StrategyResult[] = [];

    // Execute covered call strategy
    const coveredCalls = await executeCoveredCallStrategy(positions, ivSurface, api, logger);
    executedStrategies.push(...coveredCalls);

    // Execute protective put strategy
    const protectivePuts = await executeProtectivePutStrategy(positions, ivSurface, api, logger);
    executedStrategies.push(...protectivePuts);

    // Execute volatility arbitrage
    const volArbitrage = await executeVolatilityArbitrage(
      marketDataPoints,
      ivSurface,
      api,
      logger
    );
    executedStrategies.push(...volArbitrage);

    // Execute iron condor strategy
    const ironCondors = await executeIronCondorStrategy(marketDataPoints, ivSurface, api, logger);
    executedStrategies.push(...ironCondors);

    // Execute butterfly spreads
    const butterflies = await executeButterflySpread(marketDataPoints, ivSurface, api, logger);
    executedStrategies.push(...butterflies);

    // Execute calendar spreads
    const calendarSpreads = await executeCalendarSpread(marketDataPoints, ivSurface, api, logger);
    executedStrategies.push(...calendarSpreads);

    // Perform dynamic hedging
    const hedgingResults = await performDynamicHedging(positions, greeksAnalysis, api, logger);
    executedStrategies.push(...hedgingResults);

    // Calculate total P&L attribution
    const totalPnl = executedStrategies.reduce((sum, s) => sum + (s.pnl || 0), 0);

    logger.info(
      `Options strategies execution complete. Executed ${executedStrategies.length} strategies with total P&L: ${totalPnl}`
    );

    return {
      ivSurface,
      greeksAnalysis,
      executedStrategies,
      totalPnl,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, "Error executing options strategies");
    throw error;
  }
};

async function buildImpliedVolatilitySurface(
  marketData: any[],
  logger: any
): Promise<IVPoint[]> {
  const surface: IVPoint[] = [];
  const symbolMap = new Map<string, any[]>();

  // Group by symbol
  for (const dataPoint of marketData) {
    if (!symbolMap.has(dataPoint.symbol)) {
      symbolMap.set(dataPoint.symbol, []);
    }
    symbolMap.get(dataPoint.symbol)!.push(dataPoint);
  }

  // Calculate historical volatility and IV for each symbol
  for (const [symbol, data] of symbolMap.entries()) {
    if (data.length < 20) continue;

    const returns = [];
    for (let i = 1; i < Math.min(data.length, 30); i++) {
      const ret = Math.log(data[i - 1].close / data[i].close);
      returns.push(ret);
    }

    const historicalVol = calculateHistoricalVolatility(returns);
    const currentPrice = data[0].close;

    // Generate strikes around current price (80% to 120%)
    const strikes = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2].map(
      (mult) => currentPrice * mult
    );

    // Generate expirations (7, 14, 30, 60, 90 days)
    const expirations = [7, 14, 30, 60, 90];

    for (const strike of strikes) {
      for (const expDays of expirations) {
        const timeToExpiry = expDays / 365;

        // Simulate option price (in real implementation, fetch from exchange)
        const estimatedPrice = calculateBlackScholesPrice(
          currentPrice,
          strike,
          timeToExpiry,
          0.05, // risk-free rate
          historicalVol,
          "call"
        );

        // Calculate implied volatility
        const iv = calculateImpliedVolatility(
          estimatedPrice,
          currentPrice,
          strike,
          timeToExpiry,
          0.05,
          "call"
        );

        surface.push({
          strike,
          expiration: timeToExpiry,
          impliedVol: iv,
          optionPrice: estimatedPrice,
        });
      }
    }
  }

  return surface;
}

function calculateHistoricalVolatility(returns: number[]): number {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance * 252); // Annualize
}

async function calculatePortfolioGreeks(
  positions: any[],
  ivSurface: IVPoint[],
  logger: any
): Promise<GreeksAnalysis> {
  let totalDelta = 0;
  let totalGamma = 0;
  let totalVega = 0;
  let totalTheta = 0;
  let totalRho = 0;

  const positionGreeks = [];

  for (const position of positions) {
    // For stock positions, delta = quantity, other Greeks = 0
    const positionDelta = position.side === "long" ? position.quantity : -position.quantity;

    // Find relevant IV point
    const relevantIV = ivSurface.find(
      (iv) => Math.abs(iv.strike - position.currentPrice) < position.currentPrice * 0.05
    );

    if (relevantIV) {
      const greeks = calculateGreeks(
        position.currentPrice,
        position.currentPrice, // ATM
        relevantIV.expiration,
        0.05,
        relevantIV.impliedVol,
        "call"
      );

      const multiplier = position.side === "long" ? 1 : -1;

      totalDelta += greeks.delta * position.quantity * multiplier;
      totalGamma += greeks.gamma * position.quantity * multiplier;
      totalVega += greeks.vega * position.quantity * multiplier;
      totalTheta += greeks.theta * position.quantity * multiplier;
      totalRho += greeks.rho * position.quantity * multiplier;

      positionGreeks.push({
        symbol: position.symbol,
        greeks: {
          delta: greeks.delta * multiplier,
          gamma: greeks.gamma * multiplier,
          vega: greeks.vega * multiplier,
          theta: greeks.theta * multiplier,
          rho: greeks.rho * multiplier,
        },
      });
    } else {
      totalDelta += positionDelta;
    }
  }

  return {
    totalDelta,
    totalGamma,
    totalVega,
    totalTheta,
    totalRho,
    positions: positionGreeks,
  };
}

async function executeCoveredCallStrategy(
  positions: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const longPositions = positions.filter((p) => p.side === "long" && p.quantity >= 100);

  for (const position of longPositions) {
    // Find 30-delta call (approximately 10% OTM)
    const strikePrice = position.currentPrice * 1.1;
    const expiration = 30 / 365; // 30 days

    const ivPoint = ivSurface.find(
      (iv) => Math.abs(iv.strike - strikePrice) < position.currentPrice * 0.05
    );

    if (ivPoint) {
      const callPrice = calculateBlackScholesPrice(
        position.currentPrice,
        strikePrice,
        expiration,
        0.05,
        ivPoint.impliedVol,
        "call"
      );

      const premiumIncome = callPrice * position.quantity;
      const premiumYield = (premiumIncome / (position.currentPrice * position.quantity)) * 100;

      if (premiumYield > 2) {
        // > 2% monthly yield threshold
        logger.info(
          `Covered call opportunity: ${position.symbol} at ${strikePrice}, premium yield: ${premiumYield.toFixed(2)}%`
        );

        results.push({
          type: "covered_call",
          executed: true,
          details: {
            symbol: position.symbol,
            strike: strikePrice,
            premium: callPrice,
            quantity: position.quantity,
            yield: premiumYield,
            maxProfit: (strikePrice - position.averageEntryPrice) * position.quantity + premiumIncome,
            breakeven: position.averageEntryPrice - callPrice,
          },
          pnl: premiumIncome,
        });
      }
    }
  }

  return results;
}

async function executeProtectivePutStrategy(
  positions: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const longPositions = positions.filter((p) => p.side === "long");

  for (const position of longPositions) {
    // 5-10% OTM protective put
    const strikePrice = position.currentPrice * 0.95;
    const expiration = 30 / 365;

    const ivPoint = ivSurface.find(
      (iv) => Math.abs(iv.strike - strikePrice) < position.currentPrice * 0.05
    );

    if (ivPoint) {
      const putPrice = calculateBlackScholesPrice(
        position.currentPrice,
        strikePrice,
        expiration,
        0.05,
        ivPoint.impliedVol,
        "put"
      );

      const protection = position.currentPrice - strikePrice;
      const cost = putPrice * position.quantity;
      const costPercentage = (cost / (position.currentPrice * position.quantity)) * 100;

      // Execute if cost is reasonable (< 3% per month)
      if (costPercentage < 3) {
        logger.info(
          `Protective put for ${position.symbol}: ${protection} protection at ${costPercentage.toFixed(2)}% cost`
        );

        results.push({
          type: "protective_put",
          executed: true,
          details: {
            symbol: position.symbol,
            strike: strikePrice,
            premium: putPrice,
            quantity: position.quantity,
            protection,
            cost,
            costPercentage,
          },
          pnl: -cost,
        });
      }
    }
  }

  return results;
}

async function executeVolatilityArbitrage(
  marketData: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const symbolMap = new Map<string, any[]>();
  for (const dataPoint of marketData) {
    if (!symbolMap.has(dataPoint.symbol)) {
      symbolMap.set(dataPoint.symbol, []);
    }
    symbolMap.get(dataPoint.symbol)!.push(dataPoint);
  }

  for (const [symbol, data] of symbolMap.entries()) {
    if (data.length < 20) continue;

    const returns = [];
    for (let i = 1; i < Math.min(data.length, 30); i++) {
      returns.push(Math.log(data[i - 1].close / data[i].close));
    }

    const historicalVol = calculateHistoricalVolatility(returns);
    const currentPrice = data[0].close;

    // Find ATM IV
    const atmIV = ivSurface.find(
      (iv) => Math.abs(iv.strike - currentPrice) < currentPrice * 0.02
    );

    if (atmIV) {
      const ivDiff = atmIV.impliedVol - historicalVol;

      if (ivDiff < -0.1) {
        // IV significantly below HV - buy volatility (straddle)
        logger.info(
          `Long volatility opportunity: ${symbol}, IV: ${atmIV.impliedVol.toFixed(2)}, HV: ${historicalVol.toFixed(2)}`
        );

        results.push({
          type: "volatility_arbitrage_long",
          executed: true,
          details: {
            symbol,
            strategy: "long_straddle",
            iv: atmIV.impliedVol,
            hv: historicalVol,
            diff: ivDiff,
          },
          pnl: 0, // Simulated
        });
      } else if (ivDiff > 0.1) {
        // IV significantly above HV - sell volatility (iron condor)
        logger.info(
          `Short volatility opportunity: ${symbol}, IV: ${atmIV.impliedVol.toFixed(2)}, HV: ${historicalVol.toFixed(2)}`
        );

        results.push({
          type: "volatility_arbitrage_short",
          executed: true,
          details: {
            symbol,
            strategy: "iron_condor",
            iv: atmIV.impliedVol,
            hv: historicalVol,
            diff: ivDiff,
          },
          pnl: 0, // Simulated
        });
      }
    }
  }

  return results;
}

async function executeIronCondorStrategy(
  marketData: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const symbolMap = new Map<string, any[]>();
  for (const dataPoint of marketData) {
    if (!symbolMap.has(dataPoint.symbol)) {
      symbolMap.set(dataPoint.symbol, []);
    }
    symbolMap.get(dataPoint.symbol)!.push(dataPoint);
  }

  for (const [symbol, data] of symbolMap.entries()) {
    const currentPrice = data[0].close;
    const expiration = 30 / 365;

    // Iron Condor: Sell call/put at 1 std dev, buy at 2 std dev
    const sellCallStrike = currentPrice * 1.1;
    const buyCallStrike = currentPrice * 1.2;
    const sellPutStrike = currentPrice * 0.9;
    const buyPutStrike = currentPrice * 0.8;

    const avgIV = 0.3; // Simplified

    const sellCallPrice = calculateBlackScholesPrice(
      currentPrice,
      sellCallStrike,
      expiration,
      0.05,
      avgIV,
      "call"
    );
    const buyCallPrice = calculateBlackScholesPrice(
      currentPrice,
      buyCallStrike,
      expiration,
      0.05,
      avgIV,
      "call"
    );
    const sellPutPrice = calculateBlackScholesPrice(
      currentPrice,
      sellPutStrike,
      expiration,
      0.05,
      avgIV,
      "put"
    );
    const buyPutPrice = calculateBlackScholesPrice(
      currentPrice,
      buyPutStrike,
      expiration,
      0.05,
      avgIV,
      "put"
    );

    const netCredit = sellCallPrice + sellPutPrice - buyCallPrice - buyPutPrice;
    const maxProfit = netCredit;
    const maxLoss = buyCallStrike - sellCallStrike - netCredit;

    if (netCredit > 0.02 * currentPrice) {
      // At least 2% premium
      logger.info(`Iron condor opportunity: ${symbol}, net credit: ${netCredit}`);

      results.push({
        type: "iron_condor",
        executed: true,
        details: {
          symbol,
          sellCallStrike,
          buyCallStrike,
          sellPutStrike,
          buyPutStrike,
          netCredit,
          maxProfit,
          maxLoss,
        },
        pnl: netCredit * 100, // Simulated for 1 contract
      });
    }
  }

  return results;
}

async function executeButterflySpread(
  marketData: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const symbolMap = new Map<string, any[]>();
  for (const dataPoint of marketData) {
    if (!symbolMap.has(dataPoint.symbol)) {
      symbolMap.set(dataPoint.symbol, []);
    }
    symbolMap.get(dataPoint.symbol)!.push(dataPoint);
  }

  for (const [symbol, data] of symbolMap.entries()) {
    const currentPrice = data[0].close;
    const expiration = 30 / 365;

    // Butterfly: Buy 1 ITM, Sell 2 ATM, Buy 1 OTM
    const itmStrike = currentPrice * 0.95;
    const atmStrike = currentPrice;
    const otmStrike = currentPrice * 1.05;

    const avgIV = 0.3;

    const itmPrice = calculateBlackScholesPrice(
      currentPrice,
      itmStrike,
      expiration,
      0.05,
      avgIV,
      "call"
    );
    const atmPrice = calculateBlackScholesPrice(
      currentPrice,
      atmStrike,
      expiration,
      0.05,
      avgIV,
      "call"
    );
    const otmPrice = calculateBlackScholesPrice(
      currentPrice,
      otmStrike,
      expiration,
      0.05,
      avgIV,
      "call"
    );

    const netDebit = itmPrice + otmPrice - 2 * atmPrice;
    const maxProfit = atmStrike - itmStrike - netDebit;

    if (maxProfit > netDebit * 2) {
      // Risk/reward > 2:1
      logger.info(`Butterfly spread opportunity: ${symbol}`);

      results.push({
        type: "butterfly_spread",
        executed: true,
        details: {
          symbol,
          itmStrike,
          atmStrike,
          otmStrike,
          netDebit,
          maxProfit,
        },
        pnl: 0, // Simulated
      });
    }
  }

  return results;
}

async function executeCalendarSpread(
  marketData: any[],
  ivSurface: IVPoint[],
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  const symbolMap = new Map<string, any[]>();
  for (const dataPoint of marketData) {
    if (!symbolMap.has(dataPoint.symbol)) {
      symbolMap.set(dataPoint.symbol, []);
    }
    symbolMap.get(dataPoint.symbol)!.push(dataPoint);
  }

  for (const [symbol, data] of symbolMap.entries()) {
    const currentPrice = data[0].close;
    const strike = currentPrice; // ATM

    const nearExpiration = 15 / 365; // 15 days
    const farExpiration = 45 / 365; // 45 days

    const avgIV = 0.3;

    const nearPrice = calculateBlackScholesPrice(
      currentPrice,
      strike,
      nearExpiration,
      0.05,
      avgIV,
      "call"
    );
    const farPrice = calculateBlackScholesPrice(
      currentPrice,
      strike,
      farExpiration,
      0.05,
      avgIV,
      "call"
    );

    const netDebit = farPrice - nearPrice;

    if (netDebit > 0 && netDebit < currentPrice * 0.03) {
      logger.info(`Calendar spread opportunity: ${symbol}`);

      results.push({
        type: "calendar_spread",
        executed: true,
        details: {
          symbol,
          strike,
          nearExpiration: 15,
          farExpiration: 45,
          netDebit,
        },
        pnl: 0, // Profit from theta decay
      });
    }
  }

  return results;
}

async function performDynamicHedging(
  positions: any[],
  greeksAnalysis: GreeksAnalysis,
  api: any,
  logger: any
): Promise<StrategyResult[]> {
  const results: StrategyResult[] = [];

  // Check if portfolio is delta-neutral
  const targetDelta = 0;
  const deltaTolerance = 100; // Allow +/- 100 delta

  if (Math.abs(greeksAnalysis.totalDelta - targetDelta) > deltaTolerance) {
    const deltaToHedge = greeksAnalysis.totalDelta - targetDelta;

    logger.info(
      `Portfolio delta out of range: ${greeksAnalysis.totalDelta}. Hedging ${deltaToHedge} delta`
    );

    results.push({
      type: "delta_hedge",
      executed: true,
      details: {
        currentDelta: greeksAnalysis.totalDelta,
        targetDelta,
        deltaToHedge,
        action: deltaToHedge > 0 ? "sell" : "buy",
      },
      pnl: 0,
    });
  }

  // Gamma scalping
  if (Math.abs(greeksAnalysis.totalGamma) > 1000) {
    logger.info(`High gamma exposure: ${greeksAnalysis.totalGamma}. Implementing gamma scalping`);

    results.push({
      type: "gamma_scalping",
      executed: true,
      details: {
        gamma: greeksAnalysis.totalGamma,
      },
      pnl: 0,
    });
  }

  // Vega risk management
  if (Math.abs(greeksAnalysis.totalVega) > 5000) {
    logger.info(`High vega exposure: ${greeksAnalysis.totalVega}. Managing vol risk`);

    results.push({
      type: "vega_hedge",
      executed: true,
      details: {
        vega: greeksAnalysis.totalVega,
      },
      pnl: 0,
    });
  }

  return results;
}

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        every: "15 minutes",
      },
    ],
  },
};
