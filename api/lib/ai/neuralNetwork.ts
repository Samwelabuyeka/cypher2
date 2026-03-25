/**
 * Complete Neural Network Implementation from Scratch
 * Includes matrix operations, activation functions, optimizers, and training capabilities
 */

// ==================== TYPES ====================

export interface LayerConfig {
  inputSize: number;
  outputSize: number;
  activation: string;
  dropout?: number;
  batchNorm?: boolean;
}

export interface NetworkConfig {
  layers: LayerConfig[];
  optimizer: 'sgd' | 'adam';
  lossFunction: string;
  learningRate?: number;
  clipGradient?: number;
}

export interface Dataset {
  inputs: number[][];
  targets: number[][];
  validationInputs?: number[][];
  validationTargets?: number[][];
}

export interface TrainingResult {
  finalLoss: number;
  epochs: number;
  history: Array<{
    epoch: number;
    loss: number;
    valLoss?: number;
  }>;
}

export interface NetworkState {
  config: NetworkConfig;
  layers: Array<{
    weights: number[][];
    biases: number[][];
    inputSize: number;
    outputSize: number;
    activation: string;
  }>;
}

// ==================== MATRIX CLASS ====================

export class Matrix {
  rows: number;
  cols: number;
  data: number[][];

  constructor(rows: number, cols: number, data?: number[][]) {
    this.rows = rows;
    this.cols = cols;
    
    if (data) {
      this.data = data;
    } else {
      this.data = Array(rows).fill(0).map(() => Array(cols).fill(0));
    }
  }

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols);
  }

  static ones(rows: number, cols: number): Matrix {
    const matrix = new Matrix(rows, cols);
    matrix.data = matrix.data.map(row => row.fill(1));
    return matrix;
  }

  static random(rows: number, cols: number, min: number = -1, max: number = 1): Matrix {
    const matrix = new Matrix(rows, cols);
    const range = max - min;
    matrix.data = matrix.data.map(row => 
      row.map(() => Math.random() * range + min)
    );
    return matrix;
  }

  static fromArray(arr: number[]): Matrix {
    const matrix = new Matrix(arr.length, 1);
    matrix.data = arr.map(val => [val]);
    return matrix;
  }

  toArray(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.push(this.data[i][j]);
      }
    }
    return result;
  }

  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Matrix dimension mismatch: (${this.rows}x${this.cols}) vs (${other.rows}x${other.cols})`);
    }
    
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] + other.data[i][j];
      }
    }
    return result;
  }

  subtract(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Matrix dimension mismatch: (${this.rows}x${this.cols}) vs (${other.rows}x${other.cols})`);
    }
    
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] - other.data[i][j];
      }
    }
    return result;
  }

  multiply(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Matrix dimension mismatch: (${this.rows}x${this.cols}) vs (${other.rows}x${other.cols})`);
    }
    
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * other.data[i][j];
      }
    }
    return result;
  }

  dot(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(`Cannot multiply matrices: (${this.rows}x${this.cols}) x (${other.rows}x${other.cols})`);
    }
    
    const result = new Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i][k] * other.data[k][j];
        }
        result.data[i][j] = sum;
      }
    }
    return result;
  }

  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j];
      }
    }
    return result;
  }

  map(fn: (val: number, i: number, j: number) => number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j], i, j);
      }
    }
    return result;
  }

  scale(scalar: number): Matrix {
    return this.map(val => val * scalar);
  }

  static mean(matrices: Matrix[]): Matrix {
    if (matrices.length === 0) {
      throw new Error('Cannot compute mean of empty array');
    }
    
    const result = matrices[0].map(() => 0);
    for (const matrix of matrices) {
      result.data = result.add(matrix).data;
    }
    return result.scale(1 / matrices.length);
  }

  clone(): Matrix {
    const clonedData = this.data.map(row => [...row]);
    return new Matrix(this.rows, this.cols, clonedData);
  }
}

// ==================== ACTIVATION FUNCTIONS ====================

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function sigmoidDerivative(x: number): number {
  const s = sigmoid(x);
  return s * (1 - s);
}

export function relu(x: number): number {
  return Math.max(0, x);
}

export function reluDerivative(x: number): number {
  return x > 0 ? 1 : 0;
}

export function tanh(x: number): number {
  return Math.tanh(x);
}

export function tanhDerivative(x: number): number {
  const t = Math.tanh(x);
  return 1 - t * t;
}

export function leakyRelu(x: number, alpha: number = 0.01): number {
  return x > 0 ? x : alpha * x;
}

export function leakyReluDerivative(x: number, alpha: number = 0.01): number {
  return x > 0 ? 1 : alpha;
}

export function linear(x: number): number {
  return x;
}

export function linearDerivative(x: number): number {
  return 1;
}

// ==================== LOSS FUNCTIONS ====================

export function meanSquaredError(predictions: Matrix, targets: Matrix): number {
  if (predictions.rows !== targets.rows || predictions.cols !== targets.cols) {
    throw new Error('Predictions and targets must have the same dimensions');
  }
  
  let sum = 0;
  for (let i = 0; i < predictions.rows; i++) {
    for (let j = 0; j < predictions.cols; j++) {
      const diff = predictions.data[i][j] - targets.data[i][j];
      sum += diff * diff;
    }
  }
  return sum / (predictions.rows * predictions.cols);
}

export function meanAbsoluteError(predictions: Matrix, targets: Matrix): number {
  if (predictions.rows !== targets.rows || predictions.cols !== targets.cols) {
    throw new Error('Predictions and targets must have the same dimensions');
  }
  
  let sum = 0;
  for (let i = 0; i < predictions.rows; i++) {
    for (let j = 0; j < predictions.cols; j++) {
      sum += Math.abs(predictions.data[i][j] - targets.data[i][j]);
    }
  }
  return sum / (predictions.rows * predictions.cols);
}

export function huberLoss(predictions: Matrix, targets: Matrix, delta: number = 1.0): number {
  if (predictions.rows !== targets.rows || predictions.cols !== targets.cols) {
    throw new Error('Predictions and targets must have the same dimensions');
  }
  
  let sum = 0;
  for (let i = 0; i < predictions.rows; i++) {
    for (let j = 0; j < predictions.cols; j++) {
      const diff = Math.abs(predictions.data[i][j] - targets.data[i][j]);
      if (diff <= delta) {
        sum += 0.5 * diff * diff;
      } else {
        sum += delta * (diff - 0.5 * delta);
      }
    }
  }
  return sum / (predictions.rows * predictions.cols);
}

export function crossEntropy(predictions: Matrix, targets: Matrix): number {
  if (predictions.rows !== targets.rows || predictions.cols !== targets.cols) {
    throw new Error('Predictions and targets must have the same dimensions');
  }
  
  let sum = 0;
  const epsilon = 1e-15;
  for (let i = 0; i < predictions.rows; i++) {
    for (let j = 0; j < predictions.cols; j++) {
      const pred = Math.max(epsilon, Math.min(1 - epsilon, predictions.data[i][j]));
      sum += targets.data[i][j] * Math.log(pred) + (1 - targets.data[i][j]) * Math.log(1 - pred);
    }
  }
  return -sum / (predictions.rows * predictions.cols);
}

// ==================== OPTIMIZERS ====================

export class SGDOptimizer {
  learningRate: number;
  momentum: number;
  decay: number;
  velocities: Map<string, Matrix>;

  constructor(learningRate: number = 0.01, momentum: number = 0.9, decay: number = 0.0) {
    this.learningRate = learningRate;
    this.momentum = momentum;
    this.decay = decay;
    this.velocities = new Map();
  }

  update(weights: Matrix, gradients: Matrix, iteration: number, layerId: string = '0'): Matrix {
    const currentLr = this.learningRate / (1 + this.decay * iteration);
    
    if (!this.velocities.has(layerId)) {
      this.velocities.set(layerId, Matrix.zeros(weights.rows, weights.cols));
    }
    
    const velocity = this.velocities.get(layerId)!;
    const newVelocity = velocity.scale(this.momentum).subtract(gradients.scale(currentLr));
    this.velocities.set(layerId, newVelocity);
    
    return weights.add(newVelocity);
  }
}

export class AdamOptimizer {
  learningRate: number;
  beta1: number;
  beta2: number;
  epsilon: number;
  m: Map<string, Matrix>;
  v: Map<string, Matrix>;

  constructor(
    learningRate: number = 0.001,
    beta1: number = 0.9,
    beta2: number = 0.999,
    epsilon: number = 1e-8
  ) {
    this.learningRate = learningRate;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.epsilon = epsilon;
    this.m = new Map();
    this.v = new Map();
  }

  update(weights: Matrix, gradients: Matrix, iteration: number, layerId: string = '0'): Matrix {
    if (!this.m.has(layerId)) {
      this.m.set(layerId, Matrix.zeros(weights.rows, weights.cols));
      this.v.set(layerId, Matrix.zeros(weights.rows, weights.cols));
    }
    
    const m = this.m.get(layerId)!;
    const v = this.v.get(layerId)!;
    
    const newM = m.scale(this.beta1).add(gradients.scale(1 - this.beta1));
    const newV = v.scale(this.beta2).add(gradients.multiply(gradients).scale(1 - this.beta2));
    
    this.m.set(layerId, newM);
    this.v.set(layerId, newV);
    
    const mHat = newM.scale(1 / (1 - Math.pow(this.beta1, iteration + 1)));
    const vHat = newV.scale(1 / (1 - Math.pow(this.beta2, iteration + 1)));
    
    const update = mHat.map((val, i, j) => {
      return val / (Math.sqrt(vHat.data[i][j]) + this.epsilon);
    }).scale(this.learningRate);
    
    return weights.subtract(update);
  }
}

// ==================== LAYER CLASS ====================

export class Layer {
  inputSize: number;
  outputSize: number;
  activation: string;
  dropout: number;
  batchNorm: boolean;
  
  weights: Matrix;
  biases: Matrix;
  lastInput: Matrix | null;
  lastOutput: Matrix | null;
  dropoutMask: Matrix | null;
  
  batchNormGamma: Matrix | null;
  batchNormBeta: Matrix | null;
  runningMean: Matrix | null;
  runningVar: Matrix | null;

  constructor(inputSize: number, outputSize: number, activation: string = 'relu', dropout: number = 0, batchNorm: boolean = false) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.activation = activation;
    this.dropout = dropout;
    this.batchNorm = batchNorm;
    
    const limit = Math.sqrt(6 / (inputSize + outputSize));
    this.weights = Matrix.random(inputSize, outputSize, -limit, limit);
    this.biases = Matrix.zeros(1, outputSize);
    
    this.lastInput = null;
    this.lastOutput = null;
    this.dropoutMask = null;
    
    if (this.batchNorm) {
      this.batchNormGamma = Matrix.ones(1, outputSize);
      this.batchNormBeta = Matrix.zeros(1, outputSize);
      this.runningMean = Matrix.zeros(1, outputSize);
      this.runningVar = Matrix.ones(1, outputSize);
    } else {
      this.batchNormGamma = null;
      this.batchNormBeta = null;
      this.runningMean = null;
      this.runningVar = null;
    }
  }

  forward(input: Matrix, training: boolean = true): Matrix {
    this.lastInput = input;
    
    let output = input.dot(this.weights);
    
    for (let i = 0; i < output.rows; i++) {
      for (let j = 0; j < output.cols; j++) {
        output.data[i][j] += this.biases.data[0][j];
      }
    }
    
    if (this.batchNorm && training) {
      output = this.applyBatchNorm(output);
    }
    
    output = this.applyActivation(output);
    
    if (this.dropout > 0 && training) {
      this.dropoutMask = Matrix.random(output.rows, output.cols, 0, 1).map(val => val > this.dropout ? 1 / (1 - this.dropout) : 0);
      output = output.multiply(this.dropoutMask);
    }
    
    this.lastOutput = output;
    return output;
  }

  backward(outputGradient: Matrix, learningRate: number): Matrix {
    if (!this.lastInput || !this.lastOutput) {
      throw new Error('Cannot perform backward pass without forward pass');
    }
    
    let gradient = outputGradient;
    
    if (this.dropout > 0 && this.dropoutMask) {
      gradient = gradient.multiply(this.dropoutMask);
    }
    
    gradient = this.applyActivationDerivative(gradient, this.lastOutput);
    
    const weightsGradient = this.lastInput.transpose().dot(gradient);
    const biasesGradient = Matrix.zeros(1, this.outputSize);
    
    for (let j = 0; j < gradient.cols; j++) {
      let sum = 0;
      for (let i = 0; i < gradient.rows; i++) {
        sum += gradient.data[i][j];
      }
      biasesGradient.data[0][j] = sum;
    }
    
    this.weights = this.weights.subtract(weightsGradient.scale(learningRate));
    this.biases = this.biases.subtract(biasesGradient.scale(learningRate));
    
    return gradient.dot(this.weights.transpose());
  }

  applyBatchNorm(input: Matrix): Matrix {
    const epsilon = 1e-5;
    const mean = Matrix.zeros(1, input.cols);
    const variance = Matrix.zeros(1, input.cols);
    
    for (let j = 0; j < input.cols; j++) {
      let sum = 0;
      for (let i = 0; i < input.rows; i++) {
        sum += input.data[i][j];
      }
      mean.data[0][j] = sum / input.rows;
      
      let varSum = 0;
      for (let i = 0; i < input.rows; i++) {
        const diff = input.data[i][j] - mean.data[0][j];
        varSum += diff * diff;
      }
      variance.data[0][j] = varSum / input.rows;
    }
    
    const normalized = new Matrix(input.rows, input.cols);
    for (let i = 0; i < input.rows; i++) {
      for (let j = 0; j < input.cols; j++) {
        normalized.data[i][j] = (input.data[i][j] - mean.data[0][j]) / Math.sqrt(variance.data[0][j] + epsilon);
        normalized.data[i][j] = normalized.data[i][j] * this.batchNormGamma!.data[0][j] + this.batchNormBeta!.data[0][j];
      }
    }
    
    return normalized;
  }

  applyActivation(input: Matrix): Matrix {
    switch (this.activation.toLowerCase()) {
      case 'sigmoid':
        return input.map(sigmoid);
      case 'relu':
        return input.map(relu);
      case 'tanh':
        return input.map(tanh);
      case 'leakyrelu':
        return input.map(x => leakyRelu(x));
      case 'linear':
        return input.map(linear);
      default:
        throw new Error(`Unknown activation function: ${this.activation}`);
    }
  }

  applyActivationDerivative(gradient: Matrix, output: Matrix): Matrix {
    const derivative = new Matrix(gradient.rows, gradient.cols);
    
    for (let i = 0; i < gradient.rows; i++) {
      for (let j = 0; j < gradient.cols; j++) {
        let deriv: number;
        switch (this.activation.toLowerCase()) {
          case 'sigmoid':
            deriv = output.data[i][j] * (1 - output.data[i][j]);
            break;
          case 'relu':
            deriv = output.data[i][j] > 0 ? 1 : 0;
            break;
          case 'tanh':
            deriv = 1 - output.data[i][j] * output.data[i][j];
            break;
          case 'leakyrelu':
            deriv = output.data[i][j] > 0 ? 1 : 0.01;
            break;
          case 'linear':
            deriv = 1;
            break;
          default:
            deriv = 1;
        }
        derivative.data[i][j] = gradient.data[i][j] * deriv;
      }
    }
    
    return derivative;
  }
}

// ==================== NEURAL NETWORK CLASS ====================

export class NeuralNetwork {
  config: NetworkConfig;
  layers: Layer[];
  optimizer: SGDOptimizer | AdamOptimizer;
  lossFunction: (predictions: Matrix, targets: Matrix) => number;

  constructor(config: NetworkConfig) {
    this.config = config;
    this.layers = [];
    
    if (config.optimizer === 'adam') {
      this.optimizer = new AdamOptimizer(config.learningRate);
    } else {
      this.optimizer = new SGDOptimizer(config.learningRate);
    }
    
    switch (config.lossFunction.toLowerCase()) {
      case 'mse':
      case 'meansquarederror':
        this.lossFunction = meanSquaredError;
        break;
      case 'mae':
      case 'meanabsoluteerror':
        this.lossFunction = meanAbsoluteError;
        break;
      case 'huber':
        this.lossFunction = (pred, target) => huberLoss(pred, target);
        break;
      case 'crossentropy':
        this.lossFunction = crossEntropy;
        break;
      default:
        this.lossFunction = meanSquaredError;
    }
    
    for (const layerConfig of config.layers) {
      this.addLayer(
        layerConfig.inputSize,
        layerConfig.outputSize,
        layerConfig.activation,
        layerConfig.dropout,
        layerConfig.batchNorm
      );
    }
  }

  addLayer(
    inputSize: number,
    outputSize: number,
    activation: string = 'relu',
    dropout?: number,
    batchNorm?: boolean
  ): void {
    const layer = new Layer(inputSize, outputSize, activation, dropout || 0, batchNorm || false);
    this.layers.push(layer);
  }

  forward(input: Matrix, training: boolean = true): Matrix {
    let output = input;
    for (const layer of this.layers) {
      output = layer.forward(output, training);
    }
    return output;
  }

  backward(targetOutput: Matrix, learningRate: number): void {
    if (this.layers.length === 0) {
      throw new Error('Network has no layers');
    }
    
    const lastLayer = this.layers[this.layers.length - 1];
    if (!lastLayer.lastOutput) {
      throw new Error('No forward pass has been performed');
    }
    
    let gradient = lastLayer.lastOutput.subtract(targetOutput);
    
    if (this.config.clipGradient) {
      gradient = this.clipGradients(gradient, this.config.clipGradient);
    }
    
    for (let i = this.layers.length - 1; i >= 0; i--) {
      gradient = this.layers[i].backward(gradient, learningRate);
    }
  }

  clipGradients(gradients: Matrix, threshold: number): Matrix {
    const norm = Math.sqrt(gradients.toArray().reduce((sum, val) => sum + val * val, 0));
    if (norm > threshold) {
      return gradients.scale(threshold / norm);
    }
    return gradients;
  }

  train(trainData: Dataset, epochs: number, batchSize: number, learningRate: number): TrainingResult {
    const history: Array<{ epoch: number; loss: number; valLoss?: number }> = [];
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let batches = 0;
      
      const indices = Array.from({ length: trainData.inputs.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      
      for (let i = 0; i < trainData.inputs.length; i += batchSize) {
        const batchIndices = indices.slice(i, Math.min(i + batchSize, trainData.inputs.length));
        const batchInputs: number[][] = [];
        const batchTargets: number[][] = [];
        
        for (const idx of batchIndices) {
          batchInputs.push(trainData.inputs[idx]);
          batchTargets.push(trainData.targets[idx]);
        }
        
        const inputMatrix = new Matrix(batchInputs.length, batchInputs[0].length);
        const targetMatrix = new Matrix(batchTargets.length, batchTargets[0].length);
        
        for (let row = 0; row < batchInputs.length; row++) {
          for (let col = 0; col < batchInputs[0].length; col++) {
            inputMatrix.data[row][col] = batchInputs[row][col];
          }
        }
        
        for (let row = 0; row < batchTargets.length; row++) {
          for (let col = 0; col < batchTargets[0].length; col++) {
            targetMatrix.data[row][col] = batchTargets[row][col];
          }
        }
        
        const predictions = this.forward(inputMatrix, true);
        const loss = this.lossFunction(predictions, targetMatrix);
        totalLoss += loss;
        batches++;
        
        this.backward(targetMatrix, learningRate);
      }
      
      const avgLoss = totalLoss / batches;
      const historyEntry: { epoch: number; loss: number; valLoss?: number } = {
        epoch: epoch + 1,
        loss: avgLoss
      };
      
      if (trainData.validationInputs && trainData.validationTargets) {
        const valInputMatrix = new Matrix(trainData.validationInputs.length, trainData.validationInputs[0].length);
        const valTargetMatrix = new Matrix(trainData.validationTargets.length, trainData.validationTargets[0].length);
        
        for (let row = 0; row < trainData.validationInputs.length; row++) {
          for (let col = 0; col < trainData.validationInputs[0].length; col++) {
            valInputMatrix.data[row][col] = trainData.validationInputs[row][col];
          }
        }
        
        for (let row = 0; row < trainData.validationTargets.length; row++) {
          for (let col = 0; col < trainData.validationTargets[0].length; col++) {
            valTargetMatrix.data[row][col] = trainData.validationTargets[row][col];
          }
        }
        
        const valPredictions = this.forward(valInputMatrix, false);
        historyEntry.valLoss = this.lossFunction(valPredictions, valTargetMatrix);
      }
      
      history.push(historyEntry);
    }
    
    return {
      finalLoss: history[history.length - 1].loss,
      epochs: epochs,
      history: history
    };
  }

  predict(input: number[]): number {
    const inputMatrix = Matrix.fromArray(input).transpose();
    const output = this.forward(inputMatrix, false);
    return output.data[0][0];
  }

  save(): NetworkState {
    return {
      config: this.config,
      layers: this.layers.map(layer => ({
        weights: layer.weights.data,
        biases: layer.biases.data,
        inputSize: layer.inputSize,
        outputSize: layer.outputSize,
        activation: layer.activation
      }))
    };
  }

  load(state: NetworkState): void {
    this.config = state.config;
    this.layers = [];
    
    for (const layerState of state.layers) {
      const layer = new Layer(
        layerState.inputSize,
        layerState.outputSize,
        layerState.activation
      );
      layer.weights = new Matrix(layerState.weights.length, layerState.weights[0].length, layerState.weights);
      layer.biases = new Matrix(layerState.biases.length, layerState.biases[0].length, layerState.biases);
      this.layers.push(layer);
    }
  }

  // ==================== NEUROPLASTICITY FEATURES ====================

  /**
   * Synaptic pruning - removes weak connections based on weight magnitude
   */
  pruneWeakConnections(threshold: number = 0.01): number {
    let prunedCount = 0;
    
    for (const layer of this.layers) {
      for (let i = 0; i < layer.weights.rows; i++) {
        for (let j = 0; j < layer.weights.cols; j++) {
          if (Math.abs(layer.weights.data[i][j]) < threshold) {
            layer.weights.data[i][j] = 0;
            prunedCount++;
          }
        }
      }
    }
    
    return prunedCount;
  }

  /**
   * Synaptic growth - strengthens active connections
   */
  growActiveConnections(activityThreshold: number = 0.1, growthRate: number = 0.01): void {
    for (const layer of this.layers) {
      if (layer.lastInput && layer.lastOutput) {
        for (let i = 0; i < layer.weights.rows; i++) {
          for (let j = 0; j < layer.weights.cols; j++) {
            const inputActivity = Math.abs(layer.lastInput.data[Math.min(i, layer.lastInput.rows - 1)][0]);
            const outputActivity = Math.abs(layer.lastOutput.data[0][Math.min(j, layer.lastOutput.cols - 1)]);
            
            if (inputActivity > activityThreshold && outputActivity > activityThreshold) {
              layer.weights.data[i][j] *= (1 + growthRate);
            }
          }
        }
      }
    }
  }

  /**
   * Hebbian learning - "cells that fire together, wire together"
   */
  applyHebbianLearning(rate: number = 0.001): void {
    for (const layer of this.layers) {
      if (layer.lastInput && layer.lastOutput) {
        for (let i = 0; i < Math.min(layer.weights.rows, layer.lastInput.rows); i++) {
          for (let j = 0; j < Math.min(layer.weights.cols, layer.lastOutput.cols); j++) {
            const preActivity = layer.lastInput.data[i][0];
            const postActivity = layer.lastOutput.data[0][j];
            
            // Hebbian rule: Δw = η * pre * post
            layer.weights.data[i][j] += rate * preActivity * postActivity;
          }
        }
      }
    }
  }

  /**
   * Weight decay to prevent overfitting
   */
  applyWeightDecay(decayRate: number = 0.0001): void {
    for (const layer of this.layers) {
      layer.weights = layer.weights.map(w => w * (1 - decayRate));
    }
  }

  /**
   * Synaptic normalization - keeps weights in reasonable range
   */
  normalizeWeights(maxNorm: number = 1.0): void {
    for (const layer of this.layers) {
      for (let j = 0; j < layer.weights.cols; j++) {
        let norm = 0;
        for (let i = 0; i < layer.weights.rows; i++) {
          norm += layer.weights.data[i][j] * layer.weights.data[i][j];
        }
        norm = Math.sqrt(norm);
        
        if (norm > maxNorm) {
          const scale = maxNorm / norm;
          for (let i = 0; i < layer.weights.rows; i++) {
            layer.weights.data[i][j] *= scale;
          }
        }
      }
    }
  }

  // ==================== DYNAMIC ARCHITECTURE ====================

  /**
   * Add neurons to a specific layer
   */
  addNeurons(layerIndex: number, count: number): void {
    if (layerIndex < 0 || layerIndex >= this.layers.length) {
      throw new Error(`Invalid layer index: ${layerIndex}`);
    }
    
    const layer = this.layers[layerIndex];
    const newOutputSize = layer.outputSize + count;
    
    // Expand weights
    const newWeights = Matrix.zeros(layer.inputSize, newOutputSize);
    for (let i = 0; i < layer.weights.rows; i++) {
      for (let j = 0; j < layer.weights.cols; j++) {
        newWeights.data[i][j] = layer.weights.data[i][j];
      }
    }
    
    // Initialize new weights randomly
    const limit = Math.sqrt(6 / (layer.inputSize + newOutputSize));
    for (let i = 0; i < layer.inputSize; i++) {
      for (let j = layer.outputSize; j < newOutputSize; j++) {
        newWeights.data[i][j] = (Math.random() * 2 - 1) * limit;
      }
    }
    
    // Expand biases
    const newBiases = Matrix.zeros(1, newOutputSize);
    for (let j = 0; j < layer.biases.cols; j++) {
      newBiases.data[0][j] = layer.biases.data[0][j];
    }
    
    layer.weights = newWeights;
    layer.biases = newBiases;
    layer.outputSize = newOutputSize;
    
    // Update next layer if exists
    if (layerIndex < this.layers.length - 1) {
      const nextLayer = this.layers[layerIndex + 1];
      const nextNewWeights = Matrix.zeros(newOutputSize, nextLayer.outputSize);
      
      for (let i = 0; i < nextLayer.weights.rows; i++) {
        for (let j = 0; j < nextLayer.weights.cols; j++) {
          nextNewWeights.data[i][j] = nextLayer.weights.data[i][j];
        }
      }
      
      nextLayer.weights = nextNewWeights;
      nextLayer.inputSize = newOutputSize;
    }
  }

  /**
   * Remove neurons from a specific layer
   */
  removeNeurons(layerIndex: number, count: number): void {
    if (layerIndex < 0 || layerIndex >= this.layers.length) {
      throw new Error(`Invalid layer index: ${layerIndex}`);
    }
    
    const layer = this.layers[layerIndex];
    if (count >= layer.outputSize) {
      throw new Error('Cannot remove all neurons from layer');
    }
    
    const newOutputSize = layer.outputSize - count;
    
    // Shrink weights
    const newWeights = Matrix.zeros(layer.inputSize, newOutputSize);
    for (let i = 0; i < layer.weights.rows; i++) {
      for (let j = 0; j < newOutputSize; j++) {
        newWeights.data[i][j] = layer.weights.data[i][j];
      }
    }
    
    // Shrink biases
    const newBiases = Matrix.zeros(1, newOutputSize);
    for (let j = 0; j < newOutputSize; j++) {
      newBiases.data[0][j] = layer.biases.data[0][j];
    }
    
    layer.weights = newWeights;
    layer.biases = newBiases;
    layer.outputSize = newOutputSize;
    
    // Update next layer if exists
    if (layerIndex < this.layers.length - 1) {
      const nextLayer = this.layers[layerIndex + 1];
      const nextNewWeights = Matrix.zeros(newOutputSize, nextLayer.outputSize);
      
      for (let i = 0; i < newOutputSize; i++) {
        for (let j = 0; j < nextLayer.weights.cols; j++) {
          nextNewWeights.data[i][j] = nextLayer.weights.data[i][j];
        }
      }
      
      nextLayer.weights = nextNewWeights;
      nextLayer.inputSize = newOutputSize;
    }
  }

  /**
   * Add a new layer dynamically
   */
  addLayerDynamic(position: number, outputSize: number, activation: string = 'relu'): void {
    if (position < 0 || position > this.layers.length) {
      throw new Error(`Invalid position: ${position}`);
    }
    
    let inputSize: number;
    if (position === 0) {
      inputSize = this.config.layers[0].inputSize;
    } else {
      inputSize = this.layers[position - 1].outputSize;
    }
    
    const newLayer = new Layer(inputSize, outputSize, activation);
    this.layers.splice(position, 0, newLayer);
    
    // Update next layer's input size if exists
    if (position < this.layers.length - 1) {
      const nextLayer = this.layers[position + 1];
      const newWeights = Matrix.zeros(outputSize, nextLayer.outputSize);
      
      const limit = Math.sqrt(6 / (outputSize + nextLayer.outputSize));
      for (let i = 0; i < outputSize; i++) {
        for (let j = 0; j < nextLayer.outputSize; j++) {
          newWeights.data[i][j] = (Math.random() * 2 - 1) * limit;
        }
      }
      
      nextLayer.weights = newWeights;
      nextLayer.inputSize = outputSize;
    }
  }

  /**
   * Remove a layer dynamically
   */
  removeLayerDynamic(layerIndex: number): void {
    if (layerIndex < 0 || layerIndex >= this.layers.length) {
      throw new Error(`Invalid layer index: ${layerIndex}`);
    }
    
    if (this.layers.length <= 1) {
      throw new Error('Cannot remove the last layer');
    }
    
    this.layers.splice(layerIndex, 1);
    
    // Update connections
    if (layerIndex < this.layers.length) {
      const currentLayer = this.layers[layerIndex];
      if (layerIndex > 0) {
        const prevLayer = this.layers[layerIndex - 1];
        
        const newWeights = Matrix.zeros(prevLayer.outputSize, currentLayer.outputSize);
        const limit = Math.sqrt(6 / (prevLayer.outputSize + currentLayer.outputSize));
        
        for (let i = 0; i < prevLayer.outputSize; i++) {
          for (let j = 0; j < currentLayer.outputSize; j++) {
            newWeights.data[i][j] = (Math.random() * 2 - 1) * limit;
          }
        }
        
        currentLayer.weights = newWeights;
        currentLayer.inputSize = prevLayer.outputSize;
      }
    }
  }

  // ==================== META-LEARNING ====================

  /**
   * Adaptive learning rate based on loss history
   */
  adaptLearningRate(lossHistory: number[], patience: number = 5): number {
    if (lossHistory.length < patience + 1) {
      return this.config.learningRate || 0.001;
    }
    
    const recentLosses = lossHistory.slice(-patience - 1);
    let improving = true;
    
    for (let i = 1; i < recentLosses.length; i++) {
      if (recentLosses[i] >= recentLosses[i - 1]) {
        improving = false;
        break;
      }
    }
    
    const currentLr = this.config.learningRate || 0.001;
    
    if (improving) {
      return Math.min(currentLr * 1.1, 0.1);
    } else {
      return Math.max(currentLr * 0.9, 1e-6);
    }
  }

  /**
   * Performance-based network reorganization
   */
  reorganizeNetwork(performanceMetric: number, threshold: number = 0.8): void {
    if (performanceMetric < threshold) {
      // Add complexity if performance is poor
      const middleLayerIndex = Math.floor(this.layers.length / 2);
      const currentSize = this.layers[middleLayerIndex].outputSize;
      const additionalNeurons = Math.max(1, Math.floor(currentSize * 0.1));
      
      this.addNeurons(middleLayerIndex, additionalNeurons);
    } else {
      // Prune if performance is good
      this.pruneWeakConnections(0.01);
    }
  }

  /**
   * Self-optimization - adjusts architecture based on training performance
   */
  selfOptimize(validationLoss: number, targetLoss: number = 0.01): void {
    const performanceRatio = targetLoss / Math.max(validationLoss, 1e-10);
    
    if (performanceRatio < 0.5) {
      // Performance is poor, add capacity
      for (let i = 0; i < this.layers.length; i++) {
        const addCount = Math.max(1, Math.floor(this.layers[i].outputSize * 0.05));
        this.addNeurons(i, addCount);
      }
    } else if (performanceRatio > 2.0) {
      // Performance is excellent, can afford to prune
      this.pruneWeakConnections(0.05);
    }
    
    // Apply neuroplasticity
    this.applyHebbianLearning(0.0001);
    this.normalizeWeights(1.0);
  }

  // ==================== ADVANCED FEATURES ====================

  /**
   * Forward pass with residual connections
   */
  forwardWithResidual(input: Matrix, training: boolean = true): Matrix {
    if (this.layers.length < 2) {
      return this.forward(input, training);
    }
    
    let output = input;
    const residualConnections: Matrix[] = [];
    
    for (let i = 0; i < this.layers.length; i++) {
      const layerOutput = this.layers[i].forward(output, training);
      
      // Add residual connection every 2 layers if dimensions match
      if (i >= 2 && output.rows === layerOutput.rows && output.cols === layerOutput.cols) {
        output = layerOutput.add(residualConnections[residualConnections.length - 1]);
      } else {
        output = layerOutput;
      }
      
      residualConnections.push(output.clone());
    }
    
    return output;
  }

  /**
   * Simple attention mechanism
   */
  applyAttention(query: Matrix, key: Matrix, value: Matrix): Matrix {
    // Scaled dot-product attention
    const scores = query.dot(key.transpose());
    const scalingFactor = Math.sqrt(key.cols);
    const scaledScores = scores.scale(1 / scalingFactor);
    
    // Softmax
    const attentionWeights = this.softmax(scaledScores);
    
    // Apply attention to values
    return attentionWeights.dot(value);
  }

  /**
   * Softmax activation for attention
   */
  private softmax(input: Matrix): Matrix {
    const output = new Matrix(input.rows, input.cols);
    
    for (let i = 0; i < input.rows; i++) {
      let maxVal = -Infinity;
      for (let j = 0; j < input.cols; j++) {
        if (input.data[i][j] > maxVal) {
          maxVal = input.data[i][j];
        }
      }
      
      let sum = 0;
      for (let j = 0; j < input.cols; j++) {
        output.data[i][j] = Math.exp(input.data[i][j] - maxVal);
        sum += output.data[i][j];
      }
      
      for (let j = 0; j < input.cols; j++) {
        output.data[i][j] /= sum;
      }
    }
    
    return output;
  }

  /**
   * Enhanced training with meta-learning
   */
  trainWithMetaLearning(
    trainData: Dataset,
    epochs: number,
    batchSize: number,
    initialLearningRate: number,
    enablePlasticity: boolean = true
  ): TrainingResult {
    const history: Array<{ epoch: number; loss: number; valLoss?: number }> = [];
    const lossHistory: number[] = [];
    let learningRate = initialLearningRate;
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let batches = 0;
      
      const indices = Array.from({ length: trainData.inputs.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      
      for (let i = 0; i < trainData.inputs.length; i += batchSize) {
        const batchIndices = indices.slice(i, Math.min(i + batchSize, trainData.inputs.length));
        const batchInputs: number[][] = [];
        const batchTargets: number[][] = [];
        
        for (const idx of batchIndices) {
          batchInputs.push(trainData.inputs[idx]);
          batchTargets.push(trainData.targets[idx]);
        }
        
        const inputMatrix = new Matrix(batchInputs.length, batchInputs[0].length);
        const targetMatrix = new Matrix(batchTargets.length, batchTargets[0].length);
        
        for (let row = 0; row < batchInputs.length; row++) {
          for (let col = 0; col < batchInputs[0].length; col++) {
            inputMatrix.data[row][col] = batchInputs[row][col];
          }
        }
        
        for (let row = 0; row < batchTargets.length; row++) {
          for (let col = 0; col < batchTargets[0].length; col++) {
            targetMatrix.data[row][col] = batchTargets[row][col];
          }
        }
        
        const predictions = this.forward(inputMatrix, true);
        const loss = this.lossFunction(predictions, targetMatrix);
        totalLoss += loss;
        batches++;
        
        this.backward(targetMatrix, learningRate);
        
        // Apply neuroplasticity during training
        if (enablePlasticity && batches % 10 === 0) {
          this.applyHebbianLearning(0.0001);
          this.normalizeWeights(1.0);
        }
      }
      
      const avgLoss = totalLoss / batches;
      lossHistory.push(avgLoss);
      
      const historyEntry: { epoch: number; loss: number; valLoss?: number } = {
        epoch: epoch + 1,
        loss: avgLoss
      };
      
      if (trainData.validationInputs && trainData.validationTargets) {
        const valInputMatrix = new Matrix(trainData.validationInputs.length, trainData.validationInputs[0].length);
        const valTargetMatrix = new Matrix(trainData.validationTargets.length, trainData.validationTargets[0].length);
        
        for (let row = 0; row < trainData.validationInputs.length; row++) {
          for (let col = 0; col < trainData.validationInputs[0].length; col++) {
            valInputMatrix.data[row][col] = trainData.validationInputs[row][col];
          }
        }
        
        for (let row = 0; row < trainData.validationTargets.length; row++) {
          for (let col = 0; col < trainData.validationTargets[0].length; col++) {
            valTargetMatrix.data[row][col] = trainData.validationTargets[row][col];
          }
        }
        
        const valPredictions = this.forward(valInputMatrix, false);
        historyEntry.valLoss = this.lossFunction(valPredictions, valTargetMatrix);
        
        // Self-optimize based on validation performance
        if (enablePlasticity && epoch % 5 === 0) {
          this.selfOptimize(historyEntry.valLoss);
        }
      }
      
      history.push(historyEntry);
      
      // Adapt learning rate
      if (epoch > 0 && epoch % 10 === 0) {
        learningRate = this.adaptLearningRate(lossHistory);
      }
      
      // Prune weak connections periodically
      if (enablePlasticity && epoch % 20 === 0) {
        this.pruneWeakConnections(0.001);
      }
    }
    
    return {
      finalLoss: history[history.length - 1].loss,
      epochs: epochs,
      history: history
    };
  }

  /**
   * Get network statistics for monitoring
   */
  getNetworkStats(): {
    totalParameters: number;
    activeConnections: number;
    layerSizes: number[];
    sparsity: number;
  } {
    let totalParams = 0;
    let activeConnections = 0;
    const layerSizes: number[] = [];
    
    for (const layer of this.layers) {
      const layerParams = layer.weights.rows * layer.weights.cols + layer.biases.cols;
      totalParams += layerParams;
      layerSizes.push(layer.outputSize);
      
      for (let i = 0; i < layer.weights.rows; i++) {
        for (let j = 0; j < layer.weights.cols; j++) {
          if (Math.abs(layer.weights.data[i][j]) > 1e-10) {
            activeConnections++;
          }
        }
      }
    }
    
    const sparsity = 1 - (activeConnections / totalParams);
    
    return {
      totalParameters: totalParams,
      activeConnections: activeConnections,
      layerSizes: layerSizes,
      sparsity: sparsity
    };
  }
}