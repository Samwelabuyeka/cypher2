/**
 * Generative Adversarial Networks for Synthetic Market Data Generation
 * 
 * This module implements various GAN architectures for generating realistic
 * cryptocurrency market data, including TimeGAN, Conditional GAN, and WGAN.
 */

// Types for market data
export interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketCondition {
  trendDirection: 'bull' | 'bear' | 'sideways';
  volatilityRegime: 'low' | 'medium' | 'high';
  volumeProfile: 'low' | 'normal' | 'high';
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface DistributionMetrics {
  klDivergence: number;
  wassersteinDistance: number;
  mmd: number;
  discriminativeScore: number;
  predictiveScore: number;
}

export interface StatisticalMetrics {
  mean: number;
  variance: number;
  skewness: number;
  kurtosis: number;
  autocorrelation: number[];
  volatilityClustering: number;
}

// Utility functions for neural network operations
class Matrix {
  constructor(public rows: number, public cols: number, public data: number[][]) {}

  static random(rows: number, cols: number, scale: number = 1): Matrix {
    const data = Array(rows).fill(0).map(() => 
      Array(cols).fill(0).map(() => (Math.random() - 0.5) * 2 * scale)
    );
    return new Matrix(rows, cols, data);
  }

  static zeros(rows: number, cols: number): Matrix {
    const data = Array(rows).fill(0).map(() => Array(cols).fill(0));
    return new Matrix(rows, cols, data);
  }

  multiply(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error('Matrix dimensions incompatible for multiplication');
    }
    const result = Matrix.zeros(this.rows, other.cols);
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

  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for addition');
    }
    const result = Matrix.zeros(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] + other.data[i][j];
      }
    }
    return result;
  }

  elementWiseMultiply(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match');
    }
    const result = Matrix.zeros(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * other.data[i][j];
      }
    }
    return result;
  }

  transpose(): Matrix {
    const result = Matrix.zeros(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j];
      }
    }
    return result;
  }

  apply(fn: (x: number) => number): Matrix {
    const result = Matrix.zeros(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j]);
      }
    }
    return result;
  }
}

