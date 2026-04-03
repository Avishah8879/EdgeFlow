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
