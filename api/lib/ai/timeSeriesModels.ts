// Matrix type definition
export type Matrix = number[][];

// Interface definitions
export interface KalmanConfig {
  F: Matrix; // State transition matrix
  H: Matrix; // Observation matrix
  Q: Matrix; // Process noise covariance
  R: Matrix; // Measurement noise covariance
  x0: Matrix; // Initial state
  P0: Matrix; // Initial covariance
}

export interface TimeSeriesModel {
  fit(data: number[]): void;
  predict(data: number[]): number;
  forecast(steps: number): number[];
}

export interface Moments {
  mean: number;
  variance: number;
  std: number;
  skewness: number;
  kurtosis: number;
}

// Matrix utilities
function createMatrix(rows: number, cols: number, fill: number = 0): Matrix {
  return Array(rows).fill(0).map(() => Array(cols).fill(fill));
}

function matrixMultiply(A: Matrix, B: Matrix): Matrix {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  
  const result = createMatrix(rowsA, colsB);
  
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  
  return result;
}

function matrixTranspose(A: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0].length;
  const result = createMatrix(cols, rows);
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j];
    }
  }
  
  return result;
}

function matrixAdd(A: Matrix, B: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0].length;
  const result = createMatrix(rows, cols);
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = A[i][j] + B[i][j];
    }
  }
  
  return result;
}

function matrixSubtract(A: Matrix, B: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0].length;
  const result = createMatrix(rows, cols);
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = A[i][j] - B[i][j];
    }
  }
  
  return result;
}

function matrixInverse(A: Matrix): Matrix {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
  
  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-10) throw new Error("Matrix is singular");
    
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }
    
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }
  
  return augmented.map(row => row.slice(n));
}

function matrixIdentity(n: number): Matrix {
  const result = createMatrix(n, n);
  for (let i = 0; i < n; i++) {
    result[i][i] = 1;
  }
  return result;
}

// QR Decomposition using Gram-Schmidt
export function qrDecomposition(A: Matrix): { Q: Matrix, R: Matrix } {
  const m = A.length;
  const n = A[0].length;
  const Q = createMatrix(m, n);
  const R = createMatrix(n, n);
  
  for (let j = 0; j < n; j++) {
    const v = A.map(row => row[j]);
    
    for (let i = 0; i < j; i++) {
      let dotProduct = 0;
      for (let k = 0; k < m; k++) {
        dotProduct += Q[k][i] * v[k];
      }
      R[i][j] = dotProduct;
      
      for (let k = 0; k < m; k++) {
        v[k] -= R[i][j] * Q[k][i];
      }
    }
    
    let norm = 0;
    for (let k = 0; k < m; k++) {
      norm += v[k] * v[k];
    }
    norm = Math.sqrt(norm);
    R[j][j] = norm;
    
    for (let k = 0; k < m; k++) {
      Q[k][j] = v[k] / norm;
    }
  }
  
  return { Q, R };
}

