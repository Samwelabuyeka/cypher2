import type { FastifyRequest, FastifyReply } from "fastify";
import { logger } from "gadget-server";

/**
 * Rate limiting algorithm types
 */
export enum RateLimitAlgorithm {
  FIXED_WINDOW = "fixed-window",
  SLIDING_WINDOW_LOG = "sliding-window-log",
  SLIDING_WINDOW_COUNTER = "sliding-window-counter",
  TOKEN_BUCKET = "token-bucket",
  LEAKY_BUCKET = "leaky-bucket",
}

/**
 * Rate limit tier types
 */
export enum RateLimitTier {
  FREE = "free",
  PAID = "paid",
  PREMIUM = "premium",
  API_KEY = "api-key",
}

/**
 * Rate limit configuration interface
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  algorithm?: RateLimitAlgorithm;
  burstCapacity?: number;
  recoveryRate?: number;
  adaptive?: boolean;
  priority?: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  limit: number;
}

/**
 * Rate limit tier configuration
 */
export interface TierConfig extends RateLimitConfig {
  tier: RateLimitTier;
  name: string;
}

/**
 * Rate limit violation
 */
export interface RateLimitViolation {
  key: string;
  timestamp: number;
  limit: number;
  current: number;
  tier?: RateLimitTier;
}

/**
 * System load metrics
 */
export interface SystemLoad {
  cpu: number;
  memory: number;
  activeRequests: number;
  timestamp: number;
}

/**
 * User reputation score
 */
export interface UserReputation {
  score: number;
  violations: number;
  lastViolation?: number;
  trustLevel: "low" | "medium" | "high";
}

/**
 * Predefined rate limit tiers
 */
export const RATE_LIMIT_TIERS: Record<RateLimitTier, TierConfig> = {
  [RateLimitTier.FREE]: {
    tier: RateLimitTier.FREE,
    name: "Free User",
    windowMs: 3600000, // 1 hour
    maxRequests: 100,
    burstCapacity: 10,
    recoveryRate: 100 / 3600, // requests per second
  },
  [RateLimitTier.PAID]: {
    tier: RateLimitTier.PAID,
    name: "Paid User",
    windowMs: 3600000, // 1 hour
    maxRequests: 1000,
    burstCapacity: 50,
    recoveryRate: 1000 / 3600,
  },
  [RateLimitTier.PREMIUM]: {
    tier: RateLimitTier.PREMIUM,
    name: "Premium User",
    windowMs: 3600000, // 1 hour
    maxRequests: 10000,
    burstCapacity: 200,
    recoveryRate: 10000 / 3600,
  },
  [RateLimitTier.API_KEY]: {
    tier: RateLimitTier.API_KEY,
    name: "API Key",
    windowMs: 3600000, // 1 hour
    maxRequests: 5000,
    burstCapacity: 100,
    recoveryRate: 5000 / 3600,
  },
};

/**
 * In-memory store for rate limiting (fallback when Redis is not available)
 */
class MemoryStore {
  private store: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.store.get(key);
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    this.store.set(key, value);
    if (ttlMs) {
      setTimeout(() => this.store.delete(key), ttlMs);
    }
  }

  async increment(key: string): Promise<number> {
    const current = (this.store.get(key) || 0) + 1;
    this.store.set(key, current);
    return current;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async zAdd(key: string, score: number, member: string): Promise<void> {
    const list = (this.store.get(key) || []) as Array<{ score: number; member: string }>;
    list.push({ score, member });
    this.store.set(key, list);
  }

  async zRemRangeByScore(key: string, min: number, max: number): Promise<void> {
    const list = (this.store.get(key) || []) as Array<{ score: number; member: string }>;
    const filtered = list.filter((item) => item.score < min || item.score > max);
    this.store.set(key, filtered);
  }

  async zCount(key: string, min: number, max: number): Promise<number> {
    const list = (this.store.get(key) || []) as Array<{ score: number; member: string }>;
    return list.filter((item) => item.score >= min && item.score <= max).length;
  }
}

/**
 * Fixed Window Counter Algorithm
 */
class FixedWindowCounter {
  constructor(private store: MemoryStore) {}

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;
    const count = (await this.store.get(windowKey)) || 0;

    const allowed = count < config.maxRequests;
    const resetTime = Math.ceil(now / config.windowMs) * config.windowMs;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - count - (allowed ? 1 : 0)),
      resetTime,
      retryAfter: allowed ? undefined : resetTime - now,
      limit: config.maxRequests,
    };
  }

  async increment(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;
    await this.store.increment(windowKey);
    await this.store.set(windowKey, (await this.store.get(windowKey)) || 1, config.windowMs);
  }

  async reset(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;
    await this.store.delete(windowKey);
  }
}

