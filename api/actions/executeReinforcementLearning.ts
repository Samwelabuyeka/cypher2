import { ActionOptions } from "gadget-server";
import { DQNAgent } from "../lib/ai/reinforcementLearning";
import { calculateTechnicalIndicators } from "../lib/analytics/technicalIndicators";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  try {
    logger.info("Starting Reinforcement Learning training cycle");

    const mode = params.mode || "inference";
    const symbol = params.symbol || "BTC/USDT";
    const retrain = mode === "training";

    // Fetch historical market data
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    const marketData = await api.marketData.findMany({
      filter: {
        symbol: { equals: symbol },
        timestamp: {
          greaterThanOrEqual: startDate.toISOString(),
          lessThanOrEqual: endDate.toISOString(),
        },
      },
      sort: { timestamp: "Ascending" },
      first: 250,
      select: {
        id: true,
        timestamp: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
      },
    });

    if (marketData.length < 100) {
      logger.warn(`Insufficient market data for ${symbol}, need at least 100 candles`);
      return {
        success: false,
        message: "Insufficient historical data",
        symbol,
        dataPoints: marketData.length,
      };
    }

    logger.info(`Loaded ${marketData.length} market data points for ${symbol}`);

    // Calculate technical indicators for state representation
    const closes = marketData.map((d) => d.close);
    const highs = marketData.map((d) => d.high);
    const lows = marketData.map((d) => d.low);
    const volumes = marketData.map((d) => d.volume);

    const indicators = calculateTechnicalIndicators(closes, highs, lows, volumes);

    // Initialize DQN Agent
    const stateSize = 10;
    const actionSize = 5;
    const agent = new DQNAgent(
      stateSize,
      actionSize,
      {
        learningRate: 0.0001,
        gamma: 0.99,
        epsilon: retrain ? 0.1 : 0.01,
        epsilonMin: 0.01,
        epsilonDecay: 0.995,
        batchSize: 64,
        memorySize: 100000,
        hiddenLayers: [128, 64, 32],
      }
    );

    // Prepare training episodes
    const episodes = retrain ? 100 : 1;
    const trainingMetrics = {
      episodeRewards: [] as number[],
      avgQLoss: 0,
      avgReward: 0,
      finalEpsilon: agent.epsilon,
      totalSteps: 0,
    };

    if (retrain) {
      logger.info("Starting DQN training loop");

      for (let episode = 0; episode < episodes; episode++) {
        let episodeReward = 0;
        let position = 0;
        let cash = 10000;
        let holdings = 0;

        for (let t = 50; t < marketData.length - 1; t++) {
          const state = buildState(t, marketData, indicators, position, cash, holdings);
          const action = agent.act(state);

          const reward = executeAction(
            action,
            t,
            marketData,
            { position, cash, holdings },
            (newState) => {
              position = newState.position;
              cash = newState.cash;
              holdings = newState.holdings;
            }
          );

          const nextState = buildState(t + 1, marketData, indicators, position, cash, holdings);
          const done = t === marketData.length - 2;

          agent.remember(state, action, reward, nextState, done);
          episodeReward += reward;
          trainingMetrics.totalSteps++;

          if (agent.memory.length > agent.batchSize) {
            const loss = agent.replay();
            if (loss !== null) {
              trainingMetrics.avgQLoss += loss;
            }
          }
        }

        trainingMetrics.episodeRewards.push(episodeReward);

        if (episode % 10 === 0) {
          logger.info(
            `Episode ${episode}/${episodes}, Reward: ${episodeReward.toFixed(2)}, Epsilon: ${agent.epsilon.toFixed(4)}`
          );
        }
      }

      trainingMetrics.avgReward =
        trainingMetrics.episodeRewards.reduce((a, b) => a + b, 0) / episodes;
      trainingMetrics.avgQLoss = trainingMetrics.avgQLoss / trainingMetrics.totalSteps;
      trainingMetrics.finalEpsilon = agent.epsilon;

      logger.info("Training completed", trainingMetrics);
    }

    // Backtest evaluation
    logger.info("Running backtest evaluation");
    const backtestResults = runBacktest(agent, marketData, indicators);

    // Generate recommendations for current market state
    const latestState = buildState(
      marketData.length - 1,
      marketData,
      indicators,
      0,
      10000,
      0
    );
    const recommendedAction = agent.act(latestState, false);
    const qValues = agent.getQValues(latestState);

    const actionNames = ["BUY", "HOLD", "SELL", "BUY_DOUBLE", "SELL_SHORT"];

    logger.info("RL inference complete", {
      recommendedAction: actionNames[recommendedAction],
      qValues,
    });

    return {
      success: true,
      symbol,
      mode,
      training: retrain
        ? {
            episodes,
            totalSteps: trainingMetrics.totalSteps,
            avgReward: trainingMetrics.avgReward,
            avgQLoss: trainingMetrics.avgQLoss,
            finalEpsilon: trainingMetrics.finalEpsilon,
            episodeRewards: trainingMetrics.episodeRewards.slice(-10),
          }
        : null,
      backtest: backtestResults,
      recommendation: {
        action: actionNames[recommendedAction],
        actionIndex: recommendedAction,
        qValues: {
          BUY: qValues[0],
          HOLD: qValues[1],
          SELL: qValues[2],
          BUY_DOUBLE: qValues[3],
          SELL_SHORT: qValues[4],
        },
        confidence: Math.max(...qValues) - Math.min(...qValues),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error in RL training/inference", { error });
    throw error;
  }
};

function buildState(
  index: number,
  marketData: any[],
  indicators: any,
  position: number,
  cash: number,
  holdings: number
): number[] {
  const current = marketData[index];
  const prev = marketData[Math.max(0, index - 1)];

  const priceChange = (current.close - prev.close) / prev.close;
  const volumeNorm = current.volume / 1000000;
  const rsi = indicators.rsi[index] / 100;
  const macd = indicators.macd[index] / current.close;
  const bollinger = (current.close - indicators.bollingerLower[index]) / 
                    (indicators.bollingerUpper[index] - indicators.bollingerLower[index]);
  const sentiment = 0.5;
  const momentum = indicators.momentum[index] / 100;
  const volatility = indicators.atr[index] / current.close;
  const spread = (current.high - current.low) / current.close;
  const positionNorm = position / 5;

  return [
    priceChange,
    volumeNorm,
    rsi,
    macd,
    bollinger,
    sentiment,
    momentum,
    volatility,
    spread,
    positionNorm,
  ];
}

function executeAction(
  action: number,
  index: number,
  marketData: any[],
  state: { position: number; cash: number; holdings: number },
  updateState: (newState: { position: number; cash: number; holdings: number }) => void
): number {
  const price = marketData[index].close;
  const nextPrice = marketData[index + 1].close;
  let reward = 0;

  const { position, cash, holdings } = state;

  switch (action) {
    case 0:
      if (cash > price) {
        const shares = Math.floor(cash / price);
        updateState({
          position: 1,
          cash: cash - shares * price,
          holdings: shares,
        });
        reward = ((nextPrice - price) / price) * shares;
      } else {
        reward = -0.01;
      }
      break;

    case 1:
      reward = position > 0 ? ((nextPrice - price) / price) * holdings * 0.5 : 0;
      break;

    case 2:
      if (position > 0 && holdings > 0) {
        const saleValue = holdings * price;
        updateState({
          position: 0,
          cash: cash + saleValue,
          holdings: 0,
        });
        reward = ((price - marketData[Math.max(0, index - 1)].close) / 
                  marketData[Math.max(0, index - 1)].close) * holdings;
      } else {
        reward = -0.01;
      }
      break;

    case 3:
      if (cash > price * 2) {
        const shares = Math.floor(cash / price);
        updateState({
          position: 2,
          cash: cash - shares * price,
          holdings: shares,
        });
        reward = ((nextPrice - price) / price) * shares * 1.5;
      } else {
        reward = -0.02;
      }
      break;

    case 4:
      if (position === 0) {
        updateState({
          position: -1,
          cash: cash + price * 100,
          holdings: -100,
        });
        reward = ((price - nextPrice) / price) * 100;
      } else {
        reward = -0.01;
      }
      break;
  }

  const riskPenalty = Math.abs(position) > 1 ? -0.05 : 0;
  return reward + riskPenalty;
}

function runBacktest(
  agent: DQNAgent,
  marketData: any[],
  indicators: any
): {
  returns: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
} {
  let cash = 10000;
  let holdings = 0;
  let position = 0;
  let equity = cash;
  let maxEquity = equity;
  let maxDrawdown = 0;
  let trades = 0;
  let wins = 0;
  const equityCurve: number[] = [];

  for (let t = 50; t < marketData.length - 1; t++) {
    const state = buildState(t, marketData, indicators, position, cash, holdings);
    const action = agent.act(state, false);

    const price = marketData[t].close;
    const prevPosition = position;

    switch (action) {
      case 0:
        if (cash > price && position === 0) {
          holdings = Math.floor(cash / price);
          cash -= holdings * price;
          position = 1;
          trades++;
        }
        break;
      case 2:
        if (holdings > 0) {
          cash += holdings * price;
          if (price > marketData[t - 10]?.close) wins++;
          holdings = 0;
          position = 0;
          trades++;
        }
        break;
    }

    equity = cash + holdings * price;
    equityCurve.push(equity);

    if (equity > maxEquity) {
      maxEquity = equity;
    }

    const drawdown = (maxEquity - equity) / maxEquity;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const finalReturn = ((equity - 10000) / 10000) * 100;
  const returns = equityCurve.map((e, i) => 
    i === 0 ? 0 : (e - equityCurve[i - 1]) / equityCurve[i - 1]
  );
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  return {
    returns: finalReturn,
    sharpe,
    maxDrawdown: maxDrawdown * 100,
    winRate: trades > 0 ? (wins / trades) * 100 : 0,
    totalTrades: trades,
  };
}

export const options: ActionOptions = {
  triggers: {
    scheduler: [
      {
        every: "10 minutes",
      },
      {
        every: "1 day",
      },
    ],
  },
};