// Cholesky Decomposition
export function choleskyDecomposition(A: Matrix): Matrix {
  const n = A.length;
  const L = createMatrix(n, n);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      
      if (j === i) {
        for (let k = 0; k < j; k++) {
          sum += L[j][k] * L[j][k];
        }
        L[j][j] = Math.sqrt(A[j][j] - sum);
      } else {
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  
  return L;
}

// Solve least squares: min ||Ax - b||^2
export function solveLeastSquares(A: Matrix, b: Matrix): Matrix {
  const { Q, R } = qrDecomposition(A);
  const QT = matrixTranspose(Q);
  const QTb = matrixMultiply(QT, b);
  
  const n = R[0].length;
  const x = createMatrix(n, 1);
  
  // Back substitution
  for (let i = n - 1; i >= 0; i--) {
    let sum = QTb[i][0];
    for (let j = i + 1; j < n; j++) {
      sum -= R[i][j] * x[j][0];
    }
    x[i][0] = sum / R[i][i];
  }
  
  return x;
}

// Calculate eigenvalues using QR algorithm
export function eigenvalues(A: Matrix): number[] {
  const n = A.length;
  let Ak = A.map(row => [...row]);
  
  for (let iter = 0; iter < 100; iter++) {
    const { Q, R } = qrDecomposition(Ak);
    Ak = matrixMultiply(R, Q);
  }
  
  return Ak.map((row, i) => row[i]);
}

// Convolution
export function convolution(signal: number[], kernel: number[]): number[] {
  const n = signal.length;
  const m = kernel.length;
  const result: number[] = [];
  
  for (let i = 0; i < n + m - 1; i++) {
    let sum = 0;
    for (let j = 0; j < m; j++) {
      if (i - j >= 0 && i - j < n) {
        sum += signal[i - j] * kernel[j];
      }
    }
    result.push(sum);
  }
  
  return result;
}

// Normal distribution PDF
export function normalDistribution(x: number, mean: number, std: number): number {
  const variance = std * std;
  const coefficient = 1 / Math.sqrt(2 * Math.PI * variance);
  const exponent = -Math.pow(x - mean, 2) / (2 * variance);
  return coefficient * Math.exp(exponent);
}

// Statistical moments
export function calculateStatisticalMoments(data: number[]): Moments {
  const n = data.length;
  
  // Mean
  const mean = data.reduce((sum, x) => sum + x, 0) / n;
  
  // Variance
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  // Skewness
  const skewness = data.reduce((sum, x) => sum + Math.pow((x - mean) / std, 3), 0) / n;
  
  // Kurtosis
  const kurtosis = data.reduce((sum, x) => sum + Math.pow((x - mean) / std, 4), 0) / n - 3;
  
  return { mean, variance, std, skewness, kurtosis };
}

// Autocorrelation function
export function autocorrelation(data: number[], maxLag: number): number[] {
  const n = data.length;
  const mean = data.reduce((sum, x) => sum + x, 0) / n;
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
  
  const acf: number[] = [];
  
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += (data[i] - mean) * (data[i + lag] - mean);
    }
    acf.push(sum / (n * variance));
  }
  
  return acf;
}

// Fast Fourier Transform (Cooley-Tukey algorithm)
export function fourierTransform(data: number[]): { frequencies: number[], magnitudes: number[], phases: number[] } {
  const n = data.length;
  
  // Pad to power of 2
  let N = 1;
  while (N < n) N *= 2;
  const paddedData = [...data, ...Array(N - n).fill(0)];
  
  function fft(x: number[]): { real: number[], imag: number[] } {
    const n = x.length;
    
    if (n === 1) {
      return { real: [x[0]], imag: [0] };
    }
    
    const even = x.filter((_, i) => i % 2 === 0);
    const odd = x.filter((_, i) => i % 2 === 1);
    
    const fftEven = fft(even);
    const fftOdd = fft(odd);
    
    const real: number[] = Array(n);
    const imag: number[] = Array(n);
    
    for (let k = 0; k < n / 2; k++) {
      const theta = -2 * Math.PI * k / n;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      
      const tReal = cosTheta * fftOdd.real[k] - sinTheta * fftOdd.imag[k];
      const tImag = cosTheta * fftOdd.imag[k] + sinTheta * fftOdd.real[k];
      
      real[k] = fftEven.real[k] + tReal;
      imag[k] = fftEven.imag[k] + tImag;
      
      real[k + n / 2] = fftEven.real[k] - tReal;
      imag[k + n / 2] = fftEven.imag[k] - tImag;
    }
    
    return { real, imag };
  }
  
  const { real, imag } = fft(paddedData);
  
  const frequencies = Array.from({ length: N / 2 }, (_, i) => i / N);
  const magnitudes = real.slice(0, N / 2).map((r, i) => Math.sqrt(r * r + imag[i] * imag[i]));
  const phases = real.slice(0, N / 2).map((r, i) => Math.atan2(imag[i], r));
  
  return { frequencies, magnitudes, phases };
}

