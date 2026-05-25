# Current DB schema — equityprodata @ 164.52.192.245

_Generated: 2026-05-13 21:41 IST_  
PostgreSQL: PostgreSQL 16.13  
TimescaleDB: 2.24.0  
DB size: 1606 MB  
Public tables: 56  
Hypertables: 2  
Continuous aggregates: 3

## TimescaleDB objects

| Object | Type | Chunks | Compression |
|---|---|---:|---|
| ohlc_1min_intraday | hypertable | 2 | off |
| ohlc_1hour | hypertable | 62 | on |
| ohlc_daily | continuous aggregate | — | on |
| ohlc_monthly | continuous aggregate | — | off |
| ohlc_weekly | continuous aggregate | — | off |

## All tables (alphabetical, with sizes + row estimates)

| Table | Total size | Rows (est) |
|---|---:|---:|
| admin_audit_log | 80 kB | 0 |
| admin_notification_preferences | 24 kB | 0 |
| alembic_version | 24 kB | 0 |
| analytics_daily_summary | 40 kB | 0 |
| api_keys | 48 kB | 0 |
| api_usage_log | 40 kB | 0 |
| auth_logs | 288 kB | 22 |
| broker_connections | 112 kB | 0 |
| click_events | 80 kB | 5 |
| coin_balances | 56 kB | 0 |
| coin_packs | 40 kB | 0 |
| coin_pricing | 24 kB | 0 |
| coin_transactions | 328 kB | 14 |
| email_templates | 48 kB | 0 |
| feature_costs | 32 kB | 0 |
| feature_flag_audit | 32 kB | 0 |
| feature_flag_overrides | 48 kB | 0 |
| feature_flags | 96 kB | 0 |
| feature_usage | 80 kB | 0 |
| forum_messages | 16 kB | 0 |
| ltp_live | 98 MB | 413,348 |
| market_movers_live | 432 kB | 80 |
| migration_history | 48 kB | 0 |
| notification_dismissals | 24 kB | 0 |
| notification_event_types | 64 kB | 0 |
| notification_history | 40 kB | 0 |
| notification_queue | 40 kB | 0 |
| notification_settings | 48 kB | 0 |
| oauth_accounts | 48 kB | 0 |
| ohlc_1hour | 24 kB | 0 |
| ohlc_1min_intraday | 40 kB | 0 |
| otp_codes | 24 kB | 0 |
| page_views | 96 kB | 4 |
| payment_intents | 112 kB | 0 |
| platform_api_keys | 96 kB | 1 |
| platforms | 48 kB | 0 |
| privacy_consent | 56 kB | 2 |
| rate_limit_configs | 80 kB | 0 |
| rate_limit_overrides | 40 kB | 0 |
| rate_limit_usage | 32 kB | 0 |
| rate_limit_violations | 48 kB | 0 |
| saved_backtest_results | 48 kB | 0 |
| saved_fundamental_screener_results | 176 kB | 0 |
| saved_portfolio_optimizer_results | 120 kB | 0 |
| saved_screener_results | 136 kB | 0 |
| search_events | 40 kB | 0 |
| sessions | 320 kB | 87 |
| stock_analysis | 616 kB | 0 |
| stock_fundamentals | 31 MB | 0 |
| subscription_plans | 48 kB | 0 |
| system_config | 48 kB | 0 |
| system_notifications | 32 kB | 0 |
| tickers | 1024 kB | 0 |
| users | 280 kB | 0 |
| watchlist_items | 32 kB | 0 |
| window_layouts | 16 kB | 0 |

## Per-table details

### admin_audit_log
_size 80 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('admin_audit_log_id_seq'::regclass) |
| 2 | admin_user_id | uuid | NO |  |
| 3 | action | character varying | NO |  |
| 4 | target_type | character varying | YES |  |
| 5 | target_id | character varying | YES |  |
| 6 | previous_value | jsonb | YES |  |
| 7 | new_value | jsonb | YES |  |
| 8 | ip_address | character varying | YES |  |
| 9 | user_agent | text | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- admin_user_id → users(id)

**Indexes:**

- admin_audit_log_pkey
    
- idx_admin_audit_admin
    
- idx_admin_audit_created
    
- idx_admin_audit_target
    

### admin_notification_preferences
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('admin_notification_preferences_id_seq'::regclass) |
| 2 | admin_id | uuid | NO |  |
| 3 | event_type_id | integer | NO |  |
| 4 | email_enabled | boolean | YES | true |
| 5 | push_enabled | boolean | YES | false |
| 6 | created_at | timestamp with time zone | YES | now() |
| 7 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- admin_id → users(id)
- event_type_id → notification_event_types(id)

**Indexes:**

- admin_notification_preferences_pkey
    
- idx_admin_notification_prefs_admin
    
- unique_admin_event_preference
    

### alembic_version
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | version_num | character varying | NO |  |

**Primary key:** version_num

**Indexes:**

- alembic_version_pkc
    

### analytics_daily_summary
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('analytics_daily_summary_id_seq'::regclass) |
| 2 | date | date | NO |  |
| 3 | metric_type | character varying | NO |  |
| 4 | metric_key | character varying | YES |  |
| 5 | count | integer | NO | 0 |
| 6 | unique_users | integer | YES | 0 |
| 7 | metadata | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- analytics_daily_summary_date_metric_type_metric_key_key
    
- analytics_daily_summary_pkey
    
- idx_analytics_daily_date
    
- idx_analytics_daily_type
    

