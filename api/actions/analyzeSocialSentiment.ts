import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, connections, session }) => {
  const symbols = params.symbols || ['BTC', 'ETH'];
  const sources = params.sources || ['twitter', 'reddit', 'news'];
  
  // Get user ID from session if available (for creating user-scoped records)
  const userId = session?.get("user");
  
  logger.info({ symbols, sources }, "Starting social sentiment analysis");

  const results = {
    symbolsAnalyzed: 0,
    avgSentiment: 0,
    pumpSignals: 0,
    correlations: [] as Array<{ symbol: string; correlation: number; sentiment: number }>
  };

  let totalSentiment = 0;

  for (const symbol of symbols) {
    try {
      logger.info({ symbol }, "Analyzing symbol");

      // Aggregated sentiment scores from different sources
      const sentimentScores: number[] = [];
      const sentimentData: Record<string, any> = {
        twitter: null,
        reddit: null,
        news: null
      };

      // Twitter sentiment analysis
      if (sources.includes('twitter')) {
        try {
          // Simulated Twitter analysis - in production, integrate with Twitter API
          const twitterScore = Math.random() * 2 - 1; // -1 to 1
          sentimentScores.push(twitterScore);
          sentimentData.twitter = {
            score: twitterScore,
            tweetCount: 100,
            influencerMentions: Math.floor(Math.random() * 20),
            trending: Math.random() > 0.7
          };
        } catch (error) {
          logger.error({ error, symbol }, "Twitter analysis failed");
        }
      }

      // Reddit sentiment analysis
      if (sources.includes('reddit')) {
        try {
          // Simulated Reddit analysis
          const redditScore = Math.random() * 2 - 1;
          const pumpSignalDetected = redditScore > 0.7 && Math.random() > 0.8;
          
          sentimentScores.push(redditScore);
          sentimentData.reddit = {
            score: redditScore,
            subreddits: ['CryptoCurrency', 'Bitcoin', 'ethereum'],
            hotPosts: Math.floor(Math.random() * 50),
            pumpSignal: pumpSignalDetected
          };

          if (pumpSignalDetected) {
            results.pumpSignals++;
          }
        } catch (error) {
          logger.error({ error, symbol }, "Reddit analysis failed");
        }
      }

      // News sentiment analysis
      if (sources.includes('news')) {
        try {
          // Simulated news analysis
          const newsScore = Math.random() * 2 - 1;
          sentimentScores.push(newsScore);
          sentimentData.news = {
            score: newsScore,
            articleCount: Math.floor(Math.random() * 30),
            impactScore: Math.random(),
            breakingNews: Math.random() > 0.9
          };
        } catch (error) {
          logger.error({ error, symbol }, "News analysis failed");
        }
      }

      // Calculate overall sentiment
      const overallSentiment = sentimentScores.length > 0 
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length 
        : 0;

      // Fetch recent price data for correlation
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get price data
      const recentPrices = await api.marketData.findMany({
        filter: {
          symbol: { equals: symbol },
          timestamp: { greaterThan: oneDayAgo.toISOString() }
        },
        sort: { timestamp: "Descending" },
        first: 50,
        select: { id: true, close: true, timestamp: true }
      });

      let priceChange1h = 0;
      let priceChange24h = 0;
      let correlation = 0;

      if (recentPrices.length >= 2) {
        const latestPrice = recentPrices[0].close;
        const price1hAgo = recentPrices.find(p => new Date(p.timestamp) <= oneHourAgo)?.close || latestPrice;
        const price24hAgo = recentPrices[recentPrices.length - 1].close;

        priceChange1h = ((latestPrice - price1hAgo) / price1hAgo) * 100;
        priceChange24h = ((latestPrice - price24hAgo) / price24hAgo) * 100;

        // Simple correlation: positive sentiment should correlate with positive price change
        correlation = (overallSentiment > 0 && priceChange24h > 0) || (overallSentiment < 0 && priceChange24h < 0)
          ? Math.abs(overallSentiment * priceChange24h) / 10 // Normalize
          : -Math.abs(overallSentiment * priceChange24h) / 10;
      }

      // Store results in performanceMetric (only if we have a user)
      if (userId) {
        await api.performanceMetric.create({
          metricType: "strategy-performance",
          periodStart: oneDayAgo,
          periodEnd: now,
          timeframe: "daily",
          user: { _link: userId },
          metrics: {
            sentimentAnalysis: true,
            symbol,
            overallSentiment,
            confidence: Math.abs(overallSentiment),
            trend: overallSentiment > 0.3 ? 'bullish' : overallSentiment < -0.3 ? 'bearish' : 'neutral',
            breakdown: sentimentData,
            priceCorrelation: correlation,
            priceChange1h,
            priceChange24h
          }
        });
      }

      // Create alerts based on conditions
      const alertsToCreate = [];

      // Pump signal detected
      if (sentimentData.reddit?.pumpSignal) {
        alertsToCreate.push({
          type: "risk-limit-breach",
          severity: "critical",
          title: `Pump Signal Detected: ${symbol}`,
          message: `High-risk pump signal detected for ${symbol} on Reddit`,
          triggeredAt: now,
          metadata: { symbol, sentiment: overallSentiment }
        });
      }

      // Extremely bullish sentiment
      if (overallSentiment > 0.8) {
        alertsToCreate.push({
          type: "profit-target",
          severity: "warning",
          title: `Extremely Bullish Sentiment: ${symbol}`,
          message: `${symbol} showing extremely bullish sentiment (${overallSentiment.toFixed(2)})`,
          triggeredAt: now,
          metadata: { symbol, sentiment: overallSentiment }
        });
      }

      // Extremely bearish sentiment
      if (overallSentiment < -0.8) {
        alertsToCreate.push({
          type: "loss-limit",
          severity: "warning",
          title: `Extremely Bearish Sentiment: ${symbol}`,
          message: `${symbol} showing extremely bearish sentiment (${overallSentiment.toFixed(2)})`,
          triggeredAt: now,
          metadata: { symbol, sentiment: overallSentiment }
        });
      }

      // Sentiment-price divergence
      if (Math.abs(correlation) < -0.5) {
        alertsToCreate.push({
          type: "price-alert",
          severity: "info",
          title: `Sentiment-Price Divergence: ${symbol}`,
          message: `${symbol} sentiment and price are diverging (correlation: ${correlation.toFixed(2)})`,
          triggeredAt: now,
          metadata: { symbol, sentiment: overallSentiment, correlation }
        });
      }

      // Create all alerts (only if we have a user)
      if (userId) {
        for (const alertData of alertsToCreate) {
          await api.alert.create({
            ...alertData,
            user: { _link: userId }
          });
        }
      }

      // Generate AI predictions based on sentiment
      if (overallSentiment > 0.6 && Math.abs(priceChange1h) < 2 && recentPrices.length > 0) {
        // Strong sentiment but flat price - predict upward move
        const currentPrice = recentPrices[0].close;
        const predictedValue = currentPrice * (1 + overallSentiment * 0.05);

        await api.aiPrediction.create({
          symbol,
          predictionType: "price",
          currentValue: currentPrice,
          predictedValue,
          confidence: Math.abs(overallSentiment) * 100,
          modelVersion: "sentiment-v1",
          targetDate: new Date(now.getTime() + 4 * 60 * 60 * 1000),
          features: {
            sentiment: overallSentiment,
            sources: sentimentData,
            priceChange1h,
            priceChange24h
          }
        });
      }

      results.correlations.push({
        symbol,
        correlation,
        sentiment: overallSentiment
      });

      totalSentiment += overallSentiment;
      results.symbolsAnalyzed++;

    } catch (error) {
      logger.error({ error, symbol }, "Error analyzing symbol");
    }
  }

  results.avgSentiment = results.symbolsAnalyzed > 0 
    ? totalSentiment / results.symbolsAnalyzed 
    : 0;

  logger.info(results, "Social sentiment analysis complete");

  return results;
};

export const params = {
  symbols: { type: "array", items: { type: "string" } },
  sources: { type: "array", items: { type: "string" } }
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: '*/10 * * * *' }]
  }
};
