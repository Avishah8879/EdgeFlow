-- ============================================================================
-- RGX_Auth Full Database Setup
-- Target: 164.52.192.245:5432
-- Run this file as a superuser (postgres) to create + populate the database.
--
-- Step 1: Create DB + grant access (run as superuser on tbt_data or postgres DB)
-- Step 2: Connect to RGX_Auth and run everything from line 20 onward
--
-- One-liner (run from server shell):
--   psql -U postgres -c "CREATE DATABASE \"RGX_Auth\";"
--   psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"RGX_Auth\" TO marketdata;"
--   psql -U marketdata -d RGX_Auth -f RGX_Auth_full_setup.sql
-- ============================================================================

-- Ensure uuid functions are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration 004: Create Authentication Tables for Tiphub_auth Database
-- Database: Tiphub_auth (see AUTH_DB_* environment variables)
-- Purpose: Secure authentication system with bcrypt + JWT + Google OAuth support
-- Created: 2025-11-25

-- ============================================================================
-- Table 1: users - Main user authentication table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,

  -- Profile information
  name VARCHAR(255),
  avatar_url TEXT,

  -- Authentication fields
  provider VARCHAR(20) NOT NULL DEFAULT 'password', -- 'password' or 'google'
  password_hash TEXT, -- NULL for OAuth users, bcrypt hash for password users
  google_id VARCHAR(255) UNIQUE, -- NULL for password users, Google user ID for OAuth users

  -- Account status
  email_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  tier VARCHAR(20) DEFAULT 'basic', -- 'basic' or 'premium'

  -- Security tracking
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45), -- Supports IPv4 and IPv6
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ, -- Account lockout timestamp

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_provider CHECK (provider IN ('password', 'google')),
  CONSTRAINT check_tier CHECK (tier IN ('basic', 'premium')),
  CONSTRAINT check_password_or_oauth CHECK (
    (provider = 'password' AND password_hash IS NOT NULL) OR
    (provider = 'google' AND google_id IS NOT NULL)
  )
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_provider ON users(provider);
CREATE INDEX idx_users_last_login ON users(last_login_at DESC);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

COMMENT ON TABLE users IS 'Main user authentication table supporting both password and OAuth authentication';
COMMENT ON COLUMN users.provider IS 'Authentication provider: password (manual signup) or google (OAuth)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of password (NULL for OAuth users)';
COMMENT ON COLUMN users.google_id IS 'Google user ID from OAuth (NULL for password users)';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp (NULL if not locked)';


-- ============================================================================
-- Table 2: sessions - Active login sessions with JWT tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token information (hashed for security)
  token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of JWT access token
  refresh_token_hash VARCHAR(64) UNIQUE, -- SHA-256 hash of JWT refresh token

  -- Session metadata
  device_info TEXT, -- User agent string
  ip_address VARCHAR(45), -- IP address of the session
  location VARCHAR(255), -- Optional: City, Country from IP

  -- Session lifecycle
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT, -- 'logout', 'security', 'expired', etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_expiry CHECK (expires_at > issued_at)
);

-- Indexes for sessions table
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(user_id, revoked, expires_at) WHERE revoked = FALSE;
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at DESC);

COMMENT ON TABLE sessions IS 'Active user sessions with JWT tokens for revocation capability';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 hash of JWT access token (not the token itself)';
COMMENT ON COLUMN sessions.refresh_token_hash IS 'SHA-256 hash of JWT refresh token';
COMMENT ON COLUMN sessions.revoked IS 'Session revoked flag (for logout or security)';


-- ============================================================================
-- Table 3: auth_logs - Authentication audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if user deleted

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  provider VARCHAR(20), -- 'password', 'google'

  -- Request metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info TEXT,
  location VARCHAR(255),

  -- Result
  success BOOLEAN NOT NULL,
  failure_reason TEXT, -- Error message for failed attempts
  metadata JSONB, -- Additional context data

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_event_type CHECK (event_type IN (
    'signup',
    'login',
    'logout',
    'failed_login',
    'password_change',
    'password_reset_request',
    'password_reset_complete',
    'email_verification',
    'account_locked',
    'account_unlocked',
    'session_revoked',
    'token_refresh',
    'oauth_link',
    'oauth_unlink'
  ))
);

-- Indexes for auth_logs table
CREATE INDEX idx_auth_logs_user_id ON auth_logs(user_id);
CREATE INDEX idx_auth_logs_event_type ON auth_logs(event_type);
CREATE INDEX idx_auth_logs_created_at ON auth_logs(created_at DESC);
CREATE INDEX idx_auth_logs_ip ON auth_logs(ip_address);
CREATE INDEX idx_auth_logs_success ON auth_logs(success);
CREATE INDEX idx_auth_logs_failed_logins ON auth_logs(user_id, event_type, created_at)
  WHERE event_type = 'failed_login' AND success = FALSE;

