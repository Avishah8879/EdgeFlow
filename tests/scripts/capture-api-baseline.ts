/**
 * API Baseline Capture Script
 *
 * Hits every API endpoint and saves the response structure (top-level keys + types)
 * to tests/baselines/*.json for comparison before/after response standardization.
 *
 * Usage:
 *   BEFORE changes: npx tsx tests/scripts/capture-api-baseline.ts
 *   AFTER changes:  npx tsx tests/scripts/capture-api-baseline.ts --after
 *
 * Requires Python backend running on localhost:7860
 */

import fs from 'fs';
import path from 'path';

const PYTHON_BASE = 'http://localhost:7860';
const NODE_BASE = 'http://localhost:5000';

const ENDPOINTS = [
  // Python backend endpoints
  { name: 'stocks', method: 'GET', url: `${PYTHON_BASE}/api/stocks?limit=2&page=1` },
  { name: 'market-movers-gainer', method: 'GET', url: `${PYTHON_BASE}/api/market-movers?category=GAINER&limit=2` },
  { name: 'market-movers-loser', method: 'GET', url: `${PYTHON_BASE}/api/market-movers?category=LOSER&limit=2` },
  { name: 'market-mood', method: 'GET', url: `${PYTHON_BASE}/api/market-mood` },
  { name: 'market-status', method: 'GET', url: `${PYTHON_BASE}/api/market-status` },
  { name: 'stock-ltp', method: 'GET', url: `${PYTHON_BASE}/api/stock-ltp/RELIANCE.NS` },
  { name: 'indices', method: 'GET', url: `${PYTHON_BASE}/api/indices` },
  { name: 'search', method: 'GET', url: `${PYTHON_BASE}/api/search?q=TCS&limit=2` },
  { name: 'price-chart', method: 'GET', url: `${PYTHON_BASE}/api/price-chart/RELIANCE.NS?timeframe=1day&months=1` },
  { name: 'technical-indicators', method: 'GET', url: `${PYTHON_BASE}/api/technical-indicators/RELIANCE.NS` },
  { name: 'tickers', method: 'GET', url: `${PYTHON_BASE}/api/tickers` },
  { name: 'marquee-stocks', method: 'GET', url: `${PYTHON_BASE}/api/marquee-stocks?limit=2` },
  // Error cases
  { name: 'stock-ltp-invalid', method: 'GET', url: `${PYTHON_BASE}/api/stock-ltp/INVALID_TICKER_XYZ` },
  { name: 'search-empty', method: 'GET', url: `${PYTHON_BASE}/api/search` },
  // Node backend endpoints
  { name: 'subscription-plans', method: 'GET', url: `${NODE_BASE}/api/subscription/plans` },
  { name: 'config-visibility', method: 'GET', url: `${NODE_BASE}/api/config/page-visibility` },
];

function describeShape(obj: any, depth = 0): any {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    // Describe first item only
    return [describeShape(obj[0], depth + 1)];
  }
  if (typeof obj === 'object') {
    if (depth > 3) return '{...}'; // Prevent deep recursion
    const shape: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      shape[key] = typeof value === 'object' && value !== null
        ? describeShape(value, depth + 1)
        : typeof value;
    }
    return shape;
  }
  return typeof obj;
}

async function captureBaseline() {
  const suffix = process.argv.includes('--after') ? 'after' : 'before';
  const outDir = path.join(process.cwd(), 'tests', 'baselines');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`\n📸 Capturing API baselines (${suffix})...\n`);

  const results: Record<string, any> = {};

  for (const ep of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(ep.url, {
        method: ep.method,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const body = await response.json();
      const shape = describeShape(body);

      results[ep.name] = {
        status: response.status,
        topLevelKeys: Object.keys(body),
        shape,
      };

      const keyList = Object.keys(body).join(', ');
      const icon = response.ok ? '✅' : '⚠️';
      console.log(`  ${icon} ${ep.name}: ${response.status} — keys: [${keyList}]`);
    } catch (error: any) {
      results[ep.name] = {
        status: 'ERROR',
        error: error.message,
      };
      console.log(`  ❌ ${ep.name}: ${error.message}`);
    }
  }

  const outFile = path.join(outDir, `baseline-${suffix}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved to ${outFile}`);

  // If both before/after exist, show diff
  const beforeFile = path.join(outDir, 'baseline-before.json');
  const afterFile = path.join(outDir, 'baseline-after.json');

  if (fs.existsSync(beforeFile) && fs.existsSync(afterFile)) {
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'));
    const after = JSON.parse(fs.readFileSync(afterFile, 'utf-8'));

    console.log('\n📊 Changes detected:');
    for (const name of Object.keys(after)) {
      const b = before[name];
      const a = after[name];
      if (!b) {
        console.log(`  ➕ ${name}: NEW endpoint`);
        continue;
      }
      const bKeys = JSON.stringify(b.topLevelKeys);
      const aKeys = JSON.stringify(a.topLevelKeys);
      if (bKeys !== aKeys) {
        console.log(`  🔄 ${name}: keys changed ${bKeys} → ${aKeys}`);
      }
    }
  }
}

captureBaseline().catch(console.error);
