// Types and Interfaces
export interface PredictionModel {
  train(data: Dataset): void;
  predict(input: number[]): number;
  clone(): PredictionModel;
}

export interface Dataset {
  inputs: number[][];
  targets: number[];
}

export interface BoostingConfig {
  n_estimators: number;
  learning_rate: number;
  max_depth: number;
  min_samples_split: number;
}

export interface ForestConfig {
  n_trees: number;
  max_features: number | string;
  max_depth: number;
  min_samples_split: number;
}

export interface ParameterGrid {
  [key: string]: any[];
}

export interface GridSearchResult {
  params: any;
  score: number;
}

export interface TreeNode {
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
}

// Utility Functions

export function bootstrapSample<T>(data: T[], size?: number): T[] {
  const sampleSize = size || data.length;
  const sample: T[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(Math.random() * data.length);
    sample.push(data[idx]);
  }
  return sample;
}

export function calculateModelEvidence(
  predictions: number[],
  targets: number[],
  complexity: number
): number {
  if (predictions.length !== targets.length) {
    throw new Error("Predictions and targets must have same length");
  }

  // Calculate log likelihood
  const n = predictions.length;
  let sumSquaredError = 0;
  for (let i = 0; i < n; i++) {
    const error = predictions[i] - targets[i];
    sumSquaredError += error * error;
  }
  
  const mse = sumSquaredError / n;
  const variance = mse || 1e-10; // Avoid division by zero
  
  // Log likelihood assuming Gaussian errors
  const logLikelihood = -0.5 * n * Math.log(2 * Math.PI * variance) - sumSquaredError / (2 * variance);
  
  // Bayesian Information Criterion (BIC) as approximation to log evidence
  // BIC = log(n) * k - 2 * log(L)
  const bic = Math.log(n) * complexity - 2 * logLikelihood;
  
  // Convert to evidence (lower BIC is better, so negate)
  return -bic;
}

export function crossValidate(
  model: PredictionModel,
  data: Dataset,
  nFolds: number
): { meanScore: number; stdScore: number; foldScores: number[] } {
  const foldScores: number[] = [];
  const foldSize = Math.floor(data.inputs.length / nFolds);
  
  for (let fold = 0; fold < nFolds; fold++) {
    // Split data
    const valStart = fold * foldSize;
    const valEnd = fold === nFolds - 1 ? data.inputs.length : (fold + 1) * foldSize;
    
    const trainInputs: number[][] = [];
    const trainTargets: number[] = [];
    const valInputs: number[][] = [];
    const valTargets: number[] = [];
    
    for (let i = 0; i < data.inputs.length; i++) {
      if (i >= valStart && i < valEnd) {
        valInputs.push(data.inputs[i]);
        valTargets.push(data.targets[i]);
      } else {
        trainInputs.push(data.inputs[i]);
        trainTargets.push(data.targets[i]);
      }
    }
    
    // Train and evaluate
    const foldModel = model.clone();
    foldModel.train({ inputs: trainInputs, targets: trainTargets });
    
    let sumSquaredError = 0;
    for (let i = 0; i < valInputs.length; i++) {
      const pred = foldModel.predict(valInputs[i]);
      const error = pred - valTargets[i];
      sumSquaredError += error * error;
    }
    
    const mse = sumSquaredError / valInputs.length;
    const rmse = Math.sqrt(mse);
    foldScores.push(-rmse); // Negative RMSE as score (higher is better)
  }
  
  const meanScore = foldScores.reduce((a, b) => a + b, 0) / foldScores.length;
  const variance = foldScores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) / foldScores.length;
  const stdScore = Math.sqrt(variance);
  
  return { meanScore, stdScore, foldScores };
}

