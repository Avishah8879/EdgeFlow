-- Add missing index on user_id for api_usage_log
-- The usage dashboard queries all filter by user_id + created_at
-- Without this index, queries do full table scans

CREATE INDEX IF NOT EXISTS idx_api_usage_user_date
  ON api_usage_log(user_id, created_at DESC);
