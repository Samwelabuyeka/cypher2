import {
  BacktestEngine,
  type BacktestConfig,
  type MarketData,
  type Strategy,
  type BacktestResult,
} from "../../api/lib/backtesting/backtestEngine";
import { MarketDataService, type Candle } from "./exchangeService";

const market = new MarketDataService();

function candlesToMarketData(candles: Candle[]): MarketData[] {
  return candles
    .filter((c) => c.close > 0)
    .map((c) => ({
      timestamp: new Date(c.timestamp),
      symbol: "BTC/USDT",
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
}

function simpleMovingAverage(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * A real, transparent moving-average crossover strategy.
 * Uses real Binance OHLCV data and produces buy/sell signals from it.
 */
export function createMaCrossoverStrategy(short = 10, long = 30): Strategy {
  return {
    name: `MA-Cross (${short}/${long})`,
    parameters: { short, long },
    generateSignals: (data, params) => {
      const s = (params?.short as number) || short;
      const l = (params?.long as number) || long;
      const closes = data.map((d) => d.close);
      const fast = simpleMovingAverage(closes, s);
      const slow = simpleMovingAverage(closes, l);

      const signals = [];
      for (let i = 1; i < data.length; i++) {
        const prevFast = fast[i - 1];
        const prevSlow = slow[i - 1];
        const curFast = fast[i];
        const curSlow = slow[i];
        if (isNaN(prevFast) || isNaN(prevSlow) || isNaN(curFast) || isNaN(curSlow)) continue;

        // Golden cross -> buy
        if (prevFast <= prevSlow && curFast > curSlow) {
          signals.push({
            timestamp: data[i].timestamp,
            type: "buy" as const,
            symbol: data[i].symbol,
            price: data[i].close,
          });
        }
        // Death cross -> close
        else if (prevFast >= prevSlow && curFast < curSlow) {
          signals.push({
            timestamp: data[i].timestamp,
            type: "close" as const,
            symbol: data[i].symbol,
            price: data[i].close,
          });
        }
      }
      return signals;
    },
  };
}

export interface RunBacktestParams {
  symbol: string;
  timeframe: string;
  limit: number;
  initialCapital: number;
  short: number;
  long: number;
  commission: number;
  slippage: number;
}

export async function runRealBacktest(params: RunBacktestParams): Promise<{
  symbol: string;
  timeframe: string;
  candlesUsed: number;
  source: string;
  strategy: Record<string, any>;
  result: BacktestResult;
}> {
  const candles = await market.fetchOHLCV(params.symbol, params.timeframe, params.limit);
  const data = candlesToMarketData(candles);
  if (data.length < 60) {
    throw new Error(
      `Not enough market data for symbol ${params.symbol} (got ${data.length} candles). Check the symbol and try again.`
    );
  }

  const config: BacktestConfig = {
    initialCapital: params.initialCapital ?? 10_000,
    commission: params.commission ?? 0.001,
    slippage: params.slippage ?? 0.001,
    leverage: 1,
    compounding: true,
  };

  const strategy = createMaCrossoverStrategy(params.short ?? 10, params.long ?? 30);
  const engine = new BacktestEngine(config);
  const result = await engine.run(strategy, data);

  return {
    symbol: params.symbol.toUpperCase(),
    timeframe: params.timeframe,
    candlesUsed: data.length,
    source: "live-binance",
    strategy: {
      name: strategy.name,
      parameters: strategy.parameters,
    },
    result,
  };
}

if (process.argv[1] && process.argv[1].endsWith("backtestService.ts")) {
  runRealBacktest({
    symbol: process.argv[2] ?? "BTC",
    timeframe: process.argv[3] ?? "1d",
    limit: parseInt(process.argv[4] ?? "500", 10),
    initialCapital: 10_000,
    short: 10,
    long: 30,
    commission: 0.001,
    slippage: 0.001,
  })
    .then((out) => {
      console.log(JSON.stringify({ ...out, result: { ...out.result, equityCurve: out.result.equityCurve.slice(0, 5) } }, null, 2));
    })
    .catch((e) => {
      console.error("Backtest failed:", e.message);
      process.exit(1);
    });
}
