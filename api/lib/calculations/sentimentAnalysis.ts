/**
 * Sentiment analysis utilities for news and social media data
 */

// Sentiment word lists
const POSITIVE_WORDS = new Set([
  'buy', 'bull', 'bullish', 'gain', 'gains', 'growth', 'profit', 'profits', 
  'rise', 'rising', 'surge', 'rally', 'boom', 'soar', 'strong', 'strength',
  'outperform', 'beat', 'positive', 'upgrade', 'upside', 'opportunity',
  'momentum', 'breakout', 'confidence', 'optimistic', 'breakthrough',
  'success', 'winning', 'winner', 'exceeded', 'record', 'high', 'top'
]);

const NEGATIVE_WORDS = new Set([
  'sell', 'bear', 'bearish', 'loss', 'losses', 'decline', 'fall', 'falling',
  'crash', 'plunge', 'drop', 'weak', 'weakness', 'underperform', 'miss',
  'negative', 'downgrade', 'downside', 'risk', 'concern', 'worry', 'fear',
  'recession', 'crisis', 'collapse', 'failure', 'losing', 'loser', 'missed',
  'low', 'bottom', 'warning', 'alert', 'caution', 'skeptical', 'pessimistic'
]);

export interface SentimentResult {
  score: number;
  label: 'bearish' | 'neutral' | 'bullish';
  positiveCount: number;
  negativeCount: number;
  totalWords: number;
}

export interface SentimentInput {
  score: number;
  weight?: number;
}

export interface AggregatedSentiment {
  averageScore: number;
  weightedScore: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  standardDeviation: number;
}

export interface FearGreedParams {
  vix: number;
  marketMomentum: number;
  stockPriceBreadth: number;
  junkBondDemand: number;
}

export interface NewsImpactResult {
  impactScore: number;
  sourceWeight: number;
  volumeMultiplier: number;
  adjustedSentiment: number;
}

export interface SentimentShiftResult {
  shiftDetected: boolean;
  magnitude: number;
  direction: 'positive' | 'negative' | 'neutral';
  currentAverage: number;
  previousAverage: number;
}

/**
 * Analyzes sentiment of text using positive/negative word counting
 * @param text - The text to analyze
 * @returns Sentiment analysis result with score from -1 to 1 and label
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      label: 'neutral',
      positiveCount: 0,
      negativeCount: 0,
      totalWords: 0
    };
  }

  // Tokenize and normalize text
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);

  let positiveCount = 0;
  let negativeCount = 0;

  // Count positive and negative words
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) {
      positiveCount++;
    }
    if (NEGATIVE_WORDS.has(word)) {
      negativeCount++;
    }
  }

  const totalWords = words.length;
  const totalSentimentWords = positiveCount + negativeCount;

  // Calculate normalized score (-1 to 1)
  let score = 0;
  if (totalSentimentWords > 0) {
    score = (positiveCount - negativeCount) / totalSentimentWords;
  }

  // Determine label based on score
  let label: 'bearish' | 'neutral' | 'bullish';
  if (score > 0.2) {
    label = 'bullish';
  } else if (score < -0.2) {
    label = 'bearish';
  } else {
    label = 'neutral';
  }

  return {
    score,
    label,
    positiveCount,
    negativeCount,
    totalWords
  };
}

/**
 * Calculates aggregated sentiment score from multiple sentiment inputs
 * @param sentiments - Array of sentiment scores with optional weights
 * @returns Aggregated sentiment with weighted average and confidence interval
 */
export function calculateSentimentScore(sentiments: SentimentInput[]): AggregatedSentiment {
  if (!sentiments || sentiments.length === 0) {
    return {
      averageScore: 0,
      weightedScore: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      standardDeviation: 0
    };
  }

  // Calculate simple average
  const scores = sentiments.map(s => s.score);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  // Calculate weighted average
  let totalWeight = 0;
  let weightedSum = 0;

  for (const sentiment of sentiments) {
    const weight = sentiment.weight ?? 1;
    totalWeight += weight;
    weightedSum += sentiment.score * weight;
  }

  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate standard deviation
  const variance = scores.reduce((sum, score) => {
    return sum + Math.pow(score - averageScore, 2);
  }, 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);

  // Calculate 95% confidence interval (assuming normal distribution)
  const marginOfError = 1.96 * (standardDeviation / Math.sqrt(scores.length));
  const confidenceInterval = {
    lower: Math.max(-1, weightedScore - marginOfError),
    upper: Math.min(1, weightedScore + marginOfError)
  };

  return {
    averageScore,
    weightedScore,
    confidenceInterval,
    standardDeviation
  };
}

/**
 * Calculates Fear & Greed Index from market indicators
 * @param params - Market indicators (VIX, momentum, breadth, junk bond demand)
 * @returns Fear & Greed index from 0 (extreme fear) to 100 (extreme greed)
 */
