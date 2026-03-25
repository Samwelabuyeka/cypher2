/**
 * Advanced Sentiment Analysis Engine for Trading Platform
 * Provides comprehensive sentiment analysis capabilities for market analysis
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number; // -1 to 1
}

export interface ContextualSentiment extends SentimentScore {
  hasNegation: boolean;
  hasIntensifier: boolean;
  adjustedScore: number;
}

export interface AspectSentiment {
  aspect: string;
  sentiment: SentimentScore;
  mentions: number;
}

export interface Token {
  word: string;
  stem?: string;
  lemma?: string;
  pos?: string; // part of speech
}

export interface Keyword {
  word: string;
  score: number;
  tfidf: number;
}

export interface TweetSentiment {
  text: string;
  sentiment: SentimentScore;
  engagement: EngagementScore;
  timestamp: Date;
  author?: string;
}

export interface EngagementScore {
  likes: number;
  retweets: number;
  replies: number;
  totalEngagement: number;
  engagementRate: number;
}

export interface Influencer {
  handle: string;
  followers: number;
  engagementRate: number;
  credibilityScore: number;
  recentSentiment: SentimentScore;
}

export interface TrendingTopic {
  topic: string;
  volume: number;
  sentiment: SentimentScore;
  momentum: number;
  keywords: string[];
}

export interface Entity {
  text: string;
  type: 'company' | 'person' | 'location' | 'crypto' | 'other';
  confidence: number;
}

export interface NewsAnalysis {
  entities: Entity[];
  sentiment: SentimentScore;
  impactScore: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  isMarketMoving: boolean;
}

export interface SentimentTimeSeries {
  timestamp: Date;
  sentiment: SentimentScore;
  volume: number;
}

export interface SentimentMomentum {
  current: number;
  rateOfChange: number;
  acceleration: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface WeightedSentiment {
  sentiment: SentimentScore;
  weight: number;
  source: string;
  credibility: number;
}

export interface ConsensusSentiment {
  consensus: SentimentScore;
  agreement: number; // 0-1, how much sources agree
  sources: number;
  confidence: number;
}

export interface EmotionScores {
  fear: number;
  greed: number;
  uncertainty: number;
  confidence: number;
  anxiety: number;
}

export interface SentimentVolatility {
  standardDeviation: number;
  variance: number;
  range: number;
  isVolatile: boolean;
}

export interface SentimentPriceCorrelation {
  correlation: number;
  pValue: number;
  isSignificant: boolean;
  lag: number; // in time periods
}

export interface SentimentDivergence {
  isDiverging: boolean;
  divergenceScore: number;
  sentimentDirection: 'bullish' | 'bearish' | 'neutral';
  priceDirection: 'up' | 'down' | 'flat';
}

export interface PricePrediction {
  predictedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  magnitude: number;
  timeframe: string;
}

export interface SentimentAlert {
  type: 'threshold' | 'spike' | 'reversal' | 'divergence';
  severity: 'low' | 'medium' | 'high';
  message: string;
  sentiment: SentimentScore;
  timestamp: Date;
}

// ============================================================================
// Constants
// ============================================================================

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
  'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how'
]);

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
  'bullish', 'up', 'gain', 'profit', 'surge', 'rally', 'boom', 'growth',
  'positive', 'strong', 'success', 'win', 'winning', 'breakthrough', 'moon',
  'pump', 'rise', 'soar', 'jump', 'spike', 'rocket', 'gem', 'undervalued'
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'poor', 'worst', 'bearish',
  'down', 'loss', 'crash', 'dump', 'fall', 'drop', 'decline', 'plunge',
  'negative', 'weak', 'fail', 'failure', 'losing', 'scam', 'rug', 'rekt',
  'fud', 'panic', 'sell', 'dump', 'tank', 'collapse', 'overvalued'
]);

const NEGATIONS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'none', 'nor', "n't", 'dont', "don't", 'isnt', "isn't", 'wasnt', "wasn't"
]);

const INTENSIFIERS = new Set([
  'very', 'extremely', 'absolutely', 'completely', 'totally', 'highly',
  'really', 'incredibly', 'exceptionally', 'particularly', 'especially'
]);

const FEAR_WORDS = new Set([
  'fear', 'afraid', 'scared', 'panic', 'worry', 'anxious', 'nervous',
  'uncertain', 'risk', 'dangerous', 'threat', 'crash', 'collapse'
]);

const GREED_WORDS = new Set([
  'greed', 'fomo', 'moon', 'lambo', 'rich', 'wealth', 'gains', 'pump',
  'rocket', 'rally', 'surge', 'explosive', 'parabolic'
]);

const UNCERTAINTY_WORDS = new Set([
  'uncertain', 'unsure', 'maybe', 'perhaps', 'possibly', 'could', 'might',
  'unclear', 'confused', 'doubt', 'question', 'unknown'
]);

// ============================================================================
// 1. Text Processing Functions
// ============================================================================

export function tokenize(text: string): string[] {
  // Convert to lowercase and split on non-alphanumeric characters
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

export function removeStopWords(tokens: string[]): string[] {
  return tokens.filter(token => !STOP_WORDS.has(token));
}

export function stem(word: string): string {
  // Simple Porter-like stemming
  let stemmed = word;
  
  // Remove common suffixes
  const suffixes = ['ing', 'ed', 'ly', 'es', 's', 'tion', 'ment'];
  for (const suffix of suffixes) {
    if (stemmed.endsWith(suffix) && stemmed.length > suffix.length + 2) {
      stemmed = stemmed.slice(0, -suffix.length);
      break;
    }
  }
  
  return stemmed;
}

export function lemmatize(word: string): string {
  // Simplified lemmatization (in production, use a library like compromise or natural)
  const lemmaMap: Record<string, string> = {
    'running': 'run',
    'runs': 'run',
    'better': 'good',
    'best': 'good',
    'worse': 'bad',
    'worst': 'bad',
    'buying': 'buy',
    'bought': 'buy',
    'selling': 'sell',
    'sold': 'sell'
  };
  
  return lemmaMap[word] || stem(word);
}

export function extractKeywords(documents: string[], topN: number = 10): Keyword[] {
  // Calculate TF-IDF scores
  const docTokens = documents.map(doc => removeStopWords(tokenize(doc)));
  const allTokens = docTokens.flat();
  const vocabulary = new Set(allTokens);
  
  // Calculate document frequency
  const df: Record<string, number> = {};
  vocabulary.forEach(word => {
    df[word] = docTokens.filter(tokens => tokens.includes(word)).length;
  });
  
  // Calculate TF-IDF for each document
  const tfidfScores: Record<string, number> = {};
  const N = documents.length;
  
  docTokens.forEach((tokens, docIdx) => {
    const tf: Record<string, number> = {};
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });
    
    Object.entries(tf).forEach(([word, freq]) => {
      const termFreq = freq / tokens.length;
      const inverseDocFreq = Math.log(N / (df[word] || 1));
      const tfidf = termFreq * inverseDocFreq;
      tfidfScores[word] = (tfidfScores[word] || 0) + tfidf;
    });
  });
  
  // Sort and return top keywords
  return Object.entries(tfidfScores)
    .map(([word, score]) => ({ word, score, tfidf: score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ============================================================================
// 2. Sentiment Scoring Functions
// ============================================================================

export function lexiconBasedSentiment(text: string): SentimentScore {
  const tokens = tokenize(text);
  let positive = 0;
  let negative = 0;
  
  tokens.forEach(token => {
    if (POSITIVE_WORDS.has(token)) positive++;
    if (NEGATIVE_WORDS.has(token)) negative++;
  });
  
  const total = tokens.length || 1;
  const positiveScore = positive / total;
  const negativeScore = negative / total;
  const neutralScore = 1 - (positiveScore + negativeScore);
  const compound = (positive - negative) / (positive + negative + 1);
  
  return {
    positive: positiveScore,
    negative: negativeScore,
    neutral: Math.max(0, neutralScore),
    compound
  };
}

export function contextAwareSentiment(text: string): ContextualSentiment {
  const tokens = tokenize(text);
  const baseSentiment = lexiconBasedSentiment(text);
  
  let hasNegation = false;
  let hasIntensifier = false;
  let adjustmentFactor = 1.0;
  
  // Check for negations in context windows
  for (let i = 0; i < tokens.length; i++) {
    if (NEGATIONS.has(tokens[i])) {
      hasNegation = true;
      // Flip sentiment for next 3 words
      for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
        if (POSITIVE_WORDS.has(tokens[j]) || NEGATIVE_WORDS.has(tokens[j])) {
          adjustmentFactor *= -0.8;
        }
      }
    }
    
    if (INTENSIFIERS.has(tokens[i])) {
      hasIntensifier = true;
      adjustmentFactor *= 1.3;
    }
  }
  
  const adjustedScore = baseSentiment.compound * adjustmentFactor;
  
  return {
    ...baseSentiment,
    hasNegation,
    hasIntensifier,
    adjustedScore: Math.max(-1, Math.min(1, adjustedScore))
  };
}

export function aspectBasedSentiment(text: string, aspects: string[]): AspectSentiment[] {
  const tokens = tokenize(text);
  const results: AspectSentiment[] = [];
  
  aspects.forEach(aspect => {
    const aspectTokens = tokenize(aspect);
    let mentions = 0;
    const contextWindows: string[] = [];
    
    // Find mentions and extract context
    for (let i = 0; i < tokens.length; i++) {
      if (aspectTokens.some(at => tokens[i].includes(at) || at.includes(tokens[i]))) {
        mentions++;
        const start = Math.max(0, i - 5);
        const end = Math.min(tokens.length, i + 6);
        contextWindows.push(tokens.slice(start, end).join(' '));
      }
    }
    
    // Calculate sentiment for contexts
    const contextSentiments = contextWindows.map(ctx => lexiconBasedSentiment(ctx));
    const avgSentiment = contextSentiments.reduce(
      (acc, sent) => ({
        positive: acc.positive + sent.positive,
        negative: acc.negative + sent.negative,
        neutral: acc.neutral + sent.neutral,
        compound: acc.compound + sent.compound
      }),
      { positive: 0, negative: 0, neutral: 0, compound: 0 }
    );
    
    const count = contextSentiments.length || 1;
    results.push({
      aspect,
      sentiment: {
        positive: avgSentiment.positive / count,
        negative: avgSentiment.negative / count,
        neutral: avgSentiment.neutral / count,
        compound: avgSentiment.compound / count
      },
      mentions
    });
  });
  
  return results;
}

export function calculateCompoundScore(sentiment: SentimentScore): number {
  // Normalized compound score using tanh-like function
  const raw = sentiment.positive - sentiment.negative;
  return Math.tanh(raw * 2); // Scale and bound between -1 and 1
}

// ============================================================================
// 3. Social Media Analysis Functions
// ============================================================================

export function analyzeTweetSentiment(
  text: string,
  likes: number = 0,
  retweets: number = 0,
  replies: number = 0,
  author?: string
): TweetSentiment {
  const sentiment = contextAwareSentiment(text);
  const engagement = calculateEngagementScore(likes, retweets, replies);
  
  return {
    text,
    sentiment: {
      positive: sentiment.positive,
      negative: sentiment.negative,
      neutral: sentiment.neutral,
      compound: sentiment.adjustedScore
    },
    engagement,
    timestamp: new Date(),
    author
  };
}

export function calculateEngagementScore(
  likes: number,
  retweets: number,
  replies: number
): EngagementScore {
  const totalEngagement = likes + (retweets * 2) + (replies * 1.5); // Weight retweets higher
  const engagementRate = totalEngagement / Math.max(1, likes + retweets + replies);
  
  return {
    likes,
    retweets,
    replies,
    totalEngagement,
    engagementRate
  };
}

export function detectInfluencers(
  tweets: TweetSentiment[],
  minFollowers: number = 1000
): Influencer[] {
  const influencerMap = new Map<string, {
    tweets: TweetSentiment[];
    totalEngagement: number;
  }>();
  
  tweets.forEach(tweet => {
    if (!tweet.author) return;
    
    const existing = influencerMap.get(tweet.author) || { tweets: [], totalEngagement: 0 };
    existing.tweets.push(tweet);
    existing.totalEngagement += tweet.engagement.totalEngagement;
    influencerMap.set(tweet.author, existing);
  });
  
  const influencers: Influencer[] = [];
  
  influencerMap.forEach((data, handle) => {
    const avgEngagement = data.totalEngagement / data.tweets.length;
    const avgSentiment = data.tweets.reduce(
      (acc, t) => ({
        positive: acc.positive + t.sentiment.positive,
        negative: acc.negative + t.sentiment.negative,
        neutral: acc.neutral + t.sentiment.neutral,
        compound: acc.compound + t.sentiment.compound
      }),
      { positive: 0, negative: 0, neutral: 0, compound: 0 }
    );
    
    const count = data.tweets.length;
    const estimatedFollowers = Math.floor(avgEngagement * 100); // Rough estimate
    
    if (estimatedFollowers >= minFollowers) {
      influencers.push({
        handle,
        followers: estimatedFollowers,
        engagementRate: avgEngagement,
        credibilityScore: Math.min(1, avgEngagement / 1000),
        recentSentiment: {
          positive: avgSentiment.positive / count,
          negative: avgSentiment.negative / count,
          neutral: avgSentiment.neutral / count,
          compound: avgSentiment.compound / count
        }
      });
    }
  });
  
  return influencers.sort((a, b) => b.credibilityScore - a.credibilityScore);
}

export function trendingTopicsExtraction(
  tweets: TweetSentiment[],
  topN: number = 10
): TrendingTopic[] {
  const topicMap = new Map<string, {
    volume: number;
    sentiments: SentimentScore[];
    momentum: number;
  }>();
  
  // Extract hashtags and mentions as topics
  tweets.forEach(tweet => {
    const hashtags = tweet.text.match(/#\w+/g) || [];
    const mentions = tweet.text.match(/@\w+/g) || [];
    const topics = [...hashtags, ...mentions].map(t => t.toLowerCase());
    
    topics.forEach(topic => {
      const existing = topicMap.get(topic) || { volume: 0, sentiments: [], momentum: 0 };
      existing.volume++;
      existing.sentiments.push(tweet.sentiment);
      topicMap.set(topic, existing);
    });
  });
  
  const trending: TrendingTopic[] = [];
  
  topicMap.forEach((data, topic) => {
    if (data.volume < 2) return; // Filter low-volume topics
    
    const avgSentiment = data.sentiments.reduce(
      (acc, s) => ({
        positive: acc.positive + s.positive,
        negative: acc.negative + s.negative,
        neutral: acc.neutral + s.neutral,
        compound: acc.compound + s.compound
      }),
      { positive: 0, negative: 0, neutral: 0, compound: 0 }
    );
    
    const count = data.sentiments.length;
    const momentum = data.volume / tweets.length; // Relative volume
    
    trending.push({
      topic,
      volume: data.volume,
      sentiment: {
        positive: avgSentiment.positive / count,
        negative: avgSentiment.negative / count,
        neutral: avgSentiment.neutral / count,
        compound: avgSentiment.compound / count
      },
      momentum,
      keywords: extractKeywords([topic], 5).map(k => k.word)
    });
  });
  
  return trending
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, topN);
}

// ============================================================================
// 4. News Analysis Functions
// ============================================================================

export function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  
  // Simple pattern matching (in production, use NER library)
  const companyPatterns = /\b(Inc|Corp|Ltd|LLC|Company|Exchange)\b/gi;
  const cryptoPatterns = /\b(Bitcoin|BTC|Ethereum|ETH|crypto|cryptocurrency|blockchain)\b/gi;
  const personPatterns = /\b(CEO|CFO|founder|president|chairman)\s+\w+\s+\w+/gi;
  
  // Find companies
  const companies = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|Corp|Ltd)/g) || [];
  companies.forEach(company => {
    entities.push({ text: company, type: 'company', confidence: 0.8 });
  });
  
  // Find crypto mentions
  const cryptos = text.match(cryptoPatterns) || [];
  cryptos.forEach(crypto => {
    entities.push({ text: crypto, type: 'crypto', confidence: 0.9 });
  });
  
  // Find people
  const people = text.match(personPatterns) || [];
  people.forEach(person => {
    entities.push({ text: person, type: 'person', confidence: 0.7 });
  });
  
  return entities;
}

export function calculateNewsImpact(
  text: string,
  entities: Entity[],
  sentiment: SentimentScore
): number {
  let impact = 0;
  
  // Factor 1: Sentiment strength
  impact += Math.abs(sentiment.compound) * 0.3;
  
  // Factor 2: Number of important entities
  impact += Math.min(entities.length * 0.1, 0.3);
  
  // Factor 3: Urgency keywords
  const urgentWords = ['breaking', 'urgent', 'alert', 'crash', 'surge', 'emergency'];
  const tokens = tokenize(text.toLowerCase());
  const urgencyCount = tokens.filter(t => urgentWords.includes(t)).length;
  impact += Math.min(urgencyCount * 0.1, 0.2);
  
  // Factor 4: Market-moving keywords
  const marketWords = ['regulation', 'ban', 'approval', 'hack', 'partnership', 'acquisition'];
  const marketCount = tokens.filter(t => marketWords.includes(t)).length;
  impact += Math.min(marketCount * 0.15, 0.2);
  
  return Math.min(impact, 1.0);
}

export function detectMarketMovingEvents(text: string): boolean {
  const marketMovingKeywords = [
    'regulation', 'ban', 'approved', 'hack', 'hacked', 'breach',
    'partnership', 'acquisition', 'merger', 'ipo', 'listing',
    'delisting', 'sec', 'lawsuit', 'investigation', 'audit'
  ];
  
  const tokens = tokenize(text.toLowerCase());
  return tokens.some(token => marketMovingKeywords.includes(token));
}

export function classifyNewsUrgency(
  text: string,
  impactScore: number
): 'low' | 'medium' | 'high' | 'critical' {
  const tokens = tokenize(text.toLowerCase());
  
  const criticalWords = ['breaking', 'urgent', 'alert', 'emergency', 'immediate'];
  const hasCriticalWord = tokens.some(t => criticalWords.includes(t));
  
  if (hasCriticalWord && impactScore > 0.7) return 'critical';
  if (impactScore > 0.6) return 'high';
  if (impactScore > 0.3) return 'medium';
  return 'low';
}

export function analyzeNews(text: string): NewsAnalysis {
  const entities = extractEntities(text);
  const sentiment = contextAwareSentiment(text);
  const sentimentScore: SentimentScore = {
    positive: sentiment.positive,
    negative: sentiment.negative,
    neutral: sentiment.neutral,
    compound: sentiment.adjustedScore
  };
  
  const impactScore = calculateNewsImpact(text, entities, sentimentScore);
  const urgency = classifyNewsUrgency(text, impactScore);
  const isMarketMoving = detectMarketMovingEvents(text);
  
  return {
    entities,
    sentiment: sentimentScore,
    impactScore,
    urgency,
    isMarketMoving
  };
}

// ============================================================================
// 5. Aggregation Functions
// ============================================================================

export function aggregateSentimentOverTime(
  sentiments: Array<{ timestamp: Date; sentiment: SentimentScore; volume?: number }>
): SentimentTimeSeries[] {
  // Group by time buckets (e.g., hourly)
  const buckets = new Map<string, {
    sentiments: SentimentScore[];
    volumes: number[];
  }>();
  
  sentiments.forEach(item => {
    const hourKey = new Date(item.timestamp).setMinutes(0, 0, 0).toString();
    const existing = buckets.get(hourKey) || { sentiments: [], volumes: [] };
    existing.sentiments.push(item.sentiment);
    existing.volumes.push(item.volume || 1);
    buckets.set(hourKey, existing);
  });
  
  const timeSeries: SentimentTimeSeries[] = [];
  
  buckets.forEach((data, timeKey) => {
    const avg = data.sentiments.reduce(
      (acc, s) => ({
        positive: acc.positive + s.positive,
        negative: acc.negative + s.negative,
        neutral: acc.neutral + s.neutral,
        compound: acc.compound + s.compound
      }),
      { positive: 0, negative: 0, neutral: 0, compound: 0 }
    );
    
    const count = data.sentiments.length;
    const totalVolume = data.volumes.reduce((sum, v) => sum + v, 0);
    
    timeSeries.push({
      timestamp: new Date(parseInt(timeKey)),
      sentiment: {
        positive: avg.positive / count,
        negative: avg.negative / count,
        neutral: avg.neutral / count,
        compound: avg.compound / count
      },
      volume: totalVolume
    });
  });
  
  return timeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function calculateSentimentMomentum(
  timeSeries: SentimentTimeSeries[]
): SentimentMomentum {
  if (timeSeries.length < 2) {
    return {
      current: timeSeries[0]?.sentiment.compound || 0,
      rateOfChange: 0,
      acceleration: 0,
      trend: 'stable'
    };
  }
  
  const current = timeSeries[timeSeries.length - 1].sentiment.compound;
  const previous = timeSeries[timeSeries.length - 2].sentiment.compound;
  const rateOfChange = current - previous;
  
  let acceleration = 0;
  if (timeSeries.length >= 3) {
    const prevRateOfChange = previous - timeSeries[timeSeries.length - 3].sentiment.compound;
    acceleration = rateOfChange - prevRateOfChange;
  }
  
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (rateOfChange > 0.05) trend = 'increasing';
  else if (rateOfChange < -0.05) trend = 'decreasing';
  
  return {
    current,
    rateOfChange,
    acceleration,
    trend
  };
}

export function weightedSentiment(
  sentiments: WeightedSentiment[]
): SentimentScore {
  const totalWeight = sentiments.reduce((sum, s) => sum + s.weight, 0);
  
  if (totalWeight === 0) {
    return { positive: 0, negative: 0, neutral: 1, compound: 0 };
  }
  
  const weighted = sentiments.reduce(
    (acc, s) => ({
      positive: acc.positive + (s.sentiment.positive * s.weight),
      negative: acc.negative + (s.sentiment.negative * s.weight),
      neutral: acc.neutral + (s.sentiment.neutral * s.weight),
      compound: acc.compound + (s.sentiment.compound * s.weight)
    }),
    { positive: 0, negative: 0, neutral: 0, compound: 0 }
  );
  
  return {
    positive: weighted.positive / totalWeight,
    negative: weighted.negative / totalWeight,
    neutral: weighted.neutral / totalWeight,
    compound: weighted.compound / totalWeight
  };
}

export function consensusSentiment(
  sentiments: WeightedSentiment[]
): ConsensusSentiment {
  const consensus = weightedSentiment(sentiments);
  
  // Calculate agreement (how similar all sentiments are)
  const deviations = sentiments.map(s => 
    Math.abs(s.sentiment.compound - consensus.compound)
  );
  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / (deviations.length || 1);
  const agreement = Math.max(0, 1 - avgDeviation);
  
  // Calculate confidence based on agreement and credibility
  const avgCredibility = sentiments.reduce((sum, s) => sum + s.credibility, 0) / (sentiments.length || 1);
  const confidence = (agreement * 0.7) + (avgCredibility * 0.3);
  
  return {
    consensus,
    agreement,
    sources: sentiments.length,
    confidence
  };
}

export function aggregateSentiment(
  sentiments: SentimentScore[]
): SentimentScore {
  if (sentiments.length === 0) {
    return { positive: 0, negative: 0, neutral: 1, compound: 0 };
  }
  
  const aggregated = sentiments.reduce(
    (acc, s) => ({
      positive: acc.positive + s.positive,
      negative: acc.negative + s.negative,
      neutral: acc.neutral + s.neutral,
      compound: acc.compound + s.compound
    }),
    { positive: 0, negative: 0, neutral: 0, compound: 0 }
  );
  
  const count = sentiments.length;
  
  return {
    positive: aggregated.positive / count,
    negative: aggregated.negative / count,
    neutral: aggregated.neutral / count,
    compound: aggregated.compound / count
  };
}

export function correlateSentimentWithPrice(
  sentimentData: Array<{ timestamp: Date; sentiment: number }>,
  priceData: Array<{ timestamp: Date; price: number }>,
  lag: number = 0
): SentimentPriceCorrelation {
  if (sentimentData.length === 0 || priceData.length === 0) {
    return {
      correlation: 0,
      pValue: 1,
      isSignificant: false,
      lag
    };
  }
  
  // Align data by timestamp
  const aligned: Array<{ sentiment: number; price: number }> = [];
  
  sentimentData.forEach(sentItem => {
    const targetTime = new Date(sentItem.timestamp.getTime() + (lag * 3600000)); // lag in hours
    const priceItem = priceData.find(p => 
      Math.abs(p.timestamp.getTime() - targetTime.getTime()) < 1800000 // 30 min tolerance
    );
    
    if (priceItem) {
      aligned.push({
        sentiment: sentItem.sentiment,
        price: priceItem.price
      });
    }
  });
  
  if (aligned.length < 2) {
    return {
      correlation: 0,
      pValue: 1,
      isSignificant: false,
      lag
    };
  }
  
  // Calculate Pearson correlation
  const n = aligned.length;
  const sentiments = aligned.map(a => a.sentiment);
  const prices = aligned.map(a => a.price);
  
  const sentMean = sentiments.reduce((sum, s) => sum + s, 0) / n;
  const priceMean = prices.reduce((sum, p) => sum + p, 0) / n;
  
  let numerator = 0;
  let sentSumSq = 0;
  let priceSumSq = 0;
  
  for (let i = 0; i < n; i++) {
    const sentDiff = sentiments[i] - sentMean;
    const priceDiff = prices[i] - priceMean;
    numerator += sentDiff * priceDiff;
    sentSumSq += sentDiff * sentDiff;
    priceSumSq += priceDiff * priceDiff;
  }
  
  const denominator = Math.sqrt(sentSumSq * priceSumSq);
  const correlation = denominator === 0 ? 0 : numerator / denominator;
  
  // Calculate approximate p-value using t-distribution
  const tStat = Math.abs(correlation) * Math.sqrt((n - 2) / (1 - correlation * correlation));
  const pValue = Math.max(0, Math.min(1, 2 * (1 - 0.5 * (1 + Math.tanh(tStat / 2)))));
  const isSignificant = pValue < 0.05;
  
  return {
    correlation,
    pValue,
    isSignificant,
    lag
  };
}