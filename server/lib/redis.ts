/**
 * Node.js Redis Client (Singleton)
 *
 * Used by the API key system for:
 * - Key validation caching (5-min TTL)
 * - Rate limiting counters
 * - Usage event buffering (RPUSH → batch flush to PostgreSQL)
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

let redis: Redis | null = null;
let isConnected = false;

/**
 * Get or create the singleton Redis connection.
 * Returns null if Redis is unavailable (graceful degradation).
 */
export function getRedis(): Redis | null {
  if (redis) return redis;

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // Stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
      enableOfflineQueue: true,
      connectTimeout: 5000,
    });

    redis.on('connect', () => {
      isConnected = true;
      console.log('[REDIS-NODE] Connected to Redis');
    });

    redis.on('error', (err) => {
      if (isConnected) {
        console.error('[REDIS-NODE] Redis error:', err.message);
      }
      isConnected = false;
    });

    redis.on('close', () => {
      isConnected = false;
    });

    return redis;
  } catch (err: any) {
    console.error('[REDIS-NODE] Failed to create Redis client:', err.message);
    redis = null;
    return null;
  }
}

/**
 * Check if Redis is connected and responsive.
 */
export function isRedisConnected(): boolean {
  return isConnected && redis !== null;
}

/**
 * Close Redis connection (for graceful shutdown).
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
    console.log('[REDIS-NODE] Connection closed');
  }
}

/** Alias for FinTerminal compatibility */
export const getRedisClient = getRedis;

export default getRedis;
