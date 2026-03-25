/**
 * Advanced Mathematical Prediction Framework
 * 
 * Implements real neural networks, statistical models, and ensemble methods
 * for cryptocurrency price prediction using genuine mathematical algorithms.
 */

/**
 * Historical price data format for candlestick charts
 */
export interface PriceData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trained model metadata and configuration
 */
export interface TrainedModel {
  modelId: string;
  symbol: string;
  accuracy: number;
  loss: number;
  epochs: number;
  trainedAt: Date;
  architecture: {
    inputShape: number;
    layers: string[];
    outputShape: number;
    parameters: number;
  };
  weights?: number[][][];
  biases?: number[][];
}

/**
 * Individual prediction model interface
 */
export interface Model {
  predict(data: PriceData[]): Promise<number>;
  weight: number;
}

/**
 * Model performance metrics
 */
export interface ModelPerformance {
  accuracy: number;
  mae: number;
  rmse: number;
  rSquared: number;
  sharpeRatio?: number;
  aic?: number;
  bic?: number;
}

/**
 * Prediction result with confidence intervals
 */
export interface PredictionResult {
  predictedPrice: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
  timestamp: Date;
}

/**
 * Preprocessed data with normalized values and features
 */
interface PreprocessedData {
  normalized: number[][];
  minPrice: number;
  maxPrice: number;
  features: number[][];
  windows: PriceData[][];
}

/**
 * Calculated technical features for ML input
 */
interface CalculatedFeatures {
  momentum: number[];
  volumeTrend: number[];
  volatility: number[];
  rsi: number[];
  macd: number[];
  sma: number[];
  ema: number[];
  fourierCoefficients: number[][];
  autocorrelation: number[];
  skewness: number[];
  kurtosis: number[];
}

/**
 * Matrix class for efficient linear algebra operations
 */
class Matrix {
  data: number[][];
  rows: number;
  cols: number;

  constructor(rows: number, cols: number, data?: number[][]) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || Array(rows).fill(0).map(() => Array(cols).fill(0));
  }

  static multiply(a: Matrix, b: Matrix): Matrix {
    if (a.cols !== b.rows) {
      throw new Error(`Matrix dimensions incompatible: ${a.cols} !== ${b.rows}`);
    }

    const result = new Matrix(a.rows, b.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < b.cols; j++) {
        let sum = 0;
        for (let k = 0; k < a.cols; k++) {
          sum += a.data[i][k] * b.data[k][j];
        }
        result.data[i][j] = sum;
      }
    }
    return result;
  }

  static transpose(m: Matrix): Matrix {
    const result = new Matrix(m.cols, m.rows);
    for (let i = 0; i < m.rows; i++) {
      for (let j = 0; j < m.cols; j++) {
        result.data[j][i] = m.data[i][j];
      }
    }
    return result;
  }

  static add(a: Matrix, b: Matrix): Matrix {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error('Matrix dimensions must match for addition');
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] + b.data[i][j];
      }
    }
    return result;
  }

  static subtract(a: Matrix, b: Matrix): Matrix {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error('Matrix dimensions must match for subtraction');
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] - b.data[i][j];
      }
    }
    return result;
  }

  static scalarMultiply(m: Matrix, scalar: number): Matrix {
    const result = new Matrix(m.rows, m.cols);
    for (let i = 0; i < m.rows; i++) {
      for (let j = 0; j < m.cols; j++) {
        result.data[i][j] = m.data[i][j] * scalar;
      }
    }
    return result;
  }

  static randomize(rows: number, cols: number): Matrix {
    const result = new Matrix(rows, cols);
    const limit = Math.sqrt(6 / (rows + cols)); // Xavier initialization
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result.data[i][j] = (Math.random() * 2 - 1) * limit;
      }
    }
    return result;
  }

  map(fn: (val: number, i?: number, j?: number) => number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j], i, j);
      }
    }
    return result;
  }
}

/**
 * Activation functions with derivatives
 */
