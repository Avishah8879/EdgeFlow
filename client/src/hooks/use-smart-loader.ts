import { useState, useEffect } from "react"

/**
 * Smart loader that shows skeleton for minimum delay (default 300ms)
 *
 * Behavior:
 * - If data loads BEFORE minDelay: Skips skeleton entirely, shows data immediately
 * - If data loads AFTER minDelay: Shows skeleton, then fades to content
 *
 * This prevents flash of skeleton for fast loads while providing feedback for slow loads.
 *
 * @param isLoading - Whether data is currently loading
 * @param minDelay - Minimum delay before showing skeleton (default: 300ms)
 * @returns Object with showSkeleton flag and shouldAnimate flag
 */
export function useSmartLoader(isLoading: boolean, minDelay = 300) {
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null

    if (isLoading) {
      // Start timer to show skeleton after minDelay
      timer = setTimeout(() => {
        setShowSkeleton(true)
        setShouldAnimate(true)
      }, minDelay)
    } else {
      // Data loaded
      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      if (showSkeleton) {
        // Was showing skeleton, animate out
        setTimeout(() => setShowSkeleton(false), 200)
      }
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [isLoading, minDelay, showSkeleton])

  return {
    showSkeleton: isLoading && showSkeleton,
    shouldAnimate,
  }
}