// Discrete Wavelet Transform (Haar wavelet)
export function waveletTransform(data: number[], waveletType: string = 'haar'): number[][] {
  const n = data.length;
  let current = [...data];
  const result: number[][] = [];
  
  // Haar wavelet decomposition
  while (current.length > 1) {
    const approx: number[] = [];
    const detail: number[] = [];
    
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        approx.push((current[i] + current[i + 1]) / Math.sqrt(2));
        detail.push((current[i] - current[i + 1]) / Math.sqrt(2));
      } else {
        approx.push(current[i]);
      }
    }
    
    result.push(detail);
    current = approx;
  }
  
  result.push(current);
  
  return result.reverse();
}

// ARIMA Model
export class ARIMAModel implements TimeSeriesModel {
  private p: number; // AR order
  private d: number; // Differencing order
  private q: number; // MA order
  private arParams: number[] = [];
  private maParams: number[] = [];
  private constant: number = 0;
  private fittedData: number[] = [];
  private residuals: number[] = [];
  
  constructor(p: number, d: number, q: number) {
    this.p = p;
    this.d = d;
    this.q = q;
  }
  
  private difference(data: number[], order: number): number[] {
    let diff = [...data];
    for (let i = 0; i < order; i++) {
      const newDiff: number[] = [];
      for (let j = 1; j < diff.length; j++) {
        newDiff.push(diff[j] - diff[j - 1]);
      }
      diff = newDiff;
    }
    return diff;
  }
  
  fit(data: number[]): void {
    // Apply differencing
    const diffData = this.difference(data, this.d);
    
    // Estimate AR parameters using Yule-Walker equations
    if (this.p > 0) {
      const acf = autocorrelation(diffData, this.p);
      const R = createMatrix(this.p, this.p);
      const r = createMatrix(this.p, 1);
      
      for (let i = 0; i < this.p; i++) {
        r[i][0] = acf[i + 1];
        for (let j = 0; j < this.p; j++) {
          R[i][j] = acf[Math.abs(i - j)];
        }
      }
      
      const arParamsMatrix = solveLeastSquares(R, r);
      this.arParams = arParamsMatrix.map(row => row[0]);
    }
    
    // Calculate residuals
    this.residuals = [];
    for (let i = this.p; i < diffData.length; i++) {
      let pred = 0;
      for (let j = 0; j < this.p; j++) {
        pred += this.arParams[j] * diffData[i - j - 1];
      }
      this.residuals.push(diffData[i] - pred);
    }
    
    // Estimate MA parameters
    if (this.q > 0) {
      this.maParams = Array(this.q).fill(0);
      
      // Simple MA estimation using residuals autocorrelation
      const residualAcf = autocorrelation(this.residuals, this.q);
      for (let i = 0; i < this.q; i++) {
        this.maParams[i] = -residualAcf[i + 1];
      }
    }
    
    this.constant = diffData.reduce((sum, x) => sum + x, 0) / diffData.length;
    this.fittedData = diffData;
  }
  
  predict(data: number[]): number {
    const diffData = this.difference(data, this.d);
    
    let prediction = this.constant;
    
    // AR component
    for (let i = 0; i < this.p && i < diffData.length; i++) {
      prediction += this.arParams[i] * diffData[diffData.length - 1 - i];
    }
    
    // MA component
    for (let i = 0; i < this.q && i < this.residuals.length; i++) {
      prediction += this.maParams[i] * this.residuals[this.residuals.length - 1 - i];
    }
    
    return prediction;
  }
  
  forecast(steps: number): number[] {
    const forecasts: number[] = [];
    const extendedData = [...this.fittedData];
    
    for (let step = 0; step < steps; step++) {
      let prediction = this.constant;
      
      for (let i = 0; i < this.p; i++) {
        if (extendedData.length - 1 - i >= 0) {
          prediction += this.arParams[i] * extendedData[extendedData.length - 1 - i];
        }
      }
      
      forecasts.push(prediction);
      extendedData.push(prediction);
    }
    
    return forecasts;
  }
  
