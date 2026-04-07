import fs from 'fs';
import path from 'path';

const symbol = process.env.SYMBOL || 'BTC/USDT';
const targetDate = process.env.TARGET_DATE || '2024-01-15';

const marketFile = path.resolve(`persistent-data/market/${symbol.replace('/','_')}_1d_10y.jsonl`);
const modelFile = path.resolve('persistent-data/ai/manual-model.json');

if (!fs.existsSync(marketFile) || !fs.existsSync(modelFile)) {
  throw new Error('Missing market/model files. Run fetch + train first.');
}

const rows = fs.readFileSync(marketFile,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const model = JSON.parse(fs.readFileSync(modelFile,'utf8'));

function ema(values, p){
  const k = 2/(p+1); let e=values[0];
  for(let i=1;i<values.length;i++) e = values[i]*k + e*(1-k);
  return e;
}
function rsi(values,p=14){
  if(values.length<p+1) return 50;
  let gains=0,loss=0;
  for(let i=values.length-p;i<values.length;i++){
    const c=values[i]-values[i-1];
    if(c>0) gains+=c; else loss-=c;
  }
  if(loss===0) return 100;
  const rs=gains/loss; return 100-100/(1+rs);
}
function softmax(logits){ const m=Math.max(...logits); const ex=logits.map(z=>Math.exp(z-m)); const s=ex.reduce((a,b)=>a+b,0); return ex.map(e=>e/s);} 

function manualPredict(price, volRatio, sma20, sma50){
  const ret30 = ((sma20-sma50)/Math.max(1e-9,sma50))*100;
  const raw=[ret30, Math.log10(Math.max(volRatio,1e-9)), Math.log10(Math.max(price,1e-9)), 1];
  const x = raw.map((v,i)=>(v-(model.means[i]??0))/(model.stds[i]??1));
  const logits = model.weights.map(w=>w.reduce((s,wij,j)=>s+wij*x[j],0));
  const p=softmax(logits); let best=0; for(let i=1;i<p.length;i++) if(p[i]>p[best]) best=i;
  return { action:model.labels[String(best)]||'hold', confidence:p[best]*100 };
}

function systemPredict(window){
  const closes=window.map(r=>r.close); const vols=window.map(r=>r.volume);
  const sma20 = closes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const sma50 = closes.slice(-50).reduce((a,b)=>a+b,0)/50;
  const mom = closes[closes.length-1]-closes[closes.length-11];
  const techRsi = rsi(closes,14);
  const volRatio = vols[vols.length-1]/Math.max(1, vols.slice(-20).reduce((a,b)=>a+b,0)/20);
  const manual = manualPredict(closes.at(-1), volRatio, sma20, sma50);

  let vote = 0;
  if (manual.action === 'buy') vote += 2;
  if (manual.action === 'sell') vote -= 2;
  if (ema(closes.slice(-60),20) > ema(closes.slice(-60),50)) vote += 1; else vote -= 1;
  if (techRsi > 60) vote += 1;
  if (techRsi < 40) vote -= 1;
  if (mom > 0) vote += 1; else vote -= 1;

  return vote >= 2 ? 'buy' : vote <= -2 ? 'sell' : 'hold';
}

let correct=0,total=0;
for(let i=120;i<rows.length-1;i++){
  const pred = systemPredict(rows.slice(i-120,i));
  const nextRet = (rows[i+1].close-rows[i].close)/rows[i].close;
  const actual = nextRet>0.001?'buy':nextRet<-0.001?'sell':'hold';
  if(pred===actual) correct++;
  total++;
}
const accuracy = total? (correct/total)*100 : 0;

const idx = rows.findIndex(r=>String(r.iso).slice(0,10)===targetDate);
if(idx<121 || idx>=rows.length-1) throw new Error(`target date ${targetDate} unavailable`);
const predDate = systemPredict(rows.slice(idx-120, idx));
const nextRet = (rows[idx+1].close-rows[idx].close)/rows[idx].close;
const actualDate = nextRet>0.001?'buy':nextRet<-0.001?'sell':'hold';

console.log(JSON.stringify({
  symbol,
  targetDate,
  prediction: predDate,
  actualNextDay: actualDate,
  nextDayReturnPct: Number((nextRet*100).toFixed(4)),
  rollingAccuracyPct: Number(accuracy.toFixed(2)),
  samplesEvaluated: total
}, null, 2));
