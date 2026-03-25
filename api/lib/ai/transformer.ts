/**
 * Transformer Models for Cryptocurrency Price Prediction
 * 
 * Implementation of Transformer architecture (similar to GPT) for time series forecasting
 * of cryptocurrency prices, with various advanced features and interpretability tools.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface TransformerConfig {
  d_model: number;
  nhead: number;
  num_layers: number;
  dim_feedforward: number;
  dropout: number;
  max_sequence_length: number;
}

export interface AttentionWeights {
  layer: number;
  head: number;
  weights: number[][];
}

export interface PredictionResult {
  predictions: number[];
  confidence: number[];
  attentionMaps?: AttentionWeights[];
}

export interface TrainingMetrics {
  epoch: number;
  loss: number;
  validationLoss?: number;
  learningRate: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  attentionScore: number;
}

export interface ExplanationResult {
  prediction: number;
  featureImportances: FeatureImportance[];
  attentionPatterns: AttentionWeights[];
  counterfactuals?: any[];
}

export type ActivationFunction = 'relu' | 'gelu' | 'tanh' | 'sigmoid';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a causal mask to prevent attending to future positions
 * Returns upper triangular matrix of -Infinity
 */
export function createCausalMask(seqLen: number): number[][] {
  const mask: number[][] = [];
  for (let i = 0; i < seqLen; i++) {
    mask[i] = [];
    for (let j = 0; j < seqLen; j++) {
      mask[i][j] = j > i ? -Infinity : 0;
    }
  }
  return mask;
}

/**
 * Create padding mask for padded positions
 */
export function createPaddingMask(batch: number[][], padToken: number): number[][] {
  return batch.map(sequence => 
    sequence.map(token => token === padToken ? -Infinity : 0)
  );
}

/**
 * Scaled dot-product attention
 * Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V
 */
export function scaledDotProductAttention(
  q: number[][],
  k: number[][],
  v: number[][],
  mask?: number[][]
): { output: number[][], attentionWeights: number[][] } {
  const dK = k[0].length;
  const scaleFactor = Math.sqrt(dK);
  
  // Compute Q @ K^T / sqrt(d_k)
  const scores: number[][] = matrixMultiply(q, transposeMatrix(k)).map(row =>
    row.map(val => val / scaleFactor)
  );
  
  // Apply mask if provided
  let maskedScores = scores;
  if (mask) {
    maskedScores = scores.map((row, i) =>
      row.map((val, j) => val + (mask[i]?.[j] ?? 0))
    );
  }
  
  // Apply softmax
  const attentionWeights = maskedScores.map(row => softmax(row));
  
  // Multiply by V
  const output = matrixMultiply(attentionWeights, v);
  
  return { output, attentionWeights };
}

/**
 * Generate square subsequent mask for autoregressive decoding
 */
export function generateSquareSubsequentMask(size: number): number[][] {
  return createCausalMask(size);
}

/**
 * Label smoothing for reducing overconfidence
 */
export function labelSmoothing(targets: number[], smoothing: number): number[] {
  const n = targets.length;
  return targets.map(target => target * (1 - smoothing) + smoothing / n);
}

/**
 * Warmup cosine learning rate schedule
 */
export function warmupCosineSchedule(
  step: number,
  warmupSteps: number,
  totalSteps: number,
  baseLR: number = 1e-4,
  minLR: number = 1e-6
): number {
  if (step < warmupSteps) {
    return baseLR * (step / warmupSteps);
  }
  const progress = (step - warmupSteps) / (totalSteps - warmupSteps);
  return minLR + (baseLR - minLR) * 0.5 * (1 + Math.cos(Math.PI * progress));
}

/**
 * Compute transformer loss (masked MSE or MAE)
 */
export function computeTransformerLoss(
  predictions: number[],
  targets: number[],
  mask?: number[],
  lossType: 'mse' | 'mae' = 'mse'
): number {
  let totalLoss = 0;
  let count = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    if (!mask || mask[i] !== 0) {
      const error = predictions[i] - targets[i];
      totalLoss += lossType === 'mse' ? error * error : Math.abs(error);
      count++;
    }
  }
  
  return count > 0 ? totalLoss / count : 0;
}

/**
 * Beam search for generating predictions
 */
