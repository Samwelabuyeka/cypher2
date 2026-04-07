import fs from 'fs';
import path from 'path';
import ccxt from 'ccxt';

const outDir = path.resolve('persistent-data/market');
fs.mkdirSync(outDir, { recursive: true });

const preferredExchangeId = process.env.EXCHANGE_ID || 'binance';
const timeframe = process.env.TIMEFRAME || '1d';
const symbols = (process.env.SYMBOLS || 'BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,ADA/USDT').split(',');
const years = Number(process.env.YEARS || 10);
const since = Date.now() - years * 365 * 24 * 60 * 60 * 1000;

const fallbackExchanges = [preferredExchangeId, 'kraken', 'coinbase', 'bitfinex'];
let exchange = null;
let exchangeId = '';

async function fetchFromCryptoDataDownload(symbol) {
  const pair = symbol.replace('/', '');
  const url = `https://www.cryptodatadownload.com/cdd/Binance_${pair}_d.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const rows = text
    .split('\\n')
    .filter((line) => line && !line.startsWith('https://') && !line.startsWith('Unix,'))
    .map((line) => line.split(','))
    .map((cols) => ({
      timestamp: Number(cols[0]),
      iso: cols[1],
      open: Number(cols[3]),
      high: Number(cols[4]),
      low: Number(cols[5]),
      close: Number(cols[6]),
      volume: Number(cols[8] || cols[7] || 0),
      symbol,
      exchange: 'cryptodatadownload-binance',
      timeframe,
    }))
    .filter((r) => Number.isFinite(r.timestamp) && r.timestamp >= since)
    .sort((a, b) => a.timestamp - b.timestamp);

  const file = path.join(outDir, `${symbol.replace('/', '_')}_${timeframe}_10y.jsonl`);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\\n') + '\\n');
  console.log(`${symbol}: ${rows.length} candles -> ${file} (source: cryptodatadownload)`);
}

async function fetchSymbol(symbol) {
  const all = [];
  let cursor = since;
  const limit = 1000;

  for (let i = 0; i < 20; i++) {
    const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, cursor, limit);
    if (!ohlcv.length) break;

    all.push(...ohlcv);
    const lastTs = ohlcv[ohlcv.length - 1][0];
    cursor = lastTs + 24 * 60 * 60 * 1000;

    if (lastTs >= Date.now() - 24 * 60 * 60 * 1000) break;
  }

  const uniq = Array.from(new Map(all.map((x) => [x[0], x])).values());
  const rows = uniq.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp,
    iso: new Date(timestamp).toISOString(),
    open,
    high,
    low,
    close,
    volume,
    symbol,
    exchange: exchangeId,
    timeframe,
  }));

  const file = path.join(outDir, `${symbol.replace('/', '_')}_${timeframe}_10y.jsonl`);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  console.log(`${symbol}: ${rows.length} candles -> ${file}`);
}

async function main() {
  for (const exId of fallbackExchanges) {
    try {
      if (!(exId in ccxt)) continue;
      const ex = new ccxt[exId]({ enableRateLimit: true });
      await ex.loadMarkets();
      exchange = ex;
      exchangeId = exId;
      console.log(`Using exchange: ${exchangeId}`);
      break;
    } catch (err) {
      console.error(`Exchange unavailable ${exId}:`, err.message);
    }
  }

  if (!exchange) {
    console.warn('No reachable exchange API; falling back to cryptodatadownload static daily files.');
  }

  for (const symbol of symbols) {
    try {
      if (exchange) {
        await fetchSymbol(symbol.trim());
      } else {
        await fetchFromCryptoDataDownload(symbol.trim());
      }
    } catch (err) {
      console.error(`Failed ${symbol}:`, err.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
