/**
 * High-performance linear algebra library for numerical computing
 * Uses typed arrays and optimized algorithms for production use
 */

const EPSILON = 1e-10;

export type MatrixLike = Matrix | number[][];
export type VectorLike = Vector | number[];

/**
 * Vector class for linear algebra operations
 */
export class Vector {
  public data: Float64Array;
  public length: number;

  constructor(length: number, data?: number[] | Float64Array) {
    if (length <= 0) {
      throw new Error('Vector length must be positive');
    }
    this.length = length;
    
    if (data) {
      if (data.length !== length) {
        throw new Error('Data length must match vector length');
      }
      this.data = data instanceof Float64Array ? data : new Float64Array(data);
    } else {
      this.data = new Float64Array(length);
    }
  }

  static zeros(length: number): Vector {
    return new Vector(length);
  }

  static ones(length: number): Vector {
    const data = new Float64Array(length);
    data.fill(1);
    return new Vector(length, data);
  }

  static random(length: number, min = 0, max = 1): Vector {
    const data = new Float64Array(length);
    const range = max - min;
    for (let i = 0; i < data.length; i++) {
      data[i] = min + Math.random() * range;
    }
    return new Vector(length, data);
  }

  get(index: number): number {
    if (index < 0 || index >= this.length) {
      throw new Error('Index out of bounds');
    }
    return this.data[index];
  }

  set(index: number, value: number): void {
    if (index < 0 || index >= this.length) {
      throw new Error('Index out of bounds');
    }
    this.data[index] = value;
  }

  dot(other: Vector): number {
    if (this.length !== other.length) {
      throw new Error('Vector lengths must match for dot product');
    }
    let sum = 0;
    for (let i = 0; i < this.length; i++) {
      sum += this.data[i] * other.data[i];
    }
    return sum;
  }

  magnitude(): number {
    return Math.sqrt(this.dot(this));
  }

  normalize(): Vector {
    const mag = this.magnitude();
    if (mag < EPSILON) {
      throw new Error('Cannot normalize zero vector');
    }
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] / mag;
    }
    return result;
  }

  scale(scalar: number): Vector {
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] * scalar;
    }
    return result;
  }

  add(other: Vector): Vector {
    if (this.length !== other.length) {
      throw new Error('Vector lengths must match for addition');
    }
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] + other.data[i];
    }
    return result;
  }

  subtract(other: Vector): Vector {
    if (this.length !== other.length) {
      throw new Error('Vector lengths must match for subtraction');
    }
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] - other.data[i];
    }
    return result;
  }

  clone(): Vector {
    return new Vector(this.length, this.data.slice());
  }

  toMatrix(asColumn = true): Matrix {
    if (asColumn) {
      return new Matrix(this.length, 1, this.data.slice());
    } else {
      return new Matrix(1, this.length, this.data.slice());
    }
  }
}

/**
 * Matrix class for linear algebra operations
 */
export class Matrix {
  private data: Float64Array;
  public rows: number;
  public cols: number;

  constructor(rows: number, cols: number, data?: number[] | Float64Array) {
    if (rows <= 0 || cols <= 0) {
      throw new Error('Matrix dimensions must be positive');
    }
    this.rows = rows;
    this.cols = cols;
    
    if (data) {
      if (data.length !== rows * cols) {
        throw new Error('Data length must match rows * cols');
      }
      this.data = data instanceof Float64Array ? data : new Float64Array(data);
    } else {
      this.data = new Float64Array(rows * cols);
    }
  }

