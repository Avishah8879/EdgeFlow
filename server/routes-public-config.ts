/**
 * Public Configuration Routes
 *
 * Provides public endpoints for fetching app configuration
 * like page visibility (feature flags) without requiring authentication.
 */

import { Router, Request, Response } from 'express';
import { query } from './db/auth-connection';

const router = Router();

// Default page visibility (fallback if database unavailable)
const DEFAULT_PAGE_VISIBILITY: Record<string, boolean> = {
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

/**
 * GET /api/config/pages
 * Get page visibility configuration
 *
 * Returns which pages are visible/enabled in the app.
 * Used by frontend to conditionally show/hide navigation items and routes.
 */
router.get('/pages', async (req: Request, res: Response) => {
  try {
    // Fetch page visibility flags from system_config table (not feature_flags)
    // Page visibility is stored in system_config with keys like 'page_visible_home'
    const result = await query(
      `SELECT key, value
       FROM system_config
       WHERE key LIKE 'page_visible_%'`,
      []
    );

    // Build visibility map from database
    const visibility: Record<string, boolean> = { ...DEFAULT_PAGE_VISIBILITY };

    result.rows.forEach((row: any) => {
      // Convert 'page_visible_home' -> 'home'
      const pageName = row.key.replace('page_visible_', '');
      // Value is stored as JSON string, e.g., 'true' or 'false'
      visibility[pageName] = row.value === true || row.value === 'true';
    });

    res.json({
      pages: visibility,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[CONFIG] Error fetching page visibility:', error.message);

    // Return defaults on error
    res.json({
      pages: DEFAULT_PAGE_VISIBILITY,
      updatedAt: new Date().toISOString(),
      fallback: true,
    });
  }
});

/**
 * GET /api/config/features
 * Get all public feature flags
 *
 * Returns feature flags that are marked as public.
 */
router.get('/features', async (req: Request, res: Response) => {
  try {
    // Fetch feature flags from feature_flags table
    // Column names: is_enabled (not enabled), no is_active or is_public columns
    const result = await query(
      `SELECT key, is_enabled, description
       FROM feature_flags`,
      []
    );

    const features: Record<string, { enabled: boolean; description?: string }> = {};

    result.rows.forEach((row: any) => {
      features[row.key] = {
        enabled: row.is_enabled === true,
        description: row.description,
      };
    });

    res.json({
      features,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[CONFIG] Error fetching feature flags:', error.message);

    res.json({
      features: {},
      updatedAt: new Date().toISOString(),
      fallback: true,
    });
  }
});

export default router;
