# Tiphub Infrastructure TODO

## 🔴 CRITICAL: EC2 Instance Upgrade (Future Action)

### Current Situation
- **Instance:** m5.large (2 vCPU, 8 GB RAM)
- **Status:** Over capacity
  - RAM: Using 9.7-13.5 GB (you have 8 GB) - **20-70% short**
  - CPU: Using 5-6 vCPU (you have 2 vCPU) - **2.5-3x short**
  - Connections: Using 250 (max 100 default) - **2.5x short**

### Recommended Upgrade
**→ m5.2xlarge (8 vCPU, 32 GB RAM) - $280/month**

**Why:**
- 4x RAM and 4x vCPU vs current
- 800 max_connections (3x safety margin for 260 peak)
- 8GB shared_buffers for excellent database performance
- Handles 2-3 years of growth
- No CPU spikes, no connection exhaustion

**Budget Alternative:** m5.xlarge (4 vCPU, 16 GB) - $140/month
- Will work but CPU tight, may need upgrade in 6-12 months

### Migration Plan
Full 6-phase migration plan available in: `C:\Users\suhas\.claude\plans\twinkly-giggling-sphinx.md`

**Timeline:** Plan for upgrade after database tuning is complete (4-6 weeks)

---

## ✅ COMPLETED: Database Tuning Phase 1 (Current m5.large)

### Objective
Optimize PostgreSQL performance on current instance to buy time before upgrade.

**Full plan:** `C:\Users\suhas\.claude\plans\atomic-bouncing-narwhal.md`
**Implementation guide:** `scripts/DB_TUNING_IMPLEMENTATION.md`

### Phase 1: Core Cleanup (Completed Dec 15, 2025)
- [x] Run diagnostic queries to establish baseline
- [x] Run VACUUM FULL on ltp_live (saved 197 MB bloat)
- [x] Run VACUUM FULL on stock_fundamentals
- [x] Increase work_mem from 9.7 MB to 16 MB
- [x] Create NSE trading calendar module (`server/nse_trading_calendar.py`)
- [x] Create 2-day retention cleanup script (`server/cron/ltp_2day_retention_cleanup.py`)
- [x] Create database health check SQL (`scripts/db_health_check.sql`)
- [x] Create health monitor bash script (`scripts/db_health_monitor.sh`)

**Actual Impact:**
- Database size: 2,093 MB → 1,896 MB (197 MB saved, 9.4% reduction)
- ltp_live: 1,082 MB → 885 MB (18% bloat removed)
- work_mem: 9.7 MB → 16 MB ✅
- **Reality check:** Table not heavily bloated, large due to data volume
  - 4.5M rows/day with wide rows and indexes
  - Indexes: 393 MB (44% of table size)

### Phase 2: Setup & Monitoring (Next Steps)
- [ ] Test NSE trading calendar module
- [ ] Test 2-day retention cleanup script (dry run)
- [ ] Set up cron job for cleanup (5:30 PM IST daily)
- [ ] Set up cron job for health checks (6:00 AM IST daily)
- [ ] Install Python dependencies (psycopg2-binary, pytz)

**Expected Steady State (After Tomorrow):**
- ltp_live: 2 trading days, ~1,770 MB (2x current)
- Total DB: ~2,781 MB (stable, no bloat)
- Daily cleanup: Automatic at 5:30 PM IST
- Health checks: Daily at 6:00 AM IST

### Phase 3: Optional Optimizations (If Needed)
- [ ] Autovacuum tuning for ltp_live (aggressive settings)
- [ ] Index optimization (only if queries are slow)
- [ ] TimescaleDB continuous aggregate policies

**Note:** max_connections already 400 ✅, shared_buffers already tuned ✅

---

## 📋 Implementation Order

1. **Now:** Database tuning on current m5.large (4 weeks)
2. **Then:** Monitor performance for 1-2 weeks
3. **Finally:** EC2 upgrade to m5.2xlarge (5-15 min downtime)

---

## 🔗 Reference Documents

- Database Tuning Plan: `C:\Users\suhas\.claude\plans\atomic-bouncing-narwhal.md`
- EC2 Upgrade Plan: `C:\Users\suhas\.claude\plans\twinkly-giggling-sphinx.md`
- Database Schema: `db_schema.txt`, `auth_db_schema.txt`

---

## ⚠️ Known Issues (Current State)

You are likely experiencing:
- ❌ Database errors: `FATAL: sorry, too many clients already`
- ❌ CPU at 100% during backtests/screener operations
- ❌ Slow query performance (insufficient shared_buffers)
- ❌ Potential OOM kills or swap thrashing

**These will be addressed by database tuning, but full resolution requires EC2 upgrade.**