  // Static factory methods
  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols);
  }

  static ones(rows: number, cols: number): Matrix {
    const data = new Float64Array(rows * cols);
    data.fill(1);
    return new Matrix(rows, cols, data);
  }

  static eye(size: number): Matrix {
    const m = new Matrix(size, size);
    for (let i = 0; i < size; i++) {
      m.set(i, i, 1);
    }
    return m;
  }

  static random(rows: number, cols: number, min = 0, max = 1): Matrix {
    const data = new Float64Array(rows * cols);
    const range = max - min;
    for (let i = 0; i < data.length; i++) {
      data[i] = min + Math.random() * range;
    }
    return new Matrix(rows, cols, data);
  }

  static fromArray(arr: number[][]): Matrix {
    if (!arr.length || !arr[0].length) {
      throw new Error('Array must not be empty');
    }
    const rows = arr.length;
    const cols = arr[0].length;
    const data = new Float64Array(rows * cols);
    
    for (let i = 0; i < rows; i++) {
      if (arr[i].length !== cols) {
        throw new Error('All rows must have the same length');
      }
      for (let j = 0; j < cols; j++) {
        data[i * cols + j] = arr[i][j];
      }
    }
    return new Matrix(rows, cols, data);
  }

  static diag(values: number[]): Matrix {
    const size = values.length;
    const m = new Matrix(size, size);
    for (let i = 0; i < size; i++) {
      m.set(i, i, values[i]);
    }
    return m;
  }

  // Accessor methods
  get(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error('Index out of bounds');
    }
    return this.data[row * this.cols + col];
  }

  set(row: number, col: number, value: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error('Index out of bounds');
    }
    this.data[row * this.cols + col] = value;
  }

  // Arithmetic operations
  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for addition');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] + other.data[i];
    }
    return result;
  }

  subtract(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for subtraction');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] - other.data[i];
    }
    return result;
  }

  multiply(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for element-wise multiplication');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] * other.data[i];
    }
    return result;
  }

  dot(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(`Cannot multiply ${this.rows}x${this.cols} with ${other.rows}x${other.cols}`);
    }
    const result = new Matrix(this.rows, other.cols);
    
    // Cache-friendly blocked matrix multiplication
    const blockSize = 64;
    for (let ii = 0; ii < this.rows; ii += blockSize) {
      for (let jj = 0; jj < other.cols; jj += blockSize) {
        for (let kk = 0; kk < this.cols; kk += blockSize) {
          const iMax = Math.min(ii + blockSize, this.rows);
          const jMax = Math.min(jj + blockSize, other.cols);
          const kMax = Math.min(kk + blockSize, this.cols);
          
          for (let i = ii; i < iMax; i++) {
            for (let j = jj; j < jMax; j++) {
              let sum = result.get(i, j);
              for (let k = kk; k < kMax; k++) {
                sum += this.get(i, k) * other.get(k, j);
              }
              result.set(i, j, sum);
            }
          }
        }
      }
    }
    return result;
  }

  scale(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] * scalar;
    }
    return result;
  }

  negate(): Matrix {
    return this.scale(-1);
  }

  // Transformations
  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(j, i, this.get(i, j));
      }
    }
    return result;
  }

  inverse(): Matrix {
    if (this.rows !== this.cols) {
      throw new Error('Only square matrices can be inverted');
    }
    
    const n = this.rows;
    const { L, U, P } = this.luDecomposition();
    
    // Solve for each column of the inverse
    const inv = new Matrix(n, n);
    const eye = Matrix.eye(n);
    
    for (let j = 0; j < n; j++) {
      const b = new Vector(n);
      for (let i = 0; i < n; i++) {
        b.data[i] = eye.get(i, j);
      }
      
      // Apply permutation
      const Pb = new Vector(n);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
          Pb.data[i] += P.get(i, k) * b.data[k];
        }
      }
      
      // Forward substitution
      const y = new Vector(n);
      for (let i = 0; i < n; i++) {
        let sum = Pb.data[i];
        for (let k = 0; k < i; k++) {
          sum -= L.get(i, k) * y.data[k];
        }
        y.data[i] = sum / L.get(i, i);
      }
      
      // Back substitution
      const x = new Vector(n);
      for (let i = n - 1; i >= 0; i--) {
        let sum = y.data[i];
        for (let k = i + 1; k < n; k++) {
          sum -= U.get(i, k) * x.data[k];
        }
        x.data[i] = sum / U.get(i, i);
      }
      
      for (let i = 0; i < n; i++) {
        inv.set(i, j, x.data[i]);
      }
    }
    
    return inv;
  }

  pseudoInverse(): Matrix {
    const { U, S, V } = this.svd();
    const threshold = EPSILON * Math.max(this.rows, this.cols) * Math.max(...S);
    
    const SInv = new Matrix(V.cols, U.cols);
    for (let i = 0; i < S.length; i++) {
      if (S[i] > threshold) {
        SInv.set(i, i, 1 / S[i]);
      }
    }
    
    return V.dot(SInv).dot(U.transpose());
  }

  reshape(rows: number, cols: number): Matrix {
    if (rows * cols !== this.rows * this.cols) {
      throw new Error('Total number of elements must remain the same');
    }
    return new Matrix(rows, cols, this.data.slice());
  }

  // Decompositions
  luDecomposition(): { L: Matrix; U: Matrix; P: Matrix } {
    if (this.rows !== this.cols) {
      throw new Error('LU decomposition requires a square matrix');
    }
    
    const n = this.rows;
    const L = Matrix.zeros(n, n);
    const U = this.clone();
    const P = Matrix.eye(n);
    
    for (let k = 0; k < n; k++) {
      // Partial pivoting
      let maxRow = k;
      let maxVal = Math.abs(U.get(k, k));
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(U.get(i, k));
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }
      
      if (maxRow !== k) {
        // Swap rows in U
        for (let j = 0; j < n; j++) {
          const temp = U.get(k, j);
          U.set(k, j, U.get(maxRow, j));
          U.set(maxRow, j, temp);
        }
        // Swap rows in P
        for (let j = 0; j < n; j++) {
          const temp = P.get(k, j);
          P.set(k, j, P.get(maxRow, j));
          P.set(maxRow, j, temp);
        }
        // Swap rows in L (only lower part)
        for (let j = 0; j < k; j++) {
          const temp = L.get(k, j);
          L.set(k, j, L.get(maxRow, j));
          L.set(maxRow, j, temp);
        }
      }
      
      for (let i = k + 1; i < n; i++) {
        const factor = U.get(i, k) / U.get(k, k);
        L.set(i, k, factor);
        for (let j = k; j < n; j++) {
          U.set(i, j, U.get(i, j) - factor * U.get(k, j));
        }
      }
    }
    
    for (let i = 0; i < n; i++) {
      L.set(i, i, 1);
    }
    
    return { L, U, P };
  }

  qrDecomposition(): { Q: Matrix; R: Matrix } {
    const Q = this.clone();
    const R = Matrix.zeros(this.cols, this.cols);
    
    // Modified Gram-Schmidt
    for (let j = 0; j < this.cols; j++) {
      // Get column j
      const col = new Vector(this.rows);
      for (let i = 0; i < this.rows; i++) {
        col.data[i] = Q.get(i, j);
      }
      
      // Orthogonalize against previous columns
      for (let k = 0; k < j; k++) {
        const qk = new Vector(this.rows);
        for (let i = 0; i < this.rows; i++) {
          qk.data[i] = Q.get(i, k);
        }
        
        const r = col.dot(qk);
        R.set(k, j, r);
        
        for (let i = 0; i < this.rows; i++) {
          col.data[i] -= r * qk.data[i];
        }
      }
      
      // Normalize
      const norm = col.magnitude();
      R.set(j, j, norm);
      
      if (norm > EPSILON) {
        for (let i = 0; i < this.rows; i++) {
          Q.set(i, j, col.data[i] / norm);
        }
      }
    }
    
    return { Q, R };
  }

  choleskyDecomposition(): Matrix {
    if (this.rows !== this.cols) {
      throw new Error('Cholesky decomposition requires a square matrix');
    }
    if (!isPositiveDefinite(this)) {
      throw new Error('Matrix must be positive definite');
    }
    
    const n = this.rows;
    const L = Matrix.zeros(n, n);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L.get(i, k) * L.get(j, k);
        }
        
        if (i === j) {
          L.set(i, j, Math.sqrt(this.get(i, i) - sum));
        } else {
          L.set(i, j, (this.get(i, j) - sum) / L.get(j, j));
        }
      }
    }
    
    return L;
  }

  svd(): { U: Matrix; S: number[]; V: Matrix } {
    // Simple SVD using power iteration (for production, use more robust algorithm)
    const m = this.rows;
    const n = this.cols;
    const k = Math.min(m, n);
    
    const ATA = this.transpose().dot(this);
    const AAT = this.dot(this.transpose());
    
    const V = Matrix.zeros(n, k);
    const U = Matrix.zeros(m, k);
    const S: number[] = [];
    
    let A = this.clone();
    
    for (let i = 0; i < k; i++) {
      // Find eigenvector of A^T A
      const result = powerIteration(ATA, 100);
      const v = result.vector;
      
      // Compute singular value and u
      const Av = A.dot(v.toMatrix(true));
      let sigma = 0;
      for (let j = 0; j < m; j++) {
        sigma += Av.get(j, 0) * Av.get(j, 0);
      }
      sigma = Math.sqrt(sigma);
      S.push(sigma);
      
      // Store v
      for (let j = 0; j < n; j++) {
        V.set(j, i, v.data[j]);
      }
      
      // Compute and store u
      if (sigma > EPSILON) {
        for (let j = 0; j < m; j++) {
          U.set(j, i, Av.get(j, 0) / sigma);
        }
      }
      
      // Deflate A
      const uvT = U.slice(0, m, i, i + 1).dot(V.slice(0, n, i, i + 1).transpose());
      A = A.subtract(uvT.scale(sigma));
    }
    
    return { U, S, V };
  }

  eigenDecomposition(): { values: number[]; vectors: Matrix } {
    if (this.rows !== this.cols) {
      throw new Error('Eigendecomposition requires a square matrix');
    }
    
    return qrAlgorithm(this, 1000);
  }

  // Properties
  determinant(): number {
    if (this.rows !== this.cols) {
      throw new Error('Determinant requires a square matrix');
    }
    
    const { U, P } = this.luDecomposition();
    
    // Det(A) = Det(P) * Det(L) * Det(U)
    // Det(L) = 1 (unit diagonal)
    // Det(U) = product of diagonal
    let det = 1;
    for (let i = 0; i < this.rows; i++) {
      det *= U.get(i, i);
    }
    
    // Count permutations in P
    let swaps = 0;
    const perm = new Array(this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        if (Math.abs(P.get(i, j) - 1) < EPSILON) {
          perm[i] = j;
        }
      }
    }
    
    const visited = new Array(this.rows).fill(false);
    for (let i = 0; i < this.rows; i++) {
      if (!visited[i]) {
        let j = i;
        let cycleLength = 0;
        while (!visited[j]) {
          visited[j] = true;
          j = perm[j];
          cycleLength++;
        }
        swaps += cycleLength - 1;
      }
    }
    
    return swaps % 2 === 0 ? det : -det;
  }

  trace(): number {
    if (this.rows !== this.cols) {
      throw new Error('Trace requires a square matrix');
    }
    let sum = 0;
    for (let i = 0; i < this.rows; i++) {
      sum += this.get(i, i);
    }
    return sum;
  }

  rank(): number {
    const { S } = this.svd();
    const threshold = EPSILON * Math.max(this.rows, this.cols) * Math.max(...S);
    return S.filter(s => s > threshold).length;
  }

  norm(type: 'frobenius' | 'max' | '1' | 'inf' = 'frobenius'): number {
    switch (type) {
      case 'frobenius': {
        let sum = 0;
        for (let i = 0; i < this.data.length; i++) {
          sum += this.data[i] * this.data[i];
        }
        return Math.sqrt(sum);
      }
      case 'max': {
        let max = 0;
        for (let i = 0; i < this.data.length; i++) {
          max = Math.max(max, Math.abs(this.data[i]));
        }
        return max;
      }
      case '1': {
        let max = 0;
        for (let j = 0; j < this.cols; j++) {
          let sum = 0;
          for (let i = 0; i < this.rows; i++) {
            sum += Math.abs(this.get(i, j));
          }
          max = Math.max(max, sum);
        }
        return max;
      }
      case 'inf': {
        let max = 0;
        for (let i = 0; i < this.rows; i++) {
          let sum = 0;
          for (let j = 0; j < this.cols; j++) {
            sum += Math.abs(this.get(i, j));
          }
          max = Math.max(max, sum);
        }
        return max;
      }
    }
  }

  condition(): number {
    const { S } = this.svd();
    const max = Math.max(...S);
    const min = Math.min(...S.filter(s => s > EPSILON));
    return max / min;
  }

  // Statistics
  mean(axis?: 0 | 1): Matrix | number {
    if (axis === undefined) {
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        sum += this.data[i];
      }
      return sum / this.data.length;
    } else if (axis === 0) {
      const result = Matrix.zeros(1, this.cols);
      for (let j = 0; j < this.cols; j++) {
        let sum = 0;
        for (let i = 0; i < this.rows; i++) {
          sum += this.get(i, j);
        }
        result.set(0, j, sum / this.rows);
      }
      return result;
    } else {
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let sum = 0;
        for (let j = 0; j < this.cols; j++) {
          sum += this.get(i, j);
        }
        result.set(i, 0, sum / this.cols);
      }
      return result;
    }
  }

  variance(axis?: 0 | 1): Matrix | number {
    const mean = this.mean(axis);
    
    if (axis === undefined) {
      const m = mean as number;
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const diff = this.data[i] - m;
        sum += diff * diff;
      }
      return sum / this.data.length;
    } else if (axis === 0) {
      const m = mean as Matrix;
      const result = Matrix.zeros(1, this.cols);
      for (let j = 0; j < this.cols; j++) {
        let sum = 0;
        for (let i = 0; i < this.rows; i++) {
          const diff = this.get(i, j) - m.get(0, j);
          sum += diff * diff;
        }
        result.set(0, j, sum / this.rows);
      }
      return result;
    } else {
      const m = mean as Matrix;
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let sum = 0;
        for (let j = 0; j < this.cols; j++) {
          const diff = this.get(i, j) - m.get(i, 0);
          sum += diff * diff;
        }
        result.set(i, 0, sum / this.cols);
      }
      return result;
    }
  }

  std(axis?: 0 | 1): Matrix | number {
    const variance = this.variance(axis);
    if (typeof variance === 'number') {
      return Math.sqrt(variance);
    } else {
      return variance.map(v => Math.sqrt(v));
    }
  }

  sum(axis?: 0 | 1): Matrix | number {
    if (axis === undefined) {
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        sum += this.data[i];
      }
      return sum;
    } else if (axis === 0) {
      const result = Matrix.zeros(1, this.cols);
      for (let j = 0; j < this.cols; j++) {
        let sum = 0;
        for (let i = 0; i < this.rows; i++) {
          sum += this.get(i, j);
        }
        result.set(0, j, sum);
      }
      return result;
    } else {
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let sum = 0;
        for (let j = 0; j < this.cols; j++) {
          sum += this.get(i, j);
        }
        result.set(i, 0, sum);
      }
      return result;
    }
  }

  max(axis?: 0 | 1): Matrix | number {
    if (axis === undefined) {
      let max = -Infinity;
      for (let i = 0; i < this.data.length; i++) {
        max = Math.max(max, this.data[i]);
      }
      return max;
    } else if (axis === 0) {
      const result = Matrix.zeros(1, this.cols);
      for (let j = 0; j < this.cols; j++) {
        let max = -Infinity;
        for (let i = 0; i < this.rows; i++) {
          max = Math.max(max, this.get(i, j));
        }
        result.set(0, j, max);
      }
      return result;
    } else {
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let max = -Infinity;
        for (let j = 0; j < this.cols; j++) {
          max = Math.max(max, this.get(i, j));
        }
        result.set(i, 0, max);
      }
      return result;
    }
  }

  min(axis?: 0 | 1): Matrix | number {
    if (axis === undefined) {
      let min = Infinity;
      for (let i = 0; i < this.data.length; i++) {
        min = Math.min(min, this.data[i]);
      }
      return min;
    } else if (axis === 0) {
      const result = Matrix.zeros(1, this.cols);
      for (let j = 0; j < this.cols; j++) {
        let min = Infinity;
        for (let i = 0; i < this.rows; i++) {
          min = Math.min(min, this.get(i, j));
        }
        result.set(0, j, min);
      }
      return result;
    } else {
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let min = Infinity;
        for (let j = 0; j < this.cols; j++) {
          min = Math.min(min, this.get(i, j));
        }
        result.set(i, 0, min);
      }
      return result;
    }
  }

  // Utilities
  map(fn: (val: number, i: number, j: number) => number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, fn(this.get(i, j), i, j));
      }
    }
    return result;
  }

  clone(): Matrix {
    return new Matrix(this.rows, this.cols, this.data.slice());
  }

  apply(fn: (matrix: Matrix) => Matrix): Matrix {
    return fn(this);
  }

  slice(rowStart: number, rowEnd: number, colStart: number, colEnd: number): Matrix {
    const rows = rowEnd - rowStart;
    const cols = colEnd - colStart;
    const result = new Matrix(rows, cols);
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result.set(i, j, this.get(rowStart + i, colStart + j));
      }
    }
    return result;
  }

  concat(other: Matrix, axis: 0 | 1): Matrix {
    if (axis === 0) {
      if (this.cols !== other.cols) {
        throw new Error('Columns must match for vertical concatenation');
      }
      const result = new Matrix(this.rows + other.rows, this.cols);
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          result.set(i, j, this.get(i, j));
        }
      }
      for (let i = 0; i < other.rows; i++) {
        for (let j = 0; j < other.cols; j++) {
          result.set(this.rows + i, j, other.get(i, j));
        }
      }
      return result;
    } else {
      if (this.rows !== other.rows) {
        throw new Error('Rows must match for horizontal concatenation');
      }
      const result = new Matrix(this.rows, this.cols + other.cols);
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          result.set(i, j, this.get(i, j));
        }
      }
      for (let i = 0; i < other.rows; i++) {
        for (let j = 0; j < other.cols; j++) {
          result.set(i, this.cols + j, other.get(i, j));
        }
      }
      return result;
    }
  }

  toArray(): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < this.rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < this.cols; j++) {
        row.push(this.get(i, j));
      }
      result.push(row);
    }
    return result;
  }

  toString(): string {
    return this.toArray().map(row => row.join(', ')).join('\n');
  }
}