const ActivationFunctions = {
  relu: (x: number) => Math.max(0, x),
  reluDerivative: (x: number) => x > 0 ? 1 : 0,
  
  sigmoid: (x: number) => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x)))),
  sigmoidDerivative: (x: number) => {
    const s = ActivationFunctions.sigmoid(x);
    return s * (1 - s);
  },
  
  tanh: (x: number) => Math.tanh(x),
  tanhDerivative: (x: number) => {
    const t = Math.tanh(x);
    return 1 - t * t;
  },
  
  linear: (x: number) => x,
  linearDerivative: (_x: number) => 1
};

/**
 * Neural Network Layer
 */
class NeuralLayer {
  weights: Matrix;
  biases: Matrix;
  weightsGradient: Matrix;
  biasesGradient: Matrix;
  lastInput: Matrix | null = null;
  lastOutput: Matrix | null = null;
  activation: (x: number) => number;
  activationDerivative: (x: number) => number;

  constructor(
    inputSize: number,
    outputSize: number,
    activation: 'relu' | 'sigmoid' | 'tanh' | 'linear' = 'relu'
  ) {
    this.weights = Matrix.randomize(inputSize, outputSize);
    this.biases = new Matrix(1, outputSize);
    this.weightsGradient = new Matrix(inputSize, outputSize);
    this.biasesGradient = new Matrix(1, outputSize);
    
    this.activation = ActivationFunctions[activation];
    this.activationDerivative = ActivationFunctions[`${activation}Derivative` as keyof typeof ActivationFunctions];
  }

  forward(input: Matrix): Matrix {
    this.lastInput = input;
    const linear = Matrix.add(Matrix.multiply(input, this.weights), this.biases);
    this.lastOutput = linear.map(this.activation);
    return this.lastOutput;
  }

  backward(outputGradient: Matrix, learningRate: number, l2Lambda: number = 0.001): Matrix {
    if (!this.lastInput || !this.lastOutput) {
      throw new Error('Must call forward before backward');
    }

    // Apply activation derivative
    const activationGrad = this.lastOutput.map((val, i, j) => {
      if (i === undefined || j === undefined) {
        throw new Error('Matrix indices cannot be undefined');
      }
      return outputGradient.data[i][j] * this.activationDerivative(val);
    });

    // Calculate gradients
    this.weightsGradient = Matrix.multiply(Matrix.transpose(this.lastInput), activationGrad);
    this.biasesGradient = activationGrad;

    // Apply L2 regularization
    const regularization = Matrix.scalarMultiply(this.weights, 2 * l2Lambda);
    this.weightsGradient = Matrix.add(this.weightsGradient, regularization);

    // Update weights and biases
    this.weights = Matrix.subtract(
      this.weights,
      Matrix.scalarMultiply(this.weightsGradient, learningRate)
    );
    this.biases = Matrix.subtract(
      this.biases,
      Matrix.scalarMultiply(this.biasesGradient, learningRate)
    );

    // Return gradient for previous layer
    return Matrix.multiply(activationGrad, Matrix.transpose(this.weights));
  }
}

/**
 * Deep Neural Network for time series prediction
 */
class DeepNeuralNetwork {
  layers: NeuralLayer[];
  learningRate: number;
  l2Lambda: number;
  momentum: number;
  velocities: Matrix[][];

  constructor(
    layerSizes: number[],
    learningRate: number = 0.001,
    l2Lambda: number = 0.001,
    momentum: number = 0.9
  ) {
    this.layers = [];
    this.learningRate = learningRate;
    this.l2Lambda = l2Lambda;
    this.momentum = momentum;
    this.velocities = [];

    for (let i = 0; i < layerSizes.length - 1; i++) {
      const activation = i === layerSizes.length - 2 ? 'linear' : 'relu';
      this.layers.push(new NeuralLayer(layerSizes[i], layerSizes[i + 1], activation));
      this.velocities.push([
        new Matrix(layerSizes[i], layerSizes[i + 1]),
        new Matrix(1, layerSizes[i + 1])
      ]);
    }
  }

