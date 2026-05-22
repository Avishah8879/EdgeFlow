-- =====================================================================
-- EdgeFlow / EquityPro — Target Schema DDL
-- =====================================================================
--
-- Companion to db-target-schema.md. This file is the single source of
-- truth for the redesigned schema. Idempotent (CREATE … IF NOT EXISTS)
-- so it doubles as a fresh-DB bootstrap.
--
-- DO NOT APPLY DIRECTLY TO PRODUCTION. The migration order is in
-- db-migration-plan.md; each phase produces its own numbered migration
-- file under EdgeFlow/migrations/030_*.sql onward.
--
-- All [CMOTS?] markers indicate columns whose name or type is uncertain
-- without the CMOTS data dictionary. Confirm before implementation.
--
-- Database target: PostgreSQL 14 + TimescaleDB extension.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

DO $$ BEGIN
    CREATE TYPE corporate_action_type AS ENUM (
        'DIVIDEND', 'BONUS', 'SPLIT', 'RIGHTS', 'BUYBACK',
        'MERGER', 'DEMERGER', 'NAME_CHANGE', 'ISIN_CHANGE', 'FACE_VALUE_CHANGE',
        'LISTING', 'DELISTING', 'SUSPENSION', 'REVOCATION',
        'CONSOLIDATION', 'AMALGAMATION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE adjustment_kind AS ENUM ('SPLIT', 'BONUS', 'RIGHTS', 'DIVIDEND_TR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE statement_type AS ENUM ('INCOME', 'BALANCE_SHEET', 'CASH_FLOW', 'EQUITY_CHANGES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE period_type AS ENUM ('Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'ANNUAL', 'TTM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE reporting_basis AS ENUM ('STANDALONE', 'CONSOLIDATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE amount_unit AS ENUM ('CR', 'LAKH', 'ABSOLUTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ratio_source AS ENUM ('CMOTS', 'INTERNAL_CALC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE holder_category AS ENUM (
        'PROMOTER', 'DOMESTIC_INSTITUTION', 'FOREIGN_INSTITUTION',
        'MUTUAL_FUND', 'RETAIL', 'GOVERNMENT', 'OTHERS'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE holder_type AS ENUM (
        'PROMOTER_INDIVIDUAL', 'PROMOTER_GROUP_ENTITY',
        'FII_FUND', 'DII_FUND', 'MF_SCHEME', 'INSURANCE',
        'RETAIL_GT_1PCT'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deal_type AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE exchange_kind AS ENUM ('NSE', 'BSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rating_level AS ENUM (
        'STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'SELL', 'STRONG_SELL'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE analyst_source AS ENUM (
        'BLOOMBERG', 'REUTERS', 'CMOTS_BROKERAGE', 'INTERNAL_PDF'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE estimate_type AS ENUM ('EPS', 'REVENUE', 'EBITDA', 'NET_PROFIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE vix_regime AS ENUM ('LOW_VOL', 'NORMAL', 'HIGH_VOL', 'CRISIS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE flow_segment AS ENUM (
        'CASH', 'INDEX_FUT', 'STOCK_FUT', 'INDEX_OPT', 'STOCK_OPT'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE flow_participant AS ENUM ('FII', 'DII', 'PROP', 'CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 2. MASTER / REFERENCE LAYER
-- =====================================================================

-- 2.1 companies — CMOTS-shaped company master
CREATE TABLE IF NOT EXISTS companies (
    co_code                  INTEGER       PRIMARY KEY, -- [CMOTS?] integer vs varchar
    company_name             VARCHAR(255)  NOT NULL,    -- [CMOTS?] LongName
    short_name               VARCHAR(100),              -- [CMOTS?]
    industry                 VARCHAR(100),
    industry_code            INTEGER,                   -- [CMOTS?] FK target deferred
    sector                   VARCHAR(100),
    mcap_class               VARCHAR(20),               -- LARGE/MID/SMALL/MICRO
    isin_primary             CHAR(12),
    incorporation_date       DATE,
    registered_office_state  VARCHAR(50),               -- [CMOTS?]
    country                  CHAR(2)       NOT NULL DEFAULT 'IN',
    bse_listed               BOOLEAN       NOT NULL DEFAULT FALSE,
    nse_listed               BOOLEAN       NOT NULL DEFAULT FALSE,
    status                   VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    merged_into_co_code      INTEGER       REFERENCES companies(co_code),
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    cmots_last_seen_at       TIMESTAMPTZ,
    CONSTRAINT companies_status_check CHECK (
        status IN ('ACTIVE', 'MERGED', 'DELISTED', 'SUSPENDED', 'WOUND_UP')
    )
);
CREATE INDEX IF NOT EXISTS idx_companies_isin_primary
    ON companies(isin_primary) WHERE isin_primary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_industry
    ON companies(industry) WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_active
    ON companies(co_code) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm
    ON companies USING gin (company_name gin_trgm_ops);


-- 2.2 scrips — per-exchange listed line
CREATE TABLE IF NOT EXISTS scrips (
    scrip_id          INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    co_code           INTEGER       NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    exchange          VARCHAR(8)    NOT NULL,
    bse_code          VARCHAR(10),
    nse_symbol        VARCHAR(20),
    series            VARCHAR(4)    NOT NULL,
    isin              CHAR(12)      NOT NULL,
    face_value        NUMERIC(10,2),
    lot_size          INTEGER       NOT NULL DEFAULT 1,
    tick_size         NUMERIC(8,4)  NOT NULL DEFAULT 0.05,
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    listing_date      DATE,
    delisting_date    DATE,
    suspended_from    DATE,
    suspended_reason  VARCHAR(50),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    cmots_last_seen_at TIMESTAMPTZ,
    CONSTRAINT scrips_exchange_check CHECK (exchange IN ('NSE', 'BSE')),
    CONSTRAINT scrips_symbol_present CHECK (
        (exchange = 'NSE' AND nse_symbol IS NOT NULL)
     OR (exchange = 'BSE' AND bse_code  IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrips_bse_code
    ON scrips(exchange, bse_code) WHERE bse_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrips_nse_symbol_series
    ON scrips(exchange, nse_symbol, series) WHERE nse_symbol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrips_isin_exchange
    ON scrips(isin, exchange);
CREATE INDEX IF NOT EXISTS idx_scrips_co_code           ON scrips(co_code);
CREATE INDEX IF NOT EXISTS idx_scrips_isin              ON scrips(isin);
CREATE INDEX IF NOT EXISTS idx_scrips_active            ON scrips(scrip_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_scrips_nse_symbol        ON scrips(nse_symbol) WHERE nse_symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scrips_bse_code          ON scrips(bse_code) WHERE bse_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scrips_series            ON scrips(series);


-- 2.3 indices — index master (referenced by instruments before instruments is created)
CREATE TABLE IF NOT EXISTS indices (
    index_id          INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    index_code        VARCHAR(40)   NOT NULL UNIQUE, -- [CMOTS?] CMOTS internal index code
    index_symbol      VARCHAR(40)   NOT NULL UNIQUE,
    index_name        VARCHAR(200)  NOT NULL,
    index_family      VARCHAR(40)   NOT NULL, -- NIFTY/SENSEX/BSE/sectoral
    index_kind        VARCHAR(20)   NOT NULL,
    exchange          VARCHAR(8)    NOT NULL DEFAULT 'NSE',
    base_value        NUMERIC(14,4),
    base_date         DATE,
    currency          CHAR(3)       NOT NULL DEFAULT 'INR',
    is_tradeable      BOOLEAN       NOT NULL DEFAULT FALSE,
    methodology_url   TEXT,
    total_return_index_id INTEGER   REFERENCES indices(index_id),
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT indices_kind_check CHECK (index_kind IN
        ('BROAD', 'SECTORAL', 'THEMATIC', 'STRATEGY', 'VOLATILITY', 'BOND'))
);
CREATE INDEX IF NOT EXISTS idx_indices_family ON indices(index_family);
CREATE INDEX IF NOT EXISTS idx_indices_active ON indices(index_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_indices_kind   ON indices(index_kind);


-- 2.4 mf_amcs + mf_schemes — MF master
CREATE TABLE IF NOT EXISTS mf_amcs (
    amc_id            INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    amfi_amc_code     VARCHAR(20)   UNIQUE,
    amc_name          VARCHAR(200)  NOT NULL,
    amc_short_name    VARCHAR(50),
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mf_schemes (
    mf_scheme_id           INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    scheme_code            INTEGER       NOT NULL UNIQUE, -- AMFI scheme code
    scheme_name            VARCHAR(255)  NOT NULL,
    amc_id                 INTEGER       NOT NULL REFERENCES mf_amcs(amc_id),
    category               VARCHAR(40)   NOT NULL,
    sub_category           VARCHAR(80),
    risk_grade             VARCHAR(20),
    plan_type              VARCHAR(20),  -- DIRECT/REGULAR
    option_type            VARCHAR(20),  -- GROWTH/IDCW_REINVEST/IDCW_PAYOUT
    isin_growth            CHAR(12),
    isin_idcw              CHAR(12),
    nav_publish_frequency  VARCHAR(10)   NOT NULL DEFAULT 'DAILY',
    inception_date         DATE,
    is_active              BOOLEAN       NOT NULL DEFAULT TRUE,
    cmots_scheme_code      VARCHAR(40),  -- [CMOTS?]
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mf_schemes_amc       ON mf_schemes(amc_id);
CREATE INDEX IF NOT EXISTS idx_mf_schemes_category  ON mf_schemes(category, sub_category);
CREATE INDEX IF NOT EXISTS idx_mf_schemes_active    ON mf_schemes(mf_scheme_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_mf_schemes_isin_g    ON mf_schemes(isin_growth) WHERE isin_growth IS NOT NULL;


-- 2.5 instruments — universal asset table
CREATE TABLE IF NOT EXISTS instruments (
    instrument_id            BIGINT        PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    asset_class              VARCHAR(10)   NOT NULL,
    scrip_id                 INTEGER       REFERENCES scrips(scrip_id),
    index_id                 INTEGER       REFERENCES indices(index_id),
    mf_scheme_id             INTEGER       REFERENCES mf_schemes(mf_scheme_id),
    underlying_instrument_id BIGINT        REFERENCES instruments(instrument_id),
    display_symbol           VARCHAR(80)   NOT NULL,
    display_long_name        VARCHAR(255),
    currency                 CHAR(3)       NOT NULL DEFAULT 'INR',
    is_tradeable             BOOLEAN       NOT NULL DEFAULT TRUE,
    is_active                BOOLEAN       NOT NULL DEFAULT TRUE,
    derivative_meta          JSONB,
    bond_meta                JSONB,
    etf_meta                 JSONB,
    legacy_ticker_id         INTEGER       UNIQUE, -- bridge to old tickers.id during transition
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT instruments_asset_class_check CHECK (
        asset_class IN ('EQUITY', 'INDEX', 'FUTURE', 'OPTION', 'MF', 'ETF', 'BOND')
    ),
    CONSTRAINT instruments_one_master CHECK (
        (asset_class IN ('EQUITY','ETF','BOND') AND scrip_id     IS NOT NULL AND index_id IS NULL AND mf_scheme_id IS NULL) OR
        (asset_class = 'INDEX'                  AND index_id     IS NOT NULL AND scrip_id IS NULL AND mf_scheme_id IS NULL) OR
        (asset_class = 'MF'                     AND mf_scheme_id IS NOT NULL AND scrip_id IS NULL AND index_id IS NULL)     OR
        (asset_class IN ('FUTURE','OPTION')     AND underlying_instrument_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instruments_scrip
    ON instruments(asset_class, scrip_id) WHERE scrip_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_instruments_index
    ON instruments(asset_class, index_id) WHERE index_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_instruments_mf
    ON instruments(asset_class, mf_scheme_id) WHERE mf_scheme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instruments_active
    ON instruments(asset_class) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_instruments_underlying
    ON instruments(underlying_instrument_id) WHERE underlying_instrument_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instruments_display_symbol
    ON instruments(display_symbol);
CREATE INDEX IF NOT EXISTS idx_instruments_derivative_expiry
    ON instruments((derivative_meta->>'expiry'))
    WHERE asset_class IN ('FUTURE','OPTION');


-- 2.6 instrument_identifiers — vendor-id history (SCD-2)
CREATE TABLE IF NOT EXISTS instrument_identifiers (
    instrument_id     BIGINT        NOT NULL REFERENCES instruments(instrument_id) ON DELETE CASCADE,
    vendor            VARCHAR(20)   NOT NULL,
    vendor_id         VARCHAR(80)   NOT NULL,
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    valid_from        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    valid_to          TIMESTAMPTZ,
    meta              JSONB,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instrument_id, vendor, valid_from)
);
-- The single hottest LTP-stream lookup: which instrument is Fyers ex-token X?
CREATE UNIQUE INDEX IF NOT EXISTS uq_iid_vendor_id_active
    ON instrument_identifiers(vendor, vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_iid_instrument_active
    ON instrument_identifiers(instrument_id, vendor) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_iid_vendor_history
    ON instrument_identifiers(vendor, vendor_id, valid_from DESC);


-- 2.7 instrument_xref — convenience view
CREATE OR REPLACE VIEW instrument_xref AS
SELECT i.instrument_id, i.asset_class, i.display_symbol,
       s.co_code, s.bse_code, s.nse_symbol, s.isin,
       MAX(CASE WHEN ii.vendor='FYERS_SYMBOL'   AND ii.valid_to IS NULL THEN ii.vendor_id END) AS fyers_symbol,
       MAX(CASE WHEN ii.vendor='FYERS_FY_TOKEN' AND ii.valid_to IS NULL THEN ii.vendor_id END) AS fy_token,
       MAX(CASE WHEN ii.vendor='UPSTOX_TOKEN'   AND ii.valid_to IS NULL THEN ii.vendor_id END) AS upstox_token,
       MAX(CASE WHEN ii.vendor='ANGEL_TOKEN'    AND ii.valid_to IS NULL THEN ii.vendor_id END) AS angel_token,
       MAX(CASE WHEN ii.vendor='AMFI_CODE'      AND ii.valid_to IS NULL THEN ii.vendor_id END) AS amfi_code
FROM instruments i
LEFT JOIN scrips s ON i.scrip_id = s.scrip_id
LEFT JOIN instrument_identifiers ii ON ii.instrument_id = i.instrument_id
GROUP BY i.instrument_id, i.asset_class, i.display_symbol, s.co_code, s.bse_code, s.nse_symbol, s.isin;


-- 2.8 scrip_segments + scrip_segment_change_log
CREATE TABLE IF NOT EXISTS scrip_segments (
    id          BIGSERIAL     PRIMARY KEY,
    scrip_id    INTEGER       NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    segment     VARCHAR(4)    NOT NULL,
    valid_from  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    valid_to    TIMESTAMPTZ,
    source      VARCHAR(20)   NOT NULL,
    source_token VARCHAR(50),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrip_segments_current
    ON scrip_segments(scrip_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_scrip_segments_history
    ON scrip_segments(scrip_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS scrip_segment_change_log (
    id              BIGSERIAL     PRIMARY KEY,
    scrip_id        INTEGER       NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    from_segment    VARCHAR(4),
    to_segment      VARCHAR(4),
    from_token      VARCHAR(50),
    to_token        VARCHAR(50),
    change_date     DATE          NOT NULL,
    reason          VARCHAR(50)   NOT NULL,  -- TOKEN_CHANGE | SEGMENT_CHANGE
    auto_detected   BOOLEAN       NOT NULL DEFAULT TRUE,
    sync_job_id     VARCHAR(80),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scrip_seg_log_scrip ON scrip_segment_change_log(scrip_id, change_date DESC);


-- =====================================================================
-- 3. CORPORATE ACTIONS + ADJUSTMENTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS corporate_actions (
    id                  BIGSERIAL     PRIMARY KEY,
    scrip_id            INTEGER       NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    co_code             INTEGER       NOT NULL REFERENCES companies(co_code),
    action_type         corporate_action_type NOT NULL,
    announcement_date   DATE,
    ex_date             DATE          NOT NULL,
    record_date         DATE,
    payment_date        DATE,
    effective_date      DATE,
    sequence_no         SMALLINT      NOT NULL DEFAULT 1,
    ratio_numerator     INTEGER,
    ratio_denominator   INTEGER,
    amount_per_share    NUMERIC(18,4),
    currency            CHAR(3)       NOT NULL DEFAULT 'INR',
    dividend_type       VARCHAR(20),  -- INTERIM/FINAL/SPECIAL/ONE_TIME
    fiscal_year         SMALLINT,
    old_value           VARCHAR(100), -- NAME/ISIN/FV change
    new_value           VARCHAR(100),
    purpose_text        TEXT,
    source              VARCHAR(20)   NOT NULL,
    source_id           VARCHAR(80),
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    superseded_by_id    BIGINT        REFERENCES corporate_actions(id),
    fetched_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT ca_action_constraints CHECK (
        CASE action_type
            WHEN 'DIVIDEND' THEN amount_per_share IS NOT NULL
            WHEN 'BONUS'    THEN ratio_numerator IS NOT NULL AND ratio_denominator IS NOT NULL
            WHEN 'SPLIT'    THEN ratio_numerator IS NOT NULL AND ratio_denominator IS NOT NULL
            ELSE TRUE
        END
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corporate_actions
    ON corporate_actions(scrip_id, action_type, ex_date, sequence_no, source);
CREATE INDEX IF NOT EXISTS idx_ca_scrip_ex
    ON corporate_actions(scrip_id, ex_date DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ca_ex_date_type
    ON corporate_actions(ex_date DESC, action_type) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ca_co_code_ex
    ON corporate_actions(co_code, ex_date DESC);
CREATE INDEX IF NOT EXISTS idx_ca_announcement
    ON corporate_actions(announcement_date DESC) WHERE announcement_date IS NOT NULL;


-- dividend_payments — view, not table
CREATE OR REPLACE VIEW dividend_payments AS
SELECT id, scrip_id, co_code, ex_date, record_date, payment_date,
       amount_per_share, dividend_type, fiscal_year, currency, purpose_text
FROM corporate_actions
WHERE action_type = 'DIVIDEND' AND is_active = TRUE;


-- corporate_action_adjustments — pre-computed cumulative factors
CREATE TABLE IF NOT EXISTS corporate_action_adjustments (
    scrip_id              INTEGER          NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    effective_date        DATE             NOT NULL,
    corporate_action_id   BIGINT           NOT NULL REFERENCES corporate_actions(id),
    price_factor          NUMERIC(18,12)   NOT NULL,
    volume_factor         NUMERIC(18,12)   NOT NULL,
    adjustment_kind       adjustment_kind  NOT NULL,
    created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scrip_id, effective_date, adjustment_kind)
);
CREATE INDEX IF NOT EXISTS idx_caa_scrip_eff
    ON corporate_action_adjustments(scrip_id, effective_date DESC);


-- index_constituents — SCD-2 quarterly rebalances
CREATE TABLE IF NOT EXISTS index_constituents (
    id          BIGSERIAL    PRIMARY KEY,
    index_id    INTEGER      NOT NULL REFERENCES indices(index_id) ON DELETE RESTRICT,
    scrip_id    INTEGER      NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    weight_pct  NUMERIC(8,5),
    valid_from  DATE         NOT NULL,
    valid_to    DATE,
    source      VARCHAR(20)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_const_history
    ON index_constituents(index_id, scrip_id, valid_from);
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_const_current
    ON index_constituents(index_id, scrip_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_idx_const_scrip
    ON index_constituents(scrip_id) WHERE valid_to IS NULL;


-- =====================================================================
-- 4. NEWS + ANNOUNCEMENTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS news_articles (
    id                  BIGSERIAL     PRIMARY KEY,
    url_hash            BYTEA         NOT NULL UNIQUE, -- SHA-256
    url                 TEXT          NOT NULL,
    source              VARCHAR(40)   NOT NULL,
    source_article_id   VARCHAR(120),
    headline            TEXT          NOT NULL,
    summary             TEXT,
    body                TEXT,
    language            CHAR(2)       NOT NULL DEFAULT 'en',
    category            VARCHAR(40),
    importance          VARCHAR(10)   DEFAULT 'medium',
    published_at        TIMESTAMPTZ   NOT NULL,
    fetched_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_source_id
    ON news_articles(source, source_article_id) WHERE source_article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_published
    ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source_published
    ON news_articles(source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_category
    ON news_articles(category, published_at DESC) WHERE category IS NOT NULL;


CREATE TABLE IF NOT EXISTS news_article_tags (
    article_id     BIGINT        NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    tag_kind       VARCHAR(20)   NOT NULL, -- INSTRUMENT/COMPANY/SECTOR/INDEX
    instrument_id  BIGINT        REFERENCES instruments(instrument_id),
    co_code        INTEGER       REFERENCES companies(co_code),
    index_id       INTEGER       REFERENCES indices(index_id),
    sector         VARCHAR(100),
    relevance      NUMERIC(4,3),
    tagged_by      VARCHAR(20)   NOT NULL DEFAULT 'auto',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT nat_tag_kind_check CHECK (
        (tag_kind = 'INSTRUMENT' AND instrument_id IS NOT NULL AND co_code IS NULL AND index_id IS NULL AND sector IS NULL) OR
        (tag_kind = 'COMPANY'    AND co_code       IS NOT NULL AND instrument_id IS NULL AND index_id IS NULL AND sector IS NULL) OR
        (tag_kind = 'INDEX'      AND index_id      IS NOT NULL AND instrument_id IS NULL AND co_code IS NULL AND sector IS NULL) OR
        (tag_kind = 'SECTOR'     AND sector        IS NOT NULL AND instrument_id IS NULL AND co_code IS NULL AND index_id IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_nat_instrument
    ON news_article_tags(instrument_id, article_id) WHERE instrument_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_co_code
    ON news_article_tags(co_code, article_id) WHERE co_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_index
    ON news_article_tags(index_id, article_id) WHERE index_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_sector
    ON news_article_tags(sector, article_id) WHERE sector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_article
    ON news_article_tags(article_id);


CREATE TABLE IF NOT EXISTS corporate_announcements (
    id                BIGSERIAL     PRIMARY KEY,
    scrip_id          INTEGER       NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    co_code           INTEGER       NOT NULL REFERENCES companies(co_code),
    announcement_type VARCHAR(40)   NOT NULL,
    subject           VARCHAR(500)  NOT NULL,
    body              TEXT,
    attachment_url    TEXT,
    filed_at          TIMESTAMPTZ   NOT NULL,
    effective_date    DATE,
    source            VARCHAR(20)   NOT NULL,
    source_id         VARCHAR(80),
    fetched_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_announcements_source
    ON corporate_announcements(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ann_scrip_filed
    ON corporate_announcements(scrip_id, filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ann_filed
    ON corporate_announcements(filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ann_type_filed
    ON corporate_announcements(announcement_type, filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ann_co_filed
    ON corporate_announcements(co_code, filed_at DESC);


-- =====================================================================
-- 5. TIME-SERIES LAYER
-- =====================================================================

-- 5.1 ltp_snapshot — single-row-per-scrip; replaces 28M-row ltp_live bug
CREATE TABLE IF NOT EXISTS ltp_snapshot (
    scrip_id          INTEGER       PRIMARY KEY REFERENCES scrips(scrip_id) ON DELETE CASCADE,
    ltp               NUMERIC(14,4) NOT NULL,
    prev_close        NUMERIC(14,4),
    open              NUMERIC(14,4),
    high              NUMERIC(14,4),
    low               NUMERIC(14,4),
    close             NUMERIC(14,4),
    percent_change    NUMERIC(8,4),
    volume_traded     BIGINT,
    total_buy_qty     BIGINT,
    total_sell_qty    BIGINT,
    lower_circuit     NUMERIC(14,4),
    upper_circuit     NUMERIC(14,4),
    week_52_high      NUMERIC(14,4),
    week_52_low       NUMERIC(14,4),
    last_trade_ts     TIMESTAMPTZ   NOT NULL,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ltp_snap_change
    ON ltp_snapshot(percent_change DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ltp_snap_volume
    ON ltp_snapshot(volume_traded DESC NULLS LAST);


-- 5.2 bhavcopy_eod — TimescaleDB hypertable, NSE+BSE unified
CREATE TABLE IF NOT EXISTS bhavcopy_eod (
    scrip_id          INTEGER       NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    exchange          VARCHAR(8)    NOT NULL,
    trade_date        DATE          NOT NULL,
    prev_close        NUMERIC(14,4),
    open              NUMERIC(14,4),
    high              NUMERIC(14,4),
    low               NUMERIC(14,4),
    close             NUMERIC(14,4),
    last              NUMERIC(14,4),
    vwap              NUMERIC(14,4),
    volume_traded     BIGINT,
    turnover          NUMERIC(18,2),
    total_trades      INTEGER,
    delivery_qty      BIGINT,
    delivery_pct      NUMERIC(7,4),
    week_52_high      NUMERIC(14,4),
    week_52_low       NUMERIC(14,4),
    loaded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scrip_id, exchange, trade_date)
);
SELECT create_hypertable('bhavcopy_eod', 'trade_date',
    chunk_time_interval => INTERVAL '90 days',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_bhavcopy_date_exchange
    ON bhavcopy_eod(trade_date DESC, exchange);
ALTER TABLE bhavcopy_eod SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'scrip_id',
    timescaledb.compress_orderby   = 'trade_date DESC'
);
SELECT add_compression_policy('bhavcopy_eod', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('bhavcopy_eod', INTERVAL '10 years', if_not_exists => TRUE);


-- 5.3 fno_contracts (master) + fno_eod (hypertable)
CREATE TABLE IF NOT EXISTS fno_contracts (
    id                       INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    instrument_token         VARCHAR(20)   NOT NULL,
    underlying_scrip_id      INTEGER       REFERENCES scrips(scrip_id),
    underlying_index_id      INTEGER       REFERENCES indices(index_id),
    exchange                 VARCHAR(8)    NOT NULL,
    instrument_type          VARCHAR(8)    NOT NULL, -- CE/PE/FUT
    expiry_date              DATE          NOT NULL,
    strike                   NUMERIC(14,2),
    lot_size                 INTEGER       NOT NULL,
    tick_size                NUMERIC(8,4)  NOT NULL,
    is_active                BOOLEAN       NOT NULL DEFAULT TRUE,
    listed_on                DATE          NOT NULL,
    last_trading_day         DATE,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT fno_underlying_one CHECK (
        (underlying_scrip_id IS NOT NULL AND underlying_index_id IS NULL) OR
        (underlying_scrip_id IS NULL AND underlying_index_id IS NOT NULL)
    ),
    CONSTRAINT fno_strike_when_option CHECK (
        (instrument_type IN ('CE','PE') AND strike IS NOT NULL) OR
        (instrument_type = 'FUT'         AND strike IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fno_token
    ON fno_contracts(exchange, instrument_token);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fno_natural
    ON fno_contracts(exchange, COALESCE(underlying_scrip_id, 0), COALESCE(underlying_index_id, 0),
                     expiry_date, COALESCE(strike, -1), instrument_type);
CREATE INDEX IF NOT EXISTS idx_fno_underlying_scrip
    ON fno_contracts(underlying_scrip_id, expiry_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fno_underlying_index
    ON fno_contracts(underlying_index_id, expiry_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fno_expiry_active
    ON fno_contracts(expiry_date) WHERE is_active = TRUE;


CREATE TABLE IF NOT EXISTS fno_eod (
    contract_id        INTEGER        NOT NULL REFERENCES fno_contracts(id) ON DELETE RESTRICT,
    trade_date         DATE           NOT NULL,
    open               NUMERIC(14,4),
    high               NUMERIC(14,4),
    low                NUMERIC(14,4),
    close              NUMERIC(14,4),
    prev_close         NUMERIC(14,4),
    settle             NUMERIC(14,4),
    volume             BIGINT,
    turnover           NUMERIC(18,2),
    open_interest      BIGINT,
    change_in_oi       BIGINT,
    iv                 NUMERIC(8,4),
    loaded_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contract_id, trade_date)
);
SELECT create_hypertable('fno_eod', 'trade_date',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_fno_eod_date
    ON fno_eod(trade_date, contract_id);
ALTER TABLE fno_eod SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'contract_id',
    timescaledb.compress_orderby   = 'trade_date DESC'
);
SELECT add_compression_policy('fno_eod', INTERVAL '14 days', if_not_exists => TRUE);
SELECT add_retention_policy('fno_eod', INTERVAL '5 years', if_not_exists => TRUE);


-- 5.4 oi_snapshot_5min — historical OI for backtest screens
CREATE TABLE IF NOT EXISTS oi_snapshot_5min (
    contract_id        INTEGER       NOT NULL REFERENCES fno_contracts(id) ON DELETE RESTRICT,
    snapshot_ts        TIMESTAMPTZ   NOT NULL,
    open_interest      BIGINT        NOT NULL,
    change_in_oi       BIGINT,
    last_price         NUMERIC(14,4),
    PRIMARY KEY (contract_id, snapshot_ts)
);
SELECT create_hypertable('oi_snapshot_5min', 'snapshot_ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE);
ALTER TABLE oi_snapshot_5min SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'contract_id',
    timescaledb.compress_orderby   = 'snapshot_ts DESC'
);
SELECT add_compression_policy('oi_snapshot_5min', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('oi_snapshot_5min', INTERVAL '2 years', if_not_exists => TRUE);


-- 5.5 index_eod (flat, ~91K rows/year)
CREATE TABLE IF NOT EXISTS index_eod (
    index_id      INTEGER       NOT NULL REFERENCES indices(index_id) ON DELETE RESTRICT,
    trade_date    DATE          NOT NULL,
    open          NUMERIC(14,4),
    high          NUMERIC(14,4),
    low           NUMERIC(14,4),
    close         NUMERIC(14,4),
    prev_close    NUMERIC(14,4),
    loaded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (index_id, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_index_eod_date ON index_eod(trade_date);


-- 5.6 index_ohlc_1min — hypertable
CREATE TABLE IF NOT EXISTS index_ohlc_1min (
    index_id      INTEGER       NOT NULL REFERENCES indices(index_id) ON DELETE RESTRICT,
    ts            TIMESTAMPTZ   NOT NULL,
    open          NUMERIC(14,4),
    high          NUMERIC(14,4),
    low           NUMERIC(14,4),
    close         NUMERIC(14,4),
    PRIMARY KEY (index_id, ts)
);
SELECT create_hypertable('index_ohlc_1min', 'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE);
ALTER TABLE index_ohlc_1min SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'index_id',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('index_ohlc_1min', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('index_ohlc_1min', INTERVAL '2 years', if_not_exists => TRUE);


-- 5.7 mf_nav — yearly chunks
CREATE TABLE IF NOT EXISTS mf_nav (
    scheme_code     INTEGER        NOT NULL,
    nav_date        DATE           NOT NULL,
    nav             NUMERIC(14,4)  NOT NULL,
    repurchase_nav  NUMERIC(14,4),
    sale_nav        NUMERIC(14,4),
    loaded_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scheme_code, nav_date)
);
SELECT create_hypertable('mf_nav', 'nav_date',
    chunk_time_interval => INTERVAL '1 year',
    if_not_exists => TRUE);
ALTER TABLE mf_nav SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'scheme_code',
    timescaledb.compress_orderby   = 'nav_date DESC'
);
SELECT add_compression_policy('mf_nav', INTERVAL '1 year', if_not_exists => TRUE);


-- 5.8 sector_eod_aggregates — nightly Celery refresh
CREATE TABLE IF NOT EXISTS sector_eod_aggregates (
    sector                       VARCHAR(80)   NOT NULL,
    trade_date                   DATE          NOT NULL,
    avg_return_pct               NUMERIC(8,4),
    median_return_pct            NUMERIC(8,4),
    top_quartile_return_pct      NUMERIC(8,4),
    bottom_quartile_return_pct   NUMERIC(8,4),
    mcap_weighted_return_pct     NUMERIC(8,4),
    breadth_advance              INTEGER,
    breadth_decline              INTEGER,
    total_scrips                 INTEGER,
    computed_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sector, trade_date)
);


-- =====================================================================
-- 6. FUNDAMENTALS LAYER
-- =====================================================================

-- 6.1 line_item_dictionary — data, not code; loose FK
CREATE TABLE IF NOT EXISTS line_item_dictionary (
    code                  VARCHAR(64)    PRIMARY KEY,
    statement_type        statement_type NOT NULL,
    display_name          VARCHAR(120)   NOT NULL,
    indian_synonym        VARCHAR(120),
    us_gaap_synonym       VARCHAR(120),
    parent_code           VARCHAR(64)    REFERENCES line_item_dictionary(code),
    sort_order            SMALLINT       NOT NULL,
    is_subtotal           BOOLEAN        NOT NULL DEFAULT FALSE,
    is_calculated         BOOLEAN        NOT NULL DEFAULT FALSE,
    formula               TEXT,
    applies_to_sectors    TEXT[],
    data_type             VARCHAR(20)    NOT NULL DEFAULT 'AMOUNT',
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS cmots_line_item_mapping (
    cmots_field_name      VARCHAR(120)   NOT NULL,
    cmots_feed            VARCHAR(40)    NOT NULL,
    internal_code         VARCHAR(64)    NOT NULL REFERENCES line_item_dictionary(code),
    valid_from            DATE           NOT NULL,
    valid_to              DATE,
    PRIMARY KEY (cmots_field_name, cmots_feed, valid_from)
);


-- 6.2 financial_statements — long format
CREATE TABLE IF NOT EXISTS financial_statements (
    co_code             INTEGER         NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    statement_type      statement_type  NOT NULL,
    period_type         period_type     NOT NULL,
    period_end          DATE            NOT NULL,
    fiscal_year         SMALLINT        NOT NULL,
    reporting_basis     reporting_basis NOT NULL,
    line_item_code      VARCHAR(64)     NOT NULL, -- loose FK to line_item_dictionary
    amount              NUMERIC(20,4),
    amount_currency     CHAR(3)         NOT NULL DEFAULT 'INR',
    amount_unit         amount_unit     NOT NULL DEFAULT 'CR',
    restated_flag       BOOLEAN         NOT NULL DEFAULT FALSE,
    source              VARCHAR(20)     NOT NULL DEFAULT 'CMOTS',
    source_payload_id   BIGINT,
    ingested_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, statement_type, period_type, period_end, line_item_code, reporting_basis)
);
CREATE INDEX IF NOT EXISTS idx_fs_lineitem_period
    ON financial_statements(line_item_code, period_end DESC, co_code);
CREATE INDEX IF NOT EXISTS idx_fs_period_consolidated
    ON financial_statements(period_end DESC, statement_type)
    WHERE reporting_basis = 'CONSOLIDATED';


-- 6.3 financial_summary_latest — pivot MV
CREATE MATERIALIZED VIEW IF NOT EXISTS financial_summary_latest AS
SELECT
    co_code, period_type, period_end, reporting_basis,
    MAX(amount) FILTER (WHERE line_item_code = 'REVENUE')          AS revenue,
    MAX(amount) FILTER (WHERE line_item_code = 'OPERATING_REVENUE') AS operating_revenue,
    MAX(amount) FILTER (WHERE line_item_code = 'OTHER_INCOME')     AS other_income,
    MAX(amount) FILTER (WHERE line_item_code = 'TOTAL_EXPENSES')   AS total_expenses,
    MAX(amount) FILTER (WHERE line_item_code = 'OPERATING_PROFIT') AS operating_profit,
    MAX(amount) FILTER (WHERE line_item_code = 'EBITDA')           AS ebitda,
    MAX(amount) FILTER (WHERE line_item_code = 'EBIT')             AS ebit,
    MAX(amount) FILTER (WHERE line_item_code = 'DEPRECIATION')     AS depreciation,
    MAX(amount) FILTER (WHERE line_item_code = 'INTEREST_EXPENSE') AS interest_expense,
    MAX(amount) FILTER (WHERE line_item_code = 'PROFIT_BEFORE_TAX') AS profit_before_tax,
    MAX(amount) FILTER (WHERE line_item_code = 'TAX_EXPENSE')      AS tax_expense,
    MAX(amount) FILTER (WHERE line_item_code = 'NET_PROFIT')       AS net_profit,
    MAX(amount) FILTER (WHERE line_item_code = 'EPS_BASIC')        AS eps_basic,
    MAX(amount) FILTER (WHERE line_item_code = 'EPS_DILUTED')      AS eps_diluted,
    MAX(amount) FILTER (WHERE line_item_code = 'TOTAL_ASSETS')     AS total_assets,
    MAX(amount) FILTER (WHERE line_item_code = 'TOTAL_EQUITY')     AS total_equity,
    MAX(amount) FILTER (WHERE line_item_code = 'TOTAL_BORROWINGS') AS total_borrowings,
    MAX(amount) FILTER (WHERE line_item_code = 'CURRENT_ASSETS')   AS current_assets,
    MAX(amount) FILTER (WHERE line_item_code = 'CURRENT_LIABILITIES') AS current_liabilities,
    MAX(amount) FILTER (WHERE line_item_code = 'CFO')              AS cfo,
    MAX(amount) FILTER (WHERE line_item_code = 'CFI')              AS cfi,
    MAX(amount) FILTER (WHERE line_item_code = 'CFF')              AS cff,
    MAX(amount) FILTER (WHERE line_item_code = 'CAPEX')            AS capex,
    MAX(amount) FILTER (WHERE line_item_code = 'FREE_CASH_FLOW')   AS free_cash_flow,
    COUNT(*) AS n_line_items_present
FROM financial_statements
WHERE period_type IN ('Q1','Q2','Q3','Q4','ANNUAL','TTM')
GROUP BY co_code, period_type, period_end, reporting_basis
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fsl ON financial_summary_latest
    (co_code, period_type, period_end, reporting_basis);
CREATE INDEX IF NOT EXISTS idx_fsl_annual ON financial_summary_latest
    (period_end DESC, reporting_basis) WHERE period_type = 'ANNUAL';
CREATE INDEX IF NOT EXISTS idx_fsl_quarterly ON financial_summary_latest
    (period_end DESC, reporting_basis) WHERE period_type IN ('Q1','Q2','Q3','Q4');


-- 6.4 key_ratios — long format
CREATE TABLE IF NOT EXISTS key_ratios (
    co_code           INTEGER         NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    period_type       period_type     NOT NULL,
    period_end        DATE            NOT NULL,
    reporting_basis   reporting_basis NOT NULL,
    ratio_code        VARCHAR(48)     NOT NULL,
    ratio_value       NUMERIC(18,6),
    source            ratio_source    NOT NULL DEFAULT 'CMOTS',
    calc_inputs       JSONB,
    ingested_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, period_type, period_end, ratio_code, reporting_basis, source)
);
CREATE INDEX IF NOT EXISTS idx_kr_ratio_period
    ON key_ratios(ratio_code, period_end DESC, ratio_value);


CREATE MATERIALIZED VIEW IF NOT EXISTS key_ratios_latest_wide AS
SELECT
    co_code, period_type, period_end, reporting_basis, source,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PE')             AS pe,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PB')             AS pb,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PS')             AS ps,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PEG')            AS peg,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'EV_EBITDA')      AS ev_ebitda,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'EV_SALES')       AS ev_sales,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'ROE')            AS roe,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'ROCE')           AS roce,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'ROA')            AS roa,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'NPM')            AS npm,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'OPM')            AS opm,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'EBITDA_MARGIN')  AS ebitda_margin,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'D_TO_E')         AS debt_to_equity,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'CURRENT_RATIO')  AS current_ratio,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'QUICK_RATIO')    AS quick_ratio,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'INTEREST_COVERAGE') AS interest_coverage,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'ASSET_TURNOVER') AS asset_turnover,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'INVENTORY_TURNOVER') AS inventory_turnover,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'RECEIVABLE_DAYS') AS receivable_days,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PAYABLE_DAYS')   AS payable_days,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'DIVIDEND_YIELD') AS dividend_yield,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PAYOUT_RATIO')   AS payout_ratio,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'REVENUE_GROWTH_3Y') AS revenue_growth_3y,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'PROFIT_GROWTH_3Y')  AS profit_growth_3y,
    MAX(ratio_value) FILTER (WHERE ratio_code = 'EPS_GROWTH_3Y')     AS eps_growth_3y
FROM key_ratios
GROUP BY co_code, period_type, period_end, reporting_basis, source
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS uq_krlw ON key_ratios_latest_wide
    (co_code, period_type, period_end, reporting_basis, source);
CREATE INDEX IF NOT EXISTS idx_krlw_pe ON key_ratios_latest_wide(pe) WHERE pe IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_krlw_pb ON key_ratios_latest_wide(pb) WHERE pb IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_krlw_roe ON key_ratios_latest_wide(roe) WHERE roe IS NOT NULL;


-- 6.5 shareholding_pattern + shareholding_individual
CREATE TABLE IF NOT EXISTS shareholding_pattern (
    co_code           INTEGER          NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    period_end        DATE             NOT NULL,
    holder_category   holder_category  NOT NULL,
    holding_pct       NUMERIC(7,4)     NOT NULL,
    holding_qty       BIGINT,
    pledged_qty       BIGINT,
    pledged_pct       NUMERIC(7,4),
    encumbered_pct    NUMERIC(7,4),
    source            VARCHAR(20)      NOT NULL DEFAULT 'CMOTS',
    ingested_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, period_end, holder_category)
);
CREATE INDEX IF NOT EXISTS idx_shp_period_category
    ON shareholding_pattern(period_end DESC, holder_category);
CREATE INDEX IF NOT EXISTS idx_shp_promoter_pledged
    ON shareholding_pattern(co_code, period_end DESC)
    WHERE holder_category = 'PROMOTER' AND pledged_pct > 0;


CREATE TABLE IF NOT EXISTS shareholding_individual (
    co_code                  INTEGER       NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    period_end               DATE          NOT NULL,
    holder_type              holder_type   NOT NULL,
    holder_name              VARCHAR(300)  NOT NULL,
    holder_name_normalized   VARCHAR(300)  NOT NULL,
    holding_pct              NUMERIC(7,4)  NOT NULL,
    holding_qty              BIGINT,
    rank_in_category         SMALLINT,
    source                   VARCHAR(20)   NOT NULL DEFAULT 'CMOTS',
    ingested_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, period_end, holder_type, holder_name_normalized)
);
CREATE INDEX IF NOT EXISTS idx_shi_holder
    ON shareholding_individual(holder_name_normalized, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_shi_top10
    ON shareholding_individual(holder_type, period_end DESC, holding_pct DESC)
    WHERE rank_in_category <= 10;


CREATE OR REPLACE VIEW shareholding_changes_qoq AS
SELECT curr.co_code, curr.period_end, curr.holder_category,
       curr.holding_pct AS pct_now,
       prev.holding_pct AS pct_prev,
       (curr.holding_pct - prev.holding_pct) AS delta_pct,
       (curr.holding_qty - prev.holding_qty) AS delta_qty
FROM shareholding_pattern curr
LEFT JOIN LATERAL (
    SELECT holding_pct, holding_qty
    FROM shareholding_pattern p2
    WHERE p2.co_code = curr.co_code
      AND p2.holder_category = curr.holder_category
      AND p2.period_end < curr.period_end
    ORDER BY p2.period_end DESC LIMIT 1
) prev ON TRUE;


-- 6.6 brokers (master) + analyst_recommendations
CREATE TABLE IF NOT EXISTS brokers (
    id            INTEGER       PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    broker_name   VARCHAR(200)  NOT NULL UNIQUE,
    short_name    VARCHAR(50),
    country       CHAR(2)       NOT NULL DEFAULT 'IN',
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS analyst_recommendations (
    co_code               INTEGER         NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    broker_id             INTEGER         NOT NULL REFERENCES brokers(id),
    recommendation_date   DATE            NOT NULL,
    analyst_name          VARCHAR(200)    NOT NULL DEFAULT '',
    rating                rating_level    NOT NULL,
    target_price          NUMERIC(14,4),
    target_price_currency CHAR(3)         NOT NULL DEFAULT 'INR',
    time_horizon_months   SMALLINT,
    report_url            TEXT,
    report_title          VARCHAR(500),
    notes                 TEXT,
    source                analyst_source  NOT NULL,
    ingested_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, broker_id, recommendation_date, analyst_name)
);
CREATE INDEX IF NOT EXISTS idx_ar_broker
    ON analyst_recommendations(broker_id, recommendation_date DESC);
CREATE INDEX IF NOT EXISTS idx_ar_buy_recent
    ON analyst_recommendations(recommendation_date DESC)
    WHERE rating IN ('STRONG_BUY','BUY');


CREATE MATERIALIZED VIEW IF NOT EXISTS analyst_consensus_latest AS
SELECT
    co_code,
    COUNT(DISTINCT broker_id)                        AS n_analysts,
    COUNT(*) FILTER (WHERE rating IN ('STRONG_BUY','BUY')) AS n_buy,
    COUNT(*) FILTER (WHERE rating = 'HOLD')              AS n_hold,
    COUNT(*) FILTER (WHERE rating IN ('SELL','STRONG_SELL','REDUCE')) AS n_sell,
    AVG(CASE rating
            WHEN 'STRONG_BUY' THEN 1
            WHEN 'BUY' THEN 2
            WHEN 'HOLD' THEN 3
            WHEN 'REDUCE' THEN 4
            WHEN 'SELL' THEN 5
            WHEN 'STRONG_SELL' THEN 6
        END) AS avg_rating_numeric,
    AVG(target_price)    AS target_price_mean,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY target_price) AS target_price_median,
    STDDEV_SAMP(target_price) AS target_price_std,
    MAX(target_price)    AS target_price_high,
    MIN(target_price)    AS target_price_low,
    MAX(recommendation_date) AS last_revision_at,
    NOW()                AS computed_at
FROM analyst_recommendations
WHERE recommendation_date >= NOW() - INTERVAL '6 months'
GROUP BY co_code
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS uq_acl ON analyst_consensus_latest(co_code);


-- 6.7 earnings_estimates + eps_revisions
CREATE TABLE IF NOT EXISTS earnings_estimates (
    co_code         INTEGER         NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    period_end      DATE            NOT NULL,
    period_type     period_type     NOT NULL,
    estimate_type   estimate_type   NOT NULL,
    n_analysts      SMALLINT        NOT NULL,
    estimate_mean   NUMERIC(18,6),
    estimate_median NUMERIC(18,6),
    estimate_high   NUMERIC(18,6),
    estimate_low    NUMERIC(18,6),
    estimate_std    NUMERIC(18,6),
    asof_date       DATE            NOT NULL,
    source          VARCHAR(20)     NOT NULL DEFAULT 'CMOTS',
    ingested_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, period_end, period_type, estimate_type, asof_date)
);
CREATE INDEX IF NOT EXISTS idx_ee_period_type_asof
    ON earnings_estimates(period_end, estimate_type, asof_date DESC);


CREATE TABLE IF NOT EXISTS eps_revisions (
    co_code              INTEGER         NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    asof_date            DATE            NOT NULL,
    period_end           DATE            NOT NULL,
    period_type          period_type     NOT NULL,
    n_up_30d             SMALLINT,
    n_down_30d           SMALLINT,
    n_up_90d             SMALLINT,
    n_down_90d           SMALLINT,
    mean_change_30d_pct  NUMERIC(8,4),
    mean_change_90d_pct  NUMERIC(8,4),
    PRIMARY KEY (co_code, asof_date, period_end, period_type)
);


-- 6.8 quarterly_announcements + announcement_performance
CREATE TABLE IF NOT EXISTS quarterly_announcements (
    announcement_id    BIGINT         PRIMARY KEY REFERENCES corporate_announcements(id) ON DELETE CASCADE,
    co_code            INTEGER        NOT NULL REFERENCES companies(co_code),
    period_end         DATE           NOT NULL,
    period_type        period_type    NOT NULL,
    announced_at       TIMESTAMPTZ    NOT NULL,
    result_type        reporting_basis NOT NULL,
    revenue_actual     NUMERIC(18,4),
    net_profit_actual  NUMERIC(18,4),
    eps_actual         NUMERIC(12,4),
    eps_estimate       NUMERIC(12,4),
    surprise_pct       NUMERIC(8,4),
    yoy_revenue_pct    NUMERIC(8,4),
    yoy_profit_pct     NUMERIC(8,4),
    sentiment_score    NUMERIC(5,4),
    press_release_url  TEXT,
    processed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qa_co_period
    ON quarterly_announcements(co_code, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_qa_announced
    ON quarterly_announcements(announced_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_beats
    ON quarterly_announcements(announced_at DESC) WHERE surprise_pct > 0.10;


CREATE TABLE IF NOT EXISTS announcement_performance (
    announcement_id        BIGINT         PRIMARY KEY REFERENCES corporate_announcements(id) ON DELETE CASCADE,
    co_code                INTEGER        NOT NULL REFERENCES companies(co_code),
    ret_t_plus_1           NUMERIC(8,4),
    ret_t_plus_5           NUMERIC(8,4),
    ret_t_plus_30          NUMERIC(8,4),
    nifty_ret_t_plus_1     NUMERIC(8,4),
    nifty_ret_t_plus_5     NUMERIC(8,4),
    nifty_ret_t_plus_30    NUMERIC(8,4),
    alpha_t_plus_1         NUMERIC(8,4) GENERATED ALWAYS AS (ret_t_plus_1 - nifty_ret_t_plus_1) STORED,
    alpha_t_plus_5         NUMERIC(8,4) GENERATED ALWAYS AS (ret_t_plus_5 - nifty_ret_t_plus_5) STORED,
    alpha_t_plus_30        NUMERIC(8,4) GENERATED ALWAYS AS (ret_t_plus_30 - nifty_ret_t_plus_30) STORED,
    volume_ratio_t_plus_1  NUMERIC(8,4),
    computed_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ap_movers ON announcement_performance(co_code, ret_t_plus_5 DESC);


-- 6.9 stock_scorecard — nightly precompute
CREATE TABLE IF NOT EXISTS stock_scorecard (
    co_code                  INTEGER       NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    scorecard_date           DATE          NOT NULL,
    performance_score        NUMERIC(5,2),  performance_label        VARCHAR(40),
    valuation_score          NUMERIC(5,2),  valuation_label          VARCHAR(40),
    growth_score             NUMERIC(5,2),  growth_label             VARCHAR(40),
    profitability_score      NUMERIC(5,2),  profitability_label      VARCHAR(40),
    entry_point_score        NUMERIC(5,2),  entry_point_label        VARCHAR(40),
    red_flags_score          NUMERIC(5,2),  red_flags_label          VARCHAR(40),
    buyback_sentiment_score  NUMERIC(5,2),  buyback_sentiment_label  VARCHAR(40),
    overall_score            NUMERIC(5,2),
    metrics_json             JSONB         NOT NULL,
    sector_medians_json      JSONB,
    inputs_hash              CHAR(64),
    computed_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, scorecard_date)
);
CREATE INDEX IF NOT EXISTS idx_scorecard_top
    ON stock_scorecard(scorecard_date DESC, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_scorecard_today
    ON stock_scorecard(scorecard_date DESC, overall_score DESC)
    WHERE scorecard_date >= CURRENT_DATE - 1;


-- 6.10 reverse_dcf_estimates
CREATE TABLE IF NOT EXISTS reverse_dcf_estimates (
    co_code              INTEGER       NOT NULL REFERENCES companies(co_code) ON DELETE RESTRICT,
    valuation_date       DATE          NOT NULL,
    wacc                 NUMERIC(7,4)  NOT NULL DEFAULT 0.10,
    terminal_growth      NUMERIC(7,4)  NOT NULL DEFAULT 0.03,
    forecast_years       SMALLINT      NOT NULL DEFAULT 5,
    current_price        NUMERIC(14,4) NOT NULL,
    implied_growth_rate  NUMERIC(8,4),
    intrinsic_value      NUMERIC(14,4),
    data_quality         VARCHAR(20),
    expectations_label   VARCHAR(20),
    inputs_json          JSONB,
    computed_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (co_code, valuation_date, wacc, terminal_growth, forecast_years)
);
CREATE INDEX IF NOT EXISTS idx_rdcf_aggressive
    ON reverse_dcf_estimates(valuation_date DESC, expectations_label)
    WHERE expectations_label = 'aggressive';


-- 6.11 bulk_deals + block_deals + delivery_data
CREATE TABLE IF NOT EXISTS bulk_deals (
    id                       BIGSERIAL     PRIMARY KEY,
    deal_date                DATE          NOT NULL,
    exchange                 exchange_kind NOT NULL,
    co_code                  INTEGER       REFERENCES companies(co_code),
    ticker_id                INTEGER,      -- legacy bridge during transition
    scrip_id                 INTEGER       REFERENCES scrips(scrip_id),
    scrip_symbol             VARCHAR(40)   NOT NULL,
    client_name              VARCHAR(300)  NOT NULL,
    client_name_normalized   VARCHAR(300)  NOT NULL,
    deal_type                deal_type     NOT NULL,
    quantity                 BIGINT        NOT NULL,
    avg_price                NUMERIC(14,4) NOT NULL,
    deal_value_cr            NUMERIC(18,4) GENERATED ALWAYS AS (quantity * avg_price / 1e7) STORED,
    remarks                  TEXT,
    source                   VARCHAR(20)   NOT NULL,
    ingested_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (deal_date, exchange, scrip_symbol, client_name, deal_type, quantity, avg_price)
);
CREATE INDEX IF NOT EXISTS idx_bd_co_date
    ON bulk_deals(co_code, deal_date DESC) WHERE co_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bd_date_exchange
    ON bulk_deals(deal_date DESC, exchange);
CREATE INDEX IF NOT EXISTS idx_bd_client
    ON bulk_deals(client_name_normalized, deal_date DESC);
CREATE INDEX IF NOT EXISTS idx_bd_value
    ON bulk_deals(deal_value_cr DESC) WHERE deal_value_cr > 50;


CREATE TABLE IF NOT EXISTS block_deals (
    id                       BIGSERIAL     PRIMARY KEY,
    deal_date                DATE          NOT NULL,
    exchange                 exchange_kind NOT NULL,
    co_code                  INTEGER       REFERENCES companies(co_code),
    ticker_id                INTEGER,
    scrip_id                 INTEGER       REFERENCES scrips(scrip_id),
    scrip_symbol             VARCHAR(40)   NOT NULL,
    client_name              VARCHAR(300)  NOT NULL,
    client_name_normalized   VARCHAR(300)  NOT NULL,
    deal_type                deal_type     NOT NULL,
    quantity                 BIGINT        NOT NULL,
    avg_price                NUMERIC(14,4) NOT NULL,
    deal_value_cr            NUMERIC(18,4) GENERATED ALWAYS AS (quantity * avg_price / 1e7) STORED,
    remarks                  TEXT,
    source                   VARCHAR(20)   NOT NULL,
    ingested_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (deal_date, exchange, scrip_symbol, client_name, deal_type, quantity, avg_price)
);
CREATE INDEX IF NOT EXISTS idx_bk_co_date
    ON block_deals(co_code, deal_date DESC) WHERE co_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bk_date_exchange
    ON block_deals(deal_date DESC, exchange);


CREATE TABLE IF NOT EXISTS delivery_data (
    co_code        INTEGER        NOT NULL REFERENCES companies(co_code),
    scrip_id       INTEGER        NOT NULL REFERENCES scrips(scrip_id) ON DELETE RESTRICT,
    exchange       exchange_kind  NOT NULL,
    trade_date     DATE           NOT NULL,
    traded_qty     BIGINT         NOT NULL,
    delivery_qty   BIGINT         NOT NULL,
    delivery_pct   NUMERIC(7,4)   NOT NULL,
    turnover_cr    NUMERIC(18,4),
    source         VARCHAR(20)    NOT NULL DEFAULT 'NSE_MTO',
    ingested_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scrip_id, exchange, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_dd_high_delivery
    ON delivery_data(trade_date DESC, delivery_pct DESC) WHERE delivery_pct > 80;


-- 6.12 pcr_data + vix_signals + vix_regime_thresholds + fii_dii_flows
CREATE TABLE IF NOT EXISTS pcr_data (
    trade_date         DATE          NOT NULL,
    symbol             VARCHAR(20)   NOT NULL,
    expiry_date        DATE,
    pcr_oi             NUMERIC(10,4) NOT NULL,
    pcr_volume         NUMERIC(10,4) NOT NULL,
    total_call_oi      BIGINT,
    total_put_oi       BIGINT,
    total_call_volume  BIGINT,
    total_put_volume   BIGINT,
    source             VARCHAR(20)   NOT NULL DEFAULT 'NSE_FNO',
    ingested_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, symbol, COALESCE(expiry_date, DATE '9999-12-31'))
);
CREATE INDEX IF NOT EXISTS idx_pcr_aggregate
    ON pcr_data(trade_date DESC, symbol) WHERE expiry_date IS NULL;


CREATE TABLE IF NOT EXISTS vix_regime_thresholds (
    regime           vix_regime    PRIMARY KEY,
    lower_inclusive  NUMERIC(8,4)  NOT NULL,
    upper_exclusive  NUMERIC(8,4)  NOT NULL,
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vix_signals (
    trade_date     DATE          PRIMARY KEY,
    vix_open       NUMERIC(8,4),
    vix_high       NUMERIC(8,4),
    vix_low        NUMERIC(8,4),
    vix_close      NUMERIC(8,4)  NOT NULL,
    vix_change_pct NUMERIC(8,4),
    regime         vix_regime    NOT NULL,
    percentile_1y  NUMERIC(5,2),
    computed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vix_regime ON vix_signals(regime, trade_date DESC);


CREATE TABLE IF NOT EXISTS fii_dii_flows (
    trade_date     DATE             NOT NULL,
    segment        flow_segment     NOT NULL,
    participant    flow_participant NOT NULL,
    buy_value_cr   NUMERIC(14,4)    NOT NULL,
    sell_value_cr  NUMERIC(14,4)    NOT NULL,
    net_value_cr   NUMERIC(14,4)    GENERATED ALWAYS AS (buy_value_cr - sell_value_cr) STORED,
    buy_qty        BIGINT,
    sell_qty       BIGINT,
    source         VARCHAR(20)      NOT NULL DEFAULT 'NSE_FNO_PARTICIPANT',
    ingested_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trade_date, segment, participant)
);
CREATE INDEX IF NOT EXISTS idx_ffd_fii
    ON fii_dii_flows(trade_date DESC, segment) WHERE participant = 'FII';
CREATE INDEX IF NOT EXISTS idx_ffd_cash
    ON fii_dii_flows(trade_date DESC, participant) WHERE segment = 'CASH';

COMMIT;

-- =====================================================================
-- END
-- =====================================================================
-- Phase 2 (continuous aggregates ohlc_5min, ohlc_15min) and Phase 3+
-- migration steps are intentionally deferred to numbered Alembic-style
-- migration files under EdgeFlow/migrations/030_*.sql onward, per the
-- migration plan.
-- =====================================================================