export function gridSearch(
  modelFactory: (params: any) => PredictionModel,
  paramGrid: ParameterGrid,
  data: Dataset,
  metric: string = "rmse"
): { bestParams: any; bestScore: number; results: GridSearchResult[] } {
  const paramKeys = Object.keys(paramGrid);
  const results: GridSearchResult[] = [];
  
  function generateParamCombinations(keys: string[], index: number, currentParams: any): void {
    if (index === keys.length) {
      const model = modelFactory(currentParams);
      const cvResult = crossValidate(model, data, 5);
      const score = cvResult.meanScore;
      results.push({ params: { ...currentParams }, score });
      return;
    }
    
    const key = keys[index];
    const values = paramGrid[key];
    for (const value of values) {
      currentParams[key] = value;
      generateParamCombinations(keys, index + 1, currentParams);
    }
  }
  
  generateParamCombinations(paramKeys, 0, {});
  
  // Find best parameters
  let bestScore = -Infinity;
  let bestParams = {};
  for (const result of results) {
    if (result.score > bestScore) {
      bestScore = result.score;
      bestParams = result.params;
    }
  }
  
  return { bestParams, bestScore, results };
}

// Decision Tree Regressor

export class DecisionTreeRegressor implements PredictionModel {
  private maxDepth: number;
  private minSamplesSplit: number;
  private tree: TreeNode | null = null;
  
  constructor(maxDepth: number = 10, minSamplesSplit: number = 2) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
  }
  
  train(data: Dataset): void {
    this.tree = this.buildTree(data.inputs, data.targets, 0);
  }
  
  private buildTree(X: number[][], y: number[], depth: number): TreeNode {
    const n = y.length;
    
    // Stopping criteria
    if (n < this.minSamplesSplit || depth >= this.maxDepth || this.isHomogeneous(y)) {
      return { value: this.mean(y) };
    }
    
    // Find best split
    const bestSplit = this.findBestSplit(X, y);
    
    if (!bestSplit || bestSplit.gain <= 0) {
      return { value: this.mean(y) };
    }
    
    // Split data
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];
    
    for (let i = 0; i < X.length; i++) {
      if (X[i][bestSplit.feature] <= bestSplit.threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }
    
    const leftX = leftIndices.map(i => X[i]);
    const leftY = leftIndices.map(i => y[i]);
    const rightX = rightIndices.map(i => X[i]);
    const rightY = rightIndices.map(i => y[i]);
    
    return {
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      left: this.buildTree(leftX, leftY, depth + 1),
      right: this.buildTree(rightX, rightY, depth + 1)
    };
  }
  
  private findBestSplit(X: number[][], y: number[]): { feature: number; threshold: number; gain: number } | null {
    const nFeatures = X[0].length;
    let bestGain = -Infinity;
    let bestFeature = 0;
    let bestThreshold = 0;
    
    const parentVariance = this.variance(y);
    
    for (let feature = 0; feature < nFeatures; feature++) {
      const values = X.map(x => x[feature]);
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
      
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
        
        const leftY: number[] = [];
        const rightY: number[] = [];
        
        for (let j = 0; j < X.length; j++) {
          if (X[j][feature] <= threshold) {
            leftY.push(y[j]);
          } else {
            rightY.push(y[j]);
          }
        }
        
        if (leftY.length === 0 || rightY.length === 0) continue;
        
        const leftVariance = this.variance(leftY);
        const rightVariance = this.variance(rightY);
        const weightedVariance = (leftY.length * leftVariance + rightY.length * rightVariance) / y.length;
        const gain = parentVariance - weightedVariance;
        
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = feature;
          bestThreshold = threshold;
        }
      }
    }
    
    return bestGain > 0 ? { feature: bestFeature, threshold: bestThreshold, gain: bestGain } : null;
  }
  
  predict(input: number[]): number {
    if (!this.tree) {
      throw new Error("Model not trained");
    }
    return this.predictNode(this.tree, input);
  }
  
  private predictNode(node: TreeNode, input: number[]): number {
    if (node.value !== undefined) {
      return node.value;
    }
    
    if (input[node.feature!] <= node.threshold!) {
      return this.predictNode(node.left!, input);
    } else {
      return this.predictNode(node.right!, input);
    }
  }
  
  prune(alpha: number): void {
    if (!this.tree) return;
    this.tree = this.pruneNode(this.tree, alpha);
  }
  
  private pruneNode(node: TreeNode, alpha: number): TreeNode {
    if (node.value !== undefined) {
      return node;
    }
    
    node.left = this.pruneNode(node.left!, alpha);
    node.right = this.pruneNode(node.right!, alpha);
    
    // Cost-complexity pruning: prune if gain is less than alpha
    // Simplified version - just convert to leaf if both children are leaves
    if (node.left!.value !== undefined && node.right!.value !== undefined) {
      const leafValue = (node.left!.value + node.right!.value) / 2;
      return { value: leafValue };
    }
    
    return node;
  }
  
  getTree(): TreeNode {
    if (!this.tree) {
      throw new Error("Model not trained");
    }
    return this.tree;
  }
  
  clone(): PredictionModel {
    return new DecisionTreeRegressor(this.maxDepth, this.minSamplesSplit);
  }
  
  private mean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  private variance(values: number[]): number {
    const m = this.mean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;
  }
  
  private isHomogeneous(values: number[]): boolean {
    if (values.length === 0) return true;
    const first = values[0];
    return values.every(v => Math.abs(v - first) < 1e-10);
  }
}

