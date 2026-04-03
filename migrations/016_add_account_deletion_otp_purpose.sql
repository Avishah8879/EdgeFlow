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
