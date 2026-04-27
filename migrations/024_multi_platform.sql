-- Migration 024: Multi-Platform Foundation
-- Database: Tiphub_auth
-- Purpose: Platform registry + per-platform API keys (HMAC) + user primary platform.
--          Seeds the EquityPro platform and backfills existing users to it.
-- Run with: psql -h <host> -U <user> -d Tiphub_auth -f migrations/024_multi_platform.sql

BEGIN;

-- ============================================================================
-- Table 1: platforms — registry of apps that can use this auth/coin service
-- ============================================================================
CREATE TABLE IF NOT EXISTS platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_platform_slug_format CHECK (slug ~* '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE INDEX IF NOT EXISTS idx_platforms_slug ON platforms(slug);
CREATE INDEX IF NOT EXISTS idx_platforms_active ON platforms(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE platforms IS 'Apps registered with the central auth + coin service';
COMMENT ON COLUMN platforms.slug IS 'URL/log-safe identifier, e.g. "equitypro"';

-- ============================================================================
-- Table 2: platform_api_keys — HMAC keys for server-to-server platform calls
-- ============================================================================
-- Pattern mirrors api_keys (migration 018): show prefix to admins, hash never
-- exposed. Each platform can hold multiple active keys for rotation.
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,        -- SHA-256 of public key
  secret_hash VARCHAR(64) NOT NULL,             -- SHA-256 of HMAC secret
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(45),
  created_by UUID REFERENCES users(id),         -- admin who issued the key
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_api_keys_platform ON platform_api_keys(platform_id);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_hash ON platform_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_active
  ON platform_api_keys(platform_id, is_active)
  WHERE is_active = TRUE;

COMMENT ON TABLE platform_api_keys IS 'HMAC credentials per platform; client passes X-Platform-Key + X-Platform-Signature';
COMMENT ON COLUMN platform_api_keys.key_hash IS 'SHA-256 of the public key string (never store plaintext)';
COMMENT ON COLUMN platform_api_keys.secret_hash IS 'SHA-256 of the HMAC secret (never store plaintext)';

-- ============================================================================
-- Add users.primary_platform_id — where this user originally signed up
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS primary_platform_id UUID REFERENCES platforms(id);

CREATE INDEX IF NOT EXISTS idx_users_primary_platform ON users(primary_platform_id);

COMMENT ON COLUMN users.primary_platform_id IS
  'The platform on which this user originally registered. NULL allowed for legacy rows pre-platform.';

-- ============================================================================
-- Auto-update updated_at on platforms
-- ============================================================================
CREATE OR REPLACE FUNCTION update_platforms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platforms_updated_at ON platforms;
CREATE TRIGGER trg_platforms_updated_at
  BEFORE UPDATE ON platforms
  FOR EACH ROW
  EXECUTE FUNCTION update_platforms_updated_at();

-- ============================================================================
-- Seed: EquityPro platform + backfill all existing users to it
-- ============================================================================
INSERT INTO platforms (slug, name, description, is_active)
VALUES ('equitypro', 'EquityPro', 'Indian stock analysis platform', TRUE)
ON CONFLICT (slug) DO NOTHING;

UPDATE users
SET primary_platform_id = (SELECT id FROM platforms WHERE slug = 'equitypro')
WHERE primary_platform_id IS NULL;

COMMIT;
