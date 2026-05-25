-- Saved results for Fundamental Scanner and Portfolio Optimizer
-- Additive only: creates missing tables, indexes, and save-limit config.

CREATE TABLE IF NOT EXISTS saved_fundamental_screener_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  expression TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  matching_symbols JSONB NOT NULL,
  execution_time_ms INTEGER,
  is_shared BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_fundamental_screener_user
  ON saved_fundamental_screener_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_fundamental_screener_shared
  ON saved_fundamental_screener_results(share_token)
  WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_portfolio_optimizer_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  holdings JSONB NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  result JSONB NOT NULL,
  execution_time_ms INTEGER,
  is_shared BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_portfolio_optimizer_user
  ON saved_portfolio_optimizer_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_portfolio_optimizer_shared
  ON saved_portfolio_optimizer_results(share_token)
  WHERE share_token IS NOT NULL;

INSERT INTO system_config (key, value, description, category) VALUES
  ('saved_fundamental_screener_limit_basic', '10', 'Max saved fundamental scanner results for basic tier', 'limits'),
  ('saved_fundamental_screener_limit_premium', '50', 'Max saved fundamental scanner results for semi/pro tier', 'limits'),
  ('saved_portfolio_optimizer_limit_basic', '10', 'Max saved portfolio optimizer results for basic tier', 'limits'),
  ('saved_portfolio_optimizer_limit_premium', '50', 'Max saved portfolio optimizer results for semi/pro tier', 'limits')
ON CONFLICT (key) DO NOTHING;