// Base Ensemble Model

export class EnsembleModel implements PredictionModel {
  protected models: PredictionModel[] = [];
  
  constructor(models: PredictionModel[] = []) {
    this.models = models;
  }
  
  addModel(model: PredictionModel): void {
    this.models.push(model);
  }
  
  train(data: Dataset): void {
    for (const model of this.models) {
      model.train(data);
    }
  }
  
  predict(input: number[]): number {
    if (this.models.length === 0) {
      throw new Error("No models in ensemble");
    }
    
    const predictions = this.models.map(model => model.predict(input));
    return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
  }
  
  clone(): PredictionModel {
    return new EnsembleModel(this.models.map(m => m.clone()));
  }
}

// Weighted Ensemble

export class WeightedEnsemble implements PredictionModel {
  private models: Array<{ model: PredictionModel; weight: number }> = [];
  
  constructor() {}
  
  addModel(model: PredictionModel, weight: number = 1.0): void {
    this.models.push({ model, weight });
  }
  
  optimizeWeights(validationData: Dataset): void {
    if (this.models.length === 0) {
      throw new Error("No models added to ensemble");
    }
    
    // Initialize weights uniformly
    let weights = this.models.map(() => 1.0 / this.models.length);
    
    // Gradient descent to optimize weights
    const learningRate = 0.01;
    const iterations = 1000;
    const epsilon = 1e-8;
    
    for (let iter = 0; iter < iterations; iter++) {
      const gradients = new Array(this.models.length).fill(0);
      let totalLoss = 0;
      
      for (let i = 0; i < validationData.inputs.length; i++) {
        const predictions = this.models.map(m => m.model.predict(validationData.inputs[i]));
        const weightedPred = predictions.reduce((sum, pred, j) => sum + pred * weights[j], 0);
        const error = weightedPred - validationData.targets[i];
        
        totalLoss += error * error;
        
        // Calculate gradients
        for (let j = 0; j < this.models.length; j++) {
          gradients[j] += 2 * error * predictions[j];
        }
      }
      
      // Update weights
      const n = validationData.inputs.length;
      for (let j = 0; j < this.models.length; j++) {
        weights[j] -= learningRate * gradients[j] / n;
      }
      
      // Project weights to simplex (sum to 1, all positive)
      weights = this.projectToSimplex(weights);
      
      // Early stopping
      if (Math.sqrt(totalLoss / n) < epsilon) {
        break;
      }
    }
    
    // Update model weights
    for (let i = 0; i < this.models.length; i++) {
      this.models[i].weight = weights[i];
    }
  }
  
  private projectToSimplex(weights: number[]): number[] {
    // Project to positive orthant
    weights = weights.map(w => Math.max(0, w));
    
    // Normalize to sum to 1
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      weights = weights.map(w => w / sum);
    } else {
      weights = weights.map(() => 1.0 / weights.length);
    }
    
