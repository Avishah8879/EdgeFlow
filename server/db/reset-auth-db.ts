/**
 * Reset Authentication Database
 *
 * WARNING: This script will DELETE ALL DATA from the authentication database!
 * - All users will be removed
 * - All sessions will be removed
 * - All auth logs will be removed
 * - Migration history will be preserved
 *
 * Use this for testing/development only!
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { join } from 'path';
import readline from 'readline';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: join(process.cwd(), envFile) });

// Validate required environment variables
if (!process.env.AUTH_DB_HOST || !process.env.AUTH_DB_PASSWORD) {
  console.error('[RESET] ERROR: AUTH_DB_HOST and AUTH_DB_PASSWORD environment variables are required');
  process.exit(1);
}

// Database configuration for Tiphub_auth
const authDbConfig = {
  host: process.env.AUTH_DB_HOST,
  port: parseInt(process.env.AUTH_DB_PORT || '5432'),
  database: process.env.AUTH_DB_NAME || 'Tiphub_auth',
  user: process.env.AUTH_DB_USER || 'postgres',
  password: process.env.AUTH_DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
};

console.log('[RESET] Loaded environment from:', envFile);
console.log('[RESET] Target database:', {
  host: authDbConfig.host,
  port: authDbConfig.port,
  database: authDbConfig.database,
  user: authDbConfig.user,
});

/**
 * Prompt user for confirmation
 */
async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE ALL USERS, SESSIONS, and AUTH LOGS!\n' +
      'Are you sure you want to reset the auth database? (yes/no): ',
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      }
    );
  });
}

/**
 * Reset all auth tables
 */
async function resetAuthDatabase() {
  const pool = new Pool(authDbConfig);

  try {
    // Test connection
    console.log('\n[RESET] Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('[RESET] ✓ Connected successfully at:', testResult.rows[0].now);

    // Get confirmation
    const confirmed = await confirmReset();

    if (!confirmed) {
      console.log('\n[RESET] ✗ Reset cancelled by user');
      process.exit(0);
    }

    console.log('\n[RESET] Starting database reset...\n');

    // Count existing records
    const userCountResult = await pool.query('SELECT COUNT(*) FROM users');
    const sessionCountResult = await pool.query('SELECT COUNT(*) FROM sessions');
    const logCountResult = await pool.query('SELECT COUNT(*) FROM auth_logs');

    console.log('[RESET] Current records:');
    console.log(`  Users: ${userCountResult.rows[0].count}`);
    console.log(`  Sessions: ${sessionCountResult.rows[0].count}`);
    console.log(`  Auth Logs: ${logCountResult.rows[0].count}`);

    // Delete all data (in correct order due to foreign keys)
    console.log('\n[RESET] Deleting data...');

    await pool.query('DELETE FROM sessions');
    console.log('[RESET] ✓ Deleted all sessions');

    await pool.query('DELETE FROM auth_logs');
    console.log('[RESET] ✓ Deleted all auth logs');

    await pool.query('DELETE FROM oauth_accounts');
    console.log('[RESET] ✓ Deleted all OAuth accounts');

    await pool.query('DELETE FROM users');
    console.log('[RESET] ✓ Deleted all users');

    // Reset sequences (auto-increment counters)
    await pool.query('ALTER SEQUENCE IF EXISTS auth_logs_id_seq RESTART WITH 1');
    console.log('[RESET] ✓ Reset auth_logs sequence');

    // Verify deletion
    const finalUserCount = await pool.query('SELECT COUNT(*) FROM users');
    const finalSessionCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const finalLogCount = await pool.query('SELECT COUNT(*) FROM auth_logs');

    console.log('\n[RESET] Final counts:');
    console.log(`  Users: ${finalUserCount.rows[0].count}`);
    console.log(`  Sessions: ${finalSessionCount.rows[0].count}`);
    console.log(`  Auth Logs: ${finalLogCount.rows[0].count}`);

    console.log('\n' + '='.repeat(60));
    console.log('[RESET] ✓ Database reset completed successfully!');
    console.log('[RESET] You can now register new users.');
    console.log('='.repeat(60) + '\n');

    process.exit(0);

  } catch (error: any) {
    console.error('\n[RESET] ✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run reset
resetAuthDatabase();
