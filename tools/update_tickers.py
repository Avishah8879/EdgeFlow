"""
Update tickers table from Angel Broking ScripMaster API.

Syncs token, suffix, name for existing tickers, detects renames by token match,
adds new equity tickers, and handles unmatched DB entries.

Usage:
    python tools/update_tickers.py --dry-run            # Preview changes
    python tools/update_tickers.py                      # Apply (interactive)
    python tools/update_tickers.py --yes --auto-deactivate  # Unattended
    python tools/update_tickers.py --sync-only          # Fix stale dependent tables
"""
import sys
import os
import argparse
import json
import urllib.request
import urllib.error
import socket
import time
import logging
import atexit
import tempfile
from datetime import datetime

# Set console encoding to UTF-8 (use reconfigure to preserve flush behavior)
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Load environment variables
from dotenv import load_dotenv
env_file = '.env.production' if os.getenv('NODE_ENV') == 'production' else '.env.development'
load_dotenv(env_file, override=True)
print(f"[ENV] Loaded environment from: {env_file}")

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

LOG_DIR = os.path.join(os.path.dirname(__file__), '..', 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

_log_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
LOG_FILE = os.path.join(LOG_DIR, f'update_tickers_{_log_timestamp}.log')

logger = logging.getLogger('update_tickers')
logger.setLevel(logging.DEBUG)
_fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(_fh)
logger.info("Script started")
print(f"[LOG] Logging to: {LOG_FILE}")

# ---------------------------------------------------------------------------
# Lock file
# ---------------------------------------------------------------------------

LOCK_FILE = os.path.join(tempfile.gettempdir(), 'update_tickers.lock')


def _acquire_lock():
    """Acquire a lock file to prevent concurrent runs. Returns True on success."""
    if os.path.exists(LOCK_FILE):
        old_pid = None
        try:
            with open(LOCK_FILE, 'r') as f:
                old_pid = int(f.read().strip())
            # Check if the PID is still running
            if sys.platform == 'win32':
                import ctypes
                kernel32 = ctypes.windll.kernel32
                handle = kernel32.OpenProcess(0x1000, False, old_pid)  # PROCESS_QUERY_LIMITED_INFORMATION
                if handle:
                    kernel32.CloseHandle(handle)
                    return False  # Process still running
                # Handle is 0 — process not running, stale lock
            else:
                os.kill(old_pid, 0)  # Raises OSError if not running
                return False  # Process still running
        except (OSError, ValueError):
            # Process not running or bad PID — stale lock
            logger.info(f"Removing stale lock file (pid={old_pid or '?'})")
            os.remove(LOCK_FILE)

    with open(LOCK_FILE, 'w') as f:
        f.write(str(os.getpid()))
    atexit.register(_release_lock)
    return True


def _release_lock():
    """Remove lock file on exit."""
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except OSError:
        pass


# Constants
API_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
VALID_EQUITY_SUFFIXES = {'-EQ', '-SM', '-BE', '-ST'}
SUFFIX_PRIORITY = {'-EQ': 0, '-SM': 1, '-BE': 2, '-ST': 3}

# Skip symbols matching these patterns (not real tradeable stocks)
SKIP_PATTERNS = ('INAV', 'NSETEST')

# Minimum expected equity count from API (sanity check)
MIN_API_EQUITIES = 2000

# Terminal colors
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
CYAN = '\033[0;36m'
NC = '\033[0m'

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "Tiphub"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
    "connect_timeout": 30,
    "keepalives": 1,
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 3,
    "options": "-c statement_timeout=300000",  # 300s per statement (batch script)
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def extract_base_symbol(symbol_with_suffix):
    """Extract base symbol: RELIANCE-EQ -> RELIANCE"""
    if '-' in symbol_with_suffix:
        return symbol_with_suffix.rsplit('-', 1)[0]
    return symbol_with_suffix


def extract_suffix(symbol_with_suffix):
    """Extract suffix with hyphen: RELIANCE-EQ -> -EQ. Returns None if no hyphen."""
    if '-' in symbol_with_suffix:
        return '-' + symbol_with_suffix.rsplit('-', 1)[1]
    return None


def fetch_scrip_master():
    """Download ScripMaster JSON from Angel Broking API with progress and retry."""
    max_retries = 3

    for attempt in range(1, max_retries + 1):
        print(f"\n{CYAN}Fetching ScripMaster from Angel Broking API (attempt {attempt}/{max_retries})...{NC}")
        print(f"  URL: {API_URL}")
        logger.info(f"API fetch attempt {attempt}/{max_retries}")

        try:
            req = urllib.request.Request(API_URL, headers={'User-Agent': 'Tiphub/1.0'})
            response = urllib.request.urlopen(req, timeout=120)

            # Set socket-level read timeout to prevent stuck reads
            raw_sock = response.fp.raw
            if hasattr(raw_sock, '_sock'):
                raw_sock._sock.settimeout(60)
            elif hasattr(raw_sock, 'settimeout'):
                raw_sock.settimeout(60)

            content_length = response.headers.get('Content-Length')
            total_size = int(content_length) if content_length else None

            chunks = []
            downloaded = 0
            chunk_size = 1024 * 1024  # 1MB

            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                chunks.append(chunk)
                downloaded += len(chunk)
                mb = downloaded / (1024 * 1024)
                if total_size:
                    pct = (downloaded / total_size) * 100
                    print(f"\r  Downloaded: {mb:.1f} MB / {total_size/(1024*1024):.1f} MB ({pct:.0f}%)", end='', flush=True)
                else:
                    print(f"\r  Downloaded: {mb:.1f} MB", end='', flush=True)

            print()  # newline after progress
            raw = b''.join(chunks)
            print(f"  Parsing JSON ({len(raw)/(1024*1024):.1f} MB)...")
            data = json.loads(raw)
            print(f"  {GREEN}Loaded {len(data):,} records{NC}")
            logger.info(f"API fetch success: {len(data)} records, {len(raw)} bytes")
            return data

        except (urllib.error.URLError, socket.timeout, OSError) as e:
            logger.warning(f"API fetch attempt {attempt} failed: {e}")
            print(f"\n  {RED}ERROR: Failed to fetch API (attempt {attempt}): {e}{NC}")
            if attempt < max_retries:
                wait = 2 ** attempt
                print(f"  Retrying in {wait}s...")
                time.sleep(wait)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse failed: {e}")
            print(f"\n  {RED}ERROR: Failed to parse JSON: {e}{NC}")
            return None

    logger.error("All API fetch attempts exhausted")
    print(f"\n  {RED}ERROR: All {max_retries} API fetch attempts failed{NC}")
    return None


def connect_to_database():
    """Connect to the external PostgreSQL database with retry and health check."""
    import psycopg2
    max_retries = 3

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"DB connect attempt {attempt}/{max_retries} to {DB_CONFIG['host']}:{DB_CONFIG['port']}")
            conn = psycopg2.connect(**DB_CONFIG)

            # Health check
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()

            print(f"\n{GREEN}Connected to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}{NC}")
            logger.info("DB connection established and health check passed")
            return conn
        except psycopg2.OperationalError as e:
            logger.warning(f"DB connect attempt {attempt} failed: {e}")
            print(f"\n{RED}ERROR: Database connection failed (attempt {attempt}): {e}{NC}")
            if attempt < max_retries:
                wait = 2 ** attempt
                print(f"  Retrying in {wait}s...")
                time.sleep(wait)
        except Exception as e:
            logger.error(f"Unexpected DB error: {e}")
            print(f"\n{RED}ERROR: Database connection failed: {e}{NC}")
            return None

    logger.error("All DB connect attempts exhausted")
    print(f"\n{RED}ERROR: All {max_retries} DB connection attempts failed{NC}")
    return None


