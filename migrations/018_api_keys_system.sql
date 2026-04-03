-- Migration 018: API Keys System
-- Creates tables for public developer API key management and usage tracking

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  tier VARCHAR(20) NOT NULL DEFAULT 'basic',
  -- Key type: 'standard' (user-created) or 'admin' (admin-created with custom settings)
  key_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  -- Rate limits (defaults for standard keys, custom for admin keys)
  rate_limit_per_minute INT NOT NULL DEFAULT 20,
  rate_limit_per_hour INT NOT NULL DEFAULT 500,
  rate_limit_per_day INT NOT NULL DEFAULT 5000,
  -- CORS domain whitelist (for browser access)
  allowed_origins TEXT[] DEFAULT '{}',
  -- IP whitelist (admin keys can restrict to specific IPs/CIDRs)
  allowed_ips TEXT[] DEFAULT '{}',
  -- Endpoint scopes: empty = all endpoints, otherwise restrict to listed patterns
  allowed_endpoints TEXT[] DEFAULT '{}',
  -- Admin key metadata
  created_by UUID REFERENCES users(id),
  description TEXT,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(45),
  -- Lifecycle
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_api_key_tier CHECK (tier IN ('basic', 'premium', 'enterprise')),
  CONSTRAINT check_api_key_type CHECK (key_type IN ('standard', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, is_active) WHERE is_active = TRUE;

-- API usage log table
CREATE TABLE IF NOT EXISTS api_usage_log (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage_log(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage_log(created_at DESC);

-- Auto-update updated_at on api_keys changes
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();