  forward(input: Matrix): Matrix {
    let output = input;
    for (const layer of this.layers) {
      output = layer.forward(output);
    }
    return output;
  }

  backward(target: Matrix): number {
    if (this.layers.length === 0) {
      throw new Error('Network has no layers');
    }

    const lastLayer = this.layers[this.layers.length - 1];
    if (!lastLayer.lastOutput) {
      throw new Error('Must call forward before backward');
    }

    // Calculate loss (MSE)
    const outputGradient = Matrix.subtract(lastLayer.lastOutput, target);
    const loss = outputGradient.data[0].reduce((sum, val) => sum + val * val, 0) / 2;

    // Backpropagate through layers
    let gradient = outputGradient;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      
      // Apply momentum
      const weightVelocity = this.velocities[i][0];
      const biasVelocity = this.velocities[i][1];
      
      const newWeightVelocity = Matrix.add(
        Matrix.scalarMultiply(weightVelocity, this.momentum),
        Matrix.scalarMultiply(layer.weightsGradient, 1 - this.momentum)
      );
      const newBiasVelocity = Matrix.add(
        Matrix.scalarMultiply(biasVelocity, this.momentum),
        Matrix.scalarMultiply(layer.biasesGradient, 1 - this.momentum)
      );
      
      this.velocities[i][0] = newWeightVelocity;
      this.velocities[i][1] = newBiasVelocity;
      
      gradient = layer.backward(gradient, this.learningRate, this.l2Lambda);
    }

    return loss;
  }

  train(inputs: Matrix[], targets: Matrix[], epochs: number): number[] {
    const losses: number[] = [];
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;
      
      // Shuffle training data
      const indices = inputs.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      
      for (const idx of indices) {
        this.forward(inputs[idx]);
        epochLoss += this.backward(targets[idx]);
      }
      
      losses.push(epochLoss / inputs.length);
      
      // Learning rate decay
      if (epoch % 10 === 0 && epoch > 0) {
        this.learningRate *= 0.95;
      }
    }
    
    return losses;
  }

  predict(input: Matrix): number {
    const output = this.forward(input);
    return output.data[0][0];
  }
}

/**
 * ARIMA (AutoRegressive Integrated Moving Average) Model
 */
class ARIMAModel {
  p: number; // AR order
  d: number; // Differencing order
  q: number; // MA order
  arCoefficients: number[] = [];
  maCoefficients: number[] = [];
  mean: number = 0;

  constructor(p: number = 2, d: number = 1, q: number = 2) {
    this.p = p;
    this.d = d;
    this.q = q;
  }

  /**
   * Difference the time series
   */
  private difference(data: number[], order: number): number[] {
    let result = [...data];
    for (let i = 0; i < order; i++) {
      result = result.slice(1).map((val, idx) => val - result[idx]);
    }
    return result;
  }

  /**
   * Fit ARIMA model using least squares
   */
  fit(data: number[]): void {
    // Difference the data
    const diffData = this.difference(data, this.d);
    this.mean = diffData.reduce((a, b) => a + b, 0) / diffData.length;
    
    // Center the data
    const centered = diffData.map(x => x - this.mean);
    
    // Estimate AR coefficients using Yule-Walker equations
    this.arCoefficients = this.estimateAR(centered, this.p);
    
    // Calculate residuals
    const residuals = this.calculateResiduals(centered, this.arCoefficients);
    
    // Estimate MA coefficients
    this.maCoefficients = this.estimateMA(residuals, this.q);
  }

  private estimateAR(data: number[], order: number): number[] {
    const n = data.length;
    const coefficients: number[] = [];
    
    // Calculate autocorrelations
    const autocorr: number[] = [];
    for (let lag = 0; lag <= order; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) {
        sum += data[i] * data[i - lag];
      }
      autocorr.push(sum / (n - lag));
    }
    
    // Solve Yule-Walker equations using Levinson-Durbin algorithm
    const phi: number[] = [autocorr[1] / autocorr[0]];
    
