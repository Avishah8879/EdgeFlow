-- Migration 037: saved_pair_watchlists
-- Stores user-saved pair trades from the Scanner tab watchlist.

CREATE TABLE IF NOT EXISTS saved_pair_watchlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  symbol1         VARCHAR(50)  NOT NULL,
  symbol2         VARCHAR(50)  NOT NULL,
  method          VARCHAR(20)  NOT NULL,
  lookback_days   INTEGER      NOT NULL,
  correlation     FLOAT,
  beta            FLOAT,
  delta           FLOAT,
  pvalue          FLOAT,
  params          JSONB        NOT NULL DEFAULT '{}',
  is_shared       BOOLEAN      NOT NULL DEFAULT FALSE,
  share_token     VARCHAR(64)  UNIQUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_pair_watchlists_user_id
  ON saved_pair_watchlists (user_id, created_at DESC);

-- Tier limits
INSERT INTO system_config (key, value, description, category)
VALUES
  ('saved_pair_watchlist_limit_basic',   '10', 'Max saved pair watchlist entries for basic tier',   'limits'),
  ('saved_pair_watchlist_limit_premium', '50', 'Max saved pair watchlist entries for premium tier', 'limits')
ON CONFLICT (key) DO NOTHING;
