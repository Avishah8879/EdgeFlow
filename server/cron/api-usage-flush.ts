/**
 * API Usage Flush Cron
 *
 * Periodically flushes usage events from Redis to PostgreSQL.
 * Runs every 60 seconds. Events are buffered in Redis lists
 * (RPUSH) and batch-inserted into api_usage_log.
 */

import { getRedis } from '../lib/redis';
import { query } from '../db/auth-connection';

let flushInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Flush all pending usage events from Redis to PostgreSQL.
 */
async function flushUsageEvents(): Promise<number> {
  if (isRunning) return 0;
  isRunning = true;

  const redis = getRedis();
  if (!redis) {
    isRunning = false;
    return 0;
  }

  let totalFlushed = 0;

  try {
    // Scan for all api_usage:* keys
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'api_usage:*', 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) {
      isRunning = false;
      return 0;
    }

    for (const key of keys) {
      // Atomically read and clear: LRANGE + LTRIM
      const len = await redis.llen(key);
      if (len === 0) continue;

      // Read up to 500 events at a time
      const batchSize = Math.min(len, 500);
      const events = await redis.lrange(key, 0, batchSize - 1);
      await redis.ltrim(key, batchSize, -1);

      if (events.length === 0) continue;

      // Parse events and batch insert
      const rows: any[][] = [];
      for (const raw of events) {
        try {
          const e = JSON.parse(raw);
          rows.push([
            e.kid || null,  // api_key_id
            e.uid,          // user_id
            e.ep,           // endpoint
            e.m,            // method
            e.s || null,    // status_code (may not be set at validation time)
            e.ms || null,   // response_time_ms
            e.ip || null,   // ip_address
          ]);
        } catch { /* skip malformed events */ }
      }

      if (rows.length === 0) continue;

      // Build multi-row INSERT
      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const row of rows) {
        placeholders.push(`($${idx},$${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5},$${idx + 6})`);
        values.push(...row);
        idx += 7;
      }

      await query(
        `INSERT INTO api_usage_log (api_key_id, user_id, endpoint, method, status_code, response_time_ms, ip_address)
         VALUES ${placeholders.join(',')}`,
        values
      );

      totalFlushed += rows.length;
    }
  } catch (err: any) {
    console.error('[USAGE_FLUSH] Error flushing usage events:', err.message);
    // On DB failure, events are lost from Redis but that's acceptable for usage data
  } finally {
    isRunning = false;
  }

  if (totalFlushed > 0) {
    console.log(`[USAGE_FLUSH] Flushed ${totalFlushed} usage events to PostgreSQL`);
  }

  return totalFlushed;
}

/**
 * Delete usage log rows older than 90 days.
 * Runs once per day (called from initUsageFlushCron).
 */
async function cleanupOldUsageData(): Promise<void> {
  try {
    const result = await query(
      `DELETE FROM api_usage_log WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    const deleted = (result as any)?.rowCount ?? 0;
    if (deleted > 0) {
      console.log(`[USAGE_FLUSH] Cleaned up ${deleted} usage rows older than 90 days`);
    }
  } catch (err: any) {
    console.error('[USAGE_FLUSH] Error cleaning up old usage data:', err.message);
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the usage flush cron (every 60 seconds).
 */
export function initUsageFlushCron(): void {
  console.log('[USAGE_FLUSH] Initializing usage flush cron (every 60s)');
  flushInterval = setInterval(flushUsageEvents, 60_000);

  // Initial flush 10 seconds after startup
  setTimeout(flushUsageEvents, 10_000);

  // Data retention cleanup: once per day (86400s), first run 5 minutes after startup
  setTimeout(cleanupOldUsageData, 5 * 60_000);
  cleanupInterval = setInterval(cleanupOldUsageData, 24 * 60 * 60_000);
}

/**
 * Stop the usage flush cron.
 */
export function stopUsageFlushCron(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('[USAGE_FLUSH] Usage flush cron stopped');
}

/**
 * Manually trigger a flush (for testing/admin).
 */
export { flushUsageEvents };