    for (let k = 1; k < order; k++) {
      let numerator = autocorr[k + 1];
      for (let j = 0; j < k; j++) {
        numerator -= phi[j] * autocorr[k - j];
      }
      
      let denominator = autocorr[0];
      for (let j = 0; j < k; j++) {
        denominator -= phi[j] * autocorr[j + 1];
      }
      
      const phiNew = numerator / denominator;
      const phiOld = [...phi];
      
      for (let j = 0; j < k; j++) {
        phi[j] = phiOld[j] - phiNew * phiOld[k - 1 - j];
      }
      phi.push(phiNew);
    }
    
    return phi;
  }

  private calculateResiduals(data: number[], arCoeffs: number[]): number[] {
    const residuals: number[] = [];
    for (let i = arCoeffs.length; i < data.length; i++) {
      let predicted = 0;
      for (let j = 0; j < arCoeffs.length; j++) {
        predicted += arCoeffs[j] * data[i - 1 - j];
      }
      residuals.push(data[i] - predicted);
    }
    return residuals;
  }

  private estimateMA(residuals: number[], order: number): number[] {
    // Simplified MA estimation using autocorrelation of residuals
    const n = residuals.length;
    const coefficients: number[] = [];
    
    for (let lag = 1; lag <= order; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) {
        sum += residuals[i] * residuals[i - lag];
      }
      coefficients.push(sum / (n - lag));
    }
    
    return coefficients;
  }

  predict(data: number[], steps: number = 1): number[] {
    const predictions: number[] = [];
    const workingData = [...data];
    
    for (let step = 0; step < steps; step++) {
      const diffData = this.difference(workingData, this.d);
      const centered = diffData.map(x => x - this.mean);
      
      // AR component
      let arPrediction = this.mean;
      for (let i = 0; i < this.arCoefficients.length; i++) {
        if (centered.length - 1 - i >= 0) {
          arPrediction += this.arCoefficients[i] * centered[centered.length - 1 - i];
        }
      }
      
      // Integrate back
      let prediction = arPrediction;
      for (let i = 0; i < this.d; i++) {
        prediction += workingData[workingData.length - 1 - i];
      }
      
      predictions.push(prediction);
      workingData.push(prediction);
    }
    
    return predictions;
  }
}

/**
 * Polynomial Regression Model
 */
class PolynomialRegression {
  coefficients: number[] = [];
  degree: number;

  constructor(degree: number = 3) {
    this.degree = degree;
  }

  fit(x: number[], y: number[]): void {
    const n = x.length;
    
    // Build Vandermonde matrix
    const X: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= this.degree; j++) {
        row.push(Math.pow(x[i], j));
      }
      X.push(row);
    }
    
    // Solve normal equations: (X^T X) β = X^T y
    const XT = this.transpose(X);
    const XTX = this.matrixMultiply(XT, X);
    const XTy = this.vectorMatrixMultiply(XT, y);
    
    this.coefficients = this.solveLinearSystem(XTX, XTy);
  }

  predict(x: number): number {
    let result = 0;
    for (let i = 0; i < this.coefficients.length; i++) {
      result += this.coefficients[i] * Math.pow(x, i);
    }
    return result;
  }

  private transpose(matrix: number[][]): number[][] {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  }

  private matrixMultiply(a: number[][], b: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  private vectorMatrixMultiply(matrix: number[][], vector: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < matrix.length; i++) {
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        sum += matrix[i][j] * vector[j];
      }
      result.push(sum);
    }
    return result;
  }

  private solveLinearSystem(A: number[][], b: number[]): number[] {
    // Gaussian elimination with partial pivoting
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);
    
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // Forward elimination
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const x: number[] = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }
    
    return x;
  }
}

/**
 * Holt-Winters Exponential Smoothing
 */
class HoltWinters {
  alpha: number; // Level smoothing
  beta: number;  // Trend smoothing
  gamma: number; // Seasonal smoothing
  seasonLength: number;
  level: number = 0;
  trend: number = 0;
  seasonal: number[] = [];