### api_keys
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | name | character varying | NO |  |
| 4 | key_prefix | character varying | NO |  |
| 5 | key_hash | character varying | NO |  |
| 6 | tier | character varying | NO | 'basic'::character varying |
| 7 | key_type | character varying | NO | 'standard'::character varying |
| 8 | rate_limit_per_minute | integer | NO | 20 |
| 9 | rate_limit_per_hour | integer | NO | 500 |
| 10 | rate_limit_per_day | integer | NO | 5000 |
| 11 | allowed_origins | ARRAY | YES | '{}'::text[] |
| 12 | allowed_ips | ARRAY | YES | '{}'::text[] |
| 13 | allowed_endpoints | ARRAY | YES | '{}'::text[] |
| 14 | created_by | uuid | YES |  |
| 15 | description | text | YES |  |
| 16 | is_active | boolean | YES | true |
| 17 | last_used_at | timestamp with time zone | YES |  |
| 18 | last_used_ip | character varying | YES |  |
| 19 | expires_at | timestamp with time zone | YES |  |
| 20 | revoked_at | timestamp with time zone | YES |  |
| 21 | revoked_reason | text | YES |  |
| 22 | created_at | timestamp with time zone | YES | now() |
| 23 | updated_at | timestamp with time zone | YES | now() |
| 24 | encrypted_key | text | YES |  |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)
- user_id → users(id)

**Indexes:**

- api_keys_key_hash_key
    
- api_keys_pkey
    
- idx_api_keys_active
    
- idx_api_keys_key_hash
    
- idx_api_keys_user_id
    

### api_usage_log
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('api_usage_log_id_seq'::regclass) |
| 2 | api_key_id | uuid | YES |  |
| 3 | user_id | uuid | NO |  |
| 4 | endpoint | character varying | NO |  |
| 5 | method | character varying | NO |  |
| 6 | status_code | integer | YES |  |
| 7 | response_time_ms | integer | YES |  |
| 8 | ip_address | character varying | YES |  |
| 9 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- api_key_id → api_keys(id)

**Indexes:**

- api_usage_log_pkey
    
- idx_api_usage_date
    
- idx_api_usage_key_date
    
- idx_api_usage_user_date
    

### auth_logs
_size 288 kB · rows ≈ 22_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('auth_logs_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | event_type | character varying | NO |  |
| 4 | provider | character varying | YES |  |
| 5 | ip_address | character varying | YES |  |
| 6 | user_agent | text | YES |  |
| 7 | device_info | text | YES |  |
| 8 | location | character varying | YES |  |
| 9 | success | boolean | NO |  |
| 10 | failure_reason | text | YES |  |
| 11 | metadata | jsonb | YES |  |
| 12 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- auth_logs_pkey
    
- idx_auth_logs_created_at
    
- idx_auth_logs_event_type
    
- idx_auth_logs_failed_logins
    
- idx_auth_logs_ip
    
- idx_auth_logs_recent_failures
    
- idx_auth_logs_subscription_events
    
- idx_auth_logs_success
    
- idx_auth_logs_user_id
    

### broker_connections
_size 112 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | broker_name | character varying | NO |  |
| 4 | credentials_encrypted | text | NO |  |
| 5 | session_token_encrypted | text | YES |  |
| 6 | token_expiry | timestamp with time zone | YES |  |
| 7 | is_active | boolean | YES | true |
| 8 | last_auth_at | timestamp with time zone | YES |  |
| 9 | last_auth_error | text | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |
| 11 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- broker_connections_pkey
    
- broker_connections_user_id_broker_name_key
    
- idx_broker_conn_active
    
- idx_broker_conn_broker
    
- idx_broker_conn_expiry
    
- idx_broker_conn_user
    

### click_events
_size 80 kB · rows ≈ 5_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('click_events_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | session_id | character varying | NO |  |
| 4 | page_path | character varying | NO |  |
| 5 | element_type | character varying | YES |  |
| 6 | element_id | character varying | YES |  |
| 7 | element_text | character varying | YES |  |
| 8 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- click_events_pkey
    
- idx_clicks_created
    
- idx_clicks_session
    
- idx_clicks_user
    

### coin_balances
_size 56 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | user_id | uuid | NO |  |
| 2 | balance | integer | NO | 0 |
| 3 | lifetime_earned | integer | NO | 0 |
| 4 | lifetime_spent | integer | NO | 0 |
| 5 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** user_id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- coin_balances_pkey
    

### coin_packs
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | name | character varying | NO |  |
| 3 | coin_amount | integer | NO |  |
| 4 | bonus_coins | integer | NO | 0 |
| 5 | price_inr_paise | integer | NO |  |
| 6 | is_active | boolean | NO | true |
| 7 | sort_order | integer | NO | 0 |
| 8 | created_at | timestamp with time zone | YES | now() |
| 9 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- coin_packs_pkey
    
- idx_coin_packs_active
    

### coin_pricing
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | 1 |
| 2 | paise_per_coin | integer | NO | 100 |
| 3 | updated_at | timestamp with time zone | NO | now() |
| 4 | updated_by | uuid | YES |  |
| 5 | signup_bonus_coins | integer | NO | 10 |

**Primary key:** id

**Foreign keys:**

- updated_by → users(id)

**Indexes:**

- coin_pricing_pkey
    

### coin_transactions
_size 328 kB · rows ≈ 14_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | platform_id | uuid | YES |  |
| 4 | type | USER-DEFINED | NO |  |
| 5 | amount | integer | NO |  |
| 6 | feature_key | character varying | YES |  |
| 7 | reference_id | character varying | YES |  |
| 8 | balance_after | integer | NO |  |
| 9 | idempotency_key | character varying | YES |  |
| 10 | metadata | jsonb | YES | '{}'::jsonb |
| 11 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- platform_id → platforms(id)
- user_id → users(id)

**Indexes:**

- coin_transactions_idempotency_key_key
    
- coin_transactions_pkey
    
- idx_coin_txn_idem
    
- idx_coin_txn_platform
    
- idx_coin_txn_ref
    
- idx_coin_txn_type
    
- idx_coin_txn_user_date
    

### email_templates
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('email_templates_id_seq'::regclass) |
| 2 | event_type_key | character varying | NO |  |
| 3 | subject_template | character varying | NO |  |
| 4 | body_text_template | text | NO |  |
| 5 | body_html_template | text | YES |  |
| 6 | variables | jsonb | YES |  |
| 7 | created_at | timestamp with time zone | YES | now() |
| 8 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- event_type_key → notification_event_types(key)

**Indexes:**

- email_templates_pkey
    
- unique_event_template
    

### feature_costs
_size 32 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | feature_key | character varying | NO |  |
| 2 | cost | integer | NO | 1 |
| 3 | description | text | YES |  |
| 4 | is_active | boolean | NO | true |
| 5 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** feature_key

**Indexes:**

- feature_costs_pkey
    

### feature_flag_audit
_size 32 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('feature_flag_audit_id_seq'::regclass) |
| 2 | flag_id | integer | NO |  |
| 3 | admin_id | uuid | NO |  |
| 4 | action | character varying | NO |  |
| 5 | old_value | jsonb | YES |  |
| 6 | new_value | jsonb | YES |  |
| 7 | ip_address | character varying | YES |  |
| 8 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- admin_id → users(id)
- flag_id → feature_flags(id)

**Indexes:**

- feature_flag_audit_pkey
    
- idx_feature_flag_audit_created
    
- idx_feature_flag_audit_flag
    

### feature_flag_overrides
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('feature_flag_overrides_id_seq'::regclass) |
| 2 | flag_id | integer | NO |  |
| 3 | user_id | uuid | NO |  |
| 4 | is_enabled | boolean | NO |  |
| 5 | reason | text | YES |  |
| 6 | created_by | uuid | YES |  |
| 7 | expires_at | timestamp with time zone | YES |  |
| 8 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)
- flag_id → feature_flags(id)
- user_id → users(id)

**Indexes:**

- feature_flag_overrides_pkey
    
- idx_feature_flag_overrides_expires
    
- idx_feature_flag_overrides_flag
    
- idx_feature_flag_overrides_user
    
- unique_flag_user
    

### feature_flags
_size 96 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('feature_flags_id_seq'::regclass) |
| 2 | key | character varying | NO |  |
| 3 | name | character varying | NO |  |
| 4 | description | text | YES |  |
| 5 | is_enabled | boolean | YES | false |
| 6 | target_tiers | ARRAY | YES | NULL::character varying[] |
| 7 | target_roles | ARRAY | YES | NULL::character varying[] |
| 8 | rollout_percentage | integer | YES | 100 |
| 9 | starts_at | timestamp with time zone | YES |  |
| 10 | expires_at | timestamp with time zone | YES |  |
| 11 | category | character varying | YES | 'general'::character varying |
| 12 | created_by | uuid | YES |  |
| 13 | created_at | timestamp with time zone | YES | now() |
| 14 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)