# ---------------------------------------------------------------------------
# Filter API data
# ---------------------------------------------------------------------------

def filter_nse_records(records):
    """
    Filter API records to NSE equities and indices.

    Returns:
        api_equities: dict keyed by base_symbol (uppercase)
            {base_upper: {base_symbol, name, token, suffix, full_symbol}}
        api_indices: list of {symbol, name, token}
    """
    api_equities = {}
    api_indices = []
    suffix_counts = {}

    for rec in records:
        if rec.get('exch_seg') != 'NSE':
            continue

        symbol = rec.get('symbol', '').strip()
        name = rec.get('name', '').strip()
        token = rec.get('token', '').strip()
        instrument_type = rec.get('instrumenttype', '').strip()

        # Index
        if instrument_type == 'AMXIDX':
            api_indices.append({'symbol': symbol, 'name': name, 'token': token})
            continue

        # Equity — check suffix
        suffix = extract_suffix(symbol)
        if suffix not in VALID_EQUITY_SUFFIXES:
            continue

        suffix_counts[suffix] = suffix_counts.get(suffix, 0) + 1
        base = extract_base_symbol(symbol)
        base_upper = base.upper()

        # Skip INAV, NSETEST and similar non-tradeable entries
        if any(pat in base_upper for pat in SKIP_PATTERNS):
            continue

        # Deduplicate: keep highest-priority suffix (-EQ > -SM > -BE > -ST)
        if base_upper in api_equities:
            existing_priority = SUFFIX_PRIORITY.get(api_equities[base_upper]['suffix'], 99)
            new_priority = SUFFIX_PRIORITY.get(suffix, 99)
            if new_priority >= existing_priority:
                continue  # keep existing (higher or equal priority)

        api_equities[base_upper] = {
            'base_symbol': base,
            'name': name,
            'token': token,
            'suffix': suffix,
            'full_symbol': symbol,
        }

    # Print stats
    print(f"\n{CYAN}API Data Summary:{NC}")
    print(f"  NSE equities (after dedup): {len(api_equities)}")
    for sfx in ['-EQ', '-SM', '-BE', '-ST']:
        print(f"    {sfx}: {suffix_counts.get(sfx, 0)}")
    print(f"  NSE indices: {len(api_indices)}")

    logger.info(f"Filtered API data: {len(api_equities)} equities, {len(api_indices)} indices")

    return api_equities, api_indices


# ---------------------------------------------------------------------------
# Load DB state
# ---------------------------------------------------------------------------

def load_db_tickers(conn):
    """Load all tickers from DB, split into equities and indices."""
    from psycopg2.extras import RealDictCursor

    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("""
            SELECT id, symbol, name, exchange, sector, industry, token, suffix, is_active, created_at
            FROM tickers ORDER BY id
        """)
        all_rows = cursor.fetchall()

    db_equities = []
    db_indices = []
    for row in all_rows:
        if row.get('suffix') == '-INDEX':
            db_indices.append(row)
        else:
            db_equities.append(row)

    print(f"\n{CYAN}Database State:{NC}")
    print(f"  Total tickers: {len(all_rows)}")
    print(f"  Equities: {len(db_equities)}")
    print(f"  Indices: {len(db_indices)}")

    logger.info(f"DB state: {len(all_rows)} total, {len(db_equities)} equities, {len(db_indices)} indices")

    return all_rows, db_equities, db_indices