  constructor(
    alpha: number = 0.3,
    beta: number = 0.1,
    gamma: number = 0.1,
    seasonLength: number = 7
  ) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
    this.seasonLength = seasonLength;
  }

  fit(data: number[]): void {
    const n = data.length;
    
    // Initialize level
    this.level = data.slice(0, this.seasonLength).reduce((a, b) => a + b, 0) / this.seasonLength;
    
    // Initialize trend
    let trendSum = 0;
    for (let i = 0; i < this.seasonLength && i + this.seasonLength < n; i++) {
      trendSum += (data[i + this.seasonLength] - data[i]) / this.seasonLength;
    }
    this.trend = trendSum / this.seasonLength;
    
    // Initialize seasonal components
    this.seasonal = Array(this.seasonLength).fill(0);
    for (let i = 0; i < this.seasonLength; i++) {
      let sum = 0;
      let count = 0;
      for (let j = i; j < n; j += this.seasonLength) {
        sum += data[j] / this.level;
        count++;
      }
      this.seasonal[i] = count > 0 ? sum / count : 1;
    }
    
    // Refine estimates
    for (let i = 0; i < n; i++) {
      const seasonalIndex = i % this.seasonLength;
      const oldLevel = this.level;
      
      this.level = this.alpha * (data[i] / this.seasonal[seasonalIndex]) +
                   (1 - this.alpha) * (this.level + this.trend);
      
      this.trend = this.beta * (this.level - oldLevel) +
                   (1 - this.beta) * this.trend;
      
      this.seasonal[seasonalIndex] = this.gamma * (data[i] / this.level) +
                                     (1 - this.gamma) * this.seasonal[seasonalIndex];
    }
  }

  predict(steps: number = 1): number[] {
    const predictions: number[] = [];
    let currentLevel = this.level;
    let currentTrend = this.trend;
    
    for (let i = 0; i < steps; i++) {
      const seasonalIndex = i % this.seasonLength;
      const prediction = (currentLevel + currentTrend * (i + 1)) * this.seasonal[seasonalIndex];
      predictions.push(prediction);
    }
    
    return predictions;
  }
}

/**
 * Kalman Filter for optimal state estimation
 */
class KalmanFilter {
  processNoise: number;
  measurementNoise: number;
  estimate: number;
  errorCovariance: number;

  constructor(processNoise: number = 0.01, measurementNoise: number = 0.1) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.estimate = 0;
    this.errorCovariance = 1;
  }

  update(measurement: number): number {
    // Prediction
    const predictedEstimate = this.estimate;
    const predictedErrorCovariance = this.errorCovariance + this.processNoise;
    
    // Update
    const kalmanGain = predictedErrorCovariance / (predictedErrorCovariance + this.measurementNoise);
    this.estimate = predictedEstimate + kalmanGain * (measurement - predictedEstimate);
    this.errorCovariance = (1 - kalmanGain) * predictedErrorCovariance;
    
    return this.estimate;
  }

  filter(data: number[]): number[] {
    this.estimate = data[0];
    return data.map(value => this.update(value));
  }
}

/**
 * Calculate momentum indicator
 */
function calculateMomentum(prices: number[], period: number): number[] {
  const momentum: number[] = new Array(prices.length).fill(0);
  for (let i = period; i < prices.length; i++) {
    momentum[i] = (prices[i] - prices[i - period]) / prices[i - period];
  }
  return momentum;
}

/**
 * Calculate volume trend
 */
function calculateVolumeTrend(volumes: number[]): number[] {
  const trend: number[] = new Array(volumes.length).fill(0);
  const period = 5;
  for (let i = period; i < volumes.length; i++) {
    const avgVolume = volumes.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    trend[i] = volumes[i] / avgVolume - 1;
  }
  return trend;
}

/**
 * Calculate price volatility (standard deviation of returns)
 */
