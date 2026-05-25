-- Migration 029: Coin Pricing (single ₹/coin rate)
-- Database: RGX_Auth
-- Purpose: Single-row config table that stores the admin-set rate used by
--          custom-amount coin purchases. Discrete coin_packs continue to
--          carry their own bundled prices independently.

BEGIN;

CREATE TABLE IF NOT EXISTS coin_pricing (
  id              INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  paise_per_coin  INTEGER     NOT NULL DEFAULT 100 CHECK (paise_per_coin > 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE coin_pricing IS 'Single-row config: ₹/coin rate for custom-amount purchases.';
COMMENT ON COLUMN coin_pricing.paise_per_coin IS 'Cost of 1 coin in INR paise. Default 100 = ₹1/coin.';

-- Seed default rate
INSERT INTO coin_pricing (id, paise_per_coin) VALUES (1, 100)
  ON CONFLICT (id) DO NOTHING;

-- Seed tip_tease.chat as a coin-gated feature
INSERT INTO feature_costs (feature_key, cost, description, is_active) VALUES
  ('tip_tease.chat', 1, 'AI chat session (TipTease) — per chat start', TRUE)
  ON CONFLICT (feature_key) DO NOTHING;

COMMIT;