# ---------------------------------------------------------------------------
# Matching phases
# ---------------------------------------------------------------------------

def run_matching(db_equities, db_indices, api_equities, api_indices, dry_run, auto_deactivate=False):
    """
    Run all 5 matching phases. Returns operation lists.
    """
    # Build lookup maps
    db_eq_by_symbol = {}
    db_eq_by_token = {}
    for row in db_equities:
        db_eq_by_symbol[row['symbol'].upper()] = row
        tok = str(row['token']).strip() if row.get('token') else None
        if tok:
            db_eq_by_token[tok] = row

    api_eq_by_token = {}
    for base_upper, rec in api_equities.items():
        api_eq_by_token[rec['token']] = rec

    api_idx_by_symbol_lower = {rec['symbol'].lower(): rec for rec in api_indices}

    # Track what's been matched
    matched_db_ids = set()
    matched_api_bases = set()

    # Operation queues
    updates = []
    renames = []
    index_updates = []
    new_tickers = []

    # -----------------------------------------------------------------------
    # Phase 1: Match DB equities by symbol
    # -----------------------------------------------------------------------
    print(f"\n{BLUE}Phase 1: Matching by symbol...{NC}")
    logger.info("Phase 1: Matching by symbol")

    for row in db_equities:
        db_symbol_upper = row['symbol'].upper()
        if db_symbol_upper in api_equities:
            api_rec = api_equities[db_symbol_upper]
            matched_db_ids.add(row['id'])
            matched_api_bases.add(db_symbol_upper)

            # Detect changes
            changes = {}
            db_token = str(row['token']).strip() if row.get('token') else ''
            if db_token != str(api_rec['token']):
                changes['token'] = api_rec['token']
            if row.get('suffix') != api_rec['suffix']:
                changes['suffix'] = api_rec['suffix']
            if row.get('name') != api_rec['name']:
                changes['name'] = api_rec['name']

            if changes:
                updates.append({
                    'db_id': row['id'],
                    'db_symbol': row['symbol'],
                    'changes': changes,
                })

    changed_count = len(updates)
    unchanged_count = len(matched_db_ids) - changed_count
    print(f"  Matched: {len(matched_db_ids)} ({changed_count} need updates, {unchanged_count} unchanged)")
    logger.info(f"Phase 1 done: {len(matched_db_ids)} matched, {changed_count} need updates")

    # -----------------------------------------------------------------------
    # Phase 2: Match remaining DB equities by token (rename detection)
    # -----------------------------------------------------------------------
    print(f"\n{BLUE}Phase 2: Detecting renames by token match...{NC}")
    logger.info("Phase 2: Detecting renames by token match")

    rename_conflicts = []
    for row in db_equities:
        if row['id'] in matched_db_ids:
            continue
        tok = str(row['token']).strip() if row.get('token') else None
        if not tok:
            continue
        if tok not in api_eq_by_token:
            continue

        api_rec = api_eq_by_token[tok]
        api_base_upper = api_rec['base_symbol'].upper()

        # Skip if this API entry already matched a different DB row
        if api_base_upper in matched_api_bases:
            continue

        # Check for UNIQUE conflict: does the new symbol already exist in DB?
        if api_base_upper in db_eq_by_symbol and db_eq_by_symbol[api_base_upper]['id'] != row['id']:
            conflict_row = db_eq_by_symbol[api_base_upper]
            rename_conflicts.append({
                'db_id': row['id'],
                'old_symbol': row['symbol'],
                'new_symbol': api_rec['base_symbol'],
                'conflict_id': conflict_row['id'],
            })
            print(f"  {RED}CONFLICT: {row['symbol']} -> {api_rec['base_symbol']} "
                  f"(already exists as id={conflict_row['id']}){NC}")
            logger.warning(f"Rename conflict: {row['symbol']} -> {api_rec['base_symbol']} (conflict id={conflict_row['id']})")
            continue

        matched_db_ids.add(row['id'])
        matched_api_bases.add(api_base_upper)

        renames.append({
            'db_id': row['id'],
            'old_symbol': row['symbol'],
            'new_symbol': api_rec['base_symbol'],
            'new_name': api_rec['name'],
            'new_suffix': api_rec['suffix'],
            'new_token': api_rec['token'],
        })

    if renames:
        print(f"  Renames detected: {len(renames)}")
        for r in renames:
            print(f"    {r['old_symbol']} -> {r['new_symbol']} (token: {r['new_token']})")
    else:
        print(f"  No renames detected")

    if rename_conflicts:
        print(f"  {YELLOW}Conflicts (will appear in Phase 5): {len(rename_conflicts)}{NC}")

    logger.info(f"Phase 2 done: {len(renames)} renames, {len(rename_conflicts)} conflicts")

    # -----------------------------------------------------------------------
    # Phase 3: Update index tokens
    # -----------------------------------------------------------------------
    print(f"\n{BLUE}Phase 3: Updating index tokens...{NC}")
    logger.info("Phase 3: Updating index tokens")

    for row in db_indices:
        db_symbol_lower = row['symbol'].lower()
        if db_symbol_lower in api_idx_by_symbol_lower:
            api_rec = api_idx_by_symbol_lower[db_symbol_lower]
            db_token = str(row['token']).strip() if row.get('token') else ''
            if db_token != str(api_rec['token']):
                index_updates.append({
                    'db_id': row['id'],
                    'db_symbol': row['symbol'],
                    'new_token': api_rec['token'],
                })

    if index_updates:
        print(f"  Index token updates: {len(index_updates)}")
        for iu in index_updates:
            print(f"    {iu['db_symbol']}: token -> {iu['new_token']}")
    else:
        print(f"  All index tokens up to date")

    logger.info(f"Phase 3 done: {len(index_updates)} index token updates")

    # -----------------------------------------------------------------------
    # Phase 4: New tickers
    # -----------------------------------------------------------------------
    print(f"\n{BLUE}Phase 4: Finding new tickers...{NC}")
    logger.info("Phase 4: Finding new tickers")

    for api_base_upper, api_rec in api_equities.items():
        if api_base_upper not in matched_api_bases:
            new_tickers.append({
                'symbol': api_rec['base_symbol'],
                'name': api_rec['name'],
                'token': api_rec['token'],
                'suffix': api_rec['suffix'],
            })

    print(f"  New tickers to add: {len(new_tickers)}")
    if new_tickers:
        for t in new_tickers[:20]:
            print(f"    + {t['symbol']} ({t['suffix']}) token={t['token']}")
        if len(new_tickers) > 20:
            print(f"    ... and {len(new_tickers) - 20} more")

    logger.info(f"Phase 4 done: {len(new_tickers)} new tickers")

    # -----------------------------------------------------------------------
    # Phase 5: Unmatched DB tickers
    # -----------------------------------------------------------------------
    print(f"\n{BLUE}Phase 5: Unmatched DB tickers...{NC}")
    logger.info("Phase 5: Unmatched DB tickers")

    unmatched_db = [row for row in db_equities if row['id'] not in matched_db_ids]
    deactivations = []
    manual_renames = []
    skipped = []

    # Build lookup of Phase 4 new tickers for merge detection
    new_ticker_by_symbol = {t['symbol'].upper(): t for t in new_tickers}
    # Track all symbols that will be taken after Phases 1-4
    taken_symbols = set(db_eq_by_symbol.keys())
    for r in renames:
        taken_symbols.discard(r['old_symbol'].upper())
        taken_symbols.add(r['new_symbol'].upper())
    for t in new_tickers:
        taken_symbols.add(t['symbol'].upper())
    manual_rename_targets = set()

    if not unmatched_db:
        print(f"  {GREEN}All DB tickers matched!{NC}")
    elif dry_run:
        print(f"  {YELLOW}[DRY RUN] {len(unmatched_db)} unmatched tickers (skipping interactive prompts):{NC}")
        for row in unmatched_db:
            tok = row.get('token') or 'NULL'
            print(f"    ? {row['symbol']} (id={row['id']}, token={tok}, suffix={row.get('suffix')})")
        skipped = list(unmatched_db)
    elif auto_deactivate:
        print(f"  {YELLOW}[AUTO-DEACTIVATE] Deactivating {len(unmatched_db)} unmatched tickers:{NC}")
        for row in unmatched_db:
            deactivations.append({'db_id': row['id'], 'symbol': row['symbol']})
            tok = row.get('token') or 'NULL'
            print(f"    x {row['symbol']} (id={row['id']}, token={tok})")
        logger.info(f"Auto-deactivated {len(deactivations)} unmatched tickers")
    else:
        print(f"  {YELLOW}{len(unmatched_db)} DB tickers not found in API. Handle each:{NC}")
        print(f"  {YELLOW}  (d) Deactivate  (r) Rename  (s) Skip  (da) Deactivate all remaining{NC}\n")

        deactivate_all = False
        for row in unmatched_db:
            tok = row.get('token') or 'NULL'
            sfx = row.get('suffix') or 'NULL'

            if deactivate_all:
                deactivations.append({'db_id': row['id'], 'symbol': row['symbol']})
                print(f"    {row['symbol']} (id={row['id']}, token={tok}, suffix={sfx}) -> auto-deactivated")
                continue

            print(f"  {YELLOW}{row['symbol']}{NC} (id={row['id']}, token={tok}, suffix={sfx})")

            while True:
                choice = input(f"    [d/r/s/da]: ").strip().lower()

                if choice == 'd':
                    deactivations.append({'db_id': row['id'], 'symbol': row['symbol']})
                    break
                elif choice == 'da':
                    deactivations.append({'db_id': row['id'], 'symbol': row['symbol']})
                    deactivate_all = True
                    print(f"    {YELLOW}Will deactivate all remaining unmatched tickers{NC}")
                    break
                elif choice == 'r':
                    new_sym = input(f"    New symbol: ").strip()
                    if not new_sym:
                        print(f"    {RED}Empty symbol, try again{NC}")
                        continue
                    if len(new_sym) > 20:
                        print(f"    {RED}Symbol too long (max 20 chars){NC}")
                        continue
                    new_sym_upper = new_sym.upper()

                    # Same symbol = no change needed
                    if new_sym_upper == row['symbol'].upper():
                        print(f"    {YELLOW}Same symbol, skipping{NC}")
                        skipped.append(row)
                        break

                    # Already claimed by another manual rename this session
                    if new_sym_upper in manual_rename_targets:
                        print(f"    {RED}{new_sym} already used by another rename{NC}")
                        continue

                    # Target is a Phase 4 new ticker — merge: remove from inserts,
                    # update existing DB row with new ticker's full data instead
                    if new_sym_upper in new_ticker_by_symbol:
                        merge_ticker = new_ticker_by_symbol.pop(new_sym_upper)
                        new_tickers.remove(merge_ticker)
                        manual_renames.append({
                            'db_id': row['id'],
                            'old_symbol': row['symbol'],
                            'new_symbol': new_sym,
                            'new_name': merge_ticker['name'],
                            'new_token': merge_ticker['token'],
                            'new_suffix': merge_ticker['suffix'],
                        })
                        manual_rename_targets.add(new_sym_upper)
                        print(f"    {GREEN}Merged with new ticker (token={merge_ticker['token']}, suffix={merge_ticker['suffix']}){NC}")
                        break

                    # Check against all taken symbols (DB + Phase 2 renames + Phase 4 inserts)
                    if new_sym_upper in taken_symbols:
                        print(f"    {RED}{new_sym} already exists (in DB or queued operations){NC}")
                        continue

                    manual_renames.append({
                        'db_id': row['id'],
                        'old_symbol': row['symbol'],
                        'new_symbol': new_sym,
                    })
                    manual_rename_targets.add(new_sym_upper)
                    break
                elif choice == 's':
                    skipped.append(row)
                    break
                else:
                    print(f"    Invalid. Enter d, r, s, or da.")

    logger.info(f"Phase 5 done: {len(deactivations)} deactivations, {len(manual_renames)} manual renames, {len(skipped)} skipped")

    return {
        'updates': updates,
        'renames': renames,
        'index_updates': index_updates,
        'new_tickers': new_tickers,
        'deactivations': deactivations,
        'manual_renames': manual_renames,
        'skipped': skipped,
    }