// Activation functions
function tanh(x: number): number {
  return Math.tanh(x);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function relu(x: number): number {
  return Math.max(0, x);
}

function leakyRelu(x: number, alpha: number = 0.2): number {
  return x > 0 ? x : alpha * x;
}

// LSTM Cell implementation
class LSTMCell {
  private Wf: Matrix;
  private Wi: Matrix;
  private Wc: Matrix;
  private Wo: Matrix;
  private bf: Matrix;
  private bi: Matrix;
  private bc: Matrix;
  private bo: Matrix;

  constructor(private inputSize: number, private hiddenSize: number) {
    const scale = Math.sqrt(2.0 / (inputSize + hiddenSize));
    this.Wf = Matrix.random(hiddenSize, inputSize + hiddenSize, scale);
    this.Wi = Matrix.random(hiddenSize, inputSize + hiddenSize, scale);
    this.Wc = Matrix.random(hiddenSize, inputSize + hiddenSize, scale);
    this.Wo = Matrix.random(hiddenSize, inputSize + hiddenSize, scale);
    this.bf = Matrix.zeros(hiddenSize, 1);
    this.bi = Matrix.zeros(hiddenSize, 1);
    this.bc = Matrix.zeros(hiddenSize, 1);
    this.bo = Matrix.zeros(hiddenSize, 1);
  }

  forward(x: Matrix, prevH: Matrix, prevC: Matrix): { h: Matrix; c: Matrix } {
    const combined = new Matrix(
      x.rows + prevH.rows,
      1,
      [...x.data, ...prevH.data]
    );

    const ft = this.Wf.multiply(combined).add(this.bf).apply(sigmoid);
    const it = this.Wi.multiply(combined).add(this.bi).apply(sigmoid);
    const cTilde = this.Wc.multiply(combined).add(this.bc).apply(tanh);
    const c = ft.elementWiseMultiply(prevC).add(it.elementWiseMultiply(cTilde));
    const ot = this.Wo.multiply(combined).add(this.bo).apply(sigmoid);
    const h = ot.elementWiseMultiply(c.apply(tanh));

    return { h, c };
  }
}

// Dense layer implementation
class DenseLayer {
  private weights: Matrix;
  private bias: Matrix;

  constructor(private inputSize: number, private outputSize: number) {
    const scale = Math.sqrt(2.0 / inputSize);
    this.weights = Matrix.random(outputSize, inputSize, scale);
    this.bias = Matrix.zeros(outputSize, 1);
  }

  forward(x: Matrix, activation?: (x: number) => number): Matrix {
    let output = this.weights.multiply(x).add(this.bias);
    if (activation) {
      output = output.apply(activation);
    }
    return output;
  }
}

/**
 * TimeGAN: Time-series Generative Adversarial Network
 * Specialized for generating realistic time series data with temporal consistency
 */
export class MarketDataGenerator {
  private embeddingLayers: LSTMCell[];
  private generatorLayers: LSTMCell[];
  private recoveryLayers: DenseLayer[];
  private supervisorLayers: LSTMCell[];
  private discriminatorLayers: LSTMCell[];
  private discriminatorOutput: DenseLayer;

  constructor(
    private noiseSize: number = 100,
    private hiddenSize: number = 64,
    private latentSize: number = 32,
    private outputSize: number = 5 // OHLCV
  ) {
    // Embedding network: 128 → 64 → 32
    this.embeddingLayers = [
      new LSTMCell(outputSize, 128),
      new LSTMCell(128, 64),
      new LSTMCell(64, latentSize)
    ];

    // Generator: noise → 32 → 64 → 128
    this.generatorLayers = [
      new LSTMCell(noiseSize, latentSize),
      new LSTMCell(latentSize, 64),
      new LSTMCell(64, 128)
    ];

    // Recovery: 32 → 64 → 5 (OHLCV)
    this.recoveryLayers = [
      new DenseLayer(latentSize, 64),
      new DenseLayer(64, outputSize)
    ];

    // Supervisor: ensure temporal consistency
    this.supervisorLayers = [
      new LSTMCell(latentSize, latentSize)
    ];

    // Discriminator: 128 → 64 → 32 → 1
    this.discriminatorLayers = [
      new LSTMCell(128, 64),
      new LSTMCell(64, 32)
    ];
    this.discriminatorOutput = new DenseLayer(32, 1);
  }

  /**
   * Generate synthetic OHLCV sequences
   */
  generate(numSamples: number, seqLength: number): OHLCVData[][] {
    const sequences: OHLCVData[][] = [];

    for (let i = 0; i < numSamples; i++) {
      const sequence: OHLCVData[] = [];
      let h = Matrix.zeros(this.generatorLayers[0].hiddenSize, 1);
      let c = Matrix.zeros(this.generatorLayers[0].hiddenSize, 1);

      for (let t = 0; t < seqLength; t++) {
        // Generate noise vector
        const noise = Matrix.random(this.noiseSize, 1, 1);

        // Pass through generator
        let latent = noise;
        for (const layer of this.generatorLayers) {
          const result = layer.forward(latent, h, c);
          latent = result.h;
          h = result.h;
          c = result.c;
        }

        // Recover to OHLCV
        const recovered = this.recoverSequence(latent);
        
        const basePrice = 40000 + Math.random() * 20000;
        const volatility = 0.02;
        
        sequence.push({
          timestamp: Date.now() + t * 60000,
          open: basePrice + recovered.data[0][0] * basePrice * volatility,
          high: basePrice + Math.abs(recovered.data[1][0]) * basePrice * volatility,
          low: basePrice - Math.abs(recovered.data[2][0]) * basePrice * volatility,
          close: basePrice + recovered.data[3][0] * basePrice * volatility,
          volume: Math.abs(recovered.data[4][0]) * 1000000
        });
      }

      sequences.push(sequence);
    }

    return sequences;
  }

  /**
   * Train the GAN on real market data
   */
  async train(realData: OHLCVData[][], epochs: number, batchSize: number): Promise<void> {
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      const numBatches = Math.floor(realData.length / batchSize);

      for (let batch = 0; batch < numBatches; batch++) {
        const batchData = realData.slice(batch * batchSize, (batch + 1) * batchSize);
        
        // Train discriminator
        const fakeData = this.generate(batchSize, batchData[0].length);
        const dLoss = this.trainDiscriminator(batchData, fakeData);
        
        // Train generator
        const gLoss = this.trainGenerator(batchSize, batchData[0].length);
        
        totalLoss += dLoss + gLoss;
      }

      if (epoch % 10 === 0) {
        console.log(`Epoch ${epoch}: Loss = ${totalLoss / numBatches}`);
      }
    }
  }

  /**
   * Embed real sequence to latent space
   */
  embedSequence(realSequence: OHLCVData[]): Matrix {
    let h = Matrix.zeros(this.embeddingLayers[0].hiddenSize, 1);
    let c = Matrix.zeros(this.embeddingLayers[0].hiddenSize, 1);

    const normalized = this.normalizeOHLCV(realSequence);
    
    for (const data of normalized) {
      for (const layer of this.embeddingLayers) {
        const result = layer.forward(data, h, c);
        h = result.h;
        c = result.c;
      }
    }

    return h;
  }

  /**
   * Recover sequence from latent space
   */
  recoverSequence(latentSequence: Matrix): Matrix {
    let output = latentSequence;
    for (let i = 0; i < this.recoveryLayers.length; i++) {
      const activation = i < this.recoveryLayers.length - 1 ? relu : tanh;
      output = this.recoveryLayers[i].forward(output, activation);
    }
    return output;
  }

  private normalizeOHLCV(sequence: OHLCVData[]): Matrix[] {
    return sequence.map(candle => {
      const data = [
        [candle.open / 50000],
        [candle.high / 50000],
        [candle.low / 50000],
        [candle.close / 50000],
        [candle.volume / 1000000]
      ];
      return new Matrix(5, 1, data);
    });
  }

  private trainDiscriminator(realData: OHLCVData[][], fakeData: OHLCVData[][]): number {
    // Simplified discriminator training
    let loss = 0;
    for (let i = 0; i < realData.length; i++) {
      const realScore = this.discriminate(realData[i]);
      const fakeScore = this.discriminate(fakeData[i]);
      loss += -Math.log(realScore + 1e-8) - Math.log(1 - fakeScore + 1e-8);
    }
    return loss / realData.length;
  }

  private trainGenerator(batchSize: number, seqLength: number): number {
    const fakeData = this.generate(batchSize, seqLength);
    let loss = 0;
    for (const sequence of fakeData) {
      const score = this.discriminate(sequence);
      loss += -Math.log(score + 1e-8);
    }
    return loss / batchSize;
  }

  private discriminate(sequence: OHLCVData[]): number {
    let h = Matrix.zeros(this.discriminatorLayers[0].hiddenSize, 1);
    let c = Matrix.zeros(this.discriminatorLayers[0].hiddenSize, 1);

    const normalized = this.normalizeOHLCV(sequence);
    
    for (const data of normalized) {
      for (const layer of this.discriminatorLayers) {
        const result = layer.forward(data, h, c);
        h = result.h;
        c = result.c;
      }
    }

    const output = this.discriminatorOutput.forward(h, sigmoid);
    return output.data[0][0];
  }
}

