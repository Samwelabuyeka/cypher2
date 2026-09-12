/**
 * Upstream strategy bridge:
 * - Freqtrade-inspired momentum/trend blend
 * - Hummingbot-inspired inventory-aware market making
 */

export interface Candle {
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface UpstreamSignal {
  action: "buy" | "sell" | "hold";
  confidence: number; // 0-100
  reason: string;
}

export interface HummingbotQuote {
  bidSpread: number;
  askSpread: number;
  reservationPrice: number;
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let result = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values: number[], period: number = 14): number {
  if (values.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) {
    changes.push(values[i] - values[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Freqtrade-style signal blending EMA trend + RSI regime.
 */
export function freqtradeInspiredSignal(candles: Candle[]): UpstreamSignal {
  const closes = candles.map((c) => c.close);
  if (closes.length < 80) {
    return { action: "hold", confidence: 0, reason: "insufficient_data" };
  }

  const ema20 = ema(closes.slice(-40), 20);
  const ema50 = ema(closes.slice(-80), 50);
  const rsi14 = rsi(closes, 14);
  const last = closes[closes.length - 1];

  if (ema20 > ema50 && rsi14 > 50 && rsi14 < 72 && last >= ema20) {
    return {
      action: "buy",
      confidence: Math.min(95, 65 + (rsi14 - 50)),
      reason: "freqtrade_trend_following_long",
    };
  }

  if (ema20 < ema50 && rsi14 < 50 && rsi14 > 28 && last <= ema20) {
    return {
      action: "sell",
      confidence: Math.min(95, 65 + (50 - rsi14)),
      reason: "freqtrade_trend_following_short",
    };
  }

  return {
    action: "hold",
    confidence: 45,
    reason: "freqtrade_no_edge",
  };
}

/**
 * Hummingbot-style inventory-aware quote skew (Avellaneda/Stoikov-inspired simplification).
 */
export function hummingbotInspiredQuote(
  midPrice: number,
  inventorySkew: number = 0,
  volatility: number,
  riskAversion: number = 0.1
): HummingbotQuote {
  const sigma = Math.max(0.0001, volatility);
  const reservationPrice = midPrice * (1 - inventorySkew * riskAversion * sigma);
  const baseSpread = Math.max(0.0005, sigma * 0.5);

  const bidSpread = Math.max(0.0005, baseSpread - inventorySkew * 0.0004);
  const askSpread = Math.max(0.0005, baseSpread + inventorySkew * 0.0004);

  return {
    bidSpread,
    askSpread,
    reservationPrice,
  };
}
