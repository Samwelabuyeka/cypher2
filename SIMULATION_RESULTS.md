# Autonomous Trading Simulation Results

## Full Algorithm + AI Integration Scope
The runtime snapshot now includes and synchronizes:
- Upstream strategy bridge outputs (`freqtradeInspiredSignal`, `hummingbotInspiredQuote`)
- All internal `signalGenerator` strategies (`momentum`, `mean-reversion`, `breakout`, `trend-following`)
- Core technical indicators (RSI, MACD, Bollinger, Stochastic, ATR, ADX, OBV, VWAP)
- Additional risk/portfolio/math models (historical/parametric/MC VaR, MPT Sharpe optimization, momentum model, risk scoring)
- Quantum algorithms (`quantumMonteCarloVaR`, `optimizePortfolioQuantum`, `findArbitrageOpportunities`)
- Project-wide algorithm inventory scanner from `api/lib/**/*.ts`

## Biggest Simulation Run (AI + all connected algorithm families)
- Iterations: 100
- Symbols: BTC/ETH/SOL/BNB/ADA
- Total backtests: 500
- Candles per run: 700-1100 (varies by iteration)
- AI path: `getLocalAIMarketBias(...)` called with unified snapshot + backtest context

### Commands
```bash
yarn -s tsc api/lib/backtesting/hybridTradeSimulation.ts api/lib/ai/localAiRouter.ts api/lib/trading/unifiedAlgorithmSnapshot.ts api/lib/quantum/quantumAnnealing.ts --module commonjs --target es2020 --esModuleInterop --outDir /tmp/cypher-sim
node -e "const {runHeavyPortfolioSimulation}=require('/tmp/cypher-sim/backtesting/hybridTradeSimulation.js'); runHeavyPortfolioSimulation(100,['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','ADA/USDT']).then(r=>{console.log(JSON.stringify(r,null,2));}).catch(e=>{console.error(e); process.exit(1);});"
```

### Output
```json
{
  "iterations": 100,
  "symbols": [
    "BTC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "BNB/USDT",
    "ADA/USDT"
  ],
  "totalBacktests": 500,
  "avgReturnPercent": 41.372673392049464,
  "medianReturnPercent": 40.385677231846884,
  "bestReturnPercent": 108.72114449166013,
  "worstReturnPercent": -13.953201554580428,
  "avgWinRate": 72.31582133380896,
  "avgSharpeRatio": 7.1321869724028035,
  "profitableRunsPercent": 98.4,
  "avgMaxDrawdownPercent": 5.3843181814605945,
  "aiPositiveBiasPercent": 100,
  "scannedAlgorithmExports": 438,
  "scannedLibFiles": 84
}
```

## Notes
- This verifies broad algorithm-family connectivity and AI synchronization under heavy synthetic load.
- Still synthetic: production confidence requires historical replay + walk-forward + forward paper trading.
