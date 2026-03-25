import { ActionOptions } from "gadget-server";
import {
  calculateOrderFlowImbalance,
  analyzeBidAskPressure,
  detectAggressiveTrading,
  measureFlowToxicity,
  calculateMarketImpact,
  estimateImpactComponents,
  detectSpoofing,
  detectLayering,
  measureEffectiveSpread,
  calculateRealizedSpread,
  analyzeDepthOfBook,
  calculateVWAP,
  calculateTWAP,
  classifyTrade,
  measureInformedTrading,
  identifyPriceDiscovery,
  measureSlippage,
  calculateImplementationShortfall,
  detectHFTActivity,
  identifyQuoteFading,
} from "../lib/analytics/marketMicrostructure";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting market microstructure analysis");

  const symbols = params.symbols || ["BTC/USDT", "ETH/USDT"];
  const lookbackMinutes = params.lookbackMinutes || 5;
  const results: any = {};

  for (const symbol of symbols) {
    try {
      logger.info({ symbol }, "Analyzing microstructure");

      const now = new Date();
      const startTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

      const [trades, orders, marketData] = await Promise.all([
        api.trade.findMany({
          filter: {
            symbol: { equals: symbol },
            executedAt: { greaterThan: startTime.toISOString() },
          },
          select: {
            id: true,
            symbol: true,
            side: true,
            price: true,
            quantity: true,
            executedAt: true,
            isMaker: true,
            fee: true,
          },
          sort: { executedAt: "Ascending" },
          first: 250,
        }),
        api.order.findMany({
          filter: {
            symbol: { equals: symbol },
            placedAt: { greaterThan: startTime.toISOString() },
          },
          select: {
            id: true,
            symbol: true,
            side: true,
            price: true,
            quantity: true,
            filledQuantity: true,
            status: true,
            type: true,
            placedAt: true,
            cancelledAt: true,
          },
          sort: { placedAt: "Ascending" },
          first: 250,
        }),
        api.marketData.findMany({
          filter: {
            symbol: { equals: symbol },
            timestamp: { greaterThan: startTime.toISOString() },
          },
          select: {
            id: true,
            symbol: true,
            open: true,
            high: true,
            low: true,
            close: true,
            volume: true,
            bidPrice: true,
            askPrice: true,
            timestamp: true,
          },
          sort: { timestamp: "Ascending" },
          first: 250,
        }),
      ]);

      if (trades.length === 0 || marketData.length === 0) {
        logger.warn({ symbol }, "Insufficient data for analysis");
        continue;
      }

      const orderFlowImbalance = calculateOrderFlowImbalance(trades);
      const bidAskPressure = analyzeBidAskPressure(trades, marketData);
      const aggressiveTrading = detectAggressiveTrading(trades);
      const flowToxicity = measureFlowToxicity(trades, marketData);

      const marketImpact = calculateMarketImpact(trades, marketData);
      const impactComponents = estimateImpactComponents(trades, marketData);

      const spoofingSignals = detectSpoofing(orders);
      const layeringSignals = detectLayering(orders);

      const effectiveSpread = measureEffectiveSpread(trades, marketData);
      const realizedSpread = calculateRealizedSpread(trades, marketData);
      const depthAnalysis = analyzeDepthOfBook(marketData);

      const vwap = calculateVWAP(trades);
      const twap = calculateTWAP(marketData);

      const tradeClassifications = trades.map((trade) =>
        classifyTrade(trade, marketData)
      );
      const informedTrading = measureInformedTrading(trades, marketData);

      const priceDiscovery = identifyPriceDiscovery(trades, marketData);

      const slippage = measureSlippage(trades, orders);
      const implementationShortfall = calculateImplementationShortfall(
        trades,
        marketData
      );

      const hftActivity = detectHFTActivity(trades, orders);
      const quoteFading = identifyQuoteFading(orders, trades);

      const buyVolume = trades
        .filter((t) => t.side === "buy")
        .reduce((sum, t) => sum + (t.quantity * t.price), 0);
      const sellVolume = trades
        .filter((t) => t.side === "sell")
        .reduce((sum, t) => sum + (t.quantity * t.price), 0);
      const totalVolume = buyVolume + sellVolume;

      const microstructureMetrics = {
        orderFlow: {
          imbalance: orderFlowImbalance,
          bidAskPressure: bidAskPressure,
          aggressiveTrading: aggressiveTrading,
          toxicity: flowToxicity,
        },
        marketImpact: {
          overall: marketImpact,
          permanent: impactComponents.permanent,
          temporary: impactComponents.temporary,
        },
        manipulation: {
          spoofing: spoofingSignals,
          layering: layeringSignals,
        },
        liquidity: {
          effectiveSpread: effectiveSpread,
          realizedSpread: realizedSpread,
          depth: depthAnalysis,
        },
        benchmarks: {
          vwap: vwap,
          twap: twap,
        },
        trading: {
          informed: informedTrading,
          priceDiscovery: priceDiscovery,
        },
        execution: {
          slippage: slippage,
          implementationShortfall: implementationShortfall,
        },
        hft: {
          activity: hftActivity,
          quoteFading: quoteFading,
        },
      };

      results[symbol] = microstructureMetrics;

      if (spoofingSignals.detected || layeringSignals.detected) {
        await api.alert.create({
          type: "system-error",
          severity: "warning",
          title: "Market Manipulation Detected",
          message: `Potential manipulation detected in ${symbol}: ${
            spoofingSignals.detected ? "Spoofing " : ""
          }${layeringSignals.detected ? "Layering" : ""}`,
          triggeredAt: new Date().toISOString(),
          metadata: {
            symbol,
            spoofing: spoofingSignals,
            layering: layeringSignals,
          },
        });
      }

      if (flowToxicity > 0.7) {
        await api.alert.create({
          type: "risk-limit-breach",
          severity: "warning",
          title: "High Flow Toxicity",
          message: `Flow toxicity for ${symbol} is ${(
            flowToxicity * 100
          ).toFixed(1)}%`,
          triggeredAt: new Date().toISOString(),
          metadata: {
            symbol,
            toxicity: flowToxicity,
          },
        });
      }

      logger.info(
        { symbol, metrics: microstructureMetrics },
        "Microstructure analysis complete"
      );
    } catch (error) {
      logger.error({ symbol, error }, "Error analyzing microstructure");
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    results,
  };
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        every: "1 minute",
      },
    ],
  },
};

export const params = {
  symbols: { type: "json" },
  lookbackMinutes: { type: "number" },
};
