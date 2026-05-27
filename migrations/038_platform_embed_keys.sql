-- Migration 038: Platform embed API keys
-- Adds per-user, per-platform short-lived API keys for iframe embeds.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS platform_slug TEXT NULL;

ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS check_api_key_type;

ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_key_type_check;

ALTER TABLE api_keys
  ADD CONSTRAINT check_api_key_type
  CHECK (key_type IN ('standard', 'admin', 'platform_embed'));

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_one_active_embed_per_user_platform
  ON api_keys (user_id, platform_slug)
  WHERE key_type = 'platform_embed'
    AND platform_slug IS NOT NULL
    AND is_active = TRUE
    AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_user_type_platform
  ON api_keys (user_id, key_type, platform_slug);