COMMENT ON TABLE auth_logs IS 'Authentication event audit trail for security monitoring';
COMMENT ON COLUMN auth_logs.event_type IS 'Type of authentication event (login, signup, failed_login, etc.)';
COMMENT ON COLUMN auth_logs.metadata IS 'Additional JSON data for the event';


-- ============================================================================
-- Table 4: oauth_accounts - OAuth provider accounts (future multi-provider)
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- OAuth provider info
  provider VARCHAR(20) NOT NULL, -- 'google', 'facebook', 'github', etc.
  provider_user_id VARCHAR(255) NOT NULL, -- Provider's user ID

  -- OAuth tokens (should be encrypted in production)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Profile data from provider
  email VARCHAR(255),
  name VARCHAR(255),
  avatar_url TEXT,
  profile_data JSONB, -- Full OAuth profile response

  -- Tracking
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_provider_user UNIQUE(provider, provider_user_id)
);

-- Indexes for oauth_accounts table
CREATE INDEX idx_oauth_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_provider ON oauth_accounts(provider, provider_user_id);
CREATE INDEX idx_oauth_last_used ON oauth_accounts(last_used_at DESC);

COMMENT ON TABLE oauth_accounts IS 'OAuth provider accounts linked to users (supports multiple providers per user)';
COMMENT ON COLUMN oauth_accounts.provider_user_id IS 'User ID from the OAuth provider (e.g., Google user ID)';
COMMENT ON COLUMN oauth_accounts.profile_data IS 'Full JSON profile from OAuth provider';


-- ============================================================================
-- Triggers: Update updated_at timestamp automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Indexes for query performance
-- ============================================================================

-- Composite index for session validation queries
CREATE INDEX idx_sessions_validation ON sessions(token_hash, revoked, expires_at);

-- Index for finding recent failed logins (for account lockout)
CREATE INDEX idx_auth_logs_recent_failures ON auth_logs(user_id, created_at DESC)
  WHERE event_type = 'failed_login' AND success = FALSE;

-- Index for active user sessions query
CREATE INDEX idx_sessions_active_user ON sessions(user_id, expires_at DESC)
  WHERE revoked = FALSE;


-- ============================================================================
-- Initial Data: Create demo admin user (optional)
-- ============================================================================
-- Uncomment to create a default admin user
-- Password: 'Admin123!' (bcrypt hash cost 12)
/*
INSERT INTO users (email, username, name, provider, password_hash, tier, email_verified, is_active)
VALUES (
  'admin@tiphub.com',
  'admin',
  'Tiphub Admin',
  'password',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5OMr4TcW0lX4G', -- 'Admin123!'
  'premium',
  TRUE,
  TRUE
) ON CONFLICT (email) DO NOTHING;
*/


-- ============================================================================
-- Views: Useful queries for monitoring
-- ============================================================================

-- View: Active sessions by user
CREATE OR REPLACE VIEW active_sessions AS
SELECT
  u.id as user_id,
  u.email,
  u.username,
  u.tier,
  COUNT(s.id) as active_sessions,
  MAX(s.last_activity_at) as last_activity
FROM users u
JOIN sessions s ON u.id = s.user_id
WHERE s.revoked = FALSE
  AND s.expires_at > NOW()
GROUP BY u.id, u.email, u.username, u.tier;

-- View: Recent authentication events
CREATE OR REPLACE VIEW recent_auth_events AS
SELECT
  al.id,
  al.created_at,
  u.email,
  u.username,
  al.event_type,
  al.provider,
  al.ip_address,
  al.success,
  al.failure_reason
FROM auth_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;

-- View: User statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT
  COUNT(*) FILTER (WHERE provider = 'password') as password_users,
  COUNT(*) FILTER (WHERE provider = 'google') as google_users,
  COUNT(*) FILTER (WHERE tier = 'basic') as basic_tier,
  COUNT(*) FILTER (WHERE tier = 'premium') as premium_tier,
  COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_last_7_days,
  COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') as active_last_30_days,
  COUNT(*) FILTER (WHERE email_verified = TRUE) as email_verified_count,
  COUNT(*) FILTER (WHERE is_active = TRUE) as active_accounts
FROM users;


-- ============================================================================
-- Grant Permissions (adjust as needed for your user)
-- ============================================================================
GRANT ALL PRIVILEGES ON TABLE users TO postgres;
GRANT ALL PRIVILEGES ON TABLE sessions TO postgres;
GRANT ALL PRIVILEGES ON TABLE auth_logs TO postgres;
GRANT ALL PRIVILEGES ON TABLE oauth_accounts TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE auth_logs_id_seq TO postgres;


-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Tables created: users, sessions, auth_logs, oauth_accounts
-- Indexes created: 24 indexes for optimal query performance
-- Triggers created: updated_at auto-update for users and oauth_accounts
-- Views created: active_sessions, recent_auth_events, user_stats
--
-- Next steps:
-- 1. Run this migration against Tiphub_auth database
-- 2. Verify tables created: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- 3. Check indexes: SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';
-- 4. Test queries: SELECT * FROM user_stats;
-- ============================================================================
-- Migration 005: Add Terms & Conditions acceptance tracking
-- This migration adds fields to track T&C acceptance for compliance (GDPR, legal requirements)

