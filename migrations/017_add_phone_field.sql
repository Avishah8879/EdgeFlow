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
