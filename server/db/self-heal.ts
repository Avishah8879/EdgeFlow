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

// Emails to promote to super_admin on every startup. Idempotent — if the
// row is already super_admin, nothing happens. If the email hasn't signed
// up yet, the step is a no-op and will succeed on the next restart after
// they register.
const SEEDED_SUPER_ADMINS = ['getavi4@gmail.com'];

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
  {
    name: `seed super_admin: ${SEEDED_SUPER_ADMINS.join(', ')}`,
    run: async () => {
      let promoted = 0;
      for (const email of SEEDED_SUPER_ADMINS) {
        const result = await query(
          `UPDATE users
             SET role = 'super_admin'
           WHERE LOWER(email) = LOWER($1)
             AND (role IS NULL OR role <> 'super_admin')`,
          [email],
        );
        if (result.rowCount && result.rowCount > 0) {
          promoted += result.rowCount;
          console.log(`[SELF_HEAL] ↑ Promoted ${email} → super_admin`);
        }
      }
      return promoted > 0;
    },
  },
  {
    name: 'wallet schema (platforms + coins + payment_intents)',
    run: async () => {
      // Mirrors migrations 024 (platforms only — needed as FK target),
      // 026 (coin wallet) and 027 (payment intents). Every statement is
      // idempotent (IF NOT EXISTS / ON CONFLICT / DO blocks for enums).
      let createdSomething = false;

      const tableExists = async (name: string): Promise<boolean> => {
        const r = await query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.tables WHERE table_name = $1
           ) AS exists`,
          [name],
        );
        return Boolean(r.rows[0]?.exists);
      };

      // ── platforms (FK target for coin_transactions / payment_intents) ──
      if (!(await tableExists('platforms'))) {
        await query(`
          CREATE TABLE platforms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            slug VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(
          `INSERT INTO platforms (slug, name, description, is_active)
           VALUES ('equitypro', 'EquityPro', 'Indian stock analysis platform', TRUE)
           ON CONFLICT (slug) DO NOTHING`,
        );
        console.log('[SELF_HEAL]   • Created platforms (+ equitypro seed)');
        createdSomething = true;
      }

      // ── platform_api_keys (HMAC creds per platform; mig 024) ──
      if (!(await tableExists('platform_api_keys'))) {
        await query(`
          CREATE TABLE platform_api_keys (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
            name            VARCHAR(120) NOT NULL,
            key_prefix      VARCHAR(12) NOT NULL,
            key_hash        VARCHAR(64) NOT NULL UNIQUE,
            secret_hash     VARCHAR(64) NOT NULL,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            last_used_at    TIMESTAMPTZ,
            last_used_ip    VARCHAR(45),
            created_by      UUID REFERENCES users(id),
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            revoked_at      TIMESTAMPTZ,
            revoked_reason  TEXT
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_platform_api_keys_platform ON platform_api_keys(platform_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_platform_api_keys_hash     ON platform_api_keys(key_hash)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_platform_api_keys_active   ON platform_api_keys(platform_id, is_active) WHERE is_active = TRUE`);
        console.log('[SELF_HEAL]   • Created platform_api_keys');
        createdSomething = true;
      }

      // ── coin_balances ──
      if (!(await tableExists('coin_balances'))) {
        await query(`
          CREATE TABLE coin_balances (
            user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
            lifetime_earned  INTEGER NOT NULL DEFAULT 0,
            lifetime_spent   INTEGER NOT NULL DEFAULT 0,
            updated_at       TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        console.log('[SELF_HEAL]   • Created coin_balances');
        createdSomething = true;
      }

      // ── coin_tx_type enum + coin_transactions ──
      await query(`
        DO $$ BEGIN
          CREATE TYPE coin_tx_type AS ENUM (
            'purchase', 'debit', 'refund', 'admin_grant', 'monthly_top_up', 'expiry'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `);
      if (!(await tableExists('coin_transactions'))) {
        await query(`
          CREATE TABLE coin_transactions (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform_id      UUID REFERENCES platforms(id),
            type             coin_tx_type NOT NULL,
            amount           INTEGER NOT NULL,
            feature_key      VARCHAR(120),
            reference_id     VARCHAR(255),
            balance_after    INTEGER NOT NULL,
            idempotency_key  VARCHAR(255) UNIQUE,
            metadata         JSONB DEFAULT '{}'::jsonb,
            created_at       TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_txn_user_date  ON coin_transactions(user_id, created_at DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_txn_platform   ON coin_transactions(platform_id) WHERE platform_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_txn_type       ON coin_transactions(type)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_txn_ref        ON coin_transactions(reference_id) WHERE reference_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_txn_idem       ON coin_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL`);
        console.log('[SELF_HEAL]   • Created coin_transactions');
        createdSomething = true;
      }

      // ── coin_packs ──
      if (!(await tableExists('coin_packs'))) {
        await query(`
          CREATE TABLE coin_packs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name            VARCHAR(120) NOT NULL,
            coin_amount     INTEGER NOT NULL CHECK (coin_amount > 0),
            bonus_coins     INTEGER NOT NULL DEFAULT 0,
            price_inr_paise INTEGER NOT NULL CHECK (price_inr_paise > 0),
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_coin_packs_active ON coin_packs(is_active, sort_order) WHERE is_active = TRUE`);
        await query(`
          INSERT INTO coin_packs (name, coin_amount, bonus_coins, price_inr_paise, sort_order) VALUES
            ('Starter',   100,   0,  9900, 1),
            ('Value',     500,  50, 39900, 2),
            ('Power',    1500, 200, 99900, 3),
            ('Mega',     5000, 750,299900, 4)
          ON CONFLICT DO NOTHING
        `);
        console.log('[SELF_HEAL]   • Created coin_packs (+ 4 default packs)');
        createdSomething = true;
      }

      // ── feature_costs ──
      if (!(await tableExists('feature_costs'))) {
        await query(`
          CREATE TABLE feature_costs (
            feature_key  VARCHAR(120) PRIMARY KEY,
            cost         INTEGER NOT NULL DEFAULT 1 CHECK (cost >= 0),
            description  TEXT,
            is_active    BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at   TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        console.log('[SELF_HEAL]   • Created feature_costs');
        createdSomething = true;
      }

      // ── payment_intents (mig 027) ──
      await query(`
        DO $$ BEGIN
          CREATE TYPE payment_kind AS ENUM ('plan', 'coin_pack');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `);
      await query(`
        DO $$ BEGIN
          CREATE TYPE payment_intent_status AS ENUM (
            'pending', 'paid', 'failed', 'expired', 'refunded'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `);
      if (!(await tableExists('payment_intents'))) {
        await query(`
          CREATE TABLE payment_intents (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform_id         UUID REFERENCES platforms(id),
            kind                payment_kind NOT NULL,
            product_id          VARCHAR(120) NOT NULL,
            amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
            currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
            cashfree_order_id   VARCHAR(255) UNIQUE,
            cashfree_payment_id VARCHAR(255),
            status              payment_intent_status NOT NULL DEFAULT 'pending',
            fulfilled_at        TIMESTAMPTZ,
            fulfilment_key      VARCHAR(255) UNIQUE,
            raw_webhook         JSONB DEFAULT '{}'::jsonb,
            metadata            JSONB DEFAULT '{}'::jsonb,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_payment_intents_user     ON payment_intents(user_id, created_at DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_payment_intents_cf_order ON payment_intents(cashfree_order_id) WHERE cashfree_order_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_payment_intents_status   ON payment_intents(status)`);
        console.log('[SELF_HEAL]   • Created payment_intents');
        createdSomething = true;
      }

      return createdSomething;
    },
  },
  {
    name: 'coin_pricing table + default rate (migration 029)',
    run: async () => {
      // Check if table already exists
      const existsResult = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_name = 'coin_pricing'
         ) AS exists`,
      );
      if (existsResult.rows[0]?.exists) {
        // Ensure the single row exists
        const seed = await query(
          `INSERT INTO coin_pricing (id, paise_per_coin) VALUES (1, 100)
             ON CONFLICT (id) DO NOTHING`,
        );
        return (seed.rowCount ?? 0) > 0;
      }
      // Create table + seed
      await query(`
        CREATE TABLE coin_pricing (
          id              INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          paise_per_coin  INTEGER     NOT NULL DEFAULT 100 CHECK (paise_per_coin > 0),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      await query(
        `INSERT INTO coin_pricing (id, paise_per_coin) VALUES (1, 100)
           ON CONFLICT (id) DO NOTHING`,
      );
      return true;
    },
  },
  {
    name: 'platforms: seed pinescript-ai',
    run: async () => {
      // Idempotent: only inserts if the slug doesn't already exist. Skips
      // cleanly when the platforms table itself is missing (very first boot,
      // before the wallet-schema step has run — runs to completion next time).
      const tableThere = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables WHERE table_name = 'platforms'
         ) AS exists`,
      );
      if (!tableThere.rows[0]?.exists) return false;

      const r = await query(
        `INSERT INTO platforms (slug, name, description, is_active)
         VALUES ('pinescript-ai', 'Pinescript AI', 'AI PineScript code generator (separate Next.js app)', TRUE)
         ON CONFLICT (slug) DO NOTHING`,
      );
      if ((r.rowCount ?? 0) > 0) {
        console.log('[SELF_HEAL]   • Seeded platforms[pinescript-ai]');
        return true;
      }
      return false;
    },
  },
  {
    name: 'feature_costs: seed default catalog',
    run: async () => {
      // Idempotent: rows already present are left untouched. Defensive in
      // case migration 026's seed never ran or the table got truncated.
      const defaults: Array<[string, number, string]> = [
        ['backtest.run',             5, 'Strategy backtest run (per Celery task)'],
        ['screener.run',             2, 'Expert screener run (per SSE job)'],
        ['sentiment.analyze',        3, 'AI sentiment analysis (per ticker, 24h cache)'],
        ['tip_tease.chat',           1, 'AI chat session (TipTease) — per chat start'],
        ['pair_trading.run',         3, 'Pair-trading matrix computation (per request)'],
        ['portfolio.optimize',       5, 'Portfolio optimizer (Black-Litterman) — per run'],
        ['fundamental_screener.run', 2, 'Fundamental Scanner run (per SSE job)'],
        ['pinescript.generate',      5, 'Pinescript AI code generation (per chat message that produces code)'],
      ];
      let inserted = 0;
      for (const [key, cost, desc] of defaults) {
        const r = await query(
          `INSERT INTO feature_costs (feature_key, cost, description, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (feature_key) DO NOTHING`,
          [key, cost, desc],
        );
        if (r.rowCount && r.rowCount > 0) {
          inserted += r.rowCount;
          console.log(`[SELF_HEAL]   • Seeded feature_costs[${key}] = ${cost} coins`);
        }
      }
      return inserted > 0;
    },
  },
  {
    name: 'payment_kind enum: add custom_coins',
    run: async () => {
      const exists = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           WHERE t.typname = 'payment_kind' AND e.enumlabel = 'custom_coins'
         ) AS exists`,
      );
      if (exists.rows[0]?.exists) return false;
      await query(`ALTER TYPE payment_kind ADD VALUE IF NOT EXISTS 'custom_coins'`);
      return true;
    },
  },
  {
    name: 'coin_pricing: add signup_bonus_coins column',
    run: async () => {
      // ADD COLUMN IF NOT EXISTS works in PG 9.6+, idempotent.
      const before = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'coin_pricing' AND column_name = 'signup_bonus_coins'
         ) AS exists`,
      );
      if (before.rows[0]?.exists) return false;
      await query(
        `ALTER TABLE coin_pricing
           ADD COLUMN IF NOT EXISTS signup_bonus_coins INTEGER NOT NULL DEFAULT 10
             CHECK (signup_bonus_coins >= 0)`,
      );
      return true;
    },
  },
  {
    name: 'coin_tx_type enum: add signup_bonus',
    run: async () => {
      const exists = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           WHERE t.typname = 'coin_tx_type' AND e.enumlabel = 'signup_bonus'
         ) AS exists`,
      );
      if (exists.rows[0]?.exists) return false;
      await query(`ALTER TYPE coin_tx_type ADD VALUE IF NOT EXISTS 'signup_bonus'`);
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
