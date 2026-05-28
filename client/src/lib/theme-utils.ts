/**
 * Theme-aware utility functions for financial UI components
 * All color decisions should go through these helpers to maintain theme consistency
 */

/**
 * Get CSS color value from CSS variable
 * Useful for chart libraries that need color strings
 */
export function getCSSColor(variable: string): string {
  const hsl = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return `hsl(${hsl})`;
}

/**
 * Get color class for financial ratings (Valuation, Profitability, etc.)
 * Uses pattern matching to catch variations like "Slightly overvalued"
 * @param rating - "BUY" | "HOLD" | "SELL" | "UNDERVALUED" | "FAIR" | "OVERVALUED" | "HIGH" | "MEDIUM" | "LOW" etc.
 * @returns Tailwind class string for background and text (high contrast for badges)
 */
export function getRatingColorClass(rating: string): string {
  const normalized = rating.toLowerCase().trim();

  // Positive ratings (pattern matching) - white text on green
  if (
    normalized.includes("buy") ||
    normalized.includes("undervalued") ||
    normalized.includes("high") ||
    normalized.includes("strong") ||
    normalized.includes("good") ||
    normalized.includes("excellent")
  ) {
    return "bg-positive text-white";
  }

  // Negative ratings (pattern matching) - white text on red
  if (
    normalized.includes("sell") ||
    normalized.includes("overvalued") ||
    normalized.includes("low") ||
    normalized.includes("weak") ||
    normalized.includes("poor")
  ) {
    return "bg-negative text-white";
  }

  // Neutral ratings (pattern matching) - white text on gray
  if (
    normalized.includes("hold") ||
    normalized.includes("neutral") ||
    normalized.includes("fair") ||
    normalized.includes("average") ||
    normalized.includes("medium")
  ) {
    return "bg-neutral text-white";
  }

  // Default (unknown rating)
  return "bg-muted text-foreground";
}

/**
 * Get text color class for ratings (for inline text, not badges)
 * Uses pattern matching to catch variations like "Slightly overvalued", "Average"
 */
export function getRatingTextClass(rating: string): string {
  const normalized = rating.toLowerCase().trim();

  // Positive ratings (pattern matching)
  if (
    normalized.includes("buy") ||
    normalized.includes("undervalued") ||
    normalized.includes("high") ||
    normalized.includes("strong") ||
    normalized.includes("good") ||
    normalized.includes("excellent")
  ) {
    return "text-positive";
  }

  // Negative ratings (pattern matching)
  if (
    normalized.includes("sell") ||
    normalized.includes("overvalued") ||
    normalized.includes("low") ||
    normalized.includes("weak") ||
    normalized.includes("poor")
  ) {
    return "text-negative";
  }

  // Neutral ratings (pattern matching)
  if (
    normalized.includes("hold") ||
    normalized.includes("neutral") ||
    normalized.includes("fair") ||
    normalized.includes("average") ||
    normalized.includes("medium")
  ) {
    return "text-neutral-foreground";
  }

  return "text-muted-foreground";
}

/**
 * Get color class for market status
 * @param status - "OPEN" | "CLOSED" | "PRE_MARKET" | "AFTER_HOURS"
 */
export function getStatusColorClass(status: string): string {
  const normalizedStatus = status.toUpperCase().replace("-", "_");

  switch (normalizedStatus) {
    case "OPEN":
    case "LIVE":
      return "text-positive border-positive bg-positive/10";
    case "CLOSED":
    case "HOLIDAY":
    case "WEEKEND":
      return "text-destructive border-destructive bg-destructive/10";
    case "PRE_MARKET":
    case "AFTER_HOURS":
      return "text-primary border-primary bg-primary/10";
    default:
      return "text-muted-foreground border-border bg-muted";
  }
}

/**
 * Get color class for sentiment labels
 * @param sentiment - "positive" | "negative" | "neutral" | "bullish" | "bearish"
 */
export function getSentimentColorClass(sentiment: string): string {
  const normalizedSentiment = sentiment.toLowerCase();

  if (["positive", "bullish"].includes(normalizedSentiment)) {
    return "text-positive";
  }

  if (["negative", "bearish"].includes(normalizedSentiment)) {
    return "text-negative";
  }

  return "text-neutral";
}

/**
 * Get badge color class for sentiment (high contrast for badges)
 */
export function getSentimentBadgeClass(sentiment: string): string {
  const normalizedSentiment = sentiment.toLowerCase();

  if (["positive", "bullish"].includes(normalizedSentiment)) {
    return "bg-positive text-white";
  }

  if (["negative", "bearish"].includes(normalizedSentiment)) {
    return "bg-negative text-white";
  }

  return "bg-neutral text-white";
}

/**
 * Format financial values with proper Indian number system
 * @param value - Number to format
 * @param options - Formatting options
 */
export interface FormatFinancialOptions {
  type?: "currency" | "number" | "percentage";
  decimals?: number;
  compact?: boolean;
  showSign?: boolean;
}

export function formatFinancialValue(
  value: number | null | undefined,
  options: FormatFinancialOptions = {}
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }

  const {
    type = "number",
    decimals = 2,
    compact = false,
    showSign = false,
  } = options;

  let formatted: string;

  if (compact && Math.abs(value) >= 1000) {
    // Indian numbering system
    if (Math.abs(value) >= 10000000) {
      // Crores
      formatted = (value / 10000000).toFixed(decimals) + "Cr";
    } else if (Math.abs(value) >= 100000) {
      // Lakhs
      formatted = (value / 100000).toFixed(decimals) + "L";
    } else if (Math.abs(value) >= 1000) {
      // Thousands
      formatted = (value / 1000).toFixed(decimals) + "K";
    } else {
      formatted = value.toFixed(decimals);
    }
  } else {
    formatted = value.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // Add prefix/suffix based on type
  if (type === "currency") {
    formatted = "₹" + formatted;
  } else if (type === "percentage") {
    formatted = formatted + "%";
  }

  // Add sign if requested
  if (showSign && value > 0) {
    formatted = "+" + formatted;
  }

  return formatted;
}

/**
 * Get color class based on numeric value (positive/negative)
 */
export function getValueColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "text-muted-foreground";
  }

  if (value > 0) {
    return "text-positive";
  } else if (value < 0) {
    return "text-negative";
  }

  return "text-muted-foreground";
}
