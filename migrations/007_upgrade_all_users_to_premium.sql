-- Migration: Upgrade all existing users to premium tier (temporary)
-- This is a reversible change - can be undone by setting tier back to 'basic'
--
-- Run on Tiphub_auth database:
-- psql -d Tiphub_auth -f migrations/007_upgrade_all_users_to_premium.sql

-- Upgrade all basic users to premium
UPDATE users
SET
  tier = 'premium',
  updated_at = NOW()
WHERE tier = 'basic';

-- Log how many users were affected
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Upgraded % users from basic to premium tier', affected_count;
END $$;

-- Verify the change
SELECT
  tier,
  COUNT(*) as user_count
FROM users
GROUP BY tier;