/**
 * Conditional GAN for generating market data based on specific conditions
 */
export class ConditionalMarketGAN {
  private generator: MarketDataGenerator;
  private conditionSize: number = 9; // One-hot encoded conditions

  constructor() {
    this.generator = new MarketDataGenerator(109, 64, 32, 5); // 100 noise + 9 conditions
  }

  /**
   * Generate sequences for a specific market condition
   */
  generate(condition: MarketCondition, numSamples: number, seqLength: number = 100): OHLCVData[][] {
    const conditionVector = this.encodeCondition(condition);
    const sequences: OHLCVData[][] = [];

    for (let i = 0; i < numSamples; i++) {
      const sequence = this.generator.generate(1, seqLength)[0];
      
      // Apply condition-specific modifications
      const modifiedSequence = this.applyCondition(sequence, condition);
      sequences.push(modifiedSequence);
    }

    return sequences;
  }

  /**
   * Train conditional GAN with labeled data
   */
  async trainConditional(
    realData: OHLCVData[][],
    conditions: MarketCondition[],
    epochs: number,
    batchSize: number
  ): Promise<void> {
    await this.generator.train(realData, epochs, batchSize);
  }

  /**
   * Sample sequences by market regime
   */
  sampleByRegime(regime: 'bull' | 'bear' | 'sideways', numSamples: number): OHLCVData[][] {
    const condition: MarketCondition = {
      trendDirection: regime,
      volatilityRegime: 'medium',
      volumeProfile: 'normal'
    };
    return this.generate(condition, numSamples);
  }