-- Add T&C tracking fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(10) DEFAULT '1.0';

-- Update existing users to have terms accepted (grandfather clause)
-- This ensures existing users are not locked out and are considered to have accepted T&C
UPDATE users SET
  terms_accepted = TRUE,
  terms_accepted_at = created_at,
  terms_version = '1.0'
WHERE terms_accepted IS NULL OR terms_accepted = FALSE;

-- Create index for compliance queries (find users who haven't accepted T&C)
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted, terms_accepted_at);

-- Add comment for documentation
COMMENT ON COLUMN users.terms_accepted IS 'Whether user has accepted Terms & Conditions';
COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted T&C';
COMMENT ON COLUMN users.terms_version IS 'Version of T&C accepted (e.g., 1.0, 1.1)';
-- Migration 006: Subscription System
-- Database: Tiphub_auth
-- Purpose: Add subscription management with trial support, plan tracking, and lifecycle management
-- Created: 2025-11-28

-- ============================================================================
-- Table 1: subscription_plans - Configuration table for available plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(50) PRIMARY KEY,                -- 'basic', 'premium_monthly', 'premium_yearly'
  name VARCHAR(100) NOT NULL,                -- 'Basic Free', 'Premium Monthly'
  description TEXT,
  tier VARCHAR(20) NOT NULL,                 -- Maps to user tier: 'basic' or 'premium'
  price_cents INTEGER NOT NULL DEFAULT 0,    -- Price in smallest currency unit (paise for INR)
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  billing_interval VARCHAR(20),              -- 'month', 'year', 'lifetime', NULL for free
  interval_count INTEGER DEFAULT 1,          -- Number of billing intervals (e.g., 1 month, 1 year)
  trial_days INTEGER DEFAULT 0,              -- 7 for premium plans
  features JSONB DEFAULT '[]'::jsonb,        -- Feature list for display
  is_active BOOLEAN DEFAULT TRUE,            -- Whether plan is available for purchase
  sort_order INTEGER DEFAULT 0,              -- Display order on pricing page
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_plan_tier CHECK (tier IN ('basic', 'premium')),
  CONSTRAINT check_billing_interval CHECK (
    billing_interval IN ('month', 'year', 'lifetime') OR billing_interval IS NULL
  )
);

-- Index for active plans (used on pricing page)
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, sort_order);

-- Trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE subscription_plans IS 'Configuration table for available subscription plans';
COMMENT ON COLUMN subscription_plans.id IS 'Unique plan identifier (e.g., basic, premium_monthly)';
COMMENT ON COLUMN subscription_plans.tier IS 'User tier granted by this plan (basic or premium)';
COMMENT ON COLUMN subscription_plans.price_cents IS 'Price in smallest currency unit (paise for INR)';
COMMENT ON COLUMN subscription_plans.trial_days IS 'Number of free trial days (0 for no trial)';
COMMENT ON COLUMN subscription_plans.features IS 'JSON array of feature descriptions for display';