  getAIC(): number {
    const n = this.fittedData.length;
    const k = this.p + this.q + 1;
    const sse = this.residuals.reduce((sum, r) => sum + r * r, 0);
    const logLikelihood = -n / 2 * Math.log(2 * Math.PI) - n / 2 * Math.log(sse / n) - n / 2;
    return 2 * k - 2 * logLikelihood;
  }
  
  getBIC(): number {
    const n = this.fittedData.length;
    const k = this.p + this.q + 1;
    const sse = this.residuals.reduce((sum, r) => sum + r * r, 0);
    const logLikelihood = -n / 2 * Math.log(2 * Math.PI) - n / 2 * Math.log(sse / n) - n / 2;
    return k * Math.log(n) - 2 * logLikelihood;
  }
}

// Holt-Winters Exponential Smoothing
export class HoltWintersModel implements TimeSeriesModel {
  private alpha: number; // Level smoothing
  private beta: number;  // Trend smoothing
  private gamma: number; // Seasonal smoothing
  private seasonLength: number;
  
  private level: number[] = [];
  private trend: number[] = [];
  private seasonal: number[] = [];
  private fitted: number[] = [];
  
  constructor(alpha: number, beta: number, gamma: number, seasonLength: number) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
    this.seasonLength = seasonLength;
  }
  
  fit(data: number[]): void {
    const n = data.length;
    
    // Initialize level
    let initialLevel = 0;
    for (let i = 0; i < this.seasonLength; i++) {
      initialLevel += data[i];
    }
    initialLevel /= this.seasonLength;
    
    // Initialize trend
    let initialTrend = 0;
    for (let i = 0; i < this.seasonLength; i++) {
      initialTrend += (data[this.seasonLength + i] - data[i]) / this.seasonLength;
    }
    initialTrend /= this.seasonLength;
    
    // Initialize seasonal components
    this.seasonal = Array(this.seasonLength).fill(0);
    for (let i = 0; i < this.seasonLength; i++) {
      this.seasonal[i] = data[i] - initialLevel;
    }
    
    this.level = [initialLevel];
    this.trend = [initialTrend];
    
    // Apply triple exponential smoothing
    for (let i = 0; i < n; i++) {
      const seasonalIndex = i % this.seasonLength;
      
      const lastLevel = this.level[this.level.length - 1];
      const lastTrend = this.trend[this.trend.length - 1];
      const lastSeasonal = this.seasonal[seasonalIndex];
      
      const newLevel = this.alpha * (data[i] - lastSeasonal) + (1 - this.alpha) * (lastLevel + lastTrend);
      const newTrend = this.beta * (newLevel - lastLevel) + (1 - this.beta) * lastTrend;
      const newSeasonal = this.gamma * (data[i] - newLevel) + (1 - this.gamma) * lastSeasonal;
      
      this.level.push(newLevel);
      this.trend.push(newTrend);
      this.seasonal[seasonalIndex] = newSeasonal;
      
      this.fitted.push(newLevel + newTrend + lastSeasonal);
    }
  }
  
  predict(data: number[]): number {
    if (this.level.length === 0) {
      this.fit(data);
    }
    
    const lastLevel = this.level[this.level.length - 1];
    const lastTrend = this.trend[this.trend.length - 1];
    const seasonalIndex = data.length % this.seasonLength;
    
    return lastLevel + lastTrend + this.seasonal[seasonalIndex];
  }
  
  forecast(steps: number): number[] {
    const forecasts: number[] = [];
    const lastLevel = this.level[this.level.length - 1];
    const lastTrend = this.trend[this.trend.length - 1];
    
    for (let i = 1; i <= steps; i++) {
      const seasonalIndex = (this.level.length - 1 + i) % this.seasonLength;
      forecasts.push(lastLevel + i * lastTrend + this.seasonal[seasonalIndex]);
    }
    
    return forecasts;
  }
  
  getComponents(): { level: number[], trend: number[], seasonal: number[] } {
    return {
      level: [...this.level],
      trend: [...this.trend],
      seasonal: [...this.seasonal]
    };
  }
}

