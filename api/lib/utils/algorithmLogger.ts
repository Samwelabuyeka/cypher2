import { logger } from "gadget-server";

interface AlgorithmStats {
  name: string;
  library: string;
  callCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  lastCalled: Date | null;
  parameterSamples: any[];
}

interface UsageReport {
  totalAlgorithms: number;
  totalCalls: number;
  byLibrary: {
    [library: string]: {
      algorithms: string[];
      totalCalls: number;
      unusedCount: number;
    };
  };
  unused: Array<{ name: string; library: string }>;
  mostUsed: Array<{ name: string; library: string; callCount: number }>;
  leastUsed: Array<{ name: string; library: string; callCount: number }>;
}

/**
 * AlgorithmTracker - Centralized tracking system for algorithm usage
 * Ensures complete utilization of the math framework
 */
export class AlgorithmTracker {
  private static algorithms: Map<string, AlgorithmStats> = new Map();
  private static readonly MAX_PARAM_SAMPLES = 10;

  /**
   * Register an algorithm call with parameters
   */
  static register(algorithmName: string, library: string, params: any, executionTime?: number): void {
    const key = `${library}::${algorithmName}`;
    const existing = this.algorithms.get(key);

    if (existing) {
      existing.callCount++;
      existing.lastCalled = new Date();
      
      if (executionTime !== undefined) {
        existing.totalExecutionTime += executionTime;
        existing.averageExecutionTime = existing.totalExecutionTime / existing.callCount;
      }

      // Store parameter samples (keep last N)
      if (existing.parameterSamples.length < this.MAX_PARAM_SAMPLES) {
        existing.parameterSamples.push(params);
      } else {
        existing.parameterSamples.shift();
        existing.parameterSamples.push(params);
      }
    } else {
      this.algorithms.set(key, {
        name: algorithmName,
        library,
        callCount: 1,
        totalExecutionTime: executionTime || 0,
        averageExecutionTime: executionTime || 0,
        lastCalled: new Date(),
        parameterSamples: [params],
      });
    }
  }

  /**
   * Get usage statistics for all algorithms
   */
  static getUsageStats(): Map<string, AlgorithmStats> {
    return new Map(this.algorithms);
  }

  /**
   * Get algorithms that have never been called
   */
  static getUnusedAlgorithms(): Array<{ name: string; library: string }> {
    const unused: Array<{ name: string; library: string }> = [];
    
    this.algorithms.forEach((stats) => {
      if (stats.callCount === 0) {
        unused.push({ name: stats.name, library: stats.library });
      }
    });

    return unused;
  }

  /**
   * Pretty print usage statistics to logger
   */
  static logUsage(): void {
    logger.info("=== Algorithm Usage Statistics ===");
    logger.info(`Total algorithms tracked: ${this.algorithms.size}`);
    
    const byLibrary = new Map<string, AlgorithmStats[]>();
    
    this.algorithms.forEach((stats) => {
      const libraryStats = byLibrary.get(stats.library) || [];
      libraryStats.push(stats);
      byLibrary.set(stats.library, libraryStats);
    });

    byLibrary.forEach((stats, library) => {
      logger.info(`\n[${library}]`);
      stats.forEach((algo) => {
        logger.info(`  ${algo.name}:`);
        logger.info(`    Calls: ${algo.callCount}`);
        logger.info(`    Avg Execution: ${algo.averageExecutionTime.toFixed(2)}ms`);
        logger.info(`    Last Called: ${algo.lastCalled ? algo.lastCalled.toISOString() : 'Never'}`);
      });
    });

    const unused = this.getUnusedAlgorithms();
    if (unused.length > 0) {
      logger.warn(`\n⚠️  Unused algorithms: ${unused.length}`);
      unused.forEach((algo) => {
        logger.warn(`  - ${algo.library}::${algo.name}`);
      });
    }
  }

  /**
   * Clear all tracking data
   */
  static reset(): void {
    this.algorithms.clear();
  }

  /**
   * Get algorithm stats by key
   */
  static getStats(algorithmName: string, library: string): AlgorithmStats | undefined {
    const key = `${library}::${algorithmName}`;
    return this.algorithms.get(key);
  }

  /**
   * Register an algorithm without calling it (for discovery)
   */
  static registerAlgorithm(algorithmName: string, library: string): void {
    const key = `${library}::${algorithmName}`;
    if (!this.algorithms.has(key)) {
      this.algorithms.set(key, {
        name: algorithmName,
        library,
        callCount: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        lastCalled: null,
        parameterSamples: [],
      });
    }
  }
}

/**
 * Wrap an algorithm function to automatically track its usage
 * Preserves the original function signature and return type
 */