/**
 * Helper function to check if a matrix is positive definite
 */
function isPositiveDefinite(matrix: Matrix): boolean {
  if (matrix.rows !== matrix.cols) {
    return false;
  }
  
  try {
    // Try Cholesky decomposition - it will only succeed for positive definite matrices
    const n = matrix.rows;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          const val = matrix.get(i, k);
          sum += val * val;
        }
        
        if (i === j) {
          const diag = matrix.get(i, i) - sum;
          if (diag <= 0) {
            return false;
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Power iteration method for finding dominant eigenvector
 */
function powerIteration(matrix: Matrix, maxIterations = 100): { value: number; vector: Vector } {
  const n = matrix.rows;
  let v = Vector.random(n, -1, 1);
  v = v.normalize();
  
  let eigenvalue = 0;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Multiply matrix by vector
    const Av = new Vector(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += matrix.get(i, j) * v.data[j];
      }
      Av.data[i] = sum;
    }
    
    eigenvalue = Av.magnitude();
    
    if (eigenvalue < EPSILON) {
      break;
    }
    
    v = Av.scale(1 / eigenvalue);
  }
  
  return { value: eigenvalue, vector: v };
}

/**
 * QR algorithm for eigenvalue decomposition
 */
function qrAlgorithm(matrix: Matrix, maxIterations = 1000): { values: number[]; vectors: Matrix } {
  const n = matrix.rows;
  let A = matrix.clone();
  let V = Matrix.eye(n);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const { Q, R } = A.qrDecomposition();
    A = R.dot(Q);
    V = V.dot(Q);
    
    // Check for convergence (off-diagonal elements near zero)
    let offDiagSum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          offDiagSum += Math.abs(A.get(i, j));
        }
      }
    }
    
    if (offDiagSum < EPSILON * n * n) {
      break;
    }
  }
  
  const eigenvalues: number[] = [];
  for (let i = 0; i < n; i++) {
    eigenvalues.push(A.get(i, i));
  }
  
  return { values: eigenvalues, vectors: V };
}

