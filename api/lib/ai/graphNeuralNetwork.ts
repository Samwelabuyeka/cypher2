/**
 * Graph Neural Network implementation for blockchain wallet analysis
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface GraphNode {
  id: string;
  features: number[];
  neighbors: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export interface WalletNode extends GraphNode {
  address: string;
  balance: number;
  txCount: number;
}

export interface TransactionEdge extends GraphEdge {
  amount: number;
  timestamp: number;
}

export interface TransactionData {
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  fee?: number;
}

export interface WalletData {
  address: string;
  balance: number;
  txCount: number;
  features?: number[];
}

export interface FraudPattern {
  walletId: string;
  suspicionScore: number;
  patterns: string[];
  relatedWallets: string[];
}

export interface WalletCluster {
  clusterId: number;
  wallets: string[];
  centralWallet: string;
  avgBalance: number;
  totalTransactions: number;
}

export interface TransactionPrediction {
  walletId: string;
  predictedOutflow: number;
  predictedInflow: number;
  confidence: number;
  timeframe: string;
}

// ============================================================================
// Matrix Operations Helper
// ============================================================================

class MatrixOps {
  static multiply(a: number[][], b: number[][]): number[][] {
    const rowsA = a.length;
    const colsA = a[0].length;
    const colsB = b[0].length;
    
    const result: number[][] = Array(rowsA).fill(0).map(() => Array(colsB).fill(0));
    
    for (let i = 0; i < rowsA; i++) {
      for (let j = 0; j < colsB; j++) {
        for (let k = 0; k < colsA; k++) {
          result[i][j] += a[i][k] * b[k][j];
        }
      }
    }
    
    return result;
  }

  static transpose(matrix: number[][]): number[][] {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  static add(a: number[][], b: number[][]): number[][] {
    return a.map((row, i) => row.map((val, j) => val + b[i][j]));
  }

  static scalar(matrix: number[][], scalar: number): number[][] {
    return matrix.map(row => row.map(val => val * scalar));
  }

  static softmax(values: number[]): number[] {
    const maxVal = Math.max(...values);
    const exps = values.map(v => Math.exp(v - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
  }

  static relu(x: number): number {
    return Math.max(0, x);
  }

  static leakyRelu(x: number, alpha = 0.2): number {
    return x > 0 ? x : alpha * x;
  }
}

// ============================================================================
// Graph Convolutional Layer
// ============================================================================

export class GraphConvolutionalLayer {
  private weights: number[][];
  private bias: number[];
  private inputDim: number;
  private outputDim: number;

  constructor(inputDim: number, outputDim: number) {
    this.inputDim = inputDim;
    this.outputDim = outputDim;
    
    // Xavier initialization
    const limit = Math.sqrt(6 / (inputDim + outputDim));
    this.weights = Array(inputDim).fill(0).map(() =>
      Array(outputDim).fill(0).map(() => (Math.random() * 2 - 1) * limit)
    );
    
    this.bias = Array(outputDim).fill(0);
  }

  forward(nodeFeatures: number[][], adjacencyMatrix: number[][]): number[][] {
    const numNodes = nodeFeatures.length;
    
    // Normalize adjacency matrix (D^-1/2 * A * D^-1/2)
    const normalizedAdj = this.normalizeAdjacency(adjacencyMatrix);
    
    // Aggregate neighbor features: A * X
    const aggregated = MatrixOps.multiply(normalizedAdj, nodeFeatures);
    
    // Transform: (A * X) * W
    const transformed = MatrixOps.multiply(aggregated, this.weights);
    
    // Add bias and apply activation
    return transformed.map(row =>
      row.map((val, i) => MatrixOps.relu(val + this.bias[i]))
    );
  }

  private normalizeAdjacency(adj: number[][]): number[][] {
    const n = adj.length;
    
    // Add self-loops
    const adjWithSelfLoops = adj.map((row, i) =>
      row.map((val, j) => i === j ? val + 1 : val)
    );
    
    // Calculate degree matrix
    const degrees = adjWithSelfLoops.map(row =>
      Math.sqrt(1 / row.reduce((sum, val) => sum + val, 0))
    );
    
    // D^-1/2 * A * D^-1/2
    return adjWithSelfLoops.map((row, i) =>
      row.map((val, j) => val * degrees[i] * degrees[j])
    );
  }

  getWeights(): number[][] {
    return this.weights;
  }

  setWeights(weights: number[][]): void {
    this.weights = weights;
  }
}

// ============================================================================
// Graph Attention Layer
// ============================================================================

export class GraphAttentionLayer {
  private weights: number[][][]; // Per head
  private attentionWeights: number[][]; // Per head
  private inputDim: number;
  private outputDim: number;
  private numHeads: number;

  constructor(inputDim: number, outputDim: number, numHeads: number) {
    this.inputDim = inputDim;
    this.outputDim = outputDim;
    this.numHeads = numHeads;
    
    const headDim = Math.floor(outputDim / numHeads);
    
    // Initialize weights for each attention head
    this.weights = Array(numHeads).fill(0).map(() => {
      const limit = Math.sqrt(6 / (inputDim + headDim));
      return Array(inputDim).fill(0).map(() =>
        Array(headDim).fill(0).map(() => (Math.random() * 2 - 1) * limit)
      );
    });
    
    // Attention mechanism weights
    this.attentionWeights = Array(numHeads).fill(0).map(() =>
      Array(headDim * 2).fill(0).map(() => Math.random() * 2 - 1)
    );
  }

  forward(nodeFeatures: number[][], adjacencyMatrix: number[][]): number[][] {
    const numNodes = nodeFeatures.length;
    const headOutputs: number[][][] = [];
    
    // Process each attention head
    for (let h = 0; h < this.numHeads; h++) {
      const headOutput = this.computeHeadAttention(
        nodeFeatures,
        adjacencyMatrix,
        h
      );
      headOutputs.push(headOutput);
    }
    
    // Concatenate or average head outputs
    return this.aggregateHeads(headOutputs);
  }

  private computeHeadAttention(
    nodeFeatures: number[][],
    adjacencyMatrix: number[][],
    headIndex: number
  ): number[][] {
    const numNodes = nodeFeatures.length;
    const headWeights = this.weights[headIndex];
    const attWeights = this.attentionWeights[headIndex];
    
    // Transform features: X * W
    const transformed = MatrixOps.multiply(nodeFeatures, headWeights);
    
    // Compute attention coefficients
    const attentionScores: number[][] = Array(numNodes).fill(0).map(() =>
      Array(numNodes).fill(0)
    );
    
    for (let i = 0; i < numNodes; i++) {
      for (let j = 0; j < numNodes; j++) {
        if (adjacencyMatrix[i][j] > 0 || i === j) {
          // Concatenate features and compute attention
          const concat = [...transformed[i], ...transformed[j]];
          const score = concat.reduce((sum, val, idx) =>
            sum + val * attWeights[idx], 0
          );
          attentionScores[i][j] = MatrixOps.leakyRelu(score);
        } else {
          attentionScores[i][j] = -Infinity;
        }
      }
    }
    
    // Apply softmax to get attention weights
    const attentionProbs = attentionScores.map(scores =>
      MatrixOps.softmax(scores)
    );
    
    // Aggregate neighbor features weighted by attention
    const output: number[][] = Array(numNodes).fill(0).map(() =>
      Array(transformed[0].length).fill(0)
    );
    
    for (let i = 0; i < numNodes; i++) {
      for (let j = 0; j < numNodes; j++) {
        const weight = attentionProbs[i][j];
        for (let k = 0; k < transformed[j].length; k++) {
          output[i][k] += weight * transformed[j][k];
        }
      }
    }
    
    return output.map(row => row.map(val => MatrixOps.relu(val)));
  }

  private aggregateHeads(headOutputs: number[][][]): number[][] {
    const numNodes = headOutputs[0].length;
    const totalDim = headOutputs.reduce((sum, head) => sum + head[0].length, 0);
    
    // Concatenate all head outputs
    const result: number[][] = Array(numNodes).fill(0).map(() =>
      Array(totalDim).fill(0)
    );
    
    for (let i = 0; i < numNodes; i++) {
      let offset = 0;
      for (const head of headOutputs) {
        for (let j = 0; j < head[i].length; j++) {
          result[i][offset + j] = head[i][j];
        }
        offset += head[i].length;
      }
    }
    
    return result;
  }
}

// ============================================================================
// Graph Pooling Functions
// ============================================================================

export function globalMeanPool(nodeFeatures: number[][]): number[] {
  const numNodes = nodeFeatures.length;
  const featureDim = nodeFeatures[0].length;
  
  const pooled = Array(featureDim).fill(0);
  
  for (let i = 0; i < numNodes; i++) {
    for (let j = 0; j < featureDim; j++) {
      pooled[j] += nodeFeatures[i][j];
    }
  }
  
  return pooled.map(val => val / numNodes);
}

export function globalMaxPool(nodeFeatures: number[][]): number[] {
  const featureDim = nodeFeatures[0].length;
  const pooled = Array(featureDim).fill(-Infinity);
  
  for (const features of nodeFeatures) {
    for (let j = 0; j < featureDim; j++) {
      pooled[j] = Math.max(pooled[j], features[j]);
    }
  }
  
  return pooled;
}

// ============================================================================
// PageRank
// ============================================================================

export function calculatePageRank(
  adjacencyMatrix: number[][],
  dampingFactor = 0.85,
  maxIterations = 100,
  tolerance = 1e-6
): number[] {
  const n = adjacencyMatrix.length;
  let ranks = Array(n).fill(1 / n);
  
  // Calculate out-degrees
  const outDegrees = adjacencyMatrix.map(row =>
    row.reduce((sum, val) => sum + val, 0)
  );
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const newRanks = Array(n).fill((1 - dampingFactor) / n);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (adjacencyMatrix[j][i] > 0 && outDegrees[j] > 0) {
          newRanks[i] += dampingFactor * ranks[j] / outDegrees[j];
        }
      }
    }
    
    // Check convergence
    const diff = newRanks.reduce((sum, val, i) =>
      sum + Math.abs(val - ranks[i]), 0
    );
    
    ranks = newRanks;
    
    if (diff < tolerance) break;
  }
  
  return ranks;
}

// ============================================================================
// Betweenness Centrality
// ============================================================================

export function calculateBetweennessCentrality(adjacencyMatrix: number[][]): number[] {
  const n = adjacencyMatrix.length;
  const centrality = Array(n).fill(0);
  
  // For each source node
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const predecessors: number[][] = Array(n).fill(0).map(() => []);
    const sigma = Array(n).fill(0);
    sigma[s] = 1;
    const distance = Array(n).fill(-1);
    distance[s] = 0;
    const queue = [s];
    
    // BFS
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      
      for (let w = 0; w < n; w++) {
        if (adjacencyMatrix[v][w] > 0) {
          // First time seeing w?
          if (distance[w] < 0) {
            queue.push(w);
            distance[w] = distance[v] + 1;
          }
          
          // Shortest path to w via v?
          if (distance[w] === distance[v] + 1) {
            sigma[w] += sigma[v];
            predecessors[w].push(v);
          }
        }
      }
    }
    
    // Back-propagation
    const delta = Array(n).fill(0);
    
    while (stack.length > 0) {
      const w = stack.pop()!;
      
      for (const v of predecessors[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      
      if (w !== s) {
        centrality[w] += delta[w];
      }
    }
  }
  
  // Normalize
  if (n > 2) {
    const normFactor = 2 / ((n - 1) * (n - 2));
    return centrality.map(val => val * normFactor);
  }
  
  return centrality;
}

// ============================================================================
// Louvain Community Detection
// ============================================================================

export function louvainCommunityDetection(adjacencyMatrix: number[][]): number[] {
  const n = adjacencyMatrix.length;
  let communities = Array.from({ length: n }, (_, i) => i);
  
  // Calculate total edge weight
  const m = adjacencyMatrix.reduce((sum, row) =>
    sum + row.reduce((s, val) => s + val, 0), 0
  ) / 2;
  
  if (m === 0) return communities;
  
  let improved = true;
  let iteration = 0;
  const maxIterations = 100;
  
  while (improved && iteration < maxIterations) {
    improved = false;
    iteration++;
    
    for (let i = 0; i < n; i++) {
      const currentCommunity = communities[i];
      let bestCommunity = currentCommunity;
      let bestGain = 0;
      
      // Get neighboring communities
      const neighborCommunities = new Set<number>();
      for (let j = 0; j < n; j++) {
        if (adjacencyMatrix[i][j] > 0) {
          neighborCommunities.add(communities[j]);
        }
      }
      
      // Try moving to each neighbor community
      for (const targetCommunity of neighborCommunities) {
        if (targetCommunity === currentCommunity) continue;
        
        const gain = calculateModularityGain(
          i,
          currentCommunity,
          targetCommunity,
          communities,
          adjacencyMatrix,
          m
        );
        
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = targetCommunity;
        }
      }
      
      if (bestCommunity !== currentCommunity) {
        communities[i] = bestCommunity;
        improved = true;
      }
    }
  }
  
  // Renumber communities to be consecutive
  const uniqueCommunities = [...new Set(communities)];
  const communityMap = new Map(uniqueCommunities.map((c, i) => [c, i]));
  
  return communities.map(c => communityMap.get(c)!);
}

function calculateModularityGain(
  node: number,
  fromCommunity: number,
  toCommunity: number,
  communities: number[],
  adjacencyMatrix: number[][],
  m: number
): number {
  const n = adjacencyMatrix.length;
  
  // Calculate edges to/from communities
  let edgesToFrom = 0;
  let edgesToTo = 0;
  let nodeDegree = 0;
  
  for (let j = 0; j < n; j++) {
    const weight = adjacencyMatrix[node][j];
    nodeDegree += weight;
    
    if (communities[j] === fromCommunity) {
      edgesToFrom += weight;
    }
    if (communities[j] === toCommunity) {
      edgesToTo += weight;
    }
  }
  
  // Calculate community degrees
  let fromDegree = 0;
  let toDegree = 0;
  
  for (let i = 0; i < n; i++) {
    if (communities[i] === fromCommunity) {
      for (let j = 0; j < n; j++) {
        fromDegree += adjacencyMatrix[i][j];
      }
    }
    if (communities[i] === toCommunity) {
      for (let j = 0; j < n; j++) {
        toDegree += adjacencyMatrix[i][j];
      }
    }
  }
  
  const gain = 
    (edgesToTo - edgesToFrom) / m -
    nodeDegree * (toDegree - fromDegree + nodeDegree) / (2 * m * m);
  
  return gain;
}

// ============================================================================
// Export Aliases for Naming Consistency
// ============================================================================

export { GraphConvolutionalLayer as GraphConvolutionalNetwork };
export { GraphAttentionLayer as GraphAttentionNetwork };

// ============================================================================
// Wallet Graph Analyzer / Graph Neural Network
// ============================================================================

export class WalletGraphAnalyzer {
  private graph: Graph;
  private gclLayer1: GraphConvolutionalLayer;
  private gclLayer2: GraphConvolutionalLayer;
  private gatLayer: GraphAttentionLayer;

  constructor() {
    this.graph = { nodes: new Map(), edges: [] };
    this.gclLayer1 = new GraphConvolutionalLayer(10, 32);
    this.gclLayer2 = new GraphConvolutionalLayer(32, 16);
    this.gatLayer = new GraphAttentionLayer(16, 16, 4);
  }

  buildGraphFromTransactions(
    wallets: WalletData[],
    transactions: TransactionData[]
  ): Graph {
    const nodes = new Map<string, WalletNode>();
    
    // Create nodes from wallets
    for (const wallet of wallets) {
      const features = wallet.features || this.extractWalletFeatures(wallet, transactions);
      
      nodes.set(wallet.address, {
        id: wallet.address,
        address: wallet.address,
        balance: wallet.balance,
        txCount: wallet.txCount,
        features,
        neighbors: []
      });
    }
    
    // Create edges from transactions
    const edges: TransactionEdge[] = [];
    
    for (const tx of transactions) {
      const fromNode = nodes.get(tx.from);
      const toNode = nodes.get(tx.to);
      
      if (fromNode && toNode) {
        if (!fromNode.neighbors.includes(tx.to)) {
          fromNode.neighbors.push(tx.to);
        }
        if (!toNode.neighbors.includes(tx.from)) {
          toNode.neighbors.push(tx.from);
        }
        
        edges.push({
          source: tx.from,
          target: tx.to,
          weight: tx.amount,
          amount: tx.amount,
          timestamp: tx.timestamp
        });
      }
    }
    
    this.graph = { nodes, edges };
    return this.graph;
  }

  private extractWalletFeatures(wallet: WalletData, transactions: TransactionData[]): number[] {
    const walletTxs = transactions.filter(tx =>
      tx.from === wallet.address || tx.to === wallet.address
    );
    
    const incomingTxs = walletTxs.filter(tx => tx.to === wallet.address);
    const outgoingTxs = walletTxs.filter(tx => tx.from === wallet.address);
    
    const totalIncoming = incomingTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const totalOutgoing = outgoingTxs.reduce((sum, tx) => sum + tx.amount, 0);
    
    return [
      wallet.balance / 1000000, // Normalized balance
      wallet.txCount / 100, // Normalized tx count
      incomingTxs.length / 50,
      outgoingTxs.length / 50,
      totalIncoming / 1000000,
      totalOutgoing / 1000000,
      incomingTxs.length > 0 ? totalIncoming / incomingTxs.length / 10000 : 0,
      outgoingTxs.length > 0 ? totalOutgoing / outgoingTxs.length / 10000 : 0,
      (totalIncoming - totalOutgoing) / 1000000,
      walletTxs.length > 0 ? this.calculateTransactionVariance(walletTxs) : 0
    ];
  }

  private calculateTransactionVariance(transactions: TransactionData[]): number {
    if (transactions.length < 2) return 0;
    
    const amounts = transactions.map(tx => tx.amount);
    const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    
    return Math.sqrt(variance) / 10000; // Normalized
  }

  detectFraudPatterns(): FraudPattern[] {
    const patterns: FraudPattern[] = [];
    const embeddings = this.calculateNodeEmbeddings();
    
    for (const [nodeId, node] of this.graph.nodes) {
      const suspicionScore = this.calculateSuspicionScore(
        nodeId,
        node as WalletNode,
        embeddings.get(nodeId) || []
      );
      
      if (suspicionScore > 0.7) {
        const detectedPatterns = this.identifyPatternTypes(node as WalletNode);
        const relatedWallets = this.findRelatedSuspiciousWallets(nodeId, suspicionScore);
        
        patterns.push({
          walletId: nodeId,
          suspicionScore,
          patterns: detectedPatterns,
          relatedWallets
        });
      }
    }
    
    return patterns.sort((a, b) => b.suspicionScore - a.suspicionScore);
  }

  private calculateSuspicionScore(
    nodeId: string,
    node: WalletNode,
    embedding: number[]
  ): number {
    let score = 0;
    
    // High transaction count with low average
    const avgTx = node.balance / Math.max(node.txCount, 1);
    if (node.txCount > 100 && avgTx < 100) score += 0.3;
    
    // Rapid fund movement pattern
    const nodeEdges = this.graph.edges.filter(e =>
      e.source === nodeId || e.target === nodeId
    );
    if (nodeEdges.length > 50) score += 0.2;
    
    // Clustering with known suspicious wallets
    const centrality = this.calculateLocalCentrality(nodeId);
    if (centrality > 0.8) score += 0.2;
    
    // Unusual embedding patterns
    if (embedding.length > 0) {
      const embeddingNorm = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      if (embeddingNorm > 10) score += 0.3;
    }
    
    return Math.min(score, 1.0);
  }

  private calculateLocalCentrality(nodeId: string): number {
    const neighbors = this.graph.nodes.get(nodeId)?.neighbors || [];
    if (neighbors.length === 0) return 0;
    
    const neighborDegrees = neighbors.map(n =>
      this.graph.nodes.get(n)?.neighbors.length || 0
    );
    
    const avgNeighborDegree = neighborDegrees.reduce((sum, d) => sum + d, 0) / neighbors.length;
    return Math.min(avgNeighborDegree / 100, 1.0);
  }

  private identifyPatternTypes(node: WalletNode): string[] {
    const patterns: string[] = [];
    
    if (node.txCount > 100) patterns.push("high-frequency");
    if (node.balance / Math.max(node.txCount, 1) < 100) patterns.push("micro-transactions");
    if (node.neighbors.length > 50) patterns.push("hub-wallet");
    
    const recentEdges = this.graph.edges.filter(e =>
      (e.source === node.id || e.target === node.id) &&
      Date.now() - (e as TransactionEdge).timestamp < 86400000
    );
    
    if (recentEdges.length > 20) patterns.push("rapid-movement");
    
    return patterns;
  }

  private findRelatedSuspiciousWallets(nodeId: string, threshold: number): string[] {
    const related: string[] = [];
    const neighbors = this.graph.nodes.get(nodeId)?.neighbors || [];
    
    for (const neighborId of neighbors) {
      const neighbor = this.graph.nodes.get(neighborId);
      if (!neighbor) continue;
      
      const score = this.calculateSuspicionScore(neighborId, neighbor as WalletNode, []);
      if (score > threshold * 0.7) {
        related.push(neighborId);
      }
    }
    
    return related;
  }

  identifyWalletClusters(): WalletCluster[] {
    const adjacencyMatrix = this.buildAdjacencyMatrix();
    const communityLabels = louvainCommunityDetection(adjacencyMatrix);
    
    const clusters = new Map<number, WalletCluster>();
    const nodeIds = Array.from(this.graph.nodes.keys());
    
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      const node = this.graph.nodes.get(nodeId) as WalletNode;
      const communityId = communityLabels[i];
      
      if (!clusters.has(communityId)) {
        clusters.set(communityId, {
          clusterId: communityId,
          wallets: [],
          centralWallet: nodeId,
          avgBalance: 0,
          totalTransactions: 0
        });
      }
      
      const cluster = clusters.get(communityId)!;
      cluster.wallets.push(nodeId);
      cluster.avgBalance += node.balance;
      cluster.totalTransactions += node.txCount;
    }
    
    // Finalize clusters
    for (const cluster of clusters.values()) {
      cluster.avgBalance /= cluster.wallets.length;
      
      // Find central wallet (highest degree)
      let maxDegree = 0;
      for (const walletId of cluster.wallets) {
        const degree = this.graph.nodes.get(walletId)?.neighbors.length || 0;
        if (degree > maxDegree) {
          maxDegree = degree;
          cluster.centralWallet = walletId;
        }
      }
    }
    
    return Array.from(clusters.values());
  }

  private buildAdjacencyMatrix(): number[][] {
    const nodeIds = Array.from(this.graph.nodes.keys());
    const n = nodeIds.length;
    const nodeIndexMap = new Map(nodeIds.map((id, i) => [id, i]));
    
    // Initialize matrix with zeros
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    // Fill in edge weights
    for (const edge of this.graph.edges) {
      const sourceIdx = nodeIndexMap.get(edge.source);
      const targetIdx = nodeIndexMap.get(edge.target);
      
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        matrix[sourceIdx][targetIdx] = edge.weight;
        matrix[targetIdx][sourceIdx] = edge.weight; // Undirected graph
      }
    }
    
    return matrix;
  }

  private calculateNodeEmbeddings(): Map<string, number[]> {
    const nodeIds = Array.from(this.graph.nodes.keys());
    const n = nodeIds.length;
    
    if (n === 0) return new Map();
    
    // Build adjacency matrix
    const adjacencyMatrix = this.buildAdjacencyMatrix();
    
    // Build node features matrix
    const nodeFeatures: number[][] = nodeIds.map(id => {
      const node = this.graph.nodes.get(id)!;
      return node.features;
    });
    
    // Pass through GCN layers
    const layer1Output = this.gclLayer1.forward(nodeFeatures, adjacencyMatrix);
    const layer2Output = this.gclLayer2.forward(layer1Output, adjacencyMatrix);
    
    // Pass through GAT layer
    const embeddings = this.gatLayer.forward(layer2Output, adjacencyMatrix);
    
    // Map embeddings back to node IDs
    const embeddingMap = new Map<string, number[]>();
    nodeIds.forEach((id, i) => {
      embeddingMap.set(id, embeddings[i]);
    });
    
    return embeddingMap;
  }

  predictTransactionBehavior(walletId: string, timeframeHours = 24): TransactionPrediction {
    const embeddings = this.calculateNodeEmbeddings();
    const embedding = embeddings.get(walletId);
    
    if (!embedding) {
      return {
        walletId,
        predictedOutflow: 0,
        predictedInflow: 0,
        confidence: 0,
        timeframe: `${timeframeHours}h`
      };
    }
    
    const node = this.graph.nodes.get(walletId) as WalletNode;
    if (!node) {
      return {
        walletId,
        predictedOutflow: 0,
        predictedInflow: 0,
        confidence: 0,
        timeframe: `${timeframeHours}h`
      };
    }
    
    // Get historical transaction patterns
    const relatedEdges = this.graph.edges.filter(e =>
      e.source === walletId || e.target === walletId
    ) as TransactionEdge[];
    
    if (relatedEdges.length === 0) {
      return {
        walletId,
        predictedOutflow: 0,
        predictedInflow: 0,
        confidence: 0.1,
        timeframe: `${timeframeHours}h`
      };
    }
    
    // Calculate historical averages
    const recentEdges = relatedEdges.filter(e =>
      Date.now() - e.timestamp < timeframeHours * 3600000
    );
    
    const outflows = recentEdges.filter(e => e.source === walletId);
    const inflows = recentEdges.filter(e => e.target === walletId);
    
    const avgOutflow = outflows.length > 0
      ? outflows.reduce((sum, e) => sum + e.amount, 0) / outflows.length
      : 0;
    
    const avgInflow = inflows.length > 0
      ? inflows.reduce((sum, e) => sum + e.amount, 0) / inflows.length
      : 0;
    
    // Use embedding to adjust predictions
    const embeddingMagnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    
    const activityFactor = Math.min(embeddingMagnitude / 10, 2);
    
    const predictedOutflow = avgOutflow * activityFactor;
    const predictedInflow = avgInflow * activityFactor;
    
    // Calculate confidence based on data availability
    const confidence = Math.min(
      0.5 + (recentEdges.length / 100) * 0.5,
      0.95
    );
    
    return {
      walletId,
      predictedOutflow,
      predictedInflow,
      confidence,
      timeframe: `${timeframeHours}h`
    };
  }
}

// Export WalletGraphAnalyzer as GraphNeuralNetwork for consistency
export { WalletGraphAnalyzer as GraphNeuralNetwork };