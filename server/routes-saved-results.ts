/**
 * Saved Results Routes
 *
 * Handles saving and retrieving screener and backtest results.
 * Users can save, list, delete, and share their results.
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { requireAuth } from './middleware/auth';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// SAVED SCREENER RESULTS
// ============================================================================

/**
 * GET /api/saved/screener
 * List user's saved screener results
 */
router.get(
  '/screener',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await query(
        `SELECT id, name, expression, result_count, execution_time_ms, is_shared, share_token, created_at, updated_at
         FROM saved_screener_results
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const countResult = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM saved_screener_results WHERE user_id = $1',
        [userId]
      );

      res.json({
        results: result.rows,
        total: parseInt(countResult?.count || '0'),
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('[SAVED] Error listing screener results:', error.message);
      res.status(500).json({ message: 'Failed to list saved results' });
    }
  }
);

/**
 * GET /api/saved/screener/shared/:token
 * Get a shared screener result by token (public, no auth required)
 * NOTE: This route MUST be defined before /screener/:id to avoid route conflicts
 */
router.get(
  '/screener/shared/:token',
  async (req: Request, res: Response) => {
    try {
      const shareToken = req.params.token;

      const result = await queryOne<any>(
        `SELECT id, name, expression, result_count, matching_symbols, execution_time_ms, created_at
         FROM saved_screener_results
         WHERE share_token = $1 AND is_shared = true`,
        [shareToken]
      );

      if (!result) {
        res.status(404).json({ message: 'Shared result not found' });
        return;
      }

      res.json(result);
    } catch (error: any) {
      console.error('[SAVED] Error getting shared screener result:', error.message);
      res.status(500).json({ message: 'Failed to get shared result' });
    }
  }
);

/**
 * GET /api/saved/screener/:id
 * Get a specific saved screener result
 */
router.get(
  '/screener/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      const result = await queryOne<any>(
        `SELECT * FROM saved_screener_results
         WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
        [resultId, userId]
      );

      if (!result) {
        res.status(404).json({ message: 'Result not found' });
        return;
      }

      res.json(result);
    } catch (error: any) {
      console.error('[SAVED] Error getting screener result:', error.message);
      res.status(500).json({ message: 'Failed to get saved result' });
    }
  }
);

/**
 * POST /api/saved/screener
 * Save a new screener result
 */
router.post(
  '/screener',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, expression, resultCount, matchingSymbols, executionTimeMs } = req.body;

      if (!name || !expression || resultCount === undefined || !matchingSymbols) {
        res.status(400).json({ message: 'Missing required fields' });
        return;
      }

      // Check limit based on user tier
      const userTier = req.user!.tier;
      const limitKey = userTier === 'premium'
        ? 'saved_screener_limit_premium'
        : 'saved_screener_limit_basic';
      const defaultLimit = userTier === 'premium' ? '50' : '10';

      const configResult = await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE key = $1`,
        [limitKey]
      );
      const limit = parseInt(configResult?.value || defaultLimit);

      const countResult = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM saved_screener_results WHERE user_id = $1',
        [userId]
      );
      const currentCount = parseInt(countResult?.count || '0');

      if (currentCount >= limit) {
        res.status(400).json({
          message: `You have reached the maximum of ${limit} saved screener results. Delete some to save new ones.`,
        });
        return;
      }

      const result = await queryOne<any>(
        `INSERT INTO saved_screener_results (user_id, name, expression, result_count, matching_symbols, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, name, expression, resultCount, JSON.stringify(matchingSymbols), executionTimeMs]
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('[SAVED] Error saving screener result:', error.message);
      res.status(500).json({ message: 'Failed to save result' });
    }
  }
);

/**
 * DELETE /api/saved/screener/:id
 * Delete a saved screener result
 */
router.delete(
  '/screener/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      const result = await query(
        'DELETE FROM saved_screener_results WHERE id = $1 AND user_id = $2 RETURNING id',
        [resultId, userId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ message: 'Result not found or not owned by you' });
        return;
      }

      res.json({ message: 'Result deleted successfully' });
    } catch (error: any) {
      console.error('[SAVED] Error deleting screener result:', error.message);
      res.status(500).json({ message: 'Failed to delete result' });
    }
  }
);

/**
 * POST /api/saved/screener/:id/share
 * Generate a share token for a screener result
 */
router.post(
  '/screener/:id/share',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      // Generate share token
      const shareToken = crypto.randomBytes(32).toString('hex');

      const result = await queryOne<any>(
        `UPDATE saved_screener_results
         SET is_shared = true, share_token = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING id, share_token`,
        [shareToken, resultId, userId]
      );

      if (!result) {
        res.status(404).json({ message: 'Result not found or not owned by you' });
        return;
      }

      res.json({
        shareToken: result.share_token,
        shareUrl: `/shared/screener/${result.share_token}`,
      });
    } catch (error: any) {
      console.error('[SAVED] Error sharing screener result:', error.message);
      res.status(500).json({ message: 'Failed to share result' });
    }
  }
);

// ============================================================================
// SAVED BACKTEST RESULTS
// ============================================================================

/**
 * GET /api/saved/backtest
 * List user's saved backtest results
 */
