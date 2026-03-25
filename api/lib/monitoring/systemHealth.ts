/**
 * System Health Monitoring
 * Provides comprehensive health tracking, circuit breaker pattern, and graceful degradation
 */

// ==================== Types & Interfaces ====================

export type HealthStatus = 'healthy' | 'degraded' | 'down';
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface HealthMetrics {
  apiResponseTime: number; // ms
  databaseQueryTime: number; // ms
  memoryUsage: number; // MB
  activeConnections: number;
  errorRate: number; // errors per minute
  queueDepth: number; // background jobs
  status: HealthStatus;
}

export interface MetricWindow {
  values: number[];
  timestamps: number[];
  maxSize: number;
}

export interface TimeWindowAverages {
  oneMinute: number;
  fiveMinute: number;
  fifteenMinute: number;
}

export interface HealthThresholds {
  slowApiResponse: number; // ms
  highMemoryUsage: number; // percentage
  highErrorRate: number; // errors per minute
  queueBacklog: number; // job count
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // ms
  resetTimeout: number; // ms
}

export interface HealthReport {
  timestamp: number;
  metrics: HealthMetrics;
  averages: {
    apiResponseTime: TimeWindowAverages;
    databaseQueryTime: TimeWindowAverages;
    errorRate: TimeWindowAverages;
  };
  alerts: string[];
  status: HealthStatus;
  degradedServices: string[];
}

// ==================== Default Configuration ====================

const DEFAULT_THRESHOLDS: HealthThresholds = {
  slowApiResponse: 1000, // 1 second
  highMemoryUsage: 80, // 80%
  highErrorRate: 10, // 10 errors per minute
  queueBacklog: 1000, // 1000 jobs
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 5000, // 5 seconds
  resetTimeout: 60000, // 1 minute
};

// ==================== HealthMonitor Class ====================

export class HealthMonitor {
  private metrics: Map<string, number>;
  private windows: Map<string, MetricWindow>;
  private thresholds: HealthThresholds;
  private errors: number[];
  private lastErrorCheck: number;

  constructor(thresholds: HealthThresholds = DEFAULT_THRESHOLDS) {
    this.metrics = new Map();
    this.windows = new Map();
    this.thresholds = thresholds;
    this.errors = [];
    this.lastErrorCheck = Date.now();
    this.initializeWindows();
  }

  private initializeWindows(): void {
    const metricNames = ['apiResponseTime', 'databaseQueryTime', 'errorRate'];
    metricNames.forEach(name => {
      this.windows.set(name, {
        values: [],
        timestamps: [],
        maxSize: 900, // 15 minutes of data at 1-second intervals
      });
    });
  }

  /**
   * Track a metric value
   */
  trackMetric(name: string, value: number): void {
    this.metrics.set(name, value);
    const window = this.windows.get(name);
    if (window) {
      const now = Date.now();
      window.values.push(value);
      window.timestamps.push(now);

      // Remove old data (older than 15 minutes)
      const fifteenMinutesAgo = now - 15 * 60 * 1000;
      while (window.timestamps.length > 0 && window.timestamps[0] < fifteenMinutesAgo) {
        window.values.shift();
        window.timestamps.shift();
      }

      // Limit size
      if (window.values.length > window.maxSize) {
        window.values.shift();
        window.timestamps.shift();
      }
    }
  }

  /**
   * Track request duration
   */
  trackRequestDuration(duration: number): void {
    this.trackMetric('apiResponseTime', duration);
  }

  /**
   * Track database query duration
   */
  trackDatabaseQuery(duration: number): void {
    this.trackMetric('databaseQueryTime', duration);
  }

  /**
   * Track an error occurrence
   */
  trackError(): void {
    const now = Date.now();
    this.errors.push(now);
    
    // Clean up errors older than 1 minute
    const oneMinuteAgo = now - 60 * 1000;
    this.errors = this.errors.filter(timestamp => timestamp > oneMinuteAgo);
    
    // Update error rate metric
    this.trackMetric('errorRate', this.errors.length);
  }

