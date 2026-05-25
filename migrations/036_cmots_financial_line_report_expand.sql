-- Migration 036: CMOTS — widen cmots_financial_line.report CHECK constraint
-- Database: equityprodata (PROD) / equityprodata_sync_dev (TEST)
-- Purpose:  Allow 'pnl', 'bs', 'cf' as distinct report values alongside the
--           existing periodicity values (quarter / year / half / nine).
--
-- Context:  Migration 035 originally scoped report to four periodicity
--           values, anticipating that Profit_and_Loss / Balance_Sheet /
--           Cash_Flow data would either be redundant (Yearly_Results
--           covers P&L) or stored elsewhere. §5 normalizer #2 design
--           revealed that BS and CF are not covered by Yearly_Results
--           (different RID spaces) — splitting into separate tables (one
--           per statement type) was rejected as over-engineering for the
--           projected ~6M row scale, so this widens report to 7 distinct
--           values. PK (co_code, statement, report, period, rid) still
--           uniquely identifies every row across all 7 source families.
--
-- Apply with:
--   psql --single-transaction --set ON_ERROR_STOP=1 \
--        -d <database> -f migrations/036_cmots_financial_line_report_expand.sql
--
-- The wrapping transaction comes from psql's --single-transaction.

ALTER TABLE cmots_financial_line
  DROP CONSTRAINT cmots_financial_line_report_check;

ALTER TABLE cmots_financial_line
  ADD CONSTRAINT cmots_financial_line_report_check
  CHECK (report IN ('pnl','bs','cf','quarter','year','half','nine'));

COMMENT ON COLUMN cmots_financial_line.report IS
  'Source family: pnl | bs | cf (dedicated statement endpoints) or '
  'quarter | year | half | nine (multi-period results endpoints). '
  'Maps to CMOTS slug family; see server/cmots_normalizers.py NORMALIZER_DISPATCH.';
