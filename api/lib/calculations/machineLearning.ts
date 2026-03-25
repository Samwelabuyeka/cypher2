/**
 * Machine Learning utilities for trading predictions
 * Provides data preprocessing, feature engineering, and evaluation metrics
 */

export interface FeatureConfig {
  lagPeriods?: number[];
  rollingWindows?: number[];
  includeTechnicalIndicators?: boolean;
}

export interface NormalizedData {
  data: number[];
  min: number;
  max: number;
}

export interface StandardizedData {
  data: number[];
  mean: number;
  stdDev: number;
}

export interface AnomalyDetectionResult {
  indices: number[];
  scores: number[];
}

export interface DataSplit<T> {
  train: T[];
  validation: T[];
  test: T[];
}

export interface RollingWindow<T> {
  window: T[];
  startIndex: number;
  endIndex: number;
}

export interface ConfusionMatrix {
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
}

export interface PrecisionRecall {
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Min-max normalization to scale data to [0, 1] range
 */
export const normalizeData = (
  data: number[],
  min?: number,
  max?: number
): NormalizedData => {
  const dataMin = min !== undefined ? min : Math.min(...data);
  const dataMax = max !== undefined ? max : Math.max(...data);
  const range = dataMax - dataMin;

  if (range === 0) {
    return {
      data: data.map(() => 0),
      min: dataMin,
      max: dataMax,
    };
  }

  const normalized = data.map((value) => (value - dataMin) / range);

  return {
    data: normalized,
    min: dataMin,
    max: dataMax,
  };
};

/**
 * Z-score standardization: (value - mean) / stdDev
 */
export const standardizeData = (data: number[]): StandardizedData => {
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance =
    data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return {
      data: data.map(() => 0),
      mean,
      stdDev: 1,
    };
  }

  const standardized = data.map((value) => (value - mean) / stdDev);

  return {
    data: standardized,
    mean,
    stdDev,
  };
};

/**
 * Calculate Simple Moving Average
 */
const calculateSMA = (data: number[], period: number): number[] => {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  return sma;
};

/**
 * Calculate Exponential Moving Average
 */
const calculateEMA = (data: number[], period: number): number[] => {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[i]);
    } else if (i < period) {
      const sum = data.slice(0, i + 1).reduce((a, b) => a + b, 0);
      ema.push(sum / (i + 1));
    } else {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
  }
  return ema;
};

/**
 * Calculate RSI (Relative Strength Index)
 */
const calculateRSI = (prices: number[], period = 14): number[] => {
  const rsi: number[] = [];
  const changes: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(NaN);
    } else {
      const recentChanges = changes.slice(i - period, i);
      const gains = recentChanges.filter((c) => c > 0);
      const losses = recentChanges.filter((c) => c < 0).map((c) => Math.abs(c));

      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }
  }
  return rsi;
};

/**
 * Feature engineering for trading data
 */
export const createFeatures = (
  prices: number[],
  volumes: number[],
  config: FeatureConfig = {}
): number[][] => {
  const {
    lagPeriods = [1, 2, 3, 5],
    rollingWindows = [5, 10, 20],
    includeTechnicalIndicators = true,
  } = config;

  const features: number[][] = [];

  for (let i = 0; i < prices.length; i++) {
    const row: number[] = [];

    // Current values
    row.push(prices[i]);
    row.push(volumes[i]);

    // Lagged price values
    for (const lag of lagPeriods) {
      if (i >= lag) {
        row.push(prices[i - lag]);
      } else {
        row.push(NaN);
      }
    }

    // Price changes (returns)
    if (i > 0) {
      row.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    } else {
      row.push(NaN);
    }

    // Rolling statistics
    for (const window of rollingWindows) {
      if (i >= window - 1) {
        const windowPrices = prices.slice(i - window + 1, i + 1);
        const windowVolumes = volumes.slice(i - window + 1, i + 1);

        // Rolling mean
        const priceMean = windowPrices.reduce((a, b) => a + b, 0) / window;
        row.push(priceMean);

        // Rolling std dev
        const priceVariance =
          windowPrices.reduce((sum, val) => sum + Math.pow(val - priceMean, 2), 0) /
          window;
        row.push(Math.sqrt(priceVariance));

        // Rolling volume mean
        const volumeMean = windowVolumes.reduce((a, b) => a + b, 0) / window;
        row.push(volumeMean);
      } else {
        row.push(NaN, NaN, NaN);
      }
    }

    // Technical indicators
    if (includeTechnicalIndicators) {
      const sma20 = calculateSMA(prices, 20);
      const ema12 = calculateEMA(prices, 12);
      const rsi = calculateRSI(prices, 14);

      row.push(sma20[i] || NaN);
      row.push(ema12[i] || NaN);
      row.push(rsi[i] || NaN);
    }

    features.push(row);
  }

  return features;
};