# ---------------------------------------------------------------------------
# Dependent table sync (runs inside transaction)
# ---------------------------------------------------------------------------

def _sync_dependent_tables_in_txn(cursor):
    """Sync symbol columns in ltp_live, market_movers_live, stock_analysis.
    Must be called with an active cursor inside a transaction (before commit)."""
    print(f"\n{CYAN}Syncing dependent tables (in transaction)...{NC}")
    logger.info("Syncing dependent tables within transaction")

    # Raise statement_timeout for bulk UPDATEs (61K+ rows in ltp_live)
    cursor.execute("SET LOCAL statement_timeout = '600000'")  # 10 min
    # Set lock_timeout to avoid hanging if live feed holds locks
    cursor.execute("SET LOCAL lock_timeout = '60s'")

    # Sync ltp_live.symbol
    cursor.execute("""
        UPDATE ltp_live l SET symbol = t.symbol
        FROM tickers t
        WHERE l.ticker_id = t.id AND l.symbol != t.symbol
    """)
    ltp_count = cursor.rowcount
    print(f"  ltp_live:          {ltp_count} rows synced")

    # Sync market_movers_live.symbol
    cursor.execute("""
        UPDATE market_movers_live m SET symbol = t.symbol
        FROM tickers t
        WHERE m.ticker_id = t.id AND m.symbol != t.symbol
    """)
    movers_count = cursor.rowcount
    print(f"  market_movers_live: {movers_count} rows synced")

    # Sync stock_analysis.ticker_symbol
    cursor.execute("""
        UPDATE stock_analysis sa SET ticker_symbol = t.symbol
        FROM tickers t
        WHERE sa.ticker_id = t.id AND sa.ticker_symbol != t.symbol
    """)
    analysis_count = cursor.rowcount
    print(f"  stock_analysis:    {analysis_count} rows synced")

    total = ltp_count + movers_count + analysis_count
    if total > 0:
        print(f"  {GREEN}Synced {total} total rows across dependent tables{NC}")
        logger.info(f"Dependent tables synced: {total} rows (ltp={ltp_count}, movers={movers_count}, analysis={analysis_count})")
    else:
        print(f"  {GREEN}All dependent tables already in sync{NC}")
        logger.info("Dependent tables already in sync")

    return {'ltp_live': ltp_count, 'market_movers_live': movers_count, 'stock_analysis': analysis_count}