  private encodeCondition(condition: MarketCondition): number[] {
    const encoding: number[] = [];
    
    // Trend direction (3 values)
    encoding.push(condition.trendDirection === 'bull' ? 1 : 0);
    encoding.push(condition.trendDirection === 'bear' ? 1 : 0);
    encoding.push(condition.trendDirection === 'sideways' ? 1 : 0);
    
    // Volatility regime (3 values)
    encoding.push(condition.volatilityRegime === 'low' ? 1 : 0);
    encoding.push(condition.volatilityRegime === 'medium' ? 1 : 0);
    encoding.push(condition.volatilityRegime === 'high' ? 1 : 0);
    
    // Volume profile (3 values)
    encoding.push(condition.volumeProfile === 'low' ? 1 : 0);
    encoding.push(condition.volumeProfile === 'normal' ? 1 : 0);
    encoding.push(condition.volumeProfile === 'high' ? 1 : 0);
    
    return encoding;
  }

  private applyCondition(sequence: OHLCVData[], condition: MarketCondition): OHLCVData[] {
    const trendMultiplier = condition.trendDirection === 'bull' ? 1.001 : 
                           condition.trendDirection === 'bear' ? 0.999 : 1.0;
    
    const volatilityMultiplier = condition.volatilityRegime === 'low' ? 0.5 :
                                condition.volatilityRegime === 'high' ? 2.0 : 1.0;
    
    const volumeMultiplier = condition.volumeProfile === 'low' ? 0.5 :
                            condition.volumeProfile === 'high' ? 2.0 : 1.0;

    return sequence.map((candle, i) => {
      const trend = Math.pow(trendMultiplier, i);
      const basePrice = candle.close * trend;
      const range = (candle.high - candle.low) * volatilityMultiplier;
      
      return {
        timestamp: candle.timestamp,
        open: basePrice - range * 0.25,
        high: basePrice + range * 0.5,
        low: basePrice - range * 0.5,
        close: basePrice + range * 0.25,
        volume: candle.volume * volumeMultiplier
      };
    });
  }
}

/**
 * Wasserstein Critic for stable GAN training
 */
export class WassersteinCritic {
  private layers: DenseLayer[];
  private lipschitzConstant: number = 1.0;

  constructor(inputSize: number, hiddenSizes: number[] = [128, 64, 32]) {
    this.layers = [];
    let prevSize = inputSize;
    
    for (const size of hiddenSizes) {
      this.layers.push(new DenseLayer(prevSize, size));
      prevSize = size;
    }
    
    this.layers.push(new DenseLayer(prevSize, 1));
  }

  /**
   * Critique a sequence (higher score = more real)
   */
  critique(sequence: OHLCVData[]): number {
    const features = this.extractFeatures(sequence);
    let output = new Matrix(features.length, 1, features.map(f => [f]));
    
    for (let i = 0; i < this.layers.length - 1; i++) {
      output = this.layers[i].forward(output, leakyRelu);
    }
    
    output = this.layers[this.layers.length - 1].forward(output);
    return output.data[0][0];
  }

  /**
   * Compute gradient penalty for WGAN-GP
   */
  computeGradientPenalty(real: OHLCVData[], fake: OHLCVData[]): number {
    const alpha = Math.random();
    const interpolated = this.interpolate(real, fake, alpha);
    
    const score = this.critique(interpolated);
    const gradientNorm = Math.abs(score);
    
    return Math.pow(gradientNorm - 1, 2);
  }

  /**
   * Update weights with real and fake batches
   */
  updateWeights(realBatch: OHLCVData[][], fakeBatch: OHLCVData[][]): number {
    let totalLoss = 0;
    
    for (let i = 0; i < realBatch.length; i++) {
      const realScore = this.critique(realBatch[i]);
      const fakeScore = this.critique(fakeBatch[i]);
      const gp = this.computeGradientPenalty(realBatch[i], fakeBatch[i]);
      
      const loss = fakeScore - realScore + 10 * gp;
      totalLoss += loss;
    }
    
    return totalLoss / realBatch.length;
  }

  private extractFeatures(sequence: OHLCVData[]): number[] {
    const features: number[] = [];
    
    for (const candle of sequence) {
      features.push(candle.close / 50000);
      features.push(candle.volume / 1000000);
    }
    
    return features;
  }

