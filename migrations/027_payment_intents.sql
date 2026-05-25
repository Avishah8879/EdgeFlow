-- Migration 027: Payment Intents
-- Database: RGX_Auth
-- Purpose: Tracks Cashfree payment orders and their fulfilment status.
--          One row per checkout attempt; webhook marks it fulfilled.
--          The fulfilled side-effect (tier upgrade or coin credit) is
--          applied exactly once via the idempotency column.

BEGIN;

DO $$ BEGIN
  CREATE TYPE payment_kind AS ENUM ('plan', 'coin_pack');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_intent_status AS ENUM (
    'pending', 'paid', 'failed', 'expired', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payment_intents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform_id       UUID REFERENCES platforms(id),

  -- What the user is buying
  kind              payment_kind NOT NULL,          -- 'plan' or 'coin_pack'
  product_id        VARCHAR(120) NOT NULL,           -- plan id or coin_pack id
  amount_paise      INTEGER NOT NULL CHECK (amount_paise > 0),
  currency          VARCHAR(3) NOT NULL DEFAULT 'INR',

  -- Cashfree fields
  cashfree_order_id VARCHAR(255) UNIQUE,             -- cf_order_id from Cashfree
  cashfree_payment_id VARCHAR(255),                  -- cf_payment_id from webhook

  -- State
  status            payment_intent_status NOT NULL DEFAULT 'pending',
  fulfilled_at      TIMESTAMPTZ,                     -- when side-effect was applied

  -- Idempotency: prevents double-fulfilment on duplicate webhook delivery
  fulfilment_key    VARCHAR(255) UNIQUE,             -- e.g. 'paid:<cf_payment_id>'

  -- Audit
  raw_webhook       JSONB DEFAULT '{}'::jsonb,        -- last received webhook payload
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user    ON payment_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_cf_order ON payment_intents(cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_intents_status  ON payment_intents(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_payment_intents_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_intents_updated_at ON payment_intents;
CREATE TRIGGER trg_payment_intents_updated_at
  BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_payment_intents_updated_at();

COMMENT ON TABLE payment_intents IS 'One row per Cashfree checkout attempt. Webhook sets status=paid and applies the side-effect (tier upgrade / coin credit) once.';
COMMENT ON COLUMN payment_intents.fulfilment_key IS 'Unique per payment; prevents double-credit on duplicate webhook delivery.';

COMMIT;
