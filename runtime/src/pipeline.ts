import { fetchTenYearsDaily, candlesToMarketData } from "./dataEngine";
import {
  precomputeAllStrategySignals,
  combineSignalsWithWeights,
  NAMES as STRATEGY_NAMES,
  ENSEMBLE_THRESHOLD,
  type OHLCV,
  type EngineSignal,
} from "./advancedEngine";
import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy,
  type Signal as BTSignal,
} from "../../api/lib/backtesting/backtestEngine";

const STRATEGY_WEIGHTS_DEFAULT: Record<string, number> = {
  MeanReversion: 0.08, MomentumBreakout: 0.08, MACDCrossover: 0.07,
  TrendFollower: 0.07, VolumeProfile: 0.06, MultiTimeframe: 0.06,
  IchimokuCloud: 0.06, StochasticRSI: 0.05, HurstRegime: 0.05,
  QuantumEntropy: 0.05, OrderFlowDelta: 0.06, VolatilityBreakout: 0.05,
  ATRChannel: 0.05, ADXStrength: 0.05, PatternDetection: 0.05,
  ZScoreReversion: 0.05, MomentumDivergence: 0.04, RiskAdjustedEntry: 0.06,
};

export interface PipelineResult {
  symbol: string;
  dataRange: { start: string; end: string; totalCandles: number };
  trainPeriod: { start: string; end: string; candles: number };
  testPeriod: { start: string; end: string; candles: number };
  training: {
    bestWeights: Record<string, number>;
    bestSharpe: number;
    bestReturnPercent: number;
    ensembleSize: number;
    strategyNames: string[];
  };
  outOfSample: {
    totalReturnPercent: number;
    finalCapital: number;
    sharpe: number;
    maxDrawdownPercent: number;
    winRate: number;
    totalTrades: number;
    equityCurve: any[];
  };
  note: string;
}

export interface PortfolioResult {
  symbols: string[];
  perSymbol: PipelineResult[];
  portfolio: {
    sharpe: number;
    totalReturnPercent: number;
    winRate: number;
    totalTrades: number;
    maxDrawdownPercent: number;
  };
}

