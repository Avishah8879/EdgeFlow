import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format large numbers with K/M/B suffixes
 * @param num - Number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., 1.5M, 2.3B)
 */
export function formatCompactNumber(num: number, decimals: number = 1): string {
  if (num === 0) return '0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(decimals) + 'B';
  }
  if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(decimals) + 'M';
  }
  if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(decimals) + 'K';
  }

  return sign + absNum.toFixed(decimals);
}

/**
 * Format currency with Indian notation (lakhs, crores)
 * @param num - Number to format
 * @param includeSymbol - Whether to include ₹ symbol (default: true)
 * @returns Formatted string (e.g., ₹1.5L, ₹2.3Cr)
 */
export function formatIndianCurrency(num: number, includeSymbol: boolean = true): string {
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const symbol = includeSymbol ? '₹' : '';

  if (absNum >= 1e7) {
    return sign + symbol + (absNum / 1e7).toFixed(2) + 'Cr';
  }
  if (absNum >= 1e5) {
    return sign + symbol + (absNum / 1e5).toFixed(2) + 'L';
  }

  return sign + symbol + absNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ── NSE Futures Utilities (from FinTerminal) ─────────────────────────────────

const NSE_HOLIDAYS_2025 = new Set([
  "2025-01-26", "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10",
  "2025-04-14", "2025-04-18", "2025-05-01", "2025-06-07", "2025-08-15",
  "2025-08-27", "2025-10-02", "2025-10-21", "2025-10-22", "2025-11-05",
  "2025-12-25",
]);
const NSE_HOLIDAYS_2026 = new Set<string>();
const ALL_HOLIDAYS = new Set([...NSE_HOLIDAYS_2025, ...NSE_HOLIDAYS_2026]);

function isTradingDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const iso = d.toISOString().split('T')[0];
  return !ALL_HOLIDAYS.has(iso);
}

function getExpiryDate(year: number, month: number): Date {
  const lastDay = new Date(year, month, 0);
  const dayOfWeek = lastDay.getDay();
  const daysToSubtract = (dayOfWeek + 5) % 7;
  const lastTuesday = new Date(lastDay);
  lastTuesday.setDate(lastDay.getDate() - daysToSubtract);
  let expiry = new Date(lastTuesday);
  while (!isTradingDay(expiry)) {
    expiry.setDate(expiry.getDate() - 1);
  }
  return expiry;
}

export interface FuturesInfo {
  symbol: string;
  expiry: Date;
  expiryStr: string;
  monthLabel: string;
}

export function getCurrentFuturesInfo(indexName: string): FuturesInfo {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentExpiry = getExpiryDate(year, month);
  const expiryTime = new Date(currentExpiry);
  expiryTime.setHours(15, 30, 0, 0);
  let targetMonth = month;
  let targetYear = year;
  let expiry = currentExpiry;
  if (now > expiryTime) {
    if (month === 12) { targetMonth = 1; targetYear = year + 1; }
    else { targetMonth = month + 1; }
    expiry = getExpiryDate(targetYear, targetMonth);
  }
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monthAbbr = monthNames[targetMonth - 1];
  const yearShort = String(targetYear).slice(2);
  const expiryStr = expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return {
    symbol: `NSE:${indexName}${yearShort}${monthAbbr}FUT`,
    expiry,
    expiryStr,
    monthLabel: `${monthAbbr} ${yearShort}`,
  };
}

export function getCurrentFuturesSymbol(indexName: string): string {
  return getCurrentFuturesInfo(indexName).symbol;
}
