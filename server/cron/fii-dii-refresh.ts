import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { backfillFiiDiiHistoryIfNeeded, refreshFiiDiiFromNse } from '../fii-dii-nse';

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

async function runFiiDiiRefresh(): Promise<void> {
  if (isRunning) {
    console.log('[FII_DII_CRON] Refresh already running, skipping');
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  try {
    await backfillFiiDiiHistoryIfNeeded();
    console.log('[FII_DII_CRON] Refreshing NSE provisional FII/DII data...');
    const rows = await refreshFiiDiiFromNse();
    console.log(`[FII_DII_CRON] Refreshed ${rows.length} FII/DII rows in ${Date.now() - startedAt}ms`);
  } catch (error: any) {
    console.error(`[FII_DII_CRON] Refresh failed: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

export function initFiiDiiRefreshCron(): void {
  if (scheduledTask) return;

  scheduledTask = cron.schedule('0 19 * * 1-5', runFiiDiiRefresh, {
    timezone: 'Asia/Kolkata',
  });

  console.log('[FII_DII_CRON] Scheduled weekday refresh at 19:00 IST');
  void backfillFiiDiiHistoryIfNeeded().catch((error: any) => {
    console.warn(`[FII_DII_CRON] Startup backfill skipped: ${error.message}`);
  });
}

export function stopFiiDiiRefreshCron(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[FII_DII_CRON] Stopped');
  }
}

export async function triggerFiiDiiRefresh(): Promise<void> {
  await runFiiDiiRefresh();
}