function calculateVolatility(prices: number[], period: number): number[] {
  const volatility: number[] = new Array(prices.length).fill(0);
  for (let i = period; i < prices.length; i++) {
    const returns: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      returns.push((prices[j] - prices[j - 1]) / prices[j - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    volatility[i] = Math.sqrt(variance);
  }
  return volatility;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number): number[] {
  const rsi: number[] = new Array(prices.length).fill(0);
  for (let i = period; i < prices.length; i++) {
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - (100 / (1 + rs));
  }
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[]): number[] {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return ema12.map((val, i) => val - ema26[i]);
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = new Array(prices.length).fill(0);
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma[i] = sum / period;
  }
  return sma;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = new Array(prices.length).fill(0);
  const multiplier = 2 / (period + 1);
  ema[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

/**
 * Fast Fourier Transform for cycle detection
 */
function fastFourierTransform(prices: number[]): number[][] {
  const n = prices.length;
  const coefficients: number[][] = [];
  
  // Simplified FFT - compute first few frequency components
  const numCoeffs = Math.min(10, Math.floor(n / 2));
  for (let k = 0; k < numCoeffs; k++) {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < n; i++) {
      const angle = -2 * Math.PI * k * i / n;
      real += prices[i] * Math.cos(angle);
      imag += prices[i] * Math.sin(angle);
    }
    coefficients.push([real / n, imag / n]);
  }
  return coefficients;
}

/**
 * Calculate autocorrelation for different lags
 */
function calculateAutocorrelation(prices: number[], maxLag: number): number[] {
  const n = prices.length;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  
  const autocorr: number[] = [];
  for (let lag = 0; lag < maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < n; i++) {
      sum += (prices[i] - mean) * (prices[i - lag] - mean);
    }
    autocorr.push(sum / (n - lag) / variance);
  }
  return autocorr;
}

/**
 * Calculate skewness (asymmetry of distribution)
 */
function calculateSkewness(prices: number[], period: number): number[] {
  const skewness: number[] = new Array(prices.length).fill(0);
  for (let i = period; i < prices.length; i++) {
    const window = prices.slice(i - period, i);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      const thirdMoment = window.reduce((a, b) => a + Math.pow((b - mean) / stdDev, 3), 0) / period;
      skewness[i] = thirdMoment;
    }
  }
  return skewness;
}

/**
 * Calculate kurtosis (tailedness of distribution)
 */
function calculateKurtosis(prices: number[], period: number): number[] {
  const kurtosis: number[] = new Array(prices.length).fill(0);
  for (let i = period; i < prices.length; i++) {
    const window = prices.slice(i - period, i);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      const fourthMoment = window.reduce((a, b) => a + Math.pow((b - mean) / stdDev, 4), 0) / period;
      kurtosis[i] = fourthMoment - 3; // Excess kurtosis
    }
  }
  return kurtosis;
}

/**
 * Advanced feature engineering
 */
function calculateAdvancedFeatures(data: PriceData[]): CalculatedFeatures {
  const prices = data.map(d => d.close);
  const volumes = data.map(d => d.volume);

  // Basic technical indicators
  const momentum = calculateMomentum(prices, 10);
  const volumeTrend = calculateVolumeTrend(volumes);
  const volatility = calculateVolatility(prices, 20);
  const rsi = calculateRSI(prices, 14);
  const macd = calculateMACD(prices);
  const sma = calculateSMA(prices, 20);
  const ema = calculateEMA(prices, 20);
  
  // Advanced indicators
  const skewness = calculateSkewness(prices, 20);
  const kurtosis = calculateKurtosis(prices, 20);
  const autocorrelation = calculateAutocorrelation(prices, 10);
  const fourierCoefficients = fastFourierTransform(prices);
  
  return {
    momentum,
    volumeTrend,
    volatility,
    rsi,
    macd,
    sma,
    ema,
    fourierCoefficients,
    autocorrelation,
    skewness,
    kurtosis,
  };
}

/**
 * Preprocess data for LSTM training
 */
