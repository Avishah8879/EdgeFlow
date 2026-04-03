/**
 * Authentication Database Connection Pool
 *
 * Manages PostgreSQL connections to the Tiphub_auth database.
 * Separate from the main financial database connection.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';

// Validate required environment variables
if (!process.env.AUTH_DB_HOST || !process.env.AUTH_DB_PASSWORD) {
  throw new Error('[AUTH_DB] AUTH_DB_HOST and AUTH_DB_PASSWORD environment variables are required');
}

// Database configuration for Tiphub_auth
const authDbConfig: PoolConfig = {
  host: process.env.AUTH_DB_HOST,
  port: parseInt(process.env.AUTH_DB_PORT || '5432'),
  database: process.env.AUTH_DB_NAME || 'Tiphub_auth',
  user: process.env.AUTH_DB_USER || 'postgres',
  password: process.env.AUTH_DB_PASSWORD,

  // Connection pool settings
  max: 50, // Maximum number of clients in the pool (increased for API key validation at scale)
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established

  // Keep-alive settings to prevent connection drops from firewall/DB server
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // Start keep-alive probes after 10 seconds idle

  // SSL configuration (set to true for production)
  ssl: false,
};

// Singleton pool instance
let authPool: Pool | null = null;

/**
 * Get or create the authentication database pool
 */
export function getAuthDbPool(): Pool {
  if (!authPool) {
    authPool = new Pool(authDbConfig);

    // Log pool errors
    authPool.on('error', (err, client) => {
      console.error('[AUTH_DB] Unexpected error on idle client', err);
    });

    // Log when pool is connecting
    authPool.on('connect', (client) => {
      console.log('[AUTH_DB] New client connected to pool');
    });

    // Log when client is removed from pool
    authPool.on('remove', (client) => {
      console.log('[AUTH_DB] Client removed from pool');
    });

    console.log('[AUTH_DB] Connection pool initialized:', {
      host: authDbConfig.host,
      port: authDbConfig.port,
      database: authDbConfig.database,
      max: authDbConfig.max,
    });
  }

  return authPool;
}

/**
 * Test database connection
 */
export async function testAuthDbConnection(): Promise<boolean> {
  const pool = getAuthDbPool();

  try {
    const result = await pool.query('SELECT NOW()');
    console.log('[AUTH_DB] Connection test successful at:', result.rows[0].now);
    return true;
  } catch (error: any) {
    console.error('[AUTH_DB] Connection test failed:', error.message);
    return false;
  }
}

/**
 * Execute a query with automatic error handling
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getAuthDbPool();

  try {
    const result = await pool.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  } catch (error: any) {
    console.error('[AUTH_DB] Query error:', error.message);
    console.error('[AUTH_DB] Query:', text);
    console.error('[AUTH_DB] Params:', params);
    throw error;
  }
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getAuthDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats() {
  if (!authPool) {
    return null;
  }

  return {
    totalCount: authPool.totalCount,
    idleCount: authPool.idleCount,
    waitingCount: authPool.waitingCount,
  };
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closeAuthDbPool(): Promise<void> {
  if (authPool) {
    await authPool.end();
    authPool = null;
    console.log('[AUTH_DB] Connection pool closed');
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGTERM', async () => {
  console.log('[AUTH_DB] SIGTERM received, closing pool...');
  await closeAuthDbPool();
});

process.on('SIGINT', async () => {
  console.log('[AUTH_DB] SIGINT received, closing pool...');
  await closeAuthDbPool();
});

// Export default pool getter
export default getAuthDbPool;