router.get(
  '/backtest',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const ticker = req.query.ticker as string;

      let sql = `SELECT id, name, ticker, mode, strategy_condition, metrics, execution_time_ms, is_shared, share_token, created_at, updated_at
         FROM saved_backtest_results
         WHERE user_id = $1`;
      const params: any[] = [userId];

      if (ticker) {
        sql += ' AND ticker = $2';
        params.push(ticker);
      }

      sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await query(sql, params);

      let countSql = 'SELECT COUNT(*) as count FROM saved_backtest_results WHERE user_id = $1';
      const countParams: any[] = [userId];
      if (ticker) {
        countSql += ' AND ticker = $2';
        countParams.push(ticker);
      }
      const countResult = await queryOne<{ count: string }>(countSql, countParams);

      res.json({
        results: result.rows,
        total: parseInt(countResult?.count || '0'),
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('[SAVED] Error listing backtest results:', error.message);
      res.status(500).json({ message: 'Failed to list saved results' });
    }
  }
);

/**
 * GET /api/saved/backtest/shared/:token
 * Get a shared backtest result by token (public, no auth required)
 * NOTE: This route MUST be defined before /backtest/:id to avoid route conflicts
 */
router.get(
  '/backtest/shared/:token',
  async (req: Request, res: Response) => {
    try {
      const shareToken = req.params.token;

      const result = await queryOne<any>(
        `SELECT id, name, ticker, mode, strategy_condition, metrics, equity_curve, candlestick_data, tpsl_values, execution_time_ms, created_at
         FROM saved_backtest_results
         WHERE share_token = $1 AND is_shared = true`,
        [shareToken]
      );

      if (!result) {
        res.status(404).json({ message: 'Shared result not found' });
        return;
      }

      res.json(result);
    } catch (error: any) {
      console.error('[SAVED] Error getting shared backtest result:', error.message);
      res.status(500).json({ message: 'Failed to get shared result' });
    }
  }
);

/**
 * GET /api/saved/backtest/:id
 * Get a specific saved backtest result
 */
router.get(
  '/backtest/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      const result = await queryOne<any>(
        `SELECT * FROM saved_backtest_results
         WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
        [resultId, userId]
      );

      if (!result) {
        res.status(404).json({ message: 'Result not found' });
        return;
      }

      res.json(result);
    } catch (error: any) {
      console.error('[SAVED] Error getting backtest result:', error.message);
      res.status(500).json({ message: 'Failed to get saved result' });
    }
  }
);

/**
 * POST /api/saved/backtest
 * Save a new backtest result
 */
router.post(
  '/backtest',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const {
        name,
        ticker,
        mode,
        customRules,
        strategyCondition,
        metrics,
        equityCurve,
        candlestickData,
        tpslValues,
        trainEndDate,
        trainEndIndex,
        maxDrawdownPoint,
        executionTimeMs,
      } = req.body;

      if (!name || !ticker || !mode || !strategyCondition || !metrics) {
        res.status(400).json({ message: 'Missing required fields' });
        return;
      }

      // Check limit based on user tier
      const userTier = req.user!.tier;
      const limitKey = userTier === 'premium'
        ? 'saved_backtest_limit_premium'
        : 'saved_backtest_limit_basic';
      const defaultLimit = userTier === 'premium' ? '25' : '5';

      const configResult = await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE key = $1`,
        [limitKey]
      );
      const limit = parseInt(configResult?.value || defaultLimit);

      const countResult = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM saved_backtest_results WHERE user_id = $1',
        [userId]
      );
      const currentCount = parseInt(countResult?.count || '0');

      if (currentCount >= limit) {
        res.status(400).json({
          message: `You have reached the maximum of ${limit} saved backtest results. Delete some to save new ones.`,
        });
        return;
      }

      const result = await queryOne<any>(
        `INSERT INTO saved_backtest_results
         (user_id, name, ticker, mode, custom_rules, strategy_condition, metrics, equity_curve, candlestick_data, tpsl_values, train_end_date, train_end_index, max_drawdown_point, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          userId,
          name,
          ticker,
          mode,
          customRules,
          strategyCondition,
          JSON.stringify(metrics),
          equityCurve ? JSON.stringify(equityCurve) : null,
          candlestickData ? JSON.stringify(candlestickData) : null,
          tpslValues ? JSON.stringify(tpslValues) : null,
          trainEndDate || null,
          trainEndIndex ?? null,
          maxDrawdownPoint ? JSON.stringify(maxDrawdownPoint) : null,
          executionTimeMs,
        ]
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('[SAVED] Error saving backtest result:', error.message);
      res.status(500).json({ message: 'Failed to save result' });
    }
  }
);

/**
 * DELETE /api/saved/backtest/:id
 * Delete a saved backtest result
 */
router.delete(
  '/backtest/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      const result = await query(
        'DELETE FROM saved_backtest_results WHERE id = $1 AND user_id = $2 RETURNING id',
        [resultId, userId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ message: 'Result not found or not owned by you' });
        return;
      }

      res.json({ message: 'Result deleted successfully' });
    } catch (error: any) {
      console.error('[SAVED] Error deleting backtest result:', error.message);
      res.status(500).json({ message: 'Failed to delete result' });
    }
  }
);

/**
 * POST /api/saved/backtest/:id/share
 * Generate a share token for a backtest result
 */
router.post(
  '/backtest/:id/share',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const resultId = req.params.id;

      // Generate share token
      const shareToken = crypto.randomBytes(32).toString('hex');

      const result = await queryOne<any>(
        `UPDATE saved_backtest_results
         SET is_shared = true, share_token = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING id, share_token`,
        [shareToken, resultId, userId]
      );

      if (!result) {
        res.status(404).json({ message: 'Result not found or not owned by you' });
        return;
      }

      res.json({
        shareToken: result.share_token,
        shareUrl: `/shared/backtest/${result.share_token}`,
      });
    } catch (error: any) {
      console.error('[SAVED] Error sharing backtest result:', error.message);
      res.status(500).json({ message: 'Failed to share result' });
    }
  }
);

export default router;