-- ============================================================================
-- Seed default plans
-- ============================================================================
INSERT INTO subscription_plans (id, name, description, tier, price_cents, currency, billing_interval, trial_days, features, sort_order)
VALUES
  (
    'basic',
    'Basic Free',
    'Free tier with essential market analysis features',
    'basic',
    0,
    'INR',
    NULL,
    0,
    '["Home Dashboard", "Stock Browser", "Market Indices", "Basic News", "Market Mood"]'::jsonb,
    1
  ),
  (
    'premium_monthly',
    'Premium Monthly',
    'Full access to all features, billed monthly',
    'premium',
    49900,
    'INR',
    'month',
    7,
    '["Expert Stock Screener", "Strategy Backtesting", "AI Alpha Generation", "Advanced Portfolios", "Priority Support", "All Basic Features"]'::jsonb,
    2
  ),
  (
    'premium_yearly',
    'Premium Yearly',
    'Full access to all features, billed yearly (2 months free)',
    'premium',
    499900,
    'INR',
    'year',
    7,
    '["Expert Stock Screener", "Strategy Backtesting", "AI Alpha Generation", "Advanced Portfolios", "Priority Support", "All Basic Features", "2 Months Free"]'::jsonb,
    3
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  features = EXCLUDED.features,
  updated_at = NOW();


-- ============================================================================
-- Add subscription columns to users table
-- ============================================================================

-- Subscription status: none, trialing, active, cancelled, expired
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'none';

-- Reference to subscription plan
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan_id VARCHAR(50) REFERENCES subscription_plans(id);

-- Subscription period tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;

-- Trial tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS had_trial BOOLEAN DEFAULT FALSE;

-- Cancellation tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Future: Payment gateway integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Add constraint for subscription status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_subscription_status'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_subscription_status
      CHECK (subscription_status IN ('none', 'trialing', 'active', 'cancelled', 'expired'));
  END IF;
END $$;

-- Indexes for subscription queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_subscription_end ON users(subscription_end) WHERE subscription_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_trial_end ON users(trial_end) WHERE trial_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN users.subscription_status IS 'Current subscription status: none, trialing, active, cancelled, expired';
COMMENT ON COLUMN users.subscription_plan_id IS 'Reference to the active subscription plan';
COMMENT ON COLUMN users.subscription_start IS 'When the current subscription period started';
COMMENT ON COLUMN users.subscription_end IS 'When the current subscription period ends';
COMMENT ON COLUMN users.trial_end IS 'When the trial period ends (if trialing)';
COMMENT ON COLUMN users.had_trial IS 'Whether user has ever had a trial (prevents re-trial)';
COMMENT ON COLUMN users.cancelled_at IS 'When the user requested cancellation';
COMMENT ON COLUMN users.cancel_at_period_end IS 'If true, access continues until subscription_end then expires';
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for payment processing (future)';


-- ============================================================================
-- Update auth_logs constraint to include subscription events
-- ============================================================================
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS check_event_type;
ALTER TABLE auth_logs ADD CONSTRAINT check_event_type CHECK (
  event_type IN (
    -- Existing auth events
    'signup',
    'login',
    'logout',
    'failed_login',
    'password_change',
    'password_reset_request',
    'password_reset_complete',
    'email_verification',
    'account_locked',
    'account_unlocked',
    'session_revoked',
    'token_refresh',
    'oauth_link',
    'oauth_unlink',
    -- NEW: Subscription events
    'subscription_upgrade',
    'subscription_downgrade',
    'subscription_cancel',
    'trial_started',
    'trial_expired',
    'subscription_expired',
    'admin_upgrade'
  )
);

-- Index for subscription event queries
CREATE INDEX IF NOT EXISTS idx_auth_logs_subscription_events ON auth_logs(user_id, event_type, created_at DESC)
  WHERE event_type IN ('subscription_upgrade', 'subscription_downgrade', 'subscription_cancel', 'trial_started', 'trial_expired', 'subscription_expired', 'admin_upgrade');


-- ============================================================================
-- Views for subscription monitoring
-- ============================================================================

-- View: Subscription statistics
CREATE OR REPLACE VIEW subscription_stats AS
SELECT
  COUNT(*) FILTER (WHERE subscription_status = 'none') as no_subscription,
  COUNT(*) FILTER (WHERE subscription_status = 'trialing') as trialing,
  COUNT(*) FILTER (WHERE subscription_status = 'active') as active,
  COUNT(*) FILTER (WHERE subscription_status = 'cancelled') as cancelled,
  COUNT(*) FILTER (WHERE subscription_status = 'expired') as expired,
  COUNT(*) FILTER (WHERE had_trial = TRUE) as total_trials_used,
  COUNT(*) FILTER (WHERE trial_end IS NOT NULL AND trial_end > NOW()) as active_trials,
  COUNT(*) FILTER (WHERE subscription_end IS NOT NULL AND subscription_end < NOW() + INTERVAL '7 days') as expiring_soon
FROM users;

-- View: Active subscriptions by plan
CREATE OR REPLACE VIEW subscriptions_by_plan AS
SELECT
  sp.id as plan_id,
  sp.name as plan_name,
  sp.tier,
  COUNT(u.id) as subscriber_count,
  SUM(sp.price_cents) / 100.0 as total_mrr
FROM subscription_plans sp
LEFT JOIN users u ON u.subscription_plan_id = sp.id
  AND u.subscription_status IN ('trialing', 'active')
GROUP BY sp.id, sp.name, sp.tier
ORDER BY sp.sort_order;

-- View: Users with expiring trials
CREATE OR REPLACE VIEW expiring_trials AS
SELECT
  u.id,
  u.email,
  u.username,
  u.trial_end,
  EXTRACT(DAY FROM (u.trial_end - NOW())) as days_remaining,
  sp.name as plan_name
FROM users u
JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
WHERE u.subscription_status = 'trialing'
  AND u.trial_end IS NOT NULL
  AND u.trial_end > NOW()
ORDER BY u.trial_end ASC;


-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT ALL PRIVILEGES ON TABLE subscription_plans TO postgres;


-- ============================================================================
-- Migration Complete
-- ============================================================================
-- New table: subscription_plans (with 3 default plans seeded)
-- New columns on users: subscription_status, subscription_plan_id, subscription_start,
--   subscription_end, trial_end, had_trial, cancelled_at, cancel_at_period_end, stripe_customer_id
-- Updated: auth_logs check constraint (7 new subscription event types)
-- New views: subscription_stats, subscriptions_by_plan, expiring_trials
--
-- Next steps:
-- 1. Run this migration against Tiphub_auth database
-- 2. Verify: SELECT * FROM subscription_plans;
-- 3. Check user columns: \d users
-- 4. View stats: SELECT * FROM subscription_stats;
-- ============================================================================
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
-- Migration 011: Admin Email Notifications
-- This migration adds:
-- - Admin notification preferences
-- - Notification templates
-- - Notification queue and history

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NOTIFICATION EVENT TYPES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_event_types (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,  -- 'security', 'users', 'system', 'billing'
  default_enabled BOOLEAN DEFAULT TRUE,
  severity VARCHAR(20) DEFAULT 'info',  -- 'info', 'warning', 'critical'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default event types
INSERT INTO notification_event_types (key, name, description, category, default_enabled, severity) VALUES
-- Security Events
('security.failed_login_threshold', 'Failed Login Threshold', 'Notify when a user exceeds failed login attempts', 'security', true, 'warning'),
('security.account_locked', 'Account Locked', 'Notify when an account is locked', 'security', true, 'warning'),
('security.suspicious_activity', 'Suspicious Activity', 'Notify on detected suspicious behavior', 'security', true, 'critical'),
('security.admin_login', 'Admin Login', 'Notify when an admin user logs in', 'security', false, 'info'),
('security.password_reset', 'Password Reset', 'Notify when passwords are reset', 'security', false, 'info'),

-- User Events
('users.new_signup', 'New User Signup', 'Notify when a new user signs up', 'users', true, 'info'),
('users.premium_upgrade', 'Premium Upgrade', 'Notify when user upgrades to premium', 'users', true, 'info'),
('users.subscription_cancelled', 'Subscription Cancelled', 'Notify when user cancels subscription', 'users', true, 'warning'),
('users.trial_started', 'Trial Started', 'Notify when a user starts a trial', 'users', false, 'info'),
('users.trial_expired', 'Trial Expired', 'Notify when a trial expires', 'users', false, 'info'),

-- System Events
('system.high_error_rate', 'High Error Rate', 'Notify when error rate exceeds threshold', 'system', true, 'critical'),
('system.rate_limit_exceeded', 'Rate Limit Exceeded', 'Notify when rate limits are frequently hit', 'system', true, 'warning'),
('system.database_connection_issues', 'Database Issues', 'Notify on database connection problems', 'system', true, 'critical'),
('system.scheduled_maintenance', 'Scheduled Maintenance', 'Reminder for scheduled maintenance', 'system', true, 'info'),

-- Billing Events
('billing.payment_failed', 'Payment Failed', 'Notify when a payment fails', 'billing', true, 'critical'),
('billing.subscription_renewed', 'Subscription Renewed', 'Notify on successful subscription renewal', 'billing', false, 'info'),
('billing.refund_requested', 'Refund Requested', 'Notify when a refund is requested', 'billing', true, 'warning')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_notification_event_types_category ON notification_event_types(category);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADMIN NOTIFICATION PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_notification_preferences (
  id SERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type_id INTEGER NOT NULL REFERENCES notification_event_types(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT FALSE,  -- For future push notifications
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_admin_event_preference UNIQUE(admin_id, event_type_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_prefs_admin ON admin_notification_preferences(admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATION QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGSERIAL PRIMARY KEY,
  event_type_key VARCHAR(100) NOT NULL,
  recipient_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  metadata JSONB,  -- Additional data for the notification
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'cancelled'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_admin ON notification_queue(recipient_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATION HISTORY
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT REFERENCES notification_queue(id) ON DELETE SET NULL,
  event_type_key VARCHAR(100) NOT NULL,
  recipient_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- 'sent', 'failed'
  metadata JSONB,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_admin ON notification_history(recipient_admin_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_event ON notification_history(event_type_key);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent ON notification_history(sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. EMAIL TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  event_type_key VARCHAR(100) NOT NULL REFERENCES notification_event_types(key) ON DELETE CASCADE,
  subject_template VARCHAR(500) NOT NULL,
  body_text_template TEXT NOT NULL,
  body_html_template TEXT,
  variables JSONB,  -- List of available template variables
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_event_template UNIQUE(event_type_key)
);

-- Seed default email templates
INSERT INTO email_templates (event_type_key, subject_template, body_text_template, body_html_template, variables) VALUES
('security.failed_login_threshold',
 '[Tiphub Alert] Failed Login Threshold Exceeded for {{user_email}}',
 'Hello Admin,

A user account has exceeded the failed login attempt threshold.

User: {{user_email}}
Failed Attempts: {{attempt_count}}
IP Address: {{ip_address}}
Time: {{timestamp}}

The account has been temporarily locked as a security measure.

This is an automated alert from Tiphub Security.',
 NULL,
 '["user_email", "attempt_count", "ip_address", "timestamp"]'::jsonb),

('security.account_locked',
 '[Tiphub Alert] Account Locked: {{user_email}}',
 'Hello Admin,

A user account has been locked.

User: {{user_email}}
Reason: {{reason}}
Locked At: {{timestamp}}

Please review and take appropriate action if needed.

This is an automated alert from Tiphub Security.',
 NULL,
 '["user_email", "reason", "timestamp"]'::jsonb),

('users.new_signup',
 '[Tiphub] New User Signup: {{user_email}}',
 'Hello Admin,

A new user has signed up for Tiphub.

Email: {{user_email}}
Name: {{user_name}}
Tier: {{tier}}
Sign Up Method: {{provider}}
Time: {{timestamp}}

This is an automated notification from Tiphub.',
 NULL,
 '["user_email", "user_name", "tier", "provider", "timestamp"]'::jsonb),

('users.premium_upgrade',
 '[Tiphub] Premium Upgrade: {{user_email}}',
 'Hello Admin,

A user has upgraded to Premium!

Email: {{user_email}}
Name: {{user_name}}
Plan: {{plan_name}}
Amount: {{amount}}
Time: {{timestamp}}

This is an automated notification from Tiphub.',
 NULL,
 '["user_email", "user_name", "plan_name", "amount", "timestamp"]'::jsonb),

('system.high_error_rate',
 '[Tiphub Critical] High Error Rate Detected',
 'Hello Admin,

The system has detected an unusually high error rate.

Error Rate: {{error_rate}}%
Threshold: {{threshold}}%
Affected Endpoints: {{affected_endpoints}}
Time Window: {{time_window}}
Time: {{timestamp}}

Please investigate immediately.

This is an automated critical alert from Tiphub.',
 NULL,
 '["error_rate", "threshold", "affected_endpoints", "time_window", "timestamp"]'::jsonb),

('billing.payment_failed',
 '[Tiphub Alert] Payment Failed for {{user_email}}',
 'Hello Admin,

A payment has failed for a user.

User: {{user_email}}
Amount: {{amount}}
Plan: {{plan_name}}
Reason: {{failure_reason}}
Time: {{timestamp}}

The user has been notified and may need assistance.

This is an automated alert from Tiphub Billing.',
 NULL,
 '["user_email", "amount", "plan_name", "failure_reason", "timestamp"]'::jsonb)
ON CONFLICT (event_type_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. GLOBAL NOTIFICATION SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO notification_settings (key, value, description) VALUES
('smtp_host', NULL, 'SMTP server hostname'),
('smtp_port', '587', 'SMTP server port'),
('smtp_secure', 'true', 'Use TLS for SMTP'),
('smtp_user', NULL, 'SMTP username'),
('smtp_password', NULL, 'SMTP password (encrypted)'),
('from_email', 'noreply@tiphub.co', 'Default from email address'),
('from_name', 'Tiphub Notifications', 'Default from name'),
('enabled', 'false', 'Master switch for email notifications'),
('batch_size', '50', 'Number of emails to send per batch'),
('batch_interval_seconds', '60', 'Interval between batches in seconds'),
('retry_delay_seconds', '300', 'Delay before retrying failed emails')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_prefs_timestamp ON admin_notification_preferences;
CREATE TRIGGER trigger_update_notification_prefs_timestamp
  BEFORE UPDATE ON admin_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. HELPER FUNCTION TO QUEUE NOTIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION queue_admin_notification(
  p_event_type_key VARCHAR(100),
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
  v_event RECORD;
  v_template RECORD;
  v_admin RECORD;
  v_meta_item RECORD;
  v_queued INTEGER := 0;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  -- Get event type
  SELECT * INTO v_event FROM notification_event_types WHERE key = p_event_type_key;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get template
  SELECT * INTO v_template FROM email_templates WHERE event_type_key = p_event_type_key;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Find all admins subscribed to this event
  FOR v_admin IN
    SELECT u.id, u.email, u.name
    FROM users u
    JOIN admin_notification_preferences anp ON u.id = anp.admin_id
    WHERE anp.event_type_id = v_event.id
      AND anp.email_enabled = true
      AND u.role IN ('admin', 'super_admin')
  LOOP
    -- Simple template substitution (in production, use proper templating)
    v_subject := v_template.subject_template;
    v_body := v_template.body_text_template;

    -- Replace common variables
    v_subject := REPLACE(v_subject, '{{admin_name}}', COALESCE(v_admin.name, 'Admin'));
    v_body := REPLACE(v_body, '{{admin_name}}', COALESCE(v_admin.name, 'Admin'));

    -- Replace metadata variables
    IF p_metadata IS NOT NULL THEN
      FOR v_meta_item IN SELECT * FROM jsonb_each_text(p_metadata) LOOP
        v_subject := REPLACE(v_subject, '{{' || v_meta_item.key || '}}', v_meta_item.value);
        v_body := REPLACE(v_body, '{{' || v_meta_item.key || '}}', v_meta_item.value);
      END LOOP;
    END IF;

    -- Queue the notification
    INSERT INTO notification_queue (
      event_type_key,
      recipient_admin_id,
      recipient_email,
      subject,
      body_text,
      metadata,
      status
    ) VALUES (
      p_event_type_key,
      v_admin.id,
      v_admin.email,
      v_subject,
      v_body,
      p_metadata,
      'pending'
    );

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE notification_event_types IS 'Catalog of notification event types';
COMMENT ON TABLE admin_notification_preferences IS 'Per-admin notification preferences';
COMMENT ON TABLE notification_queue IS 'Queue of pending email notifications';
COMMENT ON TABLE notification_history IS 'History of sent notifications';
COMMENT ON TABLE email_templates IS 'Email templates for each event type';
COMMENT ON TABLE notification_settings IS 'Global notification system settings';
COMMENT ON FUNCTION queue_admin_notification IS 'Queue notifications for all subscribed admins';
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 013: Fix admin event types constraint
--
-- The existing constraint only allows specific admin event types, but the
-- logAdminAction middleware dynamically creates event types like
-- 'admin_update_user_role', 'admin_create_notification', etc.
--
-- This migration updates the constraint to allow any event type that
-- either matches the existing list OR starts with 'admin_'.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS check_event_type;

-- Add new constraint that allows:
-- 1. All existing event types
-- 2. Any event type starting with 'admin_' (for dynamic admin actions)
ALTER TABLE auth_logs ADD CONSTRAINT check_event_type CHECK (
  event_type IN (
    'signup', 'login', 'logout', 'failed_login', 'password_change',
    'password_reset_request', 'password_reset_complete', 'email_verification',
    'account_locked', 'account_unlocked', 'session_revoked', 'token_refresh',
    'oauth_link', 'oauth_unlink', 'subscription_upgrade', 'subscription_downgrade',
    'subscription_cancel', 'trial_started', 'trial_expired', 'subscription_expired',
    'account_deleted'
  )
  OR event_type LIKE 'admin_%'
);

COMMENT ON CONSTRAINT check_event_type ON auth_logs IS
  'Validates auth event types. Core auth events are explicitly listed. Admin actions use dynamic ''admin_*'' pattern.';
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 014: Add unauthorized_access_attempt event type
--
-- The requireRole middleware logs 'unauthorized_access_attempt' when a user
-- tries to access a route they don't have permission for. This event type
-- was missing from the check_event_type constraint, causing server crashes.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS check_event_type;

-- Add updated constraint with 'unauthorized_access_attempt'
ALTER TABLE auth_logs ADD CONSTRAINT check_event_type CHECK (
  event_type IN (
    'signup', 'login', 'logout', 'failed_login', 'password_change',
    'password_reset_request', 'password_reset_complete', 'email_verification',
    'account_locked', 'account_unlocked', 'session_revoked', 'token_refresh',
    'oauth_link', 'oauth_unlink', 'subscription_upgrade', 'subscription_downgrade',
    'subscription_cancel', 'trial_started', 'trial_expired', 'subscription_expired',
    'account_deleted', 'unauthorized_access_attempt'
  )
  OR event_type LIKE 'admin_%'
);

COMMENT ON CONSTRAINT check_event_type ON auth_logs IS
  'Validates auth event types. Core auth events are explicitly listed. Admin actions use dynamic ''admin_*'' pattern.';
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 015: Add missing auth event types for OTP and account flows
--
-- The auth routes use several event types that weren't in the check_event_type
-- constraint, causing "violates check constraint" errors.
--
-- New event types added:
--   - password_reset_requested (request initiated)
--   - password_reset_failed (verification failed)
--   - password_reset_completed (password changed)
--   - email_verification_requested (verification email sent)
--   - email_verification_failed (wrong OTP)
--   - email_verified (email confirmed)
--   - all_sessions_revoked (logout from all devices)
--   - account_deletion_requested (deletion OTP sent)
--   - account_deletion_failed (wrong OTP for deletion)
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS check_event_type;

-- Add updated constraint with all required event types
ALTER TABLE auth_logs ADD CONSTRAINT check_event_type CHECK (
  event_type IN (
    -- Core authentication events
    'signup', 'login', 'logout', 'failed_login',
    'account_locked', 'account_unlocked',
    'session_revoked', 'all_sessions_revoked',
    'token_refresh',

    -- Password management
    'password_change',
    'password_reset_request', 'password_reset_requested',
    'password_reset_complete', 'password_reset_completed',
    'password_reset_failed',

    -- Email verification
    'email_verification', 'email_verification_requested',
    'email_verification_failed', 'email_verified',

    -- OAuth
    'oauth_link', 'oauth_unlink',

    -- Subscription events
    'subscription_upgrade', 'subscription_downgrade',
    'subscription_cancel', 'trial_started',
    'trial_expired', 'subscription_expired',

    -- Account lifecycle
    'account_deletion_requested', 'account_deletion_failed',
    'account_deleted',

    -- Security events
    'unauthorized_access_attempt'
  )
  OR event_type LIKE 'admin_%'
);

COMMENT ON CONSTRAINT check_event_type ON auth_logs IS
  'Validates auth event types. Includes all OTP, password reset, email verification, and account deletion events.';
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 016: Add account_deletion to OTP purpose constraint
--
-- The account deletion flow requires sending an OTP for verification,
-- but 'account_deletion' wasn't in the check_otp_purpose constraint.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint
ALTER TABLE otp_codes DROP CONSTRAINT IF EXISTS check_otp_purpose;

-- Add updated constraint with account_deletion
ALTER TABLE otp_codes ADD CONSTRAINT check_otp_purpose CHECK (
  purpose IN (
    'password_reset',
    'email_verification',
    'login_verify',
    'account_deletion'
  )
);

COMMENT ON CONSTRAINT check_otp_purpose ON otp_codes IS
  'Validates OTP purpose types: password_reset, email_verification, login_verify, account_deletion';
-- Migration: Add phone_number and phone_verified to users table
-- Database: Tiphub_auth
-- Date: 2025-02-06

-- Add phone number column
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- Add phone verified column (for future SMS OTP verification)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN users.phone_number IS 'User phone number with country code (E.164 format, e.g., +919876543210)';
COMMENT ON COLUMN users.phone_verified IS 'Whether the phone number has been verified via SMS OTP';

-- Add index for phone number lookups (useful for future phone-based auth)
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL;
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
-- Add encrypted_key column to store AES-256-GCM encrypted full API keys
-- Allows users to reveal their full key after creation
-- Existing keys will have NULL (must rotate to get a revealable key)

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_key TEXT;
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
-- Migration: Add country_of_residence and date_of_birth to users table
-- Database: Tiphub_auth
-- Date: 2025-01-04

-- Add country of residence column
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_of_residence VARCHAR(100);

-- Add date of birth column
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add comments for documentation
COMMENT ON COLUMN users.country_of_residence IS 'Full country name (e.g., "India", "United States")';
COMMENT ON COLUMN users.date_of_birth IS 'User date of birth in ISO format';
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
-- Migration 025: Three-Tier Plan Restructure (Free / Semi / Pro)
-- Database: Tiphub_auth
-- Purpose: Replace the basic/premium tier model with Free / Semi / Pro.
--          Resets every existing user to Free per product decision.
--          Truncates subscription_plans and reseeds with the four new plans.
--
-- Prereqs: migration 024 (multi-platform) — not strictly required, but ships
-- in the same wave; safe to run independently.
--
-- Run with: psql -h <host> -U <user> -d Tiphub_auth -f migrations/025_three_tier_plans.sql

BEGIN;

-- ============================================================================
-- 1. Reset all users to free tier and clear subscription state
-- ============================================================================
-- Done first so the FK from users.subscription_plan_id is null'd before we
-- truncate subscription_plans below.
UPDATE users
SET
  subscription_plan_id    = NULL,
  subscription_status     = 'none',
  subscription_start      = NULL,
  subscription_end        = NULL,
  trial_end               = NULL,
  had_trial               = FALSE,
  cancelled_at            = NULL,
  cancel_at_period_end    = FALSE,
  updated_at              = NOW();

-- ============================================================================
-- 2. Update the tier check constraint on users to free / semi / pro
-- ============================================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_tier;

UPDATE users
SET tier = 'free',
    updated_at = NOW();

ALTER TABLE users
  ADD CONSTRAINT check_tier CHECK (tier IN ('free', 'semi', 'pro'));

-- Default for new signups
ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'free';

-- ============================================================================
-- 3. Update subscription_plans tier check + reseed
-- ============================================================================
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS check_plan_tier;

-- Wipe the old basic/premium rows. Safe — users.subscription_plan_id was
-- already null'd above so no FK violation.
DELETE FROM subscription_plans;

ALTER TABLE subscription_plans
  ADD CONSTRAINT check_plan_tier CHECK (tier IN ('free', 'semi', 'pro'));

-- Pricing values (price_cents in paise) are placeholders pending a final
-- product decision. Admins can edit them in the admin panel after deploy.
INSERT INTO subscription_plans
  (id, name, description, tier, price_cents, currency, billing_interval, trial_days, features, sort_order)
VALUES
  (
    'free',
    'Free',
    'Get started with the essentials. No coins included; coin-gated features are blocked.',
    'free',
    0,
    'INR',
    NULL,
    0,
    '["Home Dashboard", "Stock Browser", "Market Indices", "Basic News", "Market Mood"]'::jsonb,
    1
  ),
  (
    'semi_monthly',
    'Semi (Monthly)',
    'A monthly allowance of coins to spend on backtests, screeners, and AI sentiment, plus a couple of extra unlocks.',
    'semi',
    29900,
    'INR',
    'month',
    0,
    '["100 coins/month included", "Saved screener history", "Premium news depth", "All Free features"]'::jsonb,
    2
  ),
  (
    'pro_monthly',
    'Pro (Monthly)',
    'Unlimited access to every feature on every platform. No coin debits.',
    'pro',
    99900,
    'INR',
    'month',
    7,
    '["Unlimited backtests", "Unlimited screener runs", "Unlimited AI sentiment", "Equity Pro AI chat", "Priority support", "All Semi features"]'::jsonb,
    3
  ),
  (
    'pro_yearly',
    'Pro (Yearly)',
    'Pro plan billed annually. ~2 months free vs. monthly.',
    'pro',
    999900,
    'INR',
    'year',
    7,
    '["Everything in Pro Monthly", "~2 months free vs. monthly billing"]'::jsonb,
    4
  );

COMMIT;
