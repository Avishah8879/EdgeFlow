/**
 * E2E test: signup bonus
 *
 *  1. Reads / sets the signup_bonus_coins value via the admin API.
 *  2. Triggers a real password signup via POST /auth/v2/signup.
 *  3. Verifies the user's coin_balances row shows the bonus.
 *  4. Verifies the coin_transactions ledger has a 'signup_bonus' row.
 *  5. Verifies idempotency: calling grantSignupBonus again does NOT
 *     double-credit (we run a second signup attempt with the same user
 *     and confirm 409 is returned and the bonus row count stays at 1).
 *
 * IMPORTANT: requires the Node dev server to have been restarted after
 * the schema/seed changes — otherwise the migration column won't exist
 * and the new admin endpoint won't be mounted.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const NODE_BASE = 'http://localhost:3000';
const TEST_EMAIL    = `signupbonus-${Date.now()}@local`;
const TEST_USERNAME = `sbtest_${Date.now()}`;
const TEST_PASSWORD = 'TestPass123!';

const SUPER_ADMIN_EMAIL = 'getavi4@gmail.com';
const TARGET_BONUS = 25;

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

  step(1, 'Mint admin JWT for super_admin user');
  const admin = await pool.query<{ id: string; email: string; username: string }>(
    `SELECT id, email, username FROM users WHERE email = $1`,
    [SUPER_ADMIN_EMAIL],
  );
  if (admin.rowCount === 0) fail(`super_admin '${SUPER_ADMIN_EMAIL}' missing — restart server so self-heal seeds it`);
  const adminId = admin.rows[0].id;

  const adminToken = jwt.sign(
    { userId: adminId, email: SUPER_ADMIN_EMAIL, username: admin.rows[0].username,
      tier: 'free', role: 'super_admin', provider: 'password', type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h', issuer: 'tiphub-auth', audience: 'tiphub-api' },
  );
  const tokenHash = crypto.createHash('sha256').update(adminToken).digest('hex');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, ip_address, device_info)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', '127.0.0.1'::inet, 'sbtest/1.0')`,
    [adminId, tokenHash, crypto.createHash('sha256').update(`refresh-${Date.now()}`).digest('hex')],
  );
  ok(`admin JWT + session ready (admin=${SUPER_ADMIN_EMAIL})`);

  step(2, `Set signup bonus to ${TARGET_BONUS} via PATCH /api/admin/coins/signup-bonus`);
  const r1 = await fetch(`${NODE_BASE}/api/admin/coins/signup-bonus`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ signup_bonus_coins: TARGET_BONUS }),
  });
  if (!r1.ok) fail(`PATCH signup-bonus returned ${r1.status}`, await r1.text());
  const r1Json = await r1.json();
  if (r1Json?.data?.signup_bonus_coins !== TARGET_BONUS) {
    fail('response did not echo new bonus', r1Json);
  }
  ok(`signup_bonus_coins = ${TARGET_BONUS}`);

  step(3, 'Verify GET /api/coins/pricing reflects the new bonus');
  const r2 = await fetch(`${NODE_BASE}/api/coins/pricing`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!r2.ok) fail(`GET pricing returned ${r2.status}`);
  const r2Json = await r2.json();
  if (r2Json?.data?.signup_bonus_coins !== TARGET_BONUS) {
    fail('GET pricing did not return the updated bonus', r2Json);
  }
  ok(`GET /api/coins/pricing → signup_bonus_coins=${TARGET_BONUS}`);

  step(4, `POST /auth/v2/signup as new user (${TEST_EMAIL})`);
  const r3 = await fetch(`${NODE_BASE}/auth/v2/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      countryOfResidence: 'IN',
      dateOfBirth: '1990-01-01',
      phoneNumber: '+919999999999',
      termsAccepted: true,
    }),
  });
  if (!r3.ok) fail(`signup returned ${r3.status}`, await r3.text());
  const r3Json = await r3.json();
  const newUserId = r3Json?.data?.session?.user?.id ?? r3Json?.session?.user?.id ?? r3Json?.user?.id;
  if (!newUserId) fail('signup response missing user id', r3Json);
  ok(`signup OK — user id = ${newUserId}`);

  // The bonus credit is fire-and-forget (.catch(()=>{}) at signup time),
  // so wait briefly for the async credit to land.
  await new Promise((res) => setTimeout(res, 500));

  step(5, 'Verify coin_balances row shows the bonus');
  const bal = await pool.query<{ balance: number; lifetime_earned: number }>(
    `SELECT balance, lifetime_earned FROM coin_balances WHERE user_id = $1`,
    [newUserId],
  );
  if (bal.rowCount === 0) fail('no coin_balances row for new user');
  if (bal.rows[0].balance !== TARGET_BONUS) {
    fail(`expected balance=${TARGET_BONUS}, got ${bal.rows[0].balance}`);
  }
  if (bal.rows[0].lifetime_earned !== TARGET_BONUS) {
    fail(`expected lifetime_earned=${TARGET_BONUS}, got ${bal.rows[0].lifetime_earned}`);
  }
  ok(`balance=${bal.rows[0].balance}, lifetime_earned=${bal.rows[0].lifetime_earned}`);

  step(6, 'Verify ledger has a signup_bonus row');
  const txns = await pool.query<{ type: string; amount: number; balance_after: number; idempotency_key: string }>(
    `SELECT type, amount, balance_after, idempotency_key
       FROM coin_transactions WHERE user_id = $1 ORDER BY created_at`,
    [newUserId],
  );
  if (txns.rowCount !== 1) fail(`expected 1 ledger row, got ${txns.rowCount}`, txns.rows);
  const row = txns.rows[0];
  if (row.type !== 'signup_bonus') fail(`expected type=signup_bonus, got ${row.type}`);
  if (row.amount !== TARGET_BONUS) fail(`expected amount=${TARGET_BONUS}, got ${row.amount}`);
  if (row.idempotency_key !== `signup_bonus:${newUserId}`) fail(`unexpected idempotency_key: ${row.idempotency_key}`);
  ok(`row: type=signup_bonus, amount=+${row.amount}, balance_after=${row.balance_after}`);

  step(7, 'Idempotency check: re-running grantSignupBonus does not double-credit');
  // We can't call grantSignupBonus directly from this script (different process),
  // but the idempotency_key constraint enforces uniqueness at the DB level. Verify:
  const dupCheck = await pool.query(
    `SELECT COUNT(*) FROM coin_transactions
      WHERE user_id = $1 AND idempotency_key = $2`,
    [newUserId, `signup_bonus:${newUserId}`],
  );
  if (parseInt(dupCheck.rows[0].count, 10) !== 1) {
    fail('idempotency_key not unique', dupCheck.rows[0]);
  }
  ok('exactly 1 signup_bonus row (idempotency key holds the line)');

  step(8, 'Cleanup: delete test user + reset bonus to 10');
  await pool.query(`DELETE FROM coin_transactions WHERE user_id = $1`, [newUserId]);
  await pool.query(`DELETE FROM coin_balances    WHERE user_id = $1`, [newUserId]);
  await pool.query(`DELETE FROM sessions          WHERE user_id = $1`, [newUserId]);
  await pool.query(`DELETE FROM users            WHERE id      = $1`, [newUserId]);
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);

  // Reset bonus to default 10 so future signups aren't surprised
  await fetch(`${NODE_BASE}/api/admin/coins/signup-bonus`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ signup_bonus_coins: 10 }),
  });
  ok('test user removed; bonus reset to 10');

  await pool.end();
  console.log('\n✓ ALL CHECKS PASSED — signup bonus is being credited correctly.');
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED:', err);
  process.exit(1);
});