def _flush_redis_caches(ops):
    """Flush Redis caches for renamed symbols. Best-effort, runs after commit."""
    all_renames = ops.get('renames', []) + ops.get('manual_renames', [])
    renamed_old_symbols = [r['old_symbol'] for r in all_renames]

    if not renamed_old_symbols:
        return

    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
        from redis_client import delete_pattern
        flushed = 0
        for old_symbol in renamed_old_symbols:
            old_upper = old_symbol.upper()
            for pattern in [f"sentiment:{old_upper}", f"indicators:{old_upper}:*",
                            f"fundamentals:{old_upper}", f"ohlc:{old_upper}:*",
                            f"reverse_dcf:{old_upper}:*", f"shareholding:{old_upper}:*",
                            f"ind:{old_upper}:*"]:
                count = delete_pattern(pattern)
                flushed += count
        if flushed > 0:
            print(f"  {GREEN}Flushed {flushed} Redis cache keys for renamed symbols{NC}")
            logger.info(f"Flushed {flushed} Redis cache keys")
        else:
            print(f"  No Redis cache keys found for renamed symbols")
    except ImportError:
        print(f"  {YELLOW}Redis client not available, skipping cache flush{NC}")
        logger.warning("Redis client not available for cache flush")
    except Exception as e:
        print(f"  {YELLOW}Redis flush skipped: {e}{NC}")
        logger.warning(f"Redis flush error: {e}")


def sync_dependent_tables_standalone(conn, dry_run):
    """Standalone dependent table sync for --sync-only mode."""
    print(f"\n{CYAN}Syncing dependent tables (standalone)...{NC}")
    logger.info("Standalone dependent table sync")

    if dry_run:
        print(f"  {YELLOW}[DRY RUN] Would sync ltp_live, market_movers_live, stock_analysis{NC}")
        return

    cursor = conn.cursor()
    try:
        _sync_dependent_tables_in_txn(cursor)
        conn.commit()
        logger.info("Standalone sync committed")
    except Exception as e:
        conn.rollback()
        print(f"  {RED}WARNING: Failed to sync dependent tables: {e}{NC}")
        logger.error(f"Standalone sync failed: {e}")
    finally:
        cursor.close()