    return weights;
  }
  
  predict(input: number[]): number {
    if (this.models.length === 0) {
      throw new Error("No models in ensemble");
    }
    
    let weightedSum = 0;
    for (const { model, weight } of this.models) {
      weightedSum += model.predict(input) * weight;
    }
    
    return weightedSum;
  }
  
  predictWithUncertainty(input: number[]): { prediction: number; uncertainty: number } {
    if (this.models.length === 0) {
      throw new Error("No models in ensemble");
    }
    
    const predictions = this.models.map(m => m.model.predict(input));
    const prediction = this.predict(input);
    
    // Calculate variance across models
    const variance = predictions.reduce((sum, pred) => {
      return sum + Math.pow(pred - prediction, 2);
    }, 0) / predictions.length;
    
    const uncertainty = Math.sqrt(variance);
    
    return { prediction, uncertainty };
  }
  
  train(data: Dataset): void {
    // Train all models
    for (const { model } of this.models) {
      model.train(data);
    }
  }
  
  clone(): PredictionModel {
    const ensemble = new WeightedEnsemble();
    for (const { model, weight } of this.models) {
      ensemble.addModel(model.clone(), weight);
    }
    return ensemble;
  }
}

// Stacking Ensemble

export class StackingEnsemble implements PredictionModel {
  private baseModels: PredictionModel[];
  private metaLearner: PredictionModel;
  private trained: boolean = false;
  
  constructor(baseModels: PredictionModel[], metaLearner: PredictionModel) {
    this.baseModels = baseModels;
    this.metaLearner = metaLearner;
  }
  
  train(data: Dataset): void {
    // Split data for training base models and meta-learner
    const splitPoint = Math.floor(data.inputs.length * 0.7);
    const trainInputs = data.inputs.slice(0, splitPoint);
    const trainTargets = data.targets.slice(0, splitPoint);
    const valInputs = data.inputs.slice(splitPoint);
    const valTargets = data.targets.slice(splitPoint);
    
    // Train base models on training data
    for (const model of this.baseModels) {
      model.train({ inputs: trainInputs, targets: trainTargets });
    }
    
    // Generate meta-features from validation data
    const metaInputs: number[][] = [];
    const metaTargets: number[] = [];
    
    for (let i = 0; i < valInputs.length; i++) {
      const basePredictions = this.baseModels.map(model => model.predict(valInputs[i]));
      metaInputs.push(basePredictions);
      metaTargets.push(valTargets[i]);
    }
    
    // Train meta-learner
    this.metaLearner.train({ inputs: metaInputs, targets: metaTargets });
    this.trained = true;
  }
  
  predict(input: number[]): number {
    if (!this.trained) {
      throw new Error("Model not trained");
    }
    
    const basePredictions = this.baseModels.map(model => model.predict(input));
    return this.metaLearner.predict(basePredictions);
  }
  
  clone(): PredictionModel {
    const clonedBase = this.baseModels.map(m => m.clone());
    return new StackingEnsemble(clonedBase, this.metaLearner.clone());
  }
}

// Gradient Boosting Regressor

export class GradientBoostingRegressor implements PredictionModel {
  private config: BoostingConfig;
  private trees: DecisionTreeRegressor[] = [];
  private initialPrediction: number = 0;
  
  constructor(config: BoostingConfig) {
    this.config = config;
  }
  
  private fit(X: number[][], y: number[]): void {
    // Initialize with mean
    this.initialPrediction = y.reduce((sum, val) => sum + val, 0) / y.length;
    
    let residuals = y.map(val => val - this.initialPrediction);
    
    this.trees = [];
    
    for (let i = 0; i < this.config.n_estimators; i++) {
      // Fit tree to residuals
      const tree = new DecisionTreeRegressor(this.config.max_depth, this.config.min_samples_split);
      tree.train({ inputs: X, targets: residuals });
      this.trees.push(tree);
      
      // Update residuals
      const newResiduals: number[] = [];
      for (let j = 0; j < X.length; j++) {
        const prediction = tree.predict(X[j]);
        newResiduals[j] = residuals[j] - this.config.learning_rate * prediction;
      }
      residuals = newResiduals;
    }
  }
  
  predictBatch(X: number[][]): number[] {
    if (this.trees.length === 0) {
      throw new Error("Model not trained");
    }
    
    const predictions: number[] = [];
    
    for (const x of X) {
      let pred = this.initialPrediction;
      for (const tree of this.trees) {
        pred += this.config.learning_rate * tree.predict(x);
      }
      predictions.push(pred);
    }
    
    return predictions;
  }
  