export function calculateFearGreedIndex(params: FearGreedParams): number {
  const { vix, marketMomentum, stockPriceBreadth, junkBondDemand } = params;

  // Normalize VIX (inverted: high VIX = fear, low VIX = greed)
  // Typical VIX range: 10-40, extreme range: 5-80
  const normalizedVix = Math.max(0, Math.min(100, 100 - ((vix - 10) / 30) * 100));

  // Normalize market momentum (assumes -100 to 100 input range)
  const normalizedMomentum = Math.max(0, Math.min(100, (marketMomentum + 100) / 2));

  // Normalize stock price breadth (assumes 0-100 input range)
  const normalizedBreadth = Math.max(0, Math.min(100, stockPriceBreadth));

  // Normalize junk bond demand (assumes 0-100 input range)
  const normalizedJunkBond = Math.max(0, Math.min(100, junkBondDemand));

  // Weighted combination (VIX has highest weight as it's most indicative)
  const weights = {
    vix: 0.35,
    momentum: 0.25,
    breadth: 0.25,
    junkBond: 0.15
  };

  const index = 
    normalizedVix * weights.vix +
    normalizedMomentum * weights.momentum +
    normalizedBreadth * weights.breadth +
    normalizedJunkBond * weights.junkBond;

  return Math.round(Math.max(0, Math.min(100, index)));
}

/**
 * Analyzes news impact score based on sentiment, volume, and source
 * @param sentiment - Base sentiment score (-1 to 1)
 * @param volume - News volume/mentions count
 * @param source - News source identifier
 * @returns News impact analysis with adjusted scores
 */
export function analyzeNewsImpact(
  sentiment: number,
  volume: number,
  source: string
): NewsImpactResult {
  // Source credibility weights
  const sourceWeights: Record<string, number> = {
    'bloomberg': 1.5,
    'reuters': 1.4,
    'wsj': 1.3,
    'ft': 1.3,
    'cnbc': 1.2,
    'marketwatch': 1.1,
    'yahoo': 0.9,
    'twitter': 0.7,
    'reddit': 0.6,
    'unknown': 0.5
  };

  const normalizedSource = source.toLowerCase();
  const sourceWeight = sourceWeights[normalizedSource] ?? sourceWeights['unknown'];

  // Volume multiplier (logarithmic scale to prevent extreme values)
  // Normalize volume: 1-10 mentions = low, 100+ = high impact
  const volumeMultiplier = 1 + Math.log10(Math.max(1, volume)) * 0.3;

  // Adjusted sentiment with source credibility
  const adjustedSentiment = sentiment * sourceWeight;

  // Impact score combines sentiment magnitude, source weight, and volume
  const impactScore = Math.abs(adjustedSentiment) * volumeMultiplier * sourceWeight;

  return {
    impactScore: Math.min(10, impactScore), // Cap at 10
    sourceWeight,
    volumeMultiplier,
    adjustedSentiment: Math.max(-1, Math.min(1, adjustedSentiment))
  };
}

/**
 * Detects market sentiment regime shifts
 * @param historicalSentiments - Array of historical sentiment scores
 * @param threshold - Minimum change threshold to detect shift (default 0.2)
 * @returns Sentiment shift detection result
 */
export function detectMarketSentimentShift(
  historicalSentiments: number[],
  threshold: number = 0.2
): SentimentShiftResult {
  if (!historicalSentiments || historicalSentiments.length < 4) {
    return {
      shiftDetected: false,
      magnitude: 0,
      direction: 'neutral',
      currentAverage: 0,
      previousAverage: 0
    };
  }

  // Split data into two halves for comparison
  const midpoint = Math.floor(historicalSentiments.length / 2);
  const previousPeriod = historicalSentiments.slice(0, midpoint);
  const currentPeriod = historicalSentiments.slice(midpoint);

  // Calculate moving averages
  const previousAverage = previousPeriod.reduce((sum, val) => sum + val, 0) / previousPeriod.length;
  const currentAverage = currentPeriod.reduce((sum, val) => sum + val, 0) / currentPeriod.length;

  // Calculate magnitude of shift
  const magnitude = Math.abs(currentAverage - previousAverage);

  // Detect shift
  const shiftDetected = magnitude >= threshold;

  // Determine direction
  let direction: 'positive' | 'negative' | 'neutral';
  if (currentAverage - previousAverage > threshold) {
    direction = 'positive';
  } else if (previousAverage - currentAverage > threshold) {
    direction = 'negative';
  } else {
    direction = 'neutral';
  }

  return {
    shiftDetected,
    magnitude,
    direction,
    currentAverage,
    previousAverage
  };
}