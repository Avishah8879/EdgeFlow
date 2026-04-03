import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { getCSSColor } from "@/lib/theme-utils";
import { ANIMATION_TIMING } from "../constants";
import type { ChartColors } from "../types";

/**
 * Convert HSL color to HSLA with alpha
 * Handles the conversion: "hsl(142 71% 45%)" → "hsla(142, 71%, 45%, 0.1)"
 */
function hslToHsla(hslColor: string, alpha: number): string {
  // Match hsl(h s% l%) or hsl(h, s%, l%) format
  const match = hslColor.match(/hsl\(([^)]+)\)/);
  if (!match) return hslColor;

  const values = match[1].trim();
  // Handle both space-separated and comma-separated formats
  const parts = values.includes(",")
    ? values.split(",").map((p) => p.trim())
    : values.split(/\s+/);

  if (parts.length >= 3) {
    return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }

  return hslColor;
}

/**
 * Get computed colors from CSS variables
 */
function getColorsFromCSS(): ChartColors {
  const foreground = getCSSColor("--foreground");
  const border = getCSSColor("--border");
  const positive = getCSSColor("--chart-positive");
  const negative = getCSSColor("--chart-negative");
  const volume = getCSSColor("--chart-volume");
  const primary = getCSSColor("--primary");

  return {
    foreground,
    border,
    gridLine: hslToHsla(border, 0.1),
    positive,
    negative,
    volume: hslToHsla(volume, 0.5),
    line: primary, // Use primary (orange) for line chart
  };
}

/**
 * useChartTheme - Provides theme-reactive colors for the chart
 *
 * Key features:
 * - Detects theme changes via next-themes
 * - Recomputes CSS colors when theme changes
 * - Small delay allows CSS variable transitions to complete
 */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(getColorsFromCSS);

  // Recompute colors when theme changes
  useEffect(() => {
    // Small delay to ensure CSS variables have updated after theme transition
    const timer = setTimeout(() => {
      setColors(getColorsFromCSS());
    }, ANIMATION_TIMING.themeTransitionDelay);

    return () => clearTimeout(timer);
  }, [resolvedTheme]);

  // Function to manually refresh colors (useful for testing)
  const refreshColors = useCallback(() => {
    setColors(getColorsFromCSS());
  }, []);

  return {
    colors,
    refreshColors,
    resolvedTheme,
  };
}