  predict(input: number[]): number {
    if (this.trees.length === 0) {
      throw new Error("Model not trained");
    }
    
    let pred = this.initialPrediction;
    for (const tree of this.trees) {
      pred += this.config.learning_rate * tree.predict(input);
    }
    
    return pred;
  }
  
  getFeatureImportance(): number[] {
    // Simplified feature importance based on how often features are used
    if (this.trees.length === 0) {
      throw new Error("Model not trained");
    }
    
    const importance: number[] = [];
    
    for (const tree of this.trees) {
      this.aggregateFeatureImportance(tree.getTree(), importance);
    }
    
    // Normalize
    const total = importance.reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      return importance.map(val => val / total);
    }
    
    return importance;
  }
  
  private aggregateFeatureImportance(node: TreeNode, importance: number[]): void {
    if (node.feature !== undefined) {
      importance[node.feature] = (importance[node.feature] || 0) + 1;
      if (node.left) this.aggregateFeatureImportance(node.left, importance);
      if (node.right) this.aggregateFeatureImportance(node.right, importance);
    }
  }
  
  train(data: Dataset): void {
    this.fit(data.inputs, data.targets);
  }
  
  clone(): PredictionModel {
    return new GradientBoostingRegressor(this.config);
  }
}

// Bagging Regressor

export class BaggingRegressor implements PredictionModel {
  private baseModel: PredictionModel;
  private n_estimators: number;
  private models: PredictionModel[] = [];
  private oobIndices: Set<number>[] = [];
  
  constructor(baseModel: PredictionModel, n_estimators: number) {
    this.baseModel = baseModel;
    this.n_estimators = n_estimators;
  }
  
  train(data: Dataset): void {
    this.models = [];
    this.oobIndices = [];
    
    for (let i = 0; i < this.n_estimators; i++) {
      // Bootstrap sample
      const sampleIndices: number[] = [];
      const inBag = new Set<number>();
      
      for (let j = 0; j < data.inputs.length; j++) {
        const idx = Math.floor(Math.random() * data.inputs.length);
        sampleIndices.push(idx);
        inBag.add(idx);
      }
      
      // Track out-of-bag samples
      const oob = new Set<number>();
      for (let j = 0; j < data.inputs.length; j++) {
        if (!inBag.has(j)) {
          oob.add(j);
        }
      }
      this.oobIndices.push(oob);
      
      const sampleInputs = sampleIndices.map(idx => data.inputs[idx]);
      const sampleTargets = sampleIndices.map(idx => data.targets[idx]);
      
      const model = this.baseModel.clone();
      model.train({ inputs: sampleInputs, targets: sampleTargets });
      this.models.push(model);
    }
  }
  
  predict(input: number[]): number {
    if (this.models.length === 0) {
      throw new Error("Model not trained");
    }
    
    const predictions = this.models.map(model => model.predict(input));
    return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
  }
  
  getOutOfBagError(): number {
    // Calculate OOB error using samples not used in training each model
    // This is a placeholder - full implementation would track training data
    return 0;
  }
  
  clone(): PredictionModel {
    return new BaggingRegressor(this.baseModel.clone(), this.n_estimators);
  }
}

// Bayesian Model Averaging

export class BayesianModelAveraging implements PredictionModel {
  private models: PredictionModel[];
  private posteriors: number[] = [];
  
  constructor(models: PredictionModel[]) {
    this.models = models;
  }
  
  train(data: Dataset): void {
    // Split data for training and validation
    const splitPoint = Math.floor(data.inputs.length * 0.7);
    const trainInputs = data.inputs.slice(0, splitPoint);
    const trainTargets = data.targets.slice(0, splitPoint);
    const valInputs = data.inputs.slice(splitPoint);
    const valTargets = data.targets.slice(splitPoint);
    
    // Train all models
    for (const model of this.models) {
      model.train({ inputs: trainInputs, targets: trainTargets });
    }
    
    // Calculate model evidence on validation data
    const evidences: number[] = [];
    for (const model of this.models) {
      const evidence = this.getModelEvidence(model, { inputs: valInputs, targets: valTargets });
      evidences.push(evidence);
    }
    
    // Calculate posterior probabilities using softmax
    const maxEvidence = Math.max(...evidences);
    const expEvidences = evidences.map(e => Math.exp(e - maxEvidence));
    const sumExp = expEvidences.reduce((sum, val) => sum + val, 0);
    
    this.posteriors = expEvidences.map(e => e / sumExp);
  }
  
