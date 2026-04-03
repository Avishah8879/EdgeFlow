-- Migration 004: Create Authentication Tables for Tiphub_auth Database
-- Database: Tiphub_auth (see AUTH_DB_* environment variables)
-- Purpose: Secure authentication system with bcrypt + JWT + Google OAuth support
-- Created: 2025-11-25

-- ============================================================================
-- Table 1: users - Main user authentication table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,

  -- Profile information
  name VARCHAR(255),
  avatar_url TEXT,

  -- Authentication fields
  provider VARCHAR(20) NOT NULL DEFAULT 'password', -- 'password' or 'google'
  password_hash TEXT, -- NULL for OAuth users, bcrypt hash for password users
  google_id VARCHAR(255) UNIQUE, -- NULL for password users, Google user ID for OAuth users

  -- Account status
  email_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  tier VARCHAR(20) DEFAULT 'basic', -- 'basic' or 'premium'

  -- Security tracking
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45), -- Supports IPv4 and IPv6
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ, -- Account lockout timestamp

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_provider CHECK (provider IN ('password', 'google')),
  CONSTRAINT check_tier CHECK (tier IN ('basic', 'premium')),
  CONSTRAINT check_password_or_oauth CHECK (
    (provider = 'password' AND password_hash IS NOT NULL) OR
    (provider = 'google' AND google_id IS NOT NULL)
  )
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_provider ON users(provider);
CREATE INDEX idx_users_last_login ON users(last_login_at DESC);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

COMMENT ON TABLE users IS 'Main user authentication table supporting both password and OAuth authentication';
COMMENT ON COLUMN users.provider IS 'Authentication provider: password (manual signup) or google (OAuth)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of password (NULL for OAuth users)';
COMMENT ON COLUMN users.google_id IS 'Google user ID from OAuth (NULL for password users)';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp (NULL if not locked)';


-- ============================================================================
-- Table 2: sessions - Active login sessions with JWT tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token information (hashed for security)
  token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of JWT access token
  refresh_token_hash VARCHAR(64) UNIQUE, -- SHA-256 hash of JWT refresh token

  -- Session metadata
  device_info TEXT, -- User agent string
  ip_address VARCHAR(45), -- IP address of the session
  location VARCHAR(255), -- Optional: City, Country from IP

  -- Session lifecycle
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT, -- 'logout', 'security', 'expired', etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_expiry CHECK (expires_at > issued_at)
);

-- Indexes for sessions table
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(user_id, revoked, expires_at) WHERE revoked = FALSE;
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at DESC);

COMMENT ON TABLE sessions IS 'Active user sessions with JWT tokens for revocation capability';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 hash of JWT access token (not the token itself)';
COMMENT ON COLUMN sessions.refresh_token_hash IS 'SHA-256 hash of JWT refresh token';
COMMENT ON COLUMN sessions.revoked IS 'Session revoked flag (for logout or security)';


-- ============================================================================
-- Table 3: auth_logs - Authentication audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if user deleted

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  provider VARCHAR(20), -- 'password', 'google'

  -- Request metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info TEXT,
  location VARCHAR(255),

  -- Result
  success BOOLEAN NOT NULL,
  failure_reason TEXT, -- Error message for failed attempts
  metadata JSONB, -- Additional context data

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_event_type CHECK (event_type IN (
    'signup',
    'login',
    'logout',
    'failed_login',
    'password_change',
    'password_reset_request',
    'password_reset_complete',
    'email_verification',
    'account_locked',
    'account_unlocked',
    'session_revoked',
    'token_refresh',
    'oauth_link',
    'oauth_unlink'
  ))
);

-- Indexes for auth_logs table
CREATE INDEX idx_auth_logs_user_id ON auth_logs(user_id);
CREATE INDEX idx_auth_logs_event_type ON auth_logs(event_type);
CREATE INDEX idx_auth_logs_created_at ON auth_logs(created_at DESC);
CREATE INDEX idx_auth_logs_ip ON auth_logs(ip_address);
CREATE INDEX idx_auth_logs_success ON auth_logs(success);
CREATE INDEX idx_auth_logs_failed_logins ON auth_logs(user_id, event_type, created_at)
  WHERE event_type = 'failed_login' AND success = FALSE;

COMMENT ON TABLE auth_logs IS 'Authentication event audit trail for security monitoring';
COMMENT ON COLUMN auth_logs.event_type IS 'Type of authentication event (login, signup, failed_login, etc.)';
COMMENT ON COLUMN auth_logs.metadata IS 'Additional JSON data for the event';


