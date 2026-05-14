-- migrations/032_user_screener_templates_type.sql
--
-- Add screener_type column to user_screener_templates so the table can host
-- both Expert and Fundamental templates (and any future screener variant).
-- Existing rows are all Expert; the NOT NULL DEFAULT 'expert' backfills them
-- in-place. Row-count pre-check confirmed 1 row in the live DB (safe).
--
-- WHY WRAPPED IN BEGIN/COMMIT: three DDLs against the same table. If any
-- fails mid-way the table is left half-migrated. Explicit transaction makes
-- all-or-nothing atomic — don't rely on the migration runner to wrap us.
--
-- WHY ADD-NEW-CONSTRAINT BEFORE DROP-OLD: if the ADD fails (validation,
-- deadlock, etc.) the original (user_id, name) unique guarantee is still
-- in place. DROP-then-ADD would leave a window without uniqueness even
-- inside a transaction.
--
-- The dropped constraint name comes from a live-DB pre-check (pg_constraint
-- query), not from a guess. Confirmed conname: user_screener_templates_user_id_name_key.
--
-- ROLLBACK NOTE: once Fundamental templates exist in this table, rolling
-- back the screener_type column is NOT a simple reverse SQL — those rows
-- would need to be migrated out (or deleted) first. Don't auto-revert.

BEGIN;

ALTER TABLE user_screener_templates
  ADD COLUMN IF NOT EXISTS screener_type VARCHAR(20) NOT NULL DEFAULT 'expert';

-- Add the new compound unique BEFORE dropping the old one, so we never
-- lose the uniqueness guarantee even mid-transaction.
ALTER TABLE user_screener_templates
  ADD CONSTRAINT user_screener_templates_user_type_name_key
    UNIQUE (user_id, screener_type, name);

-- Real conname from pg_constraint pre-check.
ALTER TABLE user_screener_templates
  DROP CONSTRAINT IF EXISTS user_screener_templates_user_id_name_key;

CREATE INDEX IF NOT EXISTS idx_user_screener_templates_user_type
  ON user_screener_templates (user_id, screener_type, created_at DESC);

INSERT INTO system_config (key, value, description, category) VALUES
  ('user_fundamental_templates_max', '5',
   'Hard cap on saved fundamental screener templates per user', 'limits')
ON CONFLICT (key) DO NOTHING;

COMMIT;
