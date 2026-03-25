/**
 * Sentiment Analysis Engine for Social Media and News
 * 
 * Analyzes sentiment from Twitter, Reddit, and news sources to predict market movements.
 * Includes detection of market manipulation, trending topics, and sentiment correlation with price.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface SentimentScore {
  score: number;
  confidence: number;
  volume: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  timestamp: Date;
}

export interface Tweet {
  id: string;
  text: string;
  author: string;
  likes: number;
  retweets: number;
  replies: number;
  createdAt: Date;
}

export interface InfluencerSentiment {
  username: string;
  sentiment: number;
  followers: number;
  engagement: number;
  recentTweets: Tweet[];
}

export interface TrendingTopic {
  topic: string;
  volume: number;
  sentiment: number;
  mentions: number;
}

export interface RedditPost {
  title: string;
  subreddit: string;
  upvotes: number;
  comments: number;
  sentiment: number;
  url: string;
}

export interface PumpSignal {
  symbol: string;
  confidence: number;
  sources: string[];
  detectedAt: Date;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  sentiment: number;
  publishedAt: Date;
  impact: 'low' | 'medium' | 'high';
}

export interface NewsSentiment {
  overallSentiment: number;
  articles: NewsArticle[];
  breakingNews: boolean;
}

export interface ImpactScore {
  score: number;
  impact: 'low' | 'medium' | 'high';
  factors: string[];
}

export interface ManipulationAlert {
  type: string;
  confidence: number;
  evidence: string[];
  affectedSymbol: string;
}

export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  confidence: number;
  keywords: string[];
}

export interface AggregatedScore {
  overallScore: number;
  confidence: number;
  trend: 'improving' | 'declining' | 'stable';
  breakdown: {
    twitter: SentimentScore;
    reddit: SentimentScore;
    news: NewsSentiment;
  };
  timestamp: Date;
}

export interface CorrelationMetrics {
  correlationCoefficient: number;
  optimalLag: number;
  leadTime: number;
  predictivePower: number;
  dataPoints: number;
}

// ============================================================================
// Crypto-Specific Keywords
// ============================================================================

const BULLISH_KEYWORDS = [
  'moon', 'rocket', 'pump', 'bull', 'long', 'buy', 'hodl', 'accumulate',
  'breakout', 'rally', 'surge', 'soar', 'up', 'gain', 'profit', 'green',
  'bullish', 'uptrend', 'breakthrough', 'adoption', 'partnership'
];

const BEARISH_KEYWORDS = [
  'dump', 'crash', 'bear', 'short', 'sell', 'exit', 'dead', 'scam', 'rug',
  'down', 'loss', 'red', 'bearish', 'downtrend', 'collapse', 'plunge',
  'decline', 'drop', 'fall', 'hack', 'exploit'
];

const NEUTRAL_KEYWORDS = [
  'stable', 'consolidation', 'sideways', 'range', 'holding', 'watching',
  'waiting', 'support', 'resistance', 'flat'
];

const BULLISH_EMOJIS = ['🚀', '🌙', '💎', '🙌', '💰', '📈', '🐂', '🟢'];
const BEARISH_EMOJIS = ['💀', '📉', '🐻', '🔴', '⚠️', '❌'];

// ============================================================================
// Caching
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

async function checkRateLimit(key: string): Promise<void> {
  const now = Date.now();
  const entry = rateLimits.get(key);
  
  if (!entry || now > entry.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return;
  }
  
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const waitTime = entry.resetTime - now;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    rateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    entry.count++;
  }
}

// ============================================================================
// Core Sentiment Analysis Function
// ============================================================================

/**
 * Analyzes the sentiment of a given text
 * 
 * @param text - Text to analyze
 * @returns Sentiment analysis result with score and confidence
 */