# ---------------------------------------------------------------------------
# Execute changes
# ---------------------------------------------------------------------------

def execute_changes(conn, ops, dry_run, auto_confirm=False):
    """Execute all queued operations in a single transaction.
    Returns True on success, False on failure."""
    import psycopg2
    from psycopg2.extras import execute_batch

    updates = ops['updates']
    renames = ops['renames']
    index_updates = ops['index_updates']
    new_tickers = ops['new_tickers']
    deactivations = ops['deactivations']
    manual_renames = ops['manual_renames']
    skipped = ops['skipped']

    total_changes = (len(updates) + len(renames) + len(index_updates) +
                     len(new_tickers) + len(deactivations) + len(manual_renames))

    # Summary
    print(f"\n{'='*60}")
    print(f"  SUMMARY OF CHANGES")
    print(f"{'='*60}")
    print(f"  Field updates (token/suffix/name):  {len(updates)}")
    print(f"  Renames (token-matched):             {len(renames)}")
    print(f"  Manual renames:                      {len(manual_renames)}")
    print(f"  Index token updates:                 {len(index_updates)}")
    print(f"  New tickers to insert:               {len(new_tickers)}")
    print(f"  Deactivations:                       {len(deactivations)}")
    print(f"  Skipped (no change):                 {len(skipped)}")
    print(f"  {'─'*40}")
    print(f"  Total DB operations:                 {total_changes}")

    logger.info(f"Summary: updates={len(updates)}, renames={len(renames)}, manual_renames={len(manual_renames)}, "
                f"index_updates={len(index_updates)}, new={len(new_tickers)}, deactivations={len(deactivations)}, skipped={len(skipped)}")

    if dry_run:
        print(f"\n  {YELLOW}[DRY RUN] No changes committed.{NC}")
        # Still show what dependent table sync would do
        print(f"\n{CYAN}[DRY RUN] Dependent table sync:{NC}")
        print(f"  {YELLOW}Would sync ltp_live, market_movers_live, stock_analysis{NC}")
        all_renames = renames + manual_renames
        if all_renames:
            renamed_symbols = [r['old_symbol'] for r in all_renames]
            print(f"  {YELLOW}Would flush Redis caches for: {', '.join(renamed_symbols[:10])}{'...' if len(renamed_symbols) > 10 else ''}{NC}")
        return True

    if total_changes == 0:
        print(f"\n  {GREEN}No changes needed. Database is up to date.{NC}")
        print(f"  (Use --sync-only if dependent tables need fixing)")
        logger.info("No changes needed, skipping dependent sync")
        return True

    if not auto_confirm:
        response = input(f"\n  Proceed with these changes? (yes/no): ").strip().lower()
        if response != 'yes':
            print("  Cancelled.")
            logger.info("User cancelled execution")
            return False

    logger.info("Executing changes...")
    cursor = conn.cursor()
    try:
        # Phase 1: Field updates (batched by change-set columns)
        if updates:
            # Group updates by which columns changed for efficient batching
            groups = {}
            for op in updates:
                cols = tuple(sorted(op['changes'].keys()))
                groups.setdefault(cols, []).append(op)

            for cols, group_ops in groups.items():
                set_clause = ', '.join(f"{col} = %s" for col in cols)
                sql = f"UPDATE tickers SET {set_clause} WHERE id = %s"
                params = [
                    tuple(op['changes'][col] for col in cols) + (op['db_id'],)
                    for op in group_ops
                ]
                execute_batch(cursor, sql, params, page_size=500)
            print(f"  {GREEN}Updated {len(updates)} tickers{NC}")
            logger.info(f"Phase 1: Updated {len(updates)} tickers")

        # Phase 2: Token-matched renames (batched)
        if renames:
            execute_batch(
                cursor,
                "UPDATE tickers SET symbol = %s, name = %s, suffix = %s, token = %s WHERE id = %s",
                [(r['new_symbol'], r['new_name'], r['new_suffix'], r['new_token'], r['db_id']) for r in renames],
                page_size=500
            )
            print(f"  {GREEN}Renamed {len(renames)} tickers{NC}")
            logger.info(f"Phase 2: Renamed {len(renames)} tickers: {[f'{r['old_symbol']}->{r['new_symbol']}' for r in renames]}")

        # Phase 3: Index token updates
        if index_updates:
            execute_batch(
                cursor,
                "UPDATE tickers SET token = %s WHERE id = %s",
                [(iu['new_token'], iu['db_id']) for iu in index_updates],
                page_size=500
            )
            print(f"  {GREEN}Updated {len(index_updates)} index tokens{NC}")
            logger.info(f"Phase 3: Updated {len(index_updates)} index tokens")

        # Phase 4: New tickers
        if new_tickers:
            insert_data = [
                (t['symbol'], t['name'], 'NSE', None, None, t['token'], t['suffix'], True, datetime.now())
                for t in new_tickers
            ]
            execute_batch(
                cursor,
                """INSERT INTO tickers (symbol, name, exchange, sector, industry, token, suffix, is_active, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                insert_data,
                page_size=500
            )
            print(f"  {GREEN}Inserted {len(new_tickers)} new tickers{NC}")
            logger.info(f"Phase 4: Inserted {len(new_tickers)} new tickers")

        # Phase 5: Deactivations (batched)
        if deactivations:
            execute_batch(
                cursor,
                "UPDATE tickers SET is_active = false WHERE id = %s",
                [(d['db_id'],) for d in deactivations],
                page_size=500
            )
            print(f"  {GREEN}Deactivated {len(deactivations)} tickers{NC}")
            logger.info(f"Phase 5: Deactivated {len(deactivations)} tickers: {[d['symbol'] for d in deactivations]}")

        # Phase 5b: Manual renames (may include merged new-ticker data)
        if manual_renames:
            for mr in manual_renames:
                if 'new_token' in mr:
                    cursor.execute(
                        "UPDATE tickers SET symbol = %s, name = %s, token = %s, suffix = %s WHERE id = %s",
                        (mr['new_symbol'], mr['new_name'], mr['new_token'], mr['new_suffix'], mr['db_id'])
                    )
                else:
                    cursor.execute(
                        "UPDATE tickers SET symbol = %s WHERE id = %s",
                        (mr['new_symbol'], mr['db_id'])
                    )
            print(f"  {GREEN}Manually renamed {len(manual_renames)} tickers{NC}")
            logger.info(f"Manual renames: {len(manual_renames)}")

        # Sync dependent tables INSIDE the same transaction
        _sync_dependent_tables_in_txn(cursor)

        conn.commit()
        print(f"\n  {GREEN}All changes committed successfully!{NC}")
        logger.info("Transaction committed successfully")

        # Flush Redis caches AFTER commit (best-effort)
        _flush_redis_caches(ops)

        return True

    except psycopg2.OperationalError as e:
        conn.rollback()
        print(f"\n  {RED}ERROR (connection/timeout): {e}{NC}")
        print(f"  All changes rolled back.")
        logger.error(f"OperationalError during execute: {e}")
        return False

    except psycopg2.IntegrityError as e:
        conn.rollback()
        print(f"\n  {RED}ERROR (constraint violation): {e}{NC}")
        print(f"  All changes rolled back.")
        logger.error(f"IntegrityError during execute: {e}")
        return False

    except psycopg2.Error as e:
        conn.rollback()
        print(f"\n  {RED}ERROR (database): {e}{NC}")
        print(f"  All changes rolled back.")
        logger.error(f"Database error during execute: {e}")
        return False

    except Exception as e:
        conn.rollback()
        print(f"\n  {RED}ERROR (unexpected): {e}{NC}")
        print(f"  All changes rolled back.")
        logger.error(f"Unexpected error during execute: {e}", exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify_results(conn):
    """Print post-update statistics and check for dependent table mismatches."""
    from psycopg2.extras import RealDictCursor

    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT COUNT(*) as total FROM tickers")
        total = cursor.fetchone()['total']

        cursor.execute("SELECT COUNT(*) as active FROM tickers WHERE is_active = true")
        active = cursor.fetchone()['active']

        cursor.execute("SELECT COUNT(*) as inactive FROM tickers WHERE is_active = false")
        inactive = cursor.fetchone()['inactive']

        cursor.execute("SELECT COUNT(*) as no_token FROM tickers WHERE token IS NULL")
        no_token = cursor.fetchone()['no_token']

        cursor.execute("""
            SELECT suffix, COUNT(*) as cnt
            FROM tickers GROUP BY suffix ORDER BY cnt DESC
        """)
        suffix_stats = cursor.fetchall()

    print(f"\n{'='*60}")
    print(f"  POST-UPDATE VERIFICATION")
    print(f"{'='*60}")
    print(f"  Total tickers:    {total}")
    print(f"  Active:           {active}")
    print(f"  Inactive:         {inactive}")
    print(f"  Without token:    {no_token}")
    print(f"\n  Suffix distribution:")
    for row in suffix_stats:
        sfx = row['suffix'] or 'NULL'
        print(f"    {sfx:<10}: {row['cnt']}")

    # Dependent table mismatch checks (best-effort, longer timeout for JOINs)
    ltp_mismatch = movers_mismatch = analysis_mismatch = None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # These JOINs on ltp_live (30K+ rows) can be slow — raise timeout
            cursor.execute("SET LOCAL statement_timeout = '300000'")  # 5 min

            cursor.execute("""
                SELECT COUNT(*) as cnt FROM ltp_live l
                JOIN tickers t ON l.ticker_id = t.id
                WHERE l.symbol != t.symbol
            """)
            ltp_mismatch = cursor.fetchone()['cnt']

            cursor.execute("""
                SELECT COUNT(*) as cnt FROM market_movers_live m
                JOIN tickers t ON m.ticker_id = t.id
                WHERE m.symbol != t.symbol
            """)
            movers_mismatch = cursor.fetchone()['cnt']

            cursor.execute("""
                SELECT COUNT(*) as cnt FROM stock_analysis sa
                JOIN tickers t ON sa.ticker_id = t.id
                WHERE sa.ticker_symbol != t.symbol
            """)
            analysis_mismatch = cursor.fetchone()['cnt']
    except Exception as e:
        conn.rollback()  # clear the aborted transaction state
        print(f"\n  {YELLOW}Dependent table mismatch check skipped (query too slow or timed out){NC}")
        logger.warning(f"Dependent table mismatch check failed: {e}")

    # Dependent table mismatch report
    if ltp_mismatch is not None:
        total_mismatch = ltp_mismatch + movers_mismatch + analysis_mismatch
        if total_mismatch > 0:
            print(f"\n  {YELLOW}Dependent table mismatches:{NC}")
            if ltp_mismatch:
                print(f"    ltp_live:          {ltp_mismatch} stale symbols")
            if movers_mismatch:
                print(f"    market_movers_live: {movers_mismatch} stale symbols")
            if analysis_mismatch:
                print(f"    stock_analysis:    {analysis_mismatch} stale symbols")
            print(f"  {YELLOW}Run with --sync-only to fix these mismatches{NC}")
            logger.warning(f"Dependent table mismatches: ltp={ltp_mismatch}, movers={movers_mismatch}, analysis={analysis_mismatch}")
        else:
            print(f"\n  {GREEN}Dependent tables: all in sync{NC}")
        logger.info(f"Verification: total={total}, active={active}, inactive={inactive}, "
                    f"no_token={no_token}, mismatches={total_mismatch}")
    else:
        logger.info(f"Verification: total={total}, active={active}, inactive={inactive}, no_token={no_token}")

    print(f"{'='*60}")


# ---------------------------------------------------------------------------
# Run summary
# ---------------------------------------------------------------------------

def save_run_summary(ops, success):
    """Save run summary JSON to logs directory."""
    summary = {
        'timestamp': datetime.now().isoformat(),
        'success': success,
        'counts': {
            'field_updates': len(ops.get('updates', [])),
            'renames': len(ops.get('renames', [])),
            'manual_renames': len(ops.get('manual_renames', [])),
            'index_updates': len(ops.get('index_updates', [])),
            'new_tickers': len(ops.get('new_tickers', [])),
            'deactivations': len(ops.get('deactivations', [])),
            'skipped': len(ops.get('skipped', [])),
        },
        'details': {
            'renamed': [
                {'old': r['old_symbol'], 'new': r['new_symbol']}
                for r in ops.get('renames', [])
            ],
            'manual_renamed': [
                {'old': r['old_symbol'], 'new': r['new_symbol']}
                for r in ops.get('manual_renames', [])
            ],
            'new_symbols': [t['symbol'] for t in ops.get('new_tickers', [])],
            'deactivated_symbols': [d['symbol'] for d in ops.get('deactivations', [])],
        },
    }

    summary_file = os.path.join(LOG_DIR, f'run_summary_{_log_timestamp}.json')
    try:
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"\n[LOG] Run summary saved to: {summary_file}")
        logger.info(f"Run summary saved to {summary_file}")
    except Exception as e:
        logger.warning(f"Failed to save run summary: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Update tickers table from Angel Broking ScripMaster API'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview changes without committing to database')
    parser.add_argument('--sync-only', action='store_true',
                        help='Only sync dependent tables (ltp_live, market_movers_live, stock_analysis)')
    parser.add_argument('--auto-deactivate', action='store_true',
                        help='Auto-deactivate all unmatched tickers (no interactive prompts)')
    parser.add_argument('--yes', '-y', action='store_true',
                        help='Skip confirmation prompt (for scripted/unattended runs)')
    args = parser.parse_args()

    logger.info(f"Args: dry_run={args.dry_run}, sync_only={args.sync_only}, "
                f"auto_deactivate={args.auto_deactivate}, yes={args.yes}")

    print(f"\n{YELLOW}{'='*60}{NC}")
    print(f"{YELLOW}  Tickers Table Update Script{NC}")
    if args.dry_run:
        print(f"{YELLOW}  MODE: DRY RUN (no changes will be made){NC}")
    if args.sync_only:
        print(f"{YELLOW}  MODE: SYNC ONLY (fix stale symbols in dependent tables){NC}")
    if args.auto_deactivate:
        print(f"{YELLOW}  MODE: AUTO-DEACTIVATE unmatched tickers{NC}")
    if args.yes:
        print(f"{YELLOW}  MODE: AUTO-CONFIRM (skip prompts){NC}")
    print(f"{YELLOW}{'='*60}{NC}")

    # Acquire lock
    if not _acquire_lock():
        print(f"\n{RED}ERROR: Another instance is already running (lock file: {LOCK_FILE}){NC}")
        logger.error("Lock file exists, another instance running")
        return 1

    # --sync-only: skip API fetch, just fix dependent tables
    if args.sync_only:
        conn = connect_to_database()
        if not conn:
            return 1
        try:
            sync_dependent_tables_standalone(conn, args.dry_run)
            verify_results(conn)
        finally:
            conn.close()
        return 0

    # Step 1: Fetch API data
    records = fetch_scrip_master()
    if not records:
        return 1

    # Step 2: Filter to NSE equities + indices
    api_equities, api_indices = filter_nse_records(records)

    # Step 2.5: Sanity check — abort if API returned suspiciously few equities
    if len(api_equities) < MIN_API_EQUITIES:
        print(f"\n{RED}ERROR: API returned only {len(api_equities)} equities (expected >= {MIN_API_EQUITIES}).{NC}")
        print(f"{RED}This likely indicates a partial/corrupted API response. Aborting to prevent mass deactivation.{NC}")
        logger.error(f"API sanity check failed: {len(api_equities)} equities < {MIN_API_EQUITIES} threshold")
        return 1

    # Step 3: Connect to database
    conn = connect_to_database()
    if not conn:
        return 1

    ops = {}
    success = False
    try:
        # Step 4: Load DB state
        all_rows, db_equities, db_indices = load_db_tickers(conn)

        # Step 5: Run matching phases
        ops = run_matching(db_equities, db_indices, api_equities, api_indices,
                           args.dry_run, auto_deactivate=args.auto_deactivate)

        # Step 6: Execute changes (includes dependent table sync in same transaction)
        success = execute_changes(conn, ops, args.dry_run, auto_confirm=args.yes)

        # Step 7: Verify (skip on failure)
        if success:
            verify_results(conn)
        else:
            print(f"\n{RED}Skipping verification due to execution failure.{NC}")

    finally:
        conn.close()

    # Step 8: Save run summary
    save_run_summary(ops, success)

    logger.info(f"Script finished, success={success}")
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
