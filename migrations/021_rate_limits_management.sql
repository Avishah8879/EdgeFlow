-- Migration 009: Rate Limits Management System
-- This migration adds:
-- - Configurable rate limits per endpoint and tier
-- - User-specific rate limit overrides
-- - Rate limit usage tracking for monitoring
-- - Rate limit violation logging

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RATE LIMITS CONFIGURATION TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id SERIAL PRIMARY KEY,
  endpoint_key VARCHAR(100) NOT NULL,
  tier VARCHAR(20) NOT NULL DEFAULT 'all',
  window_ms INTEGER NOT NULL DEFAULT 900000,
  max_requests INTEGER NOT NULL DEFAULT 100,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_endpoint_tier UNIQUE(endpoint_key, tier),
  CONSTRAINT check_tier CHECK (tier IN ('all', 'basic', 'premium', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_endpoint ON rate_limit_configs(endpoint_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_active ON rate_limit_configs(is_active) WHERE is_active = true;

-- Insert default rate limit configurations
INSERT INTO rate_limit_configs (endpoint_key, tier, window_ms, max_requests, description) VALUES
-- Authentication endpoints
('auth_login', 'all', 900000, 5, 'Login attempts per 15 minutes'),
('auth_signup', 'all', 3600000, 3, 'Signup attempts per hour'),
('auth_refresh', 'all', 3600000, 20, 'Token refresh per hour'),
('auth_oauth', 'all', 300000, 10, 'OAuth attempts per 5 minutes'),

-- API endpoints - Basic tier
('api_general', 'basic', 900000, 100, 'General API requests per 15 minutes'),
('api_search', 'basic', 60000, 30, 'Search requests per minute'),
('api_screener', 'basic', 3600000, 10, 'Screener runs per hour'),
('api_backtest', 'basic', 3600000, 5, 'Backtest runs per hour'),
('api_sentiment', 'basic', 3600000, 10, 'Sentiment analysis per hour'),
('api_export', 'basic', 3600000, 5, 'Data export per hour'),

-- API endpoints - Premium tier
('api_general', 'premium', 900000, 500, 'General API requests per 15 minutes'),
('api_search', 'premium', 60000, 100, 'Search requests per minute'),
('api_screener', 'premium', 3600000, 100, 'Screener runs per hour'),
('api_backtest', 'premium', 3600000, 50, 'Backtest runs per hour'),
('api_sentiment', 'premium', 3600000, 50, 'Sentiment analysis per hour'),
('api_export', 'premium', 3600000, 20, 'Data export per hour'),

-- Admin endpoints
('admin_api', 'admin', 900000, 1000, 'Admin API requests per 15 minutes')
ON CONFLICT (endpoint_key, tier) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. USER-SPECIFIC RATE LIMIT OVERRIDES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_overrides (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_key VARCHAR(100) NOT NULL,
  window_ms INTEGER NOT NULL,
  max_requests INTEGER NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_endpoint UNIQUE(user_id, endpoint_key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_overrides_user ON rate_limit_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_overrides_expires ON rate_limit_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RATE LIMIT USAGE TRACKING (Rolling window counters)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_usage (
  id BIGSERIAL PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  endpoint_key VARCHAR(100) NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_identifier_endpoint_window UNIQUE(identifier, endpoint_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_usage_identifier ON rate_limit_usage(identifier, endpoint_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_usage_window ON rate_limit_usage(window_end);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RATE LIMIT VIOLATIONS LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45) NOT NULL,
  endpoint_key VARCHAR(100) NOT NULL,
  endpoint_path VARCHAR(500),
  request_count INTEGER NOT NULL,
  limit_max INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user ON rate_limit_violations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created ON rate_limit_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_endpoint ON rate_limit_violations(endpoint_key, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CLEANUP FUNCTION FOR OLD USAGE DATA
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_rate_limit_usage()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_usage
  WHERE window_end < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. UPDATE TRIGGER FOR rate_limit_configs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_rate_limit_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rate_limit_configs_timestamp ON rate_limit_configs;
CREATE TRIGGER trigger_update_rate_limit_configs_timestamp
  BEFORE UPDATE ON rate_limit_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limit_configs_timestamp();

DROP TRIGGER IF EXISTS trigger_update_rate_limit_overrides_timestamp ON rate_limit_overrides;
CREATE TRIGGER trigger_update_rate_limit_overrides_timestamp
  BEFORE UPDATE ON rate_limit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limit_configs_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE rate_limit_configs IS 'Configurable rate limits per endpoint and tier';
COMMENT ON TABLE rate_limit_overrides IS 'User-specific rate limit overrides';
COMMENT ON TABLE rate_limit_usage IS 'Rolling window rate limit counters';
COMMENT ON TABLE rate_limit_violations IS 'Log of rate limit violations for security monitoring';
COMMENT ON FUNCTION cleanup_rate_limit_usage() IS 'Cleanup function to remove expired rate limit usage records';