/**
 * Sliding Window Log Algorithm
 */
class SlidingWindowLog {
  constructor(private store: MemoryStore) {}

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await this.store.zRemRangeByScore(key, 0, windowStart);

    // Count requests in current window
    const count = await this.store.zCount(key, windowStart, now);
    const allowed = count < config.maxRequests;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - count - (allowed ? 1 : 0)),
      resetTime: now + config.windowMs,
      retryAfter: allowed ? undefined : config.windowMs,
      limit: config.maxRequests,
    };
  }

  async increment(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    await this.store.zAdd(key, now, `${now}-${Math.random()}`);
  }

  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }
}

/**
 * Sliding Window Counter Algorithm
 */
class SlidingWindowCounter {
  constructor(private store: MemoryStore) {}

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const currentWindow = Math.floor(now / config.windowMs);
    const previousWindow = currentWindow - 1;

    const currentKey = `${key}:${currentWindow}`;
    const previousKey = `${key}:${previousWindow}`;

    const currentCount = (await this.store.get(currentKey)) || 0;
    const previousCount = (await this.store.get(previousKey)) || 0;

    // Calculate weighted count based on position in current window
    const percentageInCurrentWindow = (now % config.windowMs) / config.windowMs;
    const weightedCount = Math.floor(
      previousCount * (1 - percentageInCurrentWindow) + currentCount
    );

    const allowed = weightedCount < config.maxRequests;
    const resetTime = (currentWindow + 1) * config.windowMs;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - weightedCount - (allowed ? 1 : 0)),
      resetTime,
      retryAfter: allowed ? undefined : resetTime - now,
      limit: config.maxRequests,
    };
  }

  async increment(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const currentWindow = Math.floor(now / config.windowMs);
    const currentKey = `${key}:${currentWindow}`;
    
    await this.store.increment(currentKey);
    await this.store.set(currentKey, (await this.store.get(currentKey)) || 1, config.windowMs * 2);
  }

  async reset(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const currentWindow = Math.floor(now / config.windowMs);
    const currentKey = `${key}:${currentWindow}`;
    await this.store.delete(currentKey);
  }
}

/**
 * Token Bucket Algorithm
 */
class TokenBucket {
  constructor(private store: MemoryStore) {}

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;
    const bucket = (await this.store.get(bucketKey)) || {
      tokens: config.maxRequests,
      lastRefill: now,
    };

    // Refill tokens based on time passed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed * (config.recoveryRate || 1));
    bucket.tokens = Math.min(
      config.maxRequests + (config.burstCapacity || 0),
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    const resetTime = now + Math.ceil((1 - bucket.tokens) / (config.recoveryRate || 1)) * 1000;

    return {
      allowed,
      remaining: Math.floor(bucket.tokens) - (allowed ? 1 : 0),
      resetTime,
      retryAfter: allowed ? undefined : resetTime - now,
      limit: config.maxRequests,
    };
  }

  async increment(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;
    const bucket = (await this.store.get(bucketKey)) || {
      tokens: config.maxRequests,
      lastRefill: now,
    };

    bucket.tokens = Math.max(0, bucket.tokens - 1);
    await this.store.set(bucketKey, bucket);
  }

  async reset(key: string, config: RateLimitConfig): Promise<void> {
    const bucketKey = `${key}:bucket`;
    await this.store.set(bucketKey, {
      tokens: config.maxRequests,
      lastRefill: Date.now(),
    });
  }
}

/**
 * Leaky Bucket Algorithm
 */
class LeakyBucket {
  constructor(private store: MemoryStore) {}

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `${key}:leaky`;
    const bucket = (await this.store.get(bucketKey)) || {
      queue: 0,
      lastLeak: now,
    };

    // Leak tokens based on time passed
    const timePassed = now - bucket.lastLeak;
    const tokensToLeak = Math.floor(timePassed * (config.recoveryRate || 1));
    bucket.queue = Math.max(0, bucket.queue - tokensToLeak);
    bucket.lastLeak = now;

    const allowed = bucket.queue < config.maxRequests;
    const resetTime = now + Math.ceil(bucket.queue / (config.recoveryRate || 1)) * 1000;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - bucket.queue - (allowed ? 1 : 0)),
      resetTime,
      retryAfter: allowed ? undefined : resetTime - now,
      limit: config.maxRequests,
    };
  }

  async increment(key: string, config: RateLimitConfig): Promise<void> {
    const now = Date.now();
    const bucketKey = `${key}:leaky`;
    const bucket = (await this.store.get(bucketKey)) || {
      queue: 0,
      lastLeak: now,
    };

    bucket.queue += 1;
    await this.store.set(bucketKey, bucket);
  }

  async reset(key: string): Promise<void> {
    const bucketKey = `${key}:leaky`;
    await this.store.set(bucketKey, {
      queue: 0,
      lastLeak: Date.now(),
    });
  }
}

