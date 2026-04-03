/**
 * Tracking Context Provider
 *
 * Provides global tracking functionality with privacy consent integration.
 * Auto-tracks page views on route changes and handles click tracking.
 */

import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivacyConsent } from '@/hooks/use-privacy-consent';
import {
  trackPageView,
  trackClick,
  trackSearch,
  trackFeatureUsage,
  setupVisibilityTracking,
  flushEvents,
  ClickContext,
  FeatureType,
} from '@/lib/tracking';

interface TrackingContextType {
  // Track a click event
  trackClick: (context: ClickContext) => void;
  // Track a search event
  trackSearch: (query: string, resultCount?: number, selectedResult?: string) => void;
  // Track feature usage (screener, backtest, etc.)
  trackFeature: (
    featureType: FeatureType,
    params: Record<string, unknown>,
    result?: {
      summary?: Record<string, unknown>;
      executionTimeMs?: number;
      success?: boolean;
      errorMessage?: string;
    }
  ) => void;
  // Whether tracking is enabled (user consented)
  isTrackingEnabled: boolean;
}

const TrackingContext = createContext<TrackingContextType | null>(null);

interface TrackingProviderProps {
  children: ReactNode;
}

export function TrackingProvider({ children }: TrackingProviderProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { consentLevel } = usePrivacyConsent();
  const previousLocation = useRef<string | null>(null);

  // Determine if tracking is enabled based on consent
  const isEssentialEnabled = consentLevel === 'essential' || consentLevel === 'all';
  const isFullTrackingEnabled = consentLevel === 'all';

  // Setup visibility tracking on mount
  useEffect(() => {
    if (!isEssentialEnabled) return;

    const cleanup = setupVisibilityTracking();

    // Flush events before unload
    const handleUnload = () => {
      flushEvents();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isEssentialEnabled]);

  // Track page views on route change
  useEffect(() => {
    if (!isEssentialEnabled) return;

    // Only track if location actually changed
    if (location !== previousLocation.current) {
      previousLocation.current = location;
      trackPageView(location, document.title);
    }
  }, [location, isEssentialEnabled]);

  // Click tracking handler
  const handleTrackClick = useCallback(
    (context: ClickContext) => {
      if (!isFullTrackingEnabled) return;
      trackClick(location, context);
    },
    [location, isFullTrackingEnabled]
  );

  // Search tracking handler
  const handleTrackSearch = useCallback(
    (query: string, resultCount?: number, selectedResult?: string) => {
      if (!isFullTrackingEnabled) return;
      trackSearch(query, resultCount, selectedResult);
    },
    [isFullTrackingEnabled]
  );

  // Feature tracking handler - async to support cache invalidation
  const handleTrackFeature = useCallback(
    async (
      featureType: FeatureType,
      params: Record<string, unknown>,
      result?: {
        summary?: Record<string, unknown>;
        executionTimeMs?: number;
        success?: boolean;
        errorMessage?: string;
      }
    ) => {
      if (!isEssentialEnabled) return;

      const response = await trackFeatureUsage({
        featureType,
        featureParams: params,
        resultSummary: result?.summary,
        executionTimeMs: result?.executionTimeMs,
        success: result?.success,
        errorMessage: result?.errorMessage,
      });

      // Invalidate usage-limits cache to reflect new usage immediately
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
      }
    },
    [isEssentialEnabled, queryClient]
  );

  // Optional: Click delegation for automatic click tracking
  useEffect(() => {
    if (!isFullTrackingEnabled) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Only track interactive elements
      const interactive = target.closest('button, a, [role="button"], [data-track]');
      if (!interactive) return;

      const elementType =
        interactive.tagName.toLowerCase() === 'a'
          ? 'link'
          : interactive.tagName.toLowerCase() === 'button'
            ? 'button'
            : 'interactive';

      handleTrackClick({
        elementType,
        elementId: interactive.id || undefined,
        elementText: interactive.textContent?.trim().substring(0, 50) || undefined,
      });
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [isFullTrackingEnabled, handleTrackClick]);

  const value: TrackingContextType = {
    trackClick: handleTrackClick,
    trackSearch: handleTrackSearch,
    trackFeature: handleTrackFeature,
    isTrackingEnabled: isEssentialEnabled,
  };

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextType {
  const context = useContext(TrackingContext);
  if (!context) {
    // Return no-op functions if not in provider (for safety)
    return {
      trackClick: () => {},
      trackSearch: () => {},
      trackFeature: () => {},
      isTrackingEnabled: false,
    };
  }
  return context;
}
