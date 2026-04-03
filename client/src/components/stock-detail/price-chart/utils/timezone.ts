/**
 * Timezone utilities for displaying chart times in IST (Indian Standard Time)
 *
 * Lightweight-charts displays timestamps as-is without timezone conversion.
 * To show IST times worldwide, we add the IST offset to UTC timestamps.
 */

const IST_TIMEZONE = "Asia/Kolkata";

// IST is UTC+5:30 = 19800 seconds
const IST_OFFSET_SECONDS = 5 * 3600 + 30 * 60; // 19800

/**
 * Convert a UTC timestamp to IST-shifted timestamp for chart display
 *
 * Lightweight-charts displays timestamps without timezone conversion.
 * By adding the IST offset to UTC timestamps, the chart will display
 * IST times regardless of the user's local timezone.
 *
 * @param utcTimestamp - Unix timestamp in seconds (UTC)
 * @returns Unix timestamp shifted to display as IST
 */
export function timeToIST(utcTimestamp: number): number {
  return utcTimestamp + IST_OFFSET_SECONDS;
}

// Month names for UTC formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format an IST-shifted timestamp for legend/tooltip display
 *
 * IMPORTANT: This function expects timestamps that have ALREADY been shifted
 * by timeToIST(). It uses UTC methods because the shift has already been applied.
 *
 * @param timestamp - IST-shifted Unix timestamp in seconds
 * @param options - Formatting options
 * @returns Formatted date/time string displaying IST time
 */
export function formatISTTime(
  timestamp: number,
  options: {
    showTime?: boolean;
    showDate?: boolean;
  } = { showTime: true, showDate: true }
): string {
  const { showTime = true, showDate = true } = options;
  const date = new Date(timestamp * 1000);

  const parts: string[] = [];

  if (showDate) {
    const day = date.getUTCDate();
    const month = MONTHS[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    parts.push(`${day} ${month} ${year}`);
  }

  if (showTime) {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    parts.push(`${displayHours}:${minutes} ${period}`);
  }

  return parts.join(', ');
}

/**
 * Format a timestamp as a short date (for compact displays)
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Short formatted date (e.g., "25 Nov")
 */
export function formatISTDateShort(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  return date.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
  });
}

/**
 * Format a timestamp as full date (for detailed displays)
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Full formatted date (e.g., "25 Nov 2024")
 */
export function formatISTDateFull(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  return date.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a timestamp as time only (for intraday displays)
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Time string (e.g., "2:30 PM")
 */
export function formatISTTimeOnly(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  return date.toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get current IST time as Unix timestamp
 *
 * @returns Current Unix timestamp in IST
 */
export function getCurrentISTTimestamp(): number {
  const now = new Date();
  const zonedDate = new Date(
    now.toLocaleString("en-US", { timeZone: IST_TIMEZONE })
  );
  return Math.floor(zonedDate.getTime() / 1000);
}

/**
 * Check if a given timestamp is during market hours (9:15 AM - 3:30 PM IST)
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns true if within market hours
 */
export function isMarketHours(timestamp: number): boolean {
  const date = new Date(timestamp * 1000);
  const istString = date.toLocaleString("en-US", {
    timeZone: IST_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const [hours, minutes] = istString.split(":").map(Number);
  const timeValue = hours * 60 + minutes;

  // Market hours: 9:15 AM (555) to 3:30 PM (930)
  const marketOpen = 9 * 60 + 15;  // 555
  const marketClose = 15 * 60 + 30; // 930

  return timeValue >= marketOpen && timeValue <= marketClose;
}