/**
 * Detect anomalies using statistical methods
 */
export const detectAnomalies = (
  data: number[],
  threshold = 3
): AnomalyDetectionResult => {
  const { data: standardized, mean, stdDev } = standardizeData(data);

  const indices: number[] = [];
  const scores: number[] = [];

  standardized.forEach((value, index) => {
    const absZScore = Math.abs(value);
    if (absZScore > threshold) {
      indices.push(index);
      scores.push(absZScore);
    }
  });

  return { indices, scores };
};

/**
 * Calculate Gini impurity for decision trees
 */
export const calculateGiniImpurity = (labels: number[]): number => {
  if (labels.length === 0) return 0;

  const counts = new Map<number, number>();
  labels.forEach((label) => {
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  let gini = 1;
  const total = labels.length;

  counts.forEach((count) => {
    const probability = count / total;
    gini -= probability * probability;
  });

  return gini;
};

/**
 * Calculate entropy for decision trees
 */
export const calculateEntropy = (labels: number[]): number => {
  if (labels.length === 0) return 0;

  const counts = new Map<number, number>();
  labels.forEach((label) => {
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  let entropy = 0;
  const total = labels.length;

  counts.forEach((count) => {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  });

  return entropy;
};

/**
 * Split data into train, validation, and test sets
 */
export const splitData = <T>(
  data: T[],
  trainRatio = 0.8,
  validationRatio = 0.1
): DataSplit<T> => {
  const total = data.length;
  const trainSize = Math.floor(total * trainRatio);
  const validationSize = Math.floor(total * validationRatio);

  const train = data.slice(0, trainSize);
  const validation = data.slice(trainSize, trainSize + validationSize);
  const test = data.slice(trainSize + validationSize);

  return { train, validation, test };
};

/**
 * Create rolling windows for time series cross-validation
 */
export const rollingWindowSplit = <T>(
  data: T[],
  windowSize: number,
  stepSize: number
): RollingWindow<T>[] => {
  const windows: RollingWindow<T>[] = [];

  for (let i = 0; i <= data.length - windowSize; i += stepSize) {
    windows.push({
      window: data.slice(i, i + windowSize),
      startIndex: i,
      endIndex: i + windowSize - 1,
    });
  }

  return windows;
};

/**
 * Calculate classification accuracy
 */
export const calculateAccuracy = (
  predictions: number[],
  actuals: number[]
): number => {
  if (predictions.length !== actuals.length || predictions.length === 0) {
    throw new Error("Predictions and actuals must have the same non-zero length");
  }

  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === actuals[i]) {
      correct++;
    }
  }

  return correct / predictions.length;
};

/**
 * Calculate Mean Absolute Error
 */
export const calculateMAE = (predictions: number[], actuals: number[]): number => {
  if (predictions.length !== actuals.length || predictions.length === 0) {
    throw new Error("Predictions and actuals must have the same non-zero length");
  }

  const sum = predictions.reduce(
    (acc, pred, i) => acc + Math.abs(pred - actuals[i]),
    0
  );

  return sum / predictions.length;
};

/**
 * Calculate Mean Squared Error
 */
export const calculateMSE = (predictions: number[], actuals: number[]): number => {
  if (predictions.length !== actuals.length || predictions.length === 0) {
    throw new Error("Predictions and actuals must have the same non-zero length");
  }

  const sum = predictions.reduce(
    (acc, pred, i) => acc + Math.pow(pred - actuals[i], 2),
    0
  );

  return sum / predictions.length;
};

/**
 * Calculate Root Mean Squared Error
 */
export const calculateRMSE = (
  predictions: number[],
  actuals: number[]
): number => {
  return Math.sqrt(calculateMSE(predictions, actuals));
};

/**
 * Calculate R-squared (coefficient of determination)
 */
export const calculateR2Score = (
  predictions: number[],
  actuals: number[]
): number => {
  if (predictions.length !== actuals.length || predictions.length === 0) {
    throw new Error("Predictions and actuals must have the same non-zero length");
  }

  const mean = actuals.reduce((sum, val) => sum + val, 0) / actuals.length;

  const totalSS = actuals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  const residualSS = predictions.reduce(
    (sum, pred, i) => sum + Math.pow(actuals[i] - pred, 2),
    0
  );

  if (totalSS === 0) return 0;

  return 1 - residualSS / totalSS;
};

/**
 * Calculate confusion matrix for binary classification
 */
export const calculateConfusionMatrix = (
  predictions: number[],
  actuals: number[]
): ConfusionMatrix => {
  if (predictions.length !== actuals.length || predictions.length === 0) {
    throw new Error("Predictions and actuals must have the same non-zero length");
  }

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const actual = actuals[i];

    if (pred === 1 && actual === 1) {
      truePositive++;
    } else if (pred === 0 && actual === 0) {
      trueNegative++;
    } else if (pred === 1 && actual === 0) {
      falsePositive++;
    } else if (pred === 0 && actual === 1) {
      falseNegative++;
    }
  }

  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  };
};

