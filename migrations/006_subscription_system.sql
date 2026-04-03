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
