-- Migration 010: Feature Flags System
-- This migration adds:
-- - Feature flag definitions
-- - User-specific feature flag overrides
-- - Feature flag targeting rules

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FEATURE FLAGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_flags (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,

  -- Targeting options
  target_tiers VARCHAR(50)[] DEFAULT NULL,  -- e.g., {'basic', 'premium'} or NULL for all
  target_roles VARCHAR(50)[] DEFAULT NULL,  -- e.g., {'admin', 'super_admin'} or NULL for all
  rollout_percentage INTEGER DEFAULT 100,    -- 0-100, for gradual rollouts

  -- Time-based targeting
  starts_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,

  -- Metadata
  category VARCHAR(50) DEFAULT 'general',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_rollout_percentage CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. USER-SPECIFIC FEATURE FLAG OVERRIDES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  id SERIAL PRIMARY KEY,
  flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_flag_user UNIQUE(flag_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_flag ON feature_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_user ON feature_flag_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_expires ON feature_flag_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FEATURE FLAG AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id BIGSERIAL PRIMARY KEY,
  flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_flag ON feature_flag_audit(flag_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_created ON feature_flag_audit(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. DEFAULT FEATURE FLAGS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO feature_flags (key, name, description, is_enabled, category, target_tiers) VALUES
-- UI Features
('dark_mode_v2', 'Dark Mode V2', 'New dark mode design with improved contrast', false, 'ui', NULL),
('new_navigation', 'New Navigation', 'Redesigned navigation bar', false, 'ui', NULL),
('beta_features', 'Beta Features', 'Access to beta features', false, 'ui', ARRAY['premium']),

-- Feature Access
('advanced_screener', 'Advanced Screener', 'Access to advanced screener expressions', true, 'features', ARRAY['premium']),
('strategy_backtesting', 'Strategy Backtesting', 'Access to strategy backtesting', true, 'features', ARRAY['premium']),
('export_data', 'Data Export', 'Ability to export data as CSV', true, 'features', ARRAY['premium']),
('real_time_alerts', 'Real-time Alerts', 'Push notifications for price alerts', false, 'features', ARRAY['premium']),

-- Limits (values stored in description for reference)
('unlimited_screener', 'Unlimited Screener Runs', 'Remove screener run limits', true, 'limits', ARRAY['premium']),
('unlimited_backtests', 'Unlimited Backtests', 'Remove backtest run limits', true, 'limits', ARRAY['premium']),

-- Experimental
('gpu_compute', 'GPU Compute', 'Client-side GPU computation for indicators', true, 'experimental', NULL),
('hybrid_backtest', 'Hybrid Backtest', 'Client-computed indicators for backtesting', true, 'experimental', NULL),
('ai_insights', 'AI Insights', 'AI-powered market insights', false, 'experimental', ARRAY['premium'])
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. UPDATE TRIGGER FOR feature_flags
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_feature_flags_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_feature_flags_timestamp ON feature_flags;
CREATE TRIGGER trigger_update_feature_flags_timestamp
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FUNCTION TO CHECK IF FLAG IS ENABLED FOR USER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_feature_enabled(
  p_flag_key VARCHAR(100),
  p_user_id UUID,
  p_user_tier VARCHAR(20),
  p_user_role VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_flag RECORD;
  v_override RECORD;
  v_hash_value INTEGER;
BEGIN
  -- Get the flag
  SELECT * INTO v_flag FROM feature_flags WHERE key = p_flag_key;

  -- If flag doesn't exist, return false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check for user-specific override (takes precedence)
  SELECT * INTO v_override
  FROM feature_flag_overrides
  WHERE flag_id = v_flag.id
    AND user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());

  IF FOUND THEN
    RETURN v_override.is_enabled;
  END IF;

  -- Check if flag is globally disabled
  IF NOT v_flag.is_enabled THEN
    RETURN FALSE;
  END IF;

  -- Check time-based targeting
  IF v_flag.starts_at IS NOT NULL AND NOW() < v_flag.starts_at THEN
    RETURN FALSE;
  END IF;

  IF v_flag.expires_at IS NOT NULL AND NOW() > v_flag.expires_at THEN
    RETURN FALSE;
  END IF;

  -- Check tier targeting
  IF v_flag.target_tiers IS NOT NULL AND p_user_tier IS NOT NULL THEN
    IF NOT p_user_tier = ANY(v_flag.target_tiers) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check role targeting
  IF v_flag.target_roles IS NOT NULL AND p_user_role IS NOT NULL THEN
    IF NOT p_user_role = ANY(v_flag.target_roles) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check rollout percentage (deterministic based on user_id and flag_key)
  IF v_flag.rollout_percentage < 100 THEN
    -- Create deterministic hash from user_id and flag_key
    v_hash_value := ABS(HASHTEXT(p_user_id::TEXT || v_flag.key)) % 100;
    IF v_hash_value >= v_flag.rollout_percentage THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE feature_flags IS 'Feature flag definitions with targeting options';
COMMENT ON TABLE feature_flag_overrides IS 'User-specific feature flag overrides';
COMMENT ON TABLE feature_flag_audit IS 'Audit log for feature flag changes';
COMMENT ON FUNCTION is_feature_enabled IS 'Check if a feature flag is enabled for a specific user';