// Kalman Filter
export class KalmanFilter {
  private F: Matrix; // State transition matrix
  private H: Matrix; // Observation matrix
  private Q: Matrix; // Process noise covariance
  private R: Matrix; // Measurement noise covariance
  private x: Matrix; // State estimate
  private P: Matrix; // Covariance estimate
  
  constructor(config: KalmanConfig) {
    this.F = config.F;
    this.H = config.H;
    this.Q = config.Q;
    this.R = config.R;
    this.x = config.x0;
    this.P = config.P0;
  }
  
  predict(): void {
    // State prediction: x = F * x
    this.x = matrixMultiply(this.F, this.x);
    
    // Covariance prediction: P = F * P * F^T + Q
    const FP = matrixMultiply(this.F, this.P);
    const FPFt = matrixMultiply(FP, matrixTranspose(this.F));
    this.P = matrixAdd(FPFt, this.Q);
  }
  
  update(measurement: number): void {
    const z = [[measurement]];
    
    // Innovation: y = z - H * x
    const Hx = matrixMultiply(this.H, this.x);
    const y = matrixSubtract(z, Hx);
    
    // Innovation covariance: S = H * P * H^T + R
    const HP = matrixMultiply(this.H, this.P);
    const HPHt = matrixMultiply(HP, matrixTranspose(this.H));
    const S = matrixAdd(HPHt, this.R);
    
    // Kalman gain: K = P * H^T * S^-1
    const PHt = matrixMultiply(this.P, matrixTranspose(this.H));
    const Sinv = matrixInverse(S);
    const K = matrixMultiply(PHt, Sinv);
    
    // State update: x = x + K * y
    const Ky = matrixMultiply(K, y);
    this.x = matrixAdd(this.x, Ky);
    
    // Covariance update: P = (I - K * H) * P
    const KH = matrixMultiply(K, this.H);
    const I = matrixIdentity(this.P.length);
    const IminusKH = matrixSubtract(I, KH);
    this.P = matrixMultiply(IminusKH, this.P);
  }
  
  filter(observations: number[]): number[] {
    const filtered: number[] = [];
    
    for (const obs of observations) {
      this.predict();
      this.update(obs);
      filtered.push(this.x[0][0]);
    }
    
    return filtered;
  }
  
  smooth(observations: number[]): number[] {
    // Forward pass
    const states: Matrix[] = [];
    const covariances: Matrix[] = [];
    
    for (const obs of observations) {
      this.predict();
      this.update(obs);
      states.push(this.x.map(row => [...row]));
      covariances.push(this.P.map(row => [...row]));
    }
    
    // Backward pass (Rauch-Tung-Striebel smoother)
    const smoothed: number[] = [states[states.length - 1][0][0]];
    
    for (let k = states.length - 2; k >= 0; k--) {
      const Pk = covariances[k];
      const FPk = matrixMultiply(this.F, Pk);
      const FPkFt = matrixMultiply(FPk, matrixTranspose(this.F));
      const PkPlus1Pred = matrixAdd(FPkFt, this.Q);
      
      const PkFt = matrixMultiply(Pk, matrixTranspose(this.F));
      const J = matrixMultiply(PkFt, matrixInverse(PkPlus1Pred));
      
      const xDiff = matrixSubtract([[smoothed[0]]], matrixMultiply(this.F, states[k]));
      const correction = matrixMultiply(J, xDiff);
      const xSmoothed = matrixAdd(states[k], correction);
      
      smoothed.unshift(xSmoothed[0][0]);
    }
    
    return smoothed;
  }
  
  getState(): Matrix {
    return this.x.map(row => [...row]);
  }
  
  getCovariance(): Matrix {
    return this.P.map(row => [...row]);
  }
}