/**
 * Solve linear system Ax = b using LU decomposition
 */
export function solve(A: Matrix, b: Vector): Vector {
  if (A.rows !== A.cols) {
    throw new Error('Matrix must be square');
  }
  if (A.rows !== b.length) {
    throw new Error('Matrix and vector dimensions must match');
  }
  
  const { L, U, P } = A.luDecomposition();
  
  // Apply permutation to b
  const Pb = new Vector(b.length);
  for (let i = 0; i < b.length; i++) {
    for (let k = 0; k < b.length; k++) {
      Pb.data[i] += P.get(i, k) * b.data[k];
    }
  }
  
  // Forward substitution: Ly = Pb
  const y = new Vector(b.length);
  for (let i = 0; i < b.length; i++) {
    let sum = Pb.data[i];
    for (let k = 0; k < i; k++) {
      sum -= L.get(i, k) * y.data[k];
    }
    y.data[i] = sum / L.get(i, i);
  }
  
  // Back substitution: Ux = y
  const x = new Vector(b.length);
  for (let i = b.length - 1; i >= 0; i--) {
    let sum = y.data[i];
    for (let k = i + 1; k < b.length; k++) {
      sum -= U.get(i, k) * x.data[k];
    }
    x.data[i] = sum / U.get(i, i);
  }
  
  return x;
}

/**
 * Matrix utilities
 */
export const MatrixUtils = {
  /**
   * Check if two matrices are approximately equal
   */
  equals(a: Matrix, b: Matrix, tolerance = EPSILON): boolean {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      return false;
    }
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        if (Math.abs(a.get(i, j) - b.get(i, j)) > tolerance) {
          return false;
        }
      }
    }
    return true;
  },

  /**
   * Check if matrix is symmetric
   */
  isSymmetric(matrix: Matrix, tolerance = EPSILON): boolean {
    if (matrix.rows !== matrix.cols) {
      return false;
    }
    for (let i = 0; i < matrix.rows; i++) {
      for (let j = i + 1; j < matrix.cols; j++) {
        if (Math.abs(matrix.get(i, j) - matrix.get(j, i)) > tolerance) {
          return false;
        }
      }
    }
    return true;
  },

  /**
   * Check if matrix is orthogonal
   */
  isOrthogonal(matrix: Matrix, tolerance = EPSILON): boolean {
    if (matrix.rows !== matrix.cols) {
      return false;
    }
    const product = matrix.transpose().dot(matrix);
    const identity = Matrix.eye(matrix.rows);
    return MatrixUtils.equals(product, identity, tolerance);
  }
};