/**
 * Main Rate Limiter class
 */
export class RateLimiter {
  private store: MemoryStore;
  private algorithms: Map<RateLimitAlgorithm, any>;
  private violations: RateLimitViolation[] = [];
  private systemLoad: SystemLoad = {
    cpu: 0,
    memory: 0,
    activeRequests: 0,
    timestamp: Date.now(),
  };
  private reputationScores: Map<string, UserReputation> = new Map();

  constructor(private config: RateLimitConfig) {
    this.store = new MemoryStore();
    this.algorithms = new Map([
      [RateLimitAlgorithm.FIXED_WINDOW, new FixedWindowCounter(this.store)],
      [RateLimitAlgorithm.SLIDING_WINDOW_LOG, new SlidingWindowLog(this.store)],
      [RateLimitAlgorithm.SLIDING_WINDOW_COUNTER, new SlidingWindowCounter(this.store)],
      [RateLimitAlgorithm.TOKEN_BUCKET, new TokenBucket(this.store)],
      [RateLimitAlgorithm.LEAKY_BUCKET, new LeakyBucket(this.store)],
    ]);
  }

  private getAlgorithm() {
    const algorithm = this.config.algorithm || RateLimitAlgorithm.SLIDING_WINDOW_COUNTER;
    return this.algorithms.get(algorithm);
  }

  private applyAdaptiveAdjustment(config: RateLimitConfig): RateLimitConfig {
    if (!config.adaptive) return config;

    const adjustedConfig = { ...config };

    // Reduce limits if system is under heavy load
    if (this.systemLoad.cpu > 80 || this.systemLoad.memory > 80) {
      adjustedConfig.maxRequests = Math.floor(config.maxRequests * 0.5);
    } else if (this.systemLoad.cpu > 60 || this.systemLoad.memory > 60) {
      adjustedConfig.maxRequests = Math.floor(config.maxRequests * 0.75);
    }

    // Adjust based on active requests
    if (this.systemLoad.activeRequests > 1000) {
      adjustedConfig.maxRequests = Math.floor(adjustedConfig.maxRequests * 0.8);
    }

    return adjustedConfig;
  }

  private applyReputationAdjustment(key: string, config: RateLimitConfig): RateLimitConfig {
    const reputation = this.reputationScores.get(key);
    if (!reputation) return config;

    const adjustedConfig = { ...config };

    // Reduce limits for users with low reputation
    if (reputation.trustLevel === "low") {
      adjustedConfig.maxRequests = Math.floor(config.maxRequests * 0.5);
    } else if (reputation.trustLevel === "high") {
      // Increase limits for trusted users
      adjustedConfig.maxRequests = Math.floor(config.maxRequests * 1.2);
    }

    return adjustedConfig;
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    let adjustedConfig = this.applyAdaptiveAdjustment(this.config);
    adjustedConfig = this.applyReputationAdjustment(key, adjustedConfig);

    const algorithm = this.getAlgorithm();
    const result = await algorithm.checkLimit(key, adjustedConfig);

    if (!result.allowed) {
      this.recordViolation(key, result.limit, result.limit);
    }

    return result;
  }

  async increment(key: string): Promise<void> {
    const adjustedConfig = this.applyAdaptiveAdjustment(this.config);
    const algorithm = this.getAlgorithm();
    await algorithm.increment(key, adjustedConfig);
  }

  async reset(key: string): Promise<void> {
    const algorithm = this.getAlgorithm();
    await algorithm.reset(key, this.config);
  }

  async getRemainingQuota(key: string): Promise<number> {
    const result = await this.checkLimit(key);
    return result.remaining;
  }

  private recordViolation(key: string, limit: number, current: number): void {
    const violation: RateLimitViolation = {
      key,
      timestamp: Date.now(),
      limit,
      current,
    };

    this.violations.push(violation);

    // Update reputation score
    const reputation = this.reputationScores.get(key) || {
      score: 100,
      violations: 0,
      trustLevel: "medium" as const,
    };

    reputation.violations += 1;
    reputation.lastViolation = Date.now();
    reputation.score = Math.max(0, reputation.score - 10);

    if (reputation.score < 30) {
      reputation.trustLevel = "low";
    } else if (reputation.score > 70) {
      reputation.trustLevel = "high";
    } else {
      reputation.trustLevel = "medium";
    }

    this.reputationScores.set(key, reputation);

    // Alert on abuse patterns (more than 10 violations in 5 minutes)
    const recentViolations = this.violations.filter(
      (v) => v.key === key && Date.now() - v.timestamp < 300000
    );

    if (recentViolations.length > 10) {
      logger.warn(`Rate limit abuse detected for key: ${key}`, {
        violations: recentViolations.length,
        reputation: reputation.score,
      });
    }

    // Keep only recent violations (last hour)
    this.violations = this.violations.filter((v) => Date.now() - v.timestamp < 3600000);
  }

