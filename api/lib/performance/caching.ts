import { promisify } from "util";
import { gzip, gunzip } from "zlib";
import crypto from "crypto";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Cache interface defining core operations
 */
export interface Cache<T = any> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * LRU node for doubly linked list
 */
interface LRUNode<T> {
  key: string;
  entry: CacheEntry<T>;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  size: number;
  maxSize: number;
  totalRequests: number;
  averageLatency: number;
}

/**
 * Memoization options
 */
export interface MemoizeOptions {
  ttl?: number;
  keyGenerator?: (...args: any[]) => string;
  cache?: Cache;
}

/**
 * In-memory LRU cache implementation
 */
export class MemoryCache<T = any> implements Cache<T> {
  private cache: Map<string, LRUNode<T>>;
  private head: LRUNode<T> | null;
  private tail: LRUNode<T> | null;
  private maxSize: number;
  private currentSize: number;
  private stats: CacheStats;
  private latencies: number[];
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.head = null;
    this.tail = null;
    this.maxSize = maxSize;
    this.currentSize = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      size: 0,
      maxSize,
      totalRequests: 0,
      averageLatency: 0,
    };
    this.latencies = [];

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  async get(key: string): Promise<T | null> {
    const startTime = performance.now();
    const node = this.cache.get(key);

    if (!node) {
      this.stats.misses++;
      this.stats.totalRequests++;
      this.updateLatency(performance.now() - startTime);
      this.updateHitRate();
      return null;
    }

    // Check expiration
    if (node.entry.expiresAt < Date.now()) {
      await this.delete(key);
      this.stats.misses++;
      this.stats.totalRequests++;
      this.updateLatency(performance.now() - startTime);
      this.updateHitRate();
      return null;
    }

    // Update access info
    node.entry.accessCount++;
    node.entry.lastAccessed = Date.now();

    // Move to front (most recently used)
    this.moveToFront(node);

    this.stats.hits++;
    this.stats.totalRequests++;
    this.updateLatency(performance.now() - startTime);
    this.updateHitRate();

    return node.entry.value;
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    const size = this.estimateSize(value);
    const expiresAt = ttl ? Date.now() + ttl * 1000 : Number.MAX_SAFE_INTEGER;

    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing entry
      this.currentSize -= existingNode.entry.size;
      existingNode.entry.value = value;
      existingNode.entry.size = size;
      existingNode.entry.expiresAt = expiresAt;
      existingNode.entry.lastAccessed = Date.now();
      this.currentSize += size;
      this.moveToFront(existingNode);
    } else {
      // Create new entry
      const entry: CacheEntry<T> = {
        value,
        expiresAt,
        size,
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      const node: LRUNode<T> = {
        key,
        entry,
        prev: null,
        next: null,
      };

      this.cache.set(key, node);
      this.addToFront(node);
      this.currentSize += size;

      // Evict if necessary
      while (this.cache.size > this.maxSize) {
        await this.evictLRU();
      }
    }

    this.stats.sets++;
    this.stats.size = this.cache.size;
  }

  async delete(key: string): Promise<void> {
    const node = this.cache.get(key);
    if (!node) return;

    this.removeNode(node);
    this.cache.delete(key);
    this.currentSize -= node.entry.size;
    this.stats.deletes++;
    this.stats.size = this.cache.size;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
    this.stats.size = 0;
  }

  async has(key: string): Promise<boolean> {
    const node = this.cache.get(key);
    if (!node) return false;

    // Check expiration
    if (node.entry.expiresAt < Date.now()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private moveToFront(node: LRUNode<T>): void {
    if (node === this.head) return;

    this.removeNode(node);
    this.addToFront(node);
  }

  private addToFront(node: LRUNode<T>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private async evictLRU(): Promise<void> {
    if (!this.tail) return;

    const key = this.tail.key;
    await this.delete(key);
    this.stats.evictions++;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, node] of this.cache.entries()) {
      if (node.entry.expiresAt < now) {
        this.delete(key);
      }
    }
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  private updateLatency(latency: number): void {
    this.latencies.push(latency);
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
    this.stats.averageLatency =
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  private updateHitRate(): void {
    this.stats.hitRate =
      this.stats.totalRequests > 0
        ? this.stats.hits / this.stats.totalRequests
        : 0;
  }
}

/**
 * Tagged cache for group invalidation
 */
export class TaggedCache<T = any> implements Cache<T> {
  private cache: Cache<T>;
  private tags: Map<string, Set<string>>;

  constructor(cache: Cache<T>) {
    this.cache = cache;
    this.tags = new Map();
  }

  async get(key: string): Promise<T | null> {
    return this.cache.get(key);
  }

  async set(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    await this.cache.set(key, value, ttl);

    if (tags) {
      for (const tag of tags) {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, new Set());
        }
        this.tags.get(tag)!.add(key);
      }
    }
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
    
    // Remove from tags
    for (const keys of this.tags.values()) {
      keys.delete(key);
    }
  }

  async clear(): Promise<void> {
    await this.cache.clear();
    this.tags.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async invalidateByTag(tag: string): Promise<void> {
    const keys = this.tags.get(tag);
    if (!keys) return;

    for (const key of keys) {
      await this.delete(key);
    }

    this.tags.delete(tag);
  }
}

/**
 * Cache manager with multiple layers and advanced features
 */
export class CacheManager {
  private primaryCache: Cache;
  private locks: Map<string, Promise<any>>;
  private compressionThreshold: number;

  constructor(
    primaryCache?: Cache,
    compressionThreshold: number = 10000
  ) {
    this.primaryCache = primaryCache || new MemoryCache();
    this.locks = new Map();
    this.compressionThreshold = compressionThreshold;
  }

  async get<T>(key: string, decompress: boolean = true): Promise<T | null> {
    const value = await this.primaryCache.get(key);
    
    if (value === null) return null;

    if (decompress && this.isCompressed(value)) {
      return await this.decompressValue(value);
    }

    return value;
  }

  async set<T>(key: string, value: T, ttl?: number, compress: boolean = true): Promise<void> {
    let finalValue: any = value;

    if (compress && this.shouldCompress(value)) {
      finalValue = await this.compressValue(value);
    }

    await this.primaryCache.set(key, finalValue, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.primaryCache.delete(key);
  }

  async clear(): Promise<void> {
    await this.primaryCache.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.primaryCache.has(key);
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);
    
    if (this.primaryCache instanceof MemoryCache) {
      const cache = this.primaryCache as any;
      for (const key of cache.cache.keys()) {
        if (regex.test(key)) {
          await this.delete(key);
        }
      }
    }
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    await this.invalidateByPattern(`^${prefix}`);
  }

  async cacheAside<T>(
    key: string,
    loader: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Load data
    const value = await loader();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  async cacheThrough<T>(
    key: string,
    loader: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Prevent cache stampede with locking
    const existingLock = this.locks.get(key);
    if (existingLock) {
      return existingLock;
    }

    const promise = (async () => {
      try {
        const cached = await this.get<T>(key);
        if (cached !== null) {
          return cached;
        }

        const value = await loader();
        await this.set(key, value, ttl);
        return value;
      } finally {
        this.locks.delete(key);
      }
    })();

    this.locks.set(key, promise);
    return promise;
  }

  async warmCache<T>(
    keys: string[],
    loader: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const promises = keys.map(async (key) => {
      const value = await loader(key);
      await this.set(key, value, ttl);
    });

    await Promise.all(promises);
  }

  getStats(): CacheStats | null {
    if (this.primaryCache instanceof MemoryCache) {
      return this.primaryCache.getStats();
    }
    return null;
  }

  private shouldCompress(value: any): boolean {
    try {
      const size = JSON.stringify(value).length;
      return size > this.compressionThreshold;
    } catch {
      return false;
    }
  }

  private isCompressed(value: any): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      value.__compressed === true
    );
  }

  private async compressValue<T>(value: T): Promise<any> {
    const json = JSON.stringify(value);
    const buffer = Buffer.from(json, "utf-8");
    const compressed = await gzipAsync(buffer);

    return {
      __compressed: true,
      data: compressed.toString("base64"),
    };
  }

  private async decompressValue<T>(compressed: any): Promise<T> {
    const buffer = Buffer.from(compressed.data, "base64");
    const decompressed = await gunzipAsync(buffer);
    const json = decompressed.toString("utf-8");
    return JSON.parse(json);
  }
}

