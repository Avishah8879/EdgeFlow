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
