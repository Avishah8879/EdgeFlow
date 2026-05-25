/**
 * User Screener Templates Routes
 *
 * CRUD for per-user saved Expert Screener expression templates.
 * - GET    /api/expert-screener/user-templates           list newest-first
 * - POST   /api/expert-screener/user-templates           create
 * - PATCH  /api/expert-screener/user-templates/:id       rename / edit
 * - DELETE /api/expert-screener/user-templates/:id       remove
 *
 * Schema: migrations/031_user_screener_templates.sql
 * Cap: read from system_config key `user_screener_templates_max` (defaults 5).
 * Validation: POST + PATCH (when expression changes) forward the expression
 * to FastAPI's /api/expert-screener/validate via validateExpression().
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { requireAuth } from './middleware/auth';
import { validateExpression } from './lib/expression-validation';

const router = Router();

const NAME_MAX = 120;
const DESCRIPTION_MAX = 280;
const EXPRESSION_MAX = 2000;
const DEFAULT_CAP = 5;
const UNIQUE_VIOLATION = '23505';

type ScreenerType = 'expert' | 'fundamental';
const VALID_SCREENER_TYPES: ReadonlySet<ScreenerType> = new Set(['expert', 'fundamental']);
const CAP_CONFIG_KEY: Record<ScreenerType, string> = {
  expert: 'user_screener_templates_max',
  fundamental: 'user_fundamental_templates_max',
};

function parseScreenerType(raw: unknown): ScreenerType | { error: string } {
  // Default to expert for back-compat with existing callers that don't send it.
  if (raw === undefined || raw === null || raw === '') return 'expert';
  if (typeof raw !== 'string') return { error: 'screenerType must be a string' };
  const v = raw.toLowerCase();
  if (!VALID_SCREENER_TYPES.has(v as ScreenerType)) {
    return { error: `Unknown screenerType: ${raw}` };
  }
  return v as ScreenerType;
}

interface UserTemplateRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  expression: string;
  screener_type: ScreenerType;
  created_at: string;
  updated_at: string;
}

async function getCap(screenerType: ScreenerType): Promise<number> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = $1`,
    [CAP_CONFIG_KEY[screenerType]],
  );
  return parseInt(row?.value || String(DEFAULT_CAP), 10) || DEFAULT_CAP;
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function fieldErrors(body: { name?: unknown; description?: unknown; expression?: unknown }) {
  const errs: string[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errs.push('name is required');
    } else if (body.name.length > NAME_MAX) {
      errs.push(`name must be ${NAME_MAX} characters or fewer`);
    }
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      errs.push('description must be a string');
    } else if (body.description.length > DESCRIPTION_MAX) {
      errs.push(`description must be ${DESCRIPTION_MAX} characters or fewer`);
    }
  }
  if (body.expression !== undefined) {
    if (typeof body.expression !== 'string' || !body.expression.trim()) {
      errs.push('expression is required');
    } else if (body.expression.length > EXPRESSION_MAX) {
      errs.push(`expression must be ${EXPRESSION_MAX} characters or fewer`);
    }
  }
  return errs;
}

/**
 * Run the expression through FastAPI's validate endpoint. Returns null on
 * success, or { status, body } the caller should return directly. The
 * `variant` is forwarded so the identifier audit picks the right set.
 */
async function checkExpression(
  expression: string,
  screenerType: ScreenerType,
): Promise<null | { status: number; body: Record<string, unknown> }> {
  let result;
  try {
    result = await validateExpression(expression, screenerType);
  } catch (err: any) {
    console.error('[USER-TEMPLATES] Validation service unreachable:', err?.message);
    return {
      status: 503,
      body: { message: 'Validation service unavailable, try again.' },
    };
  }
  if (!result.valid) {
    return {
      status: 400,
      body: {
        message: result.error || 'Invalid expression',
        unknownIdentifiers: result.unknownIdentifiers,
      },
    };
  }
  return null;
}

/**
 * GET /api/expert-screener/user-templates
 * Query: screenerType (optional, "expert" default | "fundamental")
 * Lists current user's templates of the requested type, newest first.
 */
router.get(
  '/user-templates',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const screenerType = parseScreenerType(req.query.screenerType);
      if (typeof screenerType !== 'string') {
        res.status(400).json({ message: screenerType.error });
        return;
      }
      const result = await query<UserTemplateRow>(
        `SELECT id, user_id, name, description, expression, screener_type, created_at, updated_at
         FROM user_screener_templates
         WHERE user_id = $1 AND screener_type = $2
         ORDER BY created_at DESC`,
        [userId, screenerType],
      );
      res.json({ templates: result.rows, count: result.rowCount });
    } catch (error: any) {
      console.error('[USER-TEMPLATES] List error:', error.message);
      res.status(500).json({ message: 'Failed to list templates' });
    }
  },
);

/**
 * POST /api/expert-screener/user-templates
 * Body: { name, description?, expression, screenerType? }
 *   screenerType defaults to "expert" for back-compat.
 */
