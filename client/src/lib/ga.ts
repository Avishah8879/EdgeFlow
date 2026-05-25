/**
 * Google Analytics 4 Helper Library
 *
 * Provides type-safe wrappers for gtag calls and route-to-title mapping.
 * Integrated with the existing tracking system in tracking.ts.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA_ID = 'G-9L6E3HP50X';

/**
 * Route-to-title mapping for all 34 routes
 */
const ROUTE_TITLES: Record<string, string> = {
  // Public routes
  '/': 'Landing',
  '/login': 'Login',
  '/signup': 'Sign Up',
  '/forgot-password': 'Forgot Password',
  '/auth/callback': 'Auth Callback',
  '/auth/oauth-setup': 'OAuth Setup',
  '/privacy': 'Privacy Policy',

  // Protected routes
  '/home': 'Home',
  '/stocks': 'Stocks',
  '/screener': 'Expert Screener',
  '/indices': 'Indices',
  '/alpha-generation': 'EquityPro AI Redirect',
  '/portfolio': 'Portfolio',
  '/watchlist': 'Watchlist',
  '/news': 'News',
  '/learn': 'Learn',
  '/profile': 'Profile',
  '/saved-results': 'Saved Results',

  // Admin routes
  '/admin': 'Admin Dashboard',
  '/admin/users': 'Admin - Users',
  '/admin/analytics': 'Admin - Analytics',
  '/admin/audit': 'Admin - Audit Logs',
  '/admin/notifications': 'Admin - Notifications',
  '/admin/settings': 'Admin - Settings',
  '/admin/security': 'Admin - Security',
  '/admin/rate-limits': 'Admin - Rate Limits',
  '/admin/feature-flags': 'Admin - Feature Flags',
  '/admin/email-settings': 'Admin - Email Settings',
};

/**
 * Get page title for a given path
 * Handles dynamic routes like /stocks/:ticker and /shared/screener/:token
 */
export function getPageTitle(path: string): string {
  // Check exact match first
  if (ROUTE_TITLES[path]) {
    return ROUTE_TITLES[path];
  }

  // Handle dynamic routes
  if (path.startsWith('/stocks/') && path !== '/stocks/') {
    const ticker = path.split('/')[2];
    return `Stock Detail - ${ticker.toUpperCase()}`;
  }

  if (path.startsWith('/saved-results/screener/')) {
    return 'Saved Screener Detail';
  }

  if (path.startsWith('/shared/screener/')) {
    return 'Shared Screener Result';
  }

  if (path.startsWith('/shared/backtest/')) {
    return 'Shared Backtest Result';
  }

  // Fallback: convert path to title case
  if (path === '/') return 'Landing';

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'Page Not Found';

  return segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '))
    .join(' - ');
}

/**
 * Check if gtag is available
 */
function isGtagAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/**
 * Send a page view event to GA4
 */
export function gaPageView(path: string, title?: string): void {
  if (!isGtagAvailable()) return;

  const pageTitle = title || getPageTitle(path);

  window.gtag!('event', 'page_view', {
    page_path: path,
    page_title: pageTitle,
    page_location: window.location.href,
  });
}

/**
 * Send a custom event to GA4
 */
export function gaEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  if (!isGtagAvailable()) return;

  window.gtag!('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
}

/**
 * Send a feature usage event to GA4 with rich parameters
 */
export function gaFeatureUsage(
  featureType: string,
  params: Record<string, unknown>,
  result?: {
    success?: boolean;
    executionTimeMs?: number;
    errorMessage?: string;
  }
): void {
  if (!isGtagAvailable()) return;

  window.gtag!('event', 'feature_use', {
    feature_type: featureType,
    feature_params: JSON.stringify(params),
    success: result?.success,
    execution_time_ms: result?.executionTimeMs,
    error_message: result?.errorMessage,
  });
}

/**
 * Send a search event to GA4
 */
export function gaSearch(
  query: string,
  resultCount?: number,
  selectedResult?: string
): void {
  if (!isGtagAvailable()) return;

  window.gtag!('event', 'search', {
    search_term: query,
    result_count: resultCount,
    selected_result: selectedResult,
  });
}

/**
 * Send a click event to GA4
 */
export function gaClick(
  elementType: string,
  elementId?: string,
  elementText?: string
): void {
  if (!isGtagAvailable()) return;

  window.gtag!('event', 'click', {
    element_type: elementType,
    element_id: elementId,
    element_text: elementText?.substring(0, 100),
  });
}
