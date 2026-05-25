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
