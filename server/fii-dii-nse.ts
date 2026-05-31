import { Pool } from 'pg';
import { getRedis } from './lib/redis';

export interface FiiDiiRow {
  date: string;
  fiiNetBuySell: number;
  diiNetBuySell: number;
  fiiGrossBuy: number;
  fiiGrossSell: number;
  diiGrossBuy: number;
  diiGrossSell: number;
}

const NSE_HOME_URL = 'https://www.nseindia.com';
const NSE_FII_DII_URL = 'https://www.nseindia.com/api/fiidiiTradeReact';
const NSE_FII_DII_HISTORICAL_URL = NSE_FII_DII_URL;
const CACHE_KEY = 'fii_dii:nse_cash:1D';
const CACHE_TTL_SECONDS = 60 * 60;
const NSE_REQUEST_TIMEOUT_MS = 20_000;
const REDIS_COMMAND_TIMEOUT_MS = 2_000;
const BACKFILL_MIN_SESSIONS = 30;
const BACKFILL_LOOKBACK_DAYS = 90;
const IST_TIME_ZONE = 'Asia/Kolkata';
const SOURCE = 'NSE_PROVISIONAL';

const NSE_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive',
  Referer: 'https://www.nseindia.com/reports/fii-dii',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

let equityPool: Pool | null = null;
let tableReady = false;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getEquityPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!equityPool) {
    equityPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    equityPool.on('error', (error) => {
      console.error('[FII_DII] Equity DB pool error:', error.message);
    });
  }
  return equityPool;
}

function cookieHeader(response: Response): string {
  const getSetCookie = (response.headers as any).getSetCookie;
  const cookies: string[] =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(response.headers)
      : response.headers.get('set-cookie')?.split(/,(?=[^;,]+=)/) ?? [];

  return cookies
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'number') {
    return formatIstDate(new Date(value));
  }

  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Missing NSE FII/DII date');

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const ddMmmYyyy = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddMmmYyyy) {
    const [, day, monthText, year] = ddMmmYyyy;
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      monthText.toLowerCase(),
    ) + 1;
    if (month > 0) return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatIstDate(parsed);

  throw new Error(`Invalid NSE FII/DII date: ${raw}`);
}

function formatIstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Failed to format IST date');
  return `${year}-${month}-${day}`;
}

function formatNseParamDate(date: Date): string {
  const [year, month, day] = formatIstDate(date).split('-');
  return `${day}-${month}-${year}`;
}

function extractRows(payload: any): any[] {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function participantOf(item: any): 'FII' | 'DII' | null {
  const text = String(
    item.category ?? item.participant ?? item.investorType ?? item.investor_type ?? item.name ?? item.type ?? '',
  ).toUpperCase();

  if (text.includes('FII') || text.includes('FPI')) return 'FII';
  if (text.includes('DII')) return 'DII';
  return null;
}

function field(item: any, candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (item[candidate] != null) return item[candidate];
  }

  const lowerMap = new Map(Object.keys(item).map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), key]));
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = lowerMap.get(normalized);
    if (key && item[key] != null) return item[key];
  }

  return undefined;
}

function netValue(item: any): number | null {
  const raw = field(item, ['netValue', 'net_value', 'netAmount', 'net_amount', 'netBuySell']);
  if (raw == null || raw === '') return null;
  return Number(toNumber(raw).toFixed(4));
}

function applyParticipant(row: FiiDiiRow, participant: 'FII' | 'DII', item: any): void {
  const buy = toNumber(field(item, ['buyValue', 'buy_value', 'buyAmount', 'buy_amount', 'buyVal', 'grossBuy']));
  const sell = toNumber(field(item, ['sellValue', 'sell_value', 'sellAmount', 'sell_amount', 'sellVal', 'grossSell']));
  const net = netValue(item) ?? Number((buy - sell).toFixed(4));

  if (participant === 'FII') {
    row.fiiGrossBuy = buy;
    row.fiiGrossSell = sell;
    row.fiiNetBuySell = net;
  } else {
    row.diiGrossBuy = buy;
    row.diiGrossSell = sell;
    row.diiNetBuySell = net;
  }
}