export function beamSearch(
  model: any,
  startSequence: number[],
  beamWidth: number,
  maxLen: number
): number[][] {
  interface Beam {
    sequence: number[];
    score: number;
  }
  
  let beams: Beam[] = [{ sequence: startSequence, score: 0 }];
  
  for (let i = 0; i < maxLen; i++) {
    const candidates: Beam[] = [];
    
    for (const beam of beams) {
      const predictions = model.forward(beam.sequence);
      const topK = getTopK(predictions, beamWidth);
      
      for (const { value, score } of topK) {
        candidates.push({
          sequence: [...beam.sequence, value],
          score: beam.score + Math.log(score)
        });
      }
    }
    
    // Keep top beamWidth candidates
    beams = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, beamWidth);
  }
  
  return beams.map(b => b.sequence);
}

/**
 * Top-k sampling with temperature
 */
export function topKSampling(
  logits: number[],
  k: number,
  temperature: number = 1.0
): number {
  // Apply temperature
  const scaledLogits = logits.map(l => l / temperature);
  
  // Get top-k indices
  const topK = getTopK(scaledLogits, k);
  
  // Sample from top-k distribution
  const probs = softmax(topK.map(t => t.score));
  const cumProbs = probs.reduce((acc, p, i) => {
    acc.push((acc[i - 1] || 0) + p);
    return acc;
  }, [] as number[]);
  
  const rand = Math.random();
  const idx = cumProbs.findIndex(cp => rand <= cp);
  
  return topK[idx].value;
}

/**
 * Extract and analyze attention patterns
 */
export function extractAttentionPatterns(
  attentionWeights: AttentionWeights[]
): {
  averageAttention: number[][];
  maxAttention: number[][];
  attentionEntropy: number[];
} {
  if (attentionWeights.length === 0) {
    return {
      averageAttention: [],
      maxAttention: [],
      attentionEntropy: []
    };
  }
  
  const seqLen = attentionWeights[0].weights.length;
  const averageAttention = Array(seqLen).fill(0).map(() => Array(seqLen).fill(0));
  const maxAttention = Array(seqLen).fill(0).map(() => Array(seqLen).fill(-Infinity));
  
  // Aggregate attention weights
  for (const attn of attentionWeights) {
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        averageAttention[i][j] += attn.weights[i][j];
        maxAttention[i][j] = Math.max(maxAttention[i][j], attn.weights[i][j]);
      }
    }
  }
  
  // Compute average
  const numHeads = attentionWeights.length;
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < seqLen; j++) {
      averageAttention[i][j] /= numHeads;
    }
  }
  
  // Compute attention entropy
  const attentionEntropy = averageAttention.map(row => {
    return -row.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0);
  });
  
  return { averageAttention, maxAttention, attentionEntropy };
}

/**
 * Compute BLEU score for sequence evaluation
 */
export function computeBLEUScore(
  predictions: number[][],
  actuals: number[][],
  maxN: number = 4
): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Predictions and actuals must have same length');
  }
  
  const ngramScores: number[] = [];
  
  for (let n = 1; n <= maxN; n++) {
    let matches = 0;
    let total = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      const predNgrams = getNgrams(predictions[i], n);
      const actualNgrams = getNgrams(actuals[i], n);
      
      for (const ngram of predNgrams) {
        if (actualNgrams.includes(ngram)) {
          matches++;
        }
        total++;
      }
    }
    
    ngramScores.push(total > 0 ? matches / total : 0);
  }
  
  // Geometric mean of n-gram scores
  const geometricMean = Math.exp(
    ngramScores.reduce((sum, score) => sum + Math.log(score + 1e-10), 0) / maxN
  );
  
  // Brevity penalty
  const predLen = predictions.reduce((sum, p) => sum + p.length, 0);
  const actualLen = actuals.reduce((sum, a) => sum + a.length, 0);
  const brevityPenalty = predLen >= actualLen ? 1 : Math.exp(1 - actualLen / predLen);
  
  return brevityPenalty * geometricMean;
}

/**
 * Visualize transformer predictions (returns data structure for plotting)
 */
export function visualizeTransformerPredictions(
  model: any,
  testData: number[][]
): {
  predictions: number[];
  actuals: number[];
  confidence: number[];
  timestamps: number[];
} {
  const predictions: number[] = [];
  const actuals: number[] = [];
  const confidence: number[] = [];
  const timestamps: number[] = [];
  
  for (let i = 0; i < testData.length; i++) {
    const result = model.predict(testData[i], 1);
    predictions.push(result.predictions[0]);
    confidence.push(result.confidence[0]);
    actuals.push(testData[i][testData[i].length - 1]);
    timestamps.push(Date.now() + i * 60000); // Mock timestamps
  }
  
  return { predictions, actuals, confidence, timestamps };
}