export function wrapAlgorithm<T extends (...args: any[]) => any>(
  fn: T,
  name: string,
  library: string
): T {
  // Register the algorithm on wrap
  AlgorithmTracker.registerAlgorithm(name, library);

  return ((...args: Parameters<T>): ReturnType<T> => {
    const startTime = performance.now();
    
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.then((value) => {
          const executionTime = performance.now() - startTime;
          AlgorithmTracker.register(name, library, args, executionTime);
          return value;
        }).catch((error) => {
          const executionTime = performance.now() - startTime;
          AlgorithmTracker.register(name, library, { args, error: error.message }, executionTime);
          throw error;
        }) as ReturnType<T>;
      }
      
      // Handle sync functions
      const executionTime = performance.now() - startTime;
      AlgorithmTracker.register(name, library, args, executionTime);
      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AlgorithmTracker.register(name, library, { args, error: (error as Error).message }, executionTime);
      throw error;
    }
  }) as T;
}

/**
 * Generate a comprehensive usage report
 */
export function generateUsageReport(): UsageReport {
  const stats = AlgorithmTracker.getUsageStats();
  const byLibrary: UsageReport['byLibrary'] = {};
  const unused: Array<{ name: string; library: string }> = [];
  const allAlgorithms: Array<{ name: string; library: string; callCount: number }> = [];

  let totalCalls = 0;

  stats.forEach((algo) => {
    if (!byLibrary[algo.library]) {
      byLibrary[algo.library] = {
        algorithms: [],
        totalCalls: 0,
        unusedCount: 0,
      };
    }

    byLibrary[algo.library].algorithms.push(algo.name);
    byLibrary[algo.library].totalCalls += algo.callCount;
    totalCalls += algo.callCount;

    if (algo.callCount === 0) {
      byLibrary[algo.library].unusedCount++;
      unused.push({ name: algo.name, library: algo.library });
    }

    allAlgorithms.push({
      name: algo.name,
      library: algo.library,
      callCount: algo.callCount,
    });
  });

  // Sort by call count
  const sorted = allAlgorithms.sort((a, b) => b.callCount - a.callCount);
  const mostUsed = sorted.filter(a => a.callCount > 0).slice(0, 10);
  const leastUsed = sorted.filter(a => a.callCount > 0).slice(-10).reverse();

  const report: UsageReport = {
    totalAlgorithms: stats.size,
    totalCalls,
    byLibrary,
    unused,
    mostUsed,
    leastUsed,
  };

  // Log the report
  logger.info("=== Algorithm Usage Report ===");
  logger.info(`Total Algorithms: ${report.totalAlgorithms}`);
  logger.info(`Total Calls: ${report.totalCalls}`);
  logger.info(`Unused Algorithms: ${report.unused.length}`);

  logger.info("\n📊 By Library:");
  Object.entries(report.byLibrary).forEach(([library, data]) => {
    logger.info(`\n  ${library}:`);
    logger.info(`    Algorithms: ${data.algorithms.length}`);
    logger.info(`    Total Calls: ${data.totalCalls}`);
    logger.info(`    Unused: ${data.unusedCount}`);
    logger.info(`    Utilization: ${((data.algorithms.length - data.unusedCount) / data.algorithms.length * 100).toFixed(1)}%`);
  });

  if (report.unused.length > 0) {
    logger.warn("\n⚠️  Unused Algorithms:");
    report.unused.forEach((algo) => {
      logger.warn(`    ${algo.library}::${algo.name}`);
    });
    logger.info("\n💡 Suggestions:");
    logger.info("    - Consider removing unused algorithms to reduce code complexity");
    logger.info("    - Verify if these algorithms should be integrated into active strategies");
    logger.info("    - Update documentation to reflect actual algorithm usage");
  }

  if (report.mostUsed.length > 0) {
    logger.info("\n🔥 Most Used Algorithms:");
    report.mostUsed.slice(0, 5).forEach((algo, idx) => {
      logger.info(`    ${idx + 1}. ${algo.library}::${algo.name} (${algo.callCount} calls)`);
    });
  }

  if (report.leastUsed.length > 0 && report.leastUsed[0].callCount > 0) {
    logger.info("\n📉 Least Used Algorithms (but used):");
    report.leastUsed.slice(0, 5).forEach((algo, idx) => {
      logger.info(`    ${idx + 1}. ${algo.library}::${algo.name} (${algo.callCount} calls)`);
    });
    logger.info("\n💡 Optimization Suggestions:");
    logger.info("    - Investigate if least-used algorithms can be optimized or merged");
    logger.info("    - Consider caching results for infrequently called algorithms");
    logger.info("    - Evaluate if these algorithms provide sufficient value for their complexity");
  }

  return report;
}

/**
 * Export wrapped logger for convenience
 */
export const algorithmLogger = {
  track: AlgorithmTracker.register.bind(AlgorithmTracker),
  getStats: AlgorithmTracker.getUsageStats.bind(AlgorithmTracker),
  getUnused: AlgorithmTracker.getUnusedAlgorithms.bind(AlgorithmTracker),
  log: AlgorithmTracker.logUsage.bind(AlgorithmTracker),
  report: generateUsageReport,
  wrap: wrapAlgorithm,
  reset: AlgorithmTracker.reset.bind(AlgorithmTracker),
};