router.post(
  '/user-templates',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const screenerType = parseScreenerType(req.body?.screenerType);
      if (typeof screenerType !== 'string') {
        res.status(400).json({ message: screenerType.error });
        return;
      }
      const errs = fieldErrors({
        name: req.body?.name,
        description: req.body?.description,
        expression: req.body?.expression,
      });
      // POST requires all three; description is optional but only if absent.
      if (req.body?.name === undefined) errs.unshift('name is required');
      if (req.body?.expression === undefined) errs.unshift('expression is required');
      if (errs.length > 0) {
        res.status(400).json({ message: errs[0] });
        return;
      }

      const name = String(req.body.name).trim();
      const description = trimOrUndef(req.body.description) ?? null;
      const expression = String(req.body.expression).trim();

      // Cap check — scoped to the screener type, independent caps per type.
      const cap = await getCap(screenerType);
      const countRow = await queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM user_screener_templates
         WHERE user_id = $1 AND screener_type = $2`,
        [userId, screenerType],
      );
      const currentCount = parseInt(countRow?.count || '0', 10);
      if (currentCount >= cap) {
        res.status(400).json({
          message: `You've reached the limit of ${cap} saved templates. Delete one to save another.`,
        });
        return;
      }

      // Expression validation via FastAPI (variant-aware audit).
      const validationError = await checkExpression(expression, screenerType);
      if (validationError) {
        res.status(validationError.status).json(validationError.body);
        return;
      }

      // Insert
      try {
        const row = await queryOne<UserTemplateRow>(
          `INSERT INTO user_screener_templates (user_id, name, description, expression, screener_type)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, name, description, expression, screener_type, created_at, updated_at`,
          [userId, name, description, expression, screenerType],
        );
        res.status(201).json(row);
      } catch (error: any) {
        if (error?.code === UNIQUE_VIOLATION) {
          res.status(409).json({
            message: `You already have a template named '${name}'.`,
          });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('[USER-TEMPLATES] Create error:', error.message);
      res.status(500).json({ message: 'Failed to save template' });
    }
  },
);

/**
 * PATCH /api/expert-screener/user-templates/:id
 * Body: { name?, description?, expression? }
 * Re-validates expression only if it actually changes.
 */
router.patch(
  '/user-templates/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id;

      // Optional screenerType assertion from caller (query OR body). When
      // provided, the row's screener_type must match — prevents a caller from
      // one screener's UI mutating a different screener's row by id alone.
      const callerType = parseScreenerType(
        req.query.screenerType ?? req.body?.screenerType,
      );
      if (typeof callerType !== 'string') {
        res.status(400).json({ message: callerType.error });
        return;
      }

      const errs = fieldErrors({
        name: req.body?.name,
        description: req.body?.description,
        expression: req.body?.expression,
      });
      if (errs.length > 0) {
        res.status(400).json({ message: errs[0] });
        return;
      }

      const existing = await queryOne<UserTemplateRow>(
        `SELECT id, user_id, name, description, expression, screener_type, created_at, updated_at
         FROM user_screener_templates
         WHERE id = $1 AND user_id = $2 AND screener_type = $3`,
        [id, userId, callerType],
      );
      if (!existing) {
        res.status(404).json({ message: 'Template not found' });
        return;
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      let p = 1;

      let newName: string | undefined;
      if (req.body?.name !== undefined) {
        newName = String(req.body.name).trim();
        updates.push(`name = $${p++}`);
        params.push(newName);
      }
      if (req.body?.description !== undefined) {
        const desc = req.body.description === null
          ? null
          : trimOrUndef(req.body.description) ?? null;
        updates.push(`description = $${p++}`);
        params.push(desc);
      }
      let newExpression: string | undefined;
      if (req.body?.expression !== undefined) {
        newExpression = String(req.body.expression).trim();
        if (newExpression !== existing.expression) {
          // Validate against the row's own screener type — PATCH never changes the variant.
          const validationError = await checkExpression(newExpression, existing.screener_type);
          if (validationError) {
            res.status(validationError.status).json(validationError.body);
            return;
          }
        }
        updates.push(`expression = $${p++}`);
        params.push(newExpression);
      }

      if (updates.length === 0) {
        res.status(400).json({ message: 'No fields to update' });
        return;
      }

      updates.push(`updated_at = NOW()`);
      params.push(id, userId);

      try {
        const row = await queryOne<UserTemplateRow>(
          `UPDATE user_screener_templates
           SET ${updates.join(', ')}
           WHERE id = $${p++} AND user_id = $${p++}
           RETURNING id, user_id, name, description, expression, screener_type, created_at, updated_at`,
          params,
        );
        if (!row) {
          res.status(404).json({ message: 'Template not found' });
          return;
        }
        res.json(row);
      } catch (error: any) {
        if (error?.code === UNIQUE_VIOLATION && newName) {
          res.status(409).json({
            message: `You already have a template named '${newName}'.`,
          });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('[USER-TEMPLATES] Update error:', error.message);
      res.status(500).json({ message: 'Failed to update template' });
    }
  },
);

/**
 * DELETE /api/expert-screener/user-templates/:id
 */
router.delete(
  '/user-templates/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id;
      // Scope by screener_type too — a caller asserts which variant they
      // think they're deleting. Prevents "Expert UI deletes Fundamental row
      // by id" surprises. Defaults to "expert" for back-compat with any
      // legacy caller that doesn't supply the query param.
      const callerType = parseScreenerType(req.query.screenerType);
      if (typeof callerType !== 'string') {
        res.status(400).json({ message: callerType.error });
        return;
      }
      const result = await query(
        `DELETE FROM user_screener_templates
         WHERE id = $1 AND user_id = $2 AND screener_type = $3
         RETURNING id`,
        [id, userId, callerType],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ message: 'Template not found' });
        return;
      }
      res.json({ message: 'Template deleted' });
    } catch (error: any) {
      console.error('[USER-TEMPLATES] Delete error:', error.message);
      res.status(500).json({ message: 'Failed to delete template' });
    }
  },
);

export default router;