// ============================================================================
// Core Components
// ============================================================================

/**
 * Multi-Head Attention mechanism
 */
export class MultiHeadAttention {
  private dModel: number;
  private numHeads: number;
  private dK: number;
  private dV: number;
  private wQ: number[][];
  private wK: number[][];
  private wV: number[][];
  private wO: number[][];
  
  constructor(dModel: number, numHeads: number) {
    this.dModel = dModel;
    this.numHeads = numHeads;
    this.dK = dModel / numHeads;
    this.dV = dModel / numHeads;
    
    // Initialize projection matrices (in practice, these would be learned)
    this.wQ = initializeMatrix(dModel, dModel);
    this.wK = initializeMatrix(dModel, dModel);
    this.wV = initializeMatrix(dModel, dModel);
    this.wO = initializeMatrix(dModel, dModel);
  }
  
  forward(query: number[][], key: number[][], value: number[][], mask?: number[][]): {
    output: number[][];
    attentionWeights: AttentionWeights[];
  } {
    const batchSize = query.length;
    
    // Linear projections
    const Q = matrixMultiply(query, this.wQ);
    const K = matrixMultiply(key, this.wK);
    const V = matrixMultiply(value, this.wV);
    
    // Split into multiple heads
    const QHeads = this.splitHeads(Q, this.numHeads);
    const KHeads = this.splitHeads(K, this.numHeads);
    const VHeads = this.splitHeads(V, this.numHeads);
    
    // Apply attention for each head
    const headOutputs: number[][][] = [];
    const allAttentionWeights: AttentionWeights[] = [];
    
    for (let h = 0; h < this.numHeads; h++) {
      const { output, attentionWeights } = scaledDotProductAttention(
        QHeads[h],
        KHeads[h],
        VHeads[h],
        mask
      );
      headOutputs.push(output);
      allAttentionWeights.push({
        layer: 0,
        head: h,
        weights: attentionWeights
      });
    }
    
    // Concatenate heads
    const concatenated = this.combineHeads(headOutputs);
    
    // Final linear projection
    const output = matrixMultiply(concatenated, this.wO);
    
    return { output, attentionWeights: allAttentionWeights };
  }
  
  splitHeads(x: number[][], numHeads: number): number[][][] {
    const seqLen = x.length;
    const headDim = this.dK;
    const heads: number[][][] = [];
    
    for (let h = 0; h < numHeads; h++) {
      const head: number[][] = [];
      for (let i = 0; i < seqLen; i++) {
        head[i] = x[i].slice(h * headDim, (h + 1) * headDim);
      }
      heads.push(head);
    }
    
    return heads;
  }
  
  combineHeads(heads: number[][][]): number[][] {
    const seqLen = heads[0].length;
    const combined: number[][] = [];
    
    for (let i = 0; i < seqLen; i++) {
      combined[i] = [];
      for (const head of heads) {
        combined[i].push(...head[i]);
      }
    }
    
    return combined;
  }
  
  scaledDotProductAttention(
    q: number[][],
    k: number[][],
    v: number[][],
    mask?: number[][]
  ): { output: number[][], attentionWeights: number[][] } {
    return scaledDotProductAttention(q, k, v, mask);
  }
}

/**
 * Positional Encoding
 */
export class PositionalEncoding {
  private maxLen: number;
  private dModel: number;
  private encoding: number[][];
  private encodingType: 'sinusoidal' | 'learned';
  
  constructor(maxLen: number, dModel: number, encodingType: 'sinusoidal' | 'learned' = 'sinusoidal') {
    this.maxLen = maxLen;
    this.dModel = dModel;
    this.encodingType = encodingType;
    
    this.encoding = encodingType === 'sinusoidal'
      ? this.generateSinusoidalEncoding(maxLen, dModel)
      : this.generateLearnedEncoding(maxLen, dModel);
  }
  
  forward(x: number[][]): number[][] {
    const seqLen = x.length;
    const result: number[][] = [];
    
    for (let i = 0; i < seqLen; i++) {
      result[i] = x[i].map((val, j) => val + this.encoding[i][j]);
    }
    
    return result;
  }
  
  generateSinusoidalEncoding(maxLen: number, dModel: number): number[][] {
    const encoding: number[][] = [];
    
    for (let pos = 0; pos < maxLen; pos++) {
      encoding[pos] = [];
      for (let i = 0; i < dModel; i++) {
        const angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / dModel);
        encoding[pos][i] = i % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
      }
    }
    
