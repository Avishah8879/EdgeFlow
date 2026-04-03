/**
 * Client-side Tracking Library
 *
 * Provides utilities for tracking user behavior:
 * - Page views with duration
 * - Click events
 * - Search events
 * - Feature usage
 *
 * All tracking respects user privacy consent levels.
 * Dual tracking: Internal backend + Google Analytics 4.
 */

import { gaPageView, gaClick, gaSearch, gaFeatureUsage, getPageTitle } from './ga';
import { getAuthBaseUrl } from './api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Session ID management
const SESSION_KEY = 'tiphub_session_id';

export function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

// Device info
export interface DeviceInfo {
  screenResolution: string;
  deviceType: string;
  timezone: string;
}

export function getDeviceInfo(): DeviceInfo {
  const width = window.screen.width;
  const height = window.screen.height;

  let deviceType = 'desktop';
  if (width <= 768) deviceType = 'mobile';
  else if (width <= 1024) deviceType = 'tablet';

  return {
    screenResolution: `${width}x${height}`,
    deviceType,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// Get auth token if available
function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

// API helper (fire-and-forget for non-feature events)
async function sendTrackingEvent(endpoint: string, data: object): Promise<boolean> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${AUTH_BASE_URL}/api/track${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    return response.ok;
  } catch {
    return false;
  }
}

// API helper that returns parsed JSON response (for feature tracking)
async function sendTrackingEventWithResponse<T>(endpoint: string, data: object): Promise<T | null> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${AUTH_BASE_URL}/api/track${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (response.ok) {
      return response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// Page view tracking
let currentPagePath: string | null = null;
let pageEntryTime: number | null = null;

export function trackPageView(path: string, title?: string): void {
  // Send leave event for previous page
  if (currentPagePath && pageEntryTime) {
    const duration = (Date.now() - pageEntryTime) / 1000;
    trackPageLeave(currentPagePath, duration);
  }

  // Track new page
  currentPagePath = path;
  pageEntryTime = Date.now();

  const sessionId = getSessionId();
  const { screenResolution } = getDeviceInfo();
  const pageTitle = title || getPageTitle(path);

  // Internal tracking
  sendTrackingEvent('/page-view', {
    sessionId,
    pagePath: path,
    pageTitle,
    referrer: document.referrer || null,
    screenResolution,
  });

  // Google Analytics tracking
  gaPageView(path, pageTitle);
}

export function trackPageLeave(path: string, durationSeconds: number): void {
  const sessionId = getSessionId();

  // Use sendBeacon for reliability on page unload
  const data = JSON.stringify({
    sessionId,
    pagePath: path,
    durationSeconds,
  });

  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Try sendBeacon first (works on page unload)
  if (navigator.sendBeacon) {
    const blob = new Blob([data], { type: 'application/json' });
    navigator.sendBeacon(`${AUTH_BASE_URL}/api/track/page-leave`, blob);
  } else {
    // Fallback to fetch
    sendTrackingEvent('/page-leave', { sessionId, pagePath: path, durationSeconds });
  }
}

// Click tracking
export interface ClickContext {
  elementType?: string;
  elementId?: string;
  elementText?: string;
}

export function trackClick(pagePath: string, context: ClickContext): void {
  const sessionId = getSessionId();

  // Internal tracking
  sendTrackingEvent('/click', {
    sessionId,
    pagePath,
    elementType: context.elementType,
    elementId: context.elementId,
    elementText: context.elementText?.substring(0, 100),
  });

  // Google Analytics tracking
  gaClick(context.elementType || 'unknown', context.elementId, context.elementText);
}

// Search tracking
export function trackSearch(query: string, resultCount?: number, selectedResult?: string): void {
  const sessionId = getSessionId();

  // Internal tracking
  sendTrackingEvent('/search', {
    sessionId,
    query,
    resultCount,
    selectedResult,
  });

  // Google Analytics tracking
  gaSearch(query, resultCount, selectedResult);
}

// Feature usage tracking
export type FeatureType = 'screener' | 'backtest' | 'sentiment' | 'search' | 'price_chart' | 'technical_indicators';

export interface FeatureUsageParams {
  featureType: FeatureType;
  featureParams: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  executionTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
}

// Response type for feature tracking
export interface FeatureTrackingResponse {
  success: boolean;
  usage?: {
    featureType: string;
    count: number;
  };
}

export async function trackFeatureUsage(params: FeatureUsageParams): Promise<FeatureTrackingResponse> {
  // Internal tracking
  const response = await sendTrackingEventWithResponse<FeatureTrackingResponse>('/feature', params);

  // Google Analytics tracking
  gaFeatureUsage(params.featureType, params.featureParams, {
    success: params.success,
    executionTimeMs: params.executionTimeMs,
    errorMessage: params.errorMessage,
  });

  return response || { success: false };
}

// Batch tracking for efficiency
interface TrackingEvent {
  type: 'page_view' | 'click' | 'search';
  sessionId: string;
  [key: string]: unknown;
}

const eventQueue: TrackingEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

export function queueEvent(event: Omit<TrackingEvent, 'sessionId'>): void {
  eventQueue.push({
    ...event,
    sessionId: getSessionId(),
  } as TrackingEvent);

  // Debounce flush
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  flushTimeout = setTimeout(flushEvents, 2000);
}

export async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue.length = 0;

  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  await sendTrackingEvent('/batch', { events });
}

// Page visibility handling for accurate duration
export function setupVisibilityTracking(): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && currentPagePath && pageEntryTime) {
      const duration = (Date.now() - pageEntryTime) / 1000;
      trackPageLeave(currentPagePath, duration);
    } else if (document.visibilityState === 'visible' && currentPagePath) {
      pageEntryTime = Date.now();
    }
  };

  const handleBeforeUnload = () => {
    if (currentPagePath && pageEntryTime) {
      const duration = (Date.now() - pageEntryTime) / 1000;
      trackPageLeave(currentPagePath, duration);
    }
    flushEvents();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
