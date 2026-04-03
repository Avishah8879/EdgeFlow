import { useState, useCallback } from "react";
import { DEFAULT_PREFERENCES, STORAGE_KEYS } from "../constants";
import type { ChartPreferences, ChartType } from "../types";

/**
 * Load preferences from localStorage
 */
function loadPreferences(): ChartPreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle missing keys
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (e) {
    console.error("[useChartPreferences] Failed to load preferences:", e);
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Save preferences to localStorage
 */
function savePreferences(prefs: ChartPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
  } catch (e) {
    console.error("[useChartPreferences] Failed to save preferences:", e);
  }
}

/**
 * useChartPreferences - Manages chart preferences with localStorage persistence
 *
 * Features:
 * - Persists volume toggle and chart type preferences
 * - Loads preferences on mount
 * - Saves on every change
 */
export function useChartPreferences() {
  const [preferences, setPreferences] = useState<ChartPreferences>(loadPreferences);

  // Toggle volume visibility
  const toggleVolume = useCallback(() => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, showVolume: !prev.showVolume };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  // Set volume visibility explicitly
  const setShowVolume = useCallback((show: boolean) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, showVolume: show };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  // Set chart type
  const setChartType = useCallback((type: ChartType) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, chartType: type };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  return {
    preferences,
    showVolume: preferences.showVolume,
    chartType: preferences.chartType,
    toggleVolume,
    setShowVolume,
    setChartType,
  };
}