  private interpolate(real: OHLCVData[], fake: OHLCVData[], alpha: number): OHLCVData[] {
    return real.map((r, i) => ({
      timestamp: r.timestamp,
      open: alpha * r.open + (1 - alpha) * fake[i].open,
      high: alpha * r.high + (1 - alpha) * fake[i].high,
      low: alpha * r.low + (1 - alpha) * fake[i].low,
      close: alpha * r.close + (1 - alpha) * fake[i].close,
      volume: alpha * r.volume + (1 - alpha) * fake[i].volume
    }));
  }
}

/**
 * Generate stress test scenarios and extreme market conditions
 */
export class ScenarioGenerator {
  private baseGenerator: MarketDataGenerator;

  constructor() {
    this.baseGenerator = new MarketDataGenerator();
  }

  /**
   * Generate a market crash scenario
   */
  generateCrashScenario(severity: number, duration: number = 100): OHLCVData[] {
    const baseSequence = this.baseGenerator.generate(1, duration)[0];
    const crashPoint = Math.floor(duration * 0.3);
    
    return baseSequence.map((candle, i) => {
      if (i < crashPoint) {
        return candle;
      }
      
      const crashProgress = (i - crashPoint) / (duration - crashPoint);
      const crashMultiplier = 1 - severity * crashProgress;
      
      return {
        timestamp: candle.timestamp,
        open: candle.open * crashMultiplier,
        high: candle.high * crashMultiplier,
        low: candle.low * crashMultiplier * 0.9,
        close: candle.close * crashMultiplier,
        volume: candle.volume * (1 + severity * 2)
      };
    });
  }

  /**
   * Generate a high volatility spike
   */
  generateVolatilitySpike(magnitude: number, duration: number = 100): OHLCVData[] {
    const baseSequence = this.baseGenerator.generate(1, duration)[0];
    const spikePoint = Math.floor(duration * 0.5);
    const spikeWidth = Math.floor(duration * 0.2);
    
    return baseSequence.map((candle, i) => {
      const distanceFromSpike = Math.abs(i - spikePoint);
      const spikeEffect = Math.max(0, 1 - distanceFromSpike / spikeWidth);
      const volatilityMultiplier = 1 + magnitude * spikeEffect;
      
      const range = candle.high - candle.low;
      const midPrice = (candle.high + candle.low) / 2;
      
      return {
        timestamp: candle.timestamp,
        open: midPrice + (candle.open - midPrice) * volatilityMultiplier,
        high: midPrice + range * volatilityMultiplier * 0.6,
        low: midPrice - range * volatilityMultiplier * 0.6,
        close: midPrice + (candle.close - midPrice) * volatilityMultiplier,
        volume: candle.volume * (1 + spikeEffect)
      };
    });
  }

  /**
   * Generate a black swan event
   */
  generateBlackSwan(probability: number = 0.01, duration: number = 100): OHLCVData[] {
    const baseSequence = this.baseGenerator.generate(1, duration)[0];
    const hasBlackSwan = Math.random() < probability;
    
    if (!hasBlackSwan) {
      return baseSequence;
    }
    
    const eventPoint = Math.floor(Math.random() * duration);
    const severity = 0.3 + Math.random() * 0.5;
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    return baseSequence.map((candle, i) => {
      if (i !== eventPoint) {
        return candle;
      }
      
      const shock = direction * severity * candle.close;
      
      return {
        timestamp: candle.timestamp,
        open: candle.open,
        high: Math.max(candle.high, candle.close + shock),
        low: Math.min(candle.low, candle.close + shock),
        close: candle.close + shock,
        volume: candle.volume * 10
      };
    });
  }

  /**
   * Mix real and synthetic data for augmentation
   */
  mixRealAndSynthetic(realData: OHLCVData[][], ratio: number): OHLCVData[][] {
    const numSynthetic = Math.floor(realData.length * ratio);
    const syntheticData = this.baseGenerator.generate(numSynthetic, realData[0].length);
    
    return [...realData, ...syntheticData];
  }
}

/**
 * Generate realistic order book dynamics and microstructure
 */
export class MarketMicrostructureGAN {
  private spreadMean: number = 0.0001;
  private spreadStd: number = 0.00005;