export function analyzeSentiment(text: string): SentimentResult {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  const foundKeywords: string[] = [];
  
  // Check for bullish keywords
  for (const keyword of BULLISH_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      bullishCount++;
      foundKeywords.push(keyword);
    }
  }
  
  // Check for bearish keywords
  for (const keyword of BEARISH_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      bearishCount++;
      foundKeywords.push(keyword);
    }
  }
  
  // Check for neutral keywords
  for (const keyword of NEUTRAL_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      neutralCount++;
      foundKeywords.push(keyword);
    }
  }
  
  // Check for emojis
  for (const emoji of BULLISH_EMOJIS) {
    if (text.includes(emoji)) {
      bullishCount += 0.5;
    }
  }
  
  for (const emoji of BEARISH_EMOJIS) {
    if (text.includes(emoji)) {
      bearishCount += 0.5;
    }
  }
  
  // Calculate sentiment score (-1 to +1)
  const totalSignals = bullishCount + bearishCount + neutralCount;
  let score = 0;
  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  
  if (totalSignals > 0) {
    score = (bullishCount - bearishCount) / totalSignals;
    
    if (score > 0.2) {
      sentiment = 'positive';
    } else if (score < -0.2) {
      sentiment = 'negative';
    }
  }
  
  // Calculate confidence based on number of signals
  const confidence = Math.min(totalSignals / 10, 1);
  
  return {
    sentiment,
    score,
    confidence,
    keywords: foundKeywords
  };
}

// ============================================================================
// Twitter Sentiment Analyzer
// ============================================================================

/**
 * Analyzes sentiment from Twitter
 */
