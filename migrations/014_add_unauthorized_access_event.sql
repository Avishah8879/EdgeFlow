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