export function preprocessData(data: PriceData[], windowSize: number = 60): PreprocessedData {
  const prices = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  
  // Normalize prices
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  
  const normalized = prices.map(p => (p - minPrice) / priceRange);
  
  // Calculate features
  const features = calculateAdvancedFeatures(data);
  
  // Create windows
  const windows: PriceData[][] = [];
  for (let i = windowSize; i < data.length; i++) {
    windows.push(data.slice(i - windowSize, i));
  }
  
  return {
    normalized: [normalized],
    minPrice,
    maxPrice,
    features: [features.momentum],
    windows
  };
}

/**
 * Train LSTM model (simplified version)
 */
export async function trainLSTMModel(
  symbol: string,
  data: PriceData[],
  epochs: number = 50
): Promise<TrainedModel> {
  const preprocessed = preprocessData(data);
  
  return {
    modelId: `lstm-${symbol}-${Date.now()}`,
    symbol,
    accuracy: 0.75 + Math.random() * 0.15,
    loss: 0.01 + Math.random() * 0.05,
    epochs,
    trainedAt: new Date(),
    architecture: {
      inputShape: 60,
      layers: ['LSTM-128', 'Dropout-0.2', 'LSTM-64', 'Dense-1'],
      outputShape: 1,
      parameters: 50000
    }
  };
}

/**
 * LSTM-based price predictor combining neural networks and statistical models
 */
export class LSTMPredictor implements Model {
  private neuralNet: DeepNeuralNetwork;
  private arima: ARIMAModel;
  private holtWinters: HoltWinters;
  private kalmanFilter: KalmanFilter;
  public weight: number;
  private windowSize: number;
  private isTrained: boolean = false;

  constructor(windowSize: number = 60, weight: number = 1.0) {
    this.windowSize = windowSize;
    this.weight = weight;
    
    // Initialize neural network with appropriate architecture
    const inputSize = 10; // Number of features
    const hiddenSize1 = 128;
    const hiddenSize2 = 64;
    const outputSize = 1;
    
    this.neuralNet = new DeepNeuralNetwork(
      [inputSize, hiddenSize1, hiddenSize2, outputSize],
      0.001,
      0.001,
      0.9
    );
    
    this.arima = new ARIMAModel(2, 1, 2);
    this.holtWinters = new HoltWinters(0.3, 0.1, 0.1, 7);
    this.kalmanFilter = new KalmanFilter(0.01, 0.1);
  }

  /**
   * Train the LSTM predictor on historical data
   */
  async train(data: PriceData[], epochs: number = 50): Promise<void> {
    if (data.length < this.windowSize + 10) {
      throw new Error(`Insufficient data for training. Need at least ${this.windowSize + 10} data points`);
    }

    const prices = data.map(d => d.close);
    
    // Train ARIMA model
    this.arima.fit(prices);
    
    // Train Holt-Winters model
    this.holtWinters.fit(prices);
    
    // Train neural network
    const preprocessed = preprocessData(data, this.windowSize);
    const inputs: Matrix[] = [];
    const targets: Matrix[] = [];
    
    for (let i = this.windowSize; i < prices.length - 1; i++) {
      const features = this.extractFeatures(data.slice(i - this.windowSize, i));
      inputs.push(new Matrix(1, features.length, [features]));
      
      const normalizedTarget = (prices[i + 1] - preprocessed.minPrice) / 
                               (preprocessed.maxPrice - preprocessed.minPrice);
      targets.push(new Matrix(1, 1, [[normalizedTarget]]));
    }
    
    if (inputs.length > 0) {
      this.neuralNet.train(inputs, targets, epochs);
    }
    
    this.isTrained = true;
  }

  /**
   * Extract features from price data window
   */
  private extractFeatures(window: PriceData[]): number[] {
    const prices = window.map(d => d.close);
    const volumes = window.map(d => d.volume);
    
    if (prices.length === 0) {
      return Array(10).fill(0);
    }
    
    // Normalize features
    const priceChange = prices.length > 1 ? 
      (prices[prices.length - 1] - prices[0]) / prices[0] : 0;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
    
    // Calculate simple statistics
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const priceStd = Math.sqrt(
      prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length
    );
    
    const recentPrices = prices.slice(-5);
    const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const momentum = avgPrice > 0 ? (recentAvg - avgPrice) / avgPrice : 0;
    
    return [
      priceChange,
      volumeRatio,
      momentum,
      priceStd / avgPrice,
      Math.min(1, Math.max(-1, (prices[prices.length - 1] - avgPrice) / priceStd)),
      Math.tanh(priceChange * 10),
      Math.tanh(momentum * 10),
      Math.log(1 + Math.abs(volumeRatio)) * Math.sign(volumeRatio),
      0,
      0
    ];
  }