  /**
   * Calculate averages for different time windows
   */
  calculateAverages(metricName: string): TimeWindowAverages {
    const window = this.windows.get(metricName);
    if (!window || window.values.length === 0) {
      return { oneMinute: 0, fiveMinute: 0, fifteenMinute: 0 };
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    const getAverage = (cutoffTime: number): number => {
      const values = window.values.filter((_, idx) => window.timestamps[idx] > cutoffTime);
      if (values.length === 0) return 0;
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    };

    return {
      oneMinute: getAverage(oneMinuteAgo),
      fiveMinute: getAverage(fiveMinutesAgo),
      fifteenMinute: getAverage(fifteenMinutesAgo),
    };
  }

  /**
   * Check API health
   */
  checkApiHealth(): boolean {
    const apiResponseTime = this.metrics.get('apiResponseTime') || 0;
    return apiResponseTime < this.thresholds.slowApiResponse;
  }

  /**
   * Check database health
   */
  checkDatabaseHealth(): boolean {
    const dbQueryTime = this.metrics.get('databaseQueryTime') || 0;
    return dbQueryTime < this.thresholds.slowApiResponse; // Using same threshold
  }

  /**
   * Check memory health
   */
  checkMemoryHealth(): boolean {
    const memoryUsage = this.getMemoryUsagePercent();
    return memoryUsage < this.thresholds.highMemoryUsage;
  }

  /**
   * Get current memory usage as percentage
   */
  private getMemoryUsagePercent(): number {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal;
    const usedMemory = usage.heapUsed;
    return (usedMemory / totalMemory) * 100;
  }

  /**
   * Get current memory usage in MB
   */
  getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Get overall system status
   */
  getOverallStatus(): HealthStatus {
    const apiHealthy = this.checkApiHealth();
    const dbHealthy = this.checkDatabaseHealth();
    const memoryHealthy = this.checkMemoryHealth();
    const errorRate = this.metrics.get('errorRate') || 0;
    const queueDepth = this.metrics.get('queueDepth') || 0;

    // Count unhealthy components
    const unhealthyCount = [
      !apiHealthy,
      !dbHealthy,
      !memoryHealthy,
      errorRate > this.thresholds.highErrorRate,
      queueDepth > this.thresholds.queueBacklog,
    ].filter(Boolean).length;

    if (unhealthyCount === 0) {
      return 'healthy';
    } else if (unhealthyCount <= 2) {
      return 'degraded';
    } else {
      return 'down';
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): HealthMetrics {
    return {
      apiResponseTime: this.metrics.get('apiResponseTime') || 0,
      databaseQueryTime: this.metrics.get('databaseQueryTime') || 0,
      memoryUsage: this.getMemoryUsageMB(),
      activeConnections: this.metrics.get('activeConnections') || 0,
      errorRate: this.metrics.get('errorRate') || 0,
      queueDepth: this.metrics.get('queueDepth') || 0,
      status: this.getOverallStatus(),
    };
  }
}

// ==================== CircuitBreaker Class ====================

export class CircuitBreaker {
  private state: CircuitState;
  private failures: number;
  private successes: number;
  private lastFailureTime: number;
  private config: CircuitBreakerConfig;
  private nextAttemptTime: number;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.config = config;
    this.nextAttemptTime = 0;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (now < this.nextAttemptTime) {
        throw new Error('Circuit breaker is open');
      }
      // Try to recover
      this.state = 'half-open';
      this.successes = 0;
    }

    try {
      const result = await Promise.race([
        fn(),
        this.timeoutPromise(),
      ]);
      this.onSuccess();
      return result as T;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Circuit breaker timeout'));
      }, this.config.timeout);
    });
  }

  /**
   * Record a successful execution
   */
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  /**
   * Record a failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      this.successes = 0;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Check if circuit is currently allowing requests
   */
  isAllowingRequests(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;
    if (this.state === 'open' && Date.now() >= this.nextAttemptTime) return true;
    return false;
  }
}

// ==================== Health Report Function ====================

/**
 * Generate a comprehensive health report
 */