**Indexes:**

- feature_flags_key_key
    
- feature_flags_pkey
    
- idx_feature_flags_category
    
- idx_feature_flags_enabled
    
- idx_feature_flags_key
    

### feature_usage
_size 80 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('feature_usage_id_seq'::regclass) |
| 2 | user_id | uuid | NO |  |
| 3 | feature_type | character varying | NO |  |
| 4 | feature_params | jsonb | NO |  |
| 5 | result_summary | jsonb | YES |  |
| 6 | execution_time_ms | integer | YES |  |
| 7 | success | boolean | YES | true |
| 8 | error_message | text | YES |  |
| 9 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- feature_usage_pkey
    
- idx_feature_usage_created
    
- idx_feature_usage_type
    
- idx_feature_usage_user
    

### forum_messages
_size 16 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | character varying | NO | gen_random_uuid() |
| 2 | user_id | character varying | NO |  |
| 3 | user_name | text | NO |  |
| 4 | message | text | NO |  |
| 5 | created_at | timestamp without time zone | NO | now() |

**Primary key:** id

**Indexes:**

- forum_messages_pkey
    

### ltp_live
_size 98 MB · rows ≈ 413,348_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('ltp_live_id_seq_new'::regclass) |
| 2 | ticker_id | integer | NO |  |
| 3 | symbol | character varying | NO |  |
| 4 | exchange | character varying | NO |  |
| 5 | token | character varying | NO |  |
| 6 | ltp | numeric | NO |  |
| 7 | open | numeric | NO |  |
| 8 | high | numeric | NO |  |
| 9 | low | numeric | NO |  |
| 10 | close | numeric | NO |  |
| 11 | percent_change | numeric | YES |  |
| 12 | trade_volume | bigint | YES |  |
| 13 | lower_circuit | numeric | YES |  |
| 14 | upper_circuit | numeric | YES |  |
| 15 | week_52_low | numeric | YES |  |
| 16 | week_52_high | numeric | YES |  |
| 17 | timestamp | timestamp without time zone | NO | now() |

**Primary key:** id

**Indexes:**

- idx_ltp_live_symbol
    
- idx_ltp_live_ticker
    
- idx_ltp_live_ticker_timestamp
    
- idx_ltp_live_timestamp
    
- ltp_live_pkey
    