function normalizeNseData(rows: any[]): FiiDiiRow[] {
  const byDate = new Map<string, FiiDiiRow>();

  const getOrCreate = (date: string): FiiDiiRow => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const row: FiiDiiRow = {
      date,
      fiiNetBuySell: 0,
      diiNetBuySell: 0,
      fiiGrossBuy: 0,
      fiiGrossSell: 0,
      diiGrossBuy: 0,
      diiGrossSell: 0,
    };
    byDate.set(date, row);
    return row;
  };

  for (const item of rows) {
    const participant = participantOf(item);
    if (!participant) continue;
    const date = normalizeDate(
      field(item, ['date', 'tradeDate', 'trade_date', 'tradeDt', 'time_stamp', 'timestamp']),
    );
    applyParticipant(getOrCreate(date), participant, item);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function nseSessionCookie(): Promise<string> {
  const homeResponse = await fetch(NSE_HOME_URL, {
    headers: NSE_HEADERS,
    signal: AbortSignal.timeout(NSE_REQUEST_TIMEOUT_MS),
  });
  if (!homeResponse.ok) {
    throw new Error(`NSE session request failed (${homeResponse.status})`);
  }

  const cookie = cookieHeader(homeResponse);
  if (!cookie) {
    throw new Error('NSE session did not return a cookie');
  }
  return cookie;
}

async function fetchNseJson(url: URL): Promise<any> {
  const cookie = await nseSessionCookie();
  const dataResponse = await fetch(url, {
    headers: {
      ...NSE_HEADERS,
      Cookie: cookie,
    },
    signal: AbortSignal.timeout(NSE_REQUEST_TIMEOUT_MS),
  });

  if (!dataResponse.ok) {
    const text = await dataResponse.text().catch(() => dataResponse.statusText);
    throw new Error(`NSE FII/DII request failed (${dataResponse.status}): ${text.slice(0, 300)}`);
  }

  return await dataResponse.json();
}

async function fetchNseRows(): Promise<any[]> {
  return extractRows(await fetchNseJson(new URL(NSE_FII_DII_URL)));
}

async function fetchHistoricalNseRows(): Promise<any[]> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - BACKFILL_LOOKBACK_DAYS);

  const url = new URL(NSE_FII_DII_HISTORICAL_URL);
  url.searchParams.set('from', formatNseParamDate(start));
  url.searchParams.set('to', formatNseParamDate(end));
  return extractRows(await fetchNseJson(url));
}

async function getCachedRows(): Promise<FiiDiiRow[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await withTimeout(redis.get(CACHE_KEY), REDIS_COMMAND_TIMEOUT_MS, 'FII/DII Redis GET');
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error: any) {
    console.warn(`[FII_DII] Failed to read cache: ${error.message}`);
    return null;
  }
}

async function setCachedRows(rows: FiiDiiRow[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await withTimeout(
      redis.set(CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS),
      REDIS_COMMAND_TIMEOUT_MS,
      'FII/DII Redis SET',
    );
  } catch (error: any) {
    console.warn(`[FII_DII] Failed to write cache: ${error.message}`);
  }
}

async function ensureFiiDiiTable(): Promise<void> {
  if (tableReady) return;
  const pool = getEquityPool();
  if (!pool) return;

  await pool.query(`
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
      source         VARCHAR(20)      NOT NULL DEFAULT '${SOURCE}',
      ingested_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      PRIMARY KEY (trade_date, segment, participant)
    );

    CREATE INDEX IF NOT EXISTS idx_ffd_fii
      ON fii_dii_flows(trade_date DESC, segment) WHERE participant = 'FII';
    CREATE INDEX IF NOT EXISTS idx_ffd_cash
      ON fii_dii_flows(trade_date DESC, participant) WHERE segment = 'CASH';
  `);
  tableReady = true;
}

async function persistRows(rows: FiiDiiRow[]): Promise<void> {
  const pool = getEquityPool();
  if (!pool || rows.length === 0) return;

  try {
    await ensureFiiDiiTable();
    const values: any[] = [];
    const placeholders: string[] = [];
    let index = 1;

    for (const row of rows) {
      placeholders.push(`($${index++}, 'CASH', 'FII', $${index++}, $${index++}, '${SOURCE}')`);
      values.push(row.date, row.fiiGrossBuy, row.fiiGrossSell);
      placeholders.push(`($${index++}, 'CASH', 'DII', $${index++}, $${index++}, '${SOURCE}')`);
      values.push(row.date, row.diiGrossBuy, row.diiGrossSell);
    }

    await pool.query(
      `
        INSERT INTO fii_dii_flows (
          trade_date,
          segment,
          participant,
          buy_value_cr,
          sell_value_cr,
          source
        )
        VALUES ${placeholders.join(',')}
        ON CONFLICT (trade_date, segment, participant)
        DO UPDATE SET
          buy_value_cr = EXCLUDED.buy_value_cr,
          sell_value_cr = EXCLUDED.sell_value_cr,
          source = EXCLUDED.source,
          ingested_at = NOW()
      `,
      values,
    );
  } catch (error: any) {
    console.error(`[FII_DII] Failed to persist rows: ${error.message}`);
  }
}