/**
 * Memoize function with caching
 */
export function memoize<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: MemoizeOptions = {}
): T {
  const cache = options.cache || new MemoryCache();
  const ttl = options.ttl;
  const keyGenerator =
    options.keyGenerator ||
    ((...args: any[]) => {
      return crypto
        .createHash("sha256")
        .update(JSON.stringify(args))
        .digest("hex");
    });

  return (async (...args: any[]) => {
    const key = keyGenerator(...args);
    const cached = await cache.get(key);

    if (cached !== null) {
      return cached;
    }

    const result = await fn(...args);
    await cache.set(key, result, ttl);

    return result;
  }) as T;
}

/**
 * Cache-aside pattern helper
 */
export async function cacheAside<T>(
  key: string,
  loader: () => Promise<T>,
  ttl?: number,
  cache?: Cache
): Promise<T> {
  const cacheInstance = cache || defaultCache;
  const cached = await cacheInstance.get(key);

  if (cached !== null) {
    return cached;
  }

  const value = await loader();
  await cacheInstance.set(key, value, ttl);

  return value;
}

/**
 * Cache-through pattern helper with stampede prevention
 */
export async function cacheThrough<T>(
  key: string,
  loader: () => Promise<T>,
  ttl?: number,
  cache?: Cache
): Promise<T> {
  const manager = new CacheManager(cache);
  return manager.cacheThrough(key, loader, ttl);
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateByPattern(
  pattern: string,
  cache?: Cache
): Promise<void> {
  const manager = new CacheManager(cache);
  await manager.invalidateByPattern(pattern);
}

/**
 * Invalidate cache by tag
 */
export async function invalidateByTag(
  tag: string,
  cache?: TaggedCache
): Promise<void> {
  if (!cache) {
    throw new Error("Tagged cache required for tag invalidation");
  }
  await cache.invalidateByTag(tag);
}

/**
 * Invalidate cache by prefix
 */
export async function invalidateByPrefix(
  prefix: string,
  cache?: Cache
): Promise<void> {
  const manager = new CacheManager(cache);
  await manager.invalidateByPrefix(prefix);
}

/**
 * Warm cache with multiple keys
 */
export async function warmCache<T>(
  keys: string[],
  loader: (key: string) => Promise<T>,
  ttl?: number,
  cache?: Cache
): Promise<void> {
  const manager = new CacheManager(cache);
  await manager.warmCache(keys, loader, ttl);
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache?: Cache): CacheStats | null {
  const manager = new CacheManager(cache);
  return manager.getStats();
}

/**
 * Track cache hit rate
 */
export function trackHitRate(cache?: Cache): number {
  const stats = getCacheStats(cache);
  return stats ? stats.hitRate : 0;
}

/**
 * Track cache miss rate
 */
export function trackMissRate(cache?: Cache): number {
  const stats = getCacheStats(cache);
  return stats ? 1 - stats.hitRate : 1;
}

/**
 * Track cache latency
 */
export function trackLatency(cache?: Cache): number {
  const stats = getCacheStats(cache);
  return stats ? stats.averageLatency : 0;
}

/**
 * Compress value helper
 */
export async function compressValue<T>(value: T): Promise<string> {
  const json = JSON.stringify(value);
  const buffer = Buffer.from(json, "utf-8");
  const compressed = await gzipAsync(buffer);
  return compressed.toString("base64");
}

/**
 * Decompress value helper
 */
export async function decompressValue<T>(compressed: string): Promise<T> {
  const buffer = Buffer.from(compressed, "base64");
  const decompressed = await gunzipAsync(buffer);
  const json = decompressed.toString("utf-8");
  return JSON.parse(json);
}

/**
 * Prewarm cache on startup
 */
export async function prewarmOnStartup<T>(
  loader: () => Promise<Map<string, T>>,
  ttl?: number,
  cache?: Cache
): Promise<void> {
  const data = await loader();
  const cacheInstance = cache || defaultCache;

  for (const [key, value] of data.entries()) {
    await cacheInstance.set(key, value, ttl);
  }
}

// Default cache instance
export const defaultCache = new MemoryCache(1000);

// Export types
export type { CacheEntry, LRUNode };