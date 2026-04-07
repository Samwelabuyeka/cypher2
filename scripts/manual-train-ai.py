#!/usr/bin/env python3
import json
import math
import re
from pathlib import Path

corpus_path = Path('persistent-data/ai/training-corpus.jsonl')
out_path = Path('persistent-data/ai/manual-model.json')

if not corpus_path.exists():
    raise SystemExit('training corpus not found. run node scripts/train-ai-from-market-data.mjs first')

x = []
y = []
label_map = {'sell': 0, 'hold': 1, 'buy': 2}
inv_label_map = {v: k for k, v in label_map.items()}

pattern = re.compile(r'return_30d=([-0-9.]+) avg_volume=([-0-9.]+) close=([-0-9.]+)')
for line in corpus_path.read_text(encoding='utf-8').splitlines():
    row = json.loads(line)
    m = pattern.search(row['prompt'])
    if not m:
        continue
    ret = float(m.group(1))
    vol = float(m.group(2))
    close = float(m.group(3))
    x.append([ret, math.log10(max(vol, 1e-9)), math.log10(max(close, 1e-9)), 1.0])
    y.append(label_map.get(row['completion'], 1))

if not x:
    raise SystemExit('no trainable samples')

# Normalize features
cols = list(zip(*x))
means = [sum(c) / len(c) for c in cols]
stds = [max((sum((v - m) ** 2 for v in c) / len(c)) ** 0.5, 1e-6) for c, m in zip(cols, means)]
X = [[(v - means[i]) / stds[i] for i, v in enumerate(row)] for row in x]

k = 3
n_features = len(X[0])
W = [[0.0] * n_features for _ in range(k)]
lr = 0.05
epochs = 300

for _ in range(epochs):
    grads = [[0.0] * n_features for _ in range(k)]
    for xi, yi in zip(X, y):
        logits = [sum(W[c][j] * xi[j] for j in range(n_features)) for c in range(k)]
        max_logit = max(logits)
        exps = [math.exp(z - max_logit) for z in logits]
        s = sum(exps)
        probs = [e / s for e in exps]
        for c in range(k):
            diff = probs[c] - (1.0 if c == yi else 0.0)
            for j in range(n_features):
                grads[c][j] += diff * xi[j]
    m = len(X)
    for c in range(k):
        for j in range(n_features):
            W[c][j] -= lr * grads[c][j] / m

model = {
    'weights': W,
    'means': means,
    'stds': stds,
    'labels': inv_label_map,
    'features': ['return_30d', 'log10_avg_volume', 'log10_close', 'bias'],
    'samples': len(X),
}
out_path.write_text(json.dumps(model, indent=2), encoding='utf-8')
print(f'trained manual model with {len(X)} samples -> {out_path}')