async function persistedSessionCount(): Promise<number> {
  const pool = getEquityPool();
  if (!pool) return 0;

  try {
    await ensureFiiDiiTable();
    const result = await pool.query(
      `SELECT COUNT(DISTINCT trade_date)::int AS count FROM fii_dii_flows WHERE segment = 'CASH'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error: any) {
    console.error(`[FII_DII] Failed to count persisted rows: ${error.message}`);
    return 0;
  }
}

async function readPersistedRows(limit = BACKFILL_MIN_SESSIONS): Promise<FiiDiiRow[]> {
  const pool = getEquityPool();
  if (!pool) return [];

  try {
    await ensureFiiDiiTable();
    const result = await pool.query(
      `
        WITH latest_dates AS (
          SELECT trade_date
          FROM fii_dii_flows
          WHERE segment = 'CASH'
          GROUP BY trade_date
          ORDER BY trade_date DESC
          LIMIT $1
        )
        SELECT
          f.trade_date::text AS date,
          MAX(CASE WHEN f.participant = 'FII' THEN f.buy_value_cr END) AS fii_gross_buy,
          MAX(CASE WHEN f.participant = 'FII' THEN f.sell_value_cr END) AS fii_gross_sell,
          MAX(CASE WHEN f.participant = 'FII' THEN f.net_value_cr END) AS fii_net_buy_sell,
          MAX(CASE WHEN f.participant = 'DII' THEN f.buy_value_cr END) AS dii_gross_buy,
          MAX(CASE WHEN f.participant = 'DII' THEN f.sell_value_cr END) AS dii_gross_sell,
          MAX(CASE WHEN f.participant = 'DII' THEN f.net_value_cr END) AS dii_net_buy_sell
        FROM fii_dii_flows f
        JOIN latest_dates d ON d.trade_date = f.trade_date
        WHERE f.segment = 'CASH'
        GROUP BY f.trade_date
        ORDER BY f.trade_date ASC
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      date: row.date,
      fiiNetBuySell: toNumber(row.fii_net_buy_sell),
      diiNetBuySell: toNumber(row.dii_net_buy_sell),
      fiiGrossBuy: toNumber(row.fii_gross_buy),
      fiiGrossSell: toNumber(row.fii_gross_sell),
      diiGrossBuy: toNumber(row.dii_gross_buy),
      diiGrossSell: toNumber(row.dii_gross_sell),
    }));
  } catch (error: any) {
    console.error(`[FII_DII] Failed to read persisted rows: ${error.message}`);
    return [];
  }
}

export async function backfillFiiDiiHistoryIfNeeded(): Promise<FiiDiiRow[]> {
  const existing = await persistedSessionCount();
  if (existing >= BACKFILL_MIN_SESSIONS) {
    return readPersistedRows(BACKFILL_MIN_SESSIONS);
  }

  const rows = normalizeNseData(await fetchHistoricalNseRows());
  if (rows.length === 0) {
    throw new Error('NSE historical FII/DII endpoint returned no rows');
  }

  await persistRows(rows);
  const latest = await readPersistedRows(BACKFILL_MIN_SESSIONS);
  await setCachedRows(latest.length ? latest : rows.slice(-BACKFILL_MIN_SESSIONS));
  return latest.length ? latest : rows.slice(-BACKFILL_MIN_SESSIONS);
}

export async function refreshFiiDiiFromNse(): Promise<FiiDiiRow[]> {
  const rows = normalizeNseData(await fetchNseRows());
  if (rows.length === 0) {
    throw new Error('NSE returned no FII/DII rows');
  }

  await persistRows(rows);
  const latest = await readPersistedRows(BACKFILL_MIN_SESSIONS);
  const responseRows = latest.length ? latest : rows;
  await setCachedRows(responseRows);
  return responseRows;
}

export async function getFiiDiiRows(): Promise<FiiDiiRow[]> {
  const cached = await getCachedRows();
  if (cached && cached.length >= BACKFILL_MIN_SESSIONS) return cached;

  try {
    try {
      await backfillFiiDiiHistoryIfNeeded();
    } catch (error: any) {
      console.warn(`[FII_DII] Historical backfill unavailable: ${error.message}`);
    }
    const persisted = await readPersistedRows(BACKFILL_MIN_SESSIONS);
    if (persisted.length > 0) {
      await setCachedRows(persisted);
      return persisted;
    }
    return await refreshFiiDiiFromNse();
  } catch (error) {
    const fallback = await getCachedRows();
    if (fallback) return fallback;
    throw error;
  }
}

export async function closeFiiDiiPool(): Promise<void> {
  if (equityPool) {
    await equityPool.end();
    equityPool = null;
    tableReady = false;
  }
}