-- ============================================================================
-- Table 4: oauth_accounts - OAuth provider accounts (future multi-provider)
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- OAuth provider info
  provider VARCHAR(20) NOT NULL, -- 'google', 'facebook', 'github', etc.
  provider_user_id VARCHAR(255) NOT NULL, -- Provider's user ID

  -- OAuth tokens (should be encrypted in production)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Profile data from provider
  email VARCHAR(255),
  name VARCHAR(255),
  avatar_url TEXT,
  profile_data JSONB, -- Full OAuth profile response

  -- Tracking
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_provider_user UNIQUE(provider, provider_user_id)
);

-- Indexes for oauth_accounts table
CREATE INDEX idx_oauth_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_provider ON oauth_accounts(provider, provider_user_id);
CREATE INDEX idx_oauth_last_used ON oauth_accounts(last_used_at DESC);

COMMENT ON TABLE oauth_accounts IS 'OAuth provider accounts linked to users (supports multiple providers per user)';
COMMENT ON COLUMN oauth_accounts.provider_user_id IS 'User ID from the OAuth provider (e.g., Google user ID)';
COMMENT ON COLUMN oauth_accounts.profile_data IS 'Full JSON profile from OAuth provider';


-- ============================================================================
-- Triggers: Update updated_at timestamp automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Indexes for query performance
-- ============================================================================

-- Composite index for session validation queries
CREATE INDEX idx_sessions_validation ON sessions(token_hash, revoked, expires_at);

-- Index for finding recent failed logins (for account lockout)
CREATE INDEX idx_auth_logs_recent_failures ON auth_logs(user_id, created_at DESC)
  WHERE event_type = 'failed_login' AND success = FALSE;

-- Index for active user sessions query
CREATE INDEX idx_sessions_active_user ON sessions(user_id, expires_at DESC)
  WHERE revoked = FALSE;


-- ============================================================================
-- Initial Data: Create demo admin user (optional)
-- ============================================================================
-- Uncomment to create a default admin user
-- Password: 'Admin123!' (bcrypt hash cost 12)
/*
INSERT INTO users (email, username, name, provider, password_hash, tier, email_verified, is_active)
VALUES (
  'admin@tiphub.com',
  'admin',
  'Tiphub Admin',
  'password',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5OMr4TcW0lX4G', -- 'Admin123!'
  'premium',
  TRUE,
  TRUE
) ON CONFLICT (email) DO NOTHING;
*/


-- ============================================================================
-- Views: Useful queries for monitoring
-- ============================================================================

-- View: Active sessions by user
CREATE OR REPLACE VIEW active_sessions AS
SELECT
  u.id as user_id,
  u.email,
  u.username,
  u.tier,
  COUNT(s.id) as active_sessions,
  MAX(s.last_activity_at) as last_activity
FROM users u
JOIN sessions s ON u.id = s.user_id
WHERE s.revoked = FALSE
  AND s.expires_at > NOW()
GROUP BY u.id, u.email, u.username, u.tier;

-- View: Recent authentication events
CREATE OR REPLACE VIEW recent_auth_events AS
SELECT
  al.id,
  al.created_at,
  u.email,
  u.username,
  al.event_type,
  al.provider,
  al.ip_address,
  al.success,
  al.failure_reason
FROM auth_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;

-- View: User statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT
  COUNT(*) FILTER (WHERE provider = 'password') as password_users,
  COUNT(*) FILTER (WHERE provider = 'google') as google_users,
  COUNT(*) FILTER (WHERE tier = 'basic') as basic_tier,
  COUNT(*) FILTER (WHERE tier = 'premium') as premium_tier,
  COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_last_7_days,
  COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') as active_last_30_days,
  COUNT(*) FILTER (WHERE email_verified = TRUE) as email_verified_count,
  COUNT(*) FILTER (WHERE is_active = TRUE) as active_accounts
FROM users;


-- ============================================================================
-- Grant Permissions (adjust as needed for your user)
-- ============================================================================
GRANT ALL PRIVILEGES ON TABLE users TO postgres;
GRANT ALL PRIVILEGES ON TABLE sessions TO postgres;
GRANT ALL PRIVILEGES ON TABLE auth_logs TO postgres;
GRANT ALL PRIVILEGES ON TABLE oauth_accounts TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE auth_logs_id_seq TO postgres;


-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Tables created: users, sessions, auth_logs, oauth_accounts
-- Indexes created: 24 indexes for optimal query performance
-- Triggers created: updated_at auto-update for users and oauth_accounts
-- Views created: active_sessions, recent_auth_events, user_stats
--
-- Next steps:
-- 1. Run this migration against Tiphub_auth database
-- 2. Verify tables created: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- 3. Check indexes: SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';
-- 4. Test queries: SELECT * FROM user_stats;
-- ============================================================================
