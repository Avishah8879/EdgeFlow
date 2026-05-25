import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { requireAuth } from './middleware/auth';

const router = Router();

async function enforcePairWatchlistLimit(req: Request, res: Response): Promise<boolean> {
  const userId = req.user!.userId;
  const userTier = req.user!.tier;
  const isPremium = userTier === 'pro' || userTier === 'semi';
  const configKey = isPremium ? 'saved_pair_watchlist_limit_premium' : 'saved_pair_watchlist_limit_basic';
  const defaultLimit = isPremium ? '50' : '10';

  const configResult = await queryOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = $1`,
    [configKey],
  );
  const limit = parseInt(configResult?.value || defaultLimit);

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM saved_pair_watchlists WHERE user_id = $1`,
    [userId],
  );
  const currentCount = parseInt(countResult?.count || '0');

  if (currentCount >= limit) {
    res.status(400).json({
      message: `You have reached the maximum of ${limit} saved pair watchlist entries. Delete some to save new ones.`,
    });
    return false;
  }

  return true;
}

// GET /api/saved/pair-watchlist
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await query(
      `SELECT id, name, symbol1, symbol2, method, lookback_days,
              correlation, beta, delta, pvalue, params, is_shared, share_token,
              created_at, updated_at
       FROM saved_pair_watchlists
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM saved_pair_watchlists WHERE user_id = $1`,
      [userId],
    );

    res.json({
      results: result.rows,
      total: parseInt(countResult?.count || '0'),
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[PAIR_WATCHLIST] Error listing:', error.message);
    res.status(500).json({ message: 'Failed to list pair watchlist' });
  }
});

// POST /api/saved/pair-watchlist
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, symbol1, symbol2, method, lookbackDays, correlation, beta, delta, pvalue } =
      req.body;

    if (!name || !symbol1 || !symbol2 || !method || lookbackDays === undefined) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    const ok = await enforcePairWatchlistLimit(req, res);
    if (!ok) return;

    const result = await queryOne<any>(
      `INSERT INTO saved_pair_watchlists
         (user_id, name, symbol1, symbol2, method, lookback_days, correlation, beta, delta, pvalue)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        name,
        symbol1,
        symbol2,
        method,
        lookbackDays,
        correlation ?? null,
        beta ?? null,
        delta ?? null,
        pvalue ?? null,
      ],
    );

    res.status(201).json(result);
  } catch (error: any) {
    console.error('[PAIR_WATCHLIST] Error saving:', error.message);
    res.status(500).json({ message: 'Failed to save pair watchlist entry' });
  }
});

// DELETE /api/saved/pair-watchlist/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM saved_pair_watchlists WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user!.userId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Entry not found or not owned by you' });
      return;
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error: any) {
    console.error('[PAIR_WATCHLIST] Error deleting:', error.message);
    res.status(500).json({ message: 'Failed to delete pair watchlist entry' });
  }
});

export default router;
