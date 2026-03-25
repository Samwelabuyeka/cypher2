import { ActionOptions } from "gadget-server";
import { calculateEntropy, generateTradingSignal } from "../lib/calculations/orderFlowAnalysis";
import { calculateRiskScore } from "../lib/calculations/riskMetrics";
import { detectPatterns } from "../lib/calculations/machineLearning";
import { 
  calculatePsi, 
  calculateOmega, 
  calculateLambda, 
  calculateXi, 
  calculatePhi 
} from "../lib/calculations/mathUtils";

export const run: ActionRun = async ({ params, logger, api }) => {
  logger.info("Starting market analysis", { params });

  // Parse and validate params
  const depth = Math.min(Math.max(params.depth || 3, 1), 5);
  const timeframe = params.timeframe || "1h";
  
  // Determine assets to analyze
  let assetsToAnalyze: string[] = params.assets || [];
  
  if (assetsToAnalyze.length === 0) {
    // Get all active strategies and extract unique assets
    const strategies = await api.strategy.findMany({
      filter: { isActive: { equals: true } },
      select: { assets: true }
    });
    
    const assetSet = new Set<string>();
    for (const strategy of strategies) {
      if (strategy.assets && Array.isArray(strategy.assets)) {
        strategy.assets.forEach((asset) => assetSet.add(asset as string));
      }
    }
    assetsToAnalyze = Array.from(assetSet);
  }

  if (assetsToAnalyze.length === 0) {
    logger.warn("No assets to analyze");
    return {
      analyzed: 0,
      opportunities: [],
      warnings: [],
      topSignals: []
    };
  }

  logger.info(`Analyzing ${assetsToAnalyze.length} assets with depth ${depth} and timeframe ${timeframe}`);

  // Analyze all assets in parallel
  const analysisPromises = assetsToAnalyze.map(async (symbol) => {
    try {
      // Fetch latest market data
      const marketData = await api.marketData.findMany({
        filter: {
          symbol: { equals: symbol },
          interval: { equals: timeframe }
        },
        sort: { timestamp: "Descending" },
        first: 100,
        select: {
          timestamp: true,
          open: true,
          high: true,
          low: true,
          close: true,
          volume: true
        }
      });

      if (marketData.length === 0) {
        logger.warn(`No market data found for ${symbol}`);
        return null;
      }

      const latestPrice = marketData[0].close;
      const prices = marketData.map(d => d.close);
      const volumes = marketData.map(d => d.volume);

      // Calculate market entropy
      const entropy = calculateEntropy(prices);

      // Generate trading signals
      const signal = generateTradingSignal(marketData, depth) as { type: string; strength: number; confidence: number };

      // Calculate mathematical constants
      const psi = calculatePsi(prices);
      const omega = calculateOmega(entropy);
      const lambda = calculateLambda(prices);
      const xi = calculateXi(prices, volumes);
      const phi = calculatePhi(entropy);

      // Calculate risk score
      const riskScore = calculateRiskScore(prices, volumes, entropy);

      // Detect patterns
      const patterns = (await detectPatterns(prices)) as Array<{ type: string }>;

      // Store analysis results in performanceMetric
      const periodStart = marketData[marketData.length - 1].timestamp;
      const periodEnd = marketData[0].timestamp;
      
      if (!periodStart || !periodEnd) {
        logger.warn(`Missing timestamp data for ${symbol}`);
        return null;
      }

      await api.performanceMetric.create({
        metricType: "market-analysis",
        timeframe,
        periodStart,
        periodEnd,
        metrics: {
          symbol,
          entropy,
          signal: signal.type,
          signalStrength: signal.strength,
          confidence: signal.confidence,
          psi,
          omega,
          lambda,
          xi,
          phi,
          riskScore,
          patterns: patterns.map(p => p.type),
          latestPrice
        }
      });

      // Create alerts for high-confidence signals
      const alerts = [];
      
      if (signal.confidence > 80) {
        alerts.push({
          type: "profit-target",
          severity: signal.type === "buy" ? "info" : "warning",
          title: `High-Confidence ${signal.type.toUpperCase()} Signal: ${symbol}`,
          message: `${signal.type.toUpperCase()} signal detected for ${symbol} with ${signal.confidence.toFixed(1)}% confidence at $${latestPrice.toFixed(2)}`,
          metadata: {
            symbol,
            signal: signal.type,
            confidence: signal.confidence,
            price: latestPrice
          }
        });
      }

      if (riskScore > 80) {
        alerts.push({
          type: "risk-limit-breach",
          severity: "critical",
          title: `Critical Risk Warning: ${symbol}`,
          message: `High risk detected for ${symbol} with risk score ${riskScore.toFixed(1)}`,
          metadata: {
            symbol,
            riskScore,
            price: latestPrice
          }
        });
      }

      if (phi > 1.5) {
        alerts.push({
          type: "profit-target",
          severity: "info",
          title: `Emerging Opportunity: ${symbol}`,
          message: `High Φ value (${phi.toFixed(2)}) detected for ${symbol} indicating potential opportunity`,
          metadata: {
            symbol,
            phi,
            price: latestPrice
          }
        });
      }

      // Create alerts in database
      const currentUser = await api.user.findFirst();
      if (currentUser) {
        for (const alertData of alerts) {
          await api.alert.create({
            ...alertData,
            triggeredAt: new Date(),
            user: { _link: currentUser.id }
          });
        }
      }

      return {
        symbol,
        entropy,
        signal,
        riskScore,
        phi,
        patterns,
        alerts,
        latestPrice
      };
    } catch (error) {
      logger.error(`Error analyzing ${symbol}`, { error });
      return null;
    }
  });

  const results = await Promise.all(analysisPromises);
  const validResults = results.filter(r => r !== null);

  // Prepare summary
  const opportunities = validResults
    .filter(r => r.signal.type === "buy" && r.signal.confidence > 70)
    .sort((a, b) => b.signal.confidence - a.signal.confidence)
    .slice(0, 10)
    .map(r => ({
      symbol: r.symbol,
      confidence: r.signal.confidence,
      price: r.latestPrice,
      phi: r.phi
    }));

  const warnings = validResults
    .filter(r => r.riskScore > 60)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map(r => ({
      symbol: r.symbol,
      riskScore: r.riskScore,
      price: r.latestPrice
    }));

  const topSignals = validResults
    .sort((a, b) => b.signal.confidence - a.signal.confidence)
    .slice(0, 10)
    .map(r => ({
      symbol: r.symbol,
      type: r.signal.type,
      confidence: r.signal.confidence,
      price: r.latestPrice
    }));

  logger.info("Market analysis complete", {
    analyzed: validResults.length,
    opportunities: opportunities.length,
    warnings: warnings.length
  });

  return {
    analyzed: validResults.length,
    opportunities,
    warnings,
    topSignals
  };
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "*/5 * * * *" }]
  }
};

export const params = {
  assets: { type: "string", list: true },
  depth: { type: "number" },
  timeframe: { type: "string" }
};