    return encoding;
  }
  
  generateLearnedEncoding(maxLen: number, dModel: number): number[][] {
    // Initialize with random values (would be learned during training)
    const encoding: number[][] = [];
    for (let i = 0; i < maxLen; i++) {
      encoding[i] = Array(dModel).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    }
    return encoding;
  }
}

/**
 * Feed-Forward Network
 */
export class FeedForwardNetwork {
  private dModel: number;
  private dimFeedforward: number;
  private dropout: number;
  private activation: ActivationFunction;
  private w1: number[][];
  private b1: number[];
  private w2: number[][];
  private b2: number[];
  
  constructor(
    dModel: number,
    dimFeedforward: number,
    dropout: number = 0.1,
    activation: ActivationFunction = 'relu'
  ) {
    this.dModel = dModel;
    this.dimFeedforward = dimFeedforward;
    this.dropout = dropout;
    this.activation = activation;
    
    // Initialize weights
    this.w1 = initializeMatrix(dModel, dimFeedforward);
    this.b1 = Array(dimFeedforward).fill(0);
    this.w2 = initializeMatrix(dimFeedforward, dModel);
    this.b2 = Array(dModel).fill(0);
  }
  
  forward(x: number[][]): number[][] {
    // First linear layer
    let hidden = matrixMultiply(x, this.w1);
    hidden = hidden.map(row => row.map((val, i) => val + this.b1[i]));
    
    // Activation
    hidden = this.applyActivation(hidden);
    
    // Dropout (simplified - would be different during training vs inference)
    hidden = this.applyDropout(hidden, this.dropout);
    
    // Second linear layer
    let output = matrixMultiply(hidden, this.w2);
    output = output.map(row => row.map((val, i) => val + this.b2[i]));
    
    return output;
  }
  
  private applyActivation(x: number[][]): number[][] {
    switch (this.activation) {
      case 'relu':
        return x.map(row => row.map(val => Math.max(0, val)));
      case 'gelu':
        return x.map(row => row.map(val => 
          0.5 * val * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (val + 0.044715 * Math.pow(val, 3))))
        ));
      case 'tanh':
        return x.map(row => row.map(val => Math.tanh(val)));
      case 'sigmoid':
        return x.map(row => row.map(val => 1 / (1 + Math.exp(-val))));
      default:
        return x;
    }
  }
  
  private applyDropout(x: number[][], rate: number): number[][] {
    // Simplified dropout - in production would use proper training/inference modes
    return x.map(row => row.map(val => Math.random() > rate ? val / (1 - rate) : 0));
  }
}

/**
 * Transformer Encoder Layer
 */
export class TransformerEncoderLayer {
  private multiHeadAttention: MultiHeadAttention;
  private feedForward: FeedForwardNetwork;
  private norm1: LayerNorm;
  private norm2: LayerNorm;
  private dropout: number;
  
  constructor(dModel: number, nhead: number, dimFeedforward: number, dropout: number = 0.1) {
    this.multiHeadAttention = new MultiHeadAttention(dModel, nhead);
    this.feedForward = new FeedForwardNetwork(dModel, dimFeedforward, dropout);
    this.norm1 = new LayerNorm(dModel);
    this.norm2 = new LayerNorm(dModel);
    this.dropout = dropout;
  }
  
  forward(x: number[][], mask?: number[][]): {
    output: number[][];
    attentionWeights: AttentionWeights[];
  } {
    // Multi-head self-attention with residual connection
    const { output: attnOutput, attentionWeights } = this.multiHeadAttention.forward(x, x, x, mask);
    const residual1 = this.addResidual(x, attnOutput);
    const norm1Output = this.norm1.forward(residual1);
    
    // Feed-forward with residual connection
    const ffOutput = this.feedForward.forward(norm1Output);
    const residual2 = this.addResidual(norm1Output, ffOutput);
    const output = this.norm2.forward(residual2);
    
    return { output, attentionWeights };
  }
  
  private addResidual(x: number[][], residual: number[][]): number[][] {
    return x.map((row, i) => row.map((val, j) => val + residual[i][j]));
  }
}

/**
 * Layer Normalization
 */
class LayerNorm {
  private dModel: number;
  private gamma: number[];
  private beta: number[];
  private eps: number;
  
  constructor(dModel: number, eps: number = 1e-6) {
    this.dModel = dModel;
    this.eps = eps;
    this.gamma = Array(dModel).fill(1);
    this.beta = Array(dModel).fill(0);
  }
  
