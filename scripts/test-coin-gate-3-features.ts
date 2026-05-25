/**
 * E2E test for the 3 newly gated features:
 *   - portfolio.optimize       (POST /api/portfolio/optimize)
 *   - fundamental_screener.run (POST /api/fundamental-screener/start)
 *   - pair_trading.run         (GET  /api/pair-trading/matrix)
 *
 * For each feature: confirms the gate blocks at 0 coins (expects 402),
 * then with 100 coins the request goes through and the configured cost
 * is debited. Cleans up the test user at the end.
 *
 * IMPORTANT: requires the Node dev server to have been restarted after
 * the gate-block reorder in server/index.ts — otherwise the existing
 * terminal routes match first and the gate never fires.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const NODE_BASE = 'http://localhost:3000';
const TEST_EMAIL = 'coingate-test3@local';
const TEST_USERNAME = 'coingate_test3';
const TEST_PASSWORD = 'TestPass123!';

function ok(label: string) { console.log(`  ✓ ${label}`); }
function fail(label: string, detail?: any): never {
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error('    detail:', detail);
  process.exit(1);
}
function step(label: string) { console.log(`\n— ${label}`); }

interface FeatureTest {
  feature_key: string;
  label: string;
  method: 'GET' | 'POST';
  url: string;
  body?: any;
}

const FEATURES: FeatureTest[] = [
  {
    feature_key: 'portfolio.optimize',
    label: 'Portfolio Optimizer',
    method: 'POST',
    url: '/api/portfolio/optimize',
    body: {
      holdings: [
        { symbol: 'RELIANCE', quantity: 50 },
        { symbol: 'TCS',      quantity: 50 },
      ],
    },
  },
  {
    feature_key: 'fundamental_screener.run',
    label: 'Fundamental Scanner',
    method: 'POST',
    url: '/api/fundamental-screener/start',
    body: { expression: 'trailing_pe < 30 and dividend_yield > 1' },
  },
  {
    feature_key: 'pair_trading.run',
    label: 'Pair Trading',
    method: 'GET',
    url: '/api/pair-trading/matrix?group_type=sector&group=IT&method=correlation&lookback_days=90',
  },
];

async function main() {
  const pool = new Pool({
    host:     process.env.AUTH_DB_HOST,
    port:     parseInt(process.env.AUTH_DB_PORT || '5432', 10),
    database: process.env.AUTH_DB_NAME,
    user:     process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASSWORD,
    ssl:      false,
  });

  step('Setup: clean + create test user');
  await pool.query(`DELETE FROM sessions          WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [TEST_EMAIL]);
  await pool.query(`DELETE FROM coin_transactions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [TEST_EMAIL]);
  await pool.query(`DELETE FROM coin_balances    WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [TEST_EMAIL]);
  await pool.query(`DELETE FROM users            WHERE email = $1`, [TEST_EMAIL]);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, username, password_hash, tier, role, email_verified, terms_accepted)
     VALUES ($1, $2, $3, 'free', 'user', TRUE, TRUE)
     RETURNING id`,
    [TEST_EMAIL, TEST_USERNAME, passwordHash],
  );
  const userId = userResult.rows[0].id;
  ok(`created test user ${TEST_EMAIL} (id=${userId})`);

  step('Issue JWT + session');
  const token = jwt.sign(
    { userId, email: TEST_EMAIL, username: TEST_USERNAME, tier: 'free', role: 'user', provider: 'password', type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h', issuer: 'tiphub-auth', audience: 'tiphub-api' },
  );
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const refreshHash = crypto.createHash('sha256').update(`refresh-${Date.now()}`).digest('hex');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, ip_address, device_info)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', '127.0.0.1'::inet, 'coingate-test/1.0')`,
    [userId, tokenHash, refreshHash],
  );
  ok('JWT + session ready');

  for (const feat of FEATURES) {
    step(`[${feat.label}]  feature_key=${feat.feature_key}`);

    // Verify the row exists
    const fc = await pool.query<{ cost: number; is_active: boolean }>(
      `SELECT cost, is_active FROM feature_costs WHERE feature_key = $1`,
      [feat.feature_key],
    );
    if (fc.rowCount === 0) fail(`feature_costs[${feat.feature_key}] missing — restart Node so self-heal seeds it`);
    const { cost, is_active } = fc.rows[0];
    if (!is_active) fail(`${feat.feature_key} is_active=false — toggle to Paid in admin to test gating`);
    ok(`feature_costs row: cost=${cost}, is_active=true`);

    // Reset balance to 0 for this test feature
    await pool.query(`DELETE FROM coin_transactions WHERE user_id = $1`, [userId]);
    await pool.query(
      `UPDATE coin_balances SET balance = 0, lifetime_earned = 0, lifetime_spent = 0 WHERE user_id = $1`,
      [userId],
    );
    await pool.query(
      `INSERT INTO coin_balances (user_id, balance) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    // 1) With 0 coins: expect 402
    const r1 = await fetch(`${NODE_BASE}${feat.url}`, {
      method: feat.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: feat.body ? JSON.stringify(feat.body) : undefined,
    });
    const r1Body = await r1.text();
    if (r1.status !== 402) {
      fail(`expected 402 with 0 coins, got ${r1.status}`, r1Body.slice(0, 300));
    }
    let r1Json: any; try { r1Json = JSON.parse(r1Body); } catch {}
    if (r1Json?.code !== 'INSUFFICIENT_COINS') {
      fail(`expected code=INSUFFICIENT_COINS, got ${r1Json?.code}`, r1Json);
    }
    ok(`0 coins → 402 INSUFFICIENT_COINS (gate fired)`);

    // 2) Grant 100 coins
    await pool.query('BEGIN');
    await pool.query(
      `UPDATE coin_balances SET balance = 100, lifetime_earned = 100, updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    await pool.query(
      `INSERT INTO coin_transactions (user_id, type, amount, balance_after, idempotency_key)
       VALUES ($1, 'admin_grant', 100, 100, $2)`,
      [userId, `test-grant-${feat.feature_key}-${Date.now()}`],
    );
    await pool.query('COMMIT');

    // 3) With 100 coins: expect 200/202 (or 502 from Python proxy is OK — gate fired)
    const r2 = await fetch(`${NODE_BASE}${feat.url}`, {
      method: feat.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: feat.body ? JSON.stringify(feat.body) : undefined,
    });
    if (r2.status === 402) {
      fail(`gate still blocking with 100 coins`, await r2.text());
    }
    // Python may legitimately respond 200/202/400/etc. — the only thing that matters
    // for this test is that the gate let the request through and debited.

    // 4) Verify balance debited by exactly the configured cost
    const after = await pool.query<{ balance: number; lifetime_spent: number }>(
      `SELECT balance, lifetime_spent FROM coin_balances WHERE user_id = $1`,
      [userId],
    );
    const expected = 100 - cost;
    if (after.rows[0].balance !== expected) {
      fail(`expected balance=${expected} (100 - ${cost}), got ${after.rows[0].balance}; Python returned ${r2.status}`);
    }
    ok(`100 coins → request went through; balance debited 100→${after.rows[0].balance} (cost=${cost})`);

    // 5) Verify ledger has the debit row
    const debits = await pool.query<{ amount: number; feature_key: string }>(
      `SELECT amount, feature_key FROM coin_transactions
        WHERE user_id = $1 AND type = 'debit' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (debits.rowCount !== 1) fail('expected 1 debit row');
    if (debits.rows[0].amount !== -cost || debits.rows[0].feature_key !== feat.feature_key) {
      fail(`debit row mismatch`, debits.rows[0]);
    }
    ok(`ledger row: type=debit, amount=${-cost}, feature_key=${feat.feature_key}`);
  }

  step('Cleanup');
  await pool.query(`DELETE FROM sessions          WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM coin_transactions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM coin_balances    WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users            WHERE id      = $1`, [userId]);
  ok('test user removed');

  await pool.end();
  console.log('\n✓ ALL 3 NEW GATES VERIFIED — portfolio.optimize, fundamental_screener.run, pair_trading.run.');
}

main().catch((err) => { console.error('\n✗ TEST FAILED:', err); process.exit(1); });