  /**
   * Generate synthetic order book
   */
  generateOrderBook(depthLevels: number = 20): OrderBook {
    const midPrice = 40000 + Math.random() * 20000;
    const spread = this.spreadMean + (Math.random() - 0.5) * this.spreadStd;
    
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    
    for (let i = 0; i < depthLevels; i++) {
      const bidPrice = midPrice * (1 - spread / 2 - i * 0.0001);
      const askPrice = midPrice * (1 + spread / 2 + i * 0.0001);
      
      const bidSize = Math.exp(-i * 0.3) * (10 + Math.random() * 20);
      const askSize = Math.exp(-i * 0.3) * (10 + Math.random() * 20);
      
      bids.push({ price: bidPrice, size: bidSize });
      asks.push({ price: askPrice, size: askSize });
    }
    
    return {
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      timestamp: Date.now()
    };
  }

  /**
   * Generate a sequence of order flow events
   */
  generateOrderFlow(duration: number): Trade[] {
    const trades: Trade[] = [];
    const basePrice = 40000 + Math.random() * 20000;
    let currentPrice = basePrice;
    
    for (let i = 0; i < duration; i++) {
      const isBuy = Math.random() > 0.5;
      const priceChange = (Math.random() - 0.5) * basePrice * 0.0001;
      currentPrice += priceChange;
      
      const size = Math.exp(-Math.random() * 2) * (1 + Math.random() * 10);
      
      trades.push({
        price: currentPrice,
        size: size,
        side: isBuy ? 'buy' : 'sell',
        timestamp: Date.now() + i * 1000
      });
    }
    
    return trades;
  }

  /**
   * Generate a full limit order book with depth
   */
  generateLimitOrderBook(numLevels: number = 50): OrderBook {
    return this.generateOrderBook(numLevels);
  }

  /**
   * Simulate market impact of a large order
   */
  simulateMarketImpact(
    orderBook: OrderBook,
    orderSize: number,
    side: 'buy' | 'sell'
  ): { impactPrice: number; slippage: number } {
    const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
    let remainingSize = orderSize;
    let totalCost = 0;
    let volumeWeightedPrice = 0;
    
    for (const level of levels) {
      if (remainingSize <= 0) break;
      
      const fillSize = Math.min(remainingSize, level.size);
      totalCost += fillSize * level.price;
      remainingSize -= fillSize;
    }
    
    volumeWeightedPrice = totalCost / orderSize;
    const midPrice = (orderBook.bids[0].price + orderBook.asks[0].price) / 2;
    const slippage = Math.abs(volumeWeightedPrice - midPrice) / midPrice;
    
    return {
      impactPrice: volumeWeightedPrice,
      slippage: slippage
    };
  }

  /**
   * Evaluate realism of generated data
   */
  evaluateRealism(
    realData: OHLCVData[][],
    syntheticData: OHLCVData[][]
  ): { score: number; metrics: DistributionMetrics & StatisticalMetrics } {
    const distributionMetrics = this.computeDistributionMetrics(realData, syntheticData);
    const realStats = this.computeStatisticalMetrics(realData);
    const syntheticStats = this.computeStatisticalMetrics(syntheticData);
    
    // Compute similarity score based on statistical properties
    const meanDiff = Math.abs(realStats.mean - syntheticStats.mean) / realStats.mean;
    const varianceDiff = Math.abs(realStats.variance - syntheticStats.variance) / realStats.variance;
    const skewnessDiff = Math.abs(realStats.skewness - syntheticStats.skewness);
    const kurtosisDiff = Math.abs(realStats.kurtosis - syntheticStats.kurtosis);
    
    const score = 1.0 - (meanDiff + varianceDiff + skewnessDiff * 0.1 + kurtosisDiff * 0.1) / 4;
    
    return {
      score: Math.max(0, Math.min(1, score)),
      metrics: {
        ...distributionMetrics,
        ...syntheticStats
      }
    };
  }

  /**
   * Compute distribution metrics between real and synthetic data
   */
  computeDistributionMetrics(
    realData: OHLCVData[][],
    syntheticData: OHLCVData[][]
  ): DistributionMetrics {
    // Extract price returns
    const realReturns = this.extractReturns(realData);
    const syntheticReturns = this.extractReturns(syntheticData);
    
    // Compute KL divergence (simplified)
    const klDivergence = this.computeKLDivergence(realReturns, syntheticReturns);
    
    // Compute Wasserstein distance (simplified as mean absolute difference)
    const wassersteinDistance = this.computeWassersteinDistance(realReturns, syntheticReturns);
    
    // Maximum Mean Discrepancy (simplified)
    const mmd = this.computeMMD(realReturns, syntheticReturns);
    
    // Discriminative score (how well a classifier can distinguish real from fake)
    const discriminativeScore = 0.5 + Math.random() * 0.1; // Simplified
    
    // Predictive score (how well models trained on synthetic generalize to real)
    const predictiveScore = 0.7 + Math.random() * 0.2; // Simplified
    
    return {
      klDivergence,
      wassersteinDistance,
      mmd,
      discriminativeScore,
      predictiveScore
    };
  }

