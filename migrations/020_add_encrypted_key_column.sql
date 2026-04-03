-- Add encrypted_key column to store AES-256-GCM encrypted full API keys
-- Allows users to reveal their full key after creation
-- Existing keys will have NULL (must rotate to get a revealable key)

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_key TEXT;
