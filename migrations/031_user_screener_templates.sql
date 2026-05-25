-- User-owned screener expression templates (Save as Template).
-- Independent of built-in Sample Templates (which live in code) and of
-- saved_screener_results (which capture a specific run's output).
-- Additive only.

CREATE TABLE IF NOT EXISTS user_screener_templates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(280),
  expression  TEXT NOT NULL CHECK (length(expression) <= 2000),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_screener_templates_user
  ON user_screener_templates (user_id, created_at DESC);

INSERT INTO system_config (key, value, description, category) VALUES
  ('user_screener_templates_max', '5',
   'Hard cap on saved screener templates per user', 'limits')
ON CONFLICT (key) DO NOTHING;