  forward(x: number[][]): number[][] {
    return x.map(row => {
      const mean = row.reduce((sum, val) => sum + val, 0) / row.length;
      const variance = row.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / row.length;
      const std = Math.sqrt(variance + this.eps);
      
      return row.map((val, i) => 
        this.gamma[i] * ((val - mean) / std) + this.beta[i]
      );
    });
  }
}

/**
 * Transformer Encoder (stack of encoder layers)
 */
export class TransformerEncoder {
  private layers: TransformerEncoderLayer[];
  private numLayers: number;
  
  constructor(dModel: number, nhead: number, numLayers: number, dimFeedforward: number, dropout: number = 0.1) {
    this.numLayers = numLayers;
    this.layers = [];
    for (let i = 0; i < numLayers; i++) {
      this.layers.push(new TransformerEncoderLayer(dModel, nhead, dimFeedforward, dropout));
    }
  }
  
  forward(x: number[][], mask?: number[][]): {
    output: number[][];
    attentionWeights: AttentionWeights[];
  } {
    let output = x;
    const allAttentionWeights: AttentionWeights[] = [];
    
    for (let i = 0; i < this.numLayers; i++) {
      const { output: layerOutput, attentionWeights } = this.layers[i].forward(output, mask);
      output = layerOutput;
      
      // Tag attention weights with layer number
      attentionWeights.forEach(attn => {
        allAttentionWeights.push({ ...attn, layer: i });
      });
    }
    
    return { output, attentionWeights: allAttentionWeights };
  }
  
  extractFeatures(x: number[][]): number[][][] {
    const features: number[][][] = [x];
    let output = x;
    
    for (const layer of this.layers) {
      const { output: layerOutput } = layer.forward(output);
      output = layerOutput;
      features.push(output);
    }
    
    return features;
  }
}

/**
 * Main Price Transformer Model
 */
export class PriceTransformer {
  private config: TransformerConfig;
  private inputEmbedding: number[][];
  private positionalEncoding: PositionalEncoding;
  private encoder: TransformerEncoder;
  private outputProjection: number[][];
  private outputBias: number[];
  
  constructor(config?: Partial<TransformerConfig>) {
    this.config = {
      d_model: config?.d_model ?? 256,
      nhead: config?.nhead ?? 8,
      num_layers: config?.num_layers ?? 6,
      dim_feedforward: config?.dim_feedforward ?? 1024,
      dropout: config?.dropout ?? 0.1,
      max_sequence_length: config?.max_sequence_length ?? 512
    };
    
    // Initialize components
    this.inputEmbedding = initializeMatrix(1, this.config.d_model);
    this.positionalEncoding = new PositionalEncoding(
      this.config.max_sequence_length,
      this.config.d_model
    );
    this.encoder = new TransformerEncoder(
      this.config.d_model,
      this.config.nhead,
      this.config.num_layers,
      this.config.dim_feedforward,
      this.config.dropout
    );
    this.outputProjection = initializeMatrix(this.config.d_model, 1);
    this.outputBias = [0];
  }
  
  forward(inputSequence: number[], mask?: number[][]): PredictionResult {
    // Embed input
    const embedded = this.embedInput(inputSequence);
    
    // Add positional encoding
    const posEncoded = this.positionalEncoding.forward(embedded);
    
    // Pass through encoder
    const { output, attentionWeights } = this.encoder.forward(posEncoded, mask);
    
    // Project to output
    const predictions = output.map(vec => {
      const projected = vec.reduce((sum, val, i) => 
        sum + val * this.outputProjection[i][0], 0
      ) + this.outputBias[0];
      return projected;
    });
    
    // Compute confidence (simplified - based on attention entropy)
    const confidence = attentionWeights.map(attn => {
      const entropy = attn.weights.map(row => 
        -row.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0)
      );
      return 1 / (1 + entropy.reduce((sum, e) => sum + e, 0) / entropy.length);
    });
    
