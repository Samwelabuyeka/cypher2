import { TransformerModel } from "../lib/ai/transformer";
import { MarketDataGenerator, ConditionalMarketGAN } from "../lib/ai/gan";
import { GraphConvolutionalNetwork, GraphAttentionNetwork } from "../lib/ai/graphNeuralNetwork";
import { LSTMPredictor } from "../lib/ai/lstmPredictor";
import { EnsembleModel } from "../lib/ai/ensembleModels";
import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  logger.info("Starting deep learning execution cycle");

  const results: any = {
    timestamp: new Date(),
    transformer: {},
    gan: {},
    gnn: {},
    lstm: {},
    ensemble: {},
    evaluation: {},
    tradeSignals: []
  };

  try {
    // ============ FETCH MARKET DATA ============
    logger.info("Fetching market data for training");
    const marketData = await api.marketData.findMany({
      first: 250,
      sort: { timestamp: "Descending" },
      filter: {
        symbol: { equals: "BTC/USD" }
      },
      select: {
        id: true,
        symbol: true,
        timestamp: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true
      }
    });

    const prices = marketData.map(d => d.close);
    const volumes = marketData.map(d => d.volume);
    const timestamps = marketData.map(d => new Date(d.timestamp).getTime());

    // ============ TRANSFORMER SEQUENCE PREDICTION ============
    logger.info("Training transformer model for price forecasting");
    const transformer = new TransformerModel({
      inputDim: 5,
      modelDim: 64,
      numHeads: 8,
      numLayers: 4,
      ffnDim: 256,
      maxSeqLength: 100
    });

    const sequenceData = [];
    for (let i = 100; i < marketData.length; i++) {
      const sequence = marketData.slice(i - 100, i).map(d => [
        d.open,
        d.high,
        d.low,
        d.close,
        d.volume
      ]);
      const target = marketData[i].close;
      sequenceData.push({ sequence, target });
    }

    await transformer.train(sequenceData.slice(0, -20), { epochs: 50, batchSize: 16 });

    const currentSequence = marketData.slice(0, 100).map(d => [
      d.open,
      d.high,
      d.low,
      d.close,
      d.volume
    ]);

    const transformerPredictions = {
      oneHour: transformer.predict(currentSequence, 1),
      fourHour: transformer.predict(currentSequence, 4),
      twentyFourHour: transformer.predict(currentSequence, 24),
      attentionMaps: transformer.getAttentionWeights(),
      confidence: transformer.getPredictionConfidence()
    };

    results.transformer = transformerPredictions;
    logger.info({ predictions: transformerPredictions }, "Transformer predictions generated");

    // ============ GAN SYNTHETIC DATA GENERATION ============
    logger.info("Generating synthetic market data with GAN");
    const ganGenerator = new MarketDataGenerator({
      sequenceLength: 100,
      featureDim: 5,
      hiddenDim: 128,
      numLayers: 3
    });

    const trainingSequences = [];
    for (let i = 100; i < marketData.length; i++) {
      trainingSequences.push(
        marketData.slice(i - 100, i).map(d => [d.open, d.high, d.low, d.close, d.volume])
      );
    }

    await ganGenerator.train(trainingSequences, { epochs: 100, batchSize: 32 });

    const syntheticData = {
      bullMarket: ganGenerator.generateSequences(100, 'bull'),
      bearMarket: ganGenerator.generateSequences(100, 'bear'),
      sidewaysMarket: ganGenerator.generateSequences(100, 'sideways'),
      random: ganGenerator.generateSequences(1000)
    };

    const conditionalGAN = new ConditionalMarketGAN({
      sequenceLength: 100,
      featureDim: 5,
      conditionDim: 10
    });

    await conditionalGAN.train(trainingSequences, { epochs: 50 });

    results.gan = {
      syntheticSequencesGenerated: 1300,
      regimeSpecific: {
        bull: syntheticData.bullMarket.length,
        bear: syntheticData.bearMarket.length,
        sideways: syntheticData.sidewaysMarket.length
      },
      quality: ganGenerator.evaluateQuality(trainingSequences.slice(-10))
    };

    logger.info({ synthetic: results.gan }, "GAN synthetic data generated");

    // ============ GRAPH NEURAL NETWORK ============
    logger.info("Building transaction graph and analyzing with GNN");
    
    const wallets = await api.wallet.findMany({
      first: 100,
      select: {
        id: true,
        userId: true,
        currency: true,
        balance: true
      }
    });

    const transactions = await api.walletTransaction.findMany({
      first: 250,
      select: {
        id: true,
        walletId: true,
        amount: true,
        type: true,
        status: true
      }
    });

    const nodes = wallets.map(w => ({
      id: w.id,
      features: [w.balance, wallets.filter(x => x.userId === w.userId).length]
    }));

    const edges: Array<[number, number]> = [];
    const edgeWeights: number[] = [];

    transactions.forEach(tx => {
      const sourceIdx = wallets.findIndex(w => w.id === tx.walletId);
      if (sourceIdx >= 0 && sourceIdx < wallets.length - 1) {
        edges.push([sourceIdx, sourceIdx + 1]);
        edgeWeights.push(tx.amount);
      }
    });

    const gcn = new GraphConvolutionalNetwork({
      inputDim: 2,
      hiddenDims: [32, 64, 32],
      outputDim: 16,
      numLayers: 3
    });

    const gat = new GraphAttentionNetwork({
      inputDim: 2,
      hiddenDims: [32, 64],
      outputDim: 16,
      numHeads: 4,
      numLayers: 3
    });

    const gcnEmbeddings = gcn.forward(nodes.map(n => n.features), edges);
    const gatEmbeddings = gat.forward(nodes.map(n => n.features), edges, edgeWeights);

    const pageRanks = gat.calculatePageRank(edges, edgeWeights);
    const communities = gat.detectCommunities(edges, nodes.length);
    const fraudScores = gat.detectFraudPatterns(
      nodes.map(n => n.features),
      edges,
      edgeWeights
    );

    results.gnn = {
      nodesAnalyzed: nodes.length,
      edgesAnalyzed: edges.length,
      pageRank: {
        topNodes: pageRanks
          .map((score, idx) => ({ nodeId: nodes[idx].id, score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
      },
      communities: {
        detected: communities.length,
        sizes: communities.map(c => c.length)
      },
      fraudDetection: {
        suspiciousNodes: fraudScores.filter(s => s > 0.7).length,
        averageScore: fraudScores.reduce((a, b) => a + b, 0) / fraudScores.length
      },
      embeddings: {
        gcn: gcnEmbeddings.length,
        gat: gatEmbeddings.length
      }
    };

    logger.info({ gnn: results.gnn }, "GNN graph analysis completed");

    // ============ LSTM PRICE PREDICTION ============
    logger.info("Training LSTM for price prediction");
    
    const lstm = new LSTMPredictor({
      inputSize: 5,
      hiddenSize: 128,
      numLayers: 3,
      outputSize: 1,
      useAttention: true
    });

    const lstmTrainingData = [];
    for (let i = 50; i < marketData.length - 1; i++) {
      const input = marketData.slice(i - 50, i).map(d => [
        d.open,
        d.high,
        d.low,
        d.close,
        d.volume
      ]);
      const target = marketData[i + 1].close;
      lstmTrainingData.push({ input, target });
    }

    await lstm.train(lstmTrainingData.slice(0, -20), { epochs: 100, learningRate: 0.001 });

    const lstmInput = marketData.slice(0, 50).map(d => [
      d.open,
      d.high,
      d.low,
      d.close,
      d.volume
    ]);

    const lstmPrediction = lstm.predict(lstmInput);
    const lstmAttention = lstm.getAttentionWeights();

    results.lstm = {
      prediction: lstmPrediction,
      confidence: lstm.getConfidence(),
      attentionWeights: lstmAttention.slice(0, 10)
    };

    logger.info({ lstm: results.lstm }, "LSTM predictions generated");

    // ============ ENSEMBLE ALL MODELS ============
    logger.info("Creating ensemble of all models");

    const ensemble = new EnsembleModel({
      models: [
        { name: 'transformer', weight: 0.35 },
        { name: 'lstm', weight: 0.35 },
        { name: 'gnn', weight: 0.30 }
      ],
      votingStrategy: 'weighted',
      useMetaLearner: true
    });

    const ensemblePredictions = {
      transformer: transformerPredictions.oneHour,
      lstm: lstmPrediction,
      gnn: gcnEmbeddings[0]?.[0] || 0
    };

    const ensembleResult = ensemble.predict(ensemblePredictions);
    const ensembleConfidence = ensemble.getConfidence();

    results.ensemble = {
      prediction: ensembleResult,
      confidence: ensembleConfidence,
      individualPredictions: ensemblePredictions,
      weights: ensemble.getModelWeights()
    };

    logger.info({ ensemble: results.ensemble }, "Ensemble predictions generated");

    // ============ MODEL EVALUATION ============
    logger.info("Evaluating model performance");

    const testData = sequenceData.slice(-20);
    const transformerPredictionsTest = testData.map(d => 
      transformer.predict(d.sequence as number[][], 1)
    );
    const lstmPredictionsTest = lstmTrainingData.slice(-20).map(d => 
      lstm.predict(d.input)
    );

    const calculateMetrics = (predictions: number[], actuals: number[]) => {
      const n = predictions.length;
      const mse = predictions.reduce((sum, pred, i) => 
        sum + Math.pow(pred - actuals[i], 2), 0
      ) / n;
      const rmse = Math.sqrt(mse);
      
      const mae = predictions.reduce((sum, pred, i) => 
        sum + Math.abs(pred - actuals[i]), 0
      ) / n;
      
      const meanActual = actuals.reduce((a, b) => a + b, 0) / n;
      const ssRes = predictions.reduce((sum, pred, i) => 
        sum + Math.pow(actuals[i] - pred, 2), 0
      );
      const ssTot = actuals.reduce((sum, actual) => 
        sum + Math.pow(actual - meanActual, 2), 0
      );
      const r2 = 1 - (ssRes / ssTot);

      return { rmse, mae, r2 };
    };

    const testActuals = testData.map(d => d.target);
    
    results.evaluation = {
      transformer: calculateMetrics(transformerPredictionsTest, testActuals),
      lstm: calculateMetrics(lstmPredictionsTest, testActuals.slice(0, lstmPredictionsTest.length)),
      ensemble: {
        rmse: 0,
        mae: 0,
        r2: 0
      }
    };

    logger.info({ evaluation: results.evaluation }, "Model evaluation completed");

    // ============ EXECUTION / TRADE SIGNALS ============
    logger.info("Generating trade signals based on ensemble confidence");

    const currentPrice = marketData[0].close;
    const predictedPrice = ensembleResult;
    const priceChange = ((predictedPrice - currentPrice) / currentPrice) * 100;

    let signal = {
      action: 'HOLD',
      confidence: ensembleConfidence,
      positionSize: 0,
      predictedChange: priceChange,
      currentPrice,
      predictedPrice,
      reasoning: ''
    };

    if (ensembleConfidence > 0.8) {
      signal.positionSize = 1.0;
      signal.action = priceChange > 0 ? 'BUY' : 'SELL';
      signal.reasoning = 'High confidence prediction';
    } else if (ensembleConfidence > 0.5) {
      signal.positionSize = 0.5;
      signal.action = priceChange > 0 ? 'BUY' : 'SELL';
      signal.reasoning = 'Medium confidence prediction';
    } else {
      signal.reasoning = 'Low confidence - holding cash';
    }

    results.tradeSignals = [signal];

    logger.info({ signal }, "Trade signal generated");

    // Store AI prediction
    await api.aiPrediction.create({
      symbol: "BTC/USD",
      predictionType: "price",
      currentValue: currentPrice,
      predictedValue: predictedPrice,
      confidence: ensembleConfidence * 100,
      targetDate: new Date(Date.now() + 3600000), // 1 hour ahead
      modelVersion: "ensemble-v1",
      features: {
        transformer: transformerPredictions,
        lstm: results.lstm,
        gnn: results.gnn
      }
    });

    logger.info("Deep learning cycle completed successfully");
    return results;

  } catch (error) {
    logger.error({ error }, "Error in deep learning execution");
    throw error;
  }
};

export const options: ActionOptions = {
  triggers: {
    scheduler: {
      every: "30 minutes"
    }
  }
};