export function getHealthReport(monitor: HealthMonitor): HealthReport {
  const metrics = monitor.getMetrics();
  const alerts: string[] = [];
  const degradedServices: string[] = [];

  // Calculate averages
  const averages = {
    apiResponseTime: monitor.calculateAverages('apiResponseTime'),
    databaseQueryTime: monitor.calculateAverages('databaseQueryTime'),
    errorRate: monitor.calculateAverages('errorRate'),
  };

  // Check thresholds and generate alerts
  if (metrics.apiResponseTime > DEFAULT_THRESHOLDS.slowApiResponse) {
    alerts.push(`Slow API response time: ${metrics.apiResponseTime}ms (threshold: ${DEFAULT_THRESHOLDS.slowApiResponse}ms)`);
    degradedServices.push('API');
  }

  if (metrics.databaseQueryTime > DEFAULT_THRESHOLDS.slowApiResponse) {
    alerts.push(`Slow database queries: ${metrics.databaseQueryTime}ms (threshold: ${DEFAULT_THRESHOLDS.slowApiResponse}ms)`);
    degradedServices.push('Database');
  }

  const memoryPercent = (metrics.memoryUsage / (process.memoryUsage().heapTotal / 1024 / 1024)) * 100;
  if (memoryPercent > DEFAULT_THRESHOLDS.highMemoryUsage) {
    alerts.push(`High memory usage: ${memoryPercent.toFixed(1)}% (threshold: ${DEFAULT_THRESHOLDS.highMemoryUsage}%)`);
    degradedServices.push('Memory');
  }

  if (metrics.errorRate > DEFAULT_THRESHOLDS.highErrorRate) {
    alerts.push(`High error rate: ${metrics.errorRate} errors/min (threshold: ${DEFAULT_THRESHOLDS.highErrorRate} errors/min)`);
    degradedServices.push('Error Rate');
  }

  if (metrics.queueDepth > DEFAULT_THRESHOLDS.queueBacklog) {
    alerts.push(`Queue backlog: ${metrics.queueDepth} jobs (threshold: ${DEFAULT_THRESHOLDS.queueBacklog} jobs)`);
    degradedServices.push('Background Jobs');
  }

  return {
    timestamp: Date.now(),
    metrics,
    averages,
    alerts,
    status: metrics.status,
    degradedServices,
  };
}

// ==================== Graceful Degradation Helpers ====================

/**
 * Execute with fallback on degraded service
 */
export async function executeWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  circuitBreaker?: CircuitBreaker
): Promise<T> {
  try {
    if (circuitBreaker) {
      return await circuitBreaker.execute(primary);
    }
    return await primary();
  } catch (error) {
    console.warn('Primary operation failed, using fallback:', error);
    return await fallback();
  }
}

/**
 * Execute with degraded functionality
 */
export async function executeWithDegradation<T>(
  operation: () => Promise<T>,
  degradedOperation: () => Promise<T>,
  healthCheck: () => boolean
): Promise<T> {
  if (healthCheck()) {
    return await operation();
  }
  console.warn('Service degraded, using limited functionality');
  return await degradedOperation();
}

/**
 * Rate limit decorator for degraded performance
 */
export class RateLimiter {
  private requests: number[];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    // Remove old requests
    this.requests = this.requests.filter(time => time > cutoff);
    
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }

  /**
   * Execute with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new Error('Rate limit exceeded');
    }
    return await fn();
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilNextRequest(): number {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }
    const oldestRequest = this.requests[0];
    const timeUntilExpiry = (oldestRequest + this.windowMs) - Date.now();
    return Math.max(0, timeUntilExpiry);
  }
}

/**
 * Create a degraded response with limited data
 */
export function createDegradedResponse<T>(
  fullData: T,
  essentialFields: (keyof T)[]
): Partial<T> {
  const degraded: Partial<T> = {};
  essentialFields.forEach(field => {
    degraded[field] = fullData[field];
  });
  return degraded;
}

/**
 * Measure execution time
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

// ==================== Singleton Instance ====================

let globalHealthMonitor: HealthMonitor | null = null;

/**
 * Get or create the global health monitor instance
 */
export function getGlobalHealthMonitor(): HealthMonitor {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new HealthMonitor();
  }
  return globalHealthMonitor;
}

// ==================== Exports ====================

export {
  DEFAULT_THRESHOLDS,
  DEFAULT_CIRCUIT_CONFIG,
};