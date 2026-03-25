import { logger } from "gadget-server";

/**
 * Error context interface for tracking error metadata
 */
export interface ErrorContext {
  userId?: string;
  actionName?: string;
  timestamp: Date;
  requestId?: string;
  additionalData?: Record<string, any>;
}

/**
 * Base class for all application errors
 */
export class BaseError extends Error {
  statusCode: number;
  context?: ErrorContext;
  isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (4xx range)
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400);
    this.name = "ValidationError";
    this.context = context;
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = "Authentication required", context?: ErrorContext) {
    super(message, 401);
    this.name = "AuthenticationError";
    this.context = context;
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = "Permission denied", context?: ErrorContext) {
    super(message, 403);
    this.name = "AuthorizationError";
    this.context = context;
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends BaseError {
  constructor(message: string = "Resource not found", context?: ErrorContext) {
    super(message, 404);
    this.name = "NotFoundError";
    this.context = context;
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends BaseError {
  constructor(message: string = "Resource conflict", context?: ErrorContext) {
    super(message, 409);
    this.name = "ConflictError";
    this.context = context;
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends BaseError {
  retryAfter?: number;

  constructor(message: string = "Rate limit exceeded", retryAfter?: number, context?: ErrorContext) {
    super(message, 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    this.context = context;
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends BaseError {
  constructor(message: string = "Internal server error", context?: ErrorContext) {
    super(message, 500, false);
    this.name = "InternalError";
    this.context = context;
  }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends BaseError {
  service?: string;

  constructor(message: string, service?: string, context?: ErrorContext) {
    super(message, 502);
    this.name = "ExternalServiceError";
    this.service = service;
    this.context = context;
  }
}

/**
 * Database error
 */
export class DatabaseError extends BaseError {
  query?: string;

  constructor(message: string, query?: string, context?: ErrorContext) {
    super(message, 500, false);
    this.name = "DatabaseError";
    this.query = query;
    this.context = context;
  }
}

/**
 * Network error
 */
export class NetworkError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 503);
    this.name = "NetworkError";
    this.context = context;
  }
}

/**
 * Wraps an error with additional context
 */
export function wrapError(error: Error | unknown, context: Partial<ErrorContext>): BaseError {
  const fullContext: ErrorContext = {
    timestamp: new Date(),
    ...context,
  };

  if (error instanceof BaseError) {
    error.context = { ...error.context, ...fullContext };
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const wrappedError = new InternalError(message, fullContext);
  
  if (error instanceof Error && error.stack) {
    wrappedError.stack = error.stack;
  }

  return wrappedError;
}

/**
 * Sanitizes error for client response by removing sensitive data
 */
export function sanitizeError(error: Error | BaseError): {
  message: string;
  statusCode: number;
  name: string;
} {
  const statusCode = error instanceof BaseError ? error.statusCode : 500;
  
  // Don't expose internal error details to client
  const message = error instanceof BaseError && error.isOperational 
    ? error.message 
    : "An unexpected error occurred";

  return {
    message,
    statusCode,
    name: error.name,
  };
}

/**
 * Logs error with proper formatting and context
 */
export function logError(error: Error | BaseError, additionalContext?: Partial<ErrorContext>): void {
  const context = error instanceof BaseError ? error.context : undefined;
  const mergedContext = { ...context, ...additionalContext };

  const logData = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    statusCode: error instanceof BaseError ? error.statusCode : undefined,
    isOperational: error instanceof BaseError ? error.isOperational : undefined,
    context: mergedContext,
  };

  if (error instanceof BaseError && error.isOperational) {
    logger.warn(logData, "Operational error occurred");
  } else {
    logger.error(logData, "Unexpected error occurred");
  }
}

/**
 * Retry options configuration
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;
  onRetry?: (error: Error, attemptNumber: number) => void;
}

/**
 * Calculates exponential backoff delay
 */
export function exponentialBackoff(
  attemptNumber: number,
  initialDelay: number = 1000,
  maxDelay: number = 30000,
  multiplier: number = 2
): number {
  const delay = Math.min(initialDelay * Math.pow(multiplier, attemptNumber - 1), maxDelay);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * delay * 0.1;
}

/**
 * Default retry predicate
 */
function defaultShouldRetry(error: Error, attemptNumber: number): boolean {
  // Retry on network errors, rate limits, and 5xx errors
  if (error instanceof NetworkError) return true;
  if (error instanceof RateLimitError) return true;
  if (error instanceof ExternalServiceError) return true;
  if (error instanceof BaseError && error.statusCode >= 500) return true;
  return false;
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const delay = exponentialBackoff(attempt, initialDelay, maxDelay, backoffMultiplier);
      
      if (onRetry) {
        onRetry(lastError, attempt);
      }

      logger.warn(
        { error: lastError.message, attempt, delay, maxRetries },
        "Retrying failed operation"
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Executes function with fallback value on error
 */
export async function fallbackValue<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.warn({ error }, "Using fallback value due to error");
    return fallback;
  }
}

/**
 * Executes function with graceful degradation
 */
export async function gracefulDegradation<T, D>(
  fn: () => Promise<T>,
  degraded: () => Promise<D>
): Promise<T | D> {
  try {
    return await fn();
  } catch (error) {
    logger.warn({ error }, "Gracefully degrading to backup function");
    return await degraded();
  }
}

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

/**
 * Simple circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private failureThreshold: number;
  private successThreshold: number;
  private timeout: number;
  private resetTimeout: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 60000;
    this.resetTimeout = options.resetTimeout ?? 30000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error("Circuit breaker is OPEN");
      }
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Error statistics for aggregation
 */
export interface ErrorStats {
  errorType: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  samples: Error[];
}

/**
 * Groups similar errors together
 */
export function groupSimilarErrors(errors: Error[]): Map<string, ErrorStats> {
  const grouped = new Map<string, ErrorStats>();

  for (const error of errors) {
    const key = `${error.name}:${error.message}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.count++;
      existing.lastOccurrence = new Date();
      if (existing.samples.length < 5) {
        existing.samples.push(error);
      }
    } else {
      grouped.set(key, {
        errorType: error.name,
        count: 1,
        firstOccurrence: new Date(),
        lastOccurrence: new Date(),
        samples: [error],
      });
    }
  }

  return grouped;
}

/**
 * Calculates error rate over a time window
 */
export function calculateErrorRate(
  errors: Array<{ timestamp: Date }>,
  windowMs: number = 60000
): number {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const recentErrors = errors.filter(
    error => error.timestamp.getTime() >= windowStart
  );

  return (recentErrors.length / windowMs) * 1000; // errors per second
}

/**
 * Detects error spikes based on historical data
 */
export function detectErrorSpikes(
  recentRate: number,
  historicalAverage: number,
  threshold: number = 3
): boolean {
  return recentRate > historicalAverage * threshold;
}

/**
 * Determines if error should trigger a notification
 */
export function shouldNotify(error: Error | BaseError): boolean {
  // Always notify for non-operational errors
  if (error instanceof BaseError && !error.isOperational) {
    return true;
  }

  // Notify for critical errors
  if (error instanceof InternalError) return true;
  if (error instanceof DatabaseError) return true;
  if (error instanceof ExternalServiceError) return true;

  // Don't notify for expected operational errors
  if (error instanceof ValidationError) return false;
  if (error instanceof AuthenticationError) return false;
  if (error instanceof AuthorizationError) return false;
  if (error instanceof NotFoundError) return false;

  return false;
}

/**
 * Formats error for Slack notification
 */
export function formatErrorForSlack(error: Error | BaseError, context?: ErrorContext): string {
  const emoji = error instanceof BaseError && error.isOperational ? "⚠️" : "🚨";
  const severity = error instanceof BaseError && error.isOperational ? "Warning" : "Critical";
  
  let message = `${emoji} *${severity} Error: ${error.name}*\n`;
  message += `\`\`\`${error.message}\`\`\`\n`;

  if (context) {
    message += `*Context:*\n`;
    if (context.userId) message += `• User: ${context.userId}\n`;
    if (context.actionName) message += `• Action: ${context.actionName}\n`;
    if (context.requestId) message += `• Request: ${context.requestId}\n`;
  }

  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(0, 5);
    message += `\n*Stack Trace (truncated):*\n\`\`\`${stackLines.join('\n')}\`\`\``;
  }

  return message;
}

/**
 * Formats error for email notification
 */
export function formatErrorForEmail(error: Error | BaseError, context?: ErrorContext): {
  subject: string;
  body: string;
} {
  const severity = error instanceof BaseError && error.isOperational ? "Warning" : "Critical";
  const subject = `${severity} Error: ${error.name} - ${error.message.substring(0, 50)}`;

  let body = `<h2>${severity} Error Report</h2>`;
  body += `<p><strong>Error Type:</strong> ${error.name}</p>`;
  body += `<p><strong>Message:</strong> ${error.message}</p>`;

  if (context) {
    body += `<h3>Context</h3><ul>`;
    if (context.userId) body += `<li><strong>User ID:</strong> ${context.userId}</li>`;
    if (context.actionName) body += `<li><strong>Action:</strong> ${context.actionName}</li>`;
    if (context.requestId) body += `<li><strong>Request ID:</strong> ${context.requestId}</li>`;
    if (context.timestamp) body += `<li><strong>Timestamp:</strong> ${context.timestamp.toISOString()}</li>`;
    body += `</ul>`;
  }

  if (error.stack) {
    body += `<h3>Stack Trace</h3><pre>${error.stack}</pre>`;
  }

  if (context?.additionalData) {
    body += `<h3>Additional Data</h3><pre>${JSON.stringify(context.additionalData, null, 2)}</pre>`;
  }

  return { subject, body };
}

/**
 * Captures and returns stack trace
 */
export function captureStackTrace(): string {
  const stack = new Error().stack;
  if (!stack) return "";
  
  // Remove the first line (Error message) and this function's line
  return stack.split('\n').slice(2).join('\n');
}

/**
 * Extracts the root cause from an error chain
 */
export function extractErrorCause(error: Error): Error {
  let current: any = error;
  
  while (current.cause && current.cause instanceof Error) {
    current = current.cause;
  }
  
  return current;
}

/**
 * Formats error for structured logging
 */
export function formatErrorForLogging(error: Error | BaseError, context?: ErrorContext): Record<string, any> {
  const logObject: Record<string, any> = {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  };

  if (error instanceof BaseError) {
    logObject.statusCode = error.statusCode;
    logObject.isOperational = error.isOperational;
    
    if (error.context) {
      logObject.errorContext = error.context;
    }

    if (error instanceof RateLimitError && error.retryAfter) {
      logObject.retryAfter = error.retryAfter;
    }

    if (error instanceof ExternalServiceError && error.service) {
      logObject.service = error.service;
    }

    if (error instanceof DatabaseError && error.query) {
      logObject.query = error.query;
    }
  }

  if (context) {
    logObject.context = context;
  }

  return logObject;
}

/**
 * Error handler middleware helper
 */
export function createErrorHandler() {
  return (error: Error | BaseError, context?: Partial<ErrorContext>) => {
    const wrappedError = wrapError(error, context || {});
    logError(wrappedError);

    if (shouldNotify(wrappedError)) {
      const slackMessage = formatErrorForSlack(wrappedError, wrappedError.context);
      logger.info({ slackMessage }, "Error notification prepared");
    }

    return sanitizeError(wrappedError);
  };
}