import { spawnSync } from 'child_process';

const py = spawnSync('python3', ['scripts/fetch-trade-data-10y.py'], { stdio: 'inherit' });
if (py.status !== 0) {
  console.error('python3-based fetch failed. Ensure python3 is installed and rerun.');
  process.exit(py.status ?? 1);
}
