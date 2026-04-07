#!/usr/bin/env python3
import csv
import json
import os
import time
from pathlib import Path
from urllib.request import urlopen, Request

symbols = os.getenv('SYMBOLS', 'BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,ADA/USDT').split(',')
years = int(os.getenv('YEARS', '10'))
out_dir = Path('persistent-data/market')
out_dir.mkdir(parents=True, exist_ok=True)
since_ms = int((time.time() - years * 365 * 24 * 60 * 60) * 1000)

for symbol in symbols:
    symbol = symbol.strip()
    pair = symbol.replace('/', '')
    url = f'https://www.cryptodatadownload.com/cdd/Binance_{pair}_d.csv'
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})

    try:
      with urlopen(req, timeout=30) as r:
          text = r.read().decode('utf-8', 'ignore').splitlines()
    except Exception as e:
      print(f'Failed {symbol}: {e}')
      continue

    rows = []
    reader = csv.reader(text)
    for cols in reader:
        if not cols or cols[0].startswith('https://') or cols[0] == 'Unix':
            continue
        try:
            ts = int(cols[0])
            if ts < since_ms:
                continue
            row = {
                'timestamp': ts,
                'iso': cols[1],
                'open': float(cols[3]),
                'high': float(cols[4]),
                'low': float(cols[5]),
                'close': float(cols[6]),
                'volume': float(cols[8] or cols[7] or 0),
                'symbol': symbol,
                'exchange': 'cryptodatadownload-binance',
                'timeframe': '1d',
            }
            rows.append(row)
        except Exception:
            continue

    rows.sort(key=lambda x: x['timestamp'])
    out_file = out_dir / f"{symbol.replace('/', '_')}_1d_10y.jsonl"
    with out_file.open('w', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row) + '\n')

    print(f'{symbol}: {len(rows)} candles -> {out_file}')
