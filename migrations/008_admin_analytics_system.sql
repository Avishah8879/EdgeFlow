-- Migration 008: Admin Dashboard & Analytics System
-- This migration adds:
-- - Role-based access control (user, moderator, admin, super_admin)
-- - Page views and feature usage tracking
-- - Saved results for screeners and backtests
-- - System configuration and notifications
-- - Privacy consent tracking
-- - OTP system for password reset and email verification

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ADD ROLE COLUMN TO USERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Add check constraint for valid roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_role'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_role
      CHECK (role IN ('user', 'moderator', 'admin', 'super_admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD TRACKING CONSENT AND EMAIL VERIFICATION COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════

-- Add consent tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS tracking_consent VARCHAR(20) DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ;

-- Add email verification timestamp (email_verified already exists from migration 004)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PAGE VIEWS TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  page_path VARCHAR(500) NOT NULL,
  page_title VARCHAR(255),
  referrer VARCHAR(500),
  duration_seconds INTEGER,
  device_type VARCHAR(20),
  browser VARCHAR(50),
  os VARCHAR(50),
  screen_resolution VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FEATURE USAGE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_type VARCHAR(50) NOT NULL,
  feature_params JSONB NOT NULL,
  result_summary JSONB,
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_feature_type CHECK (feature_type IN (
    'screener', 'backtest', 'sentiment', 'search', 'price_chart', 'technical_indicators'
  ))
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_user ON feature_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_type ON feature_usage(feature_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_created ON feature_usage(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. SAVED SCREENER RESULTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_screener_results (
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

CREATE INDEX IF NOT EXISTS idx_saved_screener_user ON saved_screener_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_screener_shared ON saved_screener_results(share_token) WHERE share_token IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. SAVED BACKTEST RESULTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_backtest_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  ticker VARCHAR(50) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  custom_rules TEXT,
  strategy_condition TEXT NOT NULL,
  metrics JSONB NOT NULL,
  equity_curve JSONB,
  candlestick_data JSONB,
  tpsl_values JSONB,
  execution_time_ms INTEGER,
  is_shared BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_backtest_user ON saved_backtest_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_backtest_ticker ON saved_backtest_results(ticker);
CREATE INDEX IF NOT EXISTS idx_saved_backtest_shared ON saved_backtest_results(share_token) WHERE share_token IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. ADMIN AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(255),
  previous_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. CLICK EVENTS TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS click_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  page_path VARCHAR(500) NOT NULL,
  element_type VARCHAR(50),
  element_id VARCHAR(255),
  element_text VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clicks_user ON click_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_session ON click_events(session_id);
CREATE INDEX IF NOT EXISTS idx_clicks_created ON click_events(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. SEARCH EVENTS TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  query VARCHAR(500) NOT NULL,
  result_count INTEGER,
  selected_result VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_user ON search_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_query ON search_events(query);
CREATE INDEX IF NOT EXISTS idx_search_created ON search_events(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. SYSTEM CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category);

-- Insert default configuration values
INSERT INTO system_config (key, value, description, category) VALUES
-- Saved results limits
('saved_screener_limit_basic', '10', 'Max saved screener results for basic tier', 'limits'),
('saved_screener_limit_premium', '50', 'Max saved screener results for premium tier', 'limits'),
('saved_backtest_limit_basic', '5', 'Max saved backtest results for basic tier', 'limits'),
('saved_backtest_limit_premium', '25', 'Max saved backtest results for premium tier', 'limits'),

-- Data retention periods (days, 0 = forever)
('retention_page_views', '0', 'Days to keep page view data (0 = forever)', 'retention'),
('retention_click_events', '0', 'Days to keep click event data (0 = forever)', 'retention'),
('retention_search_events', '0', 'Days to keep search event data (0 = forever)', 'retention'),
('retention_feature_usage', '0', 'Days to keep feature usage data (0 = forever)', 'retention'),

-- Aggregation settings
('aggregate_page_views_after', '30', 'Days after which to aggregate page views to daily summaries', 'retention'),
('aggregate_feature_usage_after', '30', 'Days after which to aggregate feature usage to daily summaries', 'retention'),

-- Export limits
('export_max_rows', '10000', 'Maximum rows per CSV export', 'limits'),

-- Rate limits (requests per hour)
('rate_limit_screener_basic', '10', 'Screener runs per hour for basic tier', 'limits'),
('rate_limit_screener_premium', '100', 'Screener runs per hour for premium tier', 'limits'),
('rate_limit_backtest_basic', '5', 'Backtest runs per hour for basic tier', 'limits'),
('rate_limit_backtest_premium', '50', 'Backtest runs per hour for premium tier', 'limits'),

-- Feature toggles
('feature_sharing_enabled', 'true', 'Enable result sharing feature', 'features'),
('feature_export_enabled', 'true', 'Enable data export feature', 'features'),

-- Page visibility (feature flags)
('page_visible_home', 'true', 'Show Home page', 'pages'),
('page_visible_stocks', 'true', 'Show Stocks page', 'pages'),
('page_visible_indices', 'true', 'Show Indices page', 'pages'),
('page_visible_news', 'true', 'Show News page', 'pages'),
('page_visible_sentiment', 'true', 'Show Sentiment Analysis page', 'pages'),
('page_visible_screener', 'true', 'Show Expert Screener page', 'pages'),
('page_visible_backtest', 'true', 'Show Strategy Backtesting page', 'pages'),
('page_visible_watchlist', 'true', 'Show Watchlist page', 'pages'),
('page_visible_portfolio', 'true', 'Show Portfolio page', 'pages')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. SYSTEM NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'info',
  target_audience VARCHAR(20) DEFAULT 'all',
  is_active BOOLEAN DEFAULT TRUE,
  is_dismissible BOOLEAN DEFAULT TRUE,
  show_on_pages JSONB DEFAULT '["all"]',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_notification_type CHECK (type IN ('info', 'warning', 'maintenance', 'urgent')),
  CONSTRAINT check_target_audience CHECK (target_audience IN ('all', 'basic', 'premium', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_active ON system_notifications(is_active, scheduled_start, scheduled_end);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON system_notifications(type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. NOTIFICATION DISMISSALS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_dismissals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES system_notifications(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissals_user ON notification_dismissals(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. PRIVACY CONSENT TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privacy_consent (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64),
  consent_level VARCHAR(20) NOT NULL DEFAULT 'none',
  ip_address VARCHAR(45),
  user_agent TEXT,
  consented_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_consent_level CHECK (consent_level IN ('none', 'essential', 'all')),
  CONSTRAINT check_consent_identity CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_user ON privacy_consent(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privacy_consent_session ON privacy_consent(session_id) WHERE session_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. OTP CODES (Password Reset & Email Verification)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_otp_purpose CHECK (purpose IN ('password_reset', 'email_verification', 'login_verify'))
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id) WHERE user_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. ANALYTICS DAILY SUMMARY (For Rolled-Up Old Data)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_daily_summary (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  metric_key VARCHAR(255),
  count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, metric_type, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily_summary(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_type ON analytics_daily_summary(metric_type, date DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. UPDATE AUTH_LOGS EVENT TYPES
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint and add new one with additional admin event types
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS check_event_type;
ALTER TABLE auth_logs ADD CONSTRAINT check_event_type CHECK (
  event_type IN (
    'signup', 'login', 'logout', 'failed_login', 'password_change',
    'password_reset_request', 'password_reset_complete', 'email_verification',
    'account_locked', 'account_unlocked', 'session_revoked', 'token_refresh',
    'oauth_link', 'oauth_unlink', 'subscription_upgrade', 'subscription_downgrade',
    'subscription_cancel', 'trial_started', 'trial_expired', 'subscription_expired',
    'admin_upgrade', 'admin_role_assigned', 'admin_role_revoked', 'admin_user_edit',
    'account_deleted'
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE page_views IS 'Tracks page views for analytics and user behavior analysis';
COMMENT ON TABLE feature_usage IS 'Tracks feature usage for rate limiting and analytics';
COMMENT ON TABLE saved_screener_results IS 'User-saved screener results with optional sharing';
COMMENT ON TABLE saved_backtest_results IS 'User-saved backtest results with optional sharing';
COMMENT ON TABLE admin_audit_log IS 'Audit trail for all admin actions';
COMMENT ON TABLE click_events IS 'Tracks click events for detailed behavior analysis (optional)';
COMMENT ON TABLE search_events IS 'Tracks search queries and selected results (optional)';
COMMENT ON TABLE system_config IS 'Admin-editable system configuration values';
COMMENT ON TABLE system_notifications IS 'System-wide notifications for maintenance and announcements';
COMMENT ON TABLE notification_dismissals IS 'Tracks which users dismissed which notifications';
COMMENT ON TABLE privacy_consent IS 'Tracks user privacy/tracking consent preferences';
COMMENT ON TABLE otp_codes IS 'One-time passwords for password reset and email verification';
COMMENT ON TABLE analytics_daily_summary IS 'Rolled-up daily analytics for historical data';

COMMENT ON COLUMN users.role IS 'User role for access control: user, moderator, admin, super_admin';
COMMENT ON COLUMN users.tracking_consent IS 'Privacy consent level: none, essential, all';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when email was verified via OTP';
