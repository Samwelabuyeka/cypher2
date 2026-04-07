import fs from 'fs';
import path from 'path';

const marketDir = path.resolve('persistent-data/market');
const aiDir = path.resolve('persistent-data/ai');
fs.mkdirSync(aiDir, { recursive: true });

const files = fs.existsSync(marketDir)
  ? fs.readdirSync(marketDir).filter((f) => f.endsWith('.jsonl'))
  : [];

if (!files.length) {
  console.error('No market data files found. Run fetch-trade-data-10y.mjs first.');
  process.exit(1);
}

const out = path.join(aiDir, 'training-corpus.jsonl');
const lines = [];

for (const file of files) {
  const p = path.join(marketDir, file);
  const rows = fs
    .readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

  for (let i = 30; i < rows.length; i += 5) {
    const window = rows.slice(i - 30, i);
    const last = window[window.length - 1];
    const first = window[0];
    const ret = ((last.close - first.close) / first.close) * 100;
    const vol = window.reduce((s, r) => s + r.volume, 0) / window.length;

    lines.push(
      JSON.stringify({
        prompt: `symbol=${last.symbol} return_30d=${ret.toFixed(4)} avg_volume=${vol.toFixed(4)} close=${last.close}`,
        completion: ret > 2 ? 'buy' : ret < -2 ? 'sell' : 'hold',
      })
    );
  }
}

fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} samples to ${out}`);

// Optional persistent local model build
if (process.env.CYPHER_ENABLE_LOCAL_AI === '1') {
  const modelfile = path.join(aiDir, 'Modelfile');
  fs.writeFileSync(
    modelfile,
    ['FROM llama3.2:3b', 'SYSTEM You are a trading assistant trained on cypher market corpus.'].join('\n') + '\n'
  );
  console.log(`Prepared ${modelfile}. Run: ollama create cypher-trader -f ${modelfile}`);
}