    return {
      predictions,
      confidence,
      attentionMaps: attentionWeights
    };
  }
  
  predict(historicalData: number[], horizon: number): PredictionResult {
    const predictions: number[] = [];
    const confidence: number[] = [];
    let currentSequence = [...historicalData];
    
    for (let i = 0; i < horizon; i++) {
      const result = this.forward(currentSequence);
      const nextValue = result.predictions[result.predictions.length - 1];
      predictions.push(nextValue);
      confidence.push(result.confidence[0] ?? 0.5);
      currentSequence = [...currentSequence.slice(1), nextValue];
    }
    
    return {
      predictions,
      confidence
    };
  }
  
  private embedInput(inputSequence: number[]): number[][] {
    // Convert input sequence to embedded representation
    return inputSequence.map(value => {
      // Simple linear embedding - multiply by embedding matrix
      return this.inputEmbedding[0].map(weight => value * weight);
    });
  }
  
  train(data: number[][], epochs: number, learningRate: number = 0.001): TrainingMetrics[] {
    const metrics: TrainingMetrics[] = [];
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      
      for (const sequence of data) {
        const target = sequence[sequence.length - 1];
        const input = sequence.slice(0, -1);
        const result = this.forward(input);
        const prediction = result.predictions[result.predictions.length - 1];
        const loss = Math.pow(prediction - target, 2);
        totalLoss += loss;
      }
      
      const avgLoss = totalLoss / data.length;
      const currentLR = warmupCosineSchedule(epoch, 10, epochs, learningRate);
      
      metrics.push({
        epoch,
        loss: avgLoss,
        learningRate: currentLR
      });
    }
    
    return metrics;
  }
  
  explain(inputSequence: number[]): ExplanationResult {
    const result = this.forward(inputSequence);
    const prediction = result.predictions[result.predictions.length - 1];
    
    // Compute feature importances based on attention patterns
    const { averageAttention } = extractAttentionPatterns(result.attentionMaps || []);
    const featureImportances: FeatureImportance[] = inputSequence.map((value, idx) => {
      const attentionScore = averageAttention[averageAttention.length - 1]?.[idx] ?? 0;
      return {
        feature: `t-${inputSequence.length - idx}`,
        importance: Math.abs(value) * attentionScore,
        attentionScore
      };
    }).sort((a, b) => b.importance - a.importance);
    
    return {
      prediction,
      featureImportances,
      attentionPatterns: result.attentionMaps || []
    };
  }
}

// ============================================================================
// Matrix and Math Helper Functions
// ============================================================================

/**
 * Matrix multiplication
 */
function matrixMultiply(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0]?.length ?? 0;
  const colsB = b[0]?.length ?? 0;
  
  if (colsA !== b.length) {
    throw new Error(`Matrix dimensions mismatch: ${rowsA}x${colsA} and ${b.length}x${colsB}`);
  }
  
  const result: number[][] = [];
  for (let i = 0; i < rowsA; i++) {
    result[i] = [];
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }
  
  return result;
}

/**
 * Transpose a matrix
 */
function transposeMatrix(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const result: number[][] = [];
  
  for (let j = 0; j < cols; j++) {
    result[j] = [];
    for (let i = 0; i < rows; i++) {
      result[j][i] = matrix[i][j];
    }
  }
  
  return result;
}

/**
 * Softmax function
 */
function softmax(values: number[]): number[] {
  const maxVal = Math.max(...values);
  const expValues = values.map(v => Math.exp(v - maxVal));
  const sumExp = expValues.reduce((sum, val) => sum + val, 0);
  return expValues.map(v => v / sumExp);
}

/**
 * Initialize a matrix with random values using Xavier initialization
 */
function initializeMatrix(rows: number, cols: number): number[][] {
  const limit = Math.sqrt(6 / (rows + cols));
  const matrix: number[][] = [];
  
  for (let i = 0; i < rows; i++) {
    matrix[i] = [];
    for (let j = 0; j < cols; j++) {
      matrix[i][j] = (Math.random() * 2 - 1) * limit;
    }
  }
  
  return matrix;
}

/**
 * Get top-k elements from array
 */
function getTopK(values: number[], k: number): Array<{ value: number; score: number; index: number }> {
  const indexed = values.map((score, index) => ({ value: index, score, index }));
  indexed.sort((a, b) => b.score - a.score);
  return indexed.slice(0, k);
}

/**
 * Extract n-grams from sequence
 */
function getNgrams(sequence: number[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= sequence.length - n; i++) {
    const ngram = sequence.slice(i, i + n).join(',');
    ngrams.push(ngram);
  }
  return ngrams;
}

// ============================================================================
// Exported Aliases for Common Naming Conventions
// ============================================================================

/**
 * Alias for PriceTransformer - the main transformer model
 */
export const TransformerModel = PriceTransformer;
export type TransformerModel = PriceTransformer;

/**
 * Alias for PriceTransformer - the main transformer model
 */
export const Transformer = PriceTransformer;
export type Transformer = PriceTransformer;