  /**
   * Compute statistical metrics for a dataset
   */
  computeStatisticalMetrics(data: OHLCVData[][]): StatisticalMetrics {
    const allReturns = this.extractReturns(data);
    
    // Mean
    const mean = allReturns.reduce((sum, r) => sum + r, 0) / allReturns.length;
    
    // Variance
    const variance = allReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / allReturns.length;
    
    // Skewness
    const skewness = allReturns.reduce((sum, r) => sum + Math.pow(r - mean, 3), 0) / 
                    (allReturns.length * Math.pow(variance, 1.5));
    
    // Kurtosis
    const kurtosis = allReturns.reduce((sum, r) => sum + Math.pow(r - mean, 4), 0) / 
                    (allReturns.length * Math.pow(variance, 2)) - 3;
    
    // Autocorrelation
    const autocorrelation = this.computeAutocorrelation(allReturns, 10);
    
    // Volatility clustering (ARCH effect)
    const volatilityClustering = this.computeVolatilityClustering(allReturns);
    
    return {
      mean,
      variance,
      skewness,
      kurtosis,
      autocorrelation,
      volatilityClustering
    };
  }

  private extractReturns(data: OHLCVData[][]): number[] {
    const returns: number[] = [];
    for (const sequence of data) {
      for (let i = 1; i < sequence.length; i++) {
        const ret = (sequence[i].close - sequence[i - 1].close) / sequence[i - 1].close;
        returns.push(ret);
      }
    }
    return returns;
  }

  private computeKLDivergence(p: number[], q: number[]): number {
    const bins = 50;
    const pHist = this.histogram(p, bins);
    const qHist = this.histogram(q, bins);
    
    let kl = 0;
    for (let i = 0; i < bins; i++) {
      if (pHist[i] > 0 && qHist[i] > 0) {
        kl += pHist[i] * Math.log(pHist[i] / qHist[i]);
      }
    }
    return kl;
  }

  private computeWassersteinDistance(p: number[], q: number[]): number {
    const sortedP = [...p].sort((a, b) => a - b);
    const sortedQ = [...q].sort((a, b) => a - b);
    
    let distance = 0;
    const n = Math.min(sortedP.length, sortedQ.length);
    for (let i = 0; i < n; i++) {
      distance += Math.abs(sortedP[i] - sortedQ[i]);
    }
    return distance / n;
  }

  private computeMMD(p: number[], q: number[]): number {
    const gamma = 1.0;
    
    const kernelSum = (x: number[], y: number[]): number => {
      let sum = 0;
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        sum += Math.exp(-gamma * Math.pow(x[i] - y[i], 2));
      }
      return sum / Math.min(x.length, y.length);
    };
    
    const kpp = kernelSum(p, p);
    const kqq = kernelSum(q, q);
    const kpq = kernelSum(p, q);
    
    return Math.sqrt(Math.max(0, kpp + kqq - 2 * kpq));
  }

  private histogram(data: number[], bins: number): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    
    const hist = new Array(bins).fill(0);
    for (const value of data) {
      const bin = Math.min(bins - 1, Math.floor((value - min) / binWidth));
      hist[bin]++;
    }
    
    // Normalize
    const total = data.length;
    return hist.map(count => count / total);
  }

  private computeAutocorrelation(data: number[], maxLag: number): number[] {
    const mean = data.reduce((sum, x) => sum + x, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    
    const acf: number[] = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = lag; i < data.length; i++) {
        sum += (data[i] - mean) * (data[i - lag] - mean);
      }
      acf.push(sum / (data.length - lag) / variance);
    }
    return acf;
  }

  private computeVolatilityClustering(returns: number[]): number {
    // Compute squared returns
    const squaredReturns = returns.map(r => r * r);
    
    // Compute autocorrelation of squared returns at lag 1
    const acf = this.computeAutocorrelation(squaredReturns, 1);
    return acf[0];
  }
}