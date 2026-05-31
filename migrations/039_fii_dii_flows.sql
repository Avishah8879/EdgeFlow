-- Migration 039: FII/DII cash-market flows
-- Database: equityprodata
-- Purpose: Persist NSE provisional FII/DII daily buy/sell flows.

DO $$ BEGIN
  CREATE TYPE flow_segment AS ENUM ('CASH', 'INDEX_FUT', 'STOCK_FUT', 'INDEX_OPT', 'STOCK_OPT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE flow_participant AS ENUM ('FII', 'DII', 'PROP', 'CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fii_dii_flows (
  trade_date     DATE             NOT NULL,
  segment        flow_segment     NOT NULL,
  participant    flow_participant NOT NULL,
  buy_value_cr   NUMERIC(14,4)    NOT NULL,
  sell_value_cr  NUMERIC(14,4)    NOT NULL,
  net_value_cr   NUMERIC(14,4)    GENERATED ALWAYS AS (buy_value_cr - sell_value_cr) STORED,
  buy_qty        BIGINT,
  sell_qty       BIGINT,
  source         VARCHAR(20)      NOT NULL DEFAULT 'NSE_PROVISIONAL',
  ingested_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trade_date, segment, participant)
);

CREATE INDEX IF NOT EXISTS idx_ffd_fii
  ON fii_dii_flows(trade_date DESC, segment) WHERE participant = 'FII';

CREATE INDEX IF NOT EXISTS idx_ffd_cash
  ON fii_dii_flows(trade_date DESC, participant) WHERE segment = 'CASH';