/**
 * Calculate precision, recall, and F1 score
 */
export const calculatePrecisionRecall = (
  predictions: number[],
  actuals: number[]
): PrecisionRecall => {
  const cm = calculateConfusionMatrix(predictions, actuals);

  const precision =
    cm.truePositive + cm.falsePositive > 0
      ? cm.truePositive / (cm.truePositive + cm.falsePositive)
      : 0;

  const recall =
    cm.truePositive + cm.falseNegative > 0
      ? cm.truePositive / (cm.truePositive + cm.falseNegative)
      : 0;

  const f1Score =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1Score,
  };
};

export interface PatternDetectionResult {
  patterns: {
    type: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
  }[];
  trend: "bullish" | "bearish" | "neutral";
  strength: number;
}

export interface TradingSignal {
  action: "buy" | "sell" | "hold";
  confidence: number;
  reason: string;
  indicators?: Record<string, number>;
}

export interface OptimizationResult {
  bestParams: Record<string, number>;
  bestScore: number;
  allScores: { params: Record<string, number>; score: number }[];
}

/**
 * Detect patterns in price data
 */
export const detectPatterns = (
  prices: number[],
  volumes?: number[]
): PatternDetectionResult => {
  const patterns: PatternDetectionResult["patterns"] = [];

  // Detect trend
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  let strength = 0;

  if (prices.length >= 10) {
    const recentPrices = prices.slice(-10);
    const firstHalf = recentPrices.slice(0, 5);
    const secondHalf = recentPrices.slice(5);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const pctChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (pctChange > 2) {
      trend = "bullish";
      strength = Math.min(pctChange / 10, 1);
    } else if (pctChange < -2) {
      trend = "bearish";
      strength = Math.min(Math.abs(pctChange) / 10, 1);
    } else {
      strength = 0.5;
    }
  }

  // Detect support/resistance levels
  if (prices.length >= 20) {
    const windowSize = 5;
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const window = prices.slice(i - windowSize, i + windowSize + 1);
      const centerPrice = prices[i];

      const isLocalMin = window.every((p, idx) => idx === windowSize || p >= centerPrice);
      const isLocalMax = window.every((p, idx) => idx === windowSize || p <= centerPrice);

      if (isLocalMin) {
        patterns.push({
          type: "support",
          confidence: 0.7,
          startIndex: i,
          endIndex: i,
        });
      } else if (isLocalMax) {
        patterns.push({
          type: "resistance",
          confidence: 0.7,
          startIndex: i,
          endIndex: i,
        });
      }
    }
  }

  return { patterns, trend, strength };
};