  predict(input: number[]): number {
    if (this.posteriors.length === 0) {
      throw new Error("Model not trained");
    }
    
    let weightedPred = 0;
    for (let i = 0; i < this.models.length; i++) {
      weightedPred += this.models[i].predict(input) * this.posteriors[i];
    }
    
    return weightedPred;
  }
  
  getModelPosteriors(): number[] {
    return [...this.posteriors];
  }
  
  getModelEvidence(model: PredictionModel, data: Dataset): number {
    const predictions: number[] = [];
    for (const input of data.inputs) {
      predictions.push(model.predict(input));
    }
    
    // Estimate complexity (simplified)
    const complexity = 10; // Placeholder
    
    return calculateModelEvidence(predictions, data.targets, complexity);
  }
  
  clone(): PredictionModel {
    return new BayesianModelAveraging(this.models.map(m => m.clone()));
  }
}

// Random Forest Regressor

export class RandomForestRegressor implements PredictionModel {
  private config: ForestConfig;
  private trees: DecisionTreeRegressor[] = [];
  
  constructor(config: ForestConfig) {
    this.config = config;
  }
  
  private fit(X: number[][], y: number[]): void {
    this.trees = [];
    const nFeatures = X[0].length;
    
    // Determine max_features
    let maxFeatures: number;
    if (typeof this.config.max_features === 'number') {
      maxFeatures = this.config.max_features;
    } else if (this.config.max_features === 'sqrt') {
      maxFeatures = Math.floor(Math.sqrt(nFeatures));
    } else if (this.config.max_features === 'log2') {
      maxFeatures = Math.floor(Math.log2(nFeatures));
    } else {
      maxFeatures = nFeatures;
    }
    
    for (let i = 0; i < this.config.n_trees; i++) {
      // Bootstrap sample
      const sampleIndices: number[] = [];
      for (let j = 0; j < X.length; j++) {
        sampleIndices.push(Math.floor(Math.random() * X.length));
      }
      
      const sampleX = sampleIndices.map(idx => X[idx]);
      const sampleY = sampleIndices.map(idx => y[idx]);
      
      // Random feature selection
      const selectedFeatures = this.selectRandomFeatures(nFeatures, maxFeatures);
      const projectedX = sampleX.map(x => selectedFeatures.map(f => x[f]));
      
      const tree = new DecisionTreeRegressor(this.config.max_depth, this.config.min_samples_split);
      tree.train({ inputs: projectedX, targets: sampleY });
      
      // Store tree with its feature mapping
      (tree as any).selectedFeatures = selectedFeatures;
      this.trees.push(tree);
    }
  }
  
  private selectRandomFeatures(nFeatures: number, maxFeatures: number): number[] {
    const features = Array.from({ length: nFeatures }, (_, i) => i);
    const selected: number[] = [];
    
    for (let i = 0; i < maxFeatures; i++) {
      const idx = Math.floor(Math.random() * features.length);
      selected.push(features[idx]);
      features.splice(idx, 1);
    }
    
    return selected;
  }
  
  train(data: Dataset): void {
    this.fit(data.inputs, data.targets);
  }
  
  predict(input: number[]): number {
    if (this.trees.length === 0) {
      throw new Error("Model not trained");
    }
    
    const predictions: number[] = [];
    
    for (const tree of this.trees) {
      const selectedFeatures = (tree as any).selectedFeatures as number[];
      const projectedInput = selectedFeatures.map(f => input[f]);
      predictions.push(tree.predict(projectedInput));
    }
    
    return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
  }
  
  clone(): PredictionModel {
    return new RandomForestRegressor(this.config);
  }
}