export class TwitterSentimentAnalyzer {
  private apiKey: string;
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TWITTER_API_KEY || '';
  }
  
  /**
   * Analyzes recent tweets for a given symbol
   * 
   * @param symbol - Cryptocurrency symbol (e.g., "BTC", "ETH")
   * @param count - Number of tweets to analyze
   * @returns Aggregated sentiment score
   */
  async analyzeTweets(symbol: string, count: number = 100): Promise<SentimentScore> {
    const cacheKey = `twitter:${symbol}:${count}`;
    const cached = getCached<SentimentScore>(cacheKey);
    if (cached) return cached;
    
    await checkRateLimit('twitter');
    
    // Mock implementation - in production, use Twitter API v2
    const tweets = await this.fetchTweets(symbol, count);
    
    let totalScore = 0;
    let totalConfidence = 0;
    
    for (const tweet of tweets) {
      const sentiment = analyzeSentiment(tweet.text);
      totalScore += sentiment.score;
      totalConfidence += sentiment.confidence;
    }
    
    const avgScore = tweets.length > 0 ? totalScore / tweets.length : 0;
    const avgConfidence = tweets.length > 0 ? totalConfidence / tweets.length : 0;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (avgScore > 0.2) trend = 'bullish';
    else if (avgScore < -0.2) trend = 'bearish';
    
    const result: SentimentScore = {
      score: avgScore,
      confidence: avgConfidence,
      volume: tweets.length,
      trend,
      timestamp: new Date()
    };
    
    setCache(cacheKey, result);
    return result;
  }
  
  /**
   * Tracks sentiment from specific crypto influencers
   * 
   * @param influencerList - List of Twitter usernames
   * @returns Sentiment analysis for each influencer
   */
  async trackInfluencers(influencerList: string[]): Promise<InfluencerSentiment[]> {
    await checkRateLimit('twitter');
    
    const results: InfluencerSentiment[] = [];
    
    for (const username of influencerList) {
      const tweets = await this.fetchUserTweets(username, 20);
      
      let totalSentiment = 0;
      for (const tweet of tweets) {
        const sentiment = analyzeSentiment(tweet.text);
        totalSentiment += sentiment.score;
      }
      
      const avgSentiment = tweets.length > 0 ? totalSentiment / tweets.length : 0;
      
      // Calculate engagement
      const totalEngagement = tweets.reduce((sum, t) => 
        sum + t.likes + t.retweets + t.replies, 0
      );
      
      results.push({
        username,
        sentiment: avgSentiment,
        followers: Math.floor(Math.random() * 100000), // Mock data
        engagement: totalEngagement,
        recentTweets: tweets
      });
    }
    
    return results;
  }
  
  /**
   * Detects trending crypto topics on Twitter
   * 
   * @returns List of trending topics with sentiment
   */
  async detectTrendingTopics(): Promise<TrendingTopic[]> {
    await checkRateLimit('twitter');
    
    // Mock implementation - in production, use Twitter trending API
    const topics = [
      'BTC', 'ETH', 'Ethereum', 'Bitcoin', 'DeFi', 'NFT', 'Web3', 'altcoin'
    ];
    
    const results: TrendingTopic[] = [];
    
    for (const topic of topics) {
      const tweets = await this.fetchTweets(topic, 50);
      
      let totalSentiment = 0;
      for (const tweet of tweets) {
        const sentiment = analyzeSentiment(tweet.text);
        totalSentiment += sentiment.score;
      }
      
      results.push({
        topic,
        volume: tweets.length,
        sentiment: tweets.length > 0 ? totalSentiment / tweets.length : 0,
        mentions: tweets.length
      });
    }
    
    return results.sort((a, b) => b.volume - a.volume);
  }
  
  private async fetchTweets(query: string, count: number): Promise<Tweet[]> {
    // Mock implementation - replace with actual Twitter API v2 calls
    const mockTweets: Tweet[] = [];
    
    for (let i = 0; i < Math.min(count, 50); i++) {
      mockTweets.push({
        id: `tweet_${i}`,
        text: this.generateMockTweet(query),
        author: `user_${i}`,
        likes: Math.floor(Math.random() * 1000),
        retweets: Math.floor(Math.random() * 500),
        replies: Math.floor(Math.random() * 100),
        createdAt: new Date(Date.now() - Math.random() * 86400000)
      });
    }
    
    return mockTweets;
  }
  
  private async fetchUserTweets(username: string, count: number): Promise<Tweet[]> {
    return this.fetchTweets(username, count);
  }
  
  private generateMockTweet(symbol: string): string {
    const templates = [
      `${symbol} to the moon! 🚀`,
      `Just bought more ${symbol}, bullish!`,
      `${symbol} looking bearish, might sell`,
      `${symbol} consolidating, waiting for breakout`,
      `Big news for ${symbol} coming soon 💎🙌`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

// ============================================================================
// Reddit Sentiment Analyzer
// ============================================================================

/**
 * Analyzes sentiment from Reddit
 */
export class RedditSentimentAnalyzer {
  private clientId: string;
  private clientSecret: string;
  
  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.REDDIT_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.REDDIT_CLIENT_SECRET || '';
  }
  
  /**
   * Analyzes sentiment from a specific subreddit
   * 
   * @param subreddit - Subreddit name (without r/)
   * @param limit - Number of posts to analyze
   * @returns Aggregated sentiment score
   */
  async analyzeSubreddit(subreddit: string, limit: number = 100): Promise<SentimentScore> {
    const cacheKey = `reddit:${subreddit}:${limit}`;
    const cached = getCached<SentimentScore>(cacheKey);
    if (cached) return cached;
    
    await checkRateLimit('reddit');
    
    const posts = await this.fetchSubredditPosts(subreddit, limit);
    
    let totalScore = 0;
    let totalConfidence = 0;
    
    for (const post of posts) {
      const sentiment = analyzeSentiment(post.title);
      totalScore += sentiment.score * (1 + Math.log10(post.upvotes + 1) / 10);
      totalConfidence += sentiment.confidence;
    }
    
    const avgScore = posts.length > 0 ? totalScore / posts.length : 0;
    const avgConfidence = posts.length > 0 ? totalConfidence / posts.length : 0;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (avgScore > 0.2) trend = 'bullish';
    else if (avgScore < -0.2) trend = 'bearish';
    
    const result: SentimentScore = {
      score: avgScore,
      confidence: avgConfidence,
      volume: posts.length,
      trend,
      timestamp: new Date()
    };
    
    setCache(cacheKey, result);
    return result;
  }
  
  /**
   * Tracks hot posts mentioning specific symbols
   * 
   * @param symbols - List of cryptocurrency symbols
   * @returns Hot posts mentioning the symbols
   */
  async trackHotPosts(symbols: string[]): Promise<RedditPost[]> {
    await checkRateLimit('reddit');
    
    const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'CryptoMoonShots'];
    const posts: RedditPost[] = [];
    
    for (const subreddit of subreddits) {
      const subredditPosts = await this.fetchSubredditPosts(subreddit, 25);
      
      for (const post of subredditPosts) {
        const lowerTitle = post.title.toLowerCase();
        
        for (const symbol of symbols) {
          if (lowerTitle.includes(symbol.toLowerCase())) {
            const sentiment = analyzeSentiment(post.title);
            posts.push({
              ...post,
              sentiment: sentiment.score
            });
            break;
          }
        }
      }
    }
    
    return posts.sort((a, b) => b.upvotes - a.upvotes);
  }
  
  /**
   * Detects coordinated pump signals on Reddit
   * 
   * @returns Detected pump signals
   */
  async detectPumpSignals(): Promise<PumpSignal[]> {
    await checkRateLimit('reddit');
    
    const signals: PumpSignal[] = [];
    const subreddit = 'CryptoMoonShots';
    const posts = await this.fetchSubredditPosts(subreddit, 50);
    
    // Group posts by symbol mentions
    const symbolMentions = new Map<string, RedditPost[]>();
    
    for (const post of posts) {
      const words = post.title.split(/\s+/);
      for (const word of words) {
        const upper = word.toUpperCase();
        if (upper.length >= 2 && upper.length <= 5) {
          if (!symbolMentions.has(upper)) {
            symbolMentions.set(upper, []);
          }
          symbolMentions.get(upper)!.push(post);
        }
      }
    }
    
    // Detect suspicious patterns
    for (const [symbol, mentionPosts] of symbolMentions) {
      if (mentionPosts.length >= 3) {
        // Check for coordinated timing
        const timestamps = mentionPosts.map(p => new Date(p.url).getTime());
        const timeRange = Math.max(...timestamps) - Math.min(...timestamps);
        const avgInterval = timeRange / mentionPosts.length;
        
        if (avgInterval < 3600000) { // Within 1 hour
          const confidence = Math.min(mentionPosts.length / 10, 1);
          let riskLevel: 'low' | 'medium' | 'high' = 'low';
          
          if (confidence > 0.7) riskLevel = 'high';
          else if (confidence > 0.4) riskLevel = 'medium';
          
          signals.push({
            symbol,
            confidence,
            sources: [`r/${subreddit}`],
            detectedAt: new Date(),
            riskLevel
          });
        }
      }
    }
    
    return signals;
  }
  
  private async fetchSubredditPosts(subreddit: string, limit: number): Promise<RedditPost[]> {
    // Mock implementation - replace with actual Reddit API calls
    const posts: RedditPost[] = [];
    
    for (let i = 0; i < Math.min(limit, 50); i++) {
      posts.push({
        title: this.generateMockRedditTitle(),
        subreddit: `r/${subreddit}`,
        upvotes: Math.floor(Math.random() * 10000),
        comments: Math.floor(Math.random() * 500),
        sentiment: 0,
        url: `https://reddit.com/r/${subreddit}/comments/${i}`
      });
    }
    
    return posts;
  }
  
  private generateMockRedditTitle(): string {
    const templates = [
      'Why BTC is going to $100k',
      'ETH merge coming soon - bullish!',
      'This altcoin is ready to moon 🚀',
      'Market looks bearish, be careful',
      'Technical analysis: BTC consolidating'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

// ============================================================================
// News Sentiment Analyzer
// ============================================================================

/**
 * Analyzes sentiment from news sources
 */
export class NewsSentimentAnalyzer {
  private apiKey: string;
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NEWS_API_KEY || '';
  }
  
  /**
   * Analyzes recent news for a symbol
   * 
   * @param symbol - Cryptocurrency symbol
   * @param hours - Number of hours to look back
   * @returns News sentiment analysis
   */
  async analyzeNews(symbol: string, hours: number = 24): Promise<NewsSentiment> {
    const cacheKey = `news:${symbol}:${hours}`;
    const cached = getCached<NewsSentiment>(cacheKey);
    if (cached) return cached;
    
    await checkRateLimit('news');
    
    const articles = await this.fetchNews(symbol, hours);
    
    let totalSentiment = 0;
    let hasBreakingNews = false;
    
    for (const article of articles) {
      const sentiment = analyzeSentiment(article.title);
      article.sentiment = sentiment.score;
      totalSentiment += sentiment.score;
      
      // Check for breaking news
      const hoursSincePublished = (Date.now() - article.publishedAt.getTime()) / 3600000;
      if (hoursSincePublished < 1 && Math.abs(sentiment.score) > 0.5) {
        hasBreakingNews = true;
      }
    }
    
    const result: NewsSentiment = {
      overallSentiment: articles.length > 0 ? totalSentiment / articles.length : 0,
      articles,
      breakingNews: hasBreakingNews
    };
    
    setCache(cacheKey, result);
    return result;
  }
  
  /**
   * Gets breaking crypto news
   * 
   * @returns Recent breaking news articles
   */
  async getBreakingNews(): Promise<NewsArticle[]> {
    await checkRateLimit('news');
    
    const allArticles = await this.fetchNews('crypto', 2);
    
    return allArticles.filter(article => {
      const hoursSincePublished = (Date.now() - article.publishedAt.getTime()) / 3600000;
      return hoursSincePublished < 2;
    });
  }
  
  /**
   * Calculates the potential market impact of a news article
   * 
   * @param article - News article to analyze
   * @returns Impact score and level
   */
  calculateNewsImpact(article: NewsArticle): ImpactScore {
    const factors: string[] = [];
    let score = Math.abs(article.sentiment);
    
    // High impact sources
    const highImpactSources = ['Bloomberg', 'Reuters', 'Wall Street Journal'];
    if (highImpactSources.some(source => article.source.includes(source))) {
      score += 0.3;
      factors.push('High-credibility source');
    }
    
    // Recent news has more impact
    const hoursSincePublished = (Date.now() - article.publishedAt.getTime()) / 3600000;
    if (hoursSincePublished < 1) {
      score += 0.2;
      factors.push('Very recent');
    } else if (hoursSincePublished < 6) {
      score += 0.1;
      factors.push('Recent');
    }
    
    // Strong sentiment indicates impact
    if (Math.abs(article.sentiment) > 0.7) {
      score += 0.2;
      factors.push('Strong sentiment');
    }
    
    let impact: 'low' | 'medium' | 'high' = 'low';
    if (score > 0.8) impact = 'high';
    else if (score > 0.5) impact = 'medium';
    
    return {
      score: Math.min(score, 1),
      impact,
      factors
    };
  }
  
  private async fetchNews(query: string, hours: number): Promise<NewsArticle[]> {
    // Mock implementation - replace with actual News API calls
    const sources = ['CoinDesk', 'CoinTelegraph', 'Bloomberg Crypto', 'Reuters'];
    const articles: NewsArticle[] = [];
    
    for (let i = 0; i < 10; i++) {
      const publishedAt = new Date(Date.now() - Math.random() * hours * 3600000);
      const title = this.generateMockNewsTitle(query);
      const sentiment = analyzeSentiment(title);
      
      articles.push({
        title,
        source: sources[Math.floor(Math.random() * sources.length)],
        url: `https://news.example.com/article/${i}`,
        sentiment: sentiment.score,
        publishedAt,
        impact: Math.abs(sentiment.score) > 0.5 ? 'high' : 'medium'
      });
    }
    
    return articles;
  }
  
  private generateMockNewsTitle(symbol: string): string {
    const templates = [
      `${symbol} Surges on Positive Regulatory News`,
      `Major Institution Announces ${symbol} Investment`,
      `${symbol} Faces Technical Challenges`,
      `Analysts Predict ${symbol} Will Reach New Highs`,
      `${symbol} Trading Volume Hits Record Levels`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

// ============================================================================
// Aggregated Sentiment
// ============================================================================

/**
 * Combines sentiment from multiple sources
 */
export class AggregatedSentiment {
  private twitter: TwitterSentimentAnalyzer;
  private reddit: RedditSentimentAnalyzer;
  private news: NewsSentimentAnalyzer;
  
  constructor() {
    this.twitter = new TwitterSentimentAnalyzer();
    this.reddit = new RedditSentimentAnalyzer();
    this.news = new NewsSentimentAnalyzer();
  }
  
  /**
   * Gets aggregated sentiment from all sources
   * 
   * @param symbol - Cryptocurrency symbol
   * @returns Combined sentiment analysis
   */
  async getSentiment(symbol: string): Promise<AggregatedScore> {
    const cacheKey = `aggregated:${symbol}`;
    const cached = getCached<AggregatedScore>(cacheKey);
    if (cached) return cached;
    
    // Fetch sentiment from all sources in parallel
    const [twitterSentiment, redditSentiment, newsSentiment] = await Promise.all([
      this.twitter.analyzeTweets(symbol, 100),
      this.reddit.analyzeSubreddit('CryptoCurrency', 100),
      this.news.analyzeNews(symbol, 24)
    ]);
    
    // Weight by source reliability and recency
    const weights = {
      twitter: 0.3,
      reddit: 0.3,
      news: 0.4
    };
    
    const overallScore = 
      twitterSentiment.score * weights.twitter +
      redditSentiment.score * weights.reddit +
      newsSentiment.overallSentiment * weights.news;
    
    const overallConfidence = 
      twitterSentiment.confidence * weights.twitter +
      redditSentiment.confidence * weights.reddit +
      0.8 * weights.news; // News typically more reliable
    
    // Determine trend
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    const avgScore = (twitterSentiment.score + redditSentiment.score + newsSentiment.overallSentiment) / 3;
    
    if (overallScore > avgScore + 0.1) {
      trend = 'improving';
    } else if (overallScore < avgScore - 0.1) {
      trend = 'declining';
    }
    
    const result: AggregatedScore = {
      overallScore,
      confidence: overallConfidence,
      trend,
      breakdown: {
        twitter: twitterSentiment,
        reddit: redditSentiment,
        news: newsSentiment
      },
      timestamp: new Date()
    };
    
    setCache(cacheKey, result);
    return result;
  }
}

// ============================================================================
// Market Manipulation Detection
// ============================================================================

/**
 * Detects potential market manipulation patterns
 * 
 * @param symbol - Cryptocurrency symbol to monitor
 * @returns Detected manipulation alerts
 */
export async function detectManipulation(symbol: string): Promise<ManipulationAlert[]> {
  const alerts: ManipulationAlert[] = [];
  
  const twitter = new TwitterSentimentAnalyzer();
  const reddit = new RedditSentimentAnalyzer();
  
  // Check for pump signals on Reddit
  const pumpSignals = await reddit.detectPumpSignals();
  for (const signal of pumpSignals) {
    if (signal.symbol === symbol && signal.riskLevel === 'high') {
      alerts.push({
        type: 'Coordinated Pump',
        confidence: signal.confidence,
        evidence: [`Multiple coordinated posts detected on ${signal.sources.join(', ')}`],
        affectedSymbol: symbol
      });
    }
  }
  
  return alerts;
}

// ============================================================================
// Sentiment-Price Correlation
// ============================================================================

/**
 * Calculates correlation between sentiment and price movements
 * 
 * @param sentimentHistory - Historical sentiment scores
 * @param priceHistory - Historical price data
 * @returns Correlation metrics
 */
export function calculateSentimentPriceCorrelation(
  sentimentHistory: Array<{ timestamp: Date; score: number }>,
  priceHistory: Array<{ timestamp: Date; price: number }>
): CorrelationMetrics {
  if (sentimentHistory.length < 10 || priceHistory.length < 10) {
    return {
      correlationCoefficient: 0,
      optimalLag: 0,
      leadTime: 0,
      predictivePower: 0,
      dataPoints: Math.min(sentimentHistory.length, priceHistory.length)
    };
  }
  
  // Align data points by timestamp
  const aligned: Array<{ sentiment: number; price: number }> = [];
  
  for (const sentiment of sentimentHistory) {
    const closestPrice = priceHistory.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp.getTime() - sentiment.timestamp.getTime());
      const currDiff = Math.abs(curr.timestamp.getTime() - sentiment.timestamp.getTime());
      return currDiff < prevDiff ? curr : prev;
    });
    
    aligned.push({
      sentiment: sentiment.score,
      price: closestPrice.price
    });
  }
  
  // Calculate correlation coefficient
  const n = aligned.length;
  const sumSentiment = aligned.reduce((sum, d) => sum + d.sentiment, 0);
  const sumPrice = aligned.reduce((sum, d) => sum + d.price, 0);
  const sumSentimentPrice = aligned.reduce((sum, d) => sum + d.sentiment * d.price, 0);
  const sumSentimentSq = aligned.reduce((sum, d) => sum + d.sentiment * d.sentiment, 0);
  const sumPriceSq = aligned.reduce((sum, d) => sum + d.price * d.price, 0);
  
  const numerator = n * sumSentimentPrice - sumSentiment * sumPrice;
  const denominator = Math.sqrt(
    (n * sumSentimentSq - sumSentiment * sumSentiment) *
    (n * sumPriceSq - sumPrice * sumPrice)
  );
  
  const correlationCoefficient = denominator !== 0 ? numerator / denominator : 0;
  
  // Calculate predictive power (R-squared)
  const predictivePower = correlationCoefficient * correlationCoefficient;
  
  return {
    correlationCoefficient,
    optimalLag: 0, // Simplified - in production, test multiple lag values
    leadTime: 0,
    predictivePower,
    dataPoints: n
  };
}