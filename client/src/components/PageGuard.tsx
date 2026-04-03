/**
 * Page Guard Component
 *
 * Protects routes based on page visibility settings from admin.
 * If a page is hidden, redirects to home or shows a message.
 */

import { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { usePageVisibility } from '@/contexts/PageVisibilityContext';
import { Loader2 } from 'lucide-react';

interface PageGuardProps {
  children: ReactNode;
  pageKey: string;
  fallbackPath?: string;
}

export function PageGuard({
  children,
  pageKey,
  fallbackPath = '/home',
}: PageGuardProps) {
  const { isPageVisible, isLoading } = usePageVisibility();

  // Show loading while checking visibility
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If page is not visible, redirect to fallback
  if (!isPageVisible(pageKey)) {
    return <Redirect to={fallbackPath} />;
  }

  return <>{children}</>;
}