/**
 * Generate trading signal based on technical analysis
 */
export const generateTradingSignal = (
  prices: number[],
  volumes: number[],
  config?: FeatureConfig
): TradingSignal => {
  if (prices.length < 20) {
    return {
      action: "hold",
      confidence: 0,
      reason: "Insufficient data for analysis",
    };
  }

  const indicators: Record<string, number> = {};

  // Calculate indicators
  const sma20 = calculateSMA(prices, 20);
  const sma50 = prices.length >= 50 ? calculateSMA(prices, 50) : [];
  const rsi = calculateRSI(prices, 14);

  const currentPrice = prices[prices.length - 1];
  const currentSMA20 = sma20[sma20.length - 1];
  const currentRSI = rsi[rsi.length - 1];

  indicators.price = currentPrice;
  indicators.sma20 = currentSMA20;
  indicators.rsi = currentRSI;

  if (sma50.length > 0) {
    indicators.sma50 = sma50[sma50.length - 1];
  }

  // Detect patterns
  const patterns = detectPatterns(prices, volumes);
  indicators.trendStrength = patterns.strength;

  // Generate signal
  let bullishSignals = 0;
  let bearishSignals = 0;
  const reasons: string[] = [];

  // RSI signals
  if (!isNaN(currentRSI)) {
    if (currentRSI < 30) {
      bullishSignals++;
      reasons.push("RSI oversold");
    } else if (currentRSI > 70) {
      bearishSignals++;
      reasons.push("RSI overbought");
    }
  }

  // Price vs SMA signals
  if (!isNaN(currentSMA20)) {
    if (currentPrice > currentSMA20 * 1.02) {
      bullishSignals++;
      reasons.push("Price above SMA20");
    } else if (currentPrice < currentSMA20 * 0.98) {
      bearishSignals++;
      reasons.push("Price below SMA20");
    }
  }

  // Trend signals
  if (patterns.trend === "bullish" && patterns.strength > 0.6) {
    bullishSignals++;
    reasons.push("Strong bullish trend");
  } else if (patterns.trend === "bearish" && patterns.strength > 0.6) {
    bearishSignals++;
    reasons.push("Strong bearish trend");
  }

  const totalSignals = bullishSignals + bearishSignals;
  const confidence = totalSignals > 0 ? Math.min(totalSignals / 5, 1) : 0;

  if (bullishSignals > bearishSignals && bullishSignals >= 2) {
    return {
      action: "buy",
      confidence,
      reason: reasons.join(", "),
      indicators,
    };
  } else if (bearishSignals > bullishSignals && bearishSignals >= 2) {
    return {
      action: "sell",
      confidence,
      reason: reasons.join(", "),
      indicators,
    };
  }

  return {
    action: "hold",
    confidence: 0.5,
    reason: reasons.length > 0 ? reasons.join(", ") : "No clear signal",
    indicators,
  };
};

/**
 * Optimize parameters using grid search
 */
export const optimize = (
  parameterGrid: Record<string, number[]>,
  evaluationFunction: (params: Record<string, number>) => number
): OptimizationResult => {
  const allScores: { params: Record<string, number>; score: number }[] = [];

  // Generate all parameter combinations
  const paramNames = Object.keys(parameterGrid);
  const generateCombinations = (
    index: number,
    currentParams: Record<string, number>
  ): void => {
    if (index === paramNames.length) {
      const score = evaluationFunction(currentParams);
      allScores.push({ params: { ...currentParams }, score });
      return;
    }

    const paramName = paramNames[index];
    const values = parameterGrid[paramName];

    for (const value of values) {
      currentParams[paramName] = value;
      generateCombinations(index + 1, currentParams);
    }
  };

  generateCombinations(0, {});

  // Find best parameters
  let bestScore = -Infinity;
  let bestParams: Record<string, number> = {};

  for (const result of allScores) {
    if (result.score > bestScore) {
      bestScore = result.score;
      bestParams = result.params;
    }
  }

  return {
    bestParams,
    bestScore,
    allScores,
  };
};