function toOHLCV(data: MarketData[]): OHLCV[] {
  return data.map((d) => ({
    timestamp: d.timestamp.getTime(),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));
}

function runBacktest(
  strategy: Strategy,
  data: MarketData[],
  capital: number
): Promise<{ result: any; sharpe: number; totalReturn: number; maxDrawdown: number; winRate: number; trades: number }> {
  const config: BacktestConfig = {
    initialCapital: capital,
    commission: 0.001,
    slippage: 0.001,
    leverage: 1,
    compounding: true,
  };
  const engine = new BacktestEngine(config);
  return engine.run(strategy, data).then((result) => ({
    result,
    sharpe: result.metrics.sharpeRatio ?? 0,
    totalReturn: result.totalReturnPercent,
    maxDrawdown: result.metrics.maxDrawdownPercent ?? 0,
    winRate: result.metrics.winRate ?? 0,
    trades: result.trades.length,
  }));
}

const TRAILING_STOP_PCT = 0.10;
const TAKE_PROFIT_PCT = 0.20;
const STOP_LOSS_PCT = 0.08;

function generatePositionSignals(
  combined: EngineSignal[],
  candles: { timestamp: number; price: number; high?: number; low?: number }[],
  symbol: string
): BTSignal[] {
  const btSignals: BTSignal[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let peakPrice = 0;
  let lastEntryIdx = -1;

  for (let i = 0; i < combined.length; i++) {
    const s = combined[i];
    const price = candles[i]?.price ?? s.price;
    const strength = s.strength ?? 0.5;

    if (!inPosition) {
      if (s.type === "BUY") {
        btSignals.push({ timestamp: new Date(s.timestamp), type: "buy", symbol, price: s.price });
        inPosition = true;
        entryPrice = s.price;
        peakPrice = s.price;
        lastEntryIdx = i;
      }
    } else {
      if (s.price > peakPrice) peakPrice = s.price;

      const drawdownFromPeak = (peakPrice - price) / peakPrice;
      const gainFromEntry = (price - entryPrice) / entryPrice;
      const holdBars = i - lastEntryIdx;

      const dynamicTrailing = TRAILING_STOP_PCT + (strength > 0.8 ? 0.03 : 0);
      const dynamicTP = TAKE_PROFIT_PCT * (strength > 0.7 ? 1.3 : 1.0);

      const shouldExit =
        drawdownFromPeak > dynamicTrailing ||
        gainFromEntry < -STOP_LOSS_PCT ||
        gainFromEntry > dynamicTP ||
        (s.type === "SELL" && strength > 0.3) ||
        holdBars > 180;

      if (shouldExit) {
        btSignals.push({ timestamp: new Date(s.timestamp), type: "close", symbol, price: s.price });
        inPosition = false;
      }
    }
  }
  if (inPosition) {
    const last = combined[combined.length - 1];
    btSignals.push({ timestamp: new Date(last.timestamp), type: "close", symbol, price: last.price });
  }
  return btSignals;
}

async function optimizeWeights(
  trainOHLCV: OHLCV[],
  trainData: MarketData[],
  symbol: string,
  capital: number
): Promise<{ bestWeights: Record<string, number>; bestSharpe: number; bestReturn: number }> {
  console.log(`  [opt] Optimizing ensemble weights across ${STRATEGY_NAMES.length} strategies...`);

  const allSignals = precomputeAllStrategySignals(trainOHLCV, symbol);
  console.log(`  [opt] Pre-computed ${allSignals.length} strategy signal arrays (${trainOHLCV.length} candles each)`);

  let bestSharpe = -Infinity;
  let bestWeights = { ...STRATEGY_WEIGHTS_DEFAULT };
  let bestReturn = -Infinity;

  const weightSteps = [0.02, 0.05, 0.10, 0.18, 0.30, 0.45];
  let combos = 0;

  for (const w1 of weightSteps) {
    for (const w2 of weightSteps) {
      if (w1 + w2 > 0.6) continue;
      const remaining = 1 - w1 - w2;
      const perStrategy = remaining / (STRATEGY_NAMES.length - 2);
      if (perStrategy < 0.005) continue;

      const trialWeights: Record<string, number> = {};
      for (let i = 0; i < STRATEGY_NAMES.length; i++) {
        trialWeights[STRATEGY_NAMES[i]] = i === 0 ? w1 : i === 1 ? w2 : perStrategy;
      }

      const combined = combineSignalsWithWeights(allSignals, trainOHLCV, symbol, trialWeights, ENSEMBLE_THRESHOLD);
      const candleInfo = trainOHLCV.map(c => ({ timestamp: c.timestamp, price: c.close, high: c.high, low: c.low }));
      const btSignals = generatePositionSignals(combined, candleInfo, symbol);

      const strategy: Strategy = {
        name: "Advanced 18-Strategy Ensemble",
        parameters: { weights: trialWeights, threshold: ENSEMBLE_THRESHOLD },
        generateSignals: () => btSignals,
      };
      try {
        const r = await runBacktest(strategy, trainData, capital);
        combos++;
        if (r.sharpe > bestSharpe && r.trades >= 3) {
          bestSharpe = r.sharpe;
          bestWeights = { ...trialWeights };
          bestReturn = r.totalReturn;
        }
      } catch {}
    }
  }

  for (const topStrat of [0, 3, 5, 7]) {
    for (const topW of [0.15, 0.25, 0.35]) {
      const remaining = 1 - topW;
      const perStrategy = remaining / (STRATEGY_NAMES.length - 1);
      if (perStrategy < 0.005) continue;

      const trialWeights: Record<string, number> = {};
      for (let i = 0; i < STRATEGY_NAMES.length; i++) {
        trialWeights[STRATEGY_NAMES[i]] = i === topStrat ? topW : perStrategy;
      }

      const combined = combineSignalsWithWeights(allSignals, trainOHLCV, symbol, trialWeights, ENSEMBLE_THRESHOLD);
      const candleInfo = trainOHLCV.map(c => ({ timestamp: c.timestamp, price: c.close, high: c.high, low: c.low }));
      const btSignals = generatePositionSignals(combined, candleInfo, symbol);

      const strategy: Strategy = {
        name: "Advanced 18-Strategy Ensemble",
        parameters: { weights: trialWeights, threshold: ENSEMBLE_THRESHOLD },
        generateSignals: () => btSignals,
      };
      try {
        const r = await runBacktest(strategy, trainData, capital);
        combos++;
        if (r.sharpe > bestSharpe && r.trades >= 3) {
          bestSharpe = r.sharpe;
          bestWeights = { ...trialWeights };
          bestReturn = r.totalReturn;
        }
      } catch {}
    }
  }

  console.log(`  [opt] Tested ${combos} weight combos`);
  console.log(`  [opt] Best Sharpe on train: ${bestSharpe.toFixed(3)}`);
  console.log(`  [opt] Best return on train: ${bestReturn.toFixed(2)}%`);

  return { bestWeights, bestSharpe, bestReturn };
}

export async function runFullPipeline(symbol: string): Promise<PipelineResult> {
  console.log(`\n  ════════════════════════════════════════════════════`);
  console.log(`  CYPHER ADVANCED PIPELINE: ${symbol}/USDT`);
  console.log(`  18-Strategy Ensemble Mode`);
  console.log(`  ════════════════════════════════════════════════════\n`);

  const raw = await fetchTenYearsDaily(symbol);
  const allData = candlesToMarketData(raw, symbol);

  if (allData.length < 200) {
    throw new Error(`Only ${allData.length} candles available for ${symbol}. Need at least 200.`);
  }

  const firstDate = allData[0].timestamp;
  const lastDate = allData[allData.length - 1].timestamp;

  console.log(`  [data] Total: ${allData.length} candles from ${fmt(firstDate)} to ${fmt(lastDate)}`);

  const fixedCutoff = new Date("2024-01-01T00:00:00Z").getTime();
  const maxCutoff = lastDate.getTime() - 180 * 86_400_000;
  const cutoff = Math.min(fixedCutoff, maxCutoff);
  const trainData = allData.filter((d) => d.timestamp.getTime() < cutoff);
  const testData = allData.filter((d) => d.timestamp.getTime() >= cutoff);

  console.log(`  [split] Train: ${trainData.length} candles (${fmt(trainData[0].timestamp)} to ${fmt(trainData[trainData.length - 1].timestamp)})`);
  console.log(`  [split] Test:  ${testData.length} candles (${fmt(testData[0]?.timestamp)} to ${fmt(testData[testData.length - 1]?.timestamp)})`);

  if (trainData.length < 100) throw new Error("Not enough training data (need 100+ candles)");
  if (testData.length < 30) throw new Error("Not enough test data (need 30+ candles)");

  const trainOHLCV = toOHLCV(trainData);
  const testOHLCV = toOHLCV(testData);

  console.log(`  [ensemble] Running ${STRATEGY_NAMES.length} strategies: ${STRATEGY_NAMES.join(", ")}`);
  console.log(`  [ensemble] Default threshold: ${ENSEMBLE_THRESHOLD}`);

  const { bestWeights, bestSharpe, bestReturn } = await optimizeWeights(
    trainOHLCV, trainData, symbol, 10_000
  );

  const testAllSignals = precomputeAllStrategySignals(testOHLCV, symbol);
  const testCombined = combineSignalsWithWeights(testAllSignals, testOHLCV, symbol, bestWeights, ENSEMBLE_THRESHOLD);
  const testCandleInfo = testOHLCV.map(c => ({ timestamp: c.timestamp, price: c.close, high: c.high, low: c.low }));
  const testBtSignals = generatePositionSignals(testCombined, testCandleInfo, symbol);
  const testStrategy: Strategy = {
    name: "Advanced 18-Strategy Ensemble",
    parameters: { weights: bestWeights, threshold: ENSEMBLE_THRESHOLD },
    generateSignals: () => testBtSignals,
  };
  const oos = await runBacktest(testStrategy, testData, 10_000);

  console.log(`  [test] Trades: ${oos.trades}`);
  console.log(`  [test] Total return: ${oos.totalReturn.toFixed(2)}%`);
  console.log(`  [test] Final capital: $${oos.result.finalCapital.toFixed(2)}`);
  console.log(`  [test] Sharpe ratio: ${oos.sharpe.toFixed(3)}`);
  console.log(`  [test] Max drawdown: ${oos.maxDrawdown.toFixed(1)}%`);
  console.log(`  [test] Win rate: ${oos.winRate.toFixed(1)}%`);

  const result: PipelineResult = {
    symbol: symbol.toUpperCase(),
    dataRange: {
      start: fmt(firstDate),
      end: fmt(lastDate),
      totalCandles: allData.length,
    },
    trainPeriod: {
      start: fmt(trainData[0].timestamp),
      end: fmt(trainData[trainData.length - 1].timestamp),
      candles: trainData.length,
    },
    testPeriod: {
      start: fmt(testData[0]?.timestamp),
      end: fmt(testData[testData.length - 1]?.timestamp),
      candles: testData.length,
    },
    training: {
      bestWeights,
      bestSharpe,
      bestReturnPercent: bestReturn,
      ensembleSize: STRATEGY_NAMES.length,
      strategyNames: [...STRATEGY_NAMES],
    },
    outOfSample: {
      totalReturnPercent: oos.totalReturn,
      finalCapital: oos.result.finalCapital,
      sharpe: oos.sharpe,
      maxDrawdownPercent: oos.maxDrawdown,
      winRate: oos.winRate,
      totalTrades: oos.trades,
      equityCurve: oos.result.equityCurve.filter((_: any, i: number) => i % 7 === 0).map((p: any) => ({
        date: fmt(p.timestamp),
        equity: Math.round(p.equity * 100) / 100,
        drawdown: Math.round(p.drawdownPercent * 10) / 10,
      })),
    },
    note: `18-strategy ensemble on real Binance daily OHLCV. Training period optimized ensemble weights. Test period (${fmt(testData[0]?.timestamp)} to ${fmt(testData[testData.length - 1]?.timestamp)}) was NEVER seen during optimization. Honest out-of-sample performance — not a guarantee of future results.`,
  };

  console.log(`\n  ════════════════════════════════════════════════════`);
  console.log(`  OUT-OF-SAMPLE RESULTS (unseen data)`);
  console.log(`  Strategy: 18-Strategy Ensemble (threshold=${ENSEMBLE_THRESHOLD})`);
  console.log(`  Return: ${oos.totalReturn.toFixed(2)}%`);
  console.log(`  Final: $${oos.result.finalCapital.toFixed(2)} (from $10,000)`);
  console.log(`  Sharpe: ${oos.sharpe.toFixed(3)}`);
  console.log(`  MaxDD: ${oos.maxDrawdown.toFixed(1)}%`);
  console.log(`  WinRate: ${oos.winRate.toFixed(1)}%`);
  console.log(`  Trades: ${oos.trades}`);
  console.log(`  ════════════════════════════════════════════════════\n`);

  return result;
}

function fmt(d: Date | undefined): string {
  if (!d) return "N/A";
  return d.toISOString().slice(0, 10);
}

export async function runMultiCurrencyPipeline(symbols: string[]): Promise<PortfolioResult> {
  console.log(`\n  ════════════════════════════════════════════════════`);
  console.log(`  PORTFOLIO PIPELINE: ${symbols.length} symbols`);
  console.log(`  ════════════════════════════════════════════════════\n`);

  const perSymbol: PipelineResult[] = [];
  for (const sym of symbols) {
    try {
      const result = await runFullPipeline(sym);
      perSymbol.push(result);
    } catch (e: any) {
      console.error(`  [portfolio] Failed for ${sym}: ${e.message}`);
    }
  }

  if (perSymbol.length === 0) {
    throw new Error("All symbols failed");
  }

  const totalTrades = perSymbol.reduce((s, r) => s + r.outOfSample.totalTrades, 0);
  const avgSharpe = perSymbol.reduce((s, r) => s + r.outOfSample.sharpe, 0) / perSymbol.length;
  const avgReturn = perSymbol.reduce((s, r) => s + r.outOfSample.totalReturnPercent, 0) / perSymbol.length;
  const avgWinRate = perSymbol.reduce((s, r) => s + r.outOfSample.winRate, 0) / perSymbol.length;
  const worstDrawdown = Math.max(...perSymbol.map(r => r.outOfSample.maxDrawdownPercent));

  const dateReturns = new Map<string, number[]>();
  for (const sym of perSymbol) {
    const curve = sym.outOfSample.equityCurve;
    if (curve.length < 2) continue;
    for (let i = 1; i < curve.length; i++) {
      const date = curve[i].date;
      const prev = curve[i - 1].equity;
      const curr = curve[i].equity;
      if (prev > 0) {
        const ret = (curr - prev) / prev;
        if (!dateReturns.has(date)) dateReturns.set(date, []);
        dateReturns.get(date)!.push(ret);
      }
    }
  }

  const portfolioDailyReturns: number[] = [];
  const sortedDates = Array.from(dateReturns.keys()).sort();
  for (const date of sortedDates) {
    const returns = dateReturns.get(date)!;
    const avgRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    portfolioDailyReturns.push(avgRet);
  }

  let portfolioSharpe = avgSharpe;
  if (portfolioDailyReturns.length > 30) {
    const avgDaily = portfolioDailyReturns.reduce((s, r) => s + r, 0) / portfolioDailyReturns.length;
    const variance = portfolioDailyReturns.reduce((s, r) => s + (r - avgDaily) ** 2, 0) / portfolioDailyReturns.length;
    const dailyVol = Math.sqrt(variance);
    const annualizedReturn = avgDaily * 365;
    const annualizedVol = dailyVol * Math.sqrt(365);
    portfolioSharpe = annualizedVol > 0 ? annualizedReturn / annualizedVol : avgSharpe;
  }

  console.log(`\n  ════════════════════════════════════════════════════`);
  console.log(`  PORTFOLIO RESULTS (${perSymbol.length} symbols)`);
  console.log(`  Portfolio Sharpe: ${portfolioSharpe.toFixed(3)} (diversified)`);
  console.log(`  Avg Sharpe: ${avgSharpe.toFixed(3)} (per-symbol)`);
  console.log(`  Avg Return: ${avgReturn.toFixed(2)}%`);
  console.log(`  Total Trades: ${totalTrades}`);
  console.log(`  Avg WinRate: ${avgWinRate.toFixed(1)}%`);
  console.log(`  Worst MaxDD: ${worstDrawdown.toFixed(1)}%`);
  console.log(`  ════════════════════════════════════════════════════\n`);

  return {
    symbols: perSymbol.map(r => r.symbol),
    perSymbol,
    portfolio: {
      sharpe: portfolioSharpe,
      totalReturnPercent: avgReturn,
      winRate: avgWinRate,
      totalTrades,
      maxDrawdownPercent: worstDrawdown,
    },
  };
}