### market_movers_live
_size 432 kB · rows ≈ 80_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('market_movers_live_id_seq_new'::regclass) |
| 2 | ticker_id | integer | NO |  |
| 3 | symbol | character varying | NO |  |
| 4 | ltp | numeric | NO |  |
| 5 | change_percent | numeric | YES |  |
| 6 | change_amount | numeric | YES |  |
| 7 | trade_volume | bigint | YES |  |
| 8 | lower_circuit | numeric | YES |  |
| 9 | upper_circuit | numeric | YES |  |
| 10 | week_52_low | numeric | YES |  |
| 11 | week_52_high | numeric | YES |  |
| 12 | proximity_percent | numeric | YES |  |
| 13 | category | character varying | NO |  |
| 14 | rank | integer | NO |  |
| 15 | snapshot_time | timestamp without time zone | NO | now() |

**Primary key:** id

**Foreign keys:**

- ticker_id → tickers(id)

**Indexes:**

- idx_movers_category
    
- idx_movers_category_rank
    
- idx_movers_latest_rank
    
- idx_movers_snapshot
    
- idx_movers_ticker
    
- idx_movers_unique_snapshot
    
- market_movers_live_pkey
    

### migration_history
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('migration_history_id_seq'::regclass) |
| 2 | migration_name | character varying | NO |  |
| 3 | applied_at | timestamp with time zone | YES | now() |
| 4 | success | boolean | YES | true |
| 5 | error_message | text | YES |  |

**Primary key:** id

**Indexes:**

- migration_history_migration_name_key
    
- migration_history_pkey
    

### notification_dismissals
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('notification_dismissals_id_seq'::regclass) |
| 2 | user_id | uuid | NO |  |
| 3 | notification_id | uuid | NO |  |
| 4 | dismissed_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- notification_id → system_notifications(id)
- user_id → users(id)

**Indexes:**

- idx_dismissals_user
    
- notification_dismissals_pkey
    
- notification_dismissals_user_id_notification_id_key
    

### notification_event_types
_size 64 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('notification_event_types_id_seq'::regclass) |
| 2 | key | character varying | NO |  |
| 3 | name | character varying | NO |  |
| 4 | description | text | YES |  |
| 5 | category | character varying | NO |  |
| 6 | default_enabled | boolean | YES | true |
| 7 | severity | character varying | YES | 'info'::character varying |
| 8 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- idx_notification_event_types_category
    
- notification_event_types_key_key
    
- notification_event_types_pkey
    

### notification_history
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('notification_history_id_seq'::regclass) |
| 2 | queue_id | bigint | YES |  |
| 3 | event_type_key | character varying | NO |  |
| 4 | recipient_admin_id | uuid | NO |  |
| 5 | recipient_email | character varying | NO |  |
| 6 | subject | character varying | NO |  |
| 7 | status | character varying | NO |  |
| 8 | metadata | jsonb | YES |  |
| 9 | error_message | text | YES |  |
| 10 | sent_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- queue_id → notification_queue(id)
- recipient_admin_id → users(id)

**Indexes:**

- idx_notification_history_admin
    
- idx_notification_history_event
    
- idx_notification_history_sent
    
- notification_history_pkey
    

### notification_queue
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('notification_queue_id_seq'::regclass) |
| 2 | event_type_key | character varying | NO |  |
| 3 | recipient_admin_id | uuid | NO |  |
| 4 | recipient_email | character varying | NO |  |
| 5 | subject | character varying | NO |  |
| 6 | body_text | text | NO |  |
| 7 | body_html | text | YES |  |
| 8 | metadata | jsonb | YES |  |
| 9 | status | character varying | YES | 'pending'::character varying |
| 10 | attempts | integer | YES | 0 |
| 11 | max_attempts | integer | YES | 3 |
| 12 | last_error | text | YES |  |
| 13 | scheduled_at | timestamp with time zone | YES | now() |
| 14 | sent_at | timestamp with time zone | YES |  |
| 15 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- recipient_admin_id → users(id)

**Indexes:**

- idx_notification_queue_admin
    
- idx_notification_queue_scheduled
    
- idx_notification_queue_status
    
- notification_queue_pkey
    

### notification_settings
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('notification_settings_id_seq'::regclass) |
| 2 | key | character varying | NO |  |
| 3 | value | text | YES |  |
| 4 | description | text | YES |  |
| 5 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- notification_settings_key_key
    
- notification_settings_pkey
    

### oauth_accounts
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | provider | character varying | NO |  |
| 4 | provider_user_id | character varying | NO |  |
| 5 | access_token | text | YES |  |
| 6 | refresh_token | text | YES |  |
| 7 | token_expires_at | timestamp with time zone | YES |  |
| 8 | email | character varying | YES |  |
| 9 | name | character varying | YES |  |
| 10 | avatar_url | text | YES |  |
| 11 | profile_data | jsonb | YES |  |
| 12 | linked_at | timestamp with time zone | YES | now() |
| 13 | last_used_at | timestamp with time zone | YES |  |
| 14 | created_at | timestamp with time zone | YES | now() |
| 15 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_oauth_last_used
    
- idx_oauth_provider
    
- idx_oauth_user_id
    
- oauth_accounts_pkey
    
- unique_provider_user
    

### ohlc_1hour
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | ticker_id | integer | NO |  |
| 2 | ts | timestamp with time zone | NO |  |
| 3 | open | numeric | NO |  |
| 4 | high | numeric | NO |  |
| 5 | low | numeric | NO |  |
| 6 | close | numeric | NO |  |
| 7 | volume | bigint | YES |  |

**Primary key:** ticker_id, ts

**Indexes:**

- idx_ohlc_1hour_ticker
    
- ohlc_1hour_pkey
    
- ohlc_1hour_ts_idx
    

### ohlc_1min_intraday
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | ticker_id | integer | NO |  |
| 2 | ts | timestamp with time zone | NO |  |
| 3 | open | numeric | NO |  |
| 4 | high | numeric | NO |  |
| 5 | low | numeric | NO |  |
| 6 | close | numeric | NO |  |
| 7 | volume | bigint | YES |  |

