-- Migration 012: Fix queue_admin_notification function
-- Fixes the FOR loop variable declaration issue from migration 011

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

COMMENT ON FUNCTION queue_admin_notification IS 'Queue notifications for all subscribed admins';
