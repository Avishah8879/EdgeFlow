/**
 * Tracking API Routes
 *
 * Client-side tracking endpoints for page views, clicks, searches, and feature usage.
 * All tracking respects user privacy consent levels.
 */

import { Router, Request, Response } from 'express';
import { query } from './db/auth-connection';
import { optionalAuth } from './middleware/auth';

const router = Router();

// Helper to get client info from request
function getClientInfo(req: Request) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.headers['x-forwarded-for'] || '';

  // Parse user agent for device/browser/os info
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const isTablet = /Tablet|iPad/i.test(userAgent);
  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

  return { deviceType, browser, os, ip: typeof ip === 'string' ? ip : ip[0] };
}

/**
 * POST /api/track/page-view
 * Track a page view
 */
router.post(
  '/page-view',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId || null;
      const { sessionId, pagePath, pageTitle, referrer, screenResolution } = req.body;

      if (!sessionId || !pagePath) {
        res.status(400).json({ message: 'sessionId and pagePath are required' });
        return;
      }

      const { deviceType, browser, os } = getClientInfo(req);

      await query(
        `INSERT INTO page_views (user_id, session_id, page_path, page_title, referrer, device_type, browser, os, screen_resolution)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, sessionId, pagePath, pageTitle || null, referrer || null, deviceType, browser, os, screenResolution || null]
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('[TRACKING] Error tracking page view:', error.message);
      res.status(500).json({ message: 'Failed to track page view' });
    }
  }
);

/**
 * POST /api/track/page-leave
 * Update page view with duration when user leaves
 */
router.post(
  '/page-leave',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const { sessionId, pagePath, durationSeconds } = req.body;

      if (!sessionId || !pagePath || durationSeconds === undefined) {
        res.status(400).json({ message: 'sessionId, pagePath, and durationSeconds are required' });
        return;
      }

      // Update the most recent page view for this session/path
      await query(
        `UPDATE page_views
         SET duration_seconds = $3
         WHERE id = (
           SELECT id FROM page_views
           WHERE session_id = $1 AND page_path = $2
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [sessionId, pagePath, Math.round(durationSeconds)]
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('[TRACKING] Error updating page duration:', error.message);
      res.status(500).json({ message: 'Failed to update page duration' });
    }
  }
);

/**
 * POST /api/track/click
 * Track a click event
 */
router.post(
  '/click',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId || null;
      const { sessionId, pagePath, elementType, elementId, elementText } = req.body;

      if (!sessionId || !pagePath) {
        res.status(400).json({ message: 'sessionId and pagePath are required' });
        return;
      }

      await query(
        `INSERT INTO click_events (user_id, session_id, page_path, element_type, element_id, element_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, sessionId, pagePath, elementType || null, elementId || null, elementText?.substring(0, 500) || null]
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('[TRACKING] Error tracking click:', error.message);
      res.status(500).json({ message: 'Failed to track click' });
    }
  }
);

/**
 * POST /api/track/search
 * Track a search query
 */
router.post(
  '/search',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId || null;
      const { sessionId, query: searchQuery, resultCount, selectedResult } = req.body;

      if (!sessionId || !searchQuery) {
        res.status(400).json({ message: 'sessionId and query are required' });
        return;
      }

      await query(
        `INSERT INTO search_events (user_id, session_id, query, result_count, selected_result)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, sessionId, searchQuery.substring(0, 500), resultCount || null, selectedResult || null]
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('[TRACKING] Error tracking search:', error.message);
      res.status(500).json({ message: 'Failed to track search' });
    }
  }
);

/**
 * POST /api/track/feature
 * Track feature usage (screener, backtest, sentiment, etc.)
 */
router.post(
  '/feature',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        // Feature tracking requires authentication
        res.status(401).json({ message: 'Authentication required for feature tracking' });
        return;
      }

      const { featureType, featureParams, resultSummary, executionTimeMs, success, errorMessage } = req.body;

      if (!featureType || !featureParams) {
        res.status(400).json({ message: 'featureType and featureParams are required' });
        return;
      }

      const validTypes = ['screener', 'backtest', 'sentiment', 'search', 'price_chart', 'technical_indicators'];
      if (!validTypes.includes(featureType)) {
        res.status(400).json({ message: `Invalid featureType. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      await query(
        `INSERT INTO feature_usage (user_id, feature_type, feature_params, result_summary, execution_time_ms, success, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          featureType,
          JSON.stringify(featureParams),
          resultSummary ? JSON.stringify(resultSummary) : null,
          executionTimeMs || null,
          success !== false,
          errorMessage || null
        ]
      );

      // Get updated usage count for this feature type (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const usageResult = await query(
        `SELECT COUNT(*) as count FROM feature_usage
         WHERE user_id = $1 AND feature_type = $2 AND created_at > $3`,
        [userId, featureType, oneHourAgo]
      );

      const currentUsage = parseInt(usageResult.rows[0]?.count || '0');

      res.json({
        success: true,
        usage: {
          featureType,
          count: currentUsage
        }
      });
    } catch (error: any) {
      console.error('[TRACKING] Error tracking feature usage:', error.message);
      res.status(500).json({ message: 'Failed to track feature usage' });
    }
  }
);

/**
 * POST /api/track/batch
 * Batch tracking endpoint for efficiency
 */
router.post(
  '/batch',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId || null;
      const { events } = req.body;

      if (!Array.isArray(events) || events.length === 0) {
        res.status(400).json({ message: 'events array is required' });
        return;
      }

      // Limit batch size
      if (events.length > 50) {
        res.status(400).json({ message: 'Maximum 50 events per batch' });
        return;
      }

      const { deviceType, browser, os } = getClientInfo(req);
      let successCount = 0;
      let errorCount = 0;

      for (const event of events) {
        try {
          switch (event.type) {
            case 'page_view':
              await query(
                `INSERT INTO page_views (user_id, session_id, page_path, page_title, referrer, device_type, browser, os, screen_resolution)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [userId, event.sessionId, event.pagePath, event.pageTitle || null, event.referrer || null, deviceType, browser, os, event.screenResolution || null]
              );
              successCount++;
              break;

            case 'click':
              await query(
                `INSERT INTO click_events (user_id, session_id, page_path, element_type, element_id, element_text)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, event.sessionId, event.pagePath, event.elementType || null, event.elementId || null, event.elementText?.substring(0, 500) || null]
              );
              successCount++;
              break;

            case 'search':
              await query(
                `INSERT INTO search_events (user_id, session_id, query, result_count, selected_result)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, event.sessionId, event.query?.substring(0, 500), event.resultCount || null, event.selectedResult || null]
              );
              successCount++;
              break;

            default:
              errorCount++;
          }
        } catch {
          errorCount++;
        }
      }

      res.json({ success: true, processed: successCount, errors: errorCount });
    } catch (error: any) {
      console.error('[TRACKING] Error in batch tracking:', error.message);
      res.status(500).json({ message: 'Failed to process batch tracking' });
    }
  }
);

export default router;
