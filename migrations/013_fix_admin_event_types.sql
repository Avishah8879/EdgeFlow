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