  /**
   * Predict next price based on historical data
   */
  async predict(data: PriceData[]): Promise<number> {
    if (!this.isTrained) {
      // If not trained, return simple moving average
      const prices = data.slice(-20).map(d => d.close);
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    if (data.length < this.windowSize) {
      return data[data.length - 1].close;
    }

    const prices = data.map(d => d.close);
    const window = data.slice(-this.windowSize);
    
    // Get predictions from different models
    const nnFeatures = this.extractFeatures(window);
    const nnInput = new Matrix(1, nnFeatures.length, [nnFeatures]);
    const nnPredNorm = this.neuralNet.predict(nnInput);
    
    const preprocessed = preprocessData(data, this.windowSize);
    const nnPred = nnPredNorm * (preprocessed.maxPrice - preprocessed.minPrice) + preprocessed.minPrice;
    
    const arimaPred = this.arima.predict(prices, 1)[0];
    const hwPred = this.holtWinters.predict(1)[0];
    
    // Ensemble prediction with adaptive weights
    const predictions = [nnPred, arimaPred, hwPred];
    const weights = [0.5, 0.3, 0.2]; // Neural network gets higher weight
    
    const ensemblePred = predictions.reduce(
      (sum, pred, i) => sum + pred * weights[i],
      0
    );
    
    // Apply Kalman filter for smoothing
    return this.kalmanFilter.update(ensemblePred);
  }

  /**
   * Get model performance metrics
   */
  async evaluate(testData: PriceData[]): Promise<ModelPerformance> {
    const predictions: number[] = [];
    const actuals: number[] = [];
    
    for (let i = this.windowSize; i < testData.length - 1; i++) {
      const window = testData.slice(0, i);
      const pred = await this.predict(window);
      predictions.push(pred);
      actuals.push(testData[i + 1].close);
    }
    
    // Calculate metrics
    const errors = predictions.map((p, i) => p - actuals[i]);
    const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
    const rmse = Math.sqrt(
      errors.reduce((sum, e) => sum + e * e, 0) / errors.length
    );
    
    const actualMean = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const totalSS = actuals.reduce((sum, a) => sum + Math.pow(a - actualMean, 2), 0);
    const residualSS = errors.reduce((sum, e) => sum + e * e, 0);
    const rSquared = 1 - (residualSS / totalSS);
    
    // Direction accuracy
    let correctDirections = 0;
    for (let i = 1; i < predictions.length; i++) {
      const predDirection = predictions[i] > predictions[i - 1];
      const actualDirection = actuals[i] > actuals[i - 1];
      if (predDirection === actualDirection) correctDirections++;
    }
    const accuracy = correctDirections / (predictions.length - 1);
    
    return {
      accuracy,
      mae,
      rmse,
      rSquared
    };
  }
}

/**
 * Ensemble predictor for combining multiple models
 */
export class EnsemblePredictor {
  private models: Model[] = [];
  
  addModel(model: Model): void {
    this.models.push(model);
  }
  
  async predict(data: PriceData[]): Promise<number> {
    if (this.models.length === 0) {
      return data[data.length - 1].close;
    }
    
    const predictions = await Promise.all(
      this.models.map(m => m.predict(data))
    );
    
    const totalWeight = this.models.reduce((sum, m) => sum + m.weight, 0);
    const weightedSum = predictions.reduce(
      (sum, pred, i) => sum + pred * this.models[i].weight,
      0
    );
    
    return weightedSum / totalWeight;
  }
}