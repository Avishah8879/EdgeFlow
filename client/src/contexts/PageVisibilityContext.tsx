/**
 * Page Visibility Context
 *
 * Provides page visibility state to navigation and routes.
 * Fetches visibility flags from the backend and caches them.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuthBaseUrl } from '@/lib/api-config';

const AUTH_BASE_URL = getAuthBaseUrl();

// Types
interface PageVisibility {
  home: boolean;
  stocks: boolean;
  indices: boolean;
  screener: boolean;
  backtest: boolean;
  sentiment: boolean;
  portfolio: boolean;
  watchlist: boolean;
  news: boolean;
  learn: boolean;
  profile: boolean;
  [key: string]: boolean;
}

interface PageVisibilityResponse {
  pages: PageVisibility;
  updatedAt: string;
  fallback?: boolean;
}

interface PageVisibilityContextType {
  pages: PageVisibility;
  isLoading: boolean;
  isPageVisible: (pageName: string) => boolean;
  refetch: () => void;
}

// Default visibility (all pages visible)
const DEFAULT_VISIBILITY: PageVisibility = {
  home: true,
  stocks: true,
  indices: true,
  screener: true,
  backtest: true,
  sentiment: true,
  portfolio: true,
  watchlist: true,
  news: true,
  learn: true,
  profile: true,
};

// Create context
const PageVisibilityContext = createContext<PageVisibilityContextType>({
  pages: DEFAULT_VISIBILITY,
  isLoading: false,
  isPageVisible: () => true,
  refetch: () => {},
});

/**
 * Fetch page visibility from backend
 */
async function fetchPageVisibility(): Promise<PageVisibility> {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/config/pages`);

    if (!response.ok) {
      console.warn('[PageVisibility] Failed to fetch, using defaults');
      return DEFAULT_VISIBILITY;
    }

    const data: PageVisibilityResponse = await response.json();
    return data.pages;
  } catch (error) {
    console.warn('[PageVisibility] Error fetching, using defaults:', error);
    return DEFAULT_VISIBILITY;
  }
}

/**
 * Page Visibility Provider
 */
export function PageVisibilityProvider({ children }: { children: ReactNode }) {
  const {
    data: pages = DEFAULT_VISIBILITY,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['page-visibility'],
    queryFn: fetchPageVisibility,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const isPageVisible = (pageName: string): boolean => {
    // Default to visible if not specified
    return pages[pageName] !== false;
  };

  return (
    <PageVisibilityContext.Provider
      value={{
        pages,
        isLoading,
        isPageVisible,
        refetch,
      }}
    >
      {children}
    </PageVisibilityContext.Provider>
  );
}

/**
 * Hook to access page visibility
 */
export function usePageVisibility() {
  const context = useContext(PageVisibilityContext);

  if (!context) {
    throw new Error('usePageVisibility must be used within PageVisibilityProvider');
  }

  return context;
}

/**
 * Hook to check if a specific page is visible
 */
export function useIsPageVisible(pageName: string): boolean {
  const { isPageVisible } = usePageVisibility();
  return isPageVisible(pageName);
}

export default PageVisibilityContext;
