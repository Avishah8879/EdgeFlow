-- Migration 011: Admin Email Notifications
-- This migration adds:
-- - Admin notification preferences
-- - Notification templates
-- - Notification queue and history

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NOTIFICATION EVENT TYPES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_event_types (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,  -- 'security', 'users', 'system', 'billing'
  default_enabled BOOLEAN DEFAULT TRUE,
  severity VARCHAR(20) DEFAULT 'info',  -- 'info', 'warning', 'critical'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default event types
INSERT INTO notification_event_types (key, name, description, category, default_enabled, severity) VALUES
-- Security Events
('security.failed_login_threshold', 'Failed Login Threshold', 'Notify when a user exceeds failed login attempts', 'security', true, 'warning'),
('security.account_locked', 'Account Locked', 'Notify when an account is locked', 'security', true, 'warning'),
('security.suspicious_activity', 'Suspicious Activity', 'Notify on detected suspicious behavior', 'security', true, 'critical'),
('security.admin_login', 'Admin Login', 'Notify when an admin user logs in', 'security', false, 'info'),
('security.password_reset', 'Password Reset', 'Notify when passwords are reset', 'security', false, 'info'),

-- User Events
('users.new_signup', 'New User Signup', 'Notify when a new user signs up', 'users', true, 'info'),
('users.premium_upgrade', 'Premium Upgrade', 'Notify when user upgrades to premium', 'users', true, 'info'),
('users.subscription_cancelled', 'Subscription Cancelled', 'Notify when user cancels subscription', 'users', true, 'warning'),
('users.trial_started', 'Trial Started', 'Notify when a user starts a trial', 'users', false, 'info'),
('users.trial_expired', 'Trial Expired', 'Notify when a trial expires', 'users', false, 'info'),

-- System Events
('system.high_error_rate', 'High Error Rate', 'Notify when error rate exceeds threshold', 'system', true, 'critical'),
('system.rate_limit_exceeded', 'Rate Limit Exceeded', 'Notify when rate limits are frequently hit', 'system', true, 'warning'),
('system.database_connection_issues', 'Database Issues', 'Notify on database connection problems', 'system', true, 'critical'),
('system.scheduled_maintenance', 'Scheduled Maintenance', 'Reminder for scheduled maintenance', 'system', true, 'info'),

-- Billing Events
('billing.payment_failed', 'Payment Failed', 'Notify when a payment fails', 'billing', true, 'critical'),
('billing.subscription_renewed', 'Subscription Renewed', 'Notify on successful subscription renewal', 'billing', false, 'info'),
('billing.refund_requested', 'Refund Requested', 'Notify when a refund is requested', 'billing', true, 'warning')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_notification_event_types_category ON notification_event_types(category);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADMIN NOTIFICATION PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_notification_preferences (
  id SERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type_id INTEGER NOT NULL REFERENCES notification_event_types(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT FALSE,  -- For future push notifications
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_admin_event_preference UNIQUE(admin_id, event_type_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_prefs_admin ON admin_notification_preferences(admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATION QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGSERIAL PRIMARY KEY,
  event_type_key VARCHAR(100) NOT NULL,
  recipient_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  metadata JSONB,  -- Additional data for the notification
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'cancelled'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_admin ON notification_queue(recipient_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATION HISTORY
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT REFERENCES notification_queue(id) ON DELETE SET NULL,
  event_type_key VARCHAR(100) NOT NULL,
  recipient_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- 'sent', 'failed'
  metadata JSONB,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_admin ON notification_history(recipient_admin_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_event ON notification_history(event_type_key);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent ON notification_history(sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. EMAIL TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  event_type_key VARCHAR(100) NOT NULL REFERENCES notification_event_types(key) ON DELETE CASCADE,
  subject_template VARCHAR(500) NOT NULL,
  body_text_template TEXT NOT NULL,
  body_html_template TEXT,
  variables JSONB,  -- List of available template variables
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_event_template UNIQUE(event_type_key)
);

-- Seed default email templates
INSERT INTO email_templates (event_type_key, subject_template, body_text_template, body_html_template, variables) VALUES
('security.failed_login_threshold',
 '[Tiphub Alert] Failed Login Threshold Exceeded for {{user_email}}',
 'Hello Admin,

A user account has exceeded the failed login attempt threshold.

User: {{user_email}}
Failed Attempts: {{attempt_count}}
IP Address: {{ip_address}}
Time: {{timestamp}}

The account has been temporarily locked as a security measure.

This is an automated alert from Tiphub Security.',
 NULL,
 '["user_email", "attempt_count", "ip_address", "timestamp"]'::jsonb),

('security.account_locked',
 '[Tiphub Alert] Account Locked: {{user_email}}',
 'Hello Admin,

A user account has been locked.

User: {{user_email}}
Reason: {{reason}}
Locked At: {{timestamp}}

Please review and take appropriate action if needed.

This is an automated alert from Tiphub Security.',
 NULL,
 '["user_email", "reason", "timestamp"]'::jsonb),

('users.new_signup',
 '[Tiphub] New User Signup: {{user_email}}',
 'Hello Admin,

A new user has signed up for Tiphub.

Email: {{user_email}}
Name: {{user_name}}
Tier: {{tier}}
Sign Up Method: {{provider}}
Time: {{timestamp}}

This is an automated notification from Tiphub.',
 NULL,
 '["user_email", "user_name", "tier", "provider", "timestamp"]'::jsonb),

('users.premium_upgrade',
 '[Tiphub] Premium Upgrade: {{user_email}}',
 'Hello Admin,

A user has upgraded to Premium!

Email: {{user_email}}
Name: {{user_name}}
Plan: {{plan_name}}
Amount: {{amount}}
Time: {{timestamp}}

This is an automated notification from Tiphub.',
 NULL,
 '["user_email", "user_name", "plan_name", "amount", "timestamp"]'::jsonb),

('system.high_error_rate',
 '[Tiphub Critical] High Error Rate Detected',
 'Hello Admin,

The system has detected an unusually high error rate.

Error Rate: {{error_rate}}%
Threshold: {{threshold}}%
Affected Endpoints: {{affected_endpoints}}
Time Window: {{time_window}}
Time: {{timestamp}}

Please investigate immediately.

This is an automated critical alert from Tiphub.',
 NULL,
 '["error_rate", "threshold", "affected_endpoints", "time_window", "timestamp"]'::jsonb),

('billing.payment_failed',
 '[Tiphub Alert] Payment Failed for {{user_email}}',
 'Hello Admin,

A payment has failed for a user.

User: {{user_email}}
Amount: {{amount}}
Plan: {{plan_name}}
Reason: {{failure_reason}}
Time: {{timestamp}}

The user has been notified and may need assistance.

This is an automated alert from Tiphub Billing.',
 NULL,
 '["user_email", "amount", "plan_name", "failure_reason", "timestamp"]'::jsonb)
ON CONFLICT (event_type_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. GLOBAL NOTIFICATION SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO notification_settings (key, value, description) VALUES
('smtp_host', NULL, 'SMTP server hostname'),
('smtp_port', '587', 'SMTP server port'),
('smtp_secure', 'true', 'Use TLS for SMTP'),
('smtp_user', NULL, 'SMTP username'),
('smtp_password', NULL, 'SMTP password (encrypted)'),
('from_email', 'noreply@tiphub.co', 'Default from email address'),
('from_name', 'Tiphub Notifications', 'Default from name'),
('enabled', 'false', 'Master switch for email notifications'),
('batch_size', '50', 'Number of emails to send per batch'),
('batch_interval_seconds', '60', 'Interval between batches in seconds'),
('retry_delay_seconds', '300', 'Delay before retrying failed emails')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_prefs_timestamp ON admin_notification_preferences;
CREATE TRIGGER trigger_update_notification_prefs_timestamp
  BEFORE UPDATE ON admin_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. HELPER FUNCTION TO QUEUE NOTIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION queue_admin_notification(
  p_event_type_key VARCHAR(100),
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
  v_event RECORD;
  v_template RECORD;
  v_admin RECORD;
  v_meta_item RECORD;
  v_queued INTEGER := 0;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  -- Get event type
  SELECT * INTO v_event FROM notification_event_types WHERE key = p_event_type_key;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get template
  SELECT * INTO v_template FROM email_templates WHERE event_type_key = p_event_type_key;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Find all admins subscribed to this event
  FOR v_admin IN
    SELECT u.id, u.email, u.name
    FROM users u
    JOIN admin_notification_preferences anp ON u.id = anp.admin_id
    WHERE anp.event_type_id = v_event.id
      AND anp.email_enabled = true
      AND u.role IN ('admin', 'super_admin')
  LOOP
    -- Simple template substitution (in production, use proper templating)
    v_subject := v_template.subject_template;
    v_body := v_template.body_text_template;

    -- Replace common variables
    v_subject := REPLACE(v_subject, '{{admin_name}}', COALESCE(v_admin.name, 'Admin'));
    v_body := REPLACE(v_body, '{{admin_name}}', COALESCE(v_admin.name, 'Admin'));

    -- Replace metadata variables
    IF p_metadata IS NOT NULL THEN
      FOR v_meta_item IN SELECT * FROM jsonb_each_text(p_metadata) LOOP
        v_subject := REPLACE(v_subject, '{{' || v_meta_item.key || '}}', v_meta_item.value);
        v_body := REPLACE(v_body, '{{' || v_meta_item.key || '}}', v_meta_item.value);
      END LOOP;
    END IF;

    -- Queue the notification
    INSERT INTO notification_queue (
      event_type_key,
      recipient_admin_id,
      recipient_email,
      subject,
      body_text,
      metadata,
      status
    ) VALUES (
      p_event_type_key,
      v_admin.id,
      v_admin.email,
      v_subject,
      v_body,
      p_metadata,
      'pending'
    );

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE notification_event_types IS 'Catalog of notification event types';
COMMENT ON TABLE admin_notification_preferences IS 'Per-admin notification preferences';
COMMENT ON TABLE notification_queue IS 'Queue of pending email notifications';
COMMENT ON TABLE notification_history IS 'History of sent notifications';
COMMENT ON TABLE email_templates IS 'Email templates for each event type';
COMMENT ON TABLE notification_settings IS 'Global notification system settings';
COMMENT ON FUNCTION queue_admin_notification IS 'Queue notifications for all subscribed admins';
