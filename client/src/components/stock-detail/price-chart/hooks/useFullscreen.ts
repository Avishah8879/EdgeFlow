import { useState, useCallback, useEffect, useRef } from "react";

/**
 * useFullscreen - Manages fullscreen state for the chart container
 *
 * Features:
 * - Uses browser Fullscreen API
 * - Tracks fullscreen state
 * - Handles Escape key to exit
 * - Supports keyboard accessibility
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle fullscreen mode
  const toggle = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("[useFullscreen] Failed to toggle fullscreen:", error);
    }
  }, []);

  // Enter fullscreen
  const enter = useCallback(async () => {
    if (!containerRef.current || document.fullscreenElement) return;

    try {
      await containerRef.current.requestFullscreen();
    } catch (error) {
      console.error("[useFullscreen] Failed to enter fullscreen:", error);
    }
  }, []);

  // Exit fullscreen
  const exit = useCallback(async () => {
    if (!document.fullscreenElement) return;

    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error("[useFullscreen] Failed to exit fullscreen:", error);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Handle Escape key (backup - browser usually handles this)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen) {
        exit();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, exit]);

  return {
    isFullscreen,
    toggle,
    enter,
    exit,
    ref: containerRef,
  };
}
