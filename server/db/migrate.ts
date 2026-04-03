/**
 * Database Migration Runner for Tiphub_auth Database
 *
 * This script runs SQL migrations against the authentication database.
 * Usage: tsx server/db/migrate.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: join(process.cwd(), envFile) });

// Validate required environment variables
if (!process.env.AUTH_DB_HOST || !process.env.AUTH_DB_PASSWORD) {
  console.error('[MIGRATION] ERROR: AUTH_DB_HOST and AUTH_DB_PASSWORD environment variables are required');
  process.exit(1);
}

// Database configuration for Tiphub_auth
const authDbConfig = {
  host: process.env.AUTH_DB_HOST,
  port: parseInt(process.env.AUTH_DB_PORT || '5432'),
  database: process.env.AUTH_DB_NAME || 'Tiphub_auth',
  user: process.env.AUTH_DB_USER || 'postgres',
  password: process.env.AUTH_DB_PASSWORD,
  ssl: false, // Set to true if using SSL
  connectionTimeoutMillis: 10000,
};

console.log('[MIGRATION] Loaded environment from:', envFile);
console.log('[MIGRATION] Connecting to database:', {
  host: authDbConfig.host,
  port: authDbConfig.port,
  database: authDbConfig.database,
  user: authDbConfig.user,
});

/**
 * Create migration history table to track applied migrations
 */
async function createMigrationTable(pool: Pool): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS migration_history (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      success BOOLEAN DEFAULT TRUE,
      error_message TEXT
    );
  `;

  await pool.query(query);
  console.log('[MIGRATION] Migration history table ready');
}

/**
 * Check if a migration has already been applied
 */
async function isMigrationApplied(pool: Pool, migrationName: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT id FROM migration_history WHERE migration_name = $1',
    [migrationName]
  );
  return result.rows.length > 0;
}

/**
 * Record migration in history
 */
async function recordMigration(
  pool: Pool,
  migrationName: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await pool.query(
    'INSERT INTO migration_history (migration_name, success, error_message) VALUES ($1, $2, $3)',
    [migrationName, success, errorMessage]
  );
}

/**
 * Run a single migration file
 */
async function runMigration(pool: Pool, migrationPath: string, migrationName: string): Promise<boolean> {
  console.log(`\n[MIGRATION] Running: ${migrationName}`);

  try {
    // Read SQL file
    const sql = readFileSync(migrationPath, 'utf-8');

    // Execute migration in a transaction
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('COMMIT');

    // Record success
    await recordMigration(pool, migrationName, true);
    console.log(`[MIGRATION] ✓ Success: ${migrationName}`);
    return true;

  } catch (error: any) {
    // Rollback on error
    await pool.query('ROLLBACK');

    // Record failure
    await recordMigration(pool, migrationName, false, error.message);
    console.error(`[MIGRATION] ✗ Failed: ${migrationName}`);
    console.error(`[MIGRATION] Error: ${error.message}`);
    return false;
  }
}

/**
 * Main migration runner
 */
async function runMigrations() {
  const pool = new Pool(authDbConfig);

  try {
    // Test connection
    console.log('[MIGRATION] Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('[MIGRATION] ✓ Connected successfully at:', testResult.rows[0].now);

    // Create migration history table
    await createMigrationTable(pool);

    // Get all migration files from migrations/ folder (auth migrations only)
    const migrationsDir = join(process.cwd(), 'migrations');
    const allFiles = readdirSync(migrationsDir);

    // Filter for auth migration files (004_create_auth_tables.sql and future auth migrations)
    const migrationFiles = allFiles
      .filter(file => {
        if (!file.endsWith('.sql')) return false;
        const num = parseInt(file.split('_')[0]);
        return num >= 4; // Include migrations 004 and above (auth migrations)
      })
      .sort(); // Sort to ensure order

    if (migrationFiles.length === 0) {
      console.log('[MIGRATION] No auth migration files found in migrations/ folder');
      console.log('[MIGRATION] Looking for files numbered 004 and above (auth migrations)');
      return;
    }

    console.log(`\n[MIGRATION] Found ${migrationFiles.length} auth migration file(s)`);

    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Run each migration
    for (const file of migrationFiles) {
      const migrationPath = join(migrationsDir, file);

      // Check if already applied
      if (await isMigrationApplied(pool, file)) {
        console.log(`[MIGRATION] ⊘ Skipped (already applied): ${file}`);
        skippedCount++;
        continue;
      }

      // Run migration
      const success = await runMigration(pool, migrationPath, file);
      if (success) {
        appliedCount++;
      } else {
        failedCount++;
        // Stop on first failure
        break;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('[MIGRATION] Summary:');
    console.log(`  Applied: ${appliedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Failed:  ${failedCount}`);
    console.log('='.repeat(60));

    if (failedCount > 0) {
      console.log('\n[MIGRATION] ⚠️  Migration failed. Please fix errors and run again.');
      process.exit(1);
    } else {
      console.log('\n[MIGRATION] ✓ All migrations completed successfully!');
      process.exit(0);
    }

  } catch (error: any) {
    console.error('\n[MIGRATION] Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();