  updateSystemLoad(load: Partial<SystemLoad>): void {
    this.systemLoad = {
      ...this.systemLoad,
      ...load,
      timestamp: Date.now(),
    };
  }

  getViolations(key?: string): RateLimitViolation[] {
    if (key) {
      return this.violations.filter((v) => v.key === key);
    }
    return [...this.violations];
  }

  getReputation(key: string): UserReputation | undefined {
    return this.reputationScores.get(key);
  }

  generateReport(): {
    totalViolations: number;
    violationsByKey: Record<string, number>;
    topOffenders: Array<{ key: string; count: number }>;
    averageReputation: number;
  } {
    const violationsByKey: Record<string, number> = {};

    for (const violation of this.violations) {
      violationsByKey[violation.key] = (violationsByKey[violation.key] || 0) + 1;
    }

    const topOffenders = Object.entries(violationsByKey)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const reputationScores = Array.from(this.reputationScores.values()).map((r) => r.score);
    const averageReputation =
      reputationScores.length > 0
        ? reputationScores.reduce((a, b) => a + b, 0) / reputationScores.length
        : 0;

    return {
      totalViolations: this.violations.length,
      violationsByKey,
      topOffenders,
      averageReputation,
    };
  }
}

/**
 * Create rate limiter for a specific tier
 */
export function createTierLimiter(tier: RateLimitTier): RateLimiter {
  const config = RATE_LIMIT_TIERS[tier];
  return new RateLimiter(config);
}

/**
 * Default key generator (uses IP address)
 */
export function defaultKeyGenerator(req: FastifyRequest): string {
  return req.ip || "unknown";
}

/**
 * User-based key generator
 */
export function userKeyGenerator(req: FastifyRequest): string {
  const userId = (req as any).session?.userId || (req as any).user?.id;
  return userId ? `user:${userId}` : `ip:${req.ip || "unknown"}`;
}

/**
 * API key-based key generator
 */
export function apiKeyGenerator(req: FastifyRequest): string {
  const apiKey = req.headers["x-api-key"] as string;
  return apiKey ? `api-key:${apiKey}` : `ip:${req.ip || "unknown"}`;
}

/**
 * Create Fastify middleware for rate limiting
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = keyGenerator(req);
    const result = await limiter.checkLimit(key);

    // Set rate limit headers
    reply.header("X-RateLimit-Limit", result.limit.toString());
    reply.header("X-RateLimit-Remaining", result.remaining.toString());
    reply.header("X-RateLimit-Reset", result.resetTime.toString());

    if (!result.allowed) {
      if (result.retryAfter) {
        reply.header("Retry-After", Math.ceil(result.retryAfter / 1000).toString());
      }

      reply.status(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: result.retryAfter,
      });
      return;
    }

    // Only increment if request will be processed
    await limiter.increment(key);

    // Track active requests for adaptive limiting
    limiter.updateSystemLoad({
      activeRequests: (limiter as any).systemLoad.activeRequests + 1,
    });

    // Decrement on response
    reply.addHook("onResponse", async () => {
      limiter.updateSystemLoad({
        activeRequests: Math.max(0, (limiter as any).systemLoad.activeRequests - 1),
      });
    });
  };
}

/**
 * Create tier-based middleware
 */
export function createTierMiddleware(tier: RateLimitTier) {
  const config = RATE_LIMIT_TIERS[tier];
  return createRateLimitMiddleware(config);
}

/**
 * Adaptive rate limiting based on system metrics
 */
export class AdaptiveRateLimiter extends RateLimiter {
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    super({ ...config, adaptive: true });
    this.startMonitoring();
  }

  private startMonitoring(): void {
    // Monitor system load every 10 seconds
    this.monitoringInterval = setInterval(() => {
      // In a real implementation, you would collect actual system metrics
      // For now, we'll use placeholder values
      this.updateSystemLoad({
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
      });
    }, 10000);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}

/**
 * Export all types and utilities
 */
export {
  FixedWindowCounter,
  SlidingWindowLog,
  SlidingWindowCounter,
  TokenBucket,
  LeakyBucket,
  MemoryStore,
};