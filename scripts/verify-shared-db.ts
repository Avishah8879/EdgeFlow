import dotenv from 'dotenv';
import path from 'path';
import { Pool, type PoolConfig } from 'pg';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true });

type CheckResult = {
  db: string;
  user: string;
  users: string | null;
  sessions: string | null;
  platforms: string | null;
  tickers: string | null;
  ltp_live: string | null;
};

type SeedCheckResult = {
  option_flow_platforms: string;
  pinescript_platforms: string;
  feature_costs: string;
};

function cfg(prefix: 'DB' | 'AUTH_DB', ssl: boolean): PoolConfig {
  return {
    host: process.env[`${prefix}_HOST`],
    port: Number(process.env[`${prefix}_PORT`] || 5432),
    database: process.env[`${prefix}_NAME`],
    user: process.env[`${prefix}_USER`],
    password: process.env[`${prefix}_PASSWORD`],
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 20_000,
  };
}

async function checkOnce(label: string, config: PoolConfig): Promise<void> {
  const pool = new Pool(config);
  try {
    const result = await pool.query<CheckResult>(`
      SELECT
        current_database() AS db,
        current_user AS "user",
        to_regclass('public.users') AS users,
        to_regclass('public.sessions') AS sessions,
        to_regclass('public.platforms') AS platforms,
        to_regclass('public.tickers') AS tickers,
        to_regclass('public.ltp_live') AS ltp_live
    `);
    console.log(`${label}:`, JSON.stringify(result.rows[0]));

    const seedResult = await pool.query<SeedCheckResult>(`
      SELECT
        (SELECT COUNT(*) FROM platforms WHERE slug = 'option-flow') AS option_flow_platforms,
        (SELECT COUNT(*) FROM platforms WHERE slug = 'pinescript-ai') AS pinescript_platforms,
        (SELECT COUNT(*) FROM feature_costs) AS feature_costs
    `);
    console.log(`${label} seeds:`, JSON.stringify(seedResult.rows[0]));
  } finally {
    await pool.end();
  }
}

async function check(label: string, prefix: 'DB' | 'AUTH_DB'): Promise<void> {
  try {
    await checkOnce(`${label} ssl=false`, cfg(prefix, false));
    return;
  } catch (error: any) {
    console.warn(`${label} ssl=false failed: ${error.message}`);
  }
  await checkOnce(`${label} ssl=true`, cfg(prefix, true));
}

async function main(): Promise<void> {
  await check('market', 'DB');
  await check('auth', 'AUTH_DB');
}

main().catch((error) => {
  console.error('DB verification failed:', error.message);
  process.exit(1);
});