**Primary key:** ticker_id, ts

**Indexes:**

- idx_ohlc_1min_intraday_ticker_ts
    
- idx_ohlc_1min_intraday_ts
    
- idx_ohlc_1min_ticker
    
- ohlc_1min_intraday_pkey
    
- ohlc_1min_intraday_ts_idx
    

### otp_codes
_size 24 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('otp_codes_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | email | character varying | NO |  |
| 4 | code | character varying | NO |  |
| 5 | purpose | character varying | NO |  |
| 6 | attempts | integer | YES | 0 |
| 7 | max_attempts | integer | YES | 3 |
| 8 | expires_at | timestamp with time zone | NO |  |
| 9 | verified_at | timestamp with time zone | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_otp_email
    
- idx_otp_user
    
- otp_codes_pkey
    

### page_views
_size 96 kB · rows ≈ 4_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('page_views_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | session_id | character varying | NO |  |
| 4 | page_path | character varying | NO |  |
| 5 | page_title | character varying | YES |  |
| 6 | referrer | character varying | YES |  |
| 7 | duration_seconds | integer | YES |  |
| 8 | device_type | character varying | YES |  |
| 9 | browser | character varying | YES |  |
| 10 | os | character varying | YES |  |
| 11 | screen_resolution | character varying | YES |  |
| 12 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_page_views_created
    
- idx_page_views_path
    
- idx_page_views_session
    
- idx_page_views_user
    
- page_views_pkey
    

### payment_intents
_size 112 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | platform_id | uuid | YES |  |
| 4 | kind | USER-DEFINED | NO |  |
| 5 | product_id | character varying | NO |  |
| 6 | amount_paise | integer | NO |  |
| 7 | currency | character varying | NO | 'INR'::character varying |
| 8 | cashfree_order_id | character varying | YES |  |
| 9 | cashfree_payment_id | character varying | YES |  |
| 10 | status | USER-DEFINED | NO | 'pending'::payment_intent_status |
| 11 | fulfilled_at | timestamp with time zone | YES |  |
| 12 | fulfilment_key | character varying | YES |  |
| 13 | raw_webhook | jsonb | YES | '{}'::jsonb |
| 14 | metadata | jsonb | YES | '{}'::jsonb |
| 15 | created_at | timestamp with time zone | YES | now() |
| 16 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- platform_id → platforms(id)
- user_id → users(id)

**Indexes:**

- idx_payment_intents_cf_order
    
- idx_payment_intents_status
    
- idx_payment_intents_user
    
- payment_intents_cashfree_order_id_key
    
- payment_intents_fulfilment_key_key
    
- payment_intents_pkey
    

### platform_api_keys
_size 96 kB · rows ≈ 1_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | platform_id | uuid | NO |  |
| 3 | name | character varying | NO |  |
| 4 | key_prefix | character varying | NO |  |
| 5 | key_hash | character varying | NO |  |
| 6 | secret_hash | character varying | NO |  |
| 7 | is_active | boolean | NO | true |
| 8 | last_used_at | timestamp with time zone | YES |  |
| 9 | last_used_ip | character varying | YES |  |
| 10 | created_by | uuid | YES |  |
| 11 | created_at | timestamp with time zone | YES | now() |
| 12 | revoked_at | timestamp with time zone | YES |  |
| 13 | revoked_reason | text | YES |  |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)
- platform_id → platforms(id)

**Indexes:**

- idx_platform_api_keys_active
    
- idx_platform_api_keys_hash
    
- idx_platform_api_keys_platform
    
- platform_api_keys_key_hash_key
    
- platform_api_keys_pkey
    

### platforms
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | slug | character varying | NO |  |
| 3 | name | character varying | NO |  |
| 4 | description | text | YES |  |
| 5 | is_active | boolean | NO | true |
| 6 | created_at | timestamp with time zone | YES | now() |
| 7 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- platforms_pkey
    
- platforms_slug_key
    

### privacy_consent
_size 56 kB · rows ≈ 2_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('privacy_consent_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | session_id | character varying | YES |  |
| 4 | consent_level | character varying | NO | 'none'::character varying |
| 5 | ip_address | character varying | YES |  |
| 6 | user_agent | text | YES |  |
| 7 | consented_at | timestamp with time zone | YES | now() |
| 8 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_privacy_consent_session
    
- idx_privacy_consent_user
    
- privacy_consent_pkey
    

### rate_limit_configs
_size 80 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('rate_limit_configs_id_seq'::regclass) |
| 2 | endpoint_key | character varying | NO |  |
| 3 | tier | character varying | NO | 'all'::character varying |
| 4 | window_ms | integer | NO | 900000 |
| 5 | max_requests | integer | NO | 100 |
| 6 | description | text | YES |  |
| 7 | is_active | boolean | YES | true |
| 8 | created_at | timestamp with time zone | YES | now() |
| 9 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- idx_rate_limit_configs_active
    
- idx_rate_limit_configs_endpoint
    
- rate_limit_configs_pkey
    
- unique_endpoint_tier
    

### rate_limit_overrides
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('rate_limit_overrides_id_seq'::regclass) |
| 2 | user_id | uuid | NO |  |
| 3 | endpoint_key | character varying | NO |  |
| 4 | window_ms | integer | NO |  |
| 5 | max_requests | integer | NO |  |
| 6 | reason | text | YES |  |
| 7 | created_by | uuid | YES |  |
| 8 | expires_at | timestamp with time zone | YES |  |
| 9 | created_at | timestamp with time zone | YES | now() |
| 10 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)
- user_id → users(id)

**Indexes:**

- idx_rate_limit_overrides_expires
    
- idx_rate_limit_overrides_user
    
- rate_limit_overrides_pkey
    
- unique_user_endpoint
    

### rate_limit_usage
_size 32 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('rate_limit_usage_id_seq'::regclass) |
| 2 | identifier | character varying | NO |  |
| 3 | endpoint_key | character varying | NO |  |
| 4 | request_count | integer | YES | 1 |
| 5 | window_start | timestamp with time zone | NO |  |
| 6 | window_end | timestamp with time zone | NO |  |
| 7 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- idx_rate_limit_usage_identifier
    
- idx_rate_limit_usage_window
    
- rate_limit_usage_pkey
    
- unique_identifier_endpoint_window
    

### rate_limit_violations
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('rate_limit_violations_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | ip_address | character varying | NO |  |
| 4 | endpoint_key | character varying | NO |  |
| 5 | endpoint_path | character varying | YES |  |
| 6 | request_count | integer | NO |  |
| 7 | limit_max | integer | NO |  |
| 8 | window_ms | integer | NO |  |
| 9 | user_agent | text | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_rate_limit_violations_created
    
- idx_rate_limit_violations_endpoint
    
- idx_rate_limit_violations_ip
    
- idx_rate_limit_violations_user
    
- rate_limit_violations_pkey
    

### saved_backtest_results
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | YES |  |
| 3 | name | character varying | NO |  |
| 4 | ticker | character varying | NO |  |
| 5 | mode | character varying | NO |  |
| 6 | custom_rules | text | YES |  |
| 7 | strategy_condition | text | NO |  |
| 8 | metrics | jsonb | NO |  |
| 9 | equity_curve | jsonb | YES |  |
| 10 | candlestick_data | jsonb | YES |  |
| 11 | tpsl_values | jsonb | YES |  |
| 12 | execution_time_ms | integer | YES |  |
| 13 | is_shared | boolean | YES | false |
| 14 | share_token | character varying | YES |  |
| 15 | created_at | timestamp with time zone | YES | now() |
| 16 | updated_at | timestamp with time zone | YES | now() |
| 17 | train_end_date | character varying | YES |  |
| 18 | train_end_index | integer | YES |  |
| 19 | max_drawdown_point | jsonb | YES |  |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_saved_backtest_shared
    
- idx_saved_backtest_ticker
    
- idx_saved_backtest_user
    
- saved_backtest_results_pkey
    
- saved_backtest_results_share_token_key
    

### saved_fundamental_screener_results
_size 176 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | YES |  |
| 3 | name | character varying | NO |  |
| 4 | expression | text | NO |  |
| 5 | result_count | integer | NO |  |
| 6 | matching_symbols | jsonb | NO |  |
| 7 | execution_time_ms | integer | YES |  |
| 8 | is_shared | boolean | YES | false |
| 9 | share_token | character varying | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |
| 11 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_saved_fundamental_screener_shared
    
- idx_saved_fundamental_screener_user
    
- saved_fundamental_screener_results_pkey
    
- saved_fundamental_screener_results_share_token_key
    

### saved_portfolio_optimizer_results
_size 120 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | YES |  |
| 3 | name | character varying | NO |  |
| 4 | holdings | jsonb | NO |  |
| 5 | params | jsonb | YES | '{}'::jsonb |
| 6 | result | jsonb | NO |  |
| 7 | execution_time_ms | integer | YES |  |
| 8 | is_shared | boolean | YES | false |
| 9 | share_token | character varying | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |
| 11 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_saved_portfolio_optimizer_shared
    
- idx_saved_portfolio_optimizer_user
    
- saved_portfolio_optimizer_results_pkey
    
- saved_portfolio_optimizer_results_share_token_key
    

### saved_screener_results
_size 136 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | YES |  |
| 3 | name | character varying | NO |  |
| 4 | expression | text | NO |  |
| 5 | result_count | integer | NO |  |
| 6 | matching_symbols | jsonb | NO |  |
| 7 | execution_time_ms | integer | YES |  |
| 8 | is_shared | boolean | YES | false |
| 9 | share_token | character varying | YES |  |
| 10 | created_at | timestamp with time zone | YES | now() |
| 11 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_saved_screener_shared
    
- idx_saved_screener_user
    
- saved_screener_results_pkey
    
- saved_screener_results_share_token_key
    

### search_events
_size 40 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | bigint | NO | nextval('search_events_id_seq'::regclass) |
| 2 | user_id | uuid | YES |  |
| 3 | session_id | character varying | NO |  |
| 4 | query | character varying | NO |  |
| 5 | result_count | integer | YES |  |
| 6 | selected_result | character varying | YES |  |
| 7 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_search_created
    
- idx_search_query
    
- idx_search_user
    
- search_events_pkey
    

### sessions
_size 320 kB · rows ≈ 87_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | user_id | uuid | NO |  |
| 3 | token_hash | character varying | NO |  |
| 4 | refresh_token_hash | character varying | YES |  |
| 5 | device_info | text | YES |  |
| 6 | ip_address | character varying | YES |  |
| 7 | location | character varying | YES |  |
| 8 | issued_at | timestamp with time zone | YES | now() |
| 9 | expires_at | timestamp with time zone | NO |  |
| 10 | last_activity_at | timestamp with time zone | YES | now() |
| 11 | revoked | boolean | YES | false |
| 12 | revoked_at | timestamp with time zone | YES |  |
| 13 | revoked_reason | text | YES |  |
| 14 | created_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- user_id → users(id)

**Indexes:**

- idx_sessions_active
    
- idx_sessions_active_user
    
- idx_sessions_expires_at
    
- idx_sessions_last_activity
    
- idx_sessions_refresh_token_hash
    
- idx_sessions_token_hash
    
- idx_sessions_user_id
    
- idx_sessions_validation
    
- sessions_pkey
    
- sessions_refresh_token_hash_key
    
- sessions_token_hash_key
    

### stock_analysis
_size 616 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('stock_analysis_id_seq'::regclass) |
| 2 | ticker_id | integer | NO |  |
| 3 | ticker_symbol | character varying | NO |  |
| 4 | valuation_dcf | numeric | YES |  |
| 5 | valuation_metric | character varying | YES |  |
| 6 | target_price | numeric | YES |  |
| 7 | performance_benchmark | numeric | YES |  |
| 8 | performance_pct_of_benchmark | numeric | YES |  |
| 9 | growth_expected_vs_projections | numeric | YES |  |
| 10 | growth_vs_sector_rate | numeric | YES |  |
| 11 | growth_notes | text | YES |  |
| 12 | profitability_pct_of_revenue | numeric | YES |  |
| 13 | profitability_metric | character varying | YES |  |
| 14 | analyst_recommendation | character varying | YES |  |
| 15 | entry_point | numeric | YES |  |
| 16 | entry_rating | character varying | YES |  |
| 17 | report_title | character varying | YES |  |
| 18 | pdf_url | text | YES |  |
| 19 | analyst_name | character varying | YES |  |
| 20 | notes | text | YES |  |
| 21 | analysis_date | date | NO |  |
| 22 | is_active | boolean | YES | true |
| 23 | created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

**Primary key:** id

**Foreign keys:**

- ticker_id → tickers(id)

**Indexes:**

- idx_analysis_recommendation
    
- idx_analysis_ticker_active
    
- stock_analysis_pkey
    
- unique_ticker_analysis_date
    

### stock_fundamentals
_size 31 MB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('stock_fundamentals_id_seq'::regclass) |
| 2 | ticker_id | integer | YES |  |
| 3 | long_name | character varying | YES |  |
| 4 | sector | character varying | YES |  |
| 5 | industry | character varying | YES |  |
| 6 | market_cap | bigint | YES |  |
| 7 | current_price | numeric | YES |  |
| 8 | trailing_pe | numeric | YES |  |
| 9 | forward_pe | numeric | YES |  |
| 10 | price_to_book | numeric | YES |  |
| 11 | price_to_sales | numeric | YES |  |
| 12 | peg_ratio | numeric | YES |  |
| 13 | profit_margin | numeric | YES |  |
| 14 | operating_margin | numeric | YES |  |
| 15 | return_on_equity | numeric | YES |  |
| 16 | return_on_assets | numeric | YES |  |
| 17 | revenue_growth | numeric | YES |  |
| 18 | earnings_growth | numeric | YES |  |
| 19 | debt_to_equity | numeric | YES |  |
| 20 | current_ratio | numeric | YES |  |
| 21 | quick_ratio | numeric | YES |  |
| 22 | total_cash | bigint | YES |  |
| 23 | total_debt | bigint | YES |  |
| 24 | shares_outstanding | bigint | YES |  |
| 25 | float_shares | bigint | YES |  |
| 26 | dividend_yield | numeric | YES |  |
| 27 | dividend_rate | numeric | YES |  |
| 28 | payout_ratio | numeric | YES |  |
| 29 | ex_dividend_date | date | YES |  |
| 30 | volume | bigint | YES |  |
| 31 | avg_volume | bigint | YES |  |
| 32 | enterprise_value | bigint | YES |  |
| 33 | previous_close | numeric | YES |  |
| 34 | open_price | numeric | YES |  |
| 35 | day_high | numeric | YES |  |
| 36 | day_low | numeric | YES |  |
| 37 | fifty_two_week_high | numeric | YES |  |
| 38 | fifty_two_week_low | numeric | YES |  |
| 39 | description | text | YES |  |
| 40 | website | character varying | YES |  |
| 41 | income_statement | jsonb | YES |  |
| 42 | balance_sheet | jsonb | YES |  |
| 43 | cash_flow | jsonb | YES |  |
| 44 | quarterly_financials | jsonb | YES |  |
| 45 | dividends_history | jsonb | YES |  |
| 46 | last_updated | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| 47 | fetch_error | text | YES |  |

**Primary key:** id

**Foreign keys:**

- ticker_id → tickers(id)

**Indexes:**

- idx_fundamentals_div_yield
    
- idx_fundamentals_dividend_stocks
    
- idx_fundamentals_market_cap
    
- idx_fundamentals_pb
    
- idx_fundamentals_pe
    
- idx_fundamentals_price
    
- idx_fundamentals_quality
    
- idx_fundamentals_roa
    
- idx_fundamentals_roe
    
- idx_fundamentals_sector
    
- idx_fundamentals_valuation
    
- idx_stock_fundamentals_ticker_id
    
- stock_fundamentals_pkey
    
- stock_fundamentals_ticker_id_key
    

### subscription_plans
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | character varying | NO |  |
| 2 | name | character varying | NO |  |
| 3 | description | text | YES |  |
| 4 | tier | character varying | NO |  |
| 5 | price_cents | integer | NO | 0 |
| 6 | currency | character varying | NO | 'INR'::character varying |
| 7 | billing_interval | character varying | YES |  |
| 8 | interval_count | integer | YES | 1 |
| 9 | trial_days | integer | YES | 0 |
| 10 | features | jsonb | YES | '[]'::jsonb |
| 11 | is_active | boolean | YES | true |
| 12 | sort_order | integer | YES | 0 |
| 13 | created_at | timestamp with time zone | YES | now() |
| 14 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Indexes:**

- idx_subscription_plans_active
    
- subscription_plans_pkey
    

### system_config
_size 48 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | key | character varying | NO |  |
| 2 | value | jsonb | NO |  |
| 3 | description | text | YES |  |
| 4 | category | character varying | NO |  |
| 5 | updated_by | uuid | YES |  |
| 6 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** key

**Foreign keys:**

- updated_by → users(id)

**Indexes:**

- idx_system_config_category
    
- system_config_pkey
    

### system_notifications
_size 32 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | title | character varying | NO |  |
| 3 | message | text | NO |  |
| 4 | type | character varying | NO | 'info'::character varying |
| 5 | target_audience | character varying | YES | 'all'::character varying |
| 6 | is_active | boolean | YES | true |
| 7 | is_dismissible | boolean | YES | true |
| 8 | show_on_pages | jsonb | YES | '["all"]'::jsonb |
| 9 | scheduled_start | timestamp with time zone | YES |  |
| 10 | scheduled_end | timestamp with time zone | YES |  |
| 11 | created_by | uuid | YES |  |
| 12 | created_at | timestamp with time zone | YES | now() |
| 13 | updated_at | timestamp with time zone | YES | now() |

**Primary key:** id

**Foreign keys:**

- created_by → users(id)

**Indexes:**

- idx_notifications_active
    
- idx_notifications_type
    
- system_notifications_pkey
    

### tickers
_size 1024 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | integer | NO | nextval('tickers_id_seq'::regclass) |
| 2 | symbol | character varying | NO |  |
| 3 | name | character varying | YES |  |
| 4 | exchange | character varying | NO | 'NSE'::character varying |
| 5 | sector | character varying | YES |  |
| 6 | industry | character varying | YES |  |
| 7 | token | character varying | YES |  |
| 8 | is_active | boolean | YES | true |
| 9 | created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| 10 | suffix | character varying | YES |  |

**Primary key:** id

**Indexes:**

- idx_tickers_active
    
- idx_tickers_fulltext_search
    
- idx_tickers_industry
    
- idx_tickers_sector
    
- idx_tickers_symbol_active
    
- idx_tickers_token
    
- tickers_pkey
    
- tickers_symbol_key
    

### users
_size 280 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | email | character varying | NO |  |
| 3 | username | character varying | NO |  |
| 4 | name | character varying | YES |  |
| 5 | avatar_url | text | YES |  |
| 6 | provider | character varying | NO | 'password'::character varying |
| 7 | password_hash | text | YES |  |
| 8 | google_id | character varying | YES |  |
| 9 | email_verified | boolean | YES | false |
| 10 | is_active | boolean | YES | true |
| 11 | tier | character varying | YES | 'free'::character varying |
| 12 | last_login_at | timestamp with time zone | YES |  |
| 13 | last_login_ip | character varying | YES |  |
| 14 | login_count | integer | YES | 0 |
| 15 | failed_login_attempts | integer | YES | 0 |
| 16 | locked_until | timestamp with time zone | YES |  |
| 17 | created_at | timestamp with time zone | YES | now() |
| 18 | updated_at | timestamp with time zone | YES | now() |
| 19 | terms_accepted | boolean | YES | false |
| 20 | terms_accepted_at | timestamp with time zone | YES |  |
| 21 | terms_version | character varying | YES | '1.0'::character varying |
| 22 | subscription_status | character varying | YES | 'none'::character varying |
| 23 | subscription_plan_id | character varying | YES |  |
| 24 | subscription_start | timestamp with time zone | YES |  |
| 25 | subscription_end | timestamp with time zone | YES |  |
| 26 | trial_end | timestamp with time zone | YES |  |
| 27 | had_trial | boolean | YES | false |
| 28 | cancelled_at | timestamp with time zone | YES |  |
| 29 | cancel_at_period_end | boolean | YES | false |
| 30 | stripe_customer_id | character varying | YES |  |
| 31 | role | character varying | YES | 'user'::character varying |
| 32 | tracking_consent | character varying | YES | 'none'::character varying |
| 33 | consent_updated_at | timestamp with time zone | YES |  |
| 34 | email_verified_at | timestamp with time zone | YES |  |
| 35 | phone_number | character varying | YES |  |
| 36 | phone_verified | boolean | YES | false |
| 37 | country_of_residence | character varying | YES |  |
| 38 | date_of_birth | date | YES |  |

**Primary key:** id

**Foreign keys:**

- subscription_plan_id → subscription_plans(id)

**Indexes:**

- idx_users_created_at
    
- idx_users_email
    
- idx_users_google_id
    
- idx_users_last_login
    
- idx_users_phone_number
    
- idx_users_provider
    
- idx_users_role
    
- idx_users_stripe_customer
    
- idx_users_subscription_end
    
- idx_users_subscription_status
    
- idx_users_terms_accepted
    
- idx_users_tier
    
- idx_users_trial_end
    
- idx_users_username
    
- users_email_key
    
- users_google_id_key
    
- users_pkey
    
- users_username_key
    

### watchlist_items
_size 32 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | character varying | NO | gen_random_uuid() |
| 2 | symbol | text | NO |  |
| 3 | added_at | timestamp without time zone | NO | now() |

**Primary key:** id

**Indexes:**

- watchlist_items_pkey
    

### window_layouts
_size 16 kB · rows ≈ 0_

**Columns:**

| # | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | character varying | NO | gen_random_uuid() |
| 2 | user_id | character varying | YES |  |
| 3 | window_type | text | NO |  |
| 4 | window_id | text | NO |  |
| 5 | x | integer | NO |  |
| 6 | y | integer | NO |  |
| 7 | width | integer | NO |  |
| 8 | height | integer | NO |  |
| 9 | z_index | integer | NO |  |
| 10 | is_minimized | boolean | NO | false |
| 11 | symbol | text | YES |  |
| 12 | updated_at | timestamp without time zone | NO | now() |

**Primary key:** id

**Indexes:**

- window_layouts_pkey
    
