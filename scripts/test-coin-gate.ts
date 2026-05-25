/**
 * E2E test: coin gate on /api/expert-screener/start
 *
 * Run with:  npx tsx scripts/test-coin-gate.ts
 *
 * What it does:
 *   1. Connects to the auth DB.
 *   2. Cleans up any prior test user (email = 'coingate-test@local').
 *   3. Creates a fresh test user with a known password hash.
 *   4. Issues a JWT for that user.
 *   5. Reads feature_costs[screener.run] to confirm cost & is_active.
 *   6. Hits POST http://localhost:3000/api/expert-screener/start with 0 coins → expects 402.
 *   7. Grants 100 coins via direct DB mutation (mirrors what the admin grant API does).
 *   8. Hits the endpoint again → expects 200/202 + balance debited by 2.
 *   9. Reads coin_balances + coin_transactions to verify ledger state.
 *  10. Also queries the admin-style listing to confirm it's visible there.
 *
 * Exits non-zero on the first assertion failure.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const NODE_BASE = 'http://localhost:3000';
const TEST_EMAIL = 'coingate-test@local';
const TEST_USERNAME = 'coingate_test';
const TEST_PASSWORD = 'TestPass123!';

function ok(label: string) { console.log(`  ✓ ${label}`); }
function fail(label: string, detail?: any): never {
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error('    detail:', detail);
  process.exit(1);
}
function step(n: number, label: string) { console.log(`\n[${n}] ${label}`); }

async function main() {
  const pool = new Pool({
    host:     process.env.AUTH_DB_HOST,
    port:     parseInt(process.env.AUTH_DB_PORT || '5432', 10),
    database: process.env.AUTH_DB_NAME,
    user:     process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASSWORD,
    ssl:      false,
  });

  step(1, 'Setup: clean + create test user');
  await pool.query(`DELETE FROM coin_transactions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [TEST_EMAIL]);
  await pool.query(`DELETE FROM coin_balances    WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [TEST_EMAIL]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
  ok('cleaned prior test user (if any)');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, username, password_hash, tier, role, email_verified, terms_accepted)
     VALUES ($1, $2, $3, 'free', 'user', TRUE, TRUE)
     RETURNING id`,
    [TEST_EMAIL, TEST_USERNAME, passwordHash],
  );
  const userId = userResult.rows[0].id;
  ok(`created test user: ${TEST_EMAIL} (id=${userId})`);

  step(2, 'Verify feature_costs row');
  const fc = await pool.query<{ cost: number; is_active: boolean }>(
    `SELECT cost, is_active FROM feature_costs WHERE feature_key = 'screener.run'`,
  );
  if (fc.rowCount === 0) fail('feature_costs[screener.run] missing — restart server to run self-heal');
  const { cost, is_active } = fc.rows[0];
  ok(`feature_costs[screener.run] = { cost: ${cost}, is_active: ${is_active} }`);
  if (!is_active) fail('screener.run is_active=false — flip it back in admin to test the gate');
  if (cost <= 0) fail(`screener.run cost is ${cost}, expected > 0`);

  step(3, 'Issue JWT for test user');
  const token = jwt.sign(
    {
      userId,
      email: TEST_EMAIL,
      username: TEST_USERNAME,
      tier: 'free',
      role: 'user',
      provider: 'password',
      type: 'access',
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '1h',
      issuer: 'tiphub-auth',
      audience: 'tiphub-api',
    },
  );
  // requireAuth also looks up the session by SHA-256(token) — insert a matching row.
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const refreshHash = crypto.createHash('sha256').update(`refresh-${Date.now()}`).digest('hex');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, ip_address, device_info)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', '127.0.0.1'::inet, 'coingate-test/1.0')`,
    [userId, tokenHash, refreshHash],
  );
  ok(`access token issued (${token.length} chars) + session row created`);

  step(4, 'Hit /api/expert-screener/start with 0 coins → expect 402');
  const r1 = await fetch(`${NODE_BASE}/api/expert-screener/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ expression: 'rsi_14 < 30', timeframe: '1day' }),
  });
  const r1Body = await r1.text();
  if (r1.status !== 402) fail(`expected 402, got ${r1.status}`, r1Body);
  let r1Json: any;
  try { r1Json = JSON.parse(r1Body); } catch { /* ignore */ }
  if (r1Json?.code !== 'INSUFFICIENT_COINS') fail('expected code=INSUFFICIENT_COINS', r1Json);
  ok(`gate blocked the request: ${r1Json.message}`);

  step(5, 'Grant 100 coins (simulates admin grant)');
  await pool.query('BEGIN');
  await pool.query(
    `INSERT INTO coin_balances (user_id, balance, lifetime_earned)
     VALUES ($1, 100, 100)
     ON CONFLICT (user_id) DO UPDATE
     SET balance = coin_balances.balance + 100,
         lifetime_earned = coin_balances.lifetime_earned + 100,
         updated_at = NOW()`,
    [userId],
  );
  await pool.query(
    `INSERT INTO coin_transactions (user_id, type, amount, balance_after, idempotency_key, metadata)
     VALUES ($1, 'admin_grant', 100, 100, $2, $3)`,
    [userId, `test-grant-${Date.now()}`, JSON.stringify({ reason: 'e2e test seed' })],
  );
  await pool.query('COMMIT');
  ok('granted 100 coins + wrote ledger row');

  step(6, 'Read balance from /api/coins/balance');
  const balRes = await fetch(`${NODE_BASE}/api/coins/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!balRes.ok) fail(`/api/coins/balance returned ${balRes.status}`);
  const balJson = await balRes.json();
  const balance = balJson?.data?.balance;
  if (balance !== 100) fail(`expected balance=100, got ${balance}`, balJson);
  ok(`balance = 100`);

  step(7, 'Hit /api/expert-screener/start with 100 coins → expect 200/202');
  const r2 = await fetch(`${NODE_BASE}/api/expert-screener/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ expression: 'rsi_14 < 30', timeframe: '1day' }),
  });
  const r2Body = await r2.text();
  if (r2.status !== 200 && r2.status !== 202) fail(`expected 200/202, got ${r2.status}`, r2Body);
  ok(`screener accepted: status=${r2.status}`);

  step(8, 'Verify balance debited by exactly the configured cost');
  const after = await pool.query<{ balance: number; lifetime_spent: number }>(
    `SELECT balance, lifetime_spent FROM coin_balances WHERE user_id = $1`,
    [userId],
  );
  const expected = 100 - cost;
  if (after.rows[0].balance !== expected) {
    fail(`expected balance=${expected}, got ${after.rows[0].balance}`);
  }
  if (after.rows[0].lifetime_spent !== cost) {
    fail(`expected lifetime_spent=${cost}, got ${after.rows[0].lifetime_spent}`);
  }
  ok(`balance=${after.rows[0].balance} (was 100, debited ${cost}); lifetime_spent=${after.rows[0].lifetime_spent}`);

  step(9, 'Verify ledger has exactly 1 grant + 1 debit row for this user');
  const txns = await pool.query<{ type: string; amount: number; feature_key: string; balance_after: number }>(
    `SELECT type, amount, feature_key, balance_after
       FROM coin_transactions WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  if (txns.rowCount !== 2) fail(`expected 2 ledger rows, got ${txns.rowCount}`, txns.rows);
  if (txns.rows[0].type !== 'admin_grant' || txns.rows[0].amount !== 100) {
    fail('first row should be admin_grant +100', txns.rows[0]);
  }
  if (txns.rows[1].type !== 'debit' || txns.rows[1].amount !== -cost || txns.rows[1].feature_key !== 'screener.run') {
    fail(`second row should be debit -${cost} for screener.run`, txns.rows[1]);
  }
  ok('ledger rows: [admin_grant +100], [debit -2 screener.run]');

  step(10, 'Verify /api/coins/transactions returns the same rows');
  const txnsRes = await fetch(`${NODE_BASE}/api/coins/transactions?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!txnsRes.ok) fail(`/api/coins/transactions returned ${txnsRes.status}`);
  const txnsJson = await txnsRes.json();
  if ((txnsJson?.data?.length ?? 0) !== 2) {
    fail(`expected 2 txns from API, got ${txnsJson?.data?.length}`, txnsJson);
  }
  ok(`/api/coins/transactions returned 2 rows for the user`);

  step(11, 'Cleanup test user');
  await pool.query(`DELETE FROM sessions          WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM coin_transactions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM coin_balances    WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users            WHERE id      = $1`, [userId]);
  ok('test user removed');

  await pool.end();
  console.log('\n✓ ALL CHECKS PASSED — coin gate is enforcing correctly.');
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED:', err);
  process.exit(1);
});
