-- Migration 026: Coin Wallet System
-- Database: RGX_Auth
-- Purpose: Coin balances, append-only ledger, purchasable packs, and
--          admin-editable feature cost catalog.
--
-- Design notes:
--   coin_balances  — one row per user, mutated in-place under FOR UPDATE
--   coin_transactions — append-only ledger; balance_after records the
--     running balance so any row is auditable without a full scan
--   idempotency_key on coin_transactions prevents double-debit on retries

BEGIN;

-- ============================================================================
-- coin_balances: one row per user, holds current balance
-- ============================================================================
CREATE TABLE IF NOT EXISTS coin_balances (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned  INTEGER NOT NULL DEFAULT 0,
  lifetime_spent   INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE coin_balances IS 'Current coin balance per user. Always mutated under SELECT FOR UPDATE.';
COMMENT ON COLUMN coin_balances.balance IS 'Current spendable balance. Never goes negative.';

-- ============================================================================
-- coin_transactions: append-only ledger
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE coin_tx_type AS ENUM (
    'purchase', 'debit', 'refund', 'admin_grant', 'monthly_top_up', 'expiry'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS coin_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform_id      UUID REFERENCES platforms(id),           -- which app triggered the txn
  type             coin_tx_type NOT NULL,
  amount           INTEGER NOT NULL,                         -- signed: positive = credit, negative = debit
  feature_key      VARCHAR(120),                            -- e.g. 'backtest.run', null for purchases
  reference_id     VARCHAR(255),                            -- Cashfree order id, Celery task id, admin user id
  balance_after    INTEGER NOT NULL,                        -- snapshot of balance after this txn
  idempotency_key  VARCHAR(255) UNIQUE,                     -- caller-supplied; prevents double-debit
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_txn_user_date  ON coin_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_txn_platform   ON coin_transactions(platform_id) WHERE platform_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_txn_type       ON coin_transactions(type);
CREATE INDEX IF NOT EXISTS idx_coin_txn_ref        ON coin_transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_txn_idem       ON coin_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE coin_transactions IS 'Append-only ledger. Never UPDATE or DELETE rows.';
COMMENT ON COLUMN coin_transactions.amount IS 'Signed integer: positive for credits, negative for debits.';
COMMENT ON COLUMN coin_transactions.balance_after IS 'Running balance after this transaction; allows point-in-time audit.';
COMMENT ON COLUMN coin_transactions.idempotency_key IS 'Client-supplied key; duplicate key returns the existing transaction.';

-- ============================================================================
-- coin_packs: products the user can buy
-- ============================================================================
CREATE TABLE IF NOT EXISTS coin_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  coin_amount     INTEGER NOT NULL CHECK (coin_amount > 0),
  bonus_coins     INTEGER NOT NULL DEFAULT 0,               -- extra coins on top of coin_amount
  price_inr_paise INTEGER NOT NULL CHECK (price_inr_paise > 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_packs_active ON coin_packs(is_active, sort_order) WHERE is_active = TRUE;

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_coin_packs_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coin_packs_updated_at ON coin_packs;
CREATE TRIGGER trg_coin_packs_updated_at
  BEFORE UPDATE ON coin_packs
  FOR EACH ROW EXECUTE FUNCTION update_coin_packs_updated_at();

-- Seed starter packs (prices in paise; admin can update later)
INSERT INTO coin_packs (name, coin_amount, bonus_coins, price_inr_paise, sort_order) VALUES
  ('Starter',   100,   0,  9900, 1),
  ('Value',     500,  50, 39900, 2),
  ('Power',    1500, 200, 99900, 3),
  ('Mega',     5000, 750,299900, 4)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- feature_costs: admin-editable price per feature key
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_costs (
  feature_key  VARCHAR(120) PRIMARY KEY,
  cost         INTEGER NOT NULL DEFAULT 1 CHECK (cost >= 0),
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default costs (match tier-gates.ts)
INSERT INTO feature_costs (feature_key, cost, description) VALUES
  ('backtest.run',       5, 'Strategy backtest run (per Celery task)'),
  ('screener.run',       2, 'Expert screener run (per SSE job)'),
  ('sentiment.analyze',  3, 'AI sentiment analysis (per ticker, 24h cache)')
ON CONFLICT (feature_key) DO UPDATE
  SET cost = EXCLUDED.cost, description = EXCLUDED.description, updated_at = NOW();

COMMIT;
