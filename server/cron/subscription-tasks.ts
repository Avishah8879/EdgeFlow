/**
 * Subscription Cron Tasks
 *
 * Scheduled tasks for subscription lifecycle management:
 * - Expire ended trials (users with trial_end < NOW())
 * - Expire ended subscriptions (users with subscription_end < NOW() and cancel_at_period_end)
 *
 * Runs every hour by default.
 */

import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import {
  expireEndedTrials,
  expireEndedSubscriptions,
} from '../db/subscription-store';

let isRunning = false;

/**
 * Run subscription expiration checks
 * This is the main task that expires trials and subscriptions
 */
async function runExpirationChecks(): Promise<void> {
  if (isRunning) {
    console.log('[CRON] Subscription expiration check already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[CRON] Starting subscription expiration checks...');

    // Expire ended trials
    const expiredTrials = await expireEndedTrials();
    if (expiredTrials > 0) {
      console.log(`[CRON] Expired ${expiredTrials} trial(s)`);
    }

    // Expire ended subscriptions
    const expiredSubs = await expireEndedSubscriptions();
    if (expiredSubs > 0) {
      console.log(`[CRON] Expired ${expiredSubs} subscription(s)`);
    }

    const duration = Date.now() - startTime;
    console.log(`[CRON] Subscription expiration checks completed in ${duration}ms`);
  } catch (error) {
    console.error('[CRON] Error during subscription expiration checks:', error);
  } finally {
    isRunning = false;
  }
}

// Store scheduled task reference for cleanup
let scheduledTask: ScheduledTask | null = null;

/**
 * Initialize subscription cron jobs
 *
 * Schedule:
 * - Expiration checks: Every hour at minute 0 (0 * * * *)
 *
 * In production, you might want to run more frequently (e.g., every 15 minutes)
 * to ensure timely expiration of trials.
 */
export function initSubscriptionCronJobs(): void {
  console.log('[CRON] Initializing subscription cron jobs...');

  // Run expiration checks every hour at minute 0
  // Cron pattern: minute hour day month weekday
  // '0 * * * *' = at minute 0 of every hour
  scheduledTask = cron.schedule('0 * * * *', async () => {
    await runExpirationChecks();
  }, {
    timezone: 'Asia/Kolkata', // Use IST for Indian market
  });

  console.log('[CRON] Subscription expiration checks scheduled (hourly at :00)');

  // Run immediately on startup to catch any expired trials/subscriptions
  // that may have expired while the server was down
  setTimeout(async () => {
    console.log('[CRON] Running initial subscription expiration check...');
    await runExpirationChecks();
  }, 5000); // Wait 5 seconds after startup for database connection to stabilize
}

/**
 * Stop all subscription cron jobs
 * Call this during graceful shutdown
 */
export function stopSubscriptionCronJobs(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[CRON] Subscription cron jobs stopped');
  }
}

/**
 * Manually trigger expiration checks
 * Useful for testing or admin operations
 */
export async function triggerExpirationChecks(): Promise<{
  expiredTrials: number;
  expiredSubscriptions: number;
}> {
  console.log('[CRON] Manual expiration check triggered');

  const expiredTrials = await expireEndedTrials();
  const expiredSubscriptions = await expireEndedSubscriptions();

  return { expiredTrials, expiredSubscriptions };
}

export default {
  init: initSubscriptionCronJobs,
  stop: stopSubscriptionCronJobs,
  trigger: triggerExpirationChecks,
};
