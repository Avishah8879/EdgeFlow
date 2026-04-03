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
