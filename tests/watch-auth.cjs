#!/usr/bin/env node
/**
 * tests/watch-auth.cjs - real-time auth_logs tail for SSO debugging.
 *
 * CommonJS (.cjs) so it works despite "type":"module" in package.json.
 * Loads EdgeFlow/.env via an absolute path derived from __dirname, so it
 * runs identically from ANY working directory.
 *
 * Run from anywhere:
 *   node C:/Users/admin/Desktop/acequant/EdgeFlow/tests/watch-auth.cjs
 *
 * Ctrl+C to stop.
 */
'use strict';

const path = require('path');
const ENV_PATH = path.resolve(__dirname, '..', '.env.development');

const dotenvResult = require('dotenv').config({ path: ENV_PATH, quiet: true });
if (dotenvResult.error) {
  console.error('[watch-auth] could not load .env.development at ' + ENV_PATH);
  console.error('[watch-auth] ' + dotenvResult.error.message);
  process.exit(1);
}

const required = ['AUTH_DB_HOST', 'AUTH_DB_PORT', 'AUTH_DB_NAME', 'AUTH_DB_USER', 'AUTH_DB_PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[watch-auth] missing env vars in ' + ENV_PATH + ': ' + missing.join(', '));
  process.exit(1);
}

const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.AUTH_DB_HOST,
  port: parseInt(process.env.AUTH_DB_PORT, 10),
  database: process.env.AUTH_DB_NAME,
  user: process.env.AUTH_DB_USER,
  password: process.env.AUTH_DB_PASSWORD,
  connectionTimeoutMillis: 10000,
});

const SQL =
  'SELECT id, created_at, event_type, provider, success, ip_address, failure_reason, user_id ' +
  'FROM auth_logs WHERE id > $1 ORDER BY id ASC';

let lastId = 0;
let polling = false;

function fmt(row) {
  return [
    new Date(row.created_at).toISOString(),
    '#' + row.id,
    row.event_type,
    'success=' + row.success,
    row.provider || '-',
    row.ip_address || '-',
    'user=' + (row.user_id || '-'),
    row.failure_reason ? 'reason=' + row.failure_reason : '',
  ].join('  ');
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const { rows } = await pool.query(SQL, [lastId]);
    for (const row of rows) {
      lastId = row.id;
      console.log(fmt(row));
    }
  } catch (err) {
    console.error('[watch-auth] poll error: ' + err.message);
  } finally {
    polling = false;
  }
}

async function main() {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) AS m FROM auth_logs');
    lastId = Number(rows[0].m);
  } catch (err) {
    console.error(
      '[watch-auth] cannot connect to ' +
        process.env.AUTH_DB_USER + '@' + process.env.AUTH_DB_HOST + ':' +
        process.env.AUTH_DB_PORT + '/' + process.env.AUTH_DB_NAME
    );
    console.error('[watch-auth] ' + err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
  }

  console.error(
    '[watch-auth] connected. tailing auth_logs from id=' + lastId + ' every 2s - Ctrl+C to stop'
  );
  const timer = setInterval(poll, 2000);

  function shutdown() {
    clearInterval(timer);
    console.error('\n[watch-auth] stopping...');
    pool.end().then(() => process.exit(0)).catch(() => process.exit(0));
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
