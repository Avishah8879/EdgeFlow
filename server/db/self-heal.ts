/**
 * Self-healing schema migrations.
 *
 * Idempotent SQL that runs on server startup to fix schema drift between
 * the migrations folder and the live RGX_Auth database. Each block is
 * safe to run repeatedly.
 *
 * Add a new block here (rather than a new migration file) when:
 *   - A constraint or default got out of sync between dev and prod
 *   - You can't run psql on the DB host directly
 *
 * Each block logs a single line so it's visible in dev logs but not noisy.
 */

import { query } from './auth-connection';

interface HealingStep {
  name: string;
  /** Returns `true` if a fix was applied, `false` if no-op. */
  run: () => Promise<boolean>;
}

const STEPS: HealingStep[] = [
  {
    name: 'check_tier constraint = (free, semi, pro)',
    run: async () => {
      const def = await query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conname = 'check_tier' AND conrelid = 'users'::regclass`,
      );
      const current = def.rows[0]?.def ?? '';
      // Already correct?
      if (current.includes("'free'") && current.includes("'semi'") && current.includes("'pro'")) {
        return false;
      }
      // Otherwise normalize and rebuild
      await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS check_tier`);
      await query(`UPDATE users SET tier = 'free' WHERE tier NOT IN ('free','semi','pro')`);
      await query(`ALTER TABLE users ADD CONSTRAINT check_tier CHECK (tier IN ('free','semi','pro'))`);
      await query(`ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'free'`);
      return true;
    },
  },
];

/**
 * Run all healing steps. Errors are logged but never throw — the server
 * should still start if a step fails.
 */
export async function runSelfHealingMigrations(): Promise<void> {
  for (const step of STEPS) {
    try {
      const applied = await step.run();
      if (applied) {
        console.log(`[SELF_HEAL] ✓ Applied: ${step.name}`);
      }
    } catch (err: any) {
      console.warn(`[SELF_HEAL] ✗ Skipped ${step.name}: ${err.message}`);
    }